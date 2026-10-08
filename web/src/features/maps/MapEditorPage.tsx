import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type {
  Edge,
  EdgeDirection,
  Endpoint,
  EndpointType,
  Point,
  Workflow,
  Zone,
  ZoneType,
} from '@/shared/api/contracts'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { toPercent } from '@/shared/map/mapStyle'
import { SCENE_EDGES, SCENE_ENDPOINTS, SCENE_ZONES } from '@/shared/map/scene'
import { HeadingDial } from './HeadingDial'
import { WorkflowBuilderPanel } from '@/features/workflows/WorkflowBuilderPanel'
import { WORKFLOWS } from '@/features/workflows/mock'
import { EDGE_TEMPLATES, ENDPOINT_TEMPLATES, ZONE_TEMPLATES } from './constants'
import { EDITOR_DEFAULTS, MAP_VERSIONS } from './mock'
import { normalizeYaw } from './yaw'
import './maps.css'

const PANEL_WIDTH = { min: 320, default: 375, key: 'warotrans.workflowPanelWidth' }

const clampPanelWidth = (width: number) =>
  Math.min(Math.max(width, PANEL_WIDTH.min), Math.max(PANEL_WIDTH.min, Math.round(window.innerWidth * 0.7)))

function readPanelWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH.key))
    return stored ? clampPanelWidth(stored) : PANEL_WIDTH.default
  } catch {
    return PANEL_WIDTH.default
  }
}

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

// Horizontal offset (px) from the canvas centre so each popover sits under its toolbar button.
const PICKER_OFFSET: Record<Tool, number> = {
  workflows: -126,
  endpoints: -17,
  traffic: 83,
};

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
      return { kind: 'workflow', workflowId: WORKFLOWS[0].id }
    case 'placing':
      return { kind: 'placing', endpointType: 'CHARGING', at: PENDING_ENDPOINT_AT, yaw: DEFAULT_YAW }
    case 'zone':
      return { kind: 'zone', zoneId: 'zone-3' }
    default:
      return { kind: 'idle' }
  }
}

