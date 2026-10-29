---
name: che-do-co-ban-va-phat-hanh
description: Gộp các nhánh task thành ứng viên phát hành trên main (v1.0.0-rc.N) và 3 chức năng "dùng thật ở quán" của cafe-qr-app — chế độ cơ bản (ẩn 5 nhóm menu quản lý nâng cao, bật dần ở Cài đặt), hướng dẫn 5 bước ở màn quầy cho tài khoản mới, trang Chính sách dữ liệu (link ở câu đồng ý lưu SĐT), cảnh báo QR bàn sai địa chỉ (laptop đổi IP sau khi in / QR trỏ localhost). Dùng khi task giao FEATURE-061…063 / ADR-021 / TASK-076 / TASK-077, hoặc nhắc "gộp nhánh", "bản phát hành", "release candidate", "chế độ cơ bản", "ẩn menu", "ui.modules", "hướng dẫn nhân viên mới", "tour", "chính sách dữ liệu", "đồng ý lưu SĐT", "xóa hội viên", "QR sai địa chỉ", "đổi IP", "in lại QR".
---

# Mục đích

Ghi lại việc làm ngày 29/10/2026 (TASK-076, TASK-077) để agent sau **sửa, mở rộng hoặc làm lại** mà không phá phần đang chạy:

| Việc | Một câu |
| --- | --- |
| TASK-076 — ứng viên phát hành | Gộp chuỗi nhánh chồng TASK-065…075 vào `main` bằng một commit `--no-ff`, gắn tag `v1.0.0-rc.1` (không phải `v1.0.0` — chờ G5) |
| F-061 — Chế độ cơ bản + hướng dẫn | Quán mới chỉ thấy menu cơ bản, bật dần 5 nhóm nâng cao ở Cài đặt; nhân viên mới vào quầy lần đầu được chỉ 5 bước trên màn thật |
| F-062 — Chính sách dữ liệu | Trang công khai `/chinh-sach-du-lieu` + link ngay ở câu đồng ý lưu SĐT. **Ô đồng ý bắt buộc và "Ẩn danh theo yêu cầu" đã có từ F-014** — không làm lại |
| F-063 — Cảnh báo QR sai địa chỉ | Lưu địa chỉ máy chủ lúc in QR; app chạy ở địa chỉ khác → dải đỏ "in lại QR" ở quản lý + quầy; địa chỉ localhost → cảnh báo ở trang in |

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-021-che-do-co-ban-chinh-sach-qr.md` (D-79…D-82) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-061.md`, `FEATURE-062.md`, `FEATURE-063.md` |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-096…BR-099 |
| Task, kết quả, review | `tài-liệu/công-việc/TASK-076.md`, `TASK-077.md`, `tài-liệu/kế-hoạch/TASK-077-plan.md` |
| Phát hành | `tài-liệu/vận-hành/release-plan.md` §1 (ứng viên `rc`), §7 (nhật ký phát hành) |
| API, dữ liệu, màn hình | `tài-liệu/kiến-trúc/api-contract.md` (mục F-061 / F-062 / F-063), `data-model.md` (migration 0041), `tài-liệu/giao-diện/screens-flows.md`, `sitemap.md` (SCR-48) |

# Khi dùng

- Gộp thêm task vào `main` / gắn ứng viên phát hành mới (`rc.2`, `rc.3`…).
- Thêm trang quản lý mới (phải chọn: luôn hiện hay thuộc nhóm nào), đổi nhóm, thêm bước hướng dẫn.
- Sửa nội dung chính sách dữ liệu (đổi dữ liệu thu thập, thêm kênh gửi tin…).
- Quán báo "khách quét QR không vào được" (mục 7).

# Điều kiện trước

- Đọc `AGENTS.md`, `.agent/rules.md`; DB → skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.
- Gộp `main`, gắn tag, đẩy GitHub: **chỉ khi chủ dự án bảo**. Tag `v1.0.0` chính thức chỉ sau G5 (`release-plan.md`).

---

# 1. Gộp nhánh thành ứng viên phát hành (TASK-076)

1. Kiểm quan hệ tổ tiên trước khi gộp — chuỗi nhánh của dự án là **chồng nối tiếp**:
   ```bash
   git merge-base --is-ancestor main <ngọn chuỗi> && echo "gộp không xung đột"
   git log --oneline main..<ngọn chuỗi>          # liệt kê task sẽ vào
   ```
