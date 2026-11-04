# ADR-028 — Ly treo: mua tặng bạn một ly

- **Trạng thái:** ACCEPTED (04/11/2026). Chủ dự án chọn ý "Ly treo, mua tặng bạn một ly" (cùng "Mừng khách quay lại"), hỏi thêm "gửi về zalo có tính cước phí hay gì không" (trả lời: không — dùng nút chia sẻ của điện thoại), rồi: "tiến hành làm và khi làm xong thì làm ra skill .md".
- **Bối cảnh:** voucher "tặng 1 món" (`Vouchers.MenuItemId`, F-067) và voucher không gắn hội viên (`MemberId NULL`, F-038) đã có; ô "Mã voucher" ở quầy đã có. Bán ly tặng là **thu tiền trước, giao món sau** — không được trừ kho / tính doanh thu món lúc bán, và tiền mặt phải khớp két khi chốt ca.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-112 | **Bán ở quầy:** màn Bán mang đi có nút **"Bán ly tặng"** (khi tính năng bật): chọn 1 món đơn (không combo) đang bán, tên người tặng + lời nhắn (không bắt buộc), tiền mặt / chuyển khoản → thu đúng **giá món hiện tại** (không giảm hội viên / khuyến mãi). Khách ngồi bàn muốn tặng thì báo nhân viên. Một lần bán = một ly = một mã. |
| D-113 | **Mã quà = voucher nguồn `GIFT`**, không gắn hội viên, `MenuItemId` = món, `DiscountAmount` = tiền đã trả, hạn hết ngày thứ `gift.valid_days` (30) kể từ hôm bán. Mã 8 ký tự `TB…` (bỏ ký tự dễ nhầm 0/O/1/I). Thêm bảng `GiftDrinks` (người bán, ca, hình thức, người tặng, lời nhắn, token trang quà, hủy). |
| D-114 | **Gửi cho bạn — không tốn phí:** sau khi thu, quầy hiện mã + **QR của trang quà** `/qua/{token}`; người tặng quét bằng điện thoại, trang quà có nút **"Gửi cho bạn"** (bảng chia sẻ của điện thoại: Zalo, Messenger, tin nhắn — gửi bằng tài khoản của khách) và **"Chép lời nhắn"**; quầy có **In phiếu**. Không dùng Zalo OA / ZNS. Trang quà công khai theo token 32 ký tự; hiện mã chỉ khi quà còn dùng được. |
| D-115 | **Nhận ly:** người nhận đọc mã, nhân viên nhập ở ô **Mã voucher** (có sẵn) → quầy báo "Ly tặng của …: 1 …"; bill phải có món đó; số trừ = đơn giá món trên bill nhưng **không quá max(tiền đã trả, giá món hiện tại)** — giá tăng thì quán chịu, lên size / thêm topping thì người nhận trả phần chênh. Một mã một ly, một lần, không đổi ra tiền. |
| D-116 | **Tiền & báo cáo:** bán **tiền mặt** → ghi sổ quỹ **thu "Bán ly tặng"** (đã duyệt, gắn ca) để chốt ca khớp két; chuyển khoản không vào két. Lúc bán **không** trừ kho, không tính doanh thu món. Lúc nhận → món trừ kho như thường; trang **Lãi/lỗ** tính phần ly tặng đã dùng vào doanh thu (không coi là giảm giá) và nhắc "ly tặng đã bán chưa dùng: N ly · X đ". Báo cáo doanh thu theo lượt thu không gồm tiền bán ly tặng (xem tab Ly tặng). |
| D-117 | **Quản lý:** tab **Ly tặng** (Tích điểm & voucher): bật / tắt (mặc định **tắt**), số ngày dùng được; số liệu 30 ngày (đã bán, đã dùng, đang giữ, người nhận là khách mới); danh sách với **Gia hạn** (+ số ngày dùng được) và **Hủy & hoàn tiền** (chưa dùng; tiền mặt → sổ quỹ chi "Hoàn ly tặng" ở ca đang mở). |
| D-118 | **Khách mới:** khi người nhận dùng mã mà bill chưa gắn hội viên, quầy nhắc "Khách được tặng ly — mời đăng ký hội viên". "Khách mới" trong số liệu = lượt dùng không có hội viên hoặc hội viên đăng ký sau ngày bán ly. |

## Không chọn

- **Thêm dòng "ly tặng" vào giỏ khách / bill bàn:** đi qua `sp_SubmitOrder` (trừ kho ngay, lên phiếu bếp) — sai kho, sai bếp; sửa thủ tục thu tiền rủi ro cao.
- **Tính doanh thu lúc bán:** món chưa giao, giá vốn chưa có; Lãi/lỗ lệch. Tiền mặt vẫn khớp két qua sổ quỹ.
- **Gửi tự động qua Zalo OA / ZNS / SMS:** tốn phí theo tin, cần tài khoản doanh nghiệp.
- **"Cà phê treo" cho người lạ** (không mã, bảng ly treo ở quầy): để sau; dùng chung toàn bộ phần tiền / báo cáo này.
- **Đổi món khi món ngừng bán:** để sau; hiện quản lý hủy & hoàn tiền hoặc gia hạn khi món bán lại.

## Hệ quả

- Migration `0047`: nguồn voucher `GIFT`; bảng `GiftDrinks`; hai danh mục sổ quỹ hệ thống (ẩn khỏi ô chọn tay).
- API: `GET /api/gift-drinks/config`, `POST /api/gift-drinks` (nhân viên); `GET /api/gifts/{token}` (công khai); `GET / PUT /api/admin/gift-drinks`, `POST /api/admin/gift-drinks/{id}/extend`, `…/cancel`; `POST /api/vouchers/validate` trả thêm `gift`; Lãi/lỗ thêm `giftsOutstanding`.
- Màn hình mới SCR-50 trang quà `/qua/{token}`. Feature: [FEATURE-070](../chức-năng/FEATURE-070.md). Task: [TASK-087](../công-việc/TASK-087.md). BR-107.
