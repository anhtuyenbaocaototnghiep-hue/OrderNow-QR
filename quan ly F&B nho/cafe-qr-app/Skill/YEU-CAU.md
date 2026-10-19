# Yêu cầu hệ thống — cafe-qr-app

> Tài liệu yêu cầu theo **Sổ tay quy trình AI Agent Web/App 15 bước (v1.0)**: giai đoạn **A — Phân tích nghiệp vụ** (bước 01–06) và **B — Đặc tả sản phẩm** (bước 07–09).
> Bước 10 (System Design) và bước 15 (Deployment) ở [KIEN-TRUC.md](KIEN-TRUC.md). Bước 11–14 (quy tắc agent, task, phát triển, kiểm thử) ở [AGENTS.md](../AGENTS.md), [.agent/skills/them-chuc-nang/SKILL.md](../.agent/skills/them-chuc-nang/SKILL.md) và [test-strategy.md](../tài-liệu/chất-lượng/test-strategy.md).
> **Nguồn sự thật** vẫn là `tài-liệu/`. File này tổng hợp và gắn ID; lệch nhau → làm theo `tài-liệu/`, ghi Q vào `tài-liệu/open-questions.md`.
> Cập nhật: 19/10/2026 (sau ADR-008). Người duyệt: theo Q-000 (chưa chốt).

---

## 0. Bản đồ phương pháp, quy ước ID, trạng thái Gate

### 0.1. Quy ước ID — sổ tay ↔ dự án

| Sổ tay | Dự án dùng | Ghi chú |
| --- | --- | --- |
| ACT (Actor) | `ACT-CUS`, `ACT-STF`, `ACT-MGR`, `ACT-ADM`, `EXT-…` | Mới, định nghĩa ở mục 02 |
| AF (Actor Function) | `AF-01…` | Mới, mục 03 |
| US (User Story) | `US-xxx` = `FEATURE-xxx` | Cùng số. Đặc tả đầy đủ: `tài-liệu/chức-năng/FEATURE-xxx.md`. Không có FEATURE-044 |
| AC | `AC-xxx-yy` | Đã có sẵn trong từng FEATURE |
| BR | `BR-001…BR-073` | `tài-liệu/nghiệp-vụ/business-rules.md` |
| UC | `UC-01…` | Mới, mục 06. Luồng chi tiết: `tài-liệu/nghiệp-vụ/workflows-states.md` |
| MOD | `MOD-…` | Mới, mục 07; trỏ tới service thật |
| SCR | `SCR-xx` = `S-xx` | `tài-liệu/giao-diện/screens-flows.md` |
| API | Đường dẫn REST | `tài-liệu/kiến-trúc/api-contract.md` |
| TC | Tên file test / AC | `ứng-dụng/máy-chủ/tests/*.test.js`, `kiểm-thử/e2e/flow.spec.js` |
| Decision log | `ADR-000…008`, `D-1…D-38`, `Q-xxx` | `tài-liệu/quyết-định/`, `tài-liệu/open-questions.md` |
| Yêu cầu gốc | `REQ-xxx`, `NFR-xxx` | `tài-liệu/source-map.md` |

### 0.2. Trạng thái 5 Quality Gate

| Gate | Điều kiện (sổ tay) | Trạng thái dự án | Bằng chứng / còn thiếu |
| --- | --- | --- | --- |
| **G1 — Nghiệp vụ** | Actor, Story, AC, BR, Use Case đủ và nhất quán | ✅ Đạt cho F-001…F-047 | FEATURE-xxx có AC; BR-001…073; ADR-000…008. Còn Q-021, Q-022 chạy theo mặc định |
| **G2 — Thiết kế** | Module, quyền, wireframe, kiến trúc, DB, API phù hợp | ✅ Đạt | Ma trận `PERMISSIONS`, screens-flows, data-model, api-contract. **Thiếu:** chỉ tiêu accessibility / trình duyệt (mục 08) |
| **G3 — Code** | Diff / PR, build / test đạt, có review | 🟡 Chờ review | `npm test` 234/234, `npm run test:e2e` 29/29, lint PASS. Mọi feature đang **READY_FOR_REVIEW**, chưa có review người |
| **G4 — Nghiệm thu** | Đủ bằng chứng AC, luồng chính + ngoại lệ + quyền | 🟡 Một phần | Test tự động phủ AC. **Thiếu:** UAT tại quán, in máy nhiệt thật, NFR-001 trên Wi-Fi quán (NOT_RUN) |
| **G5 — Phát hành** | Kế hoạch triển khai, backup / rollback, secrets, logs, người chịu trách nhiệm | 🔴 Chưa | Q-008 (hosting) và Q-000 (người ký) còn mở — xem [KIEN-TRUC.md](KIEN-TRUC.md) |

---

# A | PHÂN TÍCH NGHIỆP VỤ (bước 01–06)

## 01. Project Brief

