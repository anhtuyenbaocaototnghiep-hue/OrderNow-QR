# 23. Phân tích & menu engineering

> Trang giúp chủ quán ra quyết định từ số liệu bán hàng:
>
> - **Menu engineering:** món nào nên giữ, nên đẩy, nên tăng giá, nên bỏ.
> - **Giờ cao điểm:** giờ nào trong tuần đông nhất, để xếp người và chuẩn bị nguyên liệu.
> - **Dự báo doanh thu** 7 ngày tới.
> - **So sánh kỳ:** tuần / tháng này so với kỳ trước.
> - **Theo bàn:** bàn nào khách ngồi lâu mà doanh thu thấp.

**Ai dùng:** chỉ quản lý. Trang: **Quản lý → Phân tích & menu engineering**, 5 tab: **Menu engineering** · **Giờ cao điểm** · **Dự báo doanh thu** · **So sánh kỳ** · **Theo bàn**.

Các tab Menu engineering, Giờ cao điểm, Theo bàn dùng chung ô **Từ ngày / Đến ngày** (mặc định 30 ngày gần nhất). Đổi ngày là số liệu tải lại ngay.

## Tab Menu engineering

Mỗi món được xếp vào một trong 4 nhóm, theo **số lượng bán** và **lãi gộp mỗi phần** so với mức giữa (trung vị) của các món trong kỳ:

| Nhóm | Bán | Lãi / phần | Gợi ý của app |
| --- | --- | --- | --- |
| **Ngôi sao** | nhiều | cao | Giữ giá, ưu tiên gợi ý / ghim món |
| **Ngựa kéo** | nhiều | thấp | Bán chạy nhưng lãi thấp — xem lại định lượng (BOM) hoặc tăng giá nhẹ |
| **Câu đố** | ít | cao | Lãi cao nhưng bán ít — đẩy khuyến mãi, ghim món, gợi ý bán kèm |
| **Chó (cân nhắc bỏ)** | ít | thấp | Bán ít, lãi thấp — cân nhắc bỏ món hoặc gộp vào combo |
| **Chưa đủ dữ liệu** | dưới 5 lần trong kỳ | — | Chưa xếp nhóm |

**Cách xem:**

1. Chọn khoảng ngày; lọc **Danh mục** (máy tính lại mức giữa trong danh mục đó) và **Nhóm** (chỉ lọc bảng).
2. **Biểu đồ "Số lượng × lãi gộp / món":** mỗi chấm là một món, trục ngang là số lượng bán, hai đường mức giữa chia 4 ô (trên-phải Ngôi sao, trên-trái Câu đố, dưới-phải Ngựa kéo, dưới-trái Chó). Rê chuột lên chấm để xem tên món.
3. Thẻ **Gợi ý theo nhóm** nhắc lại lời khuyên từng nhóm.
4. **Bảng món:** Nhóm · SL · Tỉ trọng · Doanh thu · Giá vốn · Lãi gộp · Lãi / món. Giá vốn có dấu **\*** là có phần ước tính (đơn chưa có giá vốn chốt).
5. Hai nút trên mỗi dòng:
   - **Ghim món này** → món được thêm vào mục **Gợi ý** trên menu khách (nhãn "Gợi ý"). Tối đa 20 món ghim. Nếu chế độ gợi ý đang "Chỉ bán chạy tự động" thì tự chuyển sang "Ghim + bán chạy". Sắp xếp lại ở **Quản lý → Gợi ý & ghim** (xem [Gợi ý / bán chạy](04-gợi-ý-bán-chạy.md)).
   - **Tạo khuyến mãi** → mở trang **Khuyến mãi** với hộp "Thêm khuyến mãi" đã chọn sẵn món này, loại "Giá đặc biệt cho món". Điền giá mới, ngày giờ → **Lưu** (xem [Khuyến mãi](03-khuyến-mãi.md)).

**Lưu ý:** combo tính như một món. Chỉ tính đơn **đã hoàn tất**. Giá vốn lấy theo giá vốn chốt lúc hoàn tất (xem [Kho nâng cao](16-kho-nâng-cao.md)) — nhập kho có giá đầy đủ thì số càng đúng.

## Tab Giờ cao điểm

- Chọn **Chỉ số**: **Số đơn** (mặc định) hoặc **Doanh thu**.
- Bảng **thứ × giờ** (hàng T2…CN, cột 6h…22h): ô càng đậm càng đông; ô đông nhất có viền nổi. Rê chuột để xem số, ví dụ "T7 10h: 12 đơn".
- Số đơn đếm theo giờ khách gửi đơn (không tính đơn hủy); doanh thu tính theo giờ thu tiền.

> Mẹo: dùng bảng này để xếp [lịch làm](19-chấm-công-lịch-làm-nhật-ký.md) — thêm người vào các ô đậm.

## Tab Dự báo doanh thu

- Biểu đồ doanh thu thuần **28 ngày qua** (đường liền) và **dự báo 7 ngày tới** (đường nét đứt), dải mờ là khoảng dao động.
- Bảng 7 ngày: Ngày · **Dự báo** · **Khoảng** (thấp – cao) · Số tuần mẫu (0–4).
- Cách tính: mỗi ngày tới = trung bình có trọng số **4 ngày cùng thứ gần nhất** (tuần gần nặng hơn: 40 % · 30 % · 20 % · 10 %). Ví dụ 4 thứ Bảy gần nhất (mới → cũ) là 100k, 200k, 300k, 400k → dự báo 200k.

## Tab So sánh kỳ

1. **Theo:** **Tuần** (bắt đầu Thứ Hai) hoặc **Tháng**. **Kỳ:** Kỳ này / 1, 2, 3 kỳ trước.
2. 5 thẻ: **Doanh thu thuần** · **Số đơn** · **Bill trung bình** · **Hội viên mới** · **Giá vốn / doanh thu**, mỗi thẻ có ▲ / ▼ % so với kỳ trước.
3. **Kỳ đang diễn ra** (tuần / tháng chưa hết) được so với **cùng số ngày đầu** của kỳ trước, dòng mô tả ghi "(kỳ đang diễn ra — so cùng số ngày)".

**Lưu ý thẻ "Giá vốn / doanh thu":** đổi tính bằng **điểm %**. Ở thẻ này **▲ là giá vốn tăng** (không tốt), dù mũi tên vẫn màu xanh.

## Tab Theo bàn

- Mỗi bàn: **Số lượt** · **Doanh thu** · **Ngồi TB** (phút) · **Doanh thu / giờ ngồi**.
- Bàn bị tô đỏ, nhãn **"Ngồi lâu – doanh thu thấp"**: thời gian ngồi trung bình **từ** mức giữa trở lên **và** doanh thu / giờ **dưới** mức giữa. Cần ít nhất 2 bàn có khách mới so sánh được.

> Mẹo: bàn hay bị cờ đỏ có thể là bàn khách ngồi làm việc lâu — cân nhắc đổi chỗ, hoặc gợi ý combo / gọi thêm cho bàn đó.

*Kỹ thuật: [FEATURE-041](../tài-liệu/chức-năng/FEATURE-041.md) · [FEATURE-042](../tài-liệu/chức-năng/FEATURE-042.md).*
