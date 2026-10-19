// Cấu hình quán dạng khóa/giá trị (dbo.Settings — ADR-005).
import { query, sql } from '../db.js';

export async function all() {
  const r = await query('SELECT SettingKey, SettingValue FROM dbo.Settings');
  return new Map(r.recordset.map((x) => [x.SettingKey, x.SettingValue]));
}

export async function setMany(entries) {
  for (const [key, value] of entries) {
    await query(
      `UPDATE dbo.Settings SET SettingValue = @v, UpdatedAt = SYSUTCDATETIME() WHERE SettingKey = @k;
       IF @@ROWCOUNT = 0 INSERT dbo.Settings (SettingKey, SettingValue) VALUES (@k, @v);`,
      { k: [sql.NVarChar(50), key], v: [sql.NVarChar(200), String(value)] },
    );
  }
}
