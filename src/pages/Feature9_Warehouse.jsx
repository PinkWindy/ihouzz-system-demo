import { useState, useEffect } from 'react';
import { shouldMaskAddress } from '../utils/permissions';
import { formatPropertyId } from '../utils/listingWorkflow';
import { UPDATE_REQUEST_PENDING } from '../utils/propertyUpdateWorkflow';
import { filterWarehouseProperties, warehouseMyProps } from '../utils/warehouseFilter';

const API = 'http://localhost:5000';

const lv1Color = { 'Được duyệt':'success','Được đảm bảo':'warning','Chờ POS duyệt':'info','Bị từ chối':'danger','Đã gỡ nguồn':'dark','Chờ duyệt gỡ nguồn':'secondary','Chờ KH ký':'primary' };
const lv2Color = { 'Đang niêm yết':'success','Chưa niêm yết':'secondary','Thẩm định phí':'info','Đã gỡ':'dark','Khởi tạo':'light','Chờ chỉnh sửa':'warning','Chờ duyệt chỉnh sửa':'info' };

const DEMO_PROP_IMG =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80';

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

// Đọc user TRONG component để luôn mới sau login
const getUser = () => {
  const str = localStorage.getItem('user');
  const obj = str ? JSON.parse(str) : {};
  const raw = obj.role || 'sales';
  const role = raw === 'pos' ? 'pos_manager' : raw === 'mkt' ? 'marketing' : raw;
  const pos_name = role === 'admin' ? null : (obj.pos_name || '');
  const rawPid = obj.pos_id;
  const pos_id = rawPid === '' || rawPid == null ? null : Number(rawPid);
  const user_id = obj.id || '';
  return { role, pos_name, pos_id: Number.isNaN(pos_id) ? null : pos_id, user_id, name: obj.name || '' };
};

