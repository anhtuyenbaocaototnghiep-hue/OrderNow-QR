# Project Brief — cafe-qr-app (bước 01)

> **Mẫu:** Sổ tay quy trình 15 bước (Playbook v1.0), bước 01 "Idea / Problem", Mẫu 01. **Phiên bản:** v1.0 — 20/10/2026 ([TASK-057](../công-việc/TASK-057.md)). **Nguồn:** [overview.md](overview.md), [ADR-000…008](../quyết-định/README.md), [chức-năng/README.md](../chức-năng/README.md), [open-questions.md](../open-questions.md), [handover-2026-10-18.md](../chất-lượng/handover-2026-10-18.md). **Trạng thái tài liệu:** CHỜ DUYỆT G1 — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A).

> **Thay thế phạm vi ở [overview.md §1.2](overview.md).** Bảng §1.2 của overview ghi phạm vi bản đầu (14/10/2026): MVP + "làm sau" + "không làm" (chấm công, CRM). Sau đó chủ dự án đã duyệt mở rộng bằng [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md), [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md), [ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md), [ADR-008](../quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md) và yêu cầu 16/10/2026 (F-024). Từ 20/10/2026, **phạm vi hiện hành (CURRENT) là mục 5 và mục 6 của file này**. Overview §1.1 (vấn đề), §1.3 (nguồn lực, thời gian) và §1.4 (NFR) vẫn là nguồn gốc, không bị thay.

## 1. Thông tin chung

| Trường | Nội dung | Trạng thái |
| --- | --- | --- |
| Tên dự án | **cafe-qr-app** — web-app gọi món bằng QR tại bàn, quầy nhận đơn realtime, trừ kho theo BOM, thu tiền mặt, cho quán cà phê vừa và nhỏ (đồ án) | CONFIRMED |
| Chủ sở hữu | Nhóm đồ án: **Tuyến** – Front-end · **Nhật Anh** – Back-end/Database · **Sáng** – Testing (overview §1.3) | CONFIRMED |
| Người duyệt | **Chủ dự án — chờ ký G1.** Người ký chốt phía nhóm chưa ghi tên | NEEDS_CONFIRMATION ([Q-000](../open-questions.md)) |
| Ngày | 20/10/2026 | — |
| Thời gian | 8 tuần; tối thiểu 2 tuần cuối dành cho kiểm thử (ép tải, tranh chấp kho) — overview §1.3 | CONFIRMED |
| Chi phí | Hosting / API miễn phí cho mục đích học tập — overview §1.3 | CONFIRMED (nhà cung cấp: UNKNOWN — Q-008) |
| Sản phẩm bàn giao | 01 web-app (Front-end HTML/CSS/JS thuần, Back-end Node.js, SQL Server, REST API) + bộ tài liệu đồ án (đặc tả, UI/UX, sơ đồ CSDL) — overview §1.1 | CONFIRMED (D-4) |
| Quy trình | Sổ tay 15 bước; hồ sơ này phục vụ bước 01 → 14. Bước 15 (triển khai thật) ngoài phạm vi ([TASK-057](../công-việc/TASK-057.md)) | CONFIRMED |

## 2. Bài toán hiện tại

**Câu mô tả vấn đề (một câu):** Ở quán cà phê vừa và nhỏ, order được ghi tay nên giờ cao điểm khách phải chờ nhân viên và dễ bị sai món, thông tin giữa bàn khách và quầy pha chế bị nghẽn, còn chủ quán khó kiểm soát định lượng và thất thoát nguyên liệu vì không có trừ kho tự động theo BOM.

