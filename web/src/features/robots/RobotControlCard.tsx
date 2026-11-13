import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import {
  completeMaintenance,
  getRobot,
  getRobotCommandCatalog,
  getStopState,
  resumeRobot,
  returnRobotToPark,
  sendRobotToCharger,
  robotSystemAction,
  startMaintenance,
  stopRobot,
  type StopStateName,
} from '@/shared/api/fleet'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { t } from '@/shared/i18n'
const STOP_COPY: Record<StopStateName, { label: string; tone: Tone }> = {

  NONE: { label: t('No stop requested'), tone: 'grey' },
  REQUESTED: { label: t('Stop requested, waiting for the robot'), tone: 'amber' },
  ACCEPTED: { label: t('Robot accepted, checking it is still'), tone: 'amber' },
  STOPPED_VERIFIED: { label: t('Stopped (verified by odometry)'), tone: 'green' },
  REJECTED: { label: t('Robot refused the stop'), tone: 'red' },
  UNKNOWN: { label: t('Unknown: no confirmation from the robot'), tone: 'red' },
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : t('The robot could not be reached.')
}

/**
 * Robot control (RB-03 stop / resume, RB-08 maintenance, RB-09 power). Every state shown here comes from the robot: a
 * stop is "stopped" only once the robot verified it, and once the robot stops reporting it is shown as last known.
 * Health (RB-10) is in the panel's Health section.
 */
export function RobotControlCard({ robotId, robotCode }: { robotId: string; robotCode: string }) {
  const queryClient = useQueryClient()
  const { capabilities } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [checklist, setChecklist] = useState({ sensorsOk: false, localizationOk: false, stopTestOk: false, trafficClear: false })

  const robot = useQuery({ queryKey: ['robot', robotId], queryFn: () => getRobot(robotId), refetchInterval: 5_000 })
  const stop = useQuery({
    queryKey: ['stop-state', robotId],
    queryFn: () => getStopState(robotId),
    refetchInterval: (q) => (q.state.data?.state === 'REQUESTED' || q.state.data?.state === 'ACCEPTED' ? 500 : 5_000),
  })
  const catalog = useQuery({
    queryKey: ['robot-command-catalog', robotId],
    queryFn: () => getRobotCommandCatalog(robotId),
    refetchInterval: 10_000,
  })
  // FLT-02: until the catalog has loaded nothing is hidden, so a stop is never missing because of a slow request.
  const offered = (code: string) => catalog.data?.items.find((item) => item.code === code)?.supported ?? true

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['robot', robotId] })
    void queryClient.invalidateQueries({ queryKey: ['stop-state', robotId] })
    void queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
  }
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (failure) => {
      setError(message(failure))
      refresh()
    },
  })

  const held = robot.data?.motionHeld ?? stop.data?.motionHeld ?? false
  const inMaintenance = robot.data?.status === 'MAINTENANCE'
  const mayStop = canActOnRobot(capabilities, PERMISSIONS.robotStop, robotId)
  const mayResume = canActOnRobot(capabilities, PERMISSIONS.robotConfigure, robotId)
  const mayMaintain = canActOnRobot(capabilities, PERMISSIONS.robotMaintenance, robotId)
  const mayPower = canActOnRobot(capabilities, PERMISSIONS.robotPower, robotId)
  // A robot that is not reporting can take no command (the server refuses them with robot_offline), and what it last
  // said about a stop is history, not the present. Maintenance is the exception: it is recorded, not sent.
  const offline = robot.data ? !robot.data.isOnline : false
  const lastStop = STOP_COPY[stop.data?.state ?? 'NONE']
  const stopCopy = offline && stop.data?.state && stop.data.state !== 'NONE'
    ? { label: t('Last known: {state}', { state: lastStop.label }), tone: 'grey' as Tone }
    : lastStop
  const offlineReason = offline ? t('The robot is offline.') : undefined
  const allChecked = Object.values(checklist).every(Boolean)
  const announced = robot.data?.capabilities ?? []

  return (
    <section className="mb-6 rounded-md bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('Control')}</h2>
        {held ? <StatusBadge tone="red">{t('Motion held')}</StatusBadge> : null}
      </div>

      <p className="mt-2 flex items-center gap-2 text-xs">
        <StatusBadge tone={stopCopy.tone} withDot>
          {stopCopy.label}
        </StatusBadge>
      </p>
      {offline ? (
        <p role="status" className="mt-2 rounded-sm bg-amber-soft px-3 py-2 text-xs text-amber-ink">
          {t('The robot is offline: no command can reach it. Use its physical E-stop if people are at risk.')}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">{t('A software stop is not an emergency stop: use the robot\'s physical E-stop when people are at risk.')}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {mayStop && offered('STOP') ? (
          <Button size="sm" variant="primary" disabled={act.isPending || offline} title={offlineReason} onClick={() => act.mutate(() => stopRobot(robotId, t('Stopped from the console')))}>{t('Stop')}</Button>
        ) : null}
        {mayResume && held && offered('RESUME') ? (
          <Button size="sm" variant="surface" disabled={act.isPending || offline} title={offlineReason} onClick={() => act.mutate(() => resumeRobot(robotId))}>{t('Resume')}</Button>
        ) : null}
        {canActOnRobot(capabilities, PERMISSIONS.robotCommand, robotId) && !held && !inMaintenance ? (
          <>
            <Button size="sm" variant="ghost" disabled={act.isPending || offline} title={offlineReason} onClick={() => act.mutate(() => returnRobotToPark(robotId))}>
              {t('Return to park')}
            </Button>
            <Button size="sm" variant="ghost" disabled={act.isPending || offline} title={offlineReason} onClick={() => act.mutate(() => sendRobotToCharger(robotId))}>
              {t('Go to charger')}
            </Button>
          </>
        ) : null}
        {mayMaintain && !inMaintenance ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => {
              const reason = window.prompt(t('Why does {robotCode} go into maintenance?', { robotCode }))
              if (reason) act.mutate(() => startMaintenance(robotId, reason))
            }}
          >{t('Start maintenance')}</Button>
        ) : null}
      </div>

      {inMaintenance ? (
        <div className="mt-4 rounded-sm bg-container p-3 text-sm">
          <p className="font-medium">{t('In maintenance')}</p>
          <p className="text-xs text-muted">{robot.data?.maintenanceReason}</p>
          {mayMaintain ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {(
                  [
                    ['sensorsOk', t('Sensors checked')],
                    ['localizationOk', t('Localization checked')],
                    ['stopTestOk', t('Stop test passed')],
                    ['trafficClear', t('Traffic area clear')],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checklist[key]}
                      onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                variant="primary"
                className="mt-2"
                disabled={!allChecked || act.isPending}
                onClick={() => act.mutate(() => completeMaintenance(robotId, checklist))}
              >{t('Return to service')}</Button>
            </>
          ) : null}
        </div>
      ) : null}

      {mayPower && announced.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">{t('Power:')}</span>
          {announced.map((action) => (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              disabled={!held || act.isPending || offline}
              title={offlineReason ?? (held ? undefined : t('Stop the robot first'))}
              onClick={() => {
                const typed = window.prompt(t('Type {robotCode} to confirm {action}.', { robotCode, action }))
                if (typed) act.mutate(() => robotSystemAction(robotId, action as 'RESTART_STACK' | 'REBOOT' | 'SHUTDOWN', typed))
              }}
            >
              {action.replace('_', ' ').toLowerCase()}
            </Button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-ink">{error}</p> : null}
      {/* Diagnostics are in the panel's Health section and on the Technical page, not repeated here. */}
    </section>
  )
}
