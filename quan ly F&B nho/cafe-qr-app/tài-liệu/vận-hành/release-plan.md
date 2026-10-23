# Kế hoạch phát hành (Release Plan)

> Sổ tay 15 bước — bước 15. Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) (máy tại quán là chính, VPS dự phòng). Lập 23/10/2026 trong [TASK-070](../công-việc/TASK-070.md).
>
> **Trạng thái:** CHỜ GATE G5. Agent chuẩn bị tài liệu và công cụ; **chủ dự án** duyệt G5, chọn ngày và người thực hiện. Agent không tự triển khai, không gắn tag phát hành.

## 1. Phiên bản đầu tiên — v1.0.0

| Mục | Nội dung |
| --- | --- |
| Mã nguồn | Nhánh `main` tại thời điểm ký G5. Hiện gồm F-001…F-043, F-045…F-052 (xem [chức-năng/README.md](../chức-năng/README.md)) |
| Đang chờ duyệt | TASK-065…069 (giao diện "Mộc", nâng chất lượng giao diện, đổi tên quán, đăng xuất phải đóng ca, màu biểu đồ) nằm trên nhánh riêng. Được duyệt và gộp `main` trước ngày phát hành thì vào v1.0.0, không thì vào v1.1.0 |
| CSDL | CSDL chạy thật **mới** (đề xuất tên `CafeQr`), tạo bằng `npm run setup`; dữ liệu chạy thử `CafeQrDev` **không** mang sang (D-61), trừ khi chủ dự án quyết khác |
| Nơi chạy | Máy Windows tại quán — [deployment-checklist.md](deployment-checklist.md) phần A |
| Gắn tag | `git tag -a v1.0.0 -m "…"` trên commit phát hành, **sau khi** G5 ký. Không push nếu chủ dự án chưa yêu cầu |

**Đánh số:** `vLỚN.NHỎ.SỬA` — LỚN: đổi cách dùng / dữ liệu không tương thích; NHỎ: thêm chức năng; SỬA: chỉ sửa lỗi. Ghi chú phát hành = danh sách FEATURE / DEF trong bản, lấy từ [công-việc/README.md](../công-việc/README.md) và [defect-log.md](../chất-lượng/defect-log.md).

## 2. Điều kiện phát hành (vào G5)

- [ ] Gate G1–G4 đã ký ([quality-gates.md](../chất-lượng/quality-gates.md)).
- [ ] Trên đúng commit phát hành: `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run load`, `npm run trace -- --check` đều PASS.
- [ ] UAT đạt ([uat-plan.md](../chất-lượng/uat-plan.md)); không còn lỗi mức cao đang mở trong defect-log.
- [ ] Máy quán đã qua [deployment-checklist.md](deployment-checklist.md) phần A, gồm sao lưu tự động chạy thử được và **một lần diễn tập khôi phục ĐẠT** ([backup-restore.md](backup-restore.md)).
- [ ] [secrets-register.md](secrets-register.md) đã điền nơi giữ và người giữ từng bí mật.
- [ ] Có tên người trực trong [incident-runbook.md](incident-runbook.md) §2 (danh sách in, dán ở quầy).

## 3. Lịch phát hành

- Làm **sau khi đóng cửa và đóng ca** (không còn khách, két đã chốt). Không phát hành tối thứ Sáu, cuối tuần, ngày lễ hoặc trước ngày quán có sự kiện.
- Báo nhân viên trước ít nhất 1 ngày: giờ dừng app, việc cần làm sáng hôm sau.
- Lần đầu đưa vào dùng (go-live): nên có **1 ngày chạy thử nội bộ** (nhân viên đóng vai khách) và giữ **sổ order giấy** dự phòng trong tuần đầu.

## 4. Các bước phát hành (bản cập nhật)

Người làm: người kỹ thuật của quán. Thời gian dự kiến: 20–30 phút.

1. Đóng ca trên app (Quầy → Ca & hoàn tiền → Đóng ca); không còn bàn đang phục vụ.
2. Sao lưu có nhãn: `npm run db:backup -- --label truoc-v1.1` (hoặc bấm `hướng-dẫn/9-sao-lưu-ngay.cmd`). Ghi lại tên file.
3. Dừng app: dừng tác vụ `cafe-qr-app` trong Task Scheduler (hoặc đóng cửa sổ máy chủ).
4. Lấy code bản mới (`git pull` / chép thư mục), rồi `npm ci`.
5. Áp migration: `npm run db:migrate` (chạy lại không sao — chỉ áp file chưa chạy).
6. Khởi động lại tác vụ `cafe-qr-app`; chờ `npm run ops:health` ra **ỔN**.
7. Kiểm thử khói ([deployment-checklist.md](deployment-checklist.md) §A8): đăng nhập, khách gọi món, quầy nhận, hoàn tất, thu tiền, in bill.
8. Trên từng máy quầy / quản lý: tải lại trang bằng **Ctrl + F5** (file JS / CSS được trình duyệt giữ tới 1 giờ khi `NODE_ENV=production`).
9. Ghi vào **Nhật ký phát hành** (§7); báo nhân viên đã xong.

## 5. Quay lui (rollback)

**Khi nào:** bước 6–7 không đạt và không sửa được trong 30 phút, hoặc sau phát hành phát hiện lỗi làm sai tiền / kho / không bán được. Chủ dự án (hoặc người được ủy quyền) quyết.

1. Dừng app.
2. Lấy lại code bản trước: `git checkout v<bản trước>` rồi `npm ci`.
3. CSDL — xem bản mới có migration nào (thư mục `cơ-sở-dữ-liệu/chuyển-đổi/`, file số lớn hơn bản trước):
   - **Không có migration, hoặc chỉ thêm bảng / cột mới:** giữ nguyên CSDL; code bản trước bỏ qua bảng / cột nó không biết.
   - **Có migration đổi cột hoặc nới ràng buộc** (thêm trạng thái / vai mới — như `0005`, `0012`, `0020`, `0025`, `0033` đã từng làm): dữ liệu bản mới ghi có thể là giá trị code bản trước không hiểu → **khôi phục bản có nhãn ở bước 2**: `npm run db:restore -- --to CafeQr <file .bak có nhãn> --replace` (app đã dừng). Đơn phát sinh sau lúc sao lưu phải nhập lại từ bill / sổ giấy.
   - **Dữ liệu hỏng** (bản mới ghi sai): khôi phục như trên.
   Ghi chú phát hành nên nói rõ bản đó có migration loại nào để quyết nhanh khi cần quay lui.
4. Khởi động app, `npm run ops:health`, kiểm thử khói.
5. Ghi nhật ký phát hành + defect-log (DEF-xxx), báo nhân viên.

Mục tiêu quay lui xong trong **30 phút**.

## 6. Vai trò

| Vai | Việc |
| --- | --- |
| Chủ dự án / chủ quán | Ký G5, chọn ngày, quyết quay lui, giữ bí mật |
| Người kỹ thuật | Làm các bước §4, §5; giữ checklist |
| Trưởng ca | Kiểm thử khói phần nghiệp vụ, báo nhân viên, giữ sổ order giấy |
| Agent (Claude) | Chuẩn bị bằng chứng, tài liệu, công cụ; **không** tự triển khai |

## 7. Nhật ký phát hành

| Phiên bản | Ngày giờ | Commit | Người làm | Bản sao lưu trước | Kiểm thử khói | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| v1.0.0 | (chờ G5) | | | | | |
