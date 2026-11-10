using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.RobotScope;

internal sealed record AccountRobotScopeResponse(Guid AccountId, IReadOnlyList<Guid> RobotIds);

/// <summary>Replaces the whole list: the robots the Technician may act on after this call.</summary>
internal sealed record SetAccountRobotScopeRequest(IReadOnlyList<Guid> RobotIds);

internal sealed class SetAccountRobotScopeValidator : AbstractValidator<SetAccountRobotScopeRequest>
{
    public const int MaximumRobots = 200;

    public SetAccountRobotScopeValidator()
    {
        RuleFor(x => x.RobotIds).NotNull();
        RuleFor(x => x.RobotIds.Count).LessThanOrEqualTo(MaximumRobots).When(x => x.RobotIds is not null);
        RuleForEach(x => x.RobotIds).NotEqual(Guid.Empty);
    }
}

internal sealed class AccountRobotScopeHandler(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    IAuditTrail audit,
    ILogger<AccountRobotScopeHandler> logger)
{
    public async Task<Result<AccountRobotScopeResponse>> GetAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.AsNoTracking().SingleOrDefaultAsync(a => a.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.Failure<AccountRobotScopeResponse>(IdentityErrors.TargetAccountNotFound);
        }

        var robotIds = await dbContext.TechnicianRobotScopes
            .AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .OrderBy(s => s.RobotId)
            .Select(s => s.RobotId)
            .ToListAsync(cancellationToken);

        return Result.Success(new AccountRobotScopeResponse(accountId, robotIds));
    }

    public async Task<Result<AccountRobotScopeResponse>> SetAsync(
        Guid accountId,
        SetAccountRobotScopeRequest request,
        CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.AsNoTracking().SingleOrDefaultAsync(a => a.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.Failure<AccountRobotScopeResponse>(IdentityErrors.TargetAccountNotFound);
        }

        if (account.Role != AccountRole.TECHNICIAN)
        {
            return Result.Failure<AccountRobotScopeResponse>(IdentityErrors.RobotScopeRequiresTechnician);
        }

        var wanted = request.RobotIds.Distinct().ToHashSet();
        var existingBefore = await dbContext.TechnicianRobotScopes
            .AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .OrderBy(s => s.RobotId)
            .Select(s => s.RobotId)
            .ToListAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.TechnicianRobotScopes
            .Where(s => s.AccountId == accountId && !wanted.Contains(s.RobotId))
            .ExecuteDeleteAsync(cancellationToken);

        var existing = await dbContext.TechnicianRobotScopes
            .Where(s => s.AccountId == accountId)
            .Select(s => s.RobotId)
            .ToListAsync(cancellationToken);

        foreach (var robotId in wanted.Except(existing))
        {
            dbContext.TechnicianRobotScopes.Add(new TechnicianRobotScope
            {
                AccountId = accountId,
                RobotId = robotId,
                AssignedAt = now,
                AssignedBy = currentUser.AccountId
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await audit.RecordAsync(
            new AuditEntry(
                "account.robot_scope_set",
                "ACCOUNT",
                accountId,
                Before: new Dictionary<string, object?> { ["robotIds"] = existingBefore },
                After: new Dictionary<string, object?> { ["robotIds"] = wanted.Order().ToList() }),
            cancellationToken);

        logger.LogInformation(
            "Robot scope of technician {AccountId} set to {RobotCount} robot(s) by {ChangedBy}",
            accountId,
            wanted.Count,
            currentUser.AccountId);

        return Result.Success(new AccountRobotScopeResponse(accountId, wanted.Order().ToList()));
    }
}

internal static class AccountRobotScopeEndpoints
{
    public static void MapAccountRobotScope(this IEndpointRouteBuilder group)
    {
        group.MapGet("/accounts/{id:guid}/robot-scope", async (
                Guid id,
                AccountRobotScopeHandler handler,
                CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(id, cancellationToken);
                return result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error.ToProblem();
            })
            .RequirePermission(Permissions.UserManage)
            .WithName("GetAccountRobotScope")
            .Produces<AccountRobotScopeResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/accounts/{id:guid}/robot-scope", async (
                Guid id,
                SetAccountRobotScopeRequest request,
                IValidator<SetAccountRobotScopeRequest> validator,
                AccountRobotScopeHandler handler,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid)
                {
                    return validation.ToValidationProblem();
                }

                var result = await handler.SetAsync(id, request, cancellationToken);
                return result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error.ToProblem();
            })
            .RequirePermission(Permissions.UserManage)
            .WithName("SetAccountRobotScope")
            .Produces<AccountRobotScopeResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);
    }
}
