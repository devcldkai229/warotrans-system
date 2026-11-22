#!/usr/bin/env bash
# Copy the laptop's databases into the AWS demo (decision 2026-11-22: start from the current dev data):
#   1. dump on the laptop (containers warotrans-postgres / warotrans-mongodb): warotrans, warotrans_evidence,
#      warotrans_operations -> ~/.warotrans-restore/<stamp>/ and s3://<bucket>/backups/laptop/<stamp>/
#   2. on the MongoDB host inside the VPC: pg_restore into RDS (as warotrans_owner), mongorestore into MongoDB
#   3. map files: data/maps/** of the laptop Host -> s3://<bucket>/maps/**, map_versions URIs rewritten to S3 (RDS only)
#   4. grants for warotrans_app
# Refuses to overwrite a non-empty RDS database unless --force. Run db-bootstrap.sh and mongo-bootstrap.sh first.
# Afterwards: run the migration task (newer migrations), change the well-known development passwords.
#   scripts/restore-dev-data.sh [--force]
source "$(dirname "$0")/demo-lib.sh"
FORCE="${1:-}"
REPO="$(cd "$TF_ROOT/../.." && pwd)"
MAPS_DIR="${MAPS_DIR:-$REPO/backend/src/WaroTrans.Host/data/maps}"
BUCKET="$(tf_out persistent evidence_bucket)"
RDS="$(tf_out persistent rds_endpoint)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCAL="$HOME/.warotrans-restore/$STAMP"; mkdir -p "$LOCAL"; chmod 700 "$LOCAL"
S3="s3://$BUCKET/backups/laptop/$STAMP"

echo "== 1. dumps of the laptop databases -> $LOCAL"
for db in warotrans warotrans_evidence; do
  docker exec warotrans-postgres pg_dump -U warotrans -Fc -f "/tmp/$db.dump" "$db"
  docker cp "warotrans-postgres:/tmp/$db.dump" "$(winpath "$LOCAL/$db.dump")"
  docker exec warotrans-postgres rm -f "/tmp/$db.dump"
done
docker exec warotrans-mongodb sh -c 'mongodump -u warotrans -p warotrans --authenticationDatabase admin --db warotrans_operations --archive=/tmp/ops.archive --gzip --quiet'
docker cp "warotrans-mongodb:/tmp/ops.archive" "$(winpath "$LOCAL/warotrans_operations.archive.gz")"
docker exec warotrans-mongodb rm -f /tmp/ops.archive
for f in warotrans.dump warotrans_evidence.dump warotrans_operations.archive.gz; do
  aws s3 cp --only-show-errors "$(winpath "$LOCAL/$f")" "$S3/$f"
done
ls -la "$LOCAL"

echo "== 2. restore on the MongoDB host"
remote "$REMOTE_PRE
C=\$(sec warotrans-demo/connection-strings); S=\$(sec warotrans-demo/mongo)
export PGHOST='$RDS' PGSSLMODE=require PGUSER=warotrans_owner
export PGPASSWORD=\$(key \"\$C\" system_postgres_migrator | python3 -c 'import re,sys;print(re.search(r\"Password=([^;]+)\",sys.stdin.read()).group(1))')
W=\$(mktemp -d); trap 'rm -rf \$W' EXIT
for f in warotrans.dump warotrans_evidence.dump warotrans_operations.archive.gz; do aws s3 cp --only-show-errors '$S3/'\$f \$W/\$f; done
for db in warotrans warotrans_evidence; do
  n=\$(psql -At -d \$db -c \"select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')\")
  if [ \"\$n\" != 0 ] && [ '$FORCE' != --force ]; then echo \"\$db on RDS already has \$n tables: not overwritten (use --force)\"; exit 4; fi
  pg_restore --no-owner --role=warotrans_owner --no-acl --clean --if-exists --exit-on-error -d \$db \$W/\$db.dump
  echo \"restored \$db\"
done
mongorestore --quiet --host localhost --ssl --tlsInsecure -u admin -p \"\$(key \"\$S\" admin_password)\" --authenticationDatabase admin \
  --gzip --archive=\$W/warotrans_operations.archive.gz --nsInclude='warotrans_operations.*' --drop
echo 'restored warotrans_operations'" 3600

echo "== 3. map files -> s3://$BUCKET/maps/ and map URIs"
if [[ -d "$MAPS_DIR" ]]; then
  aws s3 sync --only-show-errors "$(winpath "$MAPS_DIR")" "s3://$BUCKET/maps/"
fi
remote "$REMOTE_PRE
C=\$(sec warotrans-demo/connection-strings)
export PGHOST='$RDS' PGSSLMODE=require PGUSER=warotrans_owner
export PGPASSWORD=\$(key \"\$C\" system_postgres_migrator | python3 -c 'import re,sys;print(re.search(r\"Password=([^;]+)\",sys.stdin.read()).group(1))')
psql -v ON_ERROR_STOP=1 -q -d warotrans <<'SQL'
UPDATE navigation.map_versions SET
  map_uri = replace(map_uri, '/map-assets/', 'https://$BUCKET.s3.$REGION.amazonaws.com/maps/'),
  map_yaml_uri = replace(map_yaml_uri, '/map-assets/', 'https://$BUCKET.s3.$REGION.amazonaws.com/maps/'),
  preview_image_uri = replace(preview_image_uri, '/map-assets/', 'https://$BUCKET.s3.$REGION.amazonaws.com/maps/')
WHERE map_uri LIKE '/map-assets/%' OR map_yaml_uri LIKE '/map-assets/%' OR preview_image_uri LIKE '/map-assets/%';
SQL
echo 'map URIs on S3'"

echo "== 4. grants"
"$(dirname "$0")/db-grant-app.sh"
cat <<EOF
Restored from the laptop ($STAMP). Next:
  - run the migration task (deploy-demo.yml with run_migrations=true, or scripts/lab.sh migrate)
  - sign in and CHANGE the development passwords (admin / staff / technician still have the well-known ones)
  - robots keep their Evidence credentials (only the hashes were copied)
Local dumps: $LOCAL (delete when no longer needed)
EOF
