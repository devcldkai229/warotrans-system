using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.ListAccounts;

internal sealed record ListAccountsResponse(IReadOnlyList<AccountResponse> Items);
