using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.UnitTests.Transportation.Entities;

public sealed class TransportRequestSubmitTests
{
    private static TransportRequestDetailDraft Draft(int sequenceNo, Guid? containerId = null) =>
        new(sequenceNo, containerId ?? Guid.NewGuid(), null, Guid.NewGuid(), null, null, Guid.NewGuid(), null);

    private static TransportRequest Submit(params TransportRequestDetailDraft[] details) =>
        TransportRequest.Submit(
            "REQ-20261013-000001",
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            null,
            "  ",
            details,
            DateTimeOffset.UtcNow);

    [Fact]
    public void Submit_sets_initial_state_and_server_generated_values()
    {
        var request = Submit(Draft(2), Draft(1));

        Assert.NotEqual(Guid.Empty, request.Id);
        Assert.Equal(TransportRequestStatus.SUBMITTED, request.Status);
        Assert.Equal(TransportRequest.CurrentPlanSchemaVersion, request.PlanSchemaVersion);
        Assert.NotNull(request.WorkflowInputs);
        Assert.Empty(request.WorkflowInputs);
        Assert.Null(request.Note);
        Assert.Equal(request.SubmittedAt, request.CreatedAt);
        Assert.All(request.Details, d =>
        {
            Assert.NotEqual(Guid.Empty, d.Id);
            Assert.Equal(request.Id, d.TransportRequestId);
            Assert.Equal(TransportRequestDetailStatus.PENDING, d.Status);
        });
        Assert.Equal([1, 2], request.Details.Select(d => d.SequenceNo));
    }

    [Fact]
    public void Submit_requires_details()
    {
        var ex = Assert.Throws<DomainValidationException>(() => Submit());
        Assert.Equal("details_required", ex.Code);
    }

    [Fact]
    public void Submit_rejects_non_positive_sequence()
    {
        var ex = Assert.Throws<DomainValidationException>(() => Submit(Draft(0)));
        Assert.Equal("detail_sequence_invalid", ex.Code);
    }

    [Fact]
    public void Submit_rejects_duplicate_sequence()
    {
        var ex = Assert.Throws<DomainValidationException>(() => Submit(Draft(1), Draft(1)));
        Assert.Equal("duplicate_sequence_no", ex.Code);
    }

    [Fact]
    public void Submit_rejects_duplicate_container()
    {
        var container = Guid.NewGuid();
        var ex = Assert.Throws<DomainValidationException>(() => Submit(Draft(1, container), Draft(2, container)));
        Assert.Equal("duplicate_container_in_request", ex.Code);
    }
}
