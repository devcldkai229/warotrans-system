# WAROTRANS — AUTONOMOUS GAZEBO TEST, DIAGNOSE, FIX & RETEST

## 0. MISSION — EXECUTE AUTONOMOUSLY

Act as a Senior ROS 2 Jazzy / Nav2 / Gazebo / Fleet Traffic Robotics Engineer.

You have access to two repositories:

- `warotrans`: ROS 2, Nav2, Gazebo, LaneAware Planner, Semantic Map Adapter, robot navigation and safety.
- `warotrans-system`: ASP.NET Backend, Map Editor, semantic traffic coordination, MQTT, Fleet Monitor.

**Your task is to autonomously bring up the real Gazebo simulation, test navigation between ALL existing warehouse Endpoints, diagnose failures, fix genuine code/configuration defects, rebuild and repeat testing until acceptance criteria are met or a verified blocker is identified.**

I will be away for approximately 2–3 hours.

Work independently throughout the available execution session. Do not stop after the first error, test, or written report.

Use the iterative process:

**INSPECT → LAUNCH → TEST → MEASURE → DIAGNOSE → FIX → REBUILD → RETEST → REGRESSION CHECK**

Continue to the next incomplete test after each successful fix.

Do not require manual confirmation for routine source-code fixes, builds, test runs or restart operations that are safely within the isolated simulation environment.

If tool permissions, execution limits or environmental failures prevent further progress, preserve a checkpoint and report the exact blocker rather than claiming success.

Do not create an infinite retry loop. Use bounded retries per root cause, preserve results and continue with independent executable tests when possible.

**This is an execution task, not a planning-only or documentation-only task.**

---

# 1. CURRENT SYSTEM CONTEXT

WaroTrans has migrated toward:

**Nav2 Free-Space Navigation + Semantic Lane/Zone Policies + Fleet Traffic Coordination.**

The old Backend-generated RouteGraph is no longer the intended navigation architecture.

Do NOT reactivate:

- RouteGraphBuilder
- TrafficGraphCompiler
- Generated Junction connectors
- Backend-generated navigation paths
- Nav2 Route Server graph routing

Nav2 is responsible for path planning and actual movement.

Semantic Map policies determine which movements are legal.

Traffic Coordinator is responsible for shared-resource authorization.

### Current map

The latest warehouse map is `MAP-ONE-V001`, currently DRAFT in Map Editor.

Previous snapshot reported:

- 17 Endpoints
- 7 authored Lanes
- 13 semantic Zones
- KEEP_OUT ×1
- SPEED ×2
- NO_STOP ×2
- SINGLE_OCCUPANCY ×8

Semantic fingerprint previously reported:

`6dd72df135c22c33bcc620575d0d222b686953910b953b8f216d992431f27ff0`

This is reference information only.

**Re-export and verify the current snapshot. Do not assume old fingerprints or Endpoint IDs remain unchanged.**

No JUNCTION Zone is required. Open intersections must be navigable free space.

### Known blockers from the latest audit

Previously fixed:

- LaneAwareNavfn pluginlib identifier mismatch.
- `path_policy_validator.py` Path import shadowing.
- Nav2 lifecycle bringup failure.

Still unresolved or unverified:

1. `LaneAwareNavfn: start/goal lethal`.
2. PGM free cells vs live global costmap lethal / NO_INFORMATION.
3. Intermittent `Filter mask was not received`.
4. Path Policy Validator runtime policy-rejection evidence missing.
5. Actual NavigateToPose endpoint movement NOT_RUN.
6. ONE_WAY live execution NOT VERIFIED.
7. Stage 3a two-robot Gazebo E2E NOT VERIFIED.

Start by checking whether these issues still exist. Fix current root causes rather than blindly applying old assumptions.

---

# 2. STRICT SAFETY AND DATABASE RULES

## Existing database: READ-ONLY

Never modify the existing database.

Forbidden:

- INSERT / UPDATE / DELETE / UPSERT
- Database migrations
- Map publishing
- Endpoint modification
- Lane modification
- Zone modification
- PGM/YAML source modification
- StorageLocation changes
- Production Job/Robot state writes

Use READ-ONLY APIs, exports or snapshots.

Generated simulation assets, test fixtures, launch/config files and source-code changes are allowed.

For mutable simulation state, use an isolated simulation database or runtime store.

Never direct autonomous test activity to a real physical robot.

All motion tests must target **Gazebo SIM-01 and SIM-02 only**.

## Mandatory motion safety

Never bypass or weaken:

