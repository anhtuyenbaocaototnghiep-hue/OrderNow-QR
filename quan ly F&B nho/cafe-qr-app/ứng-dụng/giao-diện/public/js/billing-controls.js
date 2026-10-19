// Khung "Hội viên · giảm giá" dùng chung cho thu tiền bàn (S-14) và bán mang đi (S-13) — ADR-005 F-014, F-022.
// ADR-006: điểm / tem + đổi thưởng (F-039), voucher (F-038), SĐT người giới thiệu khi đăng ký nhanh (F-038).
// Không tự tính tiền: trang gọi API xem trước (server dùng bộ pricing) mỗi khi lựa chọn đổi.
import { staffApi } from './api.js';
import { clear, el, errorMessage, toast } from './ui.js';

/**
 * Khung hội viên + giảm giá tay dùng chung cho thu tiền bàn và mang đi.
 * onChange() gọi khi đổi lựa chọn (trang tải lại số xem trước). Hội viên của phiên do server giữ (attach/detach).
 */
export function billingControls({ onChange, sessionId = null, onMember = null }) {
  const st = { member: null, memberId: undefined, manualKind: 'AMOUNT', approval: false, reward: null, voucherCode: null, loyalty: null };
  const loyaltyBox = el('div', { class: 'loyalty-slot' });
  const earnNote = el('div', { class: 'small muted earn-note' });
  const voucherInput = el('input', { class: 'input', maxlength: 20, placeholder: 'Mã voucher', 'aria-label': 'Mã voucher', style: { maxWidth: '10rem' } });
  const voucherMsg = el('span', { class: 'small' });
  const phone = el('input', { class: 'input', type: 'tel', inputmode: 'tel', placeholder: 'SĐT hội viên', maxlength: 15, 'aria-label': 'SĐT hội viên' });
  const memberBox = el('div', { class: 'member-slot' });
  const msg = el('div');
  const value = el('input', { class: 'input', inputmode: 'decimal', placeholder: '0', 'aria-label': 'Mức giảm', style: { maxWidth: '8rem' } });
  const kind = el(
    'select',
    { class: 'input', style: { width: 'auto' }, 'aria-label': 'Kiểu giảm' },
    el('option', { value: 'AMOUNT' }, 'đ'),
    el('option', { value: 'PERCENT' }, '%'),
  );
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Lý do giảm (bắt buộc)', 'aria-label': 'Lý do giảm giá' });
  const adminUser = el('input', {
    class: 'input',
    placeholder: 'Tên đăng nhập trưởng ca / quản lý',
    autocomplete: 'off',
    'aria-label': 'Tên đăng nhập quản lý',
  });
  const adminPass = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Mật khẩu quản lý',
    autocomplete: 'new-password',
    'aria-label': 'Mật khẩu quản lý',
  });
  const approvalBox = el(
    'div',
    { class: 'approval', hidden: true },
    el('div', { class: 'small' }, 'Mức giảm vượt ngưỡng của bạn — cần trưởng ca / quản lý nhập tài khoản để duyệt:'),
    el('div', { class: 'row' }, adminUser, adminPass),
  );
  let timer = null;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  };
  [value, reason].forEach((i) => i.addEventListener('input', changed));
  kind.addEventListener('change', changed);

  async function lookup() {
    clear(msg);
    try {
      const r = await staffApi('/api/members/lookup', { method: 'POST', body: { phone: phone.value } });
      if (r.found) {
        await setMember(r.member);
        return;
      }
      const name = el('input', { class: 'input', placeholder: 'Họ tên khách', maxlength: 100, 'aria-label': 'Họ tên khách' });
      const referrer = el('input', {
        class: 'input',
        type: 'tel',
        inputmode: 'tel',
        maxlength: 15,
        placeholder: 'SĐT người giới thiệu (không bắt buộc)',
        'aria-label': 'SĐT người giới thiệu',
      });
      const consent = el('input', { type: 'checkbox' });
      clear(
        msg,
        el(
          'div',
          { class: 'alert info stack' },
          el('div', {}, 'Số này chưa là hội viên. Đăng ký nhanh:'),
          name,
          referrer,
          el('label', { class: 'check' }, consent, 'Khách đồng ý cho quán lưu SĐT + tên để tích lũy ưu đãi'),
          el(
            'button',
            {
              class: 'btn btn-sm btn-primary',
              type: 'button',
              onclick: async () => {
                if (!consent.checked) return toast('Cần khách đồng ý trước khi đăng ký', 'warning');
                try {
                  const m = await staffApi('/api/members', {
                    method: 'POST',
                    body: { phone: phone.value, fullName: name.value, consent: true, referrerPhone: referrer.value.trim() || null },
                  });
                  clear(msg);
                  await setMember({ ...m, fullName: name.value.trim() });
                  toast(
                    m.referred
                      ? 'Đã đăng ký (có người giới thiệu) — thanh toán lần đầu từ 30.000đ cả hai nhận voucher'
                      : 'Đã đăng ký hội viên — đơn đầu tiên được giảm',
                    'success',
                    6000,
                  );
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              },
            },
            'Đăng ký',
          ),
        ),
      );
    } catch (err) {
      clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
    }
  }

  async function setMember(m) {
    if (sessionId) {
      try {
        await staffApi(`/api/sessions/${sessionId}/member`, { method: m ? 'POST' : 'DELETE', body: m ? { memberId: m.memberId } : undefined });
      } catch (err) {
        return toast(errorMessage(err), 'error');
      }
    }
    st.member = m;
    st.memberId = m ? m.memberId : null;
    st.reward = null;
    st.voucherCode = null;
    renderMember();
    loadLoyalty();
    onMember?.(m);
    onChange();
  }

  // ---- F-039 điểm / tem / đổi thưởng · F-038 voucher ----
  async function loadLoyalty() {
    st.loyalty = null;
    renderLoyalty();
    if (!st.member) return;
    try {
      st.loyalty = await staffApi(`/api/members/${st.member.memberId}/loyalty`);
    } catch {
      st.loyalty = null;
    }
    renderLoyalty();
  }

  function pickReward(value) {
    if (!value) st.reward = null;
    else {
      const [type, id] = value.split(':');
      st.reward = type === 'POINTS' ? { type, rewardId: Number(id) } : { type, programId: Number(id) };
    }
    // Đổi thưởng không dùng cùng giảm tay (server cũng chặn)
    manualRow.classList.toggle('disabled', Boolean(st.reward));
    if (st.reward) {
      valueInput.value = '';
      reason.value = '';
    }
    onChange();
  }

  function applyVoucher(code) {
    st.voucherCode = code ? String(code).trim().toUpperCase() : null;
    voucherInput.value = st.voucherCode ?? '';
    clear(voucherMsg, st.voucherCode ? `Đang áp ${st.voucherCode}` : '');
    onChange();
  }

  function renderLoyalty() {
    const l = st.loyalty;
    if (!st.member || !l) return clear(loyaltyBox);
    const options = [
      el('option', { value: '' }, '— Không đổi thưởng —'),
      ...l.rewards.map((r) =>
        el(
          'option',
          { value: `POINTS:${r.rewardId}`, disabled: !r.affordable, selected: st.reward?.rewardId === r.rewardId },
          `${r.name} — ${r.pointsCost} điểm${r.affordable ? '' : ' (chưa đủ)'}`,
        ),
      ),
      ...l.stampCards
        .filter((c) => c.rewardsAvailable > 0)
        .map((c) =>
          el(
            'option',
            { value: `STAMP:${c.programId}`, selected: st.reward?.programId === c.programId },
            `Tặng 1 món — ${c.name} (${c.rewardsAvailable} lượt)`,
          ),
        ),
    ];
    const rewardSel = el('select', { class: 'input', 'aria-label': 'Đổi thưởng' }, options);
    rewardSel.addEventListener('change', () => pickReward(rewardSel.value));
    clear(
      loyaltyBox,
      el(
        'div',
        { class: 'loyalty-info small' },
        el('strong', {}, `${l.points} điểm`),
        l.stampCards.map((c) => el('div', {}, `🎟 ${c.name}: ${c.text}`)),
      ),
      l.rewards.length || l.stampCards.some((c) => c.rewardsAvailable > 0) ? el('div', { class: 'row' }, el('label', {}, 'Đổi thưởng'), rewardSel) : null,
      l.vouchers.length
        ? el(
            'div',
            { class: 'row wrap' },
            l.vouchers.map((v) =>
              el(
                'button',
                {
                  class: `btn btn-sm ${st.voucherCode === v.code ? 'btn-primary' : ''}`,
                  type: 'button',
                  onclick: () => applyVoucher(st.voucherCode === v.code ? null : v.code),
                },
                `🎫 ${v.code} −${v.percent ? `${v.percent}%` : `${Number(v.amount).toLocaleString('vi-VN')}đ`}`,
              ),
            ),
          )
        : null,
    );
  }

  async function checkVoucher() {
    const code = voucherInput.value.trim();
    if (!code) return applyVoucher(null);
    try {
      const r = await staffApi('/api/vouchers/validate', { method: 'POST', body: { code, memberId: st.member?.memberId ?? null } });
      if (!r.valid) return clear(voucherMsg, el('span', { class: 'field-error' }, r.message));
      applyVoucher(code);
    } catch (err) {
      clear(voucherMsg, el('span', { class: 'field-error' }, errorMessage(err)));
    }
  }
  voucherInput.addEventListener('keydown', (e) => e.key === 'Enter' && checkVoucher());

  function renderMember() {
    const m = st.member;
    if (m) {
      clear(
        memberBox,
        el(
          'div',
          { class: 'row between member-on' },
          el('span', {}, '⭐ ', el('strong', {}, m.fullName), ` · ${m.tierName} ${m.discountPercent}%`, m.firstOrderDiscount ? ' · đơn đầu' : ''),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => setMember(null) }, 'Gỡ'),
        ),
      );
    } else {
      clear(memberBox, el('div', { class: 'row' }, phone, el('button', { class: 'btn btn-sm', type: 'button', onclick: lookup }, 'Tra cứu')));
    }
  }
  phone.addEventListener('keydown', (e) => e.key === 'Enter' && lookup());
  renderMember();

  const valueInput = value;
  const manualRow = el('div', { class: 'row' }, value, kind, reason);
  const node = el(
    'details',
    { class: 'billing' },
    el('summary', {}, 'Hội viên · giảm giá · voucher'),
    el(
      'div',
      { class: 'stack' },
      el('label', {}, 'Hội viên (SĐT)'),
      memberBox,
      msg,
      loyaltyBox,
      el('label', {}, 'Voucher'),
      el('div', { class: 'row' }, voucherInput, el('button', { class: 'btn btn-sm', type: 'button', onclick: checkVoucher }, 'Áp mã'), voucherMsg),
      el('label', {}, 'Giảm giá tay'),
      manualRow,
      approvalBox,
      earnNote,
    ),
  );

  return {
    node,
    /** Hội viên của phiên (server trả) — hiển thị khi mở drawer. */
    showMember(m) {
      const same = st.member?.memberId === m?.memberId;
      st.member = m;
      st.memberId = m ? m.memberId : undefined;
      renderMember();
      if (!same) {
        st.reward = null;
        st.voucherCode = null;
        loadLoyalty();
      }
      if (m) node.open = true;
    },
    /** Điểm / tem lượt này sẽ tích (server tính từ cùng bộ pricing). */
    showEarn(totals) {
      const stamps = (totals?.stampsEarned ?? []).reduce((s, x) => s + x.stamps, 0);
      earnNote.textContent = st.member && totals ? `Lượt này tích +${totals.pointsEarned ?? 0} điểm${stamps ? `, +${stamps} tem` : ''}` : '';
    },
    setApproval(needed) {
      approvalBox.hidden = !needed;
      if (needed) node.open = true;
    },
    body() {
      const v = Number(String(value.value).replace(',', '.'));
      const manual = v > 0 ? { manualDiscount: { kind: kind.value, value: v }, manualReason: reason.value.trim() || null } : {};
      const approval = !approvalBox.hidden && adminUser.value ? { adminUsername: adminUser.value.trim(), adminPassword: adminPass.value } : {};
      const loyalty = { ...(st.voucherCode ? { voucherCode: st.voucherCode } : {}), ...(st.reward ? { reward: st.reward } : {}) };
      return { ...(st.memberId !== undefined ? { memberId: st.memberId } : {}), ...(st.reward ? {} : manual), ...approval, ...loyalty };
    },
    reset() {
      value.value = '';
      reason.value = '';
      adminUser.value = '';
      adminPass.value = '';
      approvalBox.hidden = true;
      phone.value = '';
      clear(msg);
      st.member = null;
      st.memberId = undefined;
      st.reward = null;
      st.voucherCode = null;
      st.loyalty = null;
      voucherInput.value = '';
      clear(voucherMsg);
      earnNote.textContent = '';
      manualRow.classList.remove('disabled');
      renderMember();
      renderLoyalty();
      onMember?.(null);
    },
  };
}
