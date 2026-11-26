import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { listRobots } from '@/shared/api/fleet'
import {
  assessRecovery,
  assignRecoveryRobot,
  claimRecovery,
  confirmRecoveryTransfer,
  evacuateRecoverySource,
  getJobRecovery,
  listRecoveryEndpointCandidates,
  listRecoveryRobotCandidates,
  releaseRecovery,
  requestRecovery,
  resumeRecoveryOnSameRobot,
  secureRecoverySource,
  unassignRecoveryRobot,
  unloadRecoveryCargo,
  verifyRecoveryLocation,
  type JobDetailDto,
  type JobRecovery,
  type RecoveryAction,
  type RecoveryAssessmentResult,
  type RecoveryChecklistItem,
} from '@/shared/api/jobs'
import { createTicket } from '@/shared/api/tickets'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime, formatRelativeTime } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { controlClass } from '@/shared/ui/controlClass'
import {
  actionState,
  defaultRecoveryChecklist,
  HOLDER_LABEL,
  matchScan,
  PHASE_LABEL,
  PHASE_TONE,
  reasonText,
  recoverySteps,
  RESULT_LABEL,
  scansOf,
} from './recoveryModel'

const errorText = (failure: unknown) => (failure instanceof ApiError || failure instanceof Error ? failure.message : String(failure))

type Endpoints = { id: string; code: string; name?: string | null }[]
type Can = (a: RecoveryAction) => { allowed: boolean; reason: string | null }
type CaseRef = { caseId: string; version: number }

/**
 * Payload recovery of one Job (WAROTRANS_PAYLOAD_RECOVERY_DESIGN.md): the failed robot is assessed, moved or located and
 * secured by a technician; staff take the cargo off (or wait for the second robot), scan it onto the second robot and
 * the same Job resumes. Every button follows what the server allows (availableActions), with the reason when not.
 */
