# FEATURE-024 — Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn

> **Nguồn:** yêu cầu chủ dự án 16/10/2026: "thêm cơ chế nhập bàn thủ công vì nhiều khách chưa sử dụng thành thạo công nghệ — nhân viên ra order rồi nhập thủ công vào máy, và nhân viên có thể ghi chú trong bàn để nhớ". Câu hỏi xác nhận mặc định: [Q-021](../open-questions.md).

- **Status:** PROPOSED (mặc định do agent chọn, chờ chủ dự án xác nhận Q-021) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:** STAFF, ADMIN. Khách chỉ bị ảnh hưởng gián tiếp: quét QR vào bàn nhân viên đã mở thì "Gộp chung nhóm" được.
- **Màn hình:**
  - **S-16 Gọi món tại bàn** (`/pos/table-order`, mục "Gọi món tại bàn" trên thanh quầy):
    - **Sơ đồ bàn:** trống / đang phục vụ (xanh) / gọi thanh toán (vàng); 📝 = có ghi chú; số đỏ = món đã chọn chưa gửi.
    - **Chọn món:** tab danh mục + Combo, bảng tùy chọn món, ghi chú từng món. Giống màn bán mang đi.
    - **Giỏ của bàn:** lưu riêng từng bàn trên máy quầy.
    - **Ô ghi chú bàn.**
    - **Nút "Gửi đơn Bàn …".**
    - **Danh sách đơn đã gọi** của nhóm, kèm nút "Thu tiền bàn này".
  - **S-10 Đơn hàng** (`/pos`):
    - Thẻ bàn đang phục vụ có thêm dòng 📝 ghi chú và các nút **Gọi món** / **Ghi chú** (sửa ghi chú trong hộp thoại).
    - Phiếu đơn ghi "Nhân viên nhập: …".
    - Drawer thu tiền hiện ghi chú, có nút "Gọi thêm món" / "Ghi chú bàn".
    - Nút **+ Gọi món tại bàn** ở đầu bảng bàn.
- **Dữ liệu:** migration `0014_goi_mon_tai_ban.sql` thêm vào `Sessions`:
  - `OpenedBy` — NULL = khách quét QR mở;
  - `Note` NVARCHAR(200);
  - `NoteUpdatedAt`, `NoteUpdatedBy`.

  `sp_SubmitOrder` có thêm tham số `@AcceptNow`. Đơn do nhân viên nhập lưu `Orders.CreatedBy`.

## Quy tắc (mặc định đã áp dụng — Q-021)

1. **Đơn nhân viên nhập vào thẳng `PREPARING`** (đã tiếp nhận, `AcceptedAt` = lúc gửi). Nhân viên tự hỏi khách nên không cần bấm "Tiếp nhận" lần nữa. Kho vẫn **giữ lúc gửi** (ADR-001), trừ khi Hoàn tất như mọi đơn.
2. **Không phụ thuộc công tắc "nhận đơn QR" và giờ bán theo danh mục** (F-020), giống bán mang đi: quầy tự quyết.
3. **Giá và khuyến mãi tính bằng cùng bộ pricing** với đơn khách (ADR-005 D-7, D-8). Thu tiền như bàn QR: hội viên, giảm tay, làm tròn, cần ca mở (F-018). Gửi đơn **không** cần ca, vì chưa thu tiền.
4. **Mở bàn:**
   - Bàn trống → nhân viên mở phiên, có thể kèm ghi chú, chưa cần gọi món.
   - Bàn **đang có nhóm** → `409 TABLE_OCCUPIED` kèm danh sách nhóm, trừ khi chọn rõ **"Nhóm mới"** (hóa đơn riêng).
   - Server **khóa dòng bàn** khi mở, nên hai máy quầy mở cùng một bàn trống chỉ tạo **một** phiên.
5. **Nhóm đang chọn vừa thanh toán / đóng ở máy khác** → trang chuyển sang "Nhóm mới", không gộp nhầm vào hóa đơn nhóm khác. Gửi vào phiên đã đóng → `409 SESSION_CLOSED`.
6. **Khách quét QR vào bàn nhân viên đã mở:**
   - thấy "Bàn đang có người" → **Gộp chung nhóm** được (FEATURE-001);
   - thấy và gọi thêm các đơn trong nhóm. Đơn khách tự gửi vẫn ở "Mới" chờ tiếp nhận.
