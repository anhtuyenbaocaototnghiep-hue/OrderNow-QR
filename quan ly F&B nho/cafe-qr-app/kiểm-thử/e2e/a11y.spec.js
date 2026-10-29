// Kiểm tra khả năng tiếp cận tự động (NFR-A11Y — WCAG 2.2 mức AA, các tiêu chí máy kiểm được) + ảnh chuẩn từng màn hình (TASK-057).
// Chạy SAU flow.spec.js (project "a11y" phụ thuộc "flow" trong playwright.config.js) để màn hình có dữ liệu thật.
// Không thêm thư viện: luật kiểm viết tay trong audit() — nhãn ô nhập, tên nút / link, lang, alt ảnh, vùng chạm ≥ 24×24 (2.5.8),
// tương phản chữ ≥ 4.5:1 (≥ 3:1 chữ lớn) (1.4.3), không cuộn ngang ở 320 / 390 px (1.4.10), có dấu focus khi dùng bàn phím (2.4.7).
/* global document, getComputedStyle -- audit() chạy trong trình duyệt qua page.evaluate */
import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// Chạy tuần tự (workers: 1) nhưng không dừng khi một nhóm màn hình có vi phạm — để thấy đủ lỗi một lần

const OUT = 'kiểm-thử/kết-quả';
const SHOTS = `${OUT}/ảnh`;
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' };
const desk = { viewport: { width: 1366, height: 860 }, locale: 'vi-VN' };
const report = {};
let browser, adminToken, table, sessionId, waterId;
let openedShift = false; // a11y tự mở ca (F-055) thì tự đóng ở afterAll
let issues = []; // vi phạm của test đang chạy — báo một lần ở cuối test để sửa cả loạt

test.beforeEach(() => {
  issues = [];
});
test.afterEach(() => {
  expect(issues, issues.join('\n')).toEqual([]);
});

