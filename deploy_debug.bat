@echo off
echo Closing FTP Sync Manager...
taskkill /F /IM "FTP Sync Manager.exe" 2>nul
echo.
echo Building Server Code...
call npm run build:server
if errorlevel 1 goto error
echo.
echo Updating Application...
call npx electron-builder --dir
if errorlevel 1 goto error
echo.
echo ==========================================
echo SUCCESS! Please open the app again.
echo The error Log will be at: E:\xampp\htdocs\ftp_sync\diff_debug.txt
echo ==========================================
pause
exit /b 0

:error
echo.
echo BUILD FAILED! Please check the output above.
pause
exit /b 1