| Mục | Nội dung |
| --- | --- |
| **Tên dự án** | cafe-qr-app — Web-app gọi món QR cho quán cà phê vừa và nhỏ (đồ án) |
| **Chủ sở hữu / người duyệt** | Nhóm đồ án; người ký chốt: **Q-000 chưa quyết** |
| **Nhóm thực hiện** | Tuyến (Front-end) · Nhật Anh (Back-end / Database) · Sáng (Testing) |
| **Bài toán hiện tại** | Giờ cao điểm khách phải chờ nhân viên ghi order và hay sai món do ghi tay. Thông tin giữa bàn và quầy pha chế bị nghẽn. Thất thoát nguyên liệu, khó kiểm soát định lượng |
| **Nhóm người dùng** | Khách tại bàn (không tài khoản), nhân viên quầy (gộp thu ngân + pha chế), trưởng ca, chủ quán / quản lý |
| **Mục tiêu** | (1) Khách tự gọi món bằng điện thoại, không cài app. (2) Quầy nhận đơn realtime. (3) Trừ kho tự động theo BOM, **không bao giờ âm kho**. (4) Thu tiền mặt, in bill, không lệch doanh thu. (5) Đủ ổn định để chạy thử tại một quán thật |
| **Chỉ số đo lường** | NFR-001 đồng bộ < 2 s · NFR-002 100 % kịch bản tranh chấp kho pass · NFR-003 gọi món ≤ 3 thao tác · NFR-004 trang khách nhẹ (mục 08) |
| **Phạm vi MVP** | QR bàn + gộp / tách phiên → menu, giỏ, gửi đơn → theo dõi realtime → quầy tiếp nhận / hoàn tất + trừ kho → khách Gọi thanh toán → thu tiền mặt tại bàn → in bill 58/80 mm; Bán mang đi; admin quản lý menu, bàn + QR, nguyên liệu, BOM, tài khoản, báo cáo (US-001…012) |
| **Mở rộng đã duyệt** | Giai đoạn 2 (ADR-005, US-013…024), giai đoạn 4–8 (ADR-006, US-025…045), F-046 (ADR-007), F-047 (ADR-008) |
| **Ngoài phạm vi** | Nhiều chi nhánh / nhiều kho; cổng thanh toán, chuyển khoản, VietQR (D-1); OTP / SMS; push notification; EDI nhà cung cấp; máy học |
| **Làm sau** | Thanh toán online; lưu / nén ảnh món (REQ-021); mở ngăn kéo tiền (Q-007); tự dọn giỏ rác / đóng bàn trống (REQ-020) |
| **Ràng buộc** | Stack D-4: HTML / CSS / JS thuần + Node.js / Express + SQL Server + Socket.io (ADR-002). 8 tuần, ≥ 2 tuần cuối cho kiểm thử. Hosting miễn phí. Một quán, một kho |
| **Dữ liệu nhạy cảm** | SĐT + họ tên hội viên (NĐ 13/2023 — D-16), mật khẩu nhân viên (bcrypt), ảnh hóa đơn sổ quỹ, nhật ký thao tác |
| **Tích hợp ngoài** | Không có dịch vụ thanh toán, không webhook. Tùy chọn: Zalo OA (chỉ chiều đi, khi có token) |
| **Giả định** | Quán có Wi-Fi; máy POS chạy Chrome nối máy in nhiệt; nhân viên có thể dùng chung tài khoản trên nhiều máy (hệ thống vẫn phải an toàn) |
| **Rủi ro** | Tranh chấp kho khi nhiều bàn gọi cùng lúc; thu tiền hai lần; mất mạng tại quầy; lộ dữ liệu khách; hosting chưa chốt |
| **Chưa quyết định** | Q-000, Q-008, Q-021, Q-022 (mục G) |

## 02. Actor Register

| ID | Actor | Mục tiêu chính | Định danh / mức quyền | Lưu ý |
| --- | --- | --- | --- | --- |
| `ACT-CUS` | Khách tại bàn | Gọi món nhanh, theo dõi đơn, gọi thanh toán, nhận ưu đãi | Không tài khoản; cookie `cf_client` + phiên bàn | Chỉ chạm phiên của mình; chỉ thấy tên / SĐT che |
| `ACT-STF` | Nhân viên quầy (thu ngân + pha chế) | Nhận và làm đơn, thu tiền, bán mang đi | Đăng nhập (JWT), vai `STAFF` | Thao tác vượt ngưỡng cần người duyệt |
| `ACT-MGR` | Trưởng ca | Điều hành ca, duyệt giảm giá / hoàn tiền / chi quỹ trong ngưỡng, kiểm kho | Vai `MANAGER` | Không vào `/api/admin/*`, không xem giá vốn / lãi |
| `ACT-ADM` | Quản lý / chủ quán | Cấu hình quán, xem báo cáo tài chính, quản trị nhân sự & CRM | Vai `ADMIN` | Luôn còn ≥ 1 ADMIN (BR-047); thao tác có nhật ký |
| `EXT-DB` | SQL Server | Giữ bất biến kho / tiền bằng SP + transaction | Hệ thống | Nguồn sự thật |
| `EXT-RT` | Socket.io hub | Phát sự kiện tới quầy / phiên | Hệ thống | Không phải nguồn sự thật |
| `EXT-PRN` | Máy in nhiệt 58/80 mm | In bill, phiếu chốt ca, PO | Thiết bị qua `window.print()` | — |
| `EXT-JOB` | Bộ lập lịch job nền | Tổng hợp ngày, dự báo, cảnh báo lô, dọn nhật ký… | Hệ thống | Một bộ duy nhất, có khóa chống chạy trùng |
| `EXT-ZALO` | Zalo OA | Gửi tin chiến dịch | Hệ thống ngoài, tùy chọn | Chỉ bật khi có `ZALO_OA_TOKEN` |

## 03. Actor Function Matrix

Chức năng ở đây chưa phải Module (bước 07 mới gom nhóm). Ưu tiên: **M** = Must (MVP) · **S** = Should (giai đoạn 2) · **C** = Could (giai đoạn 4–8).

