# Câu hỏi chưa chốt (Open Questions)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §3 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

Các câu hỏi dưới đây **chặn** phần triển khai được ghi trong cột "Chặn". Nhóm nên chốt Q-001 → Q-006 ngay tuần 1. Agent gặp câu hỏi mới phải thêm vào `tài-liệu/open-questions.md` theo cùng mẫu, **không tự chọn ngầm** một cách hiểu.

## Tóm tắt trạng thái (cập nhật 14/10/2026)

Ngày 14/10/2026 chủ dự án chốt stack (D-4 → ADR-002) và yêu cầu triển khai hoàn chỉnh. Các câu hỏi còn lại được áp dụng **phương án đề xuất** ghi ngay trong từng mục (ADR-001, ADR-003). Nhóm vẫn có thể đổi từng mục bằng ADR mới.

| Q | Chủ đề | Trạng thái | Quyết định áp dụng |
| --- | --- | --- | --- |
| Q-000 | Ai chốt nghiệp vụ/kỹ thuật | **MỞ** | — (đề xuất: nghiệp vụ cả nhóm; BE/DB Nhật Anh; FE Tuyến; test Sáng) |
| Q-001 | Giữ kho khi gửi / trừ khi hoàn tất | ĐÃ CHỐT — [ADR-001](quyết-định/ADR-001-giu-kho-khi-gui-don.md) | Phương án A + chụp lượng giữ theo đơn |
| Q-002 | Node.js hay C# | ĐÃ CHỐT — [ADR-002](quyết-định/ADR-002-stack-html-node-sqlserver.md) (D-4) | Node.js + Express, FE HTML/CSS/JS thuần |
| Q-003 | Cổng thanh toán | ĐÃ CHỐT — [ADR-000](quyết-định/ADR-000-thanh-toan-tien-mat.md) | Chỉ tiền mặt |
| Q-004 | Trả trước hay trả sau | ĐÃ CHỐT — ADR-000 | Trả sau |
| Q-004b | Có nút Tiếp nhận không | ĐÃ CHỐT — [ADR-003](quyết-định/ADR-003-cac-de-xuat-con-lai.md) | Có (+ "Tiếp nhận & Hoàn tất") |
| Q-005 | Hết nguyên liệu khi gửi | ĐÃ CHỐT — ADR-003 | Từ chối cả đơn, client bỏ món |
| Q-006 | Hoàn tất theo đơn/món | ĐÃ CHỐT — ADR-003 | Theo đơn |
| Q-007 | Mở ngăn kéo tiền | ĐÃ CHỐT — ADR-003 | Làm sau |
| Q-008 | Hosting online | **ĐÃ CHỐT — [ADR-016](quyết-định/ADR-016-trien-khai-van-hanh.md)** (23/10/2026) | Máy tại quán (LAN) là chính, VPS dự phòng |
| Q-009 | Phiên đóng khi nào | ĐÃ CHỐT — ADR-000 | Khi nhân viên bấm "Đã thu tiền" |
| Q-010 | Hủy đơn | ĐÃ CHỐT — ADR-003 | Chỉ quầy hủy đơn `PENDING`, có lý do |
| Q-011 | Nhập/điều chỉnh kho | ĐÃ CHỐT — ADR-003 | Điều chỉnh tay `ADJUST` có lý do |
| Q-012 | Giỏ hàng chung khi Gộp | ĐÃ CHỐT — ADR-003 | Chia sẻ đơn đã gửi + tổng tạm tính |
| Q-013 | Gửi đơn đồng thời với thu tiền | ĐÃ CHỐT — ADR-003 | Khóa `Sessions` trong SP; cho gọi thêm (phiên về OPEN) |
| Q-014 | Lịch sử đơn, "theo ca" | ĐÃ CHỐT — ADR-003 | Tab Lịch sử đơn; "theo ca" làm sau |
| Q-015 | Phiếu dán ly dine-in | ĐÃ CHỐT — ADR-003 | Làm sau |
| Q-016 | NFR-003 "dưới 3" hay "≤ 3" | ĐÃ CHỐT — ADR-003 | ≤ 3 chạm từ menu (đã kiểm bằng E2E) |
| Q-017 | KDS riêng | ĐÃ CHỐT — ADR-003 | Một dashboard; KDS làm sau |
| Q-018 | Phiên chỉ có đơn hủy | ĐÃ CHỐT — ADR-003 | Cho "Đóng bàn trống" |
| Q-019 | Ngưỡng giảm giá tay của nhân viên | ĐÃ ÁP — ADR-005, **chờ chủ dự án xác nhận ở G1** | ≤ 10 % bill **và** ≤ 20.000đ, vượt → cần duyệt |
| Q-020 | Hoàn tiền trong bao lâu | ĐÃ ÁP — ADR-005, **chờ xác nhận ở G1** | Trong ngày thu tiền (giờ Việt Nam) |
| Q-021 | Mặc định Gọi món tại bàn (F-024) | ĐÃ ÁP PHƯƠNG ÁN ĐỀ XUẤT, **chờ xác nhận ở G1** | Xem mục Q-021 |
| Q-022 | Lệch ma trận D-24 và cách hiểu giai đoạn 4–8 | ĐÃ ÁP PHƯƠNG ÁN, **chờ xác nhận ở G1** | Xem mục Q-022 |
| Q-023 | Sheet chia bill mất chữ ở ô "Tên phần" | **ĐÃ ĐÓNG** (20/10/2026) — [TASK-058](công-việc/TASK-058.md) | Sửa + test hồi quy E2E |

