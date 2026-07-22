@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo WoodWise FVS API Origin Repair
echo ==============================
echo.
echo This updates the live WoodWise API browser allow-list.
echo It does not change CARBINE.
echo.

set "ENV_FILE=%CD%\deploy\windows\woodwise-api.env.cmd"
if exist "%ENV_FILE%" call "%ENV_FILE%"

if "%AAC_HOST%"=="" set "AAC_HOST=0.0.0.0"
if "%AAC_PORT%"=="" set "AAC_PORT=8788"
set "AAC_ALLOWED_ORIGINS=https://loggingchance.github.io,https://wwf.bicksapp.com"

if "%AAC_FVS_NE_PATH%"=="" if exist "C:\FVS\FVSne.exe" set "AAC_FVS_NE_PATH=C:\FVS\FVSne.exe"
if "%AAC_FVS_NE_PATH%"=="" if exist "C:\Users\Public\Documents\FVS\FVSbin\FVSne.exe" set "AAC_FVS_NE_PATH=C:\Users\Public\Documents\FVS\FVSbin\FVSne.exe"
if "%AAC_FVS_NE_PATH%"=="" if exist "C:\FVSbin\FVSne.exe" set "AAC_FVS_NE_PATH=C:\FVSbin\FVSne.exe"

if "%AAC_FVS_NE_PATH%"=="" (
  echo Could not find FVSne.exe.
  echo Run install-woodwise-api.cmd first, or put FVSne.exe at C:\FVS\FVSne.exe.
  pause
  exit /b 1
)

echo Writing updated WoodWise API settings...
if not exist "%CD%\deploy\windows" mkdir "%CD%\deploy\windows"
(
  echo @echo off
  echo set "AAC_HOST=%AAC_HOST%"
  echo set "AAC_PORT=%AAC_PORT%"
  echo set "AAC_ALLOWED_ORIGINS=%AAC_ALLOWED_ORIGINS%"
  echo set "AAC_FVS_NE_PATH=%AAC_FVS_NE_PATH%"
) > "%ENV_FILE%"

echo Restarting WoodWise FVS API task...
schtasks /End /TN "WoodWise FVS API" >nul 2>nul
schtasks /Run /TN "WoodWise FVS API"
if errorlevel 1 (
  echo.
  echo Could not restart the WoodWise FVS API task.
  echo Right-click this CMD file and choose Run as administrator.
  pause
  exit /b 1
)

echo.
echo Repair complete.
echo.
echo Allowed origins are now:
echo %AAC_ALLOWED_ORIGINS%
echo.
echo Test this in a browser:
echo https://woodwise.bicksapp.com/health
echo.
pause