| Ai bị ảnh hưởng | Vấn đề (overview §1.1) | Cách xử lý thủ công hiện nay | Trạng thái |
| --- | --- | --- | --- |
| Khách | Chờ nhân viên ghi order giờ cao điểm; sai món do ghi tay | Nhân viên ra bàn ghi order bằng tay | CONFIRMED |
| Nhân viên quầy / pha chế | Nghẽn thông tin giữa bàn khách và quầy pha chế | Order ghi tay được chuyển tới quầy (cách chuyển cụ thể: nguồn không ghi) | CONFIRMED (vấn đề) / UNKNOWN (cách chuyển) |
| Chủ quán / quản lý | Thất thoát nguyên liệu, khó kiểm soát định lượng | Chưa có trừ kho tự động theo BOM (cách kiểm kho thủ công: nguồn không ghi) | CONFIRMED (vấn đề) / UNKNOWN (cách làm hiện tại) |

Câu mô tả vấn đề ghép từ overview §1.1 (CONFIRMED từng ý); câu thống nhất này chờ chủ dự án xác nhận ở G1.

## 3. Nhóm người dùng

Chi tiết mục tiêu, mức quyền, lưu ý dữ liệu: [nghiệp-vụ/actors.md](../nghiệp-vụ/actors.md).

| ID | Nhóm người dùng / hệ thống | Cách vào hệ thống |
| --- | --- | --- |
| ACT-GUEST | Khách quét QR tại bàn | Không đăng nhập; cookie `cf_client` |
| ACT-MEMBER | Khách đã gắn SĐT hội viên vào phiên (dạng đặc biệt của ACT-GUEST) | Như ACT-GUEST + SĐT hội viên đang gắn vào phiên |
| ACT-STAFF | Nhân viên quầy (thu ngân + pha chế, một dashboard — Q-017) | Đăng nhập, vai STAFF |
| ACT-LEAD | Trưởng ca | Đăng nhập, vai MANAGER (ADR-006 D-24) |
| ACT-ADMIN | Quản lý / chủ quán | Đăng nhập, vai ADMIN |
| EXT-ZALO | Zalo OA (gửi tin chiến dịch) | Chỉ khi có `ZALO_OA_TOKEN` |
| EXT-PRINTER | Máy in bill khổ 58/80 mm qua trình duyệt máy quầy | Lệnh in của trình duyệt |
| EXT-SCHEDULER | Bộ lập lịch job nền trong tiến trình server | `src/jobs/scheduler.js` |

## 4. Mục tiêu kinh doanh và chỉ số đo lường

**Mục tiêu kinh doanh (overview §1.1, CONFIRMED):** luồng Khách → Thu ngân → Pha chế liền mạch; dữ liệu toàn vẹn (không âm kho, không lệch doanh thu); đủ ổn định để chạy thử tại một quán thật.

`MT-x` là nhãn nội bộ của brief (không phải ID truy vết chính thức). Mọi ngưỡng lấy từ NFR / BR đã có; không thêm cam kết mới.

