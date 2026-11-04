using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.StreamRobotCamera;

public static class StreamRobotCameraEndpoint
{
    /// <summary>Path the JWT handler also accepts <c>?access_token=</c> on: an &lt;img&gt; cannot send a header.</summary>
    public const string PathSuffix = "/camera/stream";

    public static RouteGroupBuilder MapStreamRobotCamera(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}" + PathSuffix, async (
            Guid id,
            HttpContext context,
            StreamRobotCameraHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.StreamAsync(id, context, cancellationToken);
            return Results.Empty;
        });

        return group;
    }
}
