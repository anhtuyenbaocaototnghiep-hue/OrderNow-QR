@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Chạy tất cả test
set "LOI="
echo ######## 1/4  Test nhanh (stored procedure + API) ########
call npm test
if errorlevel 1 set "LOI=%LOI% [Test nhanh]"

echo.
echo ######## 2/4  Test giao diện (Chromium) ########
call node node_modules\@playwright\test\cli.js install chromium
call npm run test:e2e
if errorlevel 1 set "LOI=%LOI% [Test giao diện]"

echo.
echo ######## 3/4  Test ép tải ########
call npm run load
if errorlevel 1 set "LOI=%LOI% [Test ép tải]"

echo.
echo ######## 4/4  Kiểm tra code ########
call npm run lint
if errorlevel 1 set "LOI=%LOI% [ESLint]"
call npm run format:check
if errorlevel 1 set "LOI=%LOI% [Prettier]"

echo.
echo ==========================================================================
if defined LOI goto :co_loi
echo   TỔNG KẾT: TẤT CẢ ĐỀU QUA
echo ==========================================================================
pause
exit /b 0

:co_loi
echo   TỔNG KẾT: CÓ LỖI ở:%LOI%
echo   Kéo lên trên xem chi tiết, hoặc chạy riêng từng file 3-6.
echo ==========================================================================
pause
exit /b 1
