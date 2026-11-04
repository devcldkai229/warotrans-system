# 09 — UML Diagram Specification

**Audit date:** 2026-11-03  
**Notation:** UML Package Diagram; dashed arrows = dependencies (dependent → required); nesting = containment.  
**Line style:** orthogonal (`skinparam linetype ortho`).  
**Confidence:** PlantUML below includes **VERIFIED** compile/package dependencies only. Runtime edges are commented, not drawn as primary deps.

---

## A. Overall Package Diagram

1. **Title:** WaroTrans — Overall Package Diagram  
2. **Outer/root package:** `WaroTrans` «logical grouping»  
3. **Nested packages:** `UserApplications`, `Backend`, `RobotEdge`  
4. **Inside UserApplications:** `web`, `app`  
5. **Inside Backend:** Host, BuildingBlocks, Identity, Warehouse, Transportation, WorkflowExecution, Fleet, Navigation, Operations  
6. **Inside RobotEdge:** all 13 `warotrans_*` packages (simulation may be stereotype `simulation`)  
7. **Verified dependency arrows (Backend only on overall):** see Backend diagram; overall may omit dense ROS/frontend internals  
8. **Ambiguity:** Cross-repo MQTT/REST are runtime — do not draw as unmarked package deps

### PlantUML — Overall (structural + backend deps)

```plantuml
@startuml WaroTrans_Overall_Package
skinparam linetype ortho
skinparam packageStyle rectangle

package "WaroTrans «logical»" {
  package "UserApplications «logical»" {
    package "web"
    package "app"
  }

  package "Backend «logical»" {
    package "WaroTrans.Host" as Host
    package "WaroTrans.BuildingBlocks" as BB
    package "WaroTrans.Identity" as Id
    package "WaroTrans.Warehouse" as Wh
    package "WaroTrans.Transportation" as Tr
    package "WaroTrans.WorkflowExecution" as WE
    package "WaroTrans.Fleet" as Fl
    package "WaroTrans.Navigation" as Nav
    package "WaroTrans.Operations" as Op
  }

  package "RobotEdge «logical»" {
    package "warotrans_msgs" as rmsgs
    package "warotrans_description" as rdesc
    package "warotrans_hardware" as rhw
    package "warotrans_sensors" as rsens
    package "warotrans_localization" as rloc
    package "warotrans_slam" as rslam
    package "warotrans_navigation" as rnav
    package "warotrans_lane_planner" as rlane
    package "warotrans_fleet" as rfleet
    package "warotrans_teleop" as rtele
    package "warotrans_perception" as rperc
    package "warotrans_bringup" as rbring
    package "warotrans_simulation «simulation»" as rsim
  }
}

Host ..> BB
Host ..> Id
Host ..> Wh
Host ..> Tr
Host ..> WE
Host ..> Fl
Host ..> Nav
Host ..> Op
Id ..> BB
Wh ..> BB
Op ..> BB
Nav ..> BB
Nav ..> Wh
Fl ..> BB
Fl ..> Wh
Fl ..> Nav
WE ..> BB
WE ..> Fl
WE ..> Nav
Tr ..> BB
Tr ..> WE
Tr ..> Wh
Tr ..> Nav

rhw ..> rmsgs
rtele ..> rmsgs
rtele ..> rhw
rnav ..> rlane
rbring ..> rdesc
rbring ..> rhw
rbring ..> rtele
rbring ..> rsens
rbring ..> rloc
rbring ..> rslam
rbring ..> rnav
rbring ..> rperc
rbring ..> rfleet
rsim ..> rdesc
rsim ..> rloc
rsim ..> rnav
rsim ..> rfleet
rsim ..> rlane

' Runtime only — do not treat as compile deps:
' web ..> Host : «runtime REST+SignalR»
' app ..> Host : «runtime REST+SignalR»
' BB ..> rfleet : «runtime MQTT»
@enduml
```

---

## B. User Applications Subsystem Package Diagram

1. **Title:** WaroTrans — User Applications Package Diagram  
2. **Outer:** `UserApplications`  
3. **Nested:** `web` {`web.app`, `web.features`, `web.shared`}, `app` {`app.app`, `app.features`, `app.shared`}  
4. **Deps:** app/shell → features → shared (both trees); no shared library between web and app  
5. **Ambiguity:** limited web cross-feature imports exist — omit from primary diagram or note as exceptions

```plantuml
@startuml WaroTrans_UserApplications_Package
skinparam linetype ortho
skinparam packageStyle rectangle

package "UserApplications «logical»" {
  package "web" {
    package "web.app" as WA
    package "web.features" as WF
    package "web.shared" as WS
  }
  package "app" {
    package "app.app" as AA
    package "app.features" as AF
    package "app.shared" as AS
  }
}

WA ..> WF
WF ..> WS
AA ..> AF
AF ..> AS
@enduml
```

