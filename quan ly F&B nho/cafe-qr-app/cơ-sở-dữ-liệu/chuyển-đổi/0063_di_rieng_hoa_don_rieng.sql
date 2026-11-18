-- 0063_di_rieng_hoa_don_rieng — ADR-065 D-255 (TASK-127): khách tự vào nhóm của bàn có thể bấm "Tôi đi riêng — hóa đơn riêng".
-- Máy chủ chỉ cho đi riêng khi điện thoại này CHƯA gửi món nào trong nhóm (món đã gửi nằm trong hóa đơn của nhóm — muốn trả riêng
-- thì dùng "Chia bill theo người"). Đơn không lưu điện thoại nào gọi, nên ghi mốc gửi món đầu tiên ngay trên dòng thành viên nhóm.
-- Chỉ thêm cột, không đổi dữ liệu cũ (dòng cũ NULL = chưa biết → coi như chưa gửi; nút chỉ hiện ngay sau khi vào nhóm).
IF COL_LENGTH('dbo.SessionClients', 'OrderedAt') IS NULL
  ALTER TABLE dbo.SessionClients ADD OrderedAt DATETIME2(0) NULL;
GO
