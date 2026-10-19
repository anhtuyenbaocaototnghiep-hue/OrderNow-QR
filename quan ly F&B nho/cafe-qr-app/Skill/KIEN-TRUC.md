# Kiến trúc — cafe-qr-app

> Bản tóm tắt kiến trúc để agent/người mới định hướng nhanh khi thêm chức năng.
> Nguồn chi tiết: `tài-liệu/kiến-trúc/` (system-overview, tech-stack, data-model, api-contract, realtime-events). Lệch nhau → làm theo `tài-liệu/`.
> Cập nhật: 19/10/2026. Yêu cầu nghiệp vụ: xem [YEU-CAU.md](YEU-CAU.md).

---

## 1. Tổng quan

**Một tiến trình Node.js** (REST API + Socket.io + serve FE tĩnh + job nền) và **một SQL Server**. Một quán, một kho. Không có cổng thanh toán, không có webhook vào.

```
┌──────────────────────┐   HTTP/JSON     ┌──────────────────────────────────┐   TDS    ┌────────────────────┐
│ HTML/CSS/JS thuần    │ ◄─────────────► │ Node.js + Express 5              │ ◄──────► │ SQL Server         │
│  /t/*     khách      │   Socket.io     │  /api/*  REST                    │          │  Bảng + CHECK      │
│  /pos/*   quầy       │ ◄─────────────► │  Socket.io hub (staff/session/   │          │  Stored procedures │
│  /admin/* quản lý    │                 │            public)               │          │  Transaction +     │
└──────────┬───────────┘                 │  Job scheduler (setInterval 30s) │          │  row-lock          │
           │ window.print()              │  FE tĩnh ứng-dụng/giao-diện/     │          └────────────────────┘
     ┌─────▼──────┐                      └───────┬──────────────┬───────────┘
     │ Máy in nhiệt│                             │              │ (tùy chọn, chỉ chiều đi)
     │ 58/80 mm   │                     uploads/receipts/   Zalo OA (ZALO_OA_TOKEN)
     └────────────┘
```

| Thành phần | Trách nhiệm | Không làm |
| --- | --- | --- |
| **Frontend** (HTML/CSS/JS thuần, ES modules, không build) | Render DOM, giỏ hàng `localStorage`, gọi `fetch` qua `api.js`, subscribe Socket.io | Không tính tiền, không quyết kho, không kiểm quyền "thật" |
| **Backend API** | Xác thực/phân quyền, validate (zod), điều phối use case, gọi SP, phát realtime | Không trừ kho kiểu "đọc rồi ghi" ngoài transaction |
| **Realtime hub** | Room `staff`, `session:{id}`, `public`; broadcast sau commit | Không phải nguồn sự thật, không lưu trạng thái |
| **SQL Server** | Lưu dữ liệu, **giữ bất biến kho/tiền** bằng SP + transaction + `UPDLOCK` + CHECK | — |
| **Job scheduler** | Job nền theo giờ quán, có khóa DB chống chạy trùng | Không dùng `node-cron`, không rải nhiều timer |

---

## 2. Tech stack (đã cài, theo `package.json`)

| Lớp | Thành phần |
| --- | --- |
| Runtime | Node.js ≥ 22.9 (dev: 24), ES modules (`"type": "module"`), `--env-file-if-exists=.env` |
| HTTP | express 5, helmet (CSP), cookie-parser, express-rate-limit |
| Realtime | socket.io 4 (client nạp từ `/socket.io/socket.io.min.js`) |
| DB | SQL Server 2019+/2022, driver `mssql` (tedious), TVP `dbo.OrderItemInput` |
| Validation / Auth | zod 4; jsonwebtoken (HS256) + bcryptjs (cost 10); cookie `cf_client` cho khách |
| QR | `qrcode` |
| FE | HTML5/CSS3/ES modules thuần; biểu đồ SVG tự vẽ; không framework, không jQuery/Bootstrap |
| Test | `node --test` + supertest (integration trên SQL Server thật), Playwright/Chromium (E2E), script tải `kịch-bản/load-concurrency.js` |
| Chất lượng | ESLint 9 (flat config) + Prettier 3 |

Quyết định stack: [ADR-002](../tài-liệu/quyết-định/ADR-002-stack-html-node-sqlserver.md) · chi tiết: [tech-stack.md](../tài-liệu/kiến-trúc/tech-stack.md).

---

## 3. Cấu trúc thư mục

