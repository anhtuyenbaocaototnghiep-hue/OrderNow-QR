# FEATURE-070 — Ly treo: mua tặng bạn một ly

> **Nguồn:** chủ dự án 04/11/2026. Quyết định: [ADR-028](../quyết-định/ADR-028-ly-treo.md) D-112…D-118.

- **Status:** CONFIRMED (ADR-028) · Triển khai: [TASK-087](../công-việc/TASK-087.md)
- **Actor:** **khách tặng** (trả tiền, nhận mã + trang quà để gửi); **khách nhận** (mở trang quà, đọc mã ở quầy); **ACT-STAFF / ACT-LEAD** (bán ly tặng, nhập mã khi nhận); **ACT-ADMIN** (bật / tắt, xem số liệu, gia hạn, hủy & hoàn tiền).
- **Màn hình:**
  - **Quầy → Bán mang đi** (S-13): nút "Bán ly tặng" → hộp bán → mã + QR trang quà + In phiếu. Ô "Mã voucher" (S-13 / S-14) nhận mã ly tặng.
  - **Trang quà** `/qua/{token}` (SCR-50, công khai): "… tặng bạn 1 …", lời nhắn, mã, hạn, trạng thái; "Gửi cho bạn", "Chép lời nhắn".
  - **Quản lý → Tích điểm & voucher → Ly tặng** (S-40); **Lãi/lỗ** (nhắc ly tặng chưa dùng); **Sổ quỹ** (dòng "Bán ly tặng" / "Hoàn ly tặng").
- **Dữ liệu:** `GiftDrinks`, `Vouchers.Source = 'GIFT'`, danh mục sổ quỹ "Bán ly tặng" / "Hoàn ly tặng", khóa cài đặt `gift.*`.

## User Story

- **US-070-1:** Là khách, tôi muốn mua trước một ly tặng bạn và gửi qua Zalo, để bạn tới quán nhận mà không phải trả tiền.
- **US-070-2:** Là nhân viên, tôi muốn bán ly tặng và nhận mã ly tặng nhanh ở quầy, tiền mặt khớp két khi chốt ca.
- **US-070-3:** Là chủ quán, tôi muốn biết bao nhiêu ly tặng đã bán / đã dùng / còn nợ khách và mang được bao nhiêu khách mới, gia hạn hoặc hoàn tiền khi cần.

## Quy tắc (BR-107)

1. Bán khi tính năng bật + ca đang mở; món đơn đang bán, giá > 0; thu đúng giá hiện tại; tiền mặt → sổ quỹ thu "Bán ly tặng" (đã duyệt) cùng transaction.
2. Một lần bán → một voucher `GIFT` (không gắn hội viên, `MenuItemId`, `DiscountAmount` = tiền đã trả), hạn hết ngày thứ `gift.valid_days` (30); token trang quà 32 ký tự hex.
3. Nhận: bill có món → trừ min(đơn giá trên bill, max(tiền đã trả, giá hiện tại)); bill chưa có món → 409; đã dùng / hết hạn / đã hủy → không dùng được.
4. Lúc bán không trừ kho, không có lượt thu; Lãi/lỗ cộng phần ly tặng đã dùng vào doanh thu thuần (không tính là giảm giá).
5. Hủy & hoàn tiền: chỉ ly chưa dùng; tiền mặt → sổ quỹ chi "Hoàn ly tặng" ở ca đang mở; voucher hết hiệu lực ngay. Gia hạn: chỉ ly chưa dùng, chưa hủy.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/gift-drinks/config` | Nhân viên | `{ enabled, validDays, items: [{ menuItemId, name, price }] }` |
| `POST /api/gift-drinks` | Nhân viên | `{ menuItemId, giverName?, message?, method: CASH \| TRANSFER }` → `{ giftId, code, token, url, qr, amount, menuItemName, expiresAt }`; tắt → `409 GIFT_DISABLED`; chưa mở ca → 409 |
| `GET /api/gifts/{token}` | Công khai | `{ shopName, giverName, message, menuItemName, amount, expiresAt, status: READY \| USED \| EXPIRED \| CANCELLED, usedAt, code (chỉ READY) }` |
| `GET /api/admin/gift-drinks` · `PUT …` | ADMIN | Cài đặt `{ enabled, validDays }` + `stats` (30 ngày) + `outstanding` + `items` (gần đây) |
| `POST /api/admin/gift-drinks/{id}/extend` · `/cancel` | ADMIN | Gia hạn / hủy & hoàn tiền |
| `POST /api/vouchers/validate` | Nhân viên | Thêm `gift: { giverName, menuItemName }` khi là ly tặng |

## Acceptance Criteria

- AC-070-01: (unit) mã ly tặng 8 ký tự không có ký tự dễ nhầm; số trừ khi nhận = min(đơn giá, max(đã trả, giá hiện tại)).
- AC-070-02: Bán: tắt → 409; chưa mở ca → 409; combo / món ngừng bán → 400; hợp lệ → voucher `GIFT` không gắn hội viên + token; tiền mặt → sổ quỹ thu "Bán ly tặng" đã duyệt, chốt ca tính vào tiền két; chuyển khoản → không ghi sổ quỹ; không tạo lượt thu, không trừ kho.
- AC-070-03: Nhận: kiểm mã trả `gift`; bill có món → trừ đúng 1 ly (trần số trừ khi giá tăng / lên size: AC-070-01); bill chưa có món → 409; dùng rồi → 409; hóa đơn ghi "Ly tặng"; Lãi/lỗ cộng phần đã dùng vào doanh thu, không vào giảm giá.
- AC-070-04: Trang quà công khai: READY có mã; đã dùng / hết hạn / đã hủy không có mã; token sai → 404.
- AC-070-05: Quản lý: cài đặt (số ngày 1–365) sai → 400, nhân viên → 403; số liệu (đã bán, đã dùng, đang giữ, khách mới); gia hạn; hủy & hoàn tiền (tiền mặt → sổ quỹ chi), ly đã dùng không hủy được.
- AC-070-06: Trên trình duyệt: quản lý bật tab Ly tặng; quầy "Bán ly tặng" → mã + QR; điện thoại mở trang quà thấy lời nhắn + mã + nút "Gửi cho bạn"; quầy nhập mã cho bill có món → dòng "Ly tặng", nhắc mời đăng ký hội viên; tab ghi "Đã dùng".

## Bằng chứng

`tests/gift-drinks.test.js` (AC-070-01…05) · E2E "ly treo…" (AC-070-06).
