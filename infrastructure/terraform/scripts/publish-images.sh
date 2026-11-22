#!/usr/bin/env bash
# Build the three images for linux/arm64 from the current commit and push them to ECR with the tag <git sha>. The same
# as .github/workflows/publish-images.yml, for the first bootstrap from a laptop. Does not deploy anything.
#   scripts/publish-images.sh             refuses a dirty backend/ (the tag must name what was built)
#   scripts/publish-images.sh --release   also records these digests as the release the runtime stack starts with
#                                         (SSM /warotrans-demo/release): only for the very first start; later releases
#                                         go through deploy-demo.yml
source "$(dirname "$0")/demo-lib.sh"
REPO="$(cd "$TF_ROOT/../.." && pwd)"
[[ -z "$(git -C "$REPO" status --porcelain -- backend)" ]] || { echo "backend/ has uncommitted changes"; exit 2; }
SHA="$(git -C "$REPO" rev-parse --short=12 HEAD)"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

declare -A FILE=(
  [system]="src/WaroTrans.Host/Dockerfile"
  [evidence-recorder]="src/WaroTrans.Evidence/Recorder/Dockerfile"
  [evidence-worker]="src/WaroTrans.Evidence/Worker/Dockerfile"
)
declare -A REPOS=([system]=warotrans-system [evidence-recorder]=warotrans-evidence-recorder [evidence-worker]=warotrans-evidence-worker)
declare -A DIGEST
for svc in system evidence-recorder evidence-worker; do
  target=(); [[ "$svc" == "evidence-worker" ]] && target=(--target runtime) # MediaConvert: no ffmpeg
  image="$REGISTRY/${REPOS[$svc]}:$SHA"
  if aws ecr describe-images --region "$REGION" --repository-name "${REPOS[$svc]}" --image-ids "imageTag=$SHA" >/dev/null 2>&1; then
    echo "$image exists (tags are immutable)"
  else
    docker buildx build --platform linux/arm64 --provenance=false "${target[@]}" \
      -f "$(winpath "$REPO/backend/${FILE[$svc]}")" -t "$image" --push "$(winpath "$REPO/backend")"
  fi
  DIGEST[$svc]="$(aws ecr describe-images --region "$REGION" --repository-name "${REPOS[$svc]}" --image-ids "imageTag=$SHA" \
    --query 'imageDetails[0].imageDigest' --output text)"
  echo "$svc: ${REPOS[$svc]}@${DIGEST[$svc]}"
done

RELEASE="$("$PY" -c '
import json, sys
reg, sha, s, r, w = sys.argv[1:]
print(json.dumps({"git_sha": sha, "images": {
    "system": f"{reg}/warotrans-system@{s}",
    "evidence-recorder": f"{reg}/warotrans-evidence-recorder@{r}",
    "evidence-worker": f"{reg}/warotrans-evidence-worker@{w}"}}))'   "$REGISTRY" "$SHA" "${DIGEST[system]}" "${DIGEST[evidence-recorder]}" "${DIGEST[evidence-worker]}")"
echo "$RELEASE"
if [[ "${1:-}" == "--release" ]]; then
  aws ssm put-parameter --region "$REGION" --name /warotrans-demo/release --type String --overwrite --value "$RELEASE" >/dev/null
  echo "recorded as the release in /warotrans-demo/release"
fi
