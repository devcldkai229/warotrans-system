using FluentValidation;

namespace WaroTrans.Transportation.Features.ListTransportRequests;

public sealed class ListTransportRequestsRequestValidator : AbstractValidator<ListTransportRequestsRequest>
{
    public const int MaxIds = 100;

    public ListTransportRequestsRequestValidator()
    {
        RuleFor(x => x.Take).InclusiveBetween(1, 200);
        RuleFor(x => x.Skip).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
        RuleFor(x => x.Ids!.Count)
            .LessThanOrEqualTo(MaxIds)
            .When(x => x.Ids is not null)
            .WithMessage($"At most {MaxIds} ids can be looked up at once.");
        RuleFor(x => x.Status)
            .IsInEnum()
            .When(x => x.Status.HasValue);
    }
}
