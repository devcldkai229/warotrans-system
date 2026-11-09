namespace WaroTrans.Identity.Features.CreateAccount;

/// <param name="Role">
/// ADMIN, STAFF or TECHNICIAN. The account starts ACTIVE with a server-generated temporary password that must be
/// changed at the first sign-in.
/// </param>
internal sealed record CreateAccountRequest(string Username, string Email, string FullName, string Role);
