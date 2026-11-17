# TASK-121 — Sửa lỗi hiển thị màn khách: trang tràn ngang khi đơn đã xong (DEF-031)

- **Status:** READY_FOR_REVIEW (17/11/2026)
- **Defect:** [DEF-031](../chất-lượng/defect-log.md) · **Feature:** [FEATURE-088](../chức-năng/FEATURE-088.md) (mang ra bàn), [FEATURE-093](../chức-năng/FEATURE-093.md) (màn khách chỉ cho điện thoại) · **AC:** AC-088-08 · **Màn hình:** SCR-05
- **Nguồn:** chủ dự án 17/11/2026 — "kiểm tra lại toàn bộ bị lỗi hiển thị nè". Kèm 2 ảnh điện thoại: hộp "Món của bạn đã xong" lệch phải, trang trượt ngang.
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-121-loi-tran-ngang-man-khach`, chồng lên `task/TASK-120-luong-khong-tu-duyet`

## Phạm vi

- **`js/pages/t-track.js`:** nhãn đơn đã xong (quán mang ra bàn) đổi "Đã xong — nhân viên đang mang ra bàn" → "Đang mang ra bàn". Câu đầy đủ vẫn ở hộp báo món xong.
- **`css/customer.css`:**
  - dòng đầu thẻ đơn (mã đơn · giờ | nhãn) được xuống dòng, nhãn được ngắt chữ — nhãn nào dài cũng không làm tràn trang;
  - toast lên đầu màn hình khi đang mở bảng / hộp thoại, không che ô nhập (vd. số điện thoại ở "Ưu đãi hội viên").
- **E2E AC-088-08:** nhãn mới; điện thoại 320 px không cuộn ngang.

## Kiểm tra toàn bộ màn khách

- **Cách quét:** tự động trên máy chủ CSDL thử, 15 bước hành trình của khách. Các bước:
  - màn chào, thực đơn, giỏ, nhận ưu đãi, gọi nhân viên;
  - đơn mới gửi, đang pha, xong + hộp báo, đã mang ra;
  - chia bill, hộp gọi thanh toán, chờ thanh toán, cảm ơn;
  - chọn nhóm khi bàn có 2 nhóm.
- **Số lần đo:** 15 bước × 320 / 360 / 390 px × nền sáng 10:00 / nền tối 20:00 = 90 lần đo.
- **Kết quả:** trước sửa 12 lần lỗi (cùng một nguyên nhân), sau sửa 0.

## Lệnh kiểm chứng

`npm run lint` · `npm run format:check` · `npm run test:e2e` · `npm run trace -- --check` (không đổi mã máy chủ)
