---
name: quy-trinh-1-cham
description: Quy trình 1 chạm ở màn Đơn hàng cho cafe-qr-app (FEATURE-076, ADR-034, TASK-093) — cài đặt pos.one_tap (mặc định bật; test cũ tắt), cột "Cần làm" gộp đơn mới + đơn đang pha, nút "Xong" = tiếp nhận + hoàn tất (trừ kho, báo khách), cột "Đang pha" ẩn, thời gian làm món của đơn nhận + xong cùng lúc tính từ lúc có thể bắt đầu (etaRepo.recomputePrepStats). Dùng khi task giao F-076 / ADR-034 / TASK-093 / AC-076-xx, hoặc nhắc "1 chạm", "Cần làm", "nút Xong", "bỏ cột Đang pha", "gộp cột", "đỡ thao tác", "oneTap", "pos.one_tap", "thời gian pha 0 giây".
---

# Mục đích

Ghi lại **quy trình 1 chạm** (07/11/2026, TASK-093) để agent sau sửa / mở rộng mà không phá trừ kho, báo khách, luật hủy món hay thống kê thời gian chờ.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-034-quy-trinh-1-cham.md` (D-153…D-155) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-076.md` (AC-076-01…03) |
| Business rule | BR-114 · Task / kế hoạch: `TASK-093.md`, `TASK-093-plan.md` |

# Khi dùng

- Đổi bố cục màn Đơn hàng, thêm màn "Cần làm" riêng cho người pha (phân quyền theo vị trí — TASK-095), đổi ngưỡng 10 giây, chủ quán hỏi "sao không thấy cột Đang pha" / "thời gian chờ báo sai".

# Quy tắc (BR-114)

- `pos.one_tap` (`settingsService.oneTap`, mặc định **bật** — `!== 'false'`); chỉ ADMIN đổi (`PUT /api/admin/settings`); máy quầy đọc `current.pos.oneTap` từ `/api/auth/me` lúc mở trang (đổi xong phải tải lại).
- Bật: `renderBoard` gộp `PENDING` chưa giữ + `PREPARING` vào `#col-PENDING` (sắp theo `readySince`), đơn đang giữ ở cuối, `PREPARING` rỗng; `#h-pending` = "Cần làm"; `.col-preparing` ẩn; `#board.one-tap` (lưới phiếu). Nút `.btn-done` "Xong": đơn mới → `acceptAndComplete`, đơn đang pha → `complete`; Hủy chỉ đơn mới; hộp chi tiết đơn cũng có "Xong".
- **Máy chủ không đổi:** trạng thái vẫn đủ PENDING → PREPARING → COMPLETED, trừ kho ở `sp_CompleteOrder`, báo khách theo sự kiện cũ, luật hủy món (F-046) theo trạng thái.
- Thống kê thời gian làm (`recomputePrepStats`): `DATEDIFF(AcceptedAt, CompletedAt) < 10` → bắt đầu = max(`ReadyAt` (tới / hết giữ), `LAG(CompletedAt)`); còn lại từ `AcceptedAt`; vẫn lọc 1–7200 giây, bỏ đơn gửi bù (F-074).

# Chỗ dễ sai

- Đừng bỏ trạng thái `PREPARING` ở máy chủ để "gọn" — mất báo khách "đang làm" và luật hủy món.
- Test / E2E cũ viết cho 3 cột: dữ liệu test ghi `pos.one_tap = false` (`tests/helpers/testDb.js`, `kịch-bản/e2e-server.js`); test mới tự bật và **tắt lại** cuối bài.
- Test thống kê: đặt mốc giờ bằng SQL và đẩy các đơn khác ra xa (`LAG` lấy đơn xong ngay trước).

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Số liệu: `TASK-093.md`.
