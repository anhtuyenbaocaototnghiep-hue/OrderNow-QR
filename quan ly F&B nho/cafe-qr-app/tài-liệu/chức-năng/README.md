# Đặc tả chức năng (features)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

Mỗi feature dưới đây đủ để agent triển khai và kiểm. AC viết dạng Given/When/Then rút từ Word, có bổ sung AC về quyền và dữ liệu không bị thay đổi sai. Feature chỉ **link** rule ID, không chép rule.

## Bảng tổng hợp feature ↔ nguồn ↔ trạng thái

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai (14/10/2026) | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-001](FEATURE-001.md) | Quét QR, tách/gộp phiên | Khách | CONFIRMED (+ADR-003 Q-012) | READY_FOR_REVIEW | api.test "quét QR…", "sau khi đóng…"; E2E "quét QR…", "phiên đã đóng…" |
| [F-002](FEATURE-002.md) | Menu & giỏ | Khách | CONFIRMED | READY_FOR_REVIEW | E2E "gọi món trong 3 chạm", "admin tắt còn bán…" |
| [F-003](FEATURE-003.md) | Gửi đơn + kiểm kho | Khách | CONFIRMED (+ADR-001, Q-005, Q-013) | READY_FOR_REVIEW | sp.test (20 phiên/1 suất, §13.2 ×10), api.test, E2E "món vừa hết nguyên liệu…", `npm run load` |
| [F-004](FEATURE-004.md) | Theo dõi đơn realtime | Khách | CONFIRMED | READY_FOR_REVIEW | api.test (phiên khác không nhận sự kiện), E2E "tiếp nhận → hoàn tất…" |
| [F-005](FEATURE-005.md) | Gọi thanh toán | Khách | CONFIRMED | READY_FOR_REVIEW | sp.test, api.test "gọi thanh toán…", E2E "gọi thanh toán → …" |
| [F-006](FEATURE-006.md) | Thu tiền mặt, in bill, đóng phiên | Staff | CONFIRMED | READY_FOR_REVIEW (in máy nhiệt thật: NOT_RUN) | sp.test (settle đồng thời, submit⇄settle), api.test, E2E thu tiền + trang in 80 mm |
| [F-007](FEATURE-007.md) | Dashboard quầy: tiếp nhận, hoàn tất & trừ kho | Staff | CONFIRMED (+ADR-003 Q-004b, Q-006) | READY_FOR_REVIEW | sp.test, api.test (complete đồng thời), E2E realtime + mất mạng/đơn trễ |
| [F-008](FEATURE-008.md) | Bán mang đi (tiền mặt) | Staff | CONFIRMED | READY_FOR_REVIEW | sp.test, api.test "Bán mang đi", E2E "bán mang đi…" |
| [F-009](FEATURE-009.md) | Đăng nhập & tài khoản | Staff/Admin | CONFIRMED | READY_FOR_REVIEW | api.test (ma trận quyền, khóa, trùng username, hash), E2E đăng nhập + trùng tên |
| [F-010](FEATURE-010.md) | Menu/danh mục/bàn/QR | Admin | CONFIRMED | READY_FOR_REVIEW | api.test "menu…", "bàn + QR…", E2E realtime hết món |
| [F-011](FEATURE-011.md) | Nguyên liệu/BOM/kho | Admin | CONFIRMED (+ADR-003 Q-011) | READY_FOR_REVIEW | sp.test adjust, api.test BOM/kho, E2E BOM -10 |
| [F-012](FEATURE-012.md) | Báo cáo + lịch sử đơn | Admin | CONFIRMED (+ADR-003 Q-014) | READY_FOR_REVIEW | api.test báo cáo (seed 55 đơn = 3.190.000đ), E2E báo cáo |

Không còn feature nào bị chặn bởi câu hỏi mở (ADR-000…003). "READY_FOR_REVIEW" = đã code + test tự động pass, chờ nhóm review theo DoD. Chi tiết câu hỏi: [open-questions.md](../open-questions.md).
