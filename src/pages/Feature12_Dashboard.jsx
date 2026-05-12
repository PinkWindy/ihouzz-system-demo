import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatPropertyId } from '../utils/listingWorkflow';
import { shouldMaskAddress } from '../utils/permissions';

const API = 'http://localhost:5000';
const userStr = localStorage.getItem('user');
const userObj = userStr ? JSON.parse(userStr) : {};
const rawRole = userObj.role || 'admin';
const ROLE = rawRole === 'pos' ? 'pos_manager' : rawRole === 'mkt' ? 'marketing' : rawRole;
const DEFAULT_POS_NAME = ROLE === 'admin' ? null : (userObj.pos_name || '');
const USER_ID = userObj.id || '';
const rawPidDash = userObj.pos_id;
const POS_ID_DASH =
  rawPidDash === '' || rawPidDash == null ? null : Number(rawPidDash);
const POS_ID_SAFE = Number.isNaN(POS_ID_DASH) ? null : POS_ID_DASH;

export default function Feature12_Dashboard() {
  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [posList, setPosList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPos, setSelectedPos] = useState(ROLE === 'admin' ? 'ALL' : DEFAULT_POS_NAME);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [p, u, pos] = await Promise.all([
      fetch(`${API}/properties`).then(r => r.json()),
      fetch(`${API}/users`).then(r => r.json()),
      fetch(`${API}/pos`).then(r => r.json()).catch(() => [])
    ]);
    setProperties(p);
    setUsers(u);
    setPosList(pos);
    setLoading(false);
  };

  // Lọc tài sản: sales chỉ thấy của mình, pos_manager thấy của POS, admin tùy chọn
  const filteredProps = (() => {
    if (ROLE === 'sales') return properties.filter(p => p.createdBy_id === USER_ID);
    if (selectedPos === 'ALL') return properties;
    return properties.filter(p => p.pos_name === selectedPos);
  })();

  const filteredUsers = selectedPos === 'ALL' ? users : users.filter(u => u.pos_name === selectedPos);

  // Bảng "Mới cập nhật" — sales chỉ thấy tài sản của mình
  const recentItems = filteredProps
    .slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);

  const stats = {
    totalProps: filteredProps.length,
    activeProps: filteredProps.filter(p => p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo').length,
    listedProps: filteredProps.filter(p => p.level2_status === 'Đang niêm yết').length,
    totalUsers: filteredUsers.length,
    activeUsers: filteredUsers.filter(u => u.status === 'active').length,
  };

  const typeData = {
    ban: filteredProps.filter(p => p.type === 'Bán').length,
    thue: filteredProps.filter(p => p.type === 'Thuê').length
  };

  if (loading) {
    return <div className="p-5 text-center text-muted"><div className="spinner-border text-primary"></div><div className="mt-2">Đang tải báo cáo...</div></div>;
  }

  return (
    <div className="p-4" style={{ background: '#f5f7fa', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold mb-1" style={{ color: '#0d47a1' }}>
            <i className="bi bi-pie-chart-fill me-2"></i>Dashboard Báo Cáo Tổng Hợp
          </h3>
          <div className="text-muted small">FR1-004: Thống kê hiệu suất kinh doanh</div>
        </div>
        
        {ROLE === 'admin' && (
          <div className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
            <i className="bi bi-filter-circle text-primary fs-5"></i>
            <span className="fw-semibold small text-nowrap">Lọc theo POS:</span>
            <select className="form-select form-select-sm border-0 bg-light" style={{ width: 200 }} 
              value={selectedPos} onChange={e => setSelectedPos(e.target.value)}>
              <option value="ALL">Tất cả chi nhánh (Toàn quốc)</option>
              {posList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        )}
        {ROLE !== 'admin' && (
          <div className="bg-white px-4 py-2 rounded shadow-sm border-start border-4 border-primary">
            <span className="text-muted small me-2">Đang xem báo cáo của:</span>
            <strong className="text-primary">{selectedPos}</strong>
          </div>
        )}
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100 bg-primary text-white p-4" style={{ borderRadius: 15 }}>
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <div className="small text-white-50 text-uppercase fw-bold mb-1">Tổng Tài Sản</div>
                <h2 className="display-5 fw-bold mb-0">{stats.totalProps}</h2>
              </div>
              <div className="bg-white bg-opacity-25 rounded p-2"><i className="bi bi-building fs-3"></i></div>
            </div>
            <div className="mt-3 pt-3 border-top border-white border-opacity-25 small">
              <i className="bi bi-check-circle me-1"></i>{stats.activeProps} tài sản đã duyệt vào kho
            </div>
          </div>
        </div>
        
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100 bg-success text-white p-4" style={{ borderRadius: 15 }}>
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <div className="small text-white-50 text-uppercase fw-bold mb-1">Đang Niêm Yết</div>
                <h2 className="display-5 fw-bold mb-0">{stats.listedProps}</h2>
              </div>
              <div className="bg-white bg-opacity-25 rounded p-2"><i className="bi bi-broadcast fs-3"></i></div>
            </div>
            <div className="mt-3 pt-3 border-top border-white border-opacity-25 small">
              <i className="bi bi-graph-up-arrow me-1"></i>Sẵn sàng giao dịch trên Web/App
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100 bg-warning text-dark p-4" style={{ borderRadius: 15 }}>
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <div className="small text-black-50 text-uppercase fw-bold mb-1">Tỷ lệ Bán / Thuê</div>
                <h2 className="display-5 fw-bold mb-0">{typeData.ban}<span className="fs-5 text-black-50 mx-1">/</span>{typeData.thue}</h2>
              </div>
              <div className="bg-dark bg-opacity-10 rounded p-2"><i className="bi bi-pie-chart fs-3"></i></div>
            </div>
            <div className="mt-3 pt-3 border-top border-dark border-opacity-10 small">
              <i className="bi bi-tags me-1"></i>Phân bổ nguồn hàng
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100 bg-dark text-white p-4" style={{ borderRadius: 15 }}>
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <div className="small text-white-50 text-uppercase fw-bold mb-1">Nhân sự POS</div>
                <h2 className="display-5 fw-bold mb-0">{stats.totalUsers}</h2>
              </div>
              <div className="bg-white bg-opacity-25 rounded p-2"><i className="bi bi-people fs-3"></i></div>
            </div>
            <div className="mt-3 pt-3 border-top border-white border-opacity-25 small">
              <i className="bi bi-person-check me-1"></i>{stats.activeUsers} nhân sự đang hoạt động
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-md-8">
          <div className="card border-0 shadow-sm p-4 h-100" style={{ borderRadius: 15 }}>
            <h5 className="fw-bold mb-4"><i className="bi bi-grid me-2 text-primary"></i>Hệ sinh thái tính năng iHouzz</h5>
            <div className="row g-3">
              {[
                { id: 'F2', role: ['admin','sales'], to:'/feature2', label:'Tạo Tài sản', color:'primary', icon:'bi-plus-square' },
                { id: 'F3', role: ['admin','pos_manager'], to:'/feature3', label:'Duyệt Kho', color:'success', icon:'bi-check2-square' },
                { id: 'F4', role: ['admin','sales'], to:'/feature4', label:'Soạn Tin Đăng', color:'info', icon:'bi-megaphone' },
                { id: 'F5', role: ['admin','marketing'], to:'/feature5', label:'Duyệt Niêm yết', color:'warning', icon:'bi-patch-check' },
                { id: 'F6', role: ['admin','sales'], to:'/feature6', label:'Gỡ tin', color:'danger', icon:'bi-sign-stop' },
                { id: 'F7', role: ['admin','marketing'], to:'/feature7', label:'Duyệt Gỡ tin', color:'warning', icon:'bi-patch-check' },
                { id: 'F8', role: ['admin','sales','pos_manager'], to:'/feature8', label:'Gỡ nguồn', color:'dark', icon:'bi-x-octagon' },
                { id: 'F9', role: ['admin','sales','pos_manager','marketing'], to:'/feature9', label:'Giám sát Kho', color:'primary', icon:'bi-graph-up' },
                { id: 'F10', role: ['admin','pos_manager'], to:'/feature10', label:'IAM & POS', color:'success', icon:'bi-people' },
                { id: 'F11', role: ['admin'], to:'/feature11', label:'Audit Trail', color:'secondary', icon:'bi-journal-text' },
              ].filter(f => f.role.includes(ROLE === 'pos_manager' ? 'pos_manager' : ROLE)).map(f => (
                <div key={f.to} className="col-md-4">
                  <Link to={f.to} className={`d-flex align-items-center gap-3 p-3 rounded text-decoration-none border border-${f.color} border-opacity-25 bg-light hover-shadow transition-all`}>
                    <div className={`bg-${f.color} bg-opacity-10 text-${f.color} rounded p-2`}>
                      <i className={`bi ${f.icon} fs-5`}></i>
                    </div>
                    <div>
                      <div className="fw-bold text-dark">{f.id}</div>
                      <div className="small text-muted">{f.label}</div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-4 h-100" style={{ borderRadius: 15 }}>
            <h5 className="fw-bold mb-4"><i className="bi bi-clock-history me-2 text-danger"></i>Mới cập nhật gần đây</h5>
            <div className="d-flex flex-column gap-3">
              {recentItems.map(p => (
                <div key={p.id} className="d-flex gap-3 align-items-start border-bottom pb-3">
                  <div className="bg-light rounded p-2 text-center" style={{ width: 50 }}>
                    <i className="bi bi-building text-primary"></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold small text-primary">{formatPropertyId(p.id)}</div>
                    <div className="small text-muted mb-1 text-truncate" style={{ maxWidth: 200 }}>
                      {shouldMaskAddress(ROLE, p, POS_ID_SAFE, DEFAULT_POS_NAME || '')
                        ? '*** Địa chỉ ẩn (BR-013)'
                        : p.address}
                    </div>
                    <span className="badge bg-secondary" style={{ fontSize: 10 }}>{p.level1_status || p.statusLv1}</span>
                  </div>
                </div>
              ))}
              {recentItems.length === 0 && <div className="text-muted small">Chưa có tài sản nào.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
