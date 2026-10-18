using System.Security.Cryptography;

namespace WaroTrans.Identity.Security;

/// <summary>The one-time password an Admin hands to a new account. Never logged, never stored in clear text.</summary>
internal static class TemporaryPassword
{
    // No 0/O, 1/l/I: the Admin reads this aloud or types it from a screen.
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private const int Length = 14;

    public static string Generate() => new(RandomNumberGenerator.GetItems<char>(Alphabet, Length));
}
