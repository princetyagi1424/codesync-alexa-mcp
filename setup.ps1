# CodeSync AI — Windows PowerShell Setup & Launch
# Amazon Developer Hackathon 2026 (Alexa+ Track)
# Run from the project root:  .\setup.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "  CodeSync AI — Setup & Launch (Windows)" -ForegroundColor Cyan
Write-Host "  Amazon Developer Hackathon 2026 (Alexa+ Track)" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Download from https://nodejs.org/ (LTS version 18+)" -ForegroundColor Yellow
    exit 1
}

# Backend
Write-Host ""
Write-Host ">> Installing backend dependencies..." -ForegroundColor Yellow
Set-Location "$Root\backend"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created backend\.env from .env.example (add keys for live mode)" -ForegroundColor Gray
}
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "Backend npm install failed" -ForegroundColor Red; exit 1 }
Write-Host "  Backend dependencies ready." -ForegroundColor Green

# Frontend
Write-Host ""
Write-Host ">> Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location "$Root\frontend"
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend npm install failed" -ForegroundColor Red; exit 1 }
Write-Host "  Frontend dependencies ready." -ForegroundColor Green

Write-Host ""
Write-Host ">> Starting servers..." -ForegroundColor Yellow
Write-Host "  Backend  -> http://localhost:5000" -ForegroundColor Cyan
Write-Host "  Frontend -> http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Close the two PowerShell windows to stop the servers." -ForegroundColor Gray
Write-Host ""

# Launch backend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; Write-Host 'CodeSync AI Backend' -ForegroundColor Green; npm run dev"

# Small delay so backend starts first
Start-Sleep -Seconds 2

# Launch frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; Write-Host 'CodeSync AI Frontend' -ForegroundColor Green; npm run dev"

Write-Host "Both servers are launching in separate windows." -ForegroundColor Green
Write-Host "Open http://localhost:5173 in your browser once Vite is ready." -ForegroundColor Cyan
Set-Location $Root
