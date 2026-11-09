import { useEffect, useState } from 'react'
import type { Account } from '@/shared/api/contracts'
import { listRobots } from '@/shared/api/fleet'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { FormError } from '@/shared/ui/Field'
import { getRobotScope, setRobotScope } from './api'

interface RobotScopeDialogProps {
  account: Account
  onClose: () => void
}

interface RobotOption {
  id: string
  code: string
  name: string
}

/**
 * RB-01: which robots a Technician may diagnose, stop, drive and maintain. Deny by default: a Technician with no
 * robot ticked can act on none. Takes effect at their next sign-in or token refresh.
 */
export function RobotScopeDialog({ account, onClose }: RobotScopeDialogProps) {
  const [robots, setRobots] = useState<RobotOption[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listRobots({ take: 200 }), getRobotScope(account)])
      .then(([list, scope]) => {
        if (cancelled) return
        setRobots(list.items.map((r) => ({ id: r.id, code: r.code, name: r.name })))
        setSelected(new Set(scope.robotIds))
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load the robots.')
      })
    return () => {
      cancelled = true
    }
  }, [account])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await setRobotScope(account, [...selected])
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The robot scope could not be saved.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Assigned robots" subtitle={`Robots ${account.fullName} may act on.`} onClose={onClose}>
      <div className="max-h-80 overflow-auto px-6 py-4">
        {robots === null && !error ? <p className="text-sm text-muted">Loading robots…</p> : null}
        {robots?.length === 0 ? <p className="text-sm text-muted">No robot is registered yet.</p> : null}
        <ul className="flex flex-col gap-1">
          {robots?.map((robot) => (
            <li key={robot.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 hover:bg-container-high">
                <input type="checkbox" checked={selected.has(robot.id)} onChange={() => toggle(robot.id)} />
                <span className="font-medium">{robot.code}</span>
                <span className="text-sm text-muted">{robot.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {error ? (
          <div className="mt-3">
            <FormError>{error}</FormError>
          </div>
        ) : null}
      </div>
      <footer className="flex justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving || robots === null} onClick={save}>
          {saving ? 'Saving…' : `Save (${selected.size})`}
        </Button>
      </footer>
    </Modal>
  )
}