| # | Kết quả mong muốn | Chỉ số / ngưỡng | Nguồn | Cách đo | Bằng chứng đã có | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| MT-1 | Quầy thấy đơn mới gần như ngay lập tức | Đồng bộ trạng thái đơn giữa các thiết bị **< 2 giây** (p95) | NFR-001 | Đo từ lúc khách gửi đến lúc quầy nhận sự kiện realtime, ≥ 30 lần, lấy p95 (overview §1.4) | `npm run load` 18/10/2026: p95 92 ms; sau F-046: p95 89 ms (máy local) — [handover-2026-10-18](../chất-lượng/handover-2026-10-18.md). Đo trên Wi-Fi quán: NOT_RUN | CONFIRMED (chỉ tiêu) / đo thực địa NOT_RUN |
| MT-2 | Kho không bao giờ âm khi nhiều bàn gọi cùng lúc | **100 %** kịch bản ép tải tranh chấp kho pass: đúng M đơn thành công, `StockQty ≥ 0`, tổng trừ = tổng BOM | NFR-002; BR-001, BR-002, BR-010 | Script bắn N request đồng thời vào kho chỉ đủ M suất | `npm run load` **10/10 vòng PASS** (18/10/2026); AC-003-04 (20 phiên / 1 suất → đúng 1 đơn) | CONFIRMED |
| MT-3 | Khách tự gọi món nhanh | **≤ 3 chạm** từ khi menu hiện ra đến khi gửi xong đơn 1 món (không tính hộp thoại Gộp / Cá nhân) | NFR-003, Q-016 (ADR-003) | Đếm chạm trên luồng chuẩn "+" → "Xem giỏ · Gửi đơn" → "Gửi đơn" | E2E "gọi món trong 3 chạm" PASS | CONFIRMED |
| MT-4 | Kho và doanh thu không lệch | **0** vi phạm bất biến kho / tiền sau mọi bộ test (giữ kho khớp đơn, Σ lô = tồn, tổng đơn khớp dòng, giá vốn dòng = giá vốn kho, mỗi phần chia bill một lượt thu, tiền dự kiến chốt ca đúng công thức) | BR-002, BR-019, BR-028, BR-036, BR-041, BR-050, BR-068, BR-069 | Bộ kiểm bất biến chạy sau mọi file test ([test-strategy](../chất-lượng/test-strategy.md)) | `npm test` **234/234 PASS**, `npm run test:e2e` **29/29 PASS** (18/10/2026) | CONFIRMED |
| MT-5 | Đúng người làm đúng việc | **100 %** cặp (quyền × vai) trong bảng `PERMISSIONS`: vai được phép không nhận 401/403, vai khác nhận 403; khách không token gọi API quầy → 401 | BR-044; AC-036-01, AC-036-02 | Test ma trận sinh tự động từ `PERMISSIONS` | `finance.test.js` "ma trận actor × endpoint" PASS (18/10/2026) | CONFIRMED |

NFR-004 ("giao diện khách mobile-first, siêu nhẹ") chưa có ngưỡng số → không dùng làm chỉ số G1; ngưỡng đề xuất ở overview §1.4 vẫn PROPOSED — NEEDS_CONFIRMATION (chưa có Q).

## 5. Phạm vi hiện hành (CURRENT — thay cho overview §1.2)

Tổng cộng **46 FEATURE**: F-001…F-043 và F-045…F-047. **Không có F-044**: mã "F-024 Gọi lại đơn" của skill giai đoạn 4–8 được đổi thành F-045 vì F-024 đã dùng (ADR-006). Mọi FEATURE ở trạng thái triển khai READY_FOR_REVIEW (đã code + test tự động pass, chờ nhóm review theo DoD) — [chức-năng/README.md](../chức-năng/README.md).

**Ranh giới tổ chức (CONFIRMED):** một quán, một cơ sở, một kho nguyên liệu (overview §1.2; ADR-006 "vẫn một chi nhánh, một kho").

### 5.1. MVP — F-001…F-012 (ADR-000…ADR-004)

Luồng cốt lõi: Order QR → realtime quầy → hoàn tất & trừ kho → gọi thanh toán → thu tiền mặt tại bàn → in bill.

| FEATURE | Tên |
| --- | --- |
| [F-001](../chức-năng/FEATURE-001.md) | Quét QR, tách / gộp phiên |
| [F-002](../chức-năng/FEATURE-002.md) | Menu & giỏ |
| [F-003](../chức-năng/FEATURE-003.md) | Gửi đơn + kiểm kho (giữ kho khi gửi — ADR-001) |
| [F-004](../chức-năng/FEATURE-004.md) | Theo dõi đơn realtime |
| [F-005](../chức-năng/FEATURE-005.md) | Gọi thanh toán (D-2) |
| [F-006](../chức-năng/FEATURE-006.md) | Thu tiền mặt, in bill, đóng phiên |
| [F-007](../chức-năng/FEATURE-007.md) | Dashboard quầy: tiếp nhận, hoàn tất & trừ kho |
| [F-008](../chức-năng/FEATURE-008.md) | Bán mang đi (tiền mặt, D-3) |
| [F-009](../chức-năng/FEATURE-009.md) | Đăng nhập & tài khoản |
| [F-010](../chức-năng/FEATURE-010.md) | Menu / danh mục / bàn / QR |
| [F-011](../chức-năng/FEATURE-011.md) | Nguyên liệu / BOM / kho |
| [F-012](../chức-năng/FEATURE-012.md) | Báo cáo doanh thu + lịch sử đơn |

