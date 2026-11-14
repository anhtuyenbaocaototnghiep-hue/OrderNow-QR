// F-088 (ADR-049 D-214): trang quầy mở trong khung (iframe) của màn quầy một màn hình — `?embed=1`, cùng nguồn.
// Trang nhúng không có thanh trên; chuyển hướng (đăng nhập hết hạn…) đi ra cả màn hình; việc cần màn chính làm thì nhắn qua postMessage.

export const embedded = (() => {
  try {
    return new URLSearchParams(location.search).get('embed') === '1' && window.top !== window.self;
  } catch {
    return false;
  }
})();

/** Đường dẫn của cả màn hình (dùng cho `?next=` khi phải đăng nhập lại: quay về màn chính, không về trang nhúng). */
export function currentPath() {
  const loc = embedded ? window.top.location : location;
  return loc.pathname + loc.search;
}

/** Chuyển cả màn hình (không chỉ khung đang nhúng). */
export function topNav(url, { replace = false } = {}) {
  const loc = embedded ? window.top.location : location;
  if (replace) loc.replace(url);
  else loc.href = url;
}

/** Nhắn màn chính (chỉ khi đang nhúng). Trả true nếu đã nhắn. */
export function tellHost(message) {
  if (!embedded) return false;
  window.parent.postMessage(message, location.origin);
  return true;
}