```
cafe-qr-app/
├─ ứng-dụng/
│  ├─ máy-chủ/
│  │  ├─ src/
│  │  │  ├─ server.js            # khởi động HTTP + Socket.io + bật job scheduler
│  │  │  ├─ app.js               # tạo Express app, gắn middleware + router theo thứ tự
│  │  │  ├─ config.js, db.js, errors.js
│  │  │  ├─ routes/              # HTTP adapter: parse + validate + gọi service
│  │  │  ├─ services/            # use case, không biết HTTP; ném lỗi nghiệp vụ có mã
│  │  │  ├─ repositories/        # gọi SP / query SQL
│  │  │  ├─ pricing/pricing.js   # bộ tính giá dùng chung (BR-021/BR-057)
│  │  │  ├─ domain/              # hàm thuần: eta, inventory, menuSchedule, analytics
│  │  │  ├─ auth/permissions.js  # ma trận PERMISSIONS, can(), requirePermission()
│  │  │  ├─ middleware/          # auth, client token, audit, validate, rateLimit, errorHandler
│  │  │  ├─ realtime/            # io.js (handshake, room), publisher.js (publish sau commit)
│  │  │  ├─ jobs/                # scheduler.js + index.js (danh sách job)
│  │  │  ├─ channels/zaloOa.js   # kênh gửi tin chiến dịch
│  │  │  └─ utils/               # csv, time (giờ quán UTC+7), tokens
│  │  └─ tests/                  # *.test.js (unit + integration), helpers/testDb.js
│  └─ giao-diện/public/
│     ├─ t/       # trang khách: index (vào bàn), menu, track
│     ├─ pos/     # trang quầy: index, login, takeaway, table-order, shift, stock, receipt
│     ├─ admin/   # trang quản lý (menu, bom, tables, users, reports, members, analytics, today…)
│     ├─ js/      # module dùng chung (api, socket, ui, cart, auth, print…) + js/pages/<trang>.js
│     └─ css/     # base, customer, pos, admin, print
├─ cơ-sở-dữ-liệu/
│  ├─ chuyển-đổi/   # migration đánh số 0001_…sql → 0033_…sql (KHÔNG sửa file đã chạy)
│  ├─ thủ-tục/      # SP/function, idempotent CREATE OR ALTER
│  └─ cài-đặt/      # local-sql-setup.sql (tạo DB + login)
├─ kịch-bản/        # db-migrate, db-seed, setup, load-concurrency, qr-links, sync-skills.sh
├─ kiểm-thử/e2e/    # Playwright
├─ tài-liệu/        # docs nguồn sự thật
├─ .agent/skills/   # skill nguồn → đồng bộ sang .claude/skills/ (npm run skills:sync)
└─ Skill/           # tài liệu skill / tóm tắt (thư mục này)
```

---

## 4. Phân tầng backend

```
routes/ (HTTP adapter, zod, requireAuth / requirePermission)
   │ gọi
   ▼
services/ (use case: submitOrder, completeOrder, settleSession, settleSplit, refund, …)
   │ gọi                         │ sau commit
   ▼                             ▼
repositories/ ──► SP / SQL    realtime/publisher.js ──► Socket.io rooms
   │
   ▼
SQL Server (transaction + UPDLOCK + CHECK)
```

Quy tắc:
- Route **không** gọi DB trực tiếp; chỉ parse, validate, gọi service, để `errorHandler` map lỗi → HTTP.
- Service **không** biết HTTP; ném lỗi có mã (`OUT_OF_STOCK`, `ALREADY_PROCESSED`, `NO_OPEN_SHIFT`…). Bảng mã lỗi SP → `src/errors.js`.
- Mọi thao tác **đổi trạng thái đơn + kho + tiền** đi qua **một SP / một transaction**; cấm "SELECT rồi UPDATE" tách rời.
- Realtime phát **sau commit**, mọi payload có `emittedAt`.
- Tiền tính ở server bằng `pricing`; giá client gửi bị bỏ qua.

### Thứ tự middleware / router trong `/api` (`src/app.js`)

`ensureClientToken` → `auditTrail` → `public` (khách) → `engagement` (gọi lại đơn, ETA, chia bill) → `/admin` (`requireAdmin`: admin, advanced, financeAdmin, marketing, analytics) → `ops` (kho quầy) → `finance` (sổ quỹ, chấm công) → `loyalty` (điểm/tem/voucher ở quầy) → `dashboard` → `staff`.

Sau `/api`: `pagesRouter` (trang sạch: `/t/:qrToken`, `/pos`, `/admin/*`) → `express.static` → 404 → `errorHandler`.

---

## 5. Xác thực và phân quyền