### 5.2. Giai đoạn 2 — F-013…F-023 ([ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md), 16/10/2026)

| FEATURE | Tên | FEATURE | Tên |
| --- | --- | --- | --- |
| [F-013](../chức-năng/FEATURE-013.md) | Tùy chọn món (size, topping) | [F-019](../chức-năng/FEATURE-019.md) | Hoàn tiền sau thu |
| [F-014](../chức-năng/FEATURE-014.md) | Hội viên SĐT + họ tên | [F-020](../chức-năng/FEATURE-020.md) | Tự hết món, tạm ngưng nhận đơn QR, giờ bán |
| [F-015](../chức-năng/FEATURE-015.md) | Combo cố định | [F-021](../chức-năng/FEATURE-021.md) | Gọi nhân viên |
| [F-016](../chức-năng/FEATURE-016.md) | Khuyến mãi | [F-022](../chức-năng/FEATURE-022.md) | Giảm giá tay trên bill |
| [F-017](../chức-năng/FEATURE-017.md) | Gợi ý / bán chạy / ghim | [F-023](../chức-năng/FEATURE-023.md) | Nhập kho & kiểm kê, giá vốn |
| [F-018](../chức-năng/FEATURE-018.md) | Chốt ca tiền mặt | | |

### 5.3. Yêu cầu chủ dự án 16/10/2026 — F-024

| FEATURE | Tên | Ghi chú |
| --- | --- | --- |
| [F-024](../chức-năng/FEATURE-024.md) | Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn | Nghiệp vụ PROPOSED — 5 mặc định chờ xác nhận ([Q-021](../open-questions.md)) |

### 5.4. Giai đoạn 4–8 — F-025…F-043, F-045 ([ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md), 17–18/10/2026)

| Giai đoạn | Nhóm | FEATURE |
| --- | --- | --- |
| 4 | Trải nghiệm gọi món & thanh toán | [F-045](../chức-năng/FEATURE-045.md) gọi lại đơn & món yêu thích · [F-040](../chức-năng/FEATURE-040.md) thực đơn theo lịch · [F-025](../chức-năng/FEATURE-025.md) thời gian chờ ước tính · [F-026](../chức-năng/FEATURE-026.md) chia bill theo người |
| 5 | Kho nâng cao | [F-031](../chức-năng/FEATURE-031.md) đơn vị & giá vốn bình quân / FIFO · [F-027](../chức-năng/FEATURE-027.md) bán thành phẩm / phiếu sơ chế · [F-032](../chức-năng/FEATURE-032.md) hao hụt & phiếu hủy · [F-028](../chức-năng/FEATURE-028.md) lô & hạn dùng (FEFO) · [F-030](../chức-năng/FEATURE-030.md) nhà cung cấp & PO · [F-029](../chức-năng/FEATURE-029.md) dự báo nhập hàng |
| 6 | Tài chính & nhân sự | [F-036](../chức-năng/FEATURE-036.md) vai Trưởng ca & ma trận quyền · [F-033](../chức-năng/FEATURE-033.md) sổ quỹ · [F-035](../chức-năng/FEATURE-035.md) chấm công, lịch làm, năng suất, nhật ký thao tác · [F-034](../chức-năng/FEATURE-034.md) lãi / lỗ & hòa vốn |
| 7 | Khách hàng thân thiết (CRM) | [F-039](../chức-năng/FEATURE-039.md) tích điểm đổi quà & tem · [F-038](../chức-năng/FEATURE-038.md) giới thiệu bạn & voucher · [F-037](../chức-năng/FEATURE-037.md) chiến dịch theo phân khúc |
| 8 | Phân tích | [F-041](../chức-năng/FEATURE-041.md) menu engineering · [F-042](../chức-năng/FEATURE-042.md) giờ cao điểm, dự báo doanh thu, so sánh kỳ, theo bàn · [F-043](../chức-năng/FEATURE-043.md) dashboard "Hôm nay" |

