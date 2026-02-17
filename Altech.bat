@echo off
title Altech Server
cd /d "%~dp0"

:: Check if port 8000 is already in use
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo Server already running — opening browser...
    start http://localhost:8000
    exit
)

:: Start the server and open browser after a short delay
echo Starting Altech server...
start /b node server.js

:: Wait for server to be ready, then open browser
:waitloop
timeout /t 1 /nobreak >nul
curl -s -o nul http://localhost:8000 2>nul
if %errorlevel% neq 0 goto waitloop

start http://localhost:8000
echo.
echo Altech is running at http://localhost:8000
echo Press Ctrl+C to stop the server.
echo.

:: Keep the window open so the server stays alive
node server.js
