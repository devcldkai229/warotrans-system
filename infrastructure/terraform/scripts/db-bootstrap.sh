#!/usr/bin/env bash
# PostgreSQL roles and databases on RDS, and their connection strings in warotrans-demo/connection-strings:
#   warotrans_owner  owns both databases: migrations (the migrate task, the Evidence Recorder) and restores
#   warotrans_app    the System API: data only (SELECT/INSERT/UPDATE/DELETE), no DDL
# The passwords are generated here and stored in Secrets Manager first; the SQL runs on the MongoDB host inside the VPC
# and reads them there. Needs the lab on. Idempotent: existing passwords are kept unless --rotate.
#   scripts/db-bootstrap.sh [--rotate]
source "$(dirname "$0")/demo-lib.sh"
RDS="$(tf_out persistent rds_endpoint)"
MASTER_SECRET="$(tf_out persistent rds_master_secret_arn)"

conn="$(secret_get warotrans-demo/connection-strings)"
pw_from() { "$PY" -c '
import json,re,sys
m=re.search(r"Password=([^;]+)",json.loads(sys.argv[1]).get(sys.argv[2],""))
print(m.group(1) if m else "")' "$conn" "$1"; }
OWNER_PW="$(pw_from system_postgres_migrator)"; APP_PW="$(pw_from system_postgres)"
if [[ "${1:-}" == "--rotate" || -z "$OWNER_PW" ]]; then OWNER_PW="$(rand 32)"; fi
if [[ "${1:-}" == "--rotate" || -z "$APP_PW" ]]; then APP_PW="$(rand 32)"; fi

cs() { echo "Host=$RDS;Port=5432;Database=$1;Username=$2;Password=$3;SSL Mode=Require;Maximum Pool Size=40"; }
secret_merge warotrans-demo/connection-strings "$("$PY" -c 'import json,sys;print(json.dumps(dict(zip(sys.argv[1::2],sys.argv[2::2]))))' \
  system_postgres "$(cs warotrans warotrans_app "$APP_PW")" \
  system_postgres_migrator "$(cs warotrans warotrans_owner "$OWNER_PW")" \
  evidence_postgres "$(cs warotrans_evidence warotrans_owner "$OWNER_PW")")"

remote "$REMOTE_PRE
M=\$(sec '$MASTER_SECRET'); C=\$(sec warotrans-demo/connection-strings)
pw() { key \"\$C\" \"\$1\" | python3 -c 'import re,sys;print(re.search(r\"Password=([^;]+)\",sys.stdin.read()).group(1))'; }
export PGHOST='$RDS' PGSSLMODE=require PGUSER=\$(key \"\$M\" username) PGPASSWORD=\$(key \"\$M\" password)
OWNER=\$(pw system_postgres_migrator); APP=\$(pw system_postgres)
psql -v ON_ERROR_STOP=1 -q -d postgres -v owner_pw=\"\$OWNER\" -v app_pw=\"\$APP\" -v master=\"\$PGUSER\" <<'SQL'
SELECT 'CREATE ROLE warotrans_owner LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'warotrans_owner')\\gexec
SELECT 'CREATE ROLE warotrans_app LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'warotrans_app')\\gexec
ALTER ROLE warotrans_owner PASSWORD :'owner_pw';
ALTER ROLE warotrans_app PASSWORD :'app_pw';
GRANT warotrans_owner TO :\"master\";
SELECT 'CREATE DATABASE warotrans OWNER warotrans_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'warotrans')\\gexec
SELECT 'CREATE DATABASE warotrans_evidence OWNER warotrans_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'warotrans_evidence')\\gexec
REVOKE CONNECT ON DATABASE warotrans_evidence FROM PUBLIC;
GRANT CONNECT ON DATABASE warotrans TO warotrans_app;
SQL
# What the owner creates later (migrations) is usable by the API without running this again.
PGUSER=warotrans_owner PGPASSWORD=\"\$OWNER\" psql -v ON_ERROR_STOP=1 -q -d warotrans <<'SQL'
ALTER DEFAULT PRIVILEGES FOR ROLE warotrans_owner GRANT USAGE ON SCHEMAS TO warotrans_app;
ALTER DEFAULT PRIVILEGES FOR ROLE warotrans_owner GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO warotrans_app;
ALTER DEFAULT PRIVILEGES FOR ROLE warotrans_owner GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO warotrans_app;
SQL
echo 'roles and databases ok'"
"$(dirname "$0")/db-grant-app.sh"
echo "RDS: roles warotrans_owner / warotrans_app, databases warotrans / warotrans_evidence; connection strings stored"
