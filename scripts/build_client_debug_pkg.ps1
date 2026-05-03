<#
.SYNOPSIS
    Build client debug package by selectively copying project files.

.DESCRIPTION
    Creates a standalone, customer-ready deployment package with:
    - All necessary source code and runtime configuration
    - Frontend source and lockfile; dependencies are installed during Docker build
    - Excluded: git metadata, internal docs, caches, .env files with secrets

    Uses git to determine which files to include for accuracy.

.EXAMPLE
    .\scripts\build_client_debug_pkg.ps1

    Creates: _pkg/bills_analysis_client_DEBUG_<timestamp>
#>

param(
    [string]$OutputName = "bills_analysis_client_DEBUG",
    [switch]$Verbose
)

# ===== CONFIGURATION =====
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$pkgDir = "_pkg"
$outputDir = Join-Path $pkgDir "${OutputName}_${timestamp}"

# Files and directories to include (whitelist)
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
    'config/app_config.json'
    'requirments_engineering.md'
    '用户使用说明.md'
)

$whitelistedDirs = @(
    'cli'
    'frontend'
    'src'
    'scripts'
)

# Patterns to exclude (these are matched against relative paths)
$excludedPatterns = @(
    '^\.git'
    '^\.claude'
    '^\.agents'
    '^\.venv'
    '^venv'
    '^env'
    '^__pycache__'
    '^\.pytest_cache'
    '\.pyc$'
    '\.pyo$'
    '^\.env$'
    '^\.env\.'
    '^frontend/node_modules'
    'node_modules/\.bin'
    '^dataset'
    '^outputs'
    '^plans'
    '^docs'
    '^\.github'
    '^\.gitignore'
    '\.egg-info$'
    '^_pkg'
)

# Critical files that must exist (for validation and recovery)
$criticalFiles = @(
    'frontend/src/config/env.js'
    'frontend/package.json'
    'frontend/pnpm-lock.yaml'
    'frontend/vite.config.js'
    'frontend/postcss.config.js'
    'frontend/tailwind.config.js'
    'frontend/index.html'
    'src/bills_analysis/api/main.py'
    'src/bills_analysis/cli.py'
    'config/app_config.json'
)

# ===== HELPER FUNCTIONS =====

function Write-Verbose-Log {
    param([string]$Message)
    if ($Verbose) {
        Write-Host "  [DEBUG] $Message" -ForegroundColor Gray
    }
}

function Should-Exclude {
    param(
        [string]$RelativePath
    )

    $normalized = $RelativePath -replace '\\', '/'

    foreach ($pattern in $excludedPatterns) {
        # Use regex matching for more reliable pattern matching
        if ($normalized -match $pattern) {
            Write-Verbose-Log "Excluded: $RelativePath (matched pattern: $pattern)"
            return $true
        }
    }

    return $false
}

