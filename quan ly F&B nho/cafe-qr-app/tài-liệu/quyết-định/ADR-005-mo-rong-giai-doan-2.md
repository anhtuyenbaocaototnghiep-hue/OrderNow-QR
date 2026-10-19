# ADR-005 — Mở rộng chức năng giai đoạn 2 (D-5…D-16) theo skill `extend-features`

- **Trạng thái:** ACCEPTED
- **Ngày:** 16/10/2026. Chủ dự án giao skill `.agent/skills/extend-features/SKILL.md` ("thêm chức năng của skill them chuc nang.md").
- **Thay đổi so với:** `.agent/rules.md` mục "không tự thêm … CRM": hội viên, khuyến mãi, chốt ca… **do chủ dự án yêu cầu**, không phải agent tự thêm. Mọi rule cũ về kho/thu tiền giữ nguyên.

## Quyết định — áp dụng nguyên mặc định của skill

| Mã | Áp dụng |
| --- | --- |
| D-5 | Hội viên = hạng + chiết khấu %: Thành viên 3 %, Thân thiết 5 % (từ 1.000.000đ lũy kế), VIP 8 % (từ 3.000.000đ); đơn đầu tiên −10 % (thay % hạng nếu lớn hơn). Lưu `TotalSpent`, `Points` (1 điểm / 1.000đ, chưa có đổi điểm) |
| D-6 | Không OTP. Nhận diện bằng SĐT; khách chỉ thấy tên che (`Nguyễn V. A.`); tra cứu bị giới hạn 10 lần/phút/IP và 20 lần/phút/thiết bị |
| D-7 | Thứ tự tính tiền: giá khuyến mãi dòng / giá combo → cộng phụ thu tùy chọn → giảm theo đơn → chiết khấu hội viên (chỉ dòng cho phép cộng dồn) → giảm giá tay → làm tròn **xuống** 500đ |
| D-8 | Khuyến mãi dòng và đơn khóa lúc gửi đơn; chiết khấu hội viên và giảm giá tay tính lúc thu tiền |
| D-9 | Combo cố định (món + số lượng), giá do quản lý đặt; kho trừ theo BOM của món thành phần |
| D-10 | `ITEM_PRICE` (giá đặc biệt theo lịch cho món/danh mục) và `ORDER_PERCENT` / `ORDER_AMOUNT` (đơn tối thiểu); cờ `StackWithMember` trên từng khuyến mãi |
| D-11 | Gợi ý = món ghim (theo thứ tự ghim) + top 8 bán chạy 7 ngày (cache 15 phút) |
| D-12 | Món tự "Hết món" khi kho không đủ 1 suất — **đã có sẵn** từ ADR-003 (tính động `StockQty − ReservedQty < BOM`), tự bật lại khi nhập kho; món quản lý tắt tay không bao giờ tự bật. Không thêm cột `AutoSoldOut` (xem "Thích nghi") |
| D-13 | Tùy chọn món: nhóm có tối thiểu/tối đa; mỗi tùy chọn có phụ thu và BOM cộng thêm |
| D-14 | Giảm giá tay: nhân viên tự giảm khi **không vượt cả hai** ngưỡng 10 % và 20.000đ của bill; vượt → cần tài khoản quản lý xác thực lại (tên + mật khẩu). Ngưỡng sửa ở Cài đặt |
| D-15 | Hoàn tiền sau thu: quản lý, hoặc nhân viên có quản lý xác thực; bắt buộc lý do; tùy chọn hoàn kho cho món đã làm; chỉ trong **ngày thu tiền** (giờ VN) |
| D-16 | Đăng ký hội viên có ô đồng ý + mục đích; danh sách quản lý che số (`09xx***678`); có "Ẩn danh theo yêu cầu" |

## Thích nghi theo hiện trạng repo (skill mục 8)

| Skill đề xuất | Repo dùng | Lý do |
| --- | --- | --- |
| `db/migrations`, `db/procs`, `apps/api`, `apps/web`, `docs/` | `cơ-sở-dữ-liệu/chuyển-đổi`, `cơ-sở-dữ-liệu/thủ-tục`, `ứng-dụng/máy-chủ`, `ứng-dụng/giao-diện`, `tài-liệu/` | Thư mục đã đổi sang tiếng Việt |
| `Settings(Key, Value)` | `Settings(SettingKey, SettingValue)` | `KEY` là từ khóa T-SQL |
| `MenuItems.AutoSoldOut` | Không thêm | "Hết món" đã tính động theo kho (ADR-003) nên có sẵn hành vi D-12 |
| `OrderItemInput` thêm cột `OptionIds` | TVP mới `OrderLineInput` + `OrderLineOptionInput`; `@Items` cũ vẫn chạy | Không phá chữ ký `sp_SubmitOrder` mà test/SP cũ đang gọi |
| `Members.Phone VARCHAR(15)` | `VARCHAR(80)` | Ẩn danh thay SĐT bằng `anon:` + SHA-256 |
| Combo trong danh mục | `MenuItems.CategoryId` cho phép NULL khi `ItemType = 'COMBO'` | Combo hiện ở mục "Combo" riêng của menu |
| Bắt buộc ca mở ở SP | Service kiểm `NO_OPEN_SHIFT`; SP kiểm lại ca còn mở khi được truyền `@ShiftId` | SP cũ vẫn gọi được không cần ca (test SP), app luôn truyền ca |

## Hệ quả

- Migration `0003`…`0013` (mỗi feature một file), SP mới/sửa, module `pricing` dùng chung — chi tiết trong `tài-liệu/kế-hoạch/TASK-023-033-plan.md`.
- Thu tiền (bàn và mang đi) **bắt buộc có ca đang mở** (F-018).
- Báo cáo doanh thu tính theo **số tiền thực thu** (`Payments.AmountDue`) trừ hoàn tiền, không còn cộng `Orders.TotalAmount` (vì chiết khấu hội viên/giảm tay nằm ở cấp thanh toán). Khi không có giảm giá, hai cách cho cùng kết quả.
- Câu hỏi mới: Q-019 (cách hiểu ngưỡng D-14), Q-020 (thời hạn hoàn tiền) — đã áp dụng phương án chặt hơn, nhóm xác nhận lại.
