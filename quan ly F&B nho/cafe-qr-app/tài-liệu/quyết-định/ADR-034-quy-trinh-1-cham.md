# ADR-034 — Quy trình 1 chạm ở màn Đơn hàng

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "mình có thể tinh chỉnh gọn lại được không, bỏ mục đang pha đi để nhân viên đỡ thao tác". Agent khuyên không bỏ hẳn (mất báo khách, thời gian chờ, danh sách việc của người pha) mà gộp lại một chạm, bật / tắt được; chủ dự án: "tiến hành làm những cái tôi vừa nhắn".
- **Bối cảnh:** màn Đơn hàng có 3 bước Mới → (Tiếp nhận) → Đang pha → (Hoàn tất) → Đã xong. Trừ kho xảy ra lúc Hoàn tất; thời gian pha trung bình (F-025) đo từ lúc Tiếp nhận tới Hoàn tất. Ở máy thử, cột Đang pha tồn 20 đơn vì nhân viên quên bấm Hoàn tất → kho chưa trừ, thời gian chờ báo khách phóng đại. Nút có sẵn "Tiếp nhận & Hoàn tất" làm thời gian pha ra 0–1 giây.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-153 | Cài đặt **Quy trình 1 chạm** (`pos.one_tap`, **mặc định bật**) ở Cài đặt → "Màn Đơn hàng ở quầy". Bật: cột "Mới" đổi tên **Cần làm**, gồm cả đơn mới lẫn đơn đang pha (đơn mang đi đã thu), chờ lâu nhất trên cùng, đơn đang giữ (F-066) vẫn ở cuối; cột "Đang pha" ẩn; mỗi phiếu một nút lớn **Xong** (+ **Hủy** với đơn mới). Tắt: 3 cột như cũ (quán đông nhiều người pha). |
| D-154 | **Xong** = tiếp nhận + hoàn tất (đơn mới) hoặc hoàn tất (đơn đang pha): trừ kho, báo khách "Món đã xong", sang "Đã xong hôm nay" — **không đổi trạng thái / dữ liệu / luật** (PENDING → PREPARING → COMPLETED vẫn đi đủ ở máy chủ); luật hủy món đã tiếp nhận / đã pha (F-046) giữ nguyên. Đồng hồ chờ trên phiếu đổi vàng / đỏ như cũ khi chờ lâu. |
| D-155 | **Thời gian làm món** (thống kê 02:00): đơn nhận + xong cách nhau < 10 giây (1 chạm, hoặc "Tiếp nhận & Hoàn tất") tính từ lúc **có thể bắt đầu làm** — lúc đơn sẵn sàng (tới / hết giữ) hoặc lúc đơn trước vừa xong, lấy mốc muộn hơn — tới lúc xong; đơn 3 bước vẫn từ lúc Tiếp nhận. Sửa luôn lỗi nút "Tiếp nhận & Hoàn tất" cho thời gian 0–1 giây. |

## Phương án đã cân nhắc

- **Bỏ hẳn trạng thái Đang pha:** mất màn báo khách "đang làm", mất mốc đo thời gian, phá luật hủy món theo trạng thái — không cần thiết để giảm thao tác.
- **Tự hoàn tất sau N phút:** trừ kho / báo khách sai lúc, không biết món đã ra thật chưa.
- **Mặc định tắt:** quán nhỏ (đối tượng chính) phải tự tìm; chọn bật, quán đông tự tắt.

## Hệ quả

- Không migration. Cài đặt `oneTap` (`PUT /api/admin/settings`), `/api/auth/me` thêm `pos: { oneTap }`; `etaRepo.recomputePrepStats` đổi cách tính. Test cũ chạy chế độ 3 cột (`tests/helpers/testDb.js`, `kịch-bản/e2e-server.js` ghi `pos.one_tap = false`).
