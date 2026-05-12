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
import Feature12_Dashboard from './pages/Feature12_Dashboard';
import { hasPermission } from './utils/permissions';

function DashboardLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const userStr = localStorage.getItem('user');
  const userObj2 = userStr ? JSON.parse(userStr) : {};
  let role = userObj2.role || localStorage.getItem('user_role') || 'guest';
  if (role === 'pos') role = 'pos_manager';
  if (role === 'mkt') role = 'marketing';
  const displayName = userObj2.name || `${role}@ihouzz.com`;
  const displayEmail = userObj2.email || `${role}@ihouzz.com`;

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    localStorage.removeItem('user');
    localStorage.removeItem('pos_name');
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
              <div className="fw-semibold" style={{ fontSize: 13 }}>{displayEmail}</div>
              <div className="badge bg-success">Role: {role.toUpperCase()}</div>
            </div>
          </div>
          <button className="btn btn-outline-light btn-sm w-100" onClick={handleLogout}>Đăng xuất (FR1-011)</button>
        </div>
        
        <div className="small text-muted text-uppercase fw-bold mb-2">Điều hướng (Theo SRS)</div>
        <div className="list-group list-group-flush rounded-0 bg-transparent">
          <Link to="/dashboard" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/dashboard' ? 'active fw-bold' : ''}`}>
            <i className="bi bi-pie-chart-fill me-2"></i> F12: Báo Cáo Tổng Hợp
          </Link>
          {/* Menu F2 */}
          {(role === 'admin' || (role === 'sales' && hasPermission(role, 'PROPERTY_CREATE'))) && (
            <Link to="/feature2" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature2' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-plus-square me-2"></i> F2: Tạo tài sản
            </Link>
          )}
          {/* Menu F3 */}
          {(role === 'admin' || role === 'pos_manager') && (
            <Link to="/feature3" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature3' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-check2-square me-2"></i> F3: GĐ POS Duyệt Kho
            </Link>
          )}
          {/* Menu F4 */}
          {(role === 'admin' || (role === 'sales' && hasPermission(role, 'LISTING_CREATE'))) && (
            <Link to="/feature4" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature4' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-megaphone me-2"></i> F4: Soạn tin & gửi duyệt (UC004)
            </Link>
          )}
          {/* Menu F5 — Admin+MKT duyệt, Sales chỉ xem */}
          {(role === 'admin' || role === 'marketing' || role === 'sales') && (
            <Link to="/feature5" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature5' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-patch-check me-2"></i> F5: Trung tâm duyệt niêm yết (UC005)
            </Link>
          )}
          {/* Menu F6 */}
          {(role === 'admin' || role === 'sales') && (
            <Link to="/feature6" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature6' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-sign-stop me-2"></i> F6: Gỡ tin
            </Link>
          )}
          {/* Menu F7 */}
          {(role === 'admin' || role === 'marketing') && (
            <Link to="/feature7" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature7' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-patch-check me-2"></i> F7: Duyệt Gỡ tin
            </Link>
          )}
          {/* Menu F8 */}
          {(role === 'admin' || role === 'sales' || role === 'pos_manager') && (
            <Link to="/feature8" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature8' ? 'active fw-bold' : ''}`}>
              <i className="bi bi-x-octagon me-2"></i> F8: Gỡ nguồn
            </Link>
          )}

          {/* Quản trị */}
          {(role === 'admin' || role === 'pos_manager' || role === 'marketing' || role === 'sales') && (
            <>
              <div className="mt-3 mb-2 small text-muted text-uppercase fw-bold">Quản trị</div>
              {/* F9: Tất cả role đều thấy */}
              {(role === 'admin' || hasPermission(role, 'PROPERTY_VIEW_LIST')) && (
              <Link to="/feature9" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature9' ? 'active fw-bold' : ''}`}>
                <i className="bi bi-graph-up me-2"></i> F9: Giám sát Kho
              </Link>
              )}
              {(role === 'admin' || role === 'pos_manager') && (
                <Link to="/feature10" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature10' ? 'active fw-bold' : ''}`}>
                  <i className="bi bi-people me-2"></i> F10: IAM & POS
                </Link>
              )}
              {role === 'admin' && (
                <Link to="/feature11" className={`list-group-item list-group-item-action bg-transparent text-white border-secondary ${location.pathname === '/feature11' ? 'active fw-bold' : ''}`}>
                  <i className="bi bi-journal-text me-2"></i> F11: Audit Trail
                </Link>
              )}
            </>
          )}

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
      <div className="flex-grow-1 bg-light d-flex flex-column" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Top Navbar */}
        <div className="bg-white border-bottom px-4 py-2 d-flex justify-content-end align-items-center shadow-sm" style={{ height: '60px' }}>
          <div className="text-end">
            <div className="fw-bold text-primary">{userObj2.name || 'User'}</div>
            <div className="small text-muted"><i className="bi bi-geo-alt-fill me-1 text-danger"></i>{userObj2.pos_name || (role === 'admin' ? 'Toàn quyền hệ thống' : 'Marketing Dept.')}</div>
          </div>
          <div className="ms-3 rounded-circle bg-primary bg-gradient text-white d-flex align-items-center justify-content-center fw-bold shadow" style={{ width: 42, height: 42, fontSize: 18, border: '2px solid #fff' }}>
            {(userObj2.name || 'U')[0].toUpperCase()}
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
          {children}
        </div>
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
        <Route path="/dashboard" element={<DashboardLayout><Feature12_Dashboard /></DashboardLayout>} />
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
