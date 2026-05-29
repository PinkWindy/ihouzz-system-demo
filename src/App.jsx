import { useEffect } from 'react';
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
import Feature_Diagrams from './pages/Feature_Diagrams';
import { hasPermission, canViewDashboard } from './utils/permissions';
import {
  postEntityAudit,
  AUDIT_ACTION_TYPE,
  readSessionUser,
  notifySessionChanged,
  accountAuditEntityId,
  touchAuthSessionActivity,
  clearAuthSessionActivityKeys,
  readDemoIdleSessionMs,
} from './utils/listingWorkflow';
import { normalizeUserId } from './utils/userId';

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
    const u = readSessionUser();
    const uidRaw = normalizeUserId(u.id) ?? u.id;
    const uidStr = uidRaw != null && String(uidRaw).trim() !== '' ? String(uidRaw) : '';
    const em = String(u.email || displayEmail || '').trim().toLowerCase();
    void postEntityAudit({
      action: 'Đăng xuất',
      actionType: AUDIT_ACTION_TYPE.AUTH_LOGOUT,
      entityId: accountAuditEntityId(em),
      user: u.name || em || displayName || '—',
      user_id: uidStr,
      detail: 'DashboardLayout',
    }).catch(() => {});
    clearAuthSessionActivityKeys();
    localStorage.removeItem('user_role');
    localStorage.removeItem('user');
    localStorage.removeItem('pos_name');
    notifySessionChanged();
    navigate('/login');
  };

  useEffect(() => {
    if (!userStr || role === 'guest') return undefined;

    touchAuthSessionActivity();

    const bump = () => touchAuthSessionActivity();
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('scroll', bump, true);

    const tickMs = 20_000;
    const id = setInterval(() => {
      if (!localStorage.getItem('user')) return;
      const raw = sessionStorage.getItem('ihouzz_last_activity');
      const last = raw ? parseInt(raw, 10) : 0;
      if (!Number.isFinite(last) || last <= 0) return;

      const idleMs = readDemoIdleSessionMs();
      const elapsed = Date.now() - last;
      const warnLead =
        idleMs > 6 * 60 * 1000 ? 5 * 60 * 1000 : Math.max(15_000, Math.floor(idleMs / 4));
      const warnAfter = Math.max(0, idleMs - warnLead);

      if (elapsed >= warnAfter && elapsed < idleMs && !sessionStorage.getItem('ihouzz_idle_warned')) {
        try {
          sessionStorage.setItem('ihouzz_idle_warned', '1');
        } catch {
          /* ignore */
        }
        window.alert(
          'Phiên làm việc sắp hết hạn do không hoạt động. Bấm OK để ghi nhận tương tác và gia hạn.',
        );
        touchAuthSessionActivity();
        return;
      }

      if (elapsed < idleMs) return;

      const u = readSessionUser();
      const uidRaw = normalizeUserId(u.id) ?? u.id;
      const uidStr = uidRaw != null && String(uidRaw).trim() !== '' ? String(uidRaw) : '';
      const em = String(u.email || displayEmail || '').trim().toLowerCase();
      void postEntityAudit({
        action: 'Phiên hết hạn — không hoạt động (idle)',
        actionType: AUDIT_ACTION_TYPE.AUTH_SESSION_EXPIRED,
        entityId: accountAuditEntityId(em),
        user: u.name || em || displayName || '—',
        user_id: uidStr,
        detail: `idle_threshold_ms=${idleMs}`,
        reason: 'idle_timeout',
      }).catch(() => {});

      clearAuthSessionActivityKeys();
      localStorage.removeItem('user_role');
      localStorage.removeItem('user');
      localStorage.removeItem('pos_name');
      notifySessionChanged();
      navigate('/login');
    }, tickMs);

    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('scroll', bump, true);
      clearInterval(id);
    };
  }, [userStr, role, navigate, displayEmail, displayName]);

  const navLink = (path) =>
    `ih-sidebar-link ${location.pathname === path ? 'ih-sidebar-link--active' : ''}`;

  const routeContext =
    {
      '/dashboard': 'F12 · Báo cáo tổng hợp',
      '/feature2': 'F2 · Tạo tài sản',
      '/feature3': 'F3 · GĐ POS duyệt kho',
      '/feature4': 'F4 · Soạn tin & gửi duyệt',
      '/feature5': 'F5 · Duyệt niêm yết',
      '/feature6': 'F6 · Gỡ tin',
      '/feature7': 'F7 · Duyệt gỡ tin',
      '/feature8': 'F8 · Gỡ nguồn',
      '/feature9': 'F9 · Giám sát kho',
      '/feature10': 'F10 · IAM & POS',
      '/feature11': 'Nhật ký thao tác',
      '/diagrams': 'Tài liệu · Sơ đồ Hệ thống',
      '/sales': 'Legacy · Mobile đầu chủ',
      '/pos': 'Legacy · Quản lý PC',
    }[location.pathname] || 'Bản demo';

  const roleLabel =
    role === 'sales' ? 'Đầu chủ' : role === 'pos_manager' ? 'GĐ POS' : role === 'marketing' ? 'Marketing' : role;

  return (
    <div className="ih-app-shell d-flex">
      <aside className="ih-sidebar" aria-label="Điều hướng chính">
        <div className="ih-sidebar-brand">
          <div className="ih-sidebar-brand-mark" aria-hidden>
            iH
          </div>
          <div>
            <div className="ih-sidebar-brand-text">iHouzz</div>
            <div className="ih-sidebar-brand-sub">Bản demo nội bộ</div>
          </div>
        </div>

        <div className="ih-sidebar-user">
          <div className="ih-sidebar-section mb-2 mt-0">Tài khoản</div>
          <div className="ih-sidebar-user-email">{displayEmail}</div>
          <div className="ih-sidebar-user-meta">
            <span className="badge bg-primary bg-opacity-75">Vai trò · {roleLabel}</span>
          </div>
          <button type="button" className="btn btn-outline-light btn-sm w-100 mt-3" onClick={handleLogout}>
            Đăng xuất
          </button>
          <div className="ih-sidebar-qa-hint">
            QA phiên idle: <code>localStorage.ihouzz_demo_idle_ms</code> (ms, tối thiểu <strong>60000</strong>). Mặc định
            60 phút (mặc định).
          </div>
        </div>

        <nav className="ih-sidebar-scroll d-flex flex-column gap-1 pb-2" aria-label="Chức năng chính">
          <div className="ih-sidebar-section">Nghiệp vụ</div>
          {canViewDashboard(role) && (
            <Link to="/dashboard" className={navLink('/dashboard')} aria-current={location.pathname === '/dashboard' ? 'page' : undefined}>
              <i className="bi bi-pie-chart-fill" aria-hidden />
              F12 · Báo cáo tổng hợp
            </Link>
          )}
          {(role === 'admin' || (role === 'sales' && hasPermission(role, 'PROPERTY_CREATE'))) && (
            <Link to="/feature2" className={navLink('/feature2')} aria-current={location.pathname === '/feature2' ? 'page' : undefined}>
              <i className="bi bi-plus-square" aria-hidden />
              F2 · Tạo tài sản
            </Link>
          )}
          {(role === 'admin' || role === 'pos_manager') && (
            <Link to="/feature3" className={navLink('/feature3')} aria-current={location.pathname === '/feature3' ? 'page' : undefined}>
              <i className="bi bi-check2-square" aria-hidden />
              F3 · GĐ POS duyệt kho
            </Link>
          )}
          {(role === 'admin' || (role === 'sales' && hasPermission(role, 'LISTING_CREATE'))) && (
            <Link to="/feature4" className={navLink('/feature4')} aria-current={location.pathname === '/feature4' ? 'page' : undefined}>
              <i className="bi bi-megaphone" aria-hidden />
              F4 · Soạn tin & gửi duyệt
            </Link>
          )}
          {(role === 'admin' || role === 'marketing' || role === 'sales') && (
            <Link to="/feature5" className={navLink('/feature5')} aria-current={location.pathname === '/feature5' ? 'page' : undefined}>
              <i className="bi bi-patch-check" aria-hidden />
              F5 · Duyệt niêm yết
            </Link>
          )}
          {(role === 'admin' || role === 'sales') && (
            <Link to="/feature6" className={navLink('/feature6')} aria-current={location.pathname === '/feature6' ? 'page' : undefined}>
              <i className="bi bi-sign-stop" aria-hidden />
              F6 · Gỡ tin
            </Link>
          )}
          {(role === 'admin' || role === 'marketing') && (
            <Link to="/feature7" className={navLink('/feature7')} aria-current={location.pathname === '/feature7' ? 'page' : undefined}>
              <i className="bi bi-patch-check" aria-hidden />
              F7 · Duyệt gỡ tin
            </Link>
          )}
          {(role === 'admin' || role === 'sales' || role === 'pos_manager') && (
            <Link to="/feature8" className={navLink('/feature8')} aria-current={location.pathname === '/feature8' ? 'page' : undefined}>
              <i className="bi bi-x-octagon" aria-hidden />
              F8 · Gỡ nguồn
            </Link>
          )}

          {(role === 'admin' || role === 'pos_manager' || role === 'marketing' || role === 'sales') && (
            <>
              <div className="ih-sidebar-section">Quản trị</div>
              {(role === 'admin' || hasPermission(role, 'PROPERTY_VIEW_LIST')) && (
                <Link to="/feature9" className={navLink('/feature9')} aria-current={location.pathname === '/feature9' ? 'page' : undefined}>
                  <i className="bi bi-graph-up" aria-hidden />
                  F9 · Giám sát kho
                </Link>
              )}
              {(role === 'admin' || role === 'pos_manager') && (
                <Link to="/feature10" className={navLink('/feature10')} aria-current={location.pathname === '/feature10' ? 'page' : undefined}>
                  <i className="bi bi-people" aria-hidden />
                  F10 · IAM & POS
                </Link>
              )}
              {role === 'admin' && (
                <Link to="/feature11" className={navLink('/feature11')} aria-current={location.pathname === '/feature11' ? 'page' : undefined}>
                  <i className="bi bi-journal-text" aria-hidden />
                  Nhật ký thao tác
                </Link>
              )}
            </>
          )}

          <div className="ih-sidebar-section">Tài liệu & Demo</div>
          <Link to="/diagrams" className={navLink('/diagrams')} aria-current={location.pathname === '/diagrams' ? 'page' : undefined}>
            <i className="bi bi-diagram-3" aria-hidden />
            Sơ đồ Hệ thống
          </Link>
          <Link to="/sales" className={navLink('/sales')} aria-current={location.pathname === '/sales' ? 'page' : undefined}>
            <i className="bi bi-phone" aria-hidden />
            Mobile đầu chủ
          </Link>
          <Link to="/pos" className={navLink('/pos')} aria-current={location.pathname === '/pos' ? 'page' : undefined}>
            <i className="bi bi-display" aria-hidden />
            Quản lý PC
          </Link>
        </nav>
      </aside>

      <div className="ih-main">
        <header className="ih-topbar">
          <div className="ih-topbar-title d-none d-sm-block">
            <strong>{routeContext}</strong>
            <span className="text-muted fw-normal"> · iHouzz demo</span>
          </div>
          <div className="d-sm-none ih-topbar-title">
            <strong>iHouzz</strong>
          </div>
          <div className="ih-topbar-user">
            <div>
              <div className="ih-topbar-name">{userObj2.name || 'Người dùng'}</div>
              <div className="ih-topbar-meta text-truncate">
                <i className="bi bi-geo-alt text-primary me-1" aria-hidden />
                {userObj2.pos_name || (role === 'admin' ? 'Toàn hệ thống' : 'Phòng Marketing')}
              </div>
            </div>
            <div className="ih-avatar" aria-hidden>
              {(userObj2.name || 'U')[0].toUpperCase()}
            </div>
          </div>
        </header>

        <div className="ih-main-scroll">{children}</div>
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
        <Route path="/diagrams" element={<DashboardLayout><Feature_Diagrams /></DashboardLayout>} />
        <Route path="/sales" element={<DashboardLayout><SalesMobile /></DashboardLayout>} />
        <Route path="/pos" element={<DashboardLayout><POSDesktop /></DashboardLayout>} />
      </Routes>
    </Router>
  );
}

export default App;
