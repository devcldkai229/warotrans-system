import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { evidenceApi, type EvidenceEvent, type RecordingSpans, type ReplayRecording, type ReplayRun } from '@/shared/api/evidence'
import { getMapVersionDetail } from '@/shared/api/navigation'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatDateTimeFull } from '@/shared/lib/format'
import { WarehouseMap, type MapCallout, type MapRobot, type MapTrail } from '@/shared/map/WarehouseMap'
import { mapDetailToGeometry } from '@/shared/map/mapVersionGeometry'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EVIDENCE_TONE, SEVERITY_TONE } from './journalTones'
import { CameraPlayer } from './replay/CameraPlayer'
import { JourneyTimeline } from './replay/JourneyTimeline'
import { cameraState, mediaAt, ms, pathUntil, planAt, poseAt } from './replay/replayModel'

const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed']

interface Camera {
  run: ReplayRun
  rec: ReplayRecording | null
}
const RATES = [0.5, 1, 2, 4]

/** Opens the journal of a transport request (links from the trip and request screens). */
export function JournalByRequestRedirect() {
  const { transportRequestId = '' } = useParams()
  const paths = usePaths()
  const journal = useQuery({ queryKey: ['evidence-journal-by-request', transportRequestId], queryFn: () => evidenceApi.journalByRequest(transportRequestId) })
  if (journal.data) return <Navigate to={paths.journals(journal.data.id)} replace />
  return (
    <div className="p-10 text-sm text-ink-2">{journal.isError ? t('No evidence journal for this request yet.') : t('Loading…')}</div>
  )
}

