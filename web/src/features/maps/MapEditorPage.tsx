import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type {
  Edge,
  EdgeDirection,
  Endpoint,
  EndpointType,
  Point,
  Zone,
  ZoneType,
} from '@/shared/api/contracts'
import { listWorkflows } from '@/shared/api/workflows'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Field, FieldRow, SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { toPercent } from '@/shared/map/mapStyle'
import { SCENE_EDGES, SCENE_ENDPOINTS, SCENE_ZONES } from '@/shared/map/scene'
import { WorkflowEditor } from '@/features/workflows/workflow-editor-page'
import { HeadingDial } from './HeadingDial'
import { EDGE_TEMPLATES, ENDPOINT_TEMPLATES, ZONE_TEMPLATES } from './constants'
import { EDITOR_DEFAULTS, MAP_VERSIONS } from './mock'
import { normalizeYaw } from './yaw'

const WORKFLOW_PANEL = { min: 320, default: 460, key: 'warotrans.workflowPanelWidth' }

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

// Width of the Endpoint / Edge / Zone inspector. Workflow panel is wider and resizable.
const INSPECTOR_WIDTH = 340

type Tool = 'workflows' | 'endpoints' | 'traffic'

type Mode =
  | { kind: 'idle' }
  | { kind: 'picker'; tool: Tool }
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'placing'; endpointType: EndpointType; at: { x: number; y: number }; yaw: number }
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'drawingEdge'; direction: EdgeDirection; points: Point[] }
  | { kind: 'edge'; edgeId: string }

const TOOLS: { tool: Tool; label: string; icon: IconName }[] = [
  { tool: 'workflows', label: 'Workflows', icon: 'workflow' },
  { tool: 'endpoints', label: 'Endpoints', icon: 'target' },
  { tool: 'traffic', label: 'Traffic', icon: 'navigate' },
]

// Where a new Endpoint first appears (metres); the Admin clicks the map to move it.
const PENDING_ENDPOINT_AT = { x: 25, y: 25 }

// A new Endpoint faces +X (east, 0°) until the Admin turns the dial.
const DEFAULT_YAW = 0

/** Map clicks are kept to 0.1 m. */
const snap = (value: number) => Math.round(value * 10) / 10

/** Deep-link helper for demos/screenshots: /edit?state=workflows|endpoints|traffic|workflow|placing|zone */
function initialMode(state: string | null): Mode {
  switch (state) {
    case 'workflows':
    case 'endpoints':
    case 'traffic':
      return { kind: 'picker', tool: state }
    case 'workflow':
      return { kind: 'workflow', workflowId: 'new' }
    case 'placing':
      return { kind: 'placing', endpointType: 'CHARGING', at: PENDING_ENDPOINT_AT, yaw: DEFAULT_YAW }
    case 'zone':
      return { kind: 'zone', zoneId: 'zone-3' }
    default:
      return { kind: 'idle' }
  }
}

function Backdrop({ onClick }: { onClick: () => void }) {
  return <div className="absolute inset-0 z-10" onClick={onClick} />
}

