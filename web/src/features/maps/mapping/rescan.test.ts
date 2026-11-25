import { describe, expect, it, vi } from 'vitest'
import type { MappingSession } from '@/shared/api/mapping'
import { canRescan, rescanMapping, RescanError, type RescanDeps } from './rescan'

const session = (status: MappingSession['status'], id = 's1'): MappingSession =>
  ({ id, robotId: 'r1', status }) as MappingSession

function deps(statuses: MappingSession['status'][]): RescanDeps & { calls: string[] } {
  const calls: string[] = []
  let i = 0
  return {
    calls,
    cancel: vi.fn(async (id: string) => {
      calls.push(`cancel ${id}`)
      return session('CANCELLING', id)
    }),
    get: vi.fn(async (id: string) => {
      const status = statuses[Math.min(i++, statuses.length - 1)]
      calls.push(`get ${status}`)
      return session(status, id)
    }),
    start: vi.fn(async (robotId: string) => {
      calls.push(`start ${robotId}`)
      return session('STARTING', 's2')
    }),
    sleep: vi.fn(async () => undefined),
  }
}

describe('rescanMapping', () => {
  it('cancels, waits until the robot stopped mapping, then starts a new session for the same robot', async () => {
    const d = deps(['CANCELLING', 'CANCELLING', 'CANCELLED'])
    const next = await rescanMapping(session('MAPPING'), d)
    expect(next.id).toBe('s2')
    expect(d.calls).toEqual(['cancel s1', 'get CANCELLING', 'get CANCELLING', 'get CANCELLED', 'start r1'])
  })

  it('starts again at once when the session already ended (slam_toolbox failed to start)', async () => {
    const d = deps([])
    await rescanMapping(session('FAILED'), d)
    expect(d.calls).toEqual(['start r1'])
  })

  it('gives up when the robot never stops mapping, and does not open a second session', async () => {
    const d = deps(['CANCELLING'])
    await expect(rescanMapping(session('MAPPING'), d, { pollMs: 1000, timeoutMs: 3000 })).rejects.toBeInstanceOf(RescanError)
    expect(d.start).not.toHaveBeenCalled()
  })

  it('never throws away a map that is being saved', async () => {
    expect(canRescan('SAVING')).toBe(false)
    expect(canRescan('COMPLETED')).toBe(false)
    await expect(rescanMapping(session('SAVING'), deps([]))).rejects.toMatchObject({ code: 'not_cancellable' })
  })
})
