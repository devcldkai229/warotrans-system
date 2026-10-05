const STATS = [
  { label: 'Total AMR Fleet', value: '6 Robots', ok: false },
  { label: 'Active Missions', value: '4 Moving', ok: false },
  { label: 'Safety Status', value: 'All Clear', ok: true },
]

export function FacilityTwinMap() {
  return (
    <>
      <div className="twin__head">
        <div>
          <h2>Facility Live Topology &amp; Telemetry</h2>
          <p>Real-time SLAM digital twin representation of active zone</p>
        </div>
        <span className="twin__chip">WH-HN-01</span>
      </div>

      <div className="twin__canvas">
        <div className="twin__zone" style={{ left: 40, top: 30, width: 160, height: 50 }}>
          AISLE A (RACK 01-12)
        </div>
        <div className="twin__zone" style={{ left: 40, top: 110, width: 160, height: 50 }}>
          AISLE B (RACK 13-24)
        </div>
        <div className="twin__zone" style={{ left: 40, top: 190, width: 160, height: 50 }}>
          AISLE C (RACK 25-36)
        </div>
        <div
          className="twin__zone twin__zone--charge"
          style={{ right: 40, top: 30, width: 140, height: 100, flexDirection: 'column' }}
        >
          <span>CHARGING BAY</span>
          <span>3/3 Docks Avail</span>
        </div>
        <div
          className="twin__zone twin__zone--inbound"
          style={{ left: 40, bottom: 30, width: 200, height: 45 }}
        >
          INBOUND DOCK 1 &amp; 2
        </div>
        <div
          className="twin__zone twin__zone--outbound"
          style={{ right: 40, bottom: 30, width: 180, height: 45 }}
        >
          OUTBOUND STAGING BAY
        </div>
        <div className="twin__path" style={{ left: 210, top: 60, width: 180 }} />
        <span className="twin__amr" style={{ left: 240, top: 51 }} />
        <span className="twin__amr" style={{ left: 290, top: 125 }} />
        <span className="twin__amr twin__amr--light" style={{ right: 90, top: 145 }} />
        <span className="twin__amr" style={{ left: 260, bottom: 40 }} />
      </div>

      <div className="twin__stats">
        {STATS.map((stat) => (
          <div key={stat.label} className="twin__stat">
            <span>{stat.label}</span>
            <strong className={stat.ok ? 'is-ok' : undefined}>{stat.value}</strong>
          </div>
        ))}
      </div>
    </>
  )
}
