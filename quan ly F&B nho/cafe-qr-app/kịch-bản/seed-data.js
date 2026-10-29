// Dữ liệu mẫu dùng chung cho `npm run db:seed` và test.
// Seed nền: admin (từ biến môi trường), 1 nhân viên mẫu, 2 danh mục, 8 món, 6 nguyên liệu, BOM, 6 bàn.
// Seed demo (--demo): đơn đã thanh toán 01–10/10/2026 để đối chiếu báo cáo (AC-012-01).
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { newQrToken } from '../ứng-dụng/máy-chủ/src/utils/tokens.js';

export { newQrToken };

export const SAMPLE = {
  categories: [
    { name: 'Cà phê', sortOrder: 1 },
    { name: 'Trà & đồ uống khác', sortOrder: 2 },
  ],
  ingredients: [
    { name: 'Cà phê cốt', unit: 'ml', stock: 2000, low: 300 },
    { name: 'Sữa đặc', unit: 'ml', stock: 1500, low: 200 },
    { name: 'Đường', unit: 'g', stock: 3000, low: 300 },
    { name: 'Cốt trà đào', unit: 'ml', stock: 1000, low: 150 },
    { name: 'Đào ngâm', unit: 'miếng', stock: 80, low: 10 },
    { name: 'Sữa tươi', unit: 'ml', stock: 3000, low: 500 },
  ],
  // bom: [tên nguyên liệu, định lượng cho 1 suất]
  menu: [
    {
      cat: 'Cà phê',
      name: 'Cà phê đen',
      price: 25000,
      bom: [
        ['Cà phê cốt', 25],
        ['Đường', 10],
      ],
    },
    {
      cat: 'Cà phê',
      name: 'Cà phê sữa',
      price: 29000,
      bom: [
        ['Cà phê cốt', 25],
        ['Sữa đặc', 20],
      ],
    },
    {
      cat: 'Cà phê',
      name: 'Bạc xỉu',
      price: 32000,
      bom: [
        ['Cà phê cốt', 15],
        ['Sữa đặc', 20],
        ['Sữa tươi', 60],
      ],
    },
    {
      cat: 'Cà phê',
      name: 'Latte',
      price: 39000,
      bom: [
        ['Cà phê cốt', 30],
        ['Sữa tươi', 150],
      ],
    },
    {
      cat: 'Trà & đồ uống khác',
      name: 'Trà đào',
      price: 35000,
      bom: [
        ['Cốt trà đào', 50],
        ['Đào ngâm', 2],
        ['Đường', 15],
      ],
    },
    {
      cat: 'Trà & đồ uống khác',
      name: 'Sữa tươi đường',
      price: 25000,
      bom: [
        ['Sữa tươi', 200],
        ['Đường', 10],
      ],
    },
    { cat: 'Trà & đồ uống khác', name: 'Nước suối', price: 10000, bom: [] },
    { cat: 'Trà & đồ uống khác', name: 'Bánh croissant', price: 25000, bom: [] },
  ],
  tables: ['01', '02', '03', '04', '05', '06'],
};

async function upsertUser(pool, { username, password, fullName, role }) {
  const exists = await pool.request().input('u', sql.NVarChar(50), username).query('SELECT UserId FROM dbo.Users WHERE Username = @u');
  if (exists.recordset.length) return { userId: exists.recordset[0].UserId, created: false };
  const hash = await bcrypt.hash(password, 10);
  const r = await pool
    .request()
    .input('u', sql.NVarChar(50), username)
    .input('h', sql.NVarChar(255), hash)
    .input('n', sql.NVarChar(100), fullName)
    .input('r', sql.VarChar(10), role)
    // F-061 (ADR-021 D-80): tài khoản do lệnh cài đặt tạo (chủ quán, nhân viên mẫu) không hiện hướng dẫn 5 bước — chỉ tài khoản tạo sau
    .query('INSERT dbo.Users (Username, PasswordHash, FullName, Role, TourSeenAt) OUTPUT inserted.UserId VALUES (@u, @h, @n, @r, SYSUTCDATETIME())');
  return { userId: r.recordset[0].UserId, created: true };
}

