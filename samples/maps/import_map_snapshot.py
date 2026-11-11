#!/usr/bin/env python3
"""
Import a map snapshot written by export-map-snapshot.ps1 into the local PostgreSQL database.
Python equivalent of import-map-snapshot.ps1 for Linux/cross-platform dev environments.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def run_psql(sql: str, container: str = "warotrans-postgres", database: str = "warotrans") -> str:
    cmd = [
        "docker", "exec", "-i", container,
        "psql", "-U", "warotrans", "-d", database,
        "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"
    ]
    proc = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description="Import map snapshot into PostgreSQL")
    parser.add_argument("--snapshot", "-s", required=True, help="Path to snapshot directory")
    parser.add_argument("--robot-code", "-r", default="", help="Robot code to assign to this map")
    parser.add_argument("--container", "-c", default="warotrans-postgres", help="Postgres container name")
    parser.add_argument("--database", "-d", default="warotrans", help="Database name")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent.parent
    snapshot_dir = Path(args.snapshot).resolve()
    json_path = snapshot_dir / "snapshot.json"

    if not json_path.exists():
        sys.exit(f"Error: No snapshot.json in {snapshot_dir}")

    with open(json_path, "r", encoding="utf-8") as f:
        json_text = f.read()

    snap = json.loads(json_text)
    if snap.get("format") != "warotrans-map-snapshot/1":
        sys.exit(f"Error: Unknown snapshot format '{snap.get('format')}'.")

    map_version = snap["mapVersion"]
    wh_id = map_version["warehouse_id"]
    map_id = map_version["id"]
    map_code = map_version["code"]

    robot_code = args.robot_code
    if not robot_code:
        if "SIM" in map_code:
            robot_code = "RBT-SIM-01"
        else:
            robot_code = "RBT-001"

    print(f"Importing {map_code} ({map_id}) for warehouse {wh_id}...")

    # Ensure warehouse exists
    if wh_id == "33333333-3333-3333-3333-333333333333":
        seed_wh_sql = repo_root / "samples/simulation/00-seed.sim-warehouse.sql"
        if seed_wh_sql.exists():
            with open(seed_wh_sql, "r", encoding="utf-8") as f:
                run_psql(f.read(), args.container, args.database)
    elif wh_id == "55c88958-d994-48d3-ae5d-11991476673f":
        ensure_wh_sql = f"""
        INSERT INTO warehouse.warehouses (id, code, name, address, timezone, is_active, created_at)
        VALUES ('{wh_id}', 'WH-ONE', 'Kho ONE', 'Physical Lab Warehouse', 'Asia/Ho_Chi_Minh', true, now())
        ON CONFLICT (id) DO UPDATE SET is_active = true;
        """
        run_psql(ensure_wh_sql, args.container, args.database)

    wh_check = run_psql(f"SELECT code FROM warehouse.warehouses WHERE id = '{wh_id}';", args.container, args.database)
    if not wh_check:
        ensure_generic_wh = f"""
        INSERT INTO warehouse.warehouses (id, code, name, address, timezone, is_active, created_at)
        VALUES ('{wh_id}', 'WH-{wh_id[:8].upper()}', 'Warehouse {wh_id[:8]}', 'Default address', 'Asia/Ho_Chi_Minh', true, now())
        ON CONFLICT (id) DO NOTHING;
        """
        run_psql(ensure_generic_wh, args.container, args.database)
        wh_check = run_psql(f"SELECT code FROM warehouse.warehouses WHERE id = '{wh_id}';", args.container, args.database)

    print(f"  Target warehouse: {wh_check} ({wh_id})")

    # Import SQL DO block
    clean_robot = robot_code.replace("'", "''")
    import_sql = f"""
BEGIN;
DO $do$
DECLARE
  snap jsonb := $snap${json_text}$snap$::jsonb;
  mv jsonb := snap->'mapVersion';
  map_id uuid := (mv->>'id')::uuid;
  wh uuid := (mv->>'warehouse_id')::uuid;
  vno int := (mv->>'version_no')::int;
  vcode text := mv->>'code';
  base_uri text := '/map-assets/' || (mv->>'warehouse_id') || '/' || (mv->>'id');
