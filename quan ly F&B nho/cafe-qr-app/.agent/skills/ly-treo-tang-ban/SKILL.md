---
name: ly-treo-tang-ban
description: Ly treo — mua tặng bạn một ly cho cafe-qr-app — quầy "Bán ly tặng" (Bán mang đi) thu giá món hiện tại, tạo voucher nguồn GIFT không gắn hội viên (mã TB + 6 ký tự) + trang quà công khai /qua/{token} có QR để khách tự gửi cho bạn qua Zalo bằng nút chia sẻ (không phí); người nhận đọc mã ở ô Mã voucher; tiền mặt vào Sổ quỹ (chốt ca khớp két), không trừ kho lúc bán, Lãi/lỗ tính doanh thu lúc dùng; tab Ly tặng có số liệu, gia hạn, hủy & hoàn tiền. Dùng khi task giao FEATURE-070 / ADR-028 / TASK-087, hoặc nhắc "ly treo", "ly tặng", "mua tặng bạn", "cà phê treo", "gift drink", "GiftDrinks", "voucher GIFT", "trang quà", "/qua/", "Bán ly tặng".
---

# Mục đích

Ghi lại chức năng **ly treo — mua tặng bạn một ly** (làm ngày 04/11/2026, TASK-087) để agent sau **sửa, mở rộng hoặc làm lại** mà không làm lệch két, không trừ kho sai lúc, không tính doanh thu hai lần, không để mã đã hủy còn dùng được.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-028-ly-treo.md` (D-112…D-118) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-070.md` (AC-070-01…06) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-107 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-087.md`, `tài-liệu/kế-hoạch/TASK-087-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-070" |
| Nền | F-038 voucher (ô Mã voucher, `checkVoucher`, `sp_Loyalty`), F-067 voucher tặng món (`Vouchers.MenuItemId`), F-033 sổ quỹ, F-018 chốt ca, F-034 Lãi/lỗ, F-065 QR công khai (mẫu trang `/quay`) |

# Khi dùng

