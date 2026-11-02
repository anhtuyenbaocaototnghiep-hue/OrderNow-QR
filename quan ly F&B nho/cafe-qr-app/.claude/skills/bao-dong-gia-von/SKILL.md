---
name: bao-dong-gia-von
description: Báo động giá vốn cho cafe-qr-app — nhập hàng giá cao hơn thì tự tính lại các món dùng nguyên liệu đó (qua bán thành phẩm, combo), báo món tụt lãi, tiền mất mỗi tháng và gợi ý giá bán qua trang Cảnh báo + email; giá mốc chống tăng dần và báo lặp; hỏi khi nghi nhập nhầm; sửa / hủy phiếu thì gỡ cảnh báo và gửi thư đính chính. Dùng khi task giao FEATURE-064 / ADR-023 / TASK-079, hoặc nhắc "báo động giá vốn", "giá nhập tăng", "món tụt lãi", "giá gợi ý", "COST_RISE", "CostAlertMarks", "giá mốc", "nghi nhập nhầm".
---

# Mục đích

Ghi lại đầy đủ chức năng **báo động giá vốn** (làm ngày 02/11/2026, TASK-079) để agent sau có thể **sửa, mở rộng hoặc làm lại** mà không làm hỏng phiếu nhập kho hay báo sai cho chủ quán.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-023-bao-dong-gia-von.md` (D-84…D-88) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-064.md` (AC-064-01…10) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-100, BR-101 |
| Task, kết quả, review | `tài-liệu/công-việc/TASK-079.md`, `tài-liệu/kế-hoạch/TASK-079-plan.md` |
| API, dữ liệu, màn hình | `tài-liệu/kiến-trúc/api-contract.md` (mục F-064), `tài-liệu/kiến-trúc/data-model.md` (mục FEATURE-064), `tài-liệu/giao-diện/screens-flows.md` (mục F-064) |
| Nền cảnh báo + email | skill `canh-bao-bat-thuong-email` (F-060) |

# Khi dùng

