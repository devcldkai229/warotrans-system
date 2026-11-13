import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import { RobotHistoryCard } from '@/features/robots/history/RobotHistoryCard'
import { listRobots } from '@/shared/api/fleet'
import { t } from '@/shared/i18n'
import { buttonClass } from '@/shared/ui/buttonClass'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'

/**
 * Operations ▸ Robot history: what one robot went through, newest first, with the filters of the robot panel and room
 * to read. The robot is in the address (`?robot=RBT-001`), so a line of it can be shared and the panel can link here.
 * A Technician sees only the robots in their scope, because that is all the server lists.
 */
export function RobotHistoryPage() {
  const [params, setParams] = useSearchParams()
  const robots = useQuery({ queryKey: ['fleet-robots', 'history-page'], queryFn: () => listRobots({ take: 100 }), staleTime: 30_000 })
  const items = useMemo(() => [...(robots.data?.items ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [robots.data])
  const wanted = params.get('robot')
  // An unknown code in the address falls back to the first robot instead of an empty page.
  const robot = items.find((item) => item.code === wanted) ?? items[0]

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1000px] px-10 pt-8 pb-16">
        <SectionHead title={t('Robot history')}>
          <select
            className={controlClass('pill')}
            aria-label={t('Robot')}
            value={robot?.code ?? ''}
            disabled={items.length === 0}
            onChange={(event) => setParams({ robot: event.target.value }, { replace: true })}
          >
            {items.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </SectionHead>

        {robots.isError ? (
          <p role="alert" className="text-sm text-red-ink">
            {t('The robots could not be loaded.')}{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => void robots.refetch()}>
              {t('Try again')}
            </button>
          </p>
        ) : robots.isPending ? (
          <p className="text-sm text-muted">{t('Loading…')}</p>
        ) : !robot ? (
          <p className="text-sm text-muted">{t('There are no robots to show.')}</p>
        ) : (
          <section className="rounded-lg border border-outline-soft bg-container p-5" aria-label={t('Robot history')}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-book">{robot.code}</h3>
              <span className="text-sm text-ink-2">{robot.name}</span>
              <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
                {robot.status}
              </StatusBadge>
              <Link to={`/monitor/fleet/${robot.code}`} className={`${buttonClass({ variant: 'ghost', size: 'sm' })} ml-auto`}>
                {t('Open robot')}
              </Link>
            </div>
            {/* One robot at a time: the filters start again when the robot changes. */}
            <RobotHistoryCard key={robot.id} robot={robot} />
          </section>
        )}
      </div>
    </div>
  )
}
