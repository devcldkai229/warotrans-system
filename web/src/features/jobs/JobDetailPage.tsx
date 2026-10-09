import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { JobStep } from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import { JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatClock, formatDuration, secondsBetween } from '@/shared/lib/format'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { findEndpointByName } from '@/shared/map/scene'
import { ROBOTS } from '../robots/mock'
import { AssignmentMetricsModal } from './AssignmentMetricsModal'
import { elapsedSeconds, stepProgress, waitingStep } from './derive'
import { TRANSPORT_REQUESTS } from '../transport-requests/mock'
import { DISPATCH_DECISIONS, JOBS } from './mock'
import './jobs.css'

function bindingText(sourceType: string, path: string) {
  return sourceType === 'CONSTANT' ? path : `${sourceType}.${path}`
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')

const show = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value))

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
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
  const waiting = step.status === 'WAITING'
  const waited = waiting ? secondsBetween(step.waitingSince) : null
  const inputs = Object.entries(step.inputBindings ?? {})
  const outputs = Object.entries(step.outputValues)

  return (
    <div className={`jstep jstep--${STEP_STATUS_TONE[step.status]}${open ? ' is-open' : ''}`}>
      <button type="button" className="jstep__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="jstep__mark">{step.status === 'COMPLETED' ? <Icon name="check" size={10} /> : null}</span>
        <span className="jstep__no">Step {step.sequenceNo}</span>
        <strong className="jstep__name">{step.name}</strong>
        <span className="jstep__kind">{titleCase(step.stepType)}</span>
        <span className="jstep__state">
          {waiting && waited !== null && step.maxWaitSeconds !== undefined ? (
            <span className="jstep__timer">
              {formatDuration(waited)} / {Math.round(step.maxWaitSeconds / 60)}m max
            </span>
          ) : null}
          <span className={`badge badge--${STEP_STATUS_TONE[step.status]}`}>{step.status}</span>
        </span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
      </button>

      {open ? (
        <div className="jstep__body">
          <dl className="jstep__facts">
            <Fact label="Started">{formatClock(step.startedAt)}</Fact>
            <Fact label="Completed">{formatClock(step.completedAt)}</Fact>
            {step.targetEndpointId ? <Fact label="Target endpoint">{step.targetEndpointId}</Fact> : null}
          </dl>

          {step.stepType === 'HUMAN_INTERACTION' ? (
            <>
              <h5>Confirmation</h5>
              {step.handover ? (
                <dl className="jstep__facts">
                  <Fact label="Container">{container?.barcode ?? '—'}</Fact>
                  <Fact label="Type">{titleCase(step.handover.handoverType)}</Fact>
                  <Fact label="Confirmed by">{step.handover.confirmedByName}</Fact>
                  <Fact label="Confirmed at">{formatClock(step.handover.confirmedAt)}</Fact>
                  {step.handover.note ? <Fact label="Note">{step.handover.note}</Fact> : null}
                </dl>
              ) : (
                <div className="jstep__confirm">
                  <p>
                    {waiting
                      ? 'Robot is waiting for an operator to confirm the Container identity.'
                      : 'Not confirmed yet.'}
                  </p>
                  {container ? (
                    <small>
                      Expected Container: <b>{container.barcode}</b> · {container.productLabel}
                    </small>
                  ) : null}
                  {waiting ? (
                    <div>
                      {canConfirm ? (
                        <button type="button" className="jflow__ok">
                          <Icon name="check" size={13} /> Confirm
                        </button>
                      ) : null}
                      <button type="button" className="btn btn--danger">Report issue</button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          {inputs.length > 0 ? (
            <>
              <h5>Inputs</h5>
              <ul className="jstep__inputs">
                {inputs.map(([input, binding]) => (
                  <li key={input}>
                    <span>{input}</span>
                    <b>{show(step.resolvedInputs[input] ?? (binding.sourceType === 'CONSTANT' ? binding.path : '—'))}</b>
                    <small>{binding.sourceType === 'CONSTANT' ? 'constant' : `← ${bindingText(binding.sourceType, binding.path)}`}</small>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {outputs.length > 0 ? (
            <>
              <h5>Outputs</h5>
              <ul className="jstep__inputs">
                {outputs.map(([name, value]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <b>{show(value)}</b>
                    <small />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step.errorMessage ? (
            <p className="jstep__err">
              {step.errorCode ? <b>{step.errorCode}: </b> : null}
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
      <div className="jdetail jdetail--empty">
        <p>Job {jobNo} not found.</p>
        <Link to="/monitor/requests" className="btn">
          Back to Transport Requests
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
    <div className="jdetail">
      <div className="jdetail__crumb">
        <button type="button" onClick={() => navigate('/monitor/requests')}>
          <Icon name="arrowLeft" size={12} /> Back to Requests
        </button>
        <span>/</span>
        <span className="muted">Transport Requests</span>
        <span>/</span>
        <span className="muted mono">{request?.requestCode ?? '—'}</span>
        <span>/</span>
        <strong className="mono">{job.jobNo}</strong>
        <span className={`badge badge--${JOB_STATUS_TONE[job.status]}`}>{job.status}</span>
        {waiting ? <span className="badge badge--amber">STEP WAITING</span> : null}
        <div className="jdetail__meta">
          <span>
            Created <b>{formatClock(job.createdAt)}</b>
          </span>
        </div>
      </div>

      <div className="jdetail__cards">
        <section className="jcardx">
          <small>ASSIGNED ROBOT</small>
          <h3>{job.assignedRobot?.code ?? 'Unassigned'}</h3>
          {job.assignedRobot ? (
            <span className="jcardx__online">
              <span className="dot" /> {job.assignedRobot.status}
            </span>
          ) : null}
          <dl>
            <div>
              <dt>Battery</dt>
              <dd className="is-ok">{job.assignedRobot ? `${job.assignedRobot.batteryPercent}%` : '—'}</dd>
            </div>
            <div>
              <dt>Container</dt>
              <dd>{job.container?.barcode ?? '—'}</dd>
            </div>
          </dl>
          <button type="button" className="jcardx__link" onClick={() => setShowMetrics(true)}>
            View assignment
          </button>
        </section>

        <section className="jcardx">
          <small>JOB PROGRESS</small>
          <span className="jcardx__step">
            Step {progress.current} of {progress.total} ({progress.percent}%)
          </span>
          <h3>{waiting ? `Waiting for ${waiting.name}` : (job.routeLabel ?? job.status)}</h3>
          <div className="jcardx__progress">
            <i style={{ width: `${progress.percent}%` }} />
            {waiting ? <i className="is-wait" style={{ width: `${100 / Math.max(progress.total, 1)}%` }} /> : null}
          </div>
          <div className="jcardx__ends">
            <span>Origin: {job.originLabel ?? '—'}</span>
            <span>Destination: {job.destinationLabel ?? '—'}</span>
          </div>
        </section>

        <section className="jcardx">
          <small>EXECUTION TIME</small>
          <h3 className="jcardx__time">
            {elapsed === null ? '—' : formatDuration(elapsed)} <span>Elapsed</span>
          </h3>
          {waiting && waited !== null && waiting.maxWaitSeconds !== undefined ? (
            <div className="jcardx__wait">
              Waiting for confirmation:
              <b>
                {formatDuration(waited)} / {Math.round(waiting.maxWaitSeconds / 60)}m max
              </b>
            </div>
          ) : null}
        </section>

      </div>

      <div className="jdetail__main">
        <section className="jflow">
          <header>
            <h2>
              <Icon name="list" size={14} /> Job Execution Flow (Detailed Steps)
            </h2>
            <small>
              {job.tasks.length} Task · {progress.total} Steps
            </small>
          </header>

          {task ? (
            <div className="jflow__task">
              <div className="jflow__task-head">
                <div>
                  <h3>
                    Task: {task.name}
                  </h3>
                  {job.routeLabel ? <p>Route: {job.routeLabel}</p> : null}
                </div>
                <span className={`badge badge--${waiting ? 'amber' : 'blue'}`}>{task.status}</span>
              </div>
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
          ) : null}

          {job.failureMessage ? (
            <footer>
              <span className="jflow__fail">{job.failureMessage}</span>
            </footer>
          ) : null}
        </section>

        <section className="jroute">
          <div className="jroute__map">
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
                          `${waiting.name} · waited ${waited === null ? '—' : formatDuration(waited)}`,
                        ],
                      },
                    ]
                  : []
              }
            />
          </div>
        </section>
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
