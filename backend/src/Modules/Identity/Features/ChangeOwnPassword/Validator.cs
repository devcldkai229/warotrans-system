using FluentValidation;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.ChangeOwnPassword;

internal sealed class ChangeOwnPasswordValidator : AbstractValidator<ChangeOwnPasswordRequest>
{
    public ChangeOwnPasswordValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().MaximumLength(PasswordPolicy.MaximumLength);
        RuleFor(x => x.NewPassword)
            .MeetsPasswordPolicy()
            .NotEqual(x => x.CurrentPassword)
            .WithMessage("The new password must differ from the current one.");
    }
}