- ONE_WAY hard constraints
- KEEP_OUT
- Robot footprint/collision checking
- Motion Authority Gate
- Collision Monitor
- Traffic reservations when testing multiple robots
- Emergency stopping

Do not reduce footprint, inflation, safety margins or costmap lethal thresholds just to make a test pass.

If a goal is physically impossible or unsafe, report it honestly rather than changing the map silently.

---

# 3. PHASE A — AUTOMATIC SYSTEM BRINGUP

Autonomously inspect the existing repository scripts and launch configurations.

Reuse existing commands where possible instead of building duplicate infrastructure.

### Start the required components

1. ROS 2 Jazzy environment inside WSL2.
2. Gazebo with the latest warehouse simulation world.
3. ROS/Gazebo bridge.
4. Map Server and localization.
5. Nav2 Planner Server.
6. Controller Server.
7. BT Navigator.
8. LaneAwareNavfn plugin.
9. KEEP_OUT and SPEED filters.
10. Path Policy Validator.
11. Velocity Smoother and Collision Monitor.
12. Motion Authority Gate.
13. Any required semantic map service.

Start Backend/Traffic services only when their functionality is required for the selected test.

Use headless Gazebo if GUI execution is unavailable.

### Required readiness verification

Confirm from actual runtime:

- Gazebo simulation clock advances.
- SIM-01 exists in the world.
- ROS topics are available.
- TF tree is valid.
- AMCL/localization is stable.
- LiDAR and odometry are publishing.
- Global and local costmaps are populated.
- Planner and Controller lifecycle states are ACTIVE.
- LaneAware planner is actually selected.
- KEEP_OUT and SPEED masks are received.
- Policy Validator stays alive.
- Motion Authority Gate is active.

If any prerequisite fails:

1. Collect diagnostic logs.
2. Identify the actual root cause.
3. Apply a minimal fix.
4. Rebuild affected packages.
5. Restart the affected services.
6. Retest the prerequisite.

Do not advance to autonomous movement before these prerequisites are satisfied.

---

# 4. PHASE B — RESOLVE COSTMAP & PLANNING BLOCKERS

Highest priority: make Nav2 actually compute valid free-space paths.

Investigate the previous error:

`LaneAwareNavfn: start/goal lethal`

For each failing start/goal, inspect:

- Actual world coordinates.
- TF transformation.
- Occupancy PGM cell value.
- Nav2 global costmap value.
- Local costmap value where relevant.
- Filter mask values.
- Inflation contribution.
- Full robot footprint collision.
- Costmap origin, resolution and update state.

Remember:

PGM grayscale value 254 is NOT equivalent to Nav2 costmap lethal value 254.

Check whether cost 253/254/255 is caused by real geometry, insufficient clearance, filter errors, unknown space or incorrect initialization.

Compare standard NavFn against LaneAwareNavfn on the same costmap for planning diagnostics.

**Standard NavFn may be used for diagnosis only. Never execute a path that bypasses ONE_WAY.**

Do not blindly change:

`cost >= 253`

into a weaker condition.

Only change cost handling when source-level analysis and live costmap evidence prove the original logic incorrect.

### Success criteria

- Valid start and goal poses can generate valid paths.
- Occupied, unknown or physically unsafe poses remain rejected.
- LaneAwareNavfn produces nonempty paths where legal routes exist.
- No unexpected filter initialization failures.
- No unsafe fallback planner.

---

# 5. PHASE C — EXHAUSTIVE ENDPOINT PATH PLANNING

Discover all Endpoints dynamically from the current semantic map snapshot.

Do not hardcode old Endpoint codes or coordinates.

Build an automated endpoint-to-endpoint planning matrix.

For N Endpoints, check all ordered distinct pairs:

`N × (N − 1)`

For 17 Endpoints, this means **272 directed planning tests**.

For every pair:

`SOURCE_ENDPOINT → DESTINATION_ENDPOINT`

Ask the actual Nav2 Planner Server to compute a path.

Use the corresponding Endpoint X/Y/Yaw as goals.

For planning-only tests, use a valid isolated simulated start pose at the source Endpoint, while clearly distinguishing these tests from actual robot movement.

Do not teleport a moving robot as a shortcut to claiming successful physical execution.

### For each planned path verify

- Path exists when a safe legal route exists.
- No ONE_WAY reverse traversal.
- No KEEP_OUT intersection.
- Correct Lane membership and entry/exit behavior.
- Correct free-space traversal through unmarked intersections.
- Robot footprint clearance.
- Valid goal position and yaw.
- No path crossing physically blocked shelves or walls.
- No invalid shortcut bypassing Lane policy.

