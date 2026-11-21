import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import {
  createEndpointGroup,
  deleteEndpointGroup,
  listEndpointGroups,
  updateEndpointGroup,
  type EndpointGroup,
} from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'

interface GroupEndpoint {
  id: string
  code: string
  name: string
  endpointType: string
}

interface Draft {
  id: string | null
  code: string
  name: string
  selectionPolicy: EndpointGroup['selectionPolicy']
  isActive: boolean
  endpointIds: string[]
}

const emptyDraft = (): Draft => ({ id: null, code: '', name: '', selectionPolicy: 'NEAREST', isActive: true, endpointIds: [] })

/**
 * EndpointGroups of one map version: a named list of Endpoints (e.g. PARKING = Parking A + Parking B). A workflow variable
 * of type WAYPOINT_GROUP names a group, and a MOVE to it drives to a free member (NEAREST or FIRST_AVAILABLE by code).
 * Groups are edited on a DRAFT map and published with it; "Clone & edit" copies them.
 */
export function EndpointGroupsPanel({
  mapVersionId,
  isDraft,
  endpoints,
}: {
  mapVersionId: string
  isDraft: boolean
  endpoints: GroupEndpoint[]
}) {
  const queryClient = useQueryClient()
  const queryKey = ['navigation', 'endpoint-groups', mapVersionId]
  const groupsQuery = useQuery({ queryKey, queryFn: () => listEndpointGroups(mapVersionId) })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sortedEndpoints = useMemo(() => [...endpoints].sort((a, b) => a.code.localeCompare(b.code)), [endpoints])

  const done = async () => {
    setDraft(null)
    setError(null)
    await queryClient.invalidateQueries({ queryKey })
    await queryClient.invalidateQueries({ queryKey: ['workflows', 'published-map-endpoint-groups'] })
  }
  const fail = (e: unknown) => setError(e instanceof ApiError || e instanceof Error ? e.message : String(e))

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? updateEndpointGroup(d.id, { name: d.name.trim(), selectionPolicy: d.selectionPolicy, isActive: d.isActive, endpointIds: d.endpointIds })
        : createEndpointGroup(mapVersionId, { code: d.code.trim(), name: d.name.trim(), selectionPolicy: d.selectionPolicy, endpointIds: d.endpointIds }),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteEndpointGroup, onSuccess: done, onError: fail })

  const groups = groupsQuery.data ?? []
  const canSave = draft !== null && draft.code.trim() !== '' && draft.name.trim() !== '' && draft.endpointIds.length > 0

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted">
        {t('A workflow variable of type WAYPOINT_GROUP sends the robot to a free point of the group.')}
        {isDraft ? null : ` ${t('Groups are edited on a DRAFT map: use Clone & edit.')}`}
      </p>

      {groupsQuery.isLoading ? <p className="text-muted">{t('Loading…')}</p> : null}
      {!groupsQuery.isLoading && groups.length === 0 ? <p className="text-muted">{t('No endpoint groups on this map yet.')}</p> : null}

      {groups.map((g) => (
        <div key={g.id} className="rounded-md border border-outline-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {g.code} · {g.name}
            </span>
            <span className="text-xs text-muted">
              {g.selectionPolicy}
              {g.isActive ? '' : ` · ${t('inactive')}`}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-2">{g.members.map((m) => m.code).join(', ') || '—'}</p>
          {isDraft ? (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    id: g.id,
                    code: g.code,
                    name: g.name,
                    selectionPolicy: g.selectionPolicy,
                    isActive: g.isActive,
                    endpointIds: g.members.map((m) => m.endpointId),
                  })
                }
              >
                {t('Edit')}
              </Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(g.id)}>
                {t('Delete')}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {isDraft && draft === null ? (
        <Button variant="outline" onClick={() => setDraft(emptyDraft())}>
          {t('New endpoint group')}
        </Button>
      ) : null}

      {draft ? (
        <div className="flex flex-col gap-2 rounded-md border border-outline-soft p-3">
          <label className="flex flex-col gap-1 text-xs">
            {t('Code')}
            <input
              className={controlClass()}
              value={draft.code}
              disabled={draft.id !== null}
              placeholder="PARKING"
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('Name')}
            <input className={controlClass()} value={draft.name} placeholder={t('Parking places')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('Selection policy')}
            <select
              className={controlClass()}
              value={draft.selectionPolicy}
              onChange={(e) => setDraft({ ...draft, selectionPolicy: e.target.value as Draft['selectionPolicy'] })}
            >
              <option value="NEAREST">{t('NEAREST: the free point closest to the robot')}</option>
              <option value="FIRST_AVAILABLE">{t('FIRST_AVAILABLE: the first free point by code')}</option>
            </select>
          </label>
          {draft.id ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              {t('Active')}
            </label>
          ) : null}
          <span className="text-xs">{t('Points in the group')}</span>
          <div className="flex max-h-56 flex-col gap-1 overflow-auto rounded-md bg-container p-2">
            {sortedEndpoints.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.endpointIds.includes(e.id)}
                  onChange={(ev) =>
                    setDraft({
                      ...draft,
                      endpointIds: ev.target.checked ? [...draft.endpointIds, e.id] : draft.endpointIds.filter((id) => id !== e.id),
                    })
                  }
                />
                {e.code} · {e.name} · {e.endpointType}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? t('Saving…') : t('Save group')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(null); setError(null) }}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red">{error}</p> : null}
    </div>
  )
}
