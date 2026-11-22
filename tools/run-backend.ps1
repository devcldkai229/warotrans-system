<#
.SYNOPSIS
  Starts the whole backend for development: Postgres, MongoDB and Mosquitto (docker compose), the Host (:5090),
  the Evidence Recorder (:5095) and the Evidence Worker (:5096). Optionally the web dev server (:5173).

.DESCRIPTION
  - Infrastructure: docker compose (infrastructure/docker-compose.yml), waits until Postgres and MongoDB are healthy.
  - Builds Host, Recorder and Worker once, then runs them with `dotnet run --no-build` (no parallel build locks).
  - Every process runs hidden; output goes to .logs/<name>.log at the repository root.
  - Re-running the script stops the instances it started before (and any other dotnet run of the same projects).
  - Evidence mode:
      Aws   (default) the Recorder/Worker user secrets: S3, SQS, MediaConvert, CloudFront (terraform envs/dev).
      Local folder + Postgres queue + ffmpeg, no AWS at all (overrides the user secrets with environment variables).
  - Hosts are given as 127.0.0.1: "localhost" resolves to ::1 first on this machine and stalls Postgres/Mosquitto.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1
  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1 -HostProfile RealRobot -Web
  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1 -Evidence Local
  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1 -NoEvidence
  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1 -Stop
#>
[CmdletBinding()]
param(
  # Host launch profile (backend/src/WaroTrans.Host/Properties/launchSettings.json): http, RealRobot, Simulation.
  [string]$HostProfile = "http",
  [ValidateSet("Aws", "Local")]
  [string]$Evidence = "Aws",
  # Host only, no Recorder/Worker.
  [switch]$NoEvidence,
  # Also start the web dev server (npm run dev in web/).
  [switch]$Web,
  # Skip dotnet build (use the last build).
  [switch]$NoBuild,
  # Skip docker compose (infrastructure already running).
  [switch]$NoInfra,
  # Stop everything this script started, then exit. Docker containers keep running.
  [switch]$Stop
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo ".logs"
New-Item -ItemType Directory -Force $logs | Out-Null

$services = @(
  @{ Name = "host";     Project = "backend\src\WaroTrans.Host";                   Match = "WaroTrans.Host";              Port = 5090; Profile = $HostProfile; Evidence = $false },
  @{ Name = "recorder"; Project = "backend\src\WaroTrans.Evidence\Recorder";      Match = "WaroTrans.Evidence.Recorder"; Port = 5095; Profile = "http";       Evidence = $true },
  @{ Name = "worker";   Project = "backend\src\WaroTrans.Evidence\Worker";        Match = "WaroTrans.Evidence.Worker";   Port = 5096; Profile = "http";       Evidence = $true }
)
if ($NoEvidence) { $services = @($services | Where-Object { -not $_.Evidence }) }

function Stop-Matching([string]$match) {
  # Both the `dotnet run` parent and the app it starts (WaroTrans.X.exe / dotnet WaroTrans.X.dll).
  $procs = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.ProcessId -ne $PID -and $_.CommandLine -like "*$match*" -and
    $_.CommandLine -notlike "*run-backend.ps1*" -and $_.Name -notlike "*Code*"
  }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  return @($procs).Count
}

function Stop-Web {
  $count = 0
  $conn = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  foreach ($c in @($conn)) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
    if ($owner -and $owner.CommandLine -like "*vite*") {
      Stop-Process -Id $owner.ProcessId -Force -ErrorAction SilentlyContinue
      $count++
    }
  }
  return $count
}

function Stop-All {
  foreach ($s in $services) {
    $n = Stop-Matching $s.Match
    if ($n -gt 0) { Write-Host ("  stopped {0} ({1} process(es))" -f $s.Name, $n) }
  }
  $n = Stop-Web
  if ($n -gt 0) { Write-Host "  stopped web" }
}

function Wait-Http([string]$url, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -lt 500) { return $true }
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

Write-Host "== Stopping previous instances"
Stop-All
if ($Stop) { Write-Host "Done."; return }

# Ports must be free now; something else listening there would make the new process fail silently.
foreach ($s in $services) {
  if (Get-NetTCPConnection -LocalPort $s.Port -State Listen -ErrorAction SilentlyContinue) {
    $owner = (Get-NetTCPConnection -LocalPort $s.Port -State Listen | Select-Object -First 1).OwningProcess
    throw ("Port {0} ({1}) is still in use by process {2}. Stop it first." -f $s.Port, $s.Name, $owner)
  }
}

