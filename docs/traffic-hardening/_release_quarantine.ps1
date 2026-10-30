$ErrorActionPreference = "Stop"
$robotId = "1a9cfd7b-0417-4f65-8271-3ef780bc0cac"
$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$body = '{"operatorId":"admin-e2e","resourceIds":null}'
$r = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/fleet/traffic/robots/$robotId/release-after-clearance" -Headers $h -ContentType "application/json" -Body $body
Write-Host ("release ok={0} reason={1}" -f $r.ok, $r.reason)

$rec = '{"poseX":-1.929,"poseY":-0.965,"localizationOk":true,"occupiedEdgeIds":[]}'
$r2 = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/fleet/traffic/robots/$robotId/reconcile" -Headers $h -ContentType "application/json" -Body $rec
Write-Host ("reconcile ok={0} reason={1}" -f $r2.ok, $r2.reason)

docker exec warotrans-postgres psql -U warotrans -d warotrans -c "UPDATE fleet.robots SET status='AVAILABLE', updated_at=now() WHERE id='$robotId';"

$snap = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/fleet/traffic/snapshot" -Headers $h
$me = $snap.robots | Where-Object { $_.robotId -eq $robotId } | Select-Object -First 1
Write-Host ("phase={0} quarantine={1} holds={2}" -f $me.phase, $me.quarantineReason, ($me.occupiedResourceIds -join ','))
$snap | ConvertTo-Json -Depth 6 | Set-Content "E:\programming\my_project\warotrans\docs\simulation\traffic-hardening\e2e-wh42-v001\traffic-after-release.json" -Encoding UTF8
