# TASK-074 — QR Wi-Fi cho khách in kèm QR bàn
Status: READY_FOR_REVIEW (27/10/2026)
Feature: [FEATURE-059](../chức-năng/FEATURE-059.md) · BR-092 · Quyết định liên quan: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-61 (khách vào app qua Wi-Fi của quán)
Module: MOD-ADMIN · Màn hình: SCR-33 (Cài đặt), SCR-22 (In mã QR)
Nguồn: chủ dự án 26/10/2026 — demo / chạy trong mạng nội bộ, "chuyển qua quét bằng wifi". · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-074-qr-wifi` tách từ `task/TASK-073-chuyen-khoan-gop-tach` (`fcee98e`) · Kế hoạch: [TASK-074-plan.md](../kế-hoạch/TASK-074-plan.md)

## Mục tiêu
- Khách quét một QR là vào Wi-Fi của quán (hoặc điểm phát lúc demo), rồi quét QR bàn để gọi món.

## Phạm vi
1. Cài đặt: `wifiSsid`, `wifiPassword` (khóa `wifi.ssid`, `wifi.password`), kiểm hợp lệ ở route.
2. Hàm dựng chuỗi QR Wi-Fi (thoát ký tự đặc biệt) + `GET /api/admin/wifi-qr.png`.
3. Giao diện: thẻ "Wi-Fi cho khách" ở Cài đặt; trang In QR in thêm QR Wi-Fi; sửa dòng thanh toán trên thẻ bàn ("tiền mặt hoặc chuyển khoản" — F-056).
4. Test integration + E2E; cập nhật api-contract, screens-flows, BR, US, tc-map, traceability.

## Không được sửa
- Cách sinh / mã QR bàn (F-010), quyền cài đặt (chỉ ADMIN), không migration.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Review độc lập (G3, agent chỉ đọc) — không có lỗi bắt buộc; đã sửa
| Phát hiện | Sửa |
| --- | --- |
| Mật khẩu Wi-Fi chỉ kiểm độ dài: gõ nhầm chữ có dấu (bộ gõ tiếng Việt bật — "wifi2025" → "ưifi2025") vẫn lưu được, QR in ra không bao giờ vào được mạng | Server: rỗng hoặc `^[\x20-\x7E]{8,63}$` (chuẩn WPA); ô nhập có `pattern`, `title`, ghi chú "không dấu — tắt bộ gõ tiếng Việt" |
| Test chỉ kiểm mã 200 / kiểu PNG — ảnh bỏ mất mật khẩu hay đảo tên / mật khẩu vẫn qua | So từng byte ảnh với QR dựng từ đúng tên / mật khẩu đã lưu (cả mạng không mật khẩu) |
| Khoảng trắng trong mật khẩu bị trình duyệt gộp khi in | `white-space: pre-wrap` cho tên / mật khẩu trên thẻ |
| Tải ảnh QR Wi-Fi lỗi làm cả trang In QR không in được thẻ nào | Bắt lỗi: vẫn in thẻ bàn (không khối Wi-Fi) + cảnh báo không in |
| Giá trị kết thúc bằng `\` bị Android đọc sai; giá trị trông như hex | Chặn `\` ở cuối (400); ghi chú hex trong BR-092 / FEATURE-059 (camera Android 10+ / iPhone đọc nguyên văn) |
| Test "xóa tên → 404" qua cả trên code cũ (thiếu endpoint cũng 404); tên test nói quá | Kiểm 200 trước rồi mới xóa tên; đổi tên test; E2E kiểm thêm thẻ như cũ khi chưa nhập Wi-Fi |
| Diff có sửa câu `mergedInto` của F-057 trong api-contract | Ghi nhận ở đây: câu cũ nói khách nhận `table.qrToken` — sai từ khi sửa review TASK-073 (đã bỏ mã QR); sửa cho khớp code |

## Kết quả thực chạy (27/10/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **333/333 PASS** (31 file; mới `wifi-qr.test.js` 5 test) |
| `npm run test:e2e` | **49/49 PASS** (46 luồng + 3 khả năng tiếp cận; thêm E2E "QR Wi-Fi cho khách…"; a11y quét Cài đặt và trang In QR có khối Wi-Fi) |
| Cùng test mới chạy trên code cũ `fcee98e` (worktree tạm, đã xóa) | Integration: 4/5 FAIL đúng chỗ thiếu chức năng (cài đặt không có `wifiSsid`, lưu sai không bị 400, không có ảnh) — test còn lại là hàm thuần đã chép kèm. E2E: 45 test cũ PASS, test mới FAIL ở ô "Tên Wi-Fi" |
| `npm run trace -- --check` | 138 US, 353 AC — PASS 353, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |

## Cần hỏi duyệt nếu
- Muốn in QR Wi-Fi riêng một tờ (dán quầy / cửa) thay vì trên từng thẻ bàn.
- Muốn ẩn mật khẩu chữ trên thẻ (chỉ in QR).
