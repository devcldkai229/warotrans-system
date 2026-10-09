import { Icon } from '@/shared/ui/Icon'
import { DASHBOARD_META, TASK_SUMMARY } from './mock'
import './dashboard.css'

const METER_SEGMENTS = 14

function CompletedMeter({ value, max }: { value: number; max: number }) {
  const filled = Math.max(1, Math.round((value / max) * METER_SEGMENTS))
  return (
    <span className="meter" aria-hidden="true">
      {Array.from({ length: METER_SEGMENTS }, (_, index) => (
        <i key={index} className={index < filled ? 'is-on' : undefined} />
      ))}
    </span>
  )
}

export function DashboardPage() {
  const summary = TASK_SUMMARY
  const maxCompleted = Math.max(...summary.rows.map((row) => row.completed))

  const secondary = [
    { label: 'Cancelled', value: summary.cancelled, tone: 'amber' },
    { label: 'Failed', value: summary.failed, tone: 'red' },
    { label: 'Reassigned', value: summary.reassigned, tone: 'ink' },
    { label: 'Below target time', value: summary.belowTargetTime, tone: 'green' },
    { label: 'Above target time', value: summary.aboveTargetTime, tone: 'amber' },
    { label: 'Timeouts', value: summary.timeouts, tone: 'red' },
  ]

  return (
    <div className="dash">
      <div className="dash__strip">
        <span className="dot" />
        <span className="mono">
          {DASHBOARD_META.warehouse} · {DASHBOARD_META.lastUpdated}
        </span>
      </div>

      <div className="dash__toolbar">
        <div className="dash__crumbs">
          <span>Fleet metrics</span>
          <Icon name="chevronRight" size={12} />
          <strong>Task summary</strong>
        </div>
        <div className="dash__actions">
          <button type="button" className="btn">
            <Icon name="calendar" size={14} />
            {DASHBOARD_META.range}
          </button>
          <button type="button" className="btn">
            {DASHBOARD_META.warehouse}
            <Icon name="chevronDown" size={12} />
          </button>
          <button type="button" className="btn dash__icon-btn" aria-label="Refresh">
            <Icon name="refresh" size={14} />
          </button>
          <button type="button" className="btn btn--outline">
            <Icon name="download" size={14} />
            Export Excel
          </button>
          <button type="button" className="btn btn--primary">
            <Icon name="download" size={14} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="dash__content">
        <section className="dash__hero">
          <h2>
            Completed tasks <Icon name="info" size={14} />
          </h2>
          <div className="dash__hero-value">
            <strong>{summary.completed.toLocaleString('en-US')}</strong>
            <span className="dash__delta">↑{summary.completedDeltaPercent}%</span>
          </div>
          <span className="dash__hero-check" aria-hidden="true">
            <Icon name="check" size={120} strokeWidth={1.5} />
          </span>
        </section>

        <section className="dash__grid">
          {secondary.map((item) => (
            <div key={item.label} className="dash__cell">
              <span>{item.label}</span>
              <strong className={`tone-${item.tone}`}>{item.value.toLocaleString('en-US')}</strong>
            </div>
          ))}
        </section>

        <section className="dash__table">
          <header>
            <h2>Task count by type and state</h2>
            <a href="#report" onClick={(event) => event.preventDefault()}>
              View full report <Icon name="arrowRight" size={14} />
            </a>
          </header>
          <table>
            <thead>
              <tr>
                <th>Task type</th>
                <th>Completed</th>
                <th>Cancelled</th>
                <th>Failed</th>
                <th>Timeouts</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.taskType}>
                  <td>{row.taskType}</td>
                  <td>
                    <span className="dash__completed">
                      {row.completed.toLocaleString('en-US')}
                      <CompletedMeter value={row.completed} max={maxCompleted} />
                    </span>
                  </td>
                  <td>{row.cancelled}</td>
                  <td>{row.failed}</td>
                  <td>{row.timeouts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
