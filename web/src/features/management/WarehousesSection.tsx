import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { createWarehouse, listWarehouses } from '@/shared/api/warehouses'
import { formatDateTime } from '@/shared/lib/format'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { AddButton, SectionHead, SectionNote } from './SectionHead'

interface WarehouseDraft {
  code: string
  name: string
  timezone: string
  address: string
  isActive: boolean
}

const emptyDraft = (): WarehouseDraft => ({
  code: '',
  name: '',
  timezone: 'Asia/Ho_Chi_Minh',
  address: '',
  isActive: true,
})

/** warehouse.warehouses — Facility maps, Fleet robots, and Transport Requests all scope to a warehouse. */
export function WarehousesSection() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<WarehouseDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses({ take: 100 }),
  })

  const items = warehousesQuery.data?.items ?? []

  const createMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: async () => {
      setDraft(null)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Create failed')
    },
  })

  function open() {
    setDraft(emptyDraft())
    setError(null)
  }

  function save() {
    if (!draft) return
    const code = draft.code.trim().toUpperCase()
    const name = draft.name.trim()
    if (!code || !name) {
      setError('Code and name are required.')
      return
    }
    createMutation.mutate({
      code,
      name,
      timezone: draft.timezone.trim() || 'Asia/Ho_Chi_Minh',
      address: draft.address.trim() || null,
      isActive: draft.isActive,
    })
  }

  return (
    <>
      <SectionHead
        title="Warehouses"
        hint="Sites that own maps, robots, and transport requests. Create one before importing maps on Facility."
      >
        <AddButton onClick={open}>Add warehouse</AddButton>
      </SectionHead>

      {warehousesQuery.isLoading ? <p className="text-sm text-muted">Loading warehouses…</p> : null}
      {warehousesQuery.error ? (
        <p className="text-sm text-red-ink">
          {(warehousesQuery.error as Error).message || 'Failed to load warehouses.'}
        </p>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Timezone</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {!warehousesQuery.isLoading && items.length === 0 ? (
            <EmptyRow colSpan={5}>No warehouses yet. Create one to unlock Facility maps.</EmptyRow>
          ) : null}
          {items.map((warehouse) => (
            <Tr key={warehouse.id}>
              <Td className="font-mono text-xs" tone="strong">
                {warehouse.code}
              </Td>
              <Td>{warehouse.name}</Td>
              <Td tone="faint">{warehouse.timezone ?? '—'}</Td>
              <Td>
                <StatusBadge tone={warehouse.isActive ? 'green' : 'grey'} withDot>
                  {warehouse.isActive ? 'Active' : 'Inactive'}
                </StatusBadge>
              </Td>
              <Td className="tabular-nums">{formatDateTime(warehouse.createdAt)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <SectionNote>
        After creating an active warehouse, open{' '}
        <Link className="underline hover:text-ink" to="/configure/facility">
          Facility
        </Link>{' '}
        to import or create a map version.
      </SectionNote>

      {draft ? (
        <Dialog
          title="Add warehouse"
          submitLabel={createMutation.isPending ? 'Creating…' : 'Create warehouse'}
          onClose={() => {
            if (!createMutation.isPending) setDraft(null)
          }}
          onSubmit={save}
        >
          <FieldRow>
            <Field label="Code">
              <input
                className={controlClass()}
                value={draft.code}
                placeholder="WH01"
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </Field>
            <Field label="Name">
              <input
                className={controlClass()}
                value={draft.name}
                placeholder="Main warehouse"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Timezone">
              <input
                className={controlClass()}
                value={draft.timezone}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={controlClass()}
                value={draft.isActive ? 'active' : 'inactive'}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === 'active' })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </FieldRow>
          <Field label="Address (optional)">
            <input
              className={controlClass()}
              value={draft.address}
              placeholder="Optional street address"
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </Field>
          {error ? <FormError>{error}</FormError> : null}
        </Dialog>
      ) : null}
    </>
  )
}
