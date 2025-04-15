@echo off
set DIR_PATH=%~dp0

echo Task started at %DATE% %TIME% > "%DIR_PATH%\logfile.txt"
cd /d "%DIR_PATH%" >> "%DIR_PATH%\logfile.txt" 2>&1
@REM nvm use 23.11.0 >> "%DIR_PATH%\logfile.txt" 2>&1
node . >> "%DIR_PATH%\logfile.txt" 2>&1
echo Task completed at %DATE% %TIME% >> "%DIR_PATH%\logfile.txt" 2>&1