function Copy-DirectoryWithFilter {
    param(
        [string]$SourceDir,
        [string]$DestDir,
        [string]$DirName
    )

    $copiedCount = 0
    $skippedCount = 0

    $items = Get-ChildItem -Path $SourceDir -Recurse -Force -ErrorAction SilentlyContinue

    foreach ($item in $items) {
        # Calculate relative path from source directory
        $relPath = $item.FullName.Substring($SourceDir.Length).TrimStart('\', '/')
        $relativePath = if ($DirName) { "$DirName/$relPath" } else { $relPath }

        if (Should-Exclude $relativePath) {
            $skippedCount++
            continue
        }

        $destPath = Join-Path $DestDir $DirName $relPath
        $destParent = Split-Path $destPath

        if ($item.PSIsContainer) {
            # Create directory if it doesn't exist
            if (-not (Test-Path $destParent)) {
                New-Item -ItemType Directory -Path $destParent -Force -ErrorAction SilentlyContinue | Out-Null
            }
        } else {
            # Create parent directory and copy file
            if (-not (Test-Path $destParent)) {
                New-Item -ItemType Directory -Path $destParent -Force -ErrorAction SilentlyContinue | Out-Null
            }

            Copy-Item -Path $item.FullName -Destination $destPath -Force -ErrorAction SilentlyContinue
            $copiedCount++
        }
    }

    return @{
        copied  = $copiedCount
        skipped = $skippedCount
    }
}

function Validate-CriticalFiles {
    param([string]$BasePath)

    Write-Host "`n[Validation] Checking critical files..." -ForegroundColor Cyan

    $missing = @()
    foreach ($file in $criticalFiles) {
        $fullPath = Join-Path $BasePath $file
        if (Test-Path $fullPath) {
            Write-Host "  ✓ $file" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $file (MISSING)" -ForegroundColor Red
            $missing += $file
        }
    }

    if ($missing.Count -gt 0) {
        Write-Host "`n⚠ WARNING: Missing $($missing.Count) critical files:" -ForegroundColor Yellow
        foreach ($file in $missing) {
            Write-Host "  - $file" -ForegroundColor Yellow
        }
        Write-Host "`nAttempting to copy missing files from source..." -ForegroundColor Yellow

        foreach ($file in $missing) {
            $src = Join-Path (Get-Location) $file
            if (Test-Path $src) {
                $dest = Join-Path $BasePath $file
                $destDir = Split-Path $dest
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item -Path $src -Destination $dest -Force
                Write-Host "  ✓ Recovered: $file" -ForegroundColor Green
            }
        }
    }

    return $missing.Count -eq 0
}

# ===== MAIN EXECUTION =====

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Client Debug Package Builder                                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Setup
Write-Host "`nSetup:" -ForegroundColor Cyan
Write-Host "  Timestamp: $timestamp"
Write-Host "  Output: $outputDir"

if (-not (Test-Path $pkgDir)) {
    New-Item -ItemType Directory -Path $pkgDir -Force | Out-Null
}

if (Test-Path $outputDir) {
    Remove-Item -Recurse -Force $outputDir
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Write-Host "  ✓ Output directory created" -ForegroundColor Green

# Copy root files
Write-Host "`n[1/3] Copying configuration and documentation files..." -ForegroundColor Cyan

# Get all files in current directory and filter by whitelist
$allRootFiles = Get-ChildItem -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -in $whitelistedFiles }
$filesAdded = 0

foreach ($file in $allRootFiles) {
    Copy-Item -Path $file.FullName -Destination $outputDir -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ $($file.Name)" -ForegroundColor Green
    $filesAdded++
}

# Also try to copy by name for files we explicitly listed (in case of encoding issues)
foreach ($fileName in $whitelistedFiles) {
    $src = Join-Path (Get-Location) $fileName
    if ((Test-Path $src) -and -not ($allRootFiles.Name -contains $fileName)) {
        $dest = Join-Path $outputDir $fileName
        $destDir = Split-Path $dest
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $src -Destination $dest -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ $fileName (recovered)" -ForegroundColor Green
        $filesAdded++
    }
}

Write-Host "  → $filesAdded files copied"

# Copy directories with filtering
Write-Host "`n[2/3] Copying source code and dependencies..." -ForegroundColor Cyan
$totalCopied = 0
$totalSkipped = 0

foreach ($dir in $whitelistedDirs) {
    $src = Join-Path (Get-Location) $dir
    if (-not (Test-Path $src)) {
        Write-Host "  ✗ $dir (directory not found)" -ForegroundColor Yellow
        continue
    }

    Write-Host "  → $dir" -ForegroundColor Blue
    $result = Copy-DirectoryWithFilter -SourceDir $src -DestDir $outputDir -DirName $dir

    Write-Host "    ✓ $($result.copied) files copied" -ForegroundColor Green
    if ($result.skipped -gt 0) {
        Write-Host "    ○ $($result.skipped) items excluded" -ForegroundColor Gray
    }

    $totalCopied += $result.copied
    $totalSkipped += $result.skipped
}
Write-Host "  Total: $totalCopied files, $totalSkipped excluded"

# Validate critical files
Write-Host "`n[3/3] Verifying package integrity..." -ForegroundColor Cyan
$isValid = Validate-CriticalFiles -BasePath $outputDir

# Calculate statistics
$allFiles = Get-ChildItem -Path $outputDir -Recurse -File
$allDirs = Get-ChildItem -Path $outputDir -Recurse -Directory
$totalSize = [math]::Round(($allFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 2)

Write-Host "`n[Summary]" -ForegroundColor Cyan
Write-Host "  Files: $($allFiles.Count)"
Write-Host "  Directories: $($allDirs.Count)"
Write-Host "  Size: $totalSize MB"
Write-Host "  Status: $(if ($isValid) { '✓ Valid' } else { '⚠ Has issues (see above)' })" -ForegroundColor $(if ($isValid) { 'Green' } else { 'Yellow' })

if ($isValid) {
    Write-Host "`n✓ Package ready for deployment!" -ForegroundColor Green
    Write-Host "Location: $outputDir" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Package has issues but may still work. Review warnings above." -ForegroundColor Yellow
}

Write-Host "`nNext steps:" -ForegroundColor Gray
Write-Host "  1. Test: cd $outputDir && docker compose up --build -d" -ForegroundColor Gray
Write-Host "  2. Verify: http://localhost:8002" -ForegroundColor Gray
Write-Host "  3. Package: Compress-Archive -Path `"$outputDir`" -DestinationPath `"$outputDir.zip`"" -ForegroundColor Gray
