# Source map — yêu cầu nguồn → nơi đặc tả → trạng thái

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §2 và Phụ lục B (bản 1.2, 14/10/2026); `tài-liệu/nguồn/demo.docx` (baseline đọc ngày 13/10/2026, văn bản trích ở `tài-liệu/nguồn/demo-docx.txt`). Kết quả đối chiếu theo prompt 19.1 ở cuối file.

Các bảng dưới đây giữ **nguyên văn** từ tài liệu nguồn, chỉ thêm cột "Đặc tả tại" và các dòng mới (REQ-025…027) có nhãn *(mới, 19.1)*. Q-xxx xem ở [open-questions](open-questions.md).

## Phạm vi và chức năng (REQ)

| ID | Nội dung | Nguồn trong Word | Trạng thái | Đặc tả tại |
| --- | --- | --- | --- | --- |
| REQ-001 | Một quán, một cơ sở, một kho; không multi-branch | IV.3 "Chiến lược ứng phó" | CONFIRMED | [overview](sản-phẩm/overview.md) |
| REQ-002 | Khách **không cần tài khoản**; định danh bằng QR bàn | Actor 1.1 | CONFIRMED | [roles-permissions](nghiệp-vụ/roles-permissions.md), [F-001](chức-năng/FEATURE-001.md) |
| REQ-003 | Nhân viên quầy là **một vai trò gộp** Thu ngân + Pha chế, có tài khoản đăng nhập | Actor 1.2 "(Gộp Thu ngân & Pha chế)" | CONFIRMED (bản mới của Word thay bản cũ có "màn hình Bếp/KDS" riêng) | [roles-permissions](nghiệp-vụ/roles-permissions.md); Q-017 ([open-questions](open-questions.md)) |
| REQ-004 | Quản lý (Admin) là quyền cao nhất: menu, bàn/QR, BOM, kho, báo cáo, cấp tài khoản | Actor 1.3 | CONFIRMED | [roles-permissions](nghiệp-vụ/roles-permissions.md) |
| REQ-005 | Khi quét QR bàn đang có phiên chưa thanh toán: cho chọn **Gộp chung nhóm** hoặc **Tạo đơn cá nhân** (phiên song song trên cùng bàn) | US1, User flow bước 2–3, Module 1.1 | CONFIRMED | [F-001](chức-năng/FEATURE-001.md); Q-012 |
| REQ-006 | Khách xem menu, thêm món, tùy chỉnh ghi chú (ít đường/nhiều đá), gửi đơn | US2, Module 1.2 | CONFIRMED | [F-002](chức-năng/FEATURE-002.md), [F-003](chức-năng/FEATURE-003.md) |
| REQ-007 | ~~Thanh toán VietQR động qua cổng PayOS/SePay + webhook~~ → **Chỉ thu tiền mặt; không tích hợp cổng thanh toán** | US3, Module 2.1–2.2 → thay bởi D-1 | CONFIRMED (D-1) — phần VietQR xếp "làm sau" | [ADR-000](quyết-định/ADR-000-thanh-toan-tien-mat.md) |
| REQ-023 | Trên màn hình theo dõi đơn, khách bấm **"Gọi thanh toán"** → quầy nhận thông báo realtime kèm số bàn và tổng tiền → nhân viên ra bàn thu tiền mặt → bấm "Đã thu tiền" trên POS → in bill, đóng phiên | D-2 | CONFIRMED | [F-005](chức-năng/FEATURE-005.md), [F-006](chức-năng/FEATURE-006.md) |
| REQ-024 | Thu tiền theo **phiên** (toàn bộ đơn của nhóm trong phiên, một hóa đơn); phiên cá nhân trên cùng bàn thu riêng | D-2 + US1 (tách/gộp bill) | CONFIRMED (suy trực tiếp từ mục đích tách/gộp bill) | [F-006](chức-năng/FEATURE-006.md) |
| REQ-008 | Khách theo dõi trạng thái đơn realtime trên điện thoại | US4 | CONFIRMED | [F-004](chức-năng/FEATURE-004.md) |
| REQ-009 | Quầy nhận đơn mới realtime: âm thanh + thẻ đơn nảy lên, không reload | US5 (bản 1) / US4 (bản 2) | CONFIRMED | [F-007](chức-năng/FEATURE-007.md), [realtime-events](kiến-trúc/realtime-events.md) |
| REQ-010 | Quầy bấm **Hoàn tất** → đơn sang "Đã phục vụ", kích hoạt trừ kho theo BOM (Stored Procedure/Transaction) | US6, Actor 1.2, Module 3.2 + 4.2 | CONFIRMED (thời điểm trừ/giữ kho: Q-001) | [F-007](chức-năng/FEATURE-007.md), [data-model](kiến-trúc/data-model.md) |
| REQ-011 | In hóa đơn từ trình duyệt ra máy in nhiệt 58/80 mm bằng `window.print()` + CSS ẩn UI | US7, Module 2.3, Actor 7 | CONFIRMED | [F-006](chức-năng/FEATURE-006.md), [F-008](chức-năng/FEATURE-008.md), [screens-flows](giao-diện/screens-flows.md) (S-12) |
| REQ-012 | Quầy có **mục riêng "Bán mang đi"**: tạo đơn thủ công cho khách vãng lai, thu tiền mặt ngay tại quầy → đơn đã thanh toán, in bill, đẩy vào luồng pha chế | US8, Module 1.3, D-3 | CONFIRMED (bỏ lựa chọn "chuyển khoản" theo D-1) | [F-008](chức-năng/FEATURE-008.md) |
| REQ-013 | Admin thiết lập BOM cho từng món (nguyên liệu + định lượng > 0) | US9, Module 4.1 | CONFIRMED | [F-011](chức-năng/FEATURE-011.md) |
| REQ-014 | Admin xem báo cáo doanh thu theo khoảng ngày: tổng doanh thu, số hóa đơn, món bán chạy, cảnh báo nguyên liệu sắp hết | US11 (bản 1) / US9 (bản 2), Module 5.1 | CONFIRMED | [F-012](chức-năng/FEATURE-012.md); Q-014 |
| REQ-015 | Admin CRUD tài khoản nhân viên: tạo, khóa, phân quyền; username duy nhất; mật khẩu băm | US8 (bản 2), Module 5.2 | CONFIRMED | [F-009](chức-năng/FEATURE-009.md) |
| REQ-016 | Admin quản lý menu (món, giá, ảnh, hết hàng) và danh sách bàn (sinh QR) | Actor 1.3, Module 5 | CONFIRMED (chi tiết trường: PROPOSED ở FEATURE-010) | [F-010](chức-năng/FEATURE-010.md) |
| REQ-017 | Quầy mất mạng → hiện icon "Mất kết nối"; có mạng lại → tự kéo đơn bị nhỡ, cảnh báo "Có đơn hàng bị trễ" | US4 AC2 (bản 2) | CONFIRMED | [F-007](chức-năng/FEATURE-007.md), [realtime-events](kiến-trúc/realtime-events.md) |
| REQ-018 | Hai nhân viên cùng bấm Hoàn tất một đơn → máy sau bị chặn "Đơn hàng này đã được nhân viên khác xử lý"; không trừ kho 2 lần | US5 AC2 (bản 2) | CONFIRMED | [F-007](chức-năng/FEATURE-007.md), [data-model](kiến-trúc/data-model.md) |
| REQ-019 | ~~Sau 5 phút chưa nhận webhook khớp → báo khách đối soát~~ | US3 AC2 (bản 2) | N/A — không còn thanh toán online (D-1). Thay bằng: khách đã bấm Gọi thanh toán mà sau 5 phút chưa được thu tiền → màn hình khách hiện "Nhân viên đang bận, vui lòng đợi hoặc ra quầy" và nút "Gọi lại" (PROPOSED) | [F-005](chức-năng/FEATURE-005.md) (bản thay thế) |
| REQ-020 | Cron job: chốt ca, tổng hợp doanh thu cuối ngày, dọn giỏ hàng rác | Actor phụ 8 | PROPOSED — không có user story; xếp "làm sau" | [overview](sản-phẩm/overview.md), [TASK-022](công-việc/TASK-022.md) |
| REQ-021 | Lưu trữ/nén/phân phối ảnh món | Actor phụ 9 | PROPOSED — bản đầu có thể dùng ảnh tĩnh/URL; xếp "làm sau" | [overview](sản-phẩm/overview.md), [TASK-022](công-việc/TASK-022.md) |
| REQ-022 | Mở ngăn kéo tiền | III.1 "Module Ngoại vi" | NEEDS_CONFIRMATION — Q-007 | Q-007, [TASK-022](công-việc/TASK-022.md) |
| REQ-025 *(mới, 19.1)* | Admin xem **lịch sử đơn hàng** (lọc, xem chi tiết) | Actor 1.3 ("Xem báo cáo doanh thu và lịch sử đơn hàng"), US11 bản 1 | NEEDS_CONFIRMATION — Q-014 (đã có API `GET /api/admin/orders`, chưa có feature/AC/màn hình) | [F-012](chức-năng/FEATURE-012.md); Q-014 |
| REQ-026 *(mới, 19.1)* | Báo cáo/lịch sử theo **ca** | US11 bản 1 ("theo ca/ngày") | NEEDS_CONFIRMATION — Q-014 (đề xuất làm sau cùng cron chốt ca) | Q-014; [TASK-022](công-việc/TASK-022.md) |
| REQ-027 *(mới, 19.1)* | In phiếu để **dán lên ly đồ uống** | US7 bản 1 | NEEDS_CONFIRMATION — Q-015 (dine-in in bill khi thu tiền theo ADR-000) | Q-015 |

