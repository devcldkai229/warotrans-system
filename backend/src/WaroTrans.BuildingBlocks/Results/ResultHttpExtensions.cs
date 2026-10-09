using FluentValidation.Results;
using Microsoft.AspNetCore.Http;

namespace WaroTrans.BuildingBlocks.Results;

public static class ResultHttpExtensions
{
    private const string ValidationFailedCode = "validation_failed";

    /// <summary>
    /// Maps an <see cref="Error"/> to the same ProblemDetails shape the global exception handler produces.
    /// </summary>
    public static IResult ToProblem(this Error error)
    {
        var statusCode = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return TypedResults.Problem(
            detail: error.Message,
            statusCode: statusCode,
            title: error.Code,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

    public static IResult ToValidationProblem(this ValidationResult validation) =>
        Error.Validation(
                ValidationFailedCode,
                string.Join("; ", validation.Errors.Select(e => e.ErrorMessage)))
            .ToProblem();
}
