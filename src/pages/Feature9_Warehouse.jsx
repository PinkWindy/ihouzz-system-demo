import { useState, useEffect } from 'react';
import { hasPermission } from '../utils/permissions.js';
const API = 'http://localhost:5000';
const ROLE = localStorage.getItem('user_role') || 'admin';
const POS_ID = ROLE === 'admin' ? null : 1;

// Masking dựa trên Permission Matrix động (BR-013)
const maskAddress = (prop) => {
  if (ROLE === 'admin') return prop.address;
  if (!prop.pos_id || prop.pos_id === POS_ID) return prop.address;
  // Kiểm tra quyền động từ Permission Matrix
  if (hasPermission(ROLE, 'PROPERTY_VIEW_ADDRESS_OTHER_POS')) return prop.address;
  return '*** (Bị ẩn — BR-013: không có quyền xem địa chỉ POS khác)';
};

// Hàm chuẩn hóa hiển thị ID (khắc phục lỗi thư viện gen UUID ngẫu nhiên)
const formatLSId = (id) => {
  if (!id) return '';
  if (id.startsWith('LS-')) return id;
  // Nếu là chuỗi random (vd: hadpkDyu4Sw), trích 5 ký tự đầu làm mã LS ảo cho đẹp UI
  return `LS-${id.substring(0, 5).toUpperCase()}`;
};

const lv1Color = { 'Được duyệt':'success','Được đảm bảo':'warning','Chờ POS duyệt':'info','Bị từ chối':'danger','Đã gỡ nguồn':'dark','Chờ duyệt gỡ nguồn':'secondary','Chờ KH ký':'primary' };
const lv2Color = { 'Đang niêm yết':'success','Chưa niêm yết':'secondary','Thẩm định phí':'info','Đã gỡ':'dark','Khởi tạo':'light' };

