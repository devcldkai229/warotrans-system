$ErrorActionPreference = "Stop"
$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$jobId = "a3b2bce1-eae0-417e-bc3a-15097e16cfb7"
$job = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/workflow-execution/jobs/$jobId" -Headers $h
$out = "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001"
$job | ConvertTo-Json -Depth 20 | Set-Content "$out\job-failed-inspect.json" -Encoding UTF8
foreach ($t in $job.tasks) {
  foreach ($s in $t.steps) {
    Write-Host ("[{0}] {1} type={2} status={3} err={4} op={5}" -f $s.sequenceNo, $s.stepKey, $s.stepType, $s.status, $s.errorCode, $s.operationCode)
    if ($s.errorMessage) { Write-Host "   msg=$($s.errorMessage)" }
    if ($s.resultPayload) { Write-Host "   result=$($s.resultPayload | ConvertTo-Json -Compress)" }
  }
}
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "SELECT id, type, status, outcome, error_code, reject_reason_code, issued_at FROM fleet.robot_commands WHERE job_step_id IN (SELECT id FROM execution.job_steps WHERE job_id='$jobId') ORDER BY issued_at;"
