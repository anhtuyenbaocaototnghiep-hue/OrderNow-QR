# TASK-092 — Hạn dùng nguyên liệu: hạn sau khi mở, tiền sắp mất, món nên mời (F-075)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-033](../quyết-định/ADR-033-han-dung-nguyen-lieu.md) D-147…D-152 · Feature: [FEATURE-075](../chức-năng/FEATURE-075.md) (US-075-1/2, AC-075-01…05) · BR-113
Module: MOD-INVENTORY, MOD-REPORT · Màn hình: SCR-23 (Nguyên liệu → Kho nâng cao), SCR-17 / SCR-55 (Kho & sơ chế → Hạn dùng → hộp đang mở), thanh trên máy quầy (dải "Nên mời khách hôm nay"), SCR-42 (Hôm nay), SCR-47 (Cảnh báo)
Nguồn: chủ dự án 06/11/2026 "khi làm xong kho nguyên liệu bạn cho tôi phương án hết hạn nữa nha"; agent đề xuất 5 việc, khuyên gộp 1 + 2 + 3; chủ dự án 07/11/2026: "ok tiến hành làm đi". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-092-han-dung-nguyen-lieu` chồng lên `task/TASK-091-ban-khi-mat-mang` (chưa gộp `main`) · Kế hoạch: [TASK-092-plan.md](../kế-hoạch/TASK-092-plan.md)

## Mục tiêu
Không pha đồ từ hộp đã mở quá hạn, chủ quán biết trước bằng tiền nguyên liệu sắp hỏng, quầy được gợi ý món nên mời để dùng kịp, cuối tháng thấy tiền mất vì hết hạn theo nguyên liệu và nhà cung cấp.

## Phạm vi
1. Migration 0052; thủ tục `sp_TrackOpenPacks`, `sp_DiscardOpenPack` (`sp_OpenPacks.sql`); móc vào `sp_CompleteOrder`, `sp_PostPrepBatch`; `tvf_ExpiredLotQty` cộng phần hộp mở quá hạn.
2. Máy chủ: `expiryRepo`, `expiryService`, `routes/expiry.js`, `advanced.js` (cấu hình + báo cáo tháng), `inventoryService/Repo.setAdvanced`, `ingredientsRepo` (trường mới), `alertService.onExpiryRisk`, job 06:00, `dashboardService.today`, nhật ký `inventory.discard-open`, lỗi `50124 NO_OPEN_PACK`.
3. Giao diện: Kho nâng cao (nhóm hạn sau khi mở), quầy Hạn dùng (hộp đang mở + Bỏ phần còn), dải "Nên mời khách hôm nay", thẻ "Sắp hết hạn (2 ngày tới)" ở Hôm nay, nhãn cảnh báo; CSS.
4. Test integration + E2E; tài liệu; skill `han-dung-nguyen-lieu`.

## Không được sửa
Luật lô / FEFO / giá vốn của F-028 / F-031 (chỉ thêm phần hộp mở); bất biến kho; luật giá (không tự giảm giá món nên mời).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **442/442 PASS** (47 file; thêm `expiry.test.js` 4 test — AC-075-01…04; test cũ của bán / sơ chế / kho / lô vẫn qua sau khi móc `sp_TrackOpenPacks` vào `sp_CompleteOrder`, `sp_PostPrepBatch` và đổi `tvf_ExpiredLotQty`; bước dọn của bộ test kiểm bất biến kho / lô) |
| `npm run test:e2e` | **68/68 PASS** (thêm E2E "hạn dùng nguyên liệu…" — AC-075-05) |
| `npm run trace -- --check` | 171 US, 464 AC — PASS 464, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Dải "Nên mời khách hôm nay", quầy Hạn dùng (hộp đang mở + lô), thẻ "Sắp hết hạn (2 ngày tới)" ở Hôm nay (số tiền khớp: 950 ml × 50đ + 2.000 ml × 60đ = 167.500đ), hộp Kho nâng cao — không cuộn ngang. Sửa theo ảnh: ô cũ "Dùng trong (giờ, sau khi pha / mở)" dễ lẫn với ô mới → đổi thành "Hạn dùng tính từ lúc nhập / sơ chế (giờ)" |
| `npm run db:migrate` (CafeQrDev) | 0052 + `sp_OpenPacks`, `sp_CompleteOrder`, `sp_PostPrepBatch`, `tvf_ExpiredLotQty` đã áp; máy chủ thử nghiệm chạy lại ở `http://10.50.2.7:3000` |
| `npm run lint`, `npm run format:check` | PASS |
| Lỗi tìm được khi làm | (1) Thiết kế: phương án đầu "rút hạn của lô khi mở" sai vì một lô gồm nhiều hộp → chuyển sang theo dõi hộp đang mở theo nguyên liệu. (2) Test: giá vốn mẫu của "Cà phê cốt" = 0 nên mọi số tiền = 0 → test nhập phiếu có giá trước; API hủy lô trả 201 |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
