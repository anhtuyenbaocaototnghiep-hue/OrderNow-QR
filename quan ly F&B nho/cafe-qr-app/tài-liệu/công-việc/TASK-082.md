# TASK-082 — Hội viên dễ theo dõi, thao tác thực tế
Status: READY_FOR_REVIEW (02/11/2026)
Feature: [FEATURE-014](../chức-năng/FEATURE-014.md) (AC-014-09…11), liên quan F-039 (tích điểm) · Quyết định: ADR-005 D-5, D-16; ADR-006 D-27 (quy tắc giữ nguyên)
Module: MOD-LOYALTY · Màn hình: SCR-26 (`/admin/members`)
Nguồn: chủ dự án 02/11/2026 — "cái hội viên bạn tinh chỉnh khi khách mua tự động tích điểm để quản lý có thể theo dõi dễ nhìn và thao tác thực tế cao". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-082-hoi-vien-de-theo-doi` chồng lên `task/TASK-081-so-quy-de-dung` (chưa gộp `main`)

## Khảo sát
- **Tích điểm đã tự động** (F-039, `sp_ApplyLoyalty`): lúc thu tiền, nếu bàn / đơn mang đi đã gắn hội viên thì cộng 1 điểm / `loyalty.point_value` đồng thực trả, ghi sổ `PointTransactions` (EARN) trong cùng giao dịch; khung thu tiền đã hiện "Lượt này tích +X điểm".
- **Thiếu ở phía quản lý:** trang Hội viên chỉ có một bảng (mới đăng ký trước) + tìm theo SĐT đầy đủ / tên; không thấy điểm tích mỗi ngày, ai sắp lên hạng, ai lâu không quay lại, sinh nhật, tỷ lệ lượt thu có gắn hội viên.

## Thay đổi
| Chỗ | Sau |
| --- | --- |
| Ô tổng quan | Hội viên (+ mới tháng này) · Quay lại trong 30 ngày (%) · Điểm tích hôm nay (số khách, 7 ngày) · Lượt thu có hội viên hôm nay (x / y — dưới 50% thì nhắc hỏi SĐT) · Doanh thu từ hội viên 30 ngày (%) · Điểm khách đang giữ |
| Lọc nhanh | Tất cả · Mới tháng này · Chi nhiều nhất · Nhiều điểm · Sắp lên hạng (đã chi ≥ 80% mức hạng kế) · Lâu chưa quay lại (> 30 ngày) · Sinh nhật tháng này — kèm số đếm |
| Bảng | Hội viên (tên, hạng, SĐT che) · Điểm · Đã chi + số lần + thanh tiến độ "còn X lên hạng Y" · Lần cuối ghé ("hôm nay", "5 ngày trước") |
| Tích điểm gần đây | 12 lần cộng / trừ điểm mới nhất: ai, bao nhiêu, vì sao (tích khi thu tiền / đổi quà / điều chỉnh / hoàn tiền), lượt thu nào; bấm tên mở hồ sơ |
| Hồ sơ hội viên | Khung nổi bật Điểm · Hạng (+ tiến độ) · Đã chi (+ số lần, lần cuối); "Sửa thông tin" thu gọn; nút điểm nhanh +10 / +50 / +100 / −10 (vẫn bắt buộc lý do) |

## API
- `GET /api/admin/members` thêm `view` = `all` (mặc định) \| `new` \| `top` \| `points` \| `near` \| `lapsed` \| `birthday`; mỗi dòng thêm `nextTier` (`{ name, minSpent, remaining }` hoặc `null`).
- `GET /api/admin/members/overview` (ADMIN, mới).

## Không được sửa
Quy tắc tích điểm, hạng, ẩn danh (D-16: danh sách che SĐT, tìm bằng số đầy đủ), quyền (chỉ ADMIN).

## Đề xuất chưa làm (cần chủ dự án duyệt — là quy tắc nghiệp vụ mới)
**Tích điểm bù cho lượt thu đã qua:** khách quên đọc SĐT → quản lý gắn hội viên vào lượt thu trong vòng N ngày, cộng đúng số điểm của lượt đó một lần. Cần ADR (giới hạn ngày, ai được làm, chống gắn số của mình vào hóa đơn người khác).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Kết quả thực chạy (02/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **382/382 PASS** (35 file; thêm `member-overview.test.js` — AC-014-09, AC-014-10) |
| `npm run test:e2e` | **58/58 PASS** (55 luồng + 3 khả năng tiếp cận; thêm 1 E2E — AC-014-11) |
| `npm run trace -- --check` | 146 US, 393 AC — PASS 393, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình 1366 / 390 px trên CafeQrTest | Đọc được, 390 px không cuộn ngang; 6 ô số dồn một hàng |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
