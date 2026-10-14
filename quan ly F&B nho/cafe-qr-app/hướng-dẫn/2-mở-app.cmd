@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title cafe-qr-app - giữ cửa sổ này mở trong lúc dùng app
if not exist node_modules goto :chua_cai
if not exist .env goto :chua_cai

set "PORT=3000"
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="PORT" set "PORT=%%B"
set "URL=http://localhost:%PORT%"

rem App đang chạy sẵn thì chỉ mở trình duyệt
powershell -NoProfile -Command "try { Invoke-WebRequest '%URL%/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto :dang_chay

echo ==========================================================================
echo   cafe-qr-app đang khởi động tại %URL%   (trình duyệt sẽ tự mở)
echo.
echo   Quầy  (nhân viên) : %URL%/pos     tài khoản staff1 / Staff@123
echo   Quản lý           : %URL%/admin   tài khoản admin / mật khẩu ADMIN_SEED_PASSWORD trong .env
echo   Khách             : bấm đúp "8-xem-link-qr-bàn.cmd" để lấy link từng bàn
echo.
echo   GIỮ CỬA SỔ NÀY MỞ trong lúc dùng app. Tắt app: bấm Ctrl+C hoặc đóng cửa sổ.
echo ==========================================================================
if not "%CAFE_NO_BROWSER%"=="1" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest '%URL%/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; break } catch { Start-Sleep -Seconds 1 } }"
call npm start
echo.
echo App đã dừng.
pause
exit /b 0

:dang_chay
echo App đang chạy sẵn tại %URL% - mở trình duyệt.
if not "%CAFE_NO_BROWSER%"=="1" start "" "%URL%"
timeout /t 3 >nul
exit /b 0

:chua_cai
echo Chưa cài đặt. Hãy bấm đúp "1-cài-đặt-lần-đầu.cmd" trước.
pause
exit /b 1
