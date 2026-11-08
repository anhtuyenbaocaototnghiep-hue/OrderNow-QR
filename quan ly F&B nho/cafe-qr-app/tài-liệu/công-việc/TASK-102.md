# TASK-102 — Tài khoản Chủ quán chỉ dùng trang Quản lý (F-084)
Status: READY_FOR_REVIEW (08/11/2026)
Quyết định: [ADR-043](../quyết-định/ADR-043-chu-quan-chi-quan-ly.md) D-196…D-198 (thay một dòng bảng ADR-035 §4.6) · vòng sửa: [ADR-044](../quyết-định/ADR-044-quan-ly-luon-dang-nhap.md) D-199, D-200; [ADR-045](../quyết-định/ADR-045-mo-quay-tu-trang-quan-ly.md) D-201, D-202 · Feature: [FEATURE-084](../chức-năng/FEATURE-084.md) (US-084-1, AC-084-01…03) · BR-122
Module: MOD-AUTH, MOD-ADMIN · Màn hình: SCR-09 (Đăng nhập quầy), SCR-42 (Hôm nay), SCR-32 (Lịch sử ca), SCR-25 (Báo cáo), SCR-56 (Đăng nhập Quản lý)
Nguồn: chủ dự án 08/11/2026 "với sao admin vẫn có thể vào màn hình quầy vậy" → agent giải thích + đề xuất → chủ dự án (kèm ảnh Hôm nay) "tài khoản admin chỉ ở trong này thôi không có ra màn hình quầy cố định luôn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-102-chu-quan-chi-quan-ly` chồng lên `task/TASK-101-giao-dien-tinh-gon` (chưa gộp `main`) · Kế hoạch: [TASK-102-plan.md](../kế-hoạch/TASK-102-plan.md)

## Mục tiêu
Tài khoản Chủ quán chỉ ở trang Quản lý, không vào được màn hình quầy. Việc chủ quán cần làm vẫn làm được ở trang Quản lý: duyệt chi, nhận hàng, hủy lô, in lại hóa đơn.

## Phạm vi
1. **Máy chủ:** `POST /api/auth/login` — `area` tùy chọn; `area = 'pos'` + ADMIN → `403 OWNER_ADMIN_ONLY` (sau khi đúng mật khẩu).
2. **Giao diện:**
   - `pos-login.js`: gửi `area: 'pos'`; nhận `OWNER_ADMIN_ONLY` → đăng nhập trang Quản lý → Hôm nay.
   - `auth.js`: phiên quầy cũ của chủ quán → phiên Quản lý.
   - `auth-store.js`: trang in `?area=admin` dùng phiên Quản lý.
   - `admin-shell.js`, `admin-shifts.js`: ẩn lối sang quầy cho chủ quán.
   - `admin-today.js`: việc cần làm → trang Quản lý.
   - `admin-reports.js`: in lại `?area=admin`.
3. **Test:**
   - Integration `owner-admin-only.test.js` (AC-084-01).
   - E2E mới (AC-084-02, 03).
   - Sửa E2E cũ:
     - `P` vào trang Quản lý bằng chủ quán, đứng quầy bằng quản lý cửa hàng `quay-ql`;
     - bài F-080 "Vào bằng tài khoản này" đổi sang quản lý cửa hàng;
     - a11y đăng nhập ở `/admin/login`.
4. **Tài liệu:**
   - ADR-043, FEATURE-084, BR-122, US-084-1, UAT-54, tc-map;
   - `roles-permissions.md` (§4.6 + §4.8), `api-contract.md`, `screens-flows.md`;
   - ghi chú ở ADR-035 / ADR-038 / F-080, README;
   - skill `chu-quan-chi-quan-ly` + bản ở thư mục gốc.

## Không được sửa
Quyền của Quản lý cửa hàng / trưởng ca / nhân viên; hộp duyệt ở quầy (`resolveApproval`); dữ liệu `CafeQrDev`; migration.

## Tiêu chí nghiệm thu
AC-084-01…03 (FEATURE-084) + toàn bộ test cũ vẫn đạt.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration. Khởi động lại máy chủ thử nghiệm vì có đổi mã máy chủ.

