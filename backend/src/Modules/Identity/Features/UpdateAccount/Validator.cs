using FluentValidation;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.UpdateAccount;

internal sealed class UpdateAccountValidator : AbstractValidator<UpdateAccountRequest>
{
    public UpdateAccountValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(255).EmailAddress();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Role)
            .Must(role => AccountRules.TryParseRole(role, out _))
            .WithMessage("Role must be ADMIN or STAFF.");
    }
}
