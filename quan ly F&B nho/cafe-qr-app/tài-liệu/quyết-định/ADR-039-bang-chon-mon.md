# ADR-039 — Bảng chọn món: bấm món là chọn hết tùy chọn ngay

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "khi chọn món nó sẽ hiện lựa chọn side hay gì đó nó hiện ra luôn thay vì vào giỏ hàng xem rất bất tiện… khách chọn chỉ vào giỏ hàng xem và gọi món thôi"; agent đề xuất 4 mục; chủ dự án chọn mục 1: "Bấm món là hiện ngay bảng chọn, trượt lên từ dưới màn hình: cái này".
- **Bối cảnh:** F-013 (ADR-005 D-13): món có tùy chọn mà mọi nhóm bắt buộc có mặc định → "+" thêm ngay theo mặc định (giữ ≤ 3 chạm, NFR-003); muốn đổi size / topping phải bấm dòng chữ nhỏ "Chọn size / tùy chọn", ghi chú chỉ gõ được trong giỏ. Khách thường không thấy có tùy chọn, phải vào giỏ mới chỉnh — chủ quán thấy bất tiện.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-178 | Màn gọi món của khách: món **có tùy chọn** — bấm **"+"**, tên món hoặc ảnh → **bảng chọn trượt lên ngay** (chưa vào giỏ): ảnh + giá, các nhóm tùy chọn (lựa chọn mặc định chọn sẵn, nhóm bắt buộc phải đủ), **Ghi chú** (nút nhanh Ít đường / Không đường / Ít đá / Nhiều đá / Không đá / Mang về + ô gõ; combo không có ghi chú), **Số lượng**, giá 1 phần, nút **"Thêm vào giỏ · tổng tiền"**. Thay quy tắc "+" thêm theo mặc định của ADR-005 D-13. |
| D-179 | Món **không có tùy chọn**: **"+" vẫn thêm ngay** (luồng chuẩn vẫn ≤ 3 chạm); bấm tên / ảnh → cùng bảng chọn (ghi chú, số lượng). NFR-003: luồng chuẩn (món không tùy chọn) giữ ≤ 3 chạm; món có tùy chọn thêm 1 chạm "Thêm vào giỏ" theo yêu cầu chủ quán. |
| D-180 | Giỏ: cùng món + cùng tùy chọn + cùng ghi chú (chọn ở bảng) → cộng dồn; ghi chú khác → **dòng riêng** (gửi đơn / báo giá giữ đủ từng dòng — máy chủ không đổi). Giỏ hàng giữ như cũ (vẫn sửa số lượng, ghi chú được); "Gọi lại" đơn cũ cũng tách dòng theo ghi chú. |
| D-181 | Phạm vi: chỉ màn gọi món của khách. Máy quầy (Bán mang đi, Gọi món tại bàn) giữ "+" thêm nhanh theo mặc định và hộp chọn tùy chọn cũ — nhân viên cần bấm nhanh. |

## Phương án đã cân nhắc

- **Giữ "+" thêm theo mặc định, chỉ làm dòng "Chọn size" to hơn:** khách vẫn hay bỏ qua, vẫn phải vào giỏ ghi chú.
- **Gọn giỏ hàng (bỏ ô ghi chú trong giỏ, sửa bằng nút "Sửa"):** đã đề xuất (mục 2) — chủ quán chưa chọn; để sau.
- **Mở bảng chọn cả với món không tùy chọn:** thêm 1 chạm cho món phổ biến (nước suối, bánh) mà không có gì để chọn — không đáng.

## Hệ quả

- Không đổi máy chủ / dữ liệu. `options.js`: `pickItem` (bảng chọn của khách) + phần nhóm tùy chọn dùng chung với `pickOptions` (quầy, không đổi hành vi). `cart.js addItem(…, { quantity, note })`: có `note` thì tách dòng theo ghi chú; quầy không truyền → như cũ. `t-menu.js`: `openItem`, tên món là nút, `quickAdd` món có tùy chọn → mở bảng.
- E2E cũ: dòng "Chọn size / tùy chọn" vẫn mở bảng mới nên các bài chọn Size L chạy như cũ; một bài (chính sách dữ liệu, F-062) bấm "+" món đầu danh mục — nay là Bạc xỉu có tùy chọn, mở bảng chọn — sửa sang món không tùy chọn (Cà phê đen).
