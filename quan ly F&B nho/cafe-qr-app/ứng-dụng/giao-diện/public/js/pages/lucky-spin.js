// SCR-49 Vòng quay may mắn (FEATURE-065, ADR-024 D-89…D-92): khách quét QR trên hóa đơn → quay một lần → voucher / điểm / chúc may mắn.
// Máy chủ chọn ô (crypto, theo tỷ lệ chủ quán đặt) và ghi kết quả; trang này chỉ quay vòng tới đúng ô máy chủ trả về.
import { api } from '../api.js';
import { $, clear, dateOnly, el, errorMessage, money, setBusy, toast } from '../ui.js';
import { icon } from '../icons.js';

const token = location.pathname.split('/').filter(Boolean).pop() ?? '';
const SVG = 'http://www.w3.org/2000/svg';
const SIZE = 320;
const R = 150;
const SPIN_MS = 4200;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let view = null;
let wheel = null;
let spinning = false;

const svg = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...children);
  return n;
};

/** Điểm trên vành theo góc (độ, tính từ đỉnh theo chiều kim đồng hồ). */
const at = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [SIZE / 2 + r * Math.sin(t), SIZE / 2 - r * Math.cos(t)];
};

/** Nhãn ô dài → tối đa 2 dòng ~13 ký tự. */
function wrap(label) {
  const lines = [''];
  for (const word of label.split(/\s+/)) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + ' ' + word).length > 13 && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = cur ? `${cur} ${word}` : word;
  }
  return lines;
}

function drawWheel(slices) {
  const a = 360 / slices.length;
  const g = svg('g');
  slices.forEach((s, i) => {
    const [x1, y1] = at(i * a, R);
    const [x2, y2] = at((i + 1) * a, R);
    g.append(
      svg('path', {
        d: `M${SIZE / 2},${SIZE / 2} L${x1},${y1} A${R},${R} 0 ${a > 180 ? 1 : 0} 1 ${x2},${y2} Z`,
        class: `slice s${i % 3}${slices.length % 3 === 1 && i === slices.length - 1 ? ' s-last' : ''}`,
      }),
    );
    const lines = wrap(s.label);
    // Nhãn chạy dọc bán kính, sát vành; ô ở nửa trái xoay ngược 180° để chữ không lộn đầu
    const mid = (i + 0.5) * a;
    const flip = mid > 180;
    const text = svg('text', {
      class: `slice-label s${i % 3}${slices.length % 3 === 1 && i === slices.length - 1 ? ' s-last' : ''}`,
      transform: `rotate(${flip ? mid + 90 : mid - 90} ${SIZE / 2} ${SIZE / 2})`,
      'text-anchor': flip ? 'start' : 'end',
    });
    const x = flip ? SIZE / 2 - R + 12 : SIZE / 2 + R - 12;
    lines.forEach((line, j) => text.append(svg('tspan', { x, y: SIZE / 2 + (j - (lines.length - 1) / 2) * 14 + 4 }, line)));
    g.append(text);
  });
  g.append(svg('circle', { cx: SIZE / 2, cy: SIZE / 2, r: R, class: 'rim' }));
  return svg(
    'svg',
    { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'wheel', role: 'img', 'aria-label': `Vòng quay gồm các ô: ${slices.map((s) => s.label).join(', ')}` },
    g,
  );
}

/** Góc quay để giữa ô `index` nằm dưới kim (đỉnh vòng). */
function angleFor(index, count, turns) {
  const a = 360 / count;
  const jitter = (Math.random() - 0.5) * a * 0.5;
  return turns * 360 + (360 - (index + 0.5) * a) + jitter;
}

function resultCard(r) {
  if (r.kind === 'NONE')
    return el('div', { class: 'spin-result none' }, el('h2', {}, 'Chúc bạn may mắn lần sau!'), el('p', {}, 'Cảm ơn bạn đã ghé quán — hẹn gặp lại bạn.'));
  if (r.kind === 'POINTS')
    return el(
      'div',
      { class: 'spin-result win' },
      el('div', { class: 'big' }, icon('sparkles')),
      el('h2', {}, `Bạn được +${r.points} điểm`),
      el('p', {}, 'Điểm đã cộng vào thẻ hội viên — dùng để đổi quà ở lần sau.'),
    );
  const v = r.voucher;
  return el(
    'div',
    { class: 'spin-result win' },
    el('div', { class: 'big' }, icon('gift')),
    el('h2', {}, `Bạn trúng: ${r.label}`),
    v
      ? [
          el('div', { class: 'voucher-code', 'aria-label': `Mã voucher ${v.code.split('').join(' ')}` }, v.code),
          el(
            'p',
            { class: 'small' },
            v.percent ? `Giảm ${v.percent}%${v.maxDiscount ? ` (tối đa ${money(v.maxDiscount)})` : ''}` : `Giảm ${money(v.amount)}`,
            ` · dùng đến hết ${dateOnly(v.expiresAt)}`,
          ),
          el(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(v.code);
                  toast('Đã chép mã voucher', 'success');
                } catch {
                  toast(`Mã của bạn: ${v.code}`, 'info', 8000);
                }
              },
            },
            'Chép mã',
          ),
          el('p', { class: 'muted small' }, 'Lần sau gọi món, đọc mã này cho nhân viên khi thanh toán. Mỗi mã dùng một lần.'),
          view?.member ? el('p', { class: 'muted small' }, 'Voucher cũng đã lưu trong Thẻ thành viên của bạn.') : null,
        ]
      : null,
  );
}

