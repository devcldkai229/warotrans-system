namespace WaroTrans.Identity.Features.ChangeAccountStatus;

/// <param name="Status">ACTIVE or INACTIVE. LOCKED is reserved for the system and cannot be set here.</param>
internal sealed record ChangeAccountStatusRequest(string Status);
