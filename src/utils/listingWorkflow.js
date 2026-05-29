import { API_BASE_URL } from '../config';
/** UC004 / UC005 — hằng số & helper gọi API json-server */

import { formatPropertyPriceDisplay } from './permissions.js';
import { normalizeUserId, sameUserId } from './userId.js';

export const API = API_BASE_URL;

/** Chuẩn hóa hiển thị mã tin: chỉ khi đã là `LT-` + số hoặc chuỗi số thuần */
export function formatListingId(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const strict = s.match(/^LT-(\d+)$/i);
  if (strict) return `LT-${String(parseInt(strict[1], 10)).padStart(5, '0')}`;
  const onlyNum = s.match(/^(\d+)$/);
  if (onlyNum) return `LT-${String(parseInt(onlyNum[1], 10)).padStart(5, '0')}`;
  return s;
}

/** Lấy số thứ tự từ mã LT-00007 hoặc null nếu không parse được (vd. id json-server ngẫu nhiên) */
export function listingSequenceNumber(id) {
  if (!id || typeof id !== 'string') return null;
  const m = id.match(/^LT-(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Chuẩn hóa mã tài sản LS-##### (5 chữ số) */
export function formatPropertyId(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const strict = s.match(/^LS-(\d+)$/i);
  if (strict) return `LS-${String(parseInt(strict[1], 10)).padStart(5, '0')}`;
  const onlyNum = s.match(/^(\d+)$/);
  if (onlyNum) return `LS-${String(parseInt(onlyNum[1], 10)).padStart(5, '0')}`;
  return s;
}

export function propertySequenceNumber(id) {
  if (!id || typeof id !== 'string') return null;
  const m = id.match(/^LS-(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

export const LOG_PREFIX = '[Tin đăng]';

/**
 * Mã audit chuẩn (`action_type` trong `/logs`) — đồng bộ toàn demo + export F11.
 * Chuỗi `action` vẫn giữ mô tả đọc nhanh (có thể có tiền tố `[F2]`… `[UC006]`).
 */
export const AUDIT_ACTION_TYPE = {
  LISTING_APPROVE: 'LISTING_APPROVE',
  LISTING_APPROVE_WITH_ADJUSTMENT: 'LISTING_APPROVE_WITH_ADJUSTMENT',
  LISTING_REJECT: 'LISTING_REJECT',
  DUPLICATE_WARNING_ACK: 'DUPLICATE_WARNING_ACK',
  LISTING_SUBMIT_FOR_REVIEW: 'LISTING_SUBMIT_FOR_REVIEW',
  LISTING_RESUBMIT_FOR_REVIEW: 'LISTING_RESUBMIT_FOR_REVIEW',
  JOB_EXPIRY_REMINDER_SENT: 'JOB_EXPIRY_REMINDER_SENT',
  JOB_LISTING_AUTO_EXPIRED: 'JOB_LISTING_AUTO_EXPIRED',
  UC006_REQUEST_UNLIST: 'UC006_REQUEST_UNLIST',
  UC006_CANCEL_UNLIST_REQUEST: 'UC006_CANCEL_UNLIST_REQUEST',
  UC007_APPROVE_UNLIST: 'UC007_APPROVE_UNLIST',
  UC007_REJECT_UNLIST: 'UC007_REJECT_UNLIST',
  // F2 — tài sản (LS)
  PROPERTY_F2_ESIGN_CONFIRMED: 'PROPERTY_F2_ESIGN_CONFIRMED',
  PROPERTY_F2_SEND_POS_ESIGN: 'PROPERTY_F2_SEND_POS_ESIGN',
  PROPERTY_F2_UPDATE_REQUEST: 'PROPERTY_F2_UPDATE_REQUEST',
  PROPERTY_F2_DRAFT_UPDATE: 'PROPERTY_F2_DRAFT_UPDATE',
  PROPERTY_F2_DRAFT_SAVE: 'PROPERTY_F2_DRAFT_SAVE',
  PROPERTY_F2_SUBMIT_WAREHOUSE: 'PROPERTY_F2_SUBMIT_WAREHOUSE',
  // F2 mobile
  PROPERTY_F2_MOBILE_ESIGN_CONFIRMED: 'PROPERTY_F2_MOBILE_ESIGN_CONFIRMED',
  PROPERTY_F2_MOBILE_SEND_POS_ESIGN: 'PROPERTY_F2_MOBILE_SEND_POS_ESIGN',
  PROPERTY_F2_MOBILE_SUBMIT_WAREHOUSE: 'PROPERTY_F2_MOBILE_SUBMIT_WAREHOUSE',
  // F3 — GĐ POS duyệt tài sản
  PROPERTY_F3_APPROVE_UPDATE: 'PROPERTY_F3_APPROVE_UPDATE',
  PROPERTY_F3_APPROVE_WAREHOUSE: 'PROPERTY_F3_APPROVE_WAREHOUSE',
  PROPERTY_F3_REJECT_UPDATE: 'PROPERTY_F3_REJECT_UPDATE',
  PROPERTY_F3_REJECT_WAREHOUSE: 'PROPERTY_F3_REJECT_WAREHOUSE',
  // F8 — gỡ nguồn
  PROPERTY_F8_UNSOURCE_REQUEST: 'PROPERTY_F8_UNSOURCE_REQUEST',
  PROPERTY_F8_UNSOURCE_APPROVE: 'PROPERTY_F8_UNSOURCE_APPROVE',
  PROPERTY_F8_UNSOURCE_REJECT: 'PROPERTY_F8_UNSOURCE_REJECT',
  // F10 — IAM / POS (UC011–UC013)
  IAM_USER_LOCK: 'IAM_USER_LOCK',
  IAM_USER_UNLOCK: 'IAM_USER_UNLOCK',
  IAM_USER_INACTIVE: 'IAM_USER_INACTIVE',
  IAM_USER_ACTIVATE: 'IAM_USER_ACTIVATE',
  IAM_USER_CREATE: 'IAM_USER_CREATE',
  IAM_USER_UPDATE: 'IAM_USER_UPDATE',
  IAM_POS_CREATE: 'IAM_POS_CREATE',
  IAM_POS_UPDATE: 'IAM_POS_UPDATE',
  IAM_PERMISSION_MATRIX_SAVE: 'IAM_PERMISSION_MATRIX_SAVE',
  // F1 — UC001 Đăng nhập & MFA (SRS §2.2.1 AC1-012)
  AUTH_CREDENTIALS_FAILED: 'AUTH_CREDENTIALS_FAILED',
  AUTH_CREDENTIALS_BLOCKED: 'AUTH_CREDENTIALS_BLOCKED',
  AUTH_MFA_CHALLENGE_CREATED: 'AUTH_MFA_CHALLENGE_CREATED',
  AUTH_OTP_ISSUED: 'AUTH_OTP_ISSUED',
  AUTH_OTP_RESENT: 'AUTH_OTP_RESENT',
  AUTH_MFA_VERIFY_SUCCESS: 'AUTH_MFA_VERIFY_SUCCESS',
  AUTH_MFA_VERIFY_FAILED: 'AUTH_MFA_VERIFY_FAILED',
  AUTH_SESSION_ESTABLISHED: 'AUTH_SESSION_ESTABLISHED',
  AUTH_ACCOUNT_TEMP_LOCKED: 'AUTH_ACCOUNT_TEMP_LOCKED',
  AUTH_PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_BY_ADMIN: 'AUTH_PASSWORD_RESET_BY_ADMIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  // F11 / misc demo
  AUDIT_EXPORT_RUN: 'AUDIT_EXPORT_RUN',
  MOBILE_AUDIT_GENERIC: 'MOBILE_AUDIT_GENERIC',
};
export const REJECT_REASON_MIN = 10;
export const ADJUSTMENT_NOTE_MIN = 10;
export const RESUBMIT_NOTE_MIN = 10;
/** Theo SRS UC005 / `LISTING_APPROVAL_VALID_DAYS` (30 ngày kể từ phê duyệt — iHouzz_SRS_Phan_II_Section_2.2.5_Feature5_UC005.md) */
export const LISTING_APPROVAL_VALID_DAYS = 30;

export function readSessionUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return { id: '', name: 'Khách', role: 'guest', email: '', pos_name: null, pos_id: null };
    const u = JSON.parse(raw);
    let role = u.role || 'sales';
    if (role === 'pos') role = 'pos_manager';
    if (role === 'mkt') role = 'marketing';
    const id = normalizeUserId(u.id) ?? u.id ?? '';
    return { ...u, id, role };
  } catch {
    return { id: '', name: 'Khách', role: 'guest', email: '', pos_name: null, pos_id: null };
  }
}

/** `storage` không kích hoạt trên tab vừa ghi `localStorage` — dùng sau login / đổi user. */
export const SESSION_CHANGED_EVENT = 'ihouzz-session-changed';

export function notifySessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
}

/** `entityId` UC001 — phân biệt tài khoản với LS-/LT- trên export F11. */
export function accountAuditEntityId(email) {
  const e = email == null ? '' : String(email).trim().toLowerCase();
  return e ? `ACCOUNT:${e}` : 'ACCOUNT';
}

/** UC001 demo — theo dõi idle (DashboardLayout). */
export const AUTH_SESSION_ACTIVITY_KEY = 'ihouzz_last_activity';
export const AUTH_SESSION_STARTED_KEY = 'ihouzz_session_started';

export function touchAuthSessionActivity() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(AUTH_SESSION_ACTIVITY_KEY, String(Date.now()));
  try {
    sessionStorage.removeItem('ihouzz_idle_warned');
  } catch {
    /* ignore */
  }
}

export function initAuthSessionActivity() {
  touchAuthSessionActivity();
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(AUTH_SESSION_STARTED_KEY, String(Date.now()));
}

export function clearAuthSessionActivityKeys() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_SESSION_ACTIVITY_KEY);
    sessionStorage.removeItem(AUTH_SESSION_STARTED_KEY);
    sessionStorage.removeItem('ihouzz_idle_warned');
  } catch {
    /* ignore */
  }
}

