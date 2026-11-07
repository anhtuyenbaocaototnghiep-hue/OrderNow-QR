---
name: han-dung-nguyen-lieu
description: Hạn dùng nguyên liệu cho cafe-qr-app (FEATURE-075, ADR-033, TASK-092) — hộp / gói đang mở theo từng nguyên liệu (PackSize + OpenShelfHours, tự cập nhật khi bán / sơ chế bằng sp_TrackOpenPacks, không cần bấm "mở hộp"), quá hạn sau khi mở thì phần còn không tính là còn hàng (tvf_ExpiredLotQty) và quầy "Bỏ phần còn" (sp_DiscardOpenPack → phiếu hủy EXPIRED), rủi ro 2 ngày quy ra tiền (lô + hộp mở, chỉ quản lý thấy tiền), món nên mời ở máy quầy, thẻ "Sắp hết hạn" ở trang Hôm nay, cảnh báo EXPIRY_RISK 06:00, tiền hủy vì hết hạn theo tháng (nguyên liệu, nhà cung cấp). Dùng khi task giao F-075 / ADR-033 / TASK-092 / AC-075-xx, hoặc nhắc "hết hạn", "hạn dùng", "hạn sau khi mở", "hộp đang mở", "mở hộp", "sữa hỏng", "đổ bỏ", "món nên mời", "nên đẩy bán", "tiền hủy", "EXPIRY_RISK".
---

# Mục đích

Ghi lại phần **hạn dùng nguyên liệu** (làm ngày 07/11/2026, TASK-092) để agent sau sửa, mở rộng hoặc làm lại mà không làm hỏng bất biến kho / lô, không rút hạn cả lô khi mở một hộp, không lộ giá vốn cho nhân viên.

Nguồn chính là tài liệu trong repo; lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-033-han-dung-nguyen-lieu.md` (D-147…D-152) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-075.md` (AC-075-01…05) — nền `FEATURE-028.md` (lô, FEFO) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-113 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-092.md`, `tài-liệu/kế-hoạch/TASK-092-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-075" |

# Khi dùng

- Thêm việc 4 / 5 của phương án: cảnh báo hàng cận hạn lúc nhập (tính vào điểm nhà cung cấp), giới hạn đề xuất nhập theo hạn (F-029).
- Thêm tự giảm giá món nên mời (đụng luật giá — cần ADR + chủ dự án quyết mức giảm).
- Chủ quán hỏi "sao món này báo hết", "hộp sữa còn mà app bảo quá hạn", "tiền hủy tháng này ở đâu" (mục 6).

# Điều kiện trước

- F-028 (lô, `tvf_ExpiredLotQty`, `sp_LotConsume`, `sp_LogWaste`) đã có. Bất biến: tồn ≥ 0, giữ chỗ ≤ tồn, Σ lô mở = tồn (nguyên liệu theo lô).

# 1. Bước 0: khảo sát rồi mới sửa

Đọc: `cơ-sở-dữ-liệu/thủ-tục/sp_OpenPacks.sql` (`sp_TrackOpenPacks`, `sp_DiscardOpenPack`), `fn_ExpiredLots.sql`, đoạn "3c" trong `sp_CompleteOrder.sql`, đoạn sau trừ đầu vào trong `sp_PostPrepBatch.sql`; `services/expiryService.js` (`risk`, `withoutMoney`, `discardOpenPack`, `expiredWaste`, `dailyAlert`), `repositories/expiryRepo.js`, `routes/expiry.js`, `routes/advanced.js` (`/ingredients/:id/advanced`, `/expiry/waste`), `alertService.onExpiryRisk`, `dashboardService.today`; giao diện `inventory-advanced.js` (nhóm "Hạn sau khi mở"), `pages/pos-stock.js` (`openPackCard`), `pos-shell.js` (`loadPushItems`), `pages/admin-today.js` (`expiryCard`), `pages/admin-alerts.js`.

# 2. Quy tắc (BR-113)

- **Vì sao theo nguyên liệu, không theo lô:** một lô = một dòng phiếu nhập = thường nhiều hộp; mở một hộp mà rút hạn cả lô thì hộp chưa mở bị ép hủy.
- **Cập nhật hộp mở** (`sp_TrackOpenPacks`, đọc `#PackUse(IngredientId, Qty)`): q ≤ còn → còn −= q; ngược lại mở ⌈(q − còn) / dung tích⌉ hộp, giờ mở = `@At` (giờ bán / sơ chế; đơn gửi bù dùng giờ bán thật), còn = hộp × dung tích − (q − còn); còn = 0 → `OpenedAt = NULL`; còn ≤ tồn. Chỉ nguyên liệu có `PackSize > 0` và `OpenShelfHours`.
- **Quá hạn sau khi mở:** `DATEADD(HOUR, OpenShelfHours, OpenedAt) < now` → phần còn (≤ tồn) vào `tvf_ExpiredLotQty`, gộp với lô hết hạn bằng **MAX** (không trừ hai lần).
- **Bỏ phần còn:** min(còn, tồn − giữ chỗ) → `sp_LogWaste` lý do `EXPIRED` (theo lô thì FEFO, có giá vốn) → xóa trạng thái; không có hộp mở → `50124 NO_OPEN_PACK`.
- **Rủi ro:** lô hết hạn ≤ 2 ngày (kể cả đã hết) + hộp mở hết trong 48 giờ (kể cả đã quá); giá trị = phần còn × (giá lô > 0 ? giá lô : giá vốn bình quân). **Số tiền chỉ cho ADMIN** (`withoutMoney` cho người khác).
- **Món nên mời:** món SINGLE còn bán, chưa xóa, dùng nguyên liệu sắp (chưa) hết hạn — trực tiếp trong `BomItems` hoặc qua `SemiRecipeLines` (bán thành phẩm sơ chế từ nó); tối đa 6, hạn sớm trước, kèm `because`.
- **Cảnh báo:** job 06:00 `lot-expiry` gọi `dailyAlert` → `EXPIRY_RISK`, `dedupeKey EXPIRY:<ngày>`.
- **Tiền hủy theo tháng:** `WasteLogs.Reason = 'EXPIRED'` ⨝ `InventoryTransactions.WasteId` (CostAmount); nhà cung cấp: `t.LotId` → lô `RECEIPT` → `StockReceipts` → `Suppliers.Name` / `Supplier`; không theo lô → `name: null`.

