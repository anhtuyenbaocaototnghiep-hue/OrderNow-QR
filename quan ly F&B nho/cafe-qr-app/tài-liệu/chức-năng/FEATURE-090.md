# FEATURE-090 — Phân quyền đơn giản: Cho phép / Không cho phép, quyền theo vai lúc tạo tài khoản, Quyền nâng cao

> **Nguồn:** chủ dự án 14/11/2026 — "còn về phân quyền chỉ cho phép và không cho phép, khi tạo tài khoản thì quyền giao diện là nhân viên hay gì đó sẽ có quyền như vậy và có thêm giao diện cấp quyền nâng cao do chính admin cấp làm lại cho dễ sử dụng hơn". Quyết định: [ADR-051](../quyết-định/ADR-051-phan-quyen-don-gian.md) D-222…D-224. Nền: [F-079](FEATURE-079.md) quyền riêng + xin quyền, [F-077](FEATURE-077.md) Quản lý cửa hàng, [F-078](FEATURE-078.md) vị trí nhân viên, [F-009](FEATURE-009.md) tài khoản.

- **Status:** CONFIRMED (ADR-051) · Triển khai: [TASK-110](../công-việc/TASK-110.md)
- **Actor:** **ACT-ADMIN** (chủ quán — tài khoản & phân quyền chỉ chủ quán, như F-079).
- **Màn hình:** **Quản lý → Tài khoản** (SCR-20): hộp **Thêm nhân viên** / **Sửa** có phần **Quyền** — "Vai trò này được làm N / 17 việc" (danh sách ✓) + thu gọn **Quyền nâng cao — cho phép / không cho phép từng việc** (công tắc theo nhóm Máy quầy / Trang Quản lý, nhãn "Theo vai trò" / "Cấp thêm" / "Bỏ bớt", "tạm đến …", nút **Về như vai trò**). Dòng tài khoản: không còn nút "Quyền"; nhãn **Có quyền nâng cao**.
- **Dữ liệu:** không đổi (`UserGrants` của F-079). API mới `GET /api/admin/role-permissions`.

## User Story

- **US-090-1:** Là chủ quán, khi tạo hoặc sửa tài khoản tôi muốn chọn vai trò (và vị trí) là thấy ngay người đó được làm những việc gì, để giao đúng việc mà không phải đoán.
- **US-090-2:** Là chủ quán, tôi muốn cho phép hoặc không cho phép riêng từng việc cho một người bằng một công tắc ngay trong hộp tài khoản ("Quyền nâng cao"), để cấp thêm / bỏ bớt nhanh, ít lựa chọn khó hiểu.

## Quy tắc

1. Quyền mặc định = quyền của vai trò + vị trí (F-077, F-078 — máy chủ tính, `byRole`). Nhân viên chưa chọn vị trí = mọi việc ở máy quầy; vị trí chỉ áp cho vai Nhân viên. Chủ quán luôn đủ mọi quyền (hộp ghi "Chủ quán luôn đủ mọi quyền", không có công tắc).
2. Công tắc mỗi quyền: **Cho phép** / **Không cho phép**, bật sẵn theo quyền đang có. Khác mặc định → quyền riêng `ALLOW` / `DENY` không hạn; giống mặc định → không lưu. "Về như vai trò" đưa mọi công tắc về mặc định.
3. Quyền tạm (duyệt Xin quyền có hạn — F-079) hiện "tạm đến …"; lưu hộp mà không chạm công tắc đó → giữ nguyên hạn; chạm → theo công tắc (không hạn hoặc về theo vai trò).
4. Đổi vai trò / vị trí trong hộp → danh sách "Vai trò này được làm" và mặc định của công tắc chưa chạm đổi theo; khi lưu, quyền riêng trùng mặc định của vai mới được bỏ. Chỉ gọi lưu quyền khi có thay đổi.
5. Tạo tài khoản có quyền nâng cao: tạo tài khoản rồi lưu quyền; lưu quyền lỗi → báo "Đã tạo tài khoản nhưng chưa lưu được quyền nâng cao…", tài khoản vẫn dùng được, đặt lại ở Sửa.
6. Quyền dính tiền ("Tiền") được cho phép → cảnh báo `ACCESS_GRANT` như F-079. Quyền chỉ chủ quán (tài khoản & phân quyền, cài đặt chung…) không có trong danh sách.

