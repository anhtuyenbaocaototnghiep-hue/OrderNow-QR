# User Story backlog (bước 04–05)

> **Nguồn:** sổ tay quy trình 15 bước (Playbook v1.0) bước 04 "User Story", bước 05 "Acceptance Criteria & Business Rules", Mẫu 03, mục E "Traceability"; [FEATURE-001…047](../chức-năng/README.md) (không có FEATURE-044); [business-rules.md](business-rules.md) (BR-001…BR-073); [screens-flows.md](../giao-diện/screens-flows.md). Quy ước ID: [TASK-057](../công-việc/TASK-057.md). **Trạng thái tài liệu:** BẢN NHÁP (TASK-057, 20/10/2026) — chờ chủ dự án duyệt ở Gate G1.

## 1. Mục đích và quy ước

File này là **User Story backlog** của cả ứng dụng: mỗi dòng là một nhu cầu người dùng có ID ổn định, Actor, mục tiêu + giá trị, mức ưu tiên, và bản đồ sang AC / BR / Use Case / Module / màn hình / FEATURE. Bảng ở mục 3 được script truy vết đọc tự động — giữ nguyên tiêu đề cột và cách ghi.

- **ID:** `US-<FFF>-<n>` — `FFF` = số FEATURE (3 chữ số), `n` = thứ tự story trong FEATURE. Không đổi ID khi chỉ sửa câu chữ. **US-046-1…3** và **US-047-1…3** đã có trong [FEATURE-046](../chức-năng/FEATURE-046.md) / [FEATURE-047](../chức-năng/FEATURE-047.md) và được chép nguyên văn, trừ **US-047-2**: ở đây thêm vế "để …" cho đúng mẫu (FEATURE-047 vẫn giữ câu cũ — xem 4.4).
- **Mẫu câu:** "Là [Actor], tôi muốn [mục tiêu], để [giá trị]". Story chỉ nói nhu cầu nghiệp vụ, **không** nêu giải pháp kỹ thuật (API, bảng, khung chương trình…). "Chủ quán" trong story là vai Quản lý (`ACT-ADMIN`).
- **Tách story:** mỗi FEATURE tách 1–4 story theo mục tiêu thật của người dùng (luồng chính phía khách / phía quầy / phía quản lý / bảo vệ tiền–kho–quyền), đủ nhỏ để nghiệm thu trong một đợt.
- **Actor:** `ACT-GUEST` (khách quét QR), `ACT-MEMBER` (khách đã là hội viên), `ACT-STAFF` (nhân viên quầy), `ACT-LEAD` (Trưởng ca — vai `MANAGER`), `ACT-ADMIN` (Quản lý / chủ quán). Định nghĩa đầy đủ ở [actors.md](actors.md) (bước 02–03); quyền chi tiết ở [roles-permissions.md](roles-permissions.md).
- **Ưu tiên (MoSCoW):**
  - `Must` — MVP **F-001…F-012**, và **F-046, F-047** (chủ dự án yêu cầu 18/10/2026), **F-048…F-051** (chủ dự án yêu cầu 21/10/2026), **F-052**, **F-055** (chủ dự án yêu cầu 23/10/2026).
  - `Should` — mọi FEATURE còn lại (giai đoạn 2, F-024, giai đoạn 4–8).
  - `Could` — phần mà FEATURE / ADR ghi là **tùy chọn**. Hiện chỉ có một: kênh gửi Zalo OA của chiến dịch (US-037-4) — [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-29 ghi "EXPORT (CSV) mặc định, ZALO_OA **khi có** `ZALO_OA_TOKEN`".
  - `Won't` — không có story nào; các mục "làm sau" (VietQR, ngăn kéo tiền, ảnh món…) nằm ở [open-questions.md](../open-questions.md), không đưa vào backlog.
- **AC và BR giữ nguyên chỗ:** AC nằm trong từng FEATURE, BR nằm trong [business-rules.md](business-rules.md). File này **chỉ ánh xạ ID**, không chép nội dung. Muốn đổi AC / BR thì sửa ở file gốc (theo quy trình duyệt), rồi cập nhật cột tương ứng ở đây.
- **Trạng thái:** `DONE` = FEATURE đã code + test tự động pass, đang `READY_FOR_REVIEW` theo [README chức năng](../chức-năng/README.md) (chờ nhóm review theo DoD). Hiện mọi FEATURE đều ở trạng thái này.

## 2. Ràng buộc và giả định chung

Áp cho mọi story, không lặp lại ở từng dòng:

- Chỉ thu **tiền mặt**; khách gọi thanh toán, nhân viên ra bàn thu, phiên đóng khi bấm "Đã thu tiền" ([ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) D-1…D-3). Không cổng thanh toán.
- Một quán, một kho; giờ nghiệp vụ theo giờ quán (UTC+7).
- Khách **không có tài khoản**: nhận diện bằng phiên của điện thoại; hội viên nhận diện bằng SĐT, không OTP (BR-024).
- Quyền luôn kiểm ở phía hệ thống, giao diện chỉ ẩn / hiện (BR-044).
- Giả định đang chạy theo mặc định, chờ chủ dự án xác nhận: **Q-021** (cách gọi món tại bàn — F-024), **Q-022** (lệch ma trận quyền Trưởng ca, "lần đầu" của giới thiệu bạn, hoàn tiền không trả voucher — F-018, F-033, F-036, F-038, F-039). Q-019 / Q-020 đã áp phương án chặt hơn. Chi tiết: [open-questions.md](../open-questions.md).

## 3. Backlog

Cột: **US** · **Ưu tiên** (`Must` / `Should` / `Could`) · **Actor** · **User Story** · **AC** (ID AC trong FEATURE kiểm chứng story) · **BR** · **UC** (`UC-01`…`UC-19`, đặc tả ở `use-cases.md`) · **MOD** (module đầu tiên là module sở hữu; bản đồ ở `module-map.md`) · **SCR** (`SCR-xx` = `S-xx` trong [screens-flows.md](../giao-diện/screens-flows.md); `—` = chỉ chạy nền / không có màn riêng) · **FEATURE** · **Trạng thái**.

| US | Ưu tiên | Actor | User Story | AC | BR | UC | MOD | SCR | FEATURE | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| US-001-1 | Must | ACT-GUEST | Là khách, tôi muốn quét mã QR trên bàn và vào thẳng menu của đúng bàn mình, để gọi món mà không cần cài ứng dụng hay tạo tài khoản. | AC-001-01, AC-001-05, AC-001-06 | — | UC-01 | MOD-TABLE | SCR-01, SCR-02 | F-001 | DONE |
| US-001-2 | Must | ACT-GUEST | Là khách đến sau ở một bàn đang có người, tôi muốn chọn gộp chung nhóm hoặc gọi riêng, để nhóm trả chung một hóa đơn hoặc mỗi người tự trả phần mình. | AC-001-02, AC-001-03, AC-001-04 | BR-008 | UC-01 | MOD-TABLE | SCR-01 | F-001 | DONE |
| US-001-3 | Must | ACT-GUEST, ACT-STAFF | Là người mở địa chỉ web của quán mà không qua mã QR hoặc gõ sai đường dẫn, tôi muốn được hướng dẫn quét mã QR trên bàn và có lối vào màn hình quầy / quản lý, để không bị kẹt ở trang trắng. | AC-001-07, AC-001-08 | — | UC-01 | MOD-TABLE | SCR-43, SCR-44 | F-001 | DONE |
| US-002-1 | Must | ACT-GUEST | Là khách, tôi muốn xem menu theo danh mục với giá rõ ràng và biết món nào đang hết, để chọn món mà không phải hỏi nhân viên. | AC-002-01, AC-002-03, AC-002-05, AC-002-06 | — | UC-02 | MOD-MENU, MOD-NOTIFY | SCR-02 | F-002 | DONE |
| US-002-2 | Must | ACT-GUEST | Là khách, tôi muốn thêm món vào giỏ, chỉnh số lượng, ghi chú từng món và giỏ không mất khi tải lại trang, để gửi đúng yêu cầu của mình chỉ trong vài thao tác. | AC-002-02, AC-002-04 | — | UC-02 | MOD-ORDER, MOD-MENU | SCR-02, SCR-03 | F-002 | DONE |
| US-003-1 | Must | ACT-GUEST | Là khách, tôi muốn gửi đơn từ giỏ và gọi thêm đơn trong cùng lượt ngồi, để quầy nhận món mà tôi không phải ra quầy gọi. | AC-003-01, AC-003-06, AC-003-07, AC-003-09 | BR-011, BR-012, BR-015, BR-020 | UC-02 | MOD-ORDER, MOD-INVENTORY, MOD-NOTIFY | SCR-03, SCR-05 | F-003 | DONE |
| US-003-2 | Must | ACT-GUEST | Là khách, tôi muốn được báo ngay món nào vừa hết khi gửi đơn và đơn không bị nhận dở dang, để chọn món khác thay vì chờ món quán không làm được. | AC-003-02, AC-003-08 | BR-001, BR-009, BR-010 | UC-02 | MOD-ORDER, MOD-INVENTORY | SCR-03 | F-003 | DONE |
| US-003-3 | Must | ACT-ADMIN | Là chủ quán, tôi muốn đơn của khách luôn tính theo giá niêm yết, không vượt tồn kho kể cả khi nhiều bàn đặt cùng lúc, và chỉ người trong lượt ngồi mới đặt được vào lượt đó, để không thất thoát tiền và hàng. | AC-003-03, AC-003-04, AC-003-05 | BR-001, BR-009, BR-010, BR-012 | UC-02 | MOD-ORDER, MOD-INVENTORY | SCR-03 | F-003 | DONE |
| US-004-1 | Must | ACT-GUEST | Là khách, tôi muốn thấy trạng thái từng đơn (chờ xác nhận, đang chuẩn bị, đã xong) và tổng tạm tính tự cập nhật, kể cả sau khi mất mạng, để biết lúc nào ra nhận món mà không phải hỏi quầy. | AC-004-01, AC-004-02, AC-004-04, AC-004-05 | — | UC-02 | MOD-ORDER, MOD-NOTIFY | SCR-05 | F-004 | DONE |
| US-004-2 | Must | ACT-GUEST | Là khách, tôi muốn trạng thái và tổng tiền đơn của nhóm mình không hiện trên điện thoại của nhóm khác, để giữ riêng tư khi ngồi chung quán. | AC-004-03 | — | UC-02 | MOD-NOTIFY, MOD-ORDER | SCR-05 | F-004 | DONE |
| US-005-1 | Must | ACT-GUEST | Là khách, tôi muốn bấm gọi thanh toán trên điện thoại và thấy số tiền phải trả, để nhân viên ra bàn thu tiền mà tôi không phải vẫy gọi hay ra quầy. | AC-005-01, AC-005-04, AC-005-06 | BR-018 | UC-04 | MOD-BILLING, MOD-NOTIFY | SCR-04, SCR-05, SCR-10 | F-005 | DONE |
| US-005-2 | Must | ACT-STAFF | Là nhân viên quầy, tôi muốn chỉ nhận yêu cầu thanh toán từ lượt ngồi còn mở, đã có món và do chính khách của lượt đó gửi, để không ra bàn vô ích. | AC-005-02, AC-005-03, AC-005-05 | BR-018, BR-020 | UC-04 | MOD-BILLING | SCR-04, SCR-05, SCR-10 | F-005 | DONE |
| US-006-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn xem tổng phải thu của bàn, nhập tiền khách đưa để biết tiền thừa và xác nhận đã thu để đóng bàn, để thu tiền mặt tại bàn không nhầm lẫn và doanh thu ghi đúng ngày thu. | AC-006-01, AC-006-06, AC-006-07, AC-006-08 | BR-007, BR-019 | UC-04 | MOD-BILLING, MOD-TABLE, MOD-REPORT | SCR-10, SCR-14, SCR-12 | F-006 | DONE |
| US-006-2 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn in phiếu tạm tính trước khi thu và hóa đơn chính thức sau khi thu, để khách kiểm tra món trước khi trả tiền và nhận hóa đơn đúng. | AC-006-04 | BR-014 | UC-04 | MOD-BILLING | SCR-14, SCR-12 | F-006 | DONE |
| US-006-3 | Must | ACT-ADMIN | Là chủ quán, tôi muốn mỗi lượt ngồi chỉ được thu tiền một lần, chỉ khi không còn đơn chờ tiếp nhận và chỉ bởi nhân viên đang hoạt động, để không thu trùng, thu sót món hay bị người ngoài đóng bàn. | AC-006-02, AC-006-03, AC-006-05 | BR-007, BR-019 | UC-04 | MOD-BILLING, MOD-AUTH | SCR-14 | F-006 | DONE |
| US-007-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn đơn mới và bàn gọi thanh toán hiện trên màn quầy kèm âm báo riêng, kể cả các yêu cầu đến lúc mất mạng, để không bỏ sót đơn hay bàn đang chờ. | AC-007-01, AC-007-05, AC-007-06 | — | UC-03, UC-04 | MOD-ORDER, MOD-NOTIFY | SCR-10, SCR-14 | F-007 | DONE |
| US-007-2 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn tiếp nhận và hoàn tất từng đơn, để khách biết món đang làm hay đã xong và kho trừ đúng nguyên liệu đã dùng. | AC-007-02, AC-007-03, AC-007-08 | BR-001, BR-010, BR-013 | UC-03 | MOD-ORDER, MOD-INVENTORY, MOD-NOTIFY | SCR-10, SCR-11 | F-007 | DONE |
| US-007-3 | Must | ACT-ADMIN | Là chủ quán, tôi muốn mỗi đơn chỉ bị trừ kho một lần dù nhiều máy cùng bấm hoàn tất, và người không đăng nhập không đổi được trạng thái đơn, để tồn kho luôn đúng. | AC-007-04, AC-007-07, AC-007-09 | BR-002 | UC-03 | MOD-ORDER, MOD-INVENTORY, MOD-AUTH | SCR-10, SCR-11 | F-007 | DONE |
| US-008-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn chọn món, nhập tiền khách đưa và thu tiền in hóa đơn trên một màn riêng, để phục vụ khách mua mang đi mà không cần mở bàn. | AC-008-01, AC-008-04 | BR-006, BR-009 | UC-05 | MOD-ORDER, MOD-BILLING, MOD-INVENTORY | SCR-13, SCR-12, SCR-10 | F-008 | DONE |
| US-008-2 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn bị chặn tạo đơn mang đi khi chưa nhập đủ tiền khách đưa hoặc kho không đủ, và chỉ tài khoản quầy mới tạo được loại đơn này, để không có đơn mang đi chưa thu tiền hay không làm được. | AC-008-02, AC-008-03, AC-008-05 | BR-006, BR-007, BR-009 | UC-05 | MOD-ORDER, MOD-BILLING, MOD-AUTH | SCR-13 | F-008 | DONE |
| US-009-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên, tôi muốn đăng nhập bằng tài khoản riêng và chỉ dùng được chức năng đúng vai trò của mình, để làm việc ở quầy mà không đụng tới phần quản trị. | AC-009-01, AC-009-04, AC-009-06 | BR-044 | UC-17 | MOD-AUTH | SCR-09, SCR-10 | F-009 | DONE |
| US-009-2 | Must | ACT-ADMIN | Là quản lý, tôi muốn tạo, sửa, khóa, đặt lại mật khẩu và xóa tài khoản nhân viên, để chỉ người đang làm việc mới vào được hệ thống. | AC-009-02, AC-009-03, AC-009-05, AC-009-07 | BR-004, BR-017 | UC-17 | MOD-AUTH | SCR-20 | F-009 | DONE |
| US-010-1 | Must | ACT-ADMIN | Là quản lý, tôi muốn thêm, sửa, xóa món và danh mục, đổi giá và bật tắt "hết món", để menu khách thấy luôn khớp với những gì quán đang bán. | AC-010-01, AC-010-02, AC-010-05, AC-010-06, AC-010-07 | — | UC-14 | MOD-MENU, MOD-NOTIFY | SCR-21, SCR-02 | F-010 | DONE |
| US-010-2 | Must | ACT-ADMIN | Là quản lý, tôi muốn tạo bàn, in mã QR và tạo lại mã khi cần, để khách quét đúng bàn và mã cũ bị lộ không dùng được nữa. | AC-010-03, AC-010-04, AC-010-05, AC-010-08 | — | UC-01 | MOD-TABLE | SCR-22, SCR-01 | F-010 | DONE |
| US-011-1 | Must | ACT-ADMIN | Là quản lý, tôi muốn khai báo định lượng nguyên liệu cho từng món, để mỗi phần bán ra trừ đúng nguyên liệu đã dùng. | AC-011-01, AC-011-02 | BR-003 | UC-14 | MOD-INVENTORY, MOD-MENU | SCR-24 | F-011 | DONE |
| US-011-2 | Must | ACT-ADMIN | Là quản lý, tôi muốn xem tồn kho, phần đang giữ cho đơn, cảnh báo sắp hết và điều chỉnh kho tay kèm lý do, để biết khi nào cần nhập hàng và sửa sai lệch có dấu vết. | AC-011-03, AC-011-04, AC-011-05, AC-011-06 | BR-001, BR-010, BR-016 | UC-13 | MOD-INVENTORY | SCR-23, SCR-25 | F-011 | DONE |
| US-012-1 | Must | ACT-ADMIN | Là quản lý, tôi muốn xem doanh thu, số hóa đơn, món bán chạy theo khoảng ngày và lịch sử đơn, để biết quán bán được bao nhiêu và món nào bán tốt. | AC-012-01, AC-012-03 | BR-005 | UC-16 | MOD-REPORT | SCR-25 | F-012 | DONE |
| US-012-2 | Must | ACT-ADMIN | Là quản lý, tôi muốn báo cáo chỉ nhận khoảng ngày hợp lệ và chỉ tài khoản quản lý mới xem được, để số liệu không sai và nhân viên không xem doanh thu của quán. | AC-012-02, AC-012-04 | BR-005, BR-044 | UC-16 | MOD-REPORT, MOD-AUTH | SCR-25 | F-012 | DONE |
| US-013-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn tạo nhóm tùy chọn (size, đường, đá, topping) có phụ thu và định lượng thêm rồi gán cho món, để bán đúng giá và trừ đúng nguyên liệu cho từng lựa chọn. | AC-013-01, AC-013-03 | BR-011, BR-021 | UC-14 | MOD-MENU, MOD-INVENTORY | SCR-30, SCR-21 | F-013 | DONE |
| US-013-2 | Should | ACT-GUEST, ACT-STAFF | Là khách, tôi muốn chọn size, topping khi gọi món và thấy giá cộng thêm, để nhận đúng ly mình muốn và quầy pha đúng. | AC-013-02, AC-013-04 | BR-021 | UC-02, UC-05, UC-08 | MOD-MENU, MOD-ORDER | SCR-02, SCR-03, SCR-13, SCR-16, SCR-12 | F-013 | DONE |
| US-014-1 | Should | ACT-GUEST, ACT-MEMBER, ACT-STAFF | Là khách, tôi muốn đăng ký hội viên bằng số điện thoại và họ tên khi tôi đồng ý, để được giảm giá đơn đầu và ưu đãi theo hạng ở những lần sau. | AC-014-01, AC-014-02, AC-014-07 | BR-021, BR-024, BR-025 | UC-10, UC-04 | MOD-LOYALTY, MOD-BILLING | SCR-03, SCR-05, SCR-14, SCR-13, SCR-12 | F-014 | DONE |
| US-014-2 | Should | ACT-MEMBER | Là hội viên, tôi muốn hạng của mình tự nâng theo tổng chi tiêu, để được giảm nhiều hơn khi quay lại thường xuyên. | AC-014-03 | BR-025 | UC-10 | MOD-LOYALTY | SCR-14 | F-014 | DONE |
| US-014-3 | Should | ACT-MEMBER | Là hội viên, tôi muốn số điện thoại và tên của mình được che khi hiển thị, không bị dò hàng loạt và được xóa khi tôi yêu cầu, để thông tin cá nhân không bị lộ. | AC-014-04, AC-014-05, AC-014-08 | BR-024 | UC-10 | MOD-LOYALTY | SCR-03, SCR-26 | F-014 | DONE |
| US-014-4 | Should | ACT-ADMIN | Là quản lý, tôi muốn tra cứu, sửa hội viên và chỉnh hạng cùng mức giảm trong trang quản lý mà nhân viên không vào được, để vận hành chương trình hội viên. | AC-014-06 | BR-024, BR-044 | UC-10 | MOD-LOYALTY, MOD-AUTH | SCR-26 | F-014 | DONE |
| US-015-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn tạo combo cố định từ các món có sẵn với giá riêng, để bán kèm và tăng giá trị mỗi đơn mà kho vẫn trừ đúng từng món thành phần. | AC-015-01, AC-015-03, AC-015-05, AC-015-06 | BR-011, BR-029 | UC-14 | MOD-MENU, MOD-INVENTORY | SCR-27 | F-015 | DONE |
| US-015-2 | Should | ACT-GUEST, ACT-STAFF | Là khách, tôi muốn thấy combo, số tiền tiết kiệm và biết combo nào đang hết, để chọn combo có lợi mà không đặt phải combo quán không làm được. | AC-015-02, AC-015-04 | BR-009, BR-029 | UC-02, UC-05 | MOD-MENU, MOD-ORDER | SCR-02, SCR-13, SCR-12 | F-015 | DONE |
| US-016-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn tạo khuyến mãi theo món, danh mục hoặc theo đơn với lịch ngày, thứ, giờ và giới hạn lượt mỗi ngày, để chạy giờ vàng và ưu đãi đúng thời điểm mà không phải đổi giá tay. | AC-016-01, AC-016-03, AC-016-06 | BR-022, BR-023 | UC-14 | MOD-MARKETING, MOD-BILLING | SCR-28, SCR-02 | F-016 | DONE |
| US-016-2 | Should | ACT-GUEST, ACT-MEMBER, ACT-STAFF | Là khách, tôi muốn được tự áp khuyến mãi có lợi nhất và không bị cộng dồn sai với ưu đãi hội viên, để trả đúng giá quán đang quảng cáo. | AC-016-02, AC-016-04, AC-016-07 | BR-021, BR-022, BR-023 | UC-02, UC-04 | MOD-BILLING, MOD-MARKETING | SCR-02, SCR-03, SCR-14 | F-016 | DONE |
| US-016-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xem số lượt dùng và tiền đã giảm của từng khuyến mãi, để biết chương trình nào hiệu quả. | AC-016-05 | BR-023 | UC-14, UC-16 | MOD-MARKETING, MOD-REPORT | SCR-28 | F-016 | DONE |
| US-017-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn ghim món muốn đẩy bán và chọn chế độ gợi ý (tự động, ghim hoặc cả hai), để hướng khách tới món mới hoặc món lãi cao. | AC-017-02, AC-017-03 | — | UC-14 | MOD-MENU | SCR-29 | F-017 | DONE |
| US-017-2 | Should | ACT-GUEST | Là khách, tôi muốn thấy mục gợi ý gồm món bán chạy thật và không có món đang hết, để chọn món được nhiều người thích. | AC-017-01, AC-017-04 | — | UC-02 | MOD-MENU | SCR-02 | F-017 | DONE |
| US-018-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn mở ca với tiền đầu ca và đóng ca bằng số tiền đếm thực tế, để biết két thừa hay thiếu so với dự kiến và in phiếu chốt ca bàn giao. | AC-018-02, AC-018-03, AC-018-04 | BR-026 | UC-11 | MOD-SHIFT | SCR-15, SCR-32 | F-018 | DONE |
| US-018-2 | Should | ACT-ADMIN | Là chủ quán, tôi muốn mọi lượt thu tiền và hoàn tiền phải nằm trong một ca đang mở, để tiền của từng ca đối chiếu được với người chịu trách nhiệm. | AC-018-01, AC-018-05 | BR-026 | UC-11, UC-04 | MOD-SHIFT, MOD-BILLING | SCR-15, SCR-14, SCR-13 | F-018 | DONE |
| US-019-1 | Should | ACT-ADMIN, ACT-LEAD | Là quản lý, tôi muốn hoàn toàn bộ hoặc một phần tiền đã thu trong ngày kèm lý do, để xử lý khi khách trả món hoặc thu nhầm mà doanh thu vẫn đúng. | AC-019-01, AC-019-04, AC-019-06 | BR-026, BR-028, BR-046 | UC-07 | MOD-BILLING, MOD-SHIFT, MOD-REPORT | SCR-15, SCR-32 | F-019 | DONE |
| US-019-2 | Should | ACT-STAFF | Là nhân viên quầy, tôi muốn hoàn tiền được khi có quản lý nhập tài khoản duyệt ngay tại quầy, để khách không phải chờ lâu mà vẫn có người chịu trách nhiệm. | AC-019-02, AC-019-07 | BR-028, BR-046 | UC-07 | MOD-BILLING, MOD-AUTH | SCR-15 | F-019 | DONE |
| US-019-3 | Should | ACT-ADMIN, ACT-LEAD | Là quản lý, tôi muốn chọn hoàn kho cho món đã làm nhưng còn dùng được và tự trả phần kho đang giữ cho món chưa làm, để tồn kho đúng sau khi hoàn tiền. | AC-019-03, AC-019-05 | BR-010, BR-028 | UC-07 | MOD-BILLING, MOD-INVENTORY | SCR-15 | F-019 | DONE |
| US-020-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn tạm ngưng nhận đơn qua QR khi quán quá tải hoặc sắp đóng cửa mà vẫn bán mang đi, để không nhận đơn mà quán không kịp làm. | AC-020-01 | BR-030 | UC-19 | MOD-ADMIN, MOD-ORDER, MOD-NOTIFY | SCR-10, SCR-33, SCR-02 | F-020 | DONE |
| US-020-2 | Should | ACT-ADMIN | Là quản lý, tôi muốn đặt giờ bán cho từng danh mục, để khách chỉ thấy và gọi được món trong giờ phục vụ còn quầy vẫn bán được khi cần. | AC-020-02, AC-020-04 | BR-030 | UC-19 | MOD-MENU | SCR-21, SCR-02 | F-020 | DONE |
| US-020-3 | Should | ACT-GUEST | Là khách, tôi muốn món tự hiện "hết món" khi quán hết nguyên liệu và tự bán lại khi có hàng, để không gọi phải món quán không làm được. | AC-020-03 | BR-009, BR-010 | UC-02 | MOD-MENU, MOD-INVENTORY, MOD-NOTIFY | SCR-02 | F-020 | DONE |
| US-021-1 | Should | ACT-GUEST | Là khách, tôi muốn gọi nhân viên kèm yêu cầu (nước lọc, thêm đá, khăn giấy, dọn bàn) từ điện thoại, để được phục vụ mà không phải đứng dậy gọi. | AC-021-01, AC-021-02, AC-021-04 | — | UC-18 | MOD-TABLE, MOD-NOTIFY | SCR-05, SCR-10 | F-021 | DONE |
| US-021-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn thấy yêu cầu gọi theo bàn kèm âm báo riêng và đánh dấu đã xử lý, để không bỏ sót và không hai người cùng ra một bàn. | AC-021-03 | — | UC-18 | MOD-TABLE, MOD-NOTIFY | SCR-10, SCR-05 | F-021 | DONE |
| US-022-1 | Should | ACT-STAFF, ACT-LEAD | Là nhân viên quầy, tôi muốn giảm giá tay trên hóa đơn (theo số tiền hoặc phần trăm) kèm lý do trong ngưỡng cho phép, để xử lý khách quen hoặc sự cố mà không phải gọi quản lý. | AC-022-01, AC-022-03, AC-022-04 | BR-021, BR-027 | UC-04, UC-05 | MOD-BILLING | SCR-14, SCR-13 | F-022 | DONE |
| US-022-2 | Should | ACT-ADMIN, ACT-LEAD | Là quản lý, tôi muốn mức giảm vượt ngưỡng của nhân viên phải có tài khoản cấp trên duyệt và được lưu người duyệt, để kiểm soát thất thoát do giảm giá. | AC-022-02 | BR-027, BR-045 | UC-04, UC-05 | MOD-BILLING, MOD-AUTH | SCR-14, SCR-13 | F-022 | DONE |
| US-023-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn lập phiếu nhập kho với số lượng và giá nhập, để tồn kho và giá nhập gần nhất cập nhật đúng sau mỗi lần mua hàng. | AC-023-01, AC-023-05 | — | UC-13 | MOD-INVENTORY | SCR-31 | F-023 | DONE |
| US-023-2 | Should | ACT-ADMIN, ACT-LEAD | Là quản lý, tôi muốn kiểm kê theo phiếu nháp rồi chốt, để ghi nhận chênh lệch thực tế mà không bị lệch bởi đơn phát sinh trong lúc đếm. | AC-023-02, AC-023-03, AC-023-06 | BR-001, BR-030 | UC-13 | MOD-INVENTORY | SCR-31, SCR-17 | F-023 | DONE |
| US-023-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xem giá vốn, lãi gộp theo món và giá trị hao hụt trong kỳ, để biết món nào thật sự có lãi. | AC-023-04 | — | UC-16 | MOD-REPORT, MOD-INVENTORY | SCR-31 | F-023 | DONE |
| US-024-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên phục vụ, tôi muốn mở bàn và nhập món giúp khách không quen dùng điện thoại, kể cả khi quán đang tạm ngưng nhận đơn QR, để khách vẫn gọi được món và quầy làm ngay không cần tiếp nhận lại. | AC-024-01, AC-024-02, AC-024-06, AC-024-08, AC-024-09, AC-024-10 | BR-010, BR-031 | UC-08 | MOD-ORDER, MOD-TABLE, MOD-INVENTORY, MOD-NOTIFY | SCR-16, SCR-10 | F-024 | DONE |
| US-024-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên phục vụ, tôi muốn không mở trùng được một bàn đang có nhóm (trừ khi chọn rõ nhóm mới), kể cả khi hai máy cùng bấm, để không gộp nhầm hóa đơn của hai nhóm khách. | AC-024-04, AC-024-05 | BR-031 | UC-08 | MOD-TABLE | SCR-16 | F-024 | DONE |
| US-024-3 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên phục vụ, tôi muốn ghi chú riêng cho lượt khách ở bàn mà khách không thấy, để cả ca nhớ yêu cầu đặc biệt của nhóm khách đó. | AC-024-07 | BR-032 | UC-08 | MOD-TABLE, MOD-NOTIFY | SCR-16, SCR-10, SCR-14 | F-024 | DONE |
| US-024-4 | Should | ACT-GUEST | Là khách ở bàn đã được nhân viên mở, tôi muốn quét QR để vào cùng nhóm, xem và gọi thêm vào các đơn đã gọi, để không phải nhờ nhân viên mỗi lần gọi thêm. | AC-024-03 | BR-008, BR-032 | UC-01, UC-08 | MOD-TABLE, MOD-ORDER | SCR-01, SCR-05 | F-024 | DONE |
| US-025-1 | Should | ACT-GUEST, ACT-STAFF | Là khách, tôi muốn thấy thời gian chờ dự kiến trước khi gửi đơn và trong lúc chờ món, để quyết định gọi món nào và biết khoảng lúc nào có món. | AC-025-01, AC-025-02, AC-025-03, AC-025-06 | BR-035 | UC-02 | MOD-ORDER | SCR-03, SCR-05, SCR-10 | F-025 | DONE |
| US-025-2 | Should | ACT-ADMIN | Là quản lý, tôi muốn nhập thời gian pha chuẩn của món và để thời gian chờ tự tính lại theo thời gian pha thực tế mỗi đêm, để thời gian chờ báo cho khách sát thực tế. | AC-025-04, AC-025-05, AC-025-07 | BR-035 | UC-14 | MOD-ORDER, MOD-JOBS, MOD-MENU | SCR-34, SCR-21 | F-025 | DONE |
| US-026-1 | Should | ACT-GUEST | Là khách ngồi chung nhóm, tôi muốn tự nhận các món của mình trên điện thoại, để mỗi người trả đúng phần mình đã gọi. | AC-026-01, AC-026-07 | BR-036 | UC-06 | MOD-BILLING | SCR-05 | F-026 | DONE |
| US-026-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn thu tiền từng phần (mỗi phần có hội viên và giảm giá riêng) hoặc thu chung, và bàn tự đóng khi phần cuối đã thu, để thu tiền nhóm chia hóa đơn không nhầm. | AC-026-02, AC-026-03, AC-026-05, AC-026-08, AC-026-09 | BR-019, BR-036, BR-037 | UC-06 | MOD-BILLING, MOD-LOYALTY | SCR-14, SCR-12 | F-026 | DONE |
| US-026-3 | Should | ACT-ADMIN | Là chủ quán, tôi muốn tổng các phần luôn bằng tổng hóa đơn và mỗi phần chỉ thu một lần kể cả khi hai máy cùng thu, để không thất thoát hay thu trùng. | AC-026-04, AC-026-06 | BR-037 | UC-06 | MOD-BILLING | SCR-14 | F-026 | DONE |
| US-027-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn khai báo bán thành phẩm (cốt cà phê, syrup…) với công thức một mẻ, để món dùng bán thành phẩm trừ kho và tính giá vốn đúng. | AC-027-03, AC-027-04, AC-027-06 | BR-039 | UC-13 | MOD-INVENTORY | SCR-23 | F-027 | DONE |
| US-027-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn ghi một mẻ sơ chế sau khi xem trước nguyên liệu đủ hay thiếu, để nguyên liệu thô giảm và bán thành phẩm tăng đúng lượng đã pha. | AC-027-01, AC-027-02, AC-027-05, AC-027-07 | BR-001, BR-039 | UC-13 | MOD-INVENTORY | SCR-17 | F-027 | DONE |
| US-028-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn theo dõi nguyên liệu theo lô và hạn dùng, để hàng gần hết hạn được dùng trước và giá vốn theo lô đúng. | AC-028-01, AC-028-02, AC-028-04 | BR-041 | UC-13 | MOD-INVENTORY | SCR-23, SCR-31 | F-028 | DONE |
| US-028-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn được cảnh báo lô sắp hoặc đã hết hạn và hủy lô ngay ở quầy, để hàng hết hạn không được dùng để bán. | AC-028-03 | BR-040, BR-041 | UC-13 | MOD-INVENTORY, MOD-JOBS, MOD-NOTIFY | SCR-17 | F-028 | DONE |
| US-029-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn có đề xuất số lượng cần nhập của từng nguyên liệu tới ngày giao kế tiếp (đã trừ hàng đang về) và tạo đơn đặt hàng từ đề xuất, để đặt đủ hàng mà không tồn kho quá nhiều. | AC-029-01, AC-029-02, AC-029-03, AC-029-04 | BR-043 | UC-13 | MOD-INVENTORY, MOD-JOBS | SCR-35 | F-029 | DONE |
| US-030-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn quản lý nhà cung cấp và lập đơn đặt hàng từ nháp tới gửi hoặc hủy, để đặt hàng có chứng từ và biết hàng nào đang về. | AC-030-03 | BR-042 | UC-13 | MOD-INVENTORY | SCR-35 | F-030 | DONE |
| US-030-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn nhận hàng theo đơn đặt hàng (nhận từng phần, xác nhận khi nhận vượt), để tồn kho cộng đúng số thực nhận. | AC-030-01, AC-030-02, AC-030-05 | BR-042 | UC-13 | MOD-INVENTORY | SCR-17, SCR-35 | F-030 | DONE |
| US-030-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xem lịch sử giá và tỉ lệ giao đúng hạn, đủ hàng của từng nhà cung cấp, để chọn nhà cung cấp tốt. | AC-030-04 | BR-042 | UC-13, UC-16 | MOD-INVENTORY, MOD-REPORT | SCR-35 | F-030 | DONE |
| US-031-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn nhập kho theo đơn vị đóng gói (thùng, hộp) và được quy về đơn vị gốc, để không phải tự đổi đơn vị và tồn kho không sai số. | AC-031-01, AC-031-05, AC-031-06 | BR-038 | UC-13 | MOD-INVENTORY | SCR-31 | F-031 | DONE |
| US-031-2 | Should | ACT-ADMIN | Là quản lý, tôi muốn giá vốn bình quân của nguyên liệu và giá vốn từng đơn được chốt lúc hoàn tất, để biết giá vốn thực tế của món đã bán và không bị đổi khi giá nhập thay đổi về sau. | AC-031-02, AC-031-03, AC-031-04 | BR-038 | UC-13, UC-16 | MOD-INVENTORY, MOD-REPORT | SCR-23, SCR-31 | F-031 | DONE |
| US-032-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn ghi phiếu hủy hàng (đổ vỡ, hỏng, hết hạn) kèm lý do, để tồn kho trừ đúng phần đã bỏ đi. | AC-032-03, AC-032-04, AC-032-05 | BR-040 | UC-13 | MOD-INVENTORY | SCR-17 | F-032 | DONE |
| US-032-2 | Should | ACT-ADMIN | Là quản lý, tôi muốn đặt định mức hao hụt và xem báo cáo thất thoát bất thường theo nguyên liệu, để phát hiện thất thoát vượt mức cho phép. | AC-032-01, AC-032-02 | BR-040 | UC-13, UC-16 | MOD-INVENTORY, MOD-REPORT | SCR-23, SCR-31 | F-032 | DONE |
| US-033-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn ghi khoản chi hoặc thu tiền mặt ngoài bán hàng kèm ảnh hóa đơn vào ca đang mở, để tiền két khớp khi đóng ca. | AC-033-01, AC-033-03, AC-033-05, AC-033-07, AC-033-08 | BR-048, BR-050, BR-051 | UC-11 | MOD-SHIFT | SCR-15 | F-033 | DONE |
| US-033-2 | Should | ACT-LEAD, ACT-ADMIN | Là trưởng ca, tôi muốn duyệt hoặc từ chối khoản chi lớn trong hạn mức của mình (không tự duyệt khoản mình tạo), để mọi khoản chi lớn đều có người thứ hai kiểm soát. | AC-033-02, AC-033-04, AC-033-06 | BR-048, BR-049, BR-050 | UC-11 | MOD-SHIFT, MOD-AUTH | SCR-15 | F-033 | DONE |
| US-033-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xem sổ quỹ theo ngày, loại, danh mục, trạng thái, xem tổng theo danh mục và xuất danh sách ra file, để đối chiếu chi phí vận hành và lưu chứng từ ngoài ứng dụng. | AC-033-09, AC-033-10 | BR-048 | UC-11, UC-16 | MOD-SHIFT, MOD-REPORT | SCR-36 | F-033 | DONE |
| US-034-1 | Should | ACT-ADMIN | Là chủ quán, tôi muốn xem lãi lỗ ước tính (doanh thu thuần, giá vốn, chi quỹ, chi phí cố định phân bổ) và doanh thu hòa vốn mỗi ngày, chỉ tài khoản quản lý xem được, để biết quán đang lời hay lỗ. | AC-034-01, AC-034-03, AC-034-04, AC-034-05 | BR-044, BR-056 | UC-16 | MOD-REPORT | SCR-39 | F-034 | DONE |
| US-034-2 | Should | ACT-ADMIN | Là chủ quán, tôi muốn khai báo chi phí cố định hằng tháng có ngày hiệu lực, để lãi lỗ trừ đúng chi phí cho từng ngày, từng tháng. | AC-034-02, AC-034-06 | BR-056 | UC-16 | MOD-REPORT | SCR-39 | F-034 | DONE |
| US-035-1 | Should | ACT-STAFF, ACT-LEAD | Là nhân viên quầy, tôi muốn được chấm công tự động khi đăng nhập và kết thúc khi đăng xuất hoặc đóng ca, để không phải ghi giờ làm bằng tay. | AC-035-01, AC-035-06 | BR-052 | UC-12 | MOD-SHIFT, MOD-AUTH, MOD-JOBS | SCR-09, SCR-15 | F-035 | DONE |
| US-035-2 | Should | ACT-LEAD, ACT-ADMIN | Là trưởng ca, tôi muốn sửa hoặc thêm chấm công trong ngày kèm lý do (quản lý sửa được mọi ngày), để giờ công đúng khi nhân viên quên đăng nhập hay đăng xuất. | AC-035-02, AC-035-08 | BR-053 | UC-12 | MOD-SHIFT | SCR-15, SCR-37 | F-035 | DONE |
| US-035-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xếp lịch làm tuần, thấy cảnh báo đi muộn, vắng mặt và xem năng suất từng người, để phân ca hợp lý và theo dõi chuyên cần. | AC-035-05, AC-035-07 | BR-054 | UC-12 | MOD-SHIFT | SCR-37 | F-035 | DONE |
| US-035-4 | Should | ACT-ADMIN | Là chủ quán, tôi muốn mọi thao tác đổi tiền, kho, quyền được ghi nhật ký chỉ đọc (ai, lúc nào, trước và sau) không chứa mật khẩu, để truy được trách nhiệm khi có sai lệch. | AC-035-03, AC-035-04 | BR-055 | UC-17 | MOD-ADMIN, MOD-JOBS | SCR-38 | F-035 | DONE |
| US-036-1 | Should | ACT-ADMIN, ACT-LEAD | Là quản lý, tôi muốn tạo tài khoản Trưởng ca có quyền trung gian (tự duyệt giảm giá trong ngưỡng, hoàn tiền trong ca, điều chỉnh kho, kiểm kê), để giao việc trong ca mà không phải đưa mật khẩu quản lý. | AC-036-03, AC-036-05 | BR-044, BR-045, BR-046 | UC-17 | MOD-AUTH, MOD-BILLING, MOD-INVENTORY | SCR-20, SCR-14, SCR-17 | F-036 | DONE |
| US-036-2 | Should | ACT-ADMIN | Là chủ quán, tôi muốn mỗi chức năng chỉ dùng được theo đúng vai trò (khách, nhân viên, trưởng ca, quản lý), để không ai làm vượt quyền kể cả khi gọi thẳng vào hệ thống. | AC-036-01, AC-036-02 | BR-007, BR-044 | UC-17 | MOD-AUTH | — | F-036 | DONE |
| US-036-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn hệ thống luôn giữ ít nhất một tài khoản quản lý đang hoạt động, để quán không bị khóa khỏi phần quản trị. | AC-036-04 | BR-047 | UC-17 | MOD-AUTH | SCR-20 | F-036 | DONE |
| US-037-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn tạo phân khúc hội viên theo hạng, lần ghé cuối, số lần ghé, chi tiêu, tháng sinh, điểm và xem trước số người (đã loại khách từ chối nhận tin), để nhắm đúng nhóm khách cần chăm sóc. | AC-037-01 | BR-062 | UC-15 | MOD-MARKETING, MOD-LOYALTY | SCR-40, SCR-26 | F-037 | DONE |
| US-037-2 | Should | ACT-ADMIN | Là quản lý, tôi muốn chạy chiến dịch ngay hoặc hẹn giờ, tặng mỗi người một voucher riêng và xuất danh sách gửi tin, đồng thời không làm phiền khách vừa nhận tin gần đây, để kéo khách quay lại. | AC-037-02, AC-037-03, AC-037-05, AC-037-06, AC-037-07, AC-037-08 | BR-062 | UC-15 | MOD-MARKETING, MOD-LOYALTY, MOD-JOBS | SCR-40 | F-037 | DONE |
| US-037-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn xem hiệu quả từng chiến dịch (voucher đã dùng, doanh thu, khách quay lại trong 14 ngày), để biết chiến dịch nào đáng làm tiếp. | AC-037-05 | BR-062 | UC-15, UC-16 | MOD-MARKETING, MOD-REPORT | SCR-40 | F-037 | DONE |
| US-037-4 | Could | ACT-ADMIN | Là quản lý, tôi muốn gửi tin chiến dịch qua Zalo OA khi quán đã có tài khoản OA, để khách nhận tin trực tiếp mà không phải gửi tay từng người. | AC-037-04 | BR-062 | UC-15 | MOD-MARKETING, MOD-NOTIFY | SCR-40 | F-037 | DONE |
| US-038-1 | Should | ACT-MEMBER, ACT-GUEST, ACT-STAFF | Là hội viên, tôi muốn giới thiệu bạn đăng ký bằng số điện thoại của tôi, để cả hai cùng nhận voucher sau lần thanh toán đầu của bạn. | AC-038-01, AC-038-02, AC-038-04 | BR-060 | UC-10 | MOD-LOYALTY | SCR-03, SCR-14, SCR-16, SCR-05 | F-038 | DONE |
| US-038-2 | Should | ACT-STAFF, ACT-LEAD, ACT-MEMBER | Là nhân viên quầy, tôi muốn áp mã voucher khi thu tiền và được báo ngay nếu mã đã dùng, hết hạn, không đúng chủ hoặc chưa đạt đơn tối thiểu, để khách được giảm đúng và voucher không bị dùng hai lần. | AC-038-03, AC-038-05, AC-038-07 | BR-057, BR-061 | UC-04, UC-10 | MOD-BILLING, MOD-LOYALTY | SCR-14, SCR-13, SCR-12 | F-038 | DONE |
| US-038-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn tạo voucher tay không gắn hội viên, có giá trị, hạn dùng và đơn tối thiểu, để tặng khách khi cần mà mỗi mã chỉ dùng được một lần. | AC-038-06 | BR-061 | UC-10 | MOD-LOYALTY, MOD-BILLING | SCR-40, SCR-14 | F-038 | DONE |
| US-039-1 | Should | ACT-MEMBER | Là hội viên, tôi muốn được tích điểm theo số tiền thực trả và tích tem theo món mỗi lần thanh toán, để đổi quà hoặc nhận món miễn phí. | AC-039-01, AC-039-02, AC-039-06 | BR-058 | UC-10 | MOD-LOYALTY | SCR-14, SCR-12, SCR-05 | F-039 | DONE |
| US-039-2 | Should | ACT-STAFF, ACT-LEAD, ACT-MEMBER | Là nhân viên quầy, tôi muốn đổi quà bằng điểm hoặc lượt món miễn phí cho hội viên ngay khi thu tiền, để khách dùng quyền lợi tại chỗ mà điểm không bị trừ sai hay trừ hai lần. | AC-039-03, AC-039-04, AC-039-07, AC-039-09 | BR-057, BR-059 | UC-04, UC-10 | MOD-LOYALTY, MOD-BILLING | SCR-14, SCR-13 | F-039 | DONE |
| US-039-3 | Should | ACT-ADMIN | Là quản lý, tôi muốn điểm, quà đã đổi và tem được trả hoặc trừ lại đúng khi hoàn tiền, và điều chỉnh điểm tay có lý do, để sổ điểm của hội viên luôn khớp. | AC-039-05, AC-039-08 | BR-028, BR-059 | UC-07, UC-10 | MOD-LOYALTY, MOD-BILLING | SCR-15, SCR-26 | F-039 | DONE |
| US-040-1 | Should | ACT-ADMIN | Là quản lý, tôi muốn đặt lịch hiện hoặc ẩn món theo khung giờ, ngày trong tuần và mùa, để menu khách tự đổi theo bữa sáng, món mùa mà không phải bật tắt tay. | AC-040-01, AC-040-02, AC-040-03, AC-040-05, AC-040-06 | BR-030, BR-034 | UC-14 | MOD-MENU | SCR-34, SCR-21 | F-040 | DONE |
| US-040-2 | Should | ACT-GUEST, ACT-STAFF | Là khách, tôi muốn chỉ thấy và gọi được món đang trong lịch phục vụ (quầy vẫn bán được món ngoài lịch khi cần), để không gọi phải món quán chưa phục vụ lúc đó. | AC-040-04 | BR-034 | UC-02, UC-05 | MOD-MENU, MOD-ORDER | SCR-02, SCR-13, SCR-16 | F-040 | DONE |
| US-041-1 | Should | ACT-ADMIN | Là chủ quán, tôi muốn thấy món được phân loại theo số lượng bán và lãi mỗi phần kèm gợi ý hành động, và ghim món ngay từ báo cáo, để quyết định giữ giá, đẩy bán hay bỏ món. | AC-041-01, AC-041-02, AC-041-03 | BR-063 | UC-16 | MOD-REPORT, MOD-MENU | SCR-41 | F-041 | DONE |
| US-042-1 | Should | ACT-ADMIN | Là chủ quán, tôi muốn xem giờ cao điểm theo thứ và giờ trong ngày, để xếp người làm đúng lúc đông khách. | AC-042-01, AC-042-05 | BR-064 | UC-16 | MOD-REPORT | SCR-41 | F-042 | DONE |
| US-042-2 | Should | ACT-ADMIN | Là chủ quán, tôi muốn xem dự báo doanh thu 7 ngày tới và so sánh tuần, tháng này với kỳ trước, để lên kế hoạch và biết quán đang tăng hay giảm. | AC-042-02, AC-042-03 | BR-064 | UC-16 | MOD-REPORT | SCR-41 | F-042 | DONE |
| US-042-3 | Should | ACT-ADMIN | Là chủ quán, tôi muốn xem doanh thu theo bàn và các bàn ngồi lâu mà doanh thu thấp, để sắp xếp chỗ ngồi hiệu quả hơn. | AC-042-04 | BR-064 | UC-16 | MOD-REPORT | SCR-41 | F-042 | DONE |
| US-043-1 | Should | ACT-ADMIN | Là chủ quán, tôi muốn một màn "Hôm nay" xem được trên điện thoại gồm doanh thu hôm qua, lệch két, kho cần chú ý, món bán chạy và việc cần làm, để nắm tình hình quán mà không phải mở nhiều báo cáo. | AC-043-01, AC-043-03, AC-043-04 | BR-056, BR-065 | UC-16 | MOD-REPORT, MOD-JOBS | SCR-42 | F-043 | DONE |
| US-043-2 | Should | ACT-LEAD | Là trưởng ca, tôi muốn xem bản rút gọn của màn "Hôm nay" không có giá vốn và lãi, để nắm việc cần làm trong ca mà không thấy số liệu tài chính. | AC-043-02 | BR-044, BR-065 | UC-16 | MOD-REPORT, MOD-AUTH | SCR-42 | F-043 | DONE |
| US-045-1 | Should | ACT-MEMBER, ACT-STAFF | Là hội viên, tôi muốn gọi lại đơn lần trước bằng một chạm (món hết hoặc ngoài lịch được báo rõ, giá theo menu hiện tại), để gọi món quen mà không phải chọn lại từ đầu. | AC-045-01, AC-045-02, AC-045-05 | BR-033 | UC-02, UC-05 | MOD-ORDER, MOD-LOYALTY, MOD-MENU | SCR-02, SCR-13 | F-045 | DONE |
| US-045-2 | Should | ACT-MEMBER | Là hội viên, tôi muốn đánh dấu món yêu thích và thấy các món mình hay gọi, chỉ trên điện thoại đang gắn số của tôi, để chọn món quen mà người khác không xem được thói quen của tôi. | AC-045-03, AC-045-04 | BR-033 | UC-10, UC-02 | MOD-LOYALTY, MOD-MENU | SCR-02 | F-045 | DONE |
| US-046-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn giảm số lượng hoặc xóa món khách gọi nhầm / đổi ý trước khi thu tiền, để bill đúng món khách dùng. | AC-046-01, AC-046-04, AC-046-06, AC-046-07, AC-046-09, AC-046-10 | BR-066, BR-068, BR-069 | UC-09 | MOD-ORDER, MOD-BILLING, MOD-INVENTORY | SCR-14 | F-046 | DONE |
| US-046-2 | Must | ACT-LEAD, ACT-STAFF, ACT-ADMIN | Là trưởng ca, tôi muốn duyệt việc xóa món đã pha / đã tiếp nhận và chọn ghi hủy hàng hay hoàn kho, để kho và báo cáo hao hụt đúng thực tế. | AC-046-02, AC-046-03, AC-046-07, AC-046-08 | BR-067, BR-068 | UC-09 | MOD-ORDER, MOD-INVENTORY, MOD-AUTH | SCR-14 | F-046 | DONE |
| US-046-3 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn hủy cả lượt phục vụ của bàn khi khách bỏ về / mở nhầm bàn, để bàn trống lại cho khách mới. | AC-046-05 | BR-067, BR-068, BR-070 | UC-09 | MOD-ORDER, MOD-TABLE, MOD-INVENTORY | SCR-14, SCR-10 | F-046 | DONE |
| US-047-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên nhập món giúp khách tại bàn, tôi muốn gắn SĐT hội viên (hoặc đăng ký nhanh) ngay lúc gọi món, để khách được tích điểm / ưu đãi mà không phải đợi tới lúc thu tiền. | AC-047-01, AC-047-02, AC-047-06 | BR-024, BR-071 | UC-08, UC-10 | MOD-LOYALTY, MOD-TABLE, MOD-NOTIFY | SCR-16 | F-047 | DONE |
| US-047-2 | Must | ACT-MEMBER | Là hội viên, tôi muốn xem điểm, lịch sử điểm, thẻ tem, quà đổi được và voucher của mình (giá trị, hạn dùng, từ chiến dịch nào) trên điện thoại khi ngồi ở quán, để biết mình đang có quyền lợi gì và dùng trước khi hết hạn. | AC-047-03, AC-047-04 | BR-072 | UC-10 | MOD-LOYALTY | SCR-03, SCR-05 | F-047 | DONE |
| US-047-3 | Must | ACT-MEMBER | Là hội viên, tôi muốn bill ghi điểm hiện có và voucher còn hạn, để biết quyền lợi sau khi thanh toán. | AC-047-05 | BR-073 | UC-04, UC-10 | MOD-BILLING, MOD-LOYALTY | SCR-12 | F-047 | DONE |
| US-048-1 | Must | ACT-ADMIN | Là quản lý, tôi muốn sửa phiếu nhập kho đã lưu (nguyên liệu, số lượng, giá, nhà cung cấp, ghi chú), để tồn kho và giá vốn đúng với hóa đơn thật khi lỡ nhập sai. | AC-048-01, AC-048-03, AC-048-04, AC-048-05, AC-048-06, AC-048-11 | BR-074, BR-075 | UC-13 | MOD-INVENTORY, MOD-ADMIN | SCR-31 | F-048 | DONE |
| US-048-2 | Must | ACT-ADMIN | Là quản lý, tôi muốn hủy phiếu nhập nhập nhầm mà vẫn giữ lịch sử, để kho trở lại như trước và vẫn đối soát được ai hủy, vì sao. | AC-048-02, AC-048-04, AC-048-06, AC-048-10, AC-048-11 | BR-074, BR-075 | UC-13 | MOD-INVENTORY, MOD-ADMIN | SCR-31 | F-048 | DONE |
| US-048-3 | Must | ACT-LEAD, ACT-ADMIN | Là trưởng ca / quản lý, tôi muốn sửa phiếu kiểm kê nháp (thêm / bớt nguyên liệu, ghi chú) và xóa nháp ngay từ danh sách, để không phải tạo lại phiếu khi chọn thiếu / thừa nguyên liệu. | AC-048-07, AC-048-11 | BR-076 | UC-13 | MOD-INVENTORY, MOD-ADMIN | SCR-31, SCR-17 | F-048 | DONE |
| US-048-4 | Must | ACT-ADMIN | Là quản lý, tôi muốn hủy phiếu kiểm kê đã chốt bị đếm sai, để tồn kho trở lại như trước khi chốt và báo cáo hao hụt không tính phiếu sai. | AC-048-08, AC-048-09, AC-048-10, AC-048-11 | BR-077 | UC-13 | MOD-INVENTORY, MOD-ADMIN | SCR-31 | F-048 | DONE |
| US-049-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên quầy, tôi muốn chuyển cả nhóm khách sang bàn khác (kể cả bàn đang có nhóm khác) mà đơn, chia bill, hội viên vẫn giữ nguyên, để khách đổi chỗ không phải gọi lại món hay tính tiền nhầm bàn. | AC-049-01, AC-049-02, AC-049-03, AC-049-04 | BR-078 | UC-03, UC-04 | MOD-TABLE, MOD-ORDER, MOD-NOTIFY | SCR-10 | F-049 | DONE |
| US-049-2 | Must | ACT-GUEST, ACT-MEMBER | Là khách, tôi muốn điện thoại của mình tự theo nhóm sang bàn mới, để vẫn gọi thêm món, theo dõi đơn và gọi thanh toán bình thường. | AC-049-05 | BR-078 | UC-01, UC-02 | MOD-TABLE, MOD-NOTIFY | SCR-02, SCR-05 | F-049 | DONE |
| US-050-1 | Must | ACT-LEAD, ACT-ADMIN | Là trưởng ca, tôi muốn hủy một khoản chi / thu đã duyệt bị ghi nhầm mà vẫn giữ lịch sử, để tiền dự kiến trong két đúng trước khi chốt ca. | AC-050-01, AC-050-03, AC-050-04, AC-050-05 | BR-079, BR-080 | UC-11 | MOD-SHIFT, MOD-ADMIN | SCR-15, SCR-36 | F-050 | DONE |
| US-050-2 | Must | ACT-LEAD, ACT-ADMIN | Là trưởng ca, tôi muốn sửa số tiền / danh mục / nội dung của khoản đã duyệt trong một thao tác, để không phải hủy rồi ghi lại bằng tay. | AC-050-02, AC-050-05 | BR-079, BR-080 | UC-11 | MOD-SHIFT | SCR-15, SCR-36 | F-050 | DONE |
| US-051-1 | Must | ACT-GUEST, ACT-MEMBER | Là khách, tôi muốn chấm sao từng món và góp ý ngay trên điện thoại sau khi thanh toán, để quán biết món nào ngon / chưa ngon. | AC-051-01, AC-051-02, AC-051-06 | BR-081 | UC-04 | MOD-ORDER, MOD-MENU | SCR-05 | F-051 | DONE |
| US-051-2 | Must | ACT-STAFF, ACT-LEAD | Là nhân viên quầy, tôi muốn được báo ngay khi khách chấm món thấp, để ra hỏi han và xử lý khi khách còn ở quán. | AC-051-03, AC-051-06 | BR-082 | UC-03 | MOD-NOTIFY | SCR-10 | F-051 | DONE |
| US-051-3 | Must | ACT-ADMIN | Là quản lý, tôi muốn xem sao trung bình và góp ý theo từng món trong khoảng ngày, để điều chỉnh công thức / menu. | AC-051-04, AC-051-06 | BR-081 | UC-16 | MOD-REPORT | SCR-45 | F-051 | DONE |
| US-051-4 | Must | ACT-GUEST | Là khách, tôi muốn thấy sao trung bình của món trên menu, để chọn món được nhiều người khen. | AC-051-05, AC-051-06 | BR-083 | UC-02 | MOD-MENU | SCR-02, SCR-33 | F-051 | DONE |
| US-052-1 | Must | ACT-ADMIN | Là quản lý (người bảo trì app), tôi muốn tra cứu mọi API đang chạy cùng quyền cần có và request / response ngay trong trang Quản lý, để biết gọi API nào, cần đăng nhập vai gì mà không phải đọc code. | AC-052-01, AC-052-02, AC-052-03, AC-052-05 | BR-084 | UC-17 | MOD-ADMIN | SCR-46 | F-052 | DONE |
| US-052-2 | Must | ACT-ADMIN | Là chủ quán, tôi muốn chỉ tài khoản quản lý xem được danh sách API, để nhân viên hay người ngoài không dò được các chức năng quản trị. | AC-052-04 | BR-084 | UC-17 | MOD-ADMIN, MOD-AUTH | SCR-46 | F-052 | DONE |
| US-053-1 | Must | ACT-ADMIN | Là chủ quán, tôi muốn đổi tên quán và địa chỉ ngay trong trang Cài đặt, để menu khách, màn quầy và hóa đơn hiện đúng tên mà không phải sửa tệp cấu hình rồi khởi động lại app. | AC-053-01, AC-053-02, AC-053-03, AC-053-04, AC-053-05 | BR-085 | UC-17 | MOD-ADMIN, MOD-AUTH | SCR-33 | F-053 | DONE |
| US-054-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là chủ quán, tôi muốn người mở ca phải đếm tiền và đóng ca rồi mới đăng xuất được, để ca nào cũng có người chịu trách nhiệm và chênh lệch két được ghi lại trước khi người đó về. | AC-054-01, AC-054-02, AC-054-03, AC-054-04 | BR-086 | UC-11 | MOD-SHIFT, MOD-AUTH | SCR-15 | F-054 | DONE |
| US-055-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là chủ quán, tôi muốn quầy phải mở ca rồi mới nhận và xử lý đơn, để mọi đơn, mọi lần trừ kho đều thuộc một ca có người chịu trách nhiệm. | AC-055-03, AC-055-04, AC-055-05 | BR-087 | UC-03, UC-11 | MOD-ORDER, MOD-SHIFT | SCR-10, SCR-14, SCR-16 | F-055 | DONE |
| US-055-2 | Must | ACT-GUEST, ACT-MEMBER | Là khách, tôi muốn biết ngay khi quán chưa mở ca (vẫn xem được menu), để không gửi đơn rồi chờ mà không ai làm. | AC-055-01, AC-055-02, AC-055-05 | BR-087 | UC-02 | MOD-ORDER, MOD-NOTIFY | SCR-02, SCR-03 | F-055 | DONE |
| US-056-1 | Must | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên thu ngân, tôi muốn chọn "Chuyển khoản" khi khách chuyển tiền, để lượt thu được ghi đúng và không bị tính vào tiền mặt trong két. | AC-056-01, AC-056-04, AC-056-06 | BR-088 | UC-04 | MOD-BILLING | SCR-14, SCR-13 | F-056 | DONE |
| US-056-2 | Must | ACT-LEAD, ACT-ADMIN | Là trưởng ca / chủ quán, tôi muốn tiền dự kiến trong két chỉ gồm tiền mặt và thấy riêng tổng chuyển khoản, để đóng ca không bị "thiếu tiền" giả và phát hiện được thất thoát thật. | AC-056-02, AC-056-03, AC-056-05 | BR-089 | UC-11 | MOD-SHIFT, MOD-REPORT | SCR-15, SCR-21, SCR-12 | F-056 | DONE |
| US-057-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên thu ngân, tôi muốn thu một lần cho một nhóm khách ngồi nhiều bàn (hoặc nhiều nhóm muốn trả chung), để in một bill và đóng tất cả các bàn cùng lúc. | AC-057-01, AC-057-02, AC-057-03, AC-057-04, AC-057-05 | BR-090 | UC-04 | MOD-BILLING, MOD-TABLE | SCR-14, SCR-12, SCR-05 | F-057 | DONE |
| US-058-1 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên thu ngân, tôi muốn tách một số món ra hóa đơn riêng chỉ bằng vài lần tích chọn, để khách trả riêng (kể cả trả bằng cách khác) mà không phải đổi từng món. | AC-058-01, AC-058-02, AC-058-03 | BR-091 | UC-04 | MOD-BILLING | SCR-14 | F-058 | DONE |
| US-059-1 | Should | ACT-ADMIN, ACT-GUEST | Là chủ quán, tôi muốn in QR Wi-Fi cạnh QR gọi món trên mỗi bàn, để khách quét một lần là vào được Wi-Fi của quán rồi gọi món, không phải hỏi và gõ mật khẩu. | AC-059-01, AC-059-02, AC-059-03, AC-059-04 | BR-092 | UC-17 | MOD-ADMIN | SCR-33, SCR-22 | F-059 | DONE |
| US-060-1 | Should | ACT-ADMIN | Là chủ quán, tôi muốn app tự phát hiện các thao tác dễ gây thất thoát (lệch két, chuyển khoản lạ, hủy món đã pha, hoàn tiền, giảm giá tay, sửa sổ quỹ) và gửi email cho tôi, để biết ngay mà không phải tự soi sổ mỗi ngày. | AC-060-02, AC-060-03, AC-060-04, AC-060-06, AC-060-07, AC-060-08, AC-060-09 | BR-093, BR-094, BR-095 | UC-11, UC-16 | MOD-SHIFT, MOD-REPORT | SCR-47, SCR-15 | F-060 | DONE |
| US-060-2 | Should | ACT-ADMIN | Là chủ quán, tôi muốn tự đổi email nhận cảnh báo trong Cài đặt và được báo khi ai đó đổi nó, để không ai giấu được cảnh báo. | AC-060-01, AC-060-05, AC-060-09, AC-060-10 | BR-094, BR-095 | UC-17 | MOD-ADMIN | SCR-33 | F-060 | DONE |
| US-061-1 | Should | ACT-ADMIN | Là chủ quán mới dùng app, tôi muốn menu quản lý chỉ hiện những mục cần cho việc bán hàng hằng ngày và tự bật thêm khi cần, để không bị ngợp bởi hàng chục trang chưa dùng tới. | AC-061-01, AC-061-02, AC-061-03, AC-061-05 | BR-096 | UC-17 | MOD-ADMIN, MOD-AUTH | SCR-33, SCR-10 | F-061 | DONE |
| US-061-2 | Should | ACT-STAFF, ACT-LEAD, ACT-ADMIN | Là nhân viên mới, tôi muốn lần đầu vào màn quầy được chỉ từng bước mở ca, nhận đơn, hoàn tất, thu tiền, đóng ca ngay trên màn thật, để làm được việc mà không cần người kèm. | AC-061-04, AC-061-05 | BR-097 | UC-03, UC-11 | MOD-AUTH, MOD-ORDER | SCR-10 | F-061 | DONE |
| US-062-1 | Should | ACT-GUEST, ACT-MEMBER, ACT-STAFF | Là khách được mời đăng ký hội viên bằng số điện thoại, tôi muốn đọc được quán lưu gì, để làm gì và muốn xóa thì làm sao, để yên tâm đồng ý. | AC-062-01, AC-062-02, AC-062-03 | BR-098 | UC-10 | MOD-LOYALTY | SCR-48, SCR-03, SCR-14, SCR-16 | F-062 | DONE |
| US-063-1 | Should | ACT-ADMIN, ACT-STAFF | Là chủ quán, tôi muốn app báo ngay khi mã QR đang dán trên bàn trỏ tới địa chỉ cũ hoặc trỏ localhost, để in lại trước khi khách quét không được. | AC-063-01, AC-063-02, AC-063-03, AC-063-04 | BR-099 | UC-01, UC-17 | MOD-TABLE, MOD-ADMIN | SCR-22, SCR-10 | F-063 | DONE |

## 4. Kiểm tra AC / BR (bước 05)

Đối chiếu điều kiện đạt của bước 05 ("từng AC chuyển được thành test; không còn cụm mơ hồ") và lỗi thường gặp ở bước 04 ("chỉ viết happy path, bỏ qua quyền truy cập, dữ liệu trống và các trường hợp lỗi"). **Đã sửa tại chỗ ngày 20/10/2026 (TASK-057)** trong các FEATURE:

- AC viết lại giữ nguyên ID, cuối dòng có `_(viết lại cho kiểm được — TASK-057, 20/10/2026)_`.
- AC mới đánh số tiếp theo trong FEATURE, cuối dòng có `_(bổ sung — TASK-057, 20/10/2026)_`.
- Chỉ dùng ngưỡng có sẵn trong nguồn: "≤ 2 s" là NFR-001; số liệu lấy đúng dữ liệu mà test hiện có dùng; mã lỗi và HTTP lấy từ code (`ứng-dụng/máy-chủ/src/errors.js`, các service, thủ tục SQL). Không đổi nghĩa nghiệp vụ.
- Bằng chứng test của AC mới nằm trong ma trận TC ([tc-map.md](../chất-lượng/tc-map.md)).

### 4.1. 25 AC mơ hồ — đã viết lại

Không AC nào dùng "đẹp", "dễ", "hợp lý" hay "bảo mật cao". 25 AC sau thiếu ngưỡng đo, thiếu số liệu mong đợi hoặc phụ thuộc ngày chạy; nay đã có điều kiện quan sát được (nguyên văn ở FEATURE):

| AC | Vấn đề cũ | Điều kiện mới (tóm tắt) |
| --- | --- | --- |
| AC-002-05 | "ngay" | ≤ 2 s (NFR-001), không tải lại trang; thẻ món "Hết món" hoặc hiện lại nút thêm |
| AC-004-02 | Không có thời hạn sau khi có mạng | Báo mất kết nối; ≤ 2 s sau khi kết nối lại, thẻ đơn hiện "đã xong, vui lòng nhận tại quầy", không tải lại trang |
| AC-006-04 | "Vừa khổ 80 mm" đánh giá bằng mắt | Khối hóa đơn rộng 80 mm = 302 px CSS (96 dpi), đủ trường; phiếu tạm tính có "TẠM TÍNH"; bản chính thức khi chưa thu → 409 `UNPAID`; máy in thật kiểm ở UAT |
| AC-009-05 | Chỉ nêu ý định | 400 `CANNOT_LOCK_SELF`, tài khoản vẫn hoạt động |
| AC-010-02 | Không có ngưỡng thời gian | ≤ 2 s (NFR-001) |
| AC-012-01 | "Đúng số liệu seed" | 55 hóa đơn, 3.190.000đ, 10 cột ngày, 05/10 = 5 hóa đơn / 290.000đ, bán chạy nhất "Cà phê sữa" |
| AC-012-02 | Ngày cố định 01/12–10/12/2026 | Ngày kết thúc sau hôm nay hoặc `from > to` → nút Xem bị khóa, API 400 `INVALID_RANGE` |
| AC-016-05 | "Thống kê đúng" | Khuyến mãi `MaxUsesPerDay = 1` dùng ở 1 đơn → lượt 1, giảm 5.000đ |
| AC-017-01 | "Xếp đúng" | Cà phê đen 5 > Cà phê sữa 3 > Nước suối 1; đơn `VOIDED` và đơn chưa thu không tính |
| AC-019-01 | "Giảm đúng" | Lượt thu 58.000đ: hoàn 20.000đ → còn 38.000đ; hoàn nốt → `VOIDED`, về 0đ |
| AC-020-01 | "Nhận sự kiện realtime" | ≤ 2 s banner + khóa nút gửi; 503 `STORE_CLOSED`; mang đi 201; bật lại 201 |
| AC-021-01 | Không có ngưỡng thời gian | ≤ 2 s, kèm mã bàn và nội dung |
| AC-021-03 | "Khách được báo" | ≤ 2 s, khách thấy "Nhân viên đã nhận yêu cầu"; bấm lần 2 → 409 `ALREADY_PROCESSED` |
| AC-025-02 | "ETA tăng đúng" | Hàng chờ 6 món: ETA giỏ 1.380 s, ETA phiên 1.200 s |
| AC-026-01 | "Tổng đúng" | 3 phần: Anh A {Cà phê sữa, Bạc xỉu} = 61.000đ, Chị B {Latte}, Chung {Trà đào} |
| AC-026-05 | "Như cũ" | Bỏ chia, 1 lượt thu bằng tổng bàn (ví dụ 35.000đ) |
| AC-028-03 | "Quầy thấy cảnh báo" | Lô hết hạn: tồn +1.000, khả dụng không đổi; hiện ở tab Hạn dùng (−1 ngày); hủy lô → `EXPIRED`, phần hết hạn về 0 |
| AC-029-02 | "An toàn" chưa định lượng | Đề xuất 800 = 1.500 + 300 − 1.000 → 1 gói; đánh dấu sẽ hết trước ngày giao |
| AC-030-04 | "Đúng" | Đúng hạn 100 %, đủ hàng 100 %, 2 dòng lịch sử giá, giá gần nhất 32.000đ/hộp |
| AC-035-05 | "Cập nhật đúng" | `ABSENT` / `LATE` (> 15 phút) / `UPCOMING`; kéo ca thứ Hai → thứ Ba hiện 07:00–15:00 kèm thông báo |
| AC-037-01 | "Đúng tập seed" | 5 hội viên mẫu → đúng {a, b}; 1 người bị loại vì từ chối nhận tin |
| AC-037-02 | "Đúng số dòng, voucher đúng" | {gửi 2, bỏ qua 0, lỗi 0}, 2 voucher, CSV 1 + 2 dòng, 1 dòng nhật ký |
| AC-037-05 | Không có số | `SCHEDULED` → job → `DONE`; hiệu quả {1 voucher, doanh thu lượt đó, 1 khách quay lại} |
| AC-042-02 | "Khớp tính tay" | Bằng Σ phải thu (trừ hoàn) từng tuần; công thức % thay đổi; `partial` |
| AC-045-04 | "Lần sau", "đúng số lượng" | ♥ Latte đọc lại vẫn còn; Cà phê sữa "hay gọi" = 2; bỏ ♥ thì mất |

### 4.2. Ngoại lệ / quyền / dữ liệu trống — đã bổ sung 71 AC

| FEATURE | AC mới | Trường hợp phủ |
| --- | --- | --- |
| F-001 | AC-001-06 | Bàn đã xóa mềm / đang tắt → 404 |
| F-002 | AC-002-06 | Menu rỗng; lỗi mạng + "Thử lại" |
| F-003 | AC-003-07, AC-003-08, AC-003-09 | Phiên đã đóng → 409; món tắt / không tồn tại → 409; số lượng 0 / 51, giỏ trống → 400 |
| F-004 | AC-004-05 | Phiên đã thu → màn cảm ơn |
| F-005 | AC-005-06 | Gọi thêm sau khi gọi thanh toán → phiên về `OPEN` |
| F-006 | AC-006-07, AC-006-08 | Tiền thiếu → 400, tổng lệch → 409; đóng bàn trống |
| F-007 | AC-007-08, AC-007-09 | Hủy đơn chờ (trả kho), hủy đơn đã tiếp nhận → 409; hoàn tất sai trạng thái, tiếp nhận 2 lần → 409 |
| F-009 | AC-009-06, AC-009-07 | Sai mật khẩu → 401; xóa tài khoản (ADR-004) |
| F-010 | AC-010-06, AC-010-07, AC-010-08 | Xóa món đã bán; xóa danh mục còn món; xóa bàn đang có khách |
| F-011 | AC-011-05, AC-011-06 | Xóa nguyên liệu đang dùng / đang giữ; điều chỉnh âm, thiếu lý do |
| F-014 | AC-014-07, AC-014-08 | Không đồng ý → 400, trùng SĐT → 409; gắn vào phiên người khác → 403 |
| F-015 | AC-015-05, AC-015-06 | Combo lồng combo, định lượng cho combo → 400; xóa món thành phần → 409 |
| F-016 | AC-016-06, AC-016-07 | Dữ liệu khuyến mãi sai → 400; mang đi thua lượt cuối → 409 `AMOUNT_CHANGED` |
| F-018 | AC-018-05 | Đóng lại ca đã đóng, bán khi chưa mở ca → 409 |
| F-019 | AC-019-06, AC-019-07 | Quá ngày thu → 409; thiếu lý do → 400, không đăng nhập → 401 |
| F-020 | AC-020-04 | Giờ bán thiếu giờ kết thúc → 400 |
| F-021 | AC-021-04 | Gọi nhân viên khi phiên đã đóng → 409 |
| F-022 | AC-022-04 | Giảm tay lớn hơn số còn phải thu → chặn, phải thu 0đ |
| F-023 | AC-023-05, AC-023-06 | Phiếu nhập trùng dòng / số lượng 0 → 400; kiểm kê thiếu số đếm → 400 |
| F-024 | AC-024-08, AC-024-09, AC-024-10 | Bàn không có / tắt → 404, khách → 401, giỏ trống / ghi chú dài → 400; chống bấm 2 lần; gọi thêm sau gọi thanh toán, phiên đã thu → 409 |
| F-025 | AC-025-06, AC-025-07 | Thiết bị khác xem thời gian chờ → 403; thời gian pha < 10 s → 400 |
| F-026 | AC-026-07, AC-026-08, AC-026-09 | Dòng của người khác → 409 / 403; phần Chung trống → 409; còn đơn chờ tiếp nhận → 409 |
| F-027 | AC-027-06, AC-027-07 | Lồng 4 cấp; nguyên liệu đang kiểm kê → 409 |
| F-030 | AC-030-05 | Nhận hàng PO nháp → 409 |
| F-031 | AC-031-05, AC-031-06 | Đơn vị không quy đổi được → 400; vòng quy đổi → 400, xóa đơn vị đang dùng → 409 |
| F-032 | AC-032-04, AC-032-05 | Lý do ngoài danh sách → 400; nguyên liệu đang kiểm kê → 409 |
| F-033 | AC-033-06, AC-033-07, AC-033-08, AC-033-09, AC-033-10 | Danh mục "Khác", từ chối thiếu lý do; số tiền / lý do / danh mục sai; ca đã đóng → 409; **màn S-36** (tổng, lọc, CSV, trưởng ca → 403); CSV chặn công thức Excel |
| F-034 | AC-034-05, AC-034-06 | Khoảng ngày sai → 400; chi phí cố định sai ngày → 400 |
| F-035 | AC-035-07, AC-035-08 | Năng suất; giờ chấm công ở tương lai / quá 24 giờ → 400 |
| F-037 | AC-037-06, AC-037-07, AC-037-08 | Chạy lại → 409; SMS → 400; sửa / xóa sau khi chạy, xóa phân khúc đang dùng → 409 |
| F-038 | AC-038-06, AC-038-07 | Voucher tay (đơn tối thiểu, hai quầy cùng dùng); mã không tồn tại → 404 |
| F-039 | AC-039-07, AC-039-08, AC-039-09 | Đổi thưởng cùng giảm tay → 400, quà món không có trên bill → 409; điều chỉnh điểm; thiếu hội viên → 400 |
| F-040 | AC-040-06 | Lịch thiếu mục tiêu / thiếu giờ kết thúc → 400 |
| F-042 | AC-042-05 | `from > to` → 400 |
| F-045 | AC-045-05 | Bỏ dòng ngoài lịch / tùy chọn đã đổi |
| F-046 | AC-046-08, AC-046-09, AC-046-10 | Người duyệt sai → 403; tăng số lượng → 400, dòng không có → 404, khách → 401; hai máy cùng xóa |
| F-047 | AC-047-06 | Gỡ hội viên; thiết bị khác → 403; phiên đã đóng → 409 |

59 / 71 AC mới đã có test tự động hiện có chứng minh. **12 AC là GAP (chưa có test)**: AC-002-06, AC-003-09, AC-016-07, AC-021-04, AC-026-09, AC-027-07, AC-032-05, AC-035-08, AC-037-08, AC-039-09, AC-045-05, AC-047-06.

**Không thêm AC riêng (có lý do):**

- **Quyền 401 / 403 của các chức năng chỉ dành cho quản lý** (F-013, F-016, F-017, F-023, F-028, F-029, F-030, F-032, F-040, F-042…): mọi đường dẫn `/api/admin/*` đi qua một chốt quyền chung (`adminRouter.use(requireAdmin)`), các route quầy qua `requireStaff` / `requirePermission`. Đã kiểm chung ở AC-036-01, AC-036-02 (ma trận sinh từ `PERMISSIONS`) và AC-007-07, AC-009-01, AC-010-05, AC-012-04; không lặp lại ở từng FEATURE.
- **F-008 giỏ trống / số lượng ngoài 1..50:** dùng chung kiểm tra dòng giỏ với đơn QR → AC-003-09.
- **F-019 / F-038 — hoàn tiền có trả lại voucher không:** chưa có quyết định (Q-022 mục 6), chưa viết AC.
- **F-040 quy tắc 5** (lịch "Giờ bán — …" chỉ sửa ở trang Thực đơn): hiện chỉ chặn ở giao diện, phía server chưa chặn. Cần chủ dự án quyết định trước khi viết AC.

### 4.3. BR cần lưu ý

- **Ngoại lệ chưa ghi:** BR-014, BR-016, BR-017 có cột "Ngoại lệ" là "—" (các BR khác ghi rõ "Không" hoặc nêu ngoại lệ). Nên ghi "Không" hoặc nêu ngoại lệ cụ thể.
- **Còn PROPOSED** (cần chủ dự án chốt ở Gate G1): BR-011, BR-012, BR-013, BR-015, BR-016, BR-017, BR-020, BR-031, BR-032; chốt một phần: BR-003, BR-014, BR-018, BR-019, BR-044 (Q-022), BR-060 (Q-022).
- **BR-007** đã cập nhật: thêm MANAGER (trưởng ca) vào nhóm được thu tiền (xem 4.5).
- Mọi BR-001…BR-073 đều được ít nhất một story ở mục 3 tham chiếu.

### 4.4. Story có sẵn chưa đúng mẫu

- **US-047-2** thiếu vế "để [giá trị]". Ở file này đã thêm "…, **để biết mình đang có quyền lợi gì và dùng trước khi hết hạn**"; FEATURE-047 (mục User Story) vẫn giữ câu cũ — cần đồng bộ khi duyệt. Không đổi ID.

### 4.5. Nhất quán với quyết định đã duyệt (Gate G1)

Bốn chỗ ghi cũ mâu thuẫn với quyết định sau đã được sửa tại chỗ, giữ lại câu cũ và ghi chú `_(cập nhật 20/10/2026 … — TASK-057)_` (đã đối chiếu code trước khi sửa):

- **FEATURE-014:** điểm không còn cộng trong `sp_ApplyMemberPayment` (1 điểm / 1.000đ); từ migration `0029` là ⌊thực trả / 10.000đ⌋ trong `sp_ApplyLoyalty` (ADR-006 D-27, `pricing.pointsFor`). [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) có thêm một dòng ghi chú dưới bảng quyết định trỏ tới D-27 (không sửa câu D-5).
- **FEATURE-012:** tổng doanh thu = Σ `Payments.AmountDue` theo ngày thu − Σ hoàn tiền theo ngày hoàn (ADR-005 phần Hệ quả, `reportsRepo.revenue`); số hóa đơn loại cả đơn `VOIDED`.
- **BR-007, FEATURE-019:** thêm MANAGER — thu tiền theo quyền `pos.use`; tự hoàn / duyệt hoàn lượt thu trong ca đang mở (ADR-006 D-24, `refundService`, BR-046).
- **FEATURE-006:** "Đóng bàn trống" áp khi phiên không còn đơn nào khác `CANCELLED` (Q-018 / ADR-003, `sp_CloseEmptySession`), không phải chỉ khi "không có đơn nào".

## 5. Tổng hợp

| Chỉ số | Giá trị |
| --- | --- |
| Tổng số story | 144 |
| Must | 54 (F-001…F-012: 28 — gồm US-001-3 cho trang chủ / 404; F-046, F-047: 6; F-048: 4; F-049: 2; F-050: 2; F-051: 4; F-052: 2; F-053: 1; F-054: 1; F-055: 2; F-056: 2) |
| Should | 89 (thêm US-033-3 cho màn S-36, US-038-3 voucher tay; F-057, F-058, F-059: 3; F-060: 2; F-061…F-063: 4) |
| Could | 1 (US-037-4) |
| AC đã ánh xạ / tổng AC trong FEATURE | 375 / 375 (216 có từ trước + 73 bổ sung 20/10/2026 + 11 của F-048, 5 của F-049, 5 của F-050, 6 của F-051 ngày 21/10/2026 + 5 của F-052, 5 của F-053, 4 của F-054, 5 của F-055 ngày 23/10/2026 + 14 của F-056…F-058 ngày 24/10/2026 + 4 của F-059 ngày 26/10/2026 + 10 của F-060 ngày 27/10/2026 + 12 của F-061…F-063 ngày 29/10/2026) |
| AC đã viết lại cho kiểm được | 25 |
| FEATURE có story | 62 / 62 (F-001…F-043, F-045…F-063; không có F-044) |
| FEATURE không có AC nào | 0 |
| BR được tham chiếu | 99 / 99 |
| Màn hình `S-xx` có story | 37 / 37; thêm SCR-43 (trang chủ) và SCR-44 (404) qua US-001-3 |
