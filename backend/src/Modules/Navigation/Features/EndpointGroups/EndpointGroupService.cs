using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.EndpointGroups;

public sealed record EndpointGroupMemberDto(Guid EndpointId, string Code, string Name);

public sealed record EndpointGroupDto(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    string SelectionPolicy,
    bool IsActive,
    IReadOnlyList<EndpointGroupMemberDto> Members);

public sealed record CreateEndpointGroupRequest(string? Code, string? Name, EndpointSelectionPolicy? SelectionPolicy, List<Guid>? EndpointIds);

public sealed record UpdateEndpointGroupRequest(string? Name, EndpointSelectionPolicy? SelectionPolicy, bool? IsActive, List<Guid>? EndpointIds);

/// <summary>
/// NV-01: named sets of endpoints of one map version (e.g. "all parking spots"), with a selection policy. Like every
/// other part of a map they are edited only while the version is DRAFT; a published map is immutable.
/// </summary>
public sealed class EndpointGroupService(NavigationDbContext db)
{
    public async Task<IReadOnlyList<EndpointGroupDto>> ListAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        await RequireMapAsync(mapVersionId, draft: false, cancellationToken);
        var groups = await db.EndpointGroups.AsNoTracking()
            .Where(g => g.MapVersionId == mapVersionId)
            .OrderBy(g => g.Code)
            .ToListAsync(cancellationToken);
        return await ToDtosAsync(groups, cancellationToken);
    }

    public async Task<EndpointGroupDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var group = await db.EndpointGroups.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new NotFoundException($"EndpointGroup '{id}' was not found.", "endpoint_group_not_found");
        return (await ToDtosAsync([group], cancellationToken))[0];
    }

    public async Task<EndpointGroupDto> CreateAsync(Guid mapVersionId, CreateEndpointGroupRequest request, CancellationToken cancellationToken)
    {
        await RequireMapAsync(mapVersionId, draft: true, cancellationToken);
        var code = request.Code?.Trim().ToUpperInvariant();
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(code) || code.Length > 100)
        {
            throw new DomainValidationException("Code is required (at most 100 characters).", "endpoint_group_code_required");
        }

        if (string.IsNullOrEmpty(name) || name.Length > 255)
        {
            throw new DomainValidationException("Name is required (at most 255 characters).", "endpoint_group_name_required");
        }

        if (await db.EndpointGroups.AnyAsync(g => g.MapVersionId == mapVersionId && g.Code == code, cancellationToken))
        {
            throw new ConflictException($"An endpoint group '{code}' already exists on this map.", "endpoint_group_code_taken");
        }

        var members = await ValidateMembersAsync(mapVersionId, request.EndpointIds, cancellationToken);
        var group = new EndpointGroup
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = code,
            Name = name,
            SelectionPolicy = request.SelectionPolicy ?? EndpointSelectionPolicy.FIRST_AVAILABLE,
            IsActive = true
        };
        db.EndpointGroups.Add(group);
        db.EndpointGroupMembers.AddRange(members.Select(e => new EndpointGroupMember { EndpointGroupId = group.Id, EndpointId = e }));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(group.Id, cancellationToken);
    }

    public async Task<EndpointGroupDto> UpdateAsync(Guid id, UpdateEndpointGroupRequest request, CancellationToken cancellationToken)
    {
        var group = await db.EndpointGroups.FirstOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new NotFoundException($"EndpointGroup '{id}' was not found.", "endpoint_group_not_found");
        await RequireMapAsync(group.MapVersionId, draft: true, cancellationToken);

        if (request.Name is { } newName)
        {
            newName = newName.Trim();
            if (newName.Length is 0 or > 255)
            {
                throw new DomainValidationException("Name is required (at most 255 characters).", "endpoint_group_name_required");
            }

            group.Name = newName;
        }

        if (request.SelectionPolicy is { } policy)
        {
            group.SelectionPolicy = policy;
        }

        if (request.IsActive is { } active)
        {
            group.IsActive = active;
        }

        if (request.EndpointIds is not null)
        {
            var members = await ValidateMembersAsync(group.MapVersionId, request.EndpointIds, cancellationToken);
            db.EndpointGroupMembers.RemoveRange(await db.EndpointGroupMembers.Where(m => m.EndpointGroupId == id).ToListAsync(cancellationToken));
            db.EndpointGroupMembers.AddRange(members.Select(e => new EndpointGroupMember { EndpointGroupId = id, EndpointId = e }));
        }

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    /// <summary>No workflow references a group yet (they bind endpoints); when one does, refuse here (endpoint_group_in_use).</summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var group = await db.EndpointGroups.FirstOrDefaultAsync(g => g.Id == id, cancellationToken)
            ?? throw new NotFoundException($"EndpointGroup '{id}' was not found.", "endpoint_group_not_found");
        await RequireMapAsync(group.MapVersionId, draft: true, cancellationToken);
        db.EndpointGroupMembers.RemoveRange(await db.EndpointGroupMembers.Where(m => m.EndpointGroupId == id).ToListAsync(cancellationToken));
        db.EndpointGroups.Remove(group);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task RequireMapAsync(Guid mapVersionId, bool draft, CancellationToken cancellationToken)
    {
        var map = await db.MapVersions.AsNoTracking().FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion '{mapVersionId}' was not found.", "map_version_not_found");
        if (draft && map.Status != MapStatus.DRAFT)
        {
            throw new ConflictException(
                $"Endpoint groups can only be changed on a DRAFT map version (current status: {map.Status}).",
                "map_version_not_draft");
        }
    }

    private async Task<List<Guid>> ValidateMembersAsync(Guid mapVersionId, List<Guid>? endpointIds, CancellationToken cancellationToken)
    {
        var ids = (endpointIds ?? []).Distinct().ToList();
        if (ids.Count == 0)
        {
            throw new DomainValidationException("A group needs at least one endpoint.", "endpoint_group_empty");
        }

        var onMap = await db.Endpoints.AsNoTracking()
            .Where(e => ids.Contains(e.Id) && e.MapVersionId == mapVersionId)
            .Select(e => e.Id)
            .ToListAsync(cancellationToken);
        var foreign = ids.Except(onMap).ToList();
        if (foreign.Count > 0)
        {
            throw new DomainValidationException(
                $"Endpoint(s) {string.Join(", ", foreign)} are not on this map version.",
                "endpoint_not_in_map");
        }

        return ids;
    }

    private async Task<IReadOnlyList<EndpointGroupDto>> ToDtosAsync(IReadOnlyList<EndpointGroup> groups, CancellationToken cancellationToken)
    {
        var groupIds = groups.Select(g => g.Id).ToList();
        var members = await (
                from m in db.EndpointGroupMembers.AsNoTracking()
                join e in db.Endpoints.AsNoTracking() on m.EndpointId equals e.Id
                where groupIds.Contains(m.EndpointGroupId)
                select new { m.EndpointGroupId, e.Id, e.Code, e.Name })
            .ToListAsync(cancellationToken);
        var byGroup = members.ToLookup(m => m.EndpointGroupId);
        return groups.Select(g => new EndpointGroupDto(
                g.Id, g.MapVersionId, g.Code, g.Name, g.SelectionPolicy.ToString(), g.IsActive,
                byGroup[g.Id].OrderBy(m => m.Code).Select(m => new EndpointGroupMemberDto(m.Id, m.Code, m.Name)).ToList()))
            .ToList();
    }
}
