using WaroTrans.BuildingBlocks.Persistence.CodeSequences;

namespace WaroTrans.UnitTests.BuildingBlocks.Persistence;

public sealed class ShortDailyCodeTests
{
    [Theory]
    [InlineData("C", 1, "C181126001")]
    [InlineData("R", 12, "R181126012")]
    [InlineData("J", 999, "J181126999")]
    [InlineData("C", 1000, "C1811261000")]
    public void Letter_then_ddMMyy_then_a_three_digit_daily_number(string letter, long value, string expected) =>
        Assert.Equal(expected, BusinessCodeGenerator.ShortDailyCode(letter, new DateOnly(2026, 11, 18), value));
}
