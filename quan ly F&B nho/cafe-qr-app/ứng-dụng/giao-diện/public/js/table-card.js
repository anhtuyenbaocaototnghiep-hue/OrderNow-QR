// TASK-134 (chủ quán 24/11/2026: ảnh thẻ menu "Cà phê rang xay vị tươi" — "thiết kế cái này thành cái mã QR bàn thật đẹp và chuyên
// nghiệp, ko quá bị AI hóa, thành bức ảnh thôi để tôi in ra dán lên bàn cho khách quét"): thẻ QR bàn vẽ bằng canvas — ảnh 1200 × 1800 px
// = 10 × 15 cm ở 300 dpi (cỡ ảnh in thông dụng). Phong cách thẻ in giấy: nền kem, góc hạt cà phê vẽ nét, khung tiêu đề viền đôi xanh rêu
// chữ có chân, tên bàn cam đất, mã QR lớn trên nền trắng, ba bước, dòng thanh toán, dải chân xanh rêu. Tên / logo / địa chỉ lấy từ Cài đặt.
export const CARD_W = 1200;
// TASK-139: app chạy trên máy trong quán (mã QR là địa chỉ IP / localhost) → khách phải vào Wi-Fi quán mới gọi món được
export const LAN_NOTE_WIFI = 'Lưu ý: vào Wi-Fi của quán (mã ①) rồi mới quét mã ② — dùng 4G hay mạng khác sẽ không gọi món được.';
export const LAN_NOTE = 'Lưu ý: bắt Wi-Fi của quán rồi mới quét mã — dùng 4G hay mạng khác sẽ không gọi món được.';
export const CARD_H = 1800;

const C = {
  paper: '#F6F0E4',
  plate: '#ECE1CD',
  plateRing: '#DCCDB3',
  frameFill: '#FBF7EF',
  teal: '#1F5E57',
  orange: '#B4561E',
  ink: '#3B2A1E',
  muted: '#6E5C4B',
  rule: '#D6C6AC',
  white: '#FFFFFF',
};
const SERIF = 'Cambria, "Times New Roman", "Noto Serif", Georgia, serif';
const SANS = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
const M = 80; // lề trái / phải

