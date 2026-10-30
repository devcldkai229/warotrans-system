<#
  Single inbound TR E2E on MAP-WH42CFE65F-V001:
  Park(spawn) -> Inbound pickup -> Shelf-A-01 dropoff -> COMPLETED
  Two-robot: NOT_RUN (documented by caller).
#>
param(
  [string]$BaseUrl = "http://127.0.0.1:5090",
  [int]$TimeoutSeconds = 600,
  [int]$ConfirmDelaySeconds = 2,
  [switch]$PrepareOnly
)
$ErrorActionPreference = "Stop"
$script:BaseUrl = $BaseUrl
. "E:\programming\my_project\warotrans-system\samples\simulation\sim-common.ps1"
$script:BaseUrl = $BaseUrl
$script:SimOut = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001"
New-Item -ItemType Directory -Force -Path $script:SimOut | Out-Null

$config = Get-Content "E:\programming\my_project\warotrans-system\samples\simulation\sim-config.json" -Raw | ConvertFrom-Json
function Endpoint([string]$alias) {
  $e = $config.endpoints | Where-Object { $_.alias -eq $alias } | Select-Object -First 1
  if (-not $e) { throw "alias $alias missing in sim-config" }
  return $e.endpointId
}

# Seed inbound container set (shared CTN-IN ids)
Invoke-Psql (Read-Text "E:\programming\my_project\warotrans-system\samples\simulation\01-seed.sim-containers.sql") | Out-Null

$adminToken = Get-AdminToken
$staff = Invoke-Api POST "/api/identity/login" '{"username":"staff","password":"Staff@123"}'
Assert-Status $staff 200 "login staff"
$staffToken = $staff.Body.accessToken

$wfCode = "INBOUND_PUTAWAY"
$wf = Invoke-Api GET "/api/workflow-execution/workflows?code=$wfCode&status=PUBLISHED" $null $adminToken
if ($wf.Body.total -eq 0) { throw "workflow $wfCode not published" }
$workflowId = ($wf.Body.items | Sort-Object versionNo -Descending | Select-Object -First 1).id

$containerId = "e4000000-0000-4000-8000-000000000004"
$containers = @{ $containerId = "CTN-IN-000001" }
$storageLocations = @{
  S01 = $config.storageLocations.S01
}

$detail = [pscustomobject]@{
  sequenceNo = 1
  containerId = $containerId
  sourceEndpointId = (Endpoint "IN")
  destinationEndpointId = (Endpoint "S01")
  destinationStorageLocationId = $storageLocations.S01
}
$bodyObj = [pscustomobject]@{
  warehouseId = $config.warehouseId
  mapVersionId = $config.mapVersionId
  workflowId = $workflowId
  workflowInputs = [pscustomobject]@{}
  note = "WH42 V001 single inbound E2E"
  details = @($detail)
}
$body = $bodyObj | ConvertTo-Json -Depth 6 -Compress
$tr = Invoke-Api POST "/api/transportation/transport-requests" $body $staffToken
Assert-Status $tr 201 "create TR"
Save-Text "tr.json" (Format-Json $tr.Raw)
$queue = Invoke-Api POST "/api/transportation/transport-requests/$($tr.Body.id)/queue" $null $staffToken
Assert-Status $queue 200 "queue TR"
$jobId = $queue.Body.jobs[0].jobId
Write-Host "TR $($tr.Body.requestCode) job=$jobId"

if ($PrepareOnly) {
  Write-Host "PREPARE_ONLY jobId=$jobId"
  return
}

