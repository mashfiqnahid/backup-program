# Self-elevate to Administrator if not already running as Admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Configuring PM2 to run as a Windows Service" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Set System-wide PM2_HOME environment variable to ensure consistency
$pm2Home = "C:\pm2"
Write-Host "1. Setting PM2_HOME environment variable to '$pm2Home'..." -ForegroundColor Green
[Environment]::SetEnvironmentVariable("PM2_HOME", $pm2Home, "Machine")
$env:PM2_HOME = $pm2Home

# 2. Install pm2-windows-service globally
Write-Host "2. Installing pm2-windows-service globally..." -ForegroundColor Green
npm install -g pm2-windows-service

# 3. Register the service
Write-Host "3. Installing PM2 as a Windows service..." -ForegroundColor Green
# pm2-service-install will check these variables or we can pipe responses
# To be safe, we run it and instruct the installer to use defaults
& pm2-service-install -y

# 4. Restart PM2 service to apply changes
Write-Host "4. Starting/Restarting PM2 service..." -ForegroundColor Green
Restart-Service -Name "PM2" -ErrorAction SilentlyContinue
Start-Service -Name "PM2" -ErrorAction SilentlyContinue

Write-Host "`nService configuration completed!" -ForegroundColor Green
Write-Host "---------------------------------------------" -ForegroundColor Cyan
Write-Host "To complete the setup:" -ForegroundColor Yellow
Write-Host "1. Open a NEW PowerShell/CMD window (to load the new PM2_HOME env variable)." -ForegroundColor Yellow
Write-Host "2. Navigate to your project directory:" -ForegroundColor Yellow
Write-Host "   cd F:\backup-file-cleaner" -ForegroundColor Yellow
Write-Host "3. Start the application under the service context:" -ForegroundColor Yellow
Write-Host "   pm2 start ecosystem.config.js" -ForegroundColor Yellow
Write-Host "4. Save the process list so it automatically starts on system boot:" -ForegroundColor Yellow
Write-Host "   pm2 save" -ForegroundColor Yellow
Write-Host "---------------------------------------------" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