> **Cập nhật 20/10/2026 (TASK-057):** bảng tóm tắt trước đây chỉ tới Q-018 — đã thêm Q-019…Q-023. Còn **MỞ**: Q-000 (người chốt — trả lời bằng chữ ký Gate), Q-008 (hosting — thuộc bước 15, ngoài phạm vi). Q-019…Q-022 đã chạy theo phương án đề xuất, cần chủ dự án xác nhận khi duyệt [Gate G1](chất-lượng/quality-gates.md).

## Q-000 — Ai là người chốt nghiệp vụ và kỹ thuật?

- **Điều đã biết:** Nhóm 3 người, phân vai FE/BE/Test.
- **Điều chưa biết:** Khi Word mâu thuẫn, ai quyết? Khi stack chưa chốt, ai quyết?
- **Đề xuất:** Nghiệp vụ → cả nhóm biểu quyết, ghi vào `tài-liệu/quyết-định/`; kỹ thuật backend/DB → Nhật Anh; FE → Tuyến; test/DoD → Sáng.
- **Chặn:** Không chặn code, nhưng chặn việc đổi trạng thái PROPOSED → CONFIRMED.

## Q-001 — Kho được **giữ** lúc gửi đơn hay chỉ **trừ** lúc hoàn tất? (quan trọng nhất)

- **Nguồn:** User flow bước 5–6 ("Database gọi Transaction kiểm tra nguyên liệu… Lưu đơn hàng, **khóa nguyên liệu**"); US2 AC2 ("món vừa hết nguyên liệu" lúc gửi đơn); US10 ("hệ thống tự động **từ chối đơn đặt món** nếu kho không đủ"). Ngược lại: US6, Actor 1.2, Module 3.2/4.2 ("bấm Hoàn tất… kích hoạt Stored Procedure **trừ** kho").
- **Điều chưa biết:** Giữa lúc gửi đơn và lúc hoàn tất, nguyên liệu có được "giữ chỗ" cho đơn đó không?
- **Ba phương án:**

| Phương án | Cách hoạt động | Ưu | Nhược |
| --- | --- | --- | --- |
| **A. Giữ khi gửi, trừ khi hoàn tất** (2 pha) | Gửi đơn: SP kiểm `StockQty − ReservedQty ≥ cần` rồi tăng `ReservedQty`. Hoàn tất: SP giảm cả `ReservedQty` và `StockQty`. Hủy đơn: trả `ReservedQty` | Khớp **cả hai** đoạn Word; khách bị từ chối ngay lúc gửi (không chờ xong mới biết hết); kho không âm | Thêm cột `ReservedQty`, thêm logic hủy/hết hạn đơn; 2 SP |
| **B. Chỉ kiểm khi gửi, trừ khi hoàn tất** | Gửi đơn: kiểm tồn kho tức thời (không giữ). Hoàn tất: SP trừ; nếu thiếu → rollback | Đơn giản | Hai đơn cùng qua kiểm tra → một đơn **thất bại lúc hoàn tất** sau khi khách đã chờ và có thể đã trả tiền; không đáp ứng US10 ("từ chối đơn đặt món") |
| **C. Trừ ngay khi gửi** | Gửi đơn: SP trừ kho luôn. Hoàn tất: chỉ đổi trạng thái | Đơn giản nhất, một SP | Trái với US6/Module 4.2 (trừ khi hoàn tất); đơn không thanh toán/hủy phải cộng lại kho |

- **Đề xuất (PROPOSED):** Phương án **A**. Nếu nhóm chọn A, thiết kế ở `kiến-trúc/tech-stack.md` và `kiến-trúc/data-model.md` áp dụng nguyên văn; nếu chọn B/C, bỏ cột `ReservedQty` và sửa `sp_SubmitOrder`.
- **Chặn:** FEATURE-003 (gửi đơn), FEATURE-007 (hoàn tất), data model `Ingredients`, SP, test ép tải NFR-002.

## Q-002 — Backend dùng Node.js hay C#? — **ĐÃ CHỐT (D-4): Node.js**

- **Quyết định 14/10/2026:** Backend Node.js, REST API, SQL Server; frontend HTML/CSS/JS thuần; realtime Socket.io.
- **Còn PROPOSED:** framework HTTP — tài liệu này đề xuất **Express** (đơn giản, hợp với FE thuần và nhóm sinh viên); NestJS nếu nhóm muốn DI/guard sẵn. Driver SQL Server: gói `mssql` (gọi SP, TVP). Chi tiết ở mục 10.
- **Chặn:** không còn.

