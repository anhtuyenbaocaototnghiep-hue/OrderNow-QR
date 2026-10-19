# Thuật ngữ

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §5 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

| Thuật ngữ | Tên trong code | Định nghĩa |
| --- | --- | --- |
| Bàn | `Table` | Vị trí vật lý trong quán, có mã bàn và một mã QR cố định |
| Mã QR bàn | `QrToken` | Chuỗi ngẫu nhiên gắn với bàn, nhúng trong URL QR (`/t/{qrToken}`); **không** dùng `TableId` số đếm được trong URL để tránh đoán bàn |
| Phiên | `Session` | Một "lượt ngồi" trên một bàn, gom các đơn của một nhóm khách để tính tiền chung. Một bàn có thể có **nhiều phiên mở song song** (khách chọn "Cá nhân") |
| Gộp phiên | `JoinSession` | Khách mới vào cùng phiên đang mở, thấy chung giỏ/đơn |
| Token khách | `ClientToken` | Định danh trình duyệt khách (ngẫu nhiên, lưu cookie); gắn vào phiên |
| Đơn hàng | `Order` | Một lần gửi món; thuộc một phiên (dine-in) hoặc không thuộc phiên (take-away) |
| Dòng đơn | `OrderItem` | Món + số lượng + đơn giá tại thời điểm đặt + ghi chú |
| Món | `MenuItem` | Sản phẩm bán; có giá, ảnh, danh mục, cờ `IsAvailable` (còn bán) |
| Nguyên liệu | `Ingredient` | Vật tư trong kho: tên, đơn vị (ml, g, cái…), tồn kho |
| BOM / Định lượng | `BomItem` | Công thức: món X cần Y đơn vị nguyên liệu Z cho **một** suất |
| Tồn kho | `StockQty` | Số lượng nguyên liệu thực có |
| Giữ chỗ | `ReservedQty` | Số lượng đã được đơn `PENDING/PREPARING` giữ nhưng chưa trừ (chỉ có nếu chọn Q-001 = A) |
| Khả dụng | `Available` | `StockQty − ReservedQty` |
| Giao dịch kho | `InventoryTransaction` | Nhật ký mọi thay đổi tồn kho (trừ do đơn, điều chỉnh tay) |
| Thanh toán | `Payment` | Một lần thu tiền mặt do nhân viên ghi nhận: cho **cả phiên** (dine-in) hoặc cho **một đơn** (mang đi) |
| Gọi thanh toán | `RequestPayment` | Khách bấm trên điện thoại để báo quầy ra thu tiền; phiên chuyển `PAYMENT_REQUESTED` |
| Thu tiền / Đóng bàn | `SettleSession` | Nhân viên bấm "Đã thu tiền" trên POS: mọi đơn trong phiên → PAID, in bill, phiên → CLOSED |
| Tiếp nhận | `Accept` | Quầy xác nhận đã thấy đơn: `PENDING → PREPARING` (Q-004b) |
| Hoàn tất | `Complete` | Quầy xác nhận món đã làm xong/đã phục vụ; **thời điểm trừ kho** |
| Bán mang đi / Take-away | `TAKE_AWAY` | Đơn do quầy tạo ở mục riêng cho khách mang đi, không gắn bàn, thu tiền mặt ngay |
| Dashboard quầy / POS | — | Màn hình nhân viên trên máy tính/tablet tại quầy |

## Bổ sung giai đoạn 4–8 (ADR-006, 18/10/2026)

