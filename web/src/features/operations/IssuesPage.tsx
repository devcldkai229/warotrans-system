import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { SectionHead } from '@/features/management/SectionHead'
import { ApiError } from '@/shared/api/client'
import {
  assignIssue,
  getIssue,
  listIssues,
  transitionIssue,
  type Issue,
  type IssueSeverity,
  type IssueStatus,
} from '@/shared/api/operations'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { t } from '@/shared/i18n'
const STATUS_TONE: Record<IssueStatus, Tone> = {

  OPEN: 'red',
  ACKNOWLEDGED: 'amber',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  CLOSED: 'grey',
}

const SEVERITY_TONE: Record<IssueSeverity, Tone> = { LOW: 'grey', MEDIUM: 'blue', HIGH: 'amber', CRITICAL: 'red' }
const STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'issue_version_conflict') return t('Someone else changed this issue. It has been reloaded; try again.')
    return error.message
  }
  return t('The issue could not be updated.')
}

/** OPS-01: issues reported from the floor and by workflow steps, with their lifecycle. */
export function IssuesPage() {
  const { issueId } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<IssueStatus | ''>('')
  const list = useQuery({
    queryKey: ['issues', status],
    queryFn: () => listIssues({ status }),
    refetchInterval: 30_000,
  })

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_420px] gap-8 px-10 pt-8 pb-16">
        <section className="min-w-0">
          <SectionHead title={t('Issues')} hint={t('Problems reported by Staff, Technicians and workflow steps.')}>
            <select
              className={controlClass('pill')}
              aria-label={t('Filter by status')}
              value={status}
              onChange={(event) => setStatus(event.target.value as IssueStatus | '')}
            >
              <option value="">{t('All statuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </SectionHead>
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Type')}</Th>
                <Th>{t('Severity')}</Th>
                <Th>{t('Description')}</Th>
                <Th>{t('Reported')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((issue) => (
                <Tr key={issue.id} className={issue.id === issueId ? 'bg-container-high' : 'cursor-pointer'}>
                  <Td tone="strong">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => navigate(`/operations/issues/${issue.id}`)}>
                      {issue.code}
                    </button>
                  </Td>
                  <Td>{issue.issueType}</Td>
                  <Td>
                    <StatusBadge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</StatusBadge>
                  </Td>
                  <Td className="max-w-[360px] truncate">{issue.description}</Td>
                  <Td tone="faint" className="tabular-nums">
                    {formatIsoDateTime(issue.reportedAt)}
                  </Td>
                  <Td>
                    <StatusBadge tone={STATUS_TONE[issue.status]} withDot>
                      {issue.status}
                    </StatusBadge>
                  </Td>
                </Tr>
              ))}
              {list.data?.items.length === 0 ? <EmptyRow colSpan={6}>{t('No issues.')}</EmptyRow> : null}
              {list.isLoading ? <EmptyRow colSpan={6}>{t('Loading issues…')}</EmptyRow> : null}
              {list.isError ? <EmptyRow colSpan={6}>{t('Could not load issues.')}</EmptyRow> : null}
            </tbody>
          </Table>
        </section>
        <aside className="sticky top-4 self-start">{issueId ? <IssueDetail id={issueId} /> : null}</aside>
      </div>
    </div>
  )
}

function IssueDetail({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const { account, can } = useAuth()
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)
  const issue = useQuery({ queryKey: ['issue', id], queryFn: () => getIssue(id) })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['issues'] })
    void queryClient.invalidateQueries({ queryKey: ['issue', id] })
  }
  const change = useMutation({
    mutationFn: (action: (current: Issue) => Promise<Issue>) => action(issue.data!),
    onSuccess: () => {
      setError(null)
      setResolution('')
      refresh()
    },
    onError: (failure) => {
      setError(describe(failure))
      refresh()
    },
  })

  if (issue.isLoading) return <p className="text-sm text-muted">{t('Loading…')}</p>
  if (!issue.data) return <p className="text-sm text-muted">{t('This issue is not available to you.')}</p>
  const current = issue.data
  const mayManage = can(PERMISSIONS.issueManage)

  return (
    <div className="rounded-md bg-surface p-5 shadow-float">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-book">{current.code}</h2>
        <StatusBadge tone={STATUS_TONE[current.status]} withDot>
          {current.status}
        </StatusBadge>
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap">{current.description}</p>
      <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted">{t('Type')}</dt>
        <dd>{current.issueType}</dd>
        <dt className="text-muted">{t('Severity')}</dt>
        <dd>{current.severity}</dd>
        <dt className="text-muted">{t('Reported')}</dt>
        <dd>{formatIsoDateTime(current.reportedAt)}</dd>
        <dt className="text-muted">{t('Assignee')}</dt>
        <dd>{current.assigneeId ? (current.assigneeId === account?.id ? t('You') : current.assigneeId.slice(0, 8)) : t('Nobody')}</dd>
        {current.jobId ? (
          <>
            <dt className="text-muted">{t('Job')}</dt>
            <dd>
              <a className="underline" href={`/monitor/jobs/${current.jobId}`}>{t('open job')}</a>
            </dd>
          </>
        ) : null}
        {current.resolution ? (
          <>
            <dt className="text-muted">{t('Resolution')}</dt>
            <dd>{current.resolution}</dd>
          </>
        ) : null}
      </dl>

      {current.evidence.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {current.evidence.map((e, index) => (
            <li key={index} className="rounded-sm bg-container px-3 py-2">
              <span className="text-xs text-muted">{e.kind}</span>{' '}
              {e.uri ? (
                <a className="underline" href={e.uri} target="_blank" rel="noreferrer">
                  {e.note ?? e.uri}
                </a>
              ) : (
                e.note
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {mayManage && current.allowedTransitions.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2">
          {current.assigneeId !== account?.id && current.status !== 'CLOSED' ? (
            <Button size="sm" variant="surface" disabled={change.isPending} onClick={() => change.mutate((i) => assignIssue(i, account?.id ?? null))}>{t('Assign to me')}</Button>
          ) : null}
          {current.allowedTransitions.includes('RESOLVED') ? (
            <textarea
              className={controlClass('md')}
              rows={2}
              placeholder={t('Resolution (required to resolve)')}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {current.allowedTransitions.map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === 'RESOLVED' ? 'primary' : 'surface'}
                disabled={change.isPending || (next === 'RESOLVED' && resolution.trim() === '')}
                onClick={() => change.mutate((i) => transitionIssue(i, next, next === 'RESOLVED' ? resolution.trim() : undefined))}
              >
                {next === 'IN_PROGRESS' && current.status === 'RESOLVED' ? t('Reopen') : next.replace('_', ' ').toLowerCase()}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </div>
  )
}
