<#
.SYNOPSIS
  GĐ 3 — Robot ảo chạy trọn một TransportRequest: tạo request → queue → start Job → robot tự chạy,
  script đóng vai nhân viên xác nhận PICKUP / DROPOFF → Job COMPLETED, Request COMPLETED.

.DESCRIPTION
  -Scenario inbound (mặc định), workflow INBOUND_PUTAWAY, 3 thùng vừa nhận ở cửa nhập đem cất lên kệ:
      CTN-IN-000001 IN→S01,  CTN-IN-000002 IN→S02,  CTN-IN-000003 IN→S03
      Planner: PICKUP IN [1,2,3] → DROPOFF S01 [1] → DROPOFF S02 [2] → DROPOFF S03 [3]
  -Scenario relocation, workflow INTERNAL_RELOCATION, chuyển thùng đang nằm trên kệ sang kệ khác:
      CTN-RL-000001 S01→S04,  CTN-RL-000002 S01→S04,  CTN-RL-000003 S02→S01   (LOC-SIM-S01..S04)
      Planner: PICKUP S01 [1,2] → PICKUP S02 [3] → DROPOFF S04 [1,2] → DROPOFF S01 [3]
  Alias = code endpoint của demo map v6 (sim-config.json): S01..S04, IN, QC-01, QC-02, OUT, CHG-01, PARK-01...

  Cần: backend (run-backend-sim.ps1), seed-sim.ps1 đã chạy, robot ảo đang chạy:
    wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh

.PARAMETER ConfirmDelaySeconds
  Thời gian "nhân viên" đợi trước khi bấm xác nhận (để kịp nhìn robot đứng ở kệ).
.PARAMETER ManualConfirm
  Không tự xác nhận: script chỉ theo dõi, bạn tự gọi POST /api/workflow-execution/job-steps/{id}/confirm.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples/simulation/run-job-sim.ps1
#>
param(
    [ValidateSet("inbound", "relocation")]
    [string]$Scenario = "inbound",
    [string]$BaseUrl = "http://localhost:5090",
    [int]$ConfirmDelaySeconds = 3,
    [int]$TimeoutSeconds = 900,
    [switch]$ManualConfirm,
    # Only create + queue the request; start and confirm from the web page /monitor/live/{jobId}.
    [switch]$PrepareOnly,
    [string]$WebUrl = "http://localhost:5173"
)

$script:BaseUrl = $BaseUrl
. (Join-Path $PSScriptRoot "sim-common.ps1")

$config = (Read-Text (Join-Path $PSScriptRoot "sim-config.json")) | ConvertFrom-Json
function Endpoint([string]$alias) { ($config.endpoints | Where-Object { $_.alias -eq $alias }).endpointId }
$containers = @{
    "e1000000-0000-4000-8000-000000000001" = "CTN-SIM-000001"
    "e2000000-0000-4000-8000-000000000002" = "CTN-SIM-000002"
    "e3000000-0000-4000-8000-000000000003" = "CTN-SIM-000003"
    "e4000000-0000-4000-8000-000000000004" = "CTN-IN-000001"
    "e5000000-0000-4000-8000-000000000005" = "CTN-IN-000002"
    "e6000000-0000-4000-8000-000000000006" = "CTN-IN-000003"
    "e7000000-0000-4000-8000-000000000007" = "CTN-RL-000001"
    "e8000000-0000-4000-8000-000000000008" = "CTN-RL-000002"
    "e9000000-0000-4000-8000-000000000009" = "CTN-RL-000003"
    "ea000000-0000-4000-8000-000000000010" = "CTN-RL-000004"
    "eb000000-0000-4000-8000-000000000011" = "CTN-RL-000005"
}
# Storage location of each shelf (seed-sim.ps1 step 2b). A shelf endpoint in a detail is sent with its location.
$storageLocations = @{
    S01 = "f0000000-0000-4000-8000-000000000001"
    S02 = "f0000000-0000-4000-8000-000000000002"
    S03 = "f0000000-0000-4000-8000-000000000003"
    S04 = "f0000000-0000-4000-8000-000000000004"
}
$scenarios = @{
    inbound    = @{
        workflow = "INBOUND_PUTAWAY"; title = "CTN-IN-000001 IN->S01, CTN-IN-000002 IN->S02, CTN-IN-000003 IN->S03"
        moves    = @(@("e4000000-0000-4000-8000-000000000004", "IN", "S01"),
                     @("e5000000-0000-4000-8000-000000000005", "IN", "S02"),
                     @("e6000000-0000-4000-8000-000000000006", "IN", "S03"))
    }
    relocation = @{
        workflow = "INTERNAL_RELOCATION"; title = "CTN-RL-000001 S01->S04, CTN-RL-000002 S01->S04, CTN-RL-000003 S02->S01"
        moves    = @(@("e7000000-0000-4000-8000-000000000007", "S01", "S04"),
                     @("e8000000-0000-4000-8000-000000000008", "S01", "S04"),
                     @("e9000000-0000-4000-8000-000000000009", "S02", "S01"))
    }
}
$plan = $scenarios[$Scenario]
# Result files in responses/: inbound keeps the original names, other scenarios get a prefix (relocation.10-job...).
$resultPrefix = if ($Scenario -eq "inbound") { "" } else { "$Scenario." }
$endpointNames = @{}
foreach ($e in $config.endpoints) { $endpointNames[$e.endpointId] = $e.alias }