| AF | Actor | Hành động | Dữ liệu chính | Quyền sơ bộ | Ưu tiên | US |
| --- | --- | --- | --- | --- | --- | --- |
| AF-01 | ACT-CUS | Quét QR, chọn gộp nhóm / gọi riêng | Bàn, phiên | Phiên của mình | M | US-001 |
| AF-02 | ACT-CUS | Xem menu, chọn món + tùy chọn / combo, gửi đơn | Menu, đơn | Phiên của mình | M | US-002, 003, 013, 015 |
| AF-03 | ACT-CUS | Theo dõi đơn realtime, xem thời gian chờ | Đơn, hàng chờ | Phiên của mình | M | US-004, 025 |
| AF-04 | ACT-CUS | Gọi thanh toán, gọi nhân viên | Phiên | Phiên của mình | M | US-005, 021 |
| AF-05 | ACT-CUS | Nhập SĐT hội viên, đăng ký, xem thẻ thành viên, gọi lại đơn cũ | Hội viên | Hội viên gắn với phiên của mình | S | US-014, 045, 047 |
| AF-06 | ACT-CUS | Chia bill theo người | Dòng món, phần chia | Dòng Chung / phần của mình | C | US-026 |
| AF-07 | ACT-STF | Đăng nhập, mở / đóng ca, chấm công tự động | Tài khoản, ca | Bản thân | M | US-009, 018, 035 |
| AF-08 | ACT-STF | Tiếp nhận, hoàn tất (trừ kho), hủy đơn chờ | Đơn, kho | Mọi đơn của quán | M | US-007 |
| AF-09 | ACT-STF | Thu tiền mặt (cả bàn / từng phần), in bill, đóng bàn | Lượt thu | Ca đang mở | M | US-006, 026 |
| AF-10 | ACT-STF | Bán mang đi | Đơn, lượt thu | Ca đang mở | M | US-008 |
| AF-11 | ACT-STF | Gọi món giúp khách tại bàn, ghi chú bàn, gắn hội viên | Phiên, đơn | — | S | US-024, 047 |
| AF-12 | ACT-STF | Áp hội viên / voucher / đổi thưởng / giảm tay khi thu | Lượt thu | Giảm tay ≤ 10 % và ≤ 20.000đ | S | US-014, 022, 038, 039 |
| AF-13 | ACT-STF | Sửa / xóa món, xóa đơn, hủy bàn | Đơn, kho | Đơn đã tiếp nhận → cần người duyệt | S | US-046 |
| AF-14 | ACT-STF | Sơ chế, hủy hàng, hủy lô hết hạn, nhận hàng theo PO, ghi sổ quỹ | Kho, quỹ | Khoản chi lớn chờ duyệt | C | US-027, 028, 030, 032, 033 |
| AF-15 | ACT-MGR | Duyệt giảm tay / hoàn tiền / chi quỹ trong ngưỡng, sửa chấm công hôm nay | Lượt thu, quỹ, chấm công | Theo ngưỡng D-24 | C | US-019, 033, 035, 036 |
| AF-16 | ACT-MGR | Điều chỉnh kho, kiểm kê, xem dashboard rút gọn | Kho, tổng hợp | Qua `/api/ops/*` | C | US-023, 043 |
| AF-17 | ACT-ADM | Quản lý menu, danh mục, combo, tùy chọn, lịch thực đơn, gợi ý, khuyến mãi | Menu | `admin.all` | M / S / C | US-010, 013, 015, 016, 017, 040 |
| AF-18 | ACT-ADM | Quản lý bàn + QR, tài khoản, cài đặt | Bàn, người dùng | `admin.all` | M | US-009, 010 |
| AF-19 | ACT-ADM | Nguyên liệu, BOM, đơn vị, giá vốn, lô, nhà cung cấp, PO, dự báo nhập | Kho, mua hàng | `admin.all` | M / C | US-011, 023, 027–032 |
| AF-20 | ACT-ADM | Hoàn tiền, xem ca, sổ quỹ tổng, nhân sự, nhật ký thao tác | Tiền, nhân sự | `admin.all` | S / C | US-018, 019, 033, 035 |
| AF-21 | ACT-ADM | Hội viên, hạng, điểm, tem, voucher, chiến dịch | CRM | `admin.all` | S / C | US-014, 037–039 |
| AF-22 | ACT-ADM | Báo cáo doanh thu, lãi / lỗ, phân tích, dashboard Hôm nay | Báo cáo | `admin.all` | M / C | US-012, 034, 041–043 |
| AF-23 | EXT-JOB | Chạy job theo lịch | Tổng hợp, dự báo, cảnh báo | Hệ thống | C | US-025, 029, 035, 037, 043 |

## 04. User Story Backlog

Mẫu: *Là [Actor], tôi muốn [hành động] để [giá trị].* Ưu tiên M / S / C như mục 03. Mọi story đang ở trạng thái **READY_FOR_REVIEW** (đã code, test tự động pass).

### MVP — Must

| US | Actor | Story | Ràng buộc chính |
| --- | --- | --- | --- |
| US-001 | ACT-CUS | Là khách, tôi muốn quét QR để vào đúng bàn và chọn gộp nhóm hoặc gọi riêng, để gọi món mà không cần tài khoản | BR-008 |
| US-002 | ACT-CUS | Là khách, tôi muốn xem menu và thêm món vào giỏ, để chọn đồ uống nhanh | NFR-003 |
| US-003 | ACT-CUS | Là khách, tôi muốn gửi đơn và được báo ngay nếu món hết, để không phải chờ một món không làm được | BR-001, 009–012, 015, 020 |
| US-004 | ACT-CUS | Là khách, tôi muốn thấy trạng thái đơn đổi theo thời gian thực, để biết khi nào món xong | NFR-001 |
| US-005 | ACT-CUS | Là khách, tôi muốn bấm "Gọi thanh toán", để nhân viên ra bàn thu tiền | BR-018 |
| US-006 | ACT-STF | Là nhân viên, tôi muốn thu tiền mặt cả bàn, in bill và đóng phiên, để doanh thu khớp và bàn trống lại | BR-007, 014, 019 |
| US-007 | ACT-STF | Là nhân viên, tôi muốn nhận đơn realtime, tiếp nhận và hoàn tất (trừ kho), để pha đúng thứ tự và kho luôn đúng | BR-001, 002, 013 |
| US-008 | ACT-STF | Là nhân viên, tôi muốn bán mang đi và thu tiền ngay tại quầy, để phục vụ khách vãng lai | BR-006 |
| US-009 | ACT-STF / ADM | Là nhân viên, tôi muốn đăng nhập bằng tài khoản riêng; là quản lý, tôi muốn cấp / khóa tài khoản | BR-004, 017 |
| US-010 | ACT-ADM | Là quản lý, tôi muốn quản lý danh mục, món, bàn và mã QR | ADR-004 (xóa mềm) |
| US-011 | ACT-ADM | Là quản lý, tôi muốn khai báo nguyên liệu, BOM và điều chỉnh kho, để hệ thống trừ kho đúng định lượng | BR-003, 016 |
| US-012 | ACT-ADM | Là quản lý, tôi muốn xem báo cáo doanh thu và lịch sử đơn theo khoảng ngày | BR-005 |

### Giai đoạn 2 — Should (ADR-005)

| US | Actor | Story | Ràng buộc chính |
| --- | --- | --- | --- |
| US-013 | CUS / STF / ADM | … tôi muốn chọn size / topping có phụ thu, để món đúng ý và kho trừ đủ | D-13 |
| US-014 | CUS / STF / ADM | … tôi muốn nhập SĐT để được nhận diện hội viên và chiết khấu theo hạng | BR-024, 025; D-5, 6, 16 |
| US-015 | CUS / STF / ADM | … tôi muốn mua combo cố định với giá ưu đãi | BR-029 |
| US-016 | ACT-ADM | … tôi muốn tạo khuyến mãi theo lịch (giá đặc biệt, giảm theo đơn) | BR-022, 023 |
| US-017 | CUS / ADM | … tôi muốn thấy mục Gợi ý / Bán chạy / món ghim | D-11 |
| US-018 | STF / ADM | … tôi muốn mở / đóng ca, đếm két và biết chênh lệch | BR-026 |
| US-019 | ADM (STF có duyệt) | … tôi muốn hoàn tiền sau khi thu, có lý do, hoàn kho nếu cần | BR-028 |
| US-020 | STF / ADM | … tôi muốn món tự "Hết món", tạm ngưng nhận đơn QR, đặt giờ bán theo danh mục | BR-030; D-12 |
| US-021 | CUS / STF | … tôi muốn gọi nhân viên (xin nước, thêm đá…) và quầy được báo riêng | Chống spam 60 s |
| US-022 | STF / ADM | … tôi muốn giảm giá tay trên bill có lý do và người duyệt khi vượt ngưỡng | BR-027 |
| US-023 | ADM | … tôi muốn nhập kho theo phiếu, kiểm kê và xem giá vốn / hao hụt | BR-030 |
| US-024 | ACT-STF | … tôi muốn gọi món giúp khách tại bàn và ghi chú bàn chỉ nhân viên thấy | BR-031, 032 (Q-021) |

