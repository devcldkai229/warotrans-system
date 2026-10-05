import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { JobStep } from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import { JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatClock, formatCoordinate, formatDuration, secondsBetween } from '@/shared/lib/format'
import { AssignmentMetricsModal } from './AssignmentMetricsModal'
import { elapsedSeconds, stepProgress, waitingStep } from './derive'
import { DISPATCH_DECISIONS, JOBS, JOBS_MAP } from './mock'
import './jobs.css'

function bindingText(sourceType: string, path: string) {
  return sourceType === 'CONSTANT' ? path : `${sourceType}.${path}`
}

function StepRow({ step }: { step: JobStep }) {
  const waiting = step.status === 'WAITING'
  const waited = waiting ? secondsBetween(step.waitingSince) : null

  return (
    <div className={`jstep jstep--${STEP_STATUS_TONE[step.status]}`}>
      <header>
        <span className="jstep__mark">{step.status === 'COMPLETED' ? <Icon name="check" size={10} /> : null}</span>
        <small>Step {step.sequenceNo}</small>
        <span className={`jstep__type jstep__type--${step.stepType === 'MOVE' ? 'blue' : 'amber'}`}>
          {step.name}
        </span>
        {waiting ? <strong className="jstep__state">WAITING</strong> : null}
        <span className="jstep__right">
          {waiting && waited !== null && step.maxWaitSeconds !== undefined ? (
            <em>
              {formatDuration(waited)} / {Math.round(step.maxWaitSeconds / 60)}m max
            </em>
          ) : (
            <b className={step.status === 'COMPLETED' ? 'is-done' : undefined}>{step.status}</b>
          )}
        </span>
      </header>
      <div className="jstep__bindings">
        {Object.entries(step.inputBindings ?? {}).map(([input, binding]) => {
          const resolved = step.resolvedInputs[input]
          return (
            <span key={input} className="jstep__bind" title={binding.sourceType}>
              {input}
              <i>{binding.sourceType === 'CONSTANT' ? '=' : '←'}</i>
              <b>{bindingText(binding.sourceType, binding.path)}</b>
              {resolved !== undefined && binding.sourceType !== 'CONSTANT' ? <em> = {String(resolved)}</em> : null}
            </span>
          )
        })}
        {Object.entries(step.outputValues).map(([name, value]) => (
          <span key={name} className="jstep__out">
            ↳ output {name} {String(value)}
          </span>
        ))}
        {step.errorMessage ? <span className="jstep__err">{step.errorMessage}</span> : null}
      </div>
    </div>
  )
}

