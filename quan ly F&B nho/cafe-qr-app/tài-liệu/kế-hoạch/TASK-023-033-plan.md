# Plan cho TASK-023…033 — mở rộng chức năng (skill `extend-features`)

## Hiện trạng và mục tiêu

MVP (FEATURE-001…012) chạy đủ luồng lõi; baseline trước khi sửa: `npm test` 46/46, `npm run test:e2e` 15/15, `npm run load` NFR-002 10/10 (14/10/2026).
Mục tiêu: thêm FEATURE-013…023 theo thứ tự giai đoạn của skill, **không phá** luồng lõi và bất biến kho/tiền. Quyết định mặc định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md).

## Bảng map "tên trong skill → tên thật trong repo"

| Skill | Repo |
| --- | --- |
| Bảng đơn / dòng đơn / phiên / thanh toán | `dbo.Orders` / `dbo.OrderItems` / `dbo.Sessions` / `dbo.Payments` |
| Món / nguyên liệu / BOM / giao dịch kho | `dbo.MenuItems` / `dbo.Ingredients` / `dbo.BomItems` / `dbo.InventoryTransactions` |
| SP gửi đơn / hoàn tất / thu tiền | `sp_SubmitOrder` / `sp_CompleteOrder` / `sp_SettleSession` (mang đi thu trong `sp_SubmitOrder`) |
| Lượng nguyên liệu giữ cho đơn | `dbo.OrderIngredients` (ADR-001) |
| `apps/api/src/routes/*` | `ứng-dụng/máy-chủ/src/routes/{public,staff,admin}.js` (+ `marketing.js`, `operations.js` mới) |
| `apps/web/public/**` | `ứng-dụng/giao-diện/public/{t,pos,admin}/` + `js/pages/*.js` |
| `db/migrations` / `db/procs` | `cơ-sở-dữ-liệu/chuyển-đổi` / `cơ-sở-dữ-liệu/thủ-tục` |
| `Settings(Key, Value)` | `Settings(SettingKey, SettingValue)` |

## Task ↔ feature ↔ migration

| Task | Feature | Migration | SP |
| --- | --- | --- | --- |
| TASK-023 | F-014 Hội viên | `0003_hoi_vien.sql` (MemberTiers, Members, MemberTransactions, Settings; cột MemberId + breakdown trên Payments) | `sp_ApplyMemberPayment` (mới), `sp_SettleSession`, `sp_SubmitOrder` |
| TASK-024 | F-017 Gợi ý / bán chạy / ghim | `0004_goi_y.sql` | — |
| TASK-025 | F-015 Combo + bộ tính giá `pricing` | `0005_combo.sql` (ItemType, ComboComponents, OrderItems.ParentOrderItemId/ListPrice, TVP `OrderLineInput`) | `sp_SubmitOrder`, `sp_DeleteMenuItem` |
| TASK-026 | F-016 Khuyến mãi | `0006_khuyen_mai.sql` | `sp_SubmitOrder` (khóa `Promotions`, đếm `MaxUsesPerDay`) |
| TASK-027 | Admin "Marketing & Khách hàng" + báo cáo | — | — |
| TASK-028 | F-013 Tùy chọn món | `0007_tuy_chon_mon.sql` (+ TVP `OrderLineOptionInput`) | `sp_SubmitOrder`, `sp_DeleteIngredient` |
| TASK-029 | F-018 Chốt ca | `0008_chot_ca.sql` | `sp_CloseShift` (mới); `sp_SettleSession`/`sp_SubmitOrder` nhận `@ShiftId` |
| TASK-030 | F-022 Giảm giá tay | `0009_giam_gia_tay.sql` | `sp_SettleSession`, `sp_SubmitOrder` |
| TASK-031 | F-020 Công tắc nhận đơn + giờ bán danh mục | `0010_nhan_don_gio_ban.sql` | — |
| TASK-032 | F-021 Gọi nhân viên | `0011_goi_nhan_vien.sql` | — |
| TASK-033a | F-019 Hoàn tiền sau thu | `0012_hoan_tien.sql` (VOIDED, RESTOCK, Refunds) | `sp_RefundPayment` (mới) |
| TASK-033b | F-023 Nhập kho & kiểm kê | `0013_nhap_kho_kiem_ke.sql` | `sp_ReceiveStock`, `sp_PostStocktake` (mới), `sp_AdjustInventory` (khóa khi đang kiểm kê) |

## Thiết kế chính

**Tiền (D-7/D-8).** Module thuần `src/pricing/pricing.js`:

- `priceOrder(items, catalog, promotions, now)` → dòng đã tính giá: `listPrice`, `unitPrice`, `lineDiscount`, `promotionId`, `allowMemberStack`, tùy chọn, dòng con combo; khuyến mãi đơn; tổng.
- `settleTotals(orders, member, manual, settings)` → `subtotal`, `promoDiscount`, `memberDiscount`, `manualDiscount`, `roundingAdj`, `amountDue`, `breakdownLines`.
- Service gọi `pricing` rồi truyền số đã tính vào SP. SP chỉ kiểm ràng buộc tối thiểu: tổng ≥ 0; `AmountReceived ≥ AmountDue`; Σ đơn không đổi (nếu đổi → `AMOUNT_CHANGED`); lượt khuyến mãi trong ngày; ca còn mở.

**Đơn.**

- `Orders.SubtotalAmount` = Σ giá niêm yết (kể cả phụ thu tùy chọn).
- `Orders.PromoDiscount` = khuyến mãi dòng + khuyến mãi đơn.
- `TotalAmount` = `SubtotalAmount − PromoDiscount` (giữ nguyên ý nghĩa "số tiền của đơn trước ưu đãi hội viên / giảm tay").
- Dòng combo: 1 dòng cha (giá combo) + N dòng con (giá 0); BOM chỉ lấy từ dòng `SINGLE`.