### Giai đoạn 4–8 — Could (ADR-006) và bổ sung 18/10

| US | Actor | Story (rút gọn) | Ràng buộc chính |
| --- | --- | --- | --- |
| US-045 | CUS / STF | Gọi lại đơn lần trước và món yêu thích | BR-033 |
| US-040 | ADM | Thực đơn tự đổi theo mùa / khung giờ | BR-034 |
| US-025 | CUS / STF / ADM | Xem thời gian chờ ước tính | BR-035 |
| US-026 | CUS / STF | Chia bill theo người trong phiên gộp | BR-036, 037 |
| US-031 | ADM | Đổi đơn vị, giá vốn bình quân / FIFO | BR-038 |
| US-027 | ADM / STF | Bán thành phẩm, BOM 2 cấp, phiếu sơ chế | BR-039 |
| US-032 | STF / ADM | Phiếu hủy hàng, hao hụt định mức, thất thoát bất thường | BR-040 |
| US-028 | ADM / STF | Theo dõi lô và hạn dùng, trừ kho FEFO | BR-041 |
| US-030 | ADM / STF | Nhà cung cấp và đơn đặt hàng | BR-042 |
| US-029 | ADM | Đề xuất nhập hàng theo dự báo | BR-043 |
| US-036 | ADM / MGR | Vai Trưởng ca và ma trận quyền | BR-044…047 (Q-022) |
| US-033 | STF / MGR / ADM | Sổ quỹ thu / chi ngoài bán hàng | BR-048…051 |
| US-035 | Hệ thống / MGR / ADM | Chấm công, lịch làm, năng suất, nhật ký thao tác | BR-052…055 |
| US-034 | ADM | Lãi / lỗ ước tính và điểm hòa vốn | BR-056 |
| US-039 | CUS / STF / ADM | Tích điểm đổi quà, tem | BR-058, 059 |
| US-038 | CUS / STF / ADM | Giới thiệu bạn, voucher | BR-060, 061 |
| US-037 | ADM | Chiến dịch theo phân khúc | BR-062 |
| US-041 | ADM | Menu engineering | BR-063 |
| US-042 | ADM | Giờ cao điểm, dự báo doanh thu, so sánh kỳ, theo bàn | BR-064 |
| US-043 | ADM / MGR | Dashboard "Hôm nay" | BR-065 |
| US-046 | STF / MGR / ADM | Sửa / xóa món đã gọi, xóa đơn, hủy bàn | BR-066…070 (ADR-007) |
| US-047 | STF / CUS | Hội viên khi gọi món tại bàn, thẻ thành viên, quyền lợi trên bill | BR-071…073 (ADR-008) |

## 05. Acceptance Criteria & Business Rules

- **AC** trả lời "thế nào là đạt", viết Given / When / Then, ID `AC-xxx-yy`, nằm trong `tài-liệu/chức-năng/FEATURE-xxx.md`.
- **BR** trả lời "hệ thống phải tuân thủ luật nào", ID độc lập, dùng chung cho nhiều story, nằm trong `tài-liệu/nghiệp-vụ/business-rules.md`. **Feature chỉ link BR, không chép.**

### Ví dụ đầy đủ theo Mẫu 03 — US-003

> **US-003** | Priority: Must · Actor: ACT-CUS
> Là khách, tôi muốn gửi đơn và được báo ngay nếu món hết, để không phải chờ một món không làm được.
> - **AC-003-01:** Given giỏ 2 món hợp lệ, kho đủ / When gửi đơn / Then 201, có 1 đơn `PENDING / UNPAID`, 2 dòng với giá hiện tại, `ReservedQty` tăng đúng Σ BOM, quầy nhận `order.created` < 2 s.
> - **AC-003-02:** Given hết cốt trà đào / When gửi / Then 409 `OUT_OF_STOCK` nêu "Trà đào"; không ghi dòng nào; kho giữ không đổi.
> - **AC-003-03:** Given client gửi giá giả 1 đ / When gửi / Then server bỏ qua, tổng theo giá DB.
> - **AC-003-04:** Given kho đủ **1** suất, 20 phiên gửi đồng thời / Then đúng 1 đơn 201, 19 đơn 409, kho không âm.
> - **AC-003-05:** Given phiên của client khác / Then 403, không ghi dữ liệu.
> - **BR:** BR-001, BR-009, BR-010, BR-011, BR-012, BR-015, BR-020.
> - **Phụ thuộc:** US-001 · **Nguồn:** demo.docx US2, US10 · **Trạng thái:** READY_FOR_REVIEW.

### BR cốt lõi — bất biến không được phá

| Nhóm | BR | Nội dung |
| --- | --- | --- |
| Kho | BR-001 | Tồn mỗi nguyên liệu luôn `≥ 0`; thiếu → rollback toàn bộ |
| | BR-002 | Mỗi đơn trừ kho **đúng một lần** dù nhiều máy cùng bấm |
| | BR-009, BR-010 | Thiếu bất kỳ món nào → từ chối cả đơn. Giữ kho khi gửi, trừ khi hoàn tất, trả khi hủy (ADR-001) |
| | BR-041 | Theo lô: Σ lô = tồn; trừ FEFO; lô hết hạn không tính khả dụng |
| Tiền | BR-007 | Chỉ nhân viên đăng nhập ghi nhận thanh toán; **chỉ tiền mặt** (ADR-000) |
| | BR-011, BR-012 | Giá chốt lúc đặt; tổng tính ở server |
| | BR-019 | Phiên chỉ thu một lần; không còn đơn `PENDING` |
| | BR-021, BR-057 | KM → hội viên → voucher → đổi thưởng → giảm tay → làm tròn **xuống** 500đ; không âm |
| | BR-026, BR-050 | Thu / hoàn / sổ quỹ gắn **ca đang mở**; một ca mở; ca đóng không sửa |
| | BR-028 | Hoàn trong ngày, có lý do, Σ hoàn ≤ đã thu |
| Quyền | BR-044…047 | STAFF < MANAGER < ADMIN; kiểm ở server; luôn ≥ 1 ADMIN |
| | BR-055 | Nhật ký thao tác cho mọi thay đổi tiền / kho / quyền / giá; chỉ đọc; giữ 12 tháng |
| Dữ liệu cá nhân | BR-024, BR-072 | SĐT không OTP, tên che, đăng ký phải đồng ý; thẻ thành viên không lộ mã voucher |

