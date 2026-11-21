import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { evidenceApi, type EvidenceEvent, type RecordingSpans, type ReplayRecording, type ReplayRun } from '@/shared/api/evidence'
import { getMapVersionDetail } from '@/shared/api/navigation'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatDateTimeFull, humanize } from '@/shared/lib/format'
import { WarehouseMap, type MapCallout, type MapRobot, type MapTrail } from '@/shared/map/WarehouseMap'
import { mapDetailToGeometry } from '@/shared/map/mapVersionGeometry'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EVIDENCE_LABEL, EVIDENCE_TONE, SEVERITY_LABEL, SEVERITY_TONE } from './journalTones'
import { CameraPlayer } from './replay/CameraPlayer'
import { JourneyTimeline, NOTE_COLOR, SEVERITY_COLOR, STEP_OTHER_COLOR, STEP_TYPE_COLOR, stepColor, stepsOfRun } from './replay/JourneyTimeline'
import {
  cameraState,
  currentEventId,
  formatElapsed,
  incidentJump,
  incidents,
  mediaAt,
  ms,
  pathUntil,
  planAt,
  poseAt,
  stepAt,
  stepJump,
  stepTimeline,
  type StepSpan,
} from './replay/replayModel'

const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed']
const RATES = [0.5, 1, 2, 4]
const SKIP_MS = 5000

interface Camera {
  run: ReplayRun
  rec: ReplayRecording | null
}

type Tab = 'events' | 'notes' | 'details'

const CAMERA_TEXT: Record<string, string> = {
  PLAYING: 'Video',
  NO_VIDEO_AT_TIME: 'No video at this time',
  PROCESSING: 'Video still processing',
  SYNC_UNCERTAIN: 'Sync uncertain',
  NO_CAMERA: 'No camera recording',
}

/** Opens the journal of a transport request (links from the trip and request screens). */
export function JournalByRequestRedirect() {
  const { transportRequestId = '' } = useParams()
  const paths = usePaths()
  const journal = useQuery({ queryKey: ['evidence-journal-by-request', transportRequestId], queryFn: () => evidenceApi.journalByRequest(transportRequestId) })
  if (journal.data) return <Navigate to={paths.journals(journal.data.id)} replace />
  return <div className="p-10 text-sm text-ink-2">{journal.isError ? t('No evidence journal for this request yet.') : t('Loading…')}</div>
}

/**
 * Journey Replay (spec §11.3–11.5): every robot of a transport request on one UTC timeline. One global cursor drives
 * the main camera, the map (path so far, plan of the moment, the robot where it really was) and the event list.
 * Keyboard: Space plays / pauses, ← → move 5 s, [ ] jump to the previous / next incident. Deep link: ?t=<ms>&run=<id>.
 */
