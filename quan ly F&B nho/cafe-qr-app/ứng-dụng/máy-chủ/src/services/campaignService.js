// FEATURE-037 Chiến dịch theo phân khúc (ADR-006 D-29): phân khúc → xem trước số người → chiến dịch (nội dung có {name} {voucher}
// {expires}) → chạy ngay / hẹn giờ (job campaigns-due). Mỗi người một voucher riêng (CAMPAIGN). Tôn trọng OptOut; một người
// tối đa 1 tin / campaign.min_days_between ngày (bỏ qua có lý do). Kênh EXPORT (CSV, SĐT đầy đủ chỉ trong file tải về — có nhật ký);
// ZALO_OA qua channels/zaloOa.js khi có token; SMS chưa hỗ trợ.
import crypto from 'node:crypto';
import * as zaloOa from '../channels/zaloOa.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as auditRepo from '../repositories/auditRepo.js';
import * as campaignRepo from '../repositories/campaignRepo.js';
import { maskName, maskPhone } from './memberService.js';
import { getSettings } from './settingsService.js';

const fmtDate = (d) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/');
const localPhone = (phone) => (phone?.startsWith('+84') ? `0${phone.slice(3)}` : phone);

/** Thay {name} {voucher} {expires} trong nội dung. */
export function render(template, { name, voucher }) {
  return template
    .replaceAll('{name}', name ?? '')
    .replaceAll('{voucher}', voucher ? `${voucher.code} (giảm ${voucher.percent}%)` : '')
    .replaceAll('{expires}', voucher ? fmtDate(voucher.expiresAt) : '')
    .trim();
}

// ---- Phân khúc ----
export const segments = () => campaignRepo.segments();
export async function saveSegment(id, body, user) {
  const s = await campaignRepo.saveSegment(id, body, user.userId);
  if (!s) throw notFound('Không tìm thấy phân khúc');
  return s;
}
export async function removeSegment(id) {
  const r = await campaignRepo.deleteSegment(id);
  if (r === 'IN_USE') throw conflict('IN_USE', 'Phân khúc đang được chiến dịch sử dụng');
  if (!r) throw notFound('Không tìm thấy phân khúc');
  return r;
}

/** Xem trước: số người nhận được (đã loại OptOut), số bị loại vì từ chối, số đang trong thời gian nghỉ 7 ngày, 20 người mẫu (che). */
export async function preview(rule) {
  const { members, optedOut } = await campaignRepo.members(rule);
  const { campaignMinDaysBetween: days } = await getSettings();
  const cutoff = Date.now() - days * 86400e3;
  return {
    count: members.length,
    optedOut,
    recentlyContacted: members.filter((m) => m.lastContactedAt && new Date(m.lastContactedAt).getTime() > cutoff).length,
    sample: members
      .slice(0, 20)
      .map((m) => ({ memberId: m.memberId, maskedName: maskName(m.fullName), phone: maskPhone(m.phone), tierName: m.tierName, visitCount: m.visitCount })),
  };
}

// ---- Chiến dịch ----
function assertChannel(channel) {
  if (channel === 'SMS') throw badRequest('CHANNEL_NOT_SUPPORTED', 'Kênh SMS chưa được hỗ trợ — dùng Xuất danh sách (CSV) hoặc Zalo OA');
  if (channel === 'ZALO_OA' && !zaloOa.configured())
    throw badRequest('CHANNEL_NOT_CONFIGURED', 'Chưa cấu hình Zalo OA (ZALO_OA_TOKEN) — dùng Xuất danh sách (CSV)');
}

export const campaigns = () => campaignRepo.campaigns();

export async function get(id) {
  const c = await campaignRepo.campaign(id);
  if (!c) throw notFound('Không tìm thấy chiến dịch');
  const [deliveries, stats] = await Promise.all([campaignRepo.deliveries(id), campaignRepo.effectiveness(id)]);
  return {
    ...c,
    effectiveness: stats,
    deliveries: deliveries.map((d) => ({ ...d, phone: maskPhone(d.phone), fullName: maskName(d.fullName) })),
  };
}

export async function create(body, user) {
  assertChannel(body.channel);
  if (!(await campaignRepo.segment(body.segmentId))) throw notFound('Không tìm thấy phân khúc');
  return campaignRepo.createCampaign(body, user.userId);
}

export async function update(id, body) {
  assertChannel(body.channel);
  if (!(await campaignRepo.updateCampaign(id, body))) throw conflict('CAMPAIGN_LOCKED', 'Chiến dịch đã chạy — không sửa được');
  return campaignRepo.campaign(id);
}

