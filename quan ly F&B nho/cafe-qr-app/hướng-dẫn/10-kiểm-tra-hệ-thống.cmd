@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Kiểm tra hệ thống - cafe-qr-app
echo Kiểm tra: app + database, ổ đĩa trống, bản sao lưu gần nhất, job nền lỗi, dung lượng database.
echo Chỉ ĐỌC, không thay đổi gì. Chi tiết: tài-liệu/vận-hành/monitoring.md
echo.
call npm run ops:health
rem 0 = ổn, 1 = cần để ý, còn lại (2 hoặc lỗi nặng) = có lỗi. Không dùng "if errorlevel" vì mã âm sẽ lọt qua
set "KQ=%ERRORLEVEL%"
if "%KQ%"=="0" goto :on
if "%KQ%"=="1" goto :chu_y
echo.
echo ===== KẾT QUẢ: CÓ LỖI - làm theo tài-liệu/vận-hành/incident-runbook.md =====
pause
exit /b 2

:on
echo.
echo ===== KẾT QUẢ: ỔN =====
pause
exit /b 0

:chu_y
echo.
echo ===== KẾT QUẢ: CÓ MỤC CẦN ĐỂ Ý - xem các dòng [CHÚ Ý] phía trên =====
pause
exit /b 1