**Thanh toán.** `Payments.AmountDue = SubtotalAmount − PromoDiscount − MemberDiscount − ManualDiscount − RoundingAdj`. Đây là bất biến được test kiểm sau mọi bộ test.

**Tương thích ngược.**

- `sp_SubmitOrder` vẫn nhận `@Items` (giá lấy từ DB) khi không có `@Lines`.
- Tham số mới đều có mặc định.
- API cũ nhận thêm trường tùy chọn.
- Thứ tự khóa: Sessions → Promotions → Ingredients → Members (deadlock: app retry 1205 ≤ 3 lần như cũ).

## Files

**Sửa:**

- SP: `sp_SubmitOrder`, `sp_SettleSession`, `sp_AdjustInventory`, `sp_Delete{MenuItem,Category,Ingredient,User}`.
- Backend: `src/{errors,app}.js`; `routes/{public,staff,admin,pages}.js`; `services/{order,session,menu,admin}Service.js`; `repositories/{orders,sessions,menu,reports}Repo.js`; `middleware/{rateLimit,validate}.js`.
- Frontend: `js/{cart,ui,admin-shell,pos-shell}.js`, `js/pages/{t-menu,t-track,pos-dashboard,pos-takeaway,pos-receipt,admin-menu,admin-reports}.js`, CSS.
- Kịch bản: `kịch-bản/seed-data.js`.
- Test: `tests/{api,sp}.test.js`, `tests/helpers/testDb.js`, `kiểm-thử/e2e/flow.spec.js`.

**Tạo:**

- `src/pricing/pricing.js`.
- Repositories: `settingsRepo`, `membersRepo`, `catalogRepo`, `promotionsRepo`, `modifiersRepo`, `shiftsRepo`, `refundsRepo`, `staffCallsRepo`, `stockRepo`.
- Services: `settingsService`, `memberService`, `pricingService`, `marketingService`, `modifierService`, `shiftService`, `refundService`, `staffCallService`, `stockService`.
- Routes: `routes/marketing.js`, `routes/operations.js`.
- Trang mới:
  - quầy: `pos/shift`;
  - quản lý: `admin/members`, `admin/combos`, `admin/promotions`, `admin/suggestions`, `admin/modifiers`, `admin/stock`, `admin/shifts`, `admin/settings`.
- Module FE: `js/options.js`, `js/member-box.js`.
- Test: `tests/pricing.test.js`, `tests/members.test.js`, `tests/sales.test.js`, `tests/operations.test.js`.
- Docs: FEATURE-013…023.

## Tác động quyền

| Ai | Được làm |
| --- | --- |
| Khách | Tra cứu/đăng ký hội viên (rate-limit); gắn/gỡ hội viên vào phiên của mình; gọi nhân viên (60 giây/phiên); xem báo giá giỏ |
| STAFF | Mở/đóng ca; nhận/tắt nhận đơn QR; xử lý gọi nhân viên; giảm giá tay trong ngưỡng; hoàn tiền khi kèm tài khoản quản lý xác thực lại |
| ADMIN | Mọi trang quản lý mới |

Khách gọi API quầy/quản lý vẫn bị 401/403 (ma trận quyền mở rộng trong test).

## Test scenarios

- **Unit `pricing`:**
  - khuyến mãi dòng: giá thấp nhất thắng;
  - combo không nhận `ITEM_PRICE`;
  - khuyến mãi đơn: lớn nhất thắng và phải đạt mức tối thiểu;
  - hội viên chỉ tính trên dòng cộng dồn, đơn đầu 10 %;
  - giảm tay;
  - làm tròn xuống 500đ, không âm;
  - lịch giờ/ngày trong tuần, khung qua nửa đêm.
- **Integration** (SQL Server thật): mọi mục "Kiểm" của skill cho từng feature, kèm hai kịch bản đồng thời:
  - 2 đơn tranh lượt `MaxUsesPerDay = 1`;
  - 2 lần hoàn tiền đồng thời không vượt số đã thu.
- **Regression:**
  - `npm test` cũ (thêm mở ca trong `before`);
  - E2E luồng lõi + E2E mới (hội viên ở giỏ, combo, gọi nhân viên, ca);
  - `npm run load`.
- **Bất biến** sau mọi bộ test:
  - kho: không âm, `ReservedQty` khớp, không trừ 2 lần;
  - tiền: `AmountDue` khớp breakdown, Σ hoàn ≤ đã thu.

## Rủi ro và phục hồi

- **Thu tiền bắt buộc có ca.** Dữ liệu dev đang có phiên mở vẫn thu được sau khi mở ca. POS hiện banner "Chưa mở ca" kèm nút mở ca.
- **Migration chạy trên `CafeQrDev` có dữ liệu thật.** Mọi cột mới đều nullable hoặc có default; đơn cũ không có `ListPrice` → hiển thị `UnitPrice`.
- **Không sửa migration đã chạy.** Muốn đổi thì tạo migration mới.

## Docs cần đồng bộ

- Đặc tả chức năng: FEATURE-013…023 + `chức-năng/README.md`.
- Nghiệp vụ: `business-rules.md` (BR-021…), `roles-permissions.md`.
- Kiến trúc: `data-model.md`, `api-contract.md`, `realtime-events.md`.
- Giao diện, vận hành: `screens-flows.md`, `local-development.md`, `hướng-dẫn/README.md`.
- Chất lượng, quản lý: `test-strategy.md`, `công-việc/README.md` + TASK-023…033, `open-questions.md` (Q-019, Q-020), handover.
