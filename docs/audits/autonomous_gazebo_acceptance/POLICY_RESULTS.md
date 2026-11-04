# POLICY_RESULTS

**Map:** MAP-ONE-V001 · fingerprint `6dd72df1…`  
**Evidence source:** live `path_policy_probe` + ComputePathToPose ONE_WAY OD checks

## Path policy validator (dedicated probe topics)

| Case | ok | reason | Result |
|---|---|---|---|
| valid corridor goal | true | `goal_ok` | **PASS** |
| NO_STOP goal (zone center) | false | `NO_STOP_GOAL` | **PASS** |
| KEEP_OUT goal | false | `KEEP_OUT_GOAL` | **PASS** |
| ONE_WAY reverse plan (LTR-C) | false | `ONE_WAY_VIOLATION at segment 0` | **PASS** |
| ONE_WAY forward plan (LTR-C) | true | `path_ok` | **PASS** |

Probe uses `/path_policy/check_goal` and `/path_policy/check_plan` (not `/goal_pose`, which would drive BT Navigator).

## ONE_WAY planning adversarial

| OD | Result | Notes |
|---|---|---|
| LTR-C reverse (1.55→1.15) | **PASS** | empty or non-against detour |
| LTR-C forward (1.15→1.55) | **PASS** | nonempty legal path |

## KEEP_OUT / SPEED / NO_STOP (costmap)

- Keepout mask encoding corrected (`FREE=254`, occupied keepout=`0`); filters received after warm-up.
- SPEED mask `mode: raw`; unset=0.
- NO_STOP enforced in path_policy (goal reject); not a costmap lethal layer.

## SPEED physical velocity

**PASS** — `SPEED_VELOCITY_SAMPLES.csv` during OUTBOUND→WAIT:

- samples: 11859 · in_speed_zone (mask≠0): 9096
- mask cells ≈30 → absolute limit `base+mask*0.01 = 0.30 m/s`
- `max_abs_v_in_zone = 0.3049 m/s` (at ceiling; not unconstrained sim 0.4 cap)