## Quy tắc nghiệp vụ (BR)

| ID | Tóm tắt | Nguồn | Trạng thái | Đặc tả tại |
| --- | --- | --- | --- | --- |
| BR-001 | Tồn kho nguyên liệu **không bao giờ âm**; thiếu nguyên liệu → giao dịch rollback và báo "hết nguyên liệu" | US10, Module 4.2, Actor phụ 2 | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-002 | Một đơn chỉ được trừ kho **đúng một lần** | US5 AC2 (bản 2) | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-003 | Định lượng BOM phải > 0; nguyên liệu bắt buộc không được trống | US9/US7 AC2 | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-004 | Username nhân viên duy nhất | US8 AC2 (bản 2) | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-005 | Khoảng ngày báo cáo hợp lệ: ngày bắt đầu ≤ ngày kết thúc, không ở tương lai | US9 AC2 (bản 2) | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-006 | Đơn mang đi được chốt = đã thu tiền mặt; nhân viên phải xác nhận "Đã nhận tiền" (và có thể nhập tiền khách đưa để tính tiền thừa) trước khi chốt | US6 AC2 (bản 2), D-3 | CONFIRMED (nhập tiền khách đưa: PROPOSED) | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-007 | Thanh toán chỉ được ghi nhận khi **nhân viên đăng nhập** bấm "Đã thu tiền" trên POS; khách không tự đánh dấu đã trả | D-1, D-2 | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-008 | Gộp phiên chỉ được khi phiên đó **còn mở (chưa thanh toán)**; nếu vừa đóng → tự chuyển sang tạo phiên mới và báo khách | US1 AC2 (bản 2) | CONFIRMED | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-009 | Khi gửi đơn, nếu một món đã hết nguyên liệu → **từ chối cả đơn**, báo tên món, cập nhật trạng thái hết hàng trên menu, cho khách sửa giỏ | US2 AC2, User flow bước 5 | CONFIRMED (cách hiểu "từ chối cả đơn" vs "bỏ món đó": Q-005) | [business-rules](nghiệp-vụ/business-rules.md) |
| BR-010 | Thời điểm giữ/trừ kho (khi gửi đơn hay khi hoàn tất) | Mâu thuẫn giữa User flow bước 5–6 và US6/Module 4.2 | NEEDS_CONFIRMATION — Q-001 | [business-rules](nghiệp-vụ/business-rules.md); Q-001 |