## 06. Use Case & User Flow

Trạng thái nghiệp vụ (đơn, phiên, chia bill, sổ quỹ, PO, lô, voucher, tem, chiến dịch): [workflows-states.md](../tài-liệu/nghiệp-vụ/workflows-states.md).

### UC-01 — Gọi món tại bàn bằng QR

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-CUS · Story: US-001…004 |
| Tiền điều kiện | Bàn có `QrToken` hợp lệ; quán đang nhận đơn QR; món trong giờ bán / lịch thực đơn |
| Kích hoạt | Khách quét QR |
| Luồng chính | 1. Mở `/t/{qrToken}` (SCR-01) → 2. Bàn có phiên mở thì chọn Gộp / Riêng → 3. Xem menu (SCR-02), thêm món → 4. Mở giỏ (SCR-03), Gửi đơn → 5. Server kiểm + giữ kho trong một transaction → 6. Chuyển sang theo dõi (SCR-05); quầy nhận `order.created` |
| Luồng thay thế | A1. Phiên vừa đóng → tạo phiên mới (BR-008). A2. Đang Gọi thanh toán mà gọi thêm → phiên quay lại `OPEN`. A3. Nhập SĐT hội viên trước khi gửi (US-014) |
| Ngoại lệ | E1. QR sai → 404. E2. Món hết / thiếu nguyên liệu → 409 `OUT_OF_STOCK`, bỏ món khỏi giỏ. E3. Quán tạm ngưng → 503 `STORE_CLOSED`. E4. Ngoài lịch → 409 `ITEM_UNAVAILABLE`. E5. Phiên đã đóng → 409 `SESSION_CLOSED`. E6. Mất mạng → client tải lại ảnh chụp khi kết nối lại |
| Hậu điều kiện | Đơn `PENDING / UNPAID`; `ReservedQty` tăng đúng Σ BOM; không âm kho |
| Log | Không ghi audit (gọi món thường) |
| User Flow | SCR-01 → [bàn có phiên?] → SCR-02 → SCR-03 → [đủ kho?] → SCR-05 / thông báo lỗi |

### UC-02 — Tiếp nhận, hoàn tất và trừ kho

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STF · US-007 |
| Luồng chính | 1. Thẻ đơn nảy lên SCR-10 + âm thanh → 2. Tiếp nhận (`PENDING → PREPARING`) → 3. Pha → 4. Hoàn tất: `sp_CompleteOrder` trừ tồn + giữ, chốt giá vốn, FEFO → `COMPLETED` |
| Ngoại lệ | E1. Hai máy cùng hoàn tất → máy sau 409 "đã được nhân viên khác xử lý" (BR-002). E2. Hoàn tất đơn chưa tiếp nhận → 409. E3. Hủy chỉ áp cho `PENDING` (trả giữ kho). E4. Quầy mất mạng → icon "Mất kết nối", có mạng lại thì kéo đơn nhỡ + banner đơn trễ |
| Hậu điều kiện | Mỗi (đơn, nguyên liệu) tối đa 1 lần `DEDUCT`; phát `inventory.low` nếu dưới ngưỡng |

### UC-03 — Gọi thanh toán, thu tiền mặt, in bill

| Trường | Đặc tả |
| --- | --- |
| Actor | ACT-CUS → ACT-STF · US-005, 006, 014, 022, 038, 039 |
| Tiền điều kiện | Phiên có ≥ 1 đơn không hủy; **ca đang mở** |
| Luồng chính | 1. Khách bấm Gọi thanh toán (SCR-04) → quầy nhận dải nổi bật → 2. Nhân viên mở drawer Thu tiền (SCR-14) → 3. Áp hội viên / voucher / đổi thưởng / giảm tay (tính bằng `pricing`) → 4. Nhập tiền khách đưa → 5. `sp_SettleSession`: ghi lượt thu + tích điểm trong cùng transaction → 6. In bill (SCR-12) → phiên `CLOSED` |
| Luồng thay thế | A1. In "Tạm tính" trước khi thu. A2. Phiên chia bill → thu từng phần (UC-05) |
| Ngoại lệ | E1. Chưa mở ca → 409 `NO_OPEN_SHIFT`. E2. Còn đơn `PENDING` → chặn. E3. Tiền đưa thiếu → chặn. E4. Hai máy cùng thu → một 409. E5. Giảm tay vượt ngưỡng → cần tài khoản người duyệt. E6. Voucher sai / hết hạn / đã dùng → 404 / 409 |
| Hậu điều kiện | Đúng một `Payments` cho phiên; `AmountDue` đúng công thức BR-057; có audit `payment.*` |

### UC-04 — Bán mang đi

ACT-STF · US-008. SCR-13: chọn món → giỏ → nhập tiền khách đưa → **Thu tiền & In bill** → đơn `PREPARING + PAID` vào luồng pha.
Ngoại lệ: giỏ trống; tiền thiếu (bôi đỏ); hết kho; chưa mở ca.

### UC-05 — Chia bill theo người

ACT-CUS + ACT-STF · US-026.
- Khách mở "Chia bill" và nhận dòng món của mình; dòng chưa ai nhận thuộc phần Chung.
- Quầy thu từng phần (`sp_SettleSplit`); phần cuối gộp phần Chung; hết dòng chưa thu → phiên `CLOSED`.
- Ngoại lệ: nhận dòng của người khác → 403 / `409 LINE_LOCKED`; thu cả bàn khi đã chia → `409 SESSION_HAS_SPLITS`; thu đồng thời một phần → một 409.

### UC-06 — Hoàn tiền / sửa, xóa món / hủy bàn

ACT-STF / MGR / ADM · US-019, 046.
- **Món chưa thu** → sửa / xóa món, xóa đơn, hủy bàn (BR-066…070).
- **Món đã thu** → hoàn tiền (BR-028, 046).
- Luôn bắt buộc lý do. Vượt quyền → cần tài khoản người duyệt. Kho: trả giữ / ghi hủy / hoàn kho, không vượt lượng đã trừ.

### UC-07 — Mở ca, sổ quỹ, đóng ca

ACT-STF / MGR · US-018, 033, 035.
- Mở ca (tiền đầu ca) → thu bán + ghi thu / chi quỹ (khoản lớn chờ duyệt) → đóng ca: đếm két, `ExpectedCash` theo BR-050, in phiếu chốt ca; chấm công ra.
- Ngoại lệ: còn khoản `PENDING` → 409 `CASH_PENDING`; tự duyệt khoản của mình → 403.

