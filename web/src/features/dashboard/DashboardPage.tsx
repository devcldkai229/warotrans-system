import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { ToneDot } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { DASHBOARD_META, TASK_SUMMARY } from './mock'

const count = (value: number) => value.toLocaleString('en-US')

export function DashboardPage() {
  const summary = TASK_SUMMARY
  const maxCompleted = Math.max(...summary.rows.map((row) => row.completed))

  // The dot carries the meaning (good / needs attention / failed); the number itself stays in the text colour.
  const secondary: { label: string; value: number; tone: Tone }[] = [
    { label: 'Cancelled', value: summary.cancelled, tone: 'amber' },
    { label: 'Failed', value: summary.failed, tone: 'red' },
    { label: 'Reassigned', value: summary.reassigned, tone: 'grey' },
    { label: 'Below target time', value: summary.belowTargetTime, tone: 'green' },
    { label: 'Above target time', value: summary.aboveTargetTime, tone: 'amber' },
    { label: 'Timeouts', value: summary.timeouts, tone: 'red' },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <header className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-book">Task summary</h1>
            <p className="mt-3 text-base text-ink-2">
              {DASHBOARD_META.warehouse}, {DASHBOARD_META.lastUpdated}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button>
              <Icon name="calendar" size={15} />
              {DASHBOARD_META.range}
            </Button>
            <Button>
              {DASHBOARD_META.warehouse}
              <Icon name="chevronDown" size={14} />
            </Button>
            <IconButton aria-label="Refresh">
              <Icon name="refresh" size={16} />
            </IconButton>
            <Button variant="outline">
              <Icon name="download" size={15} />
              Export Excel
            </Button>
            <Button variant="primary">
              <Icon name="download" size={15} />
              Export PDF
            </Button>
          </div>
        </header>

        <div className="mt-10 grid grid-cols-[1fr_1.15fr] gap-4">
          <section className="flex min-h-72 flex-col justify-between rounded-lg bg-container p-8">
            <h2 className="text-base text-ink-2">Completed tasks</h2>
            <div className="flex items-end gap-4">
              <strong className="text-7xl font-normal">{count(summary.completed)}</strong>
              <span className="mb-2 inline-flex h-7 items-center gap-1 rounded-full bg-green-soft px-3 text-xs font-medium text-green-ink">
                <Icon name="arrowRight" size={12} className="-rotate-45" />
                {summary.completedDeltaPercent}%
              </span>
            </div>
          </section>

          <section className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-outline-soft">
            {secondary.map((item) => (
              <div key={item.label} className="flex flex-col justify-between gap-6 bg-container p-6">
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <ToneDot tone={item.tone} />
                  {item.label}
                </span>
                <strong className="text-3xl font-book">{count(item.value)}</strong>
              </div>
            ))}
          </section>
        </div>

        <section className="mt-14">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-book">Tasks by type and outcome</h2>
            <Button variant="ghost" size="sm">
              View full report
              <Icon name="arrowRight" size={14} />
            </Button>
          </header>
          <Table>
            <thead>
              <tr>
                <Th>Task type</Th>
                <Th>Completed</Th>
                <Th align="right">Cancelled</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Timeouts</Th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <Tr key={row.taskType}>
                  <Td tone="strong">{row.taskType}</Td>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className="w-14 text-ink tabular-nums">{count(row.completed)}</span>
                      <Meter percent={(row.completed / maxCompleted) * 100} tone="blue" className="w-40" />
                    </span>
                  </Td>
                  <Td align="right">{row.cancelled}</Td>
                  <Td align="right">{row.failed}</Td>
                  <Td align="right">{row.timeouts}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </div>
  )
}
