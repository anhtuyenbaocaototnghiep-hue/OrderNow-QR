# TASK-068 — Người mở ca phải đóng ca trước khi đăng xuất
Status: READY_FOR_REVIEW (23/10/2026) — chờ review G3 + chủ dự án
Feature: [FEATURE-054](../chức-năng/FEATURE-054.md) · Quyết định: [ADR-014](../quyết-định/ADR-014-dang-xuat-phai-dong-ca.md) D-59 · BR-086 · US-054-1 · UC-11 · Module: MOD-SHIFT, MOD-AUTH · Màn hình: SCR-15 (Ca & hoàn tiền), thanh quầy / quản lý
Nguồn: chủ dự án yêu cầu 23/10/2026 ("khi đăng xuất bắt buộc phải đóng ca để có thể kiểm soát được"), chọn "Người mở ca". · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-068-dang-xuat-dong-ca` tách từ `task/TASK-067-doi-ten-quan` (chưa gộp `main`) · Phụ thuộc: F-018 (ca), F-035 (chấm công khi đăng xuất)

## Kế hoạch (đổi contract API + quy tắc nghiệp vụ → ghi kế hoạch ở đây)
1. Tài liệu trước code: ADR-014, FEATURE-054, BR-086, US-054-1, task này.
2. `shiftService.assertCanLogout(user)`: ca đang mở do chính người này mở → `409 SHIFT_OPEN` (`details.shiftId`).
3. `routes/finance.js` `POST /api/auth/logout`: kiểm trước khi ghi giờ ra chấm công.
4. `js/auth.js` `logout()`: gặp `SHIFT_OPEN` → hộp xác nhận → `/pos/shift?then=logout`; lỗi khác giữ cách cũ.
5. `js/pages/pos-shift.js`: `?then=logout` → nhắc + tự mở hộp đóng ca; đóng xong nút "Đăng xuất"; ca đã đóng / không phải mình giữ → đăng xuất luôn.
6. Test: `tests/logout-shift.test.js` (AC-054-01…03); E2E (AC-054-04).
7. Đồng bộ docs; review G3; chờ chủ dự án duyệt.

## Phạm vi sửa
- **Server:** `services/shiftService.js`, `routes/finance.js`.
- **Giao diện:** `js/auth.js`, `js/pages/pos-shift.js`, `js/ui.js` (`confirmDialog` thêm tùy chọn `cancelLabel`, mặc định vẫn "Hủy").
- **Test:** `ứng-dụng/máy-chủ/tests/logout-shift.test.js` (mới), `kiểm-thử/e2e/flow.spec.js`.
- **Không sửa:** schema / migration, quyền, dữ liệu `CafeQrDev`.

## Tiêu chí nghiệm thu
AC-054-01…AC-054-04 trong [FEATURE-054](../chức-năng/FEATURE-054.md).

## Kết quả (23/10/2026)
| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| AC-054-01 | PASS | `tests/logout-shift.test.js` — 409 `SHIFT_OPEN` + `details.shiftId`, chấm công chưa ra, ca vẫn mở; đóng ca (sp_CloseShift ghi giờ ra cho người đóng) → đăng xuất 200 |
| AC-054-02 | PASS | `tests/logout-shift.test.js` — nhân viên + trưởng ca khác đăng xuất 200 (ra ca), ca của người mở vẫn chạy |
| AC-054-03 | PASS | `tests/logout-shift.test.js` — quản lý mở ca bị 409; không có ca mở → quản lý / nhân viên / trưởng ca đăng xuất 200 |
| AC-054-04 | PASS | E2E "đăng xuất khi đang giữ ca…" — Ở lại vẫn ở trang; Đến trang đóng ca → hộp đóng ca mở sẵn → đóng ca → màn "Đã đóng ca" → Đăng xuất về trang đăng nhập |

Checks: `npm test` 300/300 (26 file), `npm run test:e2e` 42/42 (flow 39 + a11y 3), lint + format sạch, `npm run trace -- --check` 330/330 AC. Không migration, không đổi quyền, không chạm `CafeQrDev`.

Lỗi tìm thấy khi chạy E2E và đã sửa: sự kiện realtime `shift.closed` có thể về trước phản hồi HTTP của lệnh đóng ca → trang tưởng "ca đã bị người khác đóng" và tự đăng xuất ngay, người dùng không kịp thấy / in phiếu chốt ca. Sửa: cờ `closingSelf` trong lúc tự đóng ca.

Docs: ADR-014, FEATURE-054, BR-086, US-054-1, AF-STAFF-34, UC-11, UAT-30, api-contract, module-map, sitemap (SCR-15), tc-map, traceability, local-development, quy-trình-15-bước, README chức năng / task / ADR.

### Review G3 (agent độc lập, chỉ đọc) — không có blocker, đã sửa
| Mục | Vấn đề | Cách sửa |
| --- | --- | --- |
| S1 | Trang Tra cứu API chỉ đọc bảng → không thấy `409 SHIFT_OPEN` | Ghi lỗi vào dòng bảng `POST /api/auth/logout` của api-contract |
| S2 | Người mở ca còn khoản chi chờ duyệt không đóng được ca (`CASH_PENDING`) → chưa đăng xuất được, hộp nhắc không nói | `details.cashPending`; hộp nhắc ghi "Còn N khoản chi chờ duyệt — cần trưởng ca / quản lý duyệt…"; ghi giới hạn ở ADR-014, FEATURE-054, BR-086 |
| S3 | Chặn theo người, không theo máy (quản lý mở ca ở quầy, đăng xuất trên điện thoại) | Ghi rõ ở ADR-014 "Giới hạn đã biết", FEATURE-054 quy tắc 7, BR-086 |
| Nhỏ | Người khác đóng ca trước → trang không tự đăng xuất; nhánh "ca không phải của mình" có thể tự đăng xuất khi đang tự đóng ca; `?then=logout` còn trên URL (tải lại / `next=` tự đăng xuất người khác); bấm Đăng xuất hai lần chồng hộp thoại; chữ hộp nhắc lặp; thiếu test trưởng ca mở ca + ca bị người khác đóng; E2E phụ thuộc thứ tự; số file test sai | Tải lại sau `finally` khi ca đã đóng; `&& !closingSelf`; `history.replaceState` ngay khi đọc; cờ `loggingOut`; viết lại câu nhắc; thêm test; E2E tự đóng ca đang mở + kiểm token đã xóa và ca đã đóng; sửa 26 file, 125 AF, BR-001…086 |

Ghi nhận (có từ trước, ngoài phạm vi): khi tài khoản bị khóa, `logout()` ghi đè `?reason=locked` nên trang đăng nhập không hiện "Tài khoản đã bị khóa".

