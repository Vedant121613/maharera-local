# Quick Fix and Restart Script
Write-Host "`n🔧 Fixing and restarting local server...`n" -ForegroundColor Cyan

# Check if server is running on port 5000
$portInUse = netstat -ano | Select-String ":5000" | Select-String "LISTENING"
if ($portInUse) {
    Write-Host "🛑 Stopping existing server on port 5000..." -ForegroundColor Yellow
    $processId = ($portInUse -split '\s+')[-1]
    taskkill /PID $processId /F 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "✅ Server stopped" -ForegroundColor Green
}

Write-Host "`n🚀 Starting server with fixes...`n" -ForegroundColor Yellow
node server-local.js
