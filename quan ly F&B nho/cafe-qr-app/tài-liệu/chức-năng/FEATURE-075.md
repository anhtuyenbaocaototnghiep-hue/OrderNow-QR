# FEATURE-075 — Hạn dùng nguyên liệu: hạn sau khi mở, tiền sắp mất, món nên mời

> **Nguồn:** chủ dự án 06/11/2026 ("khi làm xong kho nguyên liệu bạn cho tôi phương án hết hạn nữa nha"), duyệt 07/11/2026 ("ok tiến hành làm đi") phần 1 + 2 + 3 của phương án. Quyết định: [ADR-033](../quyết-định/ADR-033-han-dung-nguyen-lieu.md) D-147…D-152. Nền: [F-028](FEATURE-028.md) lô & hạn sử dụng.

- **Status:** CONFIRMED (ADR-033) · Triển khai: [TASK-092](../công-việc/TASK-092.md)
- **Actor:** **ACT-ADMIN** (đặt dung tích hộp + hạn sau khi mở, xem số tiền sắp mất / đã hủy, nhận cảnh báo); **ACT-STAFF / ACT-LEAD** (xem hộp đang mở, bỏ phần còn, xem món nên mời).
- **Màn hình:**
  - **Quản lý → Nguyên liệu (SCR-23) → Kho nâng cao** (hộp thoại): nhóm **Hạn sau khi mở hộp / gói** — **Một hộp / gói bao nhiêu {đơn vị}**, **Mở rồi dùng được (giờ)**; dòng nguyên liệu ghi "hộp 1000 ml, mở rồi dùng trong 72 giờ · hộp đang mở còn … ml".
  - **Quầy → Kho & sơ chế (SCR-17) → Hạn dùng**: thẻ **Hộp / gói đang mở sắp hoặc đã quá hạn** (SCR-55) + **Bỏ phần còn**.
  - **Máy quầy (mọi trang)**: dải **Nên mời khách hôm nay** (món + lý do) + **Ẩn**.
  - **Hôm nay** (SCR-42): thẻ **Sắp hết hạn (2 ngày tới)** — tổng tiền (quản lý), 5 dòng, món nên mời, "Tháng này đã hủy vì hết hạn" (theo nguyên liệu, nhà cung cấp).
  - **Cảnh báo** (SCR-47): loại **Nguyên liệu sắp hết hạn**.
- **Dữ liệu:** `Ingredients.PackSize`, `OpenShelfHours`, `OpenedAt`, `OpenLeft`; `Alerts.Kind = 'EXPIRY_RISK'` (migration 0052); thủ tục `sp_TrackOpenPacks`, `sp_DiscardOpenPack`.

## User Story

- **US-075-1:** Là chủ quán, tôi muốn app tự biết hộp sữa / kem / siro đã mở bao lâu và nhắc bỏ phần quá hạn, để không pha đồ hỏng cho khách và không bị trừ kho sai.
- **US-075-2:** Là chủ quán, tôi muốn biết trước bằng tiền nguyên liệu nào sắp hết hạn, được gợi ý món nên mời để dùng kịp, và thấy mỗi tháng mất bao nhiêu vì hết hạn (theo nguyên liệu, nhà cung cấp), để giảm tiền đổ bỏ.

## Quy tắc (BR-113)