const font = (size, { weight = 400, family = SANS, italic = false } = {}) => `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;

/** Chia chữ thành dòng không quá maxWidth (theo font đang đặt). */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Cỡ chữ lớn nhất (từ `size` xuống `min`) để chữ vừa tối đa `maxLines` dòng → { size, lines }. */
function fitLines(ctx, text, maxWidth, size, opts, maxLines = 1, min = Math.round(size * 0.55)) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = font(s, opts);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size: s, lines };
  }
  ctx.font = font(min, opts);
  return { size: min, lines: wrap(ctx, text, maxWidth).slice(0, maxLines) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chữ giãn cách (letterSpacing nếu trình duyệt có). */
function spaced(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

/** Một hạt cà phê vẽ nét: bầu dục nâu, rãnh giữa hình chữ S, ánh sáng nhẹ. */
function bean(ctx, x, y, size, angle, [light, dark]) {
  const rx = size;
  const ry = size * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(-rx, -ry, rx, ry);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent'; // bóng chỉ cho thân hạt — rãnh / ánh sáng không đổ bóng
  ctx.strokeStyle = 'rgba(36, 20, 9, 0.8)';
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-rx * 0.8, -ry * 0.04);
  ctx.bezierCurveTo(-rx * 0.28, -ry * 0.6, rx * 0.28, ry * 0.6, rx * 0.8, ry * 0.04);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 238, 218, 0.25)';
  ctx.lineWidth = size * 0.09;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.1, -ry * 0.28, rx * 0.62, ry * 0.42, 0, Math.PI * 1.08, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();
}

/** Góc phải trên: đĩa kem + chùm hạt cà phê (tràn ra mép như thẻ in). */
function beanCorner(ctx) {
  ctx.save();
  ctx.fillStyle = C.plate;
  ctx.beginPath();
  ctx.arc(CARD_W - 30, 40, 330, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.plateRing;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CARD_W - 30, 40, 282, 0, Math.PI * 2);
  ctx.stroke();
  const tones = [
    ['#8C5836', '#4D2D19'],
    ['#7B4A2B', '#40251A'],
    ['#96623D', '#5A3520'],
  ];
  // Chùm hạt chồng lên nhau dồn về góc (vẽ từ sau ra trước, bóng nhẹ tách lớp) — như hạt đổ ra từ đĩa
  const spots = [
    [1172, 34, 50, 0.4],
    [1066, 58, 46, 2.2],
    [1176, 142, 46, -0.6],
    [968, 34, 40, 1.1],
    [1090, 168, 48, 0.9],
    [992, 138, 42, -0.3],
    [1180, 250, 40, 1.8],
    [1068, 266, 38, -1.2],
    [898, 104, 32, 2.6],
    [962, 232, 31, 0.2],
  ];
  ctx.shadowColor = 'rgba(46, 24, 10, 0.28)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  spots.forEach(([x, y, s, a], i) => bean(ctx, x, y, s, a, tones[i % tones.length]));
  ctx.restore();
}

/** Ô trắng bo góc viền xanh rêu chứa ảnh QR (giữ nét: không làm mịn khi phóng). */
function qrBox(ctx, img, x, y, size, pad) {
  roundRect(ctx, x, y, size, size, 26);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.teal;
  ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x + pad, y + pad, size - pad * 2, size - pad * 2);
  ctx.imageSmoothingEnabled = true;
}

/**
 * ADR-070 D-263: nhãn "WIFI" giữa mã Wi-Fi — khách nhận ra ngay mã nào để vào mạng, mã nào để gọi món.
 * Mã Wi-Fi tạo ở mức sửa lỗi H (khôi phục ~30 %); nhãn 78 px trên mã 280 px che khoảng 9 % diện tích nên vẫn quét được.
 */
function wifiBadge(ctx, cx, cy) {
  const s = 78;
  const x = cx - s / 2;
  const y = cy - s / 2;
  roundRect(ctx, x, y, s, s, 14);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.teal;
  ctx.stroke();
  // Biểu tượng Wi-Fi (chấm + 3 cung như Lucide "wifi")
  ctx.fillStyle = C.teal;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  const iy = y + 40;
  for (const r of [9, 17, 25]) {
    ctx.beginPath();
    ctx.arc(cx, iy, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, iy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'butt';
  ctx.font = font(21, { weight: 800 });
  spaced(ctx, 1);
  ctx.textAlign = 'center';
  ctx.fillText('WIFI', cx, y + s - 12);
  ctx.textAlign = 'left';
  spaced(ctx, 0);
}

function centerText(ctx, text, y) {
  ctx.textAlign = 'center';
  ctx.fillText(text, CARD_W / 2, y);
  ctx.textAlign = 'left';
}

/**
 * Vẽ một thẻ QR bàn → <canvas> 1200 × 1800.
 * o: { shopName, shopAddress, shopPhone, logo (HTMLImageElement | null), tableName, qr (HTMLImageElement),
 *      wifi: { img, ssid, password } | null, counterPickup (bool), payLine, safeText (string | null), birthday (string | null),
 *      lanNote (bool — TASK-139: nhắc vào Wi-Fi quán, 4G / mạng khác không gọi món được) }
 */
export function drawTableCard(o) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  beanCorner(ctx);

  // ---- Đầu thẻ: logo + tên quán + dòng giới thiệu ----
  let x = M;
  if (o.logo?.naturalWidth) {
    const s = 150;
    const r = Math.min(s / o.logo.naturalWidth, s / o.logo.naturalHeight);
    const w = o.logo.naturalWidth * r;
    const h = o.logo.naturalHeight * r;
    ctx.drawImage(o.logo, M + (s - w) / 2, 72 + (s - h) / 2, w, h);
    x = M + s + 28;
  }
  const nameMax = 800 - x;
  const name = fitLines(ctx, o.shopName || 'Quán cà phê', nameMax, 66, { weight: 700, family: SERIF }, 2, 40);
  ctx.fillStyle = C.ink;
  const nameTop = name.lines.length > 1 ? 118 : 150;
  name.lines.forEach((l, i) => {
    ctx.font = font(name.size, { weight: 700, family: SERIF });
    ctx.fillText(l, x, nameTop + i * name.size * 1.08);
  });
  ctx.fillStyle = C.muted;
  ctx.font = font(32, { family: SERIF, italic: true });
  ctx.fillText('Gọi món ngay trên điện thoại', x, nameTop + (name.lines.length - 1) * name.size * 1.08 + 52);

  // ---- Khung tiêu đề viền đôi ----
  const fy = 290;
  const fh = 180;
  roundRect(ctx, M, fy, CARD_W - M * 2, fh, 18);
  ctx.fillStyle = C.frameFill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.teal;
  ctx.stroke();
  roundRect(ctx, M + 12, fy + 12, CARD_W - M * 2 - 24, fh - 24, 11);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.teal;
  ctx.font = font(84, { weight: 700, family: SERIF });
  spaced(ctx, 3);
  centerText(ctx, 'QUÉT MÃ GỌI MÓN', fy + 104);
  spaced(ctx, 0);
  ctx.font = font(34, { family: SERIF, italic: true });
  centerText(ctx, '(Xem thực đơn · Gọi món · Gọi thanh toán)', fy + 152);

  // ---- Tên bàn giữa hai đường kẻ ----
  const ty = 572;
  ctx.font = font(70, { weight: 800 });
  spaced(ctx, 6);
  const table = String(o.tableName || '').toUpperCase();
  const tw = ctx.measureText(table).width;
  ctx.fillStyle = C.orange;
  centerText(ctx, table, ty);
  spaced(ctx, 0);
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 3;
  const ly = ty - 24;
  const gap = 36;
  ctx.beginPath();
  ctx.moveTo(M + 40, ly);
  ctx.lineTo(CARD_W / 2 - tw / 2 - gap, ly);
  ctx.moveTo(CARD_W / 2 + tw / 2 + gap, ly);
  ctx.lineTo(CARD_W - M - 40, ly);
  ctx.stroke();

  // ---- Mã QR (có Wi-Fi: ① Wi-Fi bên trái, ② gọi món bên phải) ----
  const qy = 612;
  let qrBottom;
  if (o.wifi?.img) {
    const leftW = 360;
    const label = (text, cx, y) => {
      ctx.fillStyle = C.teal;
      ctx.font = font(34, { weight: 700 });
      ctx.textAlign = 'center';
      ctx.fillText(text, cx, y);
      ctx.textAlign = 'left';
    };
    const lx = M;
    label('① Quét để vào Wi-Fi', lx + leftW / 2, qy + 40);
    qrBox(ctx, o.wifi.img, lx + 20, qy + 66, 320, 20);
    wifiBadge(ctx, lx + 20 + 160, qy + 66 + 160);
    ctx.fillStyle = C.ink;
    ctx.font = font(26, { weight: 600 });
    ctx.textAlign = 'center';
    const wifiLines = [`Wi-Fi: ${o.wifi.ssid}`, o.wifi.password ? `Mật khẩu: ${o.wifi.password}` : 'Không mật khẩu'];
    wifiLines.forEach((l, i) => {
      const { size, lines } = fitLines(ctx, l, leftW, 26, { weight: 600 }, 1, 18);
      ctx.font = font(size, { weight: 600 });
      ctx.fillText(lines[0] ?? '', lx + leftW / 2, qy + 436 + i * 38);
    });
    ctx.textAlign = 'left';
    // TASK-139: khung nhắc dưới tên / mật khẩu Wi-Fi — vào Wi-Fi quán (mã ①) trước, 4G / mạng khác không gọi món được
    let noteBottom = 0;
    if (o.lanNote) {
      ctx.font = font(22, { weight: 700 });
      const lines = wrap(ctx, LAN_NOTE_WIFI, leftW - 44).slice(0, 5);
      const by = qy + 436 + (wifiLines.length - 1) * 38 + 34;
      const bh = lines.length * 29 + 26;
      roundRect(ctx, lx + 6, by, leftW - 12, bh, 12);
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.orange;
      ctx.stroke();
      ctx.fillStyle = C.orange;
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, lx + leftW / 2, by + 36 + i * 29));
      ctx.textAlign = 'left';
      noteBottom = by + bh;
    }
    const rx = M + leftW + 40;
    const rw = CARD_W - M - rx;
    label('② Quét để gọi món', rx + rw / 2, qy + 40);
    const size = Math.min(rw, 560);
    qrBox(ctx, o.qr, rx + (rw - size) / 2, qy + 66, size, 26);
    qrBottom = Math.max(qy + 66 + size, noteBottom - 6); // khung nhắc cao hơn mã ② → đẩy ba bước xuống
  } else {
    const size = 660;
    qrBox(ctx, o.qr, (CARD_W - size) / 2, qy, size, 28);
    qrBottom = qy + size;
    if (o.lanNote) {
      const f = fitLines(ctx, LAN_NOTE, CARD_W - M * 2, 26, { weight: 700 }, 1, 18);
      ctx.fillStyle = C.orange;
      ctx.font = font(f.size, { weight: 700 });
      centerText(ctx, f.lines[0] ?? '', qrBottom + 46);
      qrBottom += 52;
    }
  }

  // ---- Ba bước ----
  const sy = qrBottom + 66;
  const steps = ['Quét mã', 'Chọn món & gửi', o.counterPickup ? 'Nhận món ở quầy' : 'Nhân viên mang ra'];
  ctx.font = font(30, { weight: 600 });
  const r = 24;
  const widths = steps.map((s) => r * 2 + 14 + ctx.measureText(s).width);
  const between = 46;
  let sx = (CARD_W - (widths.reduce((a, b) => a + b, 0) + between * 2)) / 2;
  steps.forEach((s, i) => {
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(sx + r, sy - 10, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = font(28, { weight: 700 });
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), sx + r, sy);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink;
    ctx.font = font(30, { weight: 600 });
    ctx.fillText(s, sx + r * 2 + 14, sy);
    sx += widths[i] + between;
  });

  // ---- Thanh toán + nhắc chống mã giả + sinh nhật ----
  const ry = sy + 52;
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M + 40, ry);
  ctx.lineTo(CARD_W - M - 40, ry);
  ctx.stroke();
  let y = ry + 54;
  ctx.fillStyle = C.ink;
  ctx.font = font(28);
  for (const l of wrap(ctx, o.payLine, CARD_W - M * 2 - 40).slice(0, 2)) {
    centerText(ctx, l, y);
    y += 40;
  }
  if (o.safeText) {
    ctx.font = font(28, { weight: 700 });
    const lines = wrap(ctx, o.safeText, CARD_W - M * 2 - 120).slice(0, 2);
    const bh = lines.length * 40 + 34;
    const by = y - 10;
    roundRect(ctx, M + 30, by, CARD_W - M * 2 - 60, bh, 12);
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.orange;
    ctx.stroke();
    ctx.fillStyle = C.orange;
    lines.forEach((l, i) => centerText(ctx, l, by + 46 + i * 40));
    y = by + bh + 44;
  }
  if (o.birthday) {
    ctx.fillStyle = C.muted;
    ctx.font = font(24, { family: SERIF, italic: true });
    centerText(ctx, o.birthday, Math.min(y - 6, CARD_H - 150 - 26));
  }

  // ---- Dải chân xanh rêu ----
  const fy2 = CARD_H - 150;
  ctx.fillStyle = C.teal;
  ctx.fillRect(0, fy2, CARD_W, 150);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(0, fy2 + 8, CARD_W, 2);
  ctx.fillStyle = C.white;
  const thanks = 'Cảm ơn quý khách!';
  ctx.font = font(36, { family: SERIF, italic: true });
  let rightW = ctx.measureText(thanks).width;
  ctx.textAlign = 'right';
  ctx.fillText(thanks, CARD_W - M, o.shopPhone ? fy2 + 66 : fy2 + 88);
  // ADR-070 D-262: số điện thoại quán (Cài đặt) dưới lời cảm ơn
  if (o.shopPhone) {
    const phone = `ĐT: ${o.shopPhone}`;
    ctx.font = font(28, { weight: 600 });
    rightW = Math.max(rightW, ctx.measureText(phone).width);
    ctx.fillText(phone, CARD_W - M, fy2 + 110);
  }
  ctx.textAlign = 'left';
  const leftMax = CARD_W - M * 2 - rightW - 40;
  const shop = fitLines(ctx, o.shopName || '', leftMax, 40, { weight: 700, family: SERIF }, 1, 26);
  ctx.font = font(shop.size, { weight: 700, family: SERIF });
  ctx.fillText(shop.lines[0] ?? '', M, o.shopAddress ? fy2 + 66 : fy2 + 88);
  if (o.shopAddress) {
    const addr = fitLines(ctx, o.shopAddress, leftMax, 26, {}, 1, 18);
    ctx.font = font(addr.size);
    let line = addr.lines[0] ?? '';
    while (line.length > 1 && ctx.measureText(line).width > leftMax) line = `${line.slice(0, -2)}…`;
    ctx.fillText(line, M, fy2 + 110);
  }
  return cv;
}