# ---------------------------------------------------------------- 0. data
Write-Host "0. Seed containers (WH-SIM)" -ForegroundColor Cyan
Invoke-Psql (Read-Text (Join-Path $PSScriptRoot "01-seed.sim-containers.sql")) | Out-Null
$adminToken = Get-AdminToken
$staff = Invoke-Api POST "/api/identity/login" '{"username":"staff","password":"Staff@123"}'
Assert-Status $staff 200 "login staff"
$staffToken = $staff.Body.accessToken

$wfCode = $plan.workflow
$wf = Invoke-Api GET "/api/workflow-execution/workflows?code=$wfCode&status=PUBLISHED" $null $adminToken
if ($wf.Body.total -eq 0) {
    $created = Invoke-Api POST "/api/workflow-execution/workflows" (Read-Text (Join-Path $PSScriptRoot "../workflows/$wfCode.request.json")) $adminToken
    Assert-Status $created 201 "create workflow $wfCode"
    Assert-Status (Invoke-Api POST "/api/workflow-execution/workflows/$($created.Body.id)/publish" $null $adminToken) 200 "publish workflow"
    $workflowId = $created.Body.id
}
else {
    $workflowId = ($wf.Body.items | Sort-Object versionNo -Descending | Select-Object -First 1).id
}

# ---------------------------------------------------------------- 1. TransportRequest + queue
Write-Host "1. TransportRequest ($wfCode) $($plan.title)" -ForegroundColor Cyan
$seq = 0
$details = foreach ($m in $plan.moves) {
    $seq++
    $detail = @{ sequenceNo = $seq; containerId = $m[0]; sourceEndpointId = (Endpoint $m[1]); destinationEndpointId = (Endpoint $m[2]) }
    if ($storageLocations.ContainsKey($m[1])) { $detail.sourceStorageLocationId = $storageLocations[$m[1]] }
    if ($storageLocations.ContainsKey($m[2])) { $detail.destinationStorageLocationId = $storageLocations[$m[2]] }
    $detail
}
$body = @{
    warehouseId = $config.warehouseId; mapVersionId = $config.mapVersionId; workflowId = $workflowId
    workflowInputs = @{}; note = "Simulation demo ($Scenario): Gazebo robot runs the full workflow"
    details = @($details)
} | ConvertTo-Json -Depth 5 -Compress
$tr = Invoke-Api POST "/api/transportation/transport-requests" $body $staffToken
Assert-Status $tr 201 "create transport request"
Save-Text "$($resultPrefix)10-job.transport-request.response.json" (Format-Json $tr.Raw)
$queue = Invoke-Api POST "/api/transportation/transport-requests/$($tr.Body.id)/queue" $null $staffToken
Assert-Status $queue 200 "queue (plan + provision Job)"
$jobId = $queue.Body.jobs[0].jobId
Write-Host ("  {0} -> {1} ({2} tasks, {3} steps)" -f $tr.Body.requestCode, $queue.Body.jobs[0].jobNo, $queue.Body.jobs[0].jobTaskCount, $queue.Body.jobs[0].jobStepCount)

