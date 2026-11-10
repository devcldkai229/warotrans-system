using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace WaroTrans.BuildingBlocks.Abstractions;

public static class AuditEndpointExtensions
{
    /// <summary>
    /// Records an <see cref="AuditEntry"/> after the endpoint succeeded (2xx), with the entity id taken from the route
    /// value <paramref name="idRouteValue"/> or, for a create, from the <c>id</c> of the returned body. The request
    /// body is not recorded (it may hold secrets); handlers that know before/after values record those themselves.
    /// </summary>
    public static TBuilder Audited<TBuilder>(this TBuilder builder, string action, string entityType, string? idRouteValue = "id")
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
        {
            var result = await next(context);

            var status = result switch
            {
                IStatusCodeHttpResult { StatusCode: { } code } => code,
                IResult => StatusCodes.Status200OK,
                _ => StatusCodes.Status200OK
            };
            if (status is < 200 or >= 300)
            {
                return result;
            }

            var http = context.HttpContext;
            Guid? entityId = null;
            if (idRouteValue is not null && Guid.TryParse(http.GetRouteValue(idRouteValue)?.ToString(), out var routeId))
            {
                entityId = routeId;
            }
            else if (result is IValueHttpResult { Value: { } value })
            {
                entityId = TryReadId(value);
            }

            var trail = http.RequestServices.GetRequiredService<IAuditTrail>();
            await trail.RecordAsync(
                new AuditEntry(
                    action,
                    entityType,
                    entityId,
                    Context: new Dictionary<string, object?>
                    {
                        ["method"] = http.Request.Method,
                        ["path"] = http.Request.Path.Value,
                        ["status"] = status
                    }),
                http.RequestAborted);

            return result;
        });
        return builder;
    }

    /// <summary><c>Id</c> of the response, or of its <c>Account</c> (CreateAccount returns {account, temporaryPassword}).</summary>
    private static Guid? TryReadId(object value)
    {
        if (ReadGuid(value, "Id") is { } id)
        {
            return id;
        }

        var account = value.GetType().GetProperty("Account")?.GetValue(value);
        return account is null ? null : ReadGuid(account, "Id");
    }

    private static Guid? ReadGuid(object source, string property) =>
        source.GetType().GetProperty(property)?.GetValue(source) as Guid?;
}