## Q-003 — Cổng thanh toán: PayOS hay SePay? MoMo có trong phạm vi không? — **ĐÃ CHỐT (D-1)**

- **Quyết định 13/10/2026:** Không tích hợp cổng thanh toán nào trong MVP; chỉ thu tiền mặt. VietQR/MoMo xếp "làm sau".
- **Hệ quả:** Bỏ FEATURE thanh toán online và webhook; không cần sandbox, API key, URL webhook công khai. Khi làm sau chỉ cần thêm giá trị `TRANSFER` cho `PaymentMethod` và một module `payments/gateway`.

## Q-004 — Đơn vào hàng pha chế **ngay khi gửi** hay **sau khi thanh toán**? — **ĐÃ CHỐT (D-2): trả sau**

- **Quyết định 13/10/2026:** Khách gọi món → quầy làm ngay → khách dùng xong bấm "Gọi thanh toán" → nhân viên ra bàn thu tiền mặt. Không có bước thanh toán trước khi pha.
- **Còn một chi tiết nhỏ cần chốt (Q-004b, PROPOSED):** Đơn mới có cần quầy bấm **"Tiếp nhận"** (Chờ xác nhận → Đang chuẩn bị) hay tự chuyển sang Đang chuẩn bị ngay khi gửi? Word có trạng thái "Chờ xác nhận" nên tài liệu này **đề xuất có nút Tiếp nhận** — giúp quầy từ chối/hủy đơn lạ trước khi pha và khách biết quầy đã thấy đơn. Nếu nhóm muốn ít thao tác hơn: bỏ nút, đơn vào `PREPARING` ngay; máy trạng thái bỏ `PENDING`.
- **Chặn:** Chỉ Q-004b chặn nhãn/nút trên dashboard; không chặn gì khác.

## Q-005 — Hết nguyên liệu lúc gửi đơn: từ chối **cả đơn** hay **chỉ loại món đó**?

- **Nguồn:** US2 AC2: "từ chối lưu đơn, báo lỗi 'Trà đào vừa hết'… tự cập nhật hết hàng trên menu"; sơ đồ Mermaid: "Báo lỗi & **Xóa món khỏi giỏ**" rồi quay lại menu.
- **Đề xuất:** Từ chối cả đơn (không lưu gì), trả về danh sách món thiếu; **client** tự bỏ món đó khỏi giỏ và hiện thông báo. Kết quả nhìn từ khách giống sơ đồ, nhưng server đơn giản và không tạo đơn "một nửa".
- **Chặn:** FEATURE-003 AC-03. *(Ghi chú khi tách docs: AC về hết nguyên liệu là **AC-003-02**; còn AC-003-03 là AC về giá giả.)*

## Q-006 — Hoàn tất theo **đơn** hay theo **từng món**?

- **Nguồn:** US6/US5: "bấm Hoàn tất món" trên **đơn hàng** của Bàn 05; Module 3.2 input là "OrderID, **ItemID**".
- **Đề xuất (PROPOSED):** Bản đầu hoàn tất theo **đơn** (một nút, một SP, một lần trừ kho) — đơn giản và khớp AC về chống trừ kho 2 lần. Hoàn tất từng món xếp "làm sau".
- **Chặn:** FEATURE-007, bảng `OrderItems.Status`.

## Q-007 — Mở ngăn kéo tiền có trong MVP không?

- **Nguồn:** III.1 ghi "kết nối mở ngăn kéo đựng tiền".
- **Thực tế kỹ thuật:** `window.print()` **không** gửi được lệnh ESC/POS mở ngăn kéo. Cần một trong: máy in nhiệt có cấu hình "kick drawer khi in" ở driver; hoặc app cầu nối chạy trên máy POS (ví dụ QZ Tray) nhận lệnh từ web. Cả hai đều ngoài "in từ trình duyệt" thuần.
- **Đề xuất:** Xếp **làm sau**; bản đầu chỉ in bill. Nếu máy in của quán thử nghiệm hỗ trợ kick-drawer ở driver thì ghi vào `vận-hành/`.
- **Chặn:** Không chặn gì nếu chọn "làm sau".

## Q-008 — Hosting cụ thể? — **ĐÃ CHỐT (ADR-016 D-61, 23/10/2026): máy tại quán (LAN) là chính, VPS dự phòng**

