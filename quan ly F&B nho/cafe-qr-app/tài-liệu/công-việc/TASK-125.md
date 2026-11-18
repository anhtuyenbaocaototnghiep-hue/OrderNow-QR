# TASK-125 — In bill có mã QR từ hộp Thu tiền; khung mã không dính chữ (F-099, DEF-032)

- **Status:** READY_FOR_REVIEW (18/11/2026)
- **Tài liệu:** [FEATURE-099](../chức-năng/FEATURE-099.md) (AC-099-06, AC-099-07) · ADR [ADR-062](../quyết-định/ADR-062-chuyen-khoan-vietqr.md) D-247 · DEF-032 ([defect-log](../chất-lượng/defect-log.md))
- **Màn hình:** SCR-12 (phiếu tạm tính), SCR-13 (Bán mang đi), SCR-14 (hộp Thu tiền)
- **Nguồn:** chủ dự án 18/11/2026: ảnh khung mã ở hộp Thu tiền (chữ dính liền "29.000đ<ngân hàng>…", "<4 số cuối>Nội dung…") kèm câu "cái QR này bạn thiết kế in bill có QR trên đó luôn nha".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-125-in-bill-co-ma-qr`, chồng lên `task/TASK-124-bo-mang-ra-so-che`

## Phạm vi

- **Nút "In bill có mã QR"** trong khung mã ở hộp Thu tiền:
  - in phiếu tạm tính có mã VietQR, cùng phiếu với nút "In tạm tính";
  - số tiền và mã QR trên phiếu **đúng như hộp đang hiện**: hội viên, voucher, đổi thưởng, giảm tay, bỏ quà sinh nhật / quay lại, thu chung.
- **DEF-032:** khung mã nhỏ ở hộp Thu tiền và Bán mang đi ghi mỗi thứ một dòng (số tiền; ngân hàng · số; nội dung), không còn dính chữ. Hai nơi dùng chung một khung (`transfer-qr.js`).
- **Máy chủ:** `GET /api/sessions/{id}/receipt?mode=provisional&bill=<JSON>` tính số phải thu theo lựa chọn ở hộp, như `settle-preview`.
  - Không nhận tài khoản / mật khẩu duyệt.
  - Bàn chia bill thì bỏ qua `bill`, in như cũ.

**Ngoài phạm vi:** in mã trên bill đã thu (không cần — đã trả); khung mã của từng phần khi chia bill.

## Test

- `transfer-qr.test.js` AC-099-06: phiếu tạm tính có `bill` (giảm tay) → số phải thu + mã QR = settle-preview; `bill` sai → 400; không có `bill` → như cũ.
- E2E AC-099-07: hộp Thu tiền — khung mã mỗi thứ một dòng (không dính chữ), "In bill có mã QR" → khung in phiếu tạm tính có mã, đúng số tiền.

## Lệnh kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
