# ============================================================================
# Local Development Startup Script
# ============================================================================

Write-Host "`n╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  MahaRERA Dashboard - Local Setup                    ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check Node.js
Write-Host "📦 Checking Node.js..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found! Please install Node.js 18+ first." -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "✅ Node.js $nodeVersion found" -ForegroundColor Green

# Install backend dependencies
Write-Host "`n📦 Installing backend dependencies..." -ForegroundColor Yellow
npm install --save better-sqlite3 cors dotenv express 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Check if frontend is built
$frontendDist = "frontend\dist\index.html"
if (!(Test-Path $frontendDist)) {
    Write-Host "`n🏗️  Building frontend..." -ForegroundColor Yellow
    Push-Location frontend
    npm install 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Pop-Location
    
    if (Test-Path $frontendDist) {
        Write-Host "✅ Frontend built successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Frontend build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n✅ Frontend already built" -ForegroundColor Green
}

# Check CSV files
Write-Host "`n📊 Checking data files..." -ForegroundColor Yellow
$csvFiles = @("data\links.csv", "data\basic_data.csv", "data\scrape_data.csv")
$foundFiles = 0
foreach ($file in $csvFiles) {
    if (Test-Path $file) {
        $lines = (Get-Content $file | Measure-Object -Line).Lines
        Write-Host "   ✅ $file ($($lines-1) rows)" -ForegroundColor Green
        $foundFiles++
    } else {
        Write-Host "   ⚠️  $file (not found)" -ForegroundColor Yellow
    }
}

if ($foundFiles -eq 0) {
    Write-Host "`n⚠️  No CSV files found in data folder!" -ForegroundColor Yellow
    Write-Host "   The database will be empty. Add CSV files to import data." -ForegroundColor Yellow
}

# Clean old database
if (Test-Path "data\local_database.db") {
    Write-Host "`n🗑️  Found existing database. Remove it to reimport CSV data? (y/N)" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -eq 'y' -or $response -eq 'Y') {
        Remove-Item "data\local_database.db"
        Write-Host "✅ Old database removed" -ForegroundColor Green
    }
}

# Start server
Write-Host "`n🚀 Starting local server...`n" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Gray

node server-local.js