- **Điều chưa biết:** Tiến trình Node (API + FE tĩnh, D-4) deploy đâu, SQL Server chạy đâu (Azure SQL free tier / VPS Docker / máy trong quán?). Vì không còn webhook (D-1), hệ thống **có thể chạy hoàn toàn trong mạng LAN của quán** (một máy tính chạy API + SQL Server, điện thoại khách truy cập qua Wi-Fi quán) — đơn giản và không phụ thuộc Internet; nhưng Word yêu cầu "deploy chạy online" nên vẫn cần một bản trên Internet để bảo vệ đồ án.
- **Chặn:** TASK-018 (deploy staging). Không còn chặn gì về webhook.
- **Quyết định 23/10/2026 (chủ dự án, khi giao bước 15):** "Cả hai: LAN chính, VPS dự phòng" → [ADR-016](quyết-định/ADR-016-trien-khai-van-hanh.md) D-61…D-63; triển khai theo [deployment-checklist.md](vận-hành/deployment-checklist.md) ([TASK-070](công-việc/TASK-070.md)).

## Q-009 — Phiên (Session) đóng khi nào? — **ĐÃ CHỐT (D-2)**

- **Quyết định:** Phiên có nhiều đơn (khách gọi thêm nhiều lần). Phiên đóng **khi nhân viên bấm "Đã thu tiền"** cho phiên đó (sau khi khách Gọi thanh toán hoặc nhân viên chủ động thu). Phiên A và B trên cùng bàn thu tiền và đóng độc lập (US1 tách bill).
- **Chi tiết còn PROPOSED:** quầy cũng có thể thu tiền một phiên **chưa** bấm Gọi thanh toán (khách ra quầy trả trực tiếp); thu tiền yêu cầu phiên không còn đơn `PENDING` chưa tiếp nhận (phải tiếp nhận hoặc hủy trước).

## Q-010 — Hủy đơn

- **Điều chưa biết:** Khách có được hủy đơn sau khi gửi không? Quầy có được hủy không? Đơn chưa thanh toán sau X phút có tự hủy không (liên quan REQ-019 và dọn "giỏ hàng rác")?
- **Đề xuất (PROPOSED):** Bản đầu: chỉ **quầy** hủy được đơn `PENDING` (chưa pha); hủy trả lại `ReservedQty` nếu dùng phương án A; khách không tự hủy. Tự hủy theo thời gian xếp "làm sau" cùng cron job.
- **Chặn:** Trạng thái `CANCELLED` trong máy trạng thái; nút hủy trên dashboard.

## Q-011 — Số liệu kho ban đầu nhập ở đâu? Có nhập kho (import) không?

- **Điều chưa biết:** Word chỉ nói "kiểm tra tồn kho" và trừ kho. Không nói nhập kho/điều chỉnh.
- **Đề xuất:** Bản đầu có màn hình admin **điều chỉnh tồn kho thủ công** (nhập số mới + lý do) ghi `InventoryTransactions` loại `ADJUST`. Phiếu nhập kho đầy đủ xếp "làm sau".
- **Chặn:** FEATURE-011 (kho).

---

# Câu hỏi mới phát hiện khi đối chiếu demo.docx (prompt 19.1, 13/10/2026)

Các câu hỏi Q-012 → Q-018 phát hiện khi đọc lại toàn bộ `tài-liệu/nguồn/demo-docx.txt` và đối chiếu với tài liệu nguồn. Agent **không** tự chọn phương án; phần "Đề xuất" chỉ là PROPOSED.

## Q-012 — "Giỏ hàng chung" khi Gộp phiên: chia sẻ giỏ chưa gửi hay chỉ chia sẻ đơn đã gửi?

- **Nguồn:** US1 bản 1, phần Then ("Khách B được đưa vào Session A và **xem chung giỏ hàng**"); US1 bản 2 AC1 ("hiển thị **giỏ hàng chung**"); User flow bước 3 ("Load lại giỏ hàng cũ của nhóm"). Ngược lại, US2 bản 1 phần Then ghi "giỏ hàng hiển thị danh sách món **đã đặt**". Tài liệu nguồn chọn giỏ lưu **phía client**, server không lưu giỏ chưa gửi (FEATURE-002), và AC-001-02 chỉ kiểm việc B thấy các đơn A đã đặt.
- **Điều chưa biết:** Khi B gộp vào phiên A, B có thấy (và sửa được) các món A **đang chọn nhưng chưa gửi** không?
- **Phương án:** (1) Mỗi điện thoại giữ giỏ riêng; chỉ chia sẻ các đơn đã gửi và tổng tạm tính của phiên. Đây là thiết kế hiện tại. (2) Giỏ chung realtime: lưu giỏ trên server (ví dụ bảng `SessionCartItems`), phát sự kiện `cart.updated` tới `session:{id}`, xử lý hai người sửa cùng lúc và dọn giỏ rác (REQ-020).
- **Đề xuất (PROPOSED):** Phương án (1). Nó khớp với US2 bản 1, còn (2) phải thêm data model, realtime và xử lý xung đột.
- **Chặn:** FEATURE-001 AC-001-02 (thế nào là "thấy chung"), FEATURE-002 (giỏ lưu ở đâu), data model nếu chọn (2).

## Q-013 — Gửi đơn đồng thời với thu tiền phiên; gọi thêm món sau khi đã gọi thanh toán

