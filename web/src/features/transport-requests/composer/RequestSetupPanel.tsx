import { Button, IconButton } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { controlClass } from '@/shared/ui/controlClass'
import { mapsForWarehouse } from './useTransportRequestComposerData'
import type { ComposerData, TransportRequestDraft } from './types'

interface RequestSetupPanelProps {
  data: ComposerData
  draft: TransportRequestDraft
  onChange: (next: TransportRequestDraft) => void
  onBackToList: () => void
  onClose: () => void
}

function staffInputControl(
  dataType: string,
  value: string,
  onValue: (next: string) => void,
) {
  const upper = dataType.toUpperCase()
  if (upper === 'BOOLEAN') {
    return (
      <select className={controlClass('sm')} value={value} onChange={(event) => onValue(event.target.value)}>
        <option value="">Select…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  const inputType =
    upper === 'INTEGER' || upper === 'DECIMAL'
      ? 'number'
      : upper === 'DATETIME'
        ? 'datetime-local'
        : 'text'

  return (
    <input
      className={controlClass('sm')}
      type={inputType}
      step={upper === 'DECIMAL' ? 'any' : undefined}
      value={value}
      onChange={(event) => onValue(event.target.value)}
    />
  )
}

export function RequestSetupPanel({
  data,
  draft,
  onChange,
  onBackToList,
  onClose,
}: RequestSetupPanelProps) {
  const maps = mapsForWarehouse(data, draft.warehouseId)
  const workflow = data.workflows.find((item) => item.id === draft.workflowId)
  const params = data.staffInputFields

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container animate-panel-in">
      <header className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
        <IconButton className="size-8" aria-label="Back to transport requests" onClick={onBackToList}>
          <Icon name="arrowLeft" size={15} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">New transport request</p>
          <p className="truncate text-[11px] text-muted">Request setup</p>
        </div>
        <IconButton className="size-8" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={15} />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-2 pb-4">
        {data.error ? (
          <p className="rounded-md bg-red-soft/50 px-3 py-2 text-[11px] text-red-ink">{data.error}</p>
        ) : null}
        {data.isLoading ? <p className="text-[11px] text-muted">Loading reference data…</p> : null}

        <Field label="Warehouse *">
          <select
            className={controlClass('sm')}
            value={draft.warehouseId}
            onChange={(event) => {
              const warehouseId = event.target.value
              const nextMaps = mapsForWarehouse(data, warehouseId)
              onChange({
                ...draft,
                warehouseId,
                mapVersionId: nextMaps[0]?.id ?? '',
              })
            }}
          >
            <option value="">Select warehouse…</option>
            {data.warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Map *" hint="Published maps for the selected warehouse">
          <select
            className={controlClass('sm')}
            value={draft.mapVersionId}
            disabled={!draft.warehouseId}
            onChange={(event) => onChange({ ...draft, mapVersionId: event.target.value })}
          >
            <option value="">Select map…</option>
            {maps.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · Published
              </option>
            ))}
          </select>
        </Field>

        <section>
          <p className="mb-2 text-xs font-medium text-ink-2">Workflow *</p>
          {!workflow ? (
            <>
              <p className="mb-2 text-[11px] text-muted">Choose what you want to move</p>
              {data.workflows.length === 0 && !data.isLoading ? (
                <p className="rounded-md bg-surface px-3 py-2 text-[11px] text-muted">
                  No published workflows available.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.workflows.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-md bg-surface p-3 text-left transition-shadow hover:shadow-float"
                      onClick={() => onChange({ ...draft, workflowId: item.id, workflowInputs: {} })}
                    >
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-[11px] text-muted">{item.cardSummary}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md bg-surface p-3 ring-2 ring-blue/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{workflow.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {workflow.code} · v{workflow.versionNo}
                  </p>
                </div>
                <StatusBadge tone="green">PUBLISHED</StatusBadge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => onChange({ ...draft, workflowId: '', workflowInputs: {} })}
              >
                Change workflow
              </Button>
            </div>
          )}
        </section>

        {workflow ? (
          <section>
            <p className="mb-2 text-xs font-medium text-ink-2">Workflow parameters</p>
            {params.length === 0 ? (
              <p className="rounded-md bg-surface px-3 py-2 text-[11px] text-muted">
                No additional request parameters.
              </p>
            ) : (
              <div className="space-y-3">
                {params.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label + (field.required ? ' *' : '')}
                    hint={field.description ?? undefined}
                  >
                    {staffInputControl(field.dataType, draft.workflowInputs[field.key] ?? '', (value) =>
                      onChange({
                        ...draft,
                        workflowInputs: { ...draft.workflowInputs, [field.key]: value },
                      }),
                    )}
                  </Field>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-3 border-t border-outline/50 pt-3">
          <Field label="Requested by">
            <input className={controlClass('sm')} value={data.requestedByName} disabled readOnly />
          </Field>
          <Field label="Note" hint="Optional">
            <textarea
              className={controlClass('area')}
              value={draft.note ?? ''}
              onChange={(event) => onChange({ ...draft, note: event.target.value || null })}
              placeholder="Optional note"
            />
          </Field>
          <p className="text-[11px] text-muted">
            Initial state: <span className="font-medium text-ink-2">SUBMITTED</span> (set after create)
          </p>
        </section>
      </div>
    </aside>
  )
}