export default function Feature9_Warehouse() {
  const { role: ROLE, pos_name: POS_NAME, pos_id: POS_ID, user_id: USER_ID } = getUser();

  // Ẩn địa chỉ theo BR-013: sales/pos_manager không thấy địa chỉ TS của POS khác
  const maskAddress = (prop) => {
    // Sử dụng logic phân quyền động từ permissions.js
    if (!shouldMaskAddress(ROLE, prop, POS_ID, POS_NAME)) return prop.address;
    
    // Tài sản của POS khác và không có quyền xem -> ẩn địa chỉ
    if (!prop.address) return '***';
    const parts = prop.address.split(',');
    return parts.length > 2 ? `***, ${parts.slice(-2).join(',').trim()}` : '*** (BR-013)';
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
  // Default filter: Sales → chỉ tài sản của mình, POS Manager → POS của mình, Admin → tất cả
  const [filterPOS, setFilterPOS] = useState(
    ROLE === 'sales' ? 'MINE' : ROLE === 'pos_manager' ? (POS_NAME || 'ALL') : '',
  );

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const [data, lst, logRows] = await Promise.all([
        fetch(`${API}/properties`).then((r) => r.json()),
        fetch(`${API}/listings`).then((r) => r.json()),
        fetch(`${API}/logs`).then((r) => r.json()).catch(() => []),
      ]);
      setProps(Array.isArray(data) ? data : []);
      setListings(Array.isArray(lst) ? lst : []);
      setLogs(Array.isArray(logRows) ? logRows : []);
    } finally {
      setLoading(false);
    }
  };

  const propertyLogEntries = (property) => {
    if (!property || !Array.isArray(logs)) return [];
    const idSet = new Set(
      [property.id, property.propertyCode, formatPropertyId(property.id)].filter(Boolean).map(String),
    );
    const rows = logs.filter((row) => {
      const eid = row.entityId != null ? String(row.entityId) : '';
      if (!eid) return false;
      if (idSet.has(eid)) return true;
      if (idSet.has(formatPropertyId(eid))) return true;
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

  const filtered = filterWarehouseProperties(props, {
    ROLE,
    POS_NAME,
    USER_ID,
    showRemoved,
    search,
    filterLv1,
    filterType,
    filterPOS,
  });

  // Stats chỉ tính trong phạm vi POS của user
  const myProps = warehouseMyProps(props, ROLE, POS_NAME, USER_ID);

  const stats = [
    { label: 'Tổng tài sản', value: myProps.length, color: '#1976d2', icon: 'bi-building' },
    { label: 'Kho chuẩn', value: myProps.filter(p => p.warehouse_type === 'Kho chuẩn').length, color: '#388e3c', icon: 'bi-check-circle' },
    { label: 'Kho đảm bảo', value: myProps.filter(p => p.warehouse_type === 'Kho đảm bảo').length, color: '#f57c00', icon: 'bi-shield-check' },
    { label: 'Đang niêm yết', value: myProps.filter(p => p.level2_status === 'Đang niêm yết').length, color: '#7b1fa2', icon: 'bi-broadcast' },
    { label: 'Đã gỡ nguồn', value: myProps.filter(p => p.level1_status === 'Đã gỡ nguồn').length, color: '#616161', icon: 'bi-archive' },
  ];

  return (
    <div className="p-4" style={{ background: '#f5f7fa', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#0d47a1' }}>
            <i className="bi bi-graph-up me-2"></i>Feature 9 – Tra cứu & Giám sát Kho (UC010)
          </h4>
          <small className="text-muted">
            Role: <strong>{ROLE.toUpperCase()}</strong>
            {POS_NAME && <span className="badge bg-info text-dark ms-2">{POS_NAME}</span>}
            {ROLE !== 'admin' && <span className="badge bg-warning text-dark ms-2">BR-013: Địa chỉ POS khác bị ẩn</span>}
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

      {/* Warning banner */}
      {removedCount > 0 && !showRemoved && (
        <div className="alert alert-secondary d-flex align-items-center justify-content-between py-2 mb-3">
          <span><i className="bi bi-eye-slash me-2"></i>Đang ẩn <strong>{removedCount}</strong> tài sản đã gỡ nguồn.</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowRemoved(true)}>Hiển thị</button>
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
          <div className="col-md-2 d-flex align-items-center gap-2">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" id="showRemovedSwitch" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} />
              <label className="form-check-label small" htmlFor="showRemovedSwitch">Hiện đã gỡ</label>
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
              {ROLE !== 'admin' && <span className="text-warning small"><i className="bi bi-shield-lock me-1"></i>BR-013: Địa chỉ POS khác bị ẩn</span>}
            </div>
            <div className="table-responsive" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="small text-muted">Mã TS</th>
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
                    return (
                      <tr key={p.id}
                        className={`${isSelected ? 'bg-primary bg-opacity-10' : ''} ${p.level1_status === 'Đã gỡ nguồn' ? 'opacity-50' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(isSelected ? null : p)}>
                        <td><span className="badge bg-dark">{formatPropertyId(p.id)}</span></td>
                        <td>{p.propertyType || 'Chung cư'}</td>
                        <td className={masked ? 'text-muted fst-italic' : ''}>
                          {masked && <i className="bi bi-shield-lock me-1 text-warning"></i>}
                          {maskAddress(p)}
                        </td>
                        <td><span className={`badge bg-${lv1Color[p.level1_status] || 'secondary'}`}>{p.level1_status}</span></td>
                        <td><span className={`badge bg-${lv2Color[p.level2_status] || 'secondary'}`}>{p.level2_status}</span></td>
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
                <span className="fw-bold"><i className="bi bi-building me-1"></i>{formatPropertyId(selected.id)}</span>
                <button className="btn-close btn-close-white btn-sm" onClick={() => setSelected(null)}></button>
              </div>
              <div className="card-body small" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
                {/* Address */}
                <div className="mb-3">
                  <div className="text-muted mb-1">📍 Địa chỉ</div>
                  {isMasked(selected)
                    ? <div className="alert alert-warning py-2 px-2"><i className="bi bi-shield-lock me-1"></i>Bị ẩn — BR-013 (tài sản khác POS)</div>
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
                    <span className={`badge bg-${lv1Color[selected.level1_status] || 'secondary'}`}>{selected.level1_status}</span>
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    <span className="text-muted">Level 2:</span>
                    <span className={`badge bg-${lv2Color[selected.level2_status] || 'secondary'}`}>{selected.level2_status}</span>
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
                      ['Giá', selected.price_display], ['Kho', selected.warehouse_type || '—'],
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
                    {selected.approvedBy && <div><span className="text-muted">Duyệt bởi:</span> {selected.approvedBy}</div>}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <div className="text-muted mb-2">📋 Timeline</div>
                  {[
                    { date: selected.createdAt, label: 'Tạo hồ sơ', icon: 'bi-plus-circle', color: '#1976d2' },
                    selected.approvedAt && { date: selected.approvedAt, label: `Duyệt kho bởi ${selected.approvedBy || '—'}`, icon: 'bi-check-circle', color: '#388e3c' },
                    selected.unsourceRequestedAt && { date: selected.unsourceRequestedAt, label: 'Yêu cầu gỡ nguồn', icon: 'bi-exclamation-circle', color: '#f57c00' },
                    selected.unsourceApprovedAt && { date: selected.unsourceApprovedAt, label: 'Gỡ nguồn được duyệt', icon: 'bi-x-circle', color: '#616161' },
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
                          Chưa có dòng log gắn <code>{formatPropertyId(selected.id)}</code> (tạo thao tác trên F2/F3/F8… để có lịch sử).
                        </div>
                      );
                    }
                    return (
                      <ul className="list-unstyled mb-0 small" style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {entries.slice(0, 50).map((row) => (
                          <li key={row.id || `${row.timestamp}-${row.action}`} className="mb-2 pb-2 border-bottom border-light-subtle">
                            <div className="fw-semibold" style={{ fontSize: 12 }}>{row.action}</div>
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