- **Nguồn:** BR-020 (phiên `CLOSED` không nhận thêm đơn); điều kiện trước của FEATURE-003; FEATURE-005 (gọi thêm sau khi gọi thanh toán thì phiên về `OPEN`, PROPOSED); `sp_SubmitOrder` và `sp_SettleSession` trong `kiến-trúc/data-model.md`.
- **Điều đã biết:** `sp_SubmitOrder` (dine-in) **không** đọc hay khóa `Sessions`. Việc kiểm tra "phiên chưa `CLOSED`" nằm ở service, **ngoài** transaction. Còn `sp_SettleSession` cập nhật (khóa) dòng `Sessions` trước rồi mới đóng phiên.
- **Rủi ro:** Có thể xảy ra trình tự sau: service đọc thấy phiên `OPEN` → `sp_SettleSession` commit (phiên `CLOSED`, các đơn `PAID`) → `sp_SubmitOrder` vẫn chèn được đơn mới `PENDING/UNPAID` vào phiên đã đóng. Hậu quả là đơn này không bao giờ được thu tiền (lệch doanh thu, trái mục tiêu "không lệch doanh thu" của Word) trong khi kho vẫn bị giữ hoặc trừ. Ngoài ra, chưa có SP nào thực hiện việc chuyển `PAYMENT_REQUESTED → OPEN` khi khách gọi thêm món.
- **Đề xuất kỹ thuật (PROPOSED):** Thêm bước đầu tiên cho `sp_SubmitOrder` với `DINE_IN`: `UPDATE Sessions SET Status = 'OPEN' WHERE SessionId = @SessionId AND Status IN ('OPEN','PAYMENT_REQUESTED')`; nếu `@@ROWCOUNT = 0` thì `THROW 50031, 'SESSION_CLOSED'`. Khi đó cả hai SP đều khóa dòng `Sessions` trước tiên nên chạy tuần tự, và vì cùng thứ tự khóa (Sessions → bảng khác) nên không tạo deadlock mới. Nếu nhóm chọn **chặn** gọi thêm khi đã gọi thanh toán thì đổi điều kiện thành `Status = 'OPEN'` và dùng mã lỗi riêng. Khi phiên chuyển từ `PAYMENT_REQUESTED` về `OPEN`, phát `session.payment_cancelled` sau commit.
- **Cần nhóm chốt:** (a) có cho gọi thêm sau khi đã gọi thanh toán không (xem Phụ lục cuối file); (b) có đồng ý đưa bước kiểm tra phiên vào SP không.
- **Chặn:** TASK-004 (`sp_SubmitOrder`), TASK-010, TASK-015. Bộ test đồng thời nên có thêm kịch bản "submit ⇄ settle".

## Q-014 — Lịch sử đơn hàng và báo cáo "theo ca"

- **Nguồn:** Actor 1.3 ("Xem báo cáo doanh thu và **lịch sử đơn hàng**"); US11 bản 1 ("biểu đồ doanh thu và lịch sử đơn hàng **theo ca/ngày**"). Tài liệu nguồn đã có API `GET /api/admin/orders` và `GET /api/admin/payments` nhưng **chưa có** feature, AC hay màn hình cho lịch sử đơn. Khái niệm "ca" cũng chưa được mô hình hóa (chốt ca là cron job, xếp làm sau ở REQ-020).
- **Đề xuất (PROPOSED):** MVP có tab "Lịch sử đơn" trong S-25: lọc theo ngày và trạng thái, xem chi tiết, in lại bill. Bảng thu tiền theo nhân viên đã có sẵn trong S-25. Lọc "theo ca" làm sau, cùng với cron chốt ca. Nếu nhóm đồng ý thì thêm AC vào FEATURE-012 (ví dụ AC-012-05) và cập nhật S-25.
- **Chặn:** FEATURE-012 / TASK-017 (phạm vi UI).

## Q-015 — Có in phiếu/tem cho từng đơn để "dán lên ly" không?

- **Nguồn:** US7 bản 1 ("in hóa đơn… để giao cho khách hàng lưu đối soát và **dán lên ly đồ uống**"). Theo ADR-000 (D-2), bill dine-in chỉ in khi thu tiền phiên; đơn mang đi in bill ngay lúc tạo nên dán lên ly được.
- **Điều chưa biết:** Đơn dine-in có cần in phiếu pha chế hoặc tem ly (không phải hóa đơn) lúc tiếp nhận hay hoàn tất không?
- **Đề xuất (PROPOSED):** Không làm trong MVP. Nếu cần thì thêm nút "In phiếu món" trên S-11, dùng lại trang in S-12 khổ 58 mm và không in giá. Xếp làm sau.
- **Chặn:** Không chặn gì nếu chọn làm sau.

## Q-016 — NFR-003: "dưới 3 thao tác" hay "≤ 3 thao tác"? Một thao tác tính thế nào?

