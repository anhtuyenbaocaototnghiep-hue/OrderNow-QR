# TASK-079 — Báo động giá vốn khi nhập hàng giá cao hơn
Status: READY_FOR_REVIEW (02/11/2026)
Quyết định: [ADR-023](../quyết-định/ADR-023-bao-dong-gia-von.md) D-84…D-88 · Feature: [FEATURE-064](../chức-năng/FEATURE-064.md) · BR-100, BR-101
Module: MOD-INVENTORY, MOD-ADMIN · Màn hình: SCR-47 (Cảnh báo), SCR-33 (Cài đặt), SCR-21 (Thực đơn), SCR-27 (Combo)
Nguồn: chủ dự án 02/11/2026. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-079-bao-dong-gia-von` tách từ `main` (`v1.0.0-rc.3`) · Kế hoạch: [TASK-079-plan.md](../kế-hoạch/TASK-079-plan.md)

## Mục tiêu
Nhập hàng giá cao hơn thì chủ quán biết ngay món nào tụt lãi, mất bao nhiêu mỗi tháng và nên bán giá nào, thay vì phát hiện sau nhiều tuần trong báo cáo.

## Phạm vi
1. Migration 0042: loại cảnh báo `COST_RISE`, bảng `CostAlertMarks`.
2. `domain/costImpact.js`, `repositories/costAlertRepo.js`, phần giá vốn trong `alertService`; gọi từ `stockService` (nhập tay, theo đơn đặt, sửa, hủy).
3. Ba ngưỡng trong Cài đặt; bảng món ở trang Cảnh báo; `?edit={id}` ở Thực đơn và Combo.
4. Test integration + E2E; tài liệu; skill `bao-dong-gia-von`.

## Không được sửa
- Giá bán (app chỉ gợi ý); giá vốn đã chốt trên đơn; cách tính `AvgCost`, `LastUnitCost` trong SP; request / response của API nhập kho.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Review G3 (agent độc lập, chỉ đọc, 02/11/2026) và cách xử lý
Không có lỗi về quyền, chèn mã HTML, migration, công thức giá gợi ý. Đã sửa:

| Phát hiện | Sửa |
| --- | --- |
| Món vốn dưới 60% lãi bị báo mức cao mỗi khi một gia vị tăng giá, dù lãi không đổi | Điều kiện đổi thành "vừa rơi xuống dưới mức" (`crossed`); mức độ theo cùng nghĩa |
| Một phiếu hàng tặng 0đ làm mốc = 0 → tắt báo động nguyên liệu đó 90 ngày | Bỏ giá 0đ khỏi lịch sử, khỏi phân loại, khỏi đơn giá món |
| Giá nghi nhầm chưa sửa nằm trong `LastUnitCost`, làm sai lãi món ở phiếu nguyên liệu khác | `unconfirmedPrices`: thay bằng giá mốc khi tính |
| Hủy phiếu đã báo khi có phiếu sau cùng giá → giá hiện vẫn cao nhưng không còn cảnh báo | `reviewLaterReceipts` xét lại phiếu mới nhất |
| Phiếu rẻ bất thường → phiếu giá thường sau đó bị hỏi "nhập nhầm" | Phiếu rẻ dưới nửa mốc đứng riêng lẻ không kéo mốc xuống |
| Thêm dòng không giá bị coi là đổi giá | `pricesOf` chỉ xét dòng có giá |
| Email cảnh báo đang chờ vẫn đi sau khi sửa phiếu; thư đính chính thừa | Xóa email chưa gửi; chỉ đính chính khi email đã đi |
| Chạy lại sau lỗi có thể mất thư đính chính | `retireForReceipt` trả kết quả tính từ dữ liệu, thư có khóa chống trùng |
| Mua thưa: phiếu rẻ hơn quá 90 ngày sau lần báo bị bỏ qua | Vẫn tính phiếu gần nhất |
| Nguyên liệu không món nào dùng (ly giấy) bị hỏi "nhập nhầm" | Chỉ hỏi với nguyên liệu đang dùng trong món hoặc tùy chọn |

Không sửa, ghi nhận: hai lần sửa cùng phiếu trong một giây trùng khóa (người dùng thật không gặp); hai phiếu cùng nguyên liệu gần như đồng thời có thể báo hai lần (quán nhỏ, không hại); phiếu đầu sau nâng cấp có thể báo giá đã tăng từ vài tuần trước (ghi trong ADR-023).

Ngoài review, tự chụp màn hình phát hiện: màn điện thoại trang tràn ngang 276 px → sửa CSS, thêm kiểm tra ở E2E và a11y (320 / 390 px).

## Kết quả thực chạy (02/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **378/378 PASS** (34 file; thêm 23 test ở `cost-alert.test.js`) |
| `npm run test:e2e` | **55/55 PASS** (52 luồng + 3 khả năng tiếp cận; thêm 1 E2E; a11y quét thêm trang Cảnh báo ở 320 / 390 px) |
| `npm run load:report` | NFR-002 **10/10 vòng PASS**, NFR-001 p95 239 ms |
| `npm run trace -- --check` | 146 US, 385 AC — PASS 385, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Test mới chạy trên mã trước review | **9/23 FAIL** đúng các lỗi đã sửa |
| `npm run db:migrate` | CafeQrDev có migration 0042, không đổi dữ liệu cũ |
| Email qua Gmail thật | NOT_RUN — test dùng bộ gửi giả; kiểm bằng UAT-32 khi đã cài `SMTP_*` |

Chưa gộp vào `main`, chưa đẩy GitHub: chờ chủ dự án. G3 và UAT-32 chờ chủ dự án.