2. Tạo nhánh `task/TASK-xxx-ung-vien-phat-hanh` từ ngọn chuỗi, thêm tài liệu (TASK-xxx.md, dòng README, nhật ký `release-plan.md` §7).
3. Gộp ở **worktree riêng** (worktree đang chạy demo không được đổi file dưới chân app):
   ```bash
   git worktree add -b task/TASK-xxx … ../cafe-qr-app-taskNNN <ngọn>
   git checkout main && git merge --no-ff task/TASK-xxx -m "Merge …: … vào main — ứng viên phát hành v1.0.0-rc.N"
   git rev-parse 'main^{tree}' 'task/TASK-xxx^{tree}'   # hai cây phải bằng nhau
   git tag -a v1.0.0-rc.N -m "…"                          # KHÔNG v1.0.0 khi chưa G5; không push
   ```
4. Bằng chứng: cây mã bằng ngọn đã chạy đủ test → ghi rõ "cây mã = …" trong nhật ký phát hành; lần chạy đầy đủ tiếp theo làm trên chính `main` mới.
5. `node_modules` cho worktree mới: junction tới worktree khác (`New-Item -ItemType Junction`), **xóa junction trước** khi `git worktree remove` (`[IO.Directory]::Delete(path, $false)`).
6. Bẫy: file kết quả test (`kiểm-thử/kết-quả/*.json|xml`) chép từ worktree khác mang đường dẫn tuyệt đối của worktree đó → `npm run trace` báo "chưa có kết quả chạy". Chạy lại test tại chỗ thay vì chép.

# 2. Quyết định đã chốt (ADR-021) — không tự đổi

| Mã | Quyết định | KHÔNG chọn |
| --- | --- | --- |
| D-79 | Chế độ cơ bản = **ẩn khỏi menu**, không tắt chức năng / API. 5 nhóm (`src/utils/modules.js`): `inventory`, `customers`, `finance`, `analytics`, `advanced`. Quán mới = cơ bản; CSDL đã có đơn lúc nâng cấp + dữ liệu mẫu = bật đủ | Chặn API / tắt nghiệp vụ của nhóm ẩn |
| D-80 | Hướng dẫn 5 bước lưu theo **tài khoản** (`Users.TourSeenAt`); tài khoản có sẵn + tài khoản do lệnh cài đặt tạo = đã xem; nút "Hướng dẫn" xem lại | Lưu trong trình duyệt (đổi máy / dùng chung máy quầy là sai) |
| D-81 | Trang công khai `/chinh-sach-du-lieu` (SCR-48), căn cứ NĐ 13/2023/NĐ-CP; yêu cầu xóa qua nhân viên → quản lý "Ẩn danh theo yêu cầu" | Khách tự xóa qua mạng (không xác minh được chủ SĐT) |
| D-82 | Lưu `PUBLIC_BASE_URL` lúc in QR (`qr.printed_base_url`, `qr.printed_at`); lệch → dải đỏ quản lý + quầy; **IP trong `PUBLIC_BASE_URL` không còn trên máy** → dải đỏ kèm IP hiện tại; localhost → chỉ trang Bàn & QR / In QR | Tự đổi QR theo IP / tên miền động |

# 3. Chế độ cơ bản (F-061, D-79)

- **Nhóm → mục** (một nguồn ở giao diện: `MODULE_OF` trong `public/js/admin-shell.js`; nhãn cho Cài đặt: `MODULE_GROUPS` trong `pages/admin-settings.js`; khóa hợp lệ ở server: `src/utils/modules.js`):

  | Nhóm | Mục ẩn khi tắt |
  | --- | --- |
  | `inventory` | `ingredients`, `stock`, `purchasing`; quầy: "Kho & sơ chế" (`pos-shell.js`) |
  | `customers` | `members`, `loyalty`, `promotions`, `suggestions`, `reviews` |
  | `finance` | `cash`, `staff` |
  | `analytics` | `analytics`, `pnl` |
  | `advanced` | `schedules`, `audit`, `api-docs` |

- Server: `settingsService` → `uiModules` (CSV `ui.modules`, lọc theo `MODULES`); `PUT /api/admin/settings` nhận `uiModules` (zod `z.array(z.enum(MODULES))` + không trùng); `GET /api/auth/me` trả `modules`.
- Giao diện: `auth.js` lưu `current.modules`; `navGroup` lọc mục, nhóm rỗng → bỏ cả tiêu đề; trang đang ẩn mở bằng URL → dải `#module-hidden-note` (link `/admin/settings#giao-dien`, trang Cài đặt tự cuộn tới thẻ). Lưu Cài đặt có đổi nhóm → gọi lại `mountAdminShell('settings')`.
- **Thêm trang quản lý mới:** thêm vào `NAV`; nếu thuộc nhóm nâng cao thì thêm khóa vào `MODULE_OF` **và** liệt kê ở `MODULE_GROUPS`, FEATURE-061, BR-096.
- **Thêm nhóm mới:** thêm vào `MODULES` (server), `MODULE_OF`, `MODULE_GROUPS`, migration bật nhóm cho CSDL đang dùng (migration mới, không sửa 0041), test AC-061-02.

