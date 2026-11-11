using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Features.TransportSchedules;

/// <param name="DaysOfWeek">WEEKLY only: 0 = Sunday … 6 = Saturday.</param>
public sealed record CreateTransportScheduleRequest(
    string Name,
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    Guid ProductId,
    Guid SourceStorageLocationId,
    Guid DestinationEndpointId,
    Guid? DestinationStorageLocationId,
    short? DestinationLevelNo,
    int MaxContainersPerWave,
    ScheduleRecurrence Recurrence,
    TimeOnly LocalTime,
    DateOnly StartDate,
    IReadOnlyList<int>? DaysOfWeek,
    string Timezone,
    DateTimeOffset? EndsAt);

public sealed record TransportWaveResponse(
    Guid Id,
    DateTimeOffset PlannedAt,
    string Status,
    Guid? TransportRequestId,
    int ContainerCount,
    string? Note,
    DateTimeOffset? ProcessedAt);

public sealed record TransportScheduleResponse(
    Guid Id,
    string Name,
    Guid WarehouseId,
    Guid WorkflowId,
    Guid ProductId,
    Guid SourceStorageLocationId,
    Guid DestinationEndpointId,
    int MaxContainersPerWave,
    string Recurrence,
    string LocalTime,
    string StartDate,
    IReadOnlyList<int> DaysOfWeek,
    string Timezone,
    DateTimeOffset? EndsAt,
    string Status,
    IReadOnlyList<TransportWaveResponse> Waves);

