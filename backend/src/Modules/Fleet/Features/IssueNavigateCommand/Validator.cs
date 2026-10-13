using FluentValidation;

namespace WaroTrans.Fleet.Features.IssueNavigateCommand;

public sealed class IssueNavigateCommandRequestValidator : AbstractValidator<IssueNavigateCommandRequest>
{
    public IssueNavigateCommandRequestValidator()
    {
        RuleFor(x => x.FrameId).MaximumLength(64).When(x => x.FrameId is not null);
    }
}