# 4. Hướng dẫn 5 bước (F-061, D-80)

- `public/js/pos-tour.js` — `startTour(steps, { onEnd })`: lớp phủ `.tour-layer` + khung `.tour-ring` (box-shadow làm nền mờ) + hộp `role="dialog"`; phần trang phía sau `inert`; Tab vòng trong hộp; Esc = bỏ qua; đóng xong trả focus. Không thấy phần tử của bước → hộp ở giữa màn hình.
- Bước khai báo ở `pages/pos-dashboard.js` (`tourSteps`): `#shift-btn` → `.col-pending` → `.col-preparing` → lưới bàn (`#tables-panel`, hoặc nút `#tables-toggle` khi màn < 1200 px) → link `/pos/shift`. Tự mở khi `shell.user.tourSeenAt` rỗng (không mở khi vào bằng `?settle=`); `?tour=1` hoặc nút "Hướng dẫn" (`shell.tourHandler`) mở lại.
- Xong / Bỏ qua → `POST /api/auth/tour-seen` (`usersRepo.markTourSeen`: `COALESCE(TourSeenAt, SYSUTCDATETIME())`).
- Đổi bước được đọc qua vùng `aria-live="polite"` (focus giữ ở nút Tiếp — `focus()` lại nút đang có focus thì trình đọc màn hình không đọc gì). Chữ bước có thể là hàm (đọc lúc hiện bước — bước "Bàn" đổi theo cỡ màn hình).
- `inert`: hướng dẫn chỉ gỡ inert do chính nó đặt; `setTablesOpen` (ngăn bàn) bỏ qua khi `.tour-layer` đang mở — nếu không, xoay máy tính bảng qua 1200 px sẽ gỡ inert của thanh trên giữa chừng. Toast nằm ngoài inert và nổi trên lớp phủ (`body:has(.tour-layer) .toasts`).
- Nền mờ = `box-shadow: 0 0 0 100vmax` của khung. Ảnh chụp màn hình xem bằng mắt có thể trông "không mờ" — đo màu điểm ảnh trước khi kết luận lỗi.
- **Bẫy E2E:** tài khoản tạo trong E2E (vd `lead-e2e`) đăng nhập quầy sẽ thấy hướng dẫn che màn → bấm "Bỏ qua" ngay sau đăng nhập. Tài khoản do `seedBase` tạo có sẵn `TourSeenAt`.
- **Thêm / đổi bước:** sửa `tourSteps`, giữ 5 bước ngắn (≤ 2 câu), cập nhật BR-097, tiêu đề trong E2E "hướng dẫn 5 bước…".

# 5. Chính sách dữ liệu (F-062, D-81)

- **Đã có, không làm lại:** `memberService.register` từ chối thiếu đồng ý (`400 CONSENT_REQUIRED`), lưu `Members.ConsentAt`; câu đồng ý ở `js/member-box.js` (khách), `js/billing-controls.js` (Thu tiền bàn), `pages/pos-table-order.js` (Gọi món tại bàn); quản lý "Ẩn danh theo yêu cầu" (`POST /api/admin/members/{id}/anonymize`); từ chối nhận tin (`opt-out`).
- **Bài học:** trước khi đề xuất "thiếu X", tìm **toàn repo** (`grep -rn "consent" ứng-dụng/`), không chỉ vài file trang — góp ý ngày 29/10 từng nói sai "chưa có câu đồng ý" vì sót `member-box.js`.
- Phần mới: `public/chinh-sach-du-lieu.html` + `js/pages/privacy.js` (đọc `GET /api/shop` — chỉ `{ name, address }`), route trong `routes/pages.js`; link `.policy-link` (vùng chạm ≥ 24 px) mở **tab mới** ở 3 chỗ đồng ý (không mất chữ đang nhập) + trang chủ.
- Đổi dữ liệu thu thập (thêm ngày sinh, email…) → **phải** sửa trang chính sách cùng lúc + BR-098.

# 6. Cảnh báo QR sai địa chỉ (F-063, D-82)

