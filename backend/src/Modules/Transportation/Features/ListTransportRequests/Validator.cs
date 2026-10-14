using FluentValidation;

namespace WaroTrans.Transportation.Features.ListTransportRequests;

public sealed class ListTransportRequestsRequestValidator : AbstractValidator<ListTransportRequestsRequest>
{
    public ListTransportRequestsRequestValidator()
    {
        RuleFor(x => x.Take).InclusiveBetween(1, 200);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
        RuleFor(x => x.Status)
            .IsInEnum()
            .When(x => x.Status.HasValue);
    }
}
