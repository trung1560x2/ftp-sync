@echo off
REM FTP Sync Manager - Release Script for Windows
REM Usage: scripts\release.bat [patch|minor|major]

setlocal enabledelayedexpansion

set VERSION_TYPE=%1
if "%VERSION_TYPE%"=="" set VERSION_TYPE=patch

echo.
echo ================================
echo FTP Sync Manager Release Script
echo ================================
echo.

REM Check if git is clean
git status --short > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not available!
    exit /b 1
)

for /f %%i in ('git status --short') do (
    echo [ERROR] Git working directory is not clean!
    echo Please commit or stash your changes first.
    exit /b 1
)

REM Get current version
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set CURRENT_VERSION=%%i
echo Current version: v%CURRENT_VERSION%

REM Bump version
echo.
echo Bumping %VERSION_TYPE% version...
call npm version %VERSION_TYPE% --no-git-tag-version

REM Get new version
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set NEW_VERSION=%%i
echo New version: v%NEW_VERSION%

REM Commit version bump
git add package.json package-lock.json
git commit -m "chore: bump version to v%NEW_VERSION%"

REM Create tag
echo.
echo Creating tag v%NEW_VERSION%...
git tag -a "v%NEW_VERSION%" -m "Release v%NEW_VERSION%"

echo.
echo ================================
echo SUCCESS! Version bumped and tagged
echo ================================
echo.
echo Next steps:
echo 1. Review the changes: git log -1
echo 2. Push to GitHub: git push origin main --tags
echo 3. GitHub Actions will automatically build and release
echo.
echo Or run: git push origin main --tags
echo.

endlocal
