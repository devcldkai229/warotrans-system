"""Run the Host with a launch profile's environment plus bench overrides, without editing launchSettings.json.

    python run_host.py RealRobot Traffic__SemanticPrefixGrant=false Traffic__SemanticHorizonMeters=20
"""

import json
import os
import subprocess
import sys
from pathlib import Path

HOST = Path(__file__).resolve().parents[2] / "backend" / "src" / "WaroTrans.Host"


def main() -> None:
    profile = sys.argv[1]
    settings = json.loads((HOST / "Properties" / "launchSettings.json").read_text(encoding="utf-8-sig"))
    p = settings["profiles"][profile]
    env = dict(os.environ)
    env.update(p.get("environmentVariables", {}))
    for pair in sys.argv[2:]:
        k, _, v = pair.partition("=")
        env[k] = v
    if p.get("applicationUrl"):
        env["ASPNETCORE_URLS"] = p["applicationUrl"]
    env.setdefault("Lab__Enabled", "true")
    env.setdefault("Mqtt__Host", "127.0.0.1")
    env.setdefault("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans")
    env.setdefault("ConnectionStrings__MongoDB", "mongodb://warotrans:warotrans@127.0.0.1:27018/?authSource=admin")
    raise SystemExit(subprocess.call(["dotnet", "run", "--no-build", "--no-launch-profile"], cwd=HOST, env=env))


if __name__ == "__main__":
    main()
