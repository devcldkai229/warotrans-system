namespace WaroTrans.Identity.Features.RefreshSession;

/// <param name="RefreshToken">Sent by clients that store the token themselves (mobile). Browser clients send the cookie and no body.</param>
internal sealed record RefreshSessionRequest(string? RefreshToken);
