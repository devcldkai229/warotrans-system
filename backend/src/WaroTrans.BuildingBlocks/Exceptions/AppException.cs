namespace WaroTrans.BuildingBlocks.Exceptions;

public class AppException : Exception
{
    public AppException(string message, int statusCode = 400, string? code = null)
        : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public int StatusCode { get; }
    public string? Code { get; }
}

public sealed class NotFoundException(string message, string? code = "not_found")
    : AppException(message, StatusCodes.Status404NotFound, code);

public sealed class ConflictException(string message, string? code = "conflict")
    : AppException(message, StatusCodes.Status409Conflict, code);

public sealed class DomainValidationException(string message, string? code = "validation_failed")
    : AppException(message, StatusCodes.Status400BadRequest, code);

file static class StatusCodes
{
    public const int Status404NotFound = 404;
    public const int Status409Conflict = 409;
    public const int Status400BadRequest = 400;
}
