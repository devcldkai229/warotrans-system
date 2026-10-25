# Robot Traffic Active — integration guide

## Flags (defaults safe)

| Layer | Flag | Default | Active value |
|-------|------|---------|--------------|
| Backend | `Traffic:Mode` | `Shadow` | `Active` |
| Robot gateway | `traffic_mode` | `legacy` | `active` |
| Nav launch | `enable_authority_gate` | `false` | `true` (required for Active) |

## SAFETY REVIEW

| | |
|--|--|
| WHY | Authority gating |
| FILES | fleet package, nav launch, `cmd_vel_authority_gate` |
| RISK | Gate zeros valid motion or fails open |
| TEST | Unit → sim → wheels-lifted only after approval |
| ROLLBACK | flags + `pre-traffic-active` tag + `rollback_source.sh` |

**Do not** flash ESP32, change watchdog/GPIO/baud/TF, or run floor motion without operator approval.

## Deploy (Pi)

```bash
# from warotrans repo (dev machine / WSL)
./tools/check.sh
./tools/deploy.sh --build
```

`deploy.sh` creates `~/warotrans_backups/ros2_src_*.tgz` before sync.

## Rollback

```bash
ssh waro@warotrans.local '~/warotrans_tools/rollback_source.sh'
# then rebuild / restart units as usual

# source tree rollback anchor
git -C warotrans checkout pre-traffic-active
git -C warotrans-system checkout pre-traffic-active
```

Revert flags: `traffic_mode:=legacy`, `enable_authority_gate:=false`, `Traffic:Mode=Shadow`.

## Inspection-only Pi commands (no motion)

```bash
ssh waro@warotrans.local
source /opt/ros/jazzy/setup.bash
ros2 doctor --report | head
ros2 pkg prefix nav2_route
timeout 10 ros2 topic hz /scan
timeout 10 ros2 topic hz /odom
ros2 topic info /cmd_vel -v   # expect exactly one publisher when idle pipeline up
free -m; top -bn1 | head -20
```

Never publish `cmd_vel`, call nav actions, or restart control units during audit.

## Operator-required (blocked until approved)

1. Wheels lifted: Pi stops `cmd_vel` → motors stop ≤300 ms  
2. Wheels lifted: gate zeroes on authority loss  
3. Single-segment FollowPath on floor  
4. Denied junction stop  
5. MQTT drop during motion  
6. Collision monitor obstacle stop  

## Related

- [ROBOT-RUNTIME-AUDIT.md](ROBOT-RUNTIME-AUDIT.md)
- [ADR 0010](../adr/0010-robot-traffic-client.md)
- [SIM-RESULTS.md](SIM-RESULTS.md) / [PHYSICAL-RESULTS.md](PHYSICAL-RESULTS.md)
