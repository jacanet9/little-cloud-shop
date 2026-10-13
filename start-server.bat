@echo off
title Little Cloud Shop - Server Runner
chcp 65001 >nul
cls
echo =======================================================
echo        LITTLE CLOUD SHOP - BACKEND SERVER
echo =======================================================
echo.
echo [*] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [*] Starting Little Cloud Shop Server (Port 3000)...
echo [*] Local:   http://localhost:3000
echo [*] Slip QR: http://localhost:3000/upload-slip.html
echo.
echo [INFO] To stop the server, close this window or press Ctrl+C.
echo =======================================================
echo.

timeout /t 1 >nul
start http://localhost:3000

node server.js

pause
