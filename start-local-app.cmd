@echo off
setlocal

cd /d "%~dp0"

echo.
echo Starting WoodWise AAC local app and API
echo ======================================
echo.
echo API: http://127.0.0.1:8787
echo App: http://127.0.0.1:5173/
echo.
echo Paste this API URL into the app if it is not already filled:
echo http://127.0.0.1:8787
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js first, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing app dependencies...
  npm install --no-audit --no-fund --cache .\.npm-cache
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

start "WoodWise AAC API" cmd /k "cd /d ""%CD%"" && npm run server"
start "WoodWise AAC App" cmd /k "cd /d ""%CD%"" && set VITE_AAC_API_URL=http://127.0.0.1:8787&& npm run dev"

echo.
echo Opening the app in your browser...
timeout /t 4 >nul
start http://127.0.0.1:5173/
echo.
echo Leave the two WoodWise windows open while testing.
echo.
pause
