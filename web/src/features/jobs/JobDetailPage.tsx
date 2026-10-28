import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { getRobot } from '@/shared/api/fleet'
import { confirmJobStep, getJob, type JobDetailDto, type JobStepDto, type JobTaskDto } from '@/shared/api/jobs'
import { getTransportRequest } from '@/shared/api/transportRequests'
import { cx } from '@/shared/lib/cx'
import { formatClock, formatDuration, humanize, secondsBetween } from '@/shared/lib/format'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { WarehouseMap, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { useNotificationsHub, type JobUpdatedMessage, type RobotTelemetryMessage } from '@/shared/realtime/useNotificationsHub'
import { Button } from '@/shared/ui/Button'
import { buttonClass } from '@/shared/ui/buttonClass'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE, STEP_STATUS_TONE, type Tone } from '@/shared/ui/statusTones'

const show = (value: unknown) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value))

const CARD = 'flex flex-col rounded-lg border border-outline-soft bg-surface p-6 shadow-float'
const CARD_LABEL = 'text-sm text-ink-2'
const STEP_HEADING = 'mt-4 mb-1 text-xs font-medium'
const VALUE_ROW =
  'grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-3 border-b border-outline-soft py-1.5 text-xs last:border-b-0'

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

/** A Job still moving: its page refreshes on its own until it ends. */
const ACTIVE_JOB_STATUSES = ['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'PAUSED', 'REASSIGNING', 'RECOVERY_REQUIRED']

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

function errorText(error: unknown) {
  return error instanceof ApiError ? `${error.code ?? error.status}: ${error.message}` : String(error)
}

/** Names and barcodes for the ids a step carries, so the page does not show raw UUIDs. */
interface Labels {
  endpoint: (id: string | null | undefined) => string
  container: (id: string | null | undefined) => string
  /** A step input / output value: an endpoint or container id is replaced by its name. */
  value: (value: unknown) => string
}

/** One JobStep: a single line by default, its inputs, outputs and confirmation open on click. */
function StepRow({
  jobId,
  step,
  number,
  defaultOpen,
  labels,
  canConfirm,
}: {
  jobId: string
  step: JobStepDto
  /** Position of the step in the whole job (steps are numbered per task in the data). */
  number: number
  defaultOpen: boolean
  labels: Labels
  canConfirm: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(defaultOpen)
  const tone = STEP_STATUS_TONE[step.status]
  const waiting = step.status === 'WAITING'
  const waited = waiting ? secondsBetween(step.startedAt) : null
  const inputs = Object.entries(step.resolvedInputs)
  const outputs = Object.entries(step.outputValues)
  const expectedContainer = typeof step.resolvedInputs.containerId === 'string' ? step.resolvedInputs.containerId : null

  // Staff confirms the container identity; the backend enforces the order and that it is the right container.
  const confirm = useMutation({
    mutationFn: () => confirmJobStep(step.id, expectedContainer, `confirmed from web (${labels.container(expectedContainer)})`),
    onSuccess: (detail) => queryClient.setQueryData(['job', jobId], detail),
  })

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
        <span className="w-12 shrink-0 text-xs text-muted">Step {number}</span>
        <strong className="min-w-0 truncate font-medium">{step.name || step.stepKey}</strong>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted">{humanize(step.stepType)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {waiting && waited !== null ? (
            <span className="text-xs font-medium whitespace-nowrap text-amber-ink tabular-nums">
              waiting {formatDuration(waited)}
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
            <Fact label="Operation">{step.operationCode}</Fact>
            <Fact label="Started">{formatClock(step.startedAt)}</Fact>
            <Fact label="Completed">{formatClock(step.completedAt)}</Fact>
            {step.targetEndpointId ? <Fact label="Target endpoint">{labels.endpoint(step.targetEndpointId)}</Fact> : null}
          </Facts>

          {step.stepType === 'HUMAN_INTERACTION' ? (
            <>
              <h4 className={STEP_HEADING}>Confirmation</h4>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm">
                  {step.status === 'COMPLETED'
                    ? `Confirmed at ${formatClock(step.completedAt)}.`
                    : waiting
                      ? 'The robot is waiting for an operator to confirm the container identity.'
                      : 'Not confirmed yet.'}
                </p>
                {expectedContainer ? (
                  <p className="text-xs text-ink-2">
                    Expected container: <b className="font-medium text-ink">{labels.container(expectedContainer)}</b>
                  </p>
                ) : null}
                {waiting && canConfirm ? (
                  <div className="mt-2 flex gap-2">
                    <Button variant="primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                      <Icon name="check" size={15} /> {confirm.isPending ? 'Confirming…' : 'Confirm'}
                    </Button>
                  </div>
                ) : null}
                {confirm.error ? <p className="text-xs text-red-ink">{errorText(confirm.error)}</p> : null}
              </div>
            </>
          ) : null}

          {inputs.length > 0 ? (
            <>
              <h4 className={STEP_HEADING}>Inputs</h4>
              <ul>
                {inputs.map(([name, value]) => (
                  <li key={name} className={VALUE_ROW}>
                    <span className="text-muted">{name}</span>
                    <b className="font-medium">{labels.value(value)}</b>
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
                    <b className="font-medium">{labels.value(value)}</b>
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

/** "Job checks", "Pickup stop · Rack A-02", "Drop-off CTN-… · Dock 1": what a task is, from its scope and stop. */
function taskTitle(task: JobTaskDto, labels: Labels) {
  const action = task.stopAction === 'PICKUP' ? 'Pickup' : task.stopAction === 'DROPOFF' ? 'Drop-off' : ''
  switch (task.executionScope) {
    case 'ONCE_PER_JOB':
      return 'Job checks'
    case 'ONCE_PER_STOP':
      return `${action} stop · ${labels.endpoint(task.stopEndpointId)}`
    case 'PER_CONTAINER_AT_STOP':
      return `${action} ${labels.container(task.containerId)} · ${labels.endpoint(task.stopEndpointId)}`
    default:
      return task.taskKey
  }
}

/** A task still in play: one of its steps is running, waiting, paused or failed, or it is where the job is now. */
function isActiveTask(task: JobTaskDto, currentStepId: string | null) {
  return task.steps.some(
    (step) =>
      step.id === currentStepId || ['EXECUTING', 'READY', 'WAITING', 'PAUSED', 'FAILED'].includes(step.status),
  )
}

/**
 * One task of the job as a group that opens and closes. It is open while the task is in play and closed otherwise,
 * so a long job does not push the step in question off the screen; opening a closed one is one click, and a task
 * that becomes active (the job reaches it) opens itself.
 */
function TaskGroup({
  task,
  title,
  active,
  children,
}: {
  task: JobTaskDto
  title: string
  active: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(active)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setOpen(true)
  }

  const done = task.steps.filter((step) => step.status === 'COMPLETED').length
  const waiting = task.steps.some((step) => step.status === 'WAITING')
  const failed = task.steps.some((step) => step.status === 'FAILED')

  return (
    <div className="mt-3 first:mt-6">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-container-high"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            Task {task.sequenceNo} · {done} of {task.steps.length} {task.steps.length === 1 ? 'step' : 'steps'} done
          </span>
        </span>
        <StatusBadge tone={failed ? 'red' : waiting ? 'amber' : done === task.steps.length ? 'green' : 'blue'} surface>
          {task.status}
        </StatusBadge>
      </button>
      {open ? <div className="mt-1 mb-2 flex flex-col gap-1.5">{children}</div> : null}
    </div>
  )
}

function allSteps(job: JobDetailDto) {
  return job.tasks.flatMap((task) => task.steps)
}

/**
 * Job detail: who runs the Job, how far it is, how long it took, every step with its inputs / outputs, and the one
 * movement on the map. Reached from a Transport request (its Job panel) or from a notification, with the Job's id in
 * the URL. Updates arrive over SignalR; a slow refetch covers a missed push.
 */
export function JobDetailPage() {
  const { jobId = null } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [livePose, setLivePose] = useState<{ robotId: string; x: number; y: number; yaw: number } | null>(null)

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data && ACTIVE_JOB_STATUSES.includes(query.state.data.status) ? 5000 : false),
  })
  const job = jobQuery.data ?? null
  const robotId = job?.assignedRobotId ?? null

  const onJobUpdated = useCallback(
    (message: JobUpdatedMessage) => {
      if (message.jobId === jobId) void queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
    [queryClient, jobId],
  )
  const onTelemetry = useCallback(
    (message: RobotTelemetryMessage) => {
      if (message.robotId === robotId) setLivePose({ robotId: message.robotId, x: message.poseX, y: message.poseY, yaw: message.poseYaw })
    },
    [robotId],
  )
  useNotificationsHub({ jobUpdated: onJobUpdated, robotTelemetryUpdated: onTelemetry })

  const robotQuery = useQuery({
    queryKey: ['robot', robotId],
    queryFn: () => getRobot(robotId!),
    enabled: robotId !== null,
    refetchInterval: job && ACTIVE_JOB_STATUSES.includes(job.status) ? 5000 : false,
  })
  const robot = robotQuery.data ?? null

  const requestId = job?.transportRequestIds[0] ?? null
  const requestQuery = useQuery({
    queryKey: ['transport-request', requestId],
    queryFn: () => getTransportRequest(requestId!),
    enabled: requestId !== null,
  })
  const request = requestQuery.data ?? null

  const monitorMap = useMonitorMapVersion({
    preferredWarehouseId: request?.warehouseId ?? null,
    preferredMapVersionId: job?.mapVersionId ?? null,
    enabled: job !== null,
  })
  const endpoints = monitorMap.geometry.endpoints

  const labels = useMemo<Labels>(() => {
    const endpointById = new Map(endpoints.map((e) => [e.id, e.name || e.code]))
    const containerById = new Map((request?.details ?? []).map((d) => [d.containerId, d.containerBarcode ?? d.containerId.slice(0, 8)]))
    const endpoint = (id: string | null | undefined) => (id ? (endpointById.get(id) ?? id.slice(0, 8)) : '—')
    const container = (id: string | null | undefined) => (id ? (containerById.get(id) ?? id.slice(0, 8)) : '—')
    return {
      endpoint,
      container,
      value: (value) => {
        if (typeof value === 'string') {
          if (endpointById.has(value)) return endpointById.get(value)!
          if (containerById.has(value)) return containerById.get(value)!
        }
        return show(value)
      },
    }
  }, [endpoints, request])

  if (jobId === null || jobQuery.error || (!job && !jobQuery.isLoading)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <h1 className="text-xl font-book">{jobQuery.error ? errorText(jobQuery.error) : 'No job selected'}</h1>
        <Link to="/monitor/requests" className={buttonClass({ variant: 'primary' })}>
          Back to transport requests
        </Link>
      </div>
    )
  }

  if (!job) return <p className="px-10 py-8 text-sm text-muted">Loading job…</p>

  const steps = allSteps(job)
  const done = steps.filter((s) => s.status === 'COMPLETED').length
  const progress = {
    done,
    total: steps.length,
    percent: steps.length === 0 ? 0 : Math.round((done / steps.length) * 100),
    current: Math.min(done + 1, steps.length),
  }
  const waiting = steps.find((s) => s.status === 'WAITING') ?? null
  const waited = waiting ? secondsBetween(waiting.startedAt) : null
  const elapsed = secondsBetween(job.startedAt, job.completedAt)

  // The map shows the movement: where the first pickup is, where the last drop-off is, and the robot between them.
  const originId = job.tasks.find((t) => t.stopAction === 'PICKUP' && t.stopEndpointId)?.stopEndpointId ?? null
  const destinationId = [...job.tasks].reverse().find((t) => t.stopAction === 'DROPOFF' && t.stopEndpointId)?.stopEndpointId ?? null
  const origin = endpoints.find((e) => e.id === originId) ?? null
  const destination = endpoints.find((e) => e.id === destinationId) ?? null
  const routeLabel = origin && destination ? `${origin.name || origin.code} → ${destination.name || destination.code}` : null
  const containerLabels = job.containers.map((c) => labels.container(c.containerId))

  const pose =
    robot && livePose && livePose.robotId === robot.id
      ? { x: livePose.x, y: livePose.y, yaw: livePose.yaw }
      : robot
        ? { x: robot.poseX, y: robot.poseY, yaw: robot.poseYaw }
        : null
  const mapRobots: MapRobot[] =
    robot && pose ? [{ code: robot.code, status: robot.status, x: pose.x, y: pose.y, yaw: pose.yaw, alert: robot.status === 'ERROR' }] : []
  const movements: MapMovement[] =
    origin && destination ? [{ from: origin, to: destination, label: containerLabels[0] }] : []
  // Only the person-confirm of a waiting step is offered here; the backend refuses it in any other state.
  const canConfirm = job.status === 'RUNNING'

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
              {robot ? (
                <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot surface>
                  {robot.status}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-3 text-2xl font-book">{robot?.code ?? 'Unassigned'}</p>
            <dl className="mt-4 flex gap-8 text-xs">
              <div>
                <dt className="text-muted">Battery</dt>
                <dd className="mt-0.5 font-medium">{robot ? `${Math.round(robot.batteryPercent)}%` : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">{containerLabels.length > 1 ? 'Containers' : 'Container'}</dt>
                <dd className="mt-0.5 font-mono font-medium">{containerLabels.length > 0 ? containerLabels.join(', ') : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className={cx(CARD, 'border-l-4 border-l-teal bg-teal-soft/40')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={CARD_LABEL}>Progress</h2>
              <span className="text-xs text-muted tabular-nums">
                Step {progress.current} of {progress.total}, {progress.percent}%
              </span>
            </div>
            <p className="mt-3 text-2xl font-book">
              {waiting ? `Waiting for ${waiting.name || waiting.stepKey}` : (routeLabel ?? humanize(job.status))}
            </p>
            <div className="mt-6 flex h-1.5 overflow-hidden rounded-full bg-container-higher">
              <span className="bg-blue" style={{ width: `${progress.percent}%` }} />
              {waiting ? <span className="bg-amber" style={{ width: `${100 / Math.max(progress.total, 1)}%` }} /> : null}
            </div>
            <div className="mt-3 flex justify-between gap-4 text-xs text-muted">
              <span>From {origin ? origin.name || origin.code : '—'}</span>
              <span>To {destination ? destination.name || destination.code : '—'}</span>
            </div>
          </section>

          <section className={cx(CARD, 'border-l-4 border-l-amber bg-amber-soft/40')}>
            <h2 className={CARD_LABEL}>Execution time</h2>
            <p className="mt-3 text-4xl font-book">{elapsed === null ? '—' : formatDuration(elapsed)}</p>
            <p className="mt-1 text-xs text-muted">{job.completedAt ? 'total' : job.startedAt ? 'elapsed' : 'not started yet'}</p>
            {waiting && waited !== null ? (
              <p className="mt-5 self-start rounded-full bg-amber-soft px-3 py-1 text-xs font-medium text-amber-ink">
                Waiting for confirmation: {formatDuration(waited)}
              </p>
            ) : null}
          </section>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-[1fr_1.05fr] items-start gap-4">
          <section className="rounded-lg border border-outline-soft border-l-4 border-l-purple bg-surface p-6 shadow-float">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-book">Execution steps</h2>
              <span className="text-xs text-muted">
                {job.tasks.length} {job.tasks.length === 1 ? 'task' : 'tasks'}, {progress.total} steps
              </span>
            </header>

            {job.tasks.map((task) => (
              <TaskGroup
                key={task.id}
                task={task}
                title={taskTitle(task, labels)}
                active={isActiveTask(task, job.currentStepId)}
              >
                {task.steps.map((step) => (
                  <StepRow
                    key={step.id}
                    jobId={job.id}
                    step={step}
                    number={steps.indexOf(step) + 1}
                    defaultOpen={step.status === 'WAITING' || step.status === 'FAILED'}
                    labels={labels}
                    canConfirm={canConfirm}
                  />
                ))}
              </TaskGroup>
            ))}

            {job.failureMessage ? (
              <p className="mt-4 text-sm text-red-ink">
                {job.failureCode ? <b className="font-medium">{job.failureCode}: </b> : null}
                {job.failureMessage}
              </p>
            ) : null}
          </section>

          {/* Stays in view while the (long) list of steps scrolls past it. */}
          <section className="sticky top-4 h-[min(680px,calc(100svh-2rem))] overflow-hidden rounded-lg border border-outline-soft bg-container shadow-float">
            <div className="absolute inset-0">
              <WarehouseMap
                yawUnit="rad"
                endpoints={endpoints}
                edges={[]}
                zones={[]}
                bounds={monitorMap.geometry.bounds}
                occupancyImageUrl={monitorMap.geometry.occupancyImageUrl}
                robots={mapRobots}
                layers={{ occupancy: true }}
                labels="focus"
                focusEndpointIds={[origin?.id, destination?.id].filter((id): id is string => Boolean(id))}
                movements={movements}
                callouts={
                  waiting && pose
                    ? [
                        {
                          x: pose.x,
                          y: pose.y,
                          tone: 'warn',
                          lines: ['Awaiting confirmation', `${waiting.name || waiting.stepKey}, waited ${waited === null ? '—' : formatDuration(waited)}`],
                        },
                      ]
                    : []
                }
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