7. **Ghi chú bàn chỉ nhân viên thấy:**
   - Gắn với **phiên (nhóm khách)**, không gắn với bàn vật lý. Thu tiền xong là hết, lịch sử vẫn giữ trong DB.
   - Tối đa 200 ký tự; để trống = xóa.
   - Không in lên hóa đơn.
   - **Không trả cho khách:** API khách bỏ `note`, `noteUpdatedAt`, `noteUpdatedBy`, `openedBy`. Sự kiện `session.note_changed` chỉ phát tới room `staff`.
8. **Chống bấm 2 lần:** gửi kèm `Idempotency-Key`. Cùng key trong 60 giây → trả lại cùng đơn.

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/tables` | STAFF/ADMIN | Bàn đang bật + `sessions[]` chưa đóng của từng bàn (kèm `note`, `openedBy`). Không trả mã QR |
| `POST /api/tables/{id}/sessions { note?, newGroup? }` | STAFF/ADMIN | `201 { session }`. `404 TABLE_NOT_FOUND` (không có / đang tắt). `409 TABLE_OCCUPIED { sessions }` |
| `POST /api/sessions/{id}/orders { items, note? }` + header `Idempotency-Key` | STAFF/ADMIN | `201 { order }` — `status: PREPARING`, `createdBy`. Lỗi như đơn khách (`OUT_OF_STOCK`, `ITEM_UNAVAILABLE`, `INVALID_OPTIONS`, `SESSION_CLOSED`) |
| `PUT /api/sessions/{id}/note { note \| null }` | STAFF/ADMIN | `{ session }`. `404`; `409 SESSION_CLOSED` |
| `GET /api/sessions`, `GET /api/sessions/{id}` (nhân viên) | STAFF/ADMIN | Có thêm `note`, `noteUpdatedAt`, `noteUpdatedBy`, `openedBy`. Khách gọi cùng endpoint thì **không** có các trường này |

Realtime (room `staff`):

- `session.opened { sessionId, table, session }`;
- `session.note_changed { sessionId, table, note, noteUpdatedAt, noteUpdatedBy }`.

Đơn mới phát `order.created` như cũ, tới quầy và phòng của phiên.

## Acceptance Criteria

- **AC-024-01:** Nhân viên mở bàn trống kèm ghi chú → phiên `OPEN` có `openedBy`, `note`. Sơ đồ bàn và danh sách bàn đang phục vụ hiện ghi chú. Các máy quầy nhận `session.opened`.
- **AC-024-02:** Nhân viên gửi đơn vào phiên:
  - đơn `DINE_IN`, `PREPARING`, có `acceptedAt`, `createdBy`, chưa thu;
  - giữ nguyên liệu như đơn QR;
  - quầy nhận `order.created`.
- **AC-024-03:** Khách quét QR bàn nhân viên đã mở → `OCCUPIED`, gộp nhóm được, thấy đơn nhân viên đã nhập. Mọi response cho khách **không** có ghi chú bàn / người mở bàn.
- **AC-024-04:** Bàn đang có nhóm, mở lại không chọn "Nhóm mới" → `409 TABLE_OCCUPIED`. Chọn "Nhóm mới" → nhóm thứ 2.
- **AC-024-05:** Hai máy quầy cùng mở một bàn trống đồng thời → đúng 1 phiên được tạo, máy kia nhận `409`.
- **AC-024-06:** Đang tạm ngưng nhận đơn QR → khách `503 STORE_CLOSED`, nhân viên vẫn gửi đơn tại bàn được.
- **AC-024-07:** Sửa ghi chú → quầy nhận `session.note_changed`; điện thoại khách trong phiên **không** nhận. Ghi chú rỗng → `null`. Phiên đã thu tiền → `409`.

## Bằng chứng

- `ứng-dụng/máy-chủ/tests/table-order.test.js` — 11 test, gồm AC-024-01…07, Idempotency-Key, gọi thêm sau khi gọi thanh toán → phiên về `OPEN`, đã thu → `SESSION_CLOSED`, kiểm tra đầu vào + quyền.
- E2E `kiểm-thử/e2e/flow.spec.js` → "gọi món tại bàn: …": mở Bàn 04 kèm ghi chú → 2 Cà phê đen (ghi chú món) + Nước suối = 60.000đ → Đang pha → khách quét QR gộp nhóm, không thấy ghi chú → sửa ghi chú → thu tiền.
- Hướng dẫn người dùng: [`chức-năng-mới/13-gọi-món-tại-bàn.md`](../../chức-năng-mới/13-gọi-món-tại-bàn.md).