1. Dung tích hộp (> 0, đơn vị gốc) và số giờ dùng sau khi mở (1–8760) đặt cả hai hoặc không (`400`). Tắt → xóa trạng thái hộp mở; đổi dung tích → phần còn không vượt một hộp.
2. Bán (hoàn tất đơn, kể cả đơn gửi bù F-074) và sơ chế dùng q: lấy từ hộp đang mở; thiếu → mở thêm ⌈(q − còn) / dung tích⌉ hộp, giờ mở = giờ bán / sơ chế, còn = số hộp mở × dung tích − (q − còn); vừa hết hộp → không còn hộp mở; phần còn ≤ tồn kho.
3. Hộp mở quá hạn (giờ mở + số giờ < bây giờ) → phần còn không tính vào khả dụng (gộp với lô hết hạn bằng phần lớn hơn).
4. Bỏ phần còn: phiếu hủy `EXPIRED` cho min(phần còn, tồn − đang giữ); không có hộp mở → `409 NO_OPEN_PACK`; có nhật ký `inventory.discard-open`.
5. Rủi ro 2 ngày: lô hết hạn ≤ 2 ngày (kể cả đã hết) + hộp mở hết hạn trong 48 giờ (kể cả đã quá); giá trị = phần còn × (giá lô hoặc giá vốn bình quân); số tiền chỉ trả cho quản lý.
6. Món nên mời: món đơn còn bán dùng nguyên liệu **chưa** hết hạn trong danh sách rủi ro (trực tiếp / qua bán thành phẩm), tối đa 6, hạn sớm trước.
7. 06:00: tổng giá trị > 0 → một cảnh báo `EXPIRY_RISK` mỗi ngày. Tiền hủy vì hết hạn theo tháng: phiếu hủy `EXPIRED` × giá vốn trong nhật ký kho; nhà cung cấp qua lô → phiếu nhập.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `PUT /api/admin/ingredients/{id}/advanced` | ADMIN | Thêm `packSize`, `openShelfHours` (cả hai hoặc `null`) |
| `GET /api/expiry/risk` | Nhân viên | `{ days, totalValue*, items: [{ kind: OPEN \| LOT, ingredientId, name, unit, qty, when, expired, value*, openedAt, expiresAt, hoursLeft \| lotId, lotCode, expiryDate, daysLeft }], pushItems: [{ menuItemId, name, because: [{ ingredientId, name, when }] }] }` (* chỉ quản lý) |
| `POST /api/ingredients/{id}/discard-open` | Nhân viên | `{ note? }` → `{ wasteId, qty, ingredient }`; `409 NO_OPEN_PACK` |
| `GET /api/admin/expiry/waste?month=YYYY-MM` | ADMIN | `{ month, total, byIngredient: [{ ingredientId, name, unit, qty, cost, times }], bySupplier: [{ supplierId, name, cost }] }` |
| `GET /api/dashboard/today` | Quản lý / trưởng ca | Thêm `expiry` (= rủi ro; quản lý thêm `wasteThisMonth`) |

## Acceptance Criteria

- AC-075-01: Đặt dung tích + hạn sau khi mở (chỉ một ô → 400); bán 1 ly (25 ml, hộp 100 ml) → hộp mở còn 75, giờ mở ≈ lúc bán; bán thêm 75 ml → không còn hộp mở; bán 125 ml → mở 2 hộp, còn 75; danh sách nguyên liệu trả `openLeft`; tắt → xóa trạng thái, bán tiếp không theo dõi.
- AC-075-02: Hộp mở quá hạn → `expiredQty` của nguyên liệu = phần còn (không tính vào khả dụng); rủi ro: nhân viên thấy "hộp đang mở đã quá hạn" không có số tiền, quản lý thấy giá trị = phần còn × giá vốn; nhân viên bỏ phần còn → phiếu hủy `EXPIRED` đúng số, tồn giảm đúng, hết hộp mở, có nhật ký; bỏ lần nữa → 409 `NO_OPEN_PACK`.
- AC-075-03: Hộp mở còn ~5 giờ + lô hết hạn ngày mai (500 × 100đ) → rủi ro có hai dòng, giá trị lô 50.000đ, tổng = Σ dòng; món nên mời gồm món dùng hai nguyên liệu đó, kèm lý do; không gợi ý theo nguyên liệu đã hết hạn; trang Hôm nay: quản lý có tổng tiền + tiền đã hủy tháng này, trưởng ca không có số tiền nhưng cùng món nên mời.
- AC-075-04: Chạy job 06:00 hai lần → một cảnh báo `EXPIRY_RISK` ghi "trị giá …đ"; hủy lô → tiền hủy tháng này theo nguyên liệu (lô 500 / 50.000đ, hộp mở 75 ml / 3.750đ) và theo nhà cung cấp (nhà cung cấp của phiếu nhập; nguyên liệu không theo lô → không rõ); tổng = Σ theo nguyên liệu; tháng sai 400; nhân viên 403.
- AC-075-05: Trên trình duyệt: quản lý nhập "hộp 100 ml, mở rồi dùng 24 giờ" ở Kho nâng cao → dòng nguyên liệu ghi lại; bán món → máy quầy có dải "Nên mời khách hôm nay" kèm lý do; Kho & sơ chế → Hạn dùng có hộp đang mở → "Bỏ phần còn" → "Đã ghi hủy"; trang Hôm nay có thẻ "Sắp hết hạn (2 ngày tới)" + "Tháng này đã hủy vì hết hạn".

## Bằng chứng

`tests/expiry.test.js` (AC-075-01…04) · E2E "hạn dùng nguyên liệu…" (AC-075-05).
