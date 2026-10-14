---
name: verify-change
description: Kiểm chứng và bàn giao một thay đổi trong cafe-qr-app: chọn checks theo rủi ro, chạy lệnh thật, đối chiếu AC, báo PASS/FAIL/NOT_RUN có bằng chứng.
---

# Mục đích
Tạo bằng chứng đáng tin trước khi báo READY_FOR_REVIEW.

## Khi dùng
Cuối mỗi task; trước khi mở PR; khi được yêu cầu "kiểm lại".

## Điều kiện trước
Có diff hoàn chỉnh; biết task + AC; lệnh test lấy từ `tài-liệu/vận-hành/local-development.md` (không bịa lệnh).

## Quy trình
1. Liệt kê phần đã đổi: FE / API / SP / realtime / docs.
2. Chọn checks theo bảng rủi ro `tài-liệu/chất-lượng/test-strategy.md`:
   - Chạm kho/SP → integration + concurrency test trên SQL Server thật.
   - Chạm auth/quyền → test ma trận actor × endpoint cho endpoint liên quan.
   - Chạm thu tiền → test settle đồng thời, còn PENDING, tiền thiếu, khách gọi API → 401.
   - Chạm realtime → test sự kiện phát sau commit + client refetch khi reconnect.
   - Chạm UI → unit + E2E luồng chính; kiểm UI states (loading/empty/error) bằng mắt nếu không có test.
3. Chạy lint/type-check/build cho app bị đổi.
4. Chạy test đã chọn; đọc lỗi thật; sửa nguyên nhân trong scope rồi chạy lại.
5. Đối chiếu từng AC → PASS (bằng chứng) / FAIL / NOT_RUN (lý do + cách kiểm sau).
6. Kiểm DoD (test-strategy.md §DoD): secret, migration, docs, diff ngoài scope.
7. Nếu có skill `do-an-cafe-reviewer`: chạy nó cho review mã; ghi kết quả.
8. Viết báo cáo bàn giao theo mẫu `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Không làm
Không khẳng định "đã test" khi chưa chạy; không giảm độ nghiêm của test; không gộp NOT_RUN vào PASS.

## Hoàn thành khi
Báo cáo có: lệnh thực chạy + kết quả, trạng thái từng AC, NOT_RUN có lý do, docs đã cập nhật, blocker/Q mới.