> **Gate G1 — Nghiệp vụ: ✅ ĐẠT** cho phạm vi US-001…047. Điểm chưa quyết nằm ở Decision / Open Questions Log (mục G).

---

# B | ĐẶC TẢ SẢN PHẨM (bước 07–09)

## 07. Module Decomposition

Gom theo năng lực nghiệp vụ và ranh giới dữ liệu, không theo Actor. Mã nguồn theo tầng `routes → services → repositories / SP` (chi tiết ở [KIEN-TRUC.md](KIEN-TRUC.md)).

| Module | Trách nhiệm | Không chịu trách nhiệm | US | Actor | Code chính |
| --- | --- | --- | --- | --- | --- |
| `MOD-AUTH` | Đăng nhập, JWT, khóa tài khoản, ma trận quyền | Chấm công (MOD-STAFF) | 009, 036 | STF, MGR, ADM | `auth/permissions.js`, `middleware/auth.js`, `userService` |
| `MOD-SESSION` | Bàn, QR, phiên, gộp / tách, gọi thanh toán, gọi nhân viên, ghi chú bàn | Tính tiền | 001, 005, 010, 021, 024 | CUS, STF, ADM | `sessionService`, `staffCallService`, `tablesRepo` |
| `MOD-MENU` | Danh mục, món, combo, tùy chọn, lịch thực đơn, gợi ý, tự hết món | Kho | 002, 010, 013, 015, 017, 020, 040 | CUS, ADM | `menuService`, `modifierService`, `scheduleService` |
| `MOD-ORDER` | Gửi đơn, tiếp nhận, hoàn tất, hủy, sửa / xóa món, gọi lại đơn, ETA | Thu tiền | 003, 004, 007, 024, 025, 045, 046 | CUS, STF | `orderService`, `voidService`, `recallService`, `etaService`; `sp_SubmitOrder`, `sp_CompleteOrder` |
| `MOD-PRICING` | Tính giá, khuyến mãi, hội viên, voucher, đổi thưởng, giảm tay, làm tròn | Ghi DB | 014, 016, 022, 026, 038, 039 | — (dùng chung) | `pricing/pricing.js`, `pricingService` |
| `MOD-PAYMENT` | Thu tiền cả bàn / từng phần / mang đi, hoàn tiền, in bill | Tính giá (gọi MOD-PRICING) | 006, 008, 019, 026 | STF, MGR, ADM | `billingService`, `splitService`, `refundService`; `sp_SettleSession`, `sp_SettleSplit`, `sp_RefundPayment` |
| `MOD-SHIFT` | Ca, sổ quỹ, duyệt chi, phiếu chốt ca | Lương | 018, 033 | STF, MGR, ADM | `shiftService`, `cashService` |
| `MOD-INVENTORY` | Nguyên liệu, BOM, đơn vị, giá vốn, lô FEFO, sơ chế, hủy hàng, nhập kho, kiểm kê | Mua hàng | 011, 023, 027, 028, 031, 032 | STF, MGR, ADM | `inventoryService`, `stockService` |
| `MOD-PURCHASING` | Nhà cung cấp, PO, nhận hàng theo PO, dự báo nhập | — | 029, 030 | STF, ADM | `purchasingService`, `forecastService` |
| `MOD-CRM` | Hội viên, hạng, điểm, tem, voucher, giới thiệu, chiến dịch, thẻ thành viên | — | 014, 037, 038, 039, 047 | CUS, STF, ADM | `memberService`, `loyaltyService`, `campaignService`, `channels/zaloOa.js` |
| `MOD-STAFF` | Tài khoản, chấm công, lịch làm, năng suất, nhật ký thao tác | Đăng nhập (MOD-AUTH) | 009, 035 | MGR, ADM | `userService`, `attendanceService`, `middleware/audit.js` |
| `MOD-REPORT` | Báo cáo doanh thu, lãi / lỗ, menu engineering, phân tích, dashboard | Ghi dữ liệu nghiệp vụ | 012, 034, 041, 042, 043 | MGR, ADM | `reportsRepo`, `pnlService`, `analyticsService`, `dashboardService` |
| `MOD-RT` | Phát sự kiện realtime sau commit | Nguồn sự thật | (mọi US có realtime) | — | `realtime/io.js`, `realtime/publisher.js` |
| `MOD-JOBS` | Bộ lập lịch job nền duy nhất | — | 025, 029, 035, 037, 043 | EXT-JOB | `jobs/scheduler.js`, `jobs/index.js` |

### Ma trận quyền tối thiểu

Kiểm ở **server** cho mọi endpoint; UI chỉ ẩn / hiện. Chưa đăng nhập → 401, thiếu quyền → 403. Bản đầy đủ: [roles-permissions.md](../tài-liệu/nghiệp-vụ/roles-permissions.md).

| Tác vụ | Khách | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- | --- |
| Gọi món, theo dõi, gọi thanh toán (phiên của mình) | ✔ | — | — | — |
| Tiếp nhận, hoàn tất, thu tiền, mang đi, in | ✘ | ✔ | ✔ | ✔ |
| Giảm giá tay tự duyệt | ✘ | ≤ 10 % và 20.000đ | ≤ 20 % và 50.000đ | Không giới hạn |
| Hoàn tiền | ✘ | Cần người duyệt | Lượt thu trong ca đang mở | ✔ |
| Sửa / xóa món đơn đã tiếp nhận, hủy bàn | ✘ | Cần người duyệt | ✔ | ✔ |
| Mở / đóng ca, ghi sổ quỹ | ✘ | ✔ (Q-022) | ✔ | ✔ |
| Duyệt chi quỹ | ✘ | ✘ | ≤ 2.000.000đ | ✔ |
| Sơ chế, hủy hàng, nhận hàng theo PO | ✘ | ✔ | ✔ | ✔ |
| Điều chỉnh kho, kiểm kê | ✘ | ✘ | ✔ | ✔ |
| Dashboard Hôm nay | ✘ | ✘ | Rút gọn (không giá vốn / lãi) | ✔ |
| `/api/admin/*` (cấu hình, tài chính, CRM, nhân sự, audit) | ✘ | ✘ | ✘ | ✔ |

## 08. Non-Functional Requirements

