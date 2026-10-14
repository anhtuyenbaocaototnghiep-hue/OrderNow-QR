@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Test giao diện - Playwright Chromium
echo Chạy 15 test giao diện bằng trình duyệt Chromium tự động: điện thoại khách + máy quầy + trang quản lý (khoảng 1 phút).
echo Test dùng server riêng ở cổng 3100 và database TEST "CafeQrTest" - app đang mở ở cổng 3000 không bị ảnh hưởng.
echo.
echo Kiểm tra trình duyệt Chromium cho test (lần đầu sẽ tải khoảng 150 MB)...
call node node_modules\@playwright\test\cli.js install chromium
call npm run test:e2e
if errorlevel 1 goto :loi
echo.
echo ===== KẾT QUẢ: TẤT CẢ TEST GIAO DIỆN ĐỀU QUA =====
pause
exit /b 0

:loi
echo.
echo ===== KẾT QUẢ: CÓ TEST LỖI - ảnh chụp và trace của test lỗi nằm trong thư mục test-results =====
echo Xem lại từng bước: node node_modules\@playwright\test\cli.js show-trace test-results\TÊN-TEST\trace.zip
pause
exit /b 1