BEGIN
  -- an earlier import of this same map is replaced
  DELETE FROM navigation.endpoint_group_members
   WHERE endpoint_group_id IN (SELECT id FROM navigation.endpoint_groups WHERE map_version_id = map_id);
  DELETE FROM navigation.endpoint_groups WHERE map_version_id = map_id;
  DELETE FROM navigation.endpoints WHERE map_version_id = map_id;
  DELETE FROM navigation.edges WHERE map_version_id = map_id;
  DELETE FROM navigation.zones WHERE map_version_id = map_id;
  DELETE FROM navigation.map_versions WHERE id = map_id;

  IF EXISTS (SELECT 1 FROM navigation.map_versions WHERE warehouse_id = wh AND (version_no = vno OR code = vcode)) THEN
    SELECT coalesce(max(version_no), 0) + 1 INTO vno FROM navigation.map_versions WHERE warehouse_id = wh;
    vcode := regexp_replace(vcode, 'V[0-9]+$', 'V' || lpad(vno::text, 3, '0'));
  END IF;

  UPDATE navigation.map_versions SET status = 'ARCHIVED' WHERE warehouse_id = wh AND status = 'PUBLISHED';

  -- The files are copied next to the map's own id; it no longer points at the version it was cloned from.
  INSERT INTO navigation.map_versions
  SELECT * FROM jsonb_populate_record(null::navigation.map_versions, mv || jsonb_build_object(
    'version_no', vno, 'code', vcode, 'status', 'PUBLISHED', 'source_map_version_id', null,
    'map_uri', base_uri || '/map.pgm', 'map_yaml_uri', base_uri || '/map.yaml',
    'preview_image_uri', base_uri || '/map-preview.png'));

  INSERT INTO navigation.endpoints SELECT * FROM jsonb_populate_recordset(null::navigation.endpoints, snap->'endpoints');
  UPDATE navigation.endpoints SET source_endpoint_id = null WHERE map_version_id = map_id;

  INSERT INTO navigation.edges (id, map_version_id, code, geometry, direction, max_speed, is_active, width_meters, name)
  SELECT
    id, map_version_id, code, geometry, direction, max_speed, is_active,
    COALESCE(width_meters, 1.0),
    COALESCE(NULLIF(name, ''), code, '')
  FROM jsonb_populate_recordset(null::navigation.edges, snap->'edges');
  INSERT INTO navigation.zones SELECT * FROM jsonb_populate_recordset(null::navigation.zones, snap->'zones');
  INSERT INTO navigation.endpoint_groups
  SELECT * FROM jsonb_populate_recordset(null::navigation.endpoint_groups, snap->'endpointGroups');
  INSERT INTO navigation.endpoint_group_members
  SELECT * FROM jsonb_populate_recordset(null::navigation.endpoint_group_members, snap->'endpointGroupMembers');

  -- Update robot to point to this map version if robot exists
  IF EXISTS (SELECT 1 FROM fleet.robots WHERE code = '{clean_robot}') THEN
    UPDATE fleet.robots SET current_map_version_id = map_id, warehouse_id = wh, updated_at = now() WHERE code = '{clean_robot}';
  ELSE
    INSERT INTO fleet.robots (
      id, warehouse_id, current_map_version_id, code, name, status, battery_percent,
      pose_x, pose_y, pose_yaw, is_enabled, is_online, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), wh, map_id, '{clean_robot}', 'Robot {clean_robot}', 'IDLE', 100.0,
      COALESCE((mv->>'origin_x')::double precision, 0.0),
      COALESCE((mv->>'origin_y')::double precision, 0.0),
      0.0, true, false, now(), now()
    );
  END IF;
END
$do$;
COMMIT;
SELECT code FROM navigation.map_versions WHERE id = '{map_id}';
"""
    result_code = run_psql(import_sql, args.container, args.database)
    print(f"  Map imported successfully as code: {result_code}")

    # Copy map asset files
    target_dir = repo_root / f"backend/src/WaroTrans.Host/data/maps/{wh_id}/{map_id}"
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ["map.pgm", "map.yaml", "map-preview.png"]:
        src = snapshot_dir / filename
        if src.exists():
            shutil.copy2(src, target_dir / filename)
            print(f"  Copied {filename} -> {target_dir.relative_to(repo_root)}/{filename}")

    # If simulation config exists, update it if WH-SIM
    if wh_id == "33333333-3333-3333-3333-333333333333":
        sim_config_path = repo_root / "samples/simulation/sim-config.json"
        if sim_config_path.exists():
            try:
                with open(sim_config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                cfg["mapVersionId"] = map_id
                cfg["mapVersionCode"] = result_code
                with open(sim_config_path, "w", encoding="utf-8") as f:
                    json.dump(cfg, f, indent=2)
                print(f"  Updated sim-config.json mapVersionId -> {map_id}")
            except Exception as e:
                print(f"  Notice: could not update sim-config.json: {e}")

    print("Done!")


if __name__ == "__main__":
    main()