## Quyết định kỹ thuật (DEC)

| ID | Nội dung | Nguồn | Trạng thái | Đặc tả tại |
| --- | --- | --- | --- | --- |
| DEC-001 | Database: **SQL Server** | III.1, IV.1 | CONFIRMED (bắt buộc) | [tech-stack](kiến-trúc/tech-stack.md), [data-model](kiến-trúc/data-model.md) |
| DEC-002 | Logic trừ kho đặt trong **Transaction + Stored Procedure** ở SQL Server, dùng row-lock | III.1, IV.1, US10 | CONFIRMED | [data-model](kiến-trúc/data-model.md) |
| DEC-003 | Front-end: **HTML/CSS/JavaScript thuần** (không Next.js/React) | III.2 → thay bởi D-4 | CONFIRMED (D-4) | [tech-stack](kiến-trúc/tech-stack.md) |
| DEC-004 | Back-end: **Node.js** (Express — PROPOSED) + REST API | III.2, D-4 | CONFIRMED (Node) / PROPOSED (Express) | [tech-stack](kiến-trúc/tech-stack.md); Q-002 |
| DEC-005 | Realtime: **Socket.io** | III.1, D-4 | CONFIRMED (hệ quả của Node) | [tech-stack](kiến-trúc/tech-stack.md), [realtime-events](kiến-trúc/realtime-events.md); Q-002 |
| DEC-006 | ~~Cổng thanh toán VietQR: PayOS hoặc SePay~~ | IV.1, Actor phụ 1 | N/A — D-1 bỏ tích hợp cổng; thiết kế để thêm sau không phá schema (`PaymentMethod` mở rộng được) | [ADR-000](quyết-định/ADR-000-thanh-toan-tien-mat.md) |
| DEC-007 | In hóa đơn qua `window.print()` + CSS `@media print`, khổ 58/80 mm | Actor phụ 7, Module 2.3 | CONFIRMED | [F-006](chức-năng/FEATURE-006.md), [screens-flows](giao-diện/screens-flows.md) |
| DEC-008 | QR bàn tự sinh bằng thư viện (không cần dịch vụ ngoài) | IV.1 | CONFIRMED | [F-010](chức-năng/FEATURE-010.md) |
| DEC-009 | Mật khẩu băm (bcrypt/argon2) | Module 5.2 | CONFIRMED (thuật toán cụ thể: PROPOSED) | [F-009](chức-năng/FEATURE-009.md), [tech-stack](kiến-trúc/tech-stack.md) |
| DEC-010 | Deploy online trên "server thực"/Internet, ưu tiên dịch vụ miễn phí | III.2, IV.2 | CONFIRMED (nhà cung cấp: UNKNOWN — Q-008) | [tech-stack](kiến-trúc/tech-stack.md); Q-008 |
| DEC-011 | Kiến trúc backend phân tầng (xem mục 9) | — | PROPOSED | [system-overview](kiến-trúc/system-overview.md) |

