$ErrorActionPreference = "Continue"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$r = Invoke-WebRequest -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h -UseBasicParsing
$r.Content | Set-Content "$outDir\validation-raw.json" -Encoding UTF8
Write-Host "VAL_STATUS=$($r.StatusCode) LEN=$($r.Content.Length)"
Write-Host $r.Content.Substring(0, [Math]::Min(4000, $r.Content.Length))

try {
  $r2 = Invoke-WebRequest -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h -UseBasicParsing
  $r2.Content | Set-Content "$outDir\route-graph.geojson" -Encoding UTF8
  Write-Host "RG_STATUS=$($r2.StatusCode) LEN=$($r2.Content.Length)"
  Write-Host $r2.Content.Substring(0, [Math]::Min(2000, $r2.Content.Length))
} catch {
  Write-Host "RG_FAIL $($_.Exception.Message)"
  $resp = $_.Exception.Response
  if ($resp) {
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $sr.ReadToEnd()
    $body | Set-Content "$outDir\route-graph-error.json" -Encoding UTF8
    Write-Host $body
  }
}
