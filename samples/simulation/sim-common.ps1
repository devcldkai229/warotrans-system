# Helper dùng chung cho các script simulation (dot-source: . "$PSScriptRoot/sim-common.ps1").
# Tương thích Windows PowerShell 5.1.

$ErrorActionPreference = "Stop"
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:SimDir = $PSScriptRoot
$script:SimOut = Join-Path $PSScriptRoot "responses"
New-Item -ItemType Directory -Force -Path $script:SimOut | Out-Null

function Read-Text([string]$path) { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }

function Save-Text([string]$name, [string]$text) {
    [System.IO.File]::WriteAllText((Join-Path $script:SimOut $name), $text, $script:Utf8NoBom)
}

# Pretty-print JSON (ConvertTo-Json của PowerShell 5.1 thụt lề rất xấu).
function Format-Json([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    $sb = New-Object System.Text.StringBuilder
    $indent = 0; $inString = $false; $escaped = $false
    $chars = $raw.Trim().ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $c = $chars[$i]
        if ($inString) {
            [void]$sb.Append($c)
            if ($escaped) { $escaped = $false } elseif ($c -eq '\') { $escaped = $true } elseif ($c -eq '"') { $inString = $false }
            continue
        }
        switch ($c) {
            '"' { $inString = $true; [void]$sb.Append($c) }
            { $_ -eq '{' -or $_ -eq '[' } {
                $close = if ($c -eq '{') { '}' } else { ']' }
                $j = $i + 1
                while ($j -lt $chars.Length -and [char]::IsWhiteSpace($chars[$j])) { $j++ }
                if ($j -lt $chars.Length -and $chars[$j] -eq $close) { [void]$sb.Append("$c$close"); $i = $j }
                else { $indent++; [void]$sb.Append($c).Append("`n").Append('  ' * $indent) }
            }
            { $_ -eq '}' -or $_ -eq ']' } { $indent--; [void]$sb.Append("`n").Append('  ' * $indent).Append($c) }
            ',' { [void]$sb.Append(",`n").Append('  ' * $indent) }
            ':' { [void]$sb.Append(': ') }
            default { if (-not [char]::IsWhiteSpace($c)) { [void]$sb.Append($c) } }
        }
    }
    $sb.ToString() + "`n"
}

# Gọi API; trả về @{ Status; Body; Raw } kể cả khi lỗi 4xx.
function Invoke-Api([string]$method, [string]$path, [string]$body = $null, [string]$token = $null) {
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $params = @{ Uri = "$script:BaseUrl$path"; Method = $method; Headers = $headers; UseBasicParsing = $true }
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
        $raw = (New-Object System.IO.StreamReader($r.GetResponseStream(), [System.Text.Encoding]::UTF8)).ReadToEnd()
    }
    $obj = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) { $obj = $raw | ConvertFrom-Json }
    return @{ Status = $status; Body = $obj; Raw = $raw }
}

function Assert-Status($result, [int[]]$expected, [string]$step) {
    if ($expected -notcontains $result.Status) {
        throw "$step : expected HTTP $($expected -join '/') but got $($result.Status). Body: $($result.Raw)"
    }
    Write-Host ("  OK  {0} -> HTTP {1}" -f $step, $result.Status) -ForegroundColor Green
}

function Get-AdminToken {
    $login = Invoke-Api POST "/api/identity/login" '{"username":"admin","password":"Admin@123"}'
    Assert-Status $login 200 "login admin"
    return $login.Body.accessToken
}

function Invoke-Psql([string]$sql, [string]$container = "warotrans-postgres") {
    $OutputEncoding = $script:Utf8NoBom
    ($sql | docker exec -i $container psql -U warotrans -d warotrans -v ON_ERROR_STOP=1 -q -t -A) -join "`n"
}
