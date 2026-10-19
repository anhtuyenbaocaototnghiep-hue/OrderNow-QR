// FEATURE-030 Nhà cung cấp & đơn đặt hàng (PO). Nhận hàng theo PO đi qua sp_ReceiveStock (@PoId) — stockRepo.createReceipt.
import { inTransaction, query, sql, txQuery } from '../db.js';

const n = (v) => (v === null || v === undefined ? null : Number(v));

const mapSupplier = (s) => ({
  supplierId: s.SupplierId,
  name: s.Name,
  phone: s.Phone,
  email: s.Email,
  leadTimeDays: s.LeadTimeDays,
  deliveryDaysMask: s.DeliveryDaysMask,
  note: s.Note,
  isActive: Boolean(s.IsActive),
  items: [],
});

export async function suppliers({ activeOnly = false } = {}) {
  const r = await query(
    `SELECT * FROM dbo.Suppliers WHERE (@a = 0 OR IsActive = 1) ORDER BY IsActive DESC, Name;
     SELECT si.SupplierId, si.IngredientId, i.Name, i.Unit, si.PackUnitCode, si.PackSize, si.LastPrice, si.IsPreferred
     FROM dbo.SupplierIngredients si JOIN dbo.Ingredients i ON i.IngredientId = si.IngredientId WHERE i.DeletedAt IS NULL ORDER BY i.Name;`,
    { a: [sql.Bit, activeOnly] },
  );
  const [rows, items] = r.recordsets;
  const byId = new Map(rows.map((s) => [s.SupplierId, mapSupplier(s)]));
  for (const i of items) {
    byId.get(i.SupplierId)?.items.push({
      ingredientId: i.IngredientId,
      name: i.Name,
      unit: i.Unit,
      packUnitCode: i.PackUnitCode,
      packSize: n(i.PackSize),
      lastPrice: n(i.LastPrice),
      isPreferred: Boolean(i.IsPreferred),
    });
  }
  return [...byId.values()];
}

export async function getSupplier(id) {
  return (await suppliers()).find((s) => s.supplierId === id) ?? null;
}

const supplierParams = (d) => ({
  n: [sql.NVarChar(100), d.name],
  p: [sql.VarChar(20), d.phone || null],
  e: [sql.NVarChar(100), d.email || null],
  l: [sql.Int, d.leadTimeDays ?? 1],
  m: [sql.TinyInt, d.deliveryDaysMask ?? 127],
  note: [sql.NVarChar(200), d.note || null],
  a: [sql.Bit, d.isActive ?? true],
});