When no valid path exists, distinguish:

- `NO_VALID_PATH_EXPECTED`: correctly blocked by traffic or geometry policy.
- `MAP_DATA_BLOCKED`: goal or corridor is physically or semantically infeasible.
- `PLANNER_DEFECT`: a valid route exists but the planner fails.
- `CONFIGURATION_DEFECT`: lifecycle, masks, frames or plugin issue.
- `UNKNOWN`: evidence is insufficient.

Do not classify all unreachable pairs as defects.

### Debug and retest

For planner defects:

1. Save failed start/goal and path diagnostics.
2. Identify the failing constraint or search behavior.
3. Apply the smallest correct source/configuration fix.
4. Rerun the failed case.
5. Rerun relevant regression cases.
6. Update the planning matrix.

Never introduce hardcoded paths, Endpoint-specific exceptions or illegal movement to make planning tests pass.

### Planning output

Generate a directed reachability matrix and summary:

- Total ordered pairs
- Valid legal routes
- Correctly rejected routes
- Unexpected failures
- Map-data blockers
- Average planning latency
- Path length and clearance statistics

Also verify each Endpoint can be entered and exited where the map's legal connectivity permits.

---

# 6. PHASE D — REAL SIM-01 ENDPOINT NAVIGATION

Once planning and safety policies are healthy, execute actual SIM-01 movement.

This must use Gazebo physics and Nav2.

Do not substitute:

- Static path simulation
- Teleportation
- Scripted poses
- Direct cmd_vel shortcuts
- Fake successful action responses

### Test strategy

Create an automated travel sequence covering:

- Every Endpoint that is legally reachable.
- Entry into and departure from each Endpoint.
- Every ONE_WAY Lane in its permitted direction.
- BIDIRECTIONAL travel where configured.
- Multiple open intersections.
- Different START → GOAL directions.
- KEEP_OUT avoidance.
- SPEED Zone traversal.
- NO_STOP behavior.
- Return to Parking/Charging.

Select goals dynamically from the actual map.

Do not require the user to define a Transport Job or Workflow.

Use standalone Nav2 navigation goals.

### Each navigation attempt

1. Read the robot's current actual pose.
2. Select the next Endpoint.
3. Call Nav2 `ComputePathToPose`.
4. Validate the proposed path.
5. Establish bounded, isolated simulation authorization for the approved movement.
6. Execute navigation using the existing safe Nav2 pipeline.
7. Monitor Nav2 feedback, TF, odometry, Gazebo pose and cmd_vel.
8. Record the actual robot trajectory.
9. Compare actual path against planned path and traffic policies.
10. Verify goal position and heading.
11. Record PASS/FAIL with evidence.

After each successful navigation, continue from the robot's actual final pose.

Do not silently reset or teleport the robot between normal physical-navigation tests.

### Automatic correction loop

If the robot:

- Takes a wrong turn.
- Enters a forbidden Lane direction.
- Approaches KEEP_OUT.
- Fails to turn at an intersection.
- Oscillates.
- Gets stuck.
- Deviates excessively from its planned path.
- Stops at an incorrect Endpoint.
- Cannot align its final yaw.
- Fails to decelerate in SPEED.
- Produces invalid recovery behavior.

Then:

1. Safely stop the test.
2. Preserve rosbag/logs/trajectory.
3. Identify whether the root cause is planner, controller, localization, footprint, costmap, semantic policy or map data.
4. Apply a code/configuration fix only when justified.
5. Rebuild and restart the affected components.
6. Retry the failed navigation.
7. Run regression tests to ensure previously working movements remain correct.

Do not repeatedly retry an unchanged failure without new diagnostic evidence.

Do not modify source map geometry to make a failing route succeed.

---

# 7. PHASE E — AGGRESSIVE ONE_WAY & POLICY TESTING

ONE_WAY correctness is a mandatory hard safety requirement.

Create adversarial tests that challenge the planner.

### ONE_WAY tests

- Legal forward traversal.
- Illegal reverse traversal.
- Valid legal detour.
- No legal route.
- Entry/exit near Lane boundaries.
- Turning at open intersections.
- Reverse-driving motion where physically supported.
- Replanning near ONE_WAY.
- Controller deviation from authorized path.

Check actual robot translation direction, not just body yaw.

If a route violates ONE_WAY at planning or execution time:

**FAIL immediately. Stop motion. Diagnose and fix before proceeding with autonomous navigation.**

Do not merely assign a high cost to illegal traversal.

### KEEP_OUT tests

Verify the full robot footprint stays outside prohibited geometry.

