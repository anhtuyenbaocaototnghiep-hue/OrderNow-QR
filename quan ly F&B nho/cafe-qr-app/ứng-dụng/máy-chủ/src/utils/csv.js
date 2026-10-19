// Xuất CSV cho Excel tiếng Việt: UTF-8 có BOM, phân cách dấu phẩy, ô có dấu phẩy / ngoặc kép / xuống dòng được bọc "…".
// Ô bắt đầu bằng = + - @ được thêm ' phía trước để Excel không hiểu là công thức (CSV injection).
const cell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s) && typeof v === 'string') s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** toCsv(['Cột A', 'Cột B'], [[1, 'x'], …]) → chuỗi CSV có BOM. */
export const toCsv = (header, rows) => `\uFEFF${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

/** Gửi CSV tải về với tên file an toàn. */
export function sendCsv(res, filename, header, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.set('Cache-Control', 'no-store');
  res.send(toCsv(header, rows));
}