export async function remove(id) {
  if (!(await campaignRepo.deleteCampaign(id))) throw conflict('CAMPAIGN_LOCKED', 'Chỉ xóa được chiến dịch chưa chạy');
  return 'DELETED';
}

/** Chạy chiến dịch (nút "Chạy ngay" hoặc job). Một tiến trình giành được quyền chạy; chạy lại không gửi trùng. */
export async function run(id) {
  const c = await campaignRepo.campaign(id);
  if (!c) throw notFound('Không tìm thấy chiến dịch');
  if (!(await campaignRepo.claim(id))) throw conflict('CAMPAIGN_NOT_RUNNABLE', 'Chiến dịch đang chạy hoặc đã chạy xong');
  try {
    assertChannel(c.channel);
    const seg = await campaignRepo.segment(c.segment.segmentId);
    const { members } = await campaignRepo.members(seg.rule);
    const { campaignMinDaysBetween: days } = await getSettings();
    const cutoff = Date.now() - days * 86400e3;
    const result = { delivered: 0, skipped: 0, failed: 0 };
    for (const m of members) {
      if (m.lastContactedAt && new Date(m.lastContactedAt).getTime() > cutoff) {
        await campaignRepo.deliver({ campaignId: id, memberId: m.memberId, status: 'SKIPPED', error: `Đã nhận tin trong ${days} ngày gần đây` });
        result.skipped += 1;
        continue;
      }
      const voucher = c.voucherPercent
        ? {
            code: `CD${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            percent: c.voucherPercent,
            minOrderAmount: c.voucherMinOrder,
            expiresAt: new Date(Date.now() + c.voucherDays * 86400e3),
          }
        : null;
      let status = 'EXPORTED';
      let error = null;
      if (c.channel === 'ZALO_OA') {
        const sent = await zaloOa.send({ phone: localPhone(m.phone), text: render(c.messageTemplate, { name: m.fullName, voucher }) });
        status = sent.ok ? 'SENT' : 'FAILED';
        error = sent.ok ? null : sent.error;
      }
      const d = await campaignRepo.deliver({ campaignId: id, memberId: m.memberId, status, error, voucher: status === 'FAILED' ? null : voucher });
      if (!d.created) continue;
      if (status === 'FAILED') result.failed += 1;
      else result.delivered += 1;
    }
    await campaignRepo.finish(id, 'DONE');
    return { ...(await campaignRepo.campaign(id)), result };
  } catch (err) {
    await campaignRepo.finish(id, 'FAILED', err.message);
    throw err;
  }
}

/** Job: chạy các chiến dịch đã đến giờ hẹn. */
export async function runDue() {
  const ids = await campaignRepo.dueCampaigns();
  const done = [];
  for (const id of ids) {
    try {
      await run(id);
      done.push(id);
    } catch {
      /* lỗi đã ghi vào chiến dịch (FAILED) */
    }
  }
  return { ran: done.length, ids: done };
}

/** CSV danh sách gửi (kênh EXPORT): SĐT đầy đủ → ghi nhật ký thao tác (ai tải, lúc nào, bao nhiêu người). */
export async function exportRows(id, req) {
  const c = await campaignRepo.campaign(id);
  if (!c) throw notFound('Không tìm thấy chiến dịch');
  const rows = (await campaignRepo.deliveries(id)).filter((d) => d.status === 'EXPORTED' || d.status === 'SENT');
  await auditRepo.insert({
    userId: req.user.userId,
    userName: req.user.fullName,
    role: req.user.role,
    action: 'campaigns.export',
    entity: 'Campaign',
    entityId: String(id),
    afterJson: JSON.stringify({ rows: rows.length, channel: c.channel }),
    ip: (req.ip || '').slice(0, 45) || null,
    userAgent: (req.get('user-agent') || '').slice(0, 200) || null,
  });
  return {
    campaign: c,
    header: ['Họ tên', 'SĐT', 'Hạng', 'Mã voucher', 'Hạn dùng', 'Nội dung tin nhắn'],
    rows: rows.map((d) => [
      d.fullName,
      localPhone(d.phone),
      d.tierName,
      d.voucher?.code ?? '',
      d.voucher ? fmtDate(d.voucher.expiresAt) : '',
      render(c.messageTemplate, { name: d.fullName, voucher: d.voucher }),
    ]),
  };
}

export const setOptOut = async (memberId, optOut) => {
  if (!(await campaignRepo.setOptOut(memberId, optOut))) throw notFound('Không tìm thấy hội viên');
  return { memberId, optOut };
};