- **Nguồn:** demo.docx mục 3 và III.1 ghi order trong "**dưới 3** thao tác vuốt chạm". NFR-003 trong tài liệu nguồn ghi "**≤ 3** thao tác" và tự lưu ý "cần định nghĩa 'thao tác'".
- **Ví dụ:** Sau khi menu hiện ra, luồng chuẩn là (1) chạm "+" một món → (2) mở giỏ → (3) Gửi đơn, tức 3 chạm. Luồng này đạt "≤ 3" nhưng **không** đạt "dưới 3". Cũng chưa rõ hộp thoại Gộp/Cá nhân có được tính là một thao tác không.
- **Đề xuất (PROPOSED):** Ghi NFR-003 = "≤ 3 chạm, tính từ lúc menu hiện ra đến khi gửi xong đơn 1 món; không tính hộp thoại Gộp/Cá nhân". Nếu nhóm muốn giữ đúng chữ "dưới 3" thì cần nút "Gửi ngay" trên thanh giỏ nổi (S-02) để bỏ qua bước mở giỏ.
- **Chặn:** Nghiệm thu NFR-003; thiết kế S-02/S-03 (TASK-009).

## Q-017 — Có cần màn hình pha chế (KDS) riêng không?

- **Nguồn:** demo.docx mục I.1, mục 1 và III.1 có nhắc "màn hình… cho **Bếp**" và "Thu ngân và **Bếp (KDS)**"; US8 bản 1 nhắc "luồng **màn hình chờ pha chế**". Nhưng Actor 1.2 lại gộp Thu ngân và Pha chế thành một vai trò. Tài liệu nguồn (REQ-003) hiểu đây là **một** dashboard quầy (S-10) có cột "Đang pha".
- **Đề xuất (PROPOSED):** MVP dùng một dashboard. Nếu quán có màn hình riêng cho người pha chế thì làm thêm route chỉ đọc `/pos/kds` (chỉ hiện món và ghi chú, không hiện tiền). Xếp làm sau.
- **Chặn:** Không chặn gì nếu nhóm đồng ý đề xuất.

## Q-018 — Phiên chỉ có đơn đã hủy thì thu tiền hay đóng bàn trống?

- **Nguồn:** `sp_SettleSession` ném `NO_ORDERS` khi tổng phải thu bằng 0 (tức mọi đơn đều đã hủy). Comment trong SP trỏ tới `sp_CloseEmptySession`, nhưng SP này **không được định nghĩa** ở đâu. Đoạn cuối phần SP trong `kiến-trúc/data-model.md` lại nói đóng bàn trống là một `UPDATE` có điều kiện trong service. API `POST /api/sessions/{id}/close` trả `409 HAS_ORDERS`, còn FEATURE-006 ghi điều kiện là "phiên không có đơn nào".
- **Rủi ro:** Phiên chỉ có đơn `CANCELLED` không thu tiền được (`NO_ORDERS`). Nếu "có đơn" tính cả đơn đã hủy thì phiên cũng không đóng được (`HAS_ORDERS`), và bàn bị kẹt ở trạng thái mở.
- **Đề xuất (PROPOSED):** Đóng bàn trống khi phiên "không có đơn nào khác `CANCELLED`". Bỏ tham chiếu `sp_CloseEmptySession`; làm trong một câu `UPDATE Sessions … WHERE Status IN ('OPEN','PAYMENT_REQUESTED') AND NOT EXISTS (đơn ≠ CANCELLED)`.
- **Chặn:** TASK-015 (Đóng bàn trống).

## Q-019 — Ngưỡng giảm giá tay của nhân viên "10 % hoặc 20.000đ" hiểu thế nào?

- **Nguồn:** skill `extend-features` D-14: "STAFF tối đa 10 % hoặc 20.000đ/bill".
- **Cách hiểu:** (a) không vượt **cả hai** ngưỡng; (b) chỉ cần thỏa một trong hai; (c) % áp cho giảm theo %, số tiền áp cho giảm theo số tiền.
- **Đã áp dụng (ADR-005):** phương án chặt hơn (a) — nhân viên tự giảm khi số giảm ≤ 10% bill (sau hội viên) **và** ≤ 20.000đ; vượt → quản lý nhập tài khoản duyệt. Ngưỡng sửa được ở Quản lý → Cài đặt.
- **Chặn:** không. Nhóm xác nhận; nếu chọn (b)/(c) chỉ sửa hàm `manualNeedsApproval` (`src/pricing/pricing.js`) + test.

## Q-020 — Hoàn tiền sau thu được phép trong bao lâu?

- **Nguồn:** skill `extend-features` F-019: "chỉ trong ngày (hoặc ca) — mặc định cùng ngày quán".
- **Đã áp dụng (ADR-005):** cùng **ngày thu tiền** theo giờ Việt Nam (`sp_RefundPayment`, lỗi `REFUND_WINDOW_EXPIRED`); tiền hoàn trừ vào ca **đang mở** lúc hoàn.
- **Câu hỏi:** có cần giới hạn "cùng ca" (chặt hơn) hoặc cho quản lý hoàn đơn ngày trước không?
- **Chặn:** không.

