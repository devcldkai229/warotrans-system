import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listMappingRobots, startMappingSession, type MappingRobot } from '@/shared/api/mapping'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { t } from '@/shared/i18n'
import { mappingReasonText, mappingRobotsKey } from './mappingGrid'

interface StartMappingDialogProps {
  warehouseId: string
  onClose: () => void
}

/** Facility → Build map: pick a robot that is free now; the robot starts slam_toolbox and the mapping page opens. */
export function StartMappingDialog({ warehouseId, onClose }: StartMappingDialogProps) {
  const navigate = useNavigate()
  const robots = useQuery({
    queryKey: mappingRobotsKey(warehouseId),
    queryFn: () => listMappingRobots(warehouseId),
    refetchInterval: 3000,
  })
  const start = useMutation({
    mutationFn: (robot: MappingRobot) => startMappingSession(robot.id),
    onSuccess: (session) => navigate(`/configure/facility/mapping/${session.id}`),
  })

  const items = robots.data ?? []
  return (
    <Modal
      title={t('Build a map')}
      subtitle={t('Pick a free robot. It stops using its current map while you drive it around; the result becomes a draft map to edit.')}
      onClose={onClose}
      width="w-[620px]"
    >
      <div className="px-6 pt-4 pb-6">
        {robots.isLoading ? <p className="text-sm text-muted">{t('Loading…')}</p> : null}
        {robots.isError ? <p className="text-sm text-red">{t('The robots could not be loaded.')}</p> : null}
        {!robots.isLoading && items.length === 0 ? <p className="text-sm text-muted">{t('This warehouse has no robot.')}</p> : null}
        <ul className="divide-y divide-outline-soft">
          {items.map((robot) => (
            <li key={robot.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {robot.code}
                  <span className="truncate text-sm font-normal text-ink-2">{robot.name}</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {robot.available ? (
                    <StatusBadge tone="green">{t('Ready')}</StatusBadge>
                  ) : (
                    robot.reasons.map((reason) => (
                      <StatusBadge key={reason} tone={reason === 'robot_offline' ? 'grey' : 'amber'}>
                        {mappingReasonText(reason)}
                      </StatusBadge>
                    ))
                  )}
                </div>
              </div>
              {robot.openSessionId ? (
                <Button variant="outline" onClick={() => navigate(`/configure/facility/mapping/${robot.openSessionId}`)}>
                  {t('Continue')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={!robot.available || start.isPending}
                  onClick={() => start.mutate(robot)}
                >
                  {start.isPending && start.variables?.id === robot.id ? t('Starting…') : t('Start mapping')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {start.isError ? (
          <p className="mt-3 text-sm text-red">
            {start.error instanceof ApiError ? start.error.message : t('Mapping could not be started.')}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-muted">
          {t('The robot must run a gateway that supports map building. After mapping it is not localized: localize it again on its map before giving it work.')}
        </p>
      </div>
    </Modal>
  )
}
