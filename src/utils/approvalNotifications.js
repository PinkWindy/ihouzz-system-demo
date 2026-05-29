/**
 * Thông báo kết quả phê duyệt nhập kho (SRS 2.4.5 / F3 §2.4.10).
 */

import { formatPropertyId } from './listingWorkflow';

export const NOTIF_CATEGORY = {
  WAREHOUSE_APPROVE: 'F3_WAREHOUSE_APPROVE',
  WAREHOUSE_REJECT: 'F3_WAREHOUSE_REJECT',
  UPDATE_APPROVE: 'F3_UPDATE_APPROVE',
  UPDATE_REJECT: 'F3_UPDATE_REJECT',
};

/** Demo SLA nhắc hạn (ngày) — production lấy từ cấu hình hệ thống. */
export const SLA_REMINDER_DAYS = 30;
export const SLA_AUTO_CANCEL_DAYS = 45;

export function propertyDisplayCode(propertyId) {
  return formatPropertyId(propertyId) || String(propertyId || '');
}

/** @param {{ propertyId: string, kind: 'approve'|'reject', warehouseType?: string, rejectReason?: string }} p */
export function buildWarehouseApprovalMessage({ propertyId, kind, warehouseType, rejectReason }) {
  const code = propertyDisplayCode(propertyId);
  if (kind === 'approve') {
    const wh =
      warehouseType && /đảm bảo/i.test(warehouseType) ? 'Kho Đảm bảo' : 'Kho Chuẩn';
    return `Tài sản ${code} đã vào ${wh}.`;
  }
  return `Tài sản ${code} bị từ chối. Lý do: ${rejectReason || '—'}`;
}

export function buildUpdateApprovalMessage(propertyId, approved) {
  const code = propertyDisplayCode(propertyId);
  return approved
    ? `Đã phê duyệt cập nhật tài sản ${code} — dữ liệu đã được ghi đè.`
    : `Yêu cầu cập nhật ${code} bị từ chối. Dữ liệu tài sản giữ nguyên.`;
}

export function matchesNotificationRecipient(notification, userName, userEmail) {
  if (!notification?.recipient) return false;
  const r = String(notification.recipient).trim();
  if (userName && r === userName) return true;
  if (userEmail && r === userEmail) return true;
  return false;
}

/** Kết quả duyệt kho Lv1 gửi cho Đầu chủ (có category hoặc legacy message). */
export function isWarehouseResultForSales(notification) {
  if (!notification) return false;
  const cat = notification.category || '';
  if (cat === NOTIF_CATEGORY.WAREHOUSE_APPROVE || cat === NOTIF_CATEGORY.WAREHOUSE_REJECT) {
    return true;
  }
  const m = notification.message || '';
  return (
    /đã vào Kho (Chuẩn|Đảm bảo)/i.test(m) ||
    (/bị từ chối/i.test(m) && /LS-/i.test(m))
  );
}

export function isRejectNotification(notification) {
  if (
    notification?.category === NOTIF_CATEGORY.WAREHOUSE_REJECT ||
    notification?.category === NOTIF_CATEGORY.UPDATE_REJECT
  ) {
    return true;
  }
  return /bị từ chối/i.test(notification?.message || '');
}

/** Kết quả duyệt / từ chối yêu cầu cập nhật kho (Đầu chủ). */
export function isUpdateResultForSales(notification) {
  if (!notification) return false;
  const cat = notification.category || '';
  if (cat === NOTIF_CATEGORY.UPDATE_APPROVE || cat === NOTIF_CATEGORY.UPDATE_REJECT) {
    return true;
  }
  const m = notification.message || '';
  return /duyệt cập nhật tài sản/i.test(m) || /Yêu cầu cập nhật.*bị từ chối/i.test(m);
}

/** Thông báo F3 hiển thị cho Đầu chủ trên F2 (Screen 2.4.5). */
export function isSalesInboxNotification(notification) {
  return isWarehouseResultForSales(notification) || isUpdateResultForSales(notification);
}

/** Hồ sơ chờ GĐ POS quá SLA_REMINDER_DAYS (demo banner F3). */
export function listOverduePendingApprovals(properties, now = Date.now()) {
  const pendingStatuses = ['Chờ POS duyệt', 'Chờ duyệt đảm bảo', 'Chờ KH ký'];
  const msReminder = SLA_REMINDER_DAYS * 86400000;
  return (properties || []).filter((p) => {
    const lv1 = p.level1_status || p.statusLv1 || '';
    if (!pendingStatuses.includes(lv1)) return false;
    const raw = p.updatedAt || p.createdAt;
    if (!raw) return false;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) && now - t >= msReminder;
  });
}