## Q-021 — Gọi món tại bàn: các mặc định cần chủ quán xác nhận

- **Nguồn:** yêu cầu chủ dự án 16/10/2026 (FEATURE-024): "nhân viên ra order rồi nhập thủ công vào máy và ghi chú trong bàn để nhớ". Yêu cầu không nói rõ các điểm dưới.
- **Đã áp dụng (PROPOSED):**
  1. Đơn nhân viên nhập vào thẳng **Đang pha** (không cần "Tiếp nhận").
  2. Nhân viên nhập được cả khi **tạm ngưng nhận đơn QR** / ngoài **giờ bán** của danh mục (giống bán mang đi).
  3. Ghi chú gắn với **lượt khách (phiên)**, hết khi thu tiền; không gắn cố định với bàn.
  4. **Khách không thấy** ghi chú; không in lên hóa đơn.
  5. Bàn đang có nhóm → nhân viên phải chọn nhóm hoặc "Nhóm mới" (không tự gộp).
- **Câu hỏi:** giữ các mặc định này? Có cần ghi chú **cố định theo bàn** (ví dụ "bàn ngoài trời, hay mưa") hoặc in ghi chú lên phiếu pha không?
- **Chặn:** không. Đổi (1) chỉ sửa `@AcceptNow`; đổi (2) thêm kiểm tra trong `orderService.submitByStaff`.

## Q-022 — Lệch ma trận D-24 và các cách hiểu đã áp ở giai đoạn 4–8

- **Nguồn:** skill `advanced-features` (ma trận quyền D-24, D-28, phần "Kiểm" của F-036); [ADR-006](quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) bảng "Thích nghi theo hiện trạng repo"; FEATURE-009, FEATURE-018, FEATURE-033, FEATURE-036, FEATURE-038, FEATURE-039. Skill ghi "nguồn chính là docs", nên khi skill lệch docs hiện có thì làm theo docs và ghi lại ở đây.
- **Trạng thái:** Đã áp phương án, chờ nhóm xác nhận (18/10/2026).
- **Đã áp dụng:**
  1. **STAFF vẫn mở / đóng ca.** Ma trận D-24 ghi STAFF ✘ mở/đóng ca, nhưng FEATURE-018 (ADR-005) cho nhân viên mở/đóng ca. Repo giữ theo docs: `shift.manage` cấp cho cả STAFF, MANAGER, ADMIN.
  2. **STAFF ghi được sổ quỹ.** Ma trận D-24 ghi STAFF ✘ "chi quỹ ≤ ngưỡng", nhưng D-23 đã nêu ngưỡng duyệt. Repo cho STAFF ghi khoản (`cash.create`): khoản chi > 500.000đ hoặc thuộc danh mục "Khác (chi)" chờ trưởng ca / quản lý duyệt; khoản nhỏ hơn được duyệt ngay (BR-048, BR-049).
  3. **"Lần đầu" ở D-28 hiểu chặt.** Thưởng giới thiệu chỉ xét **lượt thu đầu tiên** của người được giới thiệu (`VisitCount = 1`). Lượt đầu < 30.000đ thì không tặng, và các lượt sau cũng không tặng (BR-060).
  4. **ADMIN cuối cùng tự hạ vai trò → 400.** Phần "Kiểm" của skill F-036 ghi "hạ ADMIN cuối cùng → 409 `LAST_ADMIN`". Repo vẫn trả `400 CANNOT_CHANGE_OWN_ROLE` (và `400 CANNOT_LOCK_SELF`) khi ai đó tự đổi vai trò / tự khóa, như FEATURE-009. `409 LAST_ADMIN` áp khi người khác hạ / khóa / xóa ADMIN cuối cùng, kể cả hai quản lý hạ quyền nhau cùng lúc (BR-047).
  5. **Số dư điểm cũ không quy đổi.** Tỷ lệ tích điểm đổi từ D-5 (1 điểm / 1.000đ) sang D-27 (1 điểm / 10.000đ) ở migration `0029`. Số dư cũ giữ nguyên và ghi một dòng `ADJUST` "Số dư trước F-039" (ADR-006), nên điểm tích trước F-039 có giá trị gấp 10 lần điểm tích sau.
  6. **Hoàn tiền không trả lại voucher.** FEATURE-039 quy định hoàn điểm / tem khi hoàn tiền, còn FEATURE-038 không nói gì về voucher. Code hiện tại (`sp_ReverseLoyalty`, `sp_RefundPayment`) không trả lại voucher đã dùng cho lượt thu bị hoàn.
- **Câu hỏi:**
  - (a) Giữ (1)(2) theo docs, hay siết đúng D-24: chỉ trưởng ca / quản lý mở/đóng ca; STAFF không ghi chi quỹ?
  - (b) "Lần đầu" có nên hiểu là "lần đầu đạt ≥ 30.000đ"?
  - (c) Có quy đổi số dư điểm cũ theo tỷ lệ mới (÷ 10) không?
  - (d) Hoàn toàn bộ lượt thu có trả lại voucher (nếu còn hạn) không?
