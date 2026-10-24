import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type {
  Edge,
  EdgeDirection,
  Endpoint,
  EndpointType,
  MapStatus,
  Point,
  Zone,
  ZoneType,
} from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import {
  cloneMapVersion,
  createEdge,
  createEndpoint,
  createZone,
  deleteEdge,
  deleteEndpoint,
  deleteZone,
  getMapVersionDetail,
  publishMapVersion,
  resolveMapAssetUrl,
  updateEdge,
  updateEndpoint,
  updateZone,
  type EdgeDto,
  type EndpointDto,
  type ZoneDto,
} from '@/shared/api/navigation'
import { listWorkflows } from '@/shared/api/workflows'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Field, FieldRow, SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { MAP_STATUS_TONE } from '@/shared/ui/statusTones'
import { pointsToLineString, pointsToPolygon } from '@/shared/map/geoJson'
import { worldToPixel, type PixelCoord, type WorldCoord } from '@/shared/map/mapCoordinateTransform'
import { WorkflowEditor } from '@/features/workflows/workflow-editor-page'
import { HeadingDial } from './HeadingDial'
import { EDGE_TEMPLATES, ENDPOINT_TEMPLATES, ZONE_TEMPLATES } from './constants'
import { MapEditorCanvas, type EditorTool } from './editor/MapEditorCanvas'
import { degToRad, normalizeYaw, radToDeg } from './yaw'

const WORKFLOW_PANEL = { min: 320, default: 460, key: 'warotrans.workflowPanelWidth' }
const INSPECTOR_WIDTH = 340
const PANEL_GAP = 12
const DEFAULT_YAW_DEG = 0
const DEFAULT_YAW_TOL_DEG = 5
const DEFAULT_POS_TOL_M = 0.1

const clampPanelWidth = (width: number) =>
  Math.min(Math.max(width, WORKFLOW_PANEL.min), Math.max(WORKFLOW_PANEL.min, Math.round(window.innerWidth * 0.7)))

function readPanelWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WORKFLOW_PANEL.key))
    return stored ? clampPanelWidth(stored) : WORKFLOW_PANEL.default
  } catch {
    return WORKFLOW_PANEL.default
  }
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'picker'; tool: 'workflows' }
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'placing'; endpointType: EndpointType; at: Point; yawDeg: number }
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'drawingEdge'; direction: EdgeDirection; points: Point[] }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'drawingZone'; zoneType: ZoneType; title: string; points: Point[] }

const MAP_TOOLS: { tool: EditorTool; label: string; icon: IconName }[] = [
  { tool: 'select', label: 'Select', icon: 'target' },
  { tool: 'pan', label: 'Pan', icon: 'navigate' },
  { tool: 'endpoint', label: 'Endpoint', icon: 'crosshair' },
  { tool: 'edge', label: 'Edge', icon: 'route' },
  { tool: 'zone', label: 'Zone', icon: 'layers' },
]

function snap(value: number) {
  return Math.round(value * 1000) / 1000
}

function toEndpoint(e: EndpointDto): Endpoint {
  return {
    id: e.id,
    mapVersionId: e.mapVersionId,
    code: e.code,
    name: e.name,
    endpointType: e.endpointType as EndpointType,
    x: e.x,
    y: e.y,
    yaw: e.yaw,
    positionTolerance: e.positionTolerance,
    yawTolerance: e.yawTolerance,
    isEnabled: e.isEnabled,
  }
}

function toEdge(e: EdgeDto): Edge {
  return {
    id: e.id,
    mapVersionId: e.mapVersionId,
    code: e.code,
    geometry: e.geometry,
    widthMeters: e.widthMeters,
    direction: e.direction as EdgeDirection,
    capacity: e.capacity,
    maxSpeed: e.maxSpeed,
    isActive: e.isActive,
  }
}

function toZone(z: ZoneDto): Zone {
  return {
    id: z.id,
    mapVersionId: z.mapVersionId,
    code: z.code,
    name: z.name,
    zoneType: z.zoneType as ZoneType,
    geometry: z.geometry,
    capacity: z.capacity,
    maxSpeed: z.maxSpeed,
    isActive: z.isActive,
    policy: z.policy,
    policySchemaVersion: z.policySchemaVersion,
  }
}

function Backdrop({ onClick }: { onClick: () => void }) {
  return <div className="absolute inset-0 z-10" onClick={onClick} />
}

function errMessage(err: unknown) {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Request failed'
}

