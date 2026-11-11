import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import {
  assignRecoveryRobot,
  confirmRecoveryTransfer,
  getDispatchCandidates,
  getJobRecovery,
  resumeRecoveryOnSameRobot,
  unassignRecoveryRobot,
  type JobDetailDto,
} from '@/shared/api/jobs'
import { Button } from '@/shared/ui/Button'

/**
 * WFX-04: a robot failed with cargo on board. Either it goes on once it is back, or a second robot comes to a safe
 * endpoint and a person confirms the cargo really moved. The Job stays the same Job; the server enforces the order.
 */
export function JobRecoveryPanel({
  job,
  endpoints,
  containerLabel,
}: {
  job: JobDetailDto
  endpoints: { id: string; code: string; name?: string | null }[]
  containerLabel: (id: string) => string
}) {
  const queryClient = useQueryClient()
  const [robotId, setRobotId] = useState('')
  const [endpointId, setEndpointId] = useState('')
  const [note, setNote] = useState('')
  const [seen, setSeen] = useState(false)
  const inRecovery = job.status === 'RECOVERY_REQUIRED'
  const recovery = useQuery({
    queryKey: ['job', job.id, 'recovery'],
    queryFn: () => getJobRecovery(job.id),
    enabled: inRecovery,
    refetchInterval: inRecovery ? 3_000 : false,
  })
  const candidates = useQuery({
    queryKey: ['job', job.id, 'recovery-candidates'],
    queryFn: () => getDispatchCandidates(job.id),
    enabled: inRecovery,
  })
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
  })

  if (!inRecovery) return null
  const current = recovery.data?.recovery ?? null
  const eligible = (candidates.data ?? []).filter((c) => c.eligible && c.robotId !== current?.fromRobotId)

  return (
    <section className="mt-4 rounded-lg border border-red-ink/40 bg-surface p-6 shadow-float">
      <h2 className="text-xl font-book">Payload recovery</h2>
      <p className="mt-1 text-sm text-ink-2">
        The robot failed ({current?.reason ?? job.failureCode}) with these containers on board:{' '}
        <b className="font-medium">{(current?.containerIds ?? []).map(containerLabel).join(', ') || '…'}</b>. Its traffic zones stay held. If the second robot waits behind them, move the failed robot by hand and release its zones on the robot page.
      </p>

      {current?.status === 'OPEN' ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Second robot
            <select className="rounded-md border border-outline-soft bg-surface p-2" value={robotId} onChange={(e) => setRobotId(e.target.value)}>
              <option value="">Choose…</option>
              {eligible.map((c) => (
                <option key={c.robotId} value={c.robotId}>
                  {c.robotCode}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Safe endpoint
            <select className="rounded-md border border-outline-soft bg-surface p-2" value={endpointId} onChange={(e) => setEndpointId(e.target.value)}>
              <option value="">Choose…</option>
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.code}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" disabled={!robotId || !endpointId || act.isPending} onClick={() => act.mutate(() => assignRecoveryRobot(job.id, robotId, endpointId))}>
            Send robot
          </Button>
          <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate(() => resumeRecoveryOnSameRobot(job.id))}>
            Same robot is back: go on
          </Button>
        </div>
      ) : null}

      {current?.status === 'TARGET_ASSIGNED' ? (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <p>{current.robotArrived ? 'The second robot has arrived. Move the containers across, then confirm here.' : 'The second robot is on its way.'}</p>
          {current.robotArrived ? (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} />
                I saw these containers placed on the second robot.
              </label>
              <textarea
                className="rounded-md border border-outline-soft bg-surface p-2"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!current.robotArrived || !seen || act.isPending}
              onClick={() => act.mutate(() => confirmRecoveryTransfer(job.id, current.containerIds, note))}
            >
              Confirm transfer
            </Button>
            <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate(() => unassignRecoveryRobot(job.id))}>
              Call the robot back
            </Button>
          </div>
        </div>
      ) : null}

      {act.error ? <p className="mt-2 text-xs text-red-ink">{act.error instanceof ApiError ? act.error.message : 'That did not work.'}</p> : null}
    </section>
  )
}
