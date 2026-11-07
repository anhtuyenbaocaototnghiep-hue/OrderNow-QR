# FEATURE-083 — Bấm "+" mở bảng chọn cho mọi món

> **Nguồn:** chủ dự án 07/11/2026 (kèm ảnh nút "+": "khi click vào nó sẽ hiện tất cả để người dùng thao tác một lần luôn"). Quyết định: [ADR-041](../quyết-định/ADR-041-cong-mo-bang-chon-moi-mon.md) D-185…D-187. Nền: [F-081](FEATURE-081.md), [F-082](FEATURE-082.md).

- **Status:** CONFIRMED (ADR-041) · Triển khai: [TASK-100](../công-việc/TASK-100.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (gọi món); **ACT-ADMIN / ACT-STORE** (bật / tắt).
- **Màn hình:** **Menu** (SCR-02): "+" mọi món → **Bảng chọn món** (SCR-57); thẻ món hiện số trong giỏ + "+". **Cài đặt** (SCR-33): thẻ **Màn gọi món của khách** → ô **Bấm "+" mở bảng chọn cho mọi món**.
- **Dữ liệu:** cài đặt `menu.sheet_all` (mặc định bật). Không đổi bảng.

## User Story

- **US-083-1:** Là chủ quán, tôi muốn khách bấm "+" ở bất kỳ món nào cũng thấy ngay chỗ ghi chú và số lượng, để khách chọn một lần là xong, không phải tìm cách sửa sau.

## Quy tắc (BR-121)

1. `menu.sheet_all` mặc định bật; chủ quán / quản lý cửa hàng đổi ở Cài đặt; menu khách đọc `ui.sheetAll` khi tải.
2. Bật: "+" mọi món → bảng chọn; thẻ món chỉ hiện số trong giỏ + "+". Tắt: như F-081 (món không tùy chọn "+" thêm ngay, thẻ có −/+).
3. Luồng chuẩn: bật 4 chạm, tắt ≤ 3 chạm (NFR-003).

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET` · `PUT /api/admin/settings` | ADMIN, STORE_MGR | Thêm `menuSheetAll` (boolean, mặc định `true`) |
| `GET /api/menu` | Công khai | Thêm `ui: { sheetAll }` |

## Acceptance Criteria

- AC-083-01: Chưa đặt → `menuSheetAll` = true, menu `ui.sheetAll` = true; chủ quán tắt → false ở cả hai; nhân viên đổi → 403; quản lý cửa hàng bật lại được.
- AC-083-02: Trên trình duyệt: chủ quán tích "Bấm "+" mở bảng chọn cho mọi món" → Lưu; khách bấm "+" Nước suối (không tùy chọn) → bảng chọn mở, không có nhóm tùy chọn, có ô ghi chú; tăng số lượng 2 → "Thêm vào giỏ" → thẻ món hiện 2, không còn −/+ trên thẻ; giỏ có Nước suối × 2; gửi đơn → màn theo dõi đơn.

## Bằng chứng

`tests/item-sheet.test.js` (AC-083-01) · E2E ""+" mở bảng chọn cho mọi món…" (AC-083-02).
