using FluentValidation;

namespace WaroTrans.Identity.Security;

/// <summary>Rules for a password a person chooses (temporary passwords are generated, see <see cref="TemporaryPassword"/>).</summary>
internal static class PasswordPolicy
{
    public const int MinimumLength = 10;
    public const int MaximumLength = 128;

    public static IRuleBuilderOptions<T, string> MeetsPasswordPolicy<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .NotEmpty()
            .MinimumLength(MinimumLength)
            .MaximumLength(MaximumLength)
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit))
            .WithMessage("The password must contain at least one letter and one digit.")
            .Must(p => p.Trim().Length == p.Length)
            .WithMessage("The password must not start or end with a space.");

    public static bool ContainsUsername(string password, string username) =>
        username.Length >= 3 && password.Contains(username, StringComparison.OrdinalIgnoreCase);
}