## Kết quả thực chạy (08/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **469/469 PASS** (55 file; thêm `owner-admin-only.test.js` — 2 test AC-084-01) |
| `npm run test:e2e` | **78/78 PASS** (4,5 phút; thêm bài "máy quầy P đứng bằng quản lý cửa hàng" và E2E AC-084-02/03; bài F-080, a11y quản lý đổi cách đăng nhập) |
| `npm run trace -- --check` | **183 US, 500 AC — PASS 500, FAIL 0, NOT_RUN 0, GAP 0** |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main`; chưa đẩy GitHub. Máy chủ thử nghiệm đã khởi động lại (đổi mã máy chủ).

## Vòng sửa 1 — trang Quản lý luôn phải đăng nhập (08/11/2026, ADR-044)

**Phản hồi chủ dự án** (ảnh trang Đăng nhập Quản lý có thẻ "Máy này đang đăng nhập màn hình quầy: Quản lý (Chủ quán) [Vào bằng tài khoản này]"): "sao bấm nó vào luôn vậy phải đăng nhập hay j chứ bạn làm vậy còn gì là bảo mật nữa".

**Nguyên nhân:**
- F-080 (ADR-038 D-174) cho phiên trang Quản lý "đi theo phiên máy quầy" qua ba lối không cần mật khẩu:
  1. nút "Vào bằng tài khoản này";
  2. nút "Quản lý" của máy quầy (`?from=pos`);
  3. mở `/admin` khi máy đang đăng nhập quầy.
- Bản đầu TASK-102 thêm lối thứ tư: đổi phiên quầy cũ của chủ quán thành phiên Quản lý.
- Ảnh của chủ dự án là phiên quầy cũ của chủ quán còn trong trình duyệt từ trước F-084.

**Sửa:** bỏ cả bốn lối; phiên Quản lý chỉ có được bằng gõ mật khẩu. Chi tiết ở ADR-044.
- Giao diện: `auth-store.js`, `auth.js`, `admin-login.js`, `admin/login.html`, `pos-shell.js`, `admin.css`.
- E2E:
  - nhân viên / trưởng ca đứng quầy mở `/admin/…` → trang Đăng nhập Quản lý;
  - trưởng ca mở Hôm nay qua `/admin/login`;
  - quản lý cửa hàng bấm "Quản lý" → gõ mật khẩu;
  - bài F-080 kiểm không có "Vào bằng tài khoản này";
  - bài F-084 kiểm phiên quầy cũ của chủ quán → `/admin/login?reason=owner`.
- Tài liệu: ADR-044; ghi chú ADR-038 / ADR-043; FEATURE-080 (BR-118, AC-080-03), FEATURE-084 (AC-084-02); BR-122, roles §4.8, sitemap, screens-flows, security-model, tc-map, UAT-54; skill `trang-quan-ly-rieng` và `chu-quan-chi-quan-ly` (+ bản ở thư mục gốc).

**Kết quả thực chạy sau vòng sửa (08/11/2026):** `npm test` **469/469 PASS** · `npm run test:e2e` **78/78 PASS** (4,5 phút) · `npm run trace -- --check` **183 US, 500 AC — PASS 500, GAP 0** · lint, định dạng PASS.

## Vòng sửa 2 — đăng nhập một lần khi đi từ trang Quản lý sang máy quầy (08/11/2026, ADR-045)

**Phản hồi chủ dự án:** đăng nhập bằng tài khoản Quản lý cửa hàng (`nhatanh` trong dữ liệu thử) vào trang Quản lý, bấm sang màn hình quầy thì bị đòi đăng nhập lại: "rất mất thời gian làm một lần thôi". Chủ dự án nhắc thêm: "coi lại cách làm việc… thiếu logic, lướt qua cho xong việc".

**Nhìn lại (vì sao lặp lỗi):**
- Ở F-084 và ADR-044, agent chỉ sửa đúng câu vừa được nói.
- Agent không liệt kê các luồng đăng nhập theo tài khoản thật của chủ dự án: `admin` chủ quán, `nhatanh` quản lý cửa hàng làm cả hai bên, `staff1` / `quangtuyen` nhân viên.
- Agent chỉ dựa vào bộ test do chính mình viết.

Lần này: liệt kê 8 luồng trước khi sửa, sửa theo một nguyên tắc chung (ADR-044 + ADR-045), rồi đi lại từng luồng trên trình duyệt 1920 px.

**Luồng và kết quả mong muốn:**

| # | Tài khoản | Thao tác | Kết quả |
| --- | --- | --- | --- |
| 1 | Quản lý cửa hàng | Đăng nhập trang Quản lý → "Mở màn hình quầy" | Vào quầy ngay, chấm công vào, không hỏi lại |
| 2 | Quản lý cửa hàng | Ở quầy → "Quản lý" | Có phiên Quản lý thì vào ngay; chưa có thì hỏi mật khẩu một lần |
| 3 | Quản lý cửa hàng | Đã có cả hai phiên | Đi qua lại tự do tới khi đăng xuất / hết hạn |
| 4 | Trưởng ca | Hôm nay → "← Màn hình quầy" | Như luồng 1 |
| 5 | Chủ quán | — | Chỉ trang Quản lý; `/pos?from=admin` → trang đăng nhập quầy |
| 6 | Nhân viên | Gõ `/admin` | Trang Đăng nhập Quản lý; đăng nhập → chưa có quyền |
| 7 | Máy quầy đang có người khác | Quản lý bấm "Mở màn hình quầy" | Giữ người đang đứng quầy |
| 8 | Máy còn phiên quầy cũ hết hạn | Quản lý bấm "Mở màn hình quầy" | Vẫn vào thẳng, không bị đòi đăng nhập |

**Sửa:**
- Máy chủ: `POST /api/auth/pos-session` (`userService.startPosSession`).
- Giao diện: `auth.js` (`openPosFromAdmin`, `whoIs`), `admin-shell.js`, `admin-today.js` (`?from=admin`).
- Test: integration AC-080-04; E2E AC-080-05 (luồng 1, 2, 5, 7, 8 ở 1920 px).
- Tài liệu: ADR-045; ghi chú ADR-044; FEATURE-080 (quy tắc 2, AC-080-04, 05), US-080-1, BR-118, tc-map, api-contract, screens-flows, security-model, UAT-54; skill `trang-quan-ly-rieng`.

**Kết quả thực chạy sau vòng sửa 2 (08/11/2026):**
- `npm test`: **470/470 PASS** (thêm AC-080-04).
- `npm run test:e2e`: **79/79 PASS** (4,6 phút; thêm AC-080-05).
- `npm run trace -- --check`: **183 US, 502 AC — PASS 502, GAP 0**.
- Lint, định dạng: PASS.
- **Đi lại 8 luồng trên trình duyệt 1920 px** (CafeQrTest; tài khoản giống dữ liệu thử: chủ quán, quản lý cửa hàng, trưởng ca, nhân viên — script `walk102.cjs` ngoài repo): **14/14 bước đúng** như bảng luồng, không lỗi trang. Chấm công vào khi mở quầy từ trang Quản lý kiểm bằng AC-080-04 (một bản ghi, gọi lại không thêm), không kiểm trong script.

## Bổ sung cùng ngày — mác vai cho nhân viên ở máy quầy (08/11/2026)

**Yêu cầu:** chủ dự án gửi ảnh thanh trên máy quầy "Dương Nhật Anh [Quản lý cửa hàng]": "bên nhân viên tôi không thấy cái mác giống vậy bạn làm thêm dc không".

**Nguyên nhân:** `pos-shell.js` chỉ hiện mác cho Trưởng ca và Quản lý cửa hàng, nhân viên chỉ có mác "Thử việc" khi đang thử việc. Trang Tài khoản thì đã có mác cho mọi vai (`ROLE_BADGE`).

**Sửa:** thanh trên máy quầy dùng chung `ROLE_BADGE` / `ROLE_LABEL` với trang Tài khoản cho mọi vai đứng quầy:
- Nhân viên: mác trung tính;
- Trưởng ca: xanh lá;
- Quản lý cửa hàng: xanh dương;
- thử việc: thêm "Thử việc".

Tài khoản thật `staff1`, `quangtuyen` (nhân viên chính thức, mọi vị trí) sẽ hiện "Nhân viên". Đã ghi vào `design-system.md` (sửa luôn dòng cũ ghi sai "Trưởng ca" là `.badge.primary`), `screens-flows.md` và skill `phan-quyen-quan-ly-cua-hang`.

**Kiểm tra đã làm:**
- Chụp và đo thanh trên với 4 loại tài khoản (nhân viên, nhân viên thử việc, trưởng ca, quản lý cửa hàng) ở 1920, 1366 và 1024 px: mác đúng 12/12, không cuộn ngang, không lỗi trang.
- Ở 1366 px, tên dài kèm mác dài thì tên quán xuống hàng riêng (thanh 138 px thay vì 100 px). Trường hợp này vốn đã có với "Dương Nhật Anh – Quản lý cửa hàng". Nhân viên thử việc nay cũng vậy vì có hai mác. Đã thử gộp thành một mác "Nhân viên · Thử việc" nhưng vẫn 138 px, nên giữ hai mác rời. Thu gọn thanh trên máy quầy thuộc đợt 3 (ADR-042, chờ chủ dự án duyệt).
- `npm test` 470/470 · `npm run test:e2e` 79/79 (a11y quầy kiểm tương phản bằng tài khoản nhân viên) · lint PASS.

## Bổ sung cùng ngày — kiểm tra kỹ chấm công (08/11/2026, DEF-021)

**Yêu cầu:** "bạn test cái chấm công kỹ chưa sài dc và không bị lỗi hay thiếu logic nào pk".

**Cấu hình thật trong dữ liệu thử** (đọc, không sửa):
- chưa đặt cài đặt nào → mặc định **màn chung + PIN**, **hỏi PIN thao tác tiền bật**;
- chỉ `quangtuyen` đã có PIN;
- chưa có hồ sơ lương, chưa có lịch làm;
- lần chấm công gần nhất 29/10 (thời còn chấm theo đăng nhập), trong đó 4 lần dài đúng 8 giờ 00 phút 00 giây.

**Đi lại trên trình duyệt 1920 px** (CafeQrTest, cấu hình giống bản thật; script `walk-attendance*.cjs`, `walk-pinlock*.cjs` ngoài repo) — các luồng **chưa có test**:

| Luồng | Kết quả |
| --- | --- |
| Đăng nhập quầy ở chế độ màn chung | Không chấm công; người chưa có PIN thấy dải nhắc đặt PIN |
| Màn Chấm công | Có mọi người kể cả Quản lý cửa hàng, không có Chủ quán; chạm tên chưa có PIN → đặt bằng mật khẩu → vào ca bằng PIN (ghi nguồn màn chung) |
| Quản lý cửa hàng chi tiền | Hỏi PIN của chính mình → đúng PIN thì ghi khoản chi |
| Đổi người sang người chưa có PIN | Đặt PIN ngay trong hộp Đổi người → đổi được; không tự chấm công |
| Sai PIN 5 lần | Lần 6 báo đỏ "Nhập sai PIN quá nhiều lần — tạm khóa 15 phút, chủ quán đã được báo"; đang khóa thì PIN đúng cũng bị từ chối; "Quên PIN?" → đặt lại bằng mật khẩu → hết khóa, vào ca ngay |
| Đóng ca | Liệt kê người trong ca; người khác được chấm ra hộ và **chờ quản lý xem lại**; người đóng ca được chấm ra luôn theo giờ thật (thiết kế của F-035, `sp_CloseShift`) |
| Mở quầy từ trang Quản lý (ADR-045) ở chế độ màn chung | Không chấm công (chỉ chế độ theo đăng nhập mới chấm) |
| Trang Lương | Việc chờ "Chưa có hồ sơ lương", "Quên chấm ra" |

Lần chạy đầu của script có nhiều dòng "SAI" do script chờ sai cách (đọc thông báo không chờ, đọc chữ trên bàn phím đã đóng đứng chờ 30 giây). Đã kiểm lại từng dòng bằng API, ảnh chụp, đo kiểu hiển thị; không coi là lỗi app.

**Lỗi thật — DEF-021 (Nghiêm trọng, đã sửa):** chế độ chấm công theo đăng nhập, quên đăng xuất thì máy tự đóng mà **không đánh dấu cần xem lại**:
- job đóng ở + 8 giờ; `sp_ClockIn` đóng ở + 12 giờ khi đăng nhập lại;
- hệ quả: bảng lương tính như giờ làm thật.

Sửa:
- `attendanceRepo.autoClose` và `sp_ClockIn` đặt `NeedsReview = 1` → trang Lương hiện "Quên chấm ra".
- `finance.test.js` thêm kiểm tra: mã cũ **hỏng** đúng chỗ, mã mới đạt 31/31.

4 bản ghi tháng 10 cũ trong dữ liệu thử **không sửa**. Vì chưa có lịch làm nên chúng hiện "Không có lịch — chờ xác nhận", không tự trả lương. Đã báo chủ dự án.

**Chưa đi lại trên trình duyệt (chỉ có test tự động):**
- chốt / mở lại bảng lương, trả lương VietQR, tạm ứng, phụ cấp đêm / lễ (AC-073-xx);
- nhắc chấm công và báo quên (AC-072-08…12, E2E);
- trang Giờ công trên điện thoại.
