# 12 — Workflow Catalog

All workflows reuse:
```text
CHECK
MOVE
HUMAN_INTERACTION
WAIT
```

Differences come from business intent, variables, bindings, output chaining, and failure policy.

## Core

### INBOUND_PUTAWAY
```text
prepared inbound Container
→ receiving pickup
→ storage destination
→ Staff dropoff confirmation
→ Container stored
```

### OUTBOUND_RETRIEVAL
```text
stored Container
→ source pickup
→ outbound endpoint
→ dropoff confirmation
```

Inventory validation must follow Container-level V1 semantics.

### INTERNAL_RELOCATION
Move Container from one storage location/level to another.
Supports one or many movement rows in the same Request/Job.

### POINT_TO_POINT_TRANSPORT
Move Container(s) between operational Endpoints.
StorageLocation is optional/not required.

### PAYLOAD_RECOVERY
```text
Robot A fails + Container onboard
→ original Job RECOVERY_REQUIRED
→ dispatch Robot B
→ B moves to safe recovery Endpoint
→ Staff transfers Container A → B
→ assignment changes
→ same Job resumes original destination
```

Do not create a new TransportRequest.  
Do not create a new Job batch for payload recovery — resume the **same Job** (and its JobContainer rows) after reassignment.

### REPLENISHMENT
Move a prepared Container from reserve/storage to picking/forward location.
Robot workflow does not manipulate item quantity.

### MAINTENANCE_ALL_ROBOTS
Fleet-level orchestration.
Do not create one Job that concurrently controls every Robot.
Expand into per-Robot execution/Jobs according to the finalized implementation.
V1 recommendation: `maxConcurrentRobots = 1`.

## Optional

### QUALITY_INSPECTION_TRANSFER
Move Container to inspection area and record inspection result.

### ROBOT_RETURN_TO_PARK
Validate Robot idle/empty and return it to Parking Endpoint/EndpointGroup.

### ROBOT_CHARGING
Robot navigates to charging Endpoint.
Physical connect/disconnect remains manual and is confirmed with HUMAN_INTERACTION.

### EMPTY_CONTAINER_RETURN
Return an `EMPTY` Container to the return/reuse area.

### ROBOT_PREPOSITIONING
Move an idle Robot to an operational waiting Endpoint.
V1 may be manually triggered; no predictive AI required.

## Step responsibilities
```text
CHECK             = backend-known guard condition
MOVE              = robot navigation to semantic destination
HUMAN_INTERACTION = authorized human business confirmation
WAIT              = duration/event/robot-state wait
```

Traffic waiting is not a WAIT business Step.