- Đổi số ngày dùng được, cách hiện mã / lời nhắn, chữ trên trang quà.
- Chủ quán báo "két lệch sau khi bán ly tặng", "mã không dùng được", "Lãi/lỗ sai", "khách muốn hoàn tiền" (mục 7).
- Làm "cà phê treo" cho người lạ, bán ở bàn bằng điện thoại khách, đổi món khi món ngừng bán — đọc mục 6 trước.
- Làm lại trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có voucher F-038 + `Vouchers.MenuItemId` (0044), sổ quỹ (0026), `qrcode`, `config.publicBaseUrl`.
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm `cơ-sở-dữ-liệu/chuyển-đổi/0047_ly_treo.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Máy chủ: `domain/giftDrink.js` (`giftCode`, `giftDiscount`, `giftState`, `validateSettings`), `repositories/giftDrinkRepo.js` (`sell`, `cancel`, `extend`, `stats`, `outstanding`, `sellableItems`), `services/giftDrinkService.js` (`posConfig`, `sell`, `publicView`, `infoForVoucher`, `adminGet`, `adminSave`, `extend`, `cancel`), `routes/giftDrinks.js` (quầy + công khai), `routes/marketing.js` (`/gift-drinks` quản lý). Chỗ móc: `loyaltyService` (`checkVoucher` câu hết hạn, `prepare` trần số trừ + nhãn, `validate` trả `gift`), `orderService` (`VOUCHER_LINE`), `pnlRepo.daily` (phải thu cộng phần ly tặng), `pnlService.report` (`giftsOutstanding`), `app.js` (`giftDrinksRouter`), `pages.js` (`/qua/:token`).
3. Giao diện: `js/gift-sell.js` (hộp bán, gắn ở `pos-takeaway.js` cạnh tiêu đề giỏ), `qua.html` + `js/pages/gift-page.js` (SCR-50), `billing-controls.js` (`checkVoucher` → "Ly tặng của …", `.gift-invite`), `admin-loyalty.js` (`renderGift`, tab `gift`, `?tab=`), `admin-pnl.js` (`hints`), CSS `.gift-*`, `.voucher-msg` (`base.css`).

# 2. Quy tắc nghiệp vụ (BR-107)

| Quy tắc | Chi tiết |
| --- | --- |
| Bán | `gift.enabled` (mặc định tắt) + ca đang mở; món đơn (`ItemType = 'SINGLE'`), đang bán, chưa xóa, giá > 0; thu **giá hiện tại** (không giảm hội viên / khuyến mãi); 1 lần bán = 1 ly = 1 mã |
| Mã | `TB` + 6 ký tự từ `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (bỏ 0 O 1 I L); voucher `GIFT`, `MemberId NULL`, `MenuItemId`, `DiscountAmount` = tiền đã trả; hạn hết ngày thứ `gift.valid_days` (30) |
| Trang quà | `/qua/{token}` (32 hex, công khai): món, lời nhắn, người tặng, mã (chỉ khi `READY`); "Gửi cho bạn" = `navigator.share` (không có → chép link); `?in=1` in phiếu |
| Tiền | Tiền mặt → `CashTransactions` thu (`SystemCode = 'GIFT_SALE'`, `APPROVED`) **cùng transaction**, khóa ca `HOLDLOCK` như `sp_CreateCashTxn` → chốt ca khớp két. Chuyển khoản → không vào két. Lúc bán **không** tạo lượt thu, **không** trừ kho |
| Nhận | Ô Mã voucher; bill phải có món; số trừ = `min(đơn giá trên bill, max(đã trả, giá hiện tại))` (giá tăng → quán chịu; lên size / topping → khách trả chênh) |
| Lãi/lỗ | Phải thu cộng `VoucherDiscount` của lượt thu dùng voucher `GIFT` (không là giảm giá); nhắc `giftsOutstanding` (đã thu, chưa dùng) |
| Hủy & hoàn | Chỉ khi chưa dùng (khóa dòng voucher). Tiền mặt → sổ quỹ chi `GIFT_REFUND` ở ca đang mở; voucher `ExpiresAt` = **1 giây trước** bây giờ (DATETIME2(0) làm tròn — đặt "bây giờ" có thể còn hợp lệ thêm nửa giây) |
| Gia hạn | Chưa dùng, chưa hủy: còn hạn → + `valid_days`; đã hết hạn → hết ngày thứ `valid_days` từ hôm nay |

# 3. Dữ liệu

- Migration `0047`: `CK_Vouchers_Source` thêm `GIFT`; `CashCategories.SystemCode` + hai danh mục hệ thống `GIFT_SALE` (IN) / `GIFT_REFUND` (OUT) với `IsActive = 0` (không hiện ở ô chọn tay; `sp_CreateCashTxn` không dùng được → repo tự INSERT cùng khóa ca), `IsExpense = 0`; bảng `GiftDrinks`.
- Tìm danh mục theo `SystemCode`, **không theo tên** (quản lý có thể đổi tên).
- Cài đặt `gift.enabled` (false), `gift.valid_days` (30).

# 4. API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/gift-drinks/config` | Nhân viên | `{ enabled, validDays, items }` — tắt thì `items` rỗng, quầy không hiện nút |
| `POST /api/gift-drinks` | Nhân viên | → `{ code, token, url, qr (data URL), … }`; `GIFT_DISABLED`, `NO_OPEN_SHIFT` (409); món sai (400) |
| `GET /api/gifts/{token}` | Công khai | `code` chỉ khi `READY`; token sai → 404 |
| `GET / PUT /api/admin/gift-drinks`, `POST …/{id}/extend`, `…/{id}/cancel` | ADMIN | số liệu 30 ngày (`sold`, `soldAmount`, `used`, `newCustomers`), `outstanding`, `items` |
| `POST /api/vouchers/validate` | Nhân viên | Ly tặng → `gift: { giverName, menuItemName }` |

# 5. Giao diện

