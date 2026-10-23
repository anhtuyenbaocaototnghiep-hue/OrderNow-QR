# FEATURE-028 — Lô & hạn sử dụng (FEFO)

> **Nguồn:** skill `advanced-features` §4 F-028. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-20, D-21.

- **Status:** CONFIRMED (ADR-006 D-20) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN bật theo lô, nhập hạn dùng; STAFF hủy lô hết hạn; job 06:00 cảnh báo.
- **Màn hình:**
  - **Quản lý → Kho nguyên liệu:**
    - **Kho nâng cao** → "Theo dõi theo lô + hạn sử dụng";
    - nút **Lô** (danh sách lô: còn, hạn, giá, nguồn; **Hủy lô**);
    - nhãn "Hết hạn x" trên dòng.
  - **Phiếu nhập:** nguyên liệu theo lô có ô **hạn sử dụng** + **mã lô**.
  - **Quầy → Kho & sơ chế → Hạn dùng:** lô đã / sắp hết hạn (3 ngày), **Hủy lô**.
  - **Tab Tồn kho:** cột "Hết hạn".
- **Dữ liệu:** migration `0022_lo_han_dung.sql`:
  - `Ingredients.TrackLots`;
  - `IngredientLots(LotCode, Qty, ExpiryDate, UnitCost, Source RECEIPT|PREP|ADJUST|RESTOCK, SourceId, IsClosed)`;
  - `InventoryTransactions.LotId`, `WasteLogs.LotId`;
  - unique `UX_InvTxn_Order_Ingredient` đổi thành `(OrderId, IngredientId, LotId)` khi DEDUCT.
- **SP / hàm:**
  - mới `sp_LotConsume` (FEFO, ghi vào bảng tạm `#LotUse` của SP gọi), `sp_SetTrackLots`, `tvf_ExpiredLotQty()`;
  - sửa mọi SP cộng/trừ kho: `sp_ReceiveStock`, `sp_CompleteOrder`, `sp_PostPrepBatch`, `sp_LogWaste`, `sp_AdjustInventory`, `sp_PostStocktake`, `sp_RefundPayment`, `sp_SubmitOrder`.

## Quy tắc (D-20)

1. **Bật / tắt:**
   - Bật theo lô: tồn hiện có thành lô "Tồn đầu" (không hạn).
   - Tắt: đóng mọi lô.
2. **Bất biến:** với nguyên liệu theo lô, **Σ Qty lô mở = `StockQty`**. Kiểm sau mọi bộ test (`LOTS_MISMATCH`), kể cả 40 thao tác ngẫu nhiên.
3. **Thứ tự trừ (FEFO):**
   1. lô còn hạn, hết hạn sớm trước;
   2. lô không hạn;
   3. lô đã hết hạn (chỉ để giữ bất biến khi món đã làm).

   Một lần trừ có thể tách nhiều dòng (mỗi lô một dòng).
4. **Lô hết hạn không tính vào khả dụng.** Khả dụng = tồn − đang giữ − lượng trong lô hết hạn. Áp ở: giữ kho khi gửi đơn, "Hết món" trên menu, sơ chế, danh sách kho.
5. **Nhập kho:** mỗi dòng của nguyên liệu theo lô thành một lô; hạn dùng nhập tay, hoặc hôm nay + `ShelfLifeHours`.
   - Sơ chế → lô `PREP`.
   - Điều chỉnh tăng / kiểm kê thừa → lô `ADJUST`.
   - Hoàn tiền hoàn kho → lô `RESTOCK`.
   - Điều chỉnh giảm / kiểm kê thiếu / hủy → trừ FEFO.
6. **Giá vốn FIFO** (`cost.method = FIFO`): dòng trừ lấy giá của lô; AVG thì lấy `AvgCost`.
7. **Job 06:00 `lot-expiry`:** phát `inventory.expiring` (≤ 2 ngày) và `inventory.expired` tới quầy.
8. **Hủy lô** = phiếu hủy `EXPIRED` cho toàn bộ phần còn lại của lô (`sp_LogWaste @LotId`).

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/admin/ingredients/{id}/lots?all=1` | ADMIN | `{ ingredient, lots[{ lotCode, qty, expiryDate, daysLeft, unitCost, source, isClosed }] }` |
| `POST /api/admin/lots/{id}/write-off` · `POST /api/lots/{id}/write-off` | ADMIN · STAFF+ | → phiếu hủy `EXPIRED` |
| `GET /api/lots/expiring?days=2` | STAFF+ | Lô mở đã / sắp hết hạn |
| `GET /api/ops/ingredients` | STAFF+ | Tồn kho quầy (có `expiredQty`) |

## Acceptance Criteria

- AC-028-01: Hai lô sữa (hạn +3 và +8 ngày): hủy 300 ml → trừ lô sớm trước; 400 ml tiếp → phần dư sang lô sau, 2 dòng.
- AC-028-02: Hoàn tất đơn vượt lô → nhiều dòng DEDUCT (khóa đơn × nguyên liệu × lô). FIFO dùng giá lô.
- AC-028-03: Nhập lô "C" 1.000 ml Sữa tươi có hạn dùng là hôm qua → tồn tăng 1.000 nhưng khả dụng không đổi (phần hết hạn = 1.000); lô hiện ở danh sách sắp / đã hết hạn của quầy (Kho & sơ chế → Hạn dùng) với số ngày còn lại −1; hủy lô → phiếu hủy lý do `EXPIRED`, lô đóng, tồn về như trước, phần hết hạn = 0. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-028-04: Σ lô = tồn sau 40 thao tác ngẫu nhiên (nhập có hạn, hủy, điều chỉnh, bán).

## Bằng chứng

- `tests/inventory2.test.js` → "Lô & hạn sử dụng — FEFO": 4 test.
- `helpers/testDb.js`: bất biến `LOTS_MISMATCH`, `CLOSED_LOT_HAS_QTY`, `DEDUCT_QTY_MISMATCH`.
