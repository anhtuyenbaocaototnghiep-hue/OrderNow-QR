# TASK-127 — Đi riêng, hóa đơn riêng sau khi tự vào nhóm của bàn (F-097, ADR-065)

- **Status:** READY_FOR_REVIEW (18/11/2026)
- **Tài liệu:**
  - [FEATURE-097](../chức-năng/FEATURE-097.md) (quy tắc 5, AC-097-05…07);
  - ADR [ADR-065](../quyết-định/ADR-065-di-rieng-hoa-don-rieng.md) (D-255);
  - US-097-1.
- **Màn hình:** SCR-01 (màn chào, màn chọn nhóm), SCR-03 (thực đơn)
- **Nguồn:** chủ dự án 18/11/2026:
  - hỏi "sao khách hàng oder không còn thấy cái gộp nhóm với cá nhân vậy bạn kiểm tra lại";
  - Claude đề xuất nút "Tôi đi riêng — hóa đơn riêng" → chủ dự án "ok".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-127-di-rieng-hoa-don-rieng`, chồng lên `task/TASK-126-hop-nhan-hang`
- **Kế hoạch:** [TASK-127-plan.md](../kế-hoạch/TASK-127-plan.md)

## Phạm vi

- **Điện thoại vừa tự vào nhóm của bàn** thấy dòng "Bạn đã vào nhóm của Bàn …" + "Tôi đi riêng — hóa đơn riêng" + ✕:
  - hiện ở màn chào và đầu thực đơn;
  - mất khi gửi món đầu tiên trong nhóm.
- **Màn chọn nhóm** (bàn ≥ 2 nhóm) có thêm nút này.
- **Đi riêng:**
  - rời nhóm, không còn xem món / hóa đơn của nhóm đó;
  - nhóm riêng ở cùng bàn, giỏ đi theo;
  - quầy thấy thêm nhóm.
- **Máy chủ:**
  - `POST /api/sessions/{id}/separate` — một giao dịch, chỉ khi điện thoại chưa gửi món trong nhóm;
  - gửi món thì ghi `SessionClients.OrderedAt` (migration 0063).

**Ngoài phạm vi:** đổi nhóm sau khi đã gửi món (dùng "Chia bill theo người" / quầy "Tách hóa đơn").

## Test

- `group-separate.test.js`: AC-097-05, AC-097-06.
- E2E "đi riêng: …": AC-097-07.
- E2E AC-097-01: kiểm dòng thông báo thay thông báo nổi.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- `npm run db:migrate`: CafeQrDev, chỉ thêm cột.
