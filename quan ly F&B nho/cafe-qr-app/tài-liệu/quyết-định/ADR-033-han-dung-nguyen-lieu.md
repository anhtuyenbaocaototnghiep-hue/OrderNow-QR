# ADR-033 — Hạn dùng nguyên liệu: hạn sau khi mở, tiền sắp mất, món nên mời

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án nhờ "cho tôi phương án hết hạn nữa" (06/11); agent đề xuất 5 việc, khuyên làm gộp 1 + 2 + 3; chủ dự án: "ok tiến hành làm đi".
- **Bối cảnh:** F-028 đã có lô + hạn in trên bao bì (nhập kho), trừ FEFO, lô hết hạn không tính vào khả dụng, quầy có tab Hạn dùng (lô đã / sắp hết hạn 3 ngày) + Hủy lô, job 06:00 báo quầy. Thiếu: (1) **hạn sau khi mở** — sữa tươi hộp in hạn 10 ngày nhưng mở ra 2–3 ngày, cốt pha 1 ngày; (2) chủ quán không biết trước **bằng tiền** (trang Hôm nay chỉ liệt kê, không có giá trị; không có email); (3) không gợi ý **dùng kịp** trước khi hỏng. Ràng buộc: một **lô thường gồm nhiều hộp** (nhập 10 hộp sữa = một lô 10.000 ml) → không thể rút hạn cả lô khi mở một hộp.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-147 | **Hộp đang mở theo từng nguyên liệu** (không theo lô): quản lý đặt **dung tích một hộp / gói** (đơn vị gốc) + **dùng được bao nhiêu giờ sau khi mở** ở Kho nâng cao (cả hai hoặc không). App tự cập nhật khi **bán (hoàn tất đơn)** và **sơ chế** — lấy trước từ hộp đang mở, thiếu thì "mở" thêm đủ hộp, ghi giờ mở = giờ bán / sơ chế, phần còn ≤ tồn kho. Nhân viên **không phải bấm "mở hộp"**. Dùng được cho cả nguyên liệu không theo lô. Tắt → xóa trạng thái. |
| D-148 | **Quá hạn sau khi mở:** phần còn của hộp đang mở **không tính là còn hàng** (cộng vào lượng hết hạn của nguyên liệu, gộp với lô hết hạn bằng cách lấy phần lớn hơn — không trừ hai lần) → món tự "Hết món" nếu chỉ còn phần đó. Quầy (Kho & sơ chế → Hạn dùng) có mục **Hộp / gói đang mở sắp hoặc đã quá hạn** + **Bỏ phần còn** → phiếu hủy lý do hết hạn (theo lô thì trừ FEFO, có giá vốn), không đụng phần đang giữ cho đơn chờ; có nhật ký thao tác. |
| D-149 | **Rủi ro trong 2 ngày quy ra tiền:** lô sắp / đã hết hạn (giá lô, không có thì giá vốn bình quân) + hộp mở sắp / đã quá hạn (giá vốn bình quân × phần còn). Chỉ **quản lý** thấy số tiền; nhân viên / trưởng ca thấy danh sách, thời hạn, món nên mời. |
| D-150 | **Chủ quán biết trước:** trang **Hôm nay** có thẻ **Sắp hết hạn (2 ngày tới)** (tính trực tiếp — hộp mở đổi theo giờ): tổng tiền, 5 dòng đầu, món nên mời, **tiền đã hủy vì hết hạn tháng này** (theo nguyên liệu, theo nhà cung cấp). Job 06:00 thêm cảnh báo **`EXPIRY_RISK`** (một lần mỗi ngày) → trang Cảnh báo + email nếu chủ quán bật. |
| D-151 | **Món nên mời:** món đơn đang bán (còn bán, chưa xóa) dùng nguyên liệu **sắp** hết hạn (chưa hết) — trực tiếp trong công thức hoặc qua bán thành phẩm sơ chế từ nó; tối đa 6 món, hạn sớm trước, kèm lý do ("Sữa tươi hộp đang mở còn 5 giờ"). Máy quầy có dải **Nên mời khách hôm nay** (tải lại 10 phút, ẩn được tới khi danh sách đổi). Không tự giảm giá (để sau — cần quyết định riêng). |
| D-152 | **Tiền hủy vì hết hạn theo tháng:** từ phiếu hủy lý do hết hạn + giá vốn trong nhật ký kho; theo nhà cung cấp qua lô → phiếu nhập → nhà cung cấp (nguyên liệu không theo lô → "nguồn không rõ"). `GET /api/admin/expiry/waste?month=`. |

## Phương án đã cân nhắc

- **Rút hạn cả lô khi mở:** sai với lô nhiều hộp (hộp chưa mở bị coi là sắp hỏng, bị ép hủy).
- **Nút "Mở hộp" ở quầy:** chính xác hơn khi nhân viên nhớ bấm, nhưng thêm thao tác và hay quên. Chọn tự suy ra từ lượng đã dùng (bán / sơ chế); lệch với thực tế khi đổ bỏ / làm đổ ngoài app — "Bỏ phần còn" và phiếu hủy đưa về đúng.
- **Tính lại hộp mở từ nhật ký kho mỗi lần đọc:** không phải sửa thủ tục trừ kho nhưng truy vấn nặng dần, lệch khi đổi dung tích. Chọn cập nhật ngay trong `sp_CompleteOrder` / `sp_PostPrepBatch` qua `sp_TrackOpenPacks` (một chỗ tính).
- **Tự giảm giá món nên mời:** đụng luật giá / khuyến mãi — để việc sau (chủ quán quyết mức giảm).
- **Cảnh báo hàng cận hạn lúc nhập, giới hạn đề xuất nhập theo hạn:** việc 4, 5 của phương án — làm sau.

## Hệ quả

- Migration `0052_han_sau_khi_mo.sql` (chỉ thêm: `Ingredients.PackSize`, `OpenShelfHours`, `OpenedAt`, `OpenLeft`; cảnh báo `EXPIRY_RISK`); thủ tục mới `sp_TrackOpenPacks`, `sp_DiscardOpenPack` (`sp_OpenPacks.sql`, lỗi `50124 NO_OPEN_PACK`); `sp_CompleteOrder`, `sp_PostPrepBatch` gọi `sp_TrackOpenPacks`; `tvf_ExpiredLotQty` cộng phần hộp mở quá hạn.
- API: `GET /api/expiry/risk`, `POST /api/ingredients/{id}/discard-open`, `GET /api/admin/expiry/waste?month=`; `PUT /api/admin/ingredients/{id}/advanced` thêm `packSize`, `openShelfHours`; `GET /api/dashboard/today` thêm `expiry`.