| ID | Nhóm | Yêu cầu | Cách đo | Ngưỡng | Kết quả |
| --- | --- | --- | --- | --- | --- |
| NFR-001 | Performance | Khách gửi đơn → quầy thấy | Timestamp gửi → nhận, ≥ 30 lần, p95 (`npm run load`) | < 2 s | p95 ≈ 89–165 ms trên máy dev. **Wi-Fi quán: NOT_RUN** |
| NFR-002 | Concurrency / toàn vẹn | Nhiều bàn tranh kho | N request đồng thời, kho đủ M suất | 100 % pass: đúng M thành công, kho ≥ 0, Σ trừ = Σ BOM | 10/10 vòng × 30 khách PASS |
| NFR-003 | Usability | Gọi món sau khi quét QR | Đếm chạm: chọn món → giỏ → gửi | ≤ 3 thao tác | E2E "gọi món trong 3 chạm" PASS |
| NFR-004 | Performance (FE) | Trang khách nhẹ, mobile-first | Thời gian tải trên 4G, kích thước gzip | < 3 s, < 300 KB | **Ngưỡng PROPOSED, chưa đo** |
| NFR-005 | Security | Xác thực / phân quyền / input / secrets | Test ma trận quyền sinh từ `PERMISSIONS`; helmet CSP; rate-limit tra cứu hội viên 10 / phút / IP; bcrypt cost 10; kiểm chữ ký file upload | 0 endpoint lọt quyền | PASS (finance.test, api.test) |
| NFR-006 | Audit | Truy vết thao tác nhạy cảm | Mỗi thao tác tiền / kho / quyền / giá có 1 dòng audit sau commit | 100 % route trong bảng luật | PASS (finance-unit, finance.test) |
| NFR-007 | Privacy (NĐ 13/2023) | Đồng ý khi đăng ký; che tên / SĐT; ẩn danh theo yêu cầu; log không có SĐT | Test API khách + kiểm log | Không lộ SĐT đầy đủ ngoài quầy / CSV có audit | PASS (members.test, member-card.test) |
| NFR-008 | Availability / phục hồi | Mất mạng tại quầy | E2E tắt mạng 30 s, tạo đơn, bật lại | Không mất đơn, có banner đơn trễ | PASS (E2E) |
| NFR-009 | Maintainability | Lint, format, migration đánh số, SP `CREATE OR ALTER` | `npm run lint`, `format:check`, CI | 0 lỗi | PASS |
| NFR-010 | Accessibility | Thao tác bàn phím, tương phản, nhãn, thông báo lỗi | — | **Chưa đặc tả** (sổ tay gợi ý WCAG 2.2) | GAP |
| NFR-011 | Compatibility | Trình duyệt / thiết bị mục tiêu | — | **Chưa đặc tả** (đang test Chromium + viewport mobile) | GAP |

## 09. UI/UX — Screen Inventory

Đặc tả nội dung + trạng thái (loading / empty / error / success / denied) và file FE thật: [screens-flows.md](../tài-liệu/giao-diện/screens-flows.md).

| SCR | Route | Actor | US | Trạng thái đặc biệt |
| --- | --- | --- | --- | --- |
| SCR-01 | `/t/{qrToken}` — Vào bàn | CUS | 001 | QR sai 404, phiên đóng → tạo mới |
| SCR-02 | `/t/{qrToken}/menu` — Menu (tab Ưu đãi / Gợi ý / Combo) | CUS | 002, 013, 015, 016, 017, 040 | Hết món mờ, quán tạm ngưng, lỗi mạng |
| SCR-03 | Giỏ hàng (sheet) | CUS | 003, 014, 025, 045 | Đang gửi (khóa nút), dòng hết món |
| SCR-04 | Xác nhận Gọi thanh toán (modal) | CUS | 005 | Chưa có đơn → ẩn |
| SCR-05 | `/t/{qrToken}/track` — Theo dõi đơn, chia bill, thẻ thành viên | CUS | 004, 021, 026, 047 | Mất kết nối, đã thanh toán |
| SCR-09 | `/pos/login` | STF / MGR / ADM | 009 | Sai mật khẩu, tài khoản khóa |
| SCR-10 | `/pos` — Dashboard quầy | STF / MGR | 007, 021 | Mất kết nối, banner đơn trễ |
| SCR-11 | Chi tiết đơn (drawer) | STF | 007, 046 | 409 đã xử lý bởi người khác |
| SCR-12 | Trang in bill / tạm tính | STF | 006, 008, 047 | Watermark TẠM TÍNH |
| SCR-13 | `/pos/takeaway` — Bán mang đi | STF | 008 | Giỏ trống, tiền thiếu |
| SCR-14 | Drawer Thu tiền bàn | STF / MGR | 006, 014, 022, 026, 046 | Còn PENDING, đã thu ở máy khác |
| SCR-15 | `/pos/shift` — Ca & hoàn tiền | STF / MGR | 018, 019, 033 | Chưa mở ca |
| SCR-16 | `/pos/table-order` — Gọi món tại bàn | STF | 024, 047 | Bàn đang có nhóm → chọn "Nhóm mới" |
| SCR-17 | `/pos/stock` — Kho & sơ chế | STF / MGR | 027, 028, 030, 032 | Thiếu nguyên liệu, lô hết hạn |
| SCR-20…25 | `/admin/users`, `menu`, `tables`, `ingredients`, `menu/{id}/bom`, `reports` | ADM | 009–012 | Trùng username, định lượng ≤ 0, ngày sai |
| SCR-26…33 | Hội viên, Combo, Khuyến mãi, Gợi ý, Tùy chọn, Nhập kho & kiểm kê, Ca & hoàn tiền, Cài đặt | ADM | 013–023 | — |
| SCR-34…42 | Lịch thực đơn, Mua hàng, Sổ quỹ, Nhân sự, Nhật ký, Lãi / lỗ, Tích điểm & chiến dịch, Phân tích, **Hôm nay** | ADM (SCR-42: cả MGR) | 029–043 | SCR-42 responsive ≤ 400 px |

> **Gate G2 — Thiết kế: ✅ ĐẠT**: module, quyền, màn hình, kiến trúc, dữ liệu và API đã nhất quán. **Còn GAP:** NFR-010, NFR-011, NFR-004 (đo). Thay đổi sau G2 phải có ADR + đánh giá tác động.

---

# E | TRACEABILITY — từ yêu cầu đến test

Chuỗi mẫu (US-003):

```
ACT-CUS → AF-02 → US-003 → AC-003-04 + BR-001, BR-009 → UC-01 → MOD-ORDER → SCR-03 → POST /api/orders (sp_SubmitOrder) → sp.test "20 phiên / 1 suất" + npm run load
```

