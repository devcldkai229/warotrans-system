<#
.SYNOPSIS
  Demo luồng TransportRequest từ đầu đến cuối trên backend thật:
  tạo request (WTCP-52) → queue: lập JobBatchPlan + tạo Job runtime (WTCP-53).

.DESCRIPTION
  1. Seed Warehouse / Product / Container vào PostgreSQL (00-seed.warehouse.sql).
  2. Đăng nhập admin (dựng dữ liệu) và staff (tạo request).
  3. Tạo MapVersion + 6 Endpoint (A..F) rồi publish.
  4. Lấy Workflow INTERNAL_RELOCATION đã PUBLISHED; nếu chưa có thì tạo từ ../workflows/INTERNAL_RELOCATION.request.json và publish.
  5. Tạo TransportRequest 1: C1 A→D, C2 A→E, C3 A→F; đọc lại các dòng trong DB (chưa có Job).
  6. Queue request 1 → Job runtime graph; queue lần 2 trả về cùng Job.
  7. Tạo + queue request 2: C6 A→D, C7 B→E, C8 C→F.
  8. Gọi thử các ca lỗi.

  Mọi response thật được ghi vào thư mục responses/. Access token KHÔNG được ghi ra file.

  Yêu cầu: docker compose trong infrastructure/ đang chạy, backend đang chạy ở Development
  (dotnet run --project backend/src/WaroTrans.Host --launch-profile http).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples/transport-requests/run-demo.ps1