- **Quầy → Bán mang đi:** nút "Bán ly tặng" (cạnh "Giỏ mang đi", chỉ khi bật) → hộp: Món / Người tặng / Lời nhắn / Tiền mặt – Chuyển khoản → "Thu X & tạo mã" → mã lớn `#gift-code`, QR, "In phiếu" (mở `/qua/{token}?in=1`), "Xong".
- **Ô Mã voucher:** "Ly tặng của Lan: 1 Cà phê sữa" + (chưa gắn hội viên) "— khách được tặng ly, mời đăng ký hội viên". Lời báo xuống dòng riêng (`.voucher-msg`) để không bóp hẹp ô nhập.
- **Trang quà (390 px):** thẻ quà, mã, "Gửi cho bạn", "Chép lời nhắn", câu "quán không thu phí".
- **Quản lý → Tích điểm & voucher → Ly tặng** (`/admin/loyalty?tab=gift`): 4 ô số, công tắc + số ngày, bảng ly tặng (Gia hạn, Hủy & hoàn tiền có hộp xác nhận nói rõ tiền mặt / chuyển khoản).

# 6. Mở rộng — chỗ dễ sai

- **Bán ở bàn bằng điện thoại khách:** không thêm dòng "ly tặng" vào đơn / bill bàn — đi qua `sp_SubmitOrder` / `sp_SettleSession` (trừ kho, lên bếp). Nếu làm: một luồng thanh toán riêng như `sell`, hoặc nhân viên bán hộ.
- **"Cà phê treo" cho người lạ:** dùng chung `GiftDrinks` + sổ quỹ; khác ở chỗ không có trang quà, quầy có bảng "đang có N ly treo" và nút dùng.
- **Đổi món khi món ngừng bán:** cập nhật `Vouchers.MenuItemId` + `GiftDrinks.MenuItemId` cùng transaction; giữ trần số trừ theo tiền đã trả.
- **Báo cáo doanh thu theo lượt thu** (F-012) không gồm tiền bán ly tặng — tiền mặt nằm trong Sổ quỹ; muốn hiện thì thêm dòng riêng, đừng cộng vào lượt thu.
- **Test E2E:** món / giá trong dữ liệu E2E bị test trước đổi — chọn món theo tên, đọc giá trên nhãn; "Cà phê sữa" đã bị tắt bán lúc test này chạy (dùng "Cà phê đen").

# 7. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Gửi Zalo có mất phí không" | Không: khách gửi bằng tài khoản Zalo của mình qua nút chia sẻ. Chọn SMS thì nhà mạng tính tiền thuê bao của khách. Quán không dùng Zalo OA / ZNS |
| "Chốt ca dư / thiếu sau khi bán ly tặng" | Sổ quỹ ca đó phải có dòng thu "Bán ly tặng" (tiền mặt); chuyển khoản không vào két |
| "Mã không dùng được" | Bill chưa có đúng món; đã dùng (trang quà ghi ngày); hết hạn → quản lý Gia hạn; đã hủy |
| "Khách muốn lấy lại tiền" | Tab Ly tặng → Hủy & hoàn tiền (chưa dùng); tiền mặt cần ca đang mở; chuyển khoản tự chuyển lại |
| "Lãi/lỗ có tính tiền ly tặng không" | Tính lúc người nhận dùng ly; ly chưa dùng hiện ở gợi ý "Đã bán N ly tặng chưa dùng" |

# 8. Làm lại từ đầu (bản code chưa có F-070)

1. Docs trước: ADR, FEATURE, BR, US, AC, tc-map (quy trình 15 bước).
2. Migration chỉ thêm (nguồn voucher, `SystemCode` + 2 danh mục ẩn, `GiftDrinks`).
3. `domain/giftDrink.js` + test unit → repo `sell` / `cancel` trong transaction có khóa ca → service + route.
4. Móc `checkVoucher` / `prepare` / `validate`, nhãn hóa đơn, `pnlRepo` + `pnlService`.
5. Hộp bán ở quầy, trang quà, tab quản lý, gợi ý Lãi/lỗ; thêm trang quà + tab vào `a11y.spec.js`.
6. Test integration (`tests/gift-drinks.test.js`: sổ quỹ, chốt ca, không trừ kho, Lãi/lỗ, hủy) + E2E; chụp màn hình quầy và điện thoại 390 px.

# 9. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` (412/412 lúc làm) · `npm run test:e2e` (64/64) · `npm run trace -- --check` (158 US, 428 AC) · `npm run db:migrate` (CafeQrDev, chỉ thêm).