/** Chạy trong trang: trả về danh sách vi phạm (chuỗi mô tả, không trùng). */
function audit() {
  const out = new Set();
  const hiddenBy = (e) => e.closest('[hidden], [aria-hidden="true"], [inert]');
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !hiddenBy(e))) return false;
    const closed = e.closest('details:not([open])'); // nội dung <details> đang đóng không hiển thị (trừ <summary>)
    return !closed || Boolean(closed.querySelector(':scope > summary')?.contains(e));
  };
  const short = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
  const desc = (e) =>
    `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).join('.')}` : ''}` +
    ` "${short(e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder'))}"`;
  const byIds = (ids) =>
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  const nameOf = (e) =>
    (e.getAttribute('aria-label') || '').trim() ||
    (e.getAttribute('aria-labelledby') ? byIds(e.getAttribute('aria-labelledby')) : '') ||
    [...(e.labels ?? [])]
      .map((l) => l.textContent)
      .join(' ')
      .trim() ||
    (e.getAttribute('title') || '').trim();

  if (!(document.documentElement.lang || '').startsWith('vi')) out.add('html thiếu lang="vi" (3.1.1)');

  for (const e of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!visible(e)) continue;
    if (!nameOf(e) && !(e.getAttribute('placeholder') || '').trim()) out.add(`ô nhập không có nhãn: ${desc(e)} (1.3.1, 4.1.2)`);
  }
  for (const e of document.querySelectorAll('button, a[href], [role=button]')) {
    if (!visible(e)) continue;
    const alt = [...e.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ');
    if (!(nameOf(e) || e.innerText.trim() || alt.trim())) out.add(`nút / link không có tên: ${desc(e)} ${e.outerHTML.slice(0, 160)} (4.1.2)`);
  }
  for (const e of document.querySelectorAll('img')) if (visible(e) && !e.hasAttribute('alt')) out.add(`ảnh thiếu alt: …${e.src.slice(-40)} (1.1.1)`);

  // 2.5.8 Target Size (Minimum): ≥ 24×24 CSS px, hoặc đủ khoảng trống (vòng tròn đường kính 24 px quanh tâm không chạm mục tiêu khác)
  const targets = [...document.querySelectorAll('button, a[href], input[type=checkbox], input[type=radio], select, [role=button]')].filter(
    (e) => visible(e) && !e.disabled,
  );
  const boxOf = (e) => ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label') ? e.closest('label') : e).getBoundingClientRect();
  const boxes = targets.map(boxOf);
  targets.forEach((e, i) => {
    const r = boxes[i];
    if (r.width >= 23.5 && r.height >= 23.5) return;
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, td, span, div.small')) return; // link nằm trong câu chữ
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const near = boxes.some((b, j) => {
      if (j === i || targets[j].contains(e) || e.contains(targets[j])) return false;
      const dx = Math.max(b.left - cx, 0, cx - b.right);
      const dy = Math.max(b.top - cy, 0, cy - b.bottom);
      return Math.hypot(dx, dy) < 12;
    });
    if (near) out.add(`vùng chạm < 24×24 (${Math.round(r.width)}×${Math.round(r.height)}) và sát mục tiêu khác: ${desc(e)} (2.5.8)`);
  });

  // Tiêu đề cột số căn phải cùng phía với số bên dưới (DEF-015 — bảng dựng bằng hàm chung không gắn .num cho tiêu đề)
  for (const t of document.querySelectorAll('table.table')) {
    if (!visible(t)) continue;
    const heads = t.querySelectorAll(':scope > thead > tr:first-child > th');
    const numCols = new Set([...t.querySelectorAll(':scope > tbody > tr > td.num')].map((td) => td.cellIndex));
    for (const i of numCols) {
      const th = heads[i];
      if (th?.textContent.trim() && getComputedStyle(th).textAlign !== 'right') out.add(`tiêu đề cột số không căn phải: ${desc(th)} (DEF-015)`);
    }
  }

  // 1.4.3 Contrast (Minimum)
  const rgba = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r, g, b, a };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const backdrop = (e) => {
    const layers = [];
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none' || Number(cs.opacity) < 1) return null; // ảnh nền / mờ (thành phần tắt) → bỏ qua
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    return layers.reverse().reduce((bg, l) => over(l, bg), { r: 255, g: 255, b: 255, a: 1 });
  };
  for (const e of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'OPTION', 'NOSCRIPT', 'SVG'].includes(e.tagName)) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!visible(e) || e.closest(':disabled, [aria-disabled="true"], .disabled')) continue;
    const cs = getComputedStyle(e);
    const bg = backdrop(e);
    const fg = rgba(cs.color);
    if (!bg || !fg) continue;
    const c = over(fg, bg);
    const [hi, lo] = [lum(c), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5) - 0.01)
      out.add(
        `tương phản ${ratio.toFixed(2)}:1 < ${large ? 3 : 4.5}:1 — màu ${cs.color} trên nền rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}): ${desc(e)} (1.4.3)`,
      );
  }
  return [...out];
}

async function check(page, key, { shot = true, narrow = false } = {}) {
  await page.waitForLoadState('networkidle');
  // Đợi hết hiệu ứng mở drawer / sheet / hộp thoại: phần tử đang mờ dần sẽ bị bỏ qua khi đo tương phản và làm ảnh chụp bị chồng
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
    null,
    { timeout: 5000 },
  ); // bỏ qua hiệu ứng lặp vô hạn (nhấp nháy, xoay chờ) — chúng không làm mờ nội dung
  const found = await page.evaluate(audit);
  if (narrow) {
    for (const w of [320, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      const ok = await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth);
      if (!ok) found.push(`cuộn ngang ở ${w}px (1.4.10)`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  if (shot) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.addStyleTag({ content: '.toasts, .toast { visibility: hidden !important; }' }); // ảnh chuẩn không bị thông báo che
    await page.screenshot({ path: `${SHOTS}/${key}.jpg`, type: 'jpeg', quality: 70, fullPage: false });
  }
  report[key] = found;
  fs.writeFileSync(`${OUT}/a11y.json`, JSON.stringify(report, null, 2));
  issues.push(...found.map((x) => `[${key}] ${x}`));
}

/** 2.4.7: Tab tới vài phần tử đầu tiên — mỗi phần tử đang focus phải có viền / bóng nhìn thấy được. */
async function focusVisible(page, key, tabs = 4) {
  const missing = [];
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const e = globalThis.document.activeElement;
      if (!e || e === globalThis.document.body) return null;
      const cs = globalThis.getComputedStyle(e);
      const what = `${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      if (!outline) return { ok: cs.boxShadow !== 'none', what };
      // 1.4.11: viền focus tương phản ≥ 3:1 với nền xung quanh
      const rgb = (c) => (String(c).match(/[\d.]+/g) || []).map(Number);
      const lum = ([r, g, b]) =>
        [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
      let bg = [255, 255, 255];
      for (let n = e.parentElement; n; n = n.parentElement) {
        const c = rgb(globalThis.getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) >= 1) {
          bg = c;
          break;
        }
      }
      const [hi, lo] = [lum(rgb(cs.outlineColor)), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      return { ok: ratio >= 3, what: ratio >= 3 ? what : `${what} — viền focus tương phản ${ratio.toFixed(2)}:1 < 3:1 (1.4.11)` };
    });
    if (r && !r.ok) missing.push(`không thấy dấu focus: ${r.what} (2.4.7)`);
  }
  report[`${key} · focus`] = missing;
  issues.push(...missing.map((x) => `[${key}] ${x}`));
}

