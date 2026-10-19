# ADR-006 — Mở rộng giai đoạn 4–8 (D-17…D-32) theo skill `advanced-features`

- **Trạng thái:** ACCEPTED · Triển khai xong 18/10/2026 (TASK-035…054 READY_FOR_REVIEW — [bàn giao](../chất-lượng/handover-2026-10-18.md))
- **Ngày:** 17/10/2026. Chủ dự án giao file `skill them chuc nang 1.md` ("làm theo những gì trong file đó yêu cầu"); cài thành `.agent/skills/advanced-features/SKILL.md`.
- **Thay đổi so với:** `.agent/rules.md` mục "không tự thêm … CRM, nhân sự, kho thứ hai". Chấm công, CRM, kho nâng cao **do chủ dự án yêu cầu**, không phải agent tự thêm. Mọi bất biến kho và tiền cũ giữ nguyên. Vẫn một chi nhánh, một kho.

## Quyết định — áp dụng nguyên mặc định của skill

| Mã | Áp dụng |
| --- | --- |
| D-17 | **Chia bill:** mỗi phần là một nhóm dòng món. Dòng chưa ai nhận thuộc phần "Chung"; phần Chung thu trước hoặc tự gộp vào phần cuối. Mỗi phần một `Payments`; phiên đóng khi mọi phần đã thu. Hội viên áp theo từng phần |
| D-18 | **ETA** = 120 giây + Σ thời gian chuẩn hàng chờ ÷ `parallelism` (1) + thời gian giỏ; hiển thị ±25 %. Thời gian chuẩn = số quản lý nhập, nếu không có thì trung vị 30 ngày, nếu không có thì 180 giây |
| D-19 | **Bán thành phẩm** = nguyên liệu `Kind='SEMI'` có công thức; lồng tối đa 3 cấp, cấm vòng. BOM món trỏ vào SEMI như nguyên liệu thường |
| D-20 | **Lô** bật theo từng nguyên liệu (`TrackLots`). Trừ kho theo FEFO; Σ lô mở = `StockQty`; lô hết hạn không tính vào khả dụng |
| D-21 | **Giá vốn** bình quân gia quyền (`AVG`) mặc định; `FIFO` chỉ cho nguyên liệu theo lô khi cài `cost.method=FIFO`. COGS dòng đơn chốt lúc **hoàn tất** |
| D-22 | **Dự báo** theo thứ trong tuần, trung bình trượt có trọng số 4 tuần (0,4/0,3/0,2/0,1) × (1 + hao hụt định mức); tồn an toàn 20 %; job 02:00 |
| D-23 | **Sổ quỹ:** chi cần lý do + danh mục; > 500.000đ hoặc danh mục "Khác" chờ MANAGER/ADMIN duyệt; ảnh hóa đơn ≤ 2 MB (jpg/png/webp) lưu `uploads/receipts/` |
| D-24 | **MANAGER (Trưởng ca):** quyền STAFF + giảm tay đến 20 %/50.000đ, hoàn tiền trong ca, duyệt chi quỹ ≤ 2.000.000đ, sửa chấm công trong ngày, chốt kiểm kê, điều chỉnh kho; không vào báo cáo tài chính, lãi/lỗ, cấu hình giá/BOM, tài khoản |
| D-25 | **Chấm công** tự động theo đăng nhập / đăng xuất / đóng ca; sửa tay bắt buộc lý do + audit |
| D-26 | **Audit log** cho mọi thao tác đổi tiền/kho/quyền/giá; before/after JSON; giữ 12 tháng; ADMIN chỉ đọc |
| D-27 | **Tích điểm** 1 điểm / 10.000đ thực trả; đổi tại quầy lúc thu tiền; không hết hạn. **Tem:** 10 tem → 1 món miễn phí |
| D-28 | **Giới thiệu bạn:** người mới thanh toán lần đầu ≥ 30.000đ → cả hai nhận voucher 10 %, hạn 30 ngày; mỗi SĐT được giới thiệu một lần; tối đa 5 lượt/tháng/người giới thiệu |
| D-29 | **Chiến dịch:** kênh `EXPORT` (CSV) mặc định, `ZALO_OA` khi có `ZALO_OA_TOKEN`; tôn trọng `OptOut`; tối đa 1 tin / 7 ngày / hội viên |
| D-30 | **Menu engineering** theo trung vị số lượng và trung vị lãi gộp/món (30 ngày); món bán < 5 lần → "Chưa đủ dữ liệu" |
| D-31 | **Lãi/lỗ** là **ước tính**: doanh thu thuần − COGS − chi quỹ (danh mục chi phí) − chi phí cố định phân bổ theo ngày |
| D-32 | **Dashboard chủ quán** `/admin/today`, số liệu tính sẵn (job 00:30) + nút "Tính lại" |

## Thích nghi theo hiện trạng repo (skill mục 1, 9)

