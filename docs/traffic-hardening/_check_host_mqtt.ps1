$ErrorActionPreference = "Continue"
try {
  $login = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5090/api/identity/login" -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}'
  Write-Host "HOST_OK token_len=$($login.accessToken.Length)"
} catch {
  Write-Host "HOST_FAIL $($_.Exception.Message)"
}
docker ps --format "{{.Names}} {{.Status}}"
