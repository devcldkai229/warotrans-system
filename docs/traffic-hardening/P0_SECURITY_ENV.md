# Priority 0 — Security and environment (2026-10-28)

## Secret scan

| Repo | Tool | Result |
|------|------|--------|
| `warotrans` | gitleaks (27 commits) | **no leaks found**. Report: `warotrans/docs/simulation/traffic-hardening/gitleaks-warotrans.json` |
| `warotrans-system` | gitleaks (169 commits) | **1 finding** — false positive: integration-test JWT signing key in `WaroTransWebApplicationFactory.cs` (local test string, not AWS/SSH). Report: `docs/traffic-hardening/gitleaks-warotrans-system.json` |

### N6 Pi SSH helpers

- `ros2_ws/scripts/_agent_pi_*ssh.py` are **gitignored** (`dfc70a2`).
- `git log --all --full-history` over those paths: **empty** — no blob in reachable unpublished history on `feature/traffic-hardening`.
- **No history rewrite required** for this branch.
- Working-tree copies may still hold a plaintext password → **authorized holder must rotate the Pi SSH password**. Agent will not SSH the physical robot.

### AWS

- Keys previously removed from `appsettings.json` (2026-10-27).
- No `AKIA…` hits in scanned branch history for this session.
- **Authorized holder must rotate any AWS keys that may have been exposed earlier.** Do not use old keys.

## PostgreSQL / sim environment (preserve data)

| Item | Value |
|------|--------|
| Container | `warotrans-postgres-5434` |
| Host port | **5434** → container 5432 |
| Volume | `infrastructure_postgres_data` (existing; **not** destroyed) |
| Compose default | `infrastructure/docker-compose.yml` still maps **5432**; hardening session uses 5434 because 5433 is `glitch-postgres` |
| Mosquitto | `warotrans-mosquitto` :1883 |
| Mongo | `warotrans-mongodb` :27018 |
| Map assets | `MapAssetStorage__Provider=Local` |

### Reproducible Host start (PowerShell)

```powershell
$env:WAROTRANS_PG_CONTAINER = "warotrans-postgres-5434"
# Connection: Host=127.0.0.1;Port=5434;Database=warotrans;Username=warotrans;Password=warotrans
# + MapAssetStorage__Provider=Local + Traffic__Mode=Active
& samples\simulation\run-backend-sim.ps1   # or equivalent start_host with Port 5434
```

### Reproducible sim start (WSL)

```bash
GUI=false bash ros2_ws/scripts/launch_sim_active.sh
```

No `docker volume rm` / recreate performed.
