# TASK-075 — Kế hoạch: phát hiện bất thường, cảnh báo qua email (FEATURE-060)

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Đóng ca | `shiftService.close()` → `shiftsRepo.close()` (`sp_CloseShift`); `shiftsRepo` có `cashIn`, `transferIn`, `paymentCount`, `transferCount`, `difference`, `openedBy`, `closedBy` |
| Hủy món | `dbo.OrderItemVoids` (`StockMode` RELEASE / RESTOCK / **WASTE** = đã pha, `Qty`, `CreatedBy`, `CreatedAt`; không có `ShiftId` → gán ca theo giờ mở–đóng) |
| Hoàn tiền | `dbo.Refunds` (`ShiftId`, `Amount`, `CreatedBy`); hook sau `refundService.refund()` |
| Giảm giá tay | `dbo.Payments.ManualDiscount > 0` (`ShiftId`, `ReceivedBy`) |
| Sổ quỹ đã duyệt bị hủy / sửa | `cashService.voidTxn()` (F-050) |
| Job nền | `src/jobs/scheduler.js` (`registerJob`, khóa trong Settings, `JobRuns`), đăng ký ở `src/jobs/index.js`; `JOBS_ENABLED=false` trong test → gọi hàm trực tiếp |
| Cài đặt | `settingsService` (`toSettings`, `KEYS`, `updateSettings`), route `PUT /api/admin/settings` (`routes/operations.js`) |
| Realtime | `realtime/io.js` (phòng `staff`, `public`, `session:*`) → thêm phòng `admin` cho role ADMIN |
| Nhật ký thao tác | `middleware/audit.js` ghi `settings.update`; trang `admin-audit.js` (thêm đọc `?userId=&from=&to=`) |
| `node_modules` | worktree trước dùng junction sang `cafe-qr-app` (phiên khác) → đã thay bằng `npm ci` riêng trước khi thêm `nodemailer` |

## Thiết kế
- `utils/anomaly.js` (hàm thuần, unit test): `baseline(values)` → `{ n, mean, sd }`; `judge({ value, fixed, floor, baseline, useStats, minShifts })` → `{ anomalous, reason }`.
- `alertsRepo`: tạo cảnh báo theo `DedupeKey` (UNIQUE → chạy lại không trùng), liệt kê, đổi trạng thái; số liệu ca + 30 ca trước bằng một truy vấn.
- `alertService`: `onShiftClosed(shiftId)`, `onRefund(refund)`, `onCashVoided(txn)`, `onAlertSettingsChanged(before, after, user)` (ban đầu `onRecipientsChanged` — review G3 mở rộng ra mọi khóa cảnh báo), `dailyDigest(date)`, `runDigests(now)`; tạo email đưa vào `AlertOutbox`; phát `alert.created` tới phòng `admin`.
- `mailService`: `nodemailer` (SMTP từ `.env`; `MAIL_TRANSPORT=json` cho test / E2E), `flush()` gửi hàng đợi (thử lại 1/5/15/60/240 phút, 20 email / giờ), `sendTest(emails)`, `status()`; `_setTransport()` cho test.
- Bộ gửi nền `src/jobs/alertMailer.js` (interval riêng 60 giây, không qua scheduler để không ghi `JobRuns` mỗi phút): mỗi lượt gửi tổng kết hôm nay khi tới giờ + bù hôm qua, rồi gửi hàng đợi. *(Đổi so với dự kiến ban đầu dùng `registerJob`.)*
- Lỗi phát hiện / gửi **không** làm lỗi đóng ca / hoàn tiền / sổ quỹ (bắt lỗi, ghi log).

## Test
- `tests/alerts.test.js`: unit `anomaly.js`; integration AC-060-01…08, 10 với bộ gửi giả (ghi lại email, có thể ép lỗi).
- E2E: Cài đặt + Gửi email thử (`MAIL_TRANSPORT=json`); đóng ca lệch két → trang Cảnh báo → Đã xem; a11y quét `/admin/alerts`.
- Rủi ro: dữ liệu thời gian (giờ quán UTC+7) cho tổng kết ngày; ca ở test dùng chung CSDL — dùng ngưỡng rõ ràng.
