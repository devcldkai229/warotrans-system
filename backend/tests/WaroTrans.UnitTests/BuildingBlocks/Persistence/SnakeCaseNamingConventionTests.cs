using WaroTrans.BuildingBlocks.Persistence;

namespace WaroTrans.UnitTests.BuildingBlocks.Persistence;

public class SnakeCaseNamingConventionTests
{
    [Theory]
    [InlineData("TransportRequest", "transport_request")]
    [InlineData("JobAssignment", "job_assignment")]
    [InlineData("Id", "id")]
    public void ToSnakeCase_converts_pascal_case(string input, string expected)
    {
        Assert.Equal(expected, SnakeCaseNamingConvention.ToSnakeCase(input));
    }
}