public sealed class TransportScheduleService(
    TransportationDbContext db,
    IWarehouseModule warehouse,
    ICurrentUser currentUser)
{
    private const int WavesShown = 20;

    public async Task<TransportScheduleResponse> CreateAsync(CreateTransportScheduleRequest request, CancellationToken cancellationToken)
    {
        var createdBy = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 200)
        {
            throw new DomainValidationException("A schedule needs a name of at most 200 characters.", "schedule_name_invalid");
        }

        if (request.MaxContainersPerWave is < 1 or > 200)
        {
            throw new DomainValidationException("A wave moves 1 to 200 containers.", "schedule_max_containers_invalid");
        }

        var days = request.DaysOfWeek ?? [];
        if (request.Recurrence == ScheduleRecurrence.WEEKLY && (days.Count == 0 || days.Any(d => d is < 0 or > 6)))
        {
            throw new DomainValidationException("A weekly schedule needs days from 0 (Sunday) to 6.", "schedule_days_invalid");
        }

        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(request.Timezone);
        }
        catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException or ArgumentException)
        {
            throw new DomainValidationException($"Unknown timezone '{request.Timezone}'.", "schedule_timezone_invalid");
        }

        var source = (await warehouse.GetStorageLocationsAsync([request.SourceStorageLocationId], cancellationToken))
            .FirstOrDefault(l => l.WarehouseId == request.WarehouseId)
            ?? throw new DomainValidationException("The source shelf is not in this warehouse.", "schedule_source_invalid");

        var now = DateTimeOffset.UtcNow;
        var schedule = new TransportSchedule
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            WarehouseId = request.WarehouseId,
            MapVersionId = request.MapVersionId,
            WorkflowId = request.WorkflowId,
            ProductId = request.ProductId,
            SourceStorageLocationId = source.Id,
            SourceEndpointId = source.EndpointId,
            DestinationEndpointId = request.DestinationEndpointId,
            DestinationStorageLocationId = request.DestinationStorageLocationId,
            DestinationLevelNo = request.DestinationLevelNo,
            MaxContainersPerWave = request.MaxContainersPerWave,
            Recurrence = request.Recurrence,
            LocalTime = request.LocalTime,
            StartDate = request.StartDate,
            DaysOfWeekMask = days.Distinct().Sum(d => 1 << d),
            Timezone = request.Timezone,
            EndsAt = request.EndsAt,
            Status = TransportScheduleStatus.ACTIVE,
            CreatedBy = createdBy,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.TransportSchedules.Add(schedule);
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(schedule.Id, cancellationToken);
    }

    public async Task<IReadOnlyList<TransportScheduleResponse>> ListAsync(Guid? warehouseId, CancellationToken cancellationToken)
    {
        var ids = await db.TransportSchedules.AsNoTracking()
            .Where(s => warehouseId == null || s.WarehouseId == warehouseId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => s.Id)
            .Take(200)
            .ToListAsync(cancellationToken);

        var items = new List<TransportScheduleResponse>(ids.Count);
        foreach (var id in ids)
        {
            items.Add(await GetAsync(id, cancellationToken));
        }

        return items;
    }

    public async Task<TransportScheduleResponse> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var schedule = await db.TransportSchedules.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Schedule '{id}' was not found.", "schedule_not_found");
        var waves = await db.TransportWaves.AsNoTracking()
            .Where(w => w.TransportScheduleId == id)
            .OrderByDescending(w => w.PlannedAt)
            .Take(WavesShown)
            .ToListAsync(cancellationToken);
        return new TransportScheduleResponse(
            schedule.Id,
            schedule.Name,
            schedule.WarehouseId,
            schedule.WorkflowId,
            schedule.ProductId,
            schedule.SourceStorageLocationId,
            schedule.DestinationEndpointId,
            schedule.MaxContainersPerWave,
            schedule.Recurrence.ToString(),
            schedule.LocalTime.ToString("HH:mm"),
            schedule.StartDate.ToString("yyyy-MM-dd"),
            Enumerable.Range(0, 7).Where(d => (schedule.DaysOfWeekMask & (1 << d)) != 0).ToList(),
            schedule.Timezone,
            schedule.EndsAt,
            schedule.Status.ToString(),
            waves.Select(w => new TransportWaveResponse(
                w.Id, w.PlannedAt, w.Status.ToString(), w.TransportRequestId, w.ContainerCount, w.Note, w.ProcessedAt)).ToList());
    }

    public Task<TransportScheduleResponse> PauseAsync(Guid id, CancellationToken cancellationToken) =>
        SetStatusAsync(id, TransportScheduleStatus.ACTIVE, TransportScheduleStatus.PAUSED, cancellationToken);

    public Task<TransportScheduleResponse> ResumeAsync(Guid id, CancellationToken cancellationToken) =>
        SetStatusAsync(id, TransportScheduleStatus.PAUSED, TransportScheduleStatus.ACTIVE, cancellationToken);

    /// <summary>What already has a request keeps running; only what has not started is cancelled.</summary>
    public async Task<TransportScheduleResponse> CancelAsync(Guid id, CancellationToken cancellationToken)
    {
        var schedule = await db.TransportSchedules.FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Schedule '{id}' was not found.", "schedule_not_found");
        if (schedule.Status is TransportScheduleStatus.CANCELLED or TransportScheduleStatus.FINISHED)
        {
            throw new ConflictException($"The schedule is {schedule.Status}.", "schedule_closed");
        }

        var now = DateTimeOffset.UtcNow;
        schedule.Status = TransportScheduleStatus.CANCELLED;
        schedule.UpdatedAt = now;
        foreach (var wave in await db.TransportWaves
                     .Where(w => w.TransportScheduleId == id && w.Status == TransportWaveStatus.PLANNED)
                     .ToListAsync(cancellationToken))
        {
            wave.Status = TransportWaveStatus.CANCELLED;
            wave.ProcessedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    /// <summary>Only this occurrence: the schedule goes on with the next one.</summary>
    public async Task<TransportWaveResponse> CancelWaveAsync(Guid waveId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var cancelled = await db.TransportWaves
            .Where(w => w.Id == waveId && w.Status == TransportWaveStatus.PLANNED)
            .ExecuteUpdateAsync(
                set => set.SetProperty(w => w.Status, TransportWaveStatus.CANCELLED).SetProperty(w => w.ProcessedAt, now),
                cancellationToken);
        var wave = await db.TransportWaves.AsNoTracking().FirstOrDefaultAsync(w => w.Id == waveId, cancellationToken)
            ?? throw new NotFoundException($"Wave '{waveId}' was not found.", "wave_not_found");
        if (cancelled == 0)
        {
            throw new ConflictException($"The wave is {wave.Status}; only a PLANNED wave can be cancelled.", "wave_not_planned");
        }

        return new TransportWaveResponse(wave.Id, wave.PlannedAt, wave.Status.ToString(), wave.TransportRequestId, wave.ContainerCount, wave.Note, wave.ProcessedAt);
    }

    private async Task<TransportScheduleResponse> SetStatusAsync(
        Guid id,
        TransportScheduleStatus from,
        TransportScheduleStatus to,
        CancellationToken cancellationToken)
    {
        var schedule = await db.TransportSchedules.FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Schedule '{id}' was not found.", "schedule_not_found");
        if (schedule.Status != from)
        {
            throw new ConflictException($"The schedule is {schedule.Status}, not {from}.", "schedule_invalid_status");
        }

        schedule.Status = to;
        schedule.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }
}

public static class TransportScheduleEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        const string root = "/schedules";

        endpoints.MapPost(root, async (CreateTransportScheduleRequest request, TransportScheduleService service, CancellationToken ct) =>
            {
                var created = await service.CreateAsync(request, ct);
                return Results.Created($"/api/transportation{root}/{created.Id}", created);
            })
            .RequirePermission(Permissions.TransportCreate)
            .Audited("schedule.created", "TRANSPORT_SCHEDULE")
            .WithSummary("Create a recurring transport schedule (WH-09)");

        endpoints.MapGet(root, async (Guid? warehouseId, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(new { items = await service.ListAsync(warehouseId, ct) }))
            .RequirePermission(Permissions.TransportRead);

        endpoints.MapGet($"{root}/{{id:guid}}", async (Guid id, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(await service.GetAsync(id, ct)))
            .RequirePermission(Permissions.TransportRead);

        endpoints.MapPost($"{root}/{{id:guid}}/pause", async (Guid id, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(await service.PauseAsync(id, ct)))
            .RequirePermission(Permissions.TransportCreate)
            .Audited("schedule.paused", "TRANSPORT_SCHEDULE", "id");

        endpoints.MapPost($"{root}/{{id:guid}}/resume", async (Guid id, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(await service.ResumeAsync(id, ct)))
            .RequirePermission(Permissions.TransportCreate)
            .Audited("schedule.resumed", "TRANSPORT_SCHEDULE", "id");

        endpoints.MapPost($"{root}/{{id:guid}}/cancel", async (Guid id, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(await service.CancelAsync(id, ct)))
            .RequirePermission(Permissions.TransportCreate)
            .Audited("schedule.cancelled", "TRANSPORT_SCHEDULE", "id");

        endpoints.MapPost($"{root}/waves/{{id:guid}}/cancel", async (Guid id, TransportScheduleService service, CancellationToken ct) =>
                Results.Ok(await service.CancelWaveAsync(id, ct)))
            .RequirePermission(Permissions.TransportCreate)
            .Audited("schedule.wave_cancelled", "TRANSPORT_WAVE", "id");
    }
}
