# TASK-081 — Sổ quỹ dễ dùng, thao tác đơn giản
Status: READY_FOR_REVIEW (02/11/2026)
Feature: [FEATURE-033](../chức-năng/FEATURE-033.md) (AC-033-11, AC-033-12) · Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-23 (quy tắc giữ nguyên)
Module: MOD-SHIFT, MOD-ADMIN · Màn hình: SCR-15 (Ca & hoàn tiền — thẻ Sổ quỹ trong ca), SCR-36 (Sổ quỹ)
Nguồn: chủ dự án 02/11/2026 — "sổ quỹ bạn tinh chỉnh làm cho dễ sử dụng thao tác đơn giản". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-081-so-quy-de-dung` chồng lên `task/TASK-080-lai-lo-de-hieu` (chưa gộp `main`)

## Mục tiêu
Ghi một khoản chi thường gặp (mua đá 50.000đ) trong 3 chạm; người ghi biết trước khoản nào phải chờ duyệt; quản lý thấy ngay khoản chờ duyệt và lọc nhanh theo kỳ.

## Thay đổi
| Chỗ | Trước | Sau |
| --- | --- | --- |
| Hộp ghi khoản | Ô chọn danh mục, gõ số tiền, **bắt buộc** gõ nội dung | Danh mục là nút; nút số tiền nhanh 20k / 50k / 100k / 200k / 500k; nội dung để trống = tên danh mục (danh mục "luôn cần duyệt" vẫn bắt buộc); dòng báo "Cần duyệt" hiện trước khi lưu (vượt ngưỡng hoặc danh mục cần duyệt); ô ảnh mở camera trên điện thoại / máy tính bảng |
| Bảng sổ quỹ | 8 cột (giờ, loại, danh mục, nội dung, số tiền, trạng thái, người ghi, nút) | 5 cột: giờ · khoản (danh mục — nội dung; dòng nhỏ: số khoản, thu / chi, người ghi) · số tiền (− đỏ / + xanh) · trạng thái · nút |
| Thẻ "Sổ quỹ trong ca" | Hai nút như nhau, chú thích kỹ thuật | "Chi tiền" nổi bật, "Thu thêm"; câu hướng dẫn khi nào dùng nút nào |
| Trang Sổ quỹ (quản lý) | 5 ô lọc + nút CSV cùng một hàng; 4 ô số "Thu khác (đã duyệt)", "Chi quỹ (đã duyệt)", "Ròng", "Chờ duyệt" | Nút kỳ: Hôm nay / 7 ngày / Tháng này / Tháng trước; "Lọc thêm (n)" thu gọn; dải "Có n khoản chờ duyệt" + nút xem; ô số "Đã chi", "Đã thu thêm", "Két thay đổi", "Chờ duyệt"; nút **Chi tiền / Thu thêm / Xuất CSV** trên đầu trang (ghi khoản chỉ khi có ca đang mở) |
| Danh mục | Nhãn "Tính vào chi phí (lãi/lỗ)", "Luôn cần duyệt", "Thứ tự" | Nhãn bằng lời thường kèm giải thích |

## API
`GET /api/shifts/current` thêm `cashApproveThreshold` (ngưỡng chi cần duyệt, từ Cài đặt). Không đổi quy tắc duyệt, không đổi dữ liệu.

## Không được sửa
Quy tắc F-033 (phải có ca mở, ngưỡng duyệt, không tự duyệt, khoản chờ duyệt chưa trừ két, ảnh ≤ 2 MB), F-050 (hủy / sửa khoản đã duyệt). Nội dung vẫn luôn có giá trị khi gửi lên máy chủ (`Reason` NOT NULL).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Kết quả thực chạy (02/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **380/380 PASS** (thêm AC-033-11) |
| `npm run test:e2e` | **57/57 PASS** (54 luồng + 3 khả năng tiếp cận; thêm 1 E2E, bài "trưởng ca + sổ quỹ" chọn danh mục bằng nút) |
| `npm run trace -- --check` | 146 US, 390 AC — PASS 390, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình trên CafeQrTest | Ô nút thao tác lệch đường kẻ hàng (có từ trước — ô bảng bị `display: flex`) và danh sách khoản bị ép trong cột hẹp ở trang quản lý → đã sửa; 390 px không cuộn ngang |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
