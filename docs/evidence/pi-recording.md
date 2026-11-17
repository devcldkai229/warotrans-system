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

## 2. Network and clock (names, not addresses)

The laptop's and the robots' IPs change with every network (ICS DHCP, the boarding-house Wi-Fi, the lab Wi-Fi), so
nothing uses a fixed IP:

| Who | Reached as |
|---|---|
| Laptop (MQTT, Host, Recorder, NTP) | `LAPTOP-Q0QAV6GM.local` (mDNS), else `192.168.137.1` on the cable, else found by a scan of the robot's /24 |
| RBT-001 / RBT-002 | `warotrans.local` / `warotrans-rbt002.local`; on the cable also the fixed `192.168.137.51` / `.50` |

**Laptop, once per new network** (admin PowerShell): `warotrans	ools\laptop_lab_network.ps1`. It:
- makes the Wi-Fi profile Private;
- opens inbound 1883, 9001, 5090, 5095 and 123 to the local subnet, plus the WSL Hyper-V rule (Docker runs in mirrored mode);
- turns on the W32Time NTP server.

Start the Host and the Recorder with `--urls http://0.0.0.0:<port>`.

**Each Pi, once per Wi-Fi** (the Pi on the cable first). The password goes through the environment only:

```bash
sudo WIFI_PSK='<password>' tools/pi_network_setup.sh --wifi "<SSID>" --eth-fallback 192.168.137.50/24   # .51 on RBT-001
sudo tools/pi_network_setup.sh --confirm      # within 180 s, otherwise the old network config comes back
sudo tools/pi_network_setup.sh --packages     # avahi + libnss-mdns + chrony (needs the Internet from the Wi-Fi)
sudo tools/install_chrony.sh                  # the laptop by name, 192.168.137.1, Ubuntu pool
chronyc tracking                              # Leap status: Normal
```

Every saved Wi-Fi network stays; the Pi joins whichever is in range. Wi-Fi carries the default route, and the cable
stays for SSH.

**Finding the backend.** `BROKER=auto` is the default: `rbt2_mode.sh fleet auto` on RBT-002, or no `BROKER` for
`pi_run_semantic.sh` on RBT-001. At every start, `tools/broker_discovery.py` finds the backend. A name is kept as a
name, so MQTT and the agent follow a new laptop IP by themselves. A watcher restarts the stack when the backend moves
to another address or appears after a start without one: `warotrans-rbt002-broker-watch.service` on RBT-002, and a
loop started by `pi_run_semantic.sh` on RBT-001.

Verified on RBT-002 (2026-11-17):

| Check | Result |
|---|---|
| Wi-Fi "Tret 2" | 192.168.11.21, Internet OK |
| eth0 fallback | `.50` |
| chrony | synchronized |
| MQTT | `LAPTOP-Q0QAV6GM.local` over Wi-Fi |
| Reboot | Same state within 1 minute; the clock is right before the stack starts |

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
curl -s -H "Authorization: Robot RBT-002.$WARO_EVIDENCE_TOKEN" http://LAPTOP-Q0QAV6GM.local:5095/api/evidence/edge/whoami
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
| The Pi has no IPv4 on the ICS link | Windows ICS DHCP did not answer: use the fixed `192.168.137.50` / `.51` (set by `pi_network_setup.sh`) or `<host>.local` |
| `broker_discovery.py resolve` finds nothing | Backend or Docker not running, the laptop Wi-Fi is Public, or the firewall rules are missing: run `laptop_lab_network.ps1` |
