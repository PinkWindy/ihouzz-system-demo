/**
 * Bộ lọc danh sách tài sản F9 (Giám sát kho) — giữ đồng bộ với Feature9_Warehouse.jsx.
 * Tách ra để kiểm thử tự động (Vitest) và tránh sai lệch logic.
 */

export function filterWarehouseProperties(props, ctx) {
  const {
    ROLE,
    POS_NAME,
    USER_ID,
    showRemoved,
    search,
    filterLv1,
    filterType,
    filterPOS,
  } = ctx;

  return props.filter((p) => {
    if (!showRemoved && p.level1_status === 'Đã gỡ nguồn') return false;
    if (
      search &&
      !String(p.id).toLowerCase().includes(String(search).toLowerCase()) &&
      !p.address?.toLowerCase().includes(String(search).toLowerCase())
    ) {
      return false;
    }
    if (filterLv1 && p.level1_status !== filterLv1) return false;
    if (filterType && p.type !== filterType) return false;

    if (filterPOS === 'MINE') return p.createdBy_id === USER_ID;
    if (filterPOS && filterPOS !== 'ALL') return p.pos_name === filterPOS;

    if (ROLE === 'admin' || ROLE === 'marketing') return true;

    if (POS_NAME && p.pos_name === POS_NAME) return true;

    return p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo';
  });
}

/** Thống kê “tài sản của tôi” trên F9 (cùng logic component). */
export function warehouseMyProps(props, ROLE, POS_NAME, USER_ID) {
  if (ROLE === 'admin') return props;
  if (ROLE === 'pos_manager') {
    const pn = POS_NAME != null ? String(POS_NAME).trim() : '';
    if (!pn) return [];
    return props.filter((p) => p.pos_name === POS_NAME);
  }
  return props.filter((p) => p.createdBy_id === USER_ID);
}
