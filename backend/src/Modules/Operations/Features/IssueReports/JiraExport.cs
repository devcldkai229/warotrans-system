using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.IssueReports;

/// <summary>
/// Jira Cloud target for issue reports. The token lives only in user secrets or the environment (Jira__ApiToken),
/// never in a repository. Off unless BaseUrl, Email, ApiToken and ProjectKey are all set.
/// </summary>
public sealed class JiraOptions
{
    public const string SectionName = "Jira";
    public string? BaseUrl { get; set; }
    public string? Email { get; set; }
    public string? ApiToken { get; set; }
    public string? ProjectKey { get; set; }

    /// <summary>Jira issue type for a code fault (the project's own names: Bug, Task …).</summary>
    public string IssueType { get; set; } = "Bug";

    /// <summary>Where people open the WaroTrans web app (links in the ticket).</summary>
    public string? WebBaseUrl { get; set; }

    public bool Configured =>
        !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(Email)
        && !string.IsNullOrWhiteSpace(ApiToken) && !string.IsNullOrWhiteSpace(ProjectKey);
}

/// <param name="Summary">Ticket title; default "[WaroTrans] {issue code}: first line of the description".</param>
/// <param name="Labels">Extra Jira labels (letters, digits, - and _ only).</param>
/// <param name="Links">Extra lines "label: url" (replay, AI case) appended to the ticket.</param>
public sealed record ExportIssueToJiraRequest(
    string? Summary,
    IReadOnlyList<string>? Labels,
    IReadOnlyDictionary<string, string>? Links);

public sealed record JiraTicketDto(Guid IssueId, string IssueCode, string Key, string Url, bool Created);

/// <summary>Creates one Jira ticket per issue report; a second call returns the ticket already made.</summary>
public sealed class JiraExportService(
    OperationsMongoContext mongo,
    IssueService issues,
    IHttpClientFactory http,
    IOptions<JiraOptions> options,
    TimeProvider clock,
    ILogger<JiraExportService> logger)
{
    public const string HttpClientName = "jira";

    public async Task<JiraTicketDto> ExportAsync(Guid issueId, ExportIssueToJiraRequest request, CancellationToken ct)
    {
        var o = options.Value;
        if (!o.Configured)
        {
            throw new AppException("Jira is not configured on this Host.", 503, "jira_not_configured");
        }

        // Same visibility as reading the issue (404 when the caller may not see it).
        await issues.GetAsync(issueId, ct);
        var issue = await mongo.IssueReports.Find(i => i.Id == issueId).FirstOrDefaultAsync(ct)
                    ?? throw new NotFoundException("The issue was not found.", "issue_not_found");
        if (issue.Metadata.TryGetValue("jiraKey", out var existing) && existing.IsString)
        {
            return new JiraTicketDto(issue.Id, issue.Code, existing.AsString,
                issue.Metadata.GetValue("jiraUrl", BsonString.Empty).AsString, false);
        }

        var summary = string.IsNullOrWhiteSpace(request.Summary)
            ? $"[WaroTrans] {issue.Code}: {FirstLine(issue.Description)}"
            : request.Summary.Trim();
        if (summary.Length > 250)
        {
            summary = summary[..250];
        }

        var labels = new List<string> { "warotrans", "severity-" + issue.Severity.ToString().ToLowerInvariant() };
        labels.AddRange((request.Labels ?? [])
            .Where(l => l.Length is > 0 and <= 50 && l.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_')));
        var body = new JsonObject
        {
            ["fields"] = new JsonObject
            {
                ["project"] = new JsonObject { ["key"] = o.ProjectKey },
                ["issuetype"] = new JsonObject { ["name"] = o.IssueType },
                ["summary"] = summary,
                ["labels"] = new JsonArray(labels.Distinct().Select(l => (JsonNode)JsonValue.Create(l)!).ToArray()),
                ["description"] = Adf(issue, request.Links, o.WebBaseUrl)
            }
        };

        using var client = http.CreateClient(HttpClientName);
        client.BaseAddress = new Uri(o.BaseUrl!.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes(o.Email + ":" + o.ApiToken)));
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var response = await client.PostAsJsonAsync("rest/api/3/issue", body, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            // Jira's own error text (field problems); never the request, which carries the credential header.
            logger.LogWarning("Jira refused issue {Code}: {Status} {Body}", issue.Code, (int)response.StatusCode,
                text.Length > 500 ? text[..500] : text);
            throw new AppException($"Jira refused the ticket ({(int)response.StatusCode}).", 502, "jira_refused");
        }

        var key = JsonDocument.Parse(text).RootElement.GetProperty("key").GetString()!;
        var url = o.BaseUrl!.TrimEnd('/') + "/browse/" + key;
        var now = clock.GetUtcNow();
        await mongo.IssueReports.UpdateOneAsync(
            Builders<IssueReport>.Filter.Eq(i => i.Id, issue.Id),
            Builders<IssueReport>.Update
                .Set("Metadata.jiraKey", key)
                .Set("Metadata.jiraUrl", url)
                .Set("Metadata.jiraCreatedAt", now.ToString("O"))
                .Set(i => i.UpdatedAt, now),
            cancellationToken: ct);
        logger.LogInformation("Issue {Code} exported to Jira as {Key}", issue.Code, key);
        return new JiraTicketDto(issue.Id, issue.Code, key, url, true);
    }

    private static string FirstLine(string text)
    {
        var line = text.Split('\n', 2)[0].Trim();
        return line.Length > 160 ? line[..160] : line;
    }

    /// <summary>Atlassian Document Format: one paragraph per description line, then the facts and links.</summary>
    private static JsonObject Adf(IssueReport issue, IReadOnlyDictionary<string, string>? links, string? web)
    {
        var content = new JsonArray();

        void Para(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return;
            }

            content.Add(new JsonObject
            {
                ["type"] = "paragraph",
                ["content"] = new JsonArray(new JsonObject
                {
                    ["type"] = "text",
                    ["text"] = text.Length > 3000 ? text[..3000] : text
                })
            });
        }

        foreach (var line in issue.Description.Split('\n'))
        {
            Para(line.TrimEnd());
        }

        Para($"WaroTrans issue {issue.Code} · type {issue.IssueType} · severity {issue.Severity} · reported {issue.ReportedAt:u}");
        if (issue.RobotId is { } robot)
        {
            Para($"Robot id: {robot}");
        }

        if (issue.TransportRequestId is { } tr)
        {
            Para($"Transport request id: {tr}");
            if (!string.IsNullOrWhiteSpace(web))
            {
                Para($"Replay: {web.TrimEnd('/')}/tech/journals/by-request/{tr}");
            }
        }

        if (!string.IsNullOrWhiteSpace(web))
        {
            Para($"Issue: {web.TrimEnd('/')}/tech/issues/{issue.Id}");
        }

        foreach (var (label, url) in links ?? new Dictionary<string, string>())
        {
            Para($"{label}: {url}");
        }

        return new JsonObject { ["type"] = "doc", ["version"] = 1, ["content"] = content };
    }
}
