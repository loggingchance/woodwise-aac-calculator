@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

if exist "%CD%\deploy\windows\woodwise-api.env.cmd" call "%CD%\deploy\windows\woodwise-api.env.cmd"

if "%AAC_HOST%"=="" set "AAC_HOST=0.0.0.0"
if "%AAC_PORT%"=="" set "AAC_PORT=8788"
if "%AAC_ALLOWED_ORIGINS%"=="" set "AAC_ALLOWED_ORIGINS=https://loggingchance.github.io"

echo Starting WoodWise FVS API...
echo Host: %AAC_HOST%
echo Port: %AAC_PORT%
echo Allowed origins: %AAC_ALLOWED_ORIGINS%
echo FVS executable: %AAC_FVS_NE_PATH%
echo.

node server\aac-api.mjs
