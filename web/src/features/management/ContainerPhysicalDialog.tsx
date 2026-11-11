import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { getContainerPhysical, setContainerPhysical } from '@/shared/api/warehouses'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'

const toNumber = (value: string) => (value.trim() === '' ? null : Number(value))

/** FL-03: the measured weight and size of a Container. An empty field means not measured. */
export function ContainerPhysicalDialog({ container, onClose }: { container: { id: string; barcode: string }; onClose: () => void }) {
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getContainerPhysical(container.id)
      .then((values) => {
        if (!live) return
        setWeight(values.weightKg == null ? '' : String(values.weightKg))
        setLength(values.lengthM == null ? '' : String(values.lengthM))
        setWidth(values.widthM == null ? '' : String(values.widthM))
      })
      .catch(() => {
        if (live) setError('The current values could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [container.id])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await setContainerPhysical(container.id, { weightKg: toNumber(weight), lengthM: toNumber(length), widthM: toNumber(width) })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'It could not be saved.')
      setBusy(false)
    }
  }

  const number = (value: string, set: (v: string) => void) => (
    <input className={controlClass()} type="number" min={0} step="any" value={value} onChange={(event) => set(event.target.value)} />
  )

  return (
    <Dialog title={`Weight and size of ${container.barcode}`} submitLabel="Save" busy={busy} onClose={onClose} onSubmit={() => void submit()}>
      <Field label="Weight (kg)">{number(weight, setWeight)}</Field>
      <Field label="Length (m)">{number(length, setLength)}</Field>
      <Field label="Width (m)">{number(width, setWidth)}</Field>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}
