# Prompt giao việc cho agent

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §19 và §21. Các đường dẫn đã đổi sang đường dẫn thật trong repo.

## 1. Triển khai một task (dùng hằng ngày)

```text
Triển khai tài-liệu/công-việc/TASK-0xx.md theo tài-liệu/ hiện hành.

Đọc AGENTS.md, .agent/rules.md, task, feature + AC, rule/quyền liên quan, phần kiến trúc/contract/model/realtime cần thiết.
Load skill khi trigger khớp (implement-feature / change-database / verify-change).

Khảo sát nguồn/tests thật. Nếu task chạm DB, quyền, contract, realtime hoặc ≥ 2 module: viết tài-liệu/kế-hoạch/TASK-0xx-plan.md
(theo mẫu tài-liệu/kế-hoạch/README.md) rồi mới code.

Triển khai trong scope; kiểm từng AC và regression liên quan; đồng bộ docs; tự review diff.
Thiếu quyết định nghiệp vụ quan trọng: thêm Q vào tài-liệu/open-questions.md, dừng phần phụ thuộc, tiếp tục phần độc lập.
Tự xử lý chi tiết kỹ thuật nhỏ, đảo ngược được, không hỏi lại.

Bàn giao theo mẫu tài-liệu/chất-lượng/test-strategy.md#ban-giao. Không báo DONE khi chưa có bằng chứng đáp ứng DoD.
```

## 2. Áp dụng ADR mới vào docs (sau mỗi lần nhóm chốt một Q)

```text
Nhóm vừa chốt Q-0xx thành tài-liệu/quyết-định/ADR-00x-*.md. Cập nhật tài-liệu/ cho nhất quán với ADR này.

- Đổi trạng thái PROPOSED / NEEDS_CONFIRMATION → CONFIRMED đúng chỗ bị ảnh hưởng (feature, business-rules, workflows-states,
  data-model, api-contract, realtime-events, screens-flows, tasks) và ghi "theo ADR-00x".
- Nếu ADR chọn phương án khác đề xuất (ví dụ Q-001 = B): sửa data-model/SP/feature/test-strategy cho nhất quán.
- Cập nhật bảng tóm tắt trong tài-liệu/open-questions.md, tài-liệu/quyết-định/README.md, cột "Chặn bởi" ở tài-liệu/chức-năng/README.md
  và trạng thái task (BLOCKED → TODO) ở tài-liệu/công-việc/README.md + file task.
- Không tự chốt Q khác. Không bịa lệnh hay kết quả test.
Báo cáo: file đã sửa, trạng thái đổi, task được mở khóa, Q còn mở.
```

## 3. Khi nhận Word mới từ giảng viên hoặc nhóm

```text
Có phiên bản Word mới: <đường dẫn>. Baseline hiện tại: tài-liệu/nguồn/demo.docx (đọc 13/10/2026) và tài-liệu/nguồn/demo-docx.txt.

1. Trích nội dung Word mới (đoạn văn, bảng, Mermaid). Báo phần không đọc được.
2. So với baseline: liệt kê yêu cầu thêm / sửa / bỏ, kèm vị trí trong Word.
3. Phân tích tác động: feature, rule, data model, API, realtime, UI, task bị ảnh hưởng.
4. Chưa sửa docs. Dừng lại chờ nhóm chấp thuận danh sách thay đổi.
Không sinh lại toàn bộ docs, không ghi đè các quyết định đã có trong tài-liệu/quyết-định/.
```

## Prompt đã dùng một lần lúc thiết lập (13/10/2026)

Các prompt 19.1 (phân tích Word), 19.2 (tạo bộ `tài-liệu/`) và 19.3 (thiết lập AGENTS/rules/skills) trong tài liệu nguồn đã được thực hiện trong lượt thiết lập repo. Kết quả nằm ở `tài-liệu/source-map.md` (đối chiếu Word), `tài-liệu/open-questions.md` (Q-012 → Q-018) và `tài-liệu/vận-hành/local-development.md` (kiểm tra thiết lập agent). Muốn chạy lại thì lấy nguyên văn ở §19 của `tài-liệu/nguồn/huong-dan-web-app-v1.2.md`.
