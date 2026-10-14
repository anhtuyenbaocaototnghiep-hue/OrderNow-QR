# ADR-000 — Chỉ thu tiền mặt; khách "Gọi thanh toán", nhân viên thu tại bàn; mục Bán mang đi riêng

- **Trạng thái:** ACCEPTED
- **Ngày quyết định:** 13/10/2026
- **Người quyết định:** Chủ dự án. Người ký chốt cuối của nhóm vẫn chưa ghi tên, xem Q-000 trong [open-questions.md](../open-questions.md).
- **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md`, bảng "Thay đổi so với demo.docx" (D-1, D-2, D-3)
- **Câu hỏi đóng bởi ADR này:** Q-003, Q-004 (trả sau), Q-009 (phiên đóng khi thu tiền)

## Bối cảnh

`demo.docx` (US3, Module 2.1–2.2, actor "Cổng thanh toán") yêu cầu thanh toán VietQR động qua PayOS/SePay kèm webhook, và có nhắc MoMo. Muốn làm được thì cần API key, sandbox, một URL webhook công khai và luồng đối soát khi webhook không khớp. Nhóm chỉ có 8 tuần, và luồng thanh toán online này làm luồng cốt lõi (Order QR → Realtime → Trừ kho → In bill) rủi ro hơn nhiều.

## Quyết định

| # | Quyết định | Thay thế nội dung nào trong Word |
| --- | --- | --- |
| D-1 | **Không tích hợp thanh toán quét mã (VietQR/PayOS/SePay/MoMo). Chỉ thu tiền mặt.** | US3 (VietQR), Module 2.1–2.2 (tạo QR, webhook), actor "Cổng thanh toán" |
| D-2 | **Khách bấm "Gọi thanh toán" trên điện thoại** (màn hình sau khi đặt món). Quầy thấy ngay qua realtime, nhân viên **ra bàn thu tiền mặt**, rồi bấm "Đã thu tiền" trên POS → in bill, đóng bàn. Mô hình **trả sau**: đơn vào pha chế ngay khi gửi, không cần thanh toán trước | Luồng VietQR; làm rõ US4 (theo dõi đơn). US5 bản 2 AC1 ("Hoàn tất & In Bill") với đơn dine-in: bill được in lúc thu tiền phiên chứ không in lúc hoàn tất |
| D-3 | **Có mục riêng "Bán mang đi"** trên POS cho khách vãng lai, thu tiền mặt ngay tại quầy | Giữ US8 / Module 1.3, bỏ lựa chọn "chuyển khoản" |

## Phương án đã cân nhắc

- Giữ VietQR qua PayOS/SePay như Word: bị loại vì phụ thuộc bên thứ ba, cần URL công khai cho webhook, phải xử lý đối soát (REQ-019 cũ) và tốn thời gian kiểm thử.
- Thanh toán trước khi pha (Q-004 phương án "sau khi thanh toán"): bị loại vì không hợp khi chỉ thu tiền mặt tại bàn.

## Hệ quả

- Bỏ feature thanh toán online, webhook và bảng `WebhookLogs`. Không cần sandbox, API key hay URL webhook công khai.
- Thêm FEATURE-005 (Gọi thanh toán) và FEATURE-006 (Thu tiền mặt tại bàn, in bill, đóng phiên). FEATURE-008 (Bán mang đi) chỉ có `CASH` và có màn hình riêng S-13.
- Phiên có thêm trạng thái `PAYMENT_REQUESTED`. Phiên đóng (`CLOSED`) khi nhân viên bấm "Đã thu tiền" (`sp_SettleSession`).
- BR-007: chỉ STAFF/ADMIN đã đăng nhập mới ghi nhận được thanh toán, và không có API nào cho khách đổi `PaymentStatus`.
- REQ-019 cũ (báo đối soát sau 5 phút) không còn áp dụng (N/A). Thay bằng gợi ý "Nhân viên đang bận…" + nút Gọi lại (PROPOSED, FEATURE-005).
- Schema chừa chỗ mở rộng: `PaymentMethod` / `Payments.Method` hiện chỉ có `'CASH'`. Khi làm VietQR sau này thì thêm `'TRANSFER'` và module `payments/gateway`, không phá schema.
- Hệ thống có thể chạy hoàn toàn trong LAN của quán vì không cần webhook. Tuy vậy Word vẫn yêu cầu có bản deploy online (Q-008).

## Phạm vi "làm sau"

Thanh toán chuyển khoản/VietQR qua cổng (PayOS/SePay/MoMo).