/** Idle tối đa phiên (SRS 60 phút). QA: `localStorage.setItem('ihouzz_demo_idle_ms', '120000')` (≥ 60000). */
export function readDemoIdleSessionMs() {
  try {
    const raw = localStorage.getItem('ihouzz_demo_idle_ms');
    const n = raw != null ? parseInt(String(raw), 10) : NaN;
    if (Number.isFinite(n) && n >= 60_000) return Math.min(n, 8 * 60 * 60 * 1000);
  } catch {
    /* ignore */
  }
  return 60 * 60 * 1000;
}

/** Khớp `listing.property_id` (id nội bộ hoặc mã LS-#####) với bản ghi `properties`. */
export function propertyMatchesExternalRef(prop, ref) {
  if (!prop || ref == null || ref === '') return false;
  const r = String(ref).trim();
  if (!r) return false;
  if (prop.id === r) return true;
  if (prop.propertyCode === r) return true;
  const normRef = formatPropertyId(r);
  if (!normRef || !/^LS-/i.test(normRef)) return false;
  const code = prop.propertyCode ? formatPropertyId(prop.propertyCode) : '';
  if (code && code === normRef) return true;
  return false;
}

/** Tin không còn coi là "đang hoạt động" — dùng BR-UC004-01 / cảnh báo trùng. */
export const INACTIVE_LISTING_STATUSES = ['Từ chối', 'Đã gỡ', 'Yêu cầu gỡ tin', 'Hết hạn'];

