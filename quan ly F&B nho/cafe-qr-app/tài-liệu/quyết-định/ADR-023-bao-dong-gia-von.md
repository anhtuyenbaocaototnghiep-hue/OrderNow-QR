# ADR-023 — Báo động giá vốn khi nhập hàng giá cao hơn

- **Trạng thái:** ACCEPTED (02/11/2026). Chủ dự án yêu cầu: "nhập sữa giá mới cao hơn thì app tính lại các món dùng sữa, báo món nào tụt lãi và gợi ý giá mới, qua trang Cảnh báo và email đã có — tiến hành làm".
- **Bối cảnh:** app đã lưu giá nhập (F-023, F-031), định lượng món / combo / tùy chọn / bán thành phẩm (F-011, F-013, F-015, F-027), báo cáo giá vốn đơn đã bán, trang Cảnh báo + hàng đợi email (F-060). Nhưng khi giá nhập tăng, không ai được báo: chủ quán chỉ thấy lãi giảm khi tự mở báo cáo, thường sau nhiều tuần.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-84 | **So giá nhập mới, không so giá vốn bình quân.** Bình quân tăng chậm vì còn hàng cũ (còn 20 hộp 30.000đ, nhập 10 hộp 36.000đ → bình quân 32.000đ, tăng 6,7% dù giá thật tăng 20%). Cảnh báo nhìn về phía trước: "giá thay thế" là giá sắp phải trả. Đơn đã hoàn tất giữ giá vốn đã chốt (F-031). |
| D-85 | **Giá mốc chống tăng dần và báo lặp.** Giá mới so với giá mốc = giá ở lần báo gần nhất (bảng `CostAlertMarks`), giảm theo khi có phiếu rẻ hơn trong 90 ngày; chưa báo lần nào → giá thấp nhất trong 90 ngày, không có thì giá của phiếu gần nhất. Một phiếu rẻ dưới nửa mốc đứng riêng lẻ (khuyến mãi, gõ nhầm) và hàng tặng 0đ không kéo mốc xuống. Một phiếu rẻ dưới nửa mốc đứng riêng lẻ (khuyến mãi, gõ nhầm) và hàng tặng 0đ không kéo mốc xuống. Tăng 4% ba lần vẫn bị phát hiện; đã báo rồi nhập lại cùng giá thì không báo nữa. Mốc được **tính lại từ dữ liệu** thay vì lưu trên nguyên liệu, nên sửa / hủy phiếu tự trả về đúng mốc. |
| D-86 | **Chỉ báo khi có món bị ảnh hưởng thật.** Điều kiện: nguyên liệu tăng từ `alert.cost_rise_pct` (mặc định 5%) **và** món dùng nguyên liệu đó có tỷ lệ lãi tụt từ `alert.cost_margin_drop` điểm % (mặc định 2) hoặc vừa rơi xuống dưới `alert.cost_margin_min` % (mặc định 60); món vốn đã dưới mức chỉ xét độ tụt, kẻo món lãi thấp bị báo mỗi khi một gia vị tăng giá. Dò qua công thức bán thành phẩm và combo. Món thiếu giá nguyên liệu → "chưa tính được", không coi là 0đ. Mỗi phiếu nhập một cảnh báo + một email, gộp mọi nguyên liệu trên phiếu. |
| D-87 | **Giá gợi ý chỉ để tham khảo, app không tự đổi giá.** Hai mức, làm tròn lên 1.000đ: giữ nguyên **tiền lãi mỗi ly** (giá cũ + phần giá vốn tăng — hiện trước, khách dễ chấp nhận hơn) và giữ nguyên **% lãi** (giá vốn mới ÷ (1 − % lãi cũ)). Xếp món theo **tiền mất mỗi tháng** (phần giá vốn tăng × số ly bán 30 ngày gần nhất). Nút "Đổi giá" chỉ mở sẵn món để quản lý tự sửa. |
| D-88 | **Nghi nhập nhầm.** Giá nguyên liệu đang dùng trong món tăng trên 50% so với mốc **và** so với phiếu trước → cảnh báo hỏi "có nhập nhầm không?", không gợi ý giá, không dời mốc, và không tính vào lãi món — kể cả ở các phiếu nguyên liệu khác cho tới khi giá đó được sửa hoặc xác nhận. Phiếu sau vẫn giá đó → coi là giá thật, báo bình thường. **Sửa / hủy phiếu** đổi giá → cảnh báo cũ của phiếu chuyển "Đã xử lý" (ghi rõ lý do), bỏ mốc, xóa email chưa gửi; email đã đi thì gửi thư đính chính; tính lại theo giá đúng, và xét lại phiếu mới hơn của cùng nguyên liệu vì mốc vừa đổi. Sửa phiếu không đổi giá → không làm gì. |

## Không chọn

- So giá vốn bình quân: báo muộn và thấp hơn thực tế (xem D-84).
- Chỉ so với phiếu liền trước: bỏ sót giá tăng dần.
- Lưu giá mốc ngay trên `Ingredients`: sửa / hủy phiếu phải tự khôi phục giá trị cũ, dễ sai.
- App tự đổi giá bán: giá bán là quyết định của chủ quán (khách, đối thủ, thực đơn đã in) — app không biết những điều đó.
- Tính hao hụt (`WastePercent`) vào giá vốn món: báo cáo giá vốn hiện có chưa tính, thêm vào chỉ ở đây sẽ làm hai số lệch nhau. Giới hạn này được ghi rõ.
- Thêm công tắc riêng: email theo công tắc "Cảnh báo tức thì" đã có; muốn thưa báo thì nâng ngưỡng.

## Hệ quả

- Bản đầu sau nâng cấp chưa có mốc: phiếu đầu tiên so với giá thấp nhất 90 ngày, nên giá đã tăng từ vài tuần trước có thể bị báo một lần.
- Bản đầu sau nâng cấp chưa có mốc: phiếu đầu tiên so với giá thấp nhất 90 ngày, nên giá đã tăng từ vài tuần trước có thể bị báo một lần.
- Migration `0042`: thêm `COST_RISE` vào `CK_Alerts_Kind`, bảng `CostAlertMarks`. Chỉ thêm, không đụng dữ liệu cũ.
- Lỗi của phần cảnh báo không làm hỏng phiếu nhập: hook chạy sau commit, bắt lỗi như F-060 (ADR-020).
- Chỉ ADMIN thấy cảnh báo (ADR-020 D-78): giá vốn và tỷ lệ lãi là số nhạy cảm, nhân viên nhập kho không thấy.
- Feature: [FEATURE-064](../chức-năng/FEATURE-064.md). Task: [TASK-079](../công-việc/TASK-079.md). BR-100, BR-101.
