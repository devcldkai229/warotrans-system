using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace WaroTrans.BuildingBlocks.Exceptions;

public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title, detail, code) = exception switch
        {
            AppException app => (app.StatusCode, app.Code ?? "app_error", app.Message, app.Code),
            FluentValidation.ValidationException fluent => (
                StatusCodes.Status400BadRequest,
                "validation_failed",
                string.Join("; ", fluent.Errors.Select(e => e.ErrorMessage)),
                "validation_failed"),
            _ => (StatusCodes.Status500InternalServerError, "server_error", "An unexpected error occurred.", "server_error")
        };

        if (statusCode >= 500)
        {
            logger.LogError(exception, "Unhandled exception");
        }
        else
        {
            logger.LogWarning(exception, "Handled application exception");
        }

        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path
        };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/problem+json";
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}
