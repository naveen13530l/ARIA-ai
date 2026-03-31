@echo off
title ARIA - AI Assistant
color 0D
cls

echo.
echo  ================================================
echo   ARIA - AI File ^& Task Assistant
echo  ================================================
echo.

:: Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please download and install it from:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  [1/4] Node.js found...

:: Install frontend dependencies if needed
if not exist "node_modules" (
    echo  [2/4] Installing frontend packages... (first time only)
    npm install
) else (
    echo  [2/4] Frontend packages ready...
)

:: Install server dependencies if needed
if not exist "server\node_modules" (
    echo  [3/4] Installing server packages... (first time only)
    cd server
    npm install
    cd ..
) else (
    echo  [3/4] Server packages ready...
)

:: Check if API key is set
if not exist "server\.env" (
    color 0E
    echo.
    echo  [WARNING] No API key found!
    echo  Please open server\.env and add your Anthropic API key.
    echo  Get a free key at: https://console.anthropic.com
    echo.
    pause
)

echo  [4/4] Starting ARIA...
echo.
echo  ================================================
echo   Opening in your browser at http://localhost:5173
echo   Press Ctrl+C in any window to stop ARIA
echo  ================================================
echo.

:: Start backend server in a new window
start "ARIA Backend Server" cmd /k "cd /d %~dp0server && node index.js"

:: Wait a moment for backend to start
timeout /t 2 /nobreak >nul

:: Start frontend in a new window
start "ARIA Frontend" cmd /k "cd /d %~dp0 && npm run dev"

:: Wait for frontend to start then open browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo  ARIA is running! You can close this window.
echo.
pause
