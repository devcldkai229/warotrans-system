namespace WaroTrans.Identity.Features.Logout;

/// <param name="RefreshToken">Sent by clients that store the token themselves (mobile). Browser clients send the cookie and no body.</param>
internal sealed record LogoutRequest(string? RefreshToken);