export function MapEditorPage() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  const version = MAP_VERSIONS.find((item) => item.id === mapId) ?? MAP_VERSIONS[0]

  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => initialMode(searchParams.get('state')))
  // Every screen draws the same scene; the editor works on a copy stamped with this MapVersion.
  const [endpoints, setEndpoints] = useState<Endpoint[]>(() =>
    SCENE_ENDPOINTS.map((item) => ({ ...item, mapVersionId: version.id })),
  )
  const [zones, setZones] = useState<Zone[]>(() =>
    SCENE_ZONES.map((item) => ({ ...item, mapVersionId: version.id, geometry: { points: [...item.geometry.points] } })),
  )
  const [edges, setEdges] = useState<Edge[]>(() =>
    SCENE_EDGES.map((item) => ({ ...item, mapVersionId: version.id, geometry: { points: [...item.geometry.points] } })),
  )
  const [query, setQuery] = useState('')
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const latestWidth = useRef(panelWidth)

  const workflowsQuery = useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(),
    enabled: mode.kind === 'picker' && mode.tool === 'workflows',
  })

  /** Drag the left edge of the workflow panel: dragging left widens it. */
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
        // Storage can be blocked; width resets on next visit.
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const activeTool: Tool | null =
    mode.kind === 'picker'
      ? mode.tool
      : mode.kind === 'workflow'
        ? 'workflows'
        : mode.kind === 'placing' || mode.kind === 'endpoint'
          ? 'endpoints'
          : mode.kind === 'zone'
            ? 'traffic'
            : mode.kind === 'drawingEdge' || mode.kind === 'edge'
              ? 'traffic'
              : null

  const selectedZone = mode.kind === 'zone' ? zones.find((zone) => zone.id === mode.zoneId) : undefined
  const selectedEndpoint =
    mode.kind === 'endpoint' ? endpoints.find((endpoint) => endpoint.id === mode.endpointId) : undefined
  const selectedEdge = mode.kind === 'edge' ? edges.find((edge) => edge.id === mode.edgeId) : undefined
  const workflowOpen = mode.kind === 'workflow'
  const panelOpen = Boolean(selectedZone ?? selectedEndpoint ?? selectedEdge ?? workflowOpen)
  // Panels float over the canvas instead of squeezing it, so the map and the Endpoints on it never shift.
  const openPanelWidth = workflowOpen
    ? panelWidth
    : selectedZone || selectedEndpoint || selectedEdge
      ? INSPECTOR_WIDTH
      : 0

  function openTool(tool: Tool) {
    setQuery('')
    setMode(mode.kind === 'picker' && mode.tool === tool ? { kind: 'idle' } : { kind: 'picker', tool })
  }

  function startPlacing(endpointType: EndpointType) {
    setMode({ kind: 'placing', endpointType, at: PENDING_ENDPOINT_AT, yaw: DEFAULT_YAW })
  }

  function confirmEndpoint(endpointType: EndpointType, at: { x: number; y: number }, yaw: number) {
    const count = endpoints.length + 1
    const endpoint: Endpoint = {
      id: `draft-endpoint-${count}`,
      mapVersionId: version.id,
      // Temporary client code: the backend generates the real one on save; the Admin never types it.
      code: `EP-${endpointType}-${String(count).padStart(2, '0')}`,
      name: `${endpointType} ${count}`,
      endpointType,
      x: at.x,
      y: at.y,
      yaw,
      positionTolerance: 0.1,
      yawTolerance: 5,
      isEnabled: true,
    }
    setEndpoints((current) => [...current, endpoint])
    setMode({ kind: 'endpoint', endpointId: endpoint.id })
  }

  function patchEndpoint(endpointId: string, patch: Partial<Endpoint>) {
    setEndpoints((current) =>
      current.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, ...patch } : endpoint)),
    )
  }

  function removeEndpoint(endpointId: string) {
    setEndpoints((current) => current.filter((endpoint) => endpoint.id !== endpointId))
    setMode({ kind: 'idle' })
  }

  function addZone(zoneType: ZoneType, title: string) {
    const count = zones.length + 1
    const left = 14 + (count % 5) * 2
    const top = 8 + (count % 5) * 2
    const zone: Zone = {
      id: `draft-zone-${count}`,
      mapVersionId: version.id,
      // Temporary client code: the backend generates the real one on save; the Admin never types it.
      code: `ZN-${String(count).padStart(2, '0')}`,
      name: `${title} - ${count}`,
      zoneType,
      capacity: zoneType === 'RESTRICTED_AREA' ? 0 : 2,
      maxSpeed: null,
      isActive: true,
      geometry: {
        points: [
          { x: left, y: top },
          { x: left + 9, y: top },
          { x: left + 9, y: top + 6 },
          { x: left, y: top + 6 },
        ],
      },
    }
    setZones((current) => [...current, zone])
    setMode({ kind: 'zone', zoneId: zone.id })
  }

  function startEdge(direction: EdgeDirection) {
    setMode({ kind: 'drawingEdge', direction, points: [] })
  }

  function finishEdge() {
    if (mode.kind !== 'drawingEdge' || mode.points.length < 2) return
    const count = edges.length + 1
    const edge: Edge = {
      id: `draft-edge-${count}`,
      mapVersionId: version.id,
      // Temporary client code: the backend generates the real one on save; the Admin never types it.
      code: `EG-${String(count).padStart(2, '0')}`,
      geometry: { points: mode.points },
      direction: mode.direction,
      capacity: 1,
      maxSpeed: null,
      isActive: true,
    }
    setEdges((current) => [...current, edge])
    setMode({ kind: 'edge', edgeId: edge.id })
  }

  function patchEdge(edgeId: string, patch: Partial<Edge>) {
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)))
  }

  function removeEdge(edgeId: string) {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId))
    setMode({ kind: 'idle' })
  }

  function patchZone(zoneId: string, patch: Partial<Zone>) {
    setZones((current) => current.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)))
  }

  function removeZone(zoneId: string) {
    setZones((current) => current.filter((zone) => zone.id !== zoneId))
    setMode({ kind: 'idle' })
  }

  const picking = mode.kind === 'placing' || mode.kind === 'drawingEdge'

  /** A click on empty map: move the Endpoint being placed, or add a point to the Edge being drawn. */
  function handleMapClick(point: Point) {
    const at = { x: snap(point.x), y: snap(point.y) }
    if (mode.kind === 'placing') setMode({ ...mode, at })
    else if (mode.kind === 'drawingEdge') setMode({ ...mode, points: [...mode.points, at] })
  }

  const lowered = query.toLowerCase()

  return (
    <div className="fixed inset-0 z-40 flex min-w-[1100px] flex-col bg-surface">
      <header className="flex h-14 flex-none items-center gap-3 pr-6 pl-3">
        <IconButton aria-label="Back to Facility" onClick={() => navigate('/configure/facility')}>
          <Icon name="arrowLeft" size={18} />
        </IconButton>
        <h1 className="text-base font-medium">Map version {version.versionNo}</h1>
        <StatusBadge tone="amber">Unpublished draft</StatusBadge>
        <span className="ml-2 flex items-center gap-2 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-green" /> Saved automatically at {EDITOR_DEFAULTS.autosavedAt}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/configure/facility')}>
            Discard changes
          </Button>
          <Button variant="primary">Publish</Button>
        </div>
      </header>

      <div className="relative flex h-12 flex-none items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {panelOpen ? (
            <>
              <Button variant="primary" size="sm" onClick={() => setMode({ kind: 'idle' })}>
                Done
              </Button>
              {workflowOpen ? (
                <span className="ml-2 inline-flex items-center gap-2 text-sm text-muted">
                  <Icon name="workflow" size={15} /> Workflows
                  <Icon name="chevronRight" size={12} />
                  <strong className="font-medium text-ink">
                    {mode.workflowId === 'new' ? 'New workflow' : 'Edit workflow'}
                  </strong>
                </span>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm">
                <Icon name="save" size={14} /> Save
              </Button>
              <Button variant="ghost" size="sm">
                <Icon name="more" size={14} /> More
              </Button>
            </>
          )}
        </div>

        {panelOpen ? null : (
          <div className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1 rounded-full bg-container-high p-1">
            {TOOLS.map((item) => (
              <button
                key={item.tool}
                type="button"
                className={cx(
                  'flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition-colors duration-200',
                  activeTool === item.tool ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface hover:text-ink',
                )}
                aria-pressed={activeTool === item.tool}
                onClick={() => openTool(item.tool)}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </button>
            ))}
          </div>
        )}

      </div>

      <div className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-container">
        <div className="absolute inset-0">
          <WarehouseMap
            zones={zones}
            edges={edges}
            endpoints={endpoints}
            layers={{ robots: false, occupancy: false, legendOpen: true }}
            labels={activeTool === 'endpoints' ? 'all' : 'focus'}
            emphasis={activeTool === 'endpoints' ? ['endpoints'] : activeTool === 'traffic' ? ['zones', 'edges'] : []}
            selected={{ zoneId: selectedZone?.id, edgeId: selectedEdge?.id, endpointId: selectedEndpoint?.id }}
            onZoneClick={!picking && activeTool === 'traffic' ? (id) => setMode({ kind: 'zone', zoneId: id }) : undefined}
            onEdgeClick={!picking && activeTool === 'traffic' ? (id) => setMode({ kind: 'edge', edgeId: id }) : undefined}
            onEndpointClick={
              !picking && activeTool === 'endpoints' ? (id) => setMode({ kind: 'endpoint', endpointId: id }) : undefined
            }
            onBackgroundClick={handleMapClick}
            drawing={mode.kind === 'drawingEdge' ? { points: mode.points, direction: mode.direction } : undefined}
            uiInset={openPanelWidth ? openPanelWidth + PANEL_GAP : 0}
          >
            {selectedEndpoint ? (
              <div className={ANCHOR} style={toPercent(selectedEndpoint)}>
                <HeadingDial
                  x={0}
                  y={0}
                  yaw={selectedEndpoint.yaw}
                  onChange={(yaw) => patchEndpoint(selectedEndpoint.id, { yaw })}
                />
              </div>
            ) : null}

            {mode.kind === 'placing' ? (
              <div className={ANCHOR} style={toPercent(mode.at)}>
                <HeadingDial x={0} y={0} yaw={mode.yaw} onChange={(yaw) => setMode({ ...mode, yaw })} />
                <div className="absolute -top-14 left-28 z-8 flex w-64 flex-col gap-2.5 rounded-md bg-surface p-3.5 text-xs shadow-float">
                  <p className="text-ink-2">Click the map to move it. Drag the arrow to set the heading ({mode.yaw}°).</p>
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
                  <div className="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'idle' })}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => confirmEndpoint(mode.endpointType, mode.at, mode.yaw)}>
                      Place endpoint
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {mode.kind === 'drawingEdge' ? (
              <div className="absolute top-3 left-1/2 z-9 flex origin-top -translate-x-1/2 scale-[calc(1/var(--z,1))] cursor-default items-center gap-1 rounded-full bg-surface py-1 pr-1 pl-4 text-xs whitespace-nowrap shadow-float">
                <span className="mr-2 text-ink-2">
                  {mode.points.length < 2 ? 'Click the map to add points (at least 2)' : `${mode.points.length} points`}
                </span>
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
                <Button variant="primary" size="sm" disabled={mode.points.length < 2} onClick={finishEdge}>
                  Finish edge
                </Button>
              </div>
            ) : null}
          </WarehouseMap>
        </div>

        {mode.kind === 'picker' ? (
          <>
            <Backdrop onClick={() => setMode({ kind: 'idle' })} />
            <div className="absolute top-3 left-1/2 z-20 max-h-[calc(100%-24px)] w-[380px] -translate-x-1/2 overflow-auto rounded-lg bg-surface p-2 shadow-float">
              {mode.tool === 'workflows' ? (
                <>
                  <PickerHead title="Workflows">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setMode({ kind: 'workflow', workflowId: 'new' })}
                    >
                      <Icon name="plus" size={14} /> New workflow
                    </Button>
                  </PickerHead>
                  {workflowsQuery.isLoading ? <p className="px-3 py-2 text-xs text-muted">Loading…</p> : null}
                  {workflowsQuery.error ? (
                    <p className="px-3 py-2 text-xs text-muted">{(workflowsQuery.error as Error).message}</p>
                  ) : null}
                  <ul>
                    {(workflowsQuery.data?.items ?? []).map((workflow) => (
                      <PickerItem
                        key={workflow.id}
                        title={workflow.name || workflow.code}
                        note={`${workflow.code} · v${workflow.versionNo} · ${workflow.status.toLowerCase()}`}
                        onClick={() => setMode({ kind: 'workflow', workflowId: workflow.id })}
                      />
                    ))}
                    {workflowsQuery.data && workflowsQuery.data.items.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted">No workflows yet.</li>
                    ) : null}
                  </ul>
                  <div className="mt-2 border-t border-black/5 px-3 py-3">
                    <Link
                      className="inline-flex items-center gap-2 text-xs text-ink-2 hover:text-ink"
                      to="/configure/workflows"
                    >
                      <Icon name="workflow" size={13} /> Open full Workflows page
                    </Link>
                  </div>
                </>
              ) : null}

              {mode.tool === 'endpoints' ? (
                <>
                  <PickerHead title="Endpoints">
                    <Button variant="primary" size="sm" onClick={() => startPlacing('STORAGE')}>
                      <Icon name="plus" size={14} /> Add endpoint
                    </Button>
                  </PickerHead>
                  <SearchInput value={query} onChange={setQuery} placeholder="Search endpoint types" autoFocus className="mx-1" />
                  <PickerHeading>Groups</PickerHeading>
                  <ul>
                    <PickerItem title="Endpoint group" note="A set of endpoints that can be used interchangeably" />
                  </ul>
                  <PickerHeading>Endpoint types</PickerHeading>
                  <ul>
                    {ENDPOINT_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                      <PickerItem key={item.type} title={item.title} note={item.description} onClick={() => startPlacing(item.type)} />
                    ))}
                  </ul>
                </>
              ) : null}

              {mode.tool === 'traffic' ? (
                <>
                  <PickerHead title="Traffic" />
                  <SearchInput value={query} onChange={setQuery} placeholder="Search zones and edges" className="mx-1" />
                  <PickerHeading>Zones</PickerHeading>
                  <ul>
                    {ZONE_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                      <PickerItem key={item.type} title={item.title} note={item.description} onClick={() => addZone(item.type, item.title)} />
                    ))}
                  </ul>
                  <PickerHeading>Edges</PickerHeading>
                  <ul>
                    {EDGE_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                      <PickerItem key={item.direction} title={item.title} note={item.description} onClick={() => startEdge(item.direction)} />
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {workflowOpen ? (
          <aside className={SIDE_PANEL} style={{ width: panelWidth }}>
            <div
              className="group absolute inset-y-0 left-0 z-6 w-2 cursor-col-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              title="Drag to resize, double-click to reset"
              onPointerDown={startPanelResize}
              onDoubleClick={() => {
                latestWidth.current = WORKFLOW_PANEL.default
                setPanelWidth(WORKFLOW_PANEL.default)
              }}
            >
              <div className="absolute inset-y-6 left-0.5 w-0.5 rounded-full transition-colors duration-200 group-hover:bg-blue" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WorkflowEditor
                workflowId={mode.workflowId}
                variant="panel"
                onClose={() => setMode({ kind: 'idle' })}
                onSaved={(id) => setMode({ kind: 'workflow', workflowId: id })}
              />
            </div>
          </aside>
        ) : null}

        {selectedEndpoint ? (
          <Inspector
            title={`${ENDPOINT_TEMPLATES.find((item) => item.type === selectedEndpoint.endpointType)?.title} endpoint`}
            deleteLabel="Delete endpoint"
            onDelete={() => removeEndpoint(selectedEndpoint.id)}
          >
            <Field label="Name">
              <input
                className={controlClass()}
                value={selectedEndpoint.name}
                onChange={(event) => patchEndpoint(selectedEndpoint.id, { name: event.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={controlClass()}
                value={selectedEndpoint.endpointType}
                onChange={(event) => patchEndpoint(selectedEndpoint.id, { endpointType: event.target.value as EndpointType })}
              >
                {ENDPOINT_TEMPLATES.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <FieldRow>
              <Field label="X (m)">
                <input
                  type="number"
                  step={0.1}
                  className={controlClass()}
                  value={selectedEndpoint.x}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { x: Number(event.target.value) })}
                />
              </Field>
              <Field label="Y (m)">
                <input
                  type="number"
                  step={0.1}
                  className={controlClass()}
                  value={selectedEndpoint.y}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { y: Number(event.target.value) })}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Yaw (°)">
                <input
                  type="number"
                  className={controlClass()}
                  value={selectedEndpoint.yaw}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { yaw: normalizeYaw(Number(event.target.value)) })}
                />
              </Field>
              <Field label="Yaw tolerance (°)">
                <input
                  type="number"
                  min={0}
                  className={controlClass()}
                  value={selectedEndpoint.yawTolerance}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { yawTolerance: Number(event.target.value) })}
                />
              </Field>
            </FieldRow>
            <Field label="Position tolerance (m)">
              <input
                type="number"
                min={0}
                step={0.05}
                className={controlClass()}
                value={selectedEndpoint.positionTolerance}
                onChange={(event) => patchEndpoint(selectedEndpoint.id, { positionTolerance: Number(event.target.value) })}
              />
            </Field>
            <Toggle
              label="Enabled"
              checked={selectedEndpoint.isEnabled}
              onChange={(isEnabled) => patchEndpoint(selectedEndpoint.id, { isEnabled })}
            />
          </Inspector>
        ) : null}

        {selectedEdge ? (
          <Inspector
            title={EDGE_TEMPLATES.find((item) => item.direction === selectedEdge.direction)?.title ?? 'Edge'}
            deleteLabel="Delete edge"
            onDelete={() => removeEdge(selectedEdge.id)}
          >
            <Field label="Direction">
              <select
                className={controlClass()}
                value={selectedEdge.direction}
                onChange={(event) => patchEdge(selectedEdge.id, { direction: event.target.value as EdgeDirection })}
              >
                {EDGE_TEMPLATES.map((item) => (
                  <option key={item.direction} value={item.direction}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <FieldRow>
              <Field label="Capacity">
                <input
                  type="number"
                  min={0}
                  className={controlClass()}
                  value={selectedEdge.capacity}
                  onChange={(event) => patchEdge(selectedEdge.id, { capacity: Number(event.target.value) })}
                />
              </Field>
              <Field label="Max speed (m/s)">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className={controlClass()}
                  value={selectedEdge.maxSpeed ?? ''}
                  placeholder="—"
                  onChange={(event) =>
                    patchEdge(selectedEdge.id, { maxSpeed: event.target.value === '' ? null : Number(event.target.value) })
                  }
                />
              </Field>
            </FieldRow>
            <Toggle label="Active" checked={selectedEdge.isActive} onChange={(isActive) => patchEdge(selectedEdge.id, { isActive })} />
            <p className="text-xs text-muted">{selectedEdge.geometry.points.length} points on the path</p>
          </Inspector>
        ) : null}

        {selectedZone ? (
          <Inspector
            title={ZONE_TEMPLATES.find((item) => item.type === selectedZone.zoneType)?.title ?? 'Zone'}
            deleteLabel="Delete zone"
            onDelete={() => removeZone(selectedZone.id)}
          >
            <Field label="Name">
              <input
                className={controlClass()}
                value={selectedZone.name}
                onChange={(event) => patchZone(selectedZone.id, { name: event.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                className={controlClass()}
                value={selectedZone.zoneType}
                onChange={(event) => patchZone(selectedZone.id, { zoneType: event.target.value as ZoneType })}
              >
                {ZONE_TEMPLATES.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <FieldRow>
              <Field label="Capacity">
                <input
                  type="number"
                  min={0}
                  className={controlClass()}
                  value={selectedZone.capacity}
                  onChange={(event) => patchZone(selectedZone.id, { capacity: Number(event.target.value) })}
                />
              </Field>
              <Field label="Max speed (m/s)">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className={controlClass()}
                  value={selectedZone.maxSpeed ?? ''}
                  placeholder="—"
                  onChange={(event) =>
                    patchZone(selectedZone.id, { maxSpeed: event.target.value === '' ? null : Number(event.target.value) })
                  }
                />
              </Field>
            </FieldRow>
            <Toggle label="Active" checked={selectedZone.isActive} onChange={(isActive) => patchZone(selectedZone.id, { isActive })} />
          </Inspector>
        ) : null}
      </div>
    </div>
  )
}

// Panels float over the right edge of the canvas, this far from its border.
const PANEL_GAP = 12
const SIDE_PANEL = 'absolute top-3 right-3 bottom-3 z-12 flex flex-col overflow-hidden rounded-lg bg-surface shadow-float'
// Widgets pinned to a map point keep their size while the map is zoomed.
const ANCHOR = 'absolute size-0 origin-top-left scale-[calc(1/var(--z,1))]'

function PickerHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex min-h-8 items-center justify-between gap-3 px-3 pt-2 pb-3">
      <h2 className="text-md font-book">{title}</h2>
      {children}
    </header>
  )
}

function PickerHeading({ children }: { children: ReactNode }) {
  return <h3 className="px-3 pt-4 pb-1 text-xs text-muted">{children}</h3>
}

function PickerItem({ title, note, onClick }: { title: string; note: string; onClick?: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left transition-colors duration-200 hover:bg-container-high"
        onClick={onClick}
      >
        <strong className="font-medium">{title}</strong>
        <span className="text-xs text-muted">{note}</span>
      </button>
    </li>
  )
}

interface InspectorProps {
  title: string
  deleteLabel: string
  onDelete: () => void
  children: ReactNode
}

/** Properties of the selected Endpoint, Edge or Zone. */
function Inspector({ title, deleteLabel, onDelete, children }: InspectorProps) {
  return (
    <aside className={SIDE_PANEL} style={{ width: INSPECTOR_WIDTH }}>
      <h2 className="px-5 pt-5 pb-2 text-md font-book">{title}</h2>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-3">{children}</div>
      <div className="px-5 pt-2 pb-5">
        <Button variant="danger" block onClick={onDelete}>
          <Icon name="trash" size={15} /> {deleteLabel}
        </Button>
      </div>
    </aside>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input type="checkbox" className="size-4 accent-ink" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
