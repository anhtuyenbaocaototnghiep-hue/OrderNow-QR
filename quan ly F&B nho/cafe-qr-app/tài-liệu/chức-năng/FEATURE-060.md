# FEATURE-060 — Phát hiện bất thường, cảnh báo qua email

> **Nguồn:** chủ dự án 27/10/2026. Quyết định: [ADR-020](../quyết-định/ADR-020-canh-bao-bat-thuong-email.md) D-75…D-78.

- **Status:** CONFIRMED (ADR-020) · Triển khai: [TASK-075](../công-việc/TASK-075.md)
- **Actor:** **ACT-ADMIN** (cài đặt, xem / xử lý cảnh báo, nhận email). Dữ liệu sinh ra từ thao tác của **ACT-STAFF / ACT-LEAD** (đóng ca, hoàn tiền, hủy món, giảm giá, sổ quỹ).
- **Màn hình:**
  - **Cài đặt** (SCR-33): thẻ **"Cảnh báo bất thường qua email"** — email nhận (tối đa 5, cách nhau dấu phẩy), 3 loại email, giờ tổng kết, giờ yên lặng, các ngưỡng, bật so với mức bình thường, trạng thái hộp thư gửi + lần gửi gần nhất, nút **"Gửi email thử"**.
  - **Cảnh báo bất thường** (SCR-47, `/admin/alerts`, nhóm "Thu chi & nhân sự"): danh sách cảnh báo (lọc Mới / Tất cả), mức độ, giá trị / ngưỡng / mức bình thường, người liên quan, nút **Đã xem**, **Đã xử lý** (ghi chú), link Nhật ký thao tác của ca; tự cập nhật khi có cảnh báo mới.
- **Dữ liệu:** bảng mới `Alerts`, `AlertOutbox` (migration 0040); khóa cài đặt `alert.*`.

## User Story

- **US-060-1:** Là chủ quán, tôi muốn app tự phát hiện các thao tác dễ gây thất thoát (lệch két, chuyển khoản lạ, hủy món đã pha, hoàn tiền, giảm giá tay, sửa sổ quỹ) và gửi email cho tôi, để biết ngay mà không phải tự soi sổ mỗi ngày.
- **US-060-2:** Là chủ quán, tôi muốn tự đổi email nhận cảnh báo trong Cài đặt và được báo khi ai đó đổi nó, để không ai giấu được cảnh báo.

## Quy tắc (BR-093 … BR-095)

**Dấu hiệu và ngưỡng mặc định** (chỉnh trong Cài đặt):

| Mã | Khi nào kiểm | Dấu hiệu | Ngưỡng cố định mặc định | So mức bình thường (≥ 10 ca trước) — mức tối thiểu |
| --- | --- | --- | --- | --- |
| `CASH_DIFF` | Đóng ca | \|tiền đếm − tiền dự kiến\| | > 20.000đ | không dùng |
| `TRANSFER_SHARE` | Đóng ca (ca có ≥ 5 lượt thu) | % lượt thu chuyển khoản | > 60% | ≥ 40% |
| `VOIDS` | Đóng ca | Số món **đã pha** bị hủy (`WASTE`) trong giờ ca | > 3 | ≥ 2 |
| `REFUNDS` | Đóng ca | Số lượt hoàn tiền của ca | > 2 | ≥ 2 |
| `MANUAL_DISCOUNT` | Đóng ca | Số lượt thu có giảm giá tay | > 5 | ≥ 3 |
| `BIG_REFUND` | Ngay khi hoàn | Một lượt hoàn tiền | ≥ 200.000đ | — |
| `CASH_VOID` | Ngay khi hủy / sửa | Khoản sổ quỹ **đã duyệt** bị hủy / sửa | luôn cảnh báo | — |

- "Mức bình thường" = trung bình + 2 độ lệch chuẩn của dấu hiệu đó trên **30 ca đã đóng gần nhất** trước ca đang xét (cần ≥ 10 ca). Bất thường khi **vượt ngưỡng cố định**, hoặc **vượt mức bình thường và không dưới mức tối thiểu**. Có thể tắt phần so mức bình thường.
- Một ca chỉ có tối đa một cảnh báo mỗi dấu hiệu; chạy lại không tạo trùng.
- Email: người nhận tối đa 5 địa chỉ hợp lệ, không trùng (trống = không gửi email, cảnh báo vẫn lưu trong app); 3 loại bật / tắt riêng (mặc định bật cả 3); tổng kết ngày mặc định 22:00; giờ yên lặng mặc định tắt. Báo cáo đóng ca gửi cả khi không có gì bất thường ("két khớp ✔").
- Đổi **cài đặt cảnh báo** (danh sách email nhận, bật / tắt loại email, giờ, ngưỡng, so mức bình thường) → thư báo tới cả địa chỉ cũ lẫn mới, ghi Trước → Sau (không bị giờ yên lặng hoãn). Chỉ đổi thứ tự email → không tính là đổi.
- Hàng đợi: lỗi gửi → thử lại 5 lần sau 1 / 5 / 15 / 60 / 240 phút (6 lần gửi), vẫn lỗi → `FAILED`, quản lý bấm **"Gửi lại email lỗi"** ở Cài đặt sau khi sửa hộp thư; tối đa 20 email / giờ (tính cả email thử); email trong giờ yên lặng hoãn tới hết giờ yên lặng. Tổng kết ngày = **24 giờ tính tới giờ gửi** (mặc định 22:00 hôm trước → 22:00 hôm nay; ca đóng / tiền thu sau giờ gửi vào tổng kết hôm sau; giờ gửi 00:00 = trọn ngày hôm trước); tổng kết **hôm qua** bị lỡ (máy tắt) được gửi bù khi app chạy lại, nếu email nhận đã lưu từ trước mốc gửi của hôm qua.
- Chỉ ADMIN; sự kiện realtime `alert.created` chỉ tới phòng `admin`. Email không chứa SĐT / tên hội viên. Mật khẩu hộp thư chỉ ở `.env`.