export function MapEditorPage() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const detailQuery = useQuery({
    queryKey: ['navigation', 'map-detail', mapId],
    queryFn: () => getMapVersionDetail(mapId!),
    enabled: Boolean(mapId),
  })

  const version = detailQuery.data
  const isDraft = version?.status === 'DRAFT'
  const endpoints = useMemo(() => (version?.endpoints ?? []).map(toEndpoint), [version])
  const edges = useMemo(() => (version?.edges ?? []).map(toEdge), [version])
  const zones = useMemo(() => (version?.zones ?? []).map(toZone), [version])

  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get('state') === 'workflow' ? { kind: 'workflow', workflowId: 'new' } : { kind: 'idle' },
  )
  const [tool, setTool] = useState<EditorTool>('select')
  const [query, setQuery] = useState('')
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)
  const [epDraft, setEpDraft] = useState<Partial<Endpoint> | null>(null)
  const [edgeDraft, setEdgeDraft] = useState<{
    direction: EdgeDirection
    capacity: number
    widthMeters: number
    maxSpeed: string
    isActive: boolean
  } | null>(null)
  const [zoneDraft, setZoneDraft] = useState<{
    name: string
    zoneType: ZoneType
    capacity: number
    maxSpeed: string
    isActive: boolean
  } | null>(null)
  const latestWidth = useRef(panelWidth)

  const workflowsQuery = useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(),
    enabled: mode.kind === 'picker' && mode.tool === 'workflows',
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['navigation', 'map-detail', mapId] })
  }

  const publishMutation = useMutation({
    mutationFn: () => publishMapVersion(mapId!),
    onSuccess: async () => {
      await invalidate()
      navigate('/configure/facility')
    },
    onError: (err) => setActionError(errMessage(err)),
  })

  // Read-only (published / archived) map → edit a DRAFT copy of it.
  const cloneMutation = useMutation({
    mutationFn: () => cloneMapVersion(mapId!),
    onSuccess: async (copy) => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['navigation', 'maps'] })
      navigate(`/configure/facility/maps/${copy.id}/edit`)
    },
    onError: (err) => setActionError(errMessage(err)),
  })

  const transform = useMemo(() => {
    if (!version) return null
    return {
      resolution: version.resolution,
      originX: version.originX,
      originY: version.originY,
      originYaw: version.originYaw,
      imageWidthPixels: version.imageWidthPixels,
      imageHeightPixels: version.imageHeightPixels,
      frameId: version.frameId,
    }
  }, [version])

  const occupancyUrl = resolveMapAssetUrl(version?.previewImageUri)

  const selectedEndpoint =
    mode.kind === 'endpoint' ? endpoints.find((e) => e.id === mode.endpointId) : undefined
  const selectedEdge = mode.kind === 'edge' ? edges.find((e) => e.id === mode.edgeId) : undefined
  const selectedZone = mode.kind === 'zone' ? zones.find((z) => z.id === mode.zoneId) : undefined
  // The selected endpoint is drawn from its unsaved panel values, so editing X, Y, Yaw or the name moves it on the map
  // at once (and a drag on the map fills those fields back in); Save is what stores them.
  const canvasEndpoints = useMemo(() => {
    if (!selectedEndpoint || epDraft?.id !== selectedEndpoint.id) return endpoints
    const finite = (value: number | undefined, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return endpoints.map((e) =>
      e.id === selectedEndpoint.id
        ? {
            ...e,
            name: epDraft.name ?? e.name,
            x: finite(epDraft.x, e.x),
            y: finite(epDraft.y, e.y),
            yaw: finite(epDraft.yaw, e.yaw),
          }
        : e,
    )
  }, [endpoints, selectedEndpoint, epDraft])
  const workflowOpen = mode.kind === 'workflow'
  const panelOpen = Boolean(selectedZone ?? selectedEndpoint ?? selectedEdge ?? workflowOpen)
  const openPanelWidth = workflowOpen
    ? panelWidth
    : selectedZone || selectedEndpoint || selectedEdge
      ? INSPECTOR_WIDTH
      : 0

  const draftWorldPoints =
    mode.kind === 'drawingEdge' || mode.kind === 'drawingZone'
      ? mode.points
      : mode.kind === 'placing'
        ? [mode.at]
        : []
  const draftKind = mode.kind === 'drawingEdge' ? 'edge' : mode.kind === 'drawingZone' ? 'zone' : null

  function startPanelResize(event: ReactPointerEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    document.body.style.userSelect = 'none'
    const move = (moveEvent: PointerEvent) => {
      latestWidth.current = clampPanelWidth(startWidth + (startX - moveEvent.clientX))
      setPanelWidth(latestWidth.current)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.style.userSelect = ''
      try {
        window.localStorage.setItem(WORKFLOW_PANEL.key, String(latestWidth.current))
      } catch {
        // ignore
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function selectEndpoint(id: string) {
    const ep = endpoints.find((e) => e.id === id)
    if (!ep) return
    setEpDraft({ ...ep })
    setMode({ kind: 'endpoint', endpointId: id })
    setTool('select')
  }

  function selectEdge(id: string) {
    const edge = edges.find((e) => e.id === id)
    if (!edge) return
    setEdgeDraft({
      direction: edge.direction,
      capacity: edge.capacity,
      widthMeters: edge.widthMeters ?? 1,
      maxSpeed: edge.maxSpeed?.toString() ?? '',
      isActive: edge.isActive,
    })
    setMode({ kind: 'edge', edgeId: id })
    setTool('select')
  }

  function selectZone(id: string) {
    const zone = zones.find((z) => z.id === id)
    if (!zone) return
    setZoneDraft({
      name: zone.name,
      zoneType: zone.zoneType,
      capacity: zone.capacity,
      maxSpeed: zone.maxSpeed?.toString() ?? '',
      isActive: zone.isActive,
    })
    setMode({ kind: 'zone', zoneId: id })
    setTool('select')
  }

  function handleWorldClick(world: WorldCoord, _image: PixelCoord) {
    if (!isDraft || !version) return
    setActionError(null)
    const at = { x: snap(world.x), y: snap(world.y) }

    if (tool === 'endpoint' && mode.kind !== 'placing') {
      setMode({ kind: 'placing', endpointType: 'WAYPOINT', at, yawDeg: DEFAULT_YAW_DEG })
      return
    }
    if (mode.kind === 'placing') {
      setMode({ ...mode, at })
      return
    }
    if (mode.kind === 'drawingEdge') {
      setMode({ ...mode, points: [...mode.points, at] })
      return
    }
    if (mode.kind === 'drawingZone') {
      const first = mode.points[0]
      if (
        mode.points.length >= 3 &&
        first &&
        Math.hypot(at.x - first.x, at.y - first.y) < version.resolution * 4
      ) {
        void finishZone(mode.points)
        return
      }
      setMode({ ...mode, points: [...mode.points, at] })
    }
  }

  function handleWorldDoubleClick() {
    if (mode.kind === 'drawingEdge' && mode.points.length >= 2) void finishEdge(mode.points, mode.direction)
    if (mode.kind === 'drawingZone' && mode.points.length >= 3) void finishZone(mode.points)
  }

  async function placeEndpoint(endpointType: EndpointType, at: Point, yawDeg: number) {
    if (!version || !isDraft) return
    setActionError(null)
    try {
      const created = await createEndpoint(version.id, {
        name: `${endpointType} ${endpoints.length + 1}`,
        endpointType,
        x: at.x,
        y: at.y,
        yaw: degToRad(yawDeg),
        positionTolerance: DEFAULT_POS_TOL_M,
        yawTolerance: degToRad(DEFAULT_YAW_TOL_DEG),
      })
      await invalidate()
      setActionOk(`Created ${created.code}`)
      setMode({ kind: 'endpoint', endpointId: created.id })
      setEpDraft(toEndpoint(created))
      setTool('select')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function saveEndpoint() {
    if (!epDraft?.id || !isDraft) return
    setActionError(null)
    try {
      await updateEndpoint(epDraft.id, {
        name: epDraft.name ?? '',
        endpointType: epDraft.endpointType ?? 'WAYPOINT',
        x: Number(epDraft.x),
        y: Number(epDraft.y),
        yaw: Number(epDraft.yaw),
        positionTolerance: Number(epDraft.positionTolerance),
        yawTolerance: Number(epDraft.yawTolerance),
        isEnabled: epDraft.isEnabled ?? true,
      })
      await invalidate()
      setActionOk('Endpoint saved')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeEndpoint(id: string) {
    if (!isDraft) return
    try {
      await deleteEndpoint(id)
      await invalidate()
      setMode({ kind: 'idle' })
      setEpDraft(null)
      setActionOk('Endpoint deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function finishEdge(points: Point[], direction: EdgeDirection) {
    if (!version || !isDraft || points.length < 2) return
    setActionError(null)
    try {
      const created = await createEdge(version.id, {
        geometry: pointsToLineString(points),
        widthMeters: 1,
        direction,
        capacity: 1,
        maxSpeed: null,
        isActive: true,
      })
      await invalidate()
      setActionOk(`Created ${created.code}`)
      setEdgeDraft({
        direction: created.direction as EdgeDirection,
        capacity: created.capacity,
        widthMeters: created.widthMeters,
        maxSpeed: created.maxSpeed?.toString() ?? '',
        isActive: created.isActive,
      })
      setMode({ kind: 'edge', edgeId: created.id })
      setTool('select')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function saveEdge() {
    if (mode.kind !== 'edge' || !edgeDraft || !isDraft) return
    const edge = edges.find((e) => e.id === mode.edgeId)
    if (!edge) return
    setActionError(null)
    try {
      await updateEdge(edge.id, {
        geometry: edge.geometry,
        widthMeters: edgeDraft.widthMeters,
        direction: edgeDraft.direction,
        capacity: edgeDraft.capacity,
        maxSpeed: edgeDraft.maxSpeed === '' ? null : Number(edgeDraft.maxSpeed),
        isActive: edgeDraft.isActive,
      })
      await invalidate()
      setActionOk('Edge saved')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeEdge(id: string) {
    if (!isDraft) return
    try {
      await deleteEdge(id)
      await invalidate()
      setMode({ kind: 'idle' })
      setEdgeDraft(null)
      setActionOk('Edge deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // A vertex was dragged on the selected edge/zone. The outline is saved on release together with the shape's saved
  // fields (not unsaved panel edits), and shown at once so it does not jump back while the request is in flight.
  async function moveShapeVertices(shape: { kind: 'edge' | 'zone'; id: string }, points: Point[]) {
    if (!version || !isDraft) return
    setActionError(null)
    const rounded = points.map((p) => ({ x: snap(p.x), y: snap(p.y) }))
    const detailKey = ['navigation', 'map-detail', mapId]
    try {
      if (shape.kind === 'edge') {
        const edge = edges.find((e) => e.id === shape.id)
        if (!edge) return
        const geometry = pointsToLineString(rounded)
        queryClient.setQueryData<typeof version>(detailKey, (old) =>
          old && { ...old, edges: old.edges.map((e) => (e.id === edge.id ? { ...e, geometry } : e)) },
        )
        await updateEdge(edge.id, {
          geometry,
          widthMeters: edge.widthMeters ?? 1,
          direction: edge.direction,
          capacity: edge.capacity,
          maxSpeed: edge.maxSpeed,
          isActive: edge.isActive,
        })
        setActionOk('Edge saved')
      } else {
        const zone = zones.find((z) => z.id === shape.id)
        if (!zone) return
        const geometry = pointsToPolygon(rounded)
        queryClient.setQueryData<typeof version>(detailKey, (old) =>
          old && { ...old, zones: old.zones.map((z) => (z.id === zone.id ? { ...z, geometry } : z)) },
        )
        await updateZone(zone.id, {
          name: zone.name,
          zoneType: zone.zoneType,
          geometry,
          capacity: zone.capacity,
          maxSpeed: zone.maxSpeed,
          isActive: zone.isActive,
          policy: zone.policy ?? null,
          policySchemaVersion: zone.policySchemaVersion ?? 1,
        })
        setActionOk('Zone saved')
      }
      await invalidate()
    } catch (err) {
      setActionError(errMessage(err))
      await invalidate()
    }
  }

  function buildZonePolicy(_draft: NonNullable<typeof zoneDraft>) {
    return null
  }

  async function finishZone(points: Point[], zoneType?: ZoneType, title?: string) {
    if (!version || !isDraft || points.length < 3) return
    const type = zoneType ?? (mode.kind === 'drawingZone' ? mode.zoneType : 'KEEP_OUT')
    const name =
      title ?? (mode.kind === 'drawingZone' ? `${mode.title} - ${zones.length + 1}` : `Zone ${zones.length + 1}`)
    setActionError(null)
    try {
      const created = await createZone(version.id, {
        name,
        zoneType: type,
        geometry: pointsToPolygon(points),
        capacity: type === 'SINGLE_OCCUPANCY' ? 1 : 2,
        maxSpeed: type === 'SPEED' ? 0.5 : null,
        isActive: true,
      })
      await invalidate()
      setActionOk(`Created ${created.code}`)
      setZoneDraft({
        name: created.name,
        zoneType: created.zoneType as ZoneType,
        capacity: created.capacity,
        maxSpeed: created.maxSpeed?.toString() ?? '',
        isActive: created.isActive,
      })
      setMode({ kind: 'zone', zoneId: created.id })
      setTool('select')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function saveZone() {
    if (mode.kind !== 'zone' || !zoneDraft || !isDraft) return
    const zone = zones.find((z) => z.id === mode.zoneId)
    if (!zone) return
    setActionError(null)
    try {
      await updateZone(zone.id, {
        name: zoneDraft.name,
        zoneType: zoneDraft.zoneType,
        geometry: zone.geometry,
        capacity: zoneDraft.capacity,
        maxSpeed: zoneDraft.maxSpeed === '' ? null : Number(zoneDraft.maxSpeed),
        isActive: zoneDraft.isActive,
        policy: buildZonePolicy(zoneDraft),
        policySchemaVersion: 1,
      })
      await invalidate()
      setActionOk('Zone saved')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeZone(id: string) {
    if (!isDraft) return
    try {
      await deleteZone(id)
      await invalidate()
      setMode({ kind: 'idle' })
      setZoneDraft(null)
      setActionOk('Zone deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  function startEdge(direction: EdgeDirection) {
    if (!isDraft) return
    setTool('edge')
    setMode({ kind: 'drawingEdge', direction, points: [] })
  }

  function startZone(zoneType: ZoneType, title: string) {
    if (!isDraft) return
    setTool('zone')
    setMode({ kind: 'drawingZone', zoneType, title, points: [] })
  }

  const lowered = query.toLowerCase()

  if (detailQuery.isLoading) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-surface text-sm text-muted">Loading map…</div>
    )
  }

  if (!version) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-surface">
        <div className="text-center">
          <p className="text-sm text-ink-2">Map version not found.</p>
          <Button className="mt-4" variant="primary" onClick={() => navigate('/configure/facility')}>
            Back to Facility
          </Button>
        </div>
      </div>
    )
  }

  if (!transform || version.imageWidthPixels <= 0 || version.imageHeightPixels <= 0) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-surface">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="text-sm text-ink-2">
            This draft has no occupancy image yet (image width/height is 0). Create-metadata-only maps cannot be
            edited until you Import <span className="font-mono">map.yaml</span> +{' '}
            <span className="font-mono">map.pgm</span> on Facility.
          </p>
          <Button className="mt-4" variant="primary" onClick={() => navigate('/configure/facility')}>
            Back to Facility · Import assets
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex min-w-[1100px] flex-col bg-surface">
      <header className="flex h-14 flex-none items-center gap-3 pr-6 pl-3">
        <IconButton aria-label="Back to Facility" onClick={() => navigate('/configure/facility')}>
          <Icon name="arrowLeft" size={18} />
        </IconButton>
        <h1 className="text-base font-medium">
          {version.code} · v{version.versionNo}
        </h1>
        <StatusBadge tone={MAP_STATUS_TONE[version.status as MapStatus] ?? 'grey'}>{version.status}</StatusBadge>
        {version.sourceMapVersionCode ? (
          <span className="text-xs text-muted">Cloned from {version.sourceMapVersionCode}</span>
        ) : null}
        <span className="ml-2 flex items-center gap-2 text-xs text-muted">
          {actionError ? (
            <span className="text-red">{actionError}</span>
          ) : actionOk ? (
            <>
              <span className="size-1.5 rounded-full bg-green" /> {actionOk}
            </>
          ) : isDraft ? (
            'World meters · pan/zoom display-only · continuous image coords'
          ) : (
            'Read-only: only DRAFT maps can be edited. Clone & edit makes an editable copy.'
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/configure/facility')}>
            Close
          </Button>
          {isDraft ? (
            <Button variant="primary" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
              Publish
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={cloneMutation.isPending}
              title="Copy this map (image, endpoints, zones, edges) into a new DRAFT and edit the copy"
              onClick={() => cloneMutation.mutate()}
            >
              {cloneMutation.isPending ? 'Cloning…' : 'Clone & edit'}
            </Button>
          )}
        </div>
      </header>

      <div className="relative flex h-12 flex-none items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {panelOpen ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setMode({ kind: 'idle' })
                  setEpDraft(null)
                  setEdgeDraft(null)
                  setZoneDraft(null)
                }}
              >
                Done
              </Button>
              {workflowOpen ? (
                <span className="ml-2 inline-flex items-center gap-2 text-sm text-muted">
                  <Icon name="workflow" size={15} /> Workflows
                  <Icon name="chevronRight" size={12} />
                  <strong className="font-medium text-ink">
                    {mode.kind === 'workflow' && mode.workflowId === 'new' ? 'New workflow' : 'Edit workflow'}
                  </strong>
                </span>
              ) : null}
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode({ kind: 'picker', tool: 'workflows' })}
            >
              <Icon name="workflow" size={14} /> Workflows
            </Button>
          )}
          {(mode.kind === 'drawingEdge' || mode.kind === 'drawingZone') && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={mode.points.length === 0}
                onClick={() => setMode({ ...mode, points: mode.points.slice(0, -1) })}
              >
                Undo point
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'idle' })}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={
                  mode.kind === 'drawingEdge' ? mode.points.length < 2 : mode.points.length < 3
                }
                onClick={() => {
                  if (mode.kind === 'drawingEdge') void finishEdge(mode.points, mode.direction)
                  if (mode.kind === 'drawingZone') void finishZone(mode.points)
                }}
              >
                Finish
              </Button>
            </>
          )}
        </div>

        {!panelOpen ? (
          <div className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1 rounded-full bg-container-high p-1">
            {MAP_TOOLS.map((item) => (
              <button
                key={item.tool}
                type="button"
                disabled={!isDraft && item.tool !== 'select' && item.tool !== 'pan'}
                className={cx(
                  'flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition-colors duration-200 disabled:opacity-40',
                  tool === item.tool ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface hover:text-ink',
                )}
                aria-pressed={tool === item.tool}
                onClick={() => {
                  setTool(item.tool)
                  if (item.tool === 'select' || item.tool === 'pan') setMode({ kind: 'idle' })
                }}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-container">
        <div className="absolute inset-0" style={{ right: openPanelWidth ? openPanelWidth + PANEL_GAP : 0 }}>
          <MapEditorCanvas
            transform={transform}
            previewUrl={occupancyUrl}
            endpoints={canvasEndpoints}
            edges={edges}
            zones={zones}
            tool={tool}
            readOnly={!isDraft}
            selected={{
              endpointId: selectedEndpoint?.id,
              edgeId: selectedEdge?.id,
              zoneId: selectedZone?.id,
            }}
            draftWorldPoints={draftWorldPoints}
            draftKind={draftKind}
            onWorldClick={handleWorldClick}
            onWorldDoubleClick={handleWorldDoubleClick}
            onEndpointClick={isDraft ? selectEndpoint : undefined}
            onEdgeClick={isDraft ? selectEdge : undefined}
            onZoneClick={isDraft ? selectZone : undefined}
            onShapeVerticesChange={moveShapeVertices}
            onEndpointMove={
              isDraft
                ? (id, at) =>
                    setEpDraft((draft) => (draft?.id === id ? { ...draft, x: snap(at.x), y: snap(at.y) } : draft))
                : undefined
            }
            pendingEndpoint={
              mode.kind === 'placing' ? { at: mode.at, yaw: degToRad(mode.yawDeg) } : null
            }
            onPendingEndpointMove={(at) =>
              setMode((current) =>
                current.kind === 'placing' ? { ...current, at: { x: snap(at.x), y: snap(at.y) } } : current,
              )
            }
          />

          {mode.kind === 'placing' ? (
            // Kept to the side of the map the marker is not on, so the dialog never covers the spot being placed.
            <div
              className={cx(
                'absolute top-3 z-20 w-72 rounded-md bg-surface p-3.5 text-xs shadow-float',
                worldToPixel(transform, mode.at).u < transform.imageWidthPixels / 2 ? 'right-3' : 'left-3',
              )}
            >
              <p className="text-ink-2">
                Click the map or drag the marker to move it. Set heading ({mode.yawDeg}°). Yaw is sent as radians to
                the API.
              </p>
              <HeadingDial
                variant="panel"
                yaw={mode.yawDeg}
                onChange={(yaw) => setMode({ ...mode, yawDeg: yaw })}
              />
              <select
                className={controlClass('sm')}
                value={mode.endpointType}
                aria-label="Endpoint type"
                onChange={(event) => setMode({ ...mode, endpointType: event.target.value as EndpointType })}
              >
                {ENDPOINT_TEMPLATES.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.title}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'idle' })}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void placeEndpoint(mode.endpointType, mode.at, mode.yawDeg)}
                >
                  Create endpoint
                </Button>
              </div>
            </div>
          ) : null}

          {tool === 'endpoint' && mode.kind === 'idle' && isDraft ? (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-xs text-ink-2 shadow-float">
              Click the map to place an Endpoint
            </div>
          ) : null}

          {tool === 'edge' && mode.kind === 'idle' && isDraft ? (
            <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-md bg-surface p-2 shadow-float">
              {EDGE_TEMPLATES.map((item) => (
                <Button key={item.direction} size="sm" variant="outline" onClick={() => startEdge(item.direction)}>
                  {item.title}
                </Button>
              ))}
            </div>
          ) : null}

          {tool === 'zone' && mode.kind === 'idle' && isDraft ? (
            <div className="absolute top-3 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 flex-wrap justify-center gap-2 rounded-md bg-surface p-2 shadow-float">
              {ZONE_TEMPLATES.map((item) => (
                <Button key={item.type} size="sm" variant="outline" onClick={() => startZone(item.type, item.title)}>
                  {item.title}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {mode.kind === 'picker' ? (
          <>
            <Backdrop onClick={() => setMode({ kind: 'idle' })} />
            <div className="absolute top-3 left-1/2 z-20 max-h-[calc(100%-24px)] w-[380px] -translate-x-1/2 overflow-auto rounded-lg bg-surface p-2 shadow-float">
              <div className="flex items-center justify-between px-2 py-2">
                <h3 className="text-sm font-medium">Workflows</h3>
                <Button variant="primary" size="sm" onClick={() => setMode({ kind: 'workflow', workflowId: 'new' })}>
                  New
                </Button>
              </div>
              <SearchInput value={query} onChange={setQuery} placeholder="Search workflows" className="mb-2" />
              {workflowsQuery.isLoading ? (
                <p className="px-2 py-4 text-sm text-muted">Loading…</p>
              ) : (
                (workflowsQuery.data?.items ?? [])
                  .filter((w) => w.name.toLowerCase().includes(lowered))
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-container-high"
                      onClick={() => setMode({ kind: 'workflow', workflowId: w.id })}
                    >
                      <span>{w.name}</span>
                      <StatusBadge tone={w.status === 'PUBLISHED' ? 'green' : 'amber'}>{w.status}</StatusBadge>
                    </button>
                  ))
              )}
            </div>
          </>
        ) : null}

        {selectedEndpoint && epDraft ? (
          <Inspector title="Endpoint" onClose={() => setMode({ kind: 'idle' })}>
            <Field label="Code">
              <input className={controlClass()} value={selectedEndpoint.code} readOnly disabled />
            </Field>
            <Field label="Name">
              <input
                className={controlClass()}
                value={epDraft.name ?? ''}
                disabled={!isDraft}
                onChange={(e) => setEpDraft({ ...epDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={controlClass()}
                value={epDraft.endpointType}
                disabled={!isDraft}
                onChange={(e) => setEpDraft({ ...epDraft, endpointType: e.target.value as EndpointType })}
              >
                {ENDPOINT_TEMPLATES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <FieldRow>
              <Field label="X (m)">
                <input
                  className={controlClass()}
                  type="number"
                  step="0.001"
                  value={epDraft.x ?? 0}
                  disabled={!isDraft}
                  onChange={(e) => setEpDraft({ ...epDraft, x: Number(e.target.value) })}
                />
              </Field>
              <Field label="Y (m)">
                <input
                  className={controlClass()}
                  type="number"
                  step="0.001"
                  value={epDraft.y ?? 0}
                  disabled={!isDraft}
                  onChange={(e) => setEpDraft({ ...epDraft, y: Number(e.target.value) })}
                />
              </Field>
            </FieldRow>
            <Field label={`Yaw (${radToDeg(epDraft.yaw ?? 0).toFixed(1)}° → rad)`}>
              <input
                className={controlClass()}
                type="number"
                step="0.1"
                value={radToDeg(epDraft.yaw ?? 0)}
                disabled={!isDraft}
                onChange={(e) => setEpDraft({ ...epDraft, yaw: degToRad(Number(e.target.value)) })}
              />
            </Field>
            <HeadingDial
              variant="panel"
              yaw={radToDeg(epDraft.yaw ?? 0)}
              onChange={(deg) => isDraft && setEpDraft({ ...epDraft, yaw: degToRad(normalizeYaw(deg)) })}
            />
            <FieldRow>
              <Field label="Pos. tol (m)">
                <input
                  className={controlClass()}
                  type="number"
                  step="0.01"
                  value={epDraft.positionTolerance ?? 0.1}
                  disabled={!isDraft}
                  onChange={(e) => setEpDraft({ ...epDraft, positionTolerance: Number(e.target.value) })}
                />
              </Field>
              <Field label="Yaw tol (°)">
                <input
                  className={controlClass()}
                  type="number"
                  step="0.1"
                  value={radToDeg(epDraft.yawTolerance ?? degToRad(5))}
                  disabled={!isDraft}
                  onChange={(e) => setEpDraft({ ...epDraft, yawTolerance: degToRad(Number(e.target.value)) })}
                />
              </Field>
            </FieldRow>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={epDraft.isEnabled ?? true}
                disabled={!isDraft}
                onChange={(e) => setEpDraft({ ...epDraft, isEnabled: e.target.checked })}
              />
              Enabled
            </label>
            {isDraft ? (
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => void saveEndpoint()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => void removeEndpoint(selectedEndpoint.id)}>
                  Delete
                </Button>
              </div>
            ) : null}
          </Inspector>
        ) : null}

        {selectedEdge && edgeDraft ? (
          <Inspector title="Edge" onClose={() => setMode({ kind: 'idle' })}>
            <Field label="Code">
              <input className={controlClass()} value={selectedEdge.code} readOnly disabled />
            </Field>
            <Field label="Direction">
              <select
                className={controlClass()}
                value={edgeDraft.direction}
                disabled={!isDraft}
                onChange={(e) => setEdgeDraft({ ...edgeDraft, direction: e.target.value as EdgeDirection })}
              >
                {EDGE_TEMPLATES.map((t) => (
                  <option key={t.direction} value={t.direction}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <FieldRow>
              <Field label="Capacity">
                <input
                  className={controlClass()}
                  type="number"
                  min={1}
                  value={edgeDraft.capacity}
                  disabled={!isDraft}
                  onChange={(e) => setEdgeDraft({ ...edgeDraft, capacity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Width (m)">
                <input
                  className={controlClass()}
                  type="number"
                  step="0.05"
                  min={0.01}
                  value={edgeDraft.widthMeters}
                  disabled={!isDraft}
                  onChange={(e) => setEdgeDraft({ ...edgeDraft, widthMeters: Number(e.target.value) })}
                />
              </Field>
            </FieldRow>
            <Field label="Max speed (m/s)">
              <input
                className={controlClass()}
                value={edgeDraft.maxSpeed}
                disabled={!isDraft}
                placeholder="optional"
                onChange={(e) => setEdgeDraft({ ...edgeDraft, maxSpeed: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edgeDraft.isActive}
                disabled={!isDraft}
                onChange={(e) => setEdgeDraft({ ...edgeDraft, isActive: e.target.checked })}
              />
              Active
            </label>
            <p className="text-xs text-muted">{selectedEdge.geometry.coordinates.length} LineString vertices (world m)</p>
            {isDraft ? (
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => void saveEdge()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => void removeEdge(selectedEdge.id)}>
                  Delete
                </Button>
              </div>
            ) : null}
          </Inspector>
        ) : null}

        {selectedZone && zoneDraft ? (
          <Inspector title="Zone" onClose={() => setMode({ kind: 'idle' })}>
            <Field label="Code">
              <input className={controlClass()} value={selectedZone.code} readOnly disabled />
            </Field>
            <Field label="Name">
              <input
                className={controlClass()}
                value={zoneDraft.name}
                disabled={!isDraft}
                onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={controlClass()}
                value={zoneDraft.zoneType}
                disabled={!isDraft}
                onChange={(e) => {
                  const next = e.target.value as ZoneType
                  setZoneDraft({
                    ...zoneDraft,
                    zoneType: next,
                    capacity: next === 'SINGLE_OCCUPANCY' ? 1 : zoneDraft.capacity,
                    maxSpeed: next === 'SPEED' && zoneDraft.maxSpeed === '' ? '0.5' : zoneDraft.maxSpeed,
                  })
                }}
              >
                {ZONE_TEMPLATES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            {zoneDraft.zoneType === 'SPEED' ? (
              <p className="text-xs text-amber-ink">SPEED requires MaxSpeed (m/s).</p>
            ) : null}
            {zoneDraft.zoneType === 'SINGLE_OCCUPANCY' ? (
              <p className="text-xs text-amber-ink">SINGLE_OCCUPANCY requires Capacity = 1.</p>
            ) : null}
            <FieldRow>
              <Field label="Capacity">
                <input
                  className={controlClass()}
                  type="number"
                  min={1}
                  value={zoneDraft.capacity}
                  disabled={!isDraft}
                  onChange={(e) => setZoneDraft({ ...zoneDraft, capacity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Max speed (m/s)">
                <input
                  className={controlClass()}
                  value={zoneDraft.maxSpeed}
                  disabled={!isDraft}
                  onChange={(e) => setZoneDraft({ ...zoneDraft, maxSpeed: e.target.value })}
                />
              </Field>
            </FieldRow>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={zoneDraft.isActive}
                disabled={!isDraft}
                onChange={(e) => setZoneDraft({ ...zoneDraft, isActive: e.target.checked })}
              />
              Active
            </label>
            {isDraft ? (
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => void saveZone()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => void removeZone(selectedZone.id)}>
                  Delete
                </Button>
              </div>
            ) : null}
          </Inspector>
        ) : null}

        {workflowOpen && mode.kind === 'workflow' ? (
          <aside
            className="absolute top-0 right-0 z-20 flex h-full flex-col border-l border-outline-soft bg-surface shadow-float"
            style={{ width: panelWidth }}
          >
            <div
              className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize"
              onPointerDown={startPanelResize}
            />
            <WorkflowEditor
              workflowId={mode.workflowId === 'new' ? 'new' : mode.workflowId}
              variant="panel"
              onSaved={(id) => setMode({ kind: 'workflow', workflowId: id })}
              onClose={() => setMode({ kind: 'idle' })}
            />
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function Inspector({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <aside
      className="absolute top-0 right-0 z-20 flex h-full flex-col gap-3 overflow-auto border-l border-outline-soft bg-surface p-4 shadow-float"
      style={{ width: INSPECTOR_WIDTH }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <IconButton aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
      </div>
      {children}
    </aside>
  )
}