/** Tạo / sửa nhà cung cấp + danh sách nguyên liệu cung cấp (gói, ưu tiên). Một nguyên liệu chỉ một nhà cung cấp ưu tiên. */
export async function saveSupplier(id, d) {
  return inTransaction(async (tx) => {
    let supplierId = id;
    if (id) {
      const r = await txQuery(
        tx,
        `UPDATE dbo.Suppliers SET Name = @n, Phone = @p, Email = @e, LeadTimeDays = @l, DeliveryDaysMask = @m, Note = @note, IsActive = @a
         WHERE SupplierId = @id`,
        { id: [sql.Int, id], ...supplierParams(d) },
      );
      if (!r.rowsAffected[0]) return null;
    } else {
      const r = await txQuery(
        tx,
        `INSERT dbo.Suppliers (Name, Phone, Email, LeadTimeDays, DeliveryDaysMask, Note, IsActive) OUTPUT inserted.SupplierId
         VALUES (@n, @p, @e, @l, @m, @note, @a)`,
        supplierParams(d),
      );
      supplierId = r.recordset[0].SupplierId;
    }
    if (d.items) {
      const s = { s: [sql.Int, supplierId] };
      const keep = d.items.map((i) => i.ingredientId).join(',');
      await txQuery(tx, "DELETE dbo.SupplierIngredients WHERE SupplierId = @s AND IngredientId NOT IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@k, ','))", {
        ...s,
        k: [sql.VarChar(sql.MAX), keep || '0'],
      });
      for (const i of d.items) {
        if (i.isPreferred) {
          await txQuery(tx, 'UPDATE dbo.SupplierIngredients SET IsPreferred = 0 WHERE IngredientId = @i AND SupplierId <> @s', {
            ...s,
            i: [sql.Int, i.ingredientId],
          });
        }
        await txQuery(
          tx,
          `MERGE dbo.SupplierIngredients AS t USING (SELECT @s AS SupplierId, @i AS IngredientId) AS x ON t.SupplierId = x.SupplierId AND t.IngredientId = x.IngredientId
           WHEN MATCHED THEN UPDATE SET PackUnitCode = @u, PackSize = @ps, IsPreferred = @pref, LastPrice = COALESCE(@lp, t.LastPrice)
           WHEN NOT MATCHED THEN INSERT (SupplierId, IngredientId, PackUnitCode, PackSize, LastPrice, IsPreferred) VALUES (@s, @i, @u, @ps, @lp, @pref);`,
          {
            ...s,
            i: [sql.Int, i.ingredientId],
            u: [sql.NVarChar(10), i.packUnitCode],
            ps: [sql.Decimal(18, 3), i.packSize],
            lp: [sql.Decimal(14, 2), i.lastPrice ?? null],
            pref: [sql.Bit, Boolean(i.isPreferred)],
          },
        );
      }
    }
    return supplierId;
  });
}

// ---------- PO ----------
const PO_SELECT = `
  SELECT po.*, s.Name AS SupplierName, u.FullName AS CreatedByName, CONVERT(CHAR(10), po.ExpectedDate, 23) AS ExpectedText,
         (SELECT SUM(l.OrderedPacks * ISNULL(l.UnitPrice, 0)) FROM dbo.PurchaseOrderLines l WHERE l.PoId = po.PoId) AS Total
  FROM dbo.PurchaseOrders po JOIN dbo.Suppliers s ON s.SupplierId = po.SupplierId JOIN dbo.Users u ON u.UserId = po.CreatedBy`;

const mapPo = (p) => ({
  poId: p.PoId,
  supplierId: p.SupplierId,
  supplierName: p.SupplierName,
  status: p.Status,
  expectedDate: p.ExpectedText,
  createdBy: p.CreatedByName,
  createdAt: p.CreatedAt,
  sentAt: p.SentAt,
  receivedAt: p.ReceivedAt,
  note: p.Note,
  total: n(p.Total) ?? 0,
  lines: [],
});

export async function listPos({ statuses = null } = {}) {
  const r = await query(`${PO_SELECT} WHERE (@st IS NULL OR po.Status IN (SELECT value FROM STRING_SPLIT(@st, ','))) ORDER BY po.PoId DESC`, {
    st: [sql.VarChar(100), statuses ? statuses.join(',') : null],
  });
  return r.recordset.map(mapPo);
}

export async function getPo(id) {
  const r = await query(
    `${PO_SELECT} WHERE po.PoId = @id;
     SELECT l.*, i.Name, i.Unit FROM dbo.PurchaseOrderLines l JOIN dbo.Ingredients i ON i.IngredientId = l.IngredientId WHERE l.PoId = @id ORDER BY i.Name;`,
    { id: [sql.Int, id] },
  );
  const head = r.recordsets[0][0];
  if (!head) return null;
  const po = mapPo(head);
  po.lines = r.recordsets[1].map((l) => ({
    poLineId: l.PoLineId,
    ingredientId: l.IngredientId,
    name: l.Name,
    unit: l.Unit,
    packUnitCode: l.PackUnitCode,
    packSize: n(l.PackSize),
    orderedPacks: n(l.OrderedPacks),
    orderedBaseQty: n(l.OrderedBaseQty),
    receivedBaseQty: n(l.ReceivedBaseQty),
    unitPrice: n(l.UnitPrice),
  }));
  return po;
}

