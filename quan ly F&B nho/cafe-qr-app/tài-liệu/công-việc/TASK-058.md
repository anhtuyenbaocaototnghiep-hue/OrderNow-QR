# TASK-058 — Sửa Q-023: sheet chia bill của khách mất chữ đang gõ ở ô "Tên phần"
Status: READY_FOR_REVIEW (20/10/2026)
Feature: FEATURE-026 (chia bill) · Lỗi: DEF-001 / Q-023 · Module: MOD-BILLING · Màn hình: SCR-05 (theo dõi đơn — sheet "Chia bill theo người")
Nguồn: phát hiện khi chạy E2E cho TASK-055 (18/10/2026) · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-058-q023`

## Mục tiêu
Khách đang gõ tên phần thì có cập nhật realtime (người khác nhận món) → chữ đang gõ và focus của ô "Tên phần" vẫn giữ nguyên; phần được lưu đúng tên khách gõ.

## Nguyên nhân
`openSplit().refresh()` trong `ứng-dụng/giao-diện/public/js/pages/t-track.js` vẽ lại toàn bộ thân sheet bằng `clear(body, …)` mỗi lần có sự kiện `session.split_changed`: ô nhập bị gỡ khỏi trang rồi gắn lại → trình duyệt bỏ focus, ký tự gõ tiếp rơi ra ngoài ô; nếu khách bấm "Tạo phần của tôi" với ô rỗng, phần lưu tên mặc định "Tôi". Kèm lỗi phụ: `createSplit` dùng `e.currentTarget` sau `await` (đã thành `null`) nên nút không mở lại khi server báo lỗi.

## Phạm vi sửa
- `ứng-dụng/giao-diện/public/js/pages/t-track.js`: khối "Tạo phần" tạo một lần, chỉ thay khi trạng thái đổi (chưa có phần ↔ đã có phần); phần còn lại của sheet vẽ lại như cũ; giữ tham chiếu nút trước `await`.
- `kiểm-thử/e2e/flow.spec.js`: thêm bước hồi quy trong test "chia bill…" (B đang gõ "Chị" → A nhận món → B vẫn còn "Chị" + đang focus → gõ tiếp " B").

## Không được sửa
API chia bill, cách tính tiền, các assert sẵn có của test.

## Lệnh kiểm chứng & kết quả thật (20/10/2026)
| Lệnh | Kết quả |
| --- | --- |
| E2E với code **cũ** (`git show v1.0-baseline:…/t-track.js`) + bước hồi quy mới | **FAIL** đúng chỗ: `expect(nameB).toBeFocused()` — tái hiện chắc chắn Q-023 |
| `npm run test:e2e` với code đã sửa | **29/29 PASS** |
| `npm run lint` | PASS |

## Bàn giao
File: 2 file trên + tài liệu (TASK-058, Q-023, DEF-001). AC liên quan F-026 không đổi. Không còn lỗi tồn của task.
