#!/usr/bin/env bash
# Grants warotrans_app data access to everything that already exists in the warotrans database (after a restore, or
# objects made before the default privileges were set). Idempotent; runs on the MongoDB host inside the VPC.
#   scripts/db-grant-app.sh
source "$(dirname "$0")/demo-lib.sh"
RDS="$(tf_out persistent rds_endpoint)"
remote "$REMOTE_PRE
C=\$(sec warotrans-demo/connection-strings)
export PGHOST='$RDS' PGSSLMODE=require PGUSER=warotrans_owner
export PGPASSWORD=\$(key \"\$C\" system_postgres_migrator | python3 -c 'import re,sys;print(re.search(r\"Password=([^;]+)\",sys.stdin.read()).group(1))')
psql -v ON_ERROR_STOP=1 -q -d warotrans <<'SQL'
DO \$\$
DECLARE s text;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace
           WHERE (nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
                  AND pg_get_userbyid(nspowner) = 'warotrans_owner')
              OR nspname = 'public'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO warotrans_app', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO warotrans_app', s);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO warotrans_app', s);
  END LOOP;
END \$\$;
SQL
echo 'grants ok'"
