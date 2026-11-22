#!/usr/bin/env bash
# The application secrets of the demo: a new JWT signing key (64 bytes; every token issued on the laptop becomes
# invalid) and the System API <-> Recorder service token. Existing values are kept unless --rotate.
#   scripts/demo-secrets.sh [--rotate]
source "$(dirname "$0")/demo-lib.sh"
current="$(secret_get warotrans-demo/app)"
has() { "$PY" -c 'import json,sys;sys.exit(0 if json.loads(sys.argv[1]).get(sys.argv[2]) else 1)' "$current" "$1"; }
if [[ "${1:-}" == "--rotate" ]] || ! has jwt_key || ! has evidence_service_token; then
  secret_merge warotrans-demo/app "{\"jwt_key\":\"$(rand 64)\",\"evidence_service_token\":\"$(rand 48)\"}"
  echo "warotrans-demo/app: jwt_key and evidence_service_token set"
else
  echo "warotrans-demo/app already has its values (use --rotate to replace them)"
fi
