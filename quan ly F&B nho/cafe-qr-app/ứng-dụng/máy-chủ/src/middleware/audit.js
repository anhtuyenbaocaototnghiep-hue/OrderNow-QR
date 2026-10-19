// Nhật ký thao tác (FEATURE-035, ADR-006 D-26). Middleware gắn ở /api, chạy theo bảng luật:
//   - mọi request đổi dữ liệu dưới /api/admin/* (cấu hình menu/giá/BOM/khuyến mãi/hội viên/kho/tài khoản/cài đặt…);
//   - các route quầy đổi tiền / kho / ca (RULES bên dưới). Đơn thường (tiếp nhận, hoàn tất, gọi món) không ghi — quá nhiều, không nhạy cảm.
// Ảnh "trước" chụp trước khi xử lý; "sau" = dữ liệu gửi lên + kết quả trả về. Chỉ ghi khi thành công (sau commit, lúc response xong).
// Không bao giờ ghi mật khẩu / hash / token; số điện thoại bị che.
import * as auditRepo from '../repositories/auditRepo.js';
import { config } from '../config.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_JSON = 16000;

// Thực thể → bảng + khóa chính để chụp ảnh "trước"
const SNAP = {
  Payment: ['Payments', 'PaymentId'],
  Shift: ['Shifts', 'ShiftId'],
  CashTransaction: ['CashTransactions', 'CashTxnId'],
  Order: ['Orders', 'OrderId'],
  OrderItem: ['OrderItems', 'OrderItemId'],
  Ingredient: ['Ingredients', 'IngredientId'],
  User: ['Users', 'UserId'],
  MenuItem: ['MenuItems', 'MenuItemId'],
  Category: ['Categories', 'CategoryId'],
  Promotion: ['Promotions', 'PromotionId'],
  Member: ['Members', 'MemberId'],
  Table: ['Tables', 'TableId'],
  ModifierGroup: ['ModifierGroups', 'GroupId'],
  MenuSchedule: ['MenuSchedules', 'ScheduleId'],
  Supplier: ['Suppliers', 'SupplierId'],
  PurchaseOrder: ['PurchaseOrders', 'PoId'],
  Stocktake: ['Stocktakes', 'StocktakeId'],
  Lot: ['IngredientLots', 'LotId'],
  Attendance: ['Attendance', 'AttId'],
  Roster: ['Rosters', 'RosterId'],
  FixedCost: ['FixedCosts', 'CostId'],
  CashCategory: ['CashCategories', 'CategoryId'],
  Reward: ['RewardCatalog', 'RewardId'],
  StampProgram: ['StampPrograms', 'ProgramId'],
  Segment: ['Segments', 'SegmentId'],
  Campaign: ['Campaigns', 'CampaignId'],
};

// Đoạn đường dẫn /admin/<đoạn>/… → thực thể
const ADMIN_ENTITY = {
  'menu-items': 'MenuItem',
  categories: 'Category',
  ingredients: 'Ingredient',
  users: 'User',
  tables: 'Table',
  promotions: 'Promotion',
  combos: 'MenuItem',
  members: 'Member',
  'member-tiers': 'MemberTier',
  'modifier-groups': 'ModifierGroup',
  'menu-schedules': 'MenuSchedule',
  suppliers: 'Supplier',
  'purchase-orders': 'PurchaseOrder',
  stocktakes: 'Stocktake',
  'stock-receipts': 'StockReceipt',
  lots: 'Lot',
  units: 'Unit',
  rosters: 'Roster',
  'fixed-costs': 'FixedCost',
  'cash-categories': 'CashCategory',
  settings: 'Settings',
  suggestions: 'Suggestion',
  jobs: 'Job',
  attendance: 'Attendance',
  rewards: 'Reward',
  'stamp-programs': 'StampProgram',
  vouchers: 'Voucher',
  segments: 'Segment',
  campaigns: 'Campaign',
};

// Route quầy (đường dẫn sau /api): [method, regex (nhóm 1 = id), action, entity]
const RULES = [
  ['POST', /^\/payments\/(\d+)\/refunds$/, 'payment.refund', 'Payment'],
  ['POST', /^\/sessions\/([0-9a-f-]{36})\/settle$/i, 'session.settle', 'Session'],
  ['POST', /^\/splits\/(\d+)\/settle$/, 'split.settle', 'SessionSplit'],
  ['POST', /^\/orders\/takeaway$/, 'order.takeaway', 'Order'],
  ['POST', /^\/orders\/(\d+)\/cancel$/, 'order.cancel', 'Order'],
  ['POST', /^\/order-items\/(\d+)\/void$/, 'order.item-void', 'OrderItem'], // F-046
  ['POST', /^\/orders\/(\d+)\/void$/, 'order.void', 'Order'],
  ['POST', /^\/sessions\/([0-9a-f-]{36})\/cancel$/i, 'session.cancel', 'Session'],
  ['POST', /^\/shifts\/open$/, 'shift.open', 'Shift'],
  ['POST', /^\/shifts\/(\d+)\/close$/, 'shift.close', 'Shift'],
  ['PUT', /^\/store$/, 'store.update', 'Settings'],
  ['POST', /^\/cash-transactions$/, 'cash.create', 'CashTransaction'],
  ['POST', /^\/cash-transactions\/(\d+)\/approve$/, 'cash.approve', 'CashTransaction'],
  ['POST', /^\/cash-transactions\/(\d+)\/reject$/, 'cash.reject', 'CashTransaction'],
  ['PUT', /^\/cash-transactions\/(\d+)\/receipt$/, 'cash.receipt', 'CashTransaction'],
  ['POST', /^\/prep\/batches$/, 'prep.batch', 'PrepBatch'],
  ['POST', /^\/waste$/, 'waste.create', 'WasteLog'],
  ['POST', /^\/lots\/(\d+)\/write-off$/, 'lot.write-off', 'Lot'],
  ['POST', /^\/receiving\/purchase-orders\/(\d+)\/receive$/, 'po.receive', 'PurchaseOrder'],
  ['POST', /^\/ops\/ingredients\/(\d+)\/adjust$/, 'inventory.adjust', 'Ingredient'],
  ['POST', /^\/ops\/stocktakes$/, 'stocktake.create', 'Stocktake'],
  ['PUT', /^\/ops\/stocktakes\/(\d+)\/lines$/, 'stocktake.lines', 'Stocktake'],
  ['POST', /^\/ops\/stocktakes\/(\d+)\/post$/, 'stocktake.post', 'Stocktake'],
  ['DELETE', /^\/ops\/stocktakes\/(\d+)$/, 'stocktake.delete', 'Stocktake'],
  ['POST', /^\/attendance$/, 'attendance.create', 'Attendance'],
  ['PUT', /^\/attendance\/(\d+)$/, 'attendance.update', 'Attendance'],
];

