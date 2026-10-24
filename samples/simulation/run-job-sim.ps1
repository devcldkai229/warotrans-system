<#
.SYNOPSIS
  GĐ 3 — Robot ảo chạy trọn một TransportRequest: tạo request → queue → start Job → robot tự chạy,
  script đóng vai nhân viên xác nhận PICKUP / DROPOFF → Job COMPLETED, Request COMPLETED.

.DESCRIPTION
  -Scenario inbound (mặc định), workflow INBOUND_PUTAWAY, 3 thùng vừa nhận ở cửa nhập đem cất lên kệ:
      CTN-IN-000001 IN1→A,  CTN-IN-000002 IN1→B,  CTN-IN-000003 IN2→C
      Planner: PICKUP IN1 [1,2] → PICKUP IN2 [3] → DROPOFF A [1] → DROPOFF B [2] → DROPOFF C [3]
  -Scenario relocation, workflow INTERNAL_RELOCATION:
      CTN-SIM-000001 IN1→A,  CTN-SIM-000002 IN1→B,  CTN-SIM-000003 C→OUT1

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
    [ValidateSet("inbound", "inbound-multi", "relocation", "physical-one")]
    [string]$Scenario = "inbound",
    [string]$BaseUrl = "http://localhost:5090",
    [int]$ConfirmDelaySeconds = 3,
    [int]$TimeoutSeconds = 900,
    [switch]$ManualConfirm,
    # Do not call Staff confirm API; wait for robot MQTT interaction_confirm (fake_robot --auto-confirm-delay or physical button).
    [switch]$ButtonConfirm,
    # Only create + queue the request; start and confirm from the web page /monitor/live/{jobId}.
    [switch]$PrepareOnly,
    [string]$WebUrl = "http://localhost:5173",
    # Optional override (default: samples/simulation/sim-config.json). Physical E2E uses samples/physical-e2e/physical-config.json.
    [string]$ConfigPath = ""
)

$script:BaseUrl = $BaseUrl
. (Join-Path $PSScriptRoot "sim-common.ps1")

if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot "sim-config.json" }
$config = (Read-Text $ConfigPath) | ConvertFrom-Json
function Endpoint([string]$alias) { ($config.endpoints | Where-Object { $_.alias -eq $alias }).endpointId }
$containers = @{
    "e1000000-0000-4000-8000-000000000001" = "CTN-SIM-000001"
    "e2000000-0000-4000-8000-000000000002" = "CTN-SIM-000002"
    "e3000000-0000-4000-8000-000000000003" = "CTN-SIM-000003"
    "e4000000-0000-4000-8000-000000000004" = "CTN-IN-000001"
    "e5000000-0000-4000-8000-000000000005" = "CTN-IN-000002"
    "e6000000-0000-4000-8000-000000000006" = "CTN-IN-000003"
    "e7000000-0000-4000-8000-000000000007" = "CTN-REAL-000001"
}
$scenarios = @{
    inbound    = @{
        workflow = "INBOUND_PUTAWAY"; title = "CTN-IN-000001 IN1->A, CTN-IN-000002 IN1->B, CTN-IN-000003 IN2->C"
        moves    = @(@("e4000000-0000-4000-8000-000000000004", "IN1", "A"),
                     @("e5000000-0000-4000-8000-000000000005", "IN1", "B"),
                     @("e6000000-0000-4000-8000-000000000006", "IN2", "C"))
    }
    "inbound-multi" = @{
        workflow = "INBOUND_PUTAWAY"; title = "CTN-IN-000001/2/3 IN1->A, IN1->B, IN1->C (1 source, many dest)"
        moves    = @(@("e4000000-0000-4000-8000-000000000004", "IN1", "A"),
                     @("e5000000-0000-4000-8000-000000000005", "IN1", "B"),
                     @("e6000000-0000-4000-8000-000000000006", "IN1", "C"))
    }
    relocation = @{
        workflow = "INTERNAL_RELOCATION"; title = "C1 IN1->A, C2 IN1->B, C3 C->OUT1"
        moves    = @(@("e1000000-0000-4000-8000-000000000001", "IN1", "A"),
                     @("e2000000-0000-4000-8000-000000000002", "IN1", "B"),
                     @("e3000000-0000-4000-8000-000000000003", "C", "OUT1"))
    }
    "physical-one" = @{
        workflow = "INBOUND_PUTAWAY"; title = "CTN-REAL-000001 SRC->DST (physical button E2E)"
        moves    = @(@("e7000000-0000-4000-8000-000000000007", "SRC", "DST"))
    }
}
$plan = $scenarios[$Scenario]
$endpointNames = @{}
foreach ($e in $config.endpoints) { $endpointNames[$e.endpointId] = $e.alias }