export function isActiveListingStatus(status) {
  return Boolean(status) && !INACTIVE_LISTING_STATUSES.includes(status);
}

export function listingMatchesPropertyRef(listing, propertyRef) {
  if (!listing || propertyRef == null || propertyRef === '') return false;
  const r = String(propertyRef).trim();
  const pid = String(listing.property_id ?? '').trim();
  if (pid === r) return true;
  const nr = formatPropertyId(r);
  const np = formatPropertyId(pid);
  return Boolean(nr && np && nr === np);
}

/** Tin đăng khác cùng LS- đang hoạt động (trừ tin đang thao tác). */
export function findActiveDuplicateListings(listings, propertyRef, excludeListingId = null) {
  return (listings || []).filter((l) => {
    if (excludeListingId != null && String(l.id) === String(excludeListingId)) return false;
    if (!listingMatchesPropertyRef(l, propertyRef)) return false;
    return isActiveListingStatus(l.listing_status);
  });
}

export function formatDateTimeVi(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function buildDuplicateListingWarningMessage({ propertyCode, duplicates, actionPrompt }) {
  const ls = formatPropertyId(propertyCode);
  const lines = [
    '⚠️ CẢNH BÁO TRÙNG LẶP TIN ĐĂNG',
    '',
    `Tài sản ${ls} đã có tin đăng đang hoạt động trên hệ thống.`,
    '',
    'Thông tin tin đang trùng:',
  ];
  duplicates.forEach((dup, idx) => {
    if (duplicates.length > 1) lines.push(`— Tin ${idx + 1} —`);
    lines.push(`• Mã tin đăng: ${formatListingId(dup.listingCode || dup.id)}`);
    lines.push(`• Người tạo tin: ${dup.createdBy || dup.createdBy_name || '—'}`);
    lines.push(`• Thời gian đăng: ${formatDateTimeVi(dup.createdAt)}`);
    lines.push(`• Thời gian hết hạn: ${formatDateTimeVi(dup.expiredAt)}`);
    lines.push(`• Trạng thái: ${dup.listing_status || '—'}`);
    lines.push('');
  });
  lines.push(actionPrompt || 'Bạn có chắc chắn muốn tiếp tục không?');
  return lines.join('\n');
}

export const DUPLICATE_FORCE_HEADER = 'X-Force-Duplicate';

/** Header cho POST/PATCH listing sau khi user xác nhận cảnh báo trùng. */
export function listingRequestHeaders(forceDuplicate = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (forceDuplicate) headers[DUPLICATE_FORCE_HEADER] = 'true';
  return headers;
}

/** Ghi audit khi user bấm OK dù có tin trùng (BR-UC004-01). */
export async function postDuplicateWarningAckAudit(audit, duplicates, propertyCode) {
  const dupCodes = duplicates.map((d) => formatListingId(d.listingCode || d.id)).join(', ');
  const detail = duplicates
    .map(
      (d) =>
        `${formatListingId(d.listingCode || d.id)}|creator:${d.createdBy || '—'}|posted:${d.createdAt || '—'}|expires:${d.expiredAt || '—'}`,
    )
    .join('; ');
  await postAuditLog({
    actionText: buildLogAction(
      'DUPLICATE_WARNING_ACK',
      audit.listingId || propertyCode || audit.propertyId,
      `${audit.screen || '—'} · ${audit.action || 'CONTINUE'}`,
    ),
    actionType: AUDIT_ACTION_TYPE.DUPLICATE_WARNING_ACK,
    listingId: audit.listingId || duplicates[0]?.id,
    userName: audit.userName,
    userId: audit.userId,
    propertyId: audit.propertyId || duplicates[0]?.property_id,
    oldStatus: duplicates.map((d) => d.listing_status).join(','),
    newStatus: 'ACK_CONTINUE',
    reason: `Xác nhận tiếp tục dù trùng tin: ${dupCodes}`,
    detail,
  });
}

/**
 * Cảnh báo mềm + audit (nếu có opts.audit).
 * @returns {{ ok: boolean, duplicates: object[], forceDuplicate: boolean }}
 */
export async function confirmDuplicateListingWarningAsync(opts) {
  const dups = findActiveDuplicateListings(opts.listings, opts.propertyRef, opts.excludeListingId);
  if (dups.length === 0) return { ok: true, duplicates: [], forceDuplicate: false };
  const msg = buildDuplicateListingWarningMessage({
    propertyCode: opts.propertyCode,
    duplicates: dups,
    actionPrompt: opts.actionPrompt,
  });
  const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
  if (ok && opts.audit) {
    try {
      await postDuplicateWarningAckAudit(opts.audit, dups, opts.propertyCode);
    } catch (e) {
      console.warn('[DUPLICATE_WARNING_ACK] audit failed', e);
    }
  }
  return { ok, duplicates: dups, forceDuplicate: Boolean(ok) };
}

/** Cảnh báo mềm đồng bộ — dùng khi không cần audit. */
export function confirmDuplicateListingWarning(opts) {
  const dups = findActiveDuplicateListings(opts.listings, opts.propertyRef, opts.excludeListingId);
  if (dups.length === 0) return true;
  const msg = buildDuplicateListingWarningMessage({
    propertyCode: opts.propertyCode,
    duplicates: dups,
    actionPrompt: opts.actionPrompt,
  });
  return window.confirm(msg);
}

/** Xử lý 409 DUPLICATE_LISTING từ API — một lần confirm + audit rồi retry. */
export async function resolveDuplicateListing409(response, retryFn, opts) {
  if (response.status !== 409) return response;
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (payload.code !== 'DUPLICATE_LISTING') return response;
  const dupsFromServer = (payload.duplicates || []).map((d) => ({
    id: d.listingId,
    listingCode: d.listingId,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    expiredAt: d.expiredAt,
    listing_status: d.listing_status,
    property_id: payload.propertyRef,
  }));
  const listings = opts.listings?.length
    ? opts.listings
    : dupsFromServer;
  const confirmOpts = {
    listings,
    propertyRef: opts.propertyRef,
    propertyCode: opts.propertyCode || payload.propertyRef,
    excludeListingId: opts.excludeListingId,
    actionPrompt: opts.actionPrompt,
    audit: opts.audit,
  };
  if (dupsFromServer.length) {
    confirmOpts.listings = [
      ...listings,
      ...dupsFromServer.filter((d) => !listings.some((l) => String(l.id) === String(d.id))),
    ];
  }
  const { ok } = await confirmDuplicateListingWarningAsync(confirmOpts);
  if (!ok) return null;
  return retryFn(true);
}

export function normalizeRole(raw) {
  let r = raw || 'sales';
  if (r === 'pos') r = 'pos_manager';
  if (r === 'mkt') r = 'marketing';
  return r;
}

/** Marketing: nếu có pos_name thì chỉ bài thuộc POS đó; không gán POS → toàn hệ thống */
export function listingVisibleForActor(listing, property, user) {
  const role = user.role;
  if (role === 'admin' || role === 'marketing') return true;
  if (role === 'sales') {
    return property && sameUserId(property.createdBy_id, user.id);
  }
  return false;
}

export function posScopedProperty(property, user) {
  if (user.role === 'admin') return true;
  return property && property.pos_name === user.pos_name;
}

/**
 * Ghi `/logs` chuẩn demo — mọi entity (listing, property, user, POS, SYSTEM).
 * @param {object} p
 * @param {string} p.action
 * @param {string} [p.actionType] — `AUDIT_ACTION_TYPE.*`
 * @param {string|number} [p.entityId] — `entityId` trong json-server (bắt buộc trừ khi rỗng → lỗi nên luôn truyền)
 * @param {string|number} [p.listing_id] — Chỉ khi liên quan bài đăng
 * @param {string|number} [p.property_id]
 * @param {string} [p.user]
 * @param {string|number} [p.user_id]
 * @param {string} [p.old_status] [p.new_status] [p.reason] [p.detail]
 * @param {object} [p.modified_fields]
 * @param {object} [p.extra] — Gộp thêm field legacy (vd. F3 `changes`)
 */
export async function postEntityAudit(p) {
  const entityId = p.entityId != null && p.entityId !== '' ? String(p.entityId) : '';
  const body = {
    timestamp: new Date().toISOString(),
    action: p.action,
    entityId,
    user: p.user ?? 'System',
    user_id: p.user_id != null && p.user_id !== '' ? String(p.user_id) : p.userId != null && p.userId !== '' ? String(p.userId) : '',
  };
  const at = p.actionType || p.action_type;
  if (at) body.action_type = at;
  if (p.listing_id != null && p.listing_id !== '') body.listing_id = String(p.listing_id);
  if (p.property_id != null && p.property_id !== '') body.property_id = p.property_id;
  if (p.old_status != null) body.old_status = p.old_status;
  if (p.new_status != null) body.new_status = p.new_status;
  if (p.reason != null) body.reason = p.reason;
  if (p.detail != null) body.detail = p.detail;
  if (p.modified_fields != null && typeof p.modified_fields === 'object') body.modified_fields = p.modified_fields;
  if (p.extra && typeof p.extra === 'object') Object.assign(body, p.extra);
  await fetch(`${API}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Ghi audit **bài đăng** (UC004/005/006/007) — bọc `postEntityAudit`.
 * @param {object} payload
 * @param {string} [payload.entityId] — Nếu set: `entityId` khác `listingId` (hiếm). Mặc định = `listingId`.
 */
export async function postAuditLog(payload) {
  const listingIdStr = payload.listingId != null && payload.listingId !== '' ? String(payload.listingId) : '';
  const entityOverride = payload.entityId != null && payload.entityId !== '' ? String(payload.entityId) : '';
  const entityIdFinal = entityOverride || listingIdStr;
  await postEntityAudit({
    action: payload.actionText,
    actionType: payload.actionType,
    entityId: entityIdFinal,
    listing_id: listingIdStr || undefined,
    user: payload.userName,
    user_id: payload.userId,
    property_id: payload.propertyId,
    old_status: payload.oldStatus,
    new_status: payload.newStatus,
    reason: payload.reason,
    detail: payload.detail,
    modified_fields: payload.modifiedFields,
  });
}

export async function postInAppNotification({ propertyId, listingId, recipient, message, type }) {
  await fetch(`${API}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      propertyId: propertyId || listingId,
      listingId: listingId || null,
      recipient,
      message,
      type: type || 'info',
      createdAt: new Date().toISOString(),
      isRead: false,
    }),
  });
}

