import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHead } from '@/features/management/SectionHead'
import { listAuditLogs, type AuditLogEntry } from '@/shared/api/operations'
import { formatIsoDateTime } from '@/shared/lib/format'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'

const ENTITY_TYPES = ['', 'ACCOUNT', 'ROBOT', 'JOB', 'JOB_STEP', 'REQUEST', 'MAP', 'CONTAINER', 'ISSUE', 'WORKFLOW']

function changes(entry: AuditLogEntry): string {
  const keys = new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])
  return [...keys]
    .map((key) => {
      const before = entry.before?.[key]
      const after = entry.after?.[key]
      return before === undefined ? `${key}: ${JSON.stringify(after)}` : `${key}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
    })
    .join(' · ')
}

/** SY-05 / OPS-02: who did what, newest first. A Technician sees their robots and their own actions only. */
export function AuditLogPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const logs = useQuery({
    queryKey: ['audit-logs', action, entityType],
    queryFn: () => listAuditLogs({ action: action.trim() || undefined, entityType: entityType || undefined }),
  })

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <SectionHead title="Audit log" hint="Account, map, transport, job and robot actions with who did them and when.">
          <SearchInput className="w-64" placeholder="Action prefix, e.g. account." value={action} onChange={setAction} />
          <select
            className={controlClass('pill')}
            aria-label="Filter by entity"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type || 'All entities'}
              </option>
            ))}
          </select>
        </SectionHead>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Change</Th>
            </tr>
          </thead>
          <tbody>
            {logs.data?.items.map((entry) => (
              <Tr key={entry.id}>
                <Td tone="faint" className="whitespace-nowrap tabular-nums">
                  {formatIsoDateTime(entry.occurredAt)}
                </Td>
                <Td>
                  {entry.actorUsername ?? 'system'}
                  {entry.actorRole ? <span className="ml-1 text-xs text-muted">{entry.actorRole}</span> : null}
                </Td>
                <Td tone="strong">{entry.action}</Td>
                <Td>
                  {entry.entityType}
                  {entry.entityId ? <span className="ml-1 font-mono text-xs text-muted">{entry.entityId.slice(0, 8)}</span> : null}
                </Td>
                <Td className="max-w-[520px] text-xs">
                  <span className="block truncate" title={changes(entry)}>
                    {entry.reason ? `“${entry.reason}” ` : ''}
                    {changes(entry)}
                  </span>
                </Td>
              </Tr>
            ))}
            {logs.data?.items.length === 0 ? <EmptyRow colSpan={5}>Nothing recorded for this filter.</EmptyRow> : null}
            {logs.isLoading ? <EmptyRow colSpan={5}>Loading…</EmptyRow> : null}
            {logs.isError ? <EmptyRow colSpan={5}>Could not load the audit log.</EmptyRow> : null}
          </tbody>
        </Table>
        <p className="mt-4 text-xs text-muted">
          Showing the latest {logs.data?.items.length ?? 0} of {logs.data?.total ?? 0}. Passwords and tokens are never recorded.
        </p>
      </div>
    </div>
  )
}
