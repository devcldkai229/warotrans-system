using FluentValidation;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.ChangeAccountStatus;

internal sealed class ChangeAccountStatusValidator : AbstractValidator<ChangeAccountStatusRequest>
{
    public ChangeAccountStatusValidator()
    {
        RuleFor(x => x.Status)
            .Must(status => AccountRules.TryParseStatus(status, out var parsed) && parsed != AccountStatus.LOCKED)
            .WithMessage("Status must be ACTIVE or INACTIVE.");
    }
}
