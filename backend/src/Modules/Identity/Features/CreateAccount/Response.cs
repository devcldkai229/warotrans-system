using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.CreateAccount;

/// <param name="TemporaryPassword">Shown once: only its hash is stored, so it cannot be read again.</param>
internal sealed record CreateAccountResponse(AccountResponse Account, string TemporaryPassword);
