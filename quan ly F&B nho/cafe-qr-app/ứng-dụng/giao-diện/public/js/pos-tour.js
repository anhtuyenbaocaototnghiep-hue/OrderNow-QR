// Hướng dẫn từng bước trên màn quầy (FEATURE-061, ADR-021 D-80): khoanh phần tử thật + hộp giải thích.
// Tiếp / Quay lại / Bỏ qua; Esc = bỏ qua; Tab chỉ đi trong hộp; phần trang phía sau không bấm được (lớp phủ + inert).
// Khung bám theo phần tử mỗi khung hình: thanh trên đổi chữ ("Ca…" → "Ca #12 · từ 07:00"), đổi hàng, cuộn… đều đặt lại.
// steps: [{ target: 'css selector' | () => Element, title, text: string | () => string }] — không thấy phần tử thì hộp đứng giữa màn hình.
// Đổi bước: vùng aria-live đọc "Bước n / 5" + tiêu đề + nội dung (focus vẫn ở nút Tiếp — review G3, WCAG 4.1.3).
import { el } from './ui.js';

const GAP = 12;

export function startTour(steps, { onEnd } = {}) {
  let i = 0;
  const prevFocus = document.activeElement;
  const ring = el('div', { class: 'tour-ring', 'aria-hidden': 'true' });
  const count = el('div', { class: 'tour-count small' });
  const title = el('h2', { class: 'tour-title', id: 'tour-title' });
  const text = el('p', { class: 'tour-text', id: 'tour-text' });
  const skip = el('button', { class: 'btn btn-ghost', type: 'button' }, 'Bỏ qua');
  const back = el('button', { class: 'btn', type: 'button' }, 'Quay lại');
  const next = el('button', { class: 'btn btn-primary', type: 'button' }, 'Tiếp');
  const box = el(
    'div',
    { class: 'tour-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-text' },
    el('div', { 'aria-live': 'polite' }, count, title, text),
    el('div', { class: 'tour-actions' }, skip, el('span', { class: 'grow' }), back, next),
  );
  const layer = el('div', { class: 'tour-layer' }, ring, box);
  // Phía sau không bấm / đọc được — chỉ gỡ inert mà chính hướng dẫn đặt; thông báo (toast) vẫn đọc được và nổi trên lớp phủ
  const behind = [...document.body.children].filter((n) => !n.hasAttribute('inert') && !n.classList.contains('toasts'));
  behind.forEach((n) => n.setAttribute('inert', ''));
  document.body.append(layer);

  const targetOf = (step) => {
    const t = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? t : null;
  };

  function place() {
    const t = targetOf(steps[i]);
    box.style.left = '';
    box.style.top = '';
    if (!t) {
      ring.hidden = true;
      layer.classList.add('dim');
      box.classList.add('center');
      return;
    }
    layer.classList.remove('dim');
    box.classList.remove('center');
    ring.hidden = false;
    const r = t.getBoundingClientRect();
    Object.assign(ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const vw = innerWidth;
    const vh = innerHeight;
    // Dưới phần tử nếu đủ chỗ, không thì trên, không nữa thì đè lên mép dưới màn hình
    let top = r.bottom + GAP + 6;
    if (top + bh > vh - 8) top = r.top - GAP - 6 - bh;
    if (top < 8) top = Math.max(8, vh - bh - 8);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - bw - 8));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  let raf = 0;
  let lastRect = null;
  function track() {
    const r = targetOf(steps[i])?.getBoundingClientRect();
    const key = r ? `${r.left},${r.top},${r.width},${r.height},${innerWidth},${innerHeight}` : 'none';
    if (key !== lastRect) {
      lastRect = key;
      place();
    }
    raf = requestAnimationFrame(track);
  }

  function show() {
    const step = steps[i];
    count.textContent = `Bước ${i + 1} / ${steps.length}`;
    title.textContent = step.title;
    text.textContent = typeof step.text === 'function' ? step.text() : step.text;
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Xong' : 'Tiếp';
    targetOf(step)?.scrollIntoView({ block: 'nearest' });
    lastRect = null; // đặt lại ở khung hình kế tiếp
    place();
    next.focus();
  }

  function end(done) {
    cancelAnimationFrame(raf);
    layer.remove();
    behind.forEach((n) => n.removeAttribute('inert'));
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
    onEnd?.(done);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      end(false);
    } else if (e.key === 'Tab') {
      const items = [skip, back, next].filter((b) => !b.disabled);
      const at = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  }

  skip.addEventListener('click', () => end(false));
  back.addEventListener('click', () => {
    if (i > 0) {
      i -= 1;
      show();
    }
  });
  next.addEventListener('click', () => {
    if (i === steps.length - 1) end(true);
    else {
      i += 1;
      show();
    }
  });
  document.addEventListener('keydown', onKey, true);
  show();
  raf = requestAnimationFrame(track);
  return { close: () => end(false) };
}