- **Chặn:** không.
  - Đổi (1)(2): sửa `PERMISSIONS['shift.manage']` / `PERMISSIONS['cash.create']` trong `ứng-dụng/máy-chủ/src/auth/permissions.js`; test ma trận quyền sinh từ bảng này nên tự kiểm theo.
  - Đổi (3): sửa điều kiện bước 5 "Giới thiệu bạn" trong `sp_ApplyLoyalty` (`cơ-sở-dữ-liệu/thủ-tục/sp_Loyalty.sql`).
  - Đổi (4): sửa `userService` (kiểm `LAST_ADMIN` trước `CANNOT_CHANGE_OWN_ROLE`).
  - Đổi (5): thêm migration quy đổi kèm dòng `ADJUST`.
  - Đổi (6): thêm bước trả voucher trong `sp_ReverseLoyalty`.
  - Mỗi thay đổi cần cập nhật test tương ứng (`finance.test.js`, `loyalty.test.js`).

## Q-023 — Sheet chia bill của khách mất chữ đang gõ ở ô "Tên phần" (E2E chia bill không ổn định)

- **Nguồn:** phát hiện khi chạy E2E cho TASK-055 (F-046, 18/10/2026). Không thuộc F-046; TASK-055 ghi "không sửa luồng chia bill" nên **chưa sửa**.
- **Hiện tượng:** sheet **Chia bill theo người** ở trang theo dõi đơn của khách (`ứng-dụng/giao-diện/public/js/pages/t-track.js`, `openSplit()` → `refresh()`) vẽ lại toàn bộ thân sheet mỗi khi có cập nhật realtime (đơn / chia bill đổi) và gắn lại ô "Tên phần". Ô mất focus đúng lúc khách đang gõ → các ký tự gõ sau đó bị mất; nếu ô còn trống, phần được lưu với tên mặc định **"Tôi"**. E2E "chia bill…" (`kiểm-thử/e2e/flow.spec.js`) vì vậy thỉnh thoảng fail (không ổn định).
- **Rủi ro:** thấp (chỉ là tên hiển thị của phần, tiền không sai), nhưng gây khó chịu cho khách và làm E2E chập chờn.
- **Đề xuất (PROPOSED):** nhớ phần tử đang focus (và vị trí con trỏ) trước khi vẽ lại rồi focus lại ô "Tên phần" sau khi vẽ; hoặc không vẽ lại khối "Tạo phần của tôi" khi khách chưa tạo phần. Sửa kèm chạy lại E2E "chia bill…" nhiều lần.
- **Chặn:** không. Cần nhóm đồng ý mở task riêng (đụng luồng chia bill F-026).
- **Đã xử lý (20/10/2026):** chủ dự án yêu cầu hoàn thiện quy trình 15 bước (bước 14: không còn lỗi chưa xử lý / test chập chờn) → mở [TASK-058](công-việc/TASK-058.md), sửa theo phương án 2 (khối "Tạo phần" không bị vẽ lại) + thêm bước hồi quy E2E (fail với code cũ, pass với code mới). Ghi ở Defect Log DEF-001. **Trạng thái: CLOSED.**

---

# Phụ lục — Những điểm tài liệu nguồn đã **không** tự quyết

| Điểm | Ở đâu | Ghi nhận |
| --- | --- | --- |
| Thời điểm giữ/trừ kho | Q-001, BR-010, SP | Đề xuất A, chờ ADR |
| Express hay NestJS; gói validation | Q-002, mục 10 | Đề xuất Express + zod |
| Có nút Tiếp nhận hay đơn vào Đang pha ngay | Q-004b | Đề xuất có nút Tiếp nhận |
| Gọi thêm món sau khi đã gọi thanh toán | FEATURE-005, Q-013 | Đề xuất cho phép, phiên về OPEN |
| Hoàn tất theo đơn/món | Q-006 | Đề xuất theo đơn |
| Ngăn kéo tiền | Q-007, REQ-022 | Đề xuất làm sau vì kỹ thuật không làm được bằng `window.print()` |
| Hosting | Q-008 | Chưa chọn |
| Hủy đơn, nhập kho | Q-010/011 | Có đề xuất, chờ chốt |
| Trả thiếu/ghi nợ, in tạm tính, tiền thừa | FEATURE-006, BR-014 | Đề xuất: không hỗ trợ nợ; có tạm tính |
| Doanh thu tính theo ngày tạo hay ngày thanh toán | FEATURE-012 | Đề xuất theo `PaidAt` |
| Tự tắt `IsAvailable` khi hết nguyên liệu | realtime-events | Mặc định không tự tắt |
| Ngưỡng cụ thể NFR-004, giới hạn 50 món/dòng, JWT 8 h, rate limit | NFR-004, BR-015, tech-stack, local-development | Đều PROPOSED |
