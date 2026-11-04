import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type {
  Edge,
  EdgeDirection,
  Endpoint,
  EndpointType,
  GeoJsonLineString,
  GeoJsonPolygon,
  MapStatus,
  Point,
  Zone,
  ZoneType,
} from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import {
  checkRouteGraph,
  clearRouteGraphCache,
  cloneMapVersion,
  downloadRouteGraphGeoJson,
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
  type RouteGraphValidationDto,
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
import { lineStringToPoints, pointsToLineString, pointsToPolygon, polygonToPoints } from '@/shared/map/geoJson'
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
/** Local-only id until the user clicks Save (no row in the database yet). */
const NEW_ENTITY_ID = '__new__'
const isUnsavedId = (id: string | undefined | null) => id === NEW_ENTITY_ID

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
  | { kind: 'placing'; endpointType: EndpointType; name: string; at: Point; yawDeg: number }
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

// A duplicate lands this far right and down of the original (metres) so both stay visible and clickable.
const DUPLICATE_OFFSET = { x: 0.5, y: -0.5 }

function offsetPoints(points: Point[]): Point[] {
  return points.map((p) => ({ x: snap(p.x + DUPLICATE_OFFSET.x), y: snap(p.y + DUPLICATE_OFFSET.y) }))
}

// Endpoint / zone / edge codes come from the name on the backend (EP-/ZONE-/EDGE-{NAME}: trimmed, upper case, spaces → '-')
// and must be unique on the map, so the copy's name is "<name> copy", then "<name> copy 2", ... whose code is free.
function duplicateName(name: string, prefix: 'EP' | 'ZONE' | 'EDGE', takenCodes: string[]): string {
  const taken = new Set(takenCodes.map((c) => c.toUpperCase()))
  const codeOf = (n: string) => `${prefix}-${n.trim().toUpperCase().replaceAll(' ', '-')}`
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? `${name} copy` : `${name} copy ${i}`
    if (!taken.has(codeOf(candidate))) return candidate
  }
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
    name: e.name,
    geometry: e.geometry,
    widthMeters: e.widthMeters,
    direction: e.direction as EdgeDirection,
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
  const [graphReport, setGraphReport] = useState<RouteGraphValidationDto | null>(null)
  const [epDraft, setEpDraft] = useState<Partial<Endpoint> | null>(null)
  const [edgeDraft, setEdgeDraft] = useState<{
    name: string
    direction: EdgeDirection
    widthMeters: number
    maxSpeed: string
    isActive: boolean
    geometry: GeoJsonLineString
  } | null>(null)
  const [zoneDraft, setZoneDraft] = useState<{
    name: string
    zoneType: ZoneType
    maxSpeed: string
    isActive: boolean
    geometry: GeoJsonPolygon
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

  const checkGraphMutation = useMutation({
    mutationFn: () => checkRouteGraph(mapId!),
    onSuccess: (report) => {
      setGraphReport(report)
      setActionError(null)
      setActionOk(
        report.isValid
          ? `Route graph OK · ${report.nodeCount} nodes · ${report.edgeCount} edges · ${report.graphHash.slice(0, 8)}…`
          : `Route graph has ${report.issues.filter((i) => i.severity === 'ERROR').length} error(s)`,
      )
    },
    onError: (err) => {
      setGraphReport(null)
      setActionError(errMessage(err))
    },
  })

  const clearGraphCacheMutation = useMutation({
    mutationFn: () => clearRouteGraphCache(mapId!),
    onSuccess: () => {
      setGraphReport(null)
      setActionError(null)
      setActionOk('Compiled graph cache cleared — next check/sim rebuilds from Edges / Endpoints / Zones')
    },
    onError: (err) => setActionError(errMessage(err)),
  })

  const viewRouteGraphMutation = useMutation({
    mutationFn: async () => {
      const code = version?.code?.replace(/[^A-Za-z0-9_-]+/g, '_') || mapId!
      await downloadRouteGraphGeoJson(mapId!, `route_graph_${code}.geojson`)
      return code
    },
    onSuccess: (code) => {
      setActionError(null)
      setActionOk(`Downloaded route graph · ${code}.geojson`)
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 422) {
        try {
          const report = await checkRouteGraph(mapId!)
          setGraphReport(report)
          setActionOk(null)
          setActionError(
            `Route graph invalid — ${report.issues.filter((i) => i.severity === 'ERROR').length} error(s); fix then View again`,
          )
          return
        } catch {
          /* fall through */
        }
      }
      setActionError(errMessage(err))
    },
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

  const mapVersionId = version?.id ?? ''

  const selectedEndpoint = useMemo((): Endpoint | undefined => {
    if (mode.kind !== 'endpoint' || !epDraft) return undefined
    if (isUnsavedId(mode.endpointId)) {
      return {
        id: NEW_ENTITY_ID,
        mapVersionId,
        code: '',
        name: epDraft.name ?? '',
        endpointType: (epDraft.endpointType as EndpointType) ?? 'WAYPOINT',
        x: epDraft.x ?? 0,
        y: epDraft.y ?? 0,
        yaw: epDraft.yaw ?? 0,
        positionTolerance: epDraft.positionTolerance ?? DEFAULT_POS_TOL_M,
        yawTolerance: epDraft.yawTolerance ?? degToRad(DEFAULT_YAW_TOL_DEG),
        isEnabled: epDraft.isEnabled ?? true,
      }
    }
    return endpoints.find((e) => e.id === mode.endpointId)
  }, [mode, epDraft, endpoints, mapVersionId])

  const selectedEdge = useMemo((): Edge | undefined => {
    if (mode.kind !== 'edge' || !edgeDraft) return undefined
    if (isUnsavedId(mode.edgeId)) {
      return {
        id: NEW_ENTITY_ID,
        mapVersionId,
        code: '',
        name: edgeDraft.name,
        geometry: edgeDraft.geometry,
        widthMeters: edgeDraft.widthMeters,
        direction: edgeDraft.direction,
        maxSpeed: edgeDraft.maxSpeed === '' ? null : Number(edgeDraft.maxSpeed),
        isActive: edgeDraft.isActive,
      }
    }
    const edge = edges.find((e) => e.id === mode.edgeId)
    return edge
      ? {
          ...edge,
          name: edgeDraft.name,
          geometry: edgeDraft.geometry,
          widthMeters: edgeDraft.widthMeters,
          direction: edgeDraft.direction,
          maxSpeed: edgeDraft.maxSpeed === '' ? null : Number(edgeDraft.maxSpeed),
          isActive: edgeDraft.isActive,
        }
      : undefined
  }, [mode, edgeDraft, edges, mapVersionId])

  const selectedZone = useMemo((): Zone | undefined => {
    if (mode.kind !== 'zone' || !zoneDraft) return undefined
    if (isUnsavedId(mode.zoneId)) {
      return {
        id: NEW_ENTITY_ID,
        mapVersionId,
        code: '',
        name: zoneDraft.name,
        zoneType: zoneDraft.zoneType,
        geometry: zoneDraft.geometry,
        maxSpeed: zoneDraft.maxSpeed === '' ? null : Number(zoneDraft.maxSpeed),
        isActive: zoneDraft.isActive,
      }
    }
    const zone = zones.find((z) => z.id === mode.zoneId)
    return zone
      ? {
          ...zone,
          name: zoneDraft.name,
          zoneType: zoneDraft.zoneType,
          geometry: zoneDraft.geometry,
          maxSpeed: zoneDraft.maxSpeed === '' ? null : Number(zoneDraft.maxSpeed),
          isActive: zoneDraft.isActive,
        }
      : undefined
  }, [mode, zoneDraft, zones, mapVersionId])

  // Draft values paint on the map immediately; Save is the only write to the database.
  const canvasEndpoints = useMemo(() => {
    if (!selectedEndpoint || !epDraft) return endpoints
    const finite = (value: number | undefined, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    if (isUnsavedId(selectedEndpoint.id)) return [...endpoints, selectedEndpoint]
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

  const canvasEdges = useMemo(() => {
    if (!selectedEdge || !edgeDraft) return edges
    if (isUnsavedId(selectedEdge.id)) return [...edges, selectedEdge]
    return edges.map((e) => (e.id === selectedEdge.id ? selectedEdge : e))
  }, [edges, selectedEdge, edgeDraft])

  const canvasZones = useMemo(() => {
    if (!selectedZone || !zoneDraft) return zones
    if (isUnsavedId(selectedZone.id)) return [...zones, selectedZone]
    return zones.map((z) => (z.id === selectedZone.id ? selectedZone : z))
  }, [zones, selectedZone, zoneDraft])

  const workflowOpen = mode.kind === 'workflow'
  const panelOpen = Boolean(selectedZone ?? selectedEndpoint ?? selectedEdge ?? workflowOpen)
  const openPanelWidth = workflowOpen
    ? panelWidth
    : selectedZone || selectedEndpoint || selectedEdge
      ? INSPECTOR_WIDTH
      : 0

  function closeInspector() {
    setMode({ kind: 'idle' })
    setEpDraft(null)
    setEdgeDraft(null)
    setZoneDraft(null)
  }

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
    if (isUnsavedId(id)) return
    const ep = endpoints.find((e) => e.id === id)
    if (!ep) return
    setEdgeDraft(null)
    setZoneDraft(null)
    setEpDraft({ ...ep })
    setMode({ kind: 'endpoint', endpointId: id })
    setTool('select')
  }

  function selectEdge(id: string) {
    if (isUnsavedId(id)) return
    const edge = edges.find((e) => e.id === id)
    if (!edge) return
    setEpDraft(null)
    setZoneDraft(null)
    setEdgeDraft({
      name: edge.name,
      direction: edge.direction,
      widthMeters: edge.widthMeters ?? 1,
      maxSpeed: edge.maxSpeed?.toString() ?? '',
      isActive: edge.isActive,
      geometry: edge.geometry,
    })
    setMode({ kind: 'edge', edgeId: id })
    setTool('select')
  }

  function selectZone(id: string) {
    if (isUnsavedId(id)) return
    const zone = zones.find((z) => z.id === id)
    if (!zone) return
    setEpDraft(null)
    setEdgeDraft(null)
    setZoneDraft({
      name: zone.name,
      zoneType: zone.zoneType,
      maxSpeed: zone.maxSpeed?.toString() ?? '',
      isActive: zone.isActive,
      geometry: zone.geometry,
    })
    setMode({ kind: 'zone', zoneId: id })
    setTool('select')
  }

  function handleWorldClick(world: WorldCoord, _image: PixelCoord) {
    if (!isDraft || !version) return
    setActionError(null)
    const at = { x: snap(world.x), y: snap(world.y) }

    if (tool === 'endpoint' && mode.kind !== 'placing') {
      setMode({ kind: 'placing', endpointType: 'WAYPOINT', name: '', at, yawDeg: DEFAULT_YAW_DEG })
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

  function placeEndpoint(endpointType: EndpointType, name: string, at: Point, yawDeg: number) {
    if (!version || !isDraft) return
    const trimmed = name.trim()
    if (!trimmed) {
      setActionError('Enter a name first — the endpoint code is generated from it (EP-{NAME}) on Save.')
      return
    }
    setActionError(null)
    setEdgeDraft(null)
    setZoneDraft(null)
    setEpDraft({
      id: NEW_ENTITY_ID,
      mapVersionId: version.id,
      code: '',
      name: trimmed,
      endpointType,
      x: at.x,
      y: at.y,
      yaw: degToRad(yawDeg),
      positionTolerance: DEFAULT_POS_TOL_M,
      yawTolerance: degToRad(DEFAULT_YAW_TOL_DEG),
      isEnabled: true,
    })
    setMode({ kind: 'endpoint', endpointId: NEW_ENTITY_ID })
    setTool('select')
    setActionOk('Endpoint placed — click Save to write it to the database')
  }

  async function saveEndpoint() {
    if (!epDraft || !isDraft || !version || mode.kind !== 'endpoint') return
    const trimmed = (epDraft.name ?? '').trim()
    if (!trimmed) {
      setActionError('Name is required — code is generated as EP-{NAME}.')
      return
    }
    setActionError(null)
    const body = {
      name: trimmed,
      endpointType: (epDraft.endpointType as EndpointType) ?? 'WAYPOINT',
      x: Number(epDraft.x),
      y: Number(epDraft.y),
      yaw: Number(epDraft.yaw),
      positionTolerance: Number(epDraft.positionTolerance),
      yawTolerance: Number(epDraft.yawTolerance),
      isEnabled: epDraft.isEnabled ?? true,
    }
    try {
      if (isUnsavedId(mode.endpointId)) {
        const created = await createEndpoint(version.id, body)
        await invalidate()
        setEpDraft(toEndpoint(created))
        setMode({ kind: 'endpoint', endpointId: created.id })
        setActionOk(`Created ${created.code}`)
      } else {
        await updateEndpoint(mode.endpointId, body)
        await invalidate()
        setActionOk('Endpoint saved')
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeEndpoint(id: string) {
    if (!isDraft) return
    if (isUnsavedId(id)) {
      closeInspector()
      setActionOk('Unsaved endpoint discarded')
      return
    }
    try {
      await deleteEndpoint(id)
      await invalidate()
      closeInspector()
      setActionOk('Endpoint deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  function finishEdge(points: Point[], direction: EdgeDirection) {
    if (!version || !isDraft || points.length < 2) return
    setActionError(null)
    setEpDraft(null)
    setZoneDraft(null)
    setEdgeDraft({
      name: '',
      direction,
      widthMeters: 1,
      maxSpeed: '',
      isActive: true,
      geometry: pointsToLineString(points),
    })
    setMode({ kind: 'edge', edgeId: NEW_ENTITY_ID })
    setTool('select')
    setActionOk('Edge drawn — enter a name and click Save to persist')
  }

  async function saveEdge() {
    if (mode.kind !== 'edge' || !edgeDraft || !isDraft || !version) return
    const trimmed = edgeDraft.name.trim()
    if (!trimmed) {
      setActionError('Name is required — code is generated as EDGE-{NAME}.')
      return
    }
    setActionError(null)
    const body = {
      name: trimmed,
      geometry: edgeDraft.geometry,
      widthMeters: edgeDraft.widthMeters,
      direction: edgeDraft.direction,
      maxSpeed: edgeDraft.maxSpeed === '' ? null : Number(edgeDraft.maxSpeed),
      isActive: edgeDraft.isActive,
    }
    try {
      if (isUnsavedId(mode.edgeId)) {
        const created = await createEdge(version.id, body)
        await invalidate()
        setEdgeDraft({
          name: created.name,
          direction: created.direction as EdgeDirection,
          widthMeters: created.widthMeters,
          maxSpeed: created.maxSpeed?.toString() ?? '',
          isActive: created.isActive,
          geometry: created.geometry,
        })
        setMode({ kind: 'edge', edgeId: created.id })
        setActionOk(`Created ${created.code}`)
      } else {
        await updateEdge(mode.edgeId, body)
        await invalidate()
        setActionOk('Edge saved')
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeEdge(id: string) {
    if (!isDraft) return
    if (isUnsavedId(id)) {
      closeInspector()
      setActionOk('Unsaved edge discarded')
      return
    }
    try {
      await deleteEdge(id)
      await invalidate()
      closeInspector()
      setActionOk('Edge deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // Width / vertex edits stay in the draft until Save.
  function resizeEdgeWidth(id: string, widthMeters: number) {
    if (!isDraft) return
    if (mode.kind === 'edge' && mode.edgeId === id) {
      setEdgeDraft((draft) => (draft ? { ...draft, widthMeters } : draft))
    }
  }

  function moveShapeVertices(shape: { kind: 'edge' | 'zone'; id: string }, points: Point[]) {
    if (!isDraft) return
    const rounded = points.map((p) => ({ x: snap(p.x), y: snap(p.y) }))
    if (shape.kind === 'edge' && mode.kind === 'edge' && mode.edgeId === shape.id) {
      setEdgeDraft((draft) => (draft ? { ...draft, geometry: pointsToLineString(rounded) } : draft))
      return
    }
    if (shape.kind === 'zone' && mode.kind === 'zone' && mode.zoneId === shape.id) {
      setZoneDraft((draft) => (draft ? { ...draft, geometry: pointsToPolygon(rounded) } : draft))
    }
  }

  function buildZonePolicy(_draft: NonNullable<typeof zoneDraft>) {
    return null
  }

  function finishZone(points: Point[], zoneType?: ZoneType, title?: string) {
    if (!version || !isDraft || points.length < 3) return
    const type = zoneType ?? (mode.kind === 'drawingZone' ? mode.zoneType : 'KEEP_OUT')
    const name =
      title ?? (mode.kind === 'drawingZone' ? `${mode.title} - ${zones.length + 1}` : `Zone ${zones.length + 1}`)
    setActionError(null)
    setEpDraft(null)
    setEdgeDraft(null)
    setZoneDraft({
      name,
      zoneType: type,
      maxSpeed: type === 'SPEED' ? '0.5' : '',
      isActive: true,
      geometry: pointsToPolygon(points),
    })
    setMode({ kind: 'zone', zoneId: NEW_ENTITY_ID })
    setTool('select')
    setActionOk('Zone drawn — click Save to write it to the database')
  }

  async function saveZone() {
    if (mode.kind !== 'zone' || !zoneDraft || !isDraft || !version) return
    const trimmed = zoneDraft.name.trim()
    if (!trimmed) {
      setActionError('Name is required — code is generated as ZONE-{NAME}.')
      return
    }
    setActionError(null)
    const body = {
      name: trimmed,
      zoneType: zoneDraft.zoneType,
      geometry: zoneDraft.geometry,
      maxSpeed: zoneDraft.maxSpeed === '' ? null : Number(zoneDraft.maxSpeed),
      isActive: zoneDraft.isActive,
      policy: buildZonePolicy(zoneDraft),
      policySchemaVersion: 1,
    }
    try {
      if (isUnsavedId(mode.zoneId)) {
        const created = await createZone(version.id, body)
        await invalidate()
        setZoneDraft({
          name: created.name,
          zoneType: created.zoneType as ZoneType,
          maxSpeed: created.maxSpeed?.toString() ?? '',
          isActive: created.isActive,
          geometry: created.geometry,
        })
        setMode({ kind: 'zone', zoneId: created.id })
        setActionOk(`Created ${created.code}`)
      } else {
        await updateZone(mode.zoneId, body)
        await invalidate()
        setActionOk('Zone saved')
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function removeZone(id: string) {
    if (!isDraft) return
    if (isUnsavedId(id)) {
      closeInspector()
      setActionOk('Unsaved zone discarded')
      return
    }
    try {
      await deleteZone(id)
      await invalidate()
      closeInspector()
      setActionOk('Zone deleted')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // Duplicate a persisted selection only (Save first if this is still a local draft).
  async function duplicateSelected() {
    if (!version || !isDraft) return
    if (
      (mode.kind === 'endpoint' && isUnsavedId(mode.endpointId)) ||
      (mode.kind === 'edge' && isUnsavedId(mode.edgeId)) ||
      (mode.kind === 'zone' && isUnsavedId(mode.zoneId))
    ) {
      setActionError('Save this item before duplicating.')
      return
    }
    setActionError(null)
    try {
      if (mode.kind === 'endpoint') {
        const ep = endpoints.find((e) => e.id === mode.endpointId)
        if (!ep) return
        const [at] = offsetPoints([{ x: ep.x, y: ep.y }])
        const created = await createEndpoint(version.id, {
          name: duplicateName(ep.name, 'EP', endpoints.map((e) => e.code)),
          endpointType: ep.endpointType,
          x: at.x,
          y: at.y,
          yaw: ep.yaw,
          positionTolerance: ep.positionTolerance,
          yawTolerance: ep.yawTolerance,
        })
        await invalidate()
        setActionOk(`Duplicated ${ep.code} as ${created.code}`)
        setMode({ kind: 'endpoint', endpointId: created.id })
        setEpDraft(toEndpoint(created))
      } else if (mode.kind === 'edge') {
        const edge = edges.find((e) => e.id === mode.edgeId)
        if (!edge) return
        const created = await createEdge(version.id, {
          name: duplicateName(edge.name || edge.code, 'EDGE', edges.map((e) => e.code)),
          geometry: pointsToLineString(offsetPoints(lineStringToPoints(edge.geometry))),
          widthMeters: edge.widthMeters ?? 1,
          direction: edge.direction,
          maxSpeed: edge.maxSpeed,
          isActive: edge.isActive,
        })
        await invalidate()
        setActionOk(`Duplicated ${edge.code} as ${created.code}`)
        setEdgeDraft({
          name: created.name,
          direction: created.direction as EdgeDirection,
          widthMeters: created.widthMeters,
          maxSpeed: created.maxSpeed?.toString() ?? '',
          isActive: created.isActive,
          geometry: created.geometry,
        })
        setMode({ kind: 'edge', edgeId: created.id })
      } else if (mode.kind === 'zone') {
        const zone = zones.find((z) => z.id === mode.zoneId)
        if (!zone) return
        const created = await createZone(version.id, {
          name: duplicateName(zone.name, 'ZONE', zones.map((z) => z.code)),
          zoneType: zone.zoneType,
          geometry: pointsToPolygon(offsetPoints(polygonToPoints(zone.geometry))),
          maxSpeed: zone.maxSpeed,
          isActive: zone.isActive,
          policy: zone.policy ?? null,
          policySchemaVersion: zone.policySchemaVersion ?? 1,
        })
        await invalidate()
        setActionOk(`Duplicated ${zone.code} as ${created.code}`)
        setZoneDraft({
          name: created.name,
          zoneType: created.zoneType as ZoneType,
          maxSpeed: created.maxSpeed?.toString() ?? '',
          isActive: created.isActive,
          geometry: created.geometry,
        })
        setMode({ kind: 'zone', zoneId: created.id })
      }
      setTool('select')
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // Ctrl+D (Cmd+D) duplicates the selection, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'd') return
      if (mode.kind !== 'endpoint' && mode.kind !== 'edge' && mode.kind !== 'zone') return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault() // the browser's "bookmark this page"
      void duplicateSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
          <Button
            variant="ghost"
            disabled={!mapId || checkGraphMutation.isPending}
            title="Offline QA: compile Edges/Endpoints/Zones (not required for Semantic Nav2 Active)"
            onClick={() => checkGraphMutation.mutate()}
          >
            {checkGraphMutation.isPending ? 'Checking…' : 'Check topology (offline)'}
          </Button>
          <Button
            variant="ghost"
            disabled={!mapId || viewRouteGraphMutation.isPending}
            title="Offline: download legacy RouteGraph GeoJSON (Stage-3 Active uses Nav2 free-space)"
            onClick={() => viewRouteGraphMutation.mutate()}
          >
            {viewRouteGraphMutation.isPending ? 'Loading…' : 'Export route graph (legacy)'}
          </Button>
          <Button
            variant="ghost"
            disabled={!mapId}
            title="Open traffic debug SVG (occupancy, connectors, rejected access, clearance)"
            onClick={() => {
              const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
              window.open(`${base}/api/navigation/maps/${mapId}/traffic-graph/debug.svg`, '_blank', 'noopener,noreferrer')
            }}
          >
            Debug SVG
          </Button>
          <Button
            variant="ghost"
            disabled={!mapId || clearGraphCacheMutation.isPending}
            title="Drop in-memory compiled graph cache for this map (does not delete geometry)"
            onClick={() => {
              if (
                window.confirm(
                  'Clear compiled route-graph cache for this map?\n\nEdges, endpoints and zones stay. The next check or sim rebuilds the graph.',
                )
              ) {
                clearGraphCacheMutation.mutate()
              }
            }}
          >
            {clearGraphCacheMutation.isPending ? 'Clearing…' : 'Clear graph cache'}
          </Button>
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

      {graphReport ? (
        <div className="mx-3 mb-0 max-h-40 flex-none overflow-auto rounded-md border border-outline-soft bg-container px-3 py-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className={graphReport.isValid ? 'font-medium text-green' : 'font-medium text-red'}>
                {graphReport.isValid ? 'Valid' : 'Invalid'}
              </span>
              <span className="ml-2 text-muted">
                {graphReport.nodeCount} nodes · {graphReport.edgeCount} edges · hash {graphReport.graphHash.slice(0, 12)}…
              </span>
            </div>
            <button type="button" className="text-muted hover:text-ink" onClick={() => setGraphReport(null)}>
              Dismiss
            </button>
          </div>
          {graphReport.issues.length === 0 ? (
            <p className="mt-1 text-muted">No issues.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {graphReport.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className={issue.severity === 'ERROR' ? 'text-red' : 'text-ink-2'}>
                  <span className="font-mono">{issue.severity}</span> · {issue.code}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

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
            edges={canvasEdges}
            zones={canvasZones}
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
            onEdgeWidthChange={resizeEdgeWidth}
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
                Click the map or drag the marker to move it. Name it here, then confirm — nothing is written to the
                database until you click Save in the inspector.
              </p>
              <label className="mt-2 block">
                <span className="mb-1 block text-[11px] font-medium text-ink-2">Name *</span>
                <input
                  className={controlClass('sm')}
                  value={mode.name}
                  placeholder="e.g. Dock 1"
                  autoFocus
                  onChange={(event) => setMode({ ...mode, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && mode.name.trim()) {
                      void placeEndpoint(mode.endpointType, mode.name, mode.at, mode.yawDeg)
                    }
                  }}
                />
              </label>
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
                  disabled={!mode.name.trim()}
                  onClick={() => void placeEndpoint(mode.endpointType, mode.name, mode.at, mode.yawDeg)}
                >
                  Confirm placement
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
          <Inspector title="Endpoint" onClose={closeInspector}>
            <Field label="Name">
              <input
                className={controlClass()}
                value={epDraft.name ?? ''}
                disabled={!isDraft}
                onChange={(e) => setEpDraft({ ...epDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Code">
              <input
                className={controlClass()}
                value={isUnsavedId(selectedEndpoint.id) ? '' : selectedEndpoint.code}
                placeholder={isUnsavedId(selectedEndpoint.id) ? 'Assigned on Save' : undefined}
                readOnly
                disabled
              />
              <p className="mt-1 text-[11px] text-muted">
                Generated from the name on Save; renaming later does not change it.
              </p>
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
                <Button
                  variant="ghost"
                  disabled={isUnsavedId(selectedEndpoint.id)}
                  onClick={() => void duplicateSelected()}
                  title="Duplicate (Ctrl+D)"
                >
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => void removeEndpoint(selectedEndpoint.id)}>
                  {isUnsavedId(selectedEndpoint.id) ? 'Discard' : 'Delete'}
                </Button>
              </div>
            ) : null}
          </Inspector>
        ) : null}

        {selectedEdge && edgeDraft ? (
          <Inspector title="Edge" onClose={closeInspector}>
            <Field label="Name">
              <input
                className={controlClass()}
                value={edgeDraft.name}
                disabled={!isDraft}
                placeholder="e.g. North aisle"
                onChange={(e) => setEdgeDraft({ ...edgeDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Code">
              <input
                className={controlClass()}
                value={isUnsavedId(selectedEdge.id) ? '' : selectedEdge.code}
                placeholder={isUnsavedId(selectedEdge.id) ? 'Assigned on Save' : undefined}
                readOnly
                disabled
              />
              <p className="mt-1 text-[11px] text-muted">Generated from the name on Save.</p>
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
                <Button
                  variant="ghost"
                  disabled={isUnsavedId(selectedEdge.id)}
                  onClick={() => void duplicateSelected()}
                  title="Duplicate (Ctrl+D)"
                >
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => void removeEdge(selectedEdge.id)}>
                  {isUnsavedId(selectedEdge.id) ? 'Discard' : 'Delete'}
                </Button>
              </div>
            ) : null}
          </Inspector>
        ) : null}

        {selectedZone && zoneDraft ? (
          <Inspector title="Zone" onClose={closeInspector}>
            <Field label="Name">
              <input
                className={controlClass()}
                value={zoneDraft.name}
                disabled={!isDraft}
                onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Code">
              <input
                className={controlClass()}
                value={isUnsavedId(selectedZone.id) ? '' : selectedZone.code}
                placeholder={isUnsavedId(selectedZone.id) ? 'Assigned on Save' : undefined}
                readOnly
                disabled
              />
              <p className="mt-1 text-[11px] text-muted">Generated from the name on Save.</p>
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
              <p className="text-xs text-muted">
                Exclusive footprint occupancy (Stage-3 Fleet reservation). Not required for Nav2 free-space planning.
              </p>
            ) : null}
            {zoneDraft.zoneType === 'JUNCTION' ? (
              <p className="text-xs text-muted">
                Optional / legacy topology helper. Not required for Semantic Nav2 navigation.
              </p>
            ) : null}
            <Field label="Max speed (m/s)">
              <input
                className={controlClass()}
                value={zoneDraft.maxSpeed}
                disabled={!isDraft}
                onChange={(e) => setZoneDraft({ ...zoneDraft, maxSpeed: e.target.value })}
              />
            </Field>
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
                <Button
                  variant="ghost"
                  disabled={isUnsavedId(selectedZone.id)}
                  onClick={() => void duplicateSelected()}
                  title="Duplicate (Ctrl+D)"
                >
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => void removeZone(selectedZone.id)}>
                  {isUnsavedId(selectedZone.id) ? 'Discard' : 'Delete'}
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
