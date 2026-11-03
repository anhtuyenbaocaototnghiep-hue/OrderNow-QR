# TASK-083 — Vòng quay may mắn sau khi thanh toán + Ra món khi bạn bè tới
Status: READY_FOR_REVIEW (03/11/2026)
Quyết định: [ADR-024](../quyết-định/ADR-024-vong-quay-hen-gio-ra-mon.md) D-89…D-94 · Feature: [FEATURE-065](../chức-năng/FEATURE-065.md), [FEATURE-066](../chức-năng/FEATURE-066.md) · BR-102, BR-103
Module: MOD-LOYALTY, MOD-BILLING, MOD-ORDER, MOD-NOTIFY · Màn hình: SCR-49 (mới, `/quay/{mã}`), SCR-03 (giỏ), SCR-05 (theo dõi đơn), SCR-10 (quầy), SCR-12 (hóa đơn), SCR-40 (Tích điểm & voucher)
Nguồn: chủ dự án 03/11/2026 — chọn ý 1 "Vòng quay may mắn sau khi thanh toán" và ý 4 "Ra món khi bạn bè tới", "tiến hành làm cái này rồi làm ra thành file skill.md". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-083-vong-quay-hen-gio-ra-mon` chồng lên `task/TASK-082-hoi-vien-de-theo-doi` (chưa gộp `main`) · Kế hoạch: [TASK-083-plan.md](../kế-hoạch/TASK-083-plan.md)

## Mục tiêu
- Khách có lý do quay lại: hóa đơn in QR, quét là quay một lần, trúng voucher cho lần sau hoặc điểm hội viên; chủ quán tự đặt quà, tỷ lệ và số quà tối đa mỗi ngày nên không lỗ.
- Nhóm bạn đến lệch giờ: người tới trước gọi cho cả nhóm, hẹn quán làm khi bạn tới (hoặc sau 10 / 20 phút) — đồ uống không nguội / tan đá, quầy không bị chuông giả.

## Phạm vi
1. Migration 0043 (`Orders.HoldMode / HoldUntil / ReleasedAt`, voucher nguồn `GAME`, `SpinPrizes`, `LuckySpins`), SP mới `sp_SpinLucky`, `sp_SubmitOrder` thêm `@HoldMode`, `@HoldMinutes`.
2. Máy chủ: `domain/luckySpin.js`, `luckySpinRepo`, `luckySpinService`, `routes/luckySpin.js`, mục `lucky-spin` ở `marketing.js`; hóa đơn thêm `luckySpin`; `orderService.release` + `order.released`; `etaRepo` bỏ đơn đang giữ.
3. Giao diện: giỏ "Khi nào làm món?"; theo dõi đơn (nhãn giữ, "Bạn đã tới — làm món", lượt quay ở màn cảm ơn); trang quay `/quay/{mã}`; quầy (phiếu giữ cuối cột Mới, chuông khi hết giữ); khối QR trên hóa đơn; tab "Vòng quay may mắn".
4. Test integration (10) + E2E (2); tài liệu; skill `vong-quay-va-hen-gio-ra-mon`.

## Không được sửa
Quy tắc voucher (một lần, khung thu tiền), quy tắc tích điểm, trạng thái đơn (không thêm trạng thái mới), luồng đơn nhân viên nhập (F-024), hành vi đơn không hẹn giờ.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (03/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **392/392 PASS** (37 file; thêm `lucky-spin.test.js` 7 test — AC-065-01…06, `hold-order.test.js` 3 test — AC-066-01…03) |
| `npm run test:e2e` | **60/60 PASS** (57 luồng + 3 khả năng tiếp cận; thêm 2 E2E — AC-065-07, AC-066-04; a11y quét thêm trang quay trước / sau khi quay và tab Vòng quay ở 320 / 390 px) |
| `npm run trace -- --check` | 149 US, 404 AC — PASS 404, GAP 0 |
| `npm run load:report` | NFR-002 10/10 vòng PASS; NFR-001 p95 221 ms |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0043 đã áp (chỉ thêm), chạy lại → `skip`; vòng quay **đang tắt** — chủ quán tự bật ở Tích điểm & voucher → Vòng quay may mắn |

Lỗi gặp khi chạy E2E và đã sửa: quầy vừa mở trang mà khách bấm "Bạn đã tới" ngay thì không có chuông (danh sách đơn đang giữ chỉ được ghi nhớ ở vòng kiểm 1 giây) → ghi nhớ ngay sau khi tải (`checkHolds()` cuối `loadAll`).

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
