using FluentValidation;

namespace WaroTrans.Fleet.Features.ListRobots;

public sealed class ListRobotsRequestValidator : AbstractValidator<ListRobotsRequest>
{
    public ListRobotsRequestValidator()
    {
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Take).InclusiveBetween(1, 100);
        RuleFor(x => x.Search).MaximumLength(100).When(x => x.Search is not null);
    }
}
