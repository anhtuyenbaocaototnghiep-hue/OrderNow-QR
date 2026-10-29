# TASK-077 — Chế độ cơ bản, hướng dẫn quầy, trang chính sách dữ liệu, cảnh báo QR sai địa chỉ
Status: READY_FOR_REVIEW (29/10/2026)
Quyết định: [ADR-021](../quyết-định/ADR-021-che-do-co-ban-chinh-sach-qr.md) D-79…D-82 · Feature: [FEATURE-061](../chức-năng/FEATURE-061.md), [FEATURE-062](../chức-năng/FEATURE-062.md), [FEATURE-063](../chức-năng/FEATURE-063.md) · BR-096…BR-099
Module: MOD-ADMIN, MOD-AUTH, MOD-LOYALTY, MOD-TABLE · Màn hình: SCR-33 (Cài đặt), SCR-10 (quầy), SCR-22 (Bàn & QR, In QR), SCR-48 (Chính sách dữ liệu, mới)
Nguồn: chủ dự án 29/10/2026. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-077-co-ban-dong-y-qr` tách từ `main` sau [TASK-076](TASK-076.md) (`v1.0.0-rc.1`) · Kế hoạch: [TASK-077-plan.md](../kế-hoạch/TASK-077-plan.md)

## Mục tiêu
- Quán nhỏ mới dùng không ngợp; nhân viên mới tự làm được ca đầu; khách đọc được chính sách dữ liệu trước khi đồng ý; QR in ra không âm thầm "chết" khi laptop đổi IP.

## Phạm vi
1. Migration 0041: `Users.TourSeenAt`; bật đủ nhóm cho CSDL đã có đơn.
2. Cài đặt `uiModules`; `auth/me` trả `modules`, `tourSeenAt`; `POST /api/auth/tour-seen`; menu quản lý + màn quầy ẩn theo nhóm; dải nhắc ở trang đang ẩn; lớp hướng dẫn 5 bước + nút "Hướng dẫn".
3. Trang `/chinh-sach-du-lieu`, `GET /api/shop`, link ở 3 chỗ đồng ý + trang chủ.
4. `GET /api/qr-check`, `POST /api/admin/qr-printed`, dải cảnh báo (quản lý, quầy, trang In QR / Bàn & QR), dòng log khi khởi động.
5. Test integration + E2E; tài liệu (api-contract, data-model, screens-flows, sitemap, BR, US, tc-map, test-strategy, local-development).

## Không được sửa
- Quyền / API hiện có (ẩn menu không chặn API); luồng đăng ký hội viên và ẩn danh đã có (F-014) — chỉ thêm link; cách sinh mã QR bàn.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Phát hiện khi khảo sát
- Câu đồng ý lưu SĐT (bắt buộc, `CONSENT_REQUIRED`, `Members.ConsentAt`) và "Ẩn danh theo yêu cầu" **đã có từ F-014** — góp ý ngày 29/10 nói "chưa có" là sai (chỉ tìm ở file trang khách). F-062 chỉ làm phần thiếu thật: trang chính sách + link.
- DEF-019 (gặp khi chạy E2E): `GET /api/sessions/{id}` thỉnh thoảng 500 do deadlock → bọc `withDeadlockRetry`.

## Review G3 (agent độc lập, chỉ đọc, 29/10/2026) và cách xử lý
Không có lỗi bảo mật (quyền ADMIN cho `uiModules` / `qr-printed`, zod bỏ khóa lạ, không có đường chèn mã, `/api/shop` chỉ tên + địa chỉ). Đã sửa:

| Phát hiện | Sửa |
| --- | --- |
| F-063 bỏ sót trường hợp chính: `.env` ghi cứng IP, laptop đổi mạng → địa chỉ lúc in = địa chỉ đang chạy (cùng IP cũ) → không báo gì | `qr-check` thêm `unreachable` (IPv4 trong `PUBLIC_BASE_URL` không có trên card mạng nào) + `machineIps`; dải đỏ ghi IP hiện tại, hướng dẫn sửa `.env`; log khi khởi động; so `mismatch` theo origin |
| Đổi bước hướng dẫn trình đọc màn hình không đọc (focus lại nút đang focus) | Vùng `aria-live="polite"` gồm "Bước n / 5" + tiêu đề + nội dung |
| Xoay máy tính bảng qua 1200 px trong lúc hướng dẫn → ngăn bàn gỡ `inert` của thanh trên; chữ bước "Bàn" cố định lúc mở | `setTablesOpen` bỏ qua khi hướng dẫn mở; hướng dẫn chỉ gỡ inert do nó đặt, không inert vùng toast (toast nổi trên lớp phủ); chữ bước là hàm đọc lúc hiện; E2E thêm bước "Bàn" ở 1024 px |
| Bấm In rồi Hủy hộp in vẫn tính là đã in | Ghi rõ trong BR-099 / FEATURE-063 (trình duyệt không cho biết) |
| Quán đã nhập kho / có hội viên nhưng chưa có đơn → nâng cấp mất menu | Migration 0041 bật đủ khi có đơn **hoặc** hội viên **hoặc** phiếu nhập kho |
| Trang chính sách: `/api/shop` trả lỗi (không phải mất mạng) → tên quán trống | Lỗi HTTP cũng hiện "Quán" |
| Test chạy lại migration chỉ kiểm "không lỗi" | Kiểm thêm: chạy lại không đánh dấu lại tài khoản tạo sau nâng cấp |

Chấp nhận: kiểm link ở 2 hộp đăng ký của quầy bằng nội dung file JS (link phía khách kiểm trên trình duyệt); E2E giả lập kết quả `qr-check` (máy chủ E2E một địa chỉ — logic thật kiểm ở integration); `/pos/stock` mở bằng URL khi nhóm Kho ẩn không có dải nhắc.

## Kết quả thực chạy (29/10/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **355/355 PASS** (33 file; mới `basic-mode.test.js` 9 test) |
| `npm run test:e2e` | **54/54 PASS** (51 luồng + 3 khả năng tiếp cận; thêm 4 E2E; a11y quét trang Chính sách dữ liệu và hộp hướng dẫn); nhật ký máy chủ E2E không còn deadlock |
| `npm run load:report` | NFR-002 **10/10 vòng PASS**, NFR-001 p95 275 ms |
| Test mới chạy trên code cũ `v1.0.0-rc.1` (worktree tạm, đã xóa) | Integration **9/9 FAIL** đúng chỗ thiếu chức năng. E2E: file E2E cũ + 4 bài mới, chạy từng bài mới (ẩn 3 bài kia) → mỗi lần **1 FAIL (bài mới), 47 PASS** |
| `npm run trace -- --check` | 144 US, 375 AC — PASS 375, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
