# TASK-107 — Kế hoạch: bỏ "Đổi người" (ADR-050)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Nút | `pos-shell.js` (`#switch-btn`) | Bỏ nút + import `switchUserDialog` |
| Hộp chọn người | `staff-pin.js` `switchUserDialog` (dùng `/api/auth/switch`, `saveStaffSession`) | Bỏ hàm + import thừa; lời giới thiệu PIN bỏ "đổi người" |
| API | `routes/payroll.js` `POST /auth/switch` → `userService.switchTo` (`verifyPin`, `onLogin`, `signToken`) | Bỏ route + hàm (import `verifyPin`, `userService` thừa) — đường dẫn rơi về `notFoundApi` (404) |
| Tra cứu API | bảng api-contract có dòng `/api/auth/switch` (test AC-052-03 chặn dòng trỏ endpoint không tồn tại) | Bỏ dòng, ghi mục "đã bỏ" |
| Test | AC-072-04, AC-084-01, E2E AC-072-07 (+ AC-073-09 cùng bài), AC-072-12 | Kiểm đã bỏ (404, phiên không đổi); E2E đổi người đứng máy bằng Đăng xuất / đăng nhập |

Rủi ro: E2E đăng xuất — người đang đăng nhập không giữ ca (ca do quản lý mở ở đầu lượt) nên không bị hỏi đóng ca (`shiftService.assertCanLogout` chỉ chặn người mở ca).
