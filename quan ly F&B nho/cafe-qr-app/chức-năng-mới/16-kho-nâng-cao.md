# 16. Kho nâng cao: đơn vị, giá vốn, sơ chế, hủy hàng, lô hạn dùng, nhà cung cấp, đề xuất nhập

> Mở rộng phần [Nhập kho, kiểm kê, giá vốn](11-nhập-kho-kiểm-kê-giá-vốn.md):
>
> - **Đơn vị & giá vốn bình quân:** nhập hàng theo thùng / lon / kg; giá vốn mỗi ly chốt đúng lúc làm.
> - **Bán thành phẩm & phiếu sơ chế:** pha sẵn cốt cà phê, syrup… theo công thức, kho tự trừ nguyên liệu đầu vào.
> - **Hủy hàng & hao hụt định mức:** ghi đổ vỡ, hư hỏng; báo cáo chỉ ra thất thoát bất thường.
> - **Lô & hạn sử dụng:** hàng hết hạn sớm được dùng trước; lô hết hạn không bán và được cảnh báo.
> - **Nhà cung cấp & đơn đặt hàng:** lập đơn, in / gửi Zalo, quầy nhận hàng theo đơn.
> - **Đề xuất nhập hàng:** máy tính sẵn nên đặt bao nhiêu gói trước ngày giao.

**Ai dùng:**

| Nơi | Ai | Các tab |
| --- | --- | --- |
| **Quầy → Kho & sơ chế** | Nhân viên, trưởng ca, quản lý | **Sơ chế** · **Hủy hàng** · **Hạn dùng** · **Nhận hàng** · **Tồn kho** (+ **Kiểm kê** cho trưởng ca / quản lý) |
| **Quản lý → Kho nguyên liệu** | Quản lý | Nút **Kho nâng cao**, **Công thức**, **Lô** trên từng nguyên liệu |
| **Quản lý → Nhập kho & kiểm kê** | Quản lý | Nhập kho · Kiểm kê · Giá vốn & hao hụt · **Giá vốn thực tế** · **Thất thoát** · **Đơn vị** |
| **Quản lý → Nhà cung cấp & đặt hàng** | Quản lý | **Đề xuất nhập hàng** · **Đơn đặt hàng** · **Nhà cung cấp** · **Giá & giao hàng** |

Khi đang mở trang **Kho & sơ chế**, quầy tự nhận thông báo: *"Nguyên liệu sắp hết: …"*, *"N lô sắp hết hạn — xem tab Hạn dùng"*, *"Sắp hết trước ngày giao: …"*.

## 1. Đơn vị & giá vốn bình quân

### Khai báo đơn vị (một lần)

**Nhập kho & kiểm kê → tab Đơn vị:**

1. Điền **Mã** (ví dụ `thùng`), **Tên** (ví dụ "thùng 24 lon"), chọn **đơn vị gốc** (ví dụ `lon`) và **Hệ số** (24) → **Lưu đơn vị**.
2. Làm tương tự `lon` = 330 × `ml`. Hệ thống tự hiểu **2 thùng sữa = 2 × 24 × 330 = 15.840 ml**.
3. Muốn sửa thì gõ lại đúng mã cũ rồi lưu. Nút **Xóa** xóa ngay, không hỏi lại. Đơn vị đang được dùng thì không xóa được.

### Nhập kho theo gói

**Tab Nhập kho → Phiếu nhập mới:** mỗi dòng giờ có thêm **ô đơn vị nhập**:

- lựa chọn đầu là đơn vị gốc (ml, g…), sau đó là các đơn vị quy đổi được, ví dụ "thùng (thùng 24 lon)";
- **Giá / đơn vị đã chọn**: giá theo đơn vị vừa chọn (ví dụ giá 1 thùng). Máy tự quy ra giá mỗi ml.

Lưu phiếu → tồn cộng theo đơn vị gốc, **giá vốn bình quân** được tính lại.

