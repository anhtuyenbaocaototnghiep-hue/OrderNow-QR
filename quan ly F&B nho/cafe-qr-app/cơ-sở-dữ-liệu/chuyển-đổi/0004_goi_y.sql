-- 0004_goi_y — FEATURE-017 Gợi ý / bán chạy / ghim (ADR-005 D-11).
ALTER TABLE dbo.MenuItems ADD
  IsPinned            BIT NOT NULL CONSTRAINT DF_MenuItems_IsPinned DEFAULT 0,
  PinLabel            NVARCHAR(30) NULL,
  PinOrder            INT NULL,
  HideFromSuggestions BIT NOT NULL CONSTRAINT DF_MenuItems_HideSuggest DEFAULT 0;
GO

INSERT dbo.Settings (SettingKey, SettingValue) VALUES
  (N'suggestion.mode', N'BOTH'),          -- AUTO | PINNED | BOTH
  (N'suggestion.window_days', N'7'),
  (N'suggestion.top_n', N'8');
GO