# Physical E2E: write JSON artifacts next to physical-config.json
if ($Scenario -eq "physical-one" -or ($ConfigPath -match "physical-e2e")) {
    $script:SimOut = Join-Path (Split-Path -Parent $ConfigPath) "responses"
    New-Item -ItemType Directory -Force -Path $script:SimOut | Out-Null
}

# ---------------------------------------------------------------- 0. data
if ($Scenario -eq "physical-one") {
    Write-Host "0. Seed containers (WH-REAL)" -ForegroundColor Cyan
    $physSeed = Join-Path (Split-Path -Parent $ConfigPath) "01-seed.physical-containers.sql"
    if (-not (Test-Path $physSeed)) { $physSeed = Join-Path $PSScriptRoot "..\physical-e2e\01-seed.physical-containers.sql" }
    Invoke-Psql (Read-Text $physSeed) | Out-Null
}
else {
    Write-Host "0. Seed containers (WH-SIM)" -ForegroundColor Cyan
    Invoke-Psql (Read-Text (Join-Path $PSScriptRoot "01-seed.sim-containers.sql")) | Out-Null
}
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
# PowerShell 5.1: use pscustomobject so ConvertTo-Json emits valid nested JSON.
$seq = 0
$detailObjs = foreach ($m in $plan.moves) {
    $seq++
    [pscustomobject]@{
        sequenceNo = $seq
        containerId = $m[0]
        sourceEndpointId = (Endpoint $m[1])
        destinationEndpointId = (Endpoint $m[2])
    }
}
$bodyObj = [pscustomobject]@{
    warehouseId = $config.warehouseId
    mapVersionId = $config.mapVersionId
    workflowId = $workflowId
    workflowInputs = [pscustomobject]@{}
    note = "Simulation demo ($Scenario): Gazebo robot runs the full workflow"
    details = @($detailObjs)
}
$body = $bodyObj | ConvertTo-Json -Depth 6 -Compress
$tr = Invoke-Api POST "/api/transportation/transport-requests" $body $staffToken
Assert-Status $tr 201 "create transport request"
Save-Text "10-job.transport-request.response.json" (Format-Json $tr.Raw)
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

    if (-not $ManualConfirm -and -not $ButtonConfirm -and $current -and $current.stepType -eq "HUMAN_INTERACTION" -and $current.status -eq "WAITING") {
        Start-Sleep -Seconds $ConfirmDelaySeconds
        $containerId = $current.resolvedInputs.containerId
        $confirm = Invoke-Api POST "/api/workflow-execution/job-steps/$($current.id)/confirm" `
            (@{ containerId = $containerId; note = "scan $($containers[$containerId])" } | ConvertTo-Json -Compress) $staffToken
        Assert-Status $confirm 200 ("Staff confirm {0} {1}" -f $current.operationCode, $containers[$containerId])
        $log.Add("   confirm $($current.operationCode) $($containers[$containerId])")
    }
    elseif ($ButtonConfirm -and $current -and $current.stepType -eq "HUMAN_INTERACTION" -and $current.status -eq "WAITING") {
        # Robot (fake_robot --auto-confirm-delay or physical button) publishes interaction_confirm.
        $log.Add("   waiting ROBOT_BUTTON confirm $($current.operationCode)")
    }
} while ($job.status -in @("RUNNING", "ASSIGNED", "CREATED") -and ((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds)

# ---------------------------------------------------------------- 4. result
$final = Invoke-Api GET "/api/workflow-execution/jobs/$jobId" $null $staffToken
Save-Text "11-job.final.json" (Format-Json $final.Raw)
$request = Invoke-Api GET "/api/transportation/transport-requests/$($tr.Body.id)" $null $staffToken
Save-Text "12-job.transport-request.final.json" (Format-Json $request.Raw)
$summary = "Job {0}: {1} ({2}/{3} steps) in {4}s · TransportRequest {5}: {6} · details: {7}" -f `
    $final.Body.jobNo, $final.Body.status, $final.Body.completedSteps, $final.Body.totalSteps, [int]((Get-Date) - $t0).TotalSeconds,
    $request.Body.requestCode, $request.Body.status, (($request.Body.details | ForEach-Object { $_.status }) -join ",")
$log.Add($summary)
Save-Text "13-job.run.log.txt" (($log -join "`n") + "`n")
Write-Host ""
Write-Host $summary -ForegroundColor $(if ($final.Body.status -eq "COMPLETED") { "Green" } else { "Yellow" })
