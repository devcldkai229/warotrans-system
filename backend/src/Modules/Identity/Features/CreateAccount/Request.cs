namespace WaroTrans.Identity.Features.CreateAccount;

/// <param name="Role">ADMIN or STAFF. The account starts ACTIVE and gets a server-generated temporary password.</param>
internal sealed record CreateAccountRequest(string Username, string Email, string FullName, string Role);
