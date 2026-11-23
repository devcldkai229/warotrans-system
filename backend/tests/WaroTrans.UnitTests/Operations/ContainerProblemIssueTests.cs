using MongoDB.Bson;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Features.IssueReports;

namespace WaroTrans.UnitTests.Operations;

public sealed class ContainerProblemIssueTests
{
    private static IssueReport Issue(string code, IssueStatus status, bool removed = false, params string[] defects) => new()
    {
        Id = Guid.NewGuid(),
        Code = "ISS-1",
        IssueType = IssueType.CONTAINER,
        Status = status,
        ProblemCode = code,
        Metadata = new BsonDocument { ["removedFromJob"] = removed, ["defects"] = new BsonArray(defects.Length > 0 ? defects : [code]) }
    };

    [Fact]
    public void Only_open_wrong_or_missing_container_issues_block_a_handover()
    {
        Assert.True(IssueDto.From(Issue(ContainerProblemCodes.WrongContainer, IssueStatus.OPEN), []).BlocksHandover);
        Assert.True(IssueDto.From(Issue(ContainerProblemCodes.MissingContainer, IssueStatus.IN_PROGRESS), []).BlocksHandover);
        Assert.False(IssueDto.From(Issue(ContainerProblemCodes.MissingContainer, IssueStatus.RESOLVED), []).BlocksHandover);
        Assert.False(IssueDto.From(Issue(ContainerProblemCodes.ContainerDamaged, IssueStatus.OPEN), []).BlocksHandover);
    }

    [Fact]
    public void A_container_taken_off_its_job_has_no_handover_left_to_block()
    {
        var dto = IssueDto.From(Issue(ContainerProblemCodes.MissingContainer, IssueStatus.OPEN, removed: true), []);

        Assert.False(dto.BlocksHandover);
        Assert.True(dto.RemovedFromJob);
    }

    [Fact]
    public void An_inspection_issue_lists_every_problem_found()
    {
        var dto = IssueDto.From(
            Issue(ContainerProblemCodes.QuantityMismatch, IssueStatus.OPEN, true, ContainerProblemCodes.QuantityMismatch, ContainerProblemCodes.PackagingDefect), []);

        Assert.Equal([ContainerProblemCodes.QuantityMismatch, ContainerProblemCodes.PackagingDefect], dto.Defects);
    }

    [Fact]
    public void What_is_inside_is_only_seen_at_the_inspection()
    {
        Assert.True(ContainerProblemCodes.SeenAtHandover(ContainerProblemCodes.ContainerDamaged));
        Assert.False(ContainerProblemCodes.SeenAtHandover(ContainerProblemCodes.QuantityMismatch));
        Assert.False(ContainerProblemCodes.SeenAtHandover(ContainerProblemCodes.ProductMismatch));
        Assert.Equal([ContainerProblemCodes.WrongContainer, ContainerProblemCodes.MissingContainer], ContainerProblemCodes.Blocking);
    }

    private static ContainerHoldSnapshot Held(decimal quantity) =>
        new(Guid.NewGuid(), "C1", "HOLD", ContainerProblemCodes.ContentsDamaged, Guid.NewGuid(), DateTimeOffset.UtcNow, null, null, null, quantity, "PCS");

    [Theory]
    [InlineData(ContainerProblemCodes.ContentsDamaged, "ADJUST_QUANTITY,SCRAP,RELEASE")]
    [InlineData(ContainerProblemCodes.QuantityMismatch, "ADJUST_QUANTITY,SCRAP")]
    [InlineData(ContainerProblemCodes.ProductMismatch, "SCRAP")]
    [InlineData(ContainerProblemCodes.PackagingDefect, "REPACK,SCRAP")]
    [InlineData(ContainerProblemCodes.ContainerDamaged, "REPACK,SCRAP")]
    [InlineData(ContainerProblemCodes.BarcodeUnreadable, "RELABEL")]
    [InlineData(ContainerProblemCodes.UnsafeLoad, "RESTACK,SCRAP")]
    [InlineData(ContainerProblemCodes.MissingContainer, "FOUND,LOST")]
    [InlineData(ContainerProblemCodes.Other, "RELEASE,ADJUST_QUANTITY,SCRAP")]
    [InlineData(null, "RELEASE,ADJUST_QUANTITY,SCRAP")]
    public void Each_problem_offers_the_outcomes_that_fit_a_packed_box(string? code, string outcomes)
    {
        Assert.Equal(outcomes.Split(','), ContainerProblemCodes.OutcomesFor(code));
        Assert.Equal(outcomes.Split(','), IssueDto.From(Issue(code ?? ContainerProblemCodes.Other, IssueStatus.OPEN), []).ContainerOutcomes);
    }

    [Fact]
    public void A_box_with_the_wrong_product_inside_can_only_be_scrapped()
    {
        var error = Assert.Throws<DomainValidationException>(() =>
            WaroTrans.Operations.Features.IssueReports.IssueService.EnsureOutcomeFits(
                Issue(ContainerProblemCodes.ProductMismatch, IssueStatus.OPEN), Held(10), ContainerHoldOutcomes.Release, null));

        Assert.Equal("issue_container_outcome_not_allowed", error.Code);
        WaroTrans.Operations.Features.IssueReports.IssueService.EnsureOutcomeFits(
            Issue(ContainerProblemCodes.ProductMismatch, IssueStatus.OPEN), Held(10), ContainerHoldOutcomes.Scrap, null);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(12)]
    public void A_partly_damaged_box_keeps_fewer_goods_than_it_had(int left)
    {
        var error = Assert.Throws<DomainValidationException>(() =>
            WaroTrans.Operations.Features.IssueReports.IssueService.EnsureOutcomeFits(
                Issue(ContainerProblemCodes.ContentsDamaged, IssueStatus.OPEN), Held(10), ContainerHoldOutcomes.AdjustQuantity, left));

        Assert.Equal("container_quantity_not_reduced", error.Code);
        WaroTrans.Operations.Features.IssueReports.IssueService.EnsureOutcomeFits(
            Issue(ContainerProblemCodes.ContentsDamaged, IssueStatus.OPEN), Held(10), ContainerHoldOutcomes.AdjustQuantity, 7);
    }
}
