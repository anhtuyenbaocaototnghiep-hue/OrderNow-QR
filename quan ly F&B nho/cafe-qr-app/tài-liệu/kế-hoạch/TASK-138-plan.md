# TASK-138 — Kế hoạch: gọi nhân viên tối đa 5 lần / 1 phút (F-021, ADR-072)

- **Vì sao cần plan:** đổi quy tắc nghiệp vụ + ý nghĩa `429 TOO_SOON` của `POST /api/sessions/{id}/call-staff`; chạm máy chủ + màn khách.
- **Không đổi:** CSDL, quyền, realtime.

## Các bước

1. `staffCallsRepo.create(sessionId, message, limit, windowSec)`: chèn khi `COUNT(*)` lần gọi `STAFF` của phiên trong cửa sổ < `limit` (UPDLOCK, HOLDLOCK như cũ); `recentForSession(sessionId, limit, windowSec)` lấy các lần gọi trong cửa sổ.
2. `staffCallService.call`: `CALL_LIMIT = 5`, `CALL_WINDOW_SEC = 60`; bị chặn → `retryAfter` = 60 − tuổi (giây) của lần cũ nhất trong 5 lần gần nhất (tối thiểu 1).
3. `t-track.js`: `blockedUntil` chỉ đặt khi `TOO_SOON`; `lastCall` chỉ để hiện dòng "Đã gọi nhân viên lúc …". `call-staff.js`: bỏ hằng 60 giây phía điện thoại.
4. Test: sửa `sales.test.js` (AC-021-02 mới), E2E (AC-021-05). Tài liệu: ADR-072, FEATURE-021, api-contract, screens-flows, tc-map, README.
5. Khởi động lại máy chủ của quán.
