@echo off
setlocal

cd /d "%~dp0"

echo.
echo WoodWise AAC Calculator - GitHub Publisher
echo ==========================================
echo.
echo This will publish this folder to:
echo https://github.com/loggingchance/woodwise-aac-calculator
echo.
echo The app launch PIN is: 8675309
echo.

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not installed or is not on PATH.
  echo Install it from https://cli.github.com/ and run this file again.
  pause
  exit /b 1
)

if not exist ".gh-config" mkdir ".gh-config"
set "GH_CONFIG_DIR=%CD%\.gh-config"

echo Checking GitHub login...
gh auth status >nul 2>nul
if errorlevel 1 (
  echo.
  echo GitHub login is needed. A one-time browser code flow will start now.
  echo Follow the instructions shown by GitHub CLI, then return here.
  echo.
  gh auth login --hostname github.com --web --git-protocol https
  if errorlevel 1 (
    echo.
    echo GitHub login did not complete.
    pause
    exit /b 1
  )
)

echo.
echo Checking local app state...
git status --short

echo.
echo Creating GitHub repo if needed...
gh repo view loggingchance/woodwise-aac-calculator >nul 2>nul
if errorlevel 1 (
  gh repo create loggingchance/woodwise-aac-calculator --public --source . --remote origin
  if errorlevel 1 (
    echo.
    echo Repo creation failed.
    pause
    exit /b 1
  )
) else (
  git remote get-url origin >nul 2>nul
  if errorlevel 1 (
    git remote add origin https://github.com/loggingchance/woodwise-aac-calculator.git
  )
)

echo.
echo Pushing main branch...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed.
  pause
  exit /b 1
)

echo.
echo Publish complete.
echo.
echo Repository:
echo https://github.com/loggingchance/woodwise-aac-calculator
echo.
echo GitHub Pages should appear here after the workflow finishes:
echo https://loggingchance.github.io/woodwise-aac-calculator/
echo.
echo If Pages is not live yet, open the repo above, then check the Actions tab.
echo.
pause
