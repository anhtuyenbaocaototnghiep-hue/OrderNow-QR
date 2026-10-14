# Tài liệu nguồn (baseline, chỉ đọc)

| File | Là gì | Ghi chú |
| --- | --- | --- |
| `demo.docx` | Bản nháp ý tưởng của nhóm: user stories (2 bản), user flow, Mermaid, phân rã module 1–5 | Baseline phiên bản 1, đọc ngày 13/10/2026. Lấy từ `Downloads/demo.docx`; bản `Documents/minhtu/demo.docx` có nội dung chữ giống hệt |
| `demo-docx.txt` | Văn bản trích tự động từ `demo.docx` (đoạn văn có nhãn style, bảng dạng `| … |`) để agent đọc mà không cần mở Word | Không sửa tay. Trích lại khi Word đổi |
| `huong-dan-web-app-v1.2.md` | Tài liệu hướng dẫn triển khai bản 1.2 (14/10/2026), từ đó tách ra bộ `tài-liệu/` (bản 1.1 ngày 13/10 đã được thay; khác biệt duy nhất là D-4) | Chứa quyết định D-1/D-2/D-3 (ADR-000) và D-4 (ADR-002) |

**Quy tắc:** Sau khi tách, **các file trong `tài-liệu/` (ngoài thư mục này) mới là đặc tả hiện hành**. Không sửa song song các file ở đây. Khi có Word mới thì dùng prompt "Khi nhận Word mới" trong `tài-liệu/vận-hành/agent-prompts.md`: so với baseline, phân tích tác động, chờ nhóm chấp thuận rồi mới cập nhật `tài-liệu/`.
