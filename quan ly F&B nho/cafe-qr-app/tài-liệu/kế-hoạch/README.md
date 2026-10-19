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
