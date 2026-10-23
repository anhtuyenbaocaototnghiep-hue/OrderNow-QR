@echo off
chcp 65001 >nul
setlocal
rem Chạy app trên MÁY CHẠY THẬT của quán, ghi nhật ký vào <LOG_DIR>\server-YYYYMMDD.log (bước 15, ADR-016).
rem Task Scheduler gọi file này khi bật máy (tài-liệu/vận-hành/deployment-checklist.md). Bấm đúp để chạy tay cũng được.
rem App dừng (lỗi, SQL Server chưa sẵn sàng lúc mới bật máy…) → tự chạy lại sau 15 giây. Tắt hẳn: đóng cửa sổ / dừng tác vụ.
cd /d "%~dp0.."
if not exist node_modules goto :chua_cai
if not exist .env goto :chua_cai
rem Thư mục nhật ký: LOG_DIR trong .env nếu có, không thì nhật-ký trong thư mục app
set "LOGDIR=nhật-ký"
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="LOG_DIR" if not "%%B"=="" set "LOGDIR=%%B"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo cafe-qr-app đang chạy - nhật ký trong thư mục %LOGDIR%   (đóng cửa sổ này = tắt app)

:chay
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "NGAY=%%d"
set "LOG=%LOGDIR%\server-%NGAY%.log"
echo ===== %DATE% %TIME% khởi động =====>> "%LOG%"
call npm start >> "%LOG%" 2>&1
echo ===== %DATE% %TIME% app dừng (mã %ERRORLEVEL%) - chạy lại sau 15 giây =====>> "%LOG%"
rem Chờ bằng ping: lệnh timeout không chạy khi không có cửa sổ (Task Scheduler)
ping -n 16 127.0.0.1 >nul
goto :chay

:chua_cai
echo Chưa cài đặt. Hãy bấm đúp "1-cài-đặt-lần-đầu.cmd" trước.
exit /b 1
