# TASK-067 — Đổi tên quán và địa chỉ trong Cài đặt
Status: READY_FOR_REVIEW (23/10/2026) — chờ review G3 + chủ dự án
Feature: [FEATURE-053](../chức-năng/FEATURE-053.md) · BR-085 · US-053-1 · UC-17 · Module: MOD-ADMIN, MOD-AUTH · Màn hình: SCR-33 (Quản lý → Hệ thống → Cài đặt)
Nguồn: chủ dự án yêu cầu 23/10/2026 ("bạn làm thêm cho tôi chỗ đổi tên quán nha"). · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-067-doi-ten-quan` tách từ `task/TASK-066-giao-dien-impeccable` (chưa gộp `main`) · Phụ thuộc: F-020 (trang Cài đặt), F-035 (Nhật ký thao tác)

## Mục tiêu
- Quản lý đổi tên quán / địa chỉ in trên hóa đơn ngay trong Cài đặt, không phải sửa `.env` và khởi động lại app.
- Mọi màn (quầy, quản lý, menu khách, hóa đơn, phiếu đặt hàng, thẻ QR) đọc chung một nguồn.
- Không đổi dữ liệu đang có: chưa lưu thì vẫn dùng `.env`.

## Kế hoạch (thay đổi contract API → ghi kế hoạch ở đây)
1. Tài liệu trước code: FEATURE-053, BR-085, US-053-1, UC-17, task này.
2. `settingsService`: `shopName` / `shopAddress` (khóa `shop.name`, `shop.address`, mặc định `config.shop`), hàm `shopInfo()`.
3. `routes/operations.js` (`PUT /api/admin/settings`): validate `shopName` 1–100, `shopAddress` 0–200.
4. Thay `config.shop` bằng `settingsService.shopInfo()` ở `routes/public.js` (`/auth/me`, `/menu`), `sessionService` (hóa đơn phiên, hóa đơn từng phần), `orderService` (hóa đơn mang đi).
5. Giao diện: thẻ "Thông tin quán" ở `admin-settings.js`; lưu xong dựng lại thanh bên.
6. Test: `tests/shop-info.test.js` (AC-053-01…04); E2E đổi tên rồi trả lại (AC-053-05).
7. Đồng bộ docs (api-contract, data-model, business-rules, user-stories, use-cases, tc-map, traceability); review G3; chờ chủ dự án duyệt.

## Phạm vi sửa
- **Server:** `services/settingsService.js`, `services/sessionService.js`, `services/orderService.js`, `routes/operations.js`, `routes/public.js`.
- **Giao diện:** `js/pages/admin-settings.js`.
- **Test:** `ứng-dụng/máy-chủ/tests/shop-info.test.js` (mới), `kiểm-thử/e2e/flow.spec.js`.
- **Không sửa:** schema / migration, `.env`, dữ liệu `CafeQrDev`.

## Tiêu chí nghiệm thu
AC-053-01…AC-053-05 trong [FEATURE-053](../chức-năng/FEATURE-053.md).

## Kết quả (23/10/2026)
| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| AC-053-01 | PASS | `tests/shop-info.test.js` — cài đặt, `/auth/me`, `/menu`, hóa đơn phiên đổi theo; nhật ký `settings.update` có tên cũ (BeforeJson) → mới (AfterJson) |
| AC-053-02 | PASS | `tests/shop-info.test.js` — chưa có dòng `shop.*` → mọi nguồn = `.env`; địa chỉ rỗng → hóa đơn không in địa chỉ |
| AC-053-03 | PASS | `tests/shop-info.test.js` — tên rỗng / khoảng trắng / 101 ký tự, địa chỉ 201 ký tự → 400 (lỗi theo trường); biên 100 / 200 hợp lệ |
| AC-053-04 | PASS | `tests/shop-info.test.js` — nhân viên 403, trưởng ca 403, không token 401 |
| AC-053-05 | PASS | E2E "đổi tên quán…" (thanh bên đổi ngay, menu khách hiện tên mới, trả lại tên cũ, dọn bàn thử); a11y quét `/admin/settings` |

Checks: `npm test` 297/297 (25 file), `npm run test:e2e` 41/41 (flow 38 + a11y 3), lint + format sạch, `npm run trace -- --check` 326/326 AC. Không migration, không đổi `.env`, không chạm `CafeQrDev` (test chạy trên `CafeQrTest`).

Docs: FEATURE-053, BR-085, US-053-1, AF-ADMIN-38, UC-17, UAT-29, roles-permissions, api-contract, data-model, module-map, sitemap (kèm nhóm menu D-58 của TASK-066), tc-map, traceability, local-development, README chức năng / task.

### Review G3 (agent độc lập, chỉ đọc) — không có blocker, đã sửa
| Mục | Vấn đề | Cách sửa |
| --- | --- | --- |
| S1 | Trang Cài đặt luôn gửi tên / địa chỉ → lần lưu cài đặt đầu tiên (kể cả chỉ bật / tắt nhận đơn) chép giá trị `.env` vào DB, sau đó sửa `.env` không còn tác dụng | Chỉ gửi `shopName` / `shopAddress` khi người dùng sửa hai ô; `.env.example`, `local-development.md` ghi rõ `.env` chỉ là mặc định |
| S2 | Lần đổi tên đầu tiên (giá trị còn từ `.env`) không có tên cũ trong nhật ký | Ảnh "trước" của `Settings` thêm tên / địa chỉ đang dùng (`settingsService.shopInfo()`); test kiểm cả lần đổi đầu |
| S3 | Test AC-053-03 kiểm "không đổi" sau hai lần lưu hợp lệ | Kiểm tên + địa chỉ ngay sau các lần bị từ chối |
| S4 | Số liệu tổng lệch (local-development, user-stories, actors, quy-trình-15-bước); dòng F-053 trong README chức năng thiếu cột | Cập nhật 130 US / 326 AC / 52 FEATURE / 74 BR / AF-ADMIN 38; thêm cột bằng chứng + link TASK-067 |
| Nhỏ | Dọn E2E chưa bao hết lỗi giữa chừng; toast mâu thuẫn khi dựng lại thanh bên lỗi; `autocomplete` sai; thông báo lỗi độ dài tiếng Anh | `try` bao từ bước đổi tên, trả tên cũ qua API; dựng thanh bên tách riêng (chỉ khi tên đổi); `autocomplete="off"`; thông báo "Tên quán tối đa 100 ký tự" / "Địa chỉ tối đa 200 ký tự" |
