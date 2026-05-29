import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { shouldMaskAddress, formatPropertyPriceDisplay } from '../utils/permissions';
import {
  API,
  readSessionUser,
  SESSION_CHANGED_EVENT,
  formatPropertyId,
  formatListingId,
} from '../utils/listingWorkflow';
import { UPDATE_REQUEST_PENDING } from '../utils/propertyUpdateWorkflow';
import { filterWarehouseProperties, warehouseMyProps } from '../utils/warehouseFilter';

/** Đồng bộ F7/F8/F9 — map `readSessionUser()` sang shape filter/mask. */
function authFromSessionUser(u) {
  if (!u || u.role === 'guest') {
    return { role: 'sales', pos_name: '', pos_id: null, user_id: '', name: '' };
  }
  const role = u.role || 'sales';
  const posNameRaw = role === 'admin' ? null : u.pos_name || '';
  const rawPid = u.pos_id;
  const pos_id = rawPid === '' || rawPid == null ? null : Number(rawPid);
  return {
    role,
    pos_name: posNameRaw == null ? '' : String(posNameRaw),
    pos_id: Number.isNaN(pos_id) ? null : pos_id,
    user_id: String(u.id ?? ''),
    name: u.name || '',
  };
}

function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

const lv1Color = { 'Được duyệt':'success','Được đảm bảo':'warning','Chờ POS duyệt':'info','Bị từ chối':'danger','Đã gỡ nguồn':'dark','Chờ duyệt gỡ nguồn':'secondary','Chờ KH ký':'primary' };
const lv2Color = { 'Đang niêm yết':'success','Chưa niêm yết':'secondary','Thẩm định phí':'info','Đã gỡ':'dark','Đã gỡ nguồn':'dark','Khởi tạo':'light','Chờ chỉnh sửa':'warning','Chờ duyệt chỉnh sửa':'info' };

/** Badge tin đăng trên bảng — tránh `bg-orange` / chuỗi không hợp lệ của Bootstrap. */
const LISTING_STATUS_BADGE = {
  'Chờ duyệt': 'warning',
  'Chờ duyệt chỉnh sửa': 'info',
  'Đã duyệt': 'success',
  'Từ chối': 'danger',
  'Yêu cầu gỡ tin': 'secondary',
  'Đã gỡ': 'dark',
};

/** Bootstrap `bg-light` / `bg-warning` trên nền trắng dễ mất chữ — ép tương phản. */
function statusBadgeClass(bgKey) {
  const k = bgKey || 'secondary';
  if (k === 'light') return 'badge bg-light text-dark border';
  if (k === 'warning') return 'badge bg-warning text-dark';
  return `badge bg-${k}`;
}

const DEMO_PROP_IMG =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80';

/** Ngày theo lịch local (YYYY-MM-DD) — tránh lệch múi giờ của `toISOString()`. */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF9DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

