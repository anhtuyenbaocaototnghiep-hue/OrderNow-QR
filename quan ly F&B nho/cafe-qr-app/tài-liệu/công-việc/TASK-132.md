# TASK-132 — Gộp "Nhân sự & chấm công" và "Lương" thành một mục (F-073, ADR-068)

- **Status:** READY_FOR_REVIEW (23/11/2026)
- **Tài liệu:**
  - [FEATURE-073](../chức-năng/FEATURE-073.md) (AC-073-10);
  - ADR [ADR-068](../quyết-định/ADR-068-gop-nhan-su-va-luong.md) (D-260);
  - US-073-1.
- **Màn hình:** thanh bên trang Quản lý; SCR-37 Nhân sự (`/admin/staff`); SCR-51 Lương (`/admin/payroll`)
- **Nguồn:** chủ dự án 23/11/2026: ảnh hai mục "Nhân sự & chấm công", "Lương" kèm câu "gộp 2 cái này lại".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-132-gop-nhan-su-luong`, chồng lên `task/TASK-131-cham-cong-theo-ca`
- **Kế hoạch:** không cần — chỉ giao diện trang Quản lý (thanh bên + hàng thẻ), không chạm API, CSDL, quyền ở máy chủ.

## Phạm vi

- **Thanh bên:** một mục "Nhân sự & lương" (`NAV_MERGED`, `NAV_ALIAS`).
  - Mục hiện khi mở được một trong hai trang, trỏ tới trang đầu tiên mở được.
  - Mục sáng ở cả hai trang.
- **Hàng thẻ chung** (`js/staff-nav.js`): Chấm công · Lịch làm tuần · Năng suất · Báo cáo tuần · Lương.
  - Thẻ của trang không có quyền thì ẩn.
  - `?tab=` mở đúng thẻ.
- **Tiêu đề hai trang:** "Nhân sự & lương".
- **Đường dẫn và quyền giữ nguyên.**

## Test

- **E2E "Nhân sự & lương gộp một mục: …" (AC-073-10):**
  - thanh bên một mục, không còn link `/admin/payroll`;
  - đủ 5 thẻ;
  - bấm Lương → trang Lương, mục vẫn sáng;
  - bấm Lịch làm tuần → về đúng thẻ.
- **E2E "phân quyền: …":** quản lý cửa hàng thấy mục, hàng thẻ không có Lương.
- **a11y "quản lý (máy tính)…":** quét lại hai trang (có hàng thẻ mới).

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** chỉ giao diện, không cần khởi động lại.