export function JournalReplayPage() {
  const { journalId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { capabilities } = useAuth()
  const paths = usePaths()
  const queryClient = useQueryClient()
  const manifestQuery = useQuery({ queryKey: ['evidence-replay', journalId], queryFn: () => evidenceApi.replay(journalId), refetchInterval: 30_000 })
  const manifest = manifestQuery.data
  const runs = useMemo(() => manifest?.runs ?? [], [manifest])
  const fromMs = ms(manifest?.fromUtc) ?? 0
  const toMs = Math.max(ms(manifest?.toUtc) ?? 0, fromMs + 1000)

  const [cursor, setCursor] = useState<number | null>(() => (params.get('t') ? Number(params.get('t')) : null))
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [mainRun, setMainRun] = useState<string | null>(params.get('run'))
  const [tab, setTab] = useState<Tab>('events')
  const trajectories = useQueries({
    queries: runs.map((run) => ({
      queryKey: ['evidence-trajectory', run.id],
      queryFn: () => evidenceApi.trajectory(run.id),
      enabled: run.trajectoryAvailable,
      staleTime: 60_000,
    })),
  })
  const plans = useQueries({
    queries: runs.map((run) => ({ queryKey: ['evidence-plans', run.id], queryFn: () => evidenceApi.plans(run.id), enabled: run.planCount > 0, staleTime: 60_000 })),
  })
  const recordings = runs.flatMap((run) => run.recordings)
  const spans = useQueries({
    queries: recordings.map((r) => ({ queryKey: ['evidence-spans', r.id], queryFn: () => evidenceApi.spans(r.id), refetchInterval: 30_000 })),
  })
  const spansByRecording = useMemo(() => {
    const out: Record<string, RecordingSpans | undefined> = {}
    recordings.forEach((r, i) => (out[r.id] = spans[i]?.data))
    return out
  }, [recordings, spans])
  // Until the technician moves it (or a deep link sets it), the cursor sits on the first frame of video: the journal
  // opens a moment before the camera starts, and opening on "No video at this time" looked broken.
  const firstFootageMs = useMemo(() => {
    const starts = Object.values(spansByRecording).flatMap((r) => (r?.spans ?? []).map((sp) => Date.parse(sp.utcStart)))
    const first = starts.length > 0 ? Math.min(...starts) : null
    return first != null && first > fromMs && first < toMs ? first : fromMs
  }, [spansByRecording, fromMs, toMs])
  const cursorMs = Math.min(Math.max(cursor ?? firstFootageMs, fromMs), toMs)

  // The global clock: real time × rate while playing. It belongs to the page, never to a video player.
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    let frame = 0
    const step = (now: number) => {
      const before = last.current ?? now
      last.current = now
      setCursor((c) => {
        const next = (c ?? firstFootageMs) + (now - before) * rate
        if (next >= toMs) {
          setPlaying(false)
          return toMs
        }
        return next
      })
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, rate, fromMs, toMs, firstFootageMs])

  // Deep link kept current (rounded to 100 ms, written at most twice a second).
  useEffect(() => {
    const id = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set('t', String(Math.round(cursorMs / 100) * 100))
          if (mainRun) next.set('run', mainRun)
          return next
        },
        { replace: true },
      )
    }, 500)
    return () => clearTimeout(id)
  }, [cursorMs, mainRun, setParams])

  const eventsQuery = useQuery({ queryKey: ['evidence-events', journalId], queryFn: () => evidenceApi.events(journalId), enabled: Boolean(manifest) })
  const notesQuery = useQuery({ queryKey: ['evidence-notes', journalId], queryFn: () => evidenceApi.annotations(journalId), enabled: Boolean(manifest) })
  const mapVersionId = runs.find((r) => r.mapVersionId)?.mapVersionId ?? null
  const mapQuery = useQuery({ queryKey: ['map-detail', mapVersionId], queryFn: () => getMapVersionDetail(mapVersionId!), enabled: Boolean(mapVersionId), staleTime: 300_000 })
  const geometry = useMemo(() => mapDetailToGeometry(mapQuery.data), [mapQuery.data])
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data])
  const steps = useMemo(() => stepTimeline(events), [events])

  const seek = useCallback((time: number) => setCursor(Math.min(Math.max(time, fromMs), toMs)), [fromMs, toMs])
  const jump = useCallback(
    (direction: 1 | -1) => {
      const target = incidentJump(events, cursorMs, direction)
      if (target != null) seek(target)
    },
    [events, cursorMs, seek],
  )
  const jumpStep = useCallback(
    (direction: 1 | -1, among: StepSpan[] = steps) => {
      const target = stepJump(among, cursorMs, direction)
      if (target != null) seek(target)
    },
    [steps, cursorMs, seek],
  )

  // Keyboard shortcuts, except while typing a note.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (event.key === ' ') {
        event.preventDefault()
        setPlaying((p) => !p)
      } else if (event.key === 'ArrowRight' && target?.getAttribute('role') !== 'slider') seek(cursorMs + (event.shiftKey ? 1000 : SKIP_MS))
      else if (event.key === 'ArrowLeft' && target?.getAttribute('role') !== 'slider') seek(cursorMs - (event.shiftKey ? 1000 : SKIP_MS))
      else if (event.key === ']') jump(1)
      else if (event.key === '[') jump(-1)
      else if (event.key === '.') jumpStep(1)
      else if (event.key === ',') jumpStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursorMs, seek, jump, jumpStep])

  const addNote = useMutation({
    mutationFn: (body: { category: string; note: string }) =>
      evidenceApi.addAnnotation(journalId, { atUtc: new Date(cursorMs).toISOString(), runId: selectedRunId, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evidence-notes', journalId] }),
  })
  const [noteText, setNoteText] = useState('')
  const [noteCategory, setNoteCategory] = useState('OBSERVATION')
  const [showAllEvents, setShowAllEvents] = useState(false)

  const robots: MapRobot[] = []
  const trails: MapTrail[] = []
  const callouts: MapCallout[] = []
  runs.forEach((run, i) => {
    const color = COLORS[i % COLORS.length]
    const points = trajectories[i]?.data?.points ?? []
    trails.push({ segments: pathUntil(points, cursorMs), color, joinGaps: false })
    const plan = planAt(plans[i]?.data ?? [], cursorMs)
    if (plan) trails.push({ segments: [plan.pathPoints.map(([x, y]) => ({ x, y }))], color, dashed: true })
    const pose = poseAt(points, cursorMs)
    const active = (ms(run.startedAtUtc) ?? 0) <= cursorMs && cursorMs <= (ms(run.endedAtUtc) ?? Number.POSITIVE_INFINITY)
    if (pose) robots.push({ code: run.robotCode, status: 'EXECUTING', x: pose.x, y: pose.y, yaw: pose.yaw })
    else if (active && points.length > 0) {
      const lastValid = [...points].reverse().find((p) => p[0] <= cursorMs && p[4] === 1)
      if (lastValid) callouts.push({ x: lastValid[1], y: lastValid[2], tone: 'warn', lines: [run.robotCode, t('Position unknown (localization gap)')] })
    }
  })

  const selectedRunId = mainRun ?? runs[0]?.id ?? null
  const selectedIndex = Math.max(0, runs.findIndex((r) => r.id === selectedRunId))
  const selectedRun = runs[selectedIndex]
  const cameras: Camera[] = runs.flatMap((run): Camera[] => (run.recordings.length > 0 ? run.recordings.map((rec) => ({ run, rec })) : [{ run, rec: null }]))
  // The camera of a run that covers the cursor; when a run has several recordings (reboot) the one holding the cursor.
  const pickRecording = (runId: string) => {
    const options = cameras.filter((c) => c.run.id === runId && c.rec)
    return options.find((c) => c.rec && spansByRecording[c.rec.id] && mediaAt(spansByRecording[c.rec.id]!.spans, cursorMs)) ?? options[0] ?? null
  }
  const others = runs.filter((run) => run.id !== selectedRunId)
  const selectedSteps = selectedRun ? stepsOfRun(steps, selectedRun, runs.length) : []
  const currentStep = stepAt(selectedSteps, cursorMs)
  const activeEvent = currentEventId(events, cursorMs)
  const visibleEvents = showAllEvents ? events : events.filter((e) => e.severity !== 'INFO')
  const incidentCount = incidents(events).length
  const notes = notesQuery.data ?? []

  if (manifestQuery.isError) return <div className="p-10 text-sm text-red-ink">{(manifestQuery.error as Error).message}</div>
  if (!manifest) return <div className="p-10 text-sm text-ink-2">{t('Loading…')}</div>

  const selectedPose = selectedRun ? poseAt(trajectories[selectedIndex]?.data?.points ?? [], cursorMs) : null
  const selectedPlan = selectedRun ? planAt(plans[selectedIndex]?.data ?? [], cursorMs) : null
  const selectedCam = selectedRun ? pickRecording(selectedRun.id) : null
  const selectedSpans = selectedCam?.rec ? spansByRecording[selectedCam.rec.id] ?? null : null
  const selectedCamState = cameraState(
    selectedSpans ? mediaAt(selectedSpans.spans, cursorMs) : null,
    Boolean(selectedSpans?.assets.some((a) => a.status !== 'READY' && a.status !== 'FAILED')),
    Boolean(selectedCam?.rec),
  )
  const canAnnotate = hasPermission(capabilities, PERMISSIONS.evidenceAnnotate)
  const canExport = hasPermission(capabilities, PERMISSIONS.evidenceExport)
  const duration = toMs - fromMs
  const atEnd = cursorMs >= toMs

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 pt-5 pb-16 sm:px-6">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to={paths.journals()} className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-ink-2 hover:bg-container-high hover:text-ink">
            <Icon name="arrowLeft" size={14} />
            {t('Transport journals')}
          </Link>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-xl font-semibold">{manifest.requestCode}</h1>
            <span className="text-xs text-ink-2">
              {formatDateTimeFull(manifest.fromUtc)} · {formatElapsed(duration)} · {t('{count} containers', { count: manifest.requestedContainerCount })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="grey">{`${t('Request')}: ${manifest.sourceTransportStatus ? humanize(manifest.sourceTransportStatus) : '—'}`}</StatusBadge>
            <StatusBadge tone={EVIDENCE_TONE[manifest.evidenceStatus] ?? 'grey'}>
              {`${t('Evidence')}: ${t(EVIDENCE_LABEL[manifest.evidenceStatus] ?? manifest.evidenceStatus)}`}
            </StatusBadge>
            {incidentCount > 0 ? <StatusBadge tone="amber">{t('{count} incidents', { count: incidentCount })}</StatusBadge> : null}
          </div>
          {canExport ? (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void evidenceApi.exportPacket(journalId, manifest.requestCode)}>
              <Icon name="download" size={14} />
              {t('Export evidence')}
            </Button>
          ) : null}
        </header>

        {runs.length === 0 ? (
          <div className="rounded-lg bg-container p-8 text-center text-sm text-ink-2">{t('No robot has taken a trip of this request yet.')}</div>
        ) : (
          <>
            {/* Camera + map */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <section className="flex flex-col gap-3">
                {selectedRun ? (
                  <CameraPlayer
                    robotCode={selectedRun.robotCode}
                    spans={selectedSpans}
                    hasRecording={Boolean(selectedCam?.rec)}
                    cursorMs={cursorMs}
                    playing={playing}
                    rate={rate}
                  />
                ) : null}
                {selectedRun ? (
                  <CurrentStepBar
                    steps={selectedSteps}
                    current={currentStep}
                    cursorMs={cursorMs}
                    color={COLORS[selectedIndex % COLORS.length]!}
                    onSeek={seek}
                    onJump={(direction) => jumpStep(direction, selectedSteps)}
                  />
                ) : null}
                {others.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {others.map((run) => {
                      const cam = pickRecording(run.id)
                      return (
                        <button key={run.id} type="button" className="text-left" onClick={() => setMainRun(run.id)} title={t('Show this camera large')}>
                          <CameraPlayer
                            robotCode={run.robotCode}
                            spans={cam?.rec ? spansByRecording[cam.rec.id] ?? null : null}
                            hasRecording={Boolean(cam?.rec)}
                            cursorMs={cursorMs}
                            playing={playing}
                            rate={rate}
                            secondary
                          />
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </section>

              <section className="flex flex-col gap-3">
                <div className="relative h-[360px] overflow-hidden rounded-lg border border-outline-soft bg-container xl:h-[420px]">
                  <WarehouseMap
                    yawUnit="rad"
                    endpoints={geometry.endpoints}
                    edges={geometry.edges}
                    zones={geometry.zones}
                    bounds={geometry.bounds}
                    occupancyImageUrl={geometry.occupancyImageUrl}
                    layers={{ occupancy: true }}
                    labels="focus"
                    robots={robots}
                    trails={trails}
                    callouts={callouts}
                    focusRobotCodes={selectedRun ? [selectedRun.robotCode] : []}
                  />
                </div>
                <div className="-mt-1 flex flex-wrap gap-4 px-1 text-[11px] text-ink-2">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: COLORS[selectedIndex % COLORS.length] }} />{t('Driven path')}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: COLORS[selectedIndex % COLORS.length] }} />
                    {t('Planned route')}
                  </span>
                </div>
                {selectedRun ? (
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <Fact icon="crosshair" label={t('Position')} mono>
                      {selectedPose ? `${selectedPose.x.toFixed(2)}, ${selectedPose.y.toFixed(2)} · ${((selectedPose.yaw * 180) / Math.PI).toFixed(0)}°` : t('Unknown')}
                    </Fact>
                    <Fact icon="route" label={t('Planned route')}>
                      {selectedPlan ? `v${selectedPlan.planVersion}${selectedPlan.reason ? ` · ${humanize(selectedPlan.reason)}` : ''}` : t('None')}
                    </Fact>
                    <Fact icon="play" label={t('Camera')}>{t(CAMERA_TEXT[selectedCamState] ?? selectedCamState)}</Fact>
                    <Fact icon="clock" label={t('Clock sync')}>
                      {selectedRun.timeSyncErrorBoundMs == null
                        ? t('Unknown')
                        : selectedRun.timeSyncErrorBoundMs > 1e6
                          ? t('Not synchronized')
                          : `±${Math.round(selectedRun.timeSyncErrorBoundMs)} ms`}
                    </Fact>
                  </dl>
                ) : null}
              </section>
            </div>

            {/* Player controls + timeline */}
            <section className="rounded-lg border border-outline-soft bg-container p-3 sm:p-4" aria-label={t('Player')}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <ControlButton icon="undo" label={t('Back 5 s')} shortcut="←" onClick={() => seek(cursorMs - SKIP_MS)} />
                <button
                  type="button"
                  onClick={() => {
                    if (atEnd) seek(fromMs)
                    setPlaying((p) => !p)
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover"
                  aria-label={playing ? t('Pause') : t('Play')}
                  title={`${playing ? t('Pause') : t('Play')} (Space)`}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={18} />
                </button>
                <ControlButton icon="redo" label={t('Forward 5 s')} shortcut="→" onClick={() => seek(cursorMs + SKIP_MS)} />
                <div className="mx-1 h-6 w-px bg-outline-variant" />
                <ControlButton icon="chevronLeft" label={t('Previous incident')} shortcut="[" onClick={() => jump(-1)} disabled={incidentJump(events, cursorMs, -1) == null} />
                <ControlButton icon="chevronRight" label={t('Next incident')} shortcut="]" onClick={() => jump(1)} disabled={incidentJump(events, cursorMs, 1) == null} />
                <div className="ml-1 flex items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">{formatElapsed(cursorMs - fromMs)}</span>
                  <span className="font-mono text-xs text-muted tabular-nums">/ {formatElapsed(duration)}</span>
                  <span className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline">
                    {new Date(cursorMs).toLocaleTimeString(undefined, { hour12: false })}.{String(Math.floor(cursorMs % 1000)).padStart(3, '0')}
                  </span>
                </div>
                <div className="ml-auto flex items-center rounded-full bg-surface p-0.5" role="radiogroup" aria-label={t('Speed')}>
                  {RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rate === r}
                      onClick={() => setRate(r)}
                      className={cx(
                        'h-7 min-w-10 rounded-full px-2 font-mono text-xs transition-colors',
                        rate === r ? 'bg-primary text-white' : 'text-ink-2 hover:text-ink',
                      )}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>
              <JourneyTimeline
                fromMs={fromMs}
                toMs={toMs}
                cursorMs={cursorMs}
                runs={runs}
                colors={COLORS}
                spansByRecording={spansByRecording}
                events={events}
                annotations={notes}
                steps={steps}
                activeStepId={currentStep?.stepId ?? null}
                selectedRunId={selectedRunId}
                onSelectRun={setMainRun}
                onSeek={seek}
              />
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-ink-2/70" />{t('Video')}</span>
                <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-ink-2/30" />{t('Trip')}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rotate-45" style={{ background: SEVERITY_COLOR.WARNING }} />{t('Incident')}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: NOTE_COLOR }} />{t('Note')}</span>
                {steps.length > 0 ? (
                  <>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px]" style={{ background: COLORS[selectedIndex % COLORS.length] }} />{t('Driving step')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px]" style={{ background: STEP_TYPE_COLOR.HUMAN_INTERACTION }} />{t('Waiting for staff')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px]" style={{ background: STEP_OTHER_COLOR }} />{t('Other step')}</span>
                  </>
                ) : null}
                <span className="ml-auto">{t('Local time; recorded in UTC')} · {t('Space: play / pause · ← →: 5 s · [ ]: incidents · , .: steps')}</span>
              </p>
            </section>

            {/* Events / notes / details */}
            <section className="rounded-lg border border-outline-soft bg-container">
              <div className="flex flex-wrap items-center gap-1 border-b border-outline-variant px-3 pt-2" role="tablist">
                {(
                  [
                    ['events', t('Events'), incidentCount],
                    ['notes', t('Notes'), notes.length],
                    ['details', t('Trip details'), null],
                  ] as [Tab, string, number | null][]
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cx(
                      '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                      tab === key ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
                    )}
                  >
                    {label}
                    {count ? <span className="rounded-full bg-container-high px-1.5 text-[11px] tabular-nums">{count}</span> : null}
                  </button>
                ))}
                {tab === 'events' ? (
                  <label className="ml-auto flex items-center gap-2 pb-1 text-xs text-ink-2">
                    <input type="checkbox" checked={showAllEvents} onChange={(e) => setShowAllEvents(e.target.checked)} />
                    {t('Show info events too')}
                  </label>
                ) : null}
              </div>

              <div className="p-3 sm:p-4">
                {tab === 'events' ? (
                  <EventList events={visibleEvents} runs={runs} activeId={activeEvent} onSeek={seek} empty={showAllEvents ? t('Nothing recorded.') : t('No warnings or errors on this journey.')} />
                ) : null}

                {tab === 'notes' ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <ol className="flex max-h-[320px] flex-col gap-2 overflow-auto text-sm">
                      {notes.length === 0 ? <li className="text-ink-2">{t('No notes yet. Pause at a moment and write what you see.')}</li> : null}
                      {notes.map((n) => (
                        <li key={n.id}>
                          <button type="button" className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-surface" onClick={() => seek(Date.parse(n.atUtc))}>
                            <div className="flex items-center gap-2 text-xs text-ink-2">
                              <span className="font-mono">{new Date(n.atUtc).toLocaleTimeString(undefined, { hour12: false })}</span>
                              <StatusBadge tone="purple">{t(humanize(n.category))}</StatusBadge>
                              <span>{n.authorName ?? ''}</span>
                            </div>
                            <p className="mt-0.5">{n.note}</p>
                          </button>
                        </li>
                      ))}
                    </ol>
                    {canAnnotate ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (noteText.trim()) addNote.mutate({ category: noteCategory, note: noteText.trim() }, { onSuccess: () => setNoteText('') })
                        }}
                      >
                        <span className="text-xs text-ink-2">
                          {t('Note at {time}', { time: new Date(cursorMs).toLocaleTimeString(undefined, { hour12: false }) })}
                        </span>
                        <select className={controlClass()} aria-label={t('Kind')} value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)}>
                          <option value="NOTE">{t('Note')}</option>
                          <option value="OBSERVATION">{t('Observation')}</option>
                          <option value="ROOT_CAUSE">{t('Root cause')}</option>
                          <option value="ACTION">{t('Action')}</option>
                        </select>
                        <textarea
                          className={controlClass('area')}
                          rows={3}
                          maxLength={4000}
                          placeholder={t('What happened at this moment?')}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                        />
                        <Button type="submit" size="sm" variant="primary" disabled={addNote.isPending || !noteText.trim()}>
                          {t('Add note at the cursor')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                {tab === 'details' ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {runs.map((run, i) => (
                      <dl key={run.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-surface p-3 text-sm">
                        <dt className="col-span-2 mb-1 flex items-center gap-2 font-semibold">
                          <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="font-mono">{run.robotCode}</span>
                        </dt>
                        <dt className="text-ink-2">{t('Trip')}</dt>
                        <dd>{run.sourceJobNo ?? '—'}</dd>
                        <dt className="text-ink-2">{t('Trip status')}</dt>
                        <dd>{run.sourceRunStatus ? humanize(run.sourceRunStatus) : '—'}</dd>
                        <dt className="text-ink-2">{t('Containers')}</dt>
                        <dd>{run.assignedContainerIds.length}</dd>
                        <dt className="text-ink-2">{t('Evidence')}</dt>
                        <dd>{t(EVIDENCE_LABEL[run.evidenceStatus] ?? humanize(run.evidenceStatus))}</dd>
                        <dt className="text-ink-2">{t('Map')}</dt>
                        <dd>{run.mapVersion ?? '—'}</dd>
                        <dt className="text-ink-2">{t('Started')}</dt>
                        <dd>{run.startedAtUtc ? formatDateTimeFull(run.startedAtUtc) : '—'}</dd>
                        <dt className="text-ink-2">{t('Camera')}</dt>
                        <dd>
                          {run.recordings.length === 0
                            ? t('No camera recording')
                            : run.recordings.map((r) => `${r.cameraModel}${r.nominalFovDegrees ? ` · ${r.nominalFovDegrees}°` : ''}`).join(', ')}
                        </dd>
                      </dl>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function Fact({ icon, label, mono, children }: { icon: IconName; label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-sm bg-container px-3 py-2">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-ink-2" />
      <div className="min-w-0">
        <dt className="text-muted">{label}</dt>
        <dd className={cx('truncate text-ink', mono && 'font-mono')}>{children}</dd>
      </div>
    </div>
  )
}

function ControlButton({ icon, label, shortcut, onClick, disabled }: { icon: IconName; label: string; shortcut: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${shortcut})`}
      className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-container-high hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

type StepTone = 'blue' | 'amber' | 'green' | 'red' | 'grey'

const STEP_STATUS: Record<string, { label: string; tone: StepTone }> = {
  EXECUTING: { label: 'Running', tone: 'blue' },
  READY: { label: 'Running', tone: 'blue' },
  WAITING: { label: 'Waiting', tone: 'amber' },
  PAUSED: { label: 'Paused', tone: 'amber' },
  COMPLETED: { label: 'Done', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'grey' },
  SKIPPED: { label: 'Skipped', tone: 'grey' },
}

const STEP_TYPE_ICON: Record<string, IconName> = { MOVE: 'route', HUMAN_INTERACTION: 'user' }

/**
 * "Where is the trip at this second": the step under the cursor, its target, how long it has run and a dot per step.
 * Follows the cursor on every frame, so dragging the timeline or playing the video moves it with the picture.
 */
function CurrentStepBar({
  steps,
  current,
  cursorMs,
  color,
  onSeek,
  onJump,
}: {
  steps: StepSpan[]
  current: StepSpan | null
  cursorMs: number
  color: string
  onSeek: (t: number) => void
  onJump: (direction: 1 | -1) => void
}) {
  if (steps.length === 0) {
    return <p className="rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-ink-2">{t('This journal has no step data.')}</p>
  }
  const index = current ? steps.indexOf(current) : -1
  const before = !current && cursorMs < steps[0]!.startMs
  // The status the step had at the cursor: a step that later completed is still running before its end.
  const status = current ? (current.endMs != null && cursorMs < current.endMs && current.status === 'COMPLETED' ? 'EXECUTING' : current.status) : null
  const shown = status ? (STEP_STATUS[status] ?? { label: status, tone: 'grey' as const }) : null
  const position =
    current?.position != null && current.count != null ? `${current.position}/${current.count}` : index >= 0 ? `${index + 1}/${steps.length}` : null
  const target = current?.targetCode
    ? current.targetName && current.targetName !== current.targetCode
      ? `${current.targetName} (${current.targetCode})`
      : current.targetCode
    : null
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-outline-soft bg-container px-3 py-2"
      data-testid="current-step"
      data-step-id={current?.stepId ?? ''}
    >
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: current ? stepColor(current.type, color) : STEP_OTHER_COLOR }}
      >
        <Icon name={(current?.type && STEP_TYPE_ICON[current.type]) || 'list'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{t('Step now')}</span>
          {position ? <span className="font-mono text-xs text-ink-2">{position}</span> : null}
          {shown ? <StatusBadge tone={shown.tone}>{t(shown.label)}</StatusBadge> : null}
        </div>
        <p className="truncate text-sm font-semibold" data-testid="current-step-name">
          {current ? current.name : before ? t('Before the first step') : t('Between steps')}
          {target ? <span className="font-normal text-ink-2"> · {target}</span> : null}
        </p>
        {/* One dot per step; the current one is wide. Click to go to that step. */}
        <div className="mt-1 flex flex-wrap items-center gap-1" aria-label={t('Steps')}>
          {steps.map((s, i) => (
            <button
              key={s.stepId}
              type="button"
              onClick={() => onSeek(s.startMs)}
              title={`${i + 1}. ${s.name}${s.targetCode ? ` · ${s.targetCode}` : ''}`}
              aria-label={`${i + 1}. ${s.name}`}
              className={cx('h-1.5 rounded-full transition-all', s === current ? 'w-5' : 'w-1.5 opacity-50 hover:opacity-90')}
              style={{ background: s.startMs <= cursorMs ? stepColor(s.type, color) : 'var(--color-outline-variant)' }}
            />
          ))}
        </div>
      </div>
      {current ? (
        <span className="hidden shrink-0 text-right font-mono text-xs text-ink-2 tabular-nums sm:block">
          {formatElapsed(cursorMs - current.startMs)}
          {current.endMs != null ? <span className="text-muted"> / {formatElapsed(current.endMs - current.startMs)}</span> : null}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center">
        <ControlButton icon="chevronLeft" label={t('Previous step')} shortcut="," onClick={() => onJump(-1)} />
        <ControlButton
          icon="chevronRight"
          label={t('Next step')}
          shortcut="."
          onClick={() => onJump(1)}
          disabled={!steps.some((s) => s.startMs > cursorMs + 250)}
        />
      </div>
    </div>
  )
}

function EventList({
  events,
  runs,
  activeId,
  onSeek,
  empty,
}: {
  events: EvidenceEvent[]
  runs: ReplayRun[]
  activeId: string | null
  onSeek: (t: number) => void
  empty: string
}) {
  const list = useRef<HTMLOListElement>(null)
  // Keep the event under the cursor in view while playing.
  useEffect(() => {
    if (!activeId || !list.current) return
    list.current.querySelector(`[data-event="${activeId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])
  const robotOf = (runId: string | null) => runs.find((r) => r.id === runId)?.robotCode ?? null

  if (events.length === 0) return <p className="text-sm text-ink-2">{empty}</p>
  return (
    <ol ref={list} className="flex max-h-[320px] flex-col gap-0.5 overflow-auto text-sm">
      {events.map((e) => (
        <li key={e.id} data-event={e.id}>
          <button
            type="button"
            onClick={() => onSeek(Date.parse(e.occurredAtUtc) - 3000)}
            className={cx(
              'grid w-full grid-cols-[72px_88px_minmax(0,1fr)] items-start gap-3 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-surface sm:grid-cols-[72px_88px_96px_minmax(0,1fr)]',
              e.id === activeId && 'bg-primary/10 ring-1 ring-primary/30',
            )}
          >
            <span className="font-mono text-xs text-ink-2 tabular-nums">{new Date(e.occurredAtUtc).toLocaleTimeString(undefined, { hour12: false })}</span>
            <span>
              <StatusBadge tone={SEVERITY_TONE[e.severity] ?? 'grey'}>{t(SEVERITY_LABEL[e.severity] ?? e.severity)}</StatusBadge>
            </span>
            <span className="hidden truncate font-mono text-xs text-ink-2 sm:inline">{robotOf(e.runId) ?? humanize(e.sourceSystem)}</span>
            <span className="min-w-0">
              <span className="block truncate">{e.message ?? humanize(e.eventType)}</span>
              <span className="block truncate text-xs text-muted">{e.eventType}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
