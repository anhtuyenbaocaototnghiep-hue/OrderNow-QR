# TASK-080 — Trang Lãi / lỗ dễ hiểu cho chủ quán
Status: READY_FOR_REVIEW (02/11/2026)
Feature: [FEATURE-034](../chức-năng/FEATURE-034.md) (AC-034-07…09) · Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-31 (công thức giữ nguyên)
Module: MOD-REPORT · Màn hình: SCR-39 (`/admin/pnl`)
Nguồn: chủ dự án 02/11/2026 — "tinh chỉnh cho nó đơn giản, dễ sử dụng và nhìn vào dễ hiểu". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-080-lai-lo-de-hieu` chồng lên `task/TASK-079-bao-dong-gia-von` (chưa gộp `main`) · Kế hoạch: [TASK-080-plan.md](../kế-hoạch/TASK-080-plan.md)

## Mục tiêu
Chủ quán không học kế toán mở trang là biết ngay: quán đang lãi hay lỗ bao nhiêu, tiền đi đâu, mỗi ngày cần bán bao nhiêu, có chỗ nào làm số sai không.

## Phạm vi
1. Giao diện S-39: câu trả lời lãi / lỗ + so với khoảng trước cùng độ dài; "Tiền đi đâu" bằng lời thường (thuật ngữ kế toán để chữ nhỏ); thẻ "Mỗi ngày cần bán bao nhiêu để không lỗ?" có thanh hôm nay; thẻ "Cần để ý" tự phát hiện; nút chọn nhanh Hôm nay / Tuần này / Tháng này / Tháng trước / Năm nay + "Chọn ngày khác"; tự xem theo ngày khi ≤ 62 ngày, theo tháng khi dài hơn; biểu đồ, bảng theo kỳ, chi theo danh mục vào "Xem chi tiết"; chi phí cố định có nút thêm nhanh, tổng mỗi tháng / ngày.
2. API: `GET /api/admin/reports/pnl` thêm `lossValue` (hàng mất ròng trong kỳ, chỉ để nhắc).
3. Test integration + E2E (số liệu giả lập qua route), a11y; tài liệu.

## Không được sửa
- Công thức D-31 (doanh thu thuần, giá vốn, chi quỹ, cố định, hòa vốn) và các trường API đã có; quyền (chỉ ADMIN).

## Lưu ý tự phát hiện (thẻ "Cần để ý")
| Điều kiện | Câu nhắc |
| --- | --- |
| Chi phí cố định phân bổ = 0 | Chưa khai chi phí cố định → lãi đang cao hơn thực tế |
| Sổ quỹ có danh mục chứa "lương" có chi trong kỳ **và** có chi phí cố định tên chứa "lương" đang hiệu lực | Có thể trừ lương hai lần |
| Sổ quỹ có danh mục chứa "nguyên liệu" / "nhập hàng" / "mua hàng" có chi | Có thể trừ tiền hàng hai lần (đã nằm trong giá vốn) |
| `lossValue` > 0 | Hàng hao hụt, đổ bỏ, lệch kiểm kê chưa trừ vào lãi |
| `estimatedCogsRows` > 0 | Có món giá vốn tạm tính |

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Kết quả thực chạy (02/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **379/379 PASS** (thêm AC-034-07) |
| `npm run test:e2e` | **56/56 PASS** (53 luồng + 3 khả năng tiếp cận; thêm 1 E2E; a11y quét trang mới, 320 / 390 px). Lần chạy đầu, bài "mất kết nối quầy" (AC-007-05) lỗi một lần do chờ socket rớt quá 25 giây — chạy lại PASS, không liên quan thay đổi này |
| `npm run trace -- --check` | 146 US, 388 AC — PASS 388, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình 1366 px / 390 px trên CafeQrTest | Phát hiện cột "Tiền đi đâu" quá hẹp và danh sách chi phí cố định tràn 46 px ở 390 px → đã sửa, kiểm lại 0 px |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
