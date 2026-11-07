# ADR-041 — Bấm "+" mở bảng chọn cho mọi món

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án (kèm ảnh nút "+"): "khi click vào nó sẽ hiện tất cả để người dùng thao tác một lần luôn".
- **Bối cảnh:** F-081 (ADR-039 D-179) giữ "+" của món **không** có tùy chọn là thêm ngay (để luồng chuẩn ≤ 3 chạm — NFR-003); muốn ghi chú / số lượng phải bấm tên món. Chủ quán muốn mọi món bấm "+" đều hiện đủ (ghi chú, số lượng) để khách làm một lần.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-185 | Cài đặt **"Bấm "+" mở bảng chọn cho mọi món"** (`menu.sheet_all`, **mặc định bật**) ở Cài đặt → "Màn gọi món của khách". Bật: "+" của **mọi món** (cả món không tùy chọn, combo, món yêu thích) mở bảng chọn F-081 (tùy chọn nếu có, ghi chú — combo không có, số lượng) → "Thêm vào giỏ". Tắt: như ADR-039 D-179 (món không tùy chọn "+" thêm ngay). Món có tùy chọn luôn mở bảng chọn. |
| D-186 | Khi bật, thẻ món luôn hiện **số trong giỏ + "+"** (không còn bước −/+ trên thẻ) — sửa số lượng / ghi chú ở giỏ (bấm món — F-082) hoặc thêm tiếp bằng "+". |
| D-187 | NFR-003: mặc định (bật) luồng chuẩn **4 chạm** ("+" → "Thêm vào giỏ" → "Xem giỏ" → "Gửi đơn") theo yêu cầu chủ quán; quán cần nhanh tắt cài đặt → **≤ 3 chạm** như cũ (E2E "gọi món trong 3 chạm" chạy ở chế độ tắt). Máy chủ gửi cờ `ui.sheetAll` cùng `GET /api/menu`; quản lý cửa hàng đổi được (cài đặt vận hành). |

## Phương án đã cân nhắc

- **Bỏ hẳn chế độ thêm nhanh (không có cài đặt):** không còn đường lùi nếu khách / quán thấy chậm khi đông; giữ một ô tắt để quay về 3 chạm.
- **Chỉ mở bảng chọn cho đồ uống:** cần phân loại món — phức tạp, chủ quán muốn mọi món như nhau.

## Hệ quả

- Máy chủ: `settingsService.menuSheetAll` (`menu.sheet_all`), `PUT /api/admin/settings` thêm `menuSheetAll`, `STORE_MGR_SETTINGS` thêm `menuSheetAll`, `menuService.getPublicMenu` thêm `ui: { sheetAll }`. Không migration (CafeQrDev chưa có dòng → bật).
- Giao diện: `t-menu.js` (`sheetAll()`, `quickAdd`, `renderControl`), `admin-settings.js` (thẻ "Màn gọi món của khách"). Dữ liệu test cũ ghi `menu.sheet_all = false` (`tests/helpers/testDb.js`, `kịch-bản/e2e-server.js`) nên bài cũ giữ "+" thêm ngay; bài mới tự bật rồi tắt.