/** Tạo / sửa PO nháp (thay toàn bộ dòng). Sửa chỉ khi DRAFT → null nếu không. */
export async function savePo(id, d, userId) {
  return inTransaction(async (tx) => {
    let poId = id;
    const p = {
      s: [sql.Int, d.supplierId],
      e: [sql.VarChar(10), d.expectedDate || null],
      note: [sql.NVarChar(200), d.note || null],
    };
    if (id) {
      const r = await txQuery(
        tx,
        "UPDATE dbo.PurchaseOrders SET SupplierId = @s, ExpectedDate = CAST(@e AS DATE), Note = @note WHERE PoId = @id AND Status = 'DRAFT'",
        { ...p, id: [sql.Int, id] },
      );
      if (!r.rowsAffected[0]) return null;
      await txQuery(tx, 'DELETE dbo.PurchaseOrderLines WHERE PoId = @id', { id: [sql.Int, id] });
    } else {
      const r = await txQuery(
        tx,
        'INSERT dbo.PurchaseOrders (SupplierId, ExpectedDate, Note, CreatedBy) OUTPUT inserted.PoId VALUES (@s, CAST(@e AS DATE), @note, @u)',
        {
          ...p,
          u: [sql.Int, userId],
        },
      );
      poId = r.recordset[0].PoId;
    }
    for (const l of d.lines) {
      await txQuery(
        tx,
        `INSERT dbo.PurchaseOrderLines (PoId, IngredientId, PackUnitCode, PackSize, OrderedPacks, OrderedBaseQty, UnitPrice)
         VALUES (@po, @i, @u, @ps, @op, @ob, @up)`,
        {
          po: [sql.Int, poId],
          i: [sql.Int, l.ingredientId],
          u: [sql.NVarChar(10), l.packUnitCode],
          ps: [sql.Decimal(18, 3), l.packSize],
          op: [sql.Decimal(18, 3), l.orderedPacks],
          ob: [sql.Decimal(18, 3), l.orderedBaseQty],
          up: [sql.Decimal(14, 2), l.unitPrice ?? null],
        },
      );
    }
    return poId;
  });
}

/** DRAFT → SENT. */
export async function markSent(id) {
  const r = await query("UPDATE dbo.PurchaseOrders SET Status = 'SENT', SentAt = SYSUTCDATETIME() WHERE PoId = @id AND Status = 'DRAFT'", {
    id: [sql.Int, id],
  });
  return r.rowsAffected[0] > 0;
}

/** Hủy PO chưa nhận gì (DRAFT / SENT). → 'OK' | 'HAS_RECEIPTS' | 'NOT_FOUND' | 'STATE' */
export async function cancelPo(id) {
  return inTransaction(async (tx) => {
    const r = await txQuery(tx, 'SELECT Status FROM dbo.PurchaseOrders WITH (UPDLOCK, HOLDLOCK) WHERE PoId = @id', { id: [sql.Int, id] });
    const st = r.recordset[0]?.Status;
    if (!st) return 'NOT_FOUND';
    if (
      st === 'PARTIAL' ||
      st === 'RECEIVED' ||
      (await txQuery(tx, 'SELECT TOP 1 1 AS x FROM dbo.StockReceipts WHERE PoId = @id', { id: [sql.Int, id] })).recordset.length
    ) {
      return 'HAS_RECEIPTS';
    }
    if (st === 'CANCELLED') return 'STATE';
    await txQuery(tx, "UPDATE dbo.PurchaseOrders SET Status = 'CANCELLED' WHERE PoId = @id", { id: [sql.Int, id] });
    return 'OK';
  });
}