/** Seed nền — idempotent: bỏ qua phần đã có dữ liệu. Trả về id các bản ghi chính (tiện cho test). */
export async function seedBase(pool, { adminUsername, adminPassword, staff = true } = {}) {
  const out = { log: [] };
  const admin = await upsertUser(pool, { username: adminUsername, password: adminPassword, fullName: 'Quản lý', role: 'ADMIN' });
  out.adminId = admin.userId;
  out.log.push(admin.created ? `admin ${adminUsername} created` : `admin ${adminUsername} exists`);
  if (staff) {
    const s = await upsertUser(pool, { username: 'staff1', password: 'Staff@123', fullName: 'Nhân viên quầy 1', role: 'STAFF' });
    out.staffId = s.userId;
    out.log.push(s.created ? 'staff1 created' : 'staff1 exists');
  }

  const hasMenu = (await pool.request().query('SELECT COUNT(*) AS n FROM dbo.MenuItems')).recordset[0].n > 0;
  if (!hasMenu) {
    const catIds = {};
    for (const c of SAMPLE.categories) {
      const r = await pool
        .request()
        .input('n', sql.NVarChar(50), c.name)
        .input('s', sql.Int, c.sortOrder)
        .query('INSERT dbo.Categories (Name, SortOrder) OUTPUT inserted.CategoryId VALUES (@n, @s)');
      catIds[c.name] = r.recordset[0].CategoryId;
    }
    const ingIds = {};
    for (const ing of SAMPLE.ingredients) {
      const r = await pool
        .request()
        .input('n', sql.NVarChar(100), ing.name)
        .input('u', sql.NVarChar(10), ing.unit)
        .input('q', sql.Decimal(18, 3), ing.stock)
        .input('l', sql.Decimal(18, 3), ing.low)
        .input('by', sql.Int, out.adminId).query(`DECLARE @id TABLE (IngredientId INT);
                INSERT dbo.Ingredients (Name, Unit, StockQty, LowStockThreshold) OUTPUT inserted.IngredientId INTO @id VALUES (@n, @u, @q, @l);
                INSERT dbo.InventoryTransactions (IngredientId, Type, Delta, BalanceAfter, Reason, CreatedBy)
                SELECT IngredientId, 'ADJUST', @q, @q, N'Tồn kho ban đầu (seed)', @by FROM @id;
                SELECT IngredientId FROM @id;`);
      ingIds[ing.name] = r.recordset[0].IngredientId;
    }
    for (const m of SAMPLE.menu) {
      const r = await pool
        .request()
        .input('c', sql.Int, catIds[m.cat])
        .input('n', sql.NVarChar(100), m.name)
        .input('p', sql.Decimal(12, 0), m.price)
        .query('INSERT dbo.MenuItems (CategoryId, Name, Price) OUTPUT inserted.MenuItemId VALUES (@c, @n, @p)');
      const id = r.recordset[0].MenuItemId;
      for (const [ingName, amount] of m.bom) {
        await pool
          .request()
          .input('m', sql.Int, id)
          .input('i', sql.Int, ingIds[ingName])
          .input('a', sql.Decimal(18, 3), amount)
          .query('INSERT dbo.BomItems (MenuItemId, IngredientId, Amount) VALUES (@m, @i, @a)');
      }
    }
    out.log.push(`menu: ${SAMPLE.categories.length} categories, ${SAMPLE.menu.length} items, ${SAMPLE.ingredients.length} ingredients`);
  } else {
    out.log.push('menu exists — skipped');
  }

  const hasTables = (await pool.request().query('SELECT COUNT(*) AS n FROM dbo.Tables')).recordset[0].n > 0;
  if (!hasTables) {
    for (const code of SAMPLE.tables) {
      await pool
        .request()
        .input('c', sql.NVarChar(10), code)
        .input('n', sql.NVarChar(50), `Bàn ${code}`)
        .input('q', sql.Char(32), newQrToken())
        .query('INSERT dbo.Tables (Code, Name, QrToken) VALUES (@c, @n, @q)');
    }
    out.log.push(`tables: ${SAMPLE.tables.length}`);
  } else {
    out.log.push('tables exist — skipped');
  }
  return out;
}

/**
 * Seed demo cho báo cáo: ngày d (1..10/10/2026) có d đơn mang đi đã thu tiền, mỗi đơn 2 × "Cà phê sữa" (58.000đ),
 * thanh toán lúc 10:00 giờ VN. Tổng: 55 đơn, 3.190.000đ; ngày d = d × 58.000đ. Không chạm kho (dữ liệu lịch sử).
 */
