import {
  cancelMappingSession,
  getMappingSession,
  isOpenMappingSession,
  startMappingSession,
  type MappingSession,
} from '@/shared/api/mapping'
import { t } from '@/shared/i18n'

/**
 * "Scan again": throw away the map being built and start slam_toolbox again from where the robot stands.
 *
 * It reuses the audited cancel and start of a mapping session (no new robot command, so both robots support it). The
 * robot first stops slam_toolbox (CANCELLING, then CANCELLED), and only then can a new session open: a robot has at
 * most one open session. A session that already ended (FAILED, for example slam_toolbox did not start) just starts a
 * new one.
 */
export interface RescanDeps {
  cancel: (id: string) => Promise<MappingSession>
  get: (id: string) => Promise<MappingSession>
  start: (robotId: string) => Promise<MappingSession>
  sleep: (ms: number) => Promise<void>
}

export const defaultRescanDeps: RescanDeps = {
  cancel: cancelMappingSession,
  get: getMappingSession,
  start: startMappingSession,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
}

export class RescanError extends Error {
  readonly code: 'cancel_timeout' | 'not_cancellable'

  constructor(message: string, code: 'cancel_timeout' | 'not_cancellable') {
    super(message)
    this.code = code
  }
}

/** Status in which a session can be thrown away and scanned again. */
export const canRescan = (status: MappingSession['status']) =>
  status === 'STARTING' || status === 'MAPPING' || status === 'FAILED' || status === 'CANCELLED'

export async function rescanMapping(
  session: Pick<MappingSession, 'id' | 'robotId' | 'status'>,
  deps: RescanDeps = defaultRescanDeps,
  { pollMs = 1000, timeoutMs = 90_000, settleMs = 5000 }: { pollMs?: number; timeoutMs?: number; settleMs?: number } = {},
): Promise<MappingSession> {
  if (!canRescan(session.status)) {
    throw new RescanError(t('A {status} session cannot be scanned again.', { status: session.status }), 'not_cancellable')
  }
  if (isOpenMappingSession(session.status)) {
    await deps.cancel(session.id)
    // The robot stops slam_toolbox and resumes its localization before the session closes (a few seconds).
    let waited = 0
    for (;;) {
      const current = await deps.get(session.id)
      if (!isOpenMappingSession(current.status)) break
      if (waited >= timeoutMs) {
        throw new RescanError(t('The robot did not stop mapping in time; try again or cancel.'), 'cancel_timeout')
      }
      await deps.sleep(pollMs)
      waited += pollMs
    }
    // The robot reports the stop when `ros2 launch` exits; slam_toolbox itself can still be shutting down. A new
    // slam_toolbox started at once then published no map within 30 s (lab 2026-11-25, RBT-001: MAPPING_NO_MAP 0.7 s
    // after the stop, fine 7 s later), so give it a few seconds.
    await deps.sleep(settleMs)
  }
  return deps.start(session.robotId)
}