**Kho nguyên liệu** ghi dưới mỗi dòng: *"Giá vốn bình quân: 32đ/ml"* (chưa có giá thì "chưa có").

### Xem giá vốn thực tế

**Nhập kho & kiểm kê → tab Giá vốn thực tế** (chọn khoảng ngày):

- 3 ô: Doanh thu món (đơn hoàn tất) · Giá vốn thực tế · Món chưa biết giá vốn;
- bảng theo món: SL, doanh thu, giá vốn, **biên lãi gộp**, số phần chưa biết giá;
- bảng theo nguyên liệu: đã dùng bao nhiêu, giá vốn bao nhiêu.

**Khác tab "Giá vốn & hao hụt" cũ thế nào:** tab cũ tính theo **giá nhập gần nhất**. Tab mới dùng giá vốn **chốt đúng lúc bấm Hoàn tất**, nên nhập hàng giá mới sau đó không làm đổi số của đơn cũ.

**Cách tính giá vốn bình quân:** (tồn cũ × giá cũ + số nhập × giá nhập) ÷ tổng số lượng. Ví dụ đang có 2.000 ml giá 100đ, nhập thêm 1.000 ml giá 200đ → giá mới 133đ/ml. Hệ thống mặc định tính bình quân; muốn tính FIFO theo lô thì vào **Quản lý → Cài đặt → Kho & giá vốn** → chọn "FIFO theo lô" (chỉ áp cho đơn hoàn tất sau khi đổi). Cùng thẻ đó chỉnh **Tồn an toàn khi đề xuất nhập (%)**.

## 2. Bán thành phẩm & phiếu sơ chế

### Quản lý khai báo (một lần)

1. **Kho nguyên liệu** → thêm nguyên liệu mới, ví dụ "Cốt cà phê" (đơn vị ml).
2. Bấm **Kho nâng cao** trên dòng đó:
   - **Loại** → **Bán thành phẩm (tự sơ chế)**;
   - **Dùng trong (giờ, sau khi pha / mở)**: ví dụ 24; để trống = không hạn → **Lưu**.
3. Dòng có nhãn **Bán thành phẩm** và nút **Công thức** → bấm vào:
   - **Một mẻ ra bao nhiêu** (ví dụ 900 ml);
   - **Nguyên liệu cho một mẻ**: **+ Nguyên liệu**, ví dụ Hạt cà phê 100 g, Nước 1.000 ml;
   - **Cách làm** (không bắt buộc) → **Lưu công thức**.
4. Trong định lượng (BOM) của món, chọn "Cốt cà phê" **như nguyên liệu thường** (ví dụ 25 ml / ly).

### Quầy pha mẻ

**Kho & sơ chế → tab Sơ chế:**

1. Khung vàng **Nên pha thêm: …** nhắc bán thành phẩm đã dưới ngưỡng cảnh báo.
2. Thẻ **Pha một mẻ**: chọn bán thành phẩm, nhập **× mẻ** (1 = một mẻ, 2 = gấp đôi), ghi chú nếu cần.
3. Xem trước: *"Ra 900 ml · giá vốn ước tính …"* và bảng nguyên liệu **Cần / Khả dụng**, dòng nào thiếu thì ghi **Thiếu** và tô đỏ.
4. Bấm **Hoàn tất mẻ** (không hỏi lại) → *"Đã sơ chế 900 ml Cốt cà phê (mẻ #…)"*. Nguyên liệu đầu vào bị trừ, cốt được cộng.
5. Mục **Mẻ hôm nay** liệt kê các mẻ đã pha, giá vốn, **Dùng trước** (hạn dùng), người pha.

**Quy tắc:**

- **Thiếu nguyên liệu thì không pha được** (nút bị mờ; hoặc báo *"Không đủ nguyên liệu để sơ chế: …"*). Không có gì bị trừ.
- **Giá vốn mẻ** = tổng giá vốn nguyên liệu đầu vào; giá 1 ml cốt = giá vốn mẻ ÷ số ml ra.
- Bán thành phẩm có thể dùng bán thành phẩm khác, **tối đa 3 cấp**, không được vòng lặp (A dùng B, B lại dùng A).
- Nguyên liệu đang **kiểm kê** (phiếu nháp) thì chưa pha được.

