# TASK-076 — Gộp các nhánh thành ứng viên phát hành v1.0.0-rc.1
Status: READY_FOR_REVIEW (29/10/2026)
Nguồn: chủ dự án 29/10/2026 ("Gộp nhánh thành bản phát hành ổn định: rủi ro lớn nhất ngày bảo vệ … tiến hành làm"). · Agent: Claude · Reviewer: chủ dự án
Quy trình: [release-plan.md](../vận-hành/release-plan.md) (bước 15) · Nhánh: `task/TASK-076-ung-vien-phat-hanh` (tách từ `task/TASK-075-canh-bao-email` `aff249f`)

## Mục tiêu
- Một nhánh `main` duy nhất chứa mọi việc đã làm, để ngày bảo vệ chỉ chạy **một** bản — không còn chọn nhầm nhánh.

## Hiện trạng trước khi gộp
- `main` (`a972d31`) có tới TASK-064 + TASK-070. TASK-065…069, 071…075 nằm trên các nhánh chồng nối tiếp nhau: `065 → … → 072` → `release/2026-10-23` (bản đã đẩy GitHub 23–24/10) → `073 → 074 → 075`.
- `main` là tổ tiên của `release/2026-10-23`, `release/2026-10-23` là tổ tiên của TASK-075 → gộp **không có xung đột**; cây mã sau khi gộp đúng bằng ngọn TASK-075 (+ tài liệu task này).

## Việc làm
1. Nhánh này thêm tài liệu (task, nhật ký phát hành) trên ngọn TASK-075.
2. `git merge --no-ff task/TASK-076-ung-vien-phat-hanh` vào `main` — một commit gộp mang theo 28 commit của TASK-065…069, 071…075.
3. Gắn tag có chú thích **`v1.0.0-rc.1`** (ứng viên phát hành) trên commit gộp. **Không** gắn `v1.0.0`: theo [release-plan.md](../vận-hành/release-plan.md) §1, tag chính thức chỉ gắn sau khi chủ dự án ký G5 (UAT, G1–G4 còn chờ).
4. Không đẩy GitHub (chủ dự án chưa yêu cầu lần này).

## Trong bản này
F-001…F-043, F-045…F-060 — thêm so với `main` cũ: giao diện "Mộc" + Impeccable (TASK-065/066), đổi tên quán F-053, đăng xuất phải đóng ca F-054, màu biểu đồ (TASK-069), bắt buộc mở ca F-055, bố cục màn quầy (TASK-072), chuyển khoản / thu chung / tách hóa đơn F-056…F-058, QR Wi-Fi F-059, cảnh báo bất thường qua email F-060; sửa DEF-015…DEF-018.

Migration: `0034`…`0040` — chỉ **thêm** bảng / cột, riêng `0039` **nới** ràng buộc (`Method` thêm `TRANSFER`) → quay lui code về bản trước cần khôi phục bản sao lưu có nhãn ([release-plan.md](../vận-hành/release-plan.md) §5).

## Lệnh kiểm chứng
`git rev-parse` so cây mã · `npm run lint` · `npm run format:check` · `npm run trace -- --check` (đầy đủ `npm test` + `npm run test:e2e` chạy lại ở TASK-077 trên chính `main` mới).

## Kết quả
(điền sau khi gộp)
