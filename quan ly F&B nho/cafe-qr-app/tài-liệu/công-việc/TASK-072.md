# TASK-072 — Bố cục màn quầy "Đơn hàng": đơn cần làm + lưới bàn
Status: READY_FOR_REVIEW (23/10/2026)
Quyết định: [ADR-018](../quyết-định/ADR-018-bo-cuc-man-quay.md) D-67…D-70 · Module: MOD-ORDER, MOD-TABLE (giao diện) · Màn hình: SCR-10 (đơn hàng), SCR-11 / SCR-14 (ngăn chi tiết — không đổi), thanh quầy dùng chung các trang SCR-13, 15, 16, 17
Nguồn: chủ dự án gửi ảnh màn quầy 23/10/2026 và yêu cầu "sắp xếp lại bố cục cho rõ ràng, đẹp mắt, dễ thao tác sử dụng và chuyên nghiệp"; chọn "Đơn cần làm + lưới bàn", dùng như nhau trên máy tính và máy tính bảng. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-072-bo-cuc-quay` tách từ `task/TASK-071-bat-buoc-mo-ca` (chưa gộp `main`) · Phụ thuộc: TASK-065 / 066 (giao diện "Mộc", biểu tượng), TASK-071 (khóa xử lý đơn khi chưa mở ca)
Sửa kèm (chủ dự án gửi ảnh trong lúc làm): [DEF-015](../chất-lượng/defect-log.md) tiêu đề cột số lệch với số · [DEF-016](../chất-lượng/defect-log.md) Đề xuất nhập hàng không tích được

## Mục tiêu
- Nhìn vào là thấy việc cần làm ngay (đơn mới, đơn đang pha, bàn gọi thanh toán) và làm bằng một chạm.
- Thanh trên gọn, cảnh báo gom một chỗ, bàn hiện dạng lưới có màu trạng thái, đơn đã xong không chiếm chỗ.
- Đẹp, đồng bộ "Mộc", dùng tốt ở 1366–1920 px và máy tính bảng.

## Đã làm
1. **Tài liệu trước code:** ADR-018, task này.
2. **Thanh trên (`pos-shell.js`, mọi trang quầy):**
   - điều hướng có biểu tượng;
   - cụm trạng thái ca / QR / kết nối / âm thanh, rồi người dùng + Đăng xuất;
   - đủ chỗ thì một hàng, không đủ thì điều hướng xuống hàng hai (trình duyệt đo, đo lại khi đổi bề ngang, khi chữ nút đổi, khi phông nạp xong);
   - dải "Chưa mở ca" đứng đầu vùng cảnh báo ở màn Đơn hàng.
3. **`pos/index.html` + `pos.css`:**
   - vùng "Cần xử lý ngay": các thẻ cùng kiểu, nằm cạnh nhau khi đủ chỗ;
   - hai cột Mới / Đang pha cao hết màn, mỗi cột tự cuộn;
   - dải "Đã xong hôm nay";
   - khung lưới bàn; dưới 1200 px là ngăn trượt.
4. **`pos-dashboard.js`:**
   - phiếu đơn: tên bàn lớn, đồng hồ chờ vàng từ 8 phút / đỏ từ 15 phút, nút 44 px; phiếu đã xong một dòng;
   - lưới bàn đọc `GET /api/tables` (danh sách bàn) + `GET /api/sessions` (nhóm như cũ);
   - ngăn trượt: `aria-expanded`, Esc / Đóng / nền mờ, `inert` phần phía sau, focus vào ngăn và trả về nút.
5. **`icons.js`:** thêm chuyển bàn, túi mang đi, cộng, đồng hồ, lưới.
6. **DEF-015 (`base.css`):** tiêu đề cột tự căn phải khi cột có ô số `.num`. Một quy tắc `:has()` cho mỗi cột 1–12, sửa mọi bảng cùng lúc, không sửa từng trang.
7. **DEF-016 (`admin-purchasing.js`):**
   - dòng cảnh báo "N nguyên liệu chưa gán nhà cung cấp…";
   - ô khóa có lý do; cột Đề xuất ghi "Chưa cần";
   - nút "Gán nhà cung cấp" trên dòng, mở form nhà cung cấp có sẵn nguyên liệu.
   - Không đổi quy tắc F-029: đơn đặt hàng vẫn phải có nhà cung cấp.
8. **Test mới:**
   - E2E "bố cục quầy (ADR-018)…": bàn trống có thẻ, ngăn trượt 1024 px, Esc / nền mờ, focus;
   - E2E "đề xuất nhập hàng… (DEF-016)";
   - a11y quét màn Đơn hàng 1024 px lúc ngăn mở;
   - `audit()` thêm kiểm tiêu đề cột số (DEF-015) trên mọi trang.

## Review G3 (agent độc lập, chỉ đọc) — đã sửa
- **Phải sửa:**
  - Bàn gọi thanh toán mà còn đơn chờ tiếp nhận: thẻ không báo số đơn chờ, nên thu sẽ bị 409. Đã thêm "· N đơn chờ tiếp nhận"; dòng đếm tính theo `pendingCount`.
  - Bấm nền mờ đóng ngăn không trả focus về nút "Bàn". Đã sửa; test kiểm.
- **Hoàn thiện:**
  - viền màu thẻ cảnh báo bị đè;
  - viền focus bị cắt trong khung cuộn (điều hướng, cột phiếu, dải đã xong);
  - nút biểu tượng trên thẻ bàn 40 → 44 px; nút đầu khung bàn 44 px;
  - phiếu đã xong tràn cột hẹp (thêm dấu …, cột tối thiểu 360 px);
  - bố cục cao hết màn chỉ bật khi màn cao ≥ 600 px;
  - đo thanh trên ngoài lượt ResizeObserver + khi phông nạp xong; khu người dùng xuống dòng trên điện thoại;
  - `<aside>` → `<section>` (vùng mốc không lồng trong `main`);
  - lỗi tải danh sách bàn không chặn bảng đơn;
  - bỏ lớp CSS thừa và giờ đặt lặp.
- **Có từ trước, sửa luôn:**
  - chi tiết đơn còn nút Tiếp nhận / Hoàn tất khi chưa mở ca (F-055);
  - Enter ở nút trong phiếu cũng mở chi tiết đơn.
- **Giữ nguyên:** nút "Chưa mở ca" trên thanh trên vẫn hiện cùng dải cảnh báo. Thanh trên là trạng thái chung mọi trang quầy; dải cảnh báo là chỗ bấm "Mở ca" ở màn Đơn hàng.

## Không được sửa (đã giữ)
- API, nghiệp vụ, dữ liệu; luồng thu tiền / sửa món trong ngăn chi tiết.
- Mã nhận diện và tên nút mà test đang dùng (ADR-018 "Thích nghi kỹ thuật").

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Kết quả thực chạy (23/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:e2e` | **45/45 PASS** (42 luồng + 3 khả năng tiếp cận; thêm 2 E2E luồng, a11y quét thêm màn Đơn hàng 1024 px lúc ngăn bàn mở + kiểm tiêu đề cột số trên mọi trang) |
| Cùng test mới chạy trên code cũ `7c70760` (worktree tạm, đã xóa) | **Đỏ đủ 4:** "bố cục quầy" (không có thẻ bàn trống); "đề xuất nhập hàng… (DEF-016)" (không có dòng hướng dẫn); a11y quầy (không có nút "Bàn"); a11y quản lý: `[quan-ly-loyalty] tiêu đề cột số không căn phải: th "ĐIỂM" (DEF-015)`. Các test cũ vẫn PASS trên code cũ |
| `npm test` | **304/304 PASS** (không đổi server) |
| `npm run load` | NFR-002 10/10 vòng PASS; NFR-001 p50 78 ms, p95 209 ms |
| `npm run trace -- --check` | 133 US, 335 AC — PASS 335, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Ảnh thử trên CSDL test (dữ liệu mẫu: 6 bàn có khách, đơn chờ 9 / 17 phút, gọi thanh toán, gọi nhân viên) ở 1920 / 1366 / 1024 / 390 px | 1920: thanh trên một hàng (57 px); 1366 và 1024: điều hướng xuống hàng hai (100 px); 1024: ngăn bàn trượt mở / đóng đúng; 390: một cột, không cuộn ngang; không lỗi JS |

## Cần hỏi duyệt nếu
- Muốn đổi tên mục điều hướng / màu trạng thái khác "Mộc".
- Muốn mốc thời gian chờ (8 / 15 phút) chỉnh được trong Cài đặt.
- Muốn đặt hàng cả nguyên liệu chưa có số đề xuất ngay ở tab Đề xuất (hiện làm ở "Đơn đặt hàng › + Tạo đơn đặt hàng").