## 3. Hủy hàng & hao hụt định mức

### Quầy ghi phiếu hủy

**Kho & sơ chế → tab Hủy hàng → Phiếu hủy hàng:**

1. Chọn nguyên liệu, nhập **Số lượng hủy**.
2. Chọn lý do: **Đổ / vỡ** · **Hết hạn** · **Hỏng / không đạt** · **Khác**; ghi chú (ví dụ "làm đổ hộp sữa").
3. Bấm **Ghi phiếu hủy** (không hỏi lại) → *"Đã hủy … "*. Kho trừ ngay; mục **Hủy hôm nay** hiện phiếu kèm giá trị.

Không hủy được phần **đang giữ cho đơn chưa hoàn tất** (*"Không thể hủy phần đang giữ cho đơn chưa hoàn tất"*).

### Quản lý đặt định mức và xem thất thoát

1. **Kho nguyên liệu → Kho nâng cao** → ô **Hao hụt định mức (% tiêu thụ)**, ví dụ sữa 5 %. Đây là mức hao hụt "chấp nhận được".
2. **Nhập kho & kiểm kê → tab Thất thoát** (chọn khoảng ngày): mỗi nguyên liệu có Tiêu thụ · Định mức · Hủy đã ghi · Hụt kiểm kê · Chênh lệch · **Thất thoát bất thường** · Giá trị.
   - Không có gì lạ → ghi **Bình thường**.
   - Thất thoát bất thường **lớn hơn 2 % tiêu thụ** → tô đỏ.

**Ví dụ:** sữa định mức 5 %, tuần này dùng 1.000 ml (định mức 50 ml).

- Kiểm kê thiếu 40 ml → **Bình thường**.
- Kiểm kê thiếu 120 ml → thất thoát bất thường **70 ml**, tô đỏ → cần xem lại.

## 4. Lô & hạn sử dụng

### Bật theo dõi lô

**Kho nguyên liệu → Kho nâng cao** → tick **Theo dõi theo lô + hạn sử dụng (trừ kho lô hết hạn sớm trước — FEFO)** → **Lưu**.

- Tồn hiện có thành một lô **"Tồn đầu"** không hạn.
- Dòng nguyên liệu có nhãn **Theo lô** và nút **Lô**. Nếu có hàng hết hạn: nhãn đỏ **Hết hạn …**.
- Tắt theo dõi → mọi lô được đóng.

### Nhập hàng có hạn dùng

Ở phiếu nhập, nguyên liệu theo lô có thêm ô **hạn sử dụng** và ô **Mã lô**. Mỗi dòng nhập thành một lô. Bỏ trống hạn dùng thì máy tự tính theo "dùng trong … giờ".

### Hàng nào được dùng trước

Mỗi lần trừ kho (bán, sơ chế, hủy, điều chỉnh giảm…), hệ thống lấy **lô hết hạn sớm nhất trước**, rồi tới lô không hạn. Một lần trừ có thể lấy từ nhiều lô.

**Lô đã hết hạn không được tính là còn hàng**: món dùng nguyên liệu đó có thể chuyển "Hết món" dù trong kho vẫn còn số.

### Xử lý hàng hết hạn

- **Quầy → Kho & sơ chế → tab Hạn dùng:** liệt kê lô **Đã hết hạn** (dòng đỏ) và lô **Còn N ngày** (sắp hết hạn trong 3 ngày). Bấm **Hủy lô** (không hỏi lại) → toàn bộ phần còn lại của lô được ghi phiếu hủy "Hết hạn", kho trừ, lô đóng.
- **Quản lý → Kho nguyên liệu → Lô:** xem từng lô (còn bao nhiêu, hạn dùng, giá, nguồn, ngày nhận), có nút **Hủy lô**.
- **Tab Tồn kho ở quầy** có cột **Hết hạn** để biết bao nhiêu hàng đang nằm trong lô hết hạn.
- Mỗi sáng 06:00 máy tự gửi cảnh báo lô sắp / đã hết hạn tới quầy.

