@echo off
REM CodeSync AI — Windows CMD Setup & Launch
REM Double-click this file or run: setup.bat

echo ===========================================================
echo   CodeSync AI — Setup and Launch (Windows)
echo   Amazon Developer Hackathon 2026 (Alexa+ Track)
echo ===========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download from https://nodejs.org/  (LTS version 18+)
    pause
    exit /b 1
)

echo Node.js found:
node -v
echo.

cd /d "%~dp0backend"
if not exist .env (
    copy .env.example .env >nul
    echo Created backend\.env from .env.example
)
echo Installing backend dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Backend npm install failed
    pause
    exit /b 1
)
echo Backend ready.
echo.

cd /d "%~dp0frontend"
echo Installing frontend dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Frontend npm install failed
    pause
    exit /b 1
)
echo Frontend ready.
echo.

echo Starting servers in separate windows...
echo   Backend  -^> http://localhost:5000
echo   Frontend -^> http://localhost:5173
echo.

start "CodeSync AI Backend" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 2 /nobreak >nul
start "CodeSync AI Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are launching.
echo Open http://localhost:5173 in your browser once Vite is ready.
echo Close the two server windows to stop.
pause
