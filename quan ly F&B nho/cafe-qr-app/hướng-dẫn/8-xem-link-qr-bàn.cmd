@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Link QR các bàn
call npm run qr:links --silent
echo.
echo Copy một link, mở bằng cửa sổ ẩn danh (Ctrl+Shift+N) hoặc điện thoại để vào vai khách ngồi bàn đó.
echo Điện thoại thật: xem mục "Cho điện thoại thật quét QR" trong hướng-dẫn\README.md
pause