/** Bàn A11Y có một đơn khách (chờ tiếp nhận) — mỗi test tự bảo đảm, vì test lỗi làm Playwright khởi động lại worker (mất biến dùng chung). */
async function ensureGuestOrder() {
  if (sessionId) return;
  const ctx = await browser.newContext(phone);
  const C = await ctx.newPage();
  await C.goto(`/t/${table.qrToken}`);
  await expect(C).toHaveURL(/\/menu$/);
  sessionId = await C.evaluate(
    async ({ qr, item }) => {
      const scan = await (
        await globalThis.fetch('/api/sessions/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrToken: qr }) })
      ).json();
      const sid = scan.session?.sessionId;
      await globalThis.fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, items: [{ menuItemId: item, quantity: 1 }] }),
      });
      return sid;
    },
    { qr: table.qrToken, item: waterId },
  );
  await ctx.close();
}

async function login(page, username, password) {
  await page.goto('/pos/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#submit');
  await expect(page).toHaveURL(/\/pos$/);
}

test.beforeAll(async ({ browser: b, request }) => {
  browser = b;
  const r = await request.post('/api/auth/login', { data: { username: 'admin', password: 'Admin@123' } });
  adminToken = (await r.json()).accessToken;
  const auth = { Authorization: `Bearer ${adminToken}` };
  // Bàn riêng cho kiểm tra (không đụng dữ liệu các kịch bản khác); dọn ở afterAll
  await request.post('/api/admin/tables', { headers: auth, data: { code: 'A11Y', name: 'Bàn A11Y' } });
  table = (await (await request.get('/api/admin/tables', { headers: auth })).json()).find((t) => t.code === 'A11Y');
  waterId = (await (await request.get('/api/admin/menu-items', { headers: auth })).json()).find((m) => m.name === 'Nước suối').menuItemId;
  // F-055 (ADR-017): khách chỉ gửi được đơn khi có ca mở — luồng flow có thể kết thúc khi ca đã đóng
  if (!(await (await request.get('/api/shifts/current', { headers: auth })).json()).shift) {
    await request.post('/api/shifts/open', { headers: auth, data: { openingCash: 0 } });
    openedShift = true;
  }
});

test.afterAll(async ({ request }) => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  if (sessionId) await request.post(`/api/sessions/${sessionId}/cancel`, { headers: auth, data: { reason: 'Dọn bàn kiểm tra a11y' } });
  if (table) await request.delete(`/api/admin/tables/${table.tableId}`, { headers: auth });
  if (openedShift) {
    const sh = (await (await request.get('/api/shifts/current', { headers: auth })).json()).shift;
    if (sh) await request.post(`/api/shifts/${sh.shiftId}/close`, { headers: auth, data: { countedCash: sh.expectedCash } });
  }
});