- `services/qrCheckService.js`: `check()` → `{ baseUrl, printedBaseUrl, printedAt, mismatch, localhost, unreachable, machineIps }` — `mismatch` so **origin**; `unreachable` = host là IPv4 không có trong `os.networkInterfaces()` (`machineIps()`); `markPrinted()` lưu `config.publicBaseUrl` + giờ qua `updateSettings` (khóa `qrPrintedBaseUrl` / `qrPrintedAt` có trong `KEYS` nhưng **không** có trong zod của PUT → không sửa tay được).
- Routes: `GET /api/qr-check` (nhân viên, `routes/public.js`), `POST /api/admin/qr-printed` (ADMIN, `routes/admin.js`). `server.js` in cảnh báo lúc khởi động.
- Trang In QR (`pages/admin-qr-print.js`): nút In và sự kiện `beforeprint` (Ctrl+P) đều gọi `markPrinted`, chặn ghi hai lần trong 3 giây; xong gọi `refreshQrBanner('tables')`.
- Dải: `refreshQrBanner(active)` trong `admin-shell.js` (mọi trang quản lý: lệch; trang `tables`: thêm localhost), `pos-shell.js` (quầy: chỉ lệch). `@media print` ẩn dải.
- **Bẫy lớn nhất (review G3):** chỉ so "địa chỉ lúc in" với "địa chỉ đang chạy" là **không đủ** — ở quán thật `PUBLIC_BASE_URL` ghi cứng trong `.env`, laptop đổi IP thì hai địa chỉ vẫn bằng nhau (cùng IP cũ) mà điện thoại không vào được. Phải so thêm với IP thật của máy (`unreachable`). Test dùng `192.0.2.10` (TEST-NET-1, không máy nào có) và IP thật lấy từ `machineIps()`.
- Bấm In / Ctrl+P = đã in (trình duyệt không cho biết bấm Hủy) — đã ghi trong BR-099.
- **Bẫy:** máy chủ E2E chạy ở `http://localhost:3100` → trang Bàn & QR / In QR luôn có dải localhost trong E2E (đúng thiết kế); E2E giả lập lệch bằng `page.route('**/api/qr-check')`, logic lệch thật kiểm ở integration bằng cách đổi `config.publicBaseUrl` trong tiến trình test.

# 7. Khi thất bại / không chắc

| Triệu chứng | Kiểm |
| --- | --- |
| Khách quét QR không vào được | Trang quản lý có dải đỏ? "không còn ở IP đó" → sửa `PUBLIC_BASE_URL` theo IP hiện tại, khởi động lại, in lại; "trỏ tới A nhưng đang chạy ở B" → in lại QR ở trang In mã QR; lâu dài: đặt IP cố định cho máy chủ trong router (ADR-016). Không có dải mà vẫn lỗi → điện thoại cùng Wi-Fi chưa, mạng Private + tường lửa cổng 3000 chưa |
| Chủ quán "mất" menu Kho / Khách hàng sau nâng cấp | `SELECT * FROM dbo.Settings WHERE SettingKey = 'ui.modules'` — migration 0041 chỉ bật khi CSDL đã có đơn, hội viên hoặc phiếu nhập kho; bật lại ở Cài đặt → Giao diện quản lý |
| Nhân viên cũ thấy hướng dẫn | `Users.TourSeenAt` rỗng — tài khoản tạo sau migration là đúng thiết kế; bấm Bỏ qua một lần |
| Trang lỗi `Cannot read properties of undefined` sau khi kéo code mới | Máy chủ đang chạy bản cũ (file tĩnh mới, API cũ) → khởi động lại app |

# 8. Kiểm chứng

| Lớp | Ở đâu | Gồm |
| --- | --- | --- |
| Integration | `ứng-dụng/máy-chủ/tests/basic-mode.test.js` (9) | AC-061-01…04 (gồm chạy lại **đúng file** migration 0041 trên CSDL giả lập trước nâng cấp, chạy lại lần hai không đụng dữ liệu), AC-062-01…02, AC-063-01…03 (lệch, IP không còn trên máy, localhost, quyền) |
| E2E | `kiểm-thử/e2e/flow.spec.js` | "chế độ cơ bản…", "hướng dẫn 5 bước…", "chính sách dữ liệu…", "cảnh báo QR sai địa chỉ…"; hồi quy: `lead-e2e` bỏ qua hướng dẫn, form hội viên có link chính sách |
| a11y | `kiểm-thử/e2e/a11y.spec.js` | trang Chính sách dữ liệu (390 px), hộp hướng dẫn ở màn quầy |

Lệnh: `npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate`.

# 9. Không làm

- Không chặn API của nhóm đang ẩn; không tắt nghiệp vụ (kho, điểm, sổ quỹ) theo nhóm.
- Không cho khách tự xóa dữ liệu qua mạng; không bỏ ô đồng ý bắt buộc.
- Không gắn `v1.0.0`, không đẩy GitHub, không gộp `main` khi chủ dự án chưa bảo; không reset `CafeQrDev`.

# 10. Hoàn thành khi

- AC-061-01…05, AC-062-01…03, AC-063-01…04 PASS; test mới đỏ trên code cũ.
- Lint, format, `npm test`, E2E, `trace --check` sạch; tài liệu cập nhật cùng task; TASK ghi kết quả và chuyển `READY_FOR_REVIEW`.