## API

- `GET /api/admin/role-permissions?role=STAFF|MANAGER|STORE_MGR|ADMIN&positions=CASHIER,BARISTA,SERVER` (chỉ chủ quán) → `{ role, positions, items: [{ key, group, label, money, byRole }] }` (17 quyền). Vai / vị trí lạ → `400 VALIDATION_ERROR`; quản lý cửa hàng → `403 OWNER_ONLY`; nhân viên → `403 FORBIDDEN`; chưa đăng nhập → `401`.
- Lưu quyền: `PUT /api/admin/users/{id}/grants` (F-079, không đổi).

## Acceptance Criteria

- AC-090-01: `GET /api/admin/role-permissions`: Nhân viên chưa chọn vị trí → đúng 3 quyền máy quầy (thu tiền, làm đơn, phục vụ) trên 17; vị trí Phục vụ → chỉ "Mở bàn, gọi món tại bàn, chuyển bàn"; Thu ngân + Phục vụ (trùng lặp bỏ) → hai quyền tương ứng; Trưởng ca (vị trí bỏ qua) → thêm kiểm kê, sửa chấm công, Trang Hôm nay; Quản lý cửa hàng → mọi quyền trừ Thu chi, Lương, Nhật ký; Chủ quán → đủ; nhãn / nhóm / "tiền" đúng; khớp `byRole` của hộp quyền một tài khoản thật cùng vai / vị trí; vai / vị trí lạ, thiếu vai → 400; quản lý cửa hàng → 403 `OWNER_ONLY`, nhân viên → 403 `FORBIDDEN`, chưa đăng nhập → 401.
- AC-090-02: (Tài khoản → + Thêm nhân viên) mặc định Nhân viên quầy → "Vai trò này được làm 3 / 17 việc" + 3 dòng; tick Phục vụ → còn 1 dòng; chọn Trưởng ca → "6 / 17", có Kiểm kê / Sửa chấm công / Trang Hôm nay; "Quyền nâng cao" thu gọn → mở: "Trang Hôm nay" Cho phép · Theo vai trò → tắt → Không cho phép · Bỏ bớt; "Kho hàng" tắt → bật → Cấp thêm; dòng tóm tắt "Cấp thêm: Kho hàng… · Bỏ bớt: Trang Hôm nay"; Tạo tài khoản → dòng có "Có quyền nâng cao", không có nút "Quyền"; API: đúng hai quyền riêng `dashboard.view DENY`, `admin.stock ALLOW`, không hạn.
- AC-090-03: (Sửa tài khoản có quyền tạm Thu tiền 3 giờ) "Quyền nâng cao" mở sẵn, công tắc Thu tiền bật, ghi "Cấp thêm · tạm đến …"; chỉ đổi họ tên → Lưu → quyền tạm giữ nguyên hạn; mở lại → "Về như vai trò" → công tắc tắt, "Theo vai trò" → Lưu → hết nhãn "Có quyền nâng cao", API không còn quyền riêng. (Bài AC-079-07: tắt công tắc quyền vừa duyệt ở hộp Sửa → người đó bị chặn lại.)
- AC-090-04: Quét khả năng tiếp cận trang Tài khoản khi hộp Sửa mở phần Quyền nâng cao: công tắc có tên là tên quyền + trạng thái bật / tắt, nhãn ô nhập, tương phản, vùng chạm ≥ 24 px; không cuộn ngang ở 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/role-permissions.test.js` (AC-090-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` (AC-090-02, AC-090-03, AC-079-07); `kiểm-thử/e2e/a11y.spec.js` bài "quản lý (máy tính): mọi trang quản trị…" (AC-090-04).
