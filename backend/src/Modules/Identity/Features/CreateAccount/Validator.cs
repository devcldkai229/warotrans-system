using FluentValidation;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.CreateAccount;

internal sealed class CreateAccountValidator : AbstractValidator<CreateAccountRequest>
{
    public CreateAccountValidator()
    {
        RuleFor(x => x.Username)
            .NotEmpty()
            .Length(3, 50)
            .Matches(AccountRules.UsernamePattern)
            .WithMessage("Username may only contain lower case letters, digits, '.', '_' and '-'.");
        RuleFor(x => x.Email).NotEmpty().MaximumLength(255).EmailAddress();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Role)
            .Must(role => AccountRules.TryParseRole(role, out _))
            .WithMessage("Role must be ADMIN or STAFF.");
    }
}