## Chỉ tiêu chất lượng (NFR)

Chi tiết ở [overview](sản-phẩm/overview.md) mục 1.4. NFR-003 có Q-016; NFR-004 chưa có số (UNKNOWN).

| ID | Chỉ tiêu | Cách kiểm chứng đề xuất | Trạng thái |
| --- | --- | --- | --- |
| NFR-001 | Đồng bộ trạng thái đơn giữa các thiết bị **< 2 giây** (từ lúc khách bấm gửi đến khi quầy thấy) | Đo timestamp client gửi → timestamp quầy nhận sự kiện realtime, trên mạng Wi-Fi quán, lặp ≥ 30 lần, lấy p95 | CONFIRMED (chỉ tiêu) / PROPOSED (cách đo) |
| NFR-002 | **100 %** kịch bản ép tải tranh chấp tồn kho pass: nhiều bàn order cùng lúc, kho không bao giờ âm, tổng trừ = tổng BOM của các đơn thành công | Script bắn N request đồng thời (k6/Artillery/script Node) vào API hoàn tất/đặt món với kho chỉ đủ M suất; assert: đúng M thành công, N–M bị từ chối, `StockQty ≥ 0`, tổng `InventoryTransactions` khớp | CONFIRMED (chỉ tiêu) / PROPOSED (cách đo) |
| NFR-003 | Khách order trong **≤ 3 thao tác** sau khi quét QR | Đếm số tap trên luồng chuẩn: chọn món → giỏ → gửi | CONFIRMED (chỉ tiêu, cần định nghĩa "thao tác") |
| NFR-004 | Giao diện khách mobile-first, "siêu nhẹ" | Chưa có số cụ thể; đề xuất: trang menu load được trên 4G trong < 3 s, bundle trang khách < 300 KB gzip | UNKNOWN (số) / PROPOSED (ngưỡng) |

