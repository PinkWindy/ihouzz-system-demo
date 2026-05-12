/**
 * Luồng Đầu chủ gửi yêu cầu cập nhật tài sản đã vào kho → GĐ POS duyệt / từ chối.
 * Dữ liệu nháp lưu ở `pending_update_payload`; cờ `update_request_status === 'Chờ duyệt cập nhật'`.
 */

export const UPDATE_REQUEST_PENDING = 'Chờ duyệt cập nhật';

/**
 * Phương án B: khóa chỉnh sửa kho (gửi pending) khi tài sản đang niêm yết công khai.
 * — Lv2 tài sản = Đang niêm yết, hoặc
 * — Có tin `listings` trạng thái Đã duyệt gắn cùng property_id (đồng bộ với F5).
 */
export function propertyHasLiveListingForUpdateLock(property, listings = []) {
  if (!property || typeof property !== 'object') return false;
  const lv2 = property.level2_status || property.statusLv2 || '';
  if (lv2 === 'Đang niêm yết') return true;
  const pid = property.id;
  if (pid == null || !Array.isArray(listings)) return false;
  return listings.some(
    (l) =>
      l &&
      String(l.property_id) === String(pid) &&
      l.listing_status === 'Đã duyệt',
  );
}

/** Các trường được phép đưa vào bản cập nhật chờ duyệt (không đụng id, POS, trạng thái kho). */
export const PENDING_UPDATE_KEYS = [
  'address',
  'type',
  'propertyType',
  'price',
  'priceUnit',
  'area',
  'bedrooms',
  'bathrooms',
  'direction',
  'condition',
  'source',
  'furniture',
  'floor',
  'legalStatus',
  'legal',
  'description',
  'images',
];

export function canRequestPropertyUpdate(property, userId, listings = []) {
  if (!property) return false;
  if (property.update_request_status === UPDATE_REQUEST_PENDING) return false;
  const lv1 = property.level1_status || property.statusLv1;
  if (!['Được duyệt', 'Được đảm bảo'].includes(lv1)) return false;
  if (userId && property.createdBy_id && property.createdBy_id !== userId) return false;
  if (propertyHasLiveListingForUpdateLock(property, listings)) return false;
  return true;
}

/** Form state cho modal «Gửi yêu cầu cập nhật» — đồng bộ F2 web & SalesMobile. */
export function initialPendingUpdateFormState(property) {
  if (!property || typeof property !== 'object') return null;
  return {
    address: property.address || '',
    type: property.type || 'Bán',
    propertyType: property.propertyType || 'Căn hộ chung cư',
    area: property.area != null ? String(property.area) : '',
    price: property.price != null ? Number(property.price).toLocaleString('en-US') : '',
    priceUnit: property.priceUnit || 'VNĐ',
    bedrooms: property.bedrooms != null ? String(property.bedrooms) : '',
    bathrooms: property.bathrooms != null ? String(property.bathrooms) : '',
    direction: property.direction || '',
    condition: property.condition || '',
    source: property.source || '',
    furniture: property.furniture || '',
    floor: property.floor != null ? String(property.floor) : '',
    legalStatus: property.legalStatus || property.legal || 'Sổ đỏ',
    description: property.description || '',
    images: Array.isArray(property.images) ? [...property.images] : [],
  };
}

function normalizeCompareValue(key, val) {
  if (key === 'floor') {
    if (val === '' || val == null) return null;
    const n = parseInt(String(val), 10);
    return Number.isFinite(n) ? n : val;
  }
  if (key === 'price' || key === 'area' || key === 'bedrooms' || key === 'bathrooms') {
    const n = Number(val);
    return Number.isFinite(n) ? n : val;
  }
  if (key === 'images') {
    return JSON.stringify(Array.isArray(val) ? val : []);
  }
  return val;
}

/** So sánh từng trường trong pending với bản ghi hiện tại → mảng thay đổi cho log. */
export function diffPropertyUpdate(current, pending) {
  const changes = [];
  if (!pending || typeof pending !== 'object') return changes;
  for (const key of PENDING_UPDATE_KEYS) {
    if (!(key in pending)) continue;
    const curRaw = key === 'legalStatus' ? (current.legalStatus ?? current.legal) : current[key];
    const a = normalizeCompareValue(key, curRaw);
    const b = normalizeCompareValue(key, pending[key]);
    const same = a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
    if (same) continue;
    changes.push({ field: key, old: curRaw, new: pending[key] });
  }
  return changes;
}

export function buildPriceDisplayFromFields({ price, priceUnit, type }) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '';
  const base = `${n.toLocaleString('en-US')} ${priceUnit || 'VNĐ'}`;
  if (type === 'Thuê' && priceUnit && !String(priceUnit).includes('tháng')) {
    return base;
  }
  return base;
}

/** Gộp pending đã duyệt vào bản ghi (chỉ các khóa được phép). Trả về object để PUT/PATCH. */
export function applyApprovedPendingToProperty(current, pending) {
  const next = { ...current };
  for (const k of PENDING_UPDATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(pending, k)) {
      next[k] = pending[k];
    }
  }
  if (next.legalStatus != null) next.legal = next.legalStatus;
  next.price_display = buildPriceDisplayFromFields(next);
  next.updatedAt = new Date().toISOString();
  next.pending_update_payload = null;
  next.update_request_status = null;
  next.update_requested_at = null;
  next.update_requested_by_id = null;
  next.update_requested_by = null;
  next.update_request_note = null;
  next.update_rejection_reason = null;
  next.update_rejected_at = null;
  next.update_rejected_by = null;
  return next;
}

export function pickPendingPayloadFromForm(form) {
  const out = {};
  for (const k of PENDING_UPDATE_KEYS) {
    if (form[k] !== undefined) out[k] = form[k];
  }
  return out;
}

/** json-server 1.x (milliparsec) giới hạn body JSON mặc định ~100KB — data URL ảnh vượt rất nhanh. */
export const JSON_SERVER_BODY_SAFE_BYTES = 95000;

export function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return String(value).length * 2;
  }
}

/**
 * Thay ảnh data: trong pending bằng URL ngắn (picsum) để PATCH qua json-server demo.
 * Giữ nguyên URL http(s) đã có.
 */
export function replaceDataImageUrlsForSmallPayload(images, propertyId) {
  if (!Array.isArray(images)) return [];
  const safeId = String(propertyId || 'p').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'p';
  return images.map((u, i) => {
    if (typeof u === 'string' && u.startsWith('data:image')) {
      return `https://picsum.photos/seed/ihz-${safeId}-${i}/1200/800`;
    }
    return u;
  });
}

/**
 * Trả về { pending, didSubstituteImages } — metaWithoutPending là các field PATCH ngoài pending_update_payload.
 */
export function shrinkPendingForJsonServer(metaWithoutPending, pending, propertyId, maxBytes = JSON_SERVER_BODY_SAFE_BYTES) {
  let next = pending;
  let didSubstitute = false;
  const measure = (pend) => estimateJsonBytes({ ...metaWithoutPending, pending_update_payload: pend });

  if (measure(next) <= maxBytes) {
    return { pending: next, didSubstituteImages: false };
  }
  next = {
    ...next,
    images: replaceDataImageUrlsForSmallPayload(next.images, propertyId),
  };
  didSubstitute = true;
  if (measure(next) <= maxBytes) {
    return { pending: next, didSubstituteImages: didSubstitute };
  }
  const desc = typeof next.description === 'string' ? next.description.slice(0, 800) : next.description;
  next = { ...next, description: desc };
  return { pending: next, didSubstituteImages: didSubstitute };
}
