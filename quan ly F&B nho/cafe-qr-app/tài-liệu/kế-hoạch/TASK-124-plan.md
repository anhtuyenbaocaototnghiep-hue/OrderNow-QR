# TASK-124 — Kế hoạch: bỏ dải "Mang ra" và "Sơ chế" (ADR-064)

## Các bước

### 1. Bỏ "Mang ra" (D-253)

- **Máy quầy** — `pos-dashboard.js`, `pos/index.html`, `pos.css`, bỏ:
  - `toServe`, `serveWhat`, `renderServeStrip`, `markServed`;
  - vòng xét lại mỗi phút;
  - lắng nghe `order.served`;
  - `#serve-strip` và kiểu chữ của nó.
- **Điện thoại khách** — `t-track.js`, `customer.css`:
  - bỏ `served()` và bước 4 (`.progress.four`);
  - `doneText`: "Đã xong" (mang ra bàn) / chữ cũ (nhận tại quầy);
  - bỏ lắng nghe `order.served`.
- **Máy chủ:**
  - `routes/staff.js`: bỏ route `served`;
  - `orderService.markServed`, `ordersRepo.markServed`: bỏ;
  - `ordersRepo`: bỏ cột `ServedAt` khỏi SELECT và trường `servedAt` khỏi đơn.
- **Cài đặt:** sửa lời giải thích "Món tại bàn pha xong".

### 2. Bỏ "Sơ chế" (D-254, chỉ giao diện)

- **`pos-stock.js`:** bỏ thẻ và khối Sơ chế; Tồn kho là thẻ đầu (mặc định).
- **Đổi tên "Kho & sơ chế" → "Kho"** ở: `pos-shell.js`, `pos/stock.html`, `routes/pages.js` (chú thích), `admin-alerts.js`, `alertService.js` (email hết hạn), `admin-settings.js` (mô tả nhóm), `receive-po.js` (chú thích).
- **`inventory-advanced.js`:**
  - bỏ ô "Loại" — lưu gửi lại `kind` hiện có;
  - bỏ nhãn "Bán thành phẩm" và `recipeDialog`;
  - bỏ chữ "sơ chế" ở hạn dùng / hộp đang mở.
- **`admin-ingredients.js`:** bỏ mục "Công thức" trong "⋯".
- **Nhãn quyền Pha chế:** `roles.js` (giao diện) + `auth/permissions.js` (`pos.barista`).

### 3. Test

Sửa các test theo mục Test của [TASK-124](../công-việc/TASK-124.md); sửa tc-map (tên bài mới, bỏ dòng E2E của AC-027-01).

### 4. Tài liệu

- ADR-064.
- FEATURE-088, FEATURE-027 và các FEATURE nhắc "Kho & sơ chế".
- business-rules (BR-126), user-stories (US-088-3).
- roles-permissions, api-contract, realtime-events, data-model.
- screens-flows, sitemap, use-cases, workflows-states, actors, uat-plan (UAT-58).

## Rủi ro

1. **Món dùng bán thành phẩm** (Cà phê cốt) hết tồn khi không còn pha mẻ. Nhập kho / kiểm kê không chặn bán thành phẩm, nên nhân viên nhập / đếm như nguyên liệu thường.
2. **Dữ liệu cũ** (mẻ sơ chế, lô nguồn sơ chế, `ServedAt`). Giữ nguyên, báo cáo không đổi; nhãn lịch sử kho "Xuất cho / Nhập từ sơ chế" vẫn hiện cho dòng cũ.
3. **Máy quầy đang mở trang cũ** khi máy chủ đổi bản. Tải lại trang là có bản mới, vì tệp giao diện không lưu đệm.
