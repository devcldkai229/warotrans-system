import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RobotView } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import {
  autoLocalizeRobot,
  getAutoLocalize,
  localizeRobotAtPose,
  type AutoLocalizeStatus,
  type AutoLocalizeSuggestion,
} from '@/shared/api/fleet'
import { t } from '@/shared/i18n'
import { formatRelativeTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { autoLocalizeKey, autoLocalizeTone, scorePercent } from './robotMaps'

const STATE_LABEL: Record<AutoLocalizeStatus['state'], string> = {
  NONE: t('Not run yet'),
  RUNNING: t('Looking…'),
  SUCCEEDED: t('Localized'),
  FAILED: t('Not sure'),
  REJECTED: t('Refused'),
  TIMEOUT: t('No answer'),
}

const ERROR_TEXT: Record<string, string> = {
  LOCALIZATION_AMBIGUOUS: t('Another place fits the scan almost as well. Choose where the robot really stands.'),
  LOCALIZATION_NO_MATCH: t('The scan fits no endpoint well enough. Choose where the robot stands, or allow a turn on the spot.'),
  LOCALIZATION_NO_SCAN: t('The robot has no fresh lidar scan.'),
  LOCALIZATION_NO_MAP: t('The robot has not loaded its map.'),
  LOCALIZATION_NOT_CONVERGED: t('The localizer did not settle on the pose.'),
  LOCALIZATION_SPIN_FAILED: t('The turn on the spot did not finish.'),
}

const REJECT_TEXT: Record<string, string> = {
  BUSY: t('The robot is busy with a move.'),
  UNSUPPORTED_COMMAND: t('This robot cannot localize itself yet (update its gateway).'),
}

function place(s: Pick<AutoLocalizeSuggestion, 'endpointCode' | 'x' | 'y'>): string {
  return s.endpointCode ?? t('Off the endpoints ({x}, {y})', { x: s.x.toFixed(2), y: s.y.toFixed(2) })
}

/**
 * Auto-localize: the robot matches its lidar scan against its map (last pose, home, every endpoint) and takes a pose
 * only when sure. Unsure, it lists where the scan fits best; one click confirms the right one. Turning on the spot
 * (global localization) is offered only as an explicit choice, because the robot moves.
 */
export function AutoLocalizeSection({ robot, mayLocalize }: { robot: RobotView; mayLocalize: boolean }) {
  const queryClient = useQueryClient()
  const [allowSpin, setAllowSpin] = useState(false)
  const statusQuery = useQuery({
    queryKey: autoLocalizeKey(robot.id),
    queryFn: () => getAutoLocalize(robot.id),
    refetchInterval: (query) => (query.state.data?.state === 'RUNNING' ? 1000 : 10_000),
  })
  const status = statusQuery.data
  const running = status?.state === 'RUNNING'

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: autoLocalizeKey(robot.id) })
    void queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
  }
  const start = useMutation({ mutationFn: () => autoLocalizeRobot(robot.id, allowSpin), onSuccess: refresh })
  const confirm = useMutation({
    mutationFn: (s: AutoLocalizeSuggestion) => localizeRobotAtPose(robot.id, { x: s.x, y: s.y, yaw: s.yaw }),
    onSuccess: refresh,
  })
  const error = start.error ?? confirm.error

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-ink">{t('Auto-localize')}</p>
        {status && status.state !== 'NONE' ? (
          <StatusBadge tone={autoLocalizeTone(status)} withDot>
            {STATE_LABEL[status.state]}
          </StatusBadge>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {t('The robot matches its lidar scan against the map and takes a pose only when it is sure.')}
      </p>

      {status && status.state !== 'NONE' ? <Outcome status={status} /> : null}

      {status?.state === 'FAILED' && status.suggestions.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {status.suggestions.map((s, index) => (
            <li key={`${s.x}-${s.y}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-container px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{place(s)}</span>
                <span className="block text-xs text-muted">{t('Fits {score}', { score: scorePercent(s.score) })}</span>
              </span>
              <Button size="sm" variant="tonal" disabled={!mayLocalize || confirm.isPending || !robot.isOnline} onClick={() => confirm.mutate(s)}>
                {t('Robot is here')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {confirm.isSuccess ? <p className="text-xs text-ink-2">{t('Sent. Localization now: {status} (updates within a few seconds).', { status: robot.localizationStatus ?? t('unknown') })}</p> : null}

      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={allowSpin} onChange={(e) => setAllowSpin(e.target.checked)} disabled={running} />
        {t('Allow the robot to turn on the spot if the scan alone is not enough')}
      </label>
      <div>
        <Button variant="primary" size="sm" disabled={!mayLocalize || !robot.isOnline || running || start.isPending} onClick={() => start.mutate()}>
          {running || start.isPending ? t('Looking…') : t('Auto-localize')}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-ink">{error instanceof ApiError ? error.message : (error as Error).message}</p> : null}
    </div>
  )
}

function Outcome({ status }: { status: AutoLocalizeStatus }) {
  const when = status.completedAt ?? status.issuedAt
  let text: string
  switch (status.state) {
    case 'RUNNING':
      text = status.allowSpin ? t('Matching the scan; the robot may turn on the spot.') : t('Matching the scan…')
      break
    case 'SUCCEEDED':
      text =
        status.method === 'GLOBAL_SPIN'
          ? t('Localized after turning on the spot ({score} fit).', { score: scorePercent(status.score) })
          : t('Localized at {place} ({score} fit).', {
              place: place({ endpointCode: status.endpointCode, x: status.x ?? 0, y: status.y ?? 0 }),
              score: scorePercent(status.score),
            })
      break
    case 'FAILED':
      text = (status.errorCode && ERROR_TEXT[status.errorCode]) ?? status.errorCode ?? t('The robot did not take a pose.')
      break
    case 'REJECTED':
      text = (status.rejectReason && REJECT_TEXT[status.rejectReason]) ?? t('The robot refused: {reason}', { reason: status.rejectReason ?? '—' })
      break
    default:
      text = t('The robot did not answer.')
  }
  return (
    <p className="text-sm text-ink-2">
      {text}
      {when ? <span className="block text-xs text-muted">{formatRelativeTime(when)}</span> : null}
    </p>
  )
}
