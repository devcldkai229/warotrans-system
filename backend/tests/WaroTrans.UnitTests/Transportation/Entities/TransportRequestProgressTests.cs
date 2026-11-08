using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.UnitTests.Transportation.Entities;

public sealed class TransportRequestProgressTests
{
    private static TransportRequest Request(params TransportRequestDetailStatus[] details)
    {
        var request = TransportRequest.Submit(
            "REQ-20261015-000001", Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), null, null,
            details.Select((_, i) => new TransportRequestDetailDraft(i + 1, Guid.NewGuid(), null, Guid.NewGuid(), null, null, Guid.NewGuid(), null)).ToList(),
            DateTimeOffset.UtcNow);
        request.Status = TransportRequestStatus.QUEUED;
        foreach (var (detail, status) in request.Details.OrderBy(d => d.SequenceNo).Zip(details))
        {
            detail.Status = status;
        }

        return request;
    }

    [Theory]
    [InlineData(new[] { TransportRequestDetailStatus.IN_PROGRESS, TransportRequestDetailStatus.IN_PROGRESS }, TransportRequestStatus.IN_PROGRESS)]
    [InlineData(new[] { TransportRequestDetailStatus.COMPLETED, TransportRequestDetailStatus.IN_PROGRESS }, TransportRequestStatus.PARTIALLY_COMPLETED)]
    [InlineData(new[] { TransportRequestDetailStatus.COMPLETED, TransportRequestDetailStatus.COMPLETED }, TransportRequestStatus.COMPLETED)]
    [InlineData(new[] { TransportRequestDetailStatus.FAILED, TransportRequestDetailStatus.FAILED }, TransportRequestStatus.FAILED)]
    [InlineData(new[] { TransportRequestDetailStatus.COMPLETED, TransportRequestDetailStatus.FAILED }, TransportRequestStatus.PARTIALLY_COMPLETED)]
    [InlineData(new[] { TransportRequestDetailStatus.QUEUED, TransportRequestDetailStatus.QUEUED }, TransportRequestStatus.QUEUED)]
    public void Request_status_is_aggregated_from_details(TransportRequestDetailStatus[] details, TransportRequestStatus expected)
    {
        var request = Request(details);

        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(expected, request.Status);
        Assert.Equal(expected is TransportRequestStatus.COMPLETED or TransportRequestStatus.FAILED, request.CompletedAt is not null);
    }

    [Fact]
    public void All_details_cancelled_ends_the_request_as_cancelled()
    {
        var request = Request(TransportRequestDetailStatus.CANCELLED, TransportRequestDetailStatus.CANCELLED);
        request.Status = TransportRequestStatus.IN_PROGRESS;

        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.CANCELLED, request.Status);
        Assert.NotNull(request.CompletedAt);
    }

    [Theory]
    [InlineData(TransportRequestDetailStatus.IN_PROGRESS, TransportRequestStatus.IN_PROGRESS)]
    [InlineData(TransportRequestDetailStatus.COMPLETED, TransportRequestStatus.PARTIALLY_COMPLETED)]
    public void One_cancelled_detail_does_not_cancel_the_request(TransportRequestDetailStatus other, TransportRequestStatus expected)
    {
        var request = Request(TransportRequestDetailStatus.CANCELLED, other);

        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(expected, request.Status);
        Assert.Null(request.CompletedAt);
    }

    [Fact]
    public void Cancelled_request_is_not_changed_by_detail_progress()
    {
        var request = Request(TransportRequestDetailStatus.COMPLETED);
        request.Status = TransportRequestStatus.CANCELLED;

        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.CANCELLED, request.Status);
    }
}
