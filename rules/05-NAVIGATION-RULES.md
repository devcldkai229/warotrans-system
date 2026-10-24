# 05 — Navigation Rules

## Mental model
```text
Endpoint = WHERE the Robot should arrive
Edge     = WHERE the Robot can logically travel / a path segment
Zone     = AREA where navigation/traffic rules apply
```

These are different concepts.

## MapVersion
Navigation entities belong to a MapVersion.

ROS/Nav2 occupancy metadata on MapVersion includes:
```text
Code (unique per Warehouse)
MapUri (occupancy raster, typically map.pgm)
MapYamlUri
PreviewImageUri (browser PNG)
FrameId (normally "map")
ImageWidthPixels / ImageHeightPixels
Resolution (m/px)
OriginX / OriginY / OriginYaw
Negate / OccupiedThreshold / FreeThreshold
ContentHash
```

Geometry on Edge and Zone is expressed in **world meters** in `MapVersion.FrameId`.
**Pixel coordinates are never persisted.**

## Endpoint
A semantic robot destination.

Examples:
```text
EP-WAYPOINT-01
EP-CHARGER-01
EP-PARK-01
```

Typical EndpointType values:
```text
WAYPOINT
CHARGER
PARK
```

Stores map pose (world meters / radians):
```text
X                 meters
Y                 meters
Yaw               radians
PositionTolerance meters
YawTolerance      radians
```

## EndpointGroup
Logical group of Endpoints, e.g. parking group.
MOVE may target a specific Endpoint or a group when runtime selection is supported.

## Zone
Zone is a coordinate-defined polygon on a MapVersion.

**Zone is not required to reference an Endpoint.**

Canonical persisted geometry is GeoJSON Polygon in world meters (`FrameId`):
```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [1.0, 1.0],
      [4.0, 1.0],
      [4.0, 3.0],
      [1.0, 3.0],
      [1.0, 1.0]
    ]
  ]
}
```

Rules: finite numbers, at least 3 unique vertices, outer ring closed (first == last).

Typical types:
```text
KEEP_OUT
SPEED
NO_STOP
SINGLE_OCCUPANCY
JUNCTION
```

Zone columns:
```text
capacity
maxSpeed?            meters/second
isActive
policy               jsonb (type-specific, schema-versioned)
policySchemaVersion  int (v1)
```

### Zone policy (schema v1)
Typed common fields stay on columns; `policy` only holds type-specific extras.

| ZoneType | Policy rules |
|----------|----------------|
| `KEEP_OUT` | empty/null policy OK; Capacity ≥ 1 (no entry) |
| `SPEED` | Capacity ≥ 1; MaxSpeed required (m/s) |
| `NO_STOP` | empty/null policy OK; Capacity ≥ 1 |
| `SINGLE_OCCUPANCY` | Capacity must be 1; MaxSpeed optional |
| `JUNCTION` | Capacity must be 1; MaxSpeed optional; free movement inside to transition toward the next point |

Do not invent ZoneType values beyond the enum above.

## Edge
Edge is a coordinate-defined ordered polyline/path segment on a MapVersion.

**Edge is not required to start/end at an Endpoint.**

Canonical persisted geometry is GeoJSON LineString in world meters (`FrameId`):
```json
{
  "type": "LineString",
  "coordinates": [
    [1.0, 2.0],
    [2.5, 2.2],
    [4.0, 3.0]
  ]
}
```

Rules: finite numbers, at least 2 positions.

Properties:
```text
widthMeters          meters, must be > 0
direction            ONE_WAY | BIDIRECTIONAL
capacity
maxSpeed?            meters/second
isActive
```

Do not force `sourceEndpointId` or `destinationEndpointId` onto Edge.

## Map lifecycle
Only **DRAFT** MapVersions accept Endpoint / Edge / Zone create, update, or delete.
PUBLISHED and ARCHIVED geometry is immutable at the API.

## Traffic coordination
V1 does not persist:
- TrafficResource
- TrafficReservation

Use an in-memory `TrafficCoordinator` for a single backend instance
(ADR 0007 / 0008).

It may maintain runtime:
- Zone occupancy
- Edge / lane resource occupancy
- junction conflict groups / critical corridors
- capacity
- waiting queues (FIFO)

MOVE execution consults it before issuing `NAVIGATE_TO_POSE` and attaches a
`route { graphHash, edgeIds[] }` grant when route mode is active.

Compiled topology lives in `CompiledTrafficGraph` (immutable, hashed, cached
per PUBLISHED MapVersion). Export to Nav2 Route Server uses the same edge ids.

`JUNCTION` is the primary single-robot free-motion junction zone.
`SINGLE_OCCUPANCY` / `NO_STOP` may still form junction links (legacy warning).

Nav2 owns local tracking/`FollowPath` inside the granted corridor.
Backend TrafficCoordinator is the only authority that grants Edge/Zone use.

## WAIT rule
Traffic waiting is execution control around MOVE/navigation, not a business WAIT WorkflowStep.
