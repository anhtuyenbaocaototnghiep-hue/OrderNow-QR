# FEATURE-087 — Hoàn thiện đổi bàn: nhãn đổi bàn + phiếu pha, thời gian tự trả bàn, bàn đích có người

> **Nguồn:** chủ dự án 10/11/2026 chọn đề xuất 1–3 sau TASK-104: "Món đang pha lúc khách đổi bàn… Thẻ đơn ở quầy nên hiện nhãn "Đổi bàn → Bàn B" trong 10 phút, kèm nút in lại phiếu. Thời gian tự đóng bàn trống: cho chủ quán chọn 15 / 30 / 60 phút hoặc tắt. Thẻ xin chuyển bàn nên ghi bàn đích đang có người hay không, để nhân viên quyết chuyển hay thu chung — tiến hành làm cho tôi". Quyết định: [ADR-048](../quyết-định/ADR-048-hoan-thien-doi-ban.md) D-211…D-213. Nền: [F-049](FEATURE-049.md) chuyển bàn, [F-057](FEATURE-057.md) thu chung, [F-066](FEATURE-066.md) hẹn giờ ra món, [F-086](FEATURE-086.md) đổi bàn khi quét.

- **Status:** CONFIRMED (ADR-048, chủ dự án 10/11) · Triển khai: [TASK-105](../công-việc/TASK-105.md)
- **Actor:** **ACT-STAFF / ACT-LEAD** (pha chế, phục vụ: nhãn, in phiếu, thẻ xin chuyển); **ACT-ADMIN** chủ quán (chọn thời gian tự trả bàn); **EXT-SCHEDULER** (job tự trả bàn).
- **Màn hình:**
  - **Máy quầy → Đơn hàng** (SCR-10): thẻ đơn mới / đang pha có nhãn "Đổi bàn: ~~Bàn A~~ → Bàn B" 10 phút + nút "In phiếu bàn mới"; thẻ "xin chuyển bàn" thêm dòng "Bàn B đang trống" / "Bàn B đang có n nhóm khác".
  - **In phiếu pha** (SCR-12, `/pos/orders/{id}/receipt?mode=ticket`): "PHIẾU PHA — ĐỔI BÀN", tên bàn mới thật to, đổi từ bàn nào, món, ghi chú, không giá.
  - **Quản lý → Cài đặt** (SCR-33, chủ quán): thẻ "Bàn trống" — Tắt / Sau 15 / 30 (mặc định) / 60 phút.
- **Dữ liệu:** không migration; cài đặt `tables.idle_close_minutes`.

## User Story

- **US-087-1:** Là nhân viên pha chế / phục vụ, khi nhóm khách đổi bàn lúc món của họ còn đang làm, tôi muốn thẻ đơn hiện nổi "Đổi bàn: Bàn A → Bàn B" một lúc và in được phiếu pha ghi bàn mới, để mang món ra đúng bàn.
- **US-087-2:** Là chủ quán, tôi muốn chọn sau bao lâu thì bàn khách quét QR mà không gọi món được tự trả (hoặc tắt), và là nhân viên quầy, tôi muốn thẻ "xin chuyển bàn" cho biết bàn đích đang có người hay không, để quyết chuyển (bill riêng) hay hỏi khách thu chung.

## Quy tắc (BR-125)

1. Đơn có `tableMove` khi nhóm đổi bàn **sau giờ đặt đơn** và bàn hiện tại khác bàn lúc đặt; "đổi từ" = bàn lúc đặt, giờ = lần chuyển cuối.
2. Nhãn chỉ ở đơn mới / đang pha, 10 phút từ lần chuyển cuối; nút in ở đơn đã được làm hoặc chờ làm (đơn đang giữ chưa làm → chỉ nhãn).
3. Phiếu pha không có giá; khổ theo máy (58 / 80 mm).
4. Tự trả bàn: Tắt / 15 / 30 / 60 phút, mặc định 30; chỉ chủ quán đổi; điều kiện đóng như BR-124 mục 4.
5. Thẻ xin chuyển ghi số nhóm khác đang ở bàn đích; chuyển tới bàn có người vẫn bill riêng (F-049), trả chung bằng "Thu chung với bàn khác" (F-057).

## API

- Đơn hàng (`GET /api/orders`, `GET /api/orders/{id}`, sự kiện `order.*`): thêm `tableMove: { fromTable, fromTableId, movedAt } | null`.
- `GET/PUT /api/admin/settings`: `idleCloseMinutes` ∈ {0, 15, 30, 60} (`400` giá trị khác; quản lý cửa hàng `403 OWNER_ONLY`).
- `POST /api/admin/jobs/close-idle-tables/run` → `info = { minutes, checked, closed }` hoặc `{ off: true, checked: 0, closed: 0 }`.
- `GET /api/staff-calls`, `session.staff_called`: yêu cầu `MOVE` có `toTable.openGroups`.
- `session.opened` (room `staff`): cả khi khách quét QR mở nhóm mới (`byGuest: true`).

## Acceptance Criteria

- AC-087-01: Đơn đặt ở Bàn F1 (đang pha), nhóm chuyển sang Bàn F2 → danh sách đơn + chi tiết đơn có `tableMove` (đổi từ Bàn F1, lúc chuyển), bàn = Bàn F2; đơn đặt sau khi chuyển → `null`; chuyển tiếp F2 → F3 → vẫn "đổi từ Bàn F1", giờ = lần chuyển cuối, đơn đặt ở F2 "đổi từ Bàn F2"; sự kiện `order.status_changed` có `tableMove`; quay về đúng bàn lúc đặt → `null`.
- AC-087-02: Mặc định 30 phút; chỉ nhận 0 / 15 / 30 / 60 (45, -1, chữ → 400); quản lý cửa hàng → 403 `OWNER_ONLY`; Tắt → job `{ off: true }`, nhóm trống 31 phút còn mở; 60 → 31 phút còn, 61 phút đóng (`IDLE_EMPTY`); 15 → 16 phút đóng, 14 phút còn.
- AC-087-03: Xin chuyển sang Bàn H2 đang có 1 nhóm → `toTable.openGroups = 1` (danh sách + sự kiện quầy); đổi ý sang Bàn H3 trống → 0; Gọi nhân viên thường `toTable = null`; khách quét QR mở nhóm mới → quầy nhận `session.opened` (`byGuest: true`).
- AC-087-04: (điện thoại + máy quầy) Đơn ở Bàn X5 đã tiếp nhận, khách nhờ quầy chuyển sang Bàn X6 → thẻ "Bàn X6 đang trống"; nhóm khác vào Bàn X6 → thẻ tự đổi "Bàn X6 đang có 1 nhóm khác"; "Chuyển" → thông báo "Thu chung với bàn khác" + "còn 1 đơn chưa ra món, mang ra Bàn X6"; thẻ đơn: bàn X6, nhãn "Đổi bàn: Bàn X5 → Bàn X6", nút "In phiếu bàn mới" mở khung in `mode=ticket`; phiếu pha: "PHIẾU PHA — ĐỔI BÀN", "Bàn X6", "(đổi từ Bàn X5 lúc …", mã đơn, món, không giá.
- AC-087-05: (chủ quán) Cài đặt → "Tự trả bàn khách quét QR nhưng không gọi món" mặc định "30", chọn "Sau 60 phút" → Lưu → máy chủ 60, tải lại vẫn 60.

## Bằng chứng

`tests/table-move-followup.test.js` (AC-087-01…03) · E2E "hoàn thiện đổi bàn: …" (AC-087-04), "chủ quán chọn thời gian tự trả bàn trống…" (AC-087-05).
