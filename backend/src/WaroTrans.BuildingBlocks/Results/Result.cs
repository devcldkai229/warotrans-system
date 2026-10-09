namespace WaroTrans.BuildingBlocks.Results;

/// <summary>
/// Outcome of a use case. Expected business failures are returned as an <see cref="Results.Error"/>;
/// unexpected failures still throw and reach the global exception handler.
/// </summary>
public class Result
{
    private readonly Error? _error;

    protected Result(Error? error)
    {
        _error = error;
    }

    public bool IsSuccess => _error is null;
    public bool IsFailure => !IsSuccess;

    public Error Error =>
        _error ?? throw new InvalidOperationException("A successful result has no error.");

    public static Result Success() => new(null);
    public static Result Failure(Error error) => new(error);
    public static Result<T> Success<T>(T value) => new(value, null);
    public static Result<T> Failure<T>(Error error) => new(default, error);
}

public sealed class Result<T> : Result
{
    private readonly T? _value;

    internal Result(T? value, Error? error)
        : base(error)
    {
        _value = value;
    }

    public T Value =>
        IsSuccess ? _value! : throw new InvalidOperationException("A failed result has no value.");
}
