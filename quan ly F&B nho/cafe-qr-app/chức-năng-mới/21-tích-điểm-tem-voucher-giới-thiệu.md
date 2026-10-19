# 21. Tích điểm, thẻ tem, voucher & giới thiệu bạn

> Mở rộng [Hội viên](01-hội-viên.md):
>
> - **Tích điểm:** cứ **10.000đ thực trả = 1 điểm**, không hết hạn. Đủ điểm thì đổi quà (giảm tiền hoặc tặng món) ngay lúc thu tiền.
> - **Thẻ tem:** mỗi ly thuộc chương trình = 1 tem. Đủ tem (mặc định 10) → **1 món miễn phí**.
> - **Giới thiệu bạn:** khách mới đăng ký kèm SĐT người giới thiệu. Lần thanh toán đầu từ 30.000đ → **cả hai** nhận voucher giảm 10 %, hạn 30 ngày.
> - **Voucher:** mã giảm giá dùng một lần, áp ở quầy khi thu tiền.

**Ai dùng:**

- **Quầy** (nhân viên, trưởng ca, quản lý): đổi thưởng, áp voucher, đăng ký có người giới thiệu.
- **Khách:** xem điểm, tem, voucher trên điện thoại; tự đăng ký kèm người giới thiệu.
- **Quản lý:** cài quà, chương trình tem, tạo voucher ở **Quản lý → Tích điểm, voucher & chiến dịch**; điều chỉnh điểm ở **Hội viên**.

## Đã đổi so với trước

Trước đây 1.000đ = 1 điểm và điểm chưa dùng được. **Nay 10.000đ thực trả = 1 điểm** và điểm đổi được quà. Điểm cũ của khách được giữ nguyên trong sổ điểm (dòng "Số dư trước F-039").

## Quầy: khung "Hội viên · giảm giá · voucher"

Khung này có ở **Thu tiền bàn**, **Thu phần này** (bàn chia bill) và **Bán mang đi**.

1. Nhập **SĐT hội viên** → **Tra cứu**. Hiện "⭐ Tên · Hạng x%" và nút **Gỡ**.
2. Ngay dưới hiện:
   - **số điểm** đang có;
   - mỗi thẻ tem một dòng, ví dụ "🎟 Thẻ tích ly: 8/10 tem — còn 2 ly nữa được tặng", hoặc "10/10 tem — có 1 lượt món miễn phí".
3. **Đổi thưởng** (chỉ hiện khi có quà hoặc có lượt tem miễn phí) — chọn một:
   - **— Không đổi thưởng —**;
   - **<Tên quà> — <điểm> điểm**. Không đủ điểm thì dòng ghi "(chưa đủ)" và không chọn được;
   - **Tặng 1 món — <chương trình> (N lượt)** khi thẻ tem đã đủ.
4. Dòng mờ cuối khung: **"Lượt này tích +N điểm, +M tem"** — số điểm / tem khách sẽ được cộng sau khi thu.
5. Bảng tiền hiện dòng giảm "Đổi 100 điểm: <tên quà>" hoặc "Tặng 1 <tên món> (thẻ tem <chương trình>)". Bấm **Đã thu tiền & In bill** (bàn) / **Thu tiền & In bill** (mang đi).
6. Hóa đơn in có dòng "Đổi thưởng" (nếu có) và sau TỔNG CỘNG có "Tích +N điểm", "Tích +M tem".

**Quy tắc đổi thưởng:**

- **Mỗi lượt thu đổi một thưởng.** Phải gắn hội viên trước.
- **Không dùng cùng giảm giá tay:** chọn quà thì ô Giảm giá tay bị khóa.
- **Quà tặng món:** món đó phải **có trên bill** (*"Bill chưa có món … để tặng"*). Lượt tem miễn phí tặng món tặng của chương trình, hoặc món rẻ nhất của chương trình có trên bill.
- Điểm tích theo **số thực trả** sau mọi khoản giảm (kể cả đổi thưởng). Món được tặng không tích tem.
- Hai quầy cùng đổi điểm của một khách → chỉ một bên được (*"Hội viên không đủ điểm"*).
- **Hoàn tiền:** điểm đã tích bị trừ lại tương ứng; hoàn **toàn bộ** lượt thu thì trả lại điểm / lượt tem đã đổi; đơn bị hủy thì trừ tem của món đó.

## Quầy: áp voucher

Trong cùng khung:

- **Voucher của hội viên** hiện thành nút "🎫 GTxxxxxxxx −10%". Bấm để áp, bấm lại để bỏ.
- **Khách đưa mã** (voucher quản lý tặng, voucher chiến dịch): gõ vào ô **Mã voucher** → **Áp mã**. Áp được thì hiện "Đang áp <mã>". Để trống rồi bấm Áp mã = bỏ voucher.
- Bảng tiền có dòng "Voucher <mã> −10%". Bill in có dòng "Voucher <mã>".

**Lỗi hay gặp:**

| Thông báo | Nghĩa |
| --- | --- |
| "Không tìm thấy mã voucher" | Gõ sai mã |
| "Voucher này đã được dùng" | Mỗi voucher chỉ dùng một lần |
| "Voucher đã hết hạn" | Quá hạn dùng |
| "Voucher này thuộc hội viên khác — hãy gắn đúng hội viên trước khi dùng" | Voucher gắn với người khác |
| "Voucher áp cho đơn từ …" | Đơn chưa đủ mức tối thiểu |

