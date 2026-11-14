import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import { RobotHistoryCard } from '@/features/robots/history/RobotHistoryCard'
import { RobotPathCard } from '@/features/robots/history/RobotPathCard'
import { listRobots } from '@/shared/api/fleet'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
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
  // Events (state changes and commands) or Movement (where it went); in the address so a view can be shared.
  const movement = params.get('view') === 'movement'
  const show = (view: 'events' | 'movement') =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (view === 'movement') next.set('view', 'movement')
        else next.delete('view')
        return next
      },
      { replace: true },
    )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1000px] px-10 pt-8 pb-16">
        <SectionHead title={t('Robot history')}>
          <select
            className={controlClass('pill')}
            aria-label={t('Robot')}
            value={robot?.code ?? ''}
            disabled={items.length === 0}
            onChange={(event) =>
              setParams(
                (current) => {
                  const next = new URLSearchParams(current)
                  next.set('robot', event.target.value)
                  return next
                },
                { replace: true },
              )
            }
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
            <div className="mb-4 flex gap-1" aria-label={t('View')}>
              <Button size="sm" variant={movement ? 'ghost' : 'tonal'} aria-pressed={!movement} onClick={() => show('events')}>
                {t('Events')}
              </Button>
              <Button size="sm" variant={movement ? 'tonal' : 'ghost'} aria-pressed={movement} onClick={() => show('movement')}>
                {t('Movement')}
              </Button>
            </div>
            {/* One robot at a time: the filters start again when the robot changes. */}
            {movement ? <RobotPathCard key={robot.id} robot={robot} /> : <RobotHistoryCard key={robot.id} robot={robot} />}
          </section>
        )}
      </div>
    </div>
  )
}
