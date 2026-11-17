// F-094 (ADR-056 D-231…D-233): giao diện màn khách theo giờ (sáng / ngày / tối) và trang trí theo mùa.
// Script THƯỜNG (không module) đặt trong <head> của t/index, t/menu, t/track: tô màu trước khi trang vẽ → buổi tối không nháy trắng.
// Đặt trên <html>: data-daypart (morning | day | night), data-theme="dark" (tối hoặc điện thoại bật chế độ tối), data-season
// (spring | summer | autumn | winter). Cài đặt của quán (bật / tắt ở Cài đặt) nhớ ở máy để lần sau vẽ đúng ngay; chưa có = bật.
(() => {
  const KEY = 'guest-theme';
  const root = document.documentElement;
  let opts = { daypart: true, season: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) opts = { daypart: saved.daypart !== false, season: saved.season !== false };
  } catch {
    // trình duyệt chặn lưu trữ → dùng mặc định
  }
  const darkPref = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };

  // Giờ Việt Nam = UTC+7 quanh năm (không đổi giờ mùa hè) — cùng mốc với lời chào ở màn chào (F-092)
  const vnNow = () => new Date(Date.now() + 7 * 3600 * 1000);
  const daypartOf = (h) => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 18 ? 'day' : 'night');
  const SEASONS = ['spring', 'summer', 'autumn', 'winter']; // tháng 1–3, 4–6, 7–9, 10–12

  const put = (name, value) => (value ? root.setAttribute(name, value) : root.removeAttribute(name));
  let last = null;
  function apply() {
    const now = vnNow();
    const part = daypartOf(now.getUTCHours());
    put('data-daypart', opts.daypart ? part : null);
    put('data-theme', opts.daypart && (part === 'night' || darkPref.matches) ? 'dark' : null);
    put('data-season', opts.season ? SEASONS[Math.floor(now.getUTCMonth() / 3)] : null);
    const key = `${root.getAttribute('data-daypart')}|${root.getAttribute('data-theme')}|${root.getAttribute('data-season')}`;
    if (last !== null && key !== last) window.dispatchEvent(new Event('guest-theme')); // màn chào vẽ lại lời chào
    last = key;
  }

  apply();
  setInterval(apply, 30 * 1000); // qua 18:00 khi đang mở → tự chuyển tối, không cần tải lại
  darkPref.addEventListener?.('change', apply);
  // credentials: 'omit' — không gửi / không nhận cookie: /api/shop công khai; nếu nhận cookie, lần quét QR đầu tiên của khách mới
  // (chưa có cookie danh tính cf_client) có hai lời gọi cùng lúc được cấp hai cookie khác nhau → cookie về sau đè cookie đã gắn với
  // nhóm vừa vào, điện thoại "mất" nhóm của mình
  fetch('/api/shop', { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((shop) => {
      const g = shop?.guestTheme;
      if (!g) return;
      opts = { daypart: g.daypart !== false, season: g.season !== false };
      try {
        localStorage.setItem(KEY, JSON.stringify(opts));
      } catch {
        // không lưu được thì lần sau dùng mặc định
      }
      apply();
    })
    .catch(() => {});
})();