## Bản đồ nội dung Word → docs (Phụ lục B của tài liệu nguồn)

| Nội dung demo.docx | Mục tiếp nhận | Trạng thái |
| --- | --- | --- |
| I–III: Ý tưởng, mục tiêu, kết quả mong đợi | 1.1, 1.4 | CONFIRMED |
| IV: Khả thi, nhóm, 8 tuần, MVP cắt giảm | 1.2, 1.3, 18 | CONFIRMED |
| Primary/Secondary actors (bảng 9 actor) | 4.1, 4.2 | CONFIRMED |
| User stories bản 1 (US1–US11) và bản 2 (US1–US9, có AC exception) | 8 (FEATURE-001…012), 2.1 | CONFIRMED; AC exception được giữ nguyên — trừ US3 (VietQR) bị thay bởi D-1/D-2 |
| User flow + Mermaid | 6.1 | CONFIRMED, chuẩn hóa tên trạng thái |
| Module 1–5 (Input/Processing/Output) | 9.3, 11.3 | CONFIRMED về chức năng; chi tiết API PROPOSED |
| "Stored Procedure/Transaction/Row-lock" | 11.2 | CONFIRMED về cơ chế; mã SP là PROPOSED |
| "Front-end Next.js", "Node.js/C#", "Socket.io/SignalR" | D-4 → HTML/CSS/JS thuần, Node.js, Socket.io | THAY THẾ theo quyết định chủ dự án 14/10/2026 |
| US3 VietQR, Module 2.1–2.2, "PayOS/SePay", "MOMO" | D-1 → FEATURE-005/006 mới (gọi thanh toán, thu tiền mặt) | THAY THẾ theo quyết định chủ dự án 13/10/2026; VietQR làm sau |
| "Mở ngăn kéo tiền" | Q-007 | NEEDS_CONFIRMATION / làm sau |
| Cron job, Storage ảnh | REQ-020, REQ-021 | PROPOSED, làm sau |

## Kết quả đối chiếu demo.docx (prompt 19.1, 13/10/2026)

**Đã đọc:** toàn bộ `demo.docx` (386 đoạn/dòng, gồm 1 bảng actor 9 dòng và 1 khối Mermaid ở dạng văn bản). File không có ảnh nhúng nên không có phần nào bị bỏ sót vì không đọc được. Trên máy có hai bản `demo.docx` (Downloads, 18:25 và Documents/minhtu, 15:42) với nội dung chữ giống hệt nhau; repo dùng bản trong Downloads.

### A. Yêu cầu trong Word chưa có trong bảng → đã thêm ID mới

