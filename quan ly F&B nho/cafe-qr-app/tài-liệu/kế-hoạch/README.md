# Plans

Viết plan **trước khi code** khi task chạm DB/SP, quyền, contract API/realtime, hoặc từ 2 module trở lên (`AGENTS.md` → Thực hiện; skill `implement-feature` bước 4). Task nhỏ, rõ và đảo ngược được thì không cần file plan.

Tên file: `tài-liệu/kế-hoạch/TASK-0xx-plan.md`.

```markdown
# Plan cho TASK-0xx
## Hiện trạng và mục tiêu
## Thành phần và consumer bị ảnh hưởng
## Files thật cần sửa hoặc files dự kiến tạo
## Tác động dữ liệu / API / UI / quyền
## Các bước thực hiện
## Test scenarios và lệnh validation đã xác minh
## Rủi ro, câu hỏi và cách phục hồi
## Docs cần đồng bộ
```

Không cần chờ người duyệt mọi plan nếu task đã được giao quyền triển khai rõ ràng. Chỉ hỏi khi vấn đề vượt phạm vi task hoặc chưa được cấp quyền.

## Plan đã có

- [TASK-002-017-plan.md](TASK-002-017-plan.md) — MVP.
- [TASK-023-033-plan.md](TASK-023-033-plan.md) — mở rộng giai đoạn 2 (skill `extend-features`, ADR-005).
- [TASK-035-054-plan.md](TASK-035-054-plan.md) — mở rộng giai đoạn 4–8 (skill `advanced-features`, ADR-006).
- [TASK-073-plan.md](TASK-073-plan.md) — chuyển khoản, thu chung nhiều bàn, tách hóa đơn (ADR-019).
- [TASK-074-plan.md](TASK-074-plan.md) — QR Wi-Fi cho khách in kèm QR bàn (F-059).
- [TASK-075-plan.md](TASK-075-plan.md) — phát hiện bất thường, cảnh báo qua email (F-060, ADR-020).
- [TASK-077-plan.md](TASK-077-plan.md) — chế độ cơ bản, hướng dẫn quầy, chính sách dữ liệu, cảnh báo QR (F-061…F-063, ADR-021).
- [TASK-079-plan.md](TASK-079-plan.md) — báo động giá vốn (F-064, ADR-023).
- [TASK-080-plan.md](TASK-080-plan.md) — trang Lãi / lỗ dễ hiểu (F-034).
- [TASK-083-plan.md](TASK-083-plan.md) — vòng quay may mắn + ra món khi bạn bè tới (F-065, F-066, ADR-024).
- [TASK-084-plan.md](TASK-084-plan.md) — quà sinh nhật hội viên (F-067, ADR-025).
- [TASK-085-plan.md](TASK-085-plan.md) — thu thập ngày sinh hội viên (F-068, ADR-026).
- [TASK-086-plan.md](TASK-086-plan.md) — mừng khách quay lại (F-069, ADR-027).
- [TASK-087-plan.md](TASK-087-plan.md) — ly treo, mua tặng bạn một ly (F-070, ADR-028).
- [TASK-088-plan.md](TASK-088-plan.md) — chống sửa / xóa dữ liệu trái phép (F-071, ADR-029).
- [TASK-089-plan.md](TASK-089-plan.md) — chấm công nhiều người + tính lương (F-072, F-073, ADR-030).
- [TASK-090-plan.md](TASK-090-plan.md) — quên PIN, nhắc chấm công, báo quên chấm công (F-072 bổ sung, ADR-031).
- [TASK-091-plan.md](TASK-091-plan.md) — bán tiếp khi mất mạng (F-074, ADR-032).
- [TASK-092-plan.md](TASK-092-plan.md) — hạn dùng nguyên liệu: hạn sau khi mở, tiền sắp mất, món nên mời (F-075, ADR-033).
- [TASK-093-plan.md](TASK-093-plan.md) — quy trình 1 chạm ở màn Đơn hàng (F-076, ADR-034).
- [TASK-094-plan.md](TASK-094-plan.md) — phân quyền rõ ràng, đợt 1: vai Quản lý cửa hàng (F-077, ADR-035).
- [TASK-095-plan.md](TASK-095-plan.md) — phân quyền rõ ràng, đợt 2: vị trí + cấp nhân viên (F-078, ADR-036).
- [TASK-096-plan.md](TASK-096-plan.md) — quyền riêng từng tài khoản + xin quyền / duyệt (F-079, ADR-037).
- [TASK-097-plan.md](TASK-097-plan.md) — trang Quản lý riêng: đăng nhập riêng, phiên riêng (F-080, ADR-038).
- [TASK-098-plan.md](TASK-098-plan.md) — bảng chọn món của khách (F-081, ADR-039).
- [TASK-099-plan.md](TASK-099-plan.md) — giỏ hàng gọn: bấm món trong giỏ để sửa (F-082, ADR-040).
- [TASK-100-plan.md](TASK-100-plan.md) — "+" mở bảng chọn cho mọi món (F-083, ADR-041).
- [TASK-101-plan.md](TASK-101-plan.md) — giao diện tinh gọn, đợt 1 nền tảng + đợt 2 màn khách (ADR-042).