function announce(text) {
  $('#spin-live').textContent = text;
}

function showResult(r) {
  $('#spin-title').textContent = 'Kết quả lượt quay của bạn';
  document.querySelectorAll('.spin-before').forEach((n) => n.remove());
  clear($('#spin-result-slot'), resultCard(r));
  announce(r.kind === 'NONE' ? 'Chúc bạn may mắn lần sau.' : `Bạn trúng ${r.label}.`);
  $('#spin-btn')?.remove();
}

async function spin(button) {
  if (spinning) return;
  spinning = true;
  setBusy(button, true);
  let result;
  try {
    ({ result } = await api(`/api/lucky-spins/${token}/spin`, { method: 'POST' }));
  } catch (err) {
    spinning = false;
    setBusy(button, false);
    if (err.status === 410 || err.status === 409 || err.status === 404) return load();
    return toast(errorMessage(err), 'error');
  }
  const index = Math.max(
    0,
    view.slices.findIndex((s) => s.prizeId === result.prizeId),
  );
  announce('Đang quay…');
  const finish = () => {
    spinning = false;
    showResult(result);
  };
  if (reducedMotion()) {
    wheel.style.transform = `rotate(${angleFor(index, view.slices.length, 0)}deg)`;
    return finish();
  }
  wheel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)`;
  wheel.style.transform = `rotate(${angleFor(index, view.slices.length, 6)}deg)`;
  setTimeout(finish, SPIN_MS + 150);
}

function render() {
  const main = $('#main');
  $('#shop').textContent = view.shopName ?? '';
  if (view.status === 'EXPIRED' || view.status === 'REFUNDED')
    return clear(
      main,
      el(
        'div',
        { class: 'empty' },
        el('h1', {}, view.status === 'EXPIRED' ? 'Lượt quay đã hết hạn' : 'Hóa đơn này đã hoàn tiền'),
        el(
          'p',
          { class: 'muted' },
          view.status === 'EXPIRED'
            ? 'Mỗi hóa đơn được quay trong thời hạn in trên hóa đơn. Hẹn bạn lần sau nhé!'
            : 'Hóa đơn đã hoàn tiền nên không còn lượt quay.',
        ),
      ),
    );
  wheel = drawWheel(view.slices);
  const done = view.result;
  if (done) {
    const index = view.slices.findIndex((s) => s.prizeId === done.prizeId);
    if (index >= 0) wheel.style.transform = `rotate(${angleFor(index, view.slices.length, 0)}deg)`;
  }
  clear(
    main,
    el('h1', { id: 'spin-title' }, done ? 'Kết quả lượt quay của bạn' : 'Cảm ơn bạn! Quay một lần để nhận quà'),
    done ? null : el('p', { class: 'muted small spin-before' }, `Hạn quay: ${dateOnly(view.expiresAt)} · mỗi hóa đơn một lượt`),
    el(
      'div',
      { class: 'wheel-wrap' },
      wheel,
      el('div', { class: 'wheel-pointer', 'aria-hidden': 'true' }),
      el('div', { class: 'wheel-hub', 'aria-hidden': 'true' }, icon('gift')),
    ),
    done
      ? null
      : el('button', { class: 'btn btn-primary btn-lg spin-btn', id: 'spin-btn', type: 'button', onclick: (e) => spin(e.currentTarget) }, 'Quay ngay'),
    el('div', { id: 'spin-result-slot' }),
    !done && !view.member ? el('p', { class: 'muted small spin-before' }, 'Hội viên có thêm ô cộng điểm — lần sau báo số điện thoại khi gọi món nhé.') : null,
  );
  if (done) showResult(done);
}

async function load() {
  try {
    view = await api(`/api/lucky-spins/${token}`);
  } catch (err) {
    return clear(
      $('#main'),
      el(
        'div',
        { class: 'empty' },
        el('h1', {}, err.status === 404 || err.status === 400 ? 'Không tìm thấy lượt quay' : 'Chưa tải được vòng quay'),
        el('p', { class: 'muted' }, err.status === 404 || err.status === 400 ? 'Mã trên hóa đơn không đúng — vui lòng quét lại.' : errorMessage(err)),
        err.status === 404 || err.status === 400 ? null : el('button', { class: 'btn btn-primary', type: 'button', onclick: load }, 'Thử lại'),
      ),
    );
  }
  render();
}

load();
