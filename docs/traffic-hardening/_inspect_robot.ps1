$login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$r = Invoke-RestMethod -Uri "http://127.0.0.1:5090/api/fleet/robots/1a9cfd7b-0417-4f65-8271-3ef780bc0cac" -Headers $h
$r | ConvertTo-Json -Depth 6
docker exec warotrans-postgres psql -U warotrans -d warotrans -c "SELECT code, status, is_online, is_enabled, localization_status, navigation_status, map_version_code, pose_x, pose_y FROM fleet.robots WHERE code='RBT-SIM-01';"
