# TASK-140 — Vá bảo mật nhanh trước khi quán chạy thật: đường dẫn viết hoa lách quyền (DEF-036) + nâng thư viện có lỗ hổng

- **Status:** READY_FOR_REVIEW (28/11/2026)
- **Tài liệu:** [defect-log](../chất-lượng/defect-log.md) DEF-036; [security-model](../kiến-trúc/security-model.md) §3.9, §8, G-11; [tech-stack](../kiến-trúc/tech-stack.md); quyền liên quan AC-077-02 (quản lý cửa hàng không ẩn danh hội viên)
- **Nguồn:** chủ dự án 28/11/2026 hỏi "app tôi còn thiếu gì nữa không… còn điểm gì bất hợp lý không". Agent rà soát rồi đề xuất A1–A4, chủ dự án trả lời "OK TIẾN HÀNH LÀM ĐI".
  - Task này làm A3 (lỗ hổng đường dẫn viết hoa) và A4 (thư viện có lỗ hổng).
  - A2 (bắt đổi mật khẩu mặc định) làm ở TASK-141, A1 (sao lưu tự động) làm ở TASK-142.
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-140-va-bao-mat-nhanh`, chồng lên `task/TASK-139-luu-y-wifi-tren-the`
- **Kế hoạch / ADR:** không cần.
  - Sửa lỗi cho đúng quyền đã có (F-077 / ADR-035): không thêm, không bớt quyền nào.
  - Nâng bản vá thư viện đã có, không thêm thư viện mới.

## Phạm vi

1. **DEF-036: đường dẫn viết hoa lách quyền và nhật ký.** Express 5 định tuyến không phân biệt hoa / thường, còn luật kiểm quyền thì có phân biệt.
   - `auth/permissions.js`:
     - Luật `only` / `DENY_RULES` khớp với cờ `i`.
     - `areaKey()` đổi đường dẫn về chữ thường.
   - `middleware/audit.js`:
     - `RULES_CI` thêm cờ `i` cho mọi luật quầy lúc nạp.
     - Luật trang Quản lý khớp với cờ `i`; `seg` / `sub` / tên hành động đổi về chữ thường.
     - Mã trong đường dẫn giữ nguyên chữ (`PUT /admin/units/KG` → `entityId` "KG").
2. **Thư viện có lỗ hổng** (`npm audit --omit=dev`: 5 → 0):
   - `nodemailer` ghim 10.6.1.
   - `npm audit fix` nâng `qs`, `body-parser`, `@azure/identity` / `@azure/msal-node`.
   - Chi tiết ở [tech-stack.md](../kiến-trúc/tech-stack.md).

## Bằng chứng lỗ hổng (code cũ)

Phép dò tạm trên CSDL test, đã xóa sau khi dò.

- Quản lý cửa hàng gọi `POST /api/admin/members/{id}/Anonymize` → **200**, hội viên bị ẩn danh. Viết thường thì 403 `OWNER_ONLY`.
- Chủ quán gọi `PUT /api/admin/SETTINGS` hoặc `PUT /api/Admin/Settings` → 200 nhưng **không có dòng nhật ký** `settings.update`.
- Các biến thể không tới được handler, trả 404 ở cả code cũ lẫn mới: `%61nonymize`, `%6Dembers` (với quản lý cửa hàng thì 403), `//members`, `members//`, `//anonymize`, `%2F`, `.json`, `%20`, `%00`.
  - Chỉ ba kiểu tới được handler: viết hoa, "/" cuối, `?query`.

## Test

- `ứng-dụng/máy-chủ/tests/route-case.test.js` — 3 test DEF-036:
  1. Quản lý cửa hàng gọi ẩn danh bằng 5 kiểu đường dẫn (viết hoa / "/" cuối / `/api/Admin`) → 403 `OWNER_ONLY`, hội viên còn nguyên.
     - Đối chứng: chủ quán gọi `/Anonymize` thì chạy thật (200, đã ẩn danh) — route viết hoa có thật, 403 là do luật chặn.
  2. `PUT /api/admin/SETTINGS` và `/api/Admin/Settings` → mỗi lần đúng một dòng nhật ký `settings.update`.
  3. Kiểm từng hàm:
     - `adminMay` / `capabilityForAdmin` / `storeManagerMay` viết hoa: chặn đúng chỗ phải chặn, mở đúng chỗ đã mở.
     - `matchRule` cho luật quầy (đóng ca, hoàn tiền, hủy sổ quỹ) và luật trang Quản lý: mã "KG" giữ nguyên chữ; `…/Preview` không ghi.
- Chạy trên code cũ (`git stash` hai file src): **hỏng cả 3** — 200 ≠ 403; "thiếu nhật ký cho /api/admin/SETTINGS"; `true ≠ false`.
- Chạy trên code mới: đạt cả 3.

## Lệnh kiểm chứng

- **Kết quả 28/11/2026:**
  - `npm audit --omit=dev` và `npm audit`: 0 lỗ hổng.
  - `route-case.test.js`: 3/3 PASS. Code cũ: 0/3.
- Toàn bộ `npm test`, `npm run test:e2e`, `npm run trace -- --check`: xem mục "Kết quả chạy đủ" dưới đây.

## Kết quả chạy đủ

_(ghi sau khi chạy)_