**Thứ tự tính tiền:** khuyến mãi → hội viên → **voucher** → **đổi thưởng** → giảm tay → làm tròn. Mỗi lượt thu dùng **một** voucher.

Mã bắt đầu bằng **GT** là voucher giới thiệu, **QL** là quản lý tặng, **CD** là voucher chiến dịch ([mục 22](22-chiến-dịch.md)).

## Giới thiệu bạn

### Đăng ký có người giới thiệu

- **Khách tự đăng ký** (giỏ hàng → **⭐ Nhập SĐT để nhận ưu đãi** → số chưa đăng ký): có thêm ô **SĐT người giới thiệu (không bắt buộc)**.
- **Quầy đăng ký nhanh** (Tra cứu số chưa đăng ký): ô **SĐT người giới thiệu (không bắt buộc)** → tick khách đồng ý → **Đăng ký**. Máy báo *"Đã đăng ký (có người giới thiệu) — thanh toán lần đầu từ 30.000đ cả hai nhận voucher"*.

### Khi nào được tặng voucher

- Ở **lần thanh toán đầu tiên** của người mới, nếu số phải trả **từ 30.000đ** → tạo **2 voucher giảm 10 %, hạn 30 ngày**: một cho người mới, một cho người giới thiệu.
- Quầy nhận thông báo *"Đã tặng 2 voucher giới thiệu: GT…, GT…"*.
- Khách ngồi bàn thấy *"🎉 Bạn và người giới thiệu mỗi người nhận 1 voucher giảm 10% — dùng ở lần sau, báo nhân viên khi thanh toán."*.
- Lần thanh toán đầu **dưới 30.000đ** thì **không** tặng, và các lần sau cũng không tặng nữa.

### Giới hạn

- SĐT người giới thiệu phải là hội viên đang hoạt động; không tự giới thiệu chính mình.
- Mỗi người chỉ được giới thiệu **một lần** (lúc đăng ký).
- Mỗi người giới thiệu tối đa **5 người / tháng** (*"Người giới thiệu đã đạt giới hạn số lượt giới thiệu trong tháng"*).

## Khách xem điểm, tem, voucher

Khi bàn đã gắn hội viên, ô hội viên trong **giỏ hàng** và trang **Đơn của bạn** hiện:

- "🏅 N điểm";
- thẻ tem, ví dụ "🎟 8/10 tem — còn 2 ly nữa được tặng";
- "🎫 Bạn có 1 voucher (−10%) — báo nhân viên khi thanh toán". **Khách không thấy mã voucher** — nhân viên tra SĐT là thấy nút voucher.

## Quản lý cài đặt

**Quản lý → Tích điểm, voucher & chiến dịch** có 4 tab: **Quà đổi điểm** · **Chương trình tem** · **Voucher** · **Phân khúc & chiến dịch** (xem [mục 22](22-chiến-dịch.md)).

### Tab Quà đổi điểm

**+ Thêm quà** → **Tên quà**, **Số điểm cần** (mặc định 100), **Loại quà**:

- **Giảm tiền** → **Số tiền giảm (đ)** (mặc định 20.000);
- **Tặng một món** → chọn **Món tặng (phải có trên bill)**.

→ **Lưu**. Công tắc **Đang dùng** để tạm ngừng quà. Quà đã từng đổi khi xóa chỉ chuyển thành ngừng dùng.

### Tab Chương trình tem

**+ Thêm chương trình tem** → **Tên chương trình** (ví dụ "Thẻ tích ly"), **Số tem đổi 1 món** (2–50, mặc định 10), tick **Món tích tem**, **Món tặng** (để trống = món rẻ nhất của chương trình có trên bill), tick **Đang chạy** → **Lưu**.

### Tab Voucher

- Danh sách voucher 30 ngày gần nhất: Mã · Giảm · Hội viên · Nguồn (**Giới thiệu bạn** / **Chiến dịch** / **Quản lý tặng**) · Hạn · Trạng thái (**Còn dùng được** / **Đã dùng …** / **Hết hạn**).
- **+ Tạo voucher**: **Kiểu** (Giảm % / Giảm số tiền), **Mức giảm**, **Đơn tối thiểu (đ)**, **Hiệu lực (ngày)** → **Tạo** → máy báo mã **QL…**. Voucher này **không gắn hội viên**: ai có mã đều dùng được **một lần**.

### Hồ sơ hội viên

**Quản lý → Hội viên → Xem** → mục **Điểm · tem · voucher**:

- thẻ tem của khách, voucher của khách, người khách đã giới thiệu;
- **Điều chỉnh điểm**: nhập số (ví dụ `+50` hoặc `-20`) và **Lý do (bắt buộc)** → **Điều chỉnh điểm** (*"Đã điều chỉnh — còn N điểm"*). Không trừ quá số điểm đang có. Mỗi lần điều chỉnh được ghi nhật ký thao tác;
- **sổ điểm** 15 dòng gần nhất: Tích / Đổi quà / Điều chỉnh / Hoàn tiền.

*Kỹ thuật: [FEATURE-039](../tài-liệu/chức-năng/FEATURE-039.md) · [FEATURE-038](../tài-liệu/chức-năng/FEATURE-038.md).*