export async function seedDemo(pool, adminId) {
  // F-061 (ADR-021 D-79): dữ liệu mẫu là một quán "đầy đủ" → bật đủ 5 nhóm menu nâng cao (quán mới thật = chế độ cơ bản)
  await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = 'ui.modules')
    INSERT dbo.Settings (SettingKey, SettingValue) VALUES ('ui.modules', 'inventory,customers,finance,analytics,advanced')`);
  const exists = (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Note = N'DEMO'")).recordset[0].n;
  if (exists > 0) return 'demo orders exist — skipped';
  const item = (await pool.request().query("SELECT MenuItemId, Price FROM dbo.MenuItems WHERE Name = N'Cà phê sữa'")).recordset[0];
  if (!item) throw new Error('Thiếu món "Cà phê sữa" — chạy seed nền trước');
  let n = 0;
  for (let d = 1; d <= 10; d++) {
    for (let k = 0; k < d; k++) {
      const paidAt = new Date(Date.UTC(2026, 9, d, 3, k, 0)); // 10:k giờ VN
      const code = `D${String(d).padStart(2, '0')}${String(k).padStart(2, '0')}`.padEnd(8, 'X').slice(0, 8);
      await pool
        .request()
        .input('code', sql.Char(8), code)
        .input('total', sql.Decimal(12, 0), item.Price * 2)
        .input('at', sql.DateTime2(0), paidAt)
        .input('by', sql.Int, adminId)
        .input('m', sql.Int, item.MenuItemId)
        .input('p', sql.Decimal(12, 0), item.Price).query(`DECLARE @id TABLE (OrderId INT);
          INSERT dbo.Orders (OrderCode, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, Note, CreatedBy, CreatedAt, AcceptedAt, PaidAt, CompletedAt, CompletedBy)
          OUTPUT inserted.OrderId INTO @id
          VALUES (@code, 'TAKE_AWAY', 'COMPLETED', 'PAID', 'CASH', @total, N'DEMO', @by, @at, @at, @at, @at, @by);
          INSERT dbo.OrderItems (OrderId, MenuItemId, Quantity, UnitPrice) SELECT OrderId, @m, 2, @p FROM @id;
          INSERT dbo.Payments (OrderId, Method, AmountDue, AmountReceived, ReceivedBy, PaidAt) SELECT OrderId, 'CASH', @total, @total, @by, @at FROM @id;`);
      n++;
    }
  }
  return `demo: ${n} paid orders 01–10/10/2026`;
}

/**
 * Dữ liệu mẫu giai đoạn 2 (ADR-005) để thử nhanh: nhóm tùy chọn Size + Topping (gán Bạc xỉu, Latte), combo, khuyến mãi, món ghim.
 * Chỉ thêm khi DB chưa có nhóm tùy chọn / combo / khuyến mãi nào (không đụng dữ liệu quán đã tự tạo). Không dùng trong test.
 */
export async function seedExtras(pool) {
  const q = async (text, inputs = {}) => {
    const req = pool.request();
    for (const [k, [type, v]] of Object.entries(inputs)) req.input(k, type, v);
    return (await req.query(text)).recordset;
  };
  const [{ n }] = await q(`SELECT (SELECT COUNT(*) FROM dbo.ModifierGroups) + (SELECT COUNT(*) FROM dbo.Promotions)
                                + (SELECT COUNT(*) FROM dbo.MenuItems WHERE ItemType = 'COMBO') AS n`);
  if (n > 0) return 'extras: đã có tùy chọn/combo/khuyến mãi — bỏ qua';
  const item = async (name) =>
    (await q('SELECT MenuItemId FROM dbo.MenuItems WHERE Name = @n AND DeletedAt IS NULL', { n: [sql.NVarChar(100), name] }))[0]?.MenuItemId;
  const ing = async (name) =>
    (await q('SELECT IngredientId FROM dbo.Ingredients WHERE Name = @n AND DeletedAt IS NULL', { n: [sql.NVarChar(100), name] }))[0]?.IngredientId;
  const log = [];

  const group = async (name, min, max, options) => {
    const [{ GroupId }] = await q('INSERT dbo.ModifierGroups (Name, MinSelect, MaxSelect, SortOrder) OUTPUT inserted.GroupId VALUES (@n, @a, @b, @s)', {
      n: [sql.NVarChar(50), name],
      a: [sql.Int, min],
      b: [sql.Int, max],
      s: [sql.Int, min > 0 ? 1 : 2],
    });
    for (const [i, o] of options.entries()) {
      const [{ OptionId }] = await q(
        'INSERT dbo.ModifierOptions (GroupId, Name, PriceDelta, IsDefault, SortOrder) OUTPUT inserted.OptionId VALUES (@g, @n, @d, @def, @s)',
        {
          g: [sql.Int, GroupId],
          n: [sql.NVarChar(50), o.name],
          d: [sql.Decimal(12, 0), o.delta ?? 0],
          def: [sql.Bit, Boolean(o.isDefault)],
          s: [sql.Int, i + 1],
        },
      );
      if (o.bom && (await ing(o.bom[0]))) {
        await q('INSERT dbo.ModifierOptionBom (OptionId, IngredientId, Amount) VALUES (@o, @i, @a)', {
          o: [sql.Int, OptionId],
          i: [sql.Int, await ing(o.bom[0])],
          a: [sql.Decimal(18, 3), o.bom[1]],
        });
      }
    }
    return GroupId;
  };
  const size = await group('Size', 1, 1, [
    { name: 'Size M', isDefault: true },
    { name: 'Size L', delta: 5000, bom: ['Sữa tươi', 40] },
  ]);
  const topping = await group('Topping', 0, 2, [
    { name: 'Thạch cà phê', delta: 5000 },
    { name: 'Trân châu', delta: 5000 },
  ]);
  for (const name of ['Bạc xỉu', 'Latte']) {
    const id = await item(name);
    if (!id) continue;
    for (const g of [size, topping]) await q('INSERT dbo.MenuItemModifierGroups (MenuItemId, GroupId) VALUES (@m, @g)', { m: [sql.Int, id], g: [sql.Int, g] });
  }
  log.push('tùy chọn: Size (M/L), Topping → Bạc xỉu, Latte');

  const den = await item('Cà phê đen');
  const banh = await item('Bánh croissant');
  if (den && banh) {
    const [{ MenuItemId }] = await q(
      "INSERT dbo.MenuItems (CategoryId, Name, Price, ItemType) OUTPUT inserted.MenuItemId VALUES (NULL, N'Combo sáng', 45000, 'COMBO')",
    );
    for (const c of [den, banh]) {
      await q('INSERT dbo.ComboComponents (ComboMenuItemId, ComponentMenuItemId, Quantity) VALUES (@c, @m, 1)', { c: [sql.Int, MenuItemId], m: [sql.Int, c] });
    }
    log.push('combo: Combo sáng (Cà phê đen + Bánh croissant) 45.000đ');
  }

  const td = await item('Trà đào');
  const [{ PromotionId }] = await q(
    `INSERT dbo.Promotions (Name, Type, Value, StartDate, EndDate, StartTime, EndTime, BadgeText) OUTPUT inserted.PromotionId
     VALUES (N'Happy hour trà đào', 'ITEM_PRICE', 29000, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE), '2026-12-31', '14:00', '17:00', N'Giờ vàng')`,
  );
  if (td) await q('INSERT dbo.PromotionTargets (PromotionId, MenuItemId) VALUES (@p, @m)', { p: [sql.Int, PromotionId], m: [sql.Int, td] });
  await q(
    `INSERT dbo.Promotions (Name, Type, Value, MinOrderAmount, StartDate, EndDate, StackWithMember, BadgeText)
     VALUES (N'Giảm 10% đơn từ 200k', 'ORDER_PERCENT', 10, 200000, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE), '2026-12-31', 1, N'−10%')`,
  );
  log.push('khuyến mãi: Happy hour trà đào 14–17h 29.000đ; giảm 10% đơn từ 200.000đ');

  const latte = await item('Latte');
  if (latte) await q("UPDATE dbo.MenuItems SET IsPinned = 1, PinLabel = N'Món mới', PinOrder = 1 WHERE MenuItemId = @m", { m: [sql.Int, latte] });
  log.push('gợi ý: ghim Latte ("Món mới")');
  return log.join('\n');
}