- Đổi luật báo, ngưỡng mặc định, cách tính giá gợi ý, nội dung email.
- Chủ quán báo "nhập giá cao mà không thấy cảnh báo" hoặc "báo sai" (mục 7).
- Thêm nguồn chi phí vào giá vốn (hao hụt, bao bì…) — đọc mục 6 trước.
- Làm lại chức năng trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có: nhập kho + giá vốn (F-023, F-031), nhận theo đơn đặt (F-030), sửa / hủy phiếu (F-048), định lượng (F-011), tùy chọn (F-013), combo (F-015), bán thành phẩm (F-027), trang Cảnh báo + hàng đợi email (F-060).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm migration: `cơ-sở-dữ-liệu/chuyển-đổi/0042_bao_dong_gia_von.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Đọc `ứng-dụng/máy-chủ/src/domain/costImpact.js` (hàm thuần), `src/repositories/costAlertRepo.js`, mục "Giá vốn (F-064)" trong `src/services/alertService.js`, các dòng gọi hook trong `src/services/stockService.js`.
3. Chạy test nền: `node --env-file=.env --test ứng-dụng/máy-chủ/tests/cost-alert.test.js`.

---

# 2. Quyết định đã chốt (ADR-023) — không tự đổi

| Mã | Quyết định | KHÔNG chọn |
| --- | --- | --- |
| D-84 | So **giá nhập mới**, không so giá vốn bình quân | So `AvgCost`: tăng chậm vì còn hàng cũ (20 hộp 30.000đ + 10 hộp 36.000đ → 32.000đ, chỉ +6,7% dù giá thật +20%) |
| D-85 | **Giá mốc** tính lại từ dữ liệu, không lưu trên nguyên liệu | Cột trên `Ingredients`: sửa / hủy phiếu phải tự khôi phục |
| D-86 | Chỉ báo khi **món bị ảnh hưởng thật** | Báo mọi lần giá tăng: nhiễu |
| D-87 | Giá gợi ý chỉ tham khảo, **app không tự đổi giá** | Tự đổi giá: app không biết khách, đối thủ, thực đơn đã in |
| D-88 | Nghi nhập nhầm → hỏi, không tính vào lãi; sửa / hủy phiếu → gỡ và đính chính | Gợi ý giá theo giá gõ nhầm |

Muốn đổi một dòng trên → hỏi chủ dự án, viết ADR mới.

---

# 3. Luật tính

**Giá mốc** — `referencePrice({ anchor, history, now })`:

1. Có lần báo trước (`CostAlertMarks` của phiếu chưa hủy): bắt đầu từ giá đã báo, xét các phiếu sau đó. Không có: bắt đầu từ phiếu đầu tiên trong 90 ngày, không có thì phiếu gần nhất.
2. Giá rẻ hơn thì mốc giảm theo. **Ngoại lệ:** rẻ dưới một nửa mốc và đứng riêng lẻ (phiếu sau không rẻ như vậy) → bỏ qua, coi là khuyến mãi / gõ nhầm.
3. Hàng tặng 0đ không bao giờ tính vào mốc (`priceHistory` lọc `UnitCost > 0`).

**Phân loại dòng** — `classifyLines`: `major` = tăng từ `alert.cost_rise_pct`. `suspect` = tăng trên 50% so với **cả** mốc **lẫn** phiếu trước.

**Giá vốn món** — `menuImpact`: Σ định lượng × đơn giá. Đơn giá của nguyên liệu trên phiếu = giá mốc (cũ) / giá phiếu (mới, riêng giá nghi nhầm vẫn dùng mốc). Nguyên liệu khác = `LastUnitCost` > 0, nếu không có thì `AvgCost` > 0, nếu không có thì "chưa tính được". Bán thành phẩm = Σ công thức ÷ `OutputQty`. Combo = Σ số lượng × giá vốn thành phần.

Hai chỗ `alertService.checkCostRise` chỉnh `lastUnitCost` trước khi gọi `menuImpact`: giá 0đ → giá mua thật gần nhất; giá đang nghi nhầm chưa sửa (`unconfirmedPrices`) → giá mốc. SP đã ghi đè `LastUnitCost` nên không chỉnh thì mọi món dùng nguyên liệu đó tính sai ở các phiếu sau.

**Món bị báo:** đang hiện, giá > 0, dùng nguyên liệu `major`, giá vốn tăng, và tụt từ `alert.cost_margin_drop` điểm **hoặc** vừa rơi xuống dưới `alert.cost_margin_min` % (`crossed`: trước đó ≥ mức, nay < mức). Món vốn đã dưới mức thì chỉ xét độ tụt — nếu không, mọi món ăn lãi thấp sẽ bị báo mỗi khi một gia vị tăng giá.

**Mức độ:** cao khi có giá nghi nhầm hoặc món `crossed`; còn lại mức vừa.

**Giá gợi ý** — `suggestPrices`, làm tròn lên 1.000đ: giữ tiền lãi = giá cũ + phần giá vốn tăng; giữ % lãi = giá vốn mới × giá bán ÷ giá vốn cũ (`null` khi giá cũ đã lỗ / hòa vốn).

Ví dụ (số minh họa, cũng là test AC-064-01) — sữa 30đ → 36đ/ml:

| Món (lượng sữa) | Giá bán | Giá vốn | Lãi | Giữ tiền lãi | Giữ % lãi |
| --- | --- | --- | --- | --- | --- |
| Trà sữa (150 ml) | 30.000đ | 12.000đ → 12.900đ | 60% → 57% | 31.000đ | 33.000đ |
| Bạc xỉu (120 ml) | 35.000đ | 10.000đ → 10.720đ | 71,4% → 69,4% | 36.000đ | 38.000đ |
| Latte (200 ml) | 45.000đ | 13.000đ → 14.200đ | 71,1% → 68,4% | 47.000đ | 50.000đ |

---

# 4. Luồng chạy

```
stockService.receive (cả purchasingService.receivePo) ──commit──▶ alertService.onStockReceived(receipt)
stockService.updateReceipt / voidReceipt ───────────────commit──▶ alertService.onReceiptRevised(before, after, user)
        │  bọc .catch(log): lỗi KHÔNG làm hỏng phiếu; bên trong withDeadlockRetry (chạy lại an toàn)
        ▼
  checkCostRise: priceHistory → referencePrice → classifyLines
        │  không có dòng major / suspect → dừng, chưa đọc gì thêm
        ▼
  snapshot + allPrices → menuImpact → không có món / giá nghi nhầm đang dùng → dừng
        ▼
  immediateAlert (DedupeKey) ─▶ publish(ROOMS.admin, 'alert.created')
        ▼
  addMarks → enqueueImmediate (theo alert.immediate, giờ yên lặng)
