@echo off
setlocal
chcp 65001 >nul
title FB Scrat ^& AutoPost by HuyFlou
cd /d "%~dp0"

rem Usage:
rem   run.bat        build and start the app (production)
rem   run.bat dev    start in development mode (auto reload)
rem Set NO_BROWSER=1 to skip opening the browser.

set "PORT=3100"
set "URL=http://localhost:%PORT%"

echo ==============================================
echo   FB Scrat ^& AutoPost by HuyFlou - Cao bai va dang bai Facebook nhieu nick
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai tai https://nodejs.org ^(ban 20 tro len^) roi chay lai.
  goto :fail
)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [LOI] Cong %PORT% dang duoc dung. Co the app da chay san - mo %URL%
  goto :fail
)

if not exist "node_modules\" (
  echo [1] Cai dat thu vien lan dau ^(npm install^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [LOI] npm install that bai.
    goto :fail
  )
  echo.
)

if /i "%~1"=="dev" (
  set "NODE_ENV=development"
  call :open_browser
  echo [2] Chay che do phat trien tai %URL%  ^(Ctrl+C de dung^)
  call npm run dev
  goto :end
)

echo [2] Build ung dung...
call npm run build
if errorlevel 1 (
  echo [LOI] Build that bai.
  goto :fail
)
echo.

set "NODE_ENV=production"
call :open_browser
echo [3] App dang chay tai %URL%  ^(Ctrl+C de dung^)
echo     Giu cua so nay mo de app tu dang bai theo lich.
node dist-server\server.cjs
goto :end

:open_browser
if not defined NO_BROWSER (
  start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" %URL%"
)
exit /b 0

:fail
echo.
pause
exit /b 1

:end
endlocal
