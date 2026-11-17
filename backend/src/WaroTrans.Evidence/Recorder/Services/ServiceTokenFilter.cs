using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace WaroTrans.Evidence.Recorder.Services;

/// <summary>Only the monolith's EvidenceBridge, holding the shared service token, may push integration events.</summary>
internal sealed class ServiceTokenFilter(IOptions<RecorderOptions> options) : IEndpointFilter
{
    public const string HeaderName = "X-Evidence-Service-Token";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = options.Value.ServiceToken;
        var given = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (expected.Length < RecorderOptions.MinimumServiceTokenLength
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected)))
        {
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Evidence service token required.");
        }

        return await next(context);
    }
}