| Skill | Repo dùng | Lý do |
| --- | --- | --- |
| Mã F-024 "Gọi lại đơn / món yêu thích" | **FEATURE-045** | `FEATURE-024` đã là "Gọi món tại bàn" (yêu cầu 16/10). Các mã còn lại giữ nguyên F-025…F-043 = FEATURE-025…043 |
| `docs/`, `apps/api`, `apps/web`, `db/` | `tài-liệu/`, `ứng-dụng/máy-chủ`, `ứng-dụng/giao-diện`, `cơ-sở-dữ-liệu/` | Thư mục tiếng Việt |
| `apps/api/src/jobs/` + `node-cron` | `ứng-dụng/máy-chủ/src/jobs/scheduler.js`, một `setInterval` 30 giây, khóa trong DB | Không thêm thư viện; một bộ lập lịch duy nhất |
| `Ingredients.LastCost` | `Ingredients.LastUnitCost` (đã có từ F-023) | Không tạo cột trùng nghĩa |
| `Units.UnitCode VARCHAR` | `NVARCHAR(10)` | Đơn vị đang dùng có dấu ("miếng", "cái") |
| Upload ảnh hóa đơn dạng multipart | `PUT …/receipt` gửi thẳng ảnh (`Content-Type: image/*`) | Không thêm thư viện multipart; kiểm định dạng bằng chữ ký file |
| Chart.js | SVG tự vẽ | `tech-stack.md` đã chốt "biểu đồ bằng SVG tự viết" |
| Ma trận D-24: STAFF ✘ mở/đóng ca | **STAFF vẫn mở/đóng ca** (FEATURE-018) | Lệch docs → làm theo docs (skill "Nguồn chính là docs"); ghi Q-022 |
| Ma trận D-24: STAFF ✘ "chi quỹ ≤ ngưỡng" | STAFF ghi chi quỹ; khoản > 500.000đ / "Khác" chờ duyệt (D-23) | D-23 nói rõ ngưỡng duyệt; ghi Q-022 |
| `Members.Points` 1 điểm/1.000đ (D-5) | Đổi sang D-27 (1/10.000đ) từ 0029; số dư cũ ghi một dòng `ADJUST` "Số dư trước F-039" | Sổ điểm khớp số dư |
| Kéo thả lịch phân ca | Bảng tuần kéo thả bằng HTML5 drag & drop; bấm ô để thêm / sửa | FE thuần, không thư viện kéo thả |
| D-28 "người mới thanh toán lần đầu ≥ 30.000đ" | Chỉ xét **lượt thu đầu tiên** (`VisitCount = 1`); lần đầu < 30.000đ → không tặng | Chọn cách hiểu chặt hơn (skill mục 9); ghi Q-022 |
| "Job sau commit tạo 2 voucher" giới thiệu | Tạo voucher trong cùng transaction lượt thu (`sp_ApplyLoyalty`), realtime sau commit | Không thể tặng trùng / sót khi tiến trình dừng giữa chừng |
| Hạ ADMIN cuối cùng → `409 LAST_ADMIN` | Kiểm nguyên tử trong SQL (khóa U các dòng ADMIN); **tự** hạ / khóa mình vẫn `400` như FEATURE-009 | Giữ hợp đồng cũ; chặn được hai quản lý hạ quyền nhau cùng lúc |
| `requireRole` / `requirePermission` | Chỉ `requirePermission(perm)` + bảng `PERMISSIONS` (`src/auth/permissions.js`) | Một nguồn cho cả server và test ma trận |
| Kênh `SMS` | Có trong CHECK, API trả `400 CHANNEL_NOT_SUPPORTED` | Chưa có nhà cung cấp SMS; `EXPORT` mặc định, `ZALO_OA` khi có token |
| `/admin/today` cho MANAGER | Cùng trang, server bỏ giá vốn / lãi / tổng tiền chờ duyệt khỏi phản hồi; trưởng ca vào từ nút "Hôm nay" ở quầy | Không lộ số tài chính qua API |
| `Sessions` gửi thông báo đẩy | Không (skill mục 10) | — |

## Hệ quả

- Migration `0015`…`0032` (mỗi feature có đổi schema một file); SP mới/sửa; `pricing` mở rộng voucher + thưởng + điểm/tem; bộ lập lịch job; middleware quyền + audit.
- Bất biến mới được kiểm sau mọi bộ test:
  - Σ lô mở = `StockQty` (nguyên liệu theo lô);
  - mỗi phần chia bill một `Payments`;
  - điểm không âm, sổ điểm khớp số dư, mỗi `PaymentId` tối đa một `EARN`;
  - `ExpectedCash` chốt ca gồm sổ quỹ.
- Chi tiết: [`kế-hoạch/TASK-035-054-plan.md`](../kế-hoạch/TASK-035-054-plan.md).
