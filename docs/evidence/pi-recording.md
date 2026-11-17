# Evidence recording on the robot (Raspberry Pi 5)

What runs on the robot, how to install it, and how to check it. Repos: `warotrans` (RBT-001, source of the
shared packages) and `warotrans-rbt2` (RBT-002, synced with `tools/sync_from_rbt1.py`).

## What runs

| Piece | Package | Role |
|---|---|---|
| Camera node | `warotrans_camera` | The only owner of the camera (`rpicam-vid --codec mjpeg`). It serves `/stream` and `/snapshot.jpg` on `:8081` and, while recording, writes MJPEG AVI segments of 30 s at a constant frame rate (one slot per frame, with the newest frame repeated or dropped) plus a `timing.json` sidecar |
| Evidence agent | `warotrans_evidence_agent` | Decides when to record. It spools segments, path (5 Hz moving, 1 Hz still), Nav2 plans, events and clock anchors in SQLite, and uploads them to the Recorder and S3 |
| Gateway | `warotrans_fleet` | Publishes `/fleet/active_command` while a backend command runs |

**When it records.** Recording starts with a backend command or with a run the Recorder reports open. It stops 15 s
after both end, keeps going when the backend is unreachable, and binds to the run later.

**Upload limits.** Uploads are rate-limited (`upload_rate_limit_mbytes_per_s`, 2 MB/s) and never block navigation. Nothing
that has not been uploaded is deleted. When the spool reaches its quota (20 GB), new recording stops and an ERROR event
(`recording.spool_full`) is sent. It also stops when less than 1 GiB of disk is left.

**Measured on RBT-002 (2026-11-17, motors off):**

| Measure | Value |
|---|---|
| Video | 1280×720 at 15 fps |
| Segment size | About 36 MB per 30 s |
| Load | 2–4 |
| Temperature | About 56 °C |

## 1. Camera stack (once per Pi)

Ubuntu 24.04 ships a libcamera without Pi 5 support. Build the Raspberry Pi fork; the steps are in the header of
`warotrans/tools/build_camera_stack.sh`:

```bash
sudo apt-get install -y git meson ninja-build cmake pkg-config python3-yaml python3-ply python3-jinja2 \
  libyaml-dev libgnutls28-dev libdrm-dev libexif-dev libjpeg-dev libtiff-dev libpng-dev \
  libboost-program-options-dev libepoxy-dev libevent-dev libssl-dev openssl
tools/build_camera_stack.sh build-libcamera && sudo ninja -C ~/camera_build/libcamera/build install && sudo ldconfig
tools/build_camera_stack.sh build-rpicam   && sudo ninja -C ~/camera_build/rpicam-apps/build install && sudo ldconfig
rpicam-hello --list-cameras          # the camera must be listed
```

These steps need Internet on the Pi (apt and git). RBT-002 already has the stack.

## 2. Clock (chrony)

Two robots' videos are lined up by UTC, so both clocks must follow the laptop. The Pi has no RTC battery.

On the laptop (admin PowerShell, once), make Windows answer NTP:

```powershell
Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer -Name Enabled -Value 1
Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Config -Name AnnounceFlags -Value 5
Restart-Service w32time
New-NetFirewallRule -DisplayName "NTP" -Direction Inbound -Protocol UDP -LocalPort 123 -Action Allow
```

On each Pi:

```bash
sudo tools/install_chrony.sh 192.168.137.1      # needs apt (Internet) once
chronyc tracking                                 # Leap status: Normal, small "System time" offset
```

The agent reads `chronyc -c tracking` every 60 s and records the offset and the error bound. Without chrony the error
bound is unknown, and the replay marks the video "Sync uncertain".

## 3. Robot credential

An admin issues the token (see [README.md](README.md#robot-credentials)). On the Pi, keep it in a file that is not in any repo:

```bash
mkdir -p ~/.config/warotrans && chmod 700 ~/.config/warotrans
printf 'WARO_EVIDENCE_TOKEN=%s\n' '<token>' > ~/.config/warotrans/evidence.env
chmod 600 ~/.config/warotrans/evidence.env
```

## 4. Build and start

**RBT-001 (`warotrans`).** Build `warotrans_camera`, `warotrans_evidence_agent` and `warotrans_fleet` with colcon as
usual. `tools/pi_run_semantic.sh` starts the camera and the agent when `CAMERA=true` (the default). It reads
`~/.config/warotrans/evidence.env`; without that file the camera stays live-only. Configuration:

| File | Settings |
|---|---|
| `ros2_ws/src/warotrans_camera/config/camera_rbt001.yaml` | 1280×720 at 15 fps, 30 s segments |
| `ros2_ws/src/warotrans_evidence_agent/config/evidence_agent_rbt001.yaml` | `recorder_url`, `spool_dir`, quota, upload rate |

**RBT-002 (`warotrans-rbt2`).** Run `python tools/sync_from_rbt1.py` first: it copies both packages. Then build. The
service's `fleet.launch.py` starts the agent with `recorder_url` `http://<BROKER>:5095`, and the camera parameters
are in `config/rbt002/rbt002.yaml`. The agent's configuration is `config/rbt002/evidence_agent_rbt002.yaml`.

Put the spool on the SSD when there is one (`spool_dir`). It holds up to `quota_gb` of video that has not been uploaded yet.

## 5. Check

```bash
curl -s -H "Authorization: Robot RBT-002.$WARO_EVIDENCE_TOKEN" http://192.168.137.1:5095/api/evidence/edge/whoami
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/snapshot.jpg     # 200: the camera works
ls ~/warotrans_evidence/recordings/*/                                           # .avi + timing.json during a trip
sqlite3 ~/warotrans_evidence/evidence.db "select registered, uploaded, count(*) from segments group by 1, 2"
```

In the web app, open **Transport journals**, pick the request, and check two things:

- the video column says READY;
- the robot on the map moves in step with the video.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Uploads fail with "broken pipe" | Recorder older than the 2 GB request limit; update it |
| Segments stay registered but not verified in the journal | Worker not running, or the S3 notification / SQS URL is wrong |
| Video shows "Sync uncertain" | chrony missing or not synchronized (`chronyc tracking`) |
| `whoami` returns 401 | Token replaced or mistyped; issue a new one |
| No recording although the robot drives | `/fleet/active_command` is not published (gateway too old), or `CAMERA=false` |
| The Pi has no IPv4 on the ICS link | Windows ICS DHCP did not answer; reconnect, or give a temporary address (`sudo ip addr add 192.168.137.50/24 dev eth0`) |
