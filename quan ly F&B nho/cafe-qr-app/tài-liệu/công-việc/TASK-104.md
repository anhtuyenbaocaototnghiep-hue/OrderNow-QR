# TASK-104 — Khách đổi bàn khi quét QR (F-086)
Status: READY_FOR_REVIEW (10/11/2026)
Quyết định: [ADR-047](../quyết-định/ADR-047-doi-ban-khi-quet.md) D-206…D-210 · Feature: [FEATURE-086](../chức-năng/FEATURE-086.md) (US-086-1/2, AC-086-01…07) · BR-124
Module: MOD-ORDER · Màn hình: SCR-01 (Vào bàn), SCR-02 (Thực đơn), SCR-05 (Theo dõi đơn), SCR-10 (Máy quầy — Đơn hàng)
Nguồn: chủ dự án 10/11/2026 — câu hỏi "khách… qua bàn khác quét QR thì chuyện gì xảy ra và giải quyết như thế nào" → đề xuất → "ok tiến hành làm bạn nhớ là chuyên gia và là một khách hàng nhớ test kỹ nếu có thêm đề xuất về vấn đề này hãy báo với tôi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-104-doi-ban-khi-quet` chồng lên `task/TASK-103-anh-nguyen-lieu` (chưa gộp `main`) · Kế hoạch: [TASK-104-plan.md](../kế-hoạch/TASK-104-plan.md)

## Mục tiêu
Khách đổi bàn rồi quét QR bàn mới: app nhận ra nhóm ở bàn cũ, chuyển đúng (giữ giỏ / món / hóa đơn), quầy xác nhận một chạm khi cần; bàn bỏ trống tự trả lại.

## Phạm vi
1. Migration 0057; thủ tục `sp_MoveSession` (khách tự chuyển), `sp_CloseEmptySession` (tự đóng).
2. Máy chủ: `scan` → `ELSEWHERE`; `move-here`; `move-request` (StaffCalls `MOVE`); `staff-calls/{id}/move`; job `close-idle-tables`; `session.closed` có `reason`.
3. Giao diện: màn hỏi ở `t-entry.js`; dòng chờ ở `t-track.js`; giữ giỏ ở `t-menu.js` + `customer.js`; thẻ yêu cầu ở `pos-dashboard.js`.
4. Test: `tests/table-change.test.js` (AC-086-01…05), E2E AC-086-06, 07. Bộ E2E cũ dùng lại điện thoại thử cho khách khác ở 6 chỗ → thêm `newCustomer(ctx)` (bỏ cookie danh tính máy) vì app giờ hỏi đúng như với khách thật.
5. Tài liệu + skill `doi-ban-khi-quet` (bản gốc `skill doi ban khi quet.md`).

## Không được sửa
Quy tắc chuyển bàn F-049 (bill riêng khi bàn đích có nhóm khác), thu chung F-057, quyền chuyển bàn (vị trí Phục vụ), Gọi nhân viên F-021 (chờ 60 giây).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0057).

## Kết quả thực chạy (10/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **477/477 PASS** (thêm `table-change.test.js` — 5 test) |
| `npm run test:e2e` | **83/83 PASS**, mã thoát 0 (thêm AC-086-06, 07). Lần chạy đầu hỏng bài "chia bill" vì điện thoại thử A còn nhóm chưa thanh toán ở bài trước → app hỏi "đang có nhóm ở bàn khác" (đúng với khách thật) → thêm `newCustomer()` ở 6 chỗ bài test cố ý là khách khác |
| `npm run trace -- --check` | 186 US, 512 AC — PASS 512, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Đi luồng thật — điện thoại 390 px + máy quầy 1366 px (staff1), CafeQrTest | 6 tình huống: (1) chưa gửi món → "Chuyển sang Bàn M2", giỏ 2 món còn nguyên, quầy: M1 trống, M2 "Chuyển từ Bàn M1"; (2) đã gửi món → "Nhờ quầy chuyển" → dòng chờ → máy quầy thẻ "Bàn M3 → Bàn M4" → "Chuyển" → điện thoại tự sang M4, thẻ biến mất; (3) "Gọi món riêng" → nhóm mới M6, quét lại M5 vào nhóm cũ; (4) "Bỏ qua" → điện thoại báo "Quầy chưa chuyển bàn…", dòng chờ biến mất; (5) hai điện thoại chung nhóm → chỉ có "Nhờ quầy chuyển" / "Gọi món riêng", "Quay lại Bàn M8" đúng; (6) quầy "Đóng bàn trống" khi khách đang chọn → nhóm mới, giỏ 2 món còn, lời nhắn "Quầy vừa đóng bàn trống…". Không lỗi trang |

**Lỗi tìm ra trong lúc đi thử (đã sửa trong task):** điện thoại có hai nhóm (đã "Gọi món riêng") quét bàn thứ ba → bản đầu hỏi về nhóm trống mở gần nhất, bỏ quên nhóm có món → sắp nhóm đã gửi món trước + lựa chọn cho nhóm còn lại (AC-086-04); lời nhắn giữ giỏ không hiện (màn vào bàn chuyển đi ngay) → chuyển tiếp lời nhắn; lời nhắn "Bàn trống lâu…" hiện cả khi quầy đóng tay → tách lời nhắn theo lý do; thông báo nổi lặp dòng chờ → bỏ.

## Đề xuất thêm (chưa làm — chờ chủ dự án xem)
1. **Món đang pha khi nhóm đổi bàn:** phiếu pha đã in / người mang món vẫn nhớ bàn cũ. Đề xuất: thẻ đơn ở quầy hiện nhãn nổi "Đổi bàn → Bàn B" trong 10 phút sau khi chuyển + nút in lại phiếu pha.
2. **Chủ quán chỉnh thời gian tự đóng bàn trống** ở Cài đặt (15 / 30 / 60 phút hoặc tắt) — quán có khách ngồi chờ bạn lâu mới gọi.
3. **Thẻ "xin chuyển bàn" cho biết bàn đích đang có người** ("Bàn B đang có 1 nhóm") để nhân viên chọn chuyển hay thu chung khi tính tiền.
4. **Chống gọi món từ xa:** ảnh chụp mã QR gửi cho người ngoài quán vẫn gọi món được (đơn vẫn phải quầy Tiếp nhận nên rủi ro thấp). Có thể chỉ nhận đơn khi điện thoại dùng Wi-Fi của quán, hoặc in QR có mã đổi theo ngày.

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
