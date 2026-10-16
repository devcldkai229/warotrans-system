import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import type { Endpoint } from '@/shared/api/contracts'
import { getRobot, listRobots } from '@/shared/api/fleet'
import { confirmJobStep, getJob, listJobs, startJob, type JobDetailDto, type JobStepDto, type JobTaskDto } from '@/shared/api/jobs'
import { getTransportRequest } from '@/shared/api/transportRequests'
import { cx } from '@/shared/lib/cx'
import { formatClock, humanize } from '@/shared/lib/format'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { WarehouseMap, type MapCallout, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { useNotificationsHub, type JobUpdatedMessage, type RobotTelemetryMessage } from '@/shared/realtime/useNotificationsHub'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { JOB_CONTAINER_STATUS_TONE, JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { runAgain } from '@/features/transport-requests/runOnRobot'

interface LivePose {
  x: number
  y: number
  yaw: number
  navigationStatus: string | null
}

/**
 * Live Job monitor (GĐ 3–4): the Job's steps on the left, the warehouse map with the robot moving on the right.
 * Robot pose and Job progress arrive over SignalR (/hubs/notifications); REST polling is the fallback.
 * Staff confirms PICKUP / DROPOFF here; every rule (order, container identity) is enforced by the backend.
 */
export function JobLivePage() {
  const { jobId: routeJobId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [livePose, setLivePose] = useState<{ robotId: string; pose: LivePose } | null>(null)

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'live'],
    queryFn: () => listJobs({ take: 20 }),
    refetchInterval: 5000,
  })
  const jobs = jobsQuery.data?.items ?? []
  const jobId = routeJobId ?? jobs.find((j) => j.status === 'RUNNING')?.id ?? jobs[0]?.id ?? null

  const onJobUpdated = useCallback(
    (message: JobUpdatedMessage) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'live'] })
      if (message.jobId === jobId) void queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
    [queryClient, jobId],
  )

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: jobId !== null,
  })
  const job = jobQuery.data ?? null
  const robotId = job?.assignedRobotId ?? null

  const onTelemetry = useCallback(
    (message: RobotTelemetryMessage) => {
      if (message.robotId !== robotId) return
      setLivePose({
        robotId: message.robotId,
        pose: { x: message.poseX, y: message.poseY, yaw: message.poseYaw, navigationStatus: message.navigationStatus },
      })
    },
    [robotId],
  )
  const hubConnected = useNotificationsHub({ robotTelemetryUpdated: onTelemetry, jobUpdated: onJobUpdated })

  // Without the hub, poll; with it, a slow refetch only guards against a missed push.
  const jobRefetch = hubConnected ? 10000 : 1500
  useQuery({
    queryKey: ['job', jobId, 'poll', jobRefetch],
    queryFn: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job', jobId], exact: true })
      return null
    },
    enabled: jobId !== null && job?.status === 'RUNNING',
    refetchInterval: jobRefetch,
  })

  const robotQuery = useQuery({
    queryKey: ['robot', robotId],
    queryFn: () => getRobot(robotId!),
    enabled: robotId !== null,
    refetchInterval: hubConnected ? 15000 : 1000,
  })
  const robot = robotQuery.data ?? null

  const requestId = job?.transportRequestIds[0] ?? null
  const requestQuery = useQuery({
    queryKey: ['transport-request', requestId],
    queryFn: () => getTransportRequest(requestId!),
    enabled: requestId !== null,
    refetchInterval: job?.status === 'RUNNING' ? 5000 : false,
  })
  const request = requestQuery.data ?? null

  const monitorMap = useMonitorMapVersion({
    preferredWarehouseId: request?.warehouseId ?? null,
    preferredMapVersionId: job?.mapVersionId ?? null,
    enabled: job !== null,
  })
  const endpoints = monitorMap.geometry.endpoints

  const containerLabel = useMemo(() => {
    const labels = new Map<string, string>()
    for (const detail of request?.details ?? []) labels.set(detail.containerId, detail.containerBarcode ?? detail.containerId.slice(0, 8))
    return (id: string | null) => (id ? (labels.get(id) ?? id.slice(0, 8)) : '')
  }, [request])

  const endpointById = useMemo(() => new Map(endpoints.map((e) => [e.id, e])), [endpoints])
  const endpointLabel = useCallback(
    (id: string | null) => (id ? (endpointById.get(id)?.name ?? endpointById.get(id)?.code ?? id.slice(0, 8)) : ''),
    [endpointById],
  )

  const pose: LivePose | null =
    livePose && livePose.robotId === robotId
      ? livePose.pose
      : robot
        ? { x: robot.poseX, y: robot.poseY, yaw: robot.poseYaw, navigationStatus: robot.navigationStatus ?? null }
        : null

  const currentStep = useMemo(() => findStep(job, job?.currentStepId ?? null), [job])

  return (
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] gap-3 px-3 pb-3">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container">
        <header className="flex items-center gap-3 px-4 pt-5">
          <h1 className="text-xl font-book">Live job</h1>
          <span className={cx('ml-auto flex items-center gap-1.5 text-xs', hubConnected ? 'text-green-ink' : 'text-muted')}>
            <span className={cx('size-1.5 rounded-full', hubConnected ? 'bg-green' : 'bg-grey')} />
            {hubConnected ? 'Realtime' : 'Polling'}
          </span>
        </header>

        <div className="px-4 pt-3">
          <select
            className="h-9 w-full rounded-md bg-surface px-3 text-sm"
            value={jobId ?? ''}
            onChange={(event) => navigate(`/monitor/live/${event.target.value}`)}
            aria-label="Job"
          >
            {jobs.length === 0 ? <option value="">No jobs yet — queue a transport request</option> : null}
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobNo} · {j.status} · {j.completedSteps}/{j.totalSteps}
              </option>
            ))}
          </select>
        </div>

        {job ? (
          <JobPanel
            job={job}
            requestCode={request?.requestCode ?? null}
            requestStatus={request?.status ?? null}
            robotCode={robot?.code ?? null}
            containerLabel={containerLabel}
            endpointLabel={endpointLabel}
          />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">{jobsQuery.isLoading ? 'Loading jobs…' : 'Select a job.'}</p>
        )}
      </aside>

      <div className="relative min-w-0 overflow-hidden rounded-lg bg-container">
        <LiveMap
          job={job}
          endpoints={endpoints}
          bounds={monitorMap.geometry.bounds}
          occupancyImageUrl={monitorMap.geometry.occupancyImageUrl}
          robotCode={robot?.code ?? null}
          robotStatus={robot?.status ?? null}
          pose={pose}
          currentStep={currentStep}
          containerLabel={containerLabel}
        />
        {pose ? (
          <div className="absolute top-3 right-3 z-5 flex h-8 items-center gap-2 rounded-full bg-surface/95 px-3.5 text-xs text-ink-2 shadow-float tabular-nums">
            <span className={cx('size-1.5 rounded-full', pose.navigationStatus === 'NAVIGATING' ? 'bg-blue' : 'bg-green')} />
            {robot?.code} ({pose.x.toFixed(2)}, {pose.y.toFixed(2)}) · {pose.navigationStatus ?? '—'}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ left panel */

function JobPanel({
  job,
  requestCode,
  requestStatus,
  robotCode,
  containerLabel,
  endpointLabel,
}: {
  job: JobDetailDto
  requestCode: string | null
  requestStatus: string | null
  robotCode: string | null
  containerLabel: (id: string | null) => string
  endpointLabel: (id: string | null) => string
}) {
  const percent = job.totalSteps === 0 ? 0 : Math.round((job.completedSteps * 100) / job.totalSteps)
  const current = findStep(job, job.currentStepId)
  const waiting = current && isWaitingForStaff(current.step) ? current : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="mx-4 mt-3 rounded-md bg-surface px-4 py-3.5">
        <div className="flex items-center gap-2">
          <strong className="font-medium">{job.jobNo}</strong>
          <StatusBadge tone={JOB_STATUS_TONE[job.status]} withDot className="ml-auto">
            {job.status}
          </StatusBadge>
        </div>
        <div className="mt-1 text-xs text-muted">
          {requestCode ?? '—'} {requestStatus ? `· request ${humanize(requestStatus)}` : ''} · robot {robotCode ?? 'not assigned'}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Meter percent={percent} tone={JOB_STATUS_TONE[job.status]} />
          <span className="text-xs text-muted tabular-nums">
            {job.completedSteps}/{job.totalSteps} · {percent}%
          </span>
        </div>
        {job.failureCode ? (
          <p className="mt-2 text-xs text-red-ink">
            {job.failureCode}: {job.failureMessage}
          </p>
        ) : null}
        {job.status === 'CREATED' || job.status === 'QUEUED' ? <StartJob job={job} /> : null}
        {job.status === 'COMPLETED' || job.status === 'FAILED' ? <RunAgain job={job} /> : null}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {job.containers.map((c) => (
            <li key={c.id}>
              <StatusBadge tone={JOB_CONTAINER_STATUS_TONE[c.status]} withDot>
                {`${containerLabel(c.containerId)} · ${c.status}`}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      {waiting ? (
        <ActionRequired
          step={waiting.step}
          where={endpointLabel(waiting.task.stopEndpointId ?? (waiting.step.resolvedInputs.endpointId as string | null) ?? null)}
          containerLabel={containerLabel}
        />
      ) : null}

      <ol className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-4 pt-3 pb-3">
        {job.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            currentStepId={job.currentStepId}
            title={taskTitle(task, containerLabel, endpointLabel)}
            containerLabel={containerLabel}
          />
        ))}
      </ol>
    </div>
  )
}

function StartJob({ job }: { job: JobDetailDto }) {
  const queryClient = useQueryClient()
  const robotsQuery = useQuery({ queryKey: ['fleet-robots', 'for-job', job.mapVersionId], queryFn: () => listRobots({ take: 100 }) })
  const candidates = (robotsQuery.data?.items ?? []).filter((r) => r.currentMapVersionId === job.mapVersionId)
  const [robotId, setRobotId] = useState('')
  const start = useMutation({
    mutationFn: () => startJob(job.id, robotId || undefined),
    onSuccess: (detail) => queryClient.setQueryData(['job', job.id], detail),
  })

  return (
    <div className="mt-3 flex items-center gap-2">
      <select
        className="h-8 min-w-0 flex-1 rounded-md bg-container px-2 text-sm"
        value={robotId}
        onChange={(event) => setRobotId(event.target.value)}
        aria-label="Robot"
      >
        <option value="">Best available robot</option>
        {candidates.map((r) => (
          <option key={r.id} value={r.id}>
            {r.code} · {r.status} · {r.isOnline ? 'online' : 'offline'}
          </option>
        ))}
      </select>
      <Button variant="primary" size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
        <Icon name="play" size={14} /> Start
      </Button>
      {start.error ? <span className="text-xs text-red-ink">{errorText(start.error)}</span> : null}
    </div>
  )
}

function TaskCard({
  task,
  currentStepId,
  title,
  containerLabel,
}: {
  task: JobTaskDto
  currentStepId: string | null
  title: string
  containerLabel: (id: string | null) => string
}) {
  const active = task.steps.some((s) => s.id === currentStepId)
  return (
    <li className={cx('rounded-md bg-surface px-3.5 py-2.5', active && 'ring-2 ring-ink')}>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="tabular-nums">#{task.sequenceNo}</span>
        <span className="font-medium text-ink">{title}</span>
        <span className="ml-auto">{humanize(task.status)}</span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {task.steps.map((step) => (
          <StepRow key={step.id} step={step} current={step.id === currentStepId} containerLabel={containerLabel} />
        ))}
      </ul>
    </li>
  )
}

function isWaitingForStaff(step: JobStepDto) {
  return step.stepType === 'HUMAN_INTERACTION' && step.status === 'WAITING'
}

/** Staff confirm of a WAITING PICKUP / DROPOFF step with the container the step expects. */
function useConfirmStep(step: JobStepDto, containerLabel: (id: string | null) => string) {
  const queryClient = useQueryClient()
  const expectedContainer = typeof step.resolvedInputs.containerId === 'string' ? step.resolvedInputs.containerId : null
  const confirm = useMutation({
    mutationFn: () => confirmJobStep(step.id, expectedContainer, `confirmed from web (${containerLabel(expectedContainer)})`),
    onSuccess: (detail) => queryClient.setQueryData(['job', detail.id], detail),
  })
  return { confirm, expectedContainer }
}

/** Pinned above the step list while the robot waits for staff, so Confirm is never scrolled out of view. */
function ActionRequired({ step, where, containerLabel }: { step: JobStepDto; where: string; containerLabel: (id: string | null) => string }) {
  const { confirm, expectedContainer } = useConfirmStep(step, containerLabel)
  return (
    <section className="mx-4 mt-3 rounded-md bg-amber-soft px-4 py-3.5 ring-2 ring-amber">
      <div className="text-xs font-medium tracking-wide text-amber-ink uppercase">Action required</div>
      <p className="mt-1 text-sm font-medium">{step.name || step.stepKey}</p>
      <p className="mt-0.5 text-xs text-ink-2">
        Container <strong className="font-mono">{containerLabel(expectedContainer)}</strong>
        {where ? <> at <strong>{where}</strong></> : null}
      </p>
      <Button variant="primary" className="mt-3 w-full" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
        <Icon name="check" size={15} /> {confirm.isPending ? 'Confirming…' : 'Confirm'}
      </Button>
      {confirm.error ? <p className="mt-2 text-xs text-red-ink">{errorText(confirm.error)}</p> : null}
    </section>
  )
}

/** Demo replay: submit the same request again and run it on a robot, then follow the new Job here. */
function RunAgain({ job }: { job: JobDetailDto }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const requestId = job.transportRequestIds[0] ?? null
  const again = useMutation({
    mutationFn: () => runAgain(requestId!),
    onSuccess: async ({ jobId }) => {
      await queryClient.invalidateQueries({ queryKey: ['jobs'] })
      navigate(`/monitor/live/${jobId}`)
    },
  })
  if (!requestId) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Button variant="primary" size="sm" onClick={() => again.mutate()} disabled={again.isPending}>
        <Icon name="refresh" size={14} /> {again.isPending ? 'Starting…' : 'Run again on robot'}
      </Button>
      <span className="text-xs text-muted">Submits the same request (same containers and routes) and starts it.</span>
      {again.error ? <span className="text-xs text-red-ink">{errorText(again.error)}</span> : null}
    </div>
  )
}

function StepRow({ step, current, containerLabel }: { step: JobStepDto; current: boolean; containerLabel: (id: string | null) => string }) {
  const waitsForStaff = isWaitingForStaff(step)
  const { confirm, expectedContainer } = useConfirmStep(step, containerLabel)
  const reason = typeof step.outputValues.reason === 'string' ? step.outputValues.reason : null
  // Follow the robot: keep the running step visible in the (long) list.
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (current) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current])

  return (
    <li ref={rowRef} className={cx('flex flex-col gap-1 rounded px-1.5 py-1', current && 'bg-container')}>
      <div className="flex items-center gap-2 text-sm">
        <ToneDot tone={STEP_STATUS_TONE[step.status]} size="sm" />
        <span className={cx('min-w-0 flex-1 truncate', step.status === 'PENDING' && 'text-muted')}>{step.name || step.stepKey}</span>
        <span className="text-xs text-muted">{step.operationCode}</span>
        <span className="w-20 text-right text-xs tabular-nums">
          {step.status === 'COMPLETED' ? formatClock(step.completedAt) : humanize(step.status)}
        </span>
      </div>
      {step.status === 'FAILED' ? (
        <p className="pl-4 text-xs text-red-ink">
          {step.errorCode}: {step.errorMessage}
        </p>
      ) : null}
      {step.stepType === 'CHECK' && step.status === 'COMPLETED' && reason ? <p className="pl-4 text-xs text-muted">{reason}</p> : null}
      {waitsForStaff ? (
        <div className="flex items-center gap-2 pl-4">
          <span className="text-xs text-amber-ink">Waiting for Staff · scan {containerLabel(expectedContainer)}</span>
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            <Icon name="check" size={14} /> Confirm
          </Button>
        </div>
      ) : null}
      {confirm.error ? <p className="pl-4 text-xs text-red-ink">{errorText(confirm.error)}</p> : null}
    </li>
  )
}

