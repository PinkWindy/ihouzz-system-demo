/**
 * Chuẩn hóa user_id (INT) — đồng bộ SRS / ERD.
 */

const LEGACY_USER_ID_MAP = {
  u001: 1,
  u002: 2,
  u003: 3,
  u004: 4,
  u_pos1: 5,
  u_pos2: 6,
  u_mkt1: 7,
  u_marketing: 7,
  u_admin: 8,
  u_sales1: 4,
  u_sales: 4,
  u_hungnv: 1,
  u_anhdv: 2,
  u_tungtt: 3,
};

/** @returns {number|null} */
export function normalizeUserId(raw) {
  if (raw === '' || raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  if (LEGACY_USER_ID_MAP[s] != null) return LEGACY_USER_ID_MAP[s];
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

/** So khớp user_id (hỗ trợ legacy string trong session cũ). */
export function sameUserId(a, b) {
  const na = normalizeUserId(a);
  const nb = normalizeUserId(b);
  if (na == null || nb == null) return false;
  return na === nb;
}

/** Sinh user_id INT tiếp theo từ danh sách users API. */
export function nextUserIdFromList(users) {
  const max = (users || []).reduce((m, u) => {
    const n = normalizeUserId(u?.id);
    return n != null && n > m ? n : m;
  }, 0);
  return max + 1;
}