### 5.5. Yêu cầu chủ dự án 18/10/2026 — F-046, F-047

| FEATURE | Tên | Quyết định |
| --- | --- | --- |
| [F-046](../chức-năng/FEATURE-046.md) | Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn | [ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md) (D-33…D-35) |
| [F-047](../chức-năng/FEATURE-047.md) | Hội viên khi gọi món tại bàn, Thẻ thành viên cho khách, quyền lợi trên bill | [ADR-008](../quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md) (D-36…D-38) |

## 6. Ngoài phạm vi

| Hạng mục | Lý do / nguồn | Trạng thái |
| --- | --- | --- |
| Thanh toán chuyển khoản / VietQR / PayOS / SePay / MoMo, webhook | D-1 ([ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md)) — chỉ tiền mặt; "làm sau". Schema chừa chỗ (`Payments.Method` thêm `'TRANSFER'` khi làm) | CONFIRMED |
| Nhiều chi nhánh, nhiều kho | overview §1.2; ADR-006 "vẫn một chi nhánh, một kho" | CONFIRMED |
| Tính lương | overview §1.2 ("Không làm" — quản lý nhân sự, lương). F-035 chỉ có chấm công, lịch làm, năng suất; danh mục sổ quỹ "Lương tạm ứng" (F-033) chỉ là một khoản chi tiền mặt, không phải tính lương | CONFIRMED |
| Gửi SMS, đăng nhập / OTP cho khách | Kênh `SMS` trả `400 CHANNEL_NOT_SUPPORTED` (BR-062); không OTP (D-6, D-37 — quán chưa có SMS) | CONFIRMED |
| Thông báo đẩy | ADR-006 (skill mục 10: không gửi thông báo đẩy) | CONFIRMED |
| Bước 15 — triển khai thật / production, hosting online | [TASK-057](../công-việc/TASK-057.md) ("bước 15 ngoài phạm vi"); hosting chưa chọn ([Q-008](../open-questions.md)) | CONFIRMED (ngoài phạm vi) |
| Tính năng ADR-008 không chọn | Hộp tin "Ưu đãi dành cho bạn", pop-up khi gắn SĐT, link xem thẻ ở nhà | CONFIRMED |
| **Làm sau** (giữ từ overview §1.2 / ADR-003) | Cron chốt ca tự động (chốt ca vẫn thủ công — roles-permissions §4.2); dọn giỏ rác (REQ-020); lưu trữ & nén ảnh món (REQ-021); mở ngăn kéo tiền (Q-007); phiếu dán ly cho đơn tại bàn (Q-015); màn pha chế (KDS) riêng (Q-017); hoàn tất từng món (Q-006); lọc báo cáo "theo ca" (Q-014); giỏ chung realtime (Q-012, phương án 2); trả thiếu / ghi nợ (FEATURE-006) | CONFIRMED (làm sau) / trả thiếu: PROPOSED |

## 7. Ràng buộc công nghệ / bảo mật / dữ liệu

