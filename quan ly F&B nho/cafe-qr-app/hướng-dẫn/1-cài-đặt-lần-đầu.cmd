@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Cài đặt lần đầu - cafe-qr-app
where node >nul 2>nul
if errorlevel 1 goto :chua_co_node

echo === Cài thư viện (npm install) - lần đầu có thể mất vài phút ===
call npm install
if errorlevel 1 goto :loi

call npm run setup
if errorlevel 1 goto :loi

echo.
echo Bước tiếp theo: bấm đúp "2-mở-app.cmd" để mở ứng dụng.
pause
exit /b 0

:chua_co_node
echo Máy chưa cài Node.js. Tải bản LTS (22.9 trở lên) tại https://nodejs.org, cài xong thì chạy lại file này.
pause
exit /b 1

:loi
echo.
echo *** Cài đặt chưa xong - đọc thông báo lỗi phía trên và mục "Xử lý lỗi" trong hướng-dẫn\README.md ***
pause
exit /b 1
