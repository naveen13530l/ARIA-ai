@echo off
title Stopping ARIA
color 0C
cls

echo.
echo  ================================================
echo   Stopping ARIA...
echo  ================================================
echo.

:: Kill node processes running on port 3001 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill node processes running on port 5173 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo  ARIA has been stopped.
echo.
timeout /t 2 /nobreak >nul