#>
param(
    [string]$BaseUrl = "http://localhost:5090",
    [string]$PostgresContainer = "warotrans-postgres"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "responses"
$errorsOut = Join-Path $out "errors"
New-Item -ItemType Directory -Force -Path $errorsOut | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Json([string]$path) {
    [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Save-Text([string]$name, [string]$text) {
    [System.IO.File]::WriteAllText((Join-Path $out $name), $text, $utf8NoBom)
}

# Pretty-print JSON text với thụt lề 2 khoảng trắng (ConvertTo-Json của PowerShell 5.1 thụt lề rất xấu).
function Format-Json([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    $sb = New-Object System.Text.StringBuilder
    $indent = 0
    $inString = $false
    $escaped = $false
    $chars = $raw.Trim().ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $c = $chars[$i]
        if ($inString) {
            [void]$sb.Append($c)
            if ($escaped) { $escaped = $false }
            elseif ($c -eq '\') { $escaped = $true }
            elseif ($c -eq '"') { $inString = $false }
            continue
        }
        switch ($c) {
            '"' { $inString = $true; [void]$sb.Append($c) }
            { $_ -eq '{' -or $_ -eq '[' } {
                $close = if ($c -eq '{') { '}' } else { ']' }
                $j = $i + 1
                while ($j -lt $chars.Length -and [char]::IsWhiteSpace($chars[$j])) { $j++ }
                if ($j -lt $chars.Length -and $chars[$j] -eq $close) {
                    [void]$sb.Append("$c$close"); $i = $j
                }
                else {
                    $indent++
                    [void]$sb.Append($c).Append("`n").Append('  ' * $indent)
                }
            }
            { $_ -eq '}' -or $_ -eq ']' } {
                $indent--
                [void]$sb.Append("`n").Append('  ' * $indent).Append($c)
            }
            ',' { [void]$sb.Append(",`n").Append('  ' * $indent) }
            ':' { [void]$sb.Append(': ') }
            default { if (-not [char]::IsWhiteSpace($c)) { [void]$sb.Append($c) } }
        }
    }
    $sb.ToString() + "`n"
}

# ConvertTo-Json của PowerShell 5.1 escape ' < > & thành \u00XX; đổi lại cho dễ đọc (vẫn là JSON hợp lệ).
function To-PrettyJson($obj) {
    $json = $obj | ConvertTo-Json -Depth 50 -Compress
    foreach ($pair in @(@("0027", "'"), @("003c", "<"), @("003e", ">"), @("0026", "&"))) {
        $json = $json.Replace([string][char]92 + "u" + $pair[0], $pair[1])
    }
    Format-Json $json
}

# Gọi API; trả về @{ Status; Body (object); Raw (string) } kể cả khi lỗi 4xx.
function Invoke-Api([string]$method, [string]$path, [string]$body = $null, [string]$token = $null) {
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $params = @{
        Uri             = "$BaseUrl$path"
        Method          = $method
        Headers         = $headers
        UseBasicParsing = $true
    }
    if ($body) {
        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($body)
        $params["ContentType"] = "application/json; charset=utf-8"
    }

    try {
        $resp = Invoke-WebRequest @params
        $raw = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
        $status = [int]$resp.StatusCode
    }
    catch [System.Net.WebException] {
        $r = $_.Exception.Response
        if ($null -eq $r) { throw }
        $status = [int]$r.StatusCode
        $reader = New-Object System.IO.StreamReader($r.GetResponseStream(), [System.Text.Encoding]::UTF8)
        $raw = $reader.ReadToEnd()
    }

    $obj = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { $obj = $raw | ConvertFrom-Json }
    return @{ Status = $status; Body = $obj; Raw = $raw }
}

function Assert-Status($result, [int]$expected, [string]$step) {
    if ($result.Status -ne $expected) {
        throw "$step : expected HTTP $expected but got $($result.Status). Body: $($result.Raw)"
    }
    Write-Host ("  OK  {0} -> HTTP {1}" -f $step, $result.Status) -ForegroundColor Green
}

# ---------------------------------------------------------------- 0. Seed
Write-Host "0. Seed Warehouse / Product / Container" -ForegroundColor Cyan
$OutputEncoding = $utf8NoBom
Get-Content -Raw -Encoding UTF8 (Join-Path $here "00-seed.warehouse.sql") |
    docker exec -i $PostgresContainer psql -U warotrans -d warotrans -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw "Seed SQL failed." }
Write-Host "  OK  seed applied"

# ---------------------------------------------------------------- 1. Login
Write-Host "1. Login" -ForegroundColor Cyan
$admin = Invoke-Api POST "/api/identity/login" '{"username":"admin","password":"Admin@123"}'
Assert-Status $admin 200 "login admin"
$staffLogin = Invoke-Api POST "/api/identity/login" (Read-Json (Join-Path $here "requests/01-login.request.json"))
Assert-Status $staffLogin 200 "login staff"
$adminToken = $admin.Body.accessToken
$staffToken = $staffLogin.Body.accessToken
$staffId = $staffLogin.Body.account.id
Save-Text "01-login.staff.account.json" (To-PrettyJson $staffLogin.Body.account)

# ---------------------------------------------------------------- 2-4. Map + Endpoints
Write-Host "2. MapVersion + Endpoints" -ForegroundColor Cyan
$warehouseId = "11111111-1111-1111-1111-111111111111"
$map = Invoke-Api POST "/api/navigation/warehouses/$warehouseId/maps" (Read-Json (Join-Path $here "requests/02-map.create.request.json")) $adminToken
Assert-Status $map 201 "create map"
Save-Text "02-map.create.response.json" (Format-Json $map.Raw)
$mapId = $map.Body.id

$endpointIds = @{}
$endpointResponses = @()
foreach ($ep in ((Read-Json (Join-Path $here "requests/03-endpoints.request.json")) | ConvertFrom-Json)) {
    $r = Invoke-Api POST "/api/navigation/maps/$mapId/endpoints" ($ep.body | ConvertTo-Json -Depth 5) $adminToken
    Assert-Status $r 201 "create endpoint $($ep.alias)"
    $endpointIds[$ep.alias] = $r.Body.id
    $endpointResponses += $r.Body
}
Save-Text "03-endpoints.create.response.json" (Format-Json (ConvertTo-Json -InputObject $endpointResponses -Depth 10 -Compress))

$publishMap = Invoke-Api POST "/api/navigation/maps/$mapId/publish" $null $adminToken
Assert-Status $publishMap 200 "publish map"
Save-Text "04-map.publish.response.json" (Format-Json $publishMap.Raw)

# ---------------------------------------------------------------- 5. Workflow
Write-Host "3. Workflow INTERNAL_RELOCATION" -ForegroundColor Cyan
$list = Invoke-Api GET "/api/workflow-execution/workflows?code=INTERNAL_RELOCATION&status=PUBLISHED" $null $adminToken
Assert-Status $list 200 "list published INTERNAL_RELOCATION"
if ($list.Body.total -gt 0) {
    $workflowId = ($list.Body.items | Sort-Object versionNo -Descending | Select-Object -First 1).id
    Write-Host "  reuse PUBLISHED workflow $workflowId"
}
else {
    $createWf = Invoke-Api POST "/api/workflow-execution/workflows" (Read-Json (Join-Path $here "../workflows/INTERNAL_RELOCATION.request.json")) $adminToken
    Assert-Status $createWf 201 "create workflow"
    $workflowId = $createWf.Body.id
    $publishWf = Invoke-Api POST "/api/workflow-execution/workflows/$workflowId/publish" $null $adminToken
    Assert-Status $publishWf 200 "publish workflow"
}
$wf = Invoke-Api GET "/api/workflow-execution/workflows/$workflowId" $null $adminToken
Save-Text "05-workflow.published.get.json" (Format-Json $wf.Raw)
$schema = Invoke-Api GET "/api/workflow-execution/workflows/$workflowId/request-input-schema" $null $adminToken
Save-Text "05-workflow.request-input-schema.json" (Format-Json $schema.Raw)

# ---------------------------------------------------------------- 6. TransportRequest
Write-Host "4. Create TransportRequest (C1 A->D, C2 A->E, C3 A->F)" -ForegroundColor Cyan
# Điền các id do server sinh ra (map, workflow, endpoint) vào template request.
function Fill-Template([string]$name) {
    $text = (Read-Json (Join-Path $here "requests/$name")).
        Replace("{{MAP_VERSION_ID}}", $mapId).
        Replace("{{WORKFLOW_ID}}", $workflowId)
    foreach ($alias in $endpointIds.Keys) {
        $text = $text.Replace("{{EP_$alias}}", $endpointIds[$alias])
    }
    return $text
}

$body = Fill-Template "04-transport-request.template.json"
Save-Text "06-transport-request.request.json" $body

$tr = Invoke-Api POST "/api/transportation/transport-requests" $body $staffToken
Assert-Status $tr 201 "create transport request"
Save-Text "06-transport-request.response.json" (Format-Json $tr.Raw)
if ($tr.Body.requestedBy -ne $staffId) { throw "requestedBy $($tr.Body.requestedBy) != staff $staffId" }
Write-Host ("  {0}  status={1}  details={2}  requestedBy=staff" -f $tr.Body.requestCode, $tr.Body.status, $tr.Body.details.Count)

# ---------------------------------------------------------------- 7. DB check
Write-Host "5. Rows persisted in PostgreSQL" -ForegroundColor Cyan
$sql = @"
SELECT r.request_code, r.status, r.requested_by, r.plan_schema_version, r.workflow_inputs,
       d.sequence_no, d.container_id, d.source_endpoint_id, d.destination_endpoint_id, d.status AS detail_status
FROM transportation.transport_requests r
JOIN transportation.transport_request_details d ON d.transport_request_id = r.id
WHERE r.id = '$($tr.Body.id)'
ORDER BY d.sequence_no;
SELECT count(*) AS jobs_for_demo_containers
FROM execution.job_containers WHERE transport_request_id = '$($tr.Body.id)';
"@
$dbRows = ($sql | docker exec -i $PostgresContainer psql -U warotrans -d warotrans) -join "`n"
Save-Text "07-db.transport-request.rows.txt" $dbRows
Write-Host $dbRows

# ---------------------------------------------------------------- 7b. Queue: plan JobBatchPlan + provision Job runtime
# Cây Job đọc từ DB: mỗi dòng là một JobTask (theo thứ tự chạy) và các JobStep của nó.
function Get-JobGraph([string]$transportRequestId) {
    $graphSql = @"
SELECT j.job_no,
       jt.sequence_no AS task,
       jt.context_values->>'executionScope' AS scope,
       jt.context_values->>'stopAction' AS stop_action,
       sep.code AS stop_endpoint,
       c.barcode AS container,
       CASE WHEN c.id IS NOT NULL THEN src.code || ' -> ' || dst.code END AS current_movement,
       string_agg(ws.step_key, ', ' ORDER BY js.sequence_no) AS steps
FROM execution.jobs j
JOIN execution.job_tasks jt ON jt.job_id = j.id
JOIN execution.job_steps js ON js.job_task_id = jt.id
JOIN execution.workflow_steps ws ON ws.id = js.workflow_step_id
LEFT JOIN navigation.endpoints sep ON sep.id = (jt.context_values->>'stopEndpointId')::uuid
LEFT JOIN warehouse.containers c ON c.id = (jt.context_values->>'containerId')::uuid
LEFT JOIN navigation.endpoints src ON src.id = (jt.context_values->>'source.endpointId')::uuid
LEFT JOIN navigation.endpoints dst ON dst.id = (jt.context_values->>'destination.endpointId')::uuid
WHERE j.id IN (SELECT job_id FROM execution.job_containers WHERE transport_request_id = '$transportRequestId')
GROUP BY j.job_no, jt.sequence_no, scope, stop_action, sep.code, c.id, c.barcode, src.code, dst.code
ORDER BY j.job_no, jt.sequence_no;
SELECT j.job_no, j.status, j.provisioning_key, jc.sequence_no, c.barcode, jc.status AS job_container_status
FROM execution.jobs j
JOIN execution.job_containers jc ON jc.job_id = j.id
JOIN warehouse.containers c ON c.id = jc.container_id
WHERE jc.transport_request_id = '$transportRequestId'
ORDER BY j.job_no, jc.sequence_no;
"@
    ($graphSql | docker exec -i $PostgresContainer psql -U warotrans -d warotrans) -join "`n"
}

function Queue-Request([string]$transportRequestId, [string]$file) {
    $q = Invoke-Api POST "/api/transportation/transport-requests/$transportRequestId/queue" $null $staffToken
    Assert-Status $q 200 "queue $file"
    Save-Text $file (Format-Json $q.Raw)
    if ($q.Body.status -ne "QUEUED") { throw "Expected QUEUED but got $($q.Body.status)" }
    return $q.Body
}

Write-Host "5b. Queue request 1 (plan + provision Job)" -ForegroundColor Cyan
$q1 = Queue-Request $tr.Body.id "08-queue.response.json"
$q1Again = Queue-Request $tr.Body.id "08-queue.again.response.json"
if ($q1Again.jobs[0].jobId -ne $q1.jobs[0].jobId) { throw "Queue is not idempotent: $($q1.jobs[0].jobId) vs $($q1Again.jobs[0].jobId)" }
Write-Host ("  {0} -> {1}  tasks={2} steps={3}  (queue lan 2 tra ve cung Job)" -f $tr.Body.requestCode, $q1.jobs[0].jobNo, $q1.jobs[0].jobTaskCount, $q1.jobs[0].jobStepCount)
$graph1 = Get-JobGraph $tr.Body.id
Save-Text "09-job.runtime.graph.txt" $graph1
Write-Host $graph1

Write-Host "5c. Request 2: C6 A->D, C7 B->E, C8 C->F (lay het roi moi giao)" -ForegroundColor Cyan
$body2 = Fill-Template "05-transport-request-2.template.json"
Save-Text "10-transport-request-2.request.json" $body2
$tr2 = Invoke-Api POST "/api/transportation/transport-requests" $body2 $staffToken
Assert-Status $tr2 201 "create transport request 2"
Save-Text "10-transport-request-2.response.json" (Format-Json $tr2.Raw)
$q2 = Queue-Request $tr2.Body.id "11-queue-2.response.json"
Write-Host ("  {0} -> {1}  tasks={2} steps={3}" -f $tr2.Body.requestCode, $q2.jobs[0].jobNo, $q2.jobs[0].jobTaskCount, $q2.jobs[0].jobStepCount)
$graph2 = Get-JobGraph $tr2.Body.id
Save-Text "12-job.runtime.graph-2.txt" $graph2
Write-Host $graph2

# ---------------------------------------------------------------- 8. Error cases
Write-Host "6. Error cases" -ForegroundColor Cyan
$base = $body | ConvertFrom-Json

function Send-Case([string]$file, $payload, [int]$expected, [string]$expectedCode, [string]$label) {
    $json = $payload | ConvertTo-Json -Depth 10 -Compress
    $r = Invoke-Api POST "/api/transportation/transport-requests" $json $staffToken
    Assert-Status $r $expected "$label -> $expectedCode"
    if ($r.Body.code -ne $expectedCode) { throw "$label : expected code '$expectedCode' but got '$($r.Body.code)'." }
    $doc = [ordered]@{ case = $label; expectedStatus = $expected; expectedCode = $expectedCode; request = $payload; response = $r.Body }
    [System.IO.File]::WriteAllText((Join-Path $errorsOut $file), (To-PrettyJson $doc), $utf8NoBom)
}

function One-Detail($containerId, $source, $destination) {
    $p = $base | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    $p.details = @([pscustomobject]@{ sequenceNo = 1; containerId = $containerId; sourceEndpointId = $source; destinationEndpointId = $destination })
    return $p
}

Send-Case "01-container-already-requested.json" $base 409 "container_already_requested" "Gui lai dung request vua tao (C1..C3 dang o request active)"
Send-Case "02-container-not-eligible.json" (One-Detail "c4000000-0000-4000-8000-000000000004" $endpointIds["A"] $endpointIds["D"]) 400 "container_not_eligible" "Container C4 dang RESERVED"
Send-Case "03-container-not-found.json" (One-Detail ([guid]::NewGuid().ToString()) $endpointIds["A"] $endpointIds["D"]) 404 "container_not_found" "Container khong ton tai"
Send-Case "04-endpoint-not-found.json" (One-Detail "c5000000-0000-4000-8000-000000000005" $endpointIds["A"] ([guid]::NewGuid().ToString())) 404 "endpoint_not_found" "Destination endpoint khong ton tai"

$dup = $base | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$dup.details[1].sequenceNo = 1
$dup.details[1].containerId = $dup.details[0].containerId
Send-Case "05-duplicate-sequence-and-container.json" $dup 400 "validation_failed" "Trung sequenceNo va trung container trong cung request"

$noDetails = $base | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$noDetails.details = @()
Send-Case "06-no-details.json" $noDetails 400 "validation_failed" "Khong co Detail nao"

$movementInInputs = $base | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$movementInInputs.workflowInputs = [pscustomobject]@{ containerId = "c1000000-0000-4000-8000-000000000001" }
Send-Case "07-movement-key-in-workflow-inputs.json" $movementInInputs 400 "validation_failed" "Dua containerId vao workflowInputs thay vi Details"

# C5 là container STORED chưa thuộc request nào, nên lỗi dừng đúng ở bước kiểm tra Workflow.
$badWorkflow = One-Detail "c5000000-0000-4000-8000-000000000005" $endpointIds["A"] $endpointIds["D"]
$badWorkflow.workflowId = [guid]::NewGuid().ToString()
Send-Case "08-workflow-not-found.json" $badWorkflow 404 "workflow_not_found" "Workflow khong ton tai"

# Sau tất cả ca lỗi, DB vẫn chỉ có đúng 1 request demo (không có dòng rác).
$count = ("SELECT count(*) FROM transportation.transport_requests r JOIN transportation.transport_request_details d ON d.transport_request_id = r.id WHERE d.container_id IN ('c4000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000005');" |
    docker exec -i $PostgresContainer psql -U warotrans -d warotrans -t -A).Trim()
if ($count -ne "0") { throw "Error cases left $count partial rows behind." }
Write-Host "  OK  no partial rows persisted by failed requests"

Write-Host ""
Write-Host "Done. Responses: $out" -ForegroundColor Cyan
