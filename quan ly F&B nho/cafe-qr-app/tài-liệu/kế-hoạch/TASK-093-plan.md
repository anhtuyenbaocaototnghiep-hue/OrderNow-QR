# TASK-093 — Kế hoạch: quy trình 1 chạm ở màn Đơn hàng (F-076, ADR-034)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Màn Đơn hàng | `pos/index.html` (`#col-PENDING`, `#col-PREPARING`, `#col-COMPLETED`), `js/pages/pos-dashboard.js` (`ticket`, `renderBoard`, `accept`, `complete`, `acceptAndComplete`, `openOrder`) | 3 bước; có nút "Tiếp nhận & Hoàn tất" gọi hai API liền |
| Trừ kho | `sp_CompleteOrder` lúc Hoàn tất | Quên Hoàn tất → kho chưa trừ |
| Thời gian pha | `etaRepo.recomputePrepStats` (job 02:00): `CompletedAt − AcceptedAt`, lọc 1–7200 giây | Đơn nhận + xong liền tay ra 0–1 giây |
| Cài đặt | `settingsService` (`KEYS`, `getSettings`), `PUT /api/admin/settings` (`operations.js`), `admin-settings.js`; `/api/auth/me` (`public.js`) → `current` (`auth.js`) | — |

## Thiết kế
- Chỉ đổi giao diện + cách tính thống kê; máy chủ vẫn đi đủ PENDING → PREPARING → COMPLETED (không đụng trừ kho, báo khách, luật hủy món, quyền).
- Cờ `current.pos.oneTap` đọc một lần lúc mở trang; bật → gộp mảng `PENDING` (chưa giữ) + `PREPARING` vào cột đầu, sắp theo `readySince`, ẩn cột giữa, phiếu có nút `.btn-done`.
- Thống kê: CTE `Base` có `ReadyAt` (tới / hết giữ) và `LAG(CompletedAt)`; đơn "nhận + xong" < 10 giây lấy mốc muộn hơn của hai mốc đó làm giờ bắt đầu.
- Test cũ giữ 3 cột (`pos.one_tap = false` trong `testDb.js`, `e2e-server.js`).

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Quán đông mất danh sách "đang pha" | Tắt được ở Cài đặt (giải thích ngay dưới ô) |
| Thống kê lệch khi nhiều người pha song song | Mốc "đơn trước vừa xong" là ước lượng cho quán 1–2 người pha (đối tượng của chế độ này) |
| Test cũ phụ thuộc 3 cột | Cài đặt cũ ghi sẵn trong dữ liệu test |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.