| ID mới | Nội dung | Nguồn Word |
| --- | --- | --- |
| REQ-025 | Lịch sử đơn hàng cho Admin | Actor 1.3; US11 bản 1 |
| REQ-026 | Báo cáo/lịch sử "theo ca" | US11 bản 1 |
| REQ-027 | In phiếu dán lên ly | US7 bản 1 |

### B. Trạng thái / ghi chú gán sai hoặc đã cũ → đề xuất và cách xử lý

| # | Chỗ | Vấn đề | Đã xử lý trong docs |
| --- | --- | --- | --- |
| 1 | NFR-003 | Word ghi "**dưới** 3 thao tác", tài liệu nguồn ghi "≤ 3" | Ghi chú tại overview; mở Q-016 |
| 2 | REQ-003 | Tài liệu nguồn viết "bản mới của Word thay bản cũ có màn hình Bếp/KDS". Thực tế Word không đánh dấu bản mới/cũ, và mục I.1, mục 1, III.1 vẫn nhắc KDS | Giữ CONFIRMED cho vai trò gộp; mở Q-017 cho màn hình KDS riêng |
| 3 | FEATURE-001 | Ghi "trừ phần đóng phiên — Q-009", trong khi Q-009 đã chốt (D-2) | Cập nhật theo ADR-000 |
| 4 | BR-013 | Ví dụ "(chưa trả tiền)" và ngoại lệ "Theo Q-004" đã cũ sau D-2 | Sửa thành "(chưa tiếp nhận)", "Theo Q-004b" (ghi theo ADR-000) |
| 5 | Q-005 | "Chặn: FEATURE-003 AC-03", nhưng AC về hết món là AC-003-02 | Ghi chú tại Q-005 |
| 6 | FEATURE-009/010/011 | "API mục 11.4", trong khi endpoint quản trị nằm ở §11.3 (11.4 là realtime) | Đổi thành link `api-contract.md` (phần Quản trị) |
| 7 | Data model / SP | Comment `OrderCode` "nội dung chuyển khoản" đã cũ sau D-1; `sp_CloseEmptySession` không tồn tại; UDF `fn_NewOrderCode` không gọi được `NEWID()`/`RAND()` | Bảng "Ghi chú đối chiếu" trong data-model; Q-018 |
| 8 | D-2 | Cột "thay thế" của D-2 chưa nêu US5 bản 2 AC1 ("Hoàn tất & In Bill") | Ghi rõ trong ADR-000: dine-in in bill khi thu tiền phiên |
| 9 | Nhãn trạng thái | Word dùng cả "Chờ thanh toán" (Module 1.2) lẫn "Chờ xác nhận" (US2 bản 1, Actor 1.1); cả "Đã phục vụ" (US6, Actor 1.1) lẫn "Đã xong, vui lòng nhận tại quầy" (US4 bản 1) | Không mở Q mới. Theo ADR-000 (trả sau), `PENDING` = "Chờ xác nhận" là nhất quán. "Đã phục vụ" có thể dùng làm nhãn lịch sử. Nhãn cuối cùng chốt cùng Q-004b |

### C. Mâu thuẫn hoặc khoảng trống chưa thành Q → đã thêm Q-012 … Q-018

Q-012 giỏ hàng chung · Q-013 gửi đơn đồng thời thu tiền / gọi thêm sau khi gọi thanh toán · Q-014 lịch sử đơn, "theo ca" · Q-015 phiếu dán ly · Q-016 "dưới 3 thao tác" · Q-017 KDS riêng · Q-018 phiên chỉ có đơn hủy. Chi tiết ở [open-questions](open-questions.md).

### D. Phần đã đủ rõ để tạo docs và bắt đầu

- Toàn bộ docs đã được tách. Những phần còn chặn được ghi ở cột "Chặn bởi" của [chức-năng/README](chức-năng/README.md) và trong [công-việc/README](công-việc/README.md).
- Task có thể bắt đầu ngay: **TASK-001** (không phụ thuộc Q nào). Các phần lõi (TASK-002 trở đi) chờ Q-001, Q-002 và Q-013 qua TASK-000.
