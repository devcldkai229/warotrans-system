namespace WaroTrans.Identity.Features.UpdateAccount;

/// <summary>The username is the sign-in identity and cannot be changed; status has its own endpoint.</summary>
internal sealed record UpdateAccountRequest(string Email, string FullName, string Role);
