-- 0005_combo — FEATURE-015 Combo cố định (ADR-005 D-9) + kiểu bảng dòng đơn đã tính giá dùng cho bộ tính giá (pricing).
-- Combo là MenuItems ItemType='COMBO' (không có BOM riêng, không thuộc danh mục); dòng đơn combo = 1 dòng cha + N dòng con giá 0.

ALTER TABLE dbo.MenuItems ADD ItemType VARCHAR(10) NOT NULL CONSTRAINT DF_MenuItems_ItemType DEFAULT 'SINGLE'
  CONSTRAINT CK_MenuItems_ItemType CHECK (ItemType IN ('SINGLE', 'COMBO'));
GO

-- Combo không cần danh mục: CategoryId cho phép NULL (chỉ với combo)
ALTER TABLE dbo.MenuItems DROP CONSTRAINT FK_MenuItems_Categories;
ALTER TABLE dbo.MenuItems ALTER COLUMN CategoryId INT NULL;
ALTER TABLE dbo.MenuItems ADD CONSTRAINT FK_MenuItems_Categories FOREIGN KEY (CategoryId) REFERENCES dbo.Categories(CategoryId);
ALTER TABLE dbo.MenuItems ADD CONSTRAINT CK_MenuItems_Category CHECK (ItemType = 'COMBO' OR CategoryId IS NOT NULL);
GO

CREATE TABLE dbo.ComboComponents (
  ComboMenuItemId     INT NOT NULL CONSTRAINT FK_Combo_Combo REFERENCES dbo.MenuItems(MenuItemId),
  ComponentMenuItemId INT NOT NULL CONSTRAINT FK_Combo_Component REFERENCES dbo.MenuItems(MenuItemId),
  Quantity            INT NOT NULL CONSTRAINT CK_Combo_Quantity CHECK (Quantity BETWEEN 1 AND 10),
  CONSTRAINT PK_ComboComponents PRIMARY KEY (ComboMenuItemId, ComponentMenuItemId),
  CONSTRAINT CK_Combo_NotSelf CHECK (ComboMenuItemId <> ComponentMenuItemId)
);
CREATE INDEX IX_Combo_Component ON dbo.ComboComponents (ComponentMenuItemId);

ALTER TABLE dbo.OrderItems ADD
  ParentOrderItemId INT NULL CONSTRAINT FK_OrderItems_Parent REFERENCES dbo.OrderItems(OrderItemId),
  ListPrice         DECIMAL(12,0) NULL;      -- giá niêm yết lúc đặt (gồm phụ thu tùy chọn); NULL = đơn trước 0005
GO
CREATE INDEX IX_OrderItems_Parent ON dbo.OrderItems (ParentOrderItemId) WHERE ParentOrderItemId IS NOT NULL;

-- BR-015 (1..50) áp cho dòng khách chọn; dòng con combo = SL combo × SL thành phần (≤ 50 × 10)
ALTER TABLE dbo.OrderItems DROP CONSTRAINT CK_OrderItems_Quantity;
ALTER TABLE dbo.OrderItems ADD CONSTRAINT CK_OrderItems_Quantity
  CHECK (Quantity >= 1 AND Quantity <= CASE WHEN ParentOrderItemId IS NULL THEN 50 ELSE 500 END);
GO

-- Dòng đơn đã tính giá ở service (pricing) truyền vào sp_SubmitOrder. ParentLineNum ≠ NULL = dòng con combo.
CREATE TYPE dbo.OrderLineInput AS TABLE (
  LineNum          INT           NOT NULL PRIMARY KEY,
  ParentLineNum    INT           NULL,
  MenuItemId       INT           NOT NULL,
  Quantity         INT           NOT NULL,
  Note             NVARCHAR(200) NULL,
  ListPrice        DECIMAL(12,0) NOT NULL,   -- đơn giá niêm yết (gồm phụ thu tùy chọn)
  UnitPrice        DECIMAL(12,0) NOT NULL,   -- đơn giá thực tính (sau khuyến mãi dòng)
  PromotionId      INT           NULL,       -- khuyến mãi dòng (F-016)
  AllowMemberStack BIT           NOT NULL    -- dòng được cộng chiết khấu hội viên (D-10)
);
GO
