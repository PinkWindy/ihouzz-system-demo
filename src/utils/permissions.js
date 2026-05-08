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
  { code: 'PROPERTY_VIEW_PRICE',              group: 'Dữ liệu nhạy cảm', label: 'Xem giá tài sản',                scope: 'ALL' },
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
  ],
  sales: [
    'PROPERTY_VIEW_LIST',
    'PROPERTY_CREATE',
    'PROPERTY_VIEW_ADDRESS_OWN_POS',
    'PROPERTY_VIEW_PRICE',
    'LISTING_CREATE',
    'LISTING_UNLIST_REQUEST',
    'PROPERTY_UNSOURCE_REQUEST',
  ],
  marketing: [
    'PROPERTY_VIEW_LIST',
    'PROPERTY_VIEW_ADDRESS_OWN_POS',
    'PROPERTY_VIEW_PRICE',
    'LISTING_APPROVE',
    'LISTING_UNLIST_APPROVE',
  ],
};

// KEY lưu trong localStorage
const LS_KEY = 'ihouzz_permissions';

// ===== API FUNCTIONS =====

/** Lấy toàn bộ cấu hình phân quyền hiện tại */
export function getPermissions() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return DEFAULT_ROLE_PERMISSIONS;
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

/** Kiểm tra có nên mask địa chỉ không */
export function shouldMaskAddress(role, property, currentPosId) {
  if (role === 'admin') return false;
  if (!property.pos_id || property.pos_id === currentPosId) return false;
  // Kiểm tra quyền động
  return !hasPermission(role, 'PROPERTY_VIEW_ADDRESS_OTHER_POS');
}