function resolveImageUrl(u) {
  if (!u) return DEMO_PROP_IMG;
  const s = String(u);
  if (s.startsWith('data:') || /^https?:\/\//i.test(s)) return s;
  return DEMO_PROP_IMG;
}

function collectPropertyGalleryUrls(property, listings) {
  const urls = [];
  const push = (u) => {
    const r = resolveImageUrl(u);
    if (!urls.includes(r)) urls.push(r);
  };
  (property.images || []).forEach(push);
  listings
    .filter((l) => l.property_id === property.id)
    .forEach((l) => (l.images || []).forEach(push));
  return urls;
}

/** Hiển thị Lv2 đồng bộ với tin đã duyệt khi dữ liệu TS chưa được PATCH (vd. LS-00026). */
function effectiveLevel2Status(property, listings) {
  if (!property) return '—';
  const fromDb = property.level2_status || property.statusLv2 || '';
  const hasApprovedListing = (listings || []).some(
    (l) => l && l.property_id === property.id && l.listing_status === 'Đã duyệt',
  );
  if (hasApprovedListing && (fromDb === 'Chưa niêm yết' || fromDb === 'Khởi tạo' || fromDb === '')) {
    return 'Đang niêm yết';
  }
  return fromDb || '—';
}

export default function Feature9_Warehouse() {
  const location = useLocation();
  const [user, setUser] = useState(() => readSessionUser());
  const auth = useMemo(() => authFromSessionUser(user), [user]);
  const { role: ROLE, pos_name: POS_NAME, pos_id: POS_ID, user_id: USER_ID } = auth;

  // Ẩn địa chỉ theo BR-013: sales/pos_manager không thấy địa chỉ TS của POS khác
  const maskAddress = (prop) => {
    // Sử dụng logic phân quyền động từ permissions.js
    if (!shouldMaskAddress(ROLE, prop, POS_ID, POS_NAME)) return prop.address;
    
    // Tài sản của POS khác và không có quyền xem -> ẩn địa chỉ
    if (!prop.address) return '***';
    const parts = prop.address.split(',');
    return parts.length > 2 ? `***, ${parts.slice(-2).join(',').trim()}` : '***';
  };

  const isMasked = (prop) => maskAddress(prop) !== prop.address;

  const [props, setProps] = useState([]);
  const [listings, setListings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [gallerySlide, setGallerySlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterLv1, setFilterLv1] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterListing, setFilterListing] = useState('');
  const { from: defaultFrom, to: defaultTo } = defaultF9DateRange();
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [filterPOS, setFilterPOS] = useState(() => {
    const a = authFromSessionUser(readSessionUser());
    if (a.role === 'sales') return 'MINE';
    if (a.role === 'pos_manager') return a.pos_name || 'ALL';
    return '';
  });

  useEffect(() => {
    const bump = () => setUser(readSessionUser());
    window.addEventListener('storage', bump);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
    };
  }, []);

  const prevIdentityRef = useRef('');
  useEffect(() => {
    const key = `${auth.user_id}|${auth.role}`;
    if (prevIdentityRef.current === key) return;
    prevIdentityRef.current = key;
    if (auth.role === 'sales') setFilterPOS('MINE');
    else if (auth.role === 'pos_manager') setFilterPOS(auth.pos_name || 'ALL');
    else setFilterPOS('');
  }, [auth.user_id, auth.role, auth.pos_name]);

  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    if (st.search != null) setSearch(String(st.search));
    if (st.filterLv1) setFilterLv1(st.filterLv1);
    if (st.filterListing) setFilterListing(st.filterListing);
    if (st.dateFrom) setDateFrom(st.dateFrom);
    if (st.dateTo) setDateTo(st.dateTo);
  }, [location.key]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRaw, lstRaw, logRaw] = await Promise.all([
        fetch(`${API}/properties`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.json()),
        fetch(`${API}/listings`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.json()),
        fetch(`${API}/logs?_per_page=1000`, { headers: { 'Cache-Control': 'no-cache' } })
          .then((r) => r.json())
          .catch(() => []),
      ]);
      setProps(normalizeJsonList(dataRaw));
      setListings(normalizeJsonList(lstRaw));
      setLogs(normalizeJsonList(logRaw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const propertyLogEntries = (property) => {
    if (!property || !Array.isArray(logs)) return [];
    const idSet = new Set(
      [property.id, property.propertyCode, formatPropertyId(property.id)].filter(Boolean).map(String),
    );
    const rows = logs.filter((row) => {
      const eid = row.entityId != null ? String(row.entityId) : '';
      const pid = row.property_id != null ? String(row.property_id) : '';
      if (eid && (idSet.has(eid) || idSet.has(formatPropertyId(eid)))) return true;
      if (pid && (idSet.has(pid) || idSet.has(formatPropertyId(pid)))) return true;
      return false;
    });
    return rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  };

  useEffect(() => {
    setGallerySlide(0);
  }, [selected?.id]);

  const removedCount = props.filter(p => p.level1_status === 'Đã gỡ nguồn').length;
  const allPosList = [...new Set(props.map(p => p.pos_name).filter(Boolean))];
  const allLv1List = [...new Set(props.map(p => p.level1_status).filter(Boolean))];

  let filtered = filterWarehouseProperties(props, {
    ROLE,
    POS_NAME,
    USER_ID,
    showRemoved,
    search,
    filterLv1,
    filterType,
    filterPOS,
  });

  if (filterListing) {
    filtered = filtered.filter(p => {
      // Special case: "Dã gỡ nguồn" maps to listing status "Dã gỡ" OR the property itself has level1_status "Dã gỡ nguồn"
      if (filterListing === 'Đã gỡ') {
        if (p.level1_status === 'Đã gỡ nguồn') return true;
        const pListings = listings.filter(l => l.property_id === p.id);
        return pListings.some(l => l.listing_status === 'Đã gỡ' || l.listing_status === 'Đã gỡ nguồn');
      }
      // "Dã duyệt" means listing_status === "Dã duyệt" (= DĂng niêm yết in Lv2)
      const pListings = listings.filter(l => l.property_id === p.id);
      return pListings.some(l => l.listing_status === filterListing);
    });
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    filtered = filtered.filter(p => {
      const dateFields = [p.createdAt, p.updatedAt, p.unsourceApprovedAt, p.unsourceRequestedAt, p.rejectedAt, p.approvedAt];
      return dateFields.some(d => {
        if (!d) return false;
        const day = d.slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      });
    });
  }

  // Stats chỉ tính trong phạm vi POS của user
  const myProps = warehouseMyProps(props, ROLE, POS_NAME, USER_ID);

  const stats = [
    { label: 'Tổng tài sản', value: myProps.length, color: '#1976d2', icon: 'bi-building' },
    { label: 'Kho chuẩn', value: myProps.filter(p => p.warehouse_type === 'Kho chuẩn').length, color: '#388e3c', icon: 'bi-check-circle' },
    { label: 'Kho đảm bảo', value: myProps.filter(p => p.warehouse_type === 'Kho đảm bảo').length, color: '#f57c00', icon: 'bi-shield-check' },
    { label: 'Đang niêm yết', value: myProps.filter((p) => effectiveLevel2Status(p, listings) === 'Đang niêm yết').length, color: '#7b1fa2', icon: 'bi-broadcast' },
    { label: 'Đã gỡ nguồn', value: myProps.filter(p => p.level1_status === 'Đã gỡ nguồn').length, color: '#616161', icon: 'bi-archive' },
  ];

  return (
    <div className="p-4" style={{ background: 'var(--ih-main-bg, #f5f7fa)', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#0d47a1' }}>
            <i className="bi bi-graph-up me-2"></i>Tra cứu &amp; giám sát kho
          </h4>
          <small className="text-muted">
            Role: <strong>{ROLE.toUpperCase()}</strong>
            {POS_NAME && <span className="badge bg-info text-dark ms-2">{POS_NAME}</span>}
            {ROLE !== 'admin' && <span className="badge bg-warning text-dark ms-2">Địa chỉ chi nhánh khác được ẩn một phần</span>}
          </small>
        </div>
        <button className="btn btn-outline-primary btn-sm" onClick={load}>
          <i className="bi bi-arrow-clockwise me-1"></i>Làm mới
        </button>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {stats.map(s => (
          <div key={s.label} className="col-6 col-md">
            <div className="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bi ${s.icon} fs-5`} style={{ color: s.color }}></i>
              </div>
              <div><div className="fw-bold fs-5 lh-1">{s.value}</div><div className="text-muted small">{s.label}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Ẩn / hiện tài sản đã gỡ nguồn — chỉ banner (bỏ switch trùng chức năng) */}
      {removedCount > 0 && !showRemoved && (
        <div className="alert alert-secondary d-flex align-items-center justify-content-between py-2 mb-3 flex-wrap gap-2">
          <span>
            <i className="bi bi-eye-slash me-2"></i>
            Đang ẩn <strong>{removedCount}</strong> tài sản <strong>Đã gỡ nguồn</strong> (Level 1). Ở bộ lọc Level 1 có thể chọn riêng trạng thái đó khi cần.
          </span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowRemoved(true)}>
            Hiển thị trong danh sách
          </button>
        </div>
      )}
      {removedCount > 0 && showRemoved && (
        <div className="alert alert-info d-flex align-items-center justify-content-between py-2 mb-3 flex-wrap gap-2">
          <span>
            <i className="bi bi-eye me-2"></i>
            Đang hiển thị cả <strong>{removedCount}</strong> tài sản đã gỡ nguồn.
          </span>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setShowRemoved(false)}>
            Ẩn tài sản đã gỡ
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card border-0 shadow-sm p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-md-3">
            <input className="form-control form-control-sm" placeholder="🔍 Tìm mã LS- hoặc địa chỉ..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="col-md-2">
            <select className="form-select form-select-sm" value={filterLv1} onChange={e => setFilterLv1(e.target.value)}>
              <option value="">Tất cả Level 1</option>
              {allLv1List.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select form-select-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Loại GD</option>
              <option value="Bán">Bán</option>
              <option value="Thuê">Thuê</option>
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select form-select-sm" value={filterListing} onChange={e => setFilterListing(e.target.value)}>
              <option value="">Trạng thái Niêm yết</option>
              <option value="Chờ duyệt">Chờ duyệt</option>
              <option value="Chờ duyệt chỉnh sửa">Chờ duyệt chỉnh sửa</option>
              <option value="Đã duyệt">Đã duyệt (Đang niêm yết)</option>
              <option value="Từ chối">Từ chối</option>
              <option value="Yêu cầu gỡ tin">Yêu cầu gỡ tin</option>
              <option value="Đã gỡ">Đã gỡ</option>
            </select>
          </div>
          <div className="col-md-3">
            {/* Lọc POS: chỉ Admin được thay đổi */}
            {ROLE === 'admin' ? (
              <select className="form-select form-select-sm" value={filterPOS} onChange={e => setFilterPOS(e.target.value)}>
                <option value="">🌐 Tất cả POS</option>
                {allPosList.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <select className="form-select form-select-sm" value={filterPOS} onChange={e => setFilterPOS(e.target.value)}>
                <option value="MINE">📌 Tài sản của tôi</option>
                {POS_NAME && <option value={POS_NAME}>🏢 {POS_NAME} (POS của tôi)</option>}
                <option value="ALL">🌐 Tất cả POS (địa chỉ POS khác bị ẩn)</option>
              </select>
            )}
          </div>
          <div className="col-md-3">
            <div className="d-flex gap-1 align-items-center flex-wrap">
              <span className="input-group-text bg-white border rounded-start" style={{ fontSize: 11 }} title="Từ đầu tháng đến hôm nay (mặc định)">
                <i className="bi bi-calendar3"></i>
              </span>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Từ ngày"
              />
              <span className="small text-muted">—</span>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Đến ngày"
              />
              <button
                className="btn btn-outline-secondary btn-sm"
                type="button"
                onClick={() => {
                  const r = defaultF9DateRange();
                  setDateFrom(r.from);
                  setDateTo(r.to);
                }}
                title="Đặt lại: đầu tháng → hôm nay"
              >
                Đặt lại
              </button>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  title="Bỏ lọc ngày"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table + Detail */}
      <div className="row g-3">
        <div className={selected ? 'col-md-7' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-header border-0 bg-white fw-semibold small d-flex justify-content-between">
              <span>Danh sách ({filtered.length} tài sản)</span>
              {ROLE !== 'admin' && <span className="text-warning small"><i className="bi bi-shield-lock me-1"></i>Địa chỉ tài sản ngoài phạm vi chi nhánh được ẩn một phần</span>}
            </div>
            <div className="table-responsive" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="small text-muted">Mã TS</th>
                    <th className="small text-muted">Mã Tin Đăng</th>
                    <th className="small text-muted">Loại BĐS</th>
                    <th className="small text-muted">Địa chỉ</th>
                    <th className="small text-muted">Trạng thái Lv1</th>
                    <th className="small text-muted">Trạng thái Lv2</th>
                    <th className="small text-muted">Thuê/Bán</th>
                    <th className="small text-muted">Người tạo</th>
                    <th className="small text-muted">Ngày tạo</th>
                    <th className="small text-muted">Duyệt Lv1</th>
                    <th className="small text-muted">Duyệt Lv2</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan="10" className="text-center py-5">
                      <div className="spinner-border text-primary spinner-border-sm me-2"></div>
                      <span className="text-muted small">Đang tải dữ liệu kho...</span>
                    </td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan="10" className="text-center py-5 text-muted">
                      <i className="bi bi-inbox fs-2"></i><br />Không có tài sản nào phù hợp.
                    </td></tr>
                  )}
                  {!loading && filtered.map(p => {
                    const masked = isMasked(p);
                    const isSelected = selected?.id === p.id;
                    // Get latest listing for this property (highest listingCode / most recent createdAt)
                    const propListings = listings.filter(l => l.property_id === p.id);
                    const latestListing = propListings.length > 0
                      ? propListings.reduce((a, b) => {
                          const aCode = a.listingCode || a.id || '';
                          const bCode = b.listingCode || b.id || '';
                          // Compare by sequence number if LT-##### format, else by createdAt
                          const aNum = parseInt((aCode.match(/LT-(\d+)/i) || [0, 0])[1], 10);
                          const bNum = parseInt((bCode.match(/LT-(\d+)/i) || [0, 0])[1], 10);
                          if (aNum && bNum) return aNum > bNum ? a : b;
                          return (a.createdAt || '') > (b.createdAt || '') ? a : b;
                        })
                      : null;
                    const latestListingCode = latestListing
                      ? formatListingId(latestListing.listingCode || latestListing.id)
                      : null;
                    const listingBadgeBg = LISTING_STATUS_BADGE[latestListing?.listing_status] || 'secondary';
                    const lv2Display = effectiveLevel2Status(p, listings);
                    return (
                      <tr key={p.id}
                        className={`${isSelected ? 'bg-primary bg-opacity-10' : ''} ${p.level1_status === 'Đã gỡ nguồn' ? 'opacity-50' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(isSelected ? null : p)}>
                        <td><span className="badge bg-dark">{formatPropertyId(p.propertyCode || p.id)}</span></td>
                        <td>
                          {latestListingCode
                            ? <span className={statusBadgeClass(listingBadgeBg)} title={`Trạng thái: ${latestListing?.listing_status || ''}`}>{latestListingCode}</span>
                            : <span className="text-muted small">—</span>
                          }
                        </td>
                        <td>{p.propertyType || 'Chung cư'}</td>
                        <td className={masked ? 'text-muted fst-italic' : ''}>
                          {masked && <i className="bi bi-shield-lock me-1 text-warning"></i>}
                          {maskAddress(p)}
                        </td>
                        <td><span className={statusBadgeClass(lv1Color[p.level1_status])}>{p.level1_status}</span></td>
                        <td>
                          <span className={statusBadgeClass(lv2Color[lv2Display])}>{lv2Display}</span>
                          {lv2Display !== (p.level2_status || p.statusLv2) && (
                            <div className="small text-muted mt-1" title="Đồng bộ hiển thị theo tin đăng Đã duyệt">↳ theo tin đăng</div>
                          )}
                        </td>
                        <td><span className={`badge ${p.type === 'Bán' ? 'bg-danger' : 'bg-info text-dark'}`}>{p.type}</span></td>
                        <td>{p.createdBy || '—'}</td>
                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                        <td>{p.approvedBy || '—'}</td>
                        <td>{p.mktApproveBy || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="col-md-5">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header border-0 bg-primary text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-building me-1"></i>{formatPropertyId(selected.propertyCode || selected.id)}</span>
                <button className="btn-close btn-close-white btn-sm" onClick={() => setSelected(null)}></button>
              </div>
              <div className="card-body small" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
                {/* Address */}
                <div className="mb-3">
                  <div className="text-muted mb-1">📍 Địa chỉ</div>
                  {isMasked(selected)
                    ? <div className="alert alert-warning py-2 px-2"><i className="bi bi-shield-lock me-1"></i>Địa chỉ được ẩn (tài sản ngoài phạm vi chi nhánh)</div>
                    : <div className="fw-semibold">{selected.address}</div>
                  }
                </div>

                {/* Ảnh: từ hồ sơ TS + ảnh tin đăng liên quan */}
                <div className="mb-3">
                  <div className="text-muted mb-2">🖼 Hình ảnh</div>
                  {(() => {
                    const gallery = collectPropertyGalleryUrls(selected, listings);
                    if (!gallery.length) {
                      return (
                        <div className="rounded border bg-light p-3 text-center text-muted small">
                          Chưa có ảnh trên hồ sơ hoặc tin đăng liên kết.
                        </div>
                      );
                    }
                    const safe = Math.min(gallerySlide, gallery.length - 1);
                    return (
                      <div>
                        <div className="rounded overflow-hidden border bg-dark mb-2">
                          <img
                            src={gallery[safe]}
                            alt=""
                            className="w-100 d-block"
                            style={{ maxHeight: 220, objectFit: 'contain' }}
                          />
                        </div>
                        {gallery.length > 1 && (
                          <div className="d-flex gap-1 flex-wrap align-items-center mb-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setGallerySlide((s) => (s - 1 + gallery.length) % gallery.length)}
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setGallerySlide((s) => (s + 1) % gallery.length)}
                            >
                              ›
                            </button>
                            <span className="small text-muted ms-2">
                              {safe + 1}/{gallery.length}
                            </span>
                          </div>
                        )}
                        <div className="d-flex gap-1 flex-wrap">
                          {gallery.map((src, i) => (
                            <button
                              key={`${src}-${i}`}
                              type="button"
                              className={`p-0 border rounded overflow-hidden ${i === safe ? 'border-primary border-2' : 'border-0'}`}
                              style={{ width: 52, height: 40 }}
                              onClick={() => setGallerySlide(i)}
                            >
                              <img src={src} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Status */}
                <div className="mb-3">
                  <div className="text-muted mb-1">📊 Trạng thái 2 lớp</div>
                  <div className="d-flex gap-2 align-items-center mb-1">
                    <span className="text-muted">Level 1:</span>
                    <span className={statusBadgeClass(lv1Color[selected.level1_status])}>{selected.level1_status}</span>
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <span className="text-muted">Level 2:</span>
                    {(() => {
                      const lv2 = effectiveLevel2Status(selected, listings);
                      return (
                        <>
                          <span className={statusBadgeClass(lv2Color[lv2])}>{lv2}</span>
                          {lv2 !== (selected.level2_status || selected.statusLv2) && (
                            <span className="small text-muted">(DB: {selected.level2_status || selected.statusLv2 || '—'})</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Specs */}
                <div className="mb-3">
                  <div className="text-muted mb-1">🏠 Thông số</div>
                  <div className="row g-1">
                    {[
                      ['Loại GD', selected.type], ['Diện tích', `${selected.area}m²`],
                      ['Phòng ngủ', selected.bedrooms], ['Phòng tắm', selected.bathrooms],
                      ['Hướng', selected.direction], ['Pháp lý', selected.legalStatus],
                      ['Nội thất', selected.interior || selected.furniture || '—'],
                      ['Giá', formatPropertyPriceDisplay(ROLE, selected, POS_ID, POS_NAME)], ['Kho', selected.warehouse_type || '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="col-6">
                        <div className="bg-light rounded p-2">
                          <div className="text-muted" style={{ fontSize: 10 }}>{k}</div>
                          <div className="fw-semibold" style={{ fontSize: 12 }}>{v || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ownership */}
                <div className="mb-3">
                  <div className="text-muted mb-1">👤 Thông tin sở hữu</div>
                  <div className="bg-light rounded p-2">
                    <div><span className="text-muted">Tạo bởi:</span> <strong>{selected.createdBy}</strong></div>
                    <div><span className="text-muted">POS:</span> <strong>{selected.pos_name}</strong></div>
                    {selected.manager_name && <div><span className="text-muted">Quản lý TS:</span> {selected.manager_name}</div>}
                    {selected.approvedBy && <div><span className="text-muted">Duyệt kho:</span> {selected.approvedBy}</div>}
                    {selected.mktApproveBy && <div><span className="text-muted">Duyệt Niêm yết (MKT):</span> <span className="fw-semibold text-primary">{selected.mktApproveBy}</span></div>}
                    {selected.rejectedBy && <div><span className="text-muted">Từ chối bởi:</span> <span className="text-danger fw-semibold">{selected.rejectedBy}</span></div>}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <div className="text-muted mb-2">📋 Timeline</div>
                  {[
                    { date: selected.createdAt, label: 'Tạo hồ sơ', icon: 'bi-plus-circle', color: '#1976d2' },
                    selected.approvedAt && { date: selected.approvedAt, label: `Duyệt kho bởi ${selected.approvedBy || '—'}`, icon: 'bi-check-circle', color: '#388e3c' },
                    (selected.mktApproveAt || (selected.mktApproveBy && selected.updatedAt)) && { date: selected.mktApproveAt || selected.updatedAt, label: `Duyệt Niêm yết bởi ${selected.mktApproveBy || 'MKT'}`, icon: 'bi-megaphone-fill', color: '#0288d1' },
                    selected.rejectedAt && { date: selected.rejectedAt, label: `Từ chối kho bởi ${selected.rejectedBy || '—'}`, icon: 'bi-x-octagon', color: '#d32f2f' },
                    selected.unsourceRequestedAt && { date: selected.unsourceRequestedAt, label: `Yêu cầu gỡ nguồn bởi ${selected.unsourceRequestedBy || '—'}`, icon: 'bi-exclamation-circle', color: '#f57c00' },
                    selected.unsourceApprovedAt && { date: selected.unsourceApprovedAt, label: `Duyệt gỡ nguồn bởi ${selected.unsourceApprovedBy || '—'}`, icon: 'bi-x-circle', color: '#616161' },
                    selected.unsourceRejectedAt && { date: selected.unsourceRejectedAt, label: `Từ chối gỡ nguồn bởi ${selected.unsourceRejectedBy || '—'}`, icon: 'bi-arrow-counterclockwise', color: '#d32f2f' },
                  ].filter(Boolean).sort((a, b) => new Date(a.date) - new Date(b.date)).map((ev, i) => (
                    <div key={i} className="d-flex align-items-start gap-2 mb-2">
                      <i className={`bi ${ev.icon} mt-1`} style={{ color: ev.color }}></i>
                      <div>
                        <div style={{ fontSize: 12 }}>{ev.label}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{new Date(ev.date).toLocaleString('vi-VN')}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-top pt-3">
                  <div className="text-muted mb-2">📜 Nhật ký thay đổi (log hệ thống)</div>
                  {selected.update_request_status === UPDATE_REQUEST_PENDING && (
                    <div className="alert alert-info py-2 small mb-2">
                      <i className="bi bi-arrow-repeat me-1"></i>
                      Có <strong>yêu cầu cập nhật</strong> đang chờ GĐ POS — dữ liệu chính chưa ghi đè cho đến khi duyệt.
                    </div>
                  )}
                  {(() => {
                    const entries = propertyLogEntries(selected);
                    const shortVal = (v) => {
                      if (v == null) return '—';
                      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
                      return s.length > 80 ? `${s.slice(0, 80)}…` : s;
                    };
                    if (!entries.length) {
                      return (
                        <div className="text-muted small fst-italic">
                          Chưa có dòng log gắn <code>{formatPropertyId(selected.propertyCode || selected.id)}</code> (tạo thao tác trên F2/F3/F8… để có lịch sử).
                        </div>
                      );
                    }
                    return (
                      <ul className="list-unstyled mb-0 small" style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {entries.slice(0, 50).map((row) => (
                          <li key={row.id || `${row.timestamp}-${row.action}`} className="mb-2 pb-2 border-bottom border-light-subtle">
                            <div className="fw-semibold" style={{ fontSize: 12 }}>
                              {(() => {
                                let s = row.action || '';
                                s = s.replace(/TS (PIS_[a-zA-Z0-9_]+|P[0-9]+)/g, (m, p1) => `TS ${formatPropertyId(p1)}`);
                                s = s.replace(/— ([a-zA-Z0-9_-]+)(\s*[-·]\s*|\s*\()/g, (m, rawId, suffix) => {
                                  if (rawId.startsWith('LT-') || rawId.startsWith('LS-')) return m;
                                  const lst = listings.find((x) => x.id === rawId);
                                  if (lst) return `— ${formatListingId(lst.listingCode || lst.id)}${suffix}`;
                                  return m;
                                });
                                return s;
                              })()}
                            </div>
                            <div className="text-muted" style={{ fontSize: 11 }}>
                              {(row.user || '—')} · {row.timestamp ? new Date(row.timestamp).toLocaleString('vi-VN') : '—'}
                            </div>
                            {row.reason && (
                              <div className="text-danger small mt-1">Lý do: {row.reason}</div>
                            )}
                            {Array.isArray(row.changes) && row.changes.length > 0 && (
                              <ul className="mb-0 mt-1 ps-3 text-muted" style={{ fontSize: 11 }}>
                                {row.changes.slice(0, 10).map((c, idx) => (
                                  <li key={idx}>
                                    <code>{c.field}</code>: {shortVal(c.old)} → {shortVal(c.new)}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {Array.isArray(row.changesPreview) && row.changesPreview.length > 0 && (
                              <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                                Trường thay đổi (tóm tắt): {row.changesPreview.join(', ')}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
