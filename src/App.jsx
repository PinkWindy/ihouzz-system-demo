import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import SalesMobile from './pages/SalesMobile';
import POSDesktop from './pages/POSDesktop';
import Feature1_Login from './pages/Feature1_Login';
import Feature2_Create from './pages/Feature2_Create';
import Feature3_Approval from './pages/Feature3_Approval';
import Feature4_CreateListing from './pages/Feature4_CreateListing';
import Feature5_MKTApproval from './pages/Feature5_MKTApproval';
import Feature6_Unlist from './pages/Feature6_Unlist';
import Feature7_UnlistApproval from './pages/Feature7_UnlistApproval';
import Feature8_Unsource from './pages/Feature8_Unsource';
import Feature9_Warehouse from './pages/Feature9_Warehouse';
import Feature10_IAM from './pages/Feature10_IAM';
import Feature11_Audit from './pages/Feature11_Audit';

function DashboardLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem('user_role') || 'guest';

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    navigate('/login');
  };

  return (
    <div className="d-flex" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <div className="bg-dark text-white p-3" style={{ width: '260px' }}>
        <h4 className="text-primary fw-bold mb-4 mt-2">iHouzz</h4>
        <div className="mb-4">
          <div className="small text-muted text-uppercase fw-bold mb-2">Tài khoản</div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <i className="bi bi-person-circle fs-4"></i>
            <div>
              <div className="fw-semibold">{role}@ihouzz.com</div>
              <div className="badge bg-success">Role: {role.toUpperCase()}</div>
            </div>
          </div>
          <button className="btn btn-outline-light btn-sm w-100" onClick={handleLogout}>Đăng xuất (FR1-011)</button>
        </div>
        
        <div className="small text-muted text-uppercase fw-bold mb-2">Điều hướng (Theo SRS)</div>
        <div className="list-group list-group-flush rounded-0 bg-transparent">
          <Link to="/dashboard" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/dashboard' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-house-door me-2"></i> Tổng quan
          </Link>
          <Link to="/feature2" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature2' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-plus-square me-2"></i> F2: Tạo tài sản
          </Link>
          <Link to="/feature3" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature3' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-check2-square me-2"></i> F3: GĐ POS Duyệt Kho
          </Link>
          <Link to="/feature4" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature4' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-megaphone me-2"></i> F4: Soạn Tin Đăng
          </Link>
          <Link to="/feature5" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature5' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-patch-check me-2"></i> F5: MKT Duyệt Niêm yết
          </Link>
          <Link to="/feature6" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature6' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-sign-stop me-2"></i> F6: Gỡ tin
          </Link>
          <Link to="/feature7" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature7' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-patch-check me-2"></i> F7: Duyệt Gỡ tin
          </Link>
          <Link to="/feature8" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature8' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-x-octagon me-2"></i> F8: Gỡ nguồn
          </Link>

          <div className="mt-3 mb-2 small text-muted text-uppercase fw-bold">Quản trị</div>
          <Link to="/feature9" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature9' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-graph-up me-2"></i> F9: Giám sát Kho
          </Link>
          <Link to="/feature10" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature10' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-people me-2"></i> F10: IAM & POS
          </Link>
          <Link to="/feature11" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature11' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-journal-text me-2"></i> F11: Audit Trail
          </Link>

          <div className="mt-4 mb-2 small text-muted text-uppercase fw-bold">Legacy Demo</div>
          <Link to="/sales" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/sales' ? 'active' : ''}`}>
            <i className="bi bi-phone me-2"></i> Màn hình Đầu chủ (Mobile)
          </Link>
          <Link to="/pos" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/pos' ? 'active' : ''}`}>
            <i className="bi bi-display me-2"></i> Màn hình Quản lý (PC)
          </Link>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-grow-1 bg-light">
        {children}
      </div>
    </div>
  );
}