const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Tìm luật cho request: { action, entity, entityId } hoặc null. */
export function matchRule(method, path) {
  if (!MUTATING.has(method)) return null;
  for (const [m, re, action, entity] of RULES) {
    const hit = m === method && re.exec(path);
    if (hit) return { action, entity, entityId: hit[1] ?? null };
  }
  if (/\/preview$/.test(path)) return null; // xem trước (phân khúc, chia bill…) không đổi dữ liệu
  const admin = /^\/admin\/([a-z-]+)(?:\/([^/]+))?(?:\/([a-z-]+))?/.exec(path);
  if (!admin) return null;
  const [, seg, id, sub] = admin;
  // id là số; riêng đơn vị tính / job dùng mã chữ (PUT /admin/units/th%C3%B9ng, POST /admin/jobs/prep-stats/run)
  const isId = id !== undefined && (/^\d+$/.test(id) || ['units', 'jobs'].includes(seg));
  const verb = sub ?? (id !== undefined && !isId ? id : VERB[method]);
  return { action: `${seg}.${verb}`.slice(0, 60), entity: ADMIN_ENTITY[seg] ?? seg.slice(0, 40), entityId: isId ? decode(id) : null };
}

const SECRET_KEY = /pass(word)?|hash|token|secret|otp/i;
const PHONE_KEY = /phone/i;

/** Bỏ khóa nhạy cảm (đệ quy), che số điện thoại. */
export function sanitize(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) continue;
    if (PHONE_KEY.test(k) && typeof v === 'string' && v) {
      out[k] = `***${v.slice(-3)}`;
      continue;
    }
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

const toJson = (value) => {
  if (value === null || value === undefined) return null;
  const s = JSON.stringify(sanitize(value));
  return s.length > MAX_JSON ? JSON.stringify({ truncated: true, preview: s.slice(0, MAX_JSON - 100) }) : s;
};

async function before(rule) {
  if (rule.entity === 'Settings') return auditRepo.settingsSnapshot();
  const snap = SNAP[rule.entity];
  if (!snap || !/^\d+$/.test(rule.entityId ?? '')) return null;
  return auditRepo.snapshot(snap[0], snap[1], Number(rule.entityId));
}

const pending = new Set();
/** Test: chờ mọi dòng nhật ký đang ghi xong. */
export const flushAudit = () => Promise.all([...pending]);

export async function auditTrail(req, res, next) {
  const rule = req.get('authorization') ? matchRule(req.method, req.path) : null; // mọi route có nhật ký đều cần đăng nhập
  if (!rule) return next();
  let snapshot = null;
  try {
    snapshot = await before(rule);
  } catch {
    snapshot = null; // không chặn thao tác chỉ vì không chụp được ảnh trước
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    res.locals.auditBody = body;
    return json(body);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const result = res.locals.auditBody;
    const entityId = rule.entityId ?? idFrom(result);
    const isImage = Buffer.isBuffer(req.body);
    const p = auditRepo
      .insert({
        userId: req.user.userId,
        userName: req.user.fullName,
        role: req.user.role,
        action: rule.action,
        entity: rule.entity,
        entityId: entityId === null || entityId === undefined ? null : String(entityId).slice(0, 60),
        beforeJson: toJson(snapshot),
        afterJson: toJson({ input: isImage ? { image: `${req.body.length} bytes` } : (req.body ?? null), result: result ?? null }),
        ip: (req.ip || '').slice(0, 45) || null,
        userAgent: (req.get('user-agent') || '').slice(0, 200) || null,
      })
      .catch((err) => {
        if (config.env !== 'test') console.error('[audit] không ghi được nhật ký', err.message);
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  });
  next();
}

// Thao tác tạo mới: lấy id từ kết quả trả về (…Id đầu tiên ở cấp 1 hoặc cấp 2)
function idFrom(result) {
  if (!result || typeof result !== 'object') return null;
  for (const obj of [result, ...Object.values(result).filter((v) => v && typeof v === 'object' && !Array.isArray(v))]) {
    const key = Object.keys(obj).find((k) => /Id$/.test(k) && (typeof obj[k] === 'number' || typeof obj[k] === 'string'));
    if (key) return obj[key];
  }
  return null;
}
