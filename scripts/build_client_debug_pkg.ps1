<#
.SYNOPSIS
    Build client debug package by copying whitelisted files from the project.

.DESCRIPTION
    Creates a standalone package ready for customer deployment.
    Simply unzip and run - no dependencies setup needed.

.EXAMPLE
    .\scripts\build_client_debug_pkg.ps1

    Creates: _pkg/bills_analysis_client_DEBUG_<timestamp>
#>

param(
    [string]$OutputName = "bills_analysis_client_DEBUG"
)

# ===== WHITELIST DEFINITION =====
$whitelistedFiles = @(
    'AGENTS.md'
    'CLAUDE.md'
    'README.md'
    'DOCKER.md'
    'pyproject.toml'
    'uv.lock'
    'Dockerfile'
    'docker-compose.yml'
    '.env.docker.example'
    'requirments_engineering.md'
    '用户使用说明.md'
)

$whitelistedDirs = @(
    'cli'
    'frontend'
    'src'
    'tests'
    'scripts'
)

# ===== EXCLUDED PATTERNS =====
$excludedPatterns = @(
    '.git'
    '.claude'
    '.agents'
    '.venv'
    'venv'
    'env'
    '__pycache__'
    '.pytest_cache'
    '*.pyc'
    '*.pyo'
    '.env'
    'node_modules/.bin'
    'dataset'
    'outputs'
    'plans'
    'docs'
    '.github'
    '.gitignore'
)

# ===== SETUP =====
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$pkgDir = "_pkg"
$outputDir = Join-Path $pkgDir "${OutputName}_${timestamp}"

# Ensure output directory exists
if (-not (Test-Path $pkgDir)) {
    New-Item -ItemType Directory -Path $pkgDir -Force | Out-Null
    Write-Host "Created _pkg directory" -ForegroundColor Green
}

if (Test-Path $outputDir) {
    Remove-Item -Recurse -Force $outputDir
    Write-Host "Cleaned existing output directory" -ForegroundColor Yellow
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Write-Host "Output directory: $outputDir" -ForegroundColor Cyan

# ===== HELPER FUNCTION =====
function Should-Exclude {
    param([string]$Path)

    foreach ($pattern in $excludedPatterns) {
        if ($Path -like "*$pattern*" -or $Path -match [regex]::Escape($pattern)) {
            return $true
        }
    }
    return $false
}

# ===== COPY FILES =====
Write-Host "`n[1/3] Copying whitelisted files..." -ForegroundColor Cyan
foreach ($file in $whitelistedFiles) {
    $src = Join-Path (Get-Location) $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $outputDir -Force
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (not found)" -ForegroundColor Yellow
    }
}

# ===== COPY DIRECTORIES =====
Write-Host "`n[2/3] Copying whitelisted directories..." -ForegroundColor Cyan
foreach ($dir in $whitelistedDirs) {
    $src = Join-Path (Get-Location) $dir
    if (Test-Path $src) {
        Write-Host "  → $dir" -ForegroundColor Blue

        # Recursively copy with exclusion filter
        $items = Get-ChildItem -Path $src -Recurse -Force
        $itemCount = 0

        foreach ($item in $items) {
            $relPath = $item.FullName.Substring($src.Length).TrimStart('\')

            if (Should-Exclude $relPath) {
                continue
            }

            $destPath = Join-Path $outputDir $dir $relPath
            $destParent = Split-Path $destPath

            if ($item.PSIsContainer) {
                if (-not (Test-Path $destParent)) {
                    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
                }
            } else {
                if (-not (Test-Path $destParent)) {
                    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
                }
                Copy-Item -Path $item.FullName -Destination $destPath -Force
                $itemCount++
            }
        }

        Write-Host "    ✓ $itemCount files copied" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $dir (directory not found)" -ForegroundColor Yellow
    }
}

# ===== VERIFICATION =====
Write-Host "`n[3/3] Verifying package..." -ForegroundColor Cyan

$stats = @{
    files = (Get-ChildItem -Path $outputDir -Recurse -File | Measure-Object).Count
    dirs = (Get-ChildItem -Path $outputDir -Recurse -Directory | Measure-Object).Count
    size = "{0:N2}" -f ((Get-ChildItem -Path $outputDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB) + " MB"
}

Write-Host "  Files: $($stats.files)" -ForegroundColor Green
Write-Host "  Directories: $($stats.dirs)" -ForegroundColor Green
Write-Host "  Size: $($stats.size)" -ForegroundColor Green

# ===== SUMMARY =====
Write-Host "`n✓ Package ready!" -ForegroundColor Green
Write-Host "Location: $outputDir" -ForegroundColor Cyan
Write-Host "Next step: zip this directory and distribute to customer" -ForegroundColor Yellow
Write-Host "`nZip command (PowerShell):" -ForegroundColor Gray
Write-Host "  Compress-Archive -Path `"$outputDir`" -DestinationPath `"$outputDir.zip`" -Force" -ForegroundColor Gray
