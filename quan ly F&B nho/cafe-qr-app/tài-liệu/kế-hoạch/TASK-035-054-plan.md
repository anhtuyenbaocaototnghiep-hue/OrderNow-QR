# Plan TASK-035…054 — giai đoạn 4–8 (skill `advanced-features`, ADR-006)

## Bước 0 — khảo sát (17/10/2026)

| Điểm skill yêu cầu xác nhận | Hiện trạng thật |
| --- | --- |
| `Payments` gắn phiên | Một dòng/phiên: `UX_Payments_Session (SessionId) WHERE SessionId IS NOT NULL`; mang đi `UX_Payments_Order`. CHECK `CK_Payments_Target` (phiên XOR đơn) |
| `InventoryTransactions.Type` | `DEDUCT`, `ADJUST`, `IMPORT`, `RESTOCK`. Unique `UX_InvTxn_Order_Ingredient (OrderId, IngredientId) WHERE Type='DEDUCT'` và bản `RESTOCK` |
| `Users.Role` | `CK_Users_Role CHECK (Role IN ('STAFF','ADMIN'))` |
| Job nền | Chưa có job / `setInterval` nghiệp vụ nào |
| Tiền đề | F-013, F-014, F-016, F-018, F-020, F-023, `pricing` → READY_FOR_REVIEW, đủ test |
| Baseline | `npm test` **109/109 PASS** (17/10/2026) |

## Bảng map "tên trong skill → tên thật"

| Skill | Feature repo | Task | Migration | SP / backend chính | UI chính |
| --- | --- | --- | --- | --- | --- |
| F-024 Gọi lại đơn / yêu thích | **FEATURE-045** | TASK-035 | `0015_goi_lai_don` | `MemberFavorites`; `recallService` | Thẻ "Lần trước bạn gọi" + ♥ (khách), quầy mang đi |
| F-040 Thực đơn theo lịch | FEATURE-040 | TASK-036 | `0016_lich_thuc_don` | `MenuSchedules(+Items)`; lọc menu + `nextChangeAt` | Quản lý → Lịch thực đơn (xem trước) |
| F-025 Thời gian chờ | FEATURE-025 | TASK-037 | `0017_thoi_gian_cho` | `MenuItems.PrepSeconds`, `ItemPrepStats`, `JobRuns`; `etaService`; job 02:00 | Giỏ + theo dõi đơn; cột "Mới" quầy |
| F-026 Chia bill | FEATURE-026 | TASK-038 | `0018_chia_bill` | `SessionSplits`, `OrderItems.SplitId/PaidAt`, `Payments.SplitId`; `sp_SettleSplit` | Theo dõi đơn "Chia bill"; drawer thu từng phần |
| F-031 Đơn vị & giá vốn | FEATURE-031 | TASK-039 | `0019_don_vi_gia_von` | `Units`, `Ingredients.AvgCost`, `OrderItems.CogsAmount`; sửa `sp_ReceiveStock`, `sp_CompleteOrder` | Đơn vị đóng gói ở phiếu nhập; báo cáo COGS |
| F-027 Bán thành phẩm | FEATURE-027 | TASK-040 | `0020_ban_thanh_pham` | `SemiRecipes(+Lines)`, `PrepBatches`; `sp_PostPrepBatch` | Quầy → Kho & sơ chế; công thức ở Kho nguyên liệu |
| F-032 Hao hụt định mức | FEATURE-032 | TASK-041 | `0021_hao_hut` | `WastePercent`, `WasteLogs`; `sp_LogWaste` | Phiếu hủy hàng; báo cáo thất thoát |
| F-028 Lô & FEFO | FEATURE-028 | TASK-042 | `0022_lo_han_dung` | `IngredientLots`, `sp_LotConsume`; mọi SP kho trừ/cộng theo lô | Hạn dùng ở phiếu nhập; tab Lô; cảnh báo hạn |
| F-030 Nhà cung cấp & PO | FEATURE-030 | TASK-043 | `0023_nha_cung_cap` | `Suppliers`, `PurchaseOrders(+Lines)`, `SupplierPriceHistory`; nhận hàng qua `sp_ReceiveStock @PoId` | Quản lý → Nhà cung cấp & đặt hàng; quầy nhận hàng |
| F-029 Dự báo nhập hàng | FEATURE-029 | TASK-044 | `0024_du_bao_nhap` | `DemandForecasts`; job 02:00; đề xuất nhập | Trang Đề xuất nhập hàng (SVG) |
| F-036 Trưởng ca | FEATURE-036 | TASK-045 | `0025_truong_ca` | `Role 'MANAGER'`; `auth/permissions.js` (ma trận); `LAST_ADMIN` | Tài khoản: vai Trưởng ca |
| F-033 Sổ quỹ | FEATURE-033 | TASK-046 | `0026_so_quy` | `CashCategories`, `CashTransactions`; sửa `sp_CloseShift` | Ca & hoàn tiền → Chi tiền / Thu khác; Quản lý → Sổ quỹ |
| F-035 Chấm công, phân ca, audit | FEATURE-035 | TASK-047 | `0027_cham_cong_audit` | `Attendance`, `Rosters`, `AuditLogs`; middleware `audit` | Quản lý → Nhân sự (chấm công, lịch, năng suất), Nhật ký thao tác |
| F-034 Lãi/lỗ | FEATURE-034 | TASK-048 | `0028_lai_lo` | `FixedCosts`; `reports/pnl` | Quản lý → Lãi/lỗ (ước tính) |
| F-039 Tích điểm & tem | FEATURE-039 | TASK-049 | `0029_tich_diem` | `PointTransactions`, `RewardCatalog`, `StampPrograms`…; `pricing` thưởng; `sp_ApplyMemberPayment` mở rộng | Drawer thu tiền đổi thưởng; khách xem điểm/tem |
| F-038 Giới thiệu bạn | FEATURE-038 | TASK-050 | `0030_gioi_thieu` | `Vouchers`, `Members.ReferredByMemberId`; `pricing` voucher | Ô SĐT người giới thiệu; ô mã voucher khi thu |
| F-037 Chiến dịch | FEATURE-037 | TASK-051 | `0031_chien_dich` | `Segments`, `Campaigns`, `CampaignDeliveries`; kênh `EXPORT`/`ZALO_OA` | Quản lý → Chiến dịch |
| F-041 Menu engineering | FEATURE-041 | TASK-052 | — (tính khi xem) | `reports/menu-engineering` | Biểu đồ 4 ô (SVG) |
| F-042 Phân tích | FEATURE-042 | TASK-053 | — | `reports/heatmap`, `revenue-forecast`, `compare`, `tables` | Trang Phân tích |
| F-043 Dashboard chủ quán | FEATURE-043 | TASK-054 | `0032_tong_hop_ngay` | `DailySummaries`; job 00:30 | `/admin/today` (MANAGER bản rút gọn) |

