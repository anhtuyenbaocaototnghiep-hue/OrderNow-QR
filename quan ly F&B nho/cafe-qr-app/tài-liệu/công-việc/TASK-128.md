# TASK-128 — Thẻ "Bạn đi chung hay đi riêng?" dễ thấy, dễ bấm (F-097, ADR-065 D-256)

- **Status:** READY_FOR_REVIEW (19/11/2026)
- **Tài liệu:**
  - [FEATURE-097](../chức-năng/FEATURE-097.md) (quy tắc 1, 5; AC-097-01, AC-097-07);
  - ADR [ADR-065](../quyết-định/ADR-065-di-rieng-hoa-don-rieng.md) (D-256, thay phần giao diện của D-255);
  - US-097-1.
- **Màn hình:** SCR-01 (màn chào, màn chọn nhóm), SCR-03 (thực đơn)
- **Nguồn:** chủ dự án 19/11/2026: "bạn làm cái dao diện đi chung đi riêng khó thấy quá bạn làm lại sao cho nó đơn giản khách dễ thấy và thao tác".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-128-the-di-chung-di-rieng`, chồng lên `task/TASK-127-di-rieng-hoa-don-rieng`
- **Kế hoạch:** không cần — chỉ giao diện khách (một chức năng), không chạm API, CSDL, quyền, realtime.

## Phạm vi

- **Thẻ nổi bật** thay dòng nhỏ "Bạn đã vào nhóm…" + nút "Tôi đi riêng" (TASK-127):
  - **Vị trí:** đầu màn chào và đầu thực đơn.
  - **Chữ:** "Bàn … đang có khách" / "Bạn đi chung hay đi riêng?".
  - **Hai nút lớn ngang nhau, có biểu tượng:**
    - **Đi chung** (chung một hóa đơn) → thẻ mất, báo đi chung;
    - **Đi riêng** (hóa đơn riêng) → nhóm riêng như TASK-127, giỏ đi theo.
  - **Không bắt chọn:** gọi món luôn = đi chung.
  - **Bỏ nút ✕.**
- **Chỉ hỏi khi máy tự xếp vào nhóm** (bàn có 1 nhóm). Tự chọn "Vào nhóm này" ở màn chọn nhóm thì không hỏi lại.
- **Màn chọn nhóm:** nút cuối đổi thành "Đi riêng — hóa đơn riêng" (có biểu tượng).
- **Biểu tượng mới** `user` (một người) cạnh `users` (nhóm).
- **Màu** theo bộ màu màn khách — giao diện tối tự đổi.

**Ngoài phạm vi:** máy chủ / API `POST /api/sessions/{id}/separate` và quy tắc `409 ALREADY_ORDERED` (giữ nguyên D-255).

## Test

- **E2E "đi chung / đi riêng: …" (AC-097-07):**
  - thẻ có hai nút;
  - gọi món luôn → thẻ mất;
  - "Đi chung" → thẻ mất, báo đi chung, bàn 1 nhóm;
  - "Đi riêng" → bàn 2 nhóm, giỏ giữ nguyên, chỉ thấy món của mình;
  - màn chọn nhóm có "Đi riêng — hóa đơn riêng";
  - tự chọn nhóm → không có thẻ.
- **E2E "vào nhóm của bàn: …" (AC-097-01):** kiểm thẻ thay dòng cũ.
- **E2E F-001 "quét QR: bàn trống vào thẳng menu; …":** kiểm thẻ thay dòng cũ.
- **a11y:**
  - bài "khách (điện thoại)…" quét thẻ ở đầu thực đơn (`khach-di-chung-di-rieng`, 320 / 390 px, dấu focus);
  - bài "khách giao diện tối…" quét thẻ trên màn chào tối (`khach-toi-di-chung-di-rieng`).

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** chỉ giao diện (máy chủ phục vụ tệp tĩnh từ thư mục làm việc), không cần khởi động lại, không migration.
