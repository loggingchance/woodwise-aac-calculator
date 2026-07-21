@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo WoodWise FVS API Installer
echo ==========================
echo.
echo This installs a separate WoodWise API service.
echo It does not change CARBINE.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js LTS on this Windows server, then run this again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not on PATH.
  echo Install Node.js LTS on this Windows server, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing WoodWise API dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

set "FVS_EXE=%AAC_FVS_NE_PATH%"
if "%FVS_EXE%"=="" if exist "%CD%\fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe" set "FVS_EXE=%CD%\fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe"
if "%FVS_EXE%"=="" if exist "C:\FVS\FVSne.exe" set "FVS_EXE=C:\FVS\FVSne.exe"
if "%FVS_EXE%"=="" if exist "C:\FVSbin\FVSne.exe" set "FVS_EXE=C:\FVSbin\FVSne.exe"

if "%FVS_EXE%"=="" (
  echo Could not find FVSne.exe.
  echo.
  echo Put FVSne.exe here:
  echo %CD%\fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe
  echo.
  echo Or set AAC_FVS_NE_PATH before running this installer.
  pause
  exit /b 1
)

set "ORIGINS=https://loggingchance.github.io"
set "PORT=8788"
set "ENV_FILE=%CD%\deploy\windows\woodwise-api.env.cmd"
set "RUNNER=%CD%\deploy\windows\run-woodwise-api.cmd"
set "TASK_ACTION=cmd.exe /c ""%RUNNER%"""

echo Writing service settings...
if not exist "%CD%\deploy\windows" mkdir "%CD%\deploy\windows"
(
  echo @echo off
  echo set "AAC_HOST=0.0.0.0"
  echo set "AAC_PORT=%PORT%"
  echo set "AAC_ALLOWED_ORIGINS=%ORIGINS%"
  echo set "AAC_FVS_NE_PATH=%FVS_EXE%"
) > "%ENV_FILE%"

echo Creating scheduled task...
schtasks /Create /TN "WoodWise FVS API" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "%TASK_ACTION%" /F
if errorlevel 1 (
  echo Could not create the scheduled task. Run this CMD as Administrator.
  pause
  exit /b 1
)

echo Starting WoodWise FVS API...
schtasks /End /TN "WoodWise FVS API" >nul 2>nul
schtasks /Run /TN "WoodWise FVS API"

echo.
echo Install complete.
echo.
echo WoodWise API listens on this server at port %PORT%.
echo Configure the public HTTPS address for WoodWise with:
echo VITE_AAC_API_URL=https://your-woodwise-api-address
echo.
echo Health check path:
echo /health
echo.
pause