if ($PrepareOnly) {
    Write-Host ""
    Write-Host "Job ready (CREATED). Log in to the web as admin / Admin@123, press Start, watch Gazebo, Confirm each pickup / drop-off:" -ForegroundColor Cyan
    Write-Host "  $WebUrl/monitor/live/$jobId"
    return
}

# ---------------------------------------------------------------- 2. start
Write-Host "2. Start Job on $($config.robotCode)" -ForegroundColor Cyan
$start = Invoke-Api POST "/api/workflow-execution/jobs/$jobId/start" (@{ robotId = $config.robotId } | ConvertTo-Json -Compress) $staffToken
Assert-Status $start 200 "start job"

# ---------------------------------------------------------------- 3. follow + confirm
Write-Host "3. Follow the Job (robot moves in Gazebo, script confirms as Staff)" -ForegroundColor Cyan
$log = New-Object System.Collections.Generic.List[string]
$t0 = Get-Date
$lastLine = ""
do {
    Start-Sleep -Seconds 1
    $job = (Invoke-Api GET "/api/workflow-execution/jobs/$jobId" $null $staffToken).Body
    $robot = (Invoke-Api GET "/api/fleet/robots/$($config.robotId)" $null $staffToken).Body
    $steps = @($job.tasks | ForEach-Object { $task = $_; $_.steps | ForEach-Object { $_ | Add-Member -NotePropertyName task -NotePropertyValue $task -PassThru -Force } })
    $current = $steps | Where-Object { $_.id -eq $job.currentStepId } | Select-Object -First 1

    $where = ""
    if ($current) {
        $stop = if ($current.task.stopEndpointId) { $endpointNames[$current.task.stopEndpointId] } else { "" }
        $ctn = if ($current.task.containerId) { $containers[$current.task.containerId] } else { "" }
        $where = ("{0} {1} {2} {3}" -f $current.stepKey, $current.status, $stop, $ctn).Trim()
    }
    $line = ("[{0,4}s] job={1,-9} {2,2}/{3} | {4,-45} | robot ({5,5:N2},{6,5:N2}) {7}" -f `
        [int]((Get-Date) - $t0).TotalSeconds, $job.status, $job.completedSteps, $job.totalSteps, $where, $robot.poseX, $robot.poseY, $robot.navigationStatus)
    if ($line.Substring(8) -ne $lastLine) { Write-Host $line; $log.Add($line); $lastLine = $line.Substring(8) }

    if (-not $ManualConfirm -and $current -and $current.stepType -eq "HUMAN_INTERACTION" -and $current.status -eq "WAITING") {
        Start-Sleep -Seconds $ConfirmDelaySeconds
        $containerId = $current.resolvedInputs.containerId
        $confirm = Invoke-Api POST "/api/workflow-execution/job-steps/$($current.id)/confirm" `
            (@{ containerId = $containerId; note = "scan $($containers[$containerId])" } | ConvertTo-Json -Compress) $staffToken
        Assert-Status $confirm 200 ("Staff confirm {0} {1}" -f $current.operationCode, $containers[$containerId])
        $log.Add("   confirm $($current.operationCode) $($containers[$containerId])")
    }
} while ($job.status -in @("RUNNING", "ASSIGNED", "CREATED") -and ((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds)

# ---------------------------------------------------------------- 4. result
$final = Invoke-Api GET "/api/workflow-execution/jobs/$jobId" $null $staffToken
Save-Text "$($resultPrefix)11-job.final.json" (Format-Json $final.Raw)
$request = Invoke-Api GET "/api/transportation/transport-requests/$($tr.Body.id)" $null $staffToken
Save-Text "$($resultPrefix)12-job.transport-request.final.json" (Format-Json $request.Raw)
$summary = "Job {0}: {1} ({2}/{3} steps) in {4}s · TransportRequest {5}: {6} · details: {7}" -f `
    $final.Body.jobNo, $final.Body.status, $final.Body.completedSteps, $final.Body.totalSteps, [int]((Get-Date) - $t0).TotalSeconds,
    $request.Body.requestCode, $request.Body.status, (($request.Body.details | ForEach-Object { $_.status }) -join ",")
$log.Add($summary)
Save-Text "$($resultPrefix)13-job.run.log.txt" (($log -join "`n") + "`n")
Write-Host ""
Write-Host $summary -ForegroundColor $(if ($final.Body.status -eq "COMPLETED") { "Green" } else { "Yellow" })
