# Restores a Postgres snapshot from infrastructure/snapshots into the local docker database (warotrans-postgres).
# Everything in the target database is replaced. Stop the backend first (it holds connections and keeps writing).
#
#   .\tools\restore-db-snapshot.ps1                                            # newest *workflows_ready* snapshot -> warotrans
#   .\tools\restore-db-snapshot.ps1 -Snapshot warotrans_postgres_xxx.dump      # a given snapshot
#   .\tools\restore-db-snapshot.ps1 -Database warotrans_check                  # into another database (created if missing)
param(
    [string]$Snapshot,
    [string]$Database = 'warotrans',
    [string]$Container = 'warotrans-postgres',
    [string]$User = 'warotrans'
)

$dir = Join-Path $PSScriptRoot '..\infrastructure\snapshots'
if (-not $Snapshot) {
    $Snapshot = (Get-ChildItem $dir -Filter 'warotrans_postgres_workflows_ready_*.dump' | Sort-Object Name | Select-Object -Last 1).Name
}
$file = Join-Path $dir $Snapshot
if (-not (Test-Path $file)) { throw "Snapshot not found: $file" }

$listening = Get-NetTCPConnection -LocalPort 5090 -State Listen -ErrorAction SilentlyContinue
if ($listening -and $Database -eq 'warotrans') { throw 'The backend is running on port 5090: stop it before restoring the warotrans database.' }

Write-Host "== Restoring $Snapshot into $Database"
function Invoke-Step([string]$what, [scriptblock]$command) {
    & $command 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

Invoke-Step 'copy snapshot' { docker cp $file "${Container}:/tmp/restore.dump" }
Invoke-Step 'close connections' { docker exec $Container psql -q -U $User -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();" }
Invoke-Step 'drop database' { docker exec $Container psql -q -U $User -d postgres -v ON_ERROR_STOP=1 -c "SET client_min_messages = warning" -c "DROP DATABASE IF EXISTS $Database" }
Invoke-Step 'create database' { docker exec $Container psql -q -U $User -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $Database OWNER $User;" }
Invoke-Step 'pg_restore' { docker exec $Container pg_restore -U $User -d $Database --no-owner /tmp/restore.dump }
docker exec $Container rm -f /tmp/restore.dump

docker exec $Container psql -U $User -d $Database -At -c "SELECT code || ' v' || version_no || ' ' || status FROM execution.workflows ORDER BY code;"
Write-Host "== Done. Start the backend: migrations newer than the snapshot are applied on startup."
