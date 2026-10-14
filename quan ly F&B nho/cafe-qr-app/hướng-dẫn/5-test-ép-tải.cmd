@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Test ép tải - tranh chấp kho
echo Kịch bản ép tải: 10 vòng, mỗi vòng 30 khách gửi đơn CÙNG LÚC khi kho chỉ đủ vài suất (khoảng 1 phút).
echo Kiểm: đúng số đơn thành công, kho không bao giờ âm, hoàn tất đồng thời chỉ trừ kho 1 lần; đo độ trễ realtime.
echo Dùng database TEST "CafeQrTest" - không ảnh hưởng dữ liệu thật.
echo.
call npm run load
if errorlevel 1 goto :loi
echo.
echo ===== KẾT QUẢ: ĐẠT - xem dòng NFR-002 và NFR-001 ở trên =====
pause
exit /b 0

:loi
echo.
echo ===== KẾT QUẢ: CÓ VÒNG LỖI - xem dòng FAIL ở trên =====
pause
exit /b 1