| Yêu cầu | Module / API / SCR | Bằng chứng nghiệm thu (TC) | Trạng thái |
| --- | --- | --- | --- |
| US-001 / AC-001-* | MOD-SESSION / `GET /t/:qrToken` / SCR-01 | api.test "quét QR…"; E2E "quét QR…", "phiên đã đóng…" | PASS |
| US-003 / AC-003-04 | MOD-ORDER / `POST /api/orders` / SCR-03 | sp.test (20 phiên / 1 suất, §13.2 ×10); `npm run load` | PASS |
| US-004 / NFR-001 | MOD-RT / Socket.io / SCR-05 | api.test (phiên khác không nhận sự kiện); load p95 | PASS (máy dev) |
| US-006 / BR-019 | MOD-PAYMENT / `POST /api/sessions/{id}/settle` / SCR-14 | sp.test (settle đồng thời); E2E thu tiền + in 80 mm | PASS; in máy thật NOT_RUN |
| US-007 / BR-002 | MOD-ORDER / `sp_CompleteOrder` / SCR-10 | sp.test, api.test (complete đồng thời) | PASS |
| US-016 / BR-023 | MOD-PRICING / khuyến mãi | pricing.test (lịch), sales.test (tranh lượt đồng thời) | PASS |
| US-019 / BR-028 | MOD-PAYMENT / refunds / SCR-15 | operations.test (hoàn đồng thời không vượt) | PASS |
| US-026 / BR-036 | MOD-PAYMENT / splits / SCR-05, SCR-14 | phase4.test (thu đồng thời), bất biến `SPLIT_*`, E2E "chia bill" | PASS |
| US-028 / BR-041 | MOD-INVENTORY / FEFO | inventory2.test (40 thao tác ngẫu nhiên), `LOTS_MISMATCH` | PASS |
| US-036 / BR-044 | MOD-AUTH / mọi endpoint | finance.test (ma trận sinh từ `PERMISSIONS`, `LAST_ADMIN` đồng thời) | PASS |
| US-039 / BR-059 | MOD-CRM / thu tiền | loyalty.test (hai quầy cùng đổi quà) | PASS |
| US-046 / BR-067, 068 | MOD-ORDER / void / SCR-14 | void.test (đua với tiếp nhận, hai máy cùng xóa), `OVER_RESTOCK` | PASS |
| US-047 / BR-072 | MOD-CRM / `GET /api/sessions/{id}/member-card` / SCR-05 | member-card.test (403 / 404 / 409, không có mã voucher) | PASS |
| NFR-004, 010, 011 | FE | — | **Chưa có TC** |

Bảng đủ từng feature ↔ test: [chức-năng/README.md](../tài-liệu/chức-năng/README.md) (cột "Bằng chứng tự động") và [test-strategy.md](../tài-liệu/chất-lượng/test-strategy.md) (bộ test + bất biến).

**Thiếu sót phát hiện nhờ traceability**
- NFR-004, NFR-010, NFR-011 chưa có ngưỡng chốt / testcase.
- UAT với người đại diện Actor (chủ quán, nhân viên thật) chưa có bằng chứng — chặn G4.
- Q-021 (US-024) và Q-022 (US-033, 036) đang chạy mặc định: nhóm đổi quyết định thì phải cập nhật BR, test quyền và màn hình liên quan.

---

# G | Decision / Open Questions Log

| Mã | Nội dung | Trạng thái | Ảnh hưởng |
| --- | --- | --- | --- |
| ADR-000 | Chỉ tiền mặt; khách Gọi thanh toán, nhân viên thu tại bàn; mục Bán mang đi riêng (D-1, D-2, D-3) | ACCEPTED | US-005, 006, 008 |
| ADR-001 | Giữ kho khi gửi đơn, trừ khi hoàn tất | ACCEPTED | US-003, 007 |
| ADR-002 | Stack HTML / CSS / JS thuần + Node / Express + SQL Server + Socket.io | ACCEPTED | Toàn hệ thống |
| ADR-003 | Áp phương án đề xuất cho Q-004b…Q-018 | ACCEPTED | MVP |
| ADR-004 | Xóa trong Quản lý: xóa hẳn nếu chưa có lịch sử, ngược lại xóa mềm | ACCEPTED | US-010, 011 |
| ADR-005 / 006 / 007 / 008 | Mở rộng giai đoạn 2 / 4–8 / sửa-xóa món / hội viên tại bàn (D-5…D-38) | ACCEPTED | US-013…047 |
| **Q-000** | Ai là người ký chốt Gate | **MỞ** | G1–G5 |
| **Q-008** | Hosting online (cloud hay máy trong quán) | **MỞ** | G5 |
| **Q-021** | Gọi món tại bàn — đang chạy mặc định | Chờ xác nhận | US-024 |
| **Q-022** | Ma trận Trưởng ca lệch docs (STAFF vẫn mở / đóng ca, ghi chi quỹ) | Chờ xác nhận | US-033, 036 |

Thay đổi yêu cầu (Change Request) theo Mẫu 09 của sổ tay → ghi thành ADR mới (ADR-009…), cập nhật BR / US / MOD / SCR / API / TC bị ảnh hưởng và chạy lại test hồi quy.

---

# Bảng kiểm cuối — đủ điều kiện giao AI Agent chưa?

| Nhóm kiểm soát | Bằng chứng | Đánh dấu |
| --- | --- | --- |
| Yêu cầu | MVP, Actor, Story, AC, BR, Use Case (file này + `tài-liệu/chức-năng/`) | [x] |
| Ranh giới | Module ownership, quyền, UI Spec, ERD, API Contract (mục 07, 09 + `tài-liệu/kiến-trúc/`) | [x] |
| Tài liệu AI | `AGENTS.md`, `.agent/rules.md`, skill `them-chuc-nang`, mẫu Task trong `tài-liệu/công-việc/`, lệnh test | [x] |
| An toàn | Agent không deploy production, không xóa dữ liệu thật, không đưa secret vào repo (`.agent/rules.md`) | [x] |
| Nghiệm thu | Traceability (mục E), test tự động, DoD (`test-strategy.md`), **người duyệt Q-000** | [ ] chờ Q-000 + UAT |
| Triển khai | Release, backup / restore, rollback, monitoring, người trực ([KIEN-TRUC.md](KIEN-TRUC.md)) | [ ] chờ Q-008 |

Người xác nhận: ............ Ngày: ............ Phiên bản tài liệu: 2.0 (19/10/2026)

**Công thức kết thúc:** Yêu cầu có ID → Đầu ra có owner → Code có kiểm thử → Thay đổi có phê duyệt → Release có phương án khôi phục.