export function JobRecoveryPanel({
  job,
  endpoints,
  containerLabel,
}: {
  job: JobDetailDto
  endpoints: Endpoints
  containerLabel: (id: string) => string
}) {
  const queryClient = useQueryClient()
  const inRecovery = job.status === 'RECOVERY_REQUIRED'
  const recoveryQuery = useQuery({
    queryKey: ['job', job.id, 'recovery'],
    queryFn: () => getJobRecovery(job.id),
    refetchInterval: inRecovery ? 3_000 : false,
  })
  const robots = useQuery({ queryKey: ['fleet-robots', 'recovery'], queryFn: () => listRobots({ take: 100 }), staleTime: 30_000 })
  const robotCode = (id: string | null | undefined) =>
    (id && robots.data?.items.find((r) => r.id === id)?.code) || (id ? id.slice(0, 8) : '—')
  const endpointCode = (id: string | null | undefined) =>
    (id && endpoints.find((e) => e.id === id)?.code) || (id ? id.slice(0, 8) : '—')

  const [error, setError] = useState<string | null>(null)
  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => setError(null),
    onError: (failure) => setError(errorText(failure)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const recovery = recoveryQuery.data?.recovery ?? null
  const hasCargo = job.containers?.some((c) => c.status === 'ONBOARD') ?? false

  // A paused Job with cargo on board and no open case: ask for a recovery (staff or technician).
  if (!recovery || (recovery.resolvedAt && !inRecovery)) {
    if (job.status !== 'PAUSED' || !hasCargo || job.failureCode === 'payload_transferred') return null
    return (
      <section className="mb-6 rounded-md border border-outline-soft bg-surface p-4 text-sm">
        <h2 className="font-medium">{t('Payload recovery')}</h2>
        <p className="mt-1 text-xs text-muted">{t('The Job is paused with cargo on board. If its robot cannot go on, ask for a payload recovery: a technician assesses the robot, then a second robot takes the cargo.')}</p>
        <Button size="sm" variant="primary" className="mt-3" disabled={act.isPending}
          onClick={() => act.mutate(() => requestRecovery(job.id, t('Requested from the console')))}>{t('Request payload recovery')}</Button>
        {error ? <p className="mt-2 text-xs text-red-ink">{error}</p> : null}
      </section>
    )
  }

  return (
    <RecoveryCase job={job} recovery={recovery} endpoints={endpoints} containerLabel={containerLabel} robotCode={robotCode}
      endpointCode={endpointCode} act={(run) => act.mutate(run)} busy={act.isPending} error={error} />
  )
}

function RecoveryCase({
  job, recovery, endpoints, containerLabel, robotCode, endpointCode, act, busy, error,
}: {
  job: JobDetailDto
  recovery: JobRecovery
  endpoints: Endpoints
  containerLabel: (id: string) => string
  robotCode: (id: string | null | undefined) => string
  endpointCode: (id: string | null | undefined) => string
  act: (run: () => Promise<unknown>) => void
  busy: boolean
  error: string | null
}) {
  const paths = usePaths()
  const ref = { caseId: recovery.id, version: recovery.version }
  const can: Can = (action) => actionState(recovery, action)
  const open = recovery.resolvedAt === null
  const phase = recovery.phase

  return (
    <section className="mb-6 rounded-md border border-red/30 bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{t('Payload recovery')}</h2>
        <span className="flex gap-1.5">
          {phase && open ? <StatusBadge tone={PHASE_TONE[phase]} withDot>{t(PHASE_LABEL[phase])}</StatusBadge> : null}
          <StatusBadge tone={open ? 'amber' : 'grey'}>{recovery.status.replaceAll('_', ' ')}</StatusBadge>
        </span>
      </div>

      {phase ? (
        <ol className="mt-3 flex flex-wrap gap-1 text-[11px]">
          {recoverySteps(recovery).map((s, i) => (
            <li key={s.label} className={cx('rounded-full px-2 py-0.5',
              s.state === 'done' ? 'bg-green-soft text-green-ink' : s.state === 'current' ? 'bg-blue-soft font-medium text-blue-ink' : 'bg-container-high text-muted')}>
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <Info label={t('Failed robot')}>
          <Link className="underline underline-offset-2" to={paths.fleet(robotCode(recovery.fromRobotId))}>{robotCode(recovery.fromRobotId)}</Link>
        </Info>
        <Info label={t('Reason')}>{recovery.reason}</Info>
        {recovery.fault ? (
          <>
            <Info label={t('Last seen')}>
              {recovery.fault.x != null && recovery.fault.y != null ? `x ${recovery.fault.x.toFixed(2)}, y ${recovery.fault.y.toFixed(2)}` : '—'}
              {recovery.fault.seenAt ? ` · ${formatRelativeTime(recovery.fault.seenAt)}` : ''}
            </Info>
            <Info label={t('Online when it failed')}>{recovery.fault.online == null ? '—' : recovery.fault.online ? t('yes') : t('no')}</Info>
          </>
        ) : null}
        {recovery.verifiedLocation ? (
          <Info label={t('Place confirmed')}>x {recovery.verifiedLocation.x?.toFixed(2)}, y {recovery.verifiedLocation.y?.toFixed(2)}</Info>
        ) : null}
        {recovery.sourceEndpointId ? (
          <Info label={t('Recovery point of the failed robot')}>
            {endpointCode(recovery.sourceEndpointId)} {recovery.sourceArrived ? `(${t('arrived')})` : ''}
          </Info>
        ) : null}
        {recovery.toRobotId ? (
          <Info label={t('Second robot')}>
            {robotCode(recovery.toRobotId)} → {endpointCode(recovery.recoveryEndpointId)} {recovery.robotArrived ? `(${t('arrived')})` : ''}
          </Info>
        ) : null}
        <Info label={t('Opened')}>{formatIsoDateTime(recovery.createdAt)}</Info>
      </dl>

      <div className="mt-3">
        <p className="text-xs font-medium text-muted">{t('Cargo')}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {(recovery.containers ?? []).map((c) => (
            <li key={c.containerId} className="rounded-sm bg-container px-2 py-1">
              {containerLabel(c.containerId)} · {t(HOLDER_LABEL[c.holderType] ?? c.holderType)}
              {c.holderType === 'ROBOT' ? ` ${robotCode(c.holderId)}` : ''}
            </li>
          ))}
        </ul>
      </div>

      {recovery.assessment ? (
        <p className="mt-3 text-xs">
          <span className="text-muted">{t('Assessment')}: </span>
          <span className="font-medium">{t(RESULT_LABEL[recovery.assessment.result] ?? recovery.assessment.result)}</span>
          {recovery.assessment.note ? ` — ${recovery.assessment.note}` : ''}
        </p>
      ) : null}

      {open ? (
        <>
          <TechnicianPart job={job} recovery={recovery} refCase={ref} endpoints={endpoints} can={can} act={act} busy={busy} />
          <StaffPart job={job} recovery={recovery} refCase={ref} can={can} act={act} busy={busy} robotCode={robotCode} containerLabel={containerLabel} />
        </>
      ) : null}
      {error ? <p className="mt-3 text-xs text-red-ink">{error}</p> : null}
    </section>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function Blocked({ reason }: { reason: string | null }) {
  return reason ? <span className="text-[11px] text-muted">{reasonText(reason)}</span> : null
}

/** The technician's part: assess, confirm the place, let it drive to a recovery point, secure it. */
function TechnicianPart({
  job, recovery, refCase, endpoints, can, act, busy,
}: {
  job: JobDetailDto
  recovery: JobRecovery
  refCase: CaseRef
  endpoints: Endpoints
  can: Can
  act: (run: () => Promise<unknown>) => void
  busy: boolean
}) {
  const assess = can('ASSESS')
  const verify = can('VERIFY_LOCATION')
  const evacuate = can('SOURCE_EVACUATE')
  const secure = can('SOURCE_SECURE')
  const [result, setResult] = useState<RecoveryAssessmentResult>('SELF_EVACUATION_APPROVED')
  const [checklist, setChecklist] = useState<RecoveryChecklistItem[]>(() => defaultRecoveryChecklist())
  const [note, setNote] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [pointId, setPointId] = useState('')
  const points = useQuery({
    queryKey: ['job', job.id, 'recovery', 'points', 'SOURCE'],
    queryFn: () => listRecoveryEndpointCandidates(job.id, true),
    enabled: evacuate.allowed,
  })
  const visible = [assess, verify, evacuate, secure].some((s) => s.allowed || (s.reason !== null && s.reason !== 'forbidden'))
  if (!visible) return null
  const needsAllChecks = result !== 'MANUAL_RECOVERY_REQUIRED'
  const allOk = checklist.every((i) => i.ok)

  return (
    <div className="mt-4 rounded-md bg-container p-3">
      <p className="text-xs font-medium">{t('Technician: the failed robot')}</p>

      {assess.allowed ? (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <select className={controlClass('sm')} value={result} onChange={(e) => setResult(e.target.value as RecoveryAssessmentResult)}>
            {(['SELF_EVACUATION_APPROVED', 'MANUAL_RECOVERY_REQUIRED', 'SAME_ROBOT_RECOVERABLE'] as const).map((r) => (
              <option key={r} value={r}>{t(RESULT_LABEL[r])}</option>
            ))}
          </select>
          <ul className="grid grid-cols-2 gap-1">
            {checklist.map((item, i) => (
              <li key={item.item}>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={item.ok}
                    onChange={(e) => setChecklist((all) => all.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} />
                  {item.item}
                </label>
              </li>
            ))}
          </ul>
          <input className={controlClass('sm')} placeholder={t('Note (what was seen, what was done)')} value={note} maxLength={1000}
            onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={busy || (needsAllChecks && !allOk)}
              onClick={() => act(async () => {
                const done = await assessRecovery(job.id, refCase, result, checklist, note || undefined)
                // The assessment is also kept as a diagnosis ticket of the robot.
                if (recovery.fromRobotId) {
                  await createTicket(recovery.fromRobotId, {
                    type: 'DIAGNOSTIC',
                    title: `${t('Payload recovery')} ${job.jobNo}: ${t(RESULT_LABEL[result])}`,
                    description: note || undefined,
                    jobId: job.id,
                  }).catch(() => undefined)
                }
                return done
              })}>{t('Save assessment')}</Button>
            {needsAllChecks && !allOk ? <span className="text-[11px] text-muted">{t('Every check must pass before the robot may move again')}</span> : null}
          </div>
        </div>
      ) : <Blocked reason={assess.reason === 'forbidden' ? null : assess.reason} />}

      {verify.allowed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select className={controlClass('sm', 'w-auto')} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">{t('Where the robot really stands…')}</option>
            {endpoints.map((e) => <option key={e.id} value={e.id}>{e.name || e.code}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={busy || !placeId}
            onClick={() => act(() => verifyRecoveryLocation(job.id, refCase, { endpointId: placeId }))}>{t('Confirm place')}</Button>
        </div>
      ) : null}

      {evacuate.allowed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select className={controlClass('sm', 'w-auto')} value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="">{t('Nearest free recovery point')}</option>
            {(points.data?.items ?? []).map((p) => (
              <option key={p.endpointId} value={p.endpointId} disabled={!!p.unsuitable}>
                {p.code} · {p.pathMeters ?? p.distanceMeters} m {p.unsuitable ? `(${reasonText(p.unsuitable)})` : ''}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={busy}
            onClick={() => act(() => evacuateRecoverySource(job.id, refCase, pointId || undefined))}>{t('Drive it to the recovery point')}</Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || !secure.allowed}
          onClick={() => act(() => secureRecoverySource(job.id, refCase))}>{t('Robot secured (it holds still)')}</Button>
        <Blocked reason={secure.reason === 'forbidden' ? null : secure.reason} />
      </div>
    </div>
  )
}

/** The floor's part: claim, take cargo off, send the second robot, scan the transfer, or let the same robot go on. */
function StaffPart({
  job, recovery, refCase, can, act, busy, robotCode, containerLabel,
}: {
  job: JobDetailDto
  recovery: JobRecovery
  refCase: CaseRef
  can: Can
  act: (run: () => Promise<unknown>) => void
  busy: boolean
  robotCode: (id: string | null | undefined) => string
  containerLabel: (id: string) => string
}) {
  const claim = can('CLAIM')
  const release = can('RELEASE')
  const assign = can('ASSIGN')
  const unassign = can('UNASSIGN')
  const confirm = can('CONFIRM')
  const unload = can('UNLOAD')
  const resume = can('RESUME_SAME_ROBOT')
  const [robotId, setRobotId] = useState('')
  const [pointId, setPointId] = useState('')
  const [scan, setScan] = useState('')
  const [scanned, setScanned] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const robotCandidates = useQuery({
    queryKey: ['job', job.id, 'recovery', 'robots'],
    queryFn: () => listRecoveryRobotCandidates(job.id),
    enabled: assign.allowed,
  })
  const points = useQuery({
    queryKey: ['job', job.id, 'recovery', 'points', 'TARGET'],
    queryFn: () => listRecoveryEndpointCandidates(job.id, false),
    enabled: assign.allowed,
  })
  const containers = useMemo(() => recovery.containers ?? [], [recovery.containers])
  const onFailed = useMemo(() => containers.filter((c) => c.holderType === 'ROBOT' && c.holderId === recovery.fromRobotId), [containers, recovery.fromRobotId])
  const visible = [claim, release, assign, unassign, confirm, unload, resume].some((s) => s.allowed || (s.reason !== null && s.reason !== 'forbidden'))
  if (!visible) return null
  const allScanned = scansOf(containers, scanned).length === containers.length

  const addScan = () => {
    const found = matchScan(containers, scan)
    if (found) setScanned((s) => new Set(s).add(found.containerId))
    setScan('')
  }

  return (
    <div className="mt-4 rounded-md bg-container p-3 text-xs">
      <p className="font-medium">{t('Floor: the cargo')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {claim.allowed ? <Button size="sm" variant="tonal" disabled={busy} onClick={() => act(() => claimRecovery(job.id, refCase))}>{t('Claim the case')}</Button> : null}
        {release.allowed ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => releaseRecovery(job.id, refCase))}>{t('Release the case')}</Button> : null}
        {!claim.allowed && !release.allowed && recovery.claimedBy ? <span className="text-muted">{t('Claimed by someone else')}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={controlClass('sm', 'w-48')} placeholder={t('Scan or type a container label')} value={scan}
          onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addScan() }} />
        <Button size="sm" variant="ghost" onClick={addScan} disabled={!scan.trim()}>{t('Add')}</Button>
        <span className="text-muted">{t('{n} of {total} scanned', { n: scanned.size, total: containers.length })}</span>
      </div>
      <ul className="mt-1 flex flex-wrap gap-1">
        {containers.map((c) => (
          <li key={c.containerId} className={cx('rounded-sm px-2 py-0.5', scanned.has(c.containerId) ? 'bg-green-soft text-green-ink' : 'bg-surface')}>
            {containerLabel(c.containerId)}
          </li>
        ))}
      </ul>

      {unload.allowed && onFailed.length > 0 ? (
        <Button size="sm" variant="outline" className="mt-3" disabled={busy || scansOf(onFailed, scanned).length === 0}
          onClick={() => act(() => unloadRecoveryCargo(job.id, refCase, scansOf(onFailed, scanned), 'STAFF', undefined, note || undefined))}>
          {t('Scanned cargo taken off the failed robot (I hold it)')}
        </Button>
      ) : null}

      {assign.allowed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={controlClass('sm', 'w-auto')} value={robotId} onChange={(e) => setRobotId(e.target.value)}>
            <option value="">{t('Second robot…')}</option>
            {(robotCandidates.data?.items ?? []).map((r) => (
              <option key={r.robotId} value={r.robotId} disabled={!r.eligible}>
                {r.robotCode} {r.eligible ? '' : `(${r.reasons.map((x) => x.replaceAll('_', ' ')).join(', ')})`}
              </option>
            ))}
          </select>
          <select className={controlClass('sm', 'w-auto')} value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="">{t('Transfer point…')}</option>
            {(points.data?.items ?? []).map((p) => (
              <option key={p.endpointId} value={p.endpointId} disabled={!!p.unsuitable}>
                {p.code} · {p.pathMeters ?? p.distanceMeters} m {p.unsuitable ? `(${reasonText(p.unsuitable)})` : ''}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={busy || !robotId || !pointId}
            onClick={() => act(() => assignRecoveryRobot(job.id, refCase, robotId, pointId))}>{t('Send the second robot')}</Button>
        </div>
      ) : <div className="mt-2"><Blocked reason={assign.reason === 'forbidden' ? null : assign.reason} /></div>}

      {unassign.allowed ? (
        <Button size="sm" variant="ghost" className="mt-2" disabled={busy}
          onClick={() => act(() => unassignRecoveryRobot(job.id, refCase))}>{t('Call the second robot back')}</Button>
      ) : null}

      {confirm.allowed && recovery.toRobotId ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={controlClass('sm', 'w-64')} placeholder={t('Note')} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="primary" disabled={busy || !allScanned}
            onClick={() => act(() => confirmRecoveryTransfer(job.id, refCase, recovery.toRobotId as string, scansOf(containers, scanned), note || undefined))}>
            {t('All cargo is on {robot}: confirm', { robot: robotCode(recovery.toRobotId) })}
          </Button>
          {!allScanned ? <span className="text-[11px] text-muted">{t('Scan every container first')}</span> : null}
        </div>
      ) : null}

      {resume.allowed ? (
        <Button size="sm" variant="outline" className="mt-3" disabled={busy}
          onClick={() => act(() => resumeRecoveryOnSameRobot(job.id, refCase, note || undefined))}>{t('The same robot goes on')}</Button>
      ) : null}
    </div>
  )
}
