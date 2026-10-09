using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity;

public sealed record AccountDto(
    Guid Id,
    string Username,
    string Email,
    string FullName,
    string Role,
    string Status,
    DateTimeOffset? LastLoginAt);

public sealed record SessionDto(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string? RefreshToken,
    AccountDto Account);

public sealed record ListAccountsDto(IReadOnlyList<AccountDto> Items);

public static class IdentityTestSupport
{
    public const string Password = "Correct-Horse-1";

    public static async Task<Account> CreateAccountAsync(
        this WaroTransWebApplicationFactory factory,
        string username,
        AccountRole role = AccountRole.ADMIN,
        AccountStatus status = AccountStatus.ACTIVE)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<Account>>();

        var now = DateTimeOffset.UtcNow;
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Username = username,
            Email = $"{username}@warotrans.test",
            FullName = $"Test {username}",
            Role = role,
            Status = status,
            CreatedAt = now,
            UpdatedAt = now
        };
        account.PasswordHash = passwordHasher.HashPassword(account, Password);

        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync();
        return account;
    }

    public static async Task SetAccountStatusAsync(
        this WaroTransWebApplicationFactory factory,
        Guid accountId,
        AccountStatus status)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await dbContext.Accounts
            .Where(a => a.Id == accountId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, status));
    }

    public static Task<HttpResponseMessage> PostLoginAsync(
        this HttpClient client,
        string username,
        string password = Password,
        bool useCookie = false) =>
        client.PostAsJsonAsync("/api/identity/login", new { username, password, useCookie });

    public static async Task<SessionDto> LoginAsync(this HttpClient client, string username)
    {
        var response = await client.PostLoginAsync(username);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SessionDto>())!;
    }

    public static Task<HttpResponseMessage> PostRefreshAsync(this HttpClient client, string? refreshToken) =>
        client.PostAsJsonAsync("/api/identity/refresh", new { refreshToken });

    public static async Task<HttpResponseMessage> GetWithTokenAsync(this HttpClient client, string url, string accessToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return await client.SendAsync(request);
    }

    /// <summary>Reads the machine-readable <c>code</c> of a ProblemDetails response.</summary>
    public static async Task<string?> ReadErrorCodeAsync(this HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        return problem.TryGetProperty("code", out var code) ? code.GetString() : null;
    }
}