| Đối tượng | Cơ chế | Room realtime |
| --- | --- | --- |
| Khách | Cookie `cf_client` (gắn `SessionClients`) + `sessionId` | `session:{id}` (server kiểm cookie thuộc phiên lúc handshake), `public` |
| STAFF / MANAGER / ADMIN | JWT HS256 (`Authorization: Bearer`), hạn `JWT_EXPIRES_IN` (8h); khóa tài khoản → token bị từ chối ở request kế | `staff` |

- Ma trận quyền: `src/auth/permissions.js` — `pos.use`, `shift.manage`, `cash.create`, `cash.approve`, `attendance.edit`, `prep.post`, `waste.create`, `po.receive`, `inventory.adjust`, `stocktake.post`, `dashboard.view`, `admin.all`.
- Thứ bậc STAFF < MANAGER < ADMIN. Chưa đăng nhập → 401, thiếu quyền → 403.
- Thao tác vượt ngưỡng (giảm tay, hoàn tiền, xóa món đã tiếp nhận) → người có quyền cao hơn nhập `adminUsername`/`adminPassword`, lưu `ApprovedBy`, không lưu mật khẩu.
- Test quyền sinh trực tiếp từ bảng `PERMISSIONS`.

---

## 6. Dữ liệu và stored procedures

### 6.1. Nhóm bảng chính

| Nhóm | Bảng tiêu biểu |
| --- | --- |
| Người dùng & nhân sự | `Users` (Role STAFF/MANAGER/ADMIN), `Attendance`, `Rosters`, `AuditLogs` |
| Bàn & phiên | `Tables` (`QrToken`), `Sessions` (OPEN → PAYMENT_REQUESTED → CLOSED), `SessionClients`, `SessionSplits`, `StaffCalls` |
| Menu | `Categories`, `MenuItems`, `BomItems`, `ComboComponents`, `ModifierGroups`, `ModifierOptions`, `ModifierOptionBom`, `MenuItemModifierGroups`, `MenuSchedules`, `MenuScheduleItems` |
| Khuyến mãi | `Promotions`, `PromotionTargets`, `PromotionUsages` |
| Đơn | `Orders` (PENDING → PREPARING → COMPLETED / CANCELLED), `OrderItems` (giá chốt, `CogsAmount`), `OrderItemModifiers`, `OrderIngredients` (lượng giữ), `OrderItemVoids` |
| Tiền | `Payments` (CASH, breakdown Promo/Member/Voucher/Reward/Manual/Rounding), `Refunds`, `Shifts`, `CashCategories`, `CashTransactions`, `FixedCosts` |
| Kho | `Ingredients` (`StockQty`, `ReservedQty`, `AvgCost`, `Kind`, `TrackLots`), `InventoryTransactions`, `IngredientLots`, `Units`, `SemiRecipes`, `SemiRecipeLines`, `PrepBatches`, `WasteLogs`, `StockReceipts`, `StockReceiptLines`, `Stocktakes`, `StocktakeLines` |
| Mua hàng | `Suppliers`, `SupplierIngredients`, `SupplierPriceHistory`, `PurchaseOrders` (DRAFT → SENT → PARTIAL → RECEIVED), `PurchaseOrderLines`, `DemandForecasts` |
| CRM | `Members`, `MemberTiers`, `MemberTransactions`, `MemberFavorites`, `PointTransactions`, `RewardCatalog`, `RewardRedemptions`, `StampPrograms`, `StampProgramItems`, `StampCards`, `StampEvents`, `Vouchers`, `Segments`, `Campaigns`, `CampaignDeliveries` |
| Phân tích & hệ thống | `DailySummaries`, `ItemPrepStats`, `JobRuns`, `Settings` |

Sơ đồ + DDL + migration 0001…0033: [data-model.md](../tài-liệu/kiến-trúc/data-model.md).

### 6.2. Stored procedures giữ bất biến (`cơ-sở-dữ-liệu/thủ-tục/`)

| SP | Việc |
| --- | --- |
| `sp_SubmitOrder` | Gửi đơn tại bàn / tạo đơn mang đi đã thu; giữ kho có điều kiện; mang đi gọi `sp_ApplyLoyalty` |
| `sp_CompleteOrder` | `PREPARING → COMPLETED`, trừ `StockQty` + `ReservedQty`, chốt giá vốn, FEFO qua `sp_LotConsume` |
| `sp_CancelOrder`, `sp_CancelOrders` | Hủy đơn / hủy bàn, trả phần giữ |
| `sp_RequestPayment` | Gọi thanh toán (idempotent) |
| `sp_SettleSession`, `sp_SettleSplit` | Thu tiền cả phiên / từng phần chia bill, một lần, `@ExpectedDue` chống thu sai |
| `sp_RefundPayment` | Hoàn tiền, hoàn kho, `sp_ReverseLoyalty` |
| `sp_VoidOrderItem` | Sửa / xóa món chưa thu (F-046) |
| `sp_AdjustInventory`, `sp_PostStocktake`, `sp_ReceiveStock`, `sp_PostPrepBatch`, `sp_LogWaste`, `sp_SetTrackLots` | Kho: điều chỉnh, kiểm kê, nhập, sơ chế, hủy hàng, bật/tắt theo lô |
| `sp_CloseShift`, `sp_CashTransactions`, `sp_Attendance` | Ca, sổ quỹ, chấm công |
| `sp_Loyalty`, `sp_ApplyMemberPayment` | Điểm, tem, voucher, đổi thưởng — **trong cùng transaction lượt thu** |
| `sp_Delete*` | Xóa hẳn nếu chưa có lịch sử, ngược lại xóa mềm (ADR-004) |

