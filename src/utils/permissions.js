/**
 * iHouzz Permission System
 * ========================
 * Mô hình: Permission-based Matrix (ABAC + RBAC hybrid)
 * Admin có thể cấu hình động tại Feature 10 - IAM
 */

// Danh sách tất cả quyền trong hệ thống
export const ALL_PERMISSIONS = [
  // --- Nhóm: Kho hàng ---
  { code: 'PROPERTY_VIEW_LIST',               group: 'Kho hàng',         label: 'Xem danh sách tài sản',           scope: 'ALL' },
  { code: 'PROPERTY_CREATE',                  group: 'Kho hàng',         label: 'Tạo mới tài sản',                 scope: 'OWN_POS' },
  { code: 'PROPERTY_VIEW_ADDRESS_OWN_POS',    group: 'Dữ liệu nhạy cảm', label: 'Xem địa chỉ POS mình',           scope: 'OWN_POS' },
  { code: 'PROPERTY_VIEW_ADDRESS_OTHER_POS',  group: 'Dữ liệu nhạy cảm', label: 'Xem địa chỉ POS khác',           scope: 'OTHER_POS',  masking: 'FULL_MASK' },
  { code: 'PROPERTY_VIEW_PRICE',              group: 'Dữ liệu nhạy cảm', label: 'Xem giá tài sản (POS mình)',     scope: 'OWN_POS' },
  { code: 'PROPERTY_VIEW_PRICE_OTHER_POS',    group: 'Dữ liệu nhạy cảm', label: 'Xem giá POS khác',               scope: 'OTHER_POS',  masking: 'FULL_MASK' },
  { code: 'PROPERTY_EXPORT',                  group: 'Export',            label: 'Xuất dữ liệu tài sản (CSV)',     scope: 'FILTER_SCOPE', masking: 'MASK_APPLY' },
  // --- Nhóm: Niêm yết ---
  { code: 'LISTING_CREATE',                   group: 'Niêm yết',         label: 'Soạn tin đăng',                   scope: 'OWN_POS' },
  { code: 'LISTING_APPROVE',                  group: 'Niêm yết',         label: 'Duyệt tin đăng (MKT)',            scope: 'ALL' },
  { code: 'LISTING_UNLIST_REQUEST',           group: 'Niêm yết',         label: 'Yêu cầu gỡ tin',                 scope: 'OWN_POS' },
  { code: 'LISTING_UNLIST_APPROVE',           group: 'Niêm yết',         label: 'Duyệt gỡ tin (Admin/MKT)',       scope: 'ALL' },
  // --- Nhóm: Gỡ nguồn ---
  { code: 'PROPERTY_UNSOURCE_REQUEST',        group: 'Gỡ nguồn',         label: 'Yêu cầu gỡ nguồn tài sản',      scope: 'OWN_POS' },
  { code: 'PROPERTY_UNSOURCE_APPROVE',        group: 'Gỡ nguồn',         label: 'Duyệt gỡ nguồn (GĐ POS)',       scope: 'OWN_POS' },
  // --- Nhóm: IAM ---
  { code: 'IAM_MANAGE_USER',                  group: 'IAM',              label: 'Quản lý tài khoản nhân viên',    scope: 'ALL' },
  { code: 'IAM_LOCK_UNLOCK',                  group: 'IAM',              label: 'Khóa / Mở khóa tài khoản',      scope: 'ALL' },
  { code: 'POS_MANAGE',                       group: 'IAM',              label: 'Quản lý cấu hình POS',           scope: 'ALL' },
  { code: 'IAM_PERMISSION_MANAGE',            group: 'IAM',              label: 'Cấu hình Ma trận Phân quyền',    scope: 'ALL' },
  // --- Nhóm: Audit ---
  { code: 'AUDIT_VIEW',                       group: 'Audit',            label: 'Xem Audit Trail',                scope: 'ALL' },
  { code: 'AUDIT_EXPORT',                     group: 'Audit',            label: 'Xuất Audit Log (CSV)',           scope: 'ALL' },
  // --- Nhóm: Báo cáo ---
  { code: 'DASHBOARD_VIEW',                   group: 'Báo cáo',          label: 'Xem Dashboard tổng hợp (F12)',   scope: 'FILTER_SCOPE' },
];

