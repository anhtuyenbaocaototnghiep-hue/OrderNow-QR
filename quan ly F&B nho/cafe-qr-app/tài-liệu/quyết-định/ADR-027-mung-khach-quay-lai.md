# ADR-027 — Mừng khách quay lại

- **Trạng thái:** ACCEPTED (04/11/2026). Chủ dự án chọn ý "Mừng khách quay lại" (cùng "Ly treo"), xem giải thích chi tiết rồi: "tiến hành làm và khi làm xong thì làm ra skill .md".
- **Bối cảnh:** app ghi `Members.LastVisitAt` mỗi lần hội viên thanh toán (`sp_ApplyMemberPayment`) và có bộ lọc "Lâu chưa quay lại" (TASK-082, cố định 30 ngày) nhưng chỉ để xem. Quà sinh nhật (ADR-025) đã có sẵn cách phát voucher khi hội viên xuất hiện, tự áp khi thu tiền, dải ở quầy, lời chúc trên điện thoại.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-107 | **Khách quay lại** = hội viên đang hoạt động, đã từng thanh toán (`LastVisitAt` có giá trị), lần thanh toán gần nhất cách hôm nay (giờ quán) **≥ `winback.after_days`** (mặc định 45, chỉnh 14–365). Người đăng ký chưa thanh toán lần nào không tính. |
| D-108 | **Quà = voucher nguồn `WINBACK` gắn hội viên**, phát khi hội viên xuất hiện lúc đang vắng (quầy tra cứu / gắn bàn, điện thoại khách, tính tiền) — như quà sinh nhật, không cần job. **Một quà mỗi đợt vắng** (khóa `WinbackGifts (MemberId, LastVisitBefore)`) và **tối đa một quà trong `winback.cooldown_days`** (180). Ba loại quà như F-067 (mặc định giảm 15%, tối đa 30.000đ). Hạn: hết ngày thứ `winback.hold_days` (14) kể từ hôm phát. |
| D-109 | **Tự áp khi thu tiền** như quà sinh nhật; "Không dùng quà lần này" → `skipWinback`, quà giữ tới hết hạn và tự áp lần ghé sau. Một lượt thu một voucher: **quà sinh nhật được áp trước**, quà quay lại giữ cho lần sau. |
| D-110 | **Thấy ở đâu:** quầy có dải "Khách quay lại sau N ngày — lần cuối ghé dd/mm · đã ghé N lần" + trạng thái quà (kể cả khi tính năng tắt — để nhân viên chào khách cũ); điện thoại khách "Lâu rồi mới gặp lại bạn!" + quà (không mã); hóa đơn ghi "Quà quay lại". |
| D-111 | **Quản lý:** tab **Mừng khách quay lại** (Tích điểm & voucher): bật / tắt (mặc định **tắt**), số ngày vắng, loại quà, số ngày giữ quà, số ngày giữa hai quà; số liệu 90 ngày (khách quay lại, đã dùng quà, **ghé tiếp trong 30 ngày sau khi dùng quà**, tiền quà, khách trả); danh sách quà gần đây. Bộ lọc "Lâu chưa quay lại" ở trang Hội viên **dùng chung `winback.after_days`** (trước đây cố định 30). |

## Không chọn

- **Nhắn tin "quán nhớ bạn" tự động** (Zalo OA / ZNS / SMS): tốn phí theo tin, cần tài khoản doanh nghiệp; quà chạy khi khách tự tới là đủ. Chiến dịch F-037 vẫn xuất được danh sách "Lâu chưa quay lại".
- **Phát quà cho mọi người đang vắng bằng job:** quà chết cho người không quay lại.
- **Không giới hạn số quà:** khách canh vắng 45 ngày để lấy quà liên tục.

## Hệ quả

- Migration `0046`: nguồn voucher `WINBACK`; bảng `WinbackGifts`.
- API: `GET / PUT /api/admin/winback`; `loyalty.winback` trong thông tin hội viên (quầy, khách, Thẻ thành viên); `skipWinback` khi xem trước / thu tiền; `totals.winbackApplied`; tổng quan hội viên thêm `lapsedDays`.
- Feature: [FEATURE-069](../chức-năng/FEATURE-069.md). Task: [TASK-086](../công-việc/TASK-086.md). BR-106. Test TASK-082 đổi khách "vắng" từ 40 lên 50 ngày theo mốc mới.