| Nhóm | Ràng buộc | Nguồn | Trạng thái |
| --- | --- | --- | --- |
| Công nghệ | Front-end HTML5 + CSS3 + JavaScript (ES modules) thuần, không framework, không bước build; Back-end Node.js + Express 5 (REST); SQL Server qua `mssql` gọi stored procedure + TVP; realtime Socket.io 4. Không tự thêm React / Vue / Next / jQuery / Bootstrap; biểu đồ SVG tự vẽ | D-4, [ADR-002](../quyết-định/ADR-002-stack-html-node-sqlserver.md) | CONFIRMED |
| Công nghệ | Một tiến trình Node (API + giao diện tĩnh + Socket.io + bộ lập lịch job) và một SQL Server; chạy được trong LAN của quán | ADR-002, ADR-006 | CONFIRMED |
| Công nghệ | Giờ nghiệp vụ theo giờ quán UTC+7; khách dùng điện thoại (≥ 360 px), quầy tablet / laptop (≥ 1024 px); in qua trình duyệt khổ 58/80 mm | BR-034, [screens-flows](../giao-diện/screens-flows.md) | CONFIRMED |
| Thanh toán | Chỉ tiền mặt; khách không có API nào đổi trạng thái thanh toán; thu tiền và hoàn tiền phải gắn ca đang mở | D-1, BR-007, BR-026 | CONFIRMED |
| Bảo mật | Kiểm quyền ở **server** cho mọi endpoint (chưa đăng nhập → 401, không đủ quyền → 403), giao diện chỉ ẩn / hiện; một tài khoản một vai | BR-044, roles-permissions §4.3 | CONFIRMED (một vai: PROPOSED) |
| Bảo mật | Mật khẩu lưu dạng hash; khóa tài khoản → token cũ bị từ chối ở request kế tiếp; token 8 giờ | AC-009-04, BR-017; JWT 8 h | CONFIRMED / JWT 8 h: PROPOSED |
| Bảo mật | Thao tác vượt quyền (giảm tay vượt ngưỡng, hoàn tiền, duyệt chi, sửa / xóa món đã tiếp nhận) duyệt bằng tài khoản trưởng ca / quản lý nhập lại; không lưu mật khẩu người duyệt | BR-045, BR-046, BR-049, BR-067 | CONFIRMED |
| Bảo mật | Nhật ký thao tác chỉ đọc, giữ 12 tháng; bỏ password / hash / token / secret / otp, SĐT chỉ còn 3 số cuối | BR-055 | CONFIRMED |
| Dữ liệu cá nhân | Hội viên = SĐT + họ tên, **chỉ lưu khi khách đồng ý** (`ConsentAt`; thiếu → `400 CONSENT_REQUIRED`), có mục đích; khách chỉ thấy tên che; danh sách quản lý che số; "Ẩn danh theo yêu cầu"; SĐT / tên không ghi ra log | D-6, D-16, BR-024, F-014 | CONFIRMED |
| Dữ liệu cá nhân | Thẻ thành viên chỉ xem khi phiên còn mở và thiết bị thuộc phiên, tên / SĐT che, không có mã voucher; CSV chiến dịch chứa SĐT đầy đủ và mỗi lần tải ghi nhật ký; tôn trọng opt-out | BR-072, BR-062 | CONFIRMED |
| Dữ liệu cá nhân | Ghi chú bàn chỉ nhân viên thấy; ảnh hóa đơn sổ quỹ xem cần đăng nhập | BR-032, BR-051 | CONFIRMED (ghi chú bàn: PROPOSED — Q-021) |
| Dữ liệu cá nhân | Rà soát yêu cầu pháp luật về dữ liệu cá nhân trước khi chạy thật (sổ tay mục G) | Sổ tay mục G | NEEDS_CONFIRMATION (chưa có Q) |

## 8. Giả định

| # | Giả định | Nguồn | Trạng thái |
| --- | --- | --- | --- |
| GĐ-1 | Khách dùng trình duyệt điện thoại, không cài app; quán có Wi-Fi để đo và dùng NFR-001 | overview §1.1, §1.4 | CONFIRMED (Wi-Fi quán: suy từ cách đo NFR-001) |
| GĐ-2 | Thu ngân và pha chế dùng chung một dashboard quầy | Q-017 (ADR-003) | CONFIRMED |
| GĐ-3 | Nhiều nhân viên có thể dùng chung một tài khoản trên nhiều máy; hệ thống phải an toàn trong trường hợp đó (không khuyến khích) | roles-permissions §4.3 | CONFIRMED |
| GĐ-4 | ADMIN có mọi quyền của STAFF và MANAGER (thứ bậc STAFF < MANAGER < ADMIN), trừ tự chấm công | roles-permissions §4.1, §4.5; BR-052 | CONFIRMED (thứ bậc) / ADMIN kế thừa STAFF: PROPOSED |
| GĐ-5 | Máy quầy có máy in nhiệt in được từ trình duyệt, khổ 58 hoặc 80 mm | overview §1.2, roles-permissions §4.2 | CONFIRMED (in máy thật: NOT_RUN) |
| GĐ-6 | Hệ thống chạy local / LAN trong quán cho tới khi chốt hosting | Q-008 | PROPOSED |
| GĐ-7 | Zalo OA chỉ bật khi quán có `ZALO_OA_TOKEN`; mặc định chiến dịch dùng xuất danh sách CSV | D-29, roles-permissions §4.2 | CONFIRMED |
| GĐ-8 | Các phương án đã áp cho Q-019, Q-020, Q-021, Q-022 giữ nguyên cho tới khi nhóm đổi bằng ADR mới | open-questions.md | PROPOSED |

