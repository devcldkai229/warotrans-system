import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Robot } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import { autoLocalizeRobot, changeRobotMap } from '@/shared/api/fleet'
import type { MapVersionDto } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'

interface MoveOutcome {
  moved: string[]
  failed: { code: string; reason: string }[]
}

/**
 * Robots of the warehouse still on another map than its published one get no Job. One click moves them all to the
 * published map and asks each online robot to localize itself there. A robot that cannot move now (running a command)
 * is left as it is and named.
 */
export function OffMapBanner({ robots, published }: { robots: Robot[]; published: MapVersionDto }) {
  const queryClient = useQueryClient()
  const move = useMutation({
    mutationFn: async (): Promise<MoveOutcome> => {
      const outcome: MoveOutcome = { moved: [], failed: [] }
      for (const robot of robots) {
        try {
          await changeRobotMap(robot.id, published.id)
          outcome.moved.push(robot.code)
          if (robot.isOnline) await autoLocalizeRobot(robot.id).catch(() => undefined)
        } catch (err) {
          outcome.failed.push({ code: robot.code, reason: err instanceof ApiError ? err.message : (err as Error).message })
        }
      }
      return outcome
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
      void queryClient.invalidateQueries({ queryKey: ['robot-auto-localize'] })
    },
  })

  if (robots.length === 0 && !move.data) return null
  const oldMaps = [...new Set(robots.map((robot) => robot.mapVersionCode).filter(Boolean))].join(', ')

  return (
    <div role="status" className="mx-4 mt-3 flex flex-col gap-2 rounded-md bg-amber-soft px-3 py-2.5 text-xs text-amber-ink">
      {robots.length > 0 ? (
        <>
          <p>
            {t('{count} robot(s) are not on the published map {map}: they get no job.', { count: robots.length, map: published.code })}{' '}
            <span className="font-medium">{robots.map((robot) => robot.code).join(', ')}</span>
            {oldMaps ? ` (${oldMaps})` : ''}
          </p>
          <div>
            <Button size="sm" variant="primary" disabled={move.isPending} onClick={() => move.mutate()}>
              {move.isPending ? t('Moving…') : t('Move all to {map}', { map: published.code })}
            </Button>
          </div>
        </>
      ) : null}
      {move.data && move.data.moved.length > 0 ? (
        <p className="text-ink-2">{t('Moved {robots}. They are localizing themselves now.', { robots: move.data.moved.join(', ') })}</p>
      ) : null}
      {move.data?.failed.map((f) => (
        <p key={f.code} className="text-red-ink">
          {f.code}: {f.reason}
        </p>
      ))}
    </div>
  )
}
