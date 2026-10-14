# Quy tắc làm việc — cafe-qr-app

MUST = bắt buộc khi điều kiện xuất hiện · SHOULD = mặc định nên làm · MAY = tùy chọn.

## Phạm vi và nghiệp vụ
- MUST không tự thêm quyền, trạng thái, business rule, chi nhánh/kho thứ hai, CRM, nhân sự.
- MUST dùng rule theo ID trong `tài-liệu/nghiệp-vụ/business-rules.md`; rule PROPOSED/NEEDS_CONFIRMATION
  chỉ được triển khai khi task ghi rõ "áp dụng phương án X".
- MUST tuân thủ D-1/D-2/D-3 (chỉ tiền mặt; khách gọi thanh toán, nhân viên thu tại bàn; mục bán mang đi riêng) — không tự thêm cổng thanh toán, QR chuyển khoản hay cho khách tự đánh dấu đã trả.
- MUST không tự chọn cách hiểu cho Q-001 (giữ kho), Q-004b (nút Tiếp nhận), Q-006 (hoàn tất theo đơn/món)
  nếu chưa có ADR; ghi câu hỏi và làm phần độc lập.
- SHOULD giữ tên trạng thái/sự kiện/mã lỗi đúng như docs (PENDING, PREPARING, COMPLETED, CANCELLED;
  OUT_OF_STOCK, ALREADY_PROCESSED, …). Đổi tên = đổi contract → cần plan.

## Kiến trúc
- MUST tuân thủ tầng ở `tài-liệu/kiến-trúc/system-overview.md`: controller/hub → service → repository/SP.
  Controller không gọi DB; service không biết HTTP.
- MUST đặt mọi thao tác đổi trạng thái đơn kèm kho trong SP (`cơ-sở-dữ-liệu/thủ-tục/`) hoặc một transaction duy nhất
  có khóa dòng; không kiểm tra-rồi-ghi tách rời.
- MUST phát sự kiện realtime sau khi transaction commit; realtime không phải nguồn sự thật.
- SHOULD dùng pattern/module có sẵn trước khi tạo mới. Không đổi kiến trúc trong task không có phạm vi đó.

## Stack và dependency
- MUST đọc `tài-liệu/kiến-trúc/tech-stack.md` và `package.json` trước khi thêm thư viện.
- SHOULD dùng khả năng sẵn có trước khi thêm dependency; nếu thêm: ghi lý do, kiểm tương thích, cập nhật lockfile và tech-stack.
- MUST giữ stack D-4: FE HTML/CSS/JS thuần (không tự thêm React/Vue/Next/jQuery/Bootstrap), BE Node.js, SQL Server, Socket.io; không đổi trong một task feature.

## Dữ liệu, quyền, bảo mật
- MUST kiểm permission và ownership ở server: khách chỉ chạm phiên/đơn của mình; STAFF không vào `/admin`.
- MUST không đưa secret thật vào source, client bundle, docs, log, test fixture. Dùng `.env` + `.env.example`.
- MUST có migration đánh số cho mọi thay đổi schema; không sửa migration đã chạy; SP dùng `CREATE OR ALTER` trong `cơ-sở-dữ-liệu/thủ-tục/`.
- MUST giữ CHECK constraint `StockQty >= 0` và unique index chống trừ kho 2 lần; không nới constraint để test pass.
- MUST không có bất kỳ API nào cho khách đổi `PaymentStatus`; thu tiền chỉ qua `sp_SettleSession` / `sp_SubmitOrder` (mang đi) do STAFF/ADMIN gọi.
- SHOULD lưu thời gian UTC; quy đổi múi giờ ở client/báo cáo.

## Cách làm
- SHOULD lập plan (`tài-liệu/kế-hoạch/`) cho thay đổi DB, auth, contract, realtime hoặc ≥ 2 module.
- MUST làm rõ unknown có thể đảo thiết kế trước khi triển khai phần đó; MAY tự quyết chi tiết nhỏ, đảo ngược được
  (tên biến, tách hàm, thứ tự field) trong phạm vi đã giao mà không hỏi lại.
- MUST khảo sát nguồn/tests thật; với repo chưa có source, file là "dự kiến tạo", không phải "đã có".

## Kiểm chứng và bàn giao
- MUST kiểm từng AC của task và chạy test liên quan; test concurrency phải chạy trên SQL Server thật (Docker), không mock.
- MUST không xóa/làm yếu test, không nới validation để che lỗi.
- MUST báo PASS / FAIL / NOT_RUN đúng sự thật; không giả kết quả.
- MUST đồng bộ docs bị ảnh hưởng (feature, api-contract, data-model, realtime-events, local-development) trong cùng task.
- MUST tự review diff: không có thay đổi ngoài phạm vi, không có console.log/secret/TODO vô chủ.
