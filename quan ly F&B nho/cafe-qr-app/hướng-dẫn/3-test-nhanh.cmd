@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Test nhanh - stored procedure + API
echo Chạy 98 test tự động: bộ tính giá, stored procedure, API, phân quyền, realtime, xóa, hội viên, khuyến mãi, combo, ca, hoàn tiền, kho (khoảng 1-2 phút).
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
