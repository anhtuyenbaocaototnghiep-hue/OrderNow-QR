// Ô "Nhập SĐT để nhận ưu đãi" phía khách (FEATURE-014, ADR-005 D-6, D-16): tra cứu → xác nhận (tên che) hoặc đăng ký (họ tên + đồng ý).
// Chiết khấu tính lúc thu tiền; ở đây chỉ gắn hội viên vào phiên.
import { api } from './api.js';
import { clear, dateOnly, el, errorMessage, modal, money, setBusy, toast, voucherValue } from './ui.js';
import { icon } from './icons.js';

const percentText = (m) =>
  m.firstOrderDiscount && m.firstOrderPercent > m.discountPercent ? `đơn đầu −${m.firstOrderPercent}%` : `giảm ${m.discountPercent}%`;

/**
 * Gắn khung hội viên vào `container`. getSession() trả phiên hiện tại (có `member` đã che tên);
 * onChange() gọi sau khi gắn/gỡ để trang tải lại.
 */
/** F-039 / F-038: điểm, thẻ tem ("còn N ly nữa được tặng"), voucher (không hiện mã — báo nhân viên khi thanh toán). */
function loyaltyLines(l) {
  if (!l) return null;
  return el(
    'div',
    { class: 'small loyalty-lines' },
    el('div', {}, icon('award'), `${l.points} điểm`),
    l.stampCards.map((c) => el('div', {}, icon('stamp'), c.text)),
    l.vouchers.length
      ? el(
          'div',
          { class: 'save' },
          icon('ticket'),
          `Bạn có ${l.vouchers.length} voucher (${l.vouchers.map((v) => (v.percent ? `−${v.percent}%` : `−${Number(v.amount).toLocaleString('vi-VN')}đ`)).join(', ')}) — báo nhân viên khi thanh toán`,
        )
      : null,
  );
}

/** Nội dung Thẻ thành viên: hội viên (tên + SĐT che), điểm + lịch sử, thẻ tem, quà đổi điểm, voucher (giá trị, điều kiện, hạn, nguồn). */
function cardView(c) {
  const section = (title, ...children) => el('section', { class: 'card-section' }, el('h3', {}, title), ...children);
  const perk =
    c.member.firstOrderPercent && c.member.firstOrderPercent > c.member.discountPercent
      ? `Đơn đầu tiên −${c.member.firstOrderPercent}% · sau đó −${c.member.discountPercent}%`
      : `Giảm ${c.member.discountPercent}% mỗi lần thanh toán`;
  return el(
    'div',
    { class: 'stack' },
    el(
      'div',
      { class: 'card-head' },
      el('div', {}, el('strong', {}, c.member.maskedName), el('div', { class: 'small muted' }, `${c.member.maskedPhone} · ${c.member.tierName ?? ''}`)),
      el('div', { class: 'card-points' }, el('strong', {}, String(c.points)), el('span', { class: 'small' }, ' điểm')),
    ),
    el('p', { class: 'small' }, icon('star'), perk),
    section(
      [icon('ticket'), `Voucher của bạn (${c.vouchers.length})`],
      c.vouchers.length
        ? el(
            'ul',
            { class: 'card-list' },
            c.vouchers.map((v) =>
              el(
                'li',
                {},
                el('strong', {}, voucherValue(v)),
                el(
                  'div',
                  { class: 'small muted' },
                  `${v.sourceLabel} · HSD ${dateOnly(v.expiresAt)}${v.minOrderAmount > 0 ? ` · đơn từ ${money(v.minOrderAmount)}` : ''}`,
                ),
              ),
            ),
          )
        : el('p', { class: 'small muted' }, 'Chưa có voucher.'),
      c.vouchers.length ? el('p', { class: 'small muted' }, 'Báo nhân viên khi thanh toán để dùng voucher.') : null,
    ),
    c.stampCards.length
      ? section(
          [icon('stamp'), 'Thẻ tem'],
          c.stampCards.map((s) => el('div', { class: 'small' }, `${s.name}: ${s.text}`)),
        )
      : null,
    c.rewards.length
      ? section(
          [icon('gift'), 'Đổi điểm lấy quà'],
          el(
            'ul',
            { class: 'card-list' },
            c.rewards.map((r) =>
              el(
                'li',
                { class: r.missing ? 'muted' : '' },
                `${r.name} — ${r.pointsCost} điểm`,
                r.missing ? ` (còn thiếu ${r.missing})` : el('span', { class: 'save' }, ' ', icon('check'), 'đủ điểm'),
              ),
            ),
          ),
        )
      : null,
    section(
      [icon('award'), 'Lịch sử điểm gần đây'],
      c.pointHistory.length
        ? el(
            'ul',
            { class: 'card-list' },
            c.pointHistory.map((h) =>
              el(
                'li',
                { class: 'row between' },
                el('span', { class: 'small' }, `${dateOnly(h.createdAt)} · ${h.label}`),
                el('strong', {}, `${h.delta > 0 ? '+' : ''}${h.delta}`),
              ),
            ),
          )
        : el('p', { class: 'small muted' }, 'Chưa có giao dịch điểm — thanh toán để tích điểm.'),
    ),
  );
}

