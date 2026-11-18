using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace WaroTrans.EvidenceBridge.Services;

/// <summary>Only the Evidence Recorder, holding the shared service token, may read the reconciliation API.</summary>
internal sealed class ServiceTokenEndpointFilter(IOptions<EvidenceBridgeOptions> options) : IEndpointFilter
{
    public const string HeaderName = "X-Evidence-Service-Token";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = options.Value.ServiceToken;
        var given = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!options.Value.Enabled || expected.Length < EvidenceBridgeOptions.MinimumServiceTokenLength || !Matches(given, expected))
        {
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Evidence service token required.");
        }

        return await next(context);
    }

    internal static bool Matches(string given, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));
}
