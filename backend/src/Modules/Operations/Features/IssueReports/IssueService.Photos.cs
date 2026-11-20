using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using MongoDB.Bson;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Features.IssueReports;

public sealed partial class IssueService
{
    private const int MaxPhotoBytes = 2 * 1024 * 1024;
    private const int MaxPhotosPerIssue = 4;
    private const string PhotoIdField = "photoId";
    private const string BodyField = "body";
    private const string HashField = "sha256";

    private static readonly ProjectionDefinition<IssueReport> WithoutPhotoBytes =
        Builders<IssueReport>.Projection.Exclude("evidence.data.body");

    public async Task<IssueDto> UploadPhotoAsync(
        Guid id, Guid photoId, int expectedVersion, HttpRequest request, CancellationToken cancellationToken)
    {
        if (photoId == Guid.Empty || expectedVersion < 1)
            throw new DomainValidationException("Provide a photo UUID and the current issue version.", "issue_photo_request_invalid");

        var issue = await LoadVisibleAsync(id, cancellationToken);
        var actor = currentUser.AccountId;
        if (currentUser.Role == AppRoles.Staff && issue.ReportedBy != actor && issue.AssigneeId != actor)
            throw new AppException("Only the reporter or assignee may attach a photo to this issue.", 403, "issue_photo_forbidden");

        var mimeType = request.ContentType?.Split(';', 2)[0].Trim().ToLowerInvariant();
        if (mimeType is not ("image/jpeg" or "image/png"))
            throw new AppException("Upload a JPEG or PNG photo.", 415, "issue_photo_type_unsupported");

        var photo = await ReadPhotoAsync(request, cancellationToken);
        var valid = mimeType == "image/jpeg"
            ? photo.AsSpan().StartsWith(new byte[] { 0xff, 0xd8, 0xff })
            : photo.AsSpan().StartsWith(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a });
        if (!valid)
            throw new DomainValidationException("The photo bytes do not match the content type.", "issue_photo_invalid");

        var hash = Convert.ToHexString(SHA256.HashData(photo));
        var uri = $"/api/operations/issues/{id:D}/evidence/photos/{photoId:D}";
        var existing = issue.Evidence.FirstOrDefault(item => item.Uri == uri);
        if (existing is not null)
        {
            if (existing.MimeType != mimeType || existing.Data?.GetValue(HashField, BsonNull.Value) is not BsonString previous
                || previous.Value != hash)
                throw new ConflictException("This photo id was already used for another file.", "issue_photo_id_conflict");
            return Project(issue);
        }

        if (issue.Status == IssueStatus.CLOSED)
            throw new ConflictException("A closed issue takes no more evidence.", "issue_closed");
        if (issue.Evidence.Count >= CreateIssueValidator.MaxEvidence * 2
            || issue.Evidence.Count(item => item.Data?.Contains(PhotoIdField) == true) >= MaxPhotosPerIssue)
            throw new DomainValidationException("This issue already has the maximum amount of photo evidence.", "issue_evidence_limit");

        var evidence = new EvidenceItem
        {
            Kind = "PHOTO", Uri = uri, MimeType = mimeType, AddedBy = actor, AddedAt = clock.GetUtcNow(),
            Data = new BsonDocument
            {
                [PhotoIdField] = photoId.ToString("N"),
                [HashField] = hash,
                [BodyField] = new BsonBinaryData(photo)
            }
        };
        var updated = await SaveAsync(issue, expectedVersion, Builders<IssueReport>.Update.Push(item => item.Evidence, evidence), cancellationToken);
        await audit.RecordAsync(new AuditEntry("issue.evidence_added", Entity, id,
            After: new Dictionary<string, object?> { ["kind"] = evidence.Kind, ["uri"] = evidence.Uri }), cancellationToken);
        return Project(updated);
    }

    public async Task<(byte[] Bytes, string MimeType)> ReadPhotoAsync(Guid id, Guid photoId, CancellationToken cancellationToken)
    {
        var filter = Builders<IssueReport>.Filter.Eq(item => item.Id, id) & await VisibleFilterAsync(cancellationToken);
        var projection = Builders<IssueReport>.Projection.ElemMatch(item => item.Evidence,
            Builders<EvidenceItem>.Filter.Eq($"data.{PhotoIdField}", photoId.ToString("N")));
        var document = await mongo.IssueReports.Find(filter).Project<IssueReport>(projection).FirstOrDefaultAsync(cancellationToken);
        var evidence = document?.Evidence.SingleOrDefault();
        if (evidence?.Data?.GetValue(BodyField, BsonNull.Value) is not BsonBinaryData body
            || evidence.MimeType is not ("image/jpeg" or "image/png"))
            throw new NotFoundException("The issue photo was not found.", "issue_photo_not_found");

        return (body.Bytes, evidence.MimeType);
    }

    private static async Task<byte[]> ReadPhotoAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > MaxPhotoBytes) throw PhotoTooLarge();
        using var content = new MemoryStream();
        var buffer = new byte[16 * 1024];
        while (true)
        {
            var count = await request.Body.ReadAsync(buffer, cancellationToken);
            if (count == 0) return content.ToArray();
            if (content.Length + count > MaxPhotoBytes) throw PhotoTooLarge();
            content.Write(buffer, 0, count);
        }
    }

    private static AppException PhotoTooLarge() => new("Use a photo of up to 2 MiB.", 413, "issue_photo_too_large");
}