## API

| Method & path | Mô tả |
| --- | --- |
| `GET /api/admin/settings`, `PUT /api/admin/settings` | Thêm `alertEmails` (mảng), `alertImmediate`, `alertShiftReport`, `alertDailyDigest` (bool), `alertDigestTime`, `alertQuietStart`, `alertQuietEnd` (`HH:MM` hoặc rỗng), `alertCashDiffMax`, `alertTransferShareMax`, `alertVoidsMax`, `alertRefundsMax`, `alertRefundBig`, `alertManualDiscountMax`, `alertUseStats` |
| `GET /api/admin/alerts?status=NEW\|ALL&limit=` | Danh sách cảnh báo mới nhất trước |
| `PATCH /api/admin/alerts/{id}` | `{ status: 'SEEN' \| 'RESOLVED', note? }` |
| `GET /api/admin/alerts/mail-status` | `{ configured, from, transport, pending, failed, lastSent, lastError }` — không có mật khẩu |
| `POST /api/admin/alerts/test-email` | `{ emails: string[] }` → gửi ngay một email thử → `{ ok, error? }` (tính vào giới hạn mỗi giờ) |
| `POST /api/admin/alerts/mail-retry` | Email `FAILED` xếp lại để gửi → `{ requeued }` |
| Sự kiện `alert.created` (phòng `admin`) | `{ alert }` |

## Acceptance Criteria

- AC-060-01: Quản lý lưu 1–5 email nhận, loại email, giờ tổng kết, giờ yên lặng, ngưỡng → `GET /api/admin/settings` trả đúng; email sai dạng / > 5 / giờ sai / ngưỡng ngoài khoảng → `400 VALIDATION_ERROR`, cài đặt không đổi; nhân viên / trưởng ca → `403`.
- AC-060-02: Đóng ca vượt ngưỡng (lệch két, % chuyển khoản, hủy món đã pha, hoàn tiền, giảm tay) → mỗi dấu hiệu một cảnh báo trong app (giá trị, ngưỡng, người liên quan) + **một** email báo cáo ca tới các email nhận, tiêu đề có ⚠️; ca không bất thường → không cảnh báo, email "két khớp ✔"; tắt loại "báo cáo đóng ca" → không email, cảnh báo vẫn có.
- AC-060-03: Hoàn tiền ≥ mức lớn và hủy / sửa khoản sổ quỹ đã duyệt → cảnh báo + email tức thì; tắt loại "tức thì" → chỉ cảnh báo trong app.
- AC-060-04: So mức bình thường: giá trị vượt trung bình + 2 độ lệch chuẩn (đủ 10 ca) và ≥ mức tối thiểu → bất thường dù chưa vượt ngưỡng cố định; chưa đủ 10 ca hoặc dưới mức tối thiểu → không; email / cảnh báo ghi "bình thường …".
- AC-060-05: Đổi danh sách email nhận → thư báo tới **cả** địa chỉ cũ và mới; tắt loại email / đổi ngưỡng cũng có thư báo (ghi Trước → Sau); chỉ đổi thứ tự email → không báo; Nhật ký thao tác ghi lần đổi.
- AC-060-06: Gửi lỗi → thử lại 5 lần sau 1 / 5 / 15 / 60 / 240 phút, vẫn lỗi → `FAILED` (hiện ở trạng thái gửi); "Gửi lại email lỗi" xếp lại và gửi; không gửi trùng; phát hiện / ghi cảnh báo lỗi không làm lỗi đóng ca / hoàn tiền / hủy sổ quỹ; email tạo trong giờ yên lặng hoãn tới hết giờ yên lặng.
- AC-060-07: Tổng kết ngày gửi ở giờ đã cài, số liệu 24 giờ tính tới giờ gửi: doanh thu tiền mặt / chuyển khoản, số lượt thu, các ca và lệch két, cảnh báo; giờ gửi 00:00 → trọn ngày hôm trước; hôm qua bị lỡ → gửi bù (chỉ khi email nhận đã lưu từ trước mốc gửi hôm qua); không gửi hai lần cùng một mốc.
- AC-060-08: Trang Cảnh báo: chỉ ADMIN; lọc Mới / Tất cả; Đã xem / Đã xử lý (có ghi chú); `alert.created` tới phòng `admin`, socket nhân viên không nhận.
- AC-060-09: Trên trình duyệt: quản lý nhập email + "Gửi email thử" → báo đã gửi; đóng ca lệch két → trang Cảnh báo hiện cảnh báo lệch két → bấm "Đã xem" → hết khỏi danh sách Mới.
- AC-060-10: Email không có SĐT / tên hội viên (SĐT trong lý do nhân viên gõ bị che, cả dạng có cách / chấm / gạch / +84); `mail-status` không trả mật khẩu; "Gửi email thử" khi chưa cấu hình hộp thư gửi → báo lỗi rõ ("Chưa cấu hình hộp thư gửi …"); email thử tính vào giới hạn mỗi giờ.

## Bằng chứng

`tests/alerts.test.js` · E2E "cảnh báo bất thường…" (AC-060-09).