Test goals near boundaries and replanning around forbidden regions.

### SPEED tests

Record actual robot velocity before, during and after SPEED Zone traversal.

Verify it decelerates early enough and respects the applicable limit inside the Zone.

### NO_STOP tests

Ensure normal planned holding or parking is not placed in NO_STOP.

Emergency stopping remains permitted.

### Policy changes

If a policy affects the current plan, validate that obsolete plans are invalidated using semantic map revision and plan revision.

No stale plan may remain authorized.

---

# 8. PHASE F — SIM-02 INDIVIDUAL NAVIGATION

After SIM-01 has passed the core single-robot safety scenarios, bring up SIM-02.

Verify:

- Correct independent namespace.
- Independent Nav2 nodes.
- Independent TF/odometry.
- Independent cmd_vel authority pipeline.
- Correct localization and spawn pose.
- Matching semantic map fingerprint.
- No topic collisions between SIM-01 and SIM-02.

Repeat representative standalone Endpoint navigation tests on SIM-02.

Ensure every Endpoint is covered by actual motion from at least one robot, and representative routes are independently executed by both robots.

If SIM-02 behaves differently, diagnose its configuration and runtime identity rather than assuming SIM-01 results automatically apply.

Do not run uncontrolled simultaneous navigation during this phase.

---

# 9. PHASE G — DUAL-ROBOT SEMANTIC TRAFFIC TESTING

Enable this phase only after the single-robot safety-critical scenarios have PASS evidence.

Start the isolated ASP.NET Simulation Host with:

`Traffic:Mode=Semantic`

Use isolated mutable simulation state.

Do NOT use production/default Active RouteGraph mode.

Disable Stage-1 open-grant behavior for dual-robot execution.

Both robots must obtain valid semantic Traffic authorization.

### Test concurrent navigation without business workflows

Send standalone navigation goals to SIM-01 and SIM-02.

Do not create Transport Requests or Jobs.

Test:

1. Two independent nonconflicting paths.
2. Two robots requesting the same SINGLE_OCCUPANCY Zone.
3. One robot holding the Zone while the other waits.
4. Correct release after full physical exit.
5. Crossing trajectories in an open intersection without JUNCTION Zone.
6. Head-on conflict in a narrow corridor.
7. One robot replanning into another robot's protected region.
8. Robot stopped inside a reserved resource.
9. MQTT loss.
10. Localization loss.
11. Traffic grant invalidation.
12. Deadlock detection and safe resolution.

### Safety requirements

The Backend must not grant overlapping exclusive resources.

The robot must not enter an ungranted protected region.

Validate full swept footprint overlap, not only endpoint or centerline intersection.

Use safe waiting positions with braking distance.

Never schedule normal waiting inside NO_STOP.

Do not release protected resources merely because an action ended or a lease expired while physical occupancy remains uncertain.

Do not command unsafe reverse movement to escape conflicts.

### Dual-robot acceptance

Real Gazebo trajectories must demonstrate:

- No physical collision.
- No unauthorized region entry.
- Correct reservation lifecycle.
- Correct waiting and resume behavior.
- Correct plan revision enforcement.
- Both robots eventually reach reachable goals when safe progress is possible.

If no safe resolution exists, a controlled stop with a reported blocker is acceptable. Unsafe movement is not.

---

# 10. AUTOMATED EXECUTION ORCHESTRATOR

Create or reuse a test orchestrator that can run the test matrix autonomously.

Do not depend on repeatedly asking the user to click UI buttons.

The orchestrator must:

- Start required services.
- Check readiness.
- Run test batches.
- Enforce timeouts.
- Detect failed processes.
- Capture logs.
- Restart crashed simulation components when safe.
- Reuse recorded test inputs.
- Track which scenarios have already been tested.
- Resume after interrupted batches.
- Produce machine-readable results.
- Stop on safety-critical failures.
- Continue independent safe scenarios when feasible.

Prefer existing launch scripts and testing infrastructure.

Avoid creating a second navigation framework.

### Iteration rules

For each distinct root cause:

- Diagnose before modifying.
- Apply one coherent fix at a time.
- Rebuild only affected packages.
- Retry the failed test.
- Run relevant regressions.
- Record before/after behavior.

Limit repeated unsuccessful attempts for an unchanged root cause. After three evidence-based fix attempts without improvement, record a blocker and proceed only with independent safe work.

### Runtime budget

Prioritize useful progress during the approximately 2–3-hour unattended session.

Suggested priority:

1. Fix planning blockers.
2. Achieve real SIM-01 motion.
3. Complete directed Endpoint planning coverage.
4. Complete SIM-01 Endpoint movement coverage.
5. Verify ONE_WAY and policy safety.
6. Verify SIM-02 standalone navigation.
7. Run dual-robot semantic traffic scenarios.
8. Expand coverage and regression testing.

Do not sacrifice critical safety or accurate evidence merely to complete more tests.

If all reachable acceptance criteria PASS, stop successfully.

If the session ends or a real blocker remains, preserve everything necessary to resume without repeating completed work.

---

# 11. EVIDENCE & CONTINUOUS REPORTING

Create a dedicated audit directory:

`docs/audits/autonomous_gazebo_acceptance/`

Keep it updated throughout execution.

Required artifacts:

### `STATUS.md`

Current stage, completed tests, outstanding tests, blocking issues and latest successful simulation configuration.

### `ENDPOINT_MATRIX.csv`

Every directed Endpoint pair with planning result, failure category, path length and test evidence.

### `MOTION_RESULTS.csv`

Every real robot navigation attempt, including actual start/goal, robot ID, arrival status, time and trajectory evidence.

### `POLICY_RESULTS.md`

ONE_WAY, KEEP_OUT, SPEED and NO_STOP test results with evidence.

### `DUAL_ROBOT_RESULTS.md`

Traffic reservations, conflicts, waiting, release, deadlock and dual-robot execution evidence.

### `FIX_LOG.md`

For every source/configuration change:

- Problem observed.
- Root cause.
- File changed.
- Fix applied.
- Failed test before fix.
- Retest result.
- Regression result.

### `FINAL_REPORT.md`

Include:

- Current semantic map fingerprint.
- Exact test environment.
- Planner and controller used.
- Number of directed Endpoint pairs evaluated.
- Number of legal paths.
- Number of correctly rejected routes.
- Number of unexpected planning failures.
- Physical navigation coverage by Endpoint.
- Lane/Zone policy compliance.
- SIM-01 results.
- SIM-02 results.
- Dual-robot Traffic results.
- Remaining blockers.
- Exact reproduction commands.

Keep logs, paths and trajectories saved as files rather than only printing them in the terminal.

---

# 12. DEFINITION OF DONE

The work is complete only when the following are demonstrated with actual evidence:

### Planning correctness

- All directed Endpoint pairs have been evaluated on the current map.
- Every physically and semantically legal reachable pair can generate a valid path.
- Impossible or prohibited routes are rejected correctly.
- No illegal ONE_WAY traversal is accepted.
- No unsafe KEEP_OUT or collision path is accepted.

### Single-robot movement

- SIM-01 actually navigates through all legally serviceable Endpoints.
- Every applicable Lane and semantic policy receives physical test coverage.
- Valid open intersections work without JUNCTION Zones.
- Actual trajectories comply with the planned and authorized movements.
- SIM-02 independently passes its required navigation checks.

### Multi-robot movement

- Both simulated robots operate concurrently under Semantic Traffic authority.
- SINGLE_OCCUPANCY reservation works.
- Dynamic spatial conflict handling works without Junction Zones.
- Resources are acquired, held and released safely.
- Replanning cannot bypass authorization.
- No collision or unsafe movement occurs in the executed scenarios.

### Architecture

- Navigation uses Nav2 Planner/Controller, not Backend RouteGraph.
- No hardcoded Endpoint path shortcuts.
- No hidden Route Server fallback.
- No unsafe test-only bypass in the dual-robot execution pipeline.
- Existing database remains unchanged.

**A green build is not success.**

**A generated path is not physical-navigation success.**

**A Gazebo startup is not E2E success.**

**A failed route must not be forced to PASS by weakening safety or modifying map data.**

Only actual executable evidence counts.

---

# 13. START NOW

Do not ask for a new plan or restate the architecture.

Immediately:

1. Inspect the actual repository state.
2. Verify the latest map snapshot.
3. Inspect available Gazebo/Nav2 launch commands.
4. Resolve the existing planning and filter blockers.
5. Launch the actual Gazebo environment.
6. Execute autonomous Endpoint navigation tests.
7. Diagnose, fix and retest as needed.
8. Continue expanding coverage while maintaining safety.
9. Preserve all reports and checkpoints.

Operate autonomously within the available execution session.

**Final target: A reliable Nav2-centric WaroTrans simulation in which SIM-01 and SIM-02 can navigate between all legally reachable warehouse Endpoints while respecting Lane directions, semantic Zone policies and shared Traffic authority, without using the legacy RouteGraph navigation architecture.**