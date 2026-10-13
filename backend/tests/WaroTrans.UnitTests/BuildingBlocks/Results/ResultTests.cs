using WaroTrans.BuildingBlocks.Results;

namespace WaroTrans.UnitTests.BuildingBlocks.Results;

public class ResultTests
{
    private static readonly Error SampleError = Error.Conflict("sample_conflict", "Already exists.");

    [Fact]
    public void Success_carries_the_value_and_has_no_error()
    {
        var result = Result.Success(42);

        Assert.True(result.IsSuccess);
        Assert.False(result.IsFailure);
        Assert.Equal(42, result.Value);
        Assert.Throws<InvalidOperationException>(() => result.Error);
    }

    [Fact]
    public void Failure_carries_the_error_and_has_no_value()
    {
        var result = Result.Failure<int>(SampleError);

        Assert.True(result.IsFailure);
        Assert.Equal(SampleError, result.Error);
        Assert.Throws<InvalidOperationException>(() => result.Value);
    }

    [Fact]
    public void Error_factories_set_the_matching_type()
    {
        Assert.Equal(ErrorType.Validation, Error.Validation("c", "m").Type);
        Assert.Equal(ErrorType.Unauthorized, Error.Unauthorized("c", "m").Type);
        Assert.Equal(ErrorType.Forbidden, Error.Forbidden("c", "m").Type);
        Assert.Equal(ErrorType.NotFound, Error.NotFound("c", "m").Type);
        Assert.Equal(ErrorType.Conflict, Error.Conflict("c", "m").Type);
    }
}