export function buildLogAction(verb, listingId, extra) {
  const x = extra ? ` · ${extra}` : '';
  return `${LOG_PREFIX} ${verb} — ${listingId}${x}`;
}

/** Tiêu đề + mô tả gợi ý — tôn trọng mask giá POS khác khi soạn tin (F4). */
export function buildListingCopyFromProperty(prop, actor) {
  const role = actor?.role || 'sales';
  const posId = actor?.posId ?? actor?.pos_id ?? null;
  const posName = actor?.posName ?? actor?.pos_name ?? '';
  const priceText = formatPropertyPriceDisplay(role, prop, posId, posName);
  return {
    title: buildListingTitleFromProperty(prop, { priceText }),
    description: buildListingDescriptionFromProperty(prop, { priceText }),
  };
}

/** Tiêu đề tin gợi ý từ dữ liệu tài sản (đồng bộ luồng Soạn tin đăng). */
export function buildListingTitleFromProperty(prop, opts = {}) {
  if (!prop || typeof prop !== 'object') return '';
  const priceText =
    opts.priceText ??
    (prop.price_display || `${Number(prop.price || 0).toLocaleString('en-US')} ${prop.priceUnit || 'VNĐ'}`);
  const addressParts = prop.address ? prop.address.split(',').map((s) => s.trim()) : [];
  const loc =
    addressParts.length >= 2
      ? `${addressParts[addressParts.length - 2]}, ${addressParts[addressParts.length - 1]}`
      : prop.address || '';
  const typeLabel = prop.type === 'Bán' ? 'Bán' : 'Cho thuê';
  const pt = prop.propertyType || 'BĐS';
  const area = Number(prop.area);
  const areaTxt = Number.isFinite(area) ? `${area.toLocaleString('en-US')}m²` : '';
  const pn = prop.bedrooms != null ? `${prop.bedrooms}PN` : '';
  return `${typeLabel} ${pt} ${areaTxt}${areaTxt && loc ? ' – ' : ''}${loc}${pn ? ' – ' + pn : ''} – ${priceText}`.replace(/\s+–\s+–/g, ' –').trim();
}