/* ------------------------------------------------------------------ map */

function LiveMap({
  job,
  endpoints,
  bounds,
  occupancyImageUrl,
  robotCode,
  robotStatus,
  pose,
  currentStep,
  containerLabel,
}: {
  job: JobDetailDto | null
  endpoints: Endpoint[]
  bounds: Parameters<typeof WarehouseMap>[0]['bounds']
  occupancyImageUrl: string | null
  robotCode: string | null
  robotStatus: MapRobot['status'] | null
  pose: LivePose | null
  currentStep: { task: JobTaskDto; step: JobStepDto } | null
  containerLabel: (id: string | null) => string
}) {
  const stopEndpointIds = useMemo(
    () => [...new Set((job?.tasks ?? []).map((t) => t.stopEndpointId).filter((id): id is string => id !== null))],
    [job],
  )

  const robots: MapRobot[] =
    pose && robotCode ? [{ code: robotCode, status: robotStatus ?? 'EXECUTING', x: pose.x, y: pose.y, yaw: pose.yaw }] : []

  const target = currentStep?.step.targetEndpointId ?? currentStep?.task.stopEndpointId ?? null
  const targetEndpoint = endpoints.find((e) => e.id === target) ?? null
  const movements: MapMovement[] =
    pose && targetEndpoint && currentStep?.step.stepType === 'MOVE'
      ? [{ from: { x: pose.x, y: pose.y }, to: { x: targetEndpoint.x, y: targetEndpoint.y }, label: currentStep.step.operationCode }]
      : []

  const callouts: MapCallout[] =
    pose && currentStep
      ? [
          {
            x: pose.x,
            y: pose.y,
            tone: currentStep.step.status === 'WAITING' ? 'warn' : 'dark',
            lines: [
              `${currentStep.step.stepKey} · ${currentStep.step.status}`,
              currentStep.task.containerId ? containerLabel(currentStep.task.containerId) : (targetEndpoint?.name ?? ''),
            ].filter(Boolean),
          },
        ]
      : []

  return (
    <WarehouseMap
      yawUnit="rad"
      endpoints={endpoints}
      edges={[]}
      zones={[]}
      bounds={bounds}
      occupancyImageUrl={occupancyImageUrl}
      robots={robots}
      layers={{ occupancy: true }}
      labels="all"
      focusEndpointIds={stopEndpointIds}
      movements={movements}
      callouts={callouts}
      selected={{ robotCode: robotCode ?? undefined, endpointId: targetEndpoint?.id }}
    />
  )
}

/* ------------------------------------------------------------------ helpers */

function findStep(job: JobDetailDto | null, stepId: string | null) {
  if (!job || !stepId) return null
  for (const task of job.tasks) {
    const step = task.steps.find((s) => s.id === stepId)
    if (step) return { task, step }
  }
  return null
}

function taskTitle(task: JobTaskDto, containerLabel: (id: string | null) => string, endpointLabel: (id: string | null) => string) {
  const action = task.stopAction === 'PICKUP' ? 'Pickup' : task.stopAction === 'DROPOFF' ? 'Drop-off' : ''
  switch (task.executionScope) {
    case 'ONCE_PER_JOB':
      return 'Job checks'
    case 'ONCE_PER_STOP':
      return `${action} stop · ${endpointLabel(task.stopEndpointId)}`
    case 'PER_CONTAINER_AT_STOP':
      return `${action} ${containerLabel(task.containerId)} · ${endpointLabel(task.stopEndpointId)}`
    default:
      return task.taskKey
  }
}

function errorText(error: unknown) {
  return error instanceof ApiError ? `${error.code ?? error.status}: ${error.message}` : String(error)
}
