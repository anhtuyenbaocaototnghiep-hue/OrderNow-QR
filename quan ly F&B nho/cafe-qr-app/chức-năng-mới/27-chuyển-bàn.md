# 27. Chuyển bàn

> Khách đổi chỗ (ra ngoài hút thuốc, vào phòng lạnh, ghép với bạn đến sau): quầy chuyển **cả nhóm** sang bàn mới. Đơn đã gọi, món đang pha, chia bill, hội viên đều đi theo; thẻ đơn ở quầy pha ghi bàn mới để mang món ra đúng chỗ. Điện thoại của khách tự chuyển theo.

**Ai dùng:** nhân viên quầy, trưởng ca, quản lý. Khách không cần làm gì.

## Cách làm

1. Màn **Đơn hàng** → khung **Bàn đang phục vụ** → ở thẻ bàn bấm **Chuyển bàn**. Hoặc mở **Thu tiền** của bàn rồi bấm **Chuyển bàn**.
2. Hộp **Chuyển Bàn 01 sang bàn…** liệt kê các bàn đang dùng. Mỗi bàn ghi **trống** hoặc **đang có N nhóm**.
3. Bấm bàn mới → *"Đã chuyển nhóm từ Bàn 01 sang Bàn 05"*.

**Kết quả:**

- Thẻ bàn hiện ở bàn mới, có dòng *"↪ Chuyển từ Bàn 01 lúc 10:15"*.
- Mọi đơn của nhóm, kể cả đơn đang pha, ghi **Bàn 05** trên thẻ đơn, phiếu pha, bill.
- Bàn cũ trống lại. Khách mới quét QR bàn cũ sẽ mở nhóm mới.
- Điện thoại khách trong nhóm hiện *"Nhóm của bạn đã chuyển sang Bàn 05"* và tự chuyển sang bàn mới. Khách gọi thêm món, gọi thanh toán như bình thường. Điện thoại tắt mạng lúc chuyển thì lần mở lại trang cũng tự chuyển.

## Chuyển vào bàn đang có khách

Được. Hai nhóm ngồi chung bàn nhưng **bill vẫn riêng**, giống khi khách quét QR chọn "Tạo đơn cá nhân". Muốn tính chung một bill thì thu từng nhóm. App **không gộp bill** hai nhóm.

## Không chuyển được khi

| Báo | Nghĩa là |
| --- | --- |
| *"Nhóm đang ngồi ở bàn này rồi"* | Chọn trùng bàn hiện tại |
| *"Bàn đích đang tắt"* | Bàn bị tắt ở Quản lý → Bàn |
| *"Bàn đã thanh toán / đã đóng — không chuyển được"* | Nhóm đã thu tiền xong |

Mỗi lần chuyển đều ghi vào [Nhật ký thao tác](19-chấm-công-lịch-làm-nhật-ký.md) (ai chuyển, từ bàn nào sang bàn nào).

*Kỹ thuật: [FEATURE-049](../tài-liệu/chức-năng/FEATURE-049.md).*