/** Mô tả tin kiểu iHouzz — gen từ tài sản (emoji + bullet, có thể chỉnh sau). */
export function buildListingDescriptionFromProperty(prop, opts = {}) {
  if (!prop || typeof prop !== 'object') return '';
  const priceText =
    opts.priceText ??
    (prop.price_display || `${Number(prop.price || 0).toLocaleString('en-US')} ${prop.priceUnit || 'VNĐ'}`);
  const addressParts = prop.address ? prop.address.split(',').map((s) => s.trim()) : [];
  const loc =
    addressParts.length >= 2
      ? `${addressParts[addressParts.length - 2]}, ${addressParts[addressParts.length - 1]}`
      : prop.address || '—';
  const area = Number(prop.area);
  const areaTxt = Number.isFinite(area) ? `${area.toLocaleString('en-US')} m²` : '—';
  const typeLine = prop.type === 'Bán' ? '🏠 Nhà cần bán' : '🏠 Nhà cho thuê';
  const pt = prop.propertyType || 'BĐS';
  const floor = prop.floor != null && prop.floor !== '' ? String(prop.floor) : '—';
  const road = prop.road_width != null && prop.road_width !== '' ? String(prop.road_width) : '—';
  const lines = [
    `${typeLine} · ${pt} tại ${loc}.`,
    `📐 Diện tích sử dụng: ${areaTxt}`,
    `🛏 ${prop.bedrooms ?? '—'} phòng ngủ | 🚿 ${prop.bathrooms ?? '—'} WC`,
    `🏢 Tầng: ${floor} | 🧭 Hướng: ${prop.direction || '—'}`,
    `✨ Hiện trạng: ${prop.condition || '—'} | 🛋️ Nội thất: ${prop.furniture || '—'}`,
    `📋 Nguồn hàng: ${prop.source || '—'} | ⚖️ Pháp lý: ${prop.legalStatus || prop.legal || '—'}`,
    `💰 Giá: ${priceText}`,
    '',
    prop.description ? `📝 Chi tiết thêm:\n${prop.description}` : '',
    '',
    '📞 Liên hệ xem nhà: cập nhật số điện thoại ở form bên dưới.',
    '',
    `#ihouzz #${prop.type === 'Bán' ? 'muaban' : 'chothue'} #${String(pt).replace(/\s+/g, '')}`,
  ];
  return lines.filter((x) => x !== '').join('\n');
}

