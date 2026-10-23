// Đồ nghề chung cho biểu đồ SVG tự vẽ (TASK-069, ADR-015 D-60) — không thư viện biểu đồ (ADR-002).
// Màu lấy từ token --viz-* trong base.css (bảng 3 màu đã kiểm bằng validator dataviz); chữ luôn dùng màu chữ, không dùng màu dữ liệu.
import { clear, el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

/** Tạo phần tử SVG; con là chuỗi → nút chữ. */
export function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  for (const c of children.flat(Infinity))
    if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

/**
 * Trục giá trị "tròn": đỉnh làm tròn lên 1 / 2 / 2,5 / 5 × 10ⁿ, 4 khoảng chia đều.
 * Sàn 4.000đ: kỳ chưa có doanh thu vẫn có trục 0 · 1k · 2k · 3k · 4k thay vì 0 · 0,25 · …
 */
export function niceScale(max, floor = 4000) {
  const raw = Math.max(floor, max) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((k) => k * step) };
}

/** Số gọn cho nhãn trục / ô: 0 · 750 · 2,5k · 1,5tr. */
export function compact(v) {
  const fmt = (n) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1e6) return `${fmt(v / 1e6)}tr`;
  if (Math.abs(v) >= 1000) return `${fmt(v / 1000)}k`;
  return Math.round(v).toLocaleString('vi-VN');
}

/** Cột: đầu dữ liệu bo 4px, chân cột vuông trên đường gốc (đúng chuẩn mark của dataviz). */
export function barPath(x, y, w, h, r = 4) {
  if (!(h > 0) || !(w > 0)) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Lớp rê chuột: vạch dọc theo cột / điểm gần nhất + hộp số liệu (HTML, chữ qua textContent).
 * - Chuột: rê để xem; Esc ẩn hộp (WCAG 1.4.13). Cảm ứng: chạm chọn ngày, kéo ngang để dò (touch-action: pan-y trong CSS).
 * - Bàn phím: Tab vào biểu đồ → ← / → đổi ngày, Home / End ngày đầu / cuối, Esc ẩn.
 * - Trình đọc màn hình: vùng role="status" ẩn (luôn có trong cây trợ năng) đọc ngày + số; hộp nhìn thấy là aria-hidden.
 * - Màn hẹp: biểu đồ giữ ≥ 80 % cỡ thiết kế, khung cuộn ngang thay vì thu nhỏ chữ.
 * opts: { width (viewBox), count, xAt(i), yTop, yBottom, title(i), rows(i) → [[nhãn, giá trị, lớp swatch?]] }
 */
export function attachHover(svgEl, { width, count, xAt, yTop, yBottom, title, rows }) {
  if (!count) return;
  const wrap = svgEl.parentElement;
  wrap.classList.add('chart-wrap');
  svgEl.style.minWidth = `${Math.round(width * 0.8)}px`;
  const cross = svg('line', { class: 'crosshair', x1: 0, x2: 0, y1: yTop, y2: yBottom, visibility: 'hidden' });
  svgEl.append(cross);
  const tip = el('div', { class: 'chart-tip', 'aria-hidden': 'true', hidden: true });
  const live = el('div', { class: 'sr-only', role: 'status' });
  wrap.append(tip, live);
  let current = -1;
  let last = count - 1; // ngày xem gần nhất — phím mũi tên đi tiếp từ đây kể cả sau khi Esc
  let fromPointer = false;

  const onEsc = (e) => {
    if (e.key === 'Escape' || !svgEl.isConnected) hide();
  };
  const hide = () => {
    current = -1;
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
    document.removeEventListener('keydown', onEsc);
  };
  const show = (i) => {
    if (i === current) return; // cùng ngày: không dựng lại hộp, không đọc lại
    current = i;
    last = i;
    const x = xAt(i);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', 'visible');
    const data = rows(i);
    clear(
      tip,
      el('div', { class: 'chart-tip-title' }, title(i)),
      data.map(([label, value, cls]) =>
        el('div', { class: 'chart-tip-row' }, cls ? el('i', { class: `swatch ${cls}` }) : null, el('span', {}, label), el('strong', {}, value)),
      ),
    );
    live.textContent = `${title(i)}: ${data.map(([label, value]) => `${label} ${value}`).join(', ')}`;
    if (tip.hidden) {
      tip.hidden = false;
      document.addEventListener('keydown', onEsc);
    }
    // Toạ độ trong nội dung khung (khung có thể đang cuộn ngang trên màn hẹp)
    const box = svgEl.getBoundingClientRect();
    const host = wrap.getBoundingClientRect();
    const px = box.left - host.left - wrap.clientLeft + wrap.scrollLeft + (x / width) * box.width;
    if (px < wrap.scrollLeft || px > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = px - wrap.clientWidth / 2; // bàn phím tới ngày đang khuất
    const lo = wrap.scrollLeft;
    const hi = lo + wrap.clientWidth;
    tip.style.left = '0px'; // đo bề rộng ở vị trí trung tính, tránh số đo cũ
    const tw = tip.offsetWidth;
    const want = px + 14 + tw <= hi ? px + 14 : px - 14 - tw;
    tip.style.left = `${Math.max(lo, Math.min(hi - tw, want))}px`;
    tip.style.top = `${box.top - host.top - wrap.clientTop + 8}px`;
  };
  const nearest = (clientX) => {
    const box = svgEl.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * width;
    let best = 0;
    for (let i = 1; i < count; i++) if (Math.abs(xAt(i) - vx) < Math.abs(xAt(best) - vx)) best = i;
    return best;
  };

  svgEl.setAttribute('tabindex', '0');
  svgEl.addEventListener('pointerdown', (e) => {
    fromPointer = true;
    show(nearest(e.clientX));
  });
  svgEl.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  // Cảm ứng cũng phát pointerleave khi nhấc ngón tay → chỉ chuột mới ẩn khi rời biểu đồ
  svgEl.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && document.activeElement !== svgEl && hide());
  svgEl.addEventListener('focus', () => {
    if (!fromPointer) show(last); // vào bằng Tab → mở ngày gần nhất; bấm / chạm thì đã chọn đúng ngày ở pointerdown
    fromPointer = false;
  });
  svgEl.addEventListener('blur', () => {
    fromPointer = false;
    hide();
  });
  svgEl.addEventListener('keydown', (e) => {
    const from = current >= 0 ? current : last;
    const to = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: count - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    show(Math.min(count - 1, Math.max(0, to)));
  });
}
