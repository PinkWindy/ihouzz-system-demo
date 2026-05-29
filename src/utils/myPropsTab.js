/**
 * Tab "Tài sản của tôi" — dùng chung F2 (web) & SalesMobile (đồng bộ lọc / tìm kiếm).
 */

/** Chuỗi rỗng = không lọc theo Lv1/Lv2 (chỉ áp dụng ẩn gỡ nguồn + tìm kiếm). */
export const MY_PROPS_STATUS_ALL = '';

export const MY_PROPS_STATUS_OPTIONS = [
  { value: MY_PROPS_STATUS_ALL, label: 'Tất cả trạng thái' },
  { value: 'lv1:Mới', label: 'Lv1 · Mới (nháp)' },
  { value: 'lv1:Chờ POS duyệt', label: 'Lv1 · Chờ POS duyệt' },
  { value: 'lv1:Được duyệt', label: 'Lv1 · Được duyệt' },
  { value: 'lv1:Bị từ chối', label: 'Lv1 · Bị từ chối' },
  { value: 'lv1:Chờ duyệt gỡ nguồn', label: 'Lv1 · Chờ duyệt gỡ nguồn' },
  { value: 'lv1:Đã gỡ nguồn', label: 'Lv1 · Đã gỡ nguồn' },
  { value: 'lv1:Được đảm bảo', label: 'Lv1 · Được đảm bảo' },
  { value: 'lv1:Chờ duyệt đảm bảo', label: 'Lv1 · Chờ duyệt đảm bảo' },
  { value: 'lv1:Chờ KH ký', label: 'Lv1 · Chờ KH ký' },
  { value: 'lv2:Chưa niêm yết', label: 'Lv2 · Chưa niêm yết' },
  { value: 'lv2:Đang niêm yết', label: 'Lv2 · Đang niêm yết' },
  { value: 'lv2:Chờ MKT duyệt', label: 'Lv2 · Chờ MKT duyệt' },
  { value: 'lv2:Chờ chỉnh sửa', label: 'Lv2 · Chờ chỉnh sửa' },
  { value: 'lv2:Chờ duyệt chỉnh sửa', label: 'Lv2 · Chờ duyệt chỉnh sửa' },
  { value: 'lv2:Thẩm định phí', label: 'Lv2 · Thẩm định phí' },
  { value: 'lv2:Đã gỡ', label: 'Lv2 · Đã gỡ' },
  { value: 'lv2:Khởi tạo', label: 'Lv2 · Khởi tạo' },
];

export function normalizeJsonServerList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Tìm theo chuỗi con (đồng bộ với SalesMobile). */
export function matchesMyPropsSearch(property, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const parts = [
    property.id,
    property.propertyCode,
    property.address,
    property.district,
    property.ward,
    property.type,
    property.propertyType,
    property.level1_status,
    property.level2_status,
    property.statusLv1,
    property.statusLv2,
    property.pos_name,
    property.manager_name,
    property.pos_manager,
    property.createdBy,
    property.price_display,
    property.warehouse_type,
    property.description,
    property.rejection_reason,
    property.rejected_reason,
    property.update_request_status,
    property.legalStatus,
    property.legal,
    property.condition,
    property.source,
    property.furniture,
    property.direction,
    property.futureWard,
    String(property.price ?? ''),
    String(property.area ?? ''),
    String(property.bedrooms ?? ''),
    String(property.bathrooms ?? ''),
    String(property.floor ?? ''),
  ].filter((x) => x != null && String(x).trim() !== '');
  const hay = parts.join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}

/**
 * @param {object[]} properties — danh sách đã thuộc chủ (createdBy_id / merge listing)
 * @param {{ statusKey?: string, hideRemovedSource?: boolean, search?: string }} opts
 */
export function filterMyPropsForTab(properties, opts) {
  const { statusKey = MY_PROPS_STATUS_ALL, hideRemovedSource = true, search = '' } = opts || {};
  let list = Array.isArray(properties) ? [...properties] : [];

  if (hideRemovedSource) {
    list = list.filter((p) => {
      const lv1 = p.level1_status || p.statusLv1 || '';
      return lv1 !== 'Đã gỡ nguồn';
    });
  }

  const sk = String(statusKey || '').trim();
  if (sk.startsWith('lv1:')) {
    const v = sk.slice(4);
    list = list.filter((p) => (p.level1_status || p.statusLv1) === v);
  } else if (sk.startsWith('lv2:')) {
    const v = sk.slice(4);
    list = list.filter((p) => (p.level2_status || p.statusLv2) === v);
  }

  if (String(search || '').trim()) {
    list = list.filter((p) => matchesMyPropsSearch(p, search));
  }

  return list;
}

export function formatMyPropsPriceDisplay(p) {
  if (!p) return '—';
  if (p.price_display != null && String(p.price_display).trim() !== '') return String(p.price_display);
  const n = Number(p.price);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US')} ${p.priceUnit || 'VNĐ'}`;
}

export function warehouseLabel(p) {
  if (!p) return '—';
  return p.warehouse_type || p.warehouseType || '—';
}
