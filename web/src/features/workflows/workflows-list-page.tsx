import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import type { WorkflowListItem, WorkflowStatus } from '@/shared/api/types'
import { listWorkflows } from '@/shared/api/workflows'
import { cx } from '@/shared/lib/cx'
import { formatDateTimeWithYear } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import './workflows.css'

const WORKFLOW_STATUS_TONE: Record<WorkflowStatus, Tone> = {
  DRAFT: 'amber',
  PUBLISHED: 'green',
}

function WorkflowCard({ workflow }: { workflow: WorkflowListItem }) {
  const navigate = useNavigate()
  const href = `/configure/workflows/${workflow.id}`
  const tone = WORKFLOW_STATUS_TONE[workflow.status]
  const tint =
    workflow.status === 'DRAFT'
      ? 'border-amber/40 bg-amber-soft/40'
      : 'border-green/40 bg-green-soft/40'

  return (
    <article
      className={cx(
        'group flex cursor-pointer flex-col overflow-hidden rounded-lg border shadow-float transition-shadow duration-200 hover:shadow-md',
        tint,
      )}
      onClick={() => navigate(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(href)
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs tracking-wide text-ink-2 uppercase">
              {workflow.code}
            </p>
            <h3 className="mt-1 truncate text-md font-book text-ink group-hover:text-ink">
              {workflow.name || workflow.code}
            </h3>
          </div>
          <StatusBadge tone={tone} withDot>
            {workflow.status}
          </StatusBadge>
        </div>

        {workflow.description ? (
          <p className="line-clamp-2 text-sm text-ink-2">{workflow.description}</p>
        ) : (
          <p className="text-sm text-muted">No description</p>
        )}

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-outline-soft pt-4 text-xs">
          <div>
            <dt className="text-muted">Version</dt>
            <dd className="mt-0.5 font-medium text-ink">v{workflow.versionNo}</dd>
          </div>
          <div>
            <dt className="text-muted">Created</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {formatDateTimeWithYear(workflow.createdAt)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">Published</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {formatDateTimeWithYear(workflow.publishedAt)}
            </dd>
          </div>
        </dl>
      </div>

      <div
        className="flex items-center justify-end gap-2 border-t border-outline-soft bg-surface/80 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button variant="surface" size="sm" onClick={() => navigate(href)}>
          {workflow.status === 'PUBLISHED' ? 'View' : 'Edit'}
        </Button>
        {workflow.status === 'DRAFT' ? (
          <Button variant="primary" size="sm" onClick={() => navigate(href)}>
            Open to publish
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export function WorkflowsListPage() {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(),
  })

  const items = data?.items ?? []
  const stats = useMemo(() => {
    const list = data?.items ?? []
    const draft = list.filter((w) => w.status === 'DRAFT').length
    const published = list.filter((w) => w.status === 'PUBLISHED').length
    return { total: list.length, draft, published }
  }, [data])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-book">Workflows</h1>
            <p className="mt-3 max-w-2xl text-base text-ink-2">
              Templates that define how warehouse operations run. Staff pick a published workflow when
              creating a TransportRequest; runtime values stay on Jobs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="surface" disabled={isFetching} onClick={() => refetch()}>
              <Icon name="refresh" size={15} /> Refresh
            </Button>
            <Button variant="primary" onClick={() => navigate('/configure/workflows/new')}>
              <Icon name="plus" size={15} /> New workflow
            </Button>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-outline-soft bg-surface px-5 py-4 shadow-float">
            <p className="text-xs text-muted">Total templates</p>
            <p className="mt-1 text-2xl font-book text-ink">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-amber/30 bg-amber-soft/40 px-5 py-4 shadow-float">
            <p className="text-xs text-amber-ink">Draft</p>
            <p className="mt-1 text-2xl font-book text-ink">{stats.draft}</p>
          </div>
          <div className="rounded-lg border border-green/30 bg-green-soft/40 px-5 py-4 shadow-float">
            <p className="text-xs text-green-ink">Published</p>
            <p className="mt-1 text-2xl font-book text-ink">{stats.published}</p>
          </div>
        </div>

        {isLoading && (
          <p className="mt-10 text-sm text-muted">Loading workflow templates…</p>
        )}

        {error && (
          <div className="mt-10 rounded-lg border border-red/30 bg-red-soft/50 px-5 py-4 text-sm text-red-ink">
            {(error as Error).message}
          </div>
        )}

        {data && items.length === 0 && (
          <div className="mt-10 flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-outline bg-container px-6 py-12 text-center">
            <Icon name="workflow" size={28} className="text-muted" />
            <h2 className="mt-4 text-xl font-book text-ink">No workflows yet</h2>
            <p className="mt-2 max-w-md text-sm text-ink-2">
              Create a draft template, bind step inputs from metadata, then publish when it is ready
              for TransportRequests.
            </p>
            <Button
              className="mt-6"
              variant="primary"
              onClick={() => navigate('/configure/workflows/new')}
            >
              <Icon name="plus" size={15} /> Create first workflow
            </Button>
          </div>
        )}

        {items.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-book">All templates</h2>
              <Link
                to="/configure/workflows/new"
                className="text-sm text-ink-2 transition-colors hover:text-ink"
              >
                + Add another
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