| Thuật ngữ | Tên trong code | Định nghĩa |
| --- | --- | --- |
| Trưởng ca | `MANAGER` | Vai trò giữa STAFF và ADMIN: quyền nhân viên + duyệt trong ngưỡng (giảm tay, hoàn tiền trong ca, chi quỹ ≤ 2.000.000đ, chấm công trong ngày), điều chỉnh kho, kiểm kê; không vào trang/API quản lý (trừ "Hôm nay") |
| Ma trận quyền | `PERMISSIONS` | Bảng quyền × vai trò trong `src/auth/permissions.js`; server kiểm theo bảng này, test quyền sinh từ chính bảng |
| Ngày quán / giờ quán | — | Ngày giờ theo giờ Việt Nam (UTC+7); mọi báo cáo, lịch, job theo mốc này |
| Gọi lại đơn | `cart/replay` | Đưa các món của một đơn đã thu của hội viên vào giỏ, kiểm lại từng dòng, giá theo thực đơn hiện tại |
| Món yêu thích | `MemberFavorites` | Món hội viên đánh dấu ♥ cộng top 5 món hội viên mua nhiều nhất |
| Lịch thực đơn | `MenuSchedules` | Lịch theo khoảng ngày / thứ / khung giờ cho món hoặc danh mục, chế độ `SHOW` (chỉ hiện trong lịch) hoặc `HIDE` (ẩn trong lịch) |
| Thời gian chờ ước tính (ETA) | `etaService` | Số phút dự kiến món xong, tính từ hàng chờ, thời gian pha chuẩn và số người pha song song (`parallelism`) |
| Thời gian pha chuẩn | `MenuItems.PrepSeconds`, `ItemPrepStats` | Số giây pha một món: số quản lý nhập, nếu không có thì trung vị thực tế 30 ngày, nếu không có thì 180 giây |
| Chia bill / Phần | `SessionSplits` | Một nhóm dòng món trong phiên gộp được thu riêng; mỗi phần một lượt thu |
| Phần Chung | `SessionSplits.IsCommon` | Phần chứa các dòng chưa ai nhận; thu riêng hoặc tự gộp vào phần cuối |
| Đơn vị gốc / đơn vị đóng gói | `Units`, `BaseUnitCode` | Đơn vị lưu tồn và BOM (ml, g, cái…) / đơn vị nhập hàng quy đổi được về đơn vị gốc (thùng → lon → ml) |
| Giá vốn bình quân | `Ingredients.AvgCost` | Giá một đơn vị gốc, tính lại bình quân gia quyền mỗi lần nhập |
| Giá vốn (COGS) | `OrderItems.CogsAmount` | Giá vốn nguyên liệu của một dòng món, chốt lúc hoàn tất đơn |
| Bán thành phẩm | `Ingredients.Kind = 'SEMI'` | Nguyên liệu tự pha từ nguyên liệu khác theo công thức (ví dụ cốt cà phê), dùng trong BOM như nguyên liệu thường |
| Công thức / mẻ sơ chế | `SemiRecipes`, `PrepBatches` | Công thức: một mẻ ra bao nhiêu từ những gì. Mẻ: một lần pha thật, trừ đầu vào (`PREP_OUT`) và cộng đầu ra (`PREP_IN`) |
| Lô | `IngredientLots` | Một đợt hàng của nguyên liệu theo lô: số lượng còn, hạn dùng, giá, nguồn (nhập, sơ chế, điều chỉnh, hoàn kho) |
| FEFO | `sp_LotConsume` | First Expired, First Out — trừ lô hết hạn sớm nhất trước |
| Hao hụt định mức | `Ingredients.WastePercent` | % hao hụt chấp nhận được trên lượng tiêu thụ |
| Phiếu hủy hàng | `WasteLogs` | Ghi nhận hàng bỏ đi (đổ/vỡ, hết hạn, hỏng, khác), trừ tồn có giá vốn |
| Thất thoát bất thường | `reports/loss` | Phần hụt kiểm kê vượt định mức hao hụt; tô đỏ khi > 2 % tiêu thụ |
| Nhà cung cấp | `Suppliers`, `SupplierIngredients` | Nơi cung cấp nguyên liệu: gói đặt hàng, giá gần nhất, ngày giao trong tuần, nhà cung cấp ưu tiên |
| Đơn đặt hàng (PO) | `PurchaseOrders` | Purchase Order — đơn đặt hàng gửi nhà cung cấp: nháp → đã gửi → nhận một phần → đã nhận đủ (hoặc hủy) |
| Đang về | `incoming` | Lượng còn chờ nhận của các PO đã gửi / nhận một phần |
| Dự báo nhu cầu | `DemandForecasts` | Lượng nguyên liệu dự kiến dùng mỗi ngày trong 14 ngày tới |
| WMA | — | Weighted Moving Average — trung bình có trọng số cùng thứ của 4 tuần gần nhất (0,4 / 0,3 / 0,2 / 0,1); dùng cho dự báo nhập hàng và dự báo doanh thu |
| Tồn an toàn | `forecast.safety_percent` | Lượng đệm cộng thêm vào nhu cầu khi đề xuất nhập (mặc định 20 % nhu cầu) |
| Sổ quỹ | `CashTransactions` | Thu / chi tiền mặt ngoài bán hàng trong ca (mua đá, điện nước, bổ sung tiền lẻ…); khoản chi lớn chờ duyệt |
| Danh mục thu chi | `CashCategories` | Loại khoản quỹ: chiều thu/chi, có tính là chi phí không, có luôn cần duyệt không |
| Chấm công | `Attendance` | Giờ vào / ra của nhân viên, tự ghi khi đăng nhập, đăng xuất, đóng ca; sửa tay phải có lý do |
| Lịch làm | `Rosters` | Ca làm dự kiến theo người × ngày; so với chấm công để cảnh báo đi muộn (`LATE`) / vắng (`ABSENT`) |
| Năng suất | `reports/productivity` | Tiền thu, số đơn hoàn tất, giờ làm và tiền thu / giờ của từng nhân viên trong kỳ |
| Nhật ký thao tác | `AuditLogs` | Bản ghi chỉ đọc mỗi thao tác đổi tiền / kho / quyền / giá: ai, lúc nào, trước / sau; giữ 12 tháng |
| Doanh thu thuần | `revenueNet` | Σ số phải thu của các lượt thu trừ tiền đã hoàn |
| Lãi gộp | `grossMargin` | Doanh thu thuần − giá vốn; biên lãi gộp = lãi gộp ÷ doanh thu thuần |
| Chi phí cố định | `FixedCosts` | Khoản cố định hằng tháng (mặt bằng, lương…) phân bổ đều theo số ngày của tháng |
| Lợi nhuận hoạt động | `operatingProfit` | Lãi gộp − chi quỹ (danh mục chi phí) − chi phí cố định phân bổ; luôn là **ước tính** |
| Điểm hòa vốn | `breakEvenPerDay` | Doanh thu thuần mỗi ngày cần đạt để lãi gộp bù đủ chi phí cố định/ngày |
| Điểm thưởng | `Members.Points`, `PointTransactions` | 1 điểm / 10.000đ thực trả, không hết hạn; mọi thay đổi ghi sổ điểm (`EARN`, `REDEEM`, `ADJUST`, `REFUND`) |
| Quà đổi điểm | `RewardCatalog` | Quà đổi bằng điểm tại quầy: giảm số tiền (`DISCOUNT`) hoặc tặng một món (`FREE_ITEM`) |
| Đổi thưởng | `reward` | Dòng giảm "Đổi thưởng" trên lượt thu (quà điểm hoặc lượt món miễn phí của thẻ tem); tối đa một / lượt thu |
| Thẻ tem / chương trình tem | `StampCards`, `StampPrograms` | Mỗi món thuộc chương trình = 1 tem; đủ số tem (mặc định 10) → một lượt món miễn phí |
| Voucher | `Vouchers` | Mã giảm giá dùng một lần, có hạn; nguồn: giới thiệu bạn, chiến dịch, quản lý tạo tay |
| Giới thiệu bạn | `Members.ReferredByMemberId` | Hội viên mới ghi SĐT người giới thiệu khi đăng ký; lượt thu đầu tiên ≥ 30.000đ → cả hai nhận voucher 10 % |
| Phân khúc | `Segments` | Tập hội viên lọc theo điều kiện (hạng, ngày ghé cuối, số lần ghé, tổng chi, tháng sinh, điểm) |
| Chiến dịch | `Campaigns`, `CampaignDeliveries` | Gửi tin (kèm voucher riêng nếu có) tới một phân khúc qua kênh Xuất danh sách (CSV) hoặc Zalo OA, chạy ngay hoặc hẹn giờ |
| Từ chối nhận tin (opt-out) | `Members.OptOut` | Hội viên không muốn nhận tin chiến dịch; luôn bị loại khỏi phân khúc |
| Menu engineering | `reports/menu-engineering` | Xếp món theo số lượng bán và lãi gộp / món so với trung vị: `STAR` (Ngôi sao — bán chạy, lãi cao), `PLOWHORSE` (Ngựa kéo — bán chạy, lãi thấp), `PUZZLE` (Câu đố — bán ít, lãi cao), `DOG` (bán ít, lãi thấp); < 5 lần bán = "Chưa đủ dữ liệu" |
| Heatmap giờ cao điểm | `reports/heatmap` | Bảng 7 ngày × 24 giờ tô màu theo số đơn hoặc doanh thu |
| So sánh kỳ | `reports/compare` | So tuần / tháng này với kỳ trước (kỳ đang diễn ra so với cùng số ngày đầu) |
| Job nền | `JobRuns`, `src/jobs/scheduler.js` | Việc chạy định kỳ theo giờ quán (thống kê, dự báo, cảnh báo, tổng hợp…); mỗi lần chạy ghi `JobRuns` |
| Tổng hợp ngày | `DailySummaries` | Số liệu một ngày tính sẵn (job 00:30) cho dashboard "Hôm nay" |
