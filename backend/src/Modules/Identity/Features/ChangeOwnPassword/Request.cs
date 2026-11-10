namespace WaroTrans.Identity.Features.ChangeOwnPassword;

/// <param name="UseCookie">Same meaning as on login: the new refresh token travels in the HttpOnly cookie (web).</param>
internal sealed record ChangeOwnPasswordRequest(string CurrentPassword, string NewPassword, bool UseCookie = false);
