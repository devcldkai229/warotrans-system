import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import type { Robot } from '@/shared/api/contracts'
import { setRobotCapacity } from '@/shared/api/fleet'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { Button } from '@/shared/ui/Button'

const toText = (value: number | null | undefined) => (value == null ? '' : String(value))
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value))

/** FL-03: enter what was measured. An empty field means not known; dispatch records that it could not check. */
export function RobotCapacityCard({ robot }: { robot: Robot }) {
  const { capabilities } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState(toText(robot.maxPayloadKg))
  const [containers, setContainers] = useState(toText(robot.maxContainers))
  const [length, setLength] = useState(toText(robot.lengthM))
  const [width, setWidth] = useState(toText(robot.widthM))
  const save = useMutation({
    mutationFn: () =>
      setRobotCapacity(robot.id, {
        maxPayloadKg: toNumber(payload),
        maxContainers: toNumber(containers),
        lengthM: toNumber(length),
        widthM: toNumber(width),
      }),
    onSuccess: () => {
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['robot', robot.id] })
    },
  })

  if (!canActOnRobot(capabilities, PERMISSIONS.robotConfigure, robot.id)) return null
  if (!open) {
    return (
      <div className="mb-4 flex items-center gap-3 text-sm text-ink-2">
        <span>
          Carries {robot.maxPayloadKg ?? '?'} kg, {robot.maxContainers ?? '?'} containers. Size {robot.lengthM ?? '?'} × {robot.widthM ?? '?'} m.
        </span>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Edit
        </Button>
      </div>
    )
  }

  const input = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-col gap-1">
      {label}
      <input className="w-28 rounded-md border border-outline-soft bg-surface p-2" type="number" min={0} step="any" value={value} onChange={(e) => set(e.target.value)} />
    </label>
  )

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-md border border-outline-soft p-4 text-sm">
      <div className="flex flex-wrap gap-3">
        {input('Max load (kg)', payload, setPayload)}
        {input('Max containers', containers, setContainers)}
        {input('Length (m)', length, setLength)}
        {input('Width (m)', width, setWidth)}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {save.error ? <p className="text-xs text-red-ink">{save.error instanceof ApiError ? save.error.message : 'It could not be saved.'}</p> : null}
    </section>
  )
}
