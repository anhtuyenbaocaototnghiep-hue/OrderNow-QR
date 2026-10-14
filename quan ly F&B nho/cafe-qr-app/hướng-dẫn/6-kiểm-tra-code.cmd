@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Kiểm tra code - ESLint + Prettier
echo [1/2] ESLint - tìm lỗi code JavaScript...
call npm run lint
if errorlevel 1 goto :loi
echo [2/2] Prettier - kiểm tra định dạng code...
call npm run format:check
if errorlevel 1 goto :dinh_dang
echo.
echo ===== KẾT QUẢ: CODE SẠCH =====
pause
exit /b 0

:dinh_dang
echo.
echo ===== Có file chưa đúng định dạng. Chạy "npm run format" để tự sửa. =====
pause
exit /b 1

:loi
echo.
echo ===== ESLint báo lỗi - xem tên file và số dòng ở trên =====
pause
exit /b 1
