@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Sao lưu ngay - cafe-qr-app
echo Sao lưu database đang dùng (theo DB_NAME trong .env) + ảnh hóa đơn sổ quỹ vào BACKUP_DIR.
echo Chỉ ĐỌC dữ liệu, app vẫn chạy bình thường. Chi tiết: tài-liệu/vận-hành/backup-restore.md
echo.
call npm run db:backup
rem So đúng mã 0 (không dùng "if errorlevel": mã âm khi tiến trình bị lỗi nặng sẽ lọt qua)
if not "%ERRORLEVEL%"=="0" goto :loi
echo.
echo ===== KẾT QUẢ: SAO LƯU XONG =====
pause
exit /b 0

:loi
echo.
echo ===== KẾT QUẢ: SAO LƯU CHƯA ĐƯỢC - đọc dòng có dấu *** phía trên để biết cách sửa =====
pause
exit /b 1