export function JobDetailPage() {
  const { jobNo } = useParams()
  const navigate = useNavigate()
  const [showMetrics, setShowMetrics] = useState(false)
  const job = JOBS.find((item) => item.jobNo === jobNo)

  if (!job) {
    return (
      <div className="jdetail jdetail--empty">
        <p>Job {jobNo} not found.</p>
        <Link to="/monitor/jobs" className="btn">
          Back to Jobs
        </Link>
      </div>
    )
  }

  const task = job.tasks[0]
  const waiting = waitingStep(job)
  const progress = stepProgress(job)
  const elapsed = elapsedSeconds(job)
  const waited = waiting ? secondsBetween(waiting.waitingSince) : null
  const can = (action: (typeof job.availableActions)[number]) => job.availableActions.includes(action)

  return (
    <div className="jdetail">
      <div className="jdetail__crumb">
        <button type="button" onClick={() => navigate('/monitor/jobs')}>
          <Icon name="arrowLeft" size={12} /> Back to Jobs
        </button>
        <span>/</span>
        <span className="muted">Jobs Management</span>
        <span>/</span>
        <strong className="mono">{job.jobNo}</strong>
        <span className={`badge badge--${JOB_STATUS_TONE[job.status]}`}>{job.status}</span>
        {waiting ? <span className="badge badge--amber">STEP WAITING</span> : null}
        <div className="jdetail__meta">
          <span>
            Created <b>{formatClock(job.createdAt)}</b>
          </span>
          <span>
            Assigned <b className="jdetail__robot">{job.assignedRobot?.code ?? '—'}</b>
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
              Station wait time (idle):
              <b>
                {formatDuration(waited)} / {Math.round(waiting.maxWaitSeconds / 60)}m max
              </b>
            </div>
          ) : null}
        </section>

        <section className="jcardx jcardx--ctrl">
          <small>MANUAL OVERRIDE / JOB CONTROLS</small>
          {can('REMOTE_CONFIRM') ? (
            <button type="button" className="jcardx__confirm">
              <Icon name="bolt" size={13} /> Remote Confirm (Bypass)
            </button>
          ) : null}
          <div>
            {can('PAUSE') ? (
              <button type="button" className="btn">
                <Icon name="pause" size={12} /> Pause
              </button>
            ) : null}
            {can('SKIP_ENDPOINT') ? (
              <button type="button" className="btn jcardx__skip">Skip Endpoint</button>
            ) : null}
            {can('CANCEL') ? (
              <button type="button" className="btn btn--danger">Cancel Job</button>
            ) : null}
          </div>
          {job.availableActions.length === 0 ? <p className="jcardx__none">No commands available</p> : null}
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
              <p className="jflow__hint">STEPS (bound to workflow variables):</p>
              {task.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}

              {waiting ? (
                <div className="jflow__warn">
                  <Icon name="alert" size={13} /> Robot is waiting for an operator to confirm the Container identity.
                </div>
              ) : null}

              {job.container ? (
                <div className="jflow__cargo">
                  <span>
                    Expected Container: <b>{job.container.barcode}</b> · {job.container.productLabel}
                  </span>
                  {waited !== null && waiting?.maxWaitSeconds !== undefined ? (
                    <span>
                      Wait duration: <b>{formatDuration(waited)}</b> (Max {Math.round(waiting.maxWaitSeconds / 60)}m)
                    </span>
                  ) : null}
                </div>
              ) : null}

              {waiting ? (
                <div className="jflow__actions">
                  {can('REMOTE_CONFIRM') ? (
                    <button type="button" className="jflow__ok">
                      <Icon name="check" size={13} /> Confirm Drop-off Complete (Remote Confirm)
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" className="btn btn--danger">Report Station Issue</button>
                </div>
              ) : null}
            </div>
          ) : null}

          <footer>
            <span>Dispatcher Algorithm: <b>{JOBS_MAP.scheduler}</b></span>
            {job.failureMessage ? <span className="jflow__fail">{job.failureMessage}</span> : null}
          </footer>
        </section>

        <section className="jroute">
          <header>
            <span className="mono">X: {formatCoordinate(JOBS_MAP.coordinates.x)}</span>
            <span className="mono">Y: {formatCoordinate(JOBS_MAP.coordinates.y)}</span>
            <span className="jobs__live"><span className="dot" /> {JOBS_MAP.mapLabel}</span>
            <span className="jroute__tools">
              <button type="button" className="btn" aria-label="Zoom in"><Icon name="plus" size={12} /></button>
              <button type="button" className="btn" aria-label="Zoom out"><Icon name="minus" size={12} /></button>
              <button type="button" className="btn">Reset View</button>
              <button type="button" className="btn"><Icon name="fit" size={12} /> Fit Job</button>
            </span>
          </header>
          <div className="jroute__canvas">
            <div className="jroute__zone jroute__zone--chargers">
              ⚡ CHARGERS BAY
              <div><span>CH-1</span><span>CH-2</span><span>CH-3</span></div>
              <small>Origin Bay: {job.originLabel ?? '—'}</small>
            </div>
            <div className="jroute__zone jroute__zone--qa">
              <b>QUALITY ASSURANCE</b>
              <em>ENDPOINT B</em>
              <div className="jroute__station">
                <strong>Station 4 (Inspection)</strong>
                <small>Optical Bay #03</small>
                <span>UNLOAD TARGET</span>
              </div>
            </div>
            <div className="jroute__station jroute__station--load">
              <strong>Station 1</strong>
              <small>P-102</small>
              <span>LOAD POINT</span>
            </div>
            <div className="jroute__station jroute__station--idle">
              <strong>Station 2</strong>
              <small>Idle</small>
            </div>
            {job.assignedRobot ? (
              <span className="jroute__amr">
                <Icon name="box" size={13} />
                <small>{job.assignedRobot.code}</small>
              </span>
            ) : null}
            {waiting ? (
              <div className="jroute__tip">
                <strong>Awaiting Confirmation</strong>
                <small>Step: {waiting.name}</small>
                <small>Wait time: {waited === null ? '—' : formatDuration(waited)}</small>
                <small>Robot: {job.assignedRobot?.code ?? '—'}</small>
              </div>
            ) : null}
            <div className="jroute__zone jroute__zone--highway">
              → DYNAMIC HIGHWAY &amp; CORRIDOR ROUTE
              <div className="jroute__jct">
                JCT-A4
                <span>YIELD PRIORITY</span>
              </div>
            </div>
          </div>
          <footer>
            <b>MAP LEGEND</b>
            <span><i className="lg lg--green" /> Endpoint A (Load Point)</span>
            <span><i className="lg lg--orange" /> Endpoint B (Unload Point)</span>
            <span><i className="lg lg--green" /> Robot Awaiting Confirmation</span>
            <span><kbd>Space</kbd> Pan <kbd>Scroll</kbd> Zoom</span>
          </footer>
        </section>
      </div>

      <footer className="jdetail__foot">
        <span>Transport request: <b className="mono">{job.transportRequestId}</b></span>
        <span>Active Job: <b className="mono">{job.jobNo}</b></span>
        <span className="is-ok"><span className="dot" /> Auto-Sync Enabled</span>
      </footer>

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