test('khách (điện thoại): menu, giỏ, theo dõi đơn, chia bill, chọn nhóm, màn cảm ơn + đánh giá — nhãn, tương phản, vùng chạm, không cuộn ngang 320/390 px', async ({
  request,
}) => {
  const ctx = await browser.newContext(phone);
  const C = await ctx.newPage();
  await C.goto(`/t/${table.qrToken}`);
  await expect(C).toHaveURL(/\/menu$/);
  await check(C, 'khach-menu', { narrow: true });
  await focusVisible(C, 'khach-menu');
  await C.locator('.c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
  await C.click('#open-cart');
  await expect(C.locator('.sheet')).toBeVisible();
  await check(C, 'khach-gio-hang');
  await C.locator('.sheet .modal-foot .btn-primary').click();
  await expect(C).toHaveURL(/\/track$/);
  sessionId = await C.evaluate(async (qr) => {
    const r = await globalThis.fetch('/api/sessions/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken: qr }),
    });
    return (await r.json()).session?.sessionId ?? null;
  }, table.qrToken);
  expect(sessionId).toBeTruthy();
  await check(C, 'khach-theo-doi-don', { narrow: true });
  await C.click('#split-bill');
  await expect(C.locator('.sheet')).toBeVisible();
  await check(C, 'khach-chia-bill');
  await C.keyboard.press('Escape');

  // Khách thứ hai quét cùng bàn → màn chọn Gộp chung / Cá nhân
  const ctx2 = await browser.newContext(phone);
  const D = await ctx2.newPage();
  await D.goto(`/t/${table.qrToken}`);
  await expect(D.getByRole('button', { name: /Gộp chung nhóm/ })).toBeVisible();
  await check(D, 'khach-chon-nhom', { narrow: true });

  // Màn cảm ơn + khung đánh giá (F-051): nhóm riêng ("Tạo đơn cá nhân"), thu tiền qua API — mở ca tạm nếu chưa có rồi đóng lại
  const auth = { Authorization: `Bearer ${adminToken}` };
  await D.getByRole('button', { name: /Tạo đơn cá nhân/ }).click();
  await expect(D).toHaveURL(/\/menu$/);
  await D.locator('.c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
  await D.click('#open-cart');
  await D.locator('.sheet .modal-foot .btn-primary').click();
  await expect(D).toHaveURL(/\/track$/);
  const mine = (await (await request.get('/api/tables', { headers: auth })).json())
    .find((t) => t.code === 'A11Y')
    .sessions.find((x) => x.sessionId !== sessionId);
  const det = await (await request.get(`/api/sessions/${mine.sessionId}`, { headers: auth })).json();
  const before = (await (await request.get('/api/shifts/current', { headers: auth })).json()).shift;
  if (!before) await request.post('/api/shifts/open', { headers: auth, data: { openingCash: 0 } });
  await request.post(`/api/orders/${det.orders[0].orderId}/accept`, { headers: auth });
  expect((await request.post(`/api/sessions/${mine.sessionId}/settle`, { headers: auth, data: { amountReceived: 100000 } })).ok()).toBeTruthy();
  if (!before) {
    const sh = (await (await request.get('/api/shifts/current', { headers: auth })).json()).shift;
    await request.post(`/api/shifts/${sh.shiftId}/close`, { headers: auth, data: { countedCash: sh.expectedCash } });
  }
  await expect(D.getByRole('heading', { name: 'Bạn thấy món hôm nay thế nào?' })).toBeVisible();
  await check(D, 'khach-danh-gia', { narrow: true });
  // F-062: trang Chính sách dữ liệu (SCR-48)
  await D.goto('/chinh-sach-du-lieu');
  await expect(D.getByRole('heading', { name: 'Quyền của bạn' })).toBeVisible();
  await check(D, 'khach-chinh-sach-du-lieu', { narrow: true });
  await Promise.all([ctx.close(), ctx2.close()]);
});

test('quầy (máy tính): đăng nhập, đơn hàng + drawer thu tiền + hộp thoại sửa món, gọi món tại bàn, mang đi, ca, kho, phiếu tạm tính', async () => {
  await ensureGuestOrder();
  const ctx = await browser.newContext(desk);
  const P = await ctx.newPage();
  await P.goto('/pos/login');
  await check(P, 'quay-dang-nhap');
  await focusVisible(P, 'quay-dang-nhap', 3);
  // NFR-A11Y-08: lỗi nêu bằng chữ và nằm trong vùng role="alert" (trình đọc màn hình đọc ngay)
  await P.fill('#username', 'staff1');
  await P.fill('#password', 'sai-mat-khau');
  await P.click('#submit');
  await expect(P.locator('[role="alert"]')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
  await login(P, 'staff1', 'Staff@123');
  await check(P, 'quay-don-hang');
  // F-061: hộp hướng dẫn 5 bước (nút "Hướng dẫn")
  await P.getByRole('button', { name: 'Hướng dẫn' }).click();
  await expect(P.getByRole('dialog')).toContainText('Bước 1 / 5');
  await check(P, 'quay-huong-dan');
  await P.keyboard.press('Escape');
  await expect(P.getByRole('dialog')).toHaveCount(0);
  await focusVisible(P, 'quay-don-hang', 5); // thanh trên nền tối của quầy (review G3)
  // ADR-018 D-70: màn 1024 px — lưới bàn là ngăn trượt; quét cả lúc ngăn đang mở (TASK-072)
  await P.setViewportSize({ width: 1024, height: 768 });
  await P.click('#tables-toggle');
  await expect(P.locator('#tables-panel')).toBeVisible();
  await check(P, 'quay-don-hang-ngan-ban');
  await P.keyboard.press('Escape');
  await expect(P.locator('#tables-panel')).toBeHidden();
  await P.setViewportSize(desk.viewport);
  await P.locator('#tables .table-row', { hasText: 'Bàn A11Y' }).getByRole('button', { name: 'Thu tiền' }).click();
  await expect(P.locator('.drawer')).toBeVisible();
  await check(P, 'quay-drawer-thu-tien');
  await P.locator('.drawer').getByRole('button', { name: 'Sửa Nước suối' }).click();
  await expect(P.locator('.modal')).toBeVisible();
  // NFR-A11Y-09: mở hộp thoại → focus vào ô đầu trong hộp thoại; Esc đóng hộp thoại
  expect(await P.evaluate(() => Boolean(globalThis.document.activeElement?.closest('.modal')))).toBe(true);
  await check(P, 'quay-hop-thoai-sua-mon');
  await P.keyboard.press('Escape');
  await expect(P.locator('.modal')).toHaveCount(0);
  await P.keyboard.press('Escape');
  for (const [route, key] of [
    ['/pos/table-order', 'quay-goi-mon-tai-ban'],
    ['/pos/takeaway', 'quay-ban-mang-di'],
    ['/pos/shift', 'quay-ca-hoan-tien'],
    ['/pos/stock', 'quay-kho-so-che'],
  ]) {
    await P.goto(route);
    await check(P, key);
  }
  await P.goto('/pos/table-order');
  await P.locator('.table-chip[data-table="A11Y"]').click();
  await expect(P.locator('#member-box')).toContainText('Hội viên');
  await check(P, 'quay-goi-mon-tai-ban-chon-ban');
  await P.goto(`/pos/sessions/${sessionId}/receipt?mode=provisional`);
  await expect(P.locator('.receipt')).toBeVisible();
  await check(P, 'quay-phieu-tam-tinh');
  // F-055: giao diện khi chưa mở ca (dải cảnh báo, nút xử lý đơn khóa) — đóng ca tạm rồi mở lại (review G3 TASK-071)
  const auth = { Authorization: `Bearer ${adminToken}` };
  const sh = (await (await P.request.get('/api/shifts/current', { headers: auth })).json()).shift;
  if (sh) await P.request.post(`/api/shifts/${sh.shiftId}/close`, { headers: auth, data: { countedCash: sh.expectedCash } });
  await P.goto('/pos');
  await expect(P.locator('#no-shift')).toBeVisible();
  await check(P, 'quay-chua-mo-ca');
  await P.goto('/pos/table-order');
  await expect(P.locator('#send')).toBeDisabled();
  await check(P, 'quay-goi-mon-tai-ban-chua-mo-ca');
  if (sh) await P.request.post('/api/shifts/open', { headers: auth, data: { openingCash: 0 } });
  await ctx.close();
});

test('quản lý (máy tính): mọi trang quản trị — nhãn, tên nút, tương phản, vùng chạm', async ({ request }) => {
  const ctx = await browser.newContext(desk);
  const A = await ctx.newPage();
  await login(A, 'admin', 'Admin@123');
  const items = await (await request.get('/api/admin/menu-items', { headers: { Authorization: `Bearer ${adminToken}` } })).json();
  const routes = [
    'reports',
    'today',
    'analytics',
    'pnl',
    'menu',
    `menu/${items[0].menuItemId}/bom`,
    'modifiers',
    'combos',
    'menu-schedules',
    'suggestions',
    'promotions',
    'tables',
    'tables/print',
    'ingredients',
    'stock',
    'purchasing',
    'members',
    'loyalty',
    'shifts',
    'cash',
    'reviews',
    'staff',
    'users',
    'audit',
    'settings',
    'alerts',
    'api-docs',
  ];
  for (const r of routes) {
    await A.goto(`/admin/${r}`);
    await check(A, `quan-ly-${r.replace(/\//g, '-').replace(/-\d+-/, '-id-')}`);
  }
  // DEF-014: Phân tích, Lãi / lỗ không cuộn ngang ở 320 / 390 px (WCAG 1.4.10) — trước đây 441 / 638 px
  for (const r of ['analytics', 'pnl']) {
    await A.goto(`/admin/${r}`);
    await A.waitForLoadState('networkidle');
    for (const w of [320, 390]) {
      await A.setViewportSize({ width: w, height: 800 });
      const width = await A.evaluate(() => globalThis.document.documentElement.scrollWidth);
      if (width > w) issues.push(`[quan-ly-${r}] cuộn ngang ở ${w}px: rộng ${width}px (1.4.10, DEF-014)`);
    }
    await A.setViewportSize(desk.viewport);
  }
  // Biểu đồ dự báo + lãi / lỗ khi đang mở hộp số liệu (TASK-069): tương phản chữ trong hộp, chú thích
  await A.goto('/admin/analytics');
  await A.locator('.tabs button', { hasText: 'Dự báo doanh thu' }).click();
  await A.locator('svg.fc-chart').hover();
  await check(A, 'quan-ly-analytics-du-bao');
  await A.goto('/admin/pnl');
  await A.locator('svg.pnl-chart').hover();
  await check(A, 'quan-ly-pnl-hop-so-lieu');
  // Kỳ dài → 3 đường thay cột mỏng; màn hẹp: biểu đồ cuộn trong khung, trang không cuộn ngang (review G3 TASK-069)
  await A.getByRole('button', { name: 'Năm nay' }).click();
  await expect(A.locator('svg.pnl-chart path.pnl-line')).toHaveCount(3);
  await check(A, 'quan-ly-pnl-nam-nay');
  // (Trang Phân tích / Lãi / lỗ còn cuộn ngang ở màn hẹp vì thanh tab / cột bảng dưới — DEF-014, có từ trước, ngoài phạm vi)
  const chartsFit = async (w) => {
    await A.setViewportSize({ width: w, height: 800 });
    return A.evaluate(() =>
      [...globalThis.document.querySelectorAll('.chart-wrap')].every(
        (n) => n.getBoundingClientRect().right <= globalThis.document.documentElement.clientWidth + 1,
      ),
    );
  };
  for (const w of [320, 390]) expect(await chartsFit(w), `biểu đồ lãi / lỗ tràn màn ${w}px`).toBe(true);
  await A.setViewportSize(desk.viewport);
  await A.goto('/admin/analytics');
  await A.locator('.tabs button', { hasText: 'Dự báo doanh thu' }).click();
  await expect(A.locator('svg.fc-chart')).toBeVisible();
  for (const w of [320, 390]) expect(await chartsFit(w), `biểu đồ dự báo tràn màn ${w}px`).toBe(true);
  await A.setViewportSize(desk.viewport);
  // Tra cứu API: phần chi tiết dựng khi mở dòng — mở một dòng rồi quét lại (review G3 TASK-064)
  await A.goto('/admin/api-docs');
  await A.locator('.api-ep summary').first().click();
  await expect(A.locator('.api-detail').first()).toBeVisible();
  await check(A, 'quan-ly-api-docs-chi-tiet', { narrow: true });
  await A.setViewportSize(desk.viewport);
  await A.goto('/admin/reports');
  await focusVisible(A, 'quan-ly-reports');
  await ctx.close();
});
