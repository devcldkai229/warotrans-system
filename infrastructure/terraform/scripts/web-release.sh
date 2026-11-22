#!/usr/bin/env bash
# Build the web app for the AWS demo (same origin as the API: VITE_API_URL empty) and publish it to the web bucket
# behind CloudFront; index.html is never cached, hashed assets for a year. Same as .github/workflows/web-release.yml.
#   scripts/web-release.sh
source "$(dirname "$0")/demo-lib.sh"
REPO="$(cd "$TF_ROOT/../.." && pwd)"
terraform -chdir="$TF_ROOT/envs/demo/edge" init -input=false -reconfigure -backend-config="bucket=$STATE_BUCKET" >/dev/null
BUCKET="$(json_get "$(tf_out persistent web_bucket)" id)"
DIST="$(tf_out edge distribution_id)"
(cd "$REPO/web" && npm ci --no-audit --no-fund && VITE_API_URL= npm run build)
DIST_DIR="$(winpath "$REPO/web/dist")"
aws s3 sync --only-show-errors --delete --exclude index.html \
  --cache-control "public,max-age=31536000,immutable" "$DIST_DIR" "s3://$BUCKET/"
aws s3 cp --only-show-errors --cache-control "no-cache" "$(winpath "$REPO/web/dist/index.html")" "s3://$BUCKET/index.html"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/" >/dev/null
echo "web released: $(tf_out edge web_url)"
