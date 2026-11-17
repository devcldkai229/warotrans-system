using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.Recorder.Features.LocalStore;

/// <summary>
/// Stands in for S3 when <c>Evidence:Storage:Provider = Local</c> (tests, offline dev): accepts the presigned PUT the
/// grant handed out, refuses a body whose SHA-256 is not the registered one (like S3's BadDigest) and never overwrites,
/// then announces the object on the segment-ingest queue exactly as the S3 notification would.
/// </summary>
internal static class LocalStoreEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapPut(LocalObjectStore.UploadPath, async (
                HttpRequest request,
                string key,
                long size,
                string sha256,
                long exp,
                string sig,
                LocalObjectStore store,
                IWorkQueue queue,
                TimeProvider clock,
                CancellationToken ct) =>
            {
                if (!store.Verify(key, size, sha256, exp, sig))
                {
                    return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Upload URL invalid or expired.");
                }

                if (request.Headers.TryGetValue("x-amz-checksum-sha256", out var checksum)
                    && checksum.ToString() != Checksums.HexToBase64(sha256))
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Checksum header does not match the grant.");
                }

                if (await store.HeadAsync(key, ct) is not null)
                {
                    return Results.Problem(statusCode: StatusCodes.Status412PreconditionFailed, title: "Object already exists.");
                }

                StoredObject stored;
                try
                {
                    stored = await store.WriteAsync(key, request.Body, ct);
                }
                catch (IOException)
                {
                    return Results.Problem(statusCode: StatusCodes.Status412PreconditionFailed, title: "Object already exists.");
                }

                if (stored.Size != size || stored.Sha256Hex != sha256)
                {
                    await store.DeleteAsync(key, ct);
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "BadDigest: the body is not the registered file.");
                }

                await queue.SendAsync(EvidenceQueues.SegmentIngest, S3Events.ObjectCreated(stored, clock.GetUtcNow()), ct);
                return Results.Ok();
            })
            .AllowAnonymous() // the URL's signature is the authorization, as with an S3 presigned PUT
            .DisableAntiforgery()
            // A real 30 s segment is tens of MB (Kestrel's default 8 MB cap reset the robot's upload: broken pipe).
            .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(2L * 1024 * 1024 * 1024))
            .WithName("EvidenceLocalStorePut");
}
