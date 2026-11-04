-- 0045_thu_thap_ngay_sinh — FEATURE-068 thu thập ngày sinh hội viên (ADR-026 D-101…D-106). Chỉ thêm.
-- Members: lần gần nhất nhân viên ghi "khách không muốn cho" ngày sinh — quầy nhắc lại sau 365 ngày; ẩn danh → NULL.
-- Ngày sinh không rõ năm lưu trong BirthDate với năm 1904 (quy ước ở repository, không cần cột mới).
IF COL_LENGTH('dbo.Members', 'BirthDateDeclinedAt') IS NULL
  ALTER TABLE dbo.Members ADD BirthDateDeclinedAt DATETIME2(0) NULL;
GO