## 9. Rủi ro và cách giảm thiểu

| # | Rủi ro | Ảnh hưởng | Giảm thiểu (đã có trong hệ thống / hồ sơ) | Trạng thái |
| --- | --- | --- | --- | --- |
| R-1 | Nhiều bàn tranh nguyên liệu cùng lúc làm âm kho hoặc trừ kho hai lần | Sai tồn kho, không đạt NFR-002 | Giữ kho khi gửi trong stored procedure có transaction + khóa dòng, trừ thật khi hoàn tất đúng một lần (ADR-001, BR-001, BR-002, BR-010); ép tải `npm run load` | Đã giảm thiểu — MT-2 PASS |
| R-2 | Khách gửi đơn đúng lúc quầy thu tiền → đơn rơi vào phiên đã đóng, lệch doanh thu | Doanh thu thiếu, kho bị giữ | `sp_SubmitOrder` khóa dòng `Sessions` và từ chối phiên `CLOSED` (Q-013, ADR-003); test "submit ⇄ settle" | Đã giảm thiểu |
| R-3 | Phạm vi tăng từ 12 lên 46 FEATURE trong khung 8 tuần | Thiếu thời gian review / kiểm thử thực địa | Mỗi lần mở rộng có ADR + task + test tự động; brief này chốt lại phạm vi để duyệt ở G1 | Chờ G1 |
| R-4 | Các mặc định agent đã áp chưa được nhóm xác nhận | Hành vi khác mong muốn của quán | Áp phương án chặt hơn, ghi Q-019…Q-022; mỗi thay đổi chỉ cần sửa một chỗ + test (open-questions.md) | Chờ xác nhận |
| R-5 | Lộ dữ liệu cá nhân hội viên (SĐT, tên) | Vi phạm quyền riêng tư | Đồng ý khi đăng ký, che tên / số, ẩn danh theo yêu cầu, nhật ký che SĐT, CSV chỉ cho quản lý và có nhật ký tải (BR-024, BR-055, BR-062, BR-072); rà soát pháp lý: chưa làm | Một phần — NEEDS_CONFIRMATION (chưa có Q) |
| R-6 | Phần cứng / môi trường thật chưa kiểm: máy in nhiệt, Wi-Fi quán, điện thoại thật, Zalo OA thật, dữ liệu nhiều tháng | Lỗi chỉ lộ ra khi chạy ở quán | Đã kiểm bằng giả lập (Chromium 390 px, kênh Zalo giả, chạy job thủ công); đưa vào UAT bước 14 | NOT_RUN (handover-2026-10-18) |
| R-7 | Hosting online chưa chọn | Không có bản online để bảo vệ đồ án | Chạy được LAN vì không còn webhook (D-1); bước 15 ngoài phạm vi | Mở — Q-008 |
| R-8 | E2E chia bill chập chờn do sheet chia bill mất chữ đang gõ | Kết quả test không ổn định (tiền không sai) | Ghi Q-023; sửa ở task riêng (TASK-058 theo TASK-057) | Mở — Q-023 |
| R-9 | Mất kết nối realtime ở quầy / khách | Bỏ sót đơn hoặc yêu cầu thanh toán | Client tải lại ảnh chụp khi kết nối lại, banner "Có đơn hàng bị trễ" (F-004, F-007, AC-007-05) | Đã giảm thiểu |

