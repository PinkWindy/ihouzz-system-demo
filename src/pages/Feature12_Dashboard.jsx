import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatPropertyId,
  readSessionUser,
  API,
  SESSION_CHANGED_EVENT,
} from '../utils/listingWorkflow';
import { shouldMaskAddress, formatPropertyPriceDisplay, canViewDashboard } from '../utils/permissions';
import { sameUserId } from '../utils/userId';

function normalizeRole(role) {
  if (role === 'pos') return 'pos_manager';
  if (role === 'mkt') return 'marketing';
  return role || 'guest';
}

function samePos(entity, posId, posName) {
  if (posId != null && entity?.pos_id != null && entity.pos_id !== '') {
    return Number(entity.pos_id) === Number(posId);
  }
  if (posName && entity?.pos_name) return entity.pos_name === posName;
  return false;
}

function propertyByUser(prop, userId, userName, userEmail) {
  if (userId && sameUserId(prop.createdBy_id, userId)) return true;
  if (userName && prop.createdBy === userName) return true;
  if (userEmail && prop.createdBy_email === userEmail) return true;
  return false;
}

function passesDateRange(prop, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const day = (prop.createdAt || '').slice(0, 10);
  if (!day) return false;
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

/** Đồng bộ F9 — Lv2 hiển thị khi có tin Đã duyệt nhưng DB property chưa PATCH. */
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

function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Ngày local YYYY-MM-DD — đồng bộ F9/F11. */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF12DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

export default function Feature12_Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readSessionUser());
  const userObj = user;
  const ROLE = normalizeRole(userObj.role);
  const DEFAULT_POS_NAME = ROLE === 'admin' || ROLE === 'marketing' ? null : userObj.pos_name || '';
  const USER_ID = userObj.id || '';
  const USER_NAME = userObj.name || '';
  const USER_EMAIL = userObj.email || '';
  const rawPidDash = userObj.pos_id;
  const POS_ID_DASH = rawPidDash === '' || rawPidDash == null ? null : Number(rawPidDash);
  const POS_ID_SAFE = Number.isNaN(POS_ID_DASH) ? null : POS_ID_DASH;

  const { from: f12From0, to: f12To0 } = defaultF12DateRange();
  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [posList, setPosList] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPos, setSelectedPos] = useState(
    ROLE === 'admin' || ROLE === 'marketing' ? 'ALL' : DEFAULT_POS_NAME,
  );
  const [selectedStaff, setSelectedStaff] = useState('ALL');
  const [dateFrom, setDateFrom] = useState(f12From0);
  const [dateTo, setDateTo] = useState(f12To0);

  useEffect(() => {
    const bump = () => setUser(readSessionUser());
    window.addEventListener('storage', bump);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
    };
  }, []);

  const identityKeyRef = useRef('');
  useEffect(() => {
    const k = `${USER_ID}|${ROLE}|${DEFAULT_POS_NAME || ''}`;
    if (identityKeyRef.current === k) return;
    identityKeyRef.current = k;
    setSelectedPos(ROLE === 'admin' || ROLE === 'marketing' ? 'ALL' : DEFAULT_POS_NAME || '');
    setSelectedStaff('ALL');
    const r = defaultF12DateRange();
    setDateFrom(r.from);
    setDateTo(r.to);
  }, [USER_ID, ROLE, DEFAULT_POS_NAME]);

  const allowDashboard = canViewDashboard(ROLE);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRaw, uRaw, posRaw, lstRaw] = await Promise.all([
        fetch(`${API}/properties`).then((r) => r.json()),
        fetch(`${API}/users`).then((r) => r.json()),
        fetch(`${API}/pos`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/listings`).then((r) => r.json()).catch(() => []),
      ]);
      setProperties(normalizeJsonList(pRaw));
      setUsers(normalizeJsonList(uRaw));
      setPosList(normalizeJsonList(posRaw));
      setListings(normalizeJsonList(lstRaw));
    } catch {
      setProperties([]);
      setUsers([]);
      setPosList([]);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const posStaffList = useMemo(() => {
    if (ROLE !== 'pos_manager') return [];
    return users.filter(
      (u) => u.role === 'sales' && samePos(u, POS_ID_SAFE, DEFAULT_POS_NAME),
    );
  }, [users, ROLE, POS_ID_SAFE, DEFAULT_POS_NAME]);

  const scopedProps = useMemo(() => {
    let rows = properties;

    if (ROLE === 'sales') {
      rows = rows.filter((p) => propertyByUser(p, USER_ID, USER_NAME, USER_EMAIL));
    } else if (ROLE === 'pos_manager') {
      rows = rows.filter((p) => samePos(p, POS_ID_SAFE, DEFAULT_POS_NAME));
      if (selectedStaff !== 'ALL') {
        const staff = users.find((u) => u.id === selectedStaff);
        rows = rows.filter((p) => propertyByUser(p, selectedStaff, staff?.name, staff?.email));
      }
    } else if (ROLE === 'admin' || ROLE === 'marketing') {
      if (selectedPos !== 'ALL') {
        rows = rows.filter((p) => p.pos_name === selectedPos);
      }
    }

    return rows.filter((p) => passesDateRange(p, dateFrom, dateTo));
  }, [
    properties,
    users,
    ROLE,
    USER_ID,
    USER_NAME,
    USER_EMAIL,
    POS_ID_SAFE,
    DEFAULT_POS_NAME,
    selectedPos,
    selectedStaff,
    dateFrom,
    dateTo,
  ]);

  const filteredUsers = useMemo(() => {
    if (ROLE === 'sales') {
      return users.filter((u) => u.id === USER_ID || u.name === USER_NAME);
    }
    if (ROLE === 'pos_manager') {
      let list = users.filter((u) => samePos(u, POS_ID_SAFE, DEFAULT_POS_NAME) && u.role === 'sales');
      if (selectedStaff !== 'ALL') list = list.filter((u) => u.id === selectedStaff);
      return list;
    }
    if (selectedPos === 'ALL') return users;
    return users.filter((u) => u.pos_name === selectedPos);
  }, [users, ROLE, USER_ID, USER_NAME, POS_ID_SAFE, DEFAULT_POS_NAME, selectedPos, selectedStaff]);

  const scopeLabel = useMemo(() => {
    if (ROLE === 'sales') return `Cá nhân — ${USER_NAME || 'Đầu chủ'}`;
    if (ROLE === 'pos_manager') {
      const staff = selectedStaff === 'ALL'
        ? 'Tất cả nhân viên'
        : users.find((u) => u.id === selectedStaff)?.name || '—';
      return `${DEFAULT_POS_NAME || 'POS'} · ${staff}`;
    }
    if (ROLE === 'admin' || ROLE === 'marketing') {
      return selectedPos === 'ALL' ? 'Toàn hệ thống' : selectedPos;
    }
    return DEFAULT_POS_NAME || '—';
  }, [ROLE, USER_NAME, DEFAULT_POS_NAME, selectedStaff, selectedPos, users]);

  const recentItems = scopedProps
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);

  const stats = useMemo(
    () => ({
      totalProps: scopedProps.length,
      activeProps: scopedProps.filter(
        (p) => p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo',
      ).length,
      listedProps: scopedProps.filter((p) => effectiveLevel2Status(p, listings) === 'Đang niêm yết').length,
      totalUsers: filteredUsers.length,
      activeUsers: filteredUsers.filter((u) => u.status === 'active').length,
    }),
    [scopedProps, filteredUsers, listings],
  );

  const typeData = useMemo(
    () => ({
      ban: scopedProps.filter((p) => p.type === 'Bán').length,
      thue: scopedProps.filter((p) => p.type === 'Thuê').length,
    }),
    [scopedProps],
  );

  const statusCounts = useMemo(() => {
    const total = scopedProps.length;
    if (total === 0) return { approved: 0, processing: 0, pending: 0 };
    const approved = scopedProps.filter(
      (p) => p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo' || p.level1_status === 'KH đã ký',
    ).length;
    const pending = scopedProps.filter(
      (p) => p.level1_status === 'Chờ POS duyệt' || p.level1_status === 'Chờ duyệt đảm bảo',
    ).length;
    const processing = total - approved - pending;
    return { approved, processing, pending };
  }, [scopedProps]);

  const statusPercents = useMemo(() => {
    const total = scopedProps.length;
    if (total === 0) return { approved: 0, processing: 0, pending: 0 };
    const approved = Math.round((statusCounts.approved / total) * 100);
    const pending = Math.round((statusCounts.pending / total) * 100);
    const processing = 100 - approved - pending;
    return { approved, processing, pending };
  }, [statusCounts, scopedProps]);

  const posAllocation = useMemo(() => {
    const total = scopedProps.length;
    if (total === 0) return [];
    const groups = {};
    scopedProps.forEach((p) => {
      const name = p.pos_name || 'Chưa phân POS';
      groups[name] = (groups[name] || 0) + 1;
    });
    return Object.entries(groups)
      .map(([posName, count]) => ({
        posName,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [scopedProps]);

  const pendingListingsCount = useMemo(() => {
    const scopedPropIds = new Set(scopedProps.map((p) => p.id));
    return listings.filter(
      (l) =>
        scopedPropIds.has(l.property_id) &&
        (l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa' || l.listing_status === 'Yêu cầu gỡ tin'),
    ).length;
  }, [listings, scopedProps]);


  const drillToF9 = useCallback(
    (preset) => {
      const state = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
      if (preset === 'approved') {
        state.filterLv1 = 'Được duyệt';
      } else if (preset === 'listed') {
        state.filterListing = 'Đã duyệt';
      }
      navigate('/feature9', { state });
    },
    [navigate, dateFrom, dateTo],
  );

  const handleExportDashboard = () => {
    const formatDt = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const header = [
      'Mã tài sản',
      'Loại',
      'Giá',
      'Địa chỉ',
      'Trạng thái Kho',
      'Trạng thái Niêm yết',
      'POS',
      'Người tạo',
      'Thời gian tạo',
      'Người quản lý tài sản',
      'Người duyệt LV1 (Giám đốc Pos)',
      'Thời gian duyệt',
      'Người duyệt lv2 (nhân viên marketing duyệt tin đăng)',
      'Thời gian duyệt đăng tin',
      'Thời gian hết hạn tin đăng',
      'Người cập nhật tài sản',
      'Thời gian đề xuất',
      'Người duyệt cập nhật tài sản',
      'Thời gian duyệt cập nhật tài sản',
      'Người đề xuất Gỡ tin đăng',
      'Thời gian gửi đề xuất gỡ tin',
      'Người duyệt Gỡ tin',
      'Thời gian duyệt gỡ tin',
      'Người đề xuất Gỡ nguồn',
      'Thời gian đề xuất Gỡ nguồn',
      'Người duyệt đề xuất Gỡ nguồn',
      'Thời gian duyệt đề xuất Gỡ nguồn',
    ];

    const csv = [header.join(',')];

    scopedProps.forEach((p) => {
      const lsts = listings.filter(
        (l) => String(l.property_id) === String(p.id) || String(l.property_id) === String(p.propertyCode),
      );
      lsts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const l = lsts.length > 0 ? lsts[0] : {};

      const row = [
        formatPropertyId(p.propertyCode || p.id),
        p.type || '',
        formatPropertyPriceDisplay(ROLE, p, POS_ID_SAFE, DEFAULT_POS_NAME || ''),
        shouldMaskAddress(ROLE, p, POS_ID_SAFE, DEFAULT_POS_NAME || '') ? '***' : p.address || '',
        p.level1_status || '',
        effectiveLevel2Status(p, listings) || '',
        p.pos_name || '',
        p.createdBy || '',
        formatDt(p.createdAt),
        p.manager_name || '',
        p.approvedBy || '',
        formatDt(p.approvedAt),
        p.mktApproveBy || l.approvedBy || '',
        formatDt(p.mktApproveAt || l.approvedAt),
        formatDt(l.expiredAt),
        p.update_requested_by || '',
        formatDt(p.update_requested_at),
        p.update_approved_by || '',
        formatDt(p.update_approved_at),
        l.unlistRequestedBy || l.rejectedBy || '',
        formatDt(l.unlistRequestedAt || l.rejectedAt),
        l.approvedUnlistBy || '',
        formatDt(l.approvedUnlistAt),
        p.unsourceRequestedBy || '',
        formatDt(p.unsourceRequestedAt),
        p.unsourceApprovedBy || '',
        formatDt(p.unsourceApprovedAt),
      ];
      csv.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `Bao_Cao_Tong_Hop_iHouzz_${formatLocalYmd(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (!allowDashboard) {
    return (
      <div className="p-5 text-center">
        <div className="alert alert-warning d-inline-block">
          <i className="bi bi-shield-lock me-2"></i>
          Tài khoản không có quyền <strong>DASHBOARD_VIEW</strong>. Liên hệ Admin cấu hình tại F10 — IAM.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-5 text-center text-muted">
        <div className="spinner-border text-primary"></div>
        <div className="mt-2">Đang tải báo cáo...</div>
      </div>
    );
  }

  const StatCard = ({ title, value, sub, colorClass, icon, onDrill, drillLabel, textClass = 'text-white' }) => {
    const onLight = textClass.includes('text-dark');
    const titleRowClass = onLight
      ? 'small text-uppercase fw-bold mb-1 text-secondary'
      : 'small text-white-50 text-uppercase fw-bold mb-1';
    const iconWrap = onLight ? 'bg-primary bg-opacity-10' : 'bg-white bg-opacity-25';
    const footerBorder = onLight ? 'border-dark border-opacity-10' : 'border-white border-opacity-25';
    const footerText = onLight ? 'text-body-secondary' : 'text-white-50';

    return (
      <div
        className={`card border-0 shadow-sm h-100 ${colorClass} ${textClass} p-4`}
        style={{ borderRadius: 15, cursor: onDrill ? 'pointer' : 'default' }}
        onClick={onDrill}
        role={onDrill ? 'button' : undefined}
        title={onDrill ? drillLabel : undefined}
      >
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className={titleRowClass}>{title}</div>
            <h2 className={`display-5 fw-bold mb-0 ${onLight ? '' : 'text-white'}`}>{value}</h2>
          </div>
          <div className={`${iconWrap} rounded p-2`}>
            <i className={`bi ${icon} fs-3 ${onLight ? 'text-primary' : 'text-white'}`}></i>
          </div>
        </div>
        <div className={`mt-3 pt-3 border-top ${footerBorder} small ${footerText}`}>
          {sub}
          {onDrill && (
            <span className={`d-block mt-1 ${onLight ? 'text-primary fw-semibold' : 'text-white fw-medium'}`}>
              <i className="bi bi-box-arrow-up-right me-1"></i>
              {drillLabel}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4" style={{ background: 'var(--ih-main-bg, #f1f5f9)', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h3 className="fw-bold mb-1" style={{ color: '#0d47a1' }}>
            <i className="bi bi-pie-chart-fill me-2"></i>
            Dashboard Báo Cáo Tổng Hợp
          </h3>
          <div className="text-muted small">Thống kê theo phạm vi quyền và chi nhánh</div>
          <div className="small mt-1">
            Phạm vi: <strong className="text-primary">{scopeLabel}</strong>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {(ROLE === 'admin' || ROLE === 'marketing') && (
            <div className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
              <i className="bi bi-filter-circle text-primary fs-5"></i>
              <span className="fw-semibold small text-nowrap">Lọc POS:</span>
              <select
                className="form-select form-select-sm border-0 bg-light"
                style={{ width: 200 }}
                value={selectedPos}
                onChange={(e) => setSelectedPos(e.target.value)}
              >
                <option value="ALL">Tất cả chi nhánh</option>
                {posList.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {ROLE === 'pos_manager' && (
            <div className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
              <i className="bi bi-person-lines-fill text-primary fs-5"></i>
              <span className="fw-semibold small text-nowrap">Nhân viên:</span>
              <select
                className="form-select form-select-sm border-0 bg-light"
                style={{ width: 220 }}
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
              >
                <option value="ALL">Tất cả nhân viên POS</option>
                {posStaffList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
            <i className="bi bi-calendar-range text-primary"></i>
            <span className="small fw-semibold text-nowrap">Từ</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="small fw-semibold text-nowrap">Đến</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                const r = defaultF12DateRange();
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
              title="Đặt lại: đầu tháng → hôm nay"
            >
              Đặt lại
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              title="Bỏ lọc ngày"
            >
              ×
            </button>
          </div>
          {ROLE === 'sales' && (
            <div className="bg-white px-4 py-2 rounded shadow-sm border-start border-4 border-primary">
              <span className="text-muted small me-2">Báo cáo:</span>
              <strong className="text-primary">Cá nhân — {USER_NAME}</strong>
            </div>
          )}
          <button
            type="button"
            className="btn btn-outline-primary d-flex align-items-center gap-2"
            onClick={loadData}
            title="Tải lại dữ liệu từ API"
          >
            <i className="bi bi-arrow-clockwise"></i> Làm mới
          </button>
          <button className="btn btn-primary d-flex align-items-center gap-2" onClick={handleExportDashboard}>
            <i className="bi bi-download"></i> Xuất Báo cáo
          </button>
        </div>
      </div>

      <div className="alert alert-info py-2 small mb-4">
        <i className="bi bi-info-circle me-1"></i>
        <strong>Phạm vi báo cáo:</strong> Đầu chủ — chỉ tài sản do mình tạo; GĐ POS — toàn chi nhánh + lọc từng nhân viên;
        Admin/Marketing — toàn hệ thống (lọc POS).{' '}
        <span className="text-muted">Số liệu tính client-side (demo).</span>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <StatCard
            title="Tổng Tài Sản"
            value={stats.totalProps}
            sub={
              <>
                <i className="bi bi-check-circle me-1"></i>
                {stats.activeProps} đã duyệt kho
              </>
            }
            colorClass="bg-primary"
            icon="bi-building"
            onDrill={() => drillToF9('all')}
            drillLabel="Mở F9 (giám sát kho)"
          />
        </div>
        <div className="col-md-3">
          <StatCard
            title="Đang Niêm Yết"
            value={stats.listedProps}
            sub={
              <>
                <i className="bi bi-graph-up-arrow me-1"></i>
                Lv2 hiệu lực (đồng bộ F9)
              </>
            }
            colorClass="bg-success"
            icon="bi-broadcast"
            onDrill={() => drillToF9('listed')}
            drillLabel="F9 — lọc tin Đã duyệt"
          />
        </div>
        <div className="col-md-3">
          <StatCard
            title="Tỷ lệ Bán / Thuê"
            value={
              <>
                {typeData.ban}
                <span className="fs-5 text-secondary mx-1">/</span>
                {typeData.thue}
              </>
            }
            sub={
              <>
                <i className="bi bi-tags me-1"></i>
                Phân bổ nguồn hàng
              </>
            }
            colorClass="bg-warning bg-opacity-25"
            textClass="text-dark"
            icon="bi-pie-chart"
          />
        </div>
        <div className="col-md-3">
          <StatCard
            title={ROLE === 'sales' ? 'Tài sản của tôi' : 'Nhân sự POS'}
            value={ROLE === 'sales' ? stats.totalProps : stats.totalUsers}
            sub={
              ROLE === 'sales' ? (
                <>
                  <i className="bi bi-check-circle me-1"></i>
                  {stats.activeProps} đã duyệt kho
                </>
              ) : (
                <>
                  <i className="bi bi-person-check me-1"></i>
                  {stats.activeUsers} đang hoạt động
                </>
              )
            }
            colorClass="ih-f12-stat-people"
            icon={ROLE === 'sales' ? 'bi-person-badge' : 'bi-people'}
            onDrill={ROLE === 'admin' || ROLE === 'pos_manager' ? () => navigate('/feature10') : undefined}
            drillLabel={ROLE === 'admin' || ROLE === 'pos_manager' ? 'Mở F10 IAM' : undefined}
          />
        </div>
      </div>

      {/* Biểu đồ Phân bổ và Thống kê POS */}
      <div className="row g-4 mb-4">
        {/* Tài sản theo POS */}
        <div className="col-md-7 col-lg-8">
          <div className="card border-0 shadow-sm p-4 h-100" style={{ borderRadius: 15, background: '#111c33', color: '#e2e8f0' }}>
            <h5 className="fw-bold mb-3 text-white">
              <i className="bi bi-bar-chart-steps me-2 text-info"></i>
              Tài sản theo POS — Drill-down
            </h5>
            <div className="d-flex flex-column gap-3 mt-4">
              {posAllocation.map((item, idx) => {
                const colors = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];
                const barColor = colors[idx % colors.length];
                return (
                  <div
                    key={item.posName}
                    className="position-relative"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate('/feature9', {
                        state: {
                          filterPOS: item.posName === 'Chưa phân POS' ? '' : item.posName,
                          dateFrom,
                          dateTo
                        }
                      });
                    }}
                    title={`Click để xem chi tiết kho của ${item.posName}`}
                  >
                    <div className="d-flex justify-content-between mb-1">
                      <span className="small fw-semibold">{item.posName}</span>
                      <span className="small fw-bold text-info">{item.count} TS</span>
                    </div>
                    <div className="progress" style={{ height: 8, background: 'rgba(255,255,255,0.08)' }}>
                      <div
                        className="progress-bar rounded"
                        role="progressbar"
                        style={{ width: `${item.percentage}%`, backgroundColor: barColor }}
                        aria-valuenow={item.count}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>
                );
              })}
              {posAllocation.length === 0 && (
                <div className="text-muted small py-4 text-center">Chưa có thông tin phân bổ POS.</div>
              )}
            </div>
          </div>
        </div>

        {/* Phân bổ Trạng thái */}
        <div className="col-md-5 col-lg-4">
          <div className="card border-0 shadow-sm p-4 h-100" style={{ borderRadius: 15, background: '#111c33', color: '#e2e8f0' }}>
            <h5 className="fw-bold mb-3 text-white">
              <i className="bi bi-pie-chart-fill me-2 text-warning"></i>
              Phân bổ Trạng thái
            </h5>
            
            <div className="d-flex justify-content-center align-items-center my-3 position-relative">
              {/* Vòng tròn Progress thay donut chart */}
              <div className="position-relative d-flex align-items-center justify-content-center" style={{ width: 130, height: 130 }}>
                {/* SVG Donut/Pie ring */}
                <svg className="w-100 h-100" viewBox="0 0 36 36">
                  {/* Background circle */}
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  {/* Segment 1: Được duyệt (Green) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeDasharray={`${statusPercents.approved} ${100 - statusPercents.approved}`}
                    strokeDashoffset={25}
                  />
                  {/* Segment 2: Đang xử lý / Khác (Cyan) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="3.5"
                    strokeDasharray={`${statusPercents.processing} ${100 - statusPercents.processing}`}
                    strokeDashoffset={25 - statusPercents.approved}
                  />
                  {/* Segment 3: Chờ duyệt (Orange) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3.5"
                    strokeDasharray={`${statusPercents.pending} ${100 - statusPercents.pending}`}
                    strokeDashoffset={25 - statusPercents.approved - statusPercents.processing}
                  />
                </svg>
                {/* Center text */}
                <div className="position-absolute text-center">
                  <div className="fs-4 fw-bold text-white">{stats.totalProps}</div>
                  <div className="text-white-50" style={{ fontSize: 9 }}>TÀI SẢN</div>
                </div>
              </div>
            </div>

            {/* List Trạng thái Phân bổ */}
            <div className="d-flex flex-column gap-2 mb-3">
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <span className="d-inline-block rounded-circle" style={{ width: 10, height: 10, background: '#10b981' }}></span>
                  <span className="small">Được duyệt (Kho chuẩn/ĐB)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-white-50">{statusCounts.approved} TS</span>
                  <span className="small fw-bold text-success">{statusPercents.approved}%</span>
                </div>
              </div>
              
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <span className="d-inline-block rounded-circle" style={{ width: 10, height: 10, background: '#0ea5e9' }}></span>
                  <span className="small">Đang xử lý / Nháp</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-white-50">{statusCounts.processing} TS</span>
                  <span className="small fw-bold text-info">{statusPercents.processing}%</span>
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <span className="d-inline-block rounded-circle" style={{ width: 10, height: 10, background: '#f59e0b' }}></span>
                  <span className="small">Chờ duyệt (Level 1)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-white-50">{statusCounts.pending} TS</span>
                  <span className="small fw-bold text-warning">{statusPercents.pending}%</span>
                </div>
              </div>
            </div>

            {/* Phần hiển thị chi tiết "Chờ Duyệt" theo yêu cầu của user */}
            <div className="p-3 rounded border border-warning border-opacity-25 bg-warning bg-opacity-10 mt-2">
              <div className="fw-semibold text-warning small mb-2 d-flex align-items-center gap-1">
                <i className="bi bi-hourglass-split"></i> Chi tiết chờ duyệt:
              </div>
              <div className="d-flex justify-content-around text-center">
                <div 
                  className="px-2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/feature3')}
                  title="Click để đến màn hình duyệt tài sản (F3)"
                >
                  <div className="h4 fw-bold text-white mb-0">{statusCounts.pending}</div>
                  <div className="text-white-50" style={{ fontSize: 10 }}>Tài sản chờ duyệt</div>
                </div>
                <div className="border-start border-white border-opacity-10"></div>
                <div 
                  className="px-2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/feature5')}
                  title="Click để đến màn hình duyệt niêm yết (F5)"
                >
                  <div className="h4 fw-bold text-white mb-0">{pendingListingsCount}</div>
                  <div className="text-white-50" style={{ fontSize: 10 }}>Tin đăng chờ duyệt</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-md-8">
          <div className="card border-0 shadow-sm p-4 h-100" style={{ borderRadius: 15 }}>
            <h5 className="fw-bold mb-4">
              <i className="bi bi-grid me-2 text-primary"></i>
              Hệ sinh thái tính năng iHouzz
            </h5>
            <div className="row g-3">
              {[
                { id: 'F2', role: ['admin', 'sales'], to: '/feature2', label: 'Tạo Tài sản', color: 'primary', icon: 'bi-plus-square' },
                { id: 'F3', role: ['admin', 'pos_manager'], to: '/feature3', label: 'Duyệt Kho', color: 'success', icon: 'bi-check2-square' },
                { id: 'F4', role: ['admin', 'sales'], to: '/feature4', label: 'Soạn Tin Đăng', color: 'info', icon: 'bi-megaphone' },
                { id: 'F5', role: ['admin', 'marketing'], to: '/feature5', label: 'Duyệt Niêm yết', color: 'warning', icon: 'bi-patch-check' },
                { id: 'F9', role: ['admin', 'sales', 'pos_manager', 'marketing'], to: '/feature9', label: 'Giám sát Kho', color: 'primary', icon: 'bi-graph-up' },
              ]
                .filter((f) => f.role.includes(ROLE === 'pos_manager' ? 'pos_manager' : ROLE))
                .map((f) => (
                  <div key={f.to} className="col-md-4">
                    <Link
                      to={f.to}
                      className={`d-flex align-items-center gap-3 p-3 rounded text-decoration-none border border-${f.color} border-opacity-25 bg-light`}
                    >
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
            <h5 className="fw-bold mb-4">
              <i className="bi bi-clock-history me-2 text-danger"></i>
              Mới cập nhật gần đây
            </h5>
            <div className="d-flex flex-column gap-3">
              {recentItems.map((p) => (
                <div
                  key={p.id}
                  className="d-flex gap-3 align-items-start border-bottom pb-3"
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    navigate('/feature9', {
                      state: { search: formatPropertyId(p.propertyCode || p.id) },
                    })
                  }
                  role="button"
                >
                  <div className="bg-light rounded p-2 text-center" style={{ width: 50 }}>
                    <i className="bi bi-building text-primary"></i>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold small text-primary">
                      {formatPropertyId(p.propertyCode || p.id)}
                    </div>
                    <div className="small text-muted mb-1 text-truncate" style={{ maxWidth: 200 }}>
                      {shouldMaskAddress(ROLE, p, POS_ID_SAFE, DEFAULT_POS_NAME || '')
                        ? '*** Địa chỉ ẩn'
                        : p.address}
                    </div>
                    <span className="badge bg-secondary me-1" style={{ fontSize: 10 }}>
                      {p.level1_status || p.statusLv1}
                    </span>
                    <span className="badge bg-info text-dark" style={{ fontSize: 10 }}>
                      {effectiveLevel2Status(p, listings)}
                    </span>
                  </div>
                </div>
              ))}
              {recentItems.length === 0 && <div className="text-muted small">Chưa có tài sản trong khoảng lọc.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
