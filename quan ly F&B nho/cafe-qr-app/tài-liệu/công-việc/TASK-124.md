# TASK-124 — Gọn màn quầy: bỏ dải "Mang ra" / nút "Đã mang" và bỏ "Sơ chế" (ADR-064)

- **Status:** READY_FOR_REVIEW (18/11/2026)
- **Tài liệu:**
  - ADR [ADR-064](../quyết-định/ADR-064-bo-mang-ra-va-so-che.md) (D-253, D-254);
  - [FEATURE-088](../chức-năng/FEATURE-088.md): BR-126.4, AC-088-03, AC-088-07, AC-088-08;
  - [FEATURE-027](../chức-năng/FEATURE-027.md): ghi chú bỏ giao diện.
- **Màn hình:** SCR-05, SCR-10, SCR-17, SCR-23, SCR-33
- **Nguồn:** chủ dự án 18/11/2026:
  - ảnh dải "Mang ra" kèm câu "bỏ ko cần thiết có phần này đâu";
  - ảnh thẻ "Sơ chế" kèm câu "bỏ sơ chế ko cần thiết".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-124-bo-mang-ra-so-che`, chồng lên `task/TASK-123-tu-xac-nhan-sepay`
- **Kế hoạch:** [TASK-124-plan.md](../kế-hoạch/TASK-124-plan.md)

## Phạm vi

### Bỏ dải "Mang ra" (D-253)

- **Máy quầy:** không còn dải "Mang ra" và nút "Đã mang"; món tại bàn Hoàn tất / Xong là xong.
- **Điện thoại khách:** 3 bước, nhãn "Đã xong"; hộp báo món xong giữ "nhân viên đang mang ra bàn".
- **Máy chủ:** bỏ `POST /api/orders/{id}/served`, sự kiện `order.served`, trường `servedAt`. Cột CSDL giữ.

### Bỏ "Sơ chế" (D-254)

- **Kho ở quầy:** bỏ thẻ "Sơ chế", mở thẻ Tồn kho.
- **Tên mục:** "Kho & sơ chế" đổi thành "Kho" (thanh quầy, lời nhắc, email cảnh báo hết hạn, mô tả nhóm Kho hàng).
- **Trang Nguyên liệu:** bỏ chọn loại "Bán thành phẩm", bỏ "Công thức", bỏ nhãn "Bán thành phẩm".
- **Nhãn quyền Pha chế** bỏ chữ "sơ chế".
- **Máy chủ:** giữ API sơ chế, cách trừ kho và tính giá vốn qua bán thành phẩm.

**Ngoài phạm vi:**

- Xóa bảng / cột (không migration phá hủy).
- Đổi "Cà phê cốt" trong dữ liệu của quán về nguyên liệu thường. Đây là ví dụ sơ chế làm ngày 17/11; cần chủ quán đồng ý trước khi sửa dữ liệu thật.

## Test

- **`single-screen.test.js`:** AC-088-03 viết lại — `/served` → 404; đơn không có `servedAt`; CSDL không ghi.
- **`access-grants.test.js`:** nhãn quyền Pha chế.
- **E2E:**
  - AC-088-07: bỏ kiểm dải "Mang ra";
  - AC-088-08: khách "Đã xong", 3 bước, không có dải / nút;
  - Kho ở quầy: không có thẻ Sơ chế, mở Tồn kho; AC-030-01, AC-032-03 giữ phần hủy hàng / nhận hàng;
  - nhãn "Kho": AC-075-05, AC-078-06, AC-085-03, AC-061-01;
  - nhãn quyền: AC-090-02.
- **tc-map:** AC-027-01 bỏ dòng bằng chứng E2E (còn integration `inventory2.test.js`).

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