## 5. Nhà cung cấp & đơn đặt hàng

### Khai báo nhà cung cấp

**Nhà cung cấp & đặt hàng → tab Nhà cung cấp → + Thêm nhà cung cấp:**

1. **Tên**, **Điện thoại**, **Email**, **Giao sau (ngày)**, **Ngày giao trong tuần** (tick CN…T7), **Ghi chú**.
2. **Nguyên liệu cung cấp**: mỗi dòng chọn nguyên liệu, **đơn vị gói** (ví dụ hộp 1 lít), số lượng gốc mỗi gói (trống = tự quy đổi theo tab Đơn vị), **Giá / gói**, tick **Ưu tiên** (★ — dùng khi đề xuất nhập; mỗi nguyên liệu một nhà cung cấp ưu tiên).
3. Tick **Đang hợp tác** → **Lưu**.

### Lập và gửi đơn đặt hàng

1. **Tab Đơn đặt hàng → + Tạo đơn đặt hàng** (hoặc tạo từ tab Đề xuất nhập hàng, mục 6).
2. Chọn **Nhà cung cấp**, **Ngày giao dự kiến**, thêm dòng: nguyên liệu, **số gói**, **giá / gói** → **Lưu nháp**.
3. Bấm **Xem** trên đơn → **Gửi & in**: đơn chuyển **Đã gửi** và mở trang in.
   - **In / Lưu PDF** để in hoặc lưu file.
   - **Chép nội dung (gửi Zalo)** → dán vào Zalo gửi nhà cung cấp.

Trạng thái đơn: **Nháp** → **Đã gửi** → **Nhận một phần** → **Đã nhận đủ** (hoặc **Đã hủy**). Chỉ sửa được đơn **Nháp**. Chỉ hủy được đơn chưa nhận hàng.

### Quầy nhận hàng theo đơn

**Kho & sơ chế → tab Nhận hàng:**

1. Mỗi đơn đang chờ giao là một thẻ "#số · nhà cung cấp" → bấm **Nhận hàng**.
2. Mỗi dòng đã **điền sẵn số gói còn thiếu**. Sửa lại theo **số thực nhận**, sửa **Giá / gói** nếu đổi giá, nhập **hạn sử dụng** cho hàng theo lô. Dòng để 0 thì bỏ qua.
3. Bấm **Nhập kho** → *"Đã nhận đủ hàng"* hoặc *"Đã nhận một phần — đơn vẫn chờ phần còn lại"*.

**Nhận vượt số đã đặt** → máy báo *"Nhận vượt số đã đặt: … — kiểm tra lại hoặc xác nhận nhận vượt"*. Đúng là nhận nhiều hơn thì tick **Xác nhận nhận vượt số đã đặt** rồi bấm **Nhập kho** lại.

Mỗi lần nhận tự tạo phiếu nhập (ghi "Nhận theo PO #…"): cộng tồn, tính lại giá vốn bình quân, tạo lô, lưu lịch sử giá.

### Đánh giá nhà cung cấp

**Tab Giá & giao hàng** (30 ngày gần nhất): số đơn, **đúng hạn**, **đủ hàng** của từng nhà cung cấp; **lịch sử giá nhập** theo gói và theo đơn vị gốc.

## 6. Đề xuất nhập hàng

**Nhà cung cấp & đặt hàng → tab Đề xuất nhập hàng** (mở sẵn khi vào trang):