# 3. Dữ liệu và API

- Migration `0052`: `Ingredients.PackSize`, `OpenShelfHours`, `OpenedAt`, `OpenLeft` (+ CHECK), `CK_Alerts_Kind` thêm `EXPIRY_RISK`.
- API: `GET /api/expiry/risk`, `POST /api/ingredients/{id}/discard-open` (nhật ký `inventory.discard-open`), `GET /api/admin/expiry/waste?month=`; `PUT /api/admin/ingredients/{id}/advanced` + `packSize`, `openShelfHours` (cả hai hoặc null; không gửi → giữ nguyên); `GET /api/dashboard/today` + `expiry`.

# 4. Giao diện

- Kho nâng cao: `#adv-pack`, `#adv-open` (nhóm `fieldset.open-pack`); `costLine` ghi "hộp … mở rồi dùng trong … giờ · hộp đang mở còn …".
- Quầy → Kho & sơ chế → Hạn dùng: `.open-packs` (từ `/api/expiry/risk`, `kind: OPEN`) + "Bỏ phần còn" (`confirmDialog`).
- Máy quầy: `#push-items` (sau `#att-remind`), tải mỗi 10 phút, ẩn theo chữ ký `menuItemId,…` trong `sessionStorage` (`push-items-hidden`).
- Hôm nay: `expiryCard` (tiền chỉ khi `d.full`).

# 5. Mở rộng — chỗ dễ sai

- **Đừng** gắn hạn sau khi mở vào lô hay sửa `ExpiryDate` của lô khi mở hộp.
- **Đừng** cập nhật hộp mở ở hủy / điều chỉnh / kiểm kê (không phải "dùng") — chỉ bán và sơ chế. Đổ bỏ ngoài app → nhân viên bấm "Bỏ phần còn".
- Thêm nơi trừ kho do dùng mới (vd. bán combo kiểu khác): tạo `#PackUse` rồi `EXEC dbo.sp_TrackOpenPacks @At = …` trong cùng transaction, sau khi trừ tồn.
- `tvf_ExpiredLotQty` là nguồn khả dụng của cả app (giữ kho khi gửi đơn, "Hết món", sơ chế, dự báo) — đổi công thức thì chạy lại toàn bộ test kho / bán.
- Test: đặt `OpenedAt` lùi giờ bằng SQL để giả lập quá hạn; nhập phiếu có giá trước khi kiểm số tiền (giá vốn mẫu có thể = 0); `POST /api/lots/{id}/write-off` trả **201**.
- Tự giảm giá món nên mời / cảnh báo cận hạn lúc nhập / giới hạn đề xuất nhập: việc sau, cần duyệt.

# 6. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Đặt thế nào cho sữa tươi?" | Kho nâng cao: hộp 1000 (ml), mở rồi dùng 72 (giờ) — hỏi hạn ghi trên hộp "sau khi mở dùng trong…" |
| "Món báo Hết món dù còn sữa" | Hộp đang mở đã quá hạn → phần còn không được bán; quầy → Hạn dùng → Bỏ phần còn (rồi mở hộp mới khi pha) |
| "App bảo hộp mở còn 300 ml mà thực tế hết" | Có đổ / làm đổ ngoài app — bấm Bỏ phần còn (hoặc ghi phiếu hủy) để đưa về đúng |
| "Tiền mất vì hết hạn tháng này?" | Hôm nay → Sắp hết hạn → mục "Tháng này đã hủy vì hết hạn" (theo nguyên liệu, nhà cung cấp) |
| "Sao nhân viên không thấy số tiền?" | Cố ý — giá vốn chỉ quản lý thấy |
| "Không muốn dải Nên mời khách" | Bấm Ẩn (hiện lại khi danh sách đổi); hoặc bỏ cấu hình hạn sau khi mở |

# 7. Làm lại từ đầu (bản code chưa có F-075)

1. Docs: ADR-033, FEATURE-075, BR-113, US-075-1/2, tc-map, api-contract, data-model, screens (SCR-55), UAT-44.
2. Migration 0052 + `sp_OpenPacks.sql` + móc vào `sp_CompleteOrder` / `sp_PostPrepBatch` + `tvf_ExpiredLotQty`; lỗi `50124` trong `errors.js`.
3. `expiryRepo`, `expiryService`, `routes/expiry.js`, `advanced.js` (cấu hình + báo cáo tháng), nhật ký, `alertService.onExpiryRisk`, job 06:00, `dashboardService.today`, `ingredientsRepo` (trường mới).
4. Giao diện (mục 4) + CSS (`.banner.push-items`, `fieldset.open-pack`, `.open-pack-list`).
5. Test `expiry.test.js` (AC-075-01…04) + E2E "hạn dùng nguyên liệu…" (AC-075-05); chụp 1366 / 390 px.

# 8. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm). Số liệu lần làm: xem `TASK-092.md`.
