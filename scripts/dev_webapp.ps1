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

function New-PowerShellCommand {
    <#
    """
    Build a PowerShell command string that keeps the launched window open.
    """
    #>

    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string[]]$Lines
    )

    $escapedRepoRoot = $RepoRoot.Replace("'", "''")
    $commandLines = @(
        '$Host.UI.RawUI.WindowTitle = ''' + $Title.Replace("'", "''") + '''',
        'Set-Location ''' + $escapedRepoRoot + ''''
    ) + $Lines
    return ($commandLines -join "; ")
}

$repoRoot = Get-RepoRoot
$config = Get-LaunchConfig -SelectedMode $Mode

$backendLines = @(
    '$env:PORT=''' + $config.BackendPort + '''',
    '$env:CORS_ALLOW_ORIGINS=''' + $config.CorsOrigins + '''',
    'uv run invoice-web-api'
)
$backendCommand = New-PowerShellCommand -Title ("backend-" + $Mode) -RepoRoot $repoRoot -Lines $backendLines
$frontendCommand = New-PowerShellCommand -Title ("frontend-" + $Mode) -RepoRoot $repoRoot -Lines @($config.FrontendCommand)

Write-Output ("Mode: " + $Mode)
Write-Output ("Repo: " + $repoRoot)
Write-Output ("Backend: PORT=" + $config.BackendPort + " CORS_ALLOW_ORIGINS=" + $config.CorsOrigins)
Write-Output ("Backend health: " + $config.BackendUrl)
Write-Output ("Frontend url: " + $config.FrontendUrl)
Write-Output ("Backend command: " + ($backendLines -join " ; "))
Write-Output ("Frontend command: " + $config.FrontendCommand)

if ($DryRun) {
    Write-Output "Dry-run only. No processes started."
    exit 0
}

Start-Process -FilePath "powershell" -WorkingDirectory $repoRoot -ArgumentList @("-NoExit", "-Command", $backendCommand) | Out-Null
Start-Process -FilePath "powershell" -WorkingDirectory $repoRoot -ArgumentList @("-NoExit", "-Command", $frontendCommand) | Out-Null

Write-Output "Launched backend and frontend in separate PowerShell windows."
