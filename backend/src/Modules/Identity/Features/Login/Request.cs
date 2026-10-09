namespace WaroTrans.Identity.Features.Login;

/// <param name="UseCookie">
/// True for browser clients: the refresh token is set as an HttpOnly cookie and left out of the response body.
/// </param>
internal sealed record LoginRequest(string Username, string Password, bool UseCookie = false);
