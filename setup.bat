@echo off
echo ============================================
echo  Parking Lot Counter - First Time Setup
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org/downloads
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Installing Python dependencies...
cd /d "%~dp0backend"
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies.
    pause
    exit /b 1
)

echo.
echo [2/4] Creating .env file from template...
if not exist .env (
    copy ..\\.env.example .env
    echo   Created backend\.env - edit it to configure Amadeus connection
) else (
    echo   backend\.env already exists, skipping.
)

echo.
echo [3/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies.
    pause
    exit /b 1
)

echo.
echo [4/4] Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Setup complete!
echo  Run start.bat to launch the application.
echo ============================================
pause
