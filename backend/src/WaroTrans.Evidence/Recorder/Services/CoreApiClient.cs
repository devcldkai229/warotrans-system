using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Contracts;

namespace WaroTrans.Evidence.Recorder.Services;

/// <summary>Calls into the WaroTrans Host: reconciliation (service token) and the caller's own capabilities (their token).</summary>
internal sealed class CoreApiClient(HttpClient http, IOptions<RecorderOptions> options)
{
    public const string HttpClientName = "warotrans-core";

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <returns>Null when the Host does not know the request.</returns>
    public async Task<SourceRequestRuns?> GetRequestRunsAsync(Guid transportRequestId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/evidence-bridge/transport-requests/{transportRequestId:D}/runs");
        request.Headers.Add(ServiceTokenFilter.HeaderName, options.Value.ServiceToken);
        using var response = await http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<SourceRequestRuns>(Json, cancellationToken);
    }

    /// <summary>The robots this user may see, asked of Identity with the user's own access token.</summary>
    public async Task<CallerCapabilities> GetCapabilitiesAsync(string bearerToken, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "api/identity/me/capabilities");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        using var response = await http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<CallerCapabilities>(Json, cancellationToken)
               ?? throw new InvalidOperationException("Empty capabilities.");
    }
}

internal sealed record CallerCapabilities(Guid AccountId, string Role, IReadOnlyList<string> Permissions, CallerRobotScope RobotScope);

internal sealed record CallerRobotScope(bool AllRobots, IReadOnlyList<Guid> RobotIds);
