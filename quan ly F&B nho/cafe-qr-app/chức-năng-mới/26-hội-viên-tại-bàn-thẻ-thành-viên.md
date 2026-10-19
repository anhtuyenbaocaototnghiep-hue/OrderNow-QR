# 26. Hội viên khi gọi món tại bàn & Thẻ thành viên

> Nhân viên đi order tại bàn giờ **gắn được SĐT hội viên ngay lúc gọi món** (hoặc đăng ký nhanh cho khách mới), không phải đợi tới lúc thu tiền. Khách đã gắn SĐT mở được **Thẻ thành viên** trên điện thoại để xem điểm, thẻ tem, quà đổi được và **voucher của mình** (giá trị, hạn dùng, đến từ chiến dịch nào). Bill thanh toán in thêm điểm hiện có và voucher còn hạn.

**Ai dùng:**

- **Nhân viên / trưởng ca / quản lý:** gắn, đăng ký, gỡ hội viên ở trang **Gọi món tại bàn** (mục 13).
- **Khách:** xem Thẻ thành viên trên điện thoại, chỉ khi đang ngồi ở quán (SĐT đang gắn vào bàn của mình).
- **Thu ngân:** bill in có khối "Thẻ thành viên".

Ưu đãi hội viên, điểm, tem vẫn tính **lúc thu tiền** như trước (mục 1 và mục 21). Không có đăng nhập / mã OTP.

## Nhân viên: gắn hội viên ở Gọi món tại bàn

1. Mở **Gọi món tại bàn** → chọn bàn (bàn trống cũng được).
2. Dưới ô ghi chú bàn có khung **⭐ Hội viên**: nhập **SĐT hội viên** → bấm **Tra cứu** (hoặc Enter).
3. **Đã là hội viên:** hiện *tên đầy đủ · SĐT · mức ưu đãi* (ví dụ "Thành viên −3%" hoặc "đơn đầu −10%") → bấm **Gắn vào bàn**.
4. **Chưa là hội viên:** hiện form đăng ký nhanh:
   - **Họ tên khách**;
   - **SĐT người giới thiệu** (không bắt buộc — có thì cả hai nhận voucher theo mục 21);
   - **tick "Khách đồng ý cho quán lưu SĐT + tên để tích lũy ưu đãi"** — phải hỏi khách trước; chưa tick thì máy báo *"Cần khách đồng ý trước khi đăng ký"*;
   - bấm **Đăng ký & gắn vào bàn**.
5. Máy báo *"Đã gắn hội viên … vào Bàn …"*. Khung đổi thành dòng **⭐ Tên · ưu đãi** + nút **Gỡ**.

**Bàn trống / nhóm mới:** nút thành **Mở bàn & gắn** (hoặc **Đăng ký & mở bàn & gắn**) — máy mở bàn (kèm ghi chú bàn đang gõ) rồi gắn hội viên luôn.

**Nhầm số:** bấm **Gỡ**, hoặc nhập số khác → Tra cứu → Gắn (thay số cũ).

Khách cùng bàn quét QR sẽ thấy ngay *"Bạn đang nhận ưu đãi …"* với **tên che** (ví dụ "Trần T. B."). Khi thu tiền ở hộp **Thu tiền bàn**, hội viên đã có sẵn — không phải nhập lại.

## Khách: xem Thẻ thành viên

1. Ở giỏ hàng hoặc màn **Đơn của bạn**, khung hội viên (đã gắn SĐT) có link **Xem thẻ thành viên ›**.
2. Thẻ hiện:
   - **đầu thẻ:** tên che, SĐT che (ví dụ "09xx***543"), hạng, **số điểm** lớn; dòng ưu đãi *"Giảm x% mỗi lần thanh toán"* (hoặc *"Đơn đầu tiên −10% · sau đó −x%"*);
   - **🎫 Voucher của bạn (n):** giá trị ("−15%", "−20.000đ", "−10% (tối đa 30.000đ)"), nguồn (*Chiến dịch "…"* / *Giới thiệu bạn* / *Quán tặng*), hạn dùng, "đơn từ …". **Không hiện mã** — khách *"Báo nhân viên khi thanh toán để dùng voucher"*, quầy chọn mã ở khung voucher khi thu (mục 21);
   - **🎟 Thẻ tem:** tiến độ từng chương trình;
   - **🎁 Đổi điểm lấy quà:** quà nào **✓ đủ điểm**, quà nào **còn thiếu N** điểm;
   - **🏅 Lịch sử điểm gần đây:** tối đa 10 lần gần nhất (Tích điểm, Đổi quà, Quán điều chỉnh, Hoàn tiền…), không ghi tên nhân viên.
3. Thẻ hiển thị gọn trên điện thoại, không phải cuộn ngang.

**Chỉ xem được khi:** bàn **chưa thanh toán xong** và SĐT **đang gắn vào bàn** của chính điện thoại đó (khách tự nhập hoặc nhân viên gắn). Thanh toán xong → không xem nữa; muốn xem lại thì lần sau ngồi ở quán gắn SĐT lại. Người cùng nhóm (cùng bàn) cũng mở được thẻ này — chỉ thấy số điểm, voucher, **không thấy mã**.

## Bill in quyền lợi

Bill **thanh toán** có hội viên (thu cả bàn, thu từng phần chia bill, bán mang đi) in thêm ở cuối:

```
THẺ THÀNH VIÊN (lúc in)
Điểm hiện có: 23 điểm
4/10 tem — còn 6 ly nữa được tặng
Voucher còn hạn (1):
  −15% · HSD 25/10/2026
```

- Số liệu lấy **lúc in**: in lại bill hôm sau sẽ ra số mới.
- **Phiếu tạm tính** và bill **không có hội viên** không in khối này.

## Quy tắc cần nhớ

- Đăng ký **luôn phải có khách đồng ý** (tick ô) — kể cả nhân viên đăng ký giúp.
- Gắn hội viên ở bàn **không giảm giá ngay**: ưu đãi, điểm, tem tính khi bấm **Đã thu tiền**.
- Thẻ thành viên **không bao giờ hiện mã voucher**; mã chỉ quầy thấy khi thu tiền.
- Gỡ hội viên được trước khi thu tiền.

## Hỏi nhanh

| Máy báo / tình huống | Làm gì |
| --- | --- |
| *"Số điện thoại không hợp lệ (ví dụ 0912345678)"* | Nhập lại đủ 10 số |
| *"Cần khách đồng ý trước khi đăng ký"* | Hỏi khách rồi tick ô đồng ý |
| *"Không tìm thấy hội viên giới thiệu với số điện thoại này"* / *"Không thể tự giới thiệu chính mình"* | Xóa ô SĐT người giới thiệu (không bắt buộc) hoặc nhập đúng số người đã là hội viên |
| *"Người giới thiệu đã đạt giới hạn số lượt giới thiệu trong tháng"* | Đăng ký không kèm người giới thiệu |
| Khách hỏi mã voucher | Thu tiền như bình thường, chọn voucher của hội viên ở khung **Hội viên · giảm giá · voucher** (mục 21) |
| Khách bấm Xem thẻ thành viên mà báo phiên đã đóng / chưa gắn SĐT | Bàn đã thanh toán, hoặc chưa gắn SĐT — gắn SĐT (khách tự nhập hoặc nhân viên gắn) rồi mở lại |

*Kỹ thuật: [FEATURE-047](../tài-liệu/chức-năng/FEATURE-047.md) · [ADR-008](../tài-liệu/quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md).*
