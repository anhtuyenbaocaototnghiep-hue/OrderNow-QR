// Khung trang quầy: kiểm đăng nhập, thanh trên (điều hướng, kết nối, âm thanh, đăng xuất).
import { current, logout, requireStaffPage } from './auth.js';
import { $, audioReady, el, playSound, toast, unlockAudio } from './ui.js';

export async function mountPosShell(active) {
  const user = await requireStaffPage();
  const { shop } = current;
  const conn = el('span', { class: 'conn offline', id: 'conn' }, 'Đang kết nối…');
  const soundBtn = el('button', { class: 'btn btn-sm', type: 'button', title: 'Trình duyệt chỉ phát âm thanh sau khi bạn bấm nút này' }, '🔇 Bật âm thanh');
  const refreshSound = () => {
    const on = audioReady();
    soundBtn.textContent = on ? '🔔 Âm thanh: bật' : '🔇 Bật âm thanh';
    soundBtn.classList.toggle('sound-on', on);
  };
  soundBtn.addEventListener('click', () => {
    unlockAudio();
    setTimeout(() => {
      refreshSound();
      if (playSound('ting')) toast('Đã bật âm thanh báo đơn mới', 'success');
    }, 50);
  });
  // Nhiều trình duyệt mở khóa âm thanh ở lần chạm đầu tiên
  document.addEventListener(
    'pointerdown',
    () => {
      unlockAudio();
      setTimeout(refreshSound, 50);
    },
    { once: true },
  );

  const nav = [
    ['orders', '/pos', 'Đơn hàng'],
    ['takeaway', '/pos/takeaway', 'Bán mang đi'],
  ];
  if (user.role === 'ADMIN') nav.push(['admin', '/admin', 'Quản lý']);

  const header = el(
    'header',
    { class: 'pos-top' },
    el('div', { class: 'brand' }, '☕ ', shop?.name || 'Quầy'),
    el(
      'nav',
      { class: 'pos-nav', 'aria-label': 'Điều hướng quầy' },
      nav.map(([key, href, label]) => el('a', { href, class: key === active ? 'active' : '' }, label)),
    ),
    el(
      'div',
      { class: 'pos-tools' },
      conn,
      soundBtn,
      el('span', { class: 'small' }, user.fullName),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, 'Đăng xuất'),
    ),
  );
  document.body.prepend(header);
  if (new URLSearchParams(location.search).get('denied') === 'admin') toast('Chức năng quản lý chỉ dành cho tài khoản Quản lý', 'warning');

  return {
    user,
    shop,
    setOnline(online) {
      conn.classList.toggle('offline', !online);
      conn.textContent = online ? 'Đã kết nối' : 'Mất kết nối';
      $('#offline-banner')?.toggleAttribute('hidden', online);
    },
  };
}