/**
 * Journey Replay (spec §11.3–11.5): every robot of a transport request on one UTC timeline. One global cursor drives
 * the map (actual path up to now, the plan of the moment, the robot where it really was), every camera (each mapped
 * through its own measured spans) and the incident list. Deep link: ?t=<epoch ms>&run=<run id>.
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
  const cursorMs = Math.min(Math.max(cursor ?? fromMs, fromMs), toMs)

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
        const next = (c ?? fromMs) + (now - before) * rate
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
  }, [playing, rate, fromMs, toMs])

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
  const eventsQuery = useQuery({ queryKey: ['evidence-events', journalId], queryFn: () => evidenceApi.events(journalId), enabled: Boolean(manifest) })
  const notesQuery = useQuery({ queryKey: ['evidence-notes', journalId], queryFn: () => evidenceApi.annotations(journalId), enabled: Boolean(manifest) })
  const mapVersionId = runs.find((r) => r.mapVersionId)?.mapVersionId ?? null
  const mapQuery = useQuery({ queryKey: ['map-detail', mapVersionId], queryFn: () => getMapVersionDetail(mapVersionId!), enabled: Boolean(mapVersionId), staleTime: 300_000 })
  const geometry = useMemo(() => mapDetailToGeometry(mapQuery.data), [mapQuery.data])

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

  const events = eventsQuery.data ?? []
  const [severityFilter, setSeverityFilter] = useState<'issues' | 'all'>('issues')
  const visibleEvents = events.filter((e) => severityFilter === 'all' || e.severity !== 'INFO')
  const selectedRunId = mainRun ?? runs[0]?.id ?? null
  const selectedIndex = Math.max(0, runs.findIndex((r) => r.id === selectedRunId))
  const selectedRun = runs[selectedIndex]
  const cameras: Camera[] = runs.flatMap((run): Camera[] => (run.recordings.length > 0 ? run.recordings.map((rec) => ({ run, rec })) : [{ run, rec: null }]))
  const ordered = [...cameras].sort((a, b) => (a.run.id === selectedRunId ? -1 : 0) - (b.run.id === selectedRunId ? -1 : 0))
  // The camera of a run that covers the cursor; when a run has several recordings (reboot) the one holding the cursor.
  const pickRecording = (runId: string) => {
    const options = ordered.filter((c) => c.run.id === runId && c.rec)
    return options.find((c) => c.rec && spansByRecording[c.rec.id] && mediaAt(spansByRecording[c.rec.id]!.spans, cursorMs)) ?? options[0] ?? null
  }
  const shown: Camera[] = runs.map((run) => pickRecording(run.id) ?? { run, rec: null })

  const addNote = useMutation({
    mutationFn: (body: { category: string; note: string }) =>
      evidenceApi.addAnnotation(journalId, { atUtc: new Date(cursorMs).toISOString(), runId: selectedRunId, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evidence-notes', journalId] }),
  })
  const [noteText, setNoteText] = useState('')
  const [noteCategory, setNoteCategory] = useState('OBSERVATION')

  if (manifestQuery.isError) return <div className="p-10 text-sm text-red-700">{(manifestQuery.error as Error).message}</div>
  if (!manifest) return <div className="p-10 text-sm text-ink-2">{t('Loading…')}</div>

  const seek = (time: number) => setCursor(Math.min(Math.max(time, fromMs), toMs))
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

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1600px] px-6 pt-6 pb-16">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <Link to={paths.journals()} className="text-sm text-ink-2 hover:underline">
            ← {t('Transport journals')}
          </Link>
          <h1 className="text-xl font-book">{manifest.requestCode}</h1>
          <span className="text-sm text-ink-2">{t('{count} containers', { count: manifest.requestedContainerCount })}</span>
          <StatusBadge tone="grey">{`${t('Request')}: ${manifest.sourceTransportStatus ?? '—'}`}</StatusBadge>
          <StatusBadge tone={EVIDENCE_TONE[manifest.evidenceStatus] ?? 'grey'}>{`${t('Evidence')}: ${manifest.evidenceStatus}`}</StatusBadge>
          <span className="text-sm text-ink-2">
            {formatDateTimeFull(manifest.fromUtc)} → {formatDateTimeFull(manifest.toUtc)}
          </span>
          {canExport ? (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void evidenceApi.exportPacket(journalId, manifest.requestCode)}>
              {t('Export evidence')}
            </Button>
          ) : null}
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
          <section className="relative h-[520px] overflow-hidden rounded-lg border border-outline-soft bg-container">
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
          </section>
          <section className="grid content-start gap-3">
            {shown.map(({ run, rec }, i) => (
              <button
                key={run.id}
                type="button"
                className="text-left"
                onClick={() => setMainRun(run.id)}
                aria-pressed={run.id === selectedRunId}
              >
                <CameraPlayer
                  robotCode={run.robotCode}
                  spans={rec ? spansByRecording[rec.id] ?? null : null}
                  hasRecording={Boolean(rec)}
                  cursorMs={cursorMs}
                  playing={playing}
                  rate={rate}
                  secondary={run.id !== selectedRunId && i > 0}
                />
              </button>
            ))}
          </section>
        </div>

        <section className="mt-4 rounded-lg border border-outline-soft bg-container p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? t('Pause') : t('Play')}
            </Button>
            <select className={controlClass('pill')} aria-label={t('Speed')} value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
            <span className="font-mono text-sm">{new Date(cursorMs).toLocaleTimeString(undefined, { hour12: false })}.{String(Math.floor(cursorMs % 1000)).padStart(3, '0')}</span>
            <span className="text-xs text-ink-2">{t('Local time; recorded in UTC')}</span>
          </div>
          <JourneyTimeline
            fromMs={fromMs}
            toMs={toMs}
            cursorMs={cursorMs}
            runs={runs}
            colors={COLORS}
            spansByRecording={spansByRecording}
            events={events}
            annotations={notesQuery.data ?? []}
            onSeek={seek}
          />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-outline-soft bg-container p-4 lg:col-span-1">
            <h2 className="mb-3 text-base font-medium">{t('Diagnostics')}</h2>
            {selectedRun ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-2">{t('Robot')}</dt>
                <dd>{selectedRun.robotCode}</dd>
                <dt className="text-ink-2">{t('Trip')}</dt>
                <dd>{selectedRun.sourceJobNo ?? '—'} ({selectedRun.startReason ?? '—'})</dd>
                <dt className="text-ink-2">{t('Containers')}</dt>
                <dd>{selectedRun.assignedContainerIds.length}</dd>
                <dt className="text-ink-2">{t('Trip status')}</dt>
                <dd>{selectedRun.sourceRunStatus ?? '—'}</dd>
                <dt className="text-ink-2">{t('Evidence')}</dt>
                <dd>{selectedRun.evidenceStatus}</dd>
                <dt className="text-ink-2">{t('Map')}</dt>
                <dd>{selectedRun.mapVersion ?? '—'}</dd>
                <dt className="text-ink-2">{t('Position')}</dt>
                <dd className="font-mono">{selectedPose ? `${selectedPose.x.toFixed(2)}, ${selectedPose.y.toFixed(2)}, ${((selectedPose.yaw * 180) / Math.PI).toFixed(0)}°` : t('N/A')}</dd>
                <dt className="text-ink-2">{t('Planned route')}</dt>
                <dd>{selectedPlan ? `v${selectedPlan.planVersion} (${selectedPlan.reason ?? '—'})` : t('N/A')}</dd>
                <dt className="text-ink-2">{t('Camera')}</dt>
                <dd>{selectedCamState}</dd>
                <dt className="text-ink-2">{t('Clock sync bound')}</dt>
                <dd>{selectedRun.timeSyncErrorBoundMs == null ? t('N/A') : selectedRun.timeSyncErrorBoundMs > 1e6 ? t('Not synchronized') : `±${Math.round(selectedRun.timeSyncErrorBoundMs)} ms`}</dd>
              </dl>
            ) : (
              <p className="text-sm text-ink-2">{t('No robot has taken a trip of this request yet.')}</p>
            )}
          </section>

          <section className="rounded-lg border border-outline-soft bg-container p-4 lg:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium">{t('Incidents and events')}</h2>
              <select className={controlClass('pill')} aria-label={t('Show')} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as 'issues' | 'all')}>
                <option value="issues">{t('Warnings and errors')}</option>
                <option value="all">{t('All events')}</option>
              </select>
            </div>
            <ol className="max-h-[360px] space-y-1 overflow-auto text-sm">
              {visibleEvents.length === 0 ? <li className="text-ink-2">{t('Nothing recorded.')}</li> : null}
              {visibleEvents.map((e: EvidenceEvent) => (
                <li key={e.id}>
                  <button type="button" className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-surface" onClick={() => seek(Date.parse(e.occurredAtUtc) - 3000)}>
                    <StatusBadge tone={SEVERITY_TONE[e.severity] ?? 'grey'}>{e.severity}</StatusBadge>
                    <span className="shrink-0 font-mono text-xs text-ink-2">{new Date(e.occurredAtUtc).toLocaleTimeString(undefined, { hour12: false })}</span>
                    <span>{e.message ?? e.eventType}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-outline-soft bg-container p-4 lg:col-span-1">
            <h2 className="mb-3 text-base font-medium">{t('Notes')}</h2>
            <ol className="mb-3 max-h-[240px] space-y-2 overflow-auto text-sm">
              {(notesQuery.data ?? []).map((n) => (
                <li key={n.id}>
                  <button type="button" className="text-left hover:underline" onClick={() => seek(Date.parse(n.atUtc))}>
                    <span className="font-mono text-xs text-ink-2">{new Date(n.atUtc).toLocaleTimeString(undefined, { hour12: false })}</span>{' '}
                    <strong>{n.category}</strong> {n.note}
                  </button>
                  <div className="text-xs text-ink-2">{n.authorName ?? ''}</div>
                </li>
              ))}
            </ol>
            {canAnnotate ? (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (noteText.trim()) addNote.mutate({ category: noteCategory, note: noteText.trim() }, { onSuccess: () => setNoteText('') })
                }}
              >
                <select className={controlClass()} aria-label={t('Kind')} value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)}>
                  <option value="NOTE">{t('Note')}</option>
                  <option value="OBSERVATION">{t('Observation')}</option>
                  <option value="ROOT_CAUSE">{t('Root cause')}</option>
                  <option value="ACTION">{t('Action')}</option>
                </select>
                <textarea
                  className={controlClass()}
                  rows={3}
                  maxLength={4000}
                  placeholder={t('What happened at this moment?')}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button type="submit" size="sm" variant="tonal" disabled={addNote.isPending || !noteText.trim()}>
                  {t('Add note at the cursor')}
                </Button>
              </form>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