const FALLBACK_PREVIEW_IMAGES = [
  'https://picsum.photos/seed/ihz-living-1/1200/800',
  'https://picsum.photos/seed/ihz-living-2/1200/800',
  'https://picsum.photos/seed/ihz-kitchen-1/1200/800',
  'https://picsum.photos/seed/ihz-bedroom-1/1200/800',
  'https://picsum.photos/seed/ihz-view-1/1200/800',
];

/** Gộp ảnh tin + ảnh kho + fallback (URL http), bỏ trùng. */
export function mergePreviewImageUrls(listing, property, minCount = 4) {
  const out = [];
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    const t = u.trim();
    if (!t) return;
    if (!/^https?:\/\//i.test(t)) return;
    if (!out.includes(t)) out.push(t);
  };
  const li = listing && Array.isArray(listing.images) ? listing.images : [];
  const pi = property && Array.isArray(property.images) ? property.images : [];
  li.forEach(push);
  pi.forEach(push);
  for (const f of FALLBACK_PREVIEW_IMAGES) {
    if (out.length >= minCount) break;
    push(f);
  }
  if (out.length === 0) return [...FALLBACK_PREVIEW_IMAGES];
  while (out.length < minCount) {
    const seed = `ihz-fill-${out.length}`;
    push(`https://picsum.photos/seed/${seed}/1200/800`);
  }
  return out.slice(0, 14);
}
