@echo off
echo ============================================
echo  Parking Lot Counter - Starting...
echo ============================================
echo.

:: Start backend in a new window
echo Starting backend server...
start "Parking Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend dev server in a new window
echo Starting frontend...
start "Parking Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait a moment then open browser
timeout /t 4 /nobreak >nul

echo.
echo ============================================
echo  Application is running!
echo  Dashboard: http://localhost:3000
echo  API docs:  http://localhost:8000/docs
echo.
echo  Close the two terminal windows to stop.
echo ============================================
echo.

:: Open browser automatically
start http://localhost:3000

pause
