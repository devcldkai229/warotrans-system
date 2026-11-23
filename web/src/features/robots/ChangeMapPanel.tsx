import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RobotView } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import { autoLocalizeRobot, changeRobotMap } from '@/shared/api/fleet'
import { listMapVersionsForWarehouse } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { autoLocalizeKey, warehouseMapsKey } from './robotMaps'

/**
 * Move a robot to another PUBLISHED map of its warehouse. Its pose belongs to the old map, so its localization becomes
 * UNKNOWN: right after the move the robot is asked to localize itself, and the Localize panel opens to follow it.
 */
export function ChangeMapPanel({ robot, onClose, onMoved }: { robot: RobotView; onClose: () => void; onMoved: () => void }) {
  const queryClient = useQueryClient()
  const mapsQuery = useQuery({
    queryKey: warehouseMapsKey(robot.warehouseId),
    queryFn: () => listMapVersionsForWarehouse(robot.warehouseId),
  })
  const published = (mapsQuery.data ?? []).filter((map) => map.status === 'PUBLISHED')
  const current = mapsQuery.data?.find((map) => map.id === robot.currentMapVersionId)
  const [chosenId, setChosenId] = useState('')
  const target = published.find((map) => map.id === (chosenId || published.find((m) => m.id !== robot.currentMapVersionId)?.id))

  const move = useMutation({
    mutationFn: async () => {
      if (!target) return
      await changeRobotMap(robot.id, target.id)
      // Best effort: an offline robot localizes later (on its own when the backend does that, or from the panel).
      if (robot.isOnline) await autoLocalizeRobot(robot.id).catch(() => undefined)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
      void queryClient.invalidateQueries({ queryKey: autoLocalizeKey(robot.id) })
      onMoved()
    },
  })

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-md border border-outline-soft p-4 text-sm">
      <p className="text-ink-2">
        {t('{robotCode} runs on {map}.', { robotCode: robot.code, map: current?.code ?? robot.currentMapVersionId.slice(0, 8) })}{' '}
        {t('After the move it localizes itself on the new map.')}
      </p>
      {mapsQuery.isLoading ? <p className="text-xs text-muted">{t('Loading map…')}</p> : null}
      {mapsQuery.data && published.length === 0 ? <p className="text-xs text-amber-ink">{t('This warehouse has no published map.')}</p> : null}
      {published.length > 0 ? (
        <select
          className="rounded-md border border-outline-soft bg-surface p-2"
          value={target?.id ?? ''}
          onChange={(e) => setChosenId(e.target.value)}
        >
          {published.map((map) => (
            <option key={map.id} value={map.id}>
              {map.code} · {map.name}
              {map.id === robot.currentMapVersionId ? ` (${t('current')})` : ''}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!target || target.id === robot.currentMapVersionId || move.isPending}
          onClick={() => move.mutate()}
        >
          {move.isPending
            ? t('Moving…')
            : target && target.id !== robot.currentMapVersionId
              ? t('Move to {map}', { map: target.code })
              : t('Already on this map')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('Close')}
        </Button>
      </div>
      {move.error ? <p className="text-xs text-red-ink">{move.error instanceof ApiError ? move.error.message : (move.error as Error).message}</p> : null}
    </section>
  )
}
