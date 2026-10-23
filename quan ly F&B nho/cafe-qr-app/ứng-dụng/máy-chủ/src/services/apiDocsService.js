// Tra cứu API (F-052, ADR-011 D-50): ghép request / response / mã lỗi từ api-contract.md vào danh sách route đọc lúc chạy.
// Đọc mọi bảng Markdown có ô đầu ghi `METHOD /đường-dẫn` (cả dạng `PUT` / `DELETE …/{id}`); đọc lại khi file đổi.
// Thiếu file → vẫn trả đủ danh sách, contract.found = false. Không tự viết mô tả cho endpoint chưa có dòng nào.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const AREAS = ['GUEST', 'POS', 'ADMIN'];
const M = METHODS.join('|');
const ENDPOINT = new RegExp(`\\b((?:${M})(?:\\s*[/,|]\\s*(?:${M}))*)\\s+((?:/|…)[^\\s]*)`, 'g');
const BARE_METHODS = new RegExp(`^(?:${M})(?:\\s*[/,|]\\s*(?:${M}))*$`);

/** Khóa so khớp: bỏ query và dấu câu cuối, `{id}` / `:id` → `:p`, thêm `/api` nếu thiếu. */
export function endpointKey(method, rawPath) {
  let p = rawPath.split('?')[0].replace(/[,*.;)]+$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p.startsWith('/api')) p = `/api${p}`;
  return `${method.toUpperCase()} ${p.replace(/\{[^}]+\}|:\w+/g, ':p')}`;
}

/**
 * Đường dẫn rút gọn `…/x` trong cùng ô: nối vào đường dẫn đầy đủ đứng trước.
 * `/api/admin/users` + `…/{id}` → `/api/admin/users/{id}`; `/api/x/{id}` + `…/{id}/active` → `/api/x/{id}/active`;
 * `/api/po/{id}/send` + `…/cancel` → `/api/po/{id}/cancel`.
 */
function joinRelative(base, rel) {
  const segs = base.split('/');
  const first = rel.split('/')[1];
  if (!base || !first) return null; // `…` trơn / chưa có đường dẫn đầy đủ đứng trước → bỏ qua
  const at = segs.lastIndexOf(first);
  if (at > 0) return segs.slice(0, at).join('/') + rel;
  const last = segs.at(-1);
  if (!first.startsWith('{') && !last.startsWith('{') && segs.at(-2)?.startsWith('{')) return segs.slice(0, -1).join('/') + rel;
  return base + rel;
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());

/** Văn bản api-contract.md → Map(khóa endpoint → [{ section, fields: [[tên cột, nội dung Markdown]] }]). */
export function parseContract(text) {
  const rows = new Map();
  let h2 = '';
  let h3 = '';
  let label = '';
  let header = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (heading[1].length <= 2) [h2, h3] = [heading[1].length === 1 ? '' : heading[2], ''];
      else h3 = heading[2];
      label = '';
      header = null;
      continue;
    }
    if (!line.startsWith('|')) {
      const bold = /^\*\*(.+?):?\*\*:?$/.exec(line);
      if (bold) label = bold[1];
      header = null;
      continue;
    }
    const c = cells(line);
    if (!header) {
      header = c;
      continue;
    }
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    const fields = header
      .slice(1)
      .map((name, i) => [name, c[i + 1] ?? ''])
      .filter(([, v]) => v && v !== '—' && v !== '-');
    const section = [h3 || h2 || 'Bảng gốc', label].filter(Boolean).join(' · ');
    const add = (methods, p) => {
      if (!p) return;
      for (const method of methods.split(/\s*[/,|]\s*/)) {
        const key = endpointKey(method, p);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ section, fields });
      }
    };
    let base = '';
    let lastMethods = '';
    for (const part of c[0].replace(/`/g, '').split('·')) {
      const bare = part.trim();
      if (base && BARE_METHODS.test(bare)) add(bare, base); // `GET /api/x?from&to` · `POST` → POST /api/x
      if (base && lastMethods && /^…\/\S+$/.test(bare)) add(lastMethods, joinRelative(base, bare.slice(1))); // `POST /api/x/{id}/send` · `…/cancel`
      for (const m of part.matchAll(ENDPOINT)) {
        let p = m[2].replace(/[,*.;)]+$/, '');
        if (p.startsWith('…')) p = joinRelative(base, p.slice(1));
        else base = p.split('?')[0];
        lastMethods = m[1];
        add(m[1], p);
      }
    }
  }
  return rows;
}

let cache = { file: null, mtimeMs: 0, rows: new Map() };

async function loadContract(file) {
  let mtimeMs;
  let text = null;
  try {
    ({ mtimeMs } = await fs.stat(file));
    if (cache.file !== file || cache.mtimeMs !== mtimeMs) text = await fs.readFile(file, 'utf8');
  } catch {
    return { found: false, rows: new Map() }; // chỉ lỗi đọc file mới là "không có file"; lỗi đọc nội dung vẫn báo lên
  }
  if (text !== null) cache = { file, mtimeMs, rows: parseContract(text) };
  return { found: true, rows: cache.rows };
}

/** routes: [{ method, path, access, roles, permission }] (routes/apiDocs.js) → dữ liệu trang Tra cứu API. */
export async function catalog(routes, file = config.apiContractFile) {
  const contract = await loadContract(file);
  const endpoints = routes
    .map((r) => {
      const admin = r.path.startsWith('/api/admin/');
      const segment = r.path.slice(admin ? '/api/admin/'.length : '/api/'.length).split('/')[0];
      return {
        ...r,
        area: admin ? 'ADMIN' : ['PUBLIC', 'CLIENT_OR_STAFF'].includes(r.access) ? 'GUEST' : 'POS',
        resource: `/${admin ? 'admin/' : ''}${segment}`,
        contract: contract.rows.get(endpointKey(r.method, r.path)) ?? [],
      };
    })
    .sort(
      (a, b) =>
        AREAS.indexOf(a.area) - AREAS.indexOf(b.area) ||
        a.resource.localeCompare(b.resource) ||
        a.path.localeCompare(b.path) ||
        METHODS.indexOf(a.method) - METHODS.indexOf(b.method),
    );
  return {
    generatedAt: new Date().toISOString(),
    contract: {
      file: path.relative(config.repoRoot, file).split(path.sep).join('/'),
      found: contract.found,
      documented: endpoints.filter((e) => e.contract.length > 0).length,
    },
    total: endpoints.length,
    endpoints,
  };
}
