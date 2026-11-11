import { useState } from 'react'
import { ApiError } from '@/shared/api/client'
import type { StorageLocationView } from '@/shared/api/contracts'
import { recoverContainer } from '@/shared/api/warehouses'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'

interface RecoverContainerDialogProps {
  container: { id: string; barcode: string }
  locations: StorageLocationView[]
  onClose: () => void
  onRecovered: () => void
}

/** WH-01: says which shelf a Container that lost its place after a failed or cancelled Job is really on. */
export function RecoverContainerDialog({ container, locations, onClose, onRecovered }: RecoverContainerDialogProps) {
  const active = locations.filter((location) => location.isActive)
  const [locationId, setLocationId] = useState(active[0]?.id ?? '')
  const [level, setLevel] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!locationId) {
      setError('Choose the shelf the container is on.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await recoverContainer(container.id, {
        storageLocationId: locationId,
        levelNo: Number(level) || 1,
        note: note.trim() || undefined,
      })
      onRecovered()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The container could not be recovered.')
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Recover ${container.barcode}`} submitLabel="Put on shelf" busy={busy} onClose={onClose} onSubmit={() => void submit()}>
      <Field label="Shelf it is on now">
        <select className={controlClass()} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {active.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Level">
        <input
          className={controlClass()}
          type="number"
          min={1}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        />
      </Field>
      <Field label="Note">
        <input className={controlClass()} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}
