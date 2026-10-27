# TASK-075 — Phát hiện bất thường, cảnh báo qua email
Status: READY_FOR_REVIEW (27/10/2026)
Quyết định: [ADR-020](../quyết-định/ADR-020-canh-bao-bat-thuong-email.md) D-75…D-78 · Feature: [FEATURE-060](../chức-năng/FEATURE-060.md) · BR-093…BR-095
Module: MOD-SHIFT, MOD-ADMIN, MOD-REPORT · Màn hình: SCR-33 (Cài đặt), SCR-47 (Cảnh báo bất thường)
Nguồn: chủ dự án 27/10/2026 ("tiến hành làm … gửi về email ghi trong cài đặt"). · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-075-canh-bao-email` tách từ `task/TASK-074-qr-wifi` (`c8c4f33`) · Kế hoạch: [TASK-075-plan.md](../kế-hoạch/TASK-075-plan.md)

## Mục tiêu
- Chủ quán nhận email khi có dấu hiệu thất thoát, đổi email nhận dễ dàng, không ai giấu được cảnh báo.

## Phạm vi
1. Migration 0040: `Alerts`, `AlertOutbox`.
2. `alertService` (5 dấu hiệu lúc đóng ca + 2 dấu hiệu tức thì + so mức bình thường), `mailService` (nodemailer, hàng đợi, thử lại, giờ yên lặng, tổng kết ngày gửi bù), job nền.
3. Cài đặt `alert.*`, API cảnh báo, phòng realtime `admin`.
4. Giao diện: thẻ Cài đặt, trang Cảnh báo bất thường (SCR-47), Nhật ký thao tác nhận bộ lọc từ đường dẫn.
5. Test integration + E2E; tài liệu (api-contract, data-model, screens-flows, BR, US, tc-map, secrets-register, local-development, `.env.example`).

## Không được sửa
- Cách tính tiền / két (`sp_CloseShift`), luồng hoàn tiền / sổ quỹ (chỉ gọi thêm sau khi commit), quyền hiện có.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Review G3 (agent độc lập, chỉ đọc, 27/10/2026) và cách xử lý
Không có lỗi nghiêm trọng về bảo mật / toàn vẹn dữ liệu (quyền ADMIN ở mọi endpoint, phòng `admin` theo vai trong CSDL, HTML email và trang cảnh báo đều thoát ký tự, zod chặn CRLF / dấu phẩy trong email, không lộ mật khẩu SMTP, nhận dòng hàng đợi nguyên tử, giờ UTC+7 đúng). Lỗi thật đã sửa:

| Phát hiện | Sửa |
| --- | --- |
| Tổng kết ngày tính trọn ngày nhưng gửi lúc 22:00 → ca đóng / tiền thu sau 22:00 không vào tổng kết nào; mốc 00:00 cho tổng kết gần như rỗng | Tổng kết = 24 giờ **tính tới mốc gửi** (22:00 hôm trước → 22:00 hôm nay), tiêu đề ghi khoảng giờ; mốc 00:00 = trọn ngày hôm trước |
| Lịch thử lại thực tế 1/5/15/60 phút rồi FAILED (bỏ mất 240 phút); email FAILED mất hẳn | `MAX_ATTEMPTS = RETRY_MINUTES.length + 1` (6 lần gửi); thêm `POST /api/admin/alerts/mail-retry` + nút "Gửi lại n email lỗi" ở Cài đặt |
| Chỉ báo khi đổi người nhận — quản lý khác vẫn "giấu" được bằng tắt loại email / nâng ngưỡng / giờ yên lặng cả ngày | Báo khi đổi **bất kỳ** khóa cảnh báo (`onAlertSettingsChanged`, ghi Trước → Sau) |
| Che SĐT bỏ sót `0912 345 678`, `+84 912…`; test "không lộ SĐT" không chứng minh gì (email đó không bao giờ tạo) | Regex mới (cả dấu cách / chấm / gạch, không che số tiền); test đưa SĐT vào lý do hoàn tiền **lớn** → kiểm email thật |
| Test "không có mật khẩu" chạy khi chưa có mật khẩu; "SMTP lỗi không làm lỗi đóng ca" không chạm SMTP | Test đặt mật khẩu dò rồi kiểm `mail-status`; test mới tạo trigger làm ghi `Alerts` lỗi thật → đóng ca / hoàn tiền / hủy sổ quỹ vẫn thành công |
| Bộ gửi nền gọi `flush()` thẳng, chồng với `kick()` → vượt giới hạn giờ | Dùng chung `flushOnce()` |
| "Gửi email thử" gửi thẳng, không giới hạn → token lộ có thể dùng Gmail của quán gửi hàng loạt | Kiểm + tính vào `MAIL_HOURLY_MAX` (ghi dòng `TEST` / `SENT`) |
| Xóa trống ô ngưỡng → `Number('') = 0` → mọi ca lệch đều báo | Ô trống gửi `undefined` (giữ giá trị cũ) |
| Đổi thứ tự email bị coi là đổi người nhận | So danh sách không kể thứ tự |
| Mức độ cảnh báo chỉ thể hiện bằng màu (WCAG 1.4.1) | Thêm chữ "Mức cao" / "Mức vừa" |
| Deadlock giữa chừng làm mất phần còn lại của lượt phát hiện | `onShiftClosed` / `onRefund` / `onCashVoided` bọc `withDeadlockRetry` (chạy lại an toàn nhờ khóa chống trùng; cảnh báo tức thì đã có thì vẫn xếp email) |
| (tự phát hiện) Xóa quản lý từng bấm "Đã xem" → lỗi khóa ngoại | `sp_DeleteUser` coi `Alerts.UserId` / `HandledBy` là lịch sử → xóa mềm; có test |

Chấp nhận, ghi ở ADR-020 D-78: quản lý có thể tự "Đã xử lý" cảnh báo về chính mình (trang luôn ghi người + giờ); app sập đúng giữa commit và bước phát hiện thì ca đó không được kiểm; socket bị hạ quyền vẫn ở phòng `admin` tới khi kết nối lại (giống phòng `staff` hiện có).

## Kết quả thực chạy (27/10/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **346/346 PASS** (32 file; mới `alerts.test.js` 13 test — bộ gửi email giả, không gửi thật kể cả khi `.env` có SMTP) |
| `npm run test:e2e` | **50/50 PASS** (47 luồng + 3 khả năng tiếp cận; thêm E2E "cảnh báo bất thường qua email…" với `MAIL_TRANSPORT=json`; a11y quét `/admin/alerts` và thẻ Cài đặt mới) |
| Cùng test mới chạy trên code cũ `c8c4f33` (worktree tạm, đã xóa) | Không bài nào qua — `ERR_MODULE_NOT_FOUND` (`alertService.js` chưa có), tiến trình thoát mã 1. Lần chạy đầu bị treo vì `after()` lỗi khi `before()` hỏng → sửa `after()` (`mailService?.`, `app?.close()`) |
| `npm run trace -- --check` | 140 US, 363 AC — PASS 363, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` lên `CafeQrDev` | Đã áp `0040` (27/10, sau commit `d4da99c`) — có `Alerts`, `AlertOutbox`; dữ liệu thử còn nguyên; chạy lại: mọi migration `skip` |

## Bàn giao cho chủ dự án
- Điền hộp thư gửi vào `.env` (không gửi mật khẩu qua chat): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<gmail gửi>`, `SMTP_PASS=<mật khẩu ứng dụng 16 ký tự>`, `MAIL_FROM=<tên quán> <gmail gửi>` — sổ bí mật S-11.
- Khởi động lại app → Quản lý → Cài đặt → "Cảnh báo bất thường qua email" → nhập email nhận → "Gửi email thử" → Lưu cài đặt.
- Chưa kiểm: gửi qua Gmail thật (cần mật khẩu ứng dụng của chủ dự án).

## Cần hỏi duyệt nếu
- Muốn thêm kênh Zalo / Telegram (ADR mới — ADR-020 chỉ chốt email).
- Muốn chặn quản lý tự "Đã xử lý" cảnh báo về chính mình.
