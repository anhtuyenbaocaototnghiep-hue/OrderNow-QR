# ADR-059 — Quét QR bàn có nhóm: tự vào nhóm của bàn (bỏ "Gộp chung / Tạo đơn cá nhân")

- **Trạng thái:** ACCEPTED (17/11/2026). Chủ dự án: "bạn bỏ cái cá nhân với gộp bàn rồi bạn xem tích hợp sao" → duyệt phương án: "okay" (17/11/2026).
- **Bối cảnh:** từ F-001, khách quét QR ở bàn đang có nhóm phải chọn **"Gộp chung nhóm"** hoặc **"Tạo đơn cá nhân"** (nhóm riêng, hóa đơn riêng ở cùng bàn). Chủ dự án muốn bỏ hai lựa chọn này và nối các chức năng lại cho gọn: khách ngồi cùng bàn là cùng nhóm; ai muốn trả riêng đã có **"Chia bill theo người"** (F-026) ở điện thoại và **"Tách hóa đơn"** (F-058) ở quầy.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-238 | **Quét QR bàn đang có nhóm → tự vào nhóm của bàn**, không hỏi (như bấm "Gộp chung nhóm" trước đây): món cả nhóm gọi chung một hóa đơn; trang mở ra báo "Đã vào nhóm của Bàn … — ai muốn trả riêng thì dùng Chia bill theo người". Bàn có **≥ 2 nhóm** (hiếm — quầy / API mở thêm) → chỉ hỏi **"Bàn đang có N nhóm. Bạn đi cùng nhóm nào?"**, mỗi nhóm một nút "Vào nhóm này"; **không còn nút "Tạo đơn cá nhân"**. Nhóm vừa thanh toán giữa chừng → mở nhóm mới (BR-008 giữ nguyên). Điện thoại đang có nhóm ở bàn khác (F-086): nút "Gọi món riêng ở Bàn …" đổi thành **"Gọi món ở Bàn …"** — bàn mới có nhóm thì vào nhóm đó, trống thì mở nhóm mới; nhóm ở bàn cũ giữ nguyên. |
| D-239 | **Trả riêng = "Chia bill theo người"** (F-026): màn chào (F-092) có dòng **"Trả riêng từng người? Chia bill theo người"** khi nhóm đã có món → mở thẳng hộp chia bill ở Theo dõi đơn (`/t/{qr}/track?act=split`); quầy vẫn có "Tách hóa đơn" (F-058), "Thu chung với bàn khác" (F-056). Máy chủ và màn quầy **không đổi**: API `POST /api/sessions` (mở nhóm thứ hai ở bàn) giữ cho quầy / tương thích; bàn đang có nhiều nhóm vẫn thu tiền từng nhóm như cũ. |

## Phương án đã cân nhắc

- **Chặn hẳn nhóm thứ hai ở máy chủ:** phá vỡ dữ liệu / luồng cũ ở quầy (bàn đang có 2 nhóm, chuyển bàn F-086, gộp hóa đơn) và nhiều test — chưa cần; chỉ bỏ ở điện thoại.
- **Giữ màn chọn nhưng mặc định Gộp:** vẫn thêm một chạm và vẫn có chữ "cá nhân" — trái yêu cầu.
- **Tự vào nhóm đông người nhất khi bàn có ≥ 2 nhóm:** dễ vào nhầm hóa đơn của khách lạ → hỏi trong trường hợp hiếm này.

## Hệ quả

- **Mã nguồn:** `js/pages/t-entry.js` (tự vào nhóm, chọn nhóm khi ≥ 2, "Gọi món ở Bàn …", dòng "Trả riêng từng người?"), `js/pages/t-track.js` (`?act=split`), `css/customer.css`. Không đổi API, CSDL, quầy.
- **Test:** E2E mới "vào nhóm của bàn…" (AC-097-01…04); E2E cũ bỏ bước bấm "Gộp chung nhóm" / "Tạo đơn cá nhân" (nhóm thứ hai trong test mở bằng API); a11y màn chọn nhóm (bàn có 2 nhóm).
- **Tài liệu:** FEATURE-097, FEATURE-001 (AC-001-02/03/04 theo luồng mới), sitemap, screens-flows, user-stories, use-cases, tc-map.
