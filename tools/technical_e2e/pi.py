"""SSH to a robot's Pi for the technical E2E (paramiko). The password comes ONLY from WARO_PI_PW in the environment of
the command that runs this; it is never written anywhere and never printed.

    WARO_PI_PW=... python pi.py run "systemctl is-active warotrans-rbt002"
    WARO_PI_PW=... python pi.py deploy E:/programming/my_project/warotrans-rbt2        (= tools/deploy.sh, by Python)
    WARO_PI_PW=... python pi.py env-set KEY=VALUE [KEY=VALUE ...]     (~/.config/warotrans/rbt002.env, values hidden)
"""

from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

PI_HOST = os.environ.get("WARO_PI_HOST", "warotrans-rbt002.local")
PI_USER = os.environ.get("WARO_PI_USER", "waro")
ENV_FILE = "~/.config/warotrans/rbt002.env"
SKIP = {"__pycache__", ".pytest_cache", "build", "install", "log"}


def connect() -> paramiko.SSHClient:
    pw = os.environ.get("WARO_PI_PW")
    if not pw:
        raise SystemExit("WARO_PI_PW is not set (give it on the command line only)")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(PI_HOST, username=PI_USER, password=pw, timeout=15, look_for_keys=False, allow_agent=False)
    return c


def run(c: paramiko.SSHClient, cmd: str, timeout: float = 600, stdin_bytes: bytes | None = None,
        sudo: bool = False) -> tuple[int, str]:
    if sudo:
        cmd = f"sudo -S -p '' bash -c {sh_quote(cmd)}"
    stdin, stdout, _ = c.exec_command(cmd, timeout=timeout, get_pty=False)
    if sudo:
        stdin.write(os.environ["WARO_PI_PW"] + "\n")
        stdin.flush()
    if stdin_bytes is not None:
        stdin.write(stdin_bytes)
        stdin.flush()
        stdin.channel.shutdown_write()
    stdout.channel.set_combine_stderr(True)
    out = stdout.read().decode(errors="replace")
    return stdout.channel.recv_exit_status(), out


def sh_quote(s: str) -> str:
    return "'" + s.replace("'", "'\"'\"'") + "'"


def tar_of(root: Path, names: list[str]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        def keep(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
            parts = Path(info.name).parts
            if any(p in SKIP for p in parts) or info.name.endswith(".pyc"):
                return None
            if info.isfile() and (info.name.endswith(".sh") or info.name.endswith(".py")):
                info.mode |= 0o755 if info.name.endswith(".sh") else 0
            return info
        for n in names:
            tar.add(str(root / n), arcname=n, filter=keep)
    data = buf.getvalue()
    return data


def normalise_scripts(root: Path, names: list[str]) -> None:
    """Shell scripts must reach the Pi with LF endings (a Windows checkout may have CRLF)."""
    for n in names:
        for p in (root / n).rglob("*.sh"):
            b = p.read_bytes()
            if b"\r\n" in b:
                raise SystemExit(f"{p} has CRLF line endings; fix before deploying")


def deploy(repo: Path) -> None:
    c = connect()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    normalise_scripts(repo, ["tools"])
    code, out = run(c, "mkdir -p ~/warotrans_rbt2_ws && tar -C ~/warotrans_rbt2_ws -xzf - && "
                       "chmod +x ~/warotrans_rbt2_ws/tools/*.sh && echo tools-ok", stdin_bytes=tar_of(repo, ["tools"]))
    print(out.strip()[-300:])
    if code:
        raise SystemExit(code)
    script = (f"set -e; mkdir -p ~/warotrans_rbt2_ws ~/warotrans_rbt2_backups; "
              f"if [ -d ~/warotrans_rbt2_ws/src ]; then mv ~/warotrans_rbt2_ws/src ~/warotrans_rbt2_backups/src-{stamp}; fi; "
              f"tar -C ~/warotrans_rbt2_ws -xzf -; "
              f"rm -rf ~/warotrans_rbt2_ws/build/warotrans_rbt002_control_gateway "
              f"~/warotrans_rbt2_ws/install/warotrans_rbt002_control_gateway; echo src-ok")
    code, out = run(c, script, stdin_bytes=tar_of(repo / "ros2_ws", ["src"]))
    print(out.strip()[-300:], f"(backup src-{stamp})")
    if code:
        raise SystemExit(code)
    code, out = run(c, "source /opt/ros/jazzy/setup.bash && { [ -f ~/ros2_ws/install/setup.bash ] && "
                       "source ~/ros2_ws/install/setup.bash || true; } && cd ~/warotrans_rbt2_ws && "
                       "colcon build --symlink-install 2>&1 | tail -8", timeout=1800)
    print(out)
    if code:
        raise SystemExit(code)


def env_set(pairs: list[str]) -> None:
    """Set KEY=VALUE lines in the robot's env file (other lines kept). Values are never printed."""
    c = connect()
    _, current = run(c, f"cat {ENV_FILE} 2>/dev/null || true")
    lines = current.splitlines()
    for pair in pairs:
        key, _, value = pair.partition("=")
        lines = [ln for ln in lines if not ln.startswith(key + "=")] + [f"{key}={value}"]
    body = ("\n".join(lines) + "\n").encode()
    code, out = run(c, f"mkdir -p ~/.config/warotrans && cp -a {ENV_FILE} {ENV_FILE}.bak-$(date +%s) 2>/dev/null; "
                       f"cat > {ENV_FILE} && chmod 600 {ENV_FILE} && echo env-ok", stdin_bytes=body)
    print(out.strip(), "keys:", ", ".join(p.split("=", 1)[0] for p in pairs))
    if code:
        raise SystemExit(code)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    op = sys.argv[1]
    if op == "run":
        c = connect()
        code, out = run(c, sys.argv[2], sudo="--sudo" in sys.argv[3:])
        print(out, end="")
        raise SystemExit(code)
    if op == "deploy":
        deploy(Path(sys.argv[2]))
    elif op == "env-set":
        env_set(sys.argv[2:])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