```

**Sửa / hủy** (`checkRevisedReceipt`):

1. Sửa mà giá các dòng có giá không đổi (`pricesOf`) → không làm gì.
2. `retireForReceipt`: xóa email chưa gửi của cảnh báo cũ, xóa mốc, chuyển cảnh báo sang Đã xử lý. Trả `{ hadAlerts, delivered }` tính từ dữ liệu nên chạy lại vẫn ra như nhau.
3. `delivered` → thư đính chính (`COSTFIX:…`). Email cũ chưa đi thì không cần đính chính.
4. Sửa → `checkCostRise` lại theo giá đúng.
5. `hadAlerts` → `reviewLaterReceipts`: nguyên liệu đã có phiếu mới hơn và chưa có mốc sau phiếu này → xét lại phiếu mới nhất, chỉ các nguyên liệu đó. Thiếu bước này thì hủy phiếu đã báo sẽ làm mất báo động dù giá hiện tại vẫn cao.

**Khóa chống trùng:** `COST:{receiptId}:{EditedAt ms | 0}`; xét lại phiếu sau: `COST:{phiếu sau}:R{phiếu vừa sửa}:{ms}`. Cả hai khớp `COST:{id}:%` mà `retireForReceipt` dùng. `DATETIME2(0)` nên hai lần sửa trong cùng một giây trùng khóa — người dùng thật không gặp, đừng viết test sửa hai lần liên tiếp trên cùng phiếu.

---

# 5. Dữ liệu và cài đặt

- Migration 0042: `CK_Alerts_Kind` thêm `COST_RISE`; `CostAlertMarks (AlertId, IngredientId, ReceiptId, UnitCost)`.
- `Alerts.Detail` của `COST_RISE`: xem `api-contract.md` mục F-064. `ShiftId`, `UserId` là NULL (không phải lỗi của ai).
- Cài đặt (mặc định trong code, không seed): `alert.cost_rise_pct` 5, `alert.cost_margin_drop` 2, `alert.cost_margin_min` 60. Thêm ngưỡng mới phải sửa cả `settingsService` (2 chỗ), route zod, `admin-settings.js`, `WATCHED` trong `alertService`.
- Hằng số trong `costImpact.js`: `SUSPECT_PCT` 50, `HISTORY_DAYS` 90, `SUGGEST_STEP` 1000.

---

# 6. Giới hạn đã chấp nhận

- Không tính hao hụt: báo cáo giá vốn hiện có cũng chưa tính, thêm riêng ở đây sẽ làm hai số lệch nhau. Muốn tính thì đổi cả hai.
- Chỉ biết giá đã nhập vào phiếu. Mua ngoài không nhập phiếu, hoặc nhập không ghi giá → không có báo động.
- Tiền mất mỗi tháng dựa trên số bán 30 ngày gần nhất, không dự báo khách phản ứng khi tăng giá.
- Bản đầu sau nâng cấp: chưa có mốc nào, phiếu đầu tiên so với giá thấp nhất 90 ngày, nên giá đã tăng từ vài tuần trước có thể bị báo một lần.
- Tùy chọn (Size L…) chỉ liệt kê tham khảo, không gợi ý giá, và không tự tạo cảnh báo.

---

# 7. Xử lý khi chủ quán thắc mắc

| Hiện tượng | Kiểm |
| --- | --- |
| Nhập giá cao, không có cảnh báo | Dòng có giá không? Tăng đủ ngưỡng so với **giá mốc** (không phải phiếu liền trước)? Món có đang hiện và có định lượng? Tụt đủ điểm hoặc vừa rơi xuống dưới mức? Log `alert cost:` có lỗi? |
| Có cảnh báo, không có email | "Cảnh báo tức thì" có bật, có email nhận, có đang trong giờ yên lặng, hàng đợi có lỗi (xem skill F-060 mục 8)? |
| "Có nhập nhầm không?" nhưng giá đúng | Đúng thiết kế: nhập thêm phiếu cùng giá là app coi là giá thật. |
| Số trên cảnh báo khác báo cáo Giá vốn thực tế | Cảnh báo nhìn về phía trước (giá nhập mới); báo cáo là giá vốn đã chốt khi hoàn tất. |

---

# 8. Làm lại trên bản code khác

1. Viết ADR, FEATURE, BR, US, AC, TASK, plan trước.
2. Migration → `domain/costImpact.js` + unit test → `costAlertRepo.js` → phần giá vốn trong `alertService` → hook ở `stockService` (không gọi ở `purchasingService`: `receivePo` đã đi qua `receive`).
3. Cài đặt 3 ngưỡng → trang Cảnh báo (`costFacts`, `costTable`) → `?edit={id}` ở Thực đơn, Combo.
4. CSS: `.alert-list > * { min-width: 0 }`, nếu không bảng làm trang tràn ngang trên điện thoại (test a11y quét 320 / 390 px).

# Validation

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check`.

Test hay bị bỏ sót (đều có trong `tests/cost-alert.test.js`, nhóm "review G3"): món vốn đã dưới mức, hàng tặng 0đ, nguyên liệu không món nào dùng, phiếu rẻ bất thường, giá nghi nhầm chưa sửa rồi nhập nguyên liệu khác, hủy phiếu đã báo khi có phiếu sau, email chưa gửi khi sửa phiếu, chạy lại, tên chứa thẻ HTML.

# Không làm

- Tự đổi giá bán; tính lại giá vốn đã chốt trên đơn; cho nhân viên / trưởng ca thấy giá vốn và tỷ lệ lãi.
- Gọi hook trong transaction nhập kho hoặc bỏ `.catch`: lỗi cảnh báo không được làm hỏng phiếu.
- Lưu giá mốc trên `Ingredients`.
- Gửi email ngoài hàng đợi `AlertOutbox`.

# Hoàn thành khi

Mọi AC-064 có bằng chứng; test mới đỏ khi bỏ phần sửa tương ứng; docs đồng bộ; `npm run trace -- --check` PASS; agent không tự duyệt Gate.
