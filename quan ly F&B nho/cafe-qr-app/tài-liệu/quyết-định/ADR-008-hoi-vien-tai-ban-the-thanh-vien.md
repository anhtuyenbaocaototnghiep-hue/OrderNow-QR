# ADR-008 — Gắn hội viên khi gọi món tại bàn, "Thẻ thành viên" cho khách, in quyền lợi trên bill

- **Trạng thái:** ACCEPTED (18/10/2026) — chủ dự án chọn các phương án dưới đây trong phiên làm việc ngày 18/10/2026 (trả lời câu hỏi trước khi code). Triển khai xong 18/10/2026 (TASK-056 READY_FOR_REVIEW — [bàn giao](../chất-lượng/handover-2026-10-18.md), mục "Bổ sung F-047").
- **Bối cảnh:** chủ dự án: "gọi món tại bàn cũng có thể áp SĐT thành viên chứ; cái tích điểm, voucher, chiến dịch thì bên người đăng ký phải thấy mới biết chứ".
  - Trang **Gọi món tại bàn** (F-024) chỉ hiện ⭐ khi phiên đã có hội viên; muốn gắn SĐT phải đợi tới bước thu tiền (drawer S-14).
  - Phía khách, khung hội viên (F-014, F-039, F-038) chỉ hiện số điểm, thẻ tem và số voucher (một dòng). Khách không thấy lịch sử điểm, quà đổi được, hạn dùng / điều kiện voucher, voucher đến từ chiến dịch nào.
  - Bill chỉ in điểm / tem **vừa tích**, không in điểm hiện có, voucher còn hạn.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-36 | **Gọi món tại bàn có ô SĐT hội viên:** tra cứu → gắn vào phiên của bàn; số chưa là hội viên → đăng ký nhanh (họ tên + SĐT người giới thiệu không bắt buộc + tick "khách đồng ý") rồi gắn — giống ô ở bước thu tiền. Bàn trống: gắn hội viên = mở bàn rồi gắn. Gỡ được trước khi thu. Ưu đãi vẫn tính lúc thu tiền như cũ |
| D-37 | **"Thẻ thành viên" trên điện thoại khách**, mở từ khung hội viên ở menu / theo dõi đơn: điểm + lịch sử điểm gần đây, thẻ tem, quà đổi được (đủ / còn thiếu bao nhiêu điểm), voucher còn dùng được kèm giá trị, giảm tối đa, đơn tối thiểu, hạn dùng và **nguồn** (tên chiến dịch / giới thiệu bạn / quán tặng). **Chỉ xem được khi SĐT đang gắn vào phiên của bàn** (khách tự nhập hoặc nhân viên gắn) và thiết bị thuộc phiên đó; phiên đóng → không xem nữa. Không có đăng nhập / OTP (quán chưa có SMS) |
| D-38 | **Bill thanh toán có hội viên in thêm khối "Thẻ thành viên":** điểm hiện có (lúc in), tiến độ thẻ tem, voucher còn hạn (giá trị + hạn dùng). Áp cho bill phiên, bill từng phần (chia bill), bill mang đi. Phiếu tạm tính không in khối này |

Chủ dự án **không chọn**: hộp tin "Ưu đãi dành cho bạn" (tin nhắn chiến dịch trong app), pop-up khi gắn SĐT, link xem thẻ ở nhà. Voucher của chiến dịch vẫn hiện trên Thẻ thành viên kèm tên chiến dịch.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| API gắn / đăng ký hội viên cho quầy | Dùng lại `POST /api/members/lookup`, `POST /api/members`, `POST/DELETE /api/sessions/{id}/member` (quầy gửi Bearer, đã có từ F-014) | Không thêm đường ghi mới; giới hạn tra cứu D-6 chỉ áp cho khách — quầy đã đăng nhập không bị giới hạn (như BR-024) |
| Bảo mật Thẻ thành viên | Endpoint mới `GET /api/sessions/{id}/member-card`: khách phải thuộc phiên (`assertViewer`), phiên còn mở, phiên có hội viên. Tên + SĐT che (D-16). **Không** trả mã voucher (quầy chọn mã khi thu — như F-038). Lịch sử điểm tối đa 10 dòng, không kèm tên nhân viên | Người cùng bàn có thể xem (cùng phiên) — chỉ lộ số điểm / voucher, không lộ mã dùng được |
| Nguồn voucher | Nối `Vouchers.CampaignId` → `Campaigns.Name`; `REFERRAL` → "Giới thiệu bạn", `MANUAL` → "Quán tặng" | Khách biết voucher đến từ đâu mà không cần hộp tin |
| Bill in lại sau này | Khối "Thẻ thành viên" lấy số liệu **lúc in** (ghi rõ "lúc in") | Điểm / voucher thay đổi sau đó; bill không lưu ảnh chụp |

## Hệ quả

- Không đổi schema (không có migration mới); migration kế tiếp vẫn là `0034`.
- Business rule: BR-071 (gắn hội viên ở Gọi món tại bàn), BR-072 (Thẻ thành viên), BR-073 (bill in quyền lợi).
- Tài liệu: [FEATURE-047](../chức-năng/FEATURE-047.md), [TASK-056](../công-việc/TASK-056.md), hướng dẫn [`chức-năng-mới/26-hội-viên-tại-bàn-thẻ-thành-viên.md`](../../chức-năng-mới/26-hội-viên-tại-bàn-thẻ-thành-viên.md).
