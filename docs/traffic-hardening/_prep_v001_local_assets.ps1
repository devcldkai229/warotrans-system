$ErrorActionPreference = "Stop"
$wh = "42cfe65f-7727-4dd2-a66b-b9b93dc2d549"
$map = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$base = "https://warotrans-ob-storage.s3.ap-southeast-1.amazonaws.com/maps/$wh/$map"
$dir = "E:\programming\my_project\warotrans-system\backend\src\WaroTrans.Host\data\maps\$wh\$map"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in @("map.pgm","map.yaml","map-preview.png")) {
  $out = Join-Path $dir $f
  Write-Host "GET $base/$f"
  Invoke-WebRequest -Uri "$base/$f" -OutFile $out -UseBasicParsing
  Write-Host "  -> $out ($((Get-Item $out).Length) bytes)"
}
$localPgm = "/map-assets/$wh/$map/map.pgm"
$localYaml = "/map-assets/$wh/$map/map.yaml"
$localPrev = "/map-assets/$wh/$map/map-preview.png"
$sql = @"
UPDATE navigation.map_versions
SET map_uri = '$localPgm',
    map_yaml_uri = '$localYaml',
    preview_image_uri = '$localPrev'
WHERE id = '$map';
SELECT code, map_uri, map_yaml_uri FROM navigation.map_versions WHERE id = '$map';
"@
$sql | docker exec -i warotrans-postgres psql -U warotrans -d warotrans -v ON_ERROR_STOP=1
Write-Host "DONE"