export default function Feature9_Warehouse() {
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterLv1, setFilterLv1] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPOS, setFilterPOS] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const data = await fetch(`${API}/properties`).then(r => r.json());
    setProps(data); setLoading(false);
  };

  const removedCount = props.filter(p => p.level1_status === 'Đã gỡ nguồn').length;
  const allPosList = [...new Set(props.map(p => p.pos_name).filter(Boolean))];
  const allLv1List = [...new Set(props.map(p => p.level1_status).filter(Boolean))];

  const filtered = props.filter(p => {
    if (!showRemoved && p.level1_status === 'Đã gỡ nguồn') return false;
    if (search && !p.id.toLowerCase().includes(search.toLowerCase()) && !p.address?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLv1 && p.level1_status !== filterLv1) return false;
    if (filterType && p.type !== filterType) return false;
    if (filterPOS && p.pos_name !== filterPOS) return false;
    return true;
  });

  const stats = [
    { label: 'Tổng tài sản', value: props.length, color: '#1976d2', icon: 'bi-building' },
    { label: 'Kho chuẩn', value: props.filter(p => p.warehouse_type === 'Kho chuẩn').length, color: '#388e3c', icon: 'bi-check-circle' },
    { label: 'Kho đảm bảo', value: props.filter(p => p.warehouse_type === 'Kho đảm bảo').length, color: '#f57c00', icon: 'bi-shield-check' },
    { label: 'Đang niêm yết', value: props.filter(p => p.level2_status === 'Đang niêm yết').length, color: '#7b1fa2', icon: 'bi-broadcast' },
    { label: 'Đã gỡ nguồn', value: removedCount, color: '#616161', icon: 'bi-archive' },
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
            {ROLE !== 'admin' && <span className="badge bg-warning text-dark ms-2">BR-013: Địa chỉ bị ẩn tài sản khác POS</span>}
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
          <span><i className="bi bi-eye-slash me-2"></i>Đang ẩn <strong>{removedCount}</strong> tài sản đã gỡ nguồn khỏi danh sách.</span>
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
            <select className="form-select form-select-sm" value={filterPOS} onChange={e => setFilterPOS(e.target.value)}>
              <option value="">Tất cả POS</option>
              {allPosList.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-md-2 d-flex align-items-center gap-2">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" id="showRemovedSwitch" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} />
              <label className="form-check-label small" htmlFor="showRemovedSwitch">Hiện đã gỡ</label>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="row g-3">
        <div className={selected ? 'col-md-7' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-header border-0 bg-white fw-semibold small d-flex justify-content-between">
              <span>Danh sách ({filtered.length} tài sản)</span>
              {ROLE !== 'admin' && <span className="text-muted"><i className="bi bi-shield-lock me-1"></i>Địa chỉ được mã hóa cho tài sản khác POS (BR-013)</span>}
            </div>
            <div className="card-body p-0" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {loading && (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary"></div>
                  <p className="mt-2 text-muted small">Đang tải dữ liệu kho...</p>
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-inbox fs-2"></i>
                  <p className="mt-2">Không có tài sản nào phù hợp bộ lọc.</p>
                </div>
              )}
              {!loading && filtered.map(p => {
                const masked = maskAddress(p) !== p.address;
                const isSelected = selected?.id === p.id;
                return (
                  <div key={p.id}
                    className={`p-3 border-bottom d-flex align-items-start gap-3 ${isSelected ? 'bg-primary bg-opacity-10' : ''} ${p.level1_status === 'Đã gỡ nguồn' ? 'opacity-50' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(isSelected ? null : p)}>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        <span className="badge bg-dark">{formatLSId(p.id)}</span>
                        <span className={`badge bg-${lv1Color[p.level1_status] || 'secondary'} ${p.level1_status === 'Được đảm bảo' ? 'text-dark' : ''}`}>{p.level1_status}</span>
                        <span className={`badge bg-${lv2Color[p.level2_status] || 'secondary'} ${p.level2_status === 'Khởi tạo' ? 'text-dark border' : ''}`}>{p.level2_status}</span>
                        {p.warehouse_type && <span className="badge bg-light text-dark border">{p.warehouse_type}</span>}
                        <span className={`badge ${p.type === 'Bán' ? 'bg-danger' : 'bg-info text-dark'}`}>{p.type}</span>
                      </div>
                      <div className={`fw-semibold small mb-1 ${masked ? 'text-muted fst-italic' : ''}`}>
                        {masked && <i className="bi bi-shield-lock me-1 text-warning"></i>}
                        {maskAddress(p)}
                      </div>
                      <div className="text-muted small">
                        <span className="me-3">{p.pos_name}</span>
                        <span className="me-3">{p.area}m²</span>
                        <span>{p.price_display}</span>
                      </div>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <div className="small text-muted">{p.createdBy}</div>
                      <div className="small text-muted">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : ''}</div>
                      <i className={`bi bi-chevron-${isSelected ? 'up' : 'right'} small text-muted mt-1`}></i>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="col-md-5">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header border-0 bg-primary text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-building me-1"></i>{formatLSId(selected.id)}</span>
                <button className="btn-close btn-close-white btn-sm" onClick={() => setSelected(null)}></button>
              </div>
              <div className="card-body small" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
                {/* Address */}
                <div className="mb-3">
                  <div className="text-muted mb-1">📍 Địa chỉ</div>
                  {maskAddress(selected) !== selected.address
                    ? <div className="alert alert-warning py-2 px-2"><i className="bi bi-shield-lock me-1"></i>Bị ẩn — BR-013 (tài sản khác POS)</div>
                    : <div className="fw-semibold">{selected.address}</div>
                  }
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
                  <div className="text-muted mb-1">🏠 Thông số kỹ thuật</div>
                  <div className="row g-1">
                    {[
                      ['Loại GD', selected.type], ['Diện tích', `${selected.area}m²`],
                      ['Phòng ngủ', selected.bedrooms], ['Phòng tắm', selected.bathrooms],
                      ['Hướng', selected.direction], ['Pháp lý', selected.legal],
                      ['Giá', selected.price_display], ['Kho', selected.warehouse_type || 'Chưa phân loại'],
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
                    <div><span className="text-muted">GĐ POS:</span> {selected.pos_manager}</div>
                    {selected.approvedBy && <div><span className="text-muted">Duyệt bởi:</span> {selected.approvedBy}</div>}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <div className="text-muted mb-2">📋 Timeline</div>
                  {[
                    { date: selected.createdAt, label: 'Tạo hồ sơ', icon: 'bi-plus-circle', color: '#1976d2' },
                    selected.approvedAt && { date: selected.approvedAt, label: `Duyệt kho bởi ${selected.approvedBy}`, icon: 'bi-check-circle', color: '#388e3c' },
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
