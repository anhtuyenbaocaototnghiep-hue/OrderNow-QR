# TASK-042 — Lô & hạn sử dụng (FEFO)
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-028 (AC-028-01…04)
Nguồn: skill `advanced-features` §4 F-028 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-20, D-21 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Nguyên liệu dễ hỏng được theo dõi theo lô có hạn dùng; mọi lần trừ kho lấy lô hết hạn sớm trước (FEFO); lô đã hết hạn không tính vào khả dụng và được cảnh báo cho quầy. Giữ bất biến Σ lô mở = tồn.

## Phạm vi
- Migration `0022_lo_han_dung.sql` (`Ingredients.TrackLots`, `IngredientLots`, `InventoryTransactions.LotId`, `WasteLogs.LotId`; unique `UX_InvTxn_Order_Ingredient` đổi thành `(OrderId, IngredientId, LotId)` khi DEDUCT).
- SP / hàm:
  - mới `sp_LotConsume` (FEFO, ghi bảng tạm `#LotUse` của SP gọi), `sp_SetTrackLots`, `tvf_ExpiredLotQty()` (file `fn_ExpiredLots.sql`);
  - sửa mọi SP cộng / trừ kho: `sp_ReceiveStock`, `sp_CompleteOrder`, `sp_PostPrepBatch`, `sp_LogWaste`, `sp_AdjustInventory`, `sp_PostStocktake`, `sp_RefundPayment`, `sp_SubmitOrder`.
- Backend: route `GET /api/admin/ingredients/:id/lots`, `POST /api/admin/lots/:id/write-off`, `POST /api/lots/:id/write-off`, `GET /api/lots/expiring`, `GET /api/ops/ingredients`; giá vốn FIFO theo lô khi `cost.method = FIFO`.
- Job `lot-expiry` 06:00 → realtime `inventory.expiring` / `inventory.expired` tới quầy.
- UI:
  - Kho nâng cao: "Theo dõi theo lô + hạn sử dụng"; nút **Lô** (danh sách lô, **Hủy lô**);
  - phiếu nhập có hạn sử dụng + mã lô;
  - quầy Kho & sơ chế → tab **Hạn dùng**; tab Tồn kho có cột "Hết hạn".

## Phụ thuộc
TASK-039 (giá vốn), TASK-040 (lô `PREP`), TASK-041 (`sp_LogWaste` để hủy lô), TASK-037 (bộ lập lịch).

## Validation
`inventory2.test.js` → "Lô & hạn sử dụng — FEFO (F-028)" (4 test, gồm 40 thao tác ngẫu nhiên giữ Σ lô = tồn); bất biến `helpers/testDb.js` (`LOTS_MISMATCH`, `CLOSED_LOT_HAS_QTY`, `DEDUCT_QTY_MISMATCH`); `npm run load` (§13.2 tranh chấp kho) PASS; chạy lại toàn bộ `npm test`, `npm run test:e2e`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-028, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