1. Bảng mỗi nguyên liệu: **Khả dụng** · **Đang về** (đơn đã gửi chưa nhận) · **Nhu cầu đến ngày giao** · **An toàn** · **Đề xuất nhập** (số gói) · **Dự kiến hết** · **Nhà cung cấp**.
   - **Dòng đỏ:** sẽ hết **trước ngày giao** kế tiếp → cần đặt gấp.
   - **"Không đủ dữ liệu":** nguyên liệu chưa có lịch sử dùng, chưa đề xuất được.
2. Lọc theo **Nhà cung cấp**; muốn tính tới một ngày giao cụ thể thì chọn **Ép ngày giao (tùy chọn)**.
3. Tick các dòng cần đặt → **Tạo đơn đặt hàng từ dòng đã chọn** → mỗi nhà cung cấp một **đơn nháp**, trang tự chuyển sang tab Đơn đặt hàng để kiểm lại và gửi.
4. Bấm **tên nguyên liệu** → biểu đồ 4 tuần đã dùng (cột nâu) và 14 ngày dự báo (cột cam).
5. Nút **Tính lại dự báo** tính ngay; bình thường máy tự tính lúc 02:00. 06:05 sáng quầy nhận cảnh báo nguyên liệu sắp hết trước ngày giao.

**Cách tính (dễ hiểu):**

- Dự báo theo **thứ trong tuần**: lấy cùng thứ của 4 tuần gần nhất, tuần gần nặng hơn (40 % · 30 % · 20 % · 10 %), cộng thêm hao hụt định mức. Ngày quán nghỉ không tính.
- **Đề xuất** = nhu cầu đến ngày giao + tồn an toàn 20 % − khả dụng − hàng đang về, **làm tròn lên** theo gói.
- Ô tick bị khóa khi nguyên liệu **chưa gán nhà cung cấp** hoặc không cần đặt.

## 7. Trưởng ca: điều chỉnh kho & kiểm kê ở quầy

Trưởng ca (và quản lý) thấy thêm ở **Kho & sơ chế**:

- **Tab Tồn kho → nút Điều chỉnh:** chọn **Đặt số tồn mới (kiểm kê)** hoặc **Cộng / trừ (nhập thêm, hao hụt…)**, nhập số lượng, **Lý do** → **Lưu điều chỉnh**.
- **Tab Kiểm kê:** **+ Phiếu kiểm kê mới** → **Nhập số đếm** → **Lưu nháp** / **Chốt kiểm kê** / **Xóa phiếu**, giống tab Kiểm kê của quản lý ([mục 11](11-nhập-kho-kiểm-kê-giá-vốn.md)).

Nhân viên thường không có hai chức năng này. Xem [Trưởng ca & phân quyền](17-trưởng-ca-và-phân-quyền.md).

## Hỏi nhanh

| Tình huống | Làm gì |
| --- | --- |
| *"Không quy đổi được "…" sang … cho …"* | Đơn vị gói chưa nối được về đơn vị gốc. Thêm quy đổi ở tab **Đơn vị** |
| *"Nguyên liệu đang được kiểm kê…"* khi pha mẻ / hủy hàng | Chốt hoặc xóa phiếu kiểm kê nháp trước |
| Kho còn số nhưng món báo "Hết món" | Có thể hàng nằm trong **lô đã hết hạn**. Xem tab **Hạn dùng** và hủy lô |
| Đơn đặt hàng không hủy được | Đơn đã nhận một phần — không hủy được nữa |
| Đề xuất ghi "Không đủ dữ liệu" | Nguyên liệu chưa có lịch sử dùng. Đặt tay trong tab Đơn đặt hàng |

*Kỹ thuật: [FEATURE-031](../tài-liệu/chức-năng/FEATURE-031.md) · [FEATURE-027](../tài-liệu/chức-năng/FEATURE-027.md) · [FEATURE-032](../tài-liệu/chức-năng/FEATURE-032.md) · [FEATURE-028](../tài-liệu/chức-năng/FEATURE-028.md) · [FEATURE-030](../tài-liệu/chức-năng/FEATURE-030.md) · [FEATURE-029](../tài-liệu/chức-năng/FEATURE-029.md).*