Thứ tự khóa chuẩn: `Sessions` → `Orders` → `Ingredients`. Bất biến được test tự động trong `tests/helpers/testDb.js → inventoryViolations` (kho ≥ 0, Σ lô = tồn, `COGS_MISMATCH`, `OVER_RESTOCK`, `ORDER_LINES_MISMATCH`, `LOTS_MISMATCH`…).

---

## 7. Luồng chính (dine-in)

```
Khách quét QR ──► GET /t/:qrToken ──► tạo/gộp Sessions (cookie cf_client)
      │
      ▼
Gửi đơn ──► sp_SubmitOrder (kiểm + GIỮ kho, chốt giá, KM) ──commit──► order.created → staff + session
      │
Quầy Tiếp nhận ──► PENDING → PREPARING ──► order.status_changed
      │
Quầy Hoàn tất ──► sp_CompleteOrder (TRỪ kho đúng 1 lần, chốt COGS) ──► order.status_changed (+ inventory.low)
      │
Khách Gọi thanh toán ──► sp_RequestPayment ──► session.payment_requested (âm thanh riêng)
      │
Quầy Thu tiền mặt ──► pricing + sp_SettleSession (ca đang mở, loyalty cùng transaction) ──► session.settled
      │
In bill (window.print, 58/80 mm) ──► phiên CLOSED; quét lại QR → phiên mới
```

Mang đi: quầy tạo đơn đã thu tiền ngay (`PREPARING` + `PAID`) qua `sp_SubmitOrder`, rồi Hoàn tất như trên.

Máy trạng thái chi tiết: [workflows-states.md](../tài-liệu/nghiệp-vụ/workflows-states.md).

---

## 8. Realtime (Socket.io)

- Xác thực lúc handshake: `auth: { token }` → room `staff`; `auth: { sessionId }` + cookie → `session:{id}`; mọi kết nối vào `public`.
- Sau mỗi lần (re)connect server gửi `ready` → client **tải lại ảnh chụp** rồi mới áp sự kiện. Sự kiện chỉ là "gợi ý cập nhật".
- Sự kiện chính: `order.created`, `order.status_changed`, `order.cancelled`, `session.payment_requested`, `session.settled`, `session.closed`, `session.split_changed`, `session.member_changed`, `menu.availability_changed`, `menu.updated`, `inventory.low/prepared/expiring/expired/runout/received`, `cash.created/reviewed`, `member.vouchers_issued` (bản session không có mã voucher).
- Phát qua `publish()` trong `src/realtime/publisher.js`, **sau commit**.

Chi tiết: [realtime-events.md](../tài-liệu/kiến-trúc/realtime-events.md).

---

## 9. Job nền (`src/jobs/`)

Một `setInterval` 30 giây; job theo giờ quán (`at: 'HH:MM'`) hoặc chu kỳ (`everyMinutes`). Mỗi lần chạy giành khóa `Settings.job.<name>.running` (hết hạn 30 phút), ghi `JobRuns` RUNNING → OK/FAILED/SKIPPED. Job phải **idempotent** (MERGE theo khóa). `JOBS_ENABLED=false` tắt tự chạy (test/E2E) nhưng vẫn gọi được `runJob(name)` / `POST /api/admin/jobs/{name}/run`.

| Job | Lịch | Việc |
| --- | --- | --- |
| `refresh-caches` | 15 phút | Cache gợi ý món, thời gian chuẩn món |
| `attendance-autoclose` | 15 phút | Đóng chấm công quên đăng xuất |
| `campaigns-due` | 5 phút | Chạy chiến dịch hẹn giờ |
| `daily-summary` | 00:30 | `DailySummaries` hôm qua |
| `prep-stats` | 02:00 | Trung vị thời gian pha 30 ngày |
| `demand-forecast` | 02:00 | Dự báo nhu cầu 14 ngày |
| `audit-retention` | 03:00 | Xóa nhật ký > 12 tháng |
| `lot-expiry` | 06:00 | Cảnh báo lô sắp/đã hết hạn |
| `runout-alert` | 06:05 | Cảnh báo nguyên liệu sắp hết trước ngày giao |

