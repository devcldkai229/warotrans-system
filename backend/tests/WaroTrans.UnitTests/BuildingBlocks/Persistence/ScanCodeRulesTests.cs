using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.WorkflowExecution.Execution;

namespace WaroTrans.UnitTests.BuildingBlocks.Persistence;

public sealed class ScanCodeRulesTests
{
    [Fact]
    public void Short_daily_code_reads_back_its_day_and_number()
    {
        Assert.Equal((new DateOnly(2026, 11, 18), 1L), BusinessCodeGenerator.TryParseShortDailyCode("C181126001", "C"));
        Assert.Equal((new DateOnly(2026, 11, 18), 1000L), BusinessCodeGenerator.TryParseShortDailyCode("C1811261000", "C"));
        Assert.Null(BusinessCodeGenerator.TryParseShortDailyCode("CTN-20261118-000001", "C"));
        Assert.Null(BusinessCodeGenerator.TryParseShortDailyCode("C321326001", "C")); // no 32/13
        Assert.Null(BusinessCodeGenerator.TryParseShortDailyCode("R181126001", "C"));
        Assert.Null(BusinessCodeGenerator.TryParseShortDailyCode("C18112600", "C"));
    }

    [Theory]
    [InlineData("passed", null, "PASSED")]
    [InlineData("FAILED", "dented corner", "FAILED")]
    public void Inspection_step_takes_a_result(string result, string? note, string expected) =>
        Assert.Equal(expected, JobExecutionEngine.InspectionResultFor("INSPECTION_CONFIRM", result, note));

    [Fact]
    public void Inspection_result_is_required_there_needs_a_reason_to_fail_and_is_refused_elsewhere()
    {
        Assert.Equal("inspection_result_required", Assert.Throws<DomainValidationException>(() => JobExecutionEngine.InspectionResultFor("INSPECTION_CONFIRM", null, null)).Code);
        Assert.Equal("inspection_result_required", Assert.Throws<DomainValidationException>(() => JobExecutionEngine.InspectionResultFor("INSPECTION_CONFIRM", "MAYBE", null)).Code);
        Assert.Equal("inspection_failure_reason_required", Assert.Throws<DomainValidationException>(() => JobExecutionEngine.InspectionResultFor("INSPECTION_CONFIRM", "FAILED", " ")).Code);
        Assert.Equal("inspection_result_not_allowed", Assert.Throws<DomainValidationException>(() => JobExecutionEngine.InspectionResultFor("PICKUP_CONFIRM", "PASSED", null)).Code);
        Assert.Null(JobExecutionEngine.InspectionResultFor("PICKUP_CONFIRM", null, null));
    }
}
