@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Test nhanh - stored procedure + API
echo Chạy 46 test tự động: stored procedure, API, phân quyền, realtime, chức năng xóa (khoảng 20-40 giây).
echo Lưu ý: database TEST "CafeQrTest" bị xóa sạch và tạo lại mỗi lần chạy. Database thật "CafeQrDev" KHÔNG bị đụng tới.
echo.
call npm test
if errorlevel 1 goto :loi
echo.
echo ===== KẾT QUẢ: TẤT CẢ TEST ĐỀU QUA =====
pause
exit /b 0

:loi
echo.
echo ===== KẾT QUẢ: CÓ TEST LỖI - kéo lên trên tìm dòng có dấu x để xem chi tiết =====
pause
exit /b 1