---

## C. Backend Subsystem Package Diagram

1. **Title:** WaroTrans — Backend Package Diagram  
2. **Outer:** `Backend`  
3. **Packages:** Host, BuildingBlocks, seven modules  
4. **Deps:** ProjectReference graph only  
5. **Ambiguity:** Internal folders Traffic/RouteGraph/Mqtt are namespaces — optional nested detail diagram

```plantuml
@startuml WaroTrans_Backend_Package
skinparam linetype ortho
skinparam packageStyle rectangle

package "Backend «logical»" {
  package "WaroTrans.Host" as Host
  package "WaroTrans.BuildingBlocks" as BB
  package "WaroTrans.Identity" as Id
  package "WaroTrans.Warehouse" as Wh
  package "WaroTrans.Transportation" as Tr
  package "WaroTrans.WorkflowExecution" as WE
  package "WaroTrans.Fleet" as Fl
  package "WaroTrans.Navigation" as Nav
  package "WaroTrans.Operations" as Op
}

Host ..> BB
Host ..> Id
Host ..> Wh
Host ..> Tr
Host ..> WE
Host ..> Fl
Host ..> Nav
Host ..> Op
Id ..> BB
Wh ..> BB
Op ..> BB
Nav ..> BB
Nav ..> Wh
Fl ..> BB
Fl ..> Wh
Fl ..> Nav
WE ..> BB
WE ..> Fl
WE ..> Nav
Tr ..> BB
Tr ..> WE
Tr ..> Wh
Tr ..> Nav
@enduml
```

### Optional Backend Traffic Detail (namespaces, not separate projects)

```plantuml
@startuml WaroTrans_Backend_Traffic_Namespaces
skinparam linetype ortho
package "WaroTrans.Navigation" {
  package "RouteGraph"
  package "Traffic" as NavTraffic
}
package "WaroTrans.Fleet" {
  package "Traffic" as FleetTraffic
  package "Mqtt" as FleetMqtt
}
package "WaroTrans.BuildingBlocks" {
  package "Mqtt" as BBMqtt
}
FleetTraffic ..> NavTraffic
FleetMqtt ..> BBMqtt
NavTraffic ..> RouteGraph
@enduml
```

Evidence: Fleet ProjectReference→Navigation; Fleet MQTT uses BuildingBlocks MQTT; TrafficGraphCompiler uses RouteGraphBuilder.

---

## D. Robot Edge Subsystem Package Diagram

1. **Title:** WaroTrans — Robot Edge Package Diagram  
2. **Outer:** `RobotEdge`  
3. **Packages:** 13 ROS packages  
4. **Deps:** package.xml warotrans_* edges (+ optional annotated fleet→simulation import)  
5. **Ambiguity:** bringup declares fleet but current launches may not Include fleet.launch — keep package.xml edge; note uncertainty

```plantuml
@startuml WaroTrans_RobotEdge_Package
skinparam linetype ortho
skinparam packageStyle rectangle

package "RobotEdge «logical»" {
  package "warotrans_msgs" as rmsgs
  package "warotrans_description" as rdesc
  package "warotrans_hardware" as rhw
  package "warotrans_sensors" as rsens
  package "warotrans_localization" as rloc
  package "warotrans_slam" as rslam
  package "warotrans_navigation" as rnav
  package "warotrans_lane_planner" as rlane
  package "warotrans_fleet" as rfleet
  package "warotrans_teleop" as rtele
  package "warotrans_perception" as rperc
  package "warotrans_bringup" as rbring
  package "warotrans_simulation «simulation»" as rsim
}

rhw ..> rmsgs
rtele ..> rmsgs
rtele ..> rhw
rnav ..> rlane
rbring ..> rdesc
rbring ..> rhw
rbring ..> rtele
rbring ..> rsens
rbring ..> rloc
rbring ..> rslam
rbring ..> rnav
rbring ..> rperc
rbring ..> rfleet
rsim ..> rdesc
rsim ..> rloc
rsim ..> rnav
rsim ..> rfleet
rsim ..> rlane

' Optional annotated undeclared import:
' rfleet ..> rsim : «python import semantic_map_adapter»
@enduml
```

---

## Evidence references

- Backend ProjectReferences: `backend/**/*.csproj`, `backend/WaroTrans.slnx`
- Frontend trees: `web/src/**`, `app/src/**`, package.json files
- ROS: `ros2_ws/src/*/package.xml`, setup.py / plugin XML
- Full edge list: `06_PACKAGE_DEPENDENCIES.csv`
- Descriptions: `08_PACKAGE_DESCRIPTIONS.md`