function DashboardHome() {
  return (
    <div className="p-4">
      <h3 className="fw-bold mb-4">Dashboard Tổng Quan (FR1-004)</h3>
      <div className="alert alert-success">
        ✅ Bạn đã đăng nhập thành công qua hệ thống MFA (Feature 1).<br/>
        Từ Menu bên trái, bạn có thể truy cập các màn hình nghiệp vụ khác (Feature 2 đến 11).
      </div>
      <div className="row mt-4 g-3">
        {[
          { to:'/feature2', label:'F2: Tạo Tài sản', desc:'Sales tạo LS-, kiểm tra trùng địa chỉ, chọn 3 nhánh gửi duyệt.', color:'primary', icon:'bi-plus-square' },
          { to:'/feature3', label:'F3: GĐ POS Duyệt Kho', desc:'GĐ POS duyệt vào Kho chuẩn / Kho đảm bảo hoặc từ chối.', color:'success', icon:'bi-check2-square' },
          { to:'/feature4', label:'F4: Soạn Tin Đăng', desc:'Sales soạn tin từ tài sản đã duyệt. Auto-fill + Preview.', color:'info', icon:'bi-megaphone' },
          { to:'/feature5', label:'F5: MKT Duyệt Niêm yết', desc:'MKT duyệt/từ chối. AUTO-SYNC Level 2 → Đang niêm yết (BR-003).', color:'warning', icon:'bi-patch-check' },
          { to:'/feature6', label:'F6: Gỡ tin', desc:'Sales gửi yêu cầu gỡ tin (UC006). Admin duyệt AUTO-SYNC (UC007, BR-005, BR-010).', color:'danger', icon:'bi-sign-stop' },
          { to:'/feature7', label:'F7: Duyệt Gỡ tin', desc:'MKT/Admin phê duyệt yêu cầu gỡ tin (UC007). FIFO, filter, audit log, reject với lý do.', color:'warning', icon:'bi-patch-check' },
          { to:'/feature8', label:'F8: Gỡ nguồn', desc:'UC008: Đầu chủ gửi yêu cầu gỡ nguồn. UC009: GĐ POS phê duyệt. BR-010 block khi đang niêm yết.', color:'dark', icon:'bi-x-octagon' },
          { to:'/feature9', label:'F9: Giám sát Kho', desc:'UC010: Dashboard kho tổng hợp, lọc, masking địa chỉ BR-013, timeline tài sản.', color:'primary', icon:'bi-graph-up' },
          { to:'/feature10', label:'F10: IAM & POS', desc:'UC011+UC013: Quản trị nhân sự, khóa/mở khóa, vong đời tài khoản, cấu hình POS.', color:'success', icon:'bi-people' },
          { to:'/feature11', label:'F11: Audit Trail', desc:'UC012: Nhật ký vận hành bất biến, chỉ Admin đọc, timeline, export CSV tự tạo log.', color:'secondary', icon:'bi-journal-text' },
        ].map(f => (
          <div key={f.to} className="col-md-4">
            <div className={`card p-4 border-${f.color} border-2 shadow-sm h-100`}>
              <div className={`d-flex align-items-center gap-2 mb-2 text-${f.color}`}>
                <i className={`bi ${f.icon} fs-4`}></i>
                <h5 className="fw-bold mb-0">{f.label}</h5>
              </div>
              <p className="text-muted small">{f.desc}</p>
              <Link to={f.to} className={`btn btn-${f.color} mt-auto`}>Mở {f.label}</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Feature1_Login />} />
        <Route path="/dashboard" element={<DashboardLayout><DashboardHome /></DashboardLayout>} />
        <Route path="/feature2" element={<DashboardLayout><Feature2_Create /></DashboardLayout>} />
        <Route path="/feature3" element={<DashboardLayout><Feature3_Approval /></DashboardLayout>} />
        <Route path="/feature4" element={<DashboardLayout><Feature4_CreateListing /></DashboardLayout>} />
        <Route path="/feature5" element={<DashboardLayout><Feature5_MKTApproval /></DashboardLayout>} />
        <Route path="/feature6" element={<DashboardLayout><Feature6_Unlist /></DashboardLayout>} />
        <Route path="/feature7" element={<DashboardLayout><Feature7_UnlistApproval /></DashboardLayout>} />
        <Route path="/feature8" element={<DashboardLayout><Feature8_Unsource /></DashboardLayout>} />
        <Route path="/feature9" element={<DashboardLayout><Feature9_Warehouse /></DashboardLayout>} />
        <Route path="/feature10" element={<DashboardLayout><Feature10_IAM /></DashboardLayout>} />
        <Route path="/feature11" element={<DashboardLayout><Feature11_Audit /></DashboardLayout>} />
        <Route path="/sales" element={<DashboardLayout><SalesMobile /></DashboardLayout>} />
        <Route path="/pos" element={<DashboardLayout><POSDesktop /></DashboardLayout>} />
      </Routes>
    </Router>
  );
}

export default App;