## Thứ tự làm

Theo skill mục 3:

| Giai đoạn | Thứ tự |
| --- | --- |
| 4 | 045 → 040 → 025 → 026 |
| 5 | 031 → 027 → 032 → 028 → 030 → 029 |
| 6 | 036 → 033 → 035 → 034 |
| 7 | 039 → 038 → 037 |
| 8 | 041 → 042 → 043 |

Mỗi giai đoạn chạy lại toàn bộ test (regression luồng lõi + giai đoạn 1–3) trước khi sang giai đoạn sau.

## Khóa (deadlock)

Thứ tự khóa chung:

1. Sessions → SessionSplits;
2. Shifts (S);
3. Promotions;
4. Ingredients (tăng dần theo `IngredientId`) → IngredientLots;
5. Orders;
6. Members → Vouchers.

SP mới giữ đúng thứ tự này, transaction ngắn, retry 1205 ≤ 3.

## Job nền (`src/jobs/scheduler.js`)

| Giờ quán | Job |
| --- | --- |
| mỗi 5 phút | `campaigns-due` (chiến dịch đã hẹn giờ — F-037) |
| mỗi 15 phút | `refresh-caches` (gợi ý F-017 + bảng thời gian chuẩn F-025), `attendance-autoclose` (F-035) |
| 00:30 | `daily-summary` (F-043) |
| 02:00 | `prep-stats` (F-025), `demand-forecast` (F-029) |
| 03:00 | `audit-retention` (nhật ký thao tác giữ 12 tháng — F-035) |
| 06:00 | `lot-expiry` (F-028) |
| 06:05 | `runout-alert` (F-029) |

Menu engineering (F-041) tính khi xem, không có job (cập nhật 18/10/2026 theo code `src/jobs/index.js`).

Đặc điểm:

- Mỗi job: khóa `Settings job.<name>.running` (hết hạn 30 phút), ghi `JobRuns`, idempotent.
- `JOBS_ENABLED=false` trong test; test gọi `runJob(name)` trực tiếp.

## Test

- Mỗi giai đoạn một file: `phase4.test.js`, `inventory2.test.js`, `finance.test.js`, `loyalty.test.js` (CRM), `analytics.test.js`, cộng unit `pricing.test.js`.
- `inventoryViolations` thêm các bất biến: lô, chia bill, điểm, sổ quỹ.
- E2E thêm luồng chính của từng giai đoạn.
