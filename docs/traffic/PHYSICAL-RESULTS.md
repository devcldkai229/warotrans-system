# Physical / hardware-safe results — Traffic Active

**Date:** 2026-10-25  
**Policy:** inspection-only; no motion; no flash; no cmd_vel publish

| Check | Result | Evidence |
|-------|--------|----------|
| SSH `waro@warotrans.local` | **FAIL / BLOCKED** | `Permission denied (publickey,password)` from agent host |
| Topics / actions present | **NOT_RUN** | Needs SSH |
| Gateway heartbeat seen by backend | **NOT_RUN** | Needs live stack |
| TF `map → base_footprint` | **NOT_RUN** | Needs SSH |
| `ros2 topic hz /cmd_vel` idle ≈ 0 | **NOT_RUN** | Needs SSH |
| CPU/RAM gateway + Nav2 | **CHƯA XÁC NHẬN** | Needs `pidstat` / `free` on Pi |

## Operator-required (blocked)

See [ROBOT-INTEGRATION.md](ROBOT-INTEGRATION.md). All six motion tests require explicit approval.

## Local code audit

**PASS** — see [ROBOT-RUNTIME-AUDIT.md](ROBOT-RUNTIME-AUDIT.md).
