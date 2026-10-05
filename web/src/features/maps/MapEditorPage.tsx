import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Endpoint, EndpointType, Workflow, Zone, ZoneType } from '@/shared/api/contracts'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { WorkflowBuilderPanel } from '@/features/workflows/WorkflowBuilderPanel'
import { WORKFLOWS } from '@/features/workflows/mock'
import { ENDPOINT_TEMPLATES, ZONE_TEMPLATES } from './constants'
import { EDITOR_DEFAULTS, MAP_VERSIONS, SEED_ZONES } from './mock'
import './maps.css'

type Tool = 'workflows' | 'endpoints' | 'traffic'

type Mode =
  | { kind: 'idle' }
  | { kind: 'picker'; tool: Tool }
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'placing'; endpointType: EndpointType }
  | { kind: 'zone'; zoneId: string }

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

const PENDING_ENDPOINT_AT = { x: 260, y: 200 }

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
      return { kind: 'placing', endpointType: 'CHARGING' }
    case 'zone':
      return { kind: 'zone', zoneId: 'zone-b' }
    default:
      return { kind: 'idle' }
  }
}

function initialZones(): Zone[] {
  return SEED_ZONES.map((zone) => ({ ...zone, geometry: { points: [...zone.geometry.points] } }))
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
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [zones, setZones] = useState<Zone[]>(initialZones)
  const [workflows, setWorkflows] = useState<Workflow[]>(WORKFLOWS)
  const [query, setQuery] = useState('')

  const activeTool: Tool | null =
    mode.kind === 'picker'
      ? mode.tool
      : mode.kind === 'workflow'
        ? 'workflows'
        : mode.kind === 'placing'
          ? 'endpoints'
          : mode.kind === 'zone'
            ? 'traffic'
            : null

  const selectedZone = mode.kind === 'zone' ? zones.find((zone) => zone.id === mode.zoneId) : undefined
  const selectedWorkflow =
    mode.kind === 'workflow' ? workflows.find((workflow) => workflow.id === mode.workflowId) : undefined
  const panelOpen = Boolean(selectedZone ?? selectedWorkflow)

  function createWorkflow() {
    const count = workflows.length + 1
    const workflow: Workflow = {
      // Temporary client id/code: the backend assigns the id and version on save; the Admin edits the code.
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

  function confirmEndpoint(endpointType: EndpointType) {
    const count = endpoints.length + 1
    setEndpoints((current) => [
      ...current,
      {
        id: `draft-endpoint-${count}`,
        mapVersionId: version.id,
        code: `EP-${endpointType}-${String(count).padStart(2, '0')}`,
        name: `${endpointType} ${count}`,
        endpointType,
        x: PENDING_ENDPOINT_AT.x + (count - 1) * 36,
        y: PENDING_ENDPOINT_AT.y,
        yaw: 0,
        positionTolerance: 0.1,
        yawTolerance: 5,
        isEnabled: true,
      },
    ])
    setMode({ kind: 'idle' })
  }

  function addZone(zoneType: ZoneType, title: string) {
    const count = zones.length + 1
    const left = 120 + (count - 4) * 24
    const top = 200 + (count - 4) * 24
    const zone: Zone = {
      id: `draft-zone-${count}`,
      mapVersionId: version.id,
      code: `ZN-${String(count).padStart(2, '0')}`,
      name: `${title} - ${count}`,
      zoneType,
      capacity: zoneType === 'RESTRICTED_AREA' ? 0 : 2,
      maxSpeed: null,
      isActive: true,
      geometry: {
        points: [
          { x: left, y: top },
          { x: left + 220, y: top },
          { x: left + 220, y: top + 110 },
          { x: left, y: top + 110 },
        ],
      },
    }
    setZones((current) => [...current, zone])
    setMode({ kind: 'zone', zoneId: zone.id })
  }

  function patchZone(zoneId: string, patch: Partial<Zone>) {
    setZones((current) => current.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)))
  }

  function removeZone(zoneId: string) {
    setZones((current) => current.filter((zone) => zone.id !== zoneId))
    setMode({ kind: 'idle' })
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
                onClick={() => (selectedZone ? removeZone(selectedZone.id) : setMode({ kind: 'idle' }))}
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
          <div className="editor__sheet">
            {activeTool === 'traffic' ? (
              <div className="editor__board">
                {zones.map((zone) => {
                  const xs = zone.geometry.points.map((point) => point.x)
                  const ys = zone.geometry.points.map((point) => point.y)
                  const left = Math.min(...xs)
                  const top = Math.min(...ys)
                  return (
                    <div
                      key={zone.id}
                      className={`userzone userzone--${zone.zoneType}${selectedZone?.id === zone.id ? ' is-selected' : ''}`}
                      style={{ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }}
                      onClick={() => setMode({ kind: 'zone', zoneId: zone.id })}
                    >
                      {zone.zoneType === 'RESTRICTED_AREA' ? (
                        <strong className="userzone__title">
                          <Icon name="stop" size={14} /> {zone.name}
                        </strong>
                      ) : (
                        <>
                          <strong>{zone.name}</strong>
                          {zone.isActive && zone.capacity > 0 ? <em className="userzone__active">Active</em> : null}
                          <span className="userzone__dot" />
                          <small>
                            {zone.capacity > 0 ? `Capacity: ${zone.capacity} RBTs` : ''}
                            <b>ID: {zone.code}</b>
                          </small>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
            <div className="editor__cluster">
              <div className="zoneblk zoneblk--storage" style={{ left: 0, top: 0, width: 192, height: 141 }}>
                <span>STORAGE RACKS</span>
                <i style={{ left: 15 }} />
                <i style={{ left: 62 }} />
                <i style={{ left: 108 }} />
              </div>
              <div className="zoneblk zoneblk--qa" style={{ left: 216, top: 0, width: 246, height: 99 }}>
                <span>QUALITY ASSURANCE</span>
              </div>
              <div className="zoneblk zoneblk--dock" style={{ left: 216, top: 108, width: 246, height: 123 }}>
                <span>CROSS-DOCK</span>
              </div>
              <div className="zoneblk zoneblk--ship" style={{ left: 57, top: 282, width: 342, height: 123 }}>
                <span>SHIPPING LANES</span>
                <b className="is-sel" style={{ left: 12 }} />
                <b style={{ left: 174 }} />
              </div>
            </div>
            )}

            {endpoints.map((endpoint) => (
              <span key={endpoint.id} className="marker" style={{ left: endpoint.x, top: endpoint.y }}>
                <small>{endpoint.code}</small>
              </span>
            ))}

            {mode.kind === 'placing' ? (
              <>
                <span className="marker" style={{ left: PENDING_ENDPOINT_AT.x, top: PENDING_ENDPOINT_AT.y }} />
                <div
                  className="confirm-bubble"
                  style={{ left: PENDING_ENDPOINT_AT.x - 30, top: PENDING_ENDPOINT_AT.y - 96 }}
                >
                  Place endpoint here?
                  <div>
                    <button type="button" onClick={() => setMode({ kind: 'idle' })}>
                      Cancel
                    </button>
                    <button type="button" className="is-ok" onClick={() => confirmEndpoint(mode.endpointType)}>
                      OK
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="editor__float">
            {(['layers', 'target', 'wrench', 'navigate', 'plus', 'minus', 'sort'] as IconName[]).map((icon) => (
              <button key={icon} type="button" aria-label={icon}>
                <Icon name={icon} size={13} />
              </button>
            ))}
          </div>

          <div className="editor__compass">
            0°
            <br />
            90°
            <br />x: -107.00 m<br />y: 51.05 m
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
                              <strong>{workflow.code}</strong>
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
                      <button type="button" className="wf__add">
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
                          <button type="button" onClick={() => setMode({ kind: 'placing', endpointType: item.type })}>
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
                        placeholder="Search zone types..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
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
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {selectedWorkflow ? (
          <aside className="editor__panel">
            <WorkflowBuilderPanel
              key={selectedWorkflow.id}
              workflow={selectedWorkflow}
              onChange={(next) =>
                setWorkflows((current) => current.map((item) => (item.id === next.id ? next : item)))
              }
            />
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
                <span>Code</span>
                <input
                  value={selectedZone.code}
                  onChange={(event) => patchZone(selectedZone.id, { code: event.target.value })}
                />
              </label>
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

      <footer className="editor__status">
        <span>
          <span className="dot" /> Fleet Core Online
        </span>
        <span>{EDITOR_DEFAULTS.siteLabel}</span>
        <span className="spacer">WaroTrans v{version.versionNo}.0 · Zoom: 1.0x</span>
      </footer>
    </div>
  )
}