# Clear Active quarantine left by boot reconcile / prior FAULT, then settle TF/sim clock.
Write-Host "0b. Release traffic quarantine + settle" -ForegroundColor Cyan
$rel = Invoke-Api POST "/api/fleet/traffic/robots/$($config.robotId)/release-after-clearance" `
  (@{ operatorId = "admin-e2e"; resourceIds = $null } | ConvertTo-Json -Compress) $adminToken
Assert-Status $rel 200 "release-after-clearance"
$park = $config.endpoints | Where-Object { $_.alias -eq "PARK" } | Select-Object -First 1
$rec = Invoke-Api POST "/api/fleet/traffic/robots/$($config.robotId)/reconcile" `
  (@{ poseX = $park.x; poseY = $park.y; localizationOk = $true; occupiedEdgeIds = @() } | ConvertTo-Json -Compress) $adminToken
Assert-Status $rec 200 "reconcile"
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE id='$($config.robotId)';" | Out-Null
Start-Sleep -Seconds 25

$start = Invoke-Api POST "/api/workflow-execution/jobs/$jobId/start" (@{ robotId = $config.robotId } | ConvertTo-Json -Compress) $staffToken
Assert-Status $start 200 "start job"

$endpointNames = @{}
foreach ($e in $config.endpoints) { $endpointNames[$e.endpointId] = $e.alias }

$log = New-Object System.Collections.Generic.List[string]
$t0 = Get-Date
$lastLine = ""
do {
  Start-Sleep -Seconds 2
  $job = (Invoke-Api GET "/api/workflow-execution/jobs/$jobId" $null $staffToken).Body
  $robot = (Invoke-Api GET "/api/fleet/robots/$($config.robotId)" $null $staffToken).Body
  $steps = @($job.tasks | ForEach-Object { $task = $_; $_.steps | ForEach-Object { $_ | Add-Member -NotePropertyName task -NotePropertyValue $task -PassThru -Force } })
  $current = $steps | Where-Object { $_.id -eq $job.currentStepId } | Select-Object -First 1
  $where = ""
  if ($current) {
    $stop = if ($current.task.stopEndpointId) { $endpointNames[$current.task.stopEndpointId] } else { "" }
    $where = ("{0} {1} {2}" -f $current.stepKey, $current.status, $stop).Trim()
  }
  $line = ("[{0,4}s] job={1,-9} {2,2}/{3} | {4,-40} | robot ({5,5:N2},{6,5:N2}) {7}" -f `
    [int]((Get-Date) - $t0).TotalSeconds, $job.status, $job.completedSteps, $job.totalSteps, $where, $robot.poseX, $robot.poseY, $robot.navigationStatus)
  if ($line.Substring(8) -ne $lastLine) { Write-Host $line; $log.Add($line); $lastLine = $line.Substring(8) }

  if ($current -and $current.stepType -eq "HUMAN_INTERACTION" -and $current.status -eq "WAITING") {
    Start-Sleep -Seconds $ConfirmDelaySeconds
    $confirm = Invoke-Api POST "/api/workflow-execution/job-steps/$($current.id)/confirm" `
      (@{ containerId = $containerId; note = "scan CTN-IN-000001" } | ConvertTo-Json -Compress) $staffToken
    Assert-Status $confirm 200 "confirm $($current.operationCode)"
    $log.Add("   confirm $($current.operationCode)")
  }
} while ($job.status -in @("RUNNING", "ASSIGNED", "CREATED") -and ((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds)

$final = Invoke-Api GET "/api/workflow-execution/jobs/$jobId" $null $staffToken
Save-Text "job.final.json" (Format-Json $final.Raw)
$request = Invoke-Api GET "/api/transportation/transport-requests/$($tr.Body.id)" $null $staffToken
Save-Text "tr.final.json" (Format-Json $request.Raw)
$summary = "Job {0}: {1} ({2}/{3}) in {4}s · TR {5}: {6}" -f `
  $final.Body.jobNo, $final.Body.status, $final.Body.completedSteps, $final.Body.totalSteps,
  [int]((Get-Date) - $t0).TotalSeconds, $request.Body.requestCode, $request.Body.status
$log.Add($summary)
Save-Text "run.log.txt" (($log -join "`n") + "`n")
Write-Host $summary
if ($final.Body.status -ne "COMPLETED") { exit 2 }