## 10. Chưa quyết định

| Q | Chủ đề | Đang áp dụng | Trạng thái |
| --- | --- | --- | --- |
| [Q-000](../open-questions.md) | Ai ký chốt nghiệp vụ / kỹ thuật | Đề xuất: nghiệp vụ cả nhóm; BE/DB Nhật Anh; FE Tuyến; test Sáng | MỞ |
| [Q-008](../open-questions.md) | Hosting online | Chạy local / LAN | MỞ |
| [Q-019](../open-questions.md) | Cách hiểu ngưỡng giảm tay "10 % hoặc 20.000đ" | Không vượt **cả hai** ngưỡng (phương án chặt) | Đã áp, chờ nhóm xác nhận |
| [Q-020](../open-questions.md) | Thời hạn hoàn tiền | Cùng ngày thu tiền (giờ VN) | Đã áp, chờ nhóm xác nhận |
| [Q-021](../open-questions.md) | 5 mặc định của Gọi món tại bàn (F-024) | Đơn vào thẳng Đang pha; không bị chặn bởi công tắc QR / giờ bán; ghi chú theo phiên, khách không thấy; bàn có nhóm phải chọn "Nhóm mới" | PROPOSED, chờ chủ quán xác nhận |
| [Q-022](../open-questions.md) | Lệch ma trận D-24 và các cách hiểu giai đoạn 4–8 | STAFF vẫn mở / đóng ca và ghi sổ quỹ; "lần đầu" của giới thiệu hiểu chặt; số dư điểm cũ không quy đổi; hoàn tiền không trả voucher | Đã áp, chờ nhóm xác nhận |
| [Q-023](../open-questions.md) | Sheet chia bill mất chữ đang gõ | Chưa sửa | Chờ đồng ý mở task riêng |
| — | Ngưỡng số của NFR-004 | Đề xuất < 3 s trên 4G, bundle < 300 KB gzip (overview §1.4) | NEEDS_CONFIRMATION (chưa có Q) |
| — | Người đại diện từng Actor cho UAT (bước 14) | Chưa chỉ định — xem [actors.md](../nghiệp-vụ/actors.md) | NEEDS_CONFIRMATION (chưa có Q) |

## 11. Người duyệt + trạng thái + ngày duyệt

Hồ sơ Gate G1 đầy đủ (Actor, AF, Story, AC/BR, Use Case, ngoại lệ, Open Questions): [nghiệp-vụ/use-cases.md](../nghiệp-vụ/use-cases.md) mục "Gate G1 — Nghiệp vụ".

| Vai trò | Người | Phạm vi duyệt / rà soát | Trạng thái | Ngày duyệt |
| --- | --- | --- | --- | --- |
| Người duyệt Gate G1 | Chủ dự án (tên người ký: Q-000) | Toàn bộ brief: bài toán, mục tiêu MT-1…MT-5, phạm vi CURRENT, ngoài phạm vi, ràng buộc, rủi ro | **Chờ chủ dự án duyệt** | — |
| Rà soát nghiệp vụ (đề xuất theo Q-000: cả nhóm) | Tuyến, Nhật Anh, Sáng | Câu mô tả vấn đề, nhóm người dùng, phạm vi | Chưa rà soát | — |
| Rà soát Back-end / Database (đề xuất theo Q-000) | Nhật Anh | Ràng buộc công nghệ, bảo mật, dữ liệu | Chưa rà soát | — |
| Rà soát Front-end (đề xuất theo Q-000) | Tuyến | Thiết bị, màn hình, in bill | Chưa rà soát | — |
| Rà soát kiểm thử / DoD (đề xuất theo Q-000) | Sáng | Chỉ số MT-1…MT-5 và bằng chứng | Chưa rà soát | — |
