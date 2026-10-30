$ErrorActionPreference = "Stop"
$mapId = "f663f14f-3a28-4d14-aa4b-19d9e11bad69"
$outDir = "E:\programming\my_project\warotrans-system\samples\maps\MAP-WH42CFE65F-V001"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

docker exec warotrans-postgres psql -U warotrans -d warotrans -c @"
COPY (
  SELECT code, endpoint_type, round(x::numeric,3) AS x, round(y::numeric,3) AS y, round(yaw::numeric,3) AS yaw, is_enabled, name
  FROM navigation.endpoints WHERE map_version_id = '$mapId' ORDER BY code
) TO STDOUT WITH CSV HEADER
"@ | Set-Content "$outDir\endpoints.csv" -Encoding UTF8

docker exec warotrans-postgres psql -U warotrans -d warotrans -c @"
COPY (
  SELECT e.code, e.direction, e.is_active, e.width_meters,
         round((e.geometry->'coordinates'->0->>0)::numeric,3) AS x0,
         round((e.geometry->'coordinates'->0->>1)::numeric,3) AS y0,
         round((e.geometry->'coordinates'->-1->>0)::numeric,3) AS x1,
         round((e.geometry->'coordinates'->-1->>1)::numeric,3) AS y1,
         jsonb_array_length(e.geometry->'coordinates') AS npts
  FROM navigation.edges e
  WHERE e.map_version_id = '$mapId'
  ORDER BY e.code
) TO STDOUT WITH CSV HEADER
"@ | Set-Content "$outDir\edges.csv" -Encoding UTF8

docker exec warotrans-postgres psql -U warotrans -d warotrans -c @"
COPY (
  SELECT code, zone_type, is_active, capacity, geometry::text
  FROM navigation.zones WHERE map_version_id = '$mapId' ORDER BY code
) TO STDOUT WITH CSV HEADER
"@ | Set-Content "$outDir\zones.csv" -Encoding UTF8

Write-Host "=== ENDPOINTS ==="
Get-Content "$outDir\endpoints.csv"
Write-Host "`n=== EDGES ==="
Get-Content "$outDir\edges.csv"
Write-Host "`n=== ZONES (codes/types) ==="
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "SELECT code, zone_type, is_active FROM navigation.zones WHERE map_version_id = '$mapId' ORDER BY code;"
