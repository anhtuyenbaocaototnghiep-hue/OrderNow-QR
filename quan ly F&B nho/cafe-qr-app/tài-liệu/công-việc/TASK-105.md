# TASK-105 — Hoàn thiện đổi bàn (F-087)
Status: READY_FOR_REVIEW (10/11/2026)
Quyết định: [ADR-048](../quyết-định/ADR-048-hoan-thien-doi-ban.md) D-211…D-213 · Feature: [FEATURE-087](../chức-năng/FEATURE-087.md) (US-087-1/2, AC-087-01…05) · BR-125 · Sửa DEF-029
Module: MOD-ORDER, MOD-ADMIN · Màn hình: SCR-10 (Máy quầy — Đơn hàng), SCR-12 (Trang in), SCR-33 (Cài đặt)
Nguồn: chủ dự án 10/11/2026 chọn đề xuất 1–3 trong [TASK-104](TASK-104.md): "Món đang pha lúc khách đổi bàn… nhãn "Đổi bàn → Bàn B" trong 10 phút, kèm nút in lại phiếu. Thời gian tự đóng bàn trống: cho chủ quán chọn 15 / 30 / 60 phút hoặc tắt. Thẻ xin chuyển bàn nên ghi bàn đích đang có người hay không… tiến hành làm cho tôi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-105-hoan-thien-doi-ban` chồng lên `task/TASK-104-doi-ban-khi-quet` (chưa gộp `main`) · Kế hoạch: [TASK-105-plan.md](../kế-hoạch/TASK-105-plan.md)

## Đính chính
Đề xuất 1 viết "phiếu pha đã in vẫn ghi bàn cũ" — kiểm lại thì **app chưa có in phiếu pha** (chỉ in hóa đơn / tạm tính). Làm đúng ý chủ dự án nhưng nút là **"In phiếu bàn mới"**: in một phiếu pha mới (bàn mới thật to, đổi từ bàn nào, món, ghi chú, không giá).

## Mục tiêu
Nhóm đổi bàn giữa chừng thì người pha / người mang món không mang nhầm bàn; chủ quán tự chọn lúc nào trả bàn trống; nhân viên biết bàn đích có người trước khi chuyển.

## Phạm vi
1. Máy chủ: `ordersRepo` (`tableMove` từ `SessionTableMoves`), `settingsService` + route cài đặt (`idleCloseMinutes`), `sessionService.closeIdleEmpty` đọc cài đặt, nhãn job, `staffCallsRepo` (`toTable.openGroups`), `sessionService.announceOpened` (DEF-029).
2. Giao diện: `pos-dashboard.js` (nhãn `.move-flag`, nút in, thông báo, dòng bàn đích trên `.move-card`), `pos-receipt.js` (`mode=ticket`), `print.css`, `pos.css`, `admin-settings.js` (thẻ "Bàn trống").
3. Test: `tests/table-move-followup.test.js` (AC-087-01…03), E2E AC-087-04, 05.
4. Tài liệu + skill `doi-ban-khi-quet` (bản gốc `skill doi ban khi quet.md`).

## Không được sửa
Quy tắc chuyển bàn F-049 (bill riêng khi bàn đích có nhóm khác), thu chung F-057, quyền chuyển bàn (vị trí Phục vụ), điều kiện tự đóng bàn trống (BR-124 mục 4 — chỉ đổi số phút), quyền cài đặt của quản lý cửa hàng (không mở thêm).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.

## Kết quả thực chạy (10/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **480/480 PASS** (thêm `table-move-followup.test.js` — 3 test) |
| `npm run test:e2e` | **85/85 PASS**, mã thoát 0 (thêm AC-087-04, 05). Lần chạy đầu hỏng bài cũ AC-049-05 ở câu "không còn thẻ đơn nào có chữ Bàn CB1" — thẻ giờ **cố ý** ghi "Đổi bàn: ~~Bàn CB1~~ → Bàn CB2". Sửa câu kiểm cho đúng ý cũ (ô tên bàn của thẻ là Bàn CB2, không thẻ nào ở Bàn CB1) + thêm kiểm nhãn đổi bàn — không nới lỏng |
| `npm run trace -- --check` | 188 US, 517 AC — PASS 517, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Đi luồng thật — điện thoại 390 px + máy quầy 1366 / 1920 px (staff1) + chủ quán (Cài đặt), CafeQrTest | 10 bước: gửi Latte (ghi chú) + Nước suối ở N1, quầy tiếp nhận; khách nhờ chuyển sang N2 → thẻ "Bàn N2 đang trống"; khách khác quét N2 → thẻ tự đổi "đang có 1 nhóm khác", lưới bàn có N2 ngay; "Chuyển" → nhắc Thu chung + "còn 1 đơn chưa ra món, mang ra Bàn N2", thẻ đơn có nhãn + nút in, điện thoại tự sang N2; bấm in → mở khung in `mode=ticket`; phiếu 80 / 58 mm không tràn; đơn hẹn "chờ bạn tới" đổi bàn N3 → N4 chỉ có nhãn; đồng hồ giả: 9 phút còn nhãn, 10,5 phút tự mất; hoàn tất → hết nhãn; Cài đặt chọn Tắt → job `{ off: true }`. Không lỗi trang / 5xx |

**Lỗi tìm ra trong lúc làm (đã sửa trong task):** (1) DEF-029 — khách quét QR tự mở nhóm không báo máy quầy (E2E mới bắt được: thẻ xin chuyển vẫn ghi "đang trống") → phát `session.opened` (`byGuest`). (2) Thêm `OUTER APPLY` mà quên cột trong SELECT → `tableMove` luôn rỗng (test AC-087-01 bắt). (3) Đi thử 1920 px: đơn hẹn "chờ bạn tới" (chưa làm) bị báo "1 đơn đang làm" → đổi câu "còn n đơn chưa ra món". (4) Nhãn ô chọn ở Cài đặt gãy dòng → nới khung.

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub. Máy demo của chủ dự án (cổng 3000) vẫn chạy bản cũ — cần chạy lại `2-chạy-app-demo.cmd` để dùng TASK-104 + TASK-105 (không có migration mới).