if (-not $NoInfra) {
  Write-Host "== Infrastructure (postgres, mongodb, mosquitto)"
  # Another project's container on the same host port (glitch-postgres also publishes 5433, both are
  # unless-stopped: whichever starts first at boot wins and compose then fails with "port is already allocated").
  foreach ($pair in @(@{ Port = 5433; Own = "warotrans-postgres" }, @{ Port = 27018; Own = "warotrans-mongodb" },
                      @{ Port = 1883; Own = "warotrans-mosquitto" })) {
    $holders = @(docker ps --filter "publish=$($pair.Port)" --format "{{.Names}}" 2>$null |
      Where-Object { $_ -and $_ -ne $pair.Own })
    if ($holders.Count -gt 0) {
      throw ("Port {0} is taken by container '{1}' (another project). Free it with:  docker stop {1}" -f `
        $pair.Port, $holders[0])
    }
  }
  docker compose -f (Join-Path $repo "infrastructure\docker-compose.yml") up -d postgres mongodb mosquitto
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed (is Docker Desktop running?)" }
  foreach ($c in @("warotrans-postgres", "warotrans-mongodb")) {
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
      $state = docker inspect -f "{{.State.Health.Status}}" $c 2>$null
      if ($state -eq "healthy") { $ok = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $ok) { throw "$c is not healthy after 2 minutes" }
    # 2026-11-20: after a "port is already allocated" start, Docker restarted the container healthy but with NO host
    # port (Ports "5432/tcp"): the Host then cannot connect. Only re-creating the container restores the binding.
    if (-not (docker port $c 2>$null)) {
      throw ("$c is running without its host port. Re-create it (the data volume is kept):  " +
        "docker compose -f infrastructure\docker-compose.yml up -d --force-recreate $($c -replace '^warotrans-','')")
    }
    Write-Host "  $c healthy"
  }
}

if (-not $NoBuild) {
  Write-Host "== Build"
  foreach ($s in $services) {
    dotnet build (Join-Path $repo $s.Project) -nologo -v q -clp:ErrorsOnly
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $($s.Project)" }
  }
}

# Environment shared by the started processes (inherited by Start-Process).
$env:Mqtt__Host = "127.0.0.1"
$env:ConnectionStrings__PostgreSQL = "Host=127.0.0.1;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans"
$env:ConnectionStrings__MongoDB = "mongodb://warotrans:warotrans@127.0.0.1:27018/?authSource=admin"
$env:ConnectionStrings__Evidence = "Host=127.0.0.1;Port=5433;Database=warotrans_evidence;Username=warotrans;Password=warotrans"
if ($Evidence -eq "Local") {
  # Environment variables override the user secrets (the AWS settings) without touching them.
  $env:Evidence__Storage__Provider = "Local"
  $env:Evidence__Queues__Provider = "Local"
  $env:Evidence__Playback__Provider = "Local"
  $env:Evidence__Media__Provider = "Local"
  # The access key stays configured but unused: no AWS client is created with every provider Local.
}

Write-Host "== Start"
foreach ($s in $services) {
  $log = Join-Path $logs "$($s.Name).log"
  $err = Join-Path $logs "$($s.Name).err.log"
  $proc = Start-Process -FilePath "dotnet" -PassThru -WindowStyle Hidden `
    -WorkingDirectory (Join-Path $repo $s.Project) `
    -RedirectStandardOutput $log -RedirectStandardError $err `
    -ArgumentList @("run", "--no-build", "--project", (Join-Path $repo $s.Project), "--launch-profile", $s.Profile)
  $s.Pid = $proc.Id
  Write-Host ("  {0,-8} pid {1,-6} -> .logs\{0}.log" -f $s.Name, $proc.Id)
}

if ($Web) {
  $log = Join-Path $logs "web.log"
  $err = Join-Path $logs "web.err.log"
  Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -WorkingDirectory (Join-Path $repo "web") `
    -RedirectStandardOutput $log -RedirectStandardError $err -ArgumentList @("/c", "npm run dev") | Out-Null
  Write-Host "  web      -> .logs\web.log"
}

Write-Host "== Health"
$failed = @()
foreach ($s in $services) {
  if (Wait-Http "http://127.0.0.1:$($s.Port)/health" 120) {
    Write-Host ("  {0,-8} OK   http://localhost:{1}" -f $s.Name, $s.Port)
  } else {
    Write-Host ("  {0,-8} FAIL (see .logs\{0}.log and .logs\{0}.err.log)" -f $s.Name) -ForegroundColor Red
    $failed += $s.Name
  }
}
if ($Web) {
  if (Wait-Http "http://127.0.0.1:5173/" 60) { Write-Host "  web      OK   http://localhost:5173" }
  else { Write-Host "  web      FAIL (see .logs\web.log)" -ForegroundColor Red; $failed += "web" }
}

Write-Host ""
Write-Host ("Host profile: {0}   Evidence: {1}" -f $HostProfile, $(if ($NoEvidence) { "off" } else { $Evidence }))
Write-Host "Logs:  Get-Content -Wait .logs\host.log"
Write-Host "Stop:  powershell -ExecutionPolicy Bypass -File tools/run-backend.ps1 -Stop"
if ($failed.Count -gt 0) { exit 1 }
