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
