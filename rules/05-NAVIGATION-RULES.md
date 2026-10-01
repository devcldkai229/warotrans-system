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

## Endpoint
A semantic robot destination.

Examples:
```text
EP-INBOUND-01
EP-SHELF-A
EP-OUTBOUND-01
EP-CHARGING-01
EP-MAINTENANCE-01
```

Stores map pose:
```text
X
Y
Yaw
PositionTolerance
YawTolerance
```

## EndpointGroup
Logical group of Endpoints, e.g. parking group.
MOVE may target a specific Endpoint or a group when runtime selection is supported.

## Zone
Zone is a coordinate-defined polygon on a MapVersion.

**Zone is not required to reference an Endpoint.**

Example:
```json
{
  "points": [
    { "x": 1.0, "y": 1.0 },
    { "x": 4.0, "y": 1.0 },
    { "x": 4.0, "y": 3.0 },
    { "x": 1.0, "y": 3.0 }
  ]
}
```

Typical types:
```text
INTERSECTION
NARROW_AREA
OPERATIONAL_AREA
RESTRICTED_AREA
```

Zone may define:
```text
capacity
maxSpeed?
isActive
```

## Edge
Edge is a coordinate-defined ordered polyline/path segment on a MapVersion.

**Edge is not required to start/end at an Endpoint.**

Example:
```json
{
  "points": [
    { "x": 1.0, "y": 2.0 },
    { "x": 2.5, "y": 2.2 },
    { "x": 4.0, "y": 3.0 }
  ]
}
```

Properties:
```text
direction = ONE_WAY | BIDIRECTIONAL
capacity
maxSpeed?
isActive
```

Do not force `sourceEndpointId` or `destinationEndpointId` onto Edge.

## Traffic coordination
V1 does not persist:
- TrafficResource
- TrafficReservation

Use an in-memory `TrafficCoordinator` for a single backend instance.

It may maintain runtime:
- Zone occupancy
- Edge occupancy
- capacity
- waiting queues

MOVE execution may consult it before entering constrained geometry.

Nav2 owns local planning/obstacle avoidance.
Backend TrafficCoordinator is high-level fleet coordination.

## WAIT rule
Traffic waiting is execution control around MOVE/navigation, not a business WAIT WorkflowStep.