export function mountMemberBox(container, { sessionId, getSession, onChange }) {
  function render() {
    const session = getSession();
    if (!session || session.status === 'CLOSED') return clear(container);
    const m = session.member;
    if (m) {
      clear(
        container,
        el(
          'div',
          { class: 'member-box on' },
          el(
            'div',
            { class: 'grow' },
            el('strong', {}, `Bạn đang nhận ưu đãi ${percentText(m)}`),
            el('div', { class: 'small muted' }, `${m.maskedName} · ${m.tierName}`),
            loyaltyLines(m.loyalty),
            el('button', { class: 'link-btn small', type: 'button', id: 'open-member-card', onclick: openCard }, 'Xem thẻ thành viên ›'),
          ),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: detach }, 'Gỡ'),
        ),
      );
      return;
    }
    clear(
      container,
      el(
        'button',
        { class: 'member-box', type: 'button', onclick: open },
        el(
          'span',
          { class: 'grow' },
          el('strong', {}, icon('star'), 'Nhập SĐT để nhận ưu đãi'),
          el('div', { class: 'small muted' }, 'Hội viên giảm 3–8%, đơn đầu tiên giảm 10%'),
        ),
        icon('chevron-right'),
      ),
    );
  }

  /** F-047 Thẻ thành viên (ADR-008 D-37): chỉ xem khi SĐT đang gắn vào phiên của bàn; không có mã voucher. */
  async function openCard() {
    const body = el('div', { class: 'member-card' }, el('p', { class: 'muted' }, 'Đang tải…'));
    modal({ title: 'Thẻ thành viên', sheet: true, body });
    try {
      clear(body, cardView(await api(`/api/sessions/${sessionId}/member-card`)));
    } catch (err) {
      clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
    }
  }

  async function detach() {
    try {
      await api(`/api/sessions/${sessionId}/member`, { method: 'DELETE' });
      await onChange?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function attach(phone) {
    await api(`/api/sessions/${sessionId}/member`, { method: 'POST', body: { phone } });
    await onChange?.();
  }

  function open() {
    const phone = el('input', {
      class: 'input',
      type: 'tel',
      inputmode: 'tel',
      autocomplete: 'tel',
      placeholder: '09xx xxx xxx',
      maxlength: 15,
      'aria-label': 'Số điện thoại',
    });
    const step = el('div');
    const msg = el('div');
    const lookupBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Tiếp tục');
    const m = modal({
      title: 'Ưu đãi hội viên',
      sheet: true,
      body: el(
        'div',
        { class: 'stack' },
        el('p', { class: 'small muted' }, 'Nhập số điện thoại — lần sau chỉ cần nhập số là tự giảm giá. Không cần mật khẩu.'),
        el('label', {}, 'Số điện thoại'),
        phone,
        msg,
        step,
        lookupBtn,
      ),
    });

    lookupBtn.addEventListener('click', async () => {
      clear(msg);
      setBusy(lookupBtn, true);
      try {
        const r = await api('/api/members/lookup', { method: 'POST', body: { phone: phone.value } });
        if (r.found) showFound(r.member);
        else showRegister();
      } catch (err) {
        clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
      } finally {
        setBusy(lookupBtn, false);
      }
    });

    function showFound(member) {
      lookupBtn.hidden = true;
      phone.disabled = true;
      const ok = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Xác nhận, đây là tôi');
      ok.addEventListener('click', async () => {
        setBusy(ok, true);
        try {
          await attach(phone.value);
          toast(`Đã áp dụng ưu đãi hội viên (${percentText(member)})`, 'success');
          m.close();
        } catch (err) {
          setBusy(ok, false);
          clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
        }
      });
      clear(
        step,
        el('div', { class: 'alert info' }, el('strong', {}, member.maskedName), ` · ${member.tierName} · ${percentText(member)}`),
        ok,
        el('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => m.close() }, 'Không phải tôi'),
      );
    }

    function showRegister() {
      lookupBtn.hidden = true;
      phone.disabled = true;
      const name = el('input', { class: 'input', autocomplete: 'name', maxlength: 100, placeholder: 'Ví dụ: Nguyễn Văn An', 'aria-label': 'Họ tên' });
      const consent = el('input', { type: 'checkbox' });
      const referrer = el('input', {
        class: 'input',
        type: 'tel',
        inputmode: 'tel',
        maxlength: 15,
        placeholder: 'Ví dụ: 0912 345 678',
        'aria-label': 'SĐT người giới thiệu',
      });
      const ok = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Đăng ký & nhận ưu đãi');
      ok.addEventListener('click', async () => {
        clear(msg);
        if (!consent.checked) return clear(msg, el('div', { class: 'field-error' }, 'Vui lòng tick đồng ý để đăng ký'));
        setBusy(ok, true);
        try {
          const member = await api('/api/members', {
            method: 'POST',
            body: { phone: phone.value, fullName: name.value, consent: true, referrerPhone: referrer.value.trim() || null },
          });
          await attach(phone.value);
          toast(member.firstOrderPercent ? `Đăng ký thành công! Đơn đầu tiên giảm ${member.firstOrderPercent}%` : 'Đăng ký thành công!', 'success', 5000);
          m.close();
        } catch (err) {
          setBusy(ok, false);
          clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
        }
      });
      clear(
        step,
        el('div', { class: 'alert info' }, 'Số này chưa là hội viên. Đăng ký miễn phí:'),
        el('label', {}, 'Họ tên'),
        name,
        el('label', {}, 'SĐT người giới thiệu (không bắt buộc)'),
        referrer,
        el('p', { class: 'small muted' }, 'Thanh toán lần đầu từ 30.000đ: bạn và người giới thiệu mỗi người nhận voucher giảm 10%.'),
        el(
          'label',
          { class: 'check' },
          consent,
          'Tôi đồng ý cho quán lưu số điện thoại và tên để tích lũy ưu đãi (không dùng cho mục đích khác; có thể yêu cầu xóa bất cứ lúc nào).',
        ),
        ok,
      );
      name.focus();
    }
  }

  render();
  return { render };
}
