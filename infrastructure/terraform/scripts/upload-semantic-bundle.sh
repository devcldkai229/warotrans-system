#!/usr/bin/env bash
# Upload the semantic bundle the robots run (warotrans repo, ros2_ws/src/warotrans_navigation/maps/<name>) to
# s3://<bucket>/semantic/<name>/, where the cloud System API copies it from at start (Traffic:SemanticMapS3Uri).
# The robots and the backend must use the same files: the fingerprint ties traffic grants to the map.
#   scripts/upload-semantic-bundle.sh [bundle dir]     default: ../warotrans/.../maps/map_one_v013
source "$(dirname "$0")/demo-lib.sh"
REPO="$(cd "$TF_ROOT/../.." && pwd)"
DIR="${1:-$REPO/../warotrans/ros2_ws/src/warotrans_navigation/maps/map_one_v013}"
[[ -f "$DIR/semantic_manifest.json" ]] || { echo "no semantic_manifest.json in $DIR"; exit 2; }
NAME="$(basename "$DIR")"
BUCKET="${BUCKET:-warotrans-ob-storage}"
aws s3 sync --only-show-errors --delete "$(winpath "$DIR")" "s3://$BUCKET/semantic/$NAME/"
echo "s3://$BUCKET/semantic/$NAME/ ($(aws s3 ls "s3://$BUCKET/semantic/$NAME/" | wc -l) files); manifest mapCode: $(
  "$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["mapCode"])' "$(winpath "$DIR/semantic_manifest.json")")"
