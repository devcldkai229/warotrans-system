# samples/simulation — backend điều khiển robot ảo Gazebo (RBT-SIM-01)

Giải thích đầy đủ: [docs/simulation/02-backend-nhan-robot-ao.md](../../docs/simulation/02-backend-nhan-robot-ao.md).

```powershell
cd infrastructure; docker compose up -d; cd ..
powershell -ExecutionPolicy Bypass -File samples/simulation/run-backend-sim.ps1     # terminal 1
powershell -ExecutionPolicy Bypass -File samples/simulation/seed-sim.ps1           # một lần (chạy lại được)
wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh   # terminal 2
powershell -ExecutionPolicy Bypass -File samples/simulation/navigate-sim.ps1 -To IN1,A,OUT1,PARK
```

| Script | Làm gì |
|---|---|
| `run-backend-sim.ps1` | Chạy backend :5090 với `Mqtt__Host=127.0.0.1` (tránh treo 21 s do `localhost` → IPv6) |
| `seed-sim.ps1` | Warehouse `WH-SIM`, import map sim, 9 endpoint + 5 zone, publish, robot `RBT-SIM-01` → `sim-config.json` |
| `navigate-sim.ps1 -To X,Y` | `POST /api/fleet/robots/{id}/commands/navigate` tới từng endpoint, theo dõi tới khi `COMPLETED` |
| `run-job-sim.ps1` | **GĐ 3**: tạo TransportRequest: mặc định `-Scenario inbound` (workflow `INBOUND_PUTAWAY`, CTN-IN-000001..3 IN1→A, IN1→B, IN2→C); `-Scenario relocation` (workflow `INTERNAL_RELOCATION`) → queue → start Job → robot tự chạy, script xác nhận như Staff → Job/Request `COMPLETED` (`-ManualConfirm` để tự xác nhận) |

Giải thích GĐ 3: [docs/simulation/03-job-engine-robot-ao.md](../../docs/simulation/03-job-engine-robot-ao.md).
