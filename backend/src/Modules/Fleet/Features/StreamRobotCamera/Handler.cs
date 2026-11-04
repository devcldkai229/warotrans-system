using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.StreamRobotCamera;

/// <summary>
/// Relays the robot's MJPEG camera stream to the browser, so the web needs neither the robot's address nor a
/// second origin. The upstream connection lives exactly as long as the viewer's request.
/// </summary>
public sealed class StreamRobotCameraHandler(
    FleetDbContext db,
    IHttpClientFactory httpClientFactory,
    IOptions<RobotCameraOptions> options,
    ILogger<StreamRobotCameraHandler> logger)
{
    public const string HttpClientName = "robot-camera";

    public async Task StreamAsync(Guid robotId, HttpContext context, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        var streamUrl = ResolveStreamUrl(options.Value, robot.Code)
            ?? throw new NotFoundException($"Robot '{robot.Code}' has no camera configured.", "camera_not_configured");

        var upstream = await OpenUpstreamAsync(streamUrl, robot.Code, cancellationToken);
        using (upstream)
        {
            context.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = upstream.Content.Headers.ContentType?.ToString()
                ?? "multipart/x-mixed-replace; boundary=frame";
            context.Response.Headers.CacheControl = "no-store";

            await using var body = await upstream.Content.ReadAsStreamAsync(cancellationToken);
            try
            {
                await body.CopyToAsync(context.Response.Body, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // viewer closed the page
            }
            catch (IOException ex)
            {
                logger.LogInformation(ex, "Camera stream of robot {RobotCode} ended", robot.Code);
            }
        }
    }

    public static string? ResolveStreamUrl(RobotCameraOptions options, string robotCode) =>
        options.Robots.TryGetValue(robotCode, out var url) && !string.IsNullOrWhiteSpace(url) ? url : null;

    private async Task<HttpResponseMessage> OpenUpstreamAsync(string streamUrl, string robotCode, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        connectTimeout.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, options.Value.ConnectTimeoutSeconds)));

        HttpResponseMessage? response = null;
        try
        {
            // Headers only: the body is an endless stream, read under the viewer's token, not the connect timeout.
            response = await client.GetAsync(streamUrl, HttpCompletionOption.ResponseHeadersRead, connectTimeout.Token);
            if (response.IsSuccessStatusCode)
            {
                return response;
            }

            logger.LogWarning("Camera of robot {RobotCode} answered {StatusCode}", robotCode, (int)response.StatusCode);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            logger.LogWarning(ex, "Camera of robot {RobotCode} is not reachable at {StreamUrl}", robotCode, streamUrl);
        }

        response?.Dispose();
        throw new AppException($"Camera of robot '{robotCode}' is not reachable.", StatusCodes.Status503ServiceUnavailable, "camera_unavailable");
    }
}