/** Lượng đang về (PO SENT / PARTIAL chưa nhận đủ) theo nguyên liệu. */
export async function incomingByIngredient() {
  const r = await query(`
    SELECT l.IngredientId, SUM(CASE WHEN l.OrderedBaseQty > l.ReceivedBaseQty THEN l.OrderedBaseQty - l.ReceivedBaseQty ELSE 0 END) AS Incoming
    FROM dbo.PurchaseOrderLines l JOIN dbo.PurchaseOrders po ON po.PoId = l.PoId
    WHERE po.Status IN ('SENT', 'PARTIAL') GROUP BY l.IngredientId`);
  return new Map(r.recordset.map((x) => [x.IngredientId, n(x.Incoming)]));
}

/** Lịch sử giá theo nhà cung cấp + tỉ lệ giao đúng hạn / đủ hàng. */
export async function supplierReport(fromUtc, toUtc) {
  const p = { f: [sql.DateTime2(0), fromUtc], t: [sql.DateTime2(0), toUtc] };
  const r = await query(
    `SELECT h.SupplierId, s.Name AS SupplierName, h.IngredientId, i.Name, i.Unit, h.PackUnitCode, h.PackPrice, h.UnitCost, h.RecordedAt
     FROM dbo.SupplierPriceHistory h JOIN dbo.Suppliers s ON s.SupplierId = h.SupplierId JOIN dbo.Ingredients i ON i.IngredientId = h.IngredientId
     WHERE h.RecordedAt >= @f AND h.RecordedAt < @t ORDER BY i.Name, h.RecordedAt;
     SELECT po.SupplierId, s.Name, COUNT(*) AS Pos,
            SUM(CASE WHEN po.Status = 'RECEIVED' AND (po.ExpectedDate IS NULL OR CAST(DATEADD(HOUR, 7, po.ReceivedAt) AS DATE) <= po.ExpectedDate) THEN 1 ELSE 0 END) AS OnTime,
            SUM(CASE WHEN po.Status = 'RECEIVED' THEN 1 ELSE 0 END) AS Received,
            (SELECT SUM(l.ReceivedBaseQty) FROM dbo.PurchaseOrderLines l JOIN dbo.PurchaseOrders p2 ON p2.PoId = l.PoId
              WHERE p2.SupplierId = po.SupplierId AND p2.CreatedAt >= @f AND p2.CreatedAt < @t AND p2.Status <> 'CANCELLED') AS RecvQty,
            (SELECT SUM(l.OrderedBaseQty) FROM dbo.PurchaseOrderLines l JOIN dbo.PurchaseOrders p2 ON p2.PoId = l.PoId
              WHERE p2.SupplierId = po.SupplierId AND p2.CreatedAt >= @f AND p2.CreatedAt < @t AND p2.Status <> 'CANCELLED') AS OrderQty
     FROM dbo.PurchaseOrders po JOIN dbo.Suppliers s ON s.SupplierId = po.SupplierId
     WHERE po.CreatedAt >= @f AND po.CreatedAt < @t AND po.Status <> 'CANCELLED'
     GROUP BY po.SupplierId, s.Name ORDER BY s.Name;`,
    p,
  );
  const [prices, perf] = r.recordsets;
  return {
    prices: prices.map((x) => ({
      supplierId: x.SupplierId,
      supplierName: x.SupplierName,
      ingredientId: x.IngredientId,
      name: x.Name,
      unit: x.Unit,
      packUnitCode: x.PackUnitCode,
      packPrice: n(x.PackPrice),
      unitCost: n(x.UnitCost),
      recordedAt: x.RecordedAt,
    })),
    performance: perf.map((x) => ({
      supplierId: x.SupplierId,
      name: x.Name,
      pos: x.Pos,
      received: x.Received,
      onTimePct: x.Received ? Math.round((x.OnTime / x.Received) * 100) : null,
      fillPct: n(x.OrderQty) ? Math.round((n(x.RecvQty) / n(x.OrderQty)) * 100) : null,
    })),
  };
}