---

## 10. Khối xuyên suốt

| Khối | Vị trí | Ghi chú |
| --- | --- | --- |
| Bộ tính giá | `src/pricing/pricing.js` | Thứ tự: KM → hội viên → voucher → đổi thưởng → giảm tay → làm tròn xuống 500đ. Chia bill phân bổ KM đơn theo dòng |
| Nhật ký thao tác | `src/middleware/audit.js` | Ghi khi status < 400 (sau commit), before/after JSON, bỏ password/token, SĐT còn 3 số cuối; trigger chặn UPDATE |
| Giờ quán | `src/utils/time.js` | UTC+7 cho lịch thực đơn, báo cáo, job |
| Ảnh hóa đơn | `<UPLOADS_DIR>/receipts/` | jpg/png/webp ≤ 2 MB, kiểm chữ ký file; không serve tĩnh, xem qua API có đăng nhập |
| Kênh Zalo OA | `src/channels/zaloOa.js` | `send({ phone, text })`, timeout 10 s; không có token → chỉ xuất CSV |
| Cài đặt | bảng `Settings` + `settingsService` | Ngưỡng giảm tay, duyệt chi, ETA, tỷ lệ điểm… chỉnh ở Quản lý → Cài đặt |

---

## 11. Cấu hình và vận hành

Biến môi trường (`.env`, mẫu `.env.example`): `PORT`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT`, `TEST_DB_NAME` (phải kết thúc bằng `Test`), `JWT_SECRET`, `JWT_EXPIRES_IN`, `PUBLIC_BASE_URL`, `SHOP_NAME`, `SHOP_ADDRESS`, `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD`, `RATE_LIMIT`, `TRUST_PROXY`, `JOBS_ENABLED`, `UPLOADS_DIR`, `ZALO_OA_TOKEN`, `ZALO_OA_URL`.

| Lệnh | Việc |
| --- | --- |
| `npm run db:migrate` | Chạy migration + SP |
| `npm run db:seed` (`:demo`, `:mau2`) | Dữ liệu mẫu, in URL QR |
| `npm run dev` | Chạy dev ở `http://localhost:3000` |
| `npm test` | Unit + integration trên DB `CafeQrTest` (bị xóa sạch mỗi lần) |
| `npm run test:e2e` | Playwright |
| `npm run load` | Ép tải tranh chấp kho (NFR-002) + đo độ trễ realtime (NFR-001) |
| `npm run lint && npm run format:check` | Chất lượng code |

Hosting: một tiến trình Node + một SQL Server — chạy trong LAN quán hoặc cloud (Q-008 còn mở). Hướng dẫn: [local-development.md](../tài-liệu/vận-hành/local-development.md).

---

## 12. Checklist khi thêm chức năng mới

Quy trình đầy đủ, quyết định mặc định và đặc tả từng feature: [.agent/skills/them-chuc-nang/SKILL.md](../.agent/skills/them-chuc-nang/SKILL.md).

1. Khảo sát code/schema/SP/route **thật** trước, không đoán tên file.
2. Chạm DB / quyền / contract API-realtime / ≥ 2 module → viết `tài-liệu/kế-hoạch/TASK-xxx-plan.md` trước.
3. DB: migration mới `cơ-sở-dữ-liệu/chuyển-đổi/00xx_<tên>.sql` (không sửa file cũ); SP `CREATE OR ALTER`; khóa theo thứ tự `Sessions → Orders → Ingredients`.
4. Backend: route → service → repository/SP; quyền thêm vào `PERMISSIONS` nếu cần; tiền qua `pricing`; realtime phát sau commit; thao tác đổi tiền/kho/quyền/giá đăng ký vào luật audit.
5. Frontend: trang HTML trong khu vực đúng (`t/`, `pos/`, `admin/`) + `js/pages/<trang>.js`, dùng lại `api.js`, `socket.js`, `ui.js`; ẩn/hiện theo vai.
6. Test: unit (hàm thuần), integration trên SQL Server thật (gồm tranh chấp đồng thời nếu chạm kho/tiền), E2E nếu có UI; bất biến `inventoryViolations` vẫn sạch.
7. Đồng bộ docs: `api-contract.md`, `data-model.md`, `realtime-events.md`, `FEATURE-xxx.md`, `business-rules.md`.
