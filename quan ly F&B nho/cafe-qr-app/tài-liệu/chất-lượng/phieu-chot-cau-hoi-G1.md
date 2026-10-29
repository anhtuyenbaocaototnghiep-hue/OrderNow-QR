# Phiếu chốt câu hỏi còn mở — buổi họp nhóm (G1)

> Lập 29/10/2026 ([TASK-078](../công-việc/TASK-078.md)) để nhóm chốt trong khoảng 30 phút. Chi tiết từng câu: [open-questions.md](../open-questions.md). Cổng duyệt: [quality-gates.md](quality-gates.md).
>
> **Agent không chốt thay.** Mỗi dòng: tích **Giữ** (đúng như app đang chạy) hoặc **Đổi** (ghi cách muốn đổi). Chốt xong: cập nhật trạng thái trong `open-questions.md`; câu nào **Đổi** thì giao task mới cho agent.

**Ngày họp:** ____/____/2026 · **Có mặt:** __________________________________________

| Mã | Câu hỏi | App đang chạy (đã áp) | Giữ | Đổi thành |
| --- | --- | --- | --- | --- |
| Q-000 | Ai là người chốt nghiệp vụ và kỹ thuật, ký các cổng G1–G5? | Đề xuất: nghiệp vụ cả nhóm; BE / DB Nhật Anh; FE Tuyến; test Sáng | [ ] | |
| Q-019 | Ngưỡng giảm giá tay nhân viên tự áp, vượt thì cần trưởng ca / quản lý duyệt | ≤ 10 % bill **và** ≤ 20.000đ (Cài đặt → Giảm giá tay đổi được) | [ ] | |
| Q-020 | Hoàn tiền trong bao lâu sau khi thu | Trong ngày thu tiền (giờ Việt Nam); trưởng ca chỉ hoàn lượt thu trong ca đang mở | [ ] | |
| Q-021 | Mặc định "Gọi món tại bàn" (nhân viên nhập order) | (1) đơn vào thẳng Đang pha; (2) nhập được cả khi tạm ngưng QR / ngoài giờ bán; (3) ghi chú theo lượt khách, hết khi thu tiền; (4) khách không thấy ghi chú, không in bill; (5) bàn có nhóm → chọn nhóm hoặc "Nhóm mới" | [ ] | |
| Q-022 | Lệch ma trận quyền D-24 và các cách hiểu giai đoạn 4–8 | (1) nhân viên vẫn mở / đóng ca; (2) nhân viên ghi sổ quỹ, khoản lớn chờ duyệt; (3) thưởng giới thiệu chỉ xét lượt thu đầu; (4) tự hạ vai trò ADMIN → 400; (5) điểm cũ không quy đổi; (6) hoàn tiền không trả lại voucher | [ ] | |

## Cổng duyệt cần ký sau khi chốt

Ký chính thức ở [quality-gates.md](quality-gates.md) mục "Ký duyệt"; bảng dưới để ghi tạm trong buổi họp.

| Cổng | Nội dung (tóm tắt — đủ ở quality-gates.md) | Người ký | Ngày |
| --- | --- | --- | --- |
| G1 | Phạm vi, user story, AC, BR đã chốt (gồm các câu trên) | | |
| G2 | Kiến trúc, dữ liệu, API, màn hình | | |
| G3 | Code + review + test đạt | | |
| G4 | Nghiệm thu: traceability, UAT ([uat-plan.md](uat-plan.md)) | | |
| G5 | Phát hành `v1.0.0` ([release-plan.md](../vận-hành/release-plan.md)) | | |

Bằng chứng máy hiện có (để đối chiếu khi ký): `npm test`, E2E, ép tải, ma trận truy vết — [test-strategy.md](test-strategy.md), [traceability.md](traceability.md).