function Backdrop({ onClick }: { onClick: () => void }) {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} onClick={onClick} />
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
  const [workflows, setWorkflows] = useState<Workflow[]>(WORKFLOWS)
  const [query, setQuery] = useState('')
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const latestWidth = useRef(panelWidth)

  /** Drag the left edge of the workflow panel: dragging left widens it so long names and options stay readable. */
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
        window.localStorage.setItem(PANEL_WIDTH.key, String(latestWidth.current))
      } catch {
        // Storage can be blocked; the width then simply resets on the next visit.
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
  const selectedWorkflow =
    mode.kind === 'workflow' ? workflows.find((workflow) => workflow.id === mode.workflowId) : undefined
  const selectedEndpoint =
    mode.kind === 'endpoint' ? endpoints.find((endpoint) => endpoint.id === mode.endpointId) : undefined
  const selectedEdge = mode.kind === 'edge' ? edges.find((edge) => edge.id === mode.edgeId) : undefined
  const panelOpen = Boolean(selectedZone ?? selectedWorkflow ?? selectedEndpoint ?? selectedEdge)
  // Panels float over the canvas instead of squeezing it, so the map and the Endpoints on it never shift.
  const openPanelWidth = selectedWorkflow ? panelWidth : selectedZone || selectedEndpoint || selectedEdge ? 330 : 0

  function createWorkflow() {
    const count = workflows.length + 1
    const workflow: Workflow = {
      // Temporary client id/code: the backend generates the code (never typed by the Admin), the id and the version on save.
      id: `draft-workflow-${count}`,
      code: `WORKFLOW_${String(count).padStart(2, '0')}`,
      versionNo: 1,
      name: `Workflow ${String(count).padStart(2, '0')}`,
      status: 'DRAFT',
      variablesSchema: [],
      tasks: [],
    }
    setWorkflows((current) => [...current, workflow])
    setMode({ kind: 'workflow', workflowId: workflow.id })
  }

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
    <div className="editor">
      <header className="editor__top">
        <button
          type="button"
          className="editor__back"
          aria-label="Back to Facility"
          onClick={() => navigate('/configure/facility')}
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1>Editing · v{version.versionNo} (draft)</h1>
        <span className="editor__draft">Unpublished</span>
        <span className="editor__saved">
          <span className="dot" /> Auto-saved at {EDITOR_DEFAULTS.autosavedAt}
        </span>
        <div className="editor__top-actions">
          <button type="button" className="btn" onClick={() => navigate('/configure/facility')}>
            Discard Changes
          </button>
          <button type="button" className="btn btn--primary">
            Publish
          </button>
        </div>
      </header>

      <div className="editor__bar">
        <div className="editor__bar-left">
          {panelOpen ? (
            <>
              <button type="button" className="editor__done" onClick={() => setMode({ kind: 'idle' })}>
                Done
              </button>
              {selectedWorkflow ? (
                <>
                  <button type="button" className="btn editor__save">
                    Save
                  </button>
                  <span className="editor__crumb">
                    <Icon name="workflow" size={14} /> Workflows / <strong>{selectedWorkflow.name}</strong>
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" className="editor__mini">
                <Icon name="save" size={14} /> Save
              </button>
              <button type="button" className="editor__mini">
                <Icon name="more" size={14} /> More
              </button>
            </>
          )}
        </div>

        {panelOpen ? null : (
          <div className="editor__tools">
            {TOOLS.map((item) => (
              <button
                key={item.tool}
                type="button"
                className={`editor__tool${activeTool === item.tool ? ' is-active' : ''}`}
                onClick={() => openTool(item.tool)}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="editor__bar-right editor__history">
          {panelOpen ? (
            <>
              <button type="button">
                <Icon name="copy" size={11} /> Duplicate
              </button>
              <button
                type="button"
                style={{ color: 'var(--red-ink)' }}
                onClick={() =>
                  selectedZone
                    ? removeZone(selectedZone.id)
                    : selectedEdge
                      ? removeEdge(selectedEdge.id)
                      : selectedEndpoint
                      ? removeEndpoint(selectedEndpoint.id)
                      : setMode({ kind: 'idle' })
                }
              >
                <Icon name="trash" size={11} /> Delete
              </button>
            </>
          ) : null}
          <button type="button">
            <Icon name="undo" size={11} /> Undo
          </button>
          <button type="button">
            <Icon name="redo" size={11} /> Redo
          </button>
        </div>
      </div>

      <div className="editor__main">
        <nav className="editor__rail" aria-label="Tools">
          {TOOLS.map((item) => (
            <button
              key={item.tool}
              type="button"
              aria-label={item.label}
              className={activeTool === item.tool ? 'is-active' : undefined}
              onClick={() => openTool(item.tool)}
            >
              <Icon name={item.icon} size={14} />
            </button>
          ))}
        </nav>

        <div className="editor__canvas">
          <div className="editor__map">
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
              uiInset={openPanelWidth}
            >
              {selectedEndpoint ? (
                <div className="editor__anchor" style={toPercent(selectedEndpoint)}>
                  <HeadingDial
                    x={0}
                    y={0}
                    yaw={selectedEndpoint.yaw}
                    onChange={(yaw) => patchEndpoint(selectedEndpoint.id, { yaw })}
                  />
                </div>
              ) : null}

              {mode.kind === 'placing' ? (
                <div className="editor__anchor" style={toPercent(mode.at)}>
                  <HeadingDial x={0} y={0} yaw={mode.yaw} onChange={(yaw) => setMode({ ...mode, yaw })} />
                  <div className="confirm-bubble" style={{ left: 112, top: -54 }}>
                    Click the map to move it. Drag the arrow to set the heading ({mode.yaw}°).
                    <select
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
                    <div>
                      <button type="button" onClick={() => setMode({ kind: 'idle' })}>
                        Cancel
                      </button>
                      <button type="button" className="is-ok" onClick={() => confirmEndpoint(mode.endpointType, mode.at, mode.yaw)}>
                        Place
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {mode.kind === 'drawingEdge' ? (
                <div className="board__draw">
                  <span>
                    {mode.points.length < 2 ? 'Click the map to add points (at least 2)' : `${mode.points.length} points`}
                  </span>
                  <button
                    type="button"
                    disabled={mode.points.length === 0}
                    onClick={() => setMode({ ...mode, points: mode.points.slice(0, -1) })}
                  >
                    Undo point
                  </button>
                  <button type="button" className="is-ok" disabled={mode.points.length < 2} onClick={finishEdge}>
                    Finish
                  </button>
                  <button type="button" onClick={() => setMode({ kind: 'idle' })}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </WarehouseMap>
          </div>

          <div className="editor__pill">✎ EDITING › V{version.versionNo}: LATEST</div>

          {mode.kind === 'picker' ? (
            <>
              <Backdrop onClick={() => setMode({ kind: 'idle' })} />
              <div
                className={`picker picker--${mode.tool}`}
                style={{ left: `calc(50% + ${PICKER_OFFSET[mode.tool]}px)` }}
              >
                {mode.tool === 'workflows' ? (
                  <>
                    <header>
                      Workflows
                      <button type="button" className="wf__add" onClick={createWorkflow}>
                        + New workflow
                      </button>
                    </header>
                    <div className="picker__jobs">
                      <h4>Jobs</h4>
                      <ul>
                        {workflows.map((workflow) => (
                          <li key={workflow.id}>
                            <button type="button" onClick={() => setMode({ kind: 'workflow', workflowId: workflow.id })}>
                              <strong>{workflow.name}</strong>
                              <small>Connect Endpoints together</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}

                {mode.tool === 'endpoints' ? (
                  <>
                    <header>
                      Endpoints
                      <button type="button" className="wf__add" onClick={() => startPlacing('STORAGE')}>
                        + Add Endpoint
                      </button>
                    </header>
                    <label className="picker__search">
                      <Icon name="search" size={12} />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
                    </label>
                    <h4>Groups</h4>
                    <ul>
                      <li>
                        <button type="button">
                          <strong>Endpoint Group</strong>
                          <small>Create a collection of endpoints that can be used interchangeably</small>
                        </button>
                      </li>
                    </ul>
                    <h4>Endpoints</h4>
                    <ul>
                      {ENDPOINT_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                        <li key={item.type}>
                          <button type="button" onClick={() => startPlacing(item.type)}>
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {mode.tool === 'traffic' ? (
                  <>
                    <header>Traffic</header>
                    <label className="picker__search">
                      <Icon name="search" size={12} />
                      <input
                        placeholder="Search zones and edges..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <h4>Zones</h4>
                    <ul>
                      {ZONE_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                        <li key={item.type}>
                          <button type="button" onClick={() => addZone(item.type, item.title)}>
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <h4>Edges</h4>
                    <ul>
                      {EDGE_TEMPLATES.filter((item) => item.title.toLowerCase().includes(lowered)).map((item) => (
                        <li key={item.direction}>
                          <button type="button" onClick={() => startEdge(item.direction)}>
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {selectedWorkflow ? (
          <div className="editor__panelwrap" style={{ width: panelWidth }}>
            <div
              className="editor__resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              title="Drag to resize, double-click to reset"
              onPointerDown={startPanelResize}
              onDoubleClick={() => {
                latestWidth.current = PANEL_WIDTH.default
                setPanelWidth(PANEL_WIDTH.default)
              }}
            />
            <aside className="editor__panel">
              <WorkflowBuilderPanel
                key={selectedWorkflow.id}
                workflow={selectedWorkflow}
                onChange={(next) =>
                  setWorkflows((current) => current.map((item) => (item.id === next.id ? next : item)))
                }
              />
            </aside>
          </div>
        ) : null}

        {selectedEndpoint ? (
          <aside className="editor__panel editor__panel--zone">
            <div className="editor__panel-head">
              <span>{ENDPOINT_TEMPLATES.find((item) => item.type === selectedEndpoint.endpointType)?.title} endpoint</span>
              <Icon name="list" size={14} />
            </div>
            <div className="zoneform">
              <label>
                <span>Name</span>
                <input
                  value={selectedEndpoint.name}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={selectedEndpoint.endpointType}
                  onChange={(event) =>
                    patchEndpoint(selectedEndpoint.id, { endpointType: event.target.value as EndpointType })
                  }
                >
                  {ENDPOINT_TEMPLATES.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.type}
                    </option>
                  ))}
                </select>
              </label>
              <div className="zoneform__row">
                <label>
                  <span>X (m)</span>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedEndpoint.x}
                    onChange={(event) => patchEndpoint(selectedEndpoint.id, { x: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Y (m)</span>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedEndpoint.y}
                    onChange={(event) => patchEndpoint(selectedEndpoint.id, { y: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="zoneform__row">
                <label>
                  <span>Yaw (°)</span>
                  <input
                    type="number"
                    value={selectedEndpoint.yaw}
                    onChange={(event) =>
                      patchEndpoint(selectedEndpoint.id, { yaw: normalizeYaw(Number(event.target.value)) })
                    }
                  />
                </label>
                <label>
                  <span>Yaw tolerance (°)</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedEndpoint.yawTolerance}
                    onChange={(event) =>
                      patchEndpoint(selectedEndpoint.id, { yawTolerance: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                <span>Position tolerance (m)</span>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={selectedEndpoint.positionTolerance}
                  onChange={(event) =>
                    patchEndpoint(selectedEndpoint.id, { positionTolerance: Number(event.target.value) })
                  }
                />
              </label>
              <label className="zoneform__check">
                <input
                  type="checkbox"
                  checked={selectedEndpoint.isEnabled}
                  onChange={(event) => patchEndpoint(selectedEndpoint.id, { isEnabled: event.target.checked })}
                />
                <span>Enabled</span>
              </label>
            </div>
            <div className="editor__panel-foot">
              <button
                type="button"
                className="btn btn--danger btn--block"
                onClick={() => removeEndpoint(selectedEndpoint.id)}
              >
                <Icon name="trash" size={13} /> Delete endpoint
              </button>
            </div>
          </aside>
        ) : null}

        {selectedEdge ? (
          <aside className="editor__panel editor__panel--zone">
            <div className="editor__panel-head">
              <span>{EDGE_TEMPLATES.find((item) => item.direction === selectedEdge.direction)?.title}</span>
              <Icon name="list" size={14} />
            </div>
            <div className="zoneform">
              <label>
                <span>Direction</span>
                <select
                  value={selectedEdge.direction}
                  onChange={(event) => patchEdge(selectedEdge.id, { direction: event.target.value as EdgeDirection })}
                >
                  {EDGE_TEMPLATES.map((item) => (
                    <option key={item.direction} value={item.direction}>
                      {item.direction}
                    </option>
                  ))}
                </select>
              </label>
              <div className="zoneform__row">
                <label>
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedEdge.capacity}
                    onChange={(event) => patchEdge(selectedEdge.id, { capacity: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Max speed (m/s)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={selectedEdge.maxSpeed ?? ''}
                    placeholder="—"
                    onChange={(event) =>
                      patchEdge(selectedEdge.id, {
                        maxSpeed: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="zoneform__check">
                <input
                  type="checkbox"
                  checked={selectedEdge.isActive}
                  onChange={(event) => patchEdge(selectedEdge.id, { isActive: event.target.checked })}
                />
                <span>Active</span>
              </label>
              <p className="zoneform__note">{selectedEdge.geometry.points.length} points on the path</p>
            </div>
            <div className="editor__panel-foot">
              <button type="button" className="btn btn--danger btn--block" onClick={() => removeEdge(selectedEdge.id)}>
                <Icon name="trash" size={13} /> Delete edge
              </button>
            </div>
          </aside>
        ) : null}

        {selectedZone ? (
          <aside className="editor__panel editor__panel--zone">
            <div className="editor__panel-head">
              <span>{ZONE_TEMPLATES.find((item) => item.type === selectedZone.zoneType)?.title}</span>
              <Icon name="list" size={14} />
            </div>
            <div className="zoneform">
              <label>
                <span>Name</span>
                <input
                  value={selectedZone.name}
                  onChange={(event) => patchZone(selectedZone.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={selectedZone.zoneType}
                  onChange={(event) => patchZone(selectedZone.id, { zoneType: event.target.value as ZoneType })}
                >
                  {ZONE_TEMPLATES.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.type}
                    </option>
                  ))}
                </select>
              </label>
              <div className="zoneform__row">
                <label>
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedZone.capacity}
                    onChange={(event) => patchZone(selectedZone.id, { capacity: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Max speed (m/s)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={selectedZone.maxSpeed ?? ''}
                    placeholder="—"
                    onChange={(event) =>
                      patchZone(selectedZone.id, {
                        maxSpeed: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="zoneform__check">
                <input
                  type="checkbox"
                  checked={selectedZone.isActive}
                  onChange={(event) => patchZone(selectedZone.id, { isActive: event.target.checked })}
                />
                <span>Active</span>
              </label>
            </div>
            <div className="editor__panel-foot">
              <button
                type="button"
                className="btn btn--danger btn--block"
                onClick={() => removeZone(selectedZone.id)}
              >
                <Icon name="trash" size={13} /> Delete zone
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
