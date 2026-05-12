/** UC004 / UC005 — hằng số & helper gọi API json-server */

export const API = 'http://localhost:5000';

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

export const LOG_PREFIX = '[UC004/UC005]';
export const REJECT_REASON_MIN = 10;
export const ADJUSTMENT_NOTE_MIN = 10;
export const RESUBMIT_NOTE_MIN = 10;
/** Theo Feature5_UC005.md FR5-013 (30 ngày kể từ phê duyệt) */
export const LISTING_APPROVAL_VALID_DAYS = 30;

export function readSessionUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return { id: '', name: 'Khách', role: 'guest', email: '', pos_name: null, pos_id: null };
    const u = JSON.parse(raw);
    let role = u.role || 'sales';
    if (role === 'pos') role = 'pos_manager';
    if (role === 'mkt') role = 'marketing';
    return { ...u, role };
  } catch {
    return { id: '', name: 'Khách', role: 'guest', email: '', pos_name: null, pos_id: null };
  }
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
  if (role === 'admin') return true;
  if (role === 'sales') {
    return property && property.createdBy_id === user.id;
  }
  if (role === 'marketing') {
    if (!user.pos_name) return true;
    return property && property.pos_name === user.pos_name;
  }
  return false;
}

export function posScopedProperty(property, user) {
  if (user.role === 'admin') return true;
  return property && property.pos_name === user.pos_name;
}

export async function postAuditLog(payload) {
  const body = {
    timestamp: new Date().toISOString(),
    action: payload.actionText,
    entityId: payload.listingId,
    user: payload.userName,
    user_id: payload.userId,
    property_id: payload.propertyId,
    old_status: payload.oldStatus,
    new_status: payload.newStatus,
    reason: payload.reason,
    detail: payload.detail,
  };
  await fetch(`${API}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

/** Tiêu đề tin gợi ý từ dữ liệu tài sản (đồng bộ luồng Soạn tin đăng). */
export function buildListingTitleFromProperty(prop) {
  if (!prop || typeof prop !== 'object') return '';
  const priceText =
    prop.price_display || `${Number(prop.price || 0).toLocaleString('en-US')} ${prop.priceUnit || 'VNĐ'}`;
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
export function buildListingDescriptionFromProperty(prop) {
  if (!prop || typeof prop !== 'object') return '';
  const priceText =
    prop.price_display || `${Number(prop.price || 0).toLocaleString('en-US')} ${prop.priceUnit || 'VNĐ'}`;
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
