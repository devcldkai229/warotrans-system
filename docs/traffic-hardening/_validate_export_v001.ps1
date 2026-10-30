$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" `
  -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$val = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/traffic-graph/validation" -Headers $h
$val | ConvertTo-Json -Depth 20 | Set-Content -Path "$outDir\validation.json" -Encoding UTF8
Write-Host "isValid=$($val.isValid) errors=$($val.errors.Count) warnings=$($val.warnings.Count) graphHash=$($val.graphHash)"
if ($val.errors) { $val.errors | ForEach-Object { Write-Host "ERR: $_" } }
if ($val.warnings) { $val.warnings | Select-Object -First 10 | ForEach-Object { Write-Host "WARN: $_" } }

$rg = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:5090/api/navigation/maps/$mapId/route-graph" -Headers $h
$rg | ConvertTo-Json -Depth 30 | Set-Content -Path "$outDir\route-graph.geojson" -Encoding UTF8
$gh = $rg.properties.graphHash
if (-not $gh) { $gh = $rg.graphHash }
Write-Host "routeGraphHash=$gh type=$($rg.type) features=$($rg.features.Count)"

# also copy occupancy from Host data
$src = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\data\maps\42cfe65f-7727-4dd2-a66b-b9b93dc2d549\$mapId"
Copy-Item "$src\map.pgm" "$outDir\map.pgm" -Force
Copy-Item "$src\map.yaml" "$outDir\map.yaml" -Force
Copy-Item "$src\map-preview.png" "$outDir\map-preview.png" -Force

@"
mapId=$mapId
code=MAP-WH42CFE65F-V001
warehouse=WH-42CFE65F
validationIsValid=$($val.isValid)
validationGraphHash=$($val.graphHash)
runtimeRouteGraphHash=$gh
validationErrors=$($val.errors.Count)
validationWarnings=$($val.warnings.Count)
exportedAt=$(Get-Date -Format o)
"@ | Set-Content "$outDir\EXPORT_META.txt" -Encoding UTF8

Write-Host "EXPORT_DIR=$outDir"
if (-not $val.isValid) { exit 2 }
