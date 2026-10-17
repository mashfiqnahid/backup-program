@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to restart PM2 service...
    powershell -Command Start-Process cmd -ArgumentList '/c %~fn0' -Verb RunAs
    exit /b
)

echo ====================================================
echo Restarting PM2 Windows Service...
echo ====================================================
powershell -Command Restart-Service -Name 'pm2.exe'

if %errorlevel% equ 0 (
    echo.
    echo PM2 service restarted successfully!
    echo The new 3-week (504 hours) retention setting is now active.
) else (
    echo.
    echo Failed to restart PM2 service. Please check services.msc.
)

echo.
pause
