@echo off
echo Stopping Parking Lot Counter...
taskkill /FI "WINDOWTITLE eq Parking Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Parking Frontend*" /T /F >nul 2>&1
echo Done.
pause
