<#
"""
Launch local backend and frontend dev servers with stable self/test port pairs.
Supports dry-run mode to print commands without starting new processes.
"""
#>

param(
    [ValidateSet("self", "test")]
    [string]$Mode = "self",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    <#
    """
    Resolve the repository root from this script location.
    """
    #>

    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-LaunchConfig {
    <#
    """
    Return frontend/backend command settings for the selected launch mode.
    """
    #>

    param(
        [Parameter(Mandatory = $true)]
        [string]$SelectedMode
    )

    if ($SelectedMode -eq "test") {
        return @{
            BackendPort = "8001"
            CorsOrigins = "http://127.0.0.1:5174,http://localhost:5174"
            FrontendCommand = "pnpm --dir frontend dev:test"
            FrontendUrl = "http://127.0.0.1:5174"
            BackendUrl = "http://127.0.0.1:8001/healthz"
        }
    }

    return @{
        BackendPort = "8000"
        CorsOrigins = "http://127.0.0.1:5173,http://localhost:5173"
        FrontendCommand = "pnpm --dir frontend dev:self"
        FrontendUrl = "http://127.0.0.1:5173"
        BackendUrl = "http://127.0.0.1:8000/healthz"
    }
}

function New-BackendScript {
    <#
    """
    Write backend launch commands to a temp .ps1 file using a here-string,
    avoiding quote-escaping issues with array construction.
    """
    #>

    param(
        [string]$Mode,
        [string]$RepoRoot,
        [string]$Port,
        [string]$CorsOrigins
    )

    $tmpFile = [System.IO.Path]::GetTempFileName() + ".ps1"
    Set-Content -Path $tmpFile -Encoding UTF8 -Value @"
`$Host.UI.RawUI.WindowTitle = 'backend-$Mode'
Set-Location '$RepoRoot'
`$env:PORT = '$Port'
`$env:CORS_ALLOW_ORIGINS = '$CorsOrigins'
uv run invoice-web-api
"@
    return $tmpFile
}

function New-FrontendScript {
    <#
    """
    Write frontend launch commands to a temp .ps1 file using a here-string.
    """
    #>

    param(
        [string]$Mode,
        [string]$RepoRoot,
        [string]$Command
    )

    $tmpFile = [System.IO.Path]::GetTempFileName() + ".ps1"
    Set-Content -Path $tmpFile -Encoding UTF8 -Value @"
`$Host.UI.RawUI.WindowTitle = 'frontend-$Mode'
Set-Location '$RepoRoot'
$Command
"@
    return $tmpFile
}

$repoRoot = Get-RepoRoot
$config = Get-LaunchConfig -SelectedMode $Mode

$backendScript = New-BackendScript -Mode $Mode -RepoRoot $repoRoot -Port $config.BackendPort -CorsOrigins $config.CorsOrigins
$frontendScript = New-FrontendScript -Mode $Mode -RepoRoot $repoRoot -Command $config.FrontendCommand

Write-Output ("Mode: " + $Mode)
Write-Output ("Repo: " + $repoRoot)
Write-Output ("Backend: PORT=" + $config.BackendPort + " CORS_ALLOW_ORIGINS=" + $config.CorsOrigins)
Write-Output ("Backend health: " + $config.BackendUrl)
Write-Output ("Frontend url: " + $config.FrontendUrl)
Write-Output ("Backend command: PORT=" + $config.BackendPort + " | uv run invoice-web-api")
Write-Output ("Frontend command: " + $config.FrontendCommand)

if ($DryRun) {
    Write-Output "Dry-run only. No processes started."
    exit 0
}

Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $backendScript | Out-Null
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $frontendScript | Out-Null

Write-Output "Launched backend and frontend in separate PowerShell windows."
