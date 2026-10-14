import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { containerById, shortPlace } from './labels'
import type { ComposerData, TransportRequestDraft } from './types'

interface ReviewSummaryProps {
  data: ComposerData
  draft: TransportRequestDraft
  submitting: boolean
  onBack: () => void
  onCreate: () => void
}

export function ReviewSummary({ data, draft, submitting, onBack, onCreate }: ReviewSummaryProps) {
  const warehouse = data.warehouses.find((item) => item.id === draft.warehouseId)
  const map = data.maps.find((item) => item.id === draft.mapVersionId)
  const workflow = data.workflows.find((item) => item.id === draft.workflowId)
  const params = data.staffInputFields

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-outline/60 px-4 py-3">
        <h2 className="text-sm font-medium">Review request</h2>
        <p className="mt-0.5 text-[11px] text-muted">Confirm movement intent before create.</p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3 text-xs">
        <section>
          <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Workflow</p>
          <p className="mt-1 font-medium">
            {workflow?.code} v{workflow?.versionNo}
          </p>
          <StatusBadge tone="green" className="mt-1">
            PUBLISHED
          </StatusBadge>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Warehouse</p>
            <p className="mt-1">
              {warehouse?.code} · {warehouse?.name}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-muted uppercase">Map</p>
            <p className="mt-1">{map?.name}</p>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted uppercase">Movements</p>
          <ul className="space-y-2">
            {draft.movements.map((movement) => {
              const container = containerById(data, movement.containerId)
              const from = shortPlace(
                data,
                movement.sourceStorageLocationId,
                movement.sourceEndpointId,
                movement.sourceLevelNo,
              )
              const to = shortPlace(
                data,
                movement.destinationStorageLocationId,
                movement.destinationEndpointId,
                movement.destinationLevelNo,
              )
              return (
                <li key={movement.localId} className="rounded-md bg-surface px-3 py-2">
                  <p className="font-medium">
                    #{movement.sequenceNo}{' '}
                    <span className="font-mono">{container?.barcode ?? '—'}</span>
                  </p>
                  <p className="mt-1 text-muted">
                    {from} <span className="text-ink">→</span> {to}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted uppercase">
            Workflow parameters
          </p>
          {params.length === 0 ? (
            <p className="text-muted">No additional request parameters.</p>
          ) : (
            <dl className="space-y-1">
              {params.map((field) => (
                <div key={field.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{field.label}</dt>
                  <dd>{draft.workflowInputs[field.key] || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted uppercase">Note</p>
          <p className="text-ink-2">{draft.note?.trim() || '—'}</p>
        </section>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-outline/60 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button variant="primary" size="sm" className="ml-auto" onClick={onCreate} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create request'}
        </Button>
      </footer>
    </div>
  )
}