// Cấu hình phân quyền MẶC ĐỊNH theo Role
// Admin luôn có toàn quyền, không thể thay đổi
export const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS.map(p => p.code), // Full access
  pos_manager: [
    'PROPERTY_VIEW_LIST',
    'PROPERTY_VIEW_ADDRESS_OWN_POS',
    'PROPERTY_VIEW_PRICE',
    'PROPERTY_UNSOURCE_APPROVE',
    'LISTING_UNLIST_APPROVE',
    'DASHBOARD_VIEW',
  ],
  sales: [
    'PROPERTY_VIEW_LIST',
    'PROPERTY_CREATE',
    'PROPERTY_VIEW_ADDRESS_OWN_POS',
    'PROPERTY_VIEW_PRICE',
    'LISTING_CREATE',
    'LISTING_UNLIST_REQUEST',
    'PROPERTY_UNSOURCE_REQUEST',
    'DASHBOARD_VIEW',
  ],
  marketing: [
    'PROPERTY_VIEW_LIST',
    'PROPERTY_VIEW_ADDRESS_OWN_POS',
    'PROPERTY_VIEW_PRICE',
    'PROPERTY_VIEW_PRICE_OTHER_POS',
    'LISTING_APPROVE',
    'LISTING_UNLIST_APPROVE',
    'DASHBOARD_VIEW',
  ],
};

// KEY lưu trong localStorage
const LS_KEY = 'ihouzz_permissions';

// ===== API FUNCTIONS =====

/** Lấy toàn bộ cấu hình phân quyền hiện tại (luôn gộp với DEFAULT — tránh F10 lưu thiếu quyền baseline). */
export function getPermissions() {
  const merged = Object.fromEntries(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, codes]) => [role, [...codes]]),
  );
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach((role) => {
          if (!Array.isArray(parsed[role])) return;
          merged[role] = [...new Set([...(merged[role] || []), ...parsed[role]])];
        });
      }
    }
  } catch (_) {}
  return merged;
}

/** Xem Dashboard (F12) — Admin + role có DASHBOARD_VIEW trong ma trận (đã gộp DEFAULT). */
export function canViewDashboard(role) {
  if (role === 'admin') return true;
  return hasPermission(role, 'DASHBOARD_VIEW');
}

/** Lưu cấu hình phân quyền mới */
export function savePermissions(newPerms) {
  localStorage.setItem(LS_KEY, JSON.stringify(newPerms));
}

/** Reset về mặc định */
export function resetPermissions() {
  localStorage.removeItem(LS_KEY);
}

/** Kiểm tra role có quyền permCode không */
export function hasPermission(role, permCode) {
  if (role === 'admin') return true; // Admin luôn toàn quyền
  const perms = getPermissions();
  return (perms[role] || []).includes(permCode);
}

/** So khớp POS giữa tài sản và user (id kiểu số/chuỗi + fallback theo tên POS). */
export function isSamePosAsActor(property, actorPosId, actorPosName) {
  if (!property || typeof property !== 'object') return false;
  const pid = property.pos_id;
  const aid = actorPosId;
  if (pid != null && aid != null && pid !== '' && aid !== '') {
    const pn = Number(pid);
    const an = Number(aid);
    if (!Number.isNaN(pn) && !Number.isNaN(an) && pn === an) return true;
  }
  const pn = property.pos_name != null ? String(property.pos_name).trim() : '';
  const an = actorPosName != null ? String(actorPosName).trim() : '';
  if (pn && an && pn === an) return true;
  return false;
}

/**
 * Có nên che địa chỉ không (BR-013).
 * - Cùng POS với user → không che.
 * - Có quyền PROPERTY_VIEW_ADDRESS_OTHER_POS → không che (xem toàn hệ thống).
 * - Khác POS và không có quyền trên → che.
 */
export function shouldMaskAddress(role, property, currentPosId, currentPosName) {
  if (role === 'admin') return false;
  if (isSamePosAsActor(property, currentPosId, currentPosName)) return false;
  if (hasPermission(role, 'PROPERTY_VIEW_ADDRESS_OTHER_POS')) return false;
  if (!property.pos_id && !property.pos_name) return false;
  return true;
}

/** Nhãn hiển thị khi che giá (đồng bộ masking địa chỉ). */
export const MASKED_PRICE_TEXT = '***';

/**
 * Có nên che giá không — cùng mô hình shouldMaskAddress (BR masking giá POS khác).
 * - Cùng POS với user → không che.
 * - Có quyền PROPERTY_VIEW_PRICE_OTHER_POS → không che.
 * - Khác POS và không có quyền → che.
 */
export function shouldMaskPrice(role, property, currentPosId, currentPosName) {
  if (role === 'admin') return false;
  if (isSamePosAsActor(property, currentPosId, currentPosName)) return false;
  if (hasPermission(role, 'PROPERTY_VIEW_PRICE_OTHER_POS')) return false;
  if (!property.pos_id && !property.pos_name) return false;
  return true;
}

/** Giá hiển thị trên UI/CSV — tôn trọng shouldMaskPrice. */
export function formatPropertyPriceDisplay(role, property, currentPosId, currentPosName) {
  if (!property) return '—';
  if (shouldMaskPrice(role, property, currentPosId, currentPosName)) return MASKED_PRICE_TEXT;
  if (property.price_display != null && String(property.price_display).trim() !== '') {
    return String(property.price_display);
  }
  const n = Number(property.price);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US')} ${property.priceUnit || 'VNĐ'}`;
}
