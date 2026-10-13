import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { JobStep } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Button } from '@/shared/ui/Button'
import { buttonClass } from '@/shared/ui/buttonClass'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE, STEP_STATUS_TONE, type Tone } from '@/shared/ui/statusTones'
import { formatClock, formatDuration, secondsBetween, humanize } from '@/shared/lib/format'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { findEndpointByName } from '@/shared/map/scene'
import { ROBOTS } from '../robots/mock'
import { AssignmentMetricsModal } from './AssignmentMetricsModal'
import { elapsedSeconds, stepProgress, waitingStep } from './derive'
import { TRANSPORT_REQUESTS } from '../transport-requests/mock'
import { DISPATCH_DECISIONS, JOBS } from './mock'

function bindingText(sourceType: string, path: string) {
  return sourceType === 'CONSTANT' ? path : `${sourceType}.${path}`
}

const show = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value))

const CARD = 'flex flex-col rounded-lg border border-outline-soft bg-surface p-6 shadow-float'
const CARD_LABEL = 'text-sm text-ink-2'
const STEP_HEADING = 'mt-4 mb-1 text-xs font-medium'
const VALUE_ROW =
  'grid grid-cols-[130px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-outline-soft py-1.5 text-xs last:border-b-0'

// A step that needs attention is tinted; its marker says how far it got.
const STEP_SURFACE: Partial<Record<Tone, string>> = { amber: 'bg-amber-soft', red: 'bg-red-soft' }
const STEP_MARK: Record<Tone, string> = {
  green: 'bg-green text-white',
  amber: 'bg-amber text-white',
  red: 'bg-red text-white',
  blue: 'bg-blue text-white',
  purple: 'bg-purple text-white',
  grey: 'border border-outline',
  teal: 'bg-teal text-white',
  rose: 'bg-rose text-white',
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5">{children}</dl>
}

