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
        // Closed exactly when every Detail is terminal (WH-04): COMPLETED + FAILED is a finished, partial request.
        Assert.Equal(details.All(TransportRequest.IsTerminal), request.CompletedAt is not null);
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
    [InlineData(TransportRequestDetailStatus.QUEUED, TransportRequestStatus.QUEUED)]
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

    [Fact]
    public void Cancelled_and_delivered_details_close_the_request_as_partially_completed()
    {
        var request = Request(TransportRequestDetailStatus.CANCELLED, TransportRequestDetailStatus.COMPLETED);

        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.PARTIALLY_COMPLETED, request.Status);
        Assert.True(request.IsClosed);
    }

    [Fact]
    public void Cancelling_before_pickup_cancels_every_open_detail()
    {
        var request = Request(TransportRequestDetailStatus.QUEUED, TransportRequestDetailStatus.QUEUED);
        var actor = Guid.NewGuid();

        request.ApplyCancel(actor, "wrong pallets", new HashSet<Guid>(), DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.CANCELLED, request.Status);
        Assert.All(request.Details, d => Assert.Equal(TransportRequestDetailStatus.CANCELLED, d.Status));
        Assert.Equal(actor, request.CancelledBy);
        Assert.Equal("wrong pallets", request.CancelReason);
        Assert.NotNull(request.CompletedAt);
    }

    [Fact]
    public void Cargo_on_a_robot_keeps_the_request_cancelling_until_it_is_recovered()
    {
        var request = Request(TransportRequestDetailStatus.IN_PROGRESS, TransportRequestDetailStatus.QUEUED);
        var onRobot = request.Details.OrderBy(d => d.SequenceNo).First();

        request.ApplyCancel(Guid.NewGuid(), "customer cancelled", new HashSet<Guid> { onRobot.ContainerId }, DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.CANCELLING, request.Status);
        Assert.Equal(TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY, onRobot.Status);
        Assert.False(request.IsClosed);

        // Someone unloads the robot and cancels the Job: only now is the request closed.
        onRobot.Status = TransportRequestDetailStatus.CANCELLED;
        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.CANCELLED, request.Status);
        Assert.NotNull(request.CompletedAt);
    }

    [Fact]
    public void Delivering_the_recovered_cargo_closes_a_cancelled_request_as_partial()
    {
        var request = Request(TransportRequestDetailStatus.IN_PROGRESS, TransportRequestDetailStatus.QUEUED);
        var onRobot = request.Details.OrderBy(d => d.SequenceNo).First();
        request.ApplyCancel(null, "stop", new HashSet<Guid> { onRobot.ContainerId }, DateTimeOffset.UtcNow);

        onRobot.Status = TransportRequestDetailStatus.COMPLETED;
        request.ApplyDetailProgress(DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.PARTIALLY_COMPLETED, request.Status);
        Assert.True(request.IsClosed);
    }

    [Fact]
    public void Rejecting_records_who_and_why_and_cancels_the_details()
    {
        var request = Request(TransportRequestDetailStatus.PENDING);
        request.Status = TransportRequestStatus.SUBMITTED;
        var reviewer = Guid.NewGuid();

        request.Reject(reviewer, "destination blocked", DateTimeOffset.UtcNow);

        Assert.Equal(TransportRequestStatus.REJECTED, request.Status);
        Assert.Equal(reviewer, request.RejectedBy);
        Assert.Equal("destination blocked", request.RejectReason);
        Assert.Equal(TransportRequestDetailStatus.CANCELLED, Assert.Single(request.Details).Status);
    }
}
