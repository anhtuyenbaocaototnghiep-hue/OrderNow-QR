# Quyết định (ADR)

Mỗi câu hỏi Q-xxx khi được chốt sẽ thành một ADR ngắn. Sau đó cập nhật trạng thái `PROPOSED` / `NEEDS_CONFIRMATION` → `CONFIRMED` ở các docs bị ảnh hưởng và ghi "theo ADR-00x" tại chỗ sửa. Agent **không** tự viết ADR cho câu hỏi chưa được nhóm chốt (rules: "không tự chọn cách hiểu").

| ADR | Câu hỏi | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| [ADR-000](ADR-000-thanh-toan-tien-mat.md) | Q-003, Q-004, Q-009 | Chỉ tiền mặt; khách Gọi thanh toán, nhân viên thu tại bàn; mục Bán mang đi riêng (D-1/D-2/D-3) | ACCEPTED (13/10/2026) |
| [ADR-001](ADR-001-giu-kho-khi-gui-don.md) | Q-001 | Giữ kho khi gửi đơn, trừ khi hoàn tất (phương án A) + chụp lượng giữ theo đơn | ACCEPTED (14/10/2026) |
| [ADR-002](ADR-002-stack-html-node-sqlserver.md) | Q-002 | Stack: HTML/CSS/JS thuần + Node.js/Express + SQL Server + Socket.io (D-4) | ACCEPTED (14/10/2026) |
| [ADR-003](ADR-003-cac-de-xuat-con-lai.md) | Q-004b, Q-005, Q-006, Q-007, Q-010…Q-018 | Áp dụng các phương án đề xuất khi triển khai hoàn chỉnh | ACCEPTED (14/10/2026) |
| [ADR-004](ADR-004-xoa-du-lieu-quan-ly.md) | (phản hồi chủ dự án) | Có nút Xóa trong Quản lý: xóa hẳn nếu chưa có lịch sử, ngược lại xóa mềm; chặn khi đang dùng | ACCEPTED (14/10/2026) |

Còn mở: **Q-000** (người ký chốt) và **Q-008** (hosting online). Mỗi khi nhóm đổi một quyết định trong ADR-003, tạo ADR mới (ADR-005…) ghi rõ "thay thế mục Q-xxx của ADR-003".

## Mẫu ADR

```markdown
# ADR-00x — <quyết định ngắn>

- **Trạng thái:** PROPOSED | ACCEPTED | SUPERSEDED bởi ADR-00y
- **Ngày quyết định:** dd/mm/yyyy
- **Người quyết định:** <tên / vai trò theo Q-000>
- **Câu hỏi đóng:** Q-xxx

## Bối cảnh
## Quyết định
## Phương án đã cân nhắc
## Hệ quả (docs, data model, SP, API, UI, task bị ảnh hưởng)
```