/** One JobStep: a single line by default, its inputs/outputs/confirmation open on click. */
function StepRow({
  step,
  defaultOpen,
  container,
  canConfirm,
}: {
  step: JobStep
  defaultOpen: boolean
  container: { barcode: string; productLabel: string } | null
  canConfirm: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const tone = STEP_STATUS_TONE[step.status]
  const waiting = step.status === 'WAITING'
  const waited = waiting ? secondsBetween(step.waitingSince) : null
  const inputs = Object.entries(step.inputBindings ?? {})
  const outputs = Object.entries(step.outputValues)

  return (
    <div className={cx('rounded-md', STEP_SURFACE[tone] ?? 'bg-surface')}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={cx('grid size-5 shrink-0 place-items-center rounded-full', STEP_MARK[tone])}>
          {step.status === 'COMPLETED' ? <Icon name="check" size={12} strokeWidth={2.5} /> : null}
        </span>
        <span className="w-12 shrink-0 text-xs text-muted">Step {step.sequenceNo}</span>
        <strong className="min-w-0 truncate font-medium">{step.name}</strong>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted">{humanize(step.stepType)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {waiting && waited !== null && step.maxWaitSeconds !== undefined ? (
            <span className="text-xs font-medium whitespace-nowrap text-amber-ink tabular-nums">
              {formatDuration(waited)} of {Math.round(step.maxWaitSeconds / 60)}m max
            </span>
          ) : null}
          <StatusBadge tone={tone} surface={Boolean(STEP_SURFACE[tone])}>
            {step.status}
          </StatusBadge>
        </span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
      </button>

      {open ? (
        <div className="border-t border-outline-soft pr-4 pb-4 pl-12">
          <Facts>
            <Fact label="Started">{formatClock(step.startedAt)}</Fact>
            <Fact label="Completed">{formatClock(step.completedAt)}</Fact>
            {step.targetEndpointId ? <Fact label="Target endpoint">{step.targetEndpointId}</Fact> : null}
          </Facts>

          {step.stepType === 'HUMAN_INTERACTION' ? (
            <>
              <h4 className={STEP_HEADING}>Confirmation</h4>
              {step.handover ? (
                <Facts>
                  <Fact label="Container">{container?.barcode ?? '—'}</Fact>
                  <Fact label="Type">{humanize(step.handover.handoverType)}</Fact>
                  <Fact label="Confirmed by">{step.handover.confirmedByName}</Fact>
                  <Fact label="Confirmed at">{formatClock(step.handover.confirmedAt)}</Fact>
                  {step.handover.note ? <Fact label="Note">{step.handover.note}</Fact> : null}
                </Facts>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm">
                    {waiting
                      ? 'The robot is waiting for an operator to confirm the container identity.'
                      : 'Not confirmed yet.'}
                  </p>
                  {container ? (
                    <p className="text-xs text-ink-2">
                      Expected container: <b className="font-medium text-ink">{container.barcode}</b>, {container.productLabel}
                    </p>
                  ) : null}
                  {waiting ? (
                    <div className="mt-2 flex gap-2">
                      {canConfirm ? (
                        <Button variant="primary">
                          <Icon name="check" size={15} /> Confirm
                        </Button>
                      ) : null}
                      <Button variant="surface">Report issue</Button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          {inputs.length > 0 ? (
            <>
              <h4 className={STEP_HEADING}>Inputs</h4>
              <ul>
                {inputs.map(([input, binding]) => (
                  <li key={input} className={VALUE_ROW}>
                    <span className="text-muted">{input}</span>
                    <b className="font-medium">{show(step.resolvedInputs[input] ?? (binding.sourceType === 'CONSTANT' ? binding.path : '—'))}</b>
                    <span className="text-muted">
                      {binding.sourceType === 'CONSTANT' ? 'constant' : `from ${bindingText(binding.sourceType, binding.path)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {outputs.length > 0 ? (
            <>
              <h4 className={STEP_HEADING}>Outputs</h4>
              <ul>
                {outputs.map(([name, value]) => (
                  <li key={name} className={VALUE_ROW}>
                    <span className="text-muted">{name}</span>
                    <b className="font-medium">{show(value)}</b>
                    <span />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step.errorMessage ? (
            <p className="mt-3 rounded-sm bg-surface px-3 py-2 text-xs text-red-ink">
              {step.errorCode ? <b className="font-medium">{step.errorCode}: </b> : null}
              {step.errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function JobDetailPage() {
  const { jobNo } = useParams()
  const navigate = useNavigate()
  const [showMetrics, setShowMetrics] = useState(false)
  const job = JOBS.find((item) => item.jobNo === jobNo)
  // Job has no TransportRequestId; the Request is reached through JobContainer.
  const request = TRANSPORT_REQUESTS.find((item) => item.jobs.some((ref) => ref.jobNo === jobNo))

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <h1 className="text-xl font-book">Job {jobNo} was not found</h1>
        <Link to="/monitor/requests" className={buttonClass({ variant: 'primary' })}>
          Back to transport requests
        </Link>
      </div>
    )
  }

  const task = job.tasks[0]
  const waiting = waitingStep(job)
  const progress = stepProgress(job)
  const elapsed = elapsedSeconds(job)
  const waited = waiting ? secondsBetween(waiting.waitingSince) : null
  // The map shows this one movement: where the Container is picked up, where it must go, and the Robot between them.
  const origin = findEndpointByName(job.originLabel)
  const destination = findEndpointByName(job.destinationLabel)
  const robotView = ROBOTS.find((robot) => robot.code === job.assignedRobot?.code)
  const can = (action: (typeof job.availableActions)[number]) => job.availableActions.includes(action)

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full max-w-[1700px] flex-col px-10 pt-2 pb-10">
        <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={() => navigate('/monitor/requests')}>
          <Icon name="arrowLeft" size={14} /> Transport requests
        </Button>

        <header className="mt-5 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm text-muted">
              Job of request <span className="font-mono text-ink-2">{request?.requestCode ?? '—'}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-book">{job.jobNo}</h1>
              <StatusBadge tone={JOB_STATUS_TONE[job.status]} withDot>
                {job.status}
              </StatusBadge>
              {waiting ? <StatusBadge tone="amber">Step waiting</StatusBadge> : null}
            </div>
          </div>
          <p className="text-sm text-muted">
            Created at <span className="text-ink tabular-nums">{formatClock(job.createdAt)}</span>
          </p>
        </header>

        <div className="mt-8 grid grid-cols-[1fr_1.2fr_1fr] gap-4">
          <section className={cx(CARD, 'border-l-4 border-l-blue bg-blue-soft/40')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={CARD_LABEL}>Assigned robot</h2>
              {job.assignedRobot ? (
                <StatusBadge tone={ROBOT_STATUS_TONE[job.assignedRobot.status]} withDot surface>
                  {job.assignedRobot.status}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-3 text-2xl font-book">{job.assignedRobot?.code ?? 'Unassigned'}</p>
            <dl className="mt-4 flex gap-8 text-xs">
              <div>
                <dt className="text-muted">Battery</dt>
                <dd className="mt-0.5 font-medium">{job.assignedRobot ? `${job.assignedRobot.batteryPercent}%` : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Container</dt>
                <dd className="mt-0.5 font-mono font-medium">{job.container?.barcode ?? '—'}</dd>
              </div>
            </dl>
            <Button variant="surface" size="sm" className="mt-5 self-start" onClick={() => setShowMetrics(true)}>
              View assignment
            </Button>
          </section>

          <section className={cx(CARD, 'border-l-4 border-l-teal bg-teal-soft/40')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={CARD_LABEL}>Progress</h2>
              <span className="text-xs text-muted tabular-nums">
                Step {progress.current} of {progress.total}, {progress.percent}%
              </span>
            </div>
            <p className="mt-3 text-2xl font-book">
              {waiting ? `Waiting for ${waiting.name}` : (job.routeLabel ?? humanize(job.status))}
            </p>
            <div className="mt-6 flex h-1.5 overflow-hidden rounded-full bg-container-higher">
              <span className="bg-blue" style={{ width: `${progress.percent}%` }} />
              {waiting ? <span className="bg-amber" style={{ width: `${100 / Math.max(progress.total, 1)}%` }} /> : null}
            </div>
            <div className="mt-3 flex justify-between gap-4 text-xs text-muted">
              <span>From {job.originLabel ?? '—'}</span>
              <span>To {job.destinationLabel ?? '—'}</span>
            </div>
          </section>

          <section className={cx(CARD, 'border-l-4 border-l-amber bg-amber-soft/40')}>
            <h2 className={CARD_LABEL}>Execution time</h2>
            <p className="mt-3 text-4xl font-book">{elapsed === null ? '—' : formatDuration(elapsed)}</p>
            <p className="mt-1 text-xs text-muted">elapsed</p>
            {waiting && waited !== null && waiting.maxWaitSeconds !== undefined ? (
              <p className="mt-5 self-start rounded-full bg-amber-soft px-3 py-1 text-xs font-medium text-amber-ink">
                Waiting for confirmation: {formatDuration(waited)} of {Math.round(waiting.maxWaitSeconds / 60)}m max
              </p>
            ) : null}
          </section>
        </div>

        <div className="mt-4 grid min-h-[520px] flex-1 grid-cols-[1fr_1.05fr] gap-4">
          <section className="rounded-lg border border-outline-soft border-l-4 border-l-purple bg-surface p-6 shadow-float">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-book">Execution steps</h2>
              <span className="text-xs text-muted">
                {job.tasks.length} task, {progress.total} steps
              </span>
            </header>

            {task ? (
              <>
                <div className="mt-6 mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium">{task.name}</h3>
                    {job.routeLabel ? <p className="mt-0.5 text-xs text-muted">{job.routeLabel}</p> : null}
                  </div>
                  <StatusBadge tone={waiting ? 'amber' : 'blue'} surface>
                    {task.status}
                  </StatusBadge>
                </div>
                <div className="flex flex-col gap-1.5">
                  {task.steps.map((step) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      defaultOpen={step.status === 'WAITING' || step.status === 'FAILED'}
                      container={job.container}
                      canConfirm={can('REMOTE_CONFIRM')}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {job.failureMessage ? <p className="mt-4 text-sm text-red-ink">{job.failureMessage}</p> : null}
          </section>

          <section className="relative min-h-[480px] overflow-hidden rounded-lg border border-outline-soft bg-container shadow-float">
            <div className="absolute inset-0">
              <WarehouseMap
                robots={
                  robotView
                    ? [
                        {
                          code: robotView.code,
                          status: robotView.status,
                          x: robotView.poseX,
                          y: robotView.poseY,
                          yaw: robotView.poseYaw,
                          alert: robotView.status === 'ERROR',
                        },
                      ]
                    : []
                }
                layers={{ occupancy: false }}
                labels="focus"
                focusEndpointIds={[origin?.id, destination?.id].filter((id): id is string => Boolean(id))}
                movements={origin && destination ? [{ from: origin, to: destination, label: job.container?.barcode }] : []}
                callouts={
                  waiting && robotView
                    ? [
                        {
                          x: robotView.poseX,
                          y: robotView.poseY,
                          tone: 'warn',
                          lines: [
                            'Awaiting confirmation',
                            `${waiting.name}, waited ${waited === null ? '—' : formatDuration(waited)}`,
                          ],
                        },
                      ]
                    : []
                }
              />
            </div>
          </section>
        </div>
      </div>

      {showMetrics ? (
        <AssignmentMetricsModal
          jobNo={job.jobNo}
          decision={DISPATCH_DECISIONS[job.id] ?? null}
          onClose={() => setShowMetrics(false)}
        />
      ) : null}
    </div>
  )
}
