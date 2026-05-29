import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  API,
  formatListingId,
  formatPropertyId,
  postAuditLog,
  AUDIT_ACTION_TYPE,
  readSessionUser,
  SESSION_CHANGED_EVENT,
} from '../utils/listingWorkflow';
import { normalizeUserId } from '../utils/userId.js';

/** Ngày local YYYY-MM-DD — đồng bộ F3/F9 (tránh lệch UTC của `toISOString()`). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF7DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

/** json-server / proxy có thể trả `{ data: [...] }` thay vì mảng thuần. */
function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function statusBadgeClass(bgKey) {
  const k = bgKey || 'secondary';
  if (k === 'light') return 'badge bg-light text-dark border';
  if (k === 'warning') return 'badge bg-warning text-dark';
  return `badge bg-${k}`;
}

const UNLIST_REASONS = [
  { value: 'Ngưng niêm yết', label: 'Ngưng niêm yết', icon: '⏸️', nextLv2: 'Chưa niêm yết', color: 'warning' },
  { value: 'Thẩm định phí', label: 'Thẩm định phí', icon: '💰', nextLv2: 'Thẩm định phí', color: 'info' },
];

const REJECT_REASONS = [
  'Yêu cầu thiếu thông tin',
  'Tài sản vẫn cần tiếp thị',
  'Chờ xác nhận lại từ chủ nhà',
  'Lý do khác',
];

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 mb-3 shadow-sm`} style={{ borderRadius: 10 }}>
      <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : toast.type === 'danger' ? 'bi-x-circle-fill' : 'bi-info-circle-fill'}`}></i>
      <span>{toast.msg}</span>
    </div>
  );
}

function StatusBadge({ lv2 }) {
  const map = {
    'Chưa niêm yết': 'secondary', 'Đang niêm yết': 'success',
    'Thẩm định phí': 'info', 'Đã gỡ': 'dark', 'Yêu cầu gỡ tin': 'warning',
  };
  return <span className={statusBadgeClass(map[lv2] || 'secondary')}>{lv2}</span>;
}

/** `listing_status` tin đăng — map riêng với Lv2 tài sản (`StatusBadge`), đồng bộ tone với F5 `STATUS_META`. */
const LISTING_STATUS_BADGE = {
  'Chờ duyệt': 'warning',
  'Chờ duyệt chỉnh sửa': 'info',
  'Đã duyệt': 'success',
  'Từ chối': 'danger',
  'Yêu cầu gỡ tin': 'secondary',
  'Đã gỡ': 'dark',
  'Hết hạn': 'secondary',
  'Từ chối gỡ tin': 'danger',
};

function ListingStatusBadge({ status }) {
  const label = status || '—';
  const bg = LISTING_STATUS_BADGE[label] || 'secondary';
  return <span className={statusBadgeClass(bg)}>{label}</span>;
}

export default function Feature7_UnlistApproval() {
  const [user, setUser] = useState(() => readSessionUser());
  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('pending'); // 'pending' | 'history'
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'approve' | 'reject'
  const [listingDetail, setListingDetail] = useState(null); // To view details
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [filter, setFilter] = useState({ reason: '', pos: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const { from: f7From, to: f7To } = defaultF7DateRange();
  const [dateFrom, setDateFrom] = useState(f7From);
  const [dateTo, setDateTo] = useState(f7To);

  const isMktOrAdmin = useMemo(() => {
    const role = user?.role;
    return role === 'admin' || role === 'marketing' || role === 'mkt';
  }, [user?.role]);

  useEffect(() => {
    const bump = () => setUser(readSessionUser());
    window.addEventListener('storage', bump);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
    };
  }, []);

  const loadAll = useCallback(async () => {
    const [lRaw, pRaw, lgRaw] = await Promise.all([
      fetch(`${API}/listings`).then((r) => r.json()),
      fetch(`${API}/properties`).then((r) => r.json()),
      fetch(`${API}/logs`).then((r) => r.json()),
    ]);
    setListings(normalizeJsonList(lRaw));
    setProperties(normalizeJsonList(pRaw));
    setLogs(normalizeJsonList(lgRaw));
  }, []);

  useEffect(() => {
    if (isMktOrAdmin) loadAll();
  }, [isMktOrAdmin, loadAll]);

  const getProp = (pid) => properties.find(p => p.id === pid) || {};
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Pending = FIFO (oldest first)
  const pendingRaw = listings
    .filter(l => l.listing_status === 'Yêu cầu gỡ tin')
    .sort((a, b) => new Date(a.unlistRequestedAt) - new Date(b.unlistRequestedAt));

  const applyDateRange7 = (list) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(l => {
      const fields = [l.createdAt, l.updatedAt, l.unlistRequestedAt, l.approvedUnlistAt, l.rejectedUnlistAt];
      return fields.some(d => {
        if (!d) return false;
        const day = d.slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      });
    });
  };

  const pending = applyDateRange7(pendingRaw).filter(l => {
    const prop = getProp(l.property_id);
    if (filter.reason && l.unlist_reason !== filter.reason) return false;
    if (filter.pos && prop.pos_name !== filter.pos) return false;
    return true;
  });

  const historyRaw = listings.filter(
    (l) =>
      l.listing_status === 'Đã gỡ' ||
      l.listing_status === 'Từ chối gỡ tin' ||
      (l.listing_status === 'Đã duyệt' && l.rejectedUnlistAt),
  );
  const history = applyDateRange7(historyRaw).filter(l => {
    const prop = getProp(l.property_id);
    if (filter.reason && l.unlist_reason !== filter.reason) return false;
    if (filter.pos && prop.pos_name !== filter.pos) return false;
    return true;
  });
  const allPosList = [...new Set(properties.map(p => p.pos_name))];

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    const reasonObj = UNLIST_REASONS.find(r => r.value === selected.unlist_reason);
    const nextLv2 = reasonObj?.nextLv2 || 'Chưa niêm yết';
    const now = new Date().toISOString();
    const prop = getProp(selected.property_id);
    const prevLv2 = prop.level2_status || prop.statusLv2 || '—';

    await fetch(`${API}/listings/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Đã gỡ',
        approvedUnlistBy: user?.name || 'MKT',
        approvedUnlistAt: now,
        updatedAt: now,
      }),
    });

    if (prop.id) {
      await fetch(`${API}/properties/${encodeURIComponent(String(prop.id))}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level2_status: nextLv2, statusLv2: nextLv2, updatedAt: now }),
      });
    }

    await postAuditLog({
      actionText: `Duyệt gỡ tin → Lv2="${nextLv2}" — ${formatListingId(selected.listingCode || selected.id)}`,
      actionType: AUDIT_ACTION_TYPE.UC007_APPROVE_UNLIST,
      listingId: selected.id,
      propertyId: prop.id || selected.property_id,
      userName: user?.name || 'MKT',
      userId: normalizeUserId(user?.id) ?? user?.id ?? '',
      oldStatus: 'Yêu cầu gỡ tin',
      newStatus: 'Đã gỡ',
      reason: selected.unlist_reason || undefined,
      detail: selected.unlist_note || undefined,
      modifiedFields: { level2_status: { from: prevLv2, to: nextLv2 } },
    });
    showToast(`✅ Đã duyệt gỡ tin ${selected.id}. Tài sản ${prop.id} → Level 2: "${nextLv2}"`);
    setSelected(null); setModalMode(null);
    setSubmitting(false); loadAll();
  };

  const handleReject = async () => {
    if (!rejectReason) { showToast('Vui lòng chọn lý do từ chối!', 'danger'); return; }
    setSubmitting(true);
    const now = new Date().toISOString();
    await fetch(`${API}/listings/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Đã duyệt',
        unlist_reason: null, unlist_note: null,
        rejection_note: rejectReason + (rejectNote ? ` — ${rejectNote}` : ''),
        rejectedUnlistBy: user?.name || 'MKT',
        rejectedUnlistAt: now,
        updatedAt: now,
      }),
    });
    const prop = getProp(selected.property_id);
    const reasonText = rejectReason + (rejectNote ? ` — ${rejectNote}` : '');
    await postAuditLog({
      actionText: `Từ chối gỡ tin — ${formatListingId(selected.listingCode || selected.id)}`,
      actionType: AUDIT_ACTION_TYPE.UC007_REJECT_UNLIST,
      listingId: selected.id,
      propertyId: prop.id || selected.property_id,
      userName: user?.name || 'MKT',
      userId: normalizeUserId(user?.id) ?? user?.id ?? '',
      oldStatus: 'Yêu cầu gỡ tin',
      newStatus: 'Đã duyệt',
      reason: reasonText,
    });
    showToast(`↩️ Đã từ chối yêu cầu gỡ tin ${selected.id}. Bài đăng tiếp tục niêm yết.`, 'warning');
    setSelected(null); setModalMode(null); setRejectReason(''); setRejectNote('');
    setSubmitting(false); loadAll();
  };

  if (!isMktOrAdmin) {
    return (
      <div className="container mt-5 pt-5 text-center">
        <h3 className="text-danger mb-3"><i className="bi bi-shield-lock me-2"></i>⛔ Cảnh báo Phân quyền</h3>
        <div className="alert alert-danger d-inline-block text-start">
          <strong>Không đủ quyền truy cập:</strong><br />
          Tài khoản Sales / GĐ POS không có quyền truy cập chức năng Phê duyệt Gỡ tin.<br />
          Chỉ Admin hoặc Marketing mới được phép thao tác tại đây.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ih-main-bg, #f0f4ff)', padding: 24 }}>
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#1a237e' }}>
            <i className="bi bi-patch-check-fill text-primary me-2"></i>
            Phê duyệt gỡ tin
          </h4>
          <small className="text-muted">
            Marketing / Admin — xử lý yêu cầu từ Đầu chủ; sau khi duyệt, trạng thái niêm yết trên tài sản được cập nhật tự động.
          </small>
        </div>
        <div className="d-flex gap-2 align-items-center">
          {pending.length > 0 && (
            <span className="badge bg-danger px-3 py-2 fs-6">
              <i className="bi bi-bell-fill me-1"></i>{pending.length} chờ duyệt
            </span>
          )}
          <span className="badge bg-primary px-3 py-2">Đồng bộ trạng thái</span>
        </div>
      </div>

      <Toast toast={toast} />

      {/* Stats row */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Chờ duyệt', value: pendingRaw.length, color: '#e53935', icon: 'bi-hourglass-split' },
          { label: 'Đã xử lý', value: historyRaw.length, color: '#388e3c', icon: 'bi-check-all' },
          { label: 'Đang niêm yết', value: listings.filter(l => l.listing_status === 'Đã duyệt').length, color: '#1976d2', icon: 'bi-broadcast' },
        ].map(s => (
          <div key={s.label} className="col-md-4">
            <div className="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3">
              <div style={{ width: 48, height: 48, borderRadius: 12, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bi ${s.icon} fs-4`} style={{ color: s.color }}></i>
              </div>
              <div>
                <div className="fw-bold fs-4 lh-1">{s.value}</div>
                <div className="text-muted small">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2 d-flex align-items-center gap-2 flex-wrap">
          <button className={`btn btn-sm ${tab === 'pending' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setTab('pending')}>
            <i className="bi bi-clock-history me-1"></i>Chờ duyệt
            {pendingRaw.length > 0 && <span className="badge bg-danger ms-1">{pendingRaw.length}</span>}
          </button>
          <button className={`btn btn-sm ${tab === 'history' ? 'btn-dark' : 'btn-outline-dark'}`}
            onClick={() => setTab('history')}>
            <i className="bi bi-archive me-1"></i>Lịch sử đã xử lý ({historyRaw.length})
            {tab === 'history' && history.length !== historyRaw.length && (
              <span className="badge bg-secondary ms-1">Lọc: {history.length}</span>
            )}
          </button>

          {(tab === 'pending' || tab === 'history') && (
            <div className="ms-auto d-flex gap-2 flex-wrap align-items-center">
              <select className="form-select form-select-sm" style={{ width: 160 }}
                value={filter.reason} onChange={e => setFilter({ ...filter, reason: e.target.value })}>
                <option value="">Tất cả lý do</option>
                {UNLIST_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select className="form-select form-select-sm" style={{ width: 180 }}
                value={filter.pos} onChange={e => setFilter({ ...filter, pos: e.target.value })}>
                <option value="">Tất cả POS</option>
                {allPosList.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="d-flex gap-1 align-items-center">
                <span className="input-group-text bg-white border rounded" style={{fontSize:11}}><i className="bi bi-calendar3"></i></span>
                <input type="date" className="form-control form-control-sm" style={{width:125}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Từ ngày" />
                <span className="small text-muted">—</span>
                <input type="date" className="form-control form-control-sm" style={{width:125}} value={dateTo} onChange={e => setDateTo(e.target.value)} title="Đến ngày" />
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    const r = defaultF7DateRange();
                    setDateFrom(r.from);
                    setDateTo(r.to);
                  }}
                  title="Đặt lại: đầu tháng → hôm nay"
                >
                  Đặt lại
                </button>
                {(dateFrom || dateTo) && <button className="btn btn-outline-secondary btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); }} title="Bỏ lọc ngày">×</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAB: PENDING */}
      {tab === 'pending' && (
        <div className="row g-3">
          <div className="col-12">
            <div className="card border-0 shadow-sm p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="small text-muted">STT</th>
                      <th className="small text-muted">Mã Bài Đăng / Mã TS</th>
                      <th className="small text-muted">Tiêu đề / Địa chỉ</th>
                      <th className="small text-muted">Thông tin nguồn</th>
                      <th className="small text-muted">Lý do gỡ / Ghi chú</th>
                      <th className="small text-muted text-end">Lượt xem</th>
                      <th className="small text-muted text-end">Lượt Like</th>
                      <th className="small text-muted text-center">Trạng thái Lv2</th>
                      <th className="small text-muted text-end">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.length === 0 && (
                      <tr><td colSpan="9" className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có yêu cầu gỡ tin nào đang chờ duyệt.</p></td></tr>
                    )}
                    {pending.map((l, idx) => {
                      const prop = getProp(l.property_id);
                      const reasonObj = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
                      const isSelected = selected?.id === l.id;
                      const views = l.views || Math.floor(((l.id?.charCodeAt(0) || 65) * 12.5) + 100);
                      const likes = l.likes || Math.floor(views * 0.15);
                      return (
                        <tr key={l.id} className={isSelected ? 'bg-primary bg-opacity-10 border-start border-primary border-4' : ''}>
                          <td className="fw-bold">#{idx + 1}</td>
                          <td>
                            <div><span className="badge bg-dark">{formatListingId(l.listingCode || l.id)}</span></div>
                            <div className="mt-1"><span className="badge bg-secondary">{formatPropertyId(prop?.propertyCode || prop?.id || l.property_id)}</span></div>
                          </td>
                          <td>
                            <div className="fw-semibold text-primary text-truncate cursor-pointer" style={{ maxWidth: 200, cursor: 'pointer' }} title={l.title} onClick={() => setListingDetail(l)}>
                              <u>{l.title}</u>
                            </div>
                            <div className="text-muted small text-truncate" style={{ maxWidth: 200 }}>{prop.address}</div>
                          </td>
                          <td>
                            <div><i className="bi bi-building me-1 text-muted"></i>{prop.pos_name}</div>
                            <div className="small"><i className="bi bi-person me-1 text-muted"></i>{l.unlistRequestedBy || l.createdBy}</div>
                            {l.unlistRequestedAt && <div className="text-muted" style={{ fontSize: 10 }}><i className="bi bi-clock me-1"></i>{new Date(l.unlistRequestedAt).toLocaleString('vi-VN')}</div>}
                          </td>
                          <td>
                            {reasonObj && <span className={statusBadgeClass(reasonObj.color)}>{reasonObj.icon} {reasonObj.label}</span>}
                            {l.unlist_note && <div className="text-muted small mt-1 text-truncate" style={{ maxWidth: 150 }}>{l.unlist_note}</div>}
                          </td>
                          <td className="text-end fw-semibold text-primary">{views} <i className="bi bi-eye"></i></td>
                          <td className="text-end fw-semibold text-danger">{likes} <i className="bi bi-heart-fill"></i></td>
                          <td className="text-center">
                            <StatusBadge lv2={prop.level2_status} />
                            <div className="small text-muted mt-1">{prop.type} · {prop.price_display}</div>
                          </td>
                          <td className="text-end">
                            <button className="btn btn-sm btn-success mb-1 w-100" onClick={() => { setSelected(l); setModalMode('approve'); }}>Duyệt Gỡ</button>
                            <button className="btn btn-sm btn-outline-danger w-100" onClick={() => { setSelected(l); setModalMode('reject'); setRejectReason(''); setRejectNote(''); }}>Từ chối</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: HISTORY — cùng layout bảng như Chờ duyệt */}
      {tab === 'history' && (
        <div className="row g-3">
          <div className="col-12">
            <div className="card border-0 shadow-sm p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="small text-muted">STT</th>
                      <th className="small text-muted">Mã Bài Đăng / Mã TS</th>
                      <th className="small text-muted">Tiêu đề / Địa chỉ</th>
                      <th className="small text-muted">Thông tin nguồn</th>
                      <th className="small text-muted">Lý do gỡ / Ghi chú</th>
                      <th className="small text-muted text-end">Lượt xem</th>
                      <th className="small text-muted text-end">Lượt Like</th>
                      <th className="small text-muted text-center">Kết quả / Lv2 TS</th>
                      <th className="small text-muted text-end">Xem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && (
                      <tr><td colSpan="9" className="text-center py-5 text-muted"><i className="bi bi-folder2-open fs-2"></i><p className="mt-2">Chưa có yêu cầu nào được xử lý (hoặc không khớp bộ lọc).</p></td></tr>
                    )}
                    {history.slice().reverse().map((l, idx) => {
                      const prop = getProp(l.property_id);
                      const isDone = l.listing_status === 'Đã gỡ';
                      const reasonObj = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
                      const views = l.views || Math.floor(((l.id?.charCodeAt(0) || 65) * 12.5) + 100);
                      const likes = l.likes || Math.floor(views * 0.15);
                      return (
                        <tr key={l.id}>
                          <td className="fw-bold">#{idx + 1}</td>
                          <td>
                            <div><span className="badge bg-dark">{formatListingId(l.listingCode || l.id)}</span></div>
                            <div className="mt-1"><span className="badge bg-secondary">{formatPropertyId(prop?.propertyCode || prop?.id || l.property_id)}</span></div>
                          </td>
                          <td>
                            <div className="fw-semibold text-primary text-truncate cursor-pointer" style={{ maxWidth: 200, cursor: 'pointer' }} title={l.title} onClick={() => setListingDetail(l)}>
                              <u>{l.title}</u>
                            </div>
                            <div className="text-muted small text-truncate" style={{ maxWidth: 200 }}>{prop.address}</div>
                          </td>
                          <td>
                            <div><i className="bi bi-building me-1 text-muted"></i>{prop.pos_name}</div>
                            <div className="small"><i className="bi bi-person me-1 text-muted"></i>{l.unlistRequestedBy || l.createdBy}</div>
                            {l.unlistRequestedAt && <div className="text-muted" style={{ fontSize: 10 }}><i className="bi bi-clock me-1"></i>{new Date(l.unlistRequestedAt).toLocaleString('vi-VN')}</div>}
                            {isDone && l.approvedUnlistAt && (
                              <div className="text-success small mt-1" style={{ fontSize: 10 }}><i className="bi bi-check-circle me-1"></i>Duyệt gỡ: {new Date(l.approvedUnlistAt).toLocaleString('vi-VN')}</div>
                            )}
                            {!isDone && l.rejectedUnlistAt && (
                              <div className="text-danger small mt-1" style={{ fontSize: 10 }}><i className="bi bi-x-circle me-1"></i>Từ chối gỡ: {new Date(l.rejectedUnlistAt).toLocaleString('vi-VN')}</div>
                            )}
                          </td>
                          <td>
                            {reasonObj && <span className={statusBadgeClass(reasonObj.color)}>{reasonObj.icon} {reasonObj.label}</span>}
                            {l.unlist_note && <div className="text-muted small mt-1 text-truncate" style={{ maxWidth: 150 }}>{l.unlist_note}</div>}
                            {!isDone && l.rejection_note && <div className="text-danger small mt-1 text-truncate" style={{ maxWidth: 180 }} title={l.rejection_note}>Lý do: {l.rejection_note}</div>}
                          </td>
                          <td className="text-end fw-semibold text-primary">{views} <i className="bi bi-eye"></i></td>
                          <td className="text-end fw-semibold text-danger">{likes} <i className="bi bi-heart-fill"></i></td>
                          <td className="text-center">
                            <span className={`badge ${isDone ? 'bg-success' : 'bg-danger'} mb-1`}>{isDone ? 'Đã gỡ' : 'Từ chối gỡ'}</span>
                            <div><StatusBadge lv2={prop.level2_status} /></div>
                            <div className="small text-muted mt-1">{prop.type} · {prop.price_display}</div>
                          </td>
                          <td className="text-end">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setListingDetail(l)}>Chi tiết</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log mini panel */}
      <div className="card border-0 shadow-sm mt-4">
        <div className="card-header border-0 fw-bold bg-white small">
          <i className="bi bi-clock-history me-1 text-muted"></i>Audit Log (F7 gần đây)
        </div>
        <div className="card-body p-2">
          {logs.filter(lg => lg.action?.includes('F7')).slice(-5).reverse().length === 0 && (
            <div className="text-muted small text-center py-2">Chưa có log F7</div>
          )}
          {logs.filter(lg => lg.action?.includes('F7')).slice(-5).reverse().map(lg => (
            <div key={lg.id} className="d-flex align-items-center gap-2 small py-1 border-bottom">
              <i className="bi bi-dot text-primary fs-5"></i>
              <span className="text-muted">{new Date(lg.timestamp).toLocaleString('vi-VN')}</span>
              <span className="flex-grow-1">{lg.action}</span>
              <span className="badge bg-secondary">{lg.entityId}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: Approve */}
      {modalMode === 'approve' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-success text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-check-circle me-2"></i>Xác nhận Duyệt Gỡ tin
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => { setModalMode(null); setSelected(null); }}></button>
              </div>
              <div className="modal-body p-4">
                {(() => {
                  const prop = getProp(selected.property_id);
                  const reasonObj = UNLIST_REASONS.find(r => r.value === selected.unlist_reason);
                  return (
                    <>
                      <div className="alert alert-success bg-success bg-opacity-10 border-success mb-3">
                        <div className="fw-semibold">{formatListingId(selected.listingCode || selected.id)} · {selected.title}</div>
                        <div className="small text-muted mt-1">Tài sản: {formatPropertyId(prop?.propertyCode || prop?.id || selected.property_id)} | {prop.address}</div>
                      </div>
                      <div className="mb-3">
                        <div className="small text-muted mb-1">Lý do gỡ tin:</div>
                        <span className={`${statusBadgeClass(reasonObj?.color || 'secondary')} fs-6`}>
                          {reasonObj?.icon} {selected.unlist_reason}
                        </span>
                      </div>
                      <div className="alert alert-info small">
                        <i className="bi bi-lightning-charge-fill me-1"></i>
                        <strong>Đồng bộ tự động:</strong> Tài sản <strong>{formatPropertyId(prop?.propertyCode || prop?.id || selected.property_id)}</strong> Level 2 sẽ tự động chuyển →{' '}
                        <span className="badge bg-secondary">"{reasonObj?.nextLv2}"</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setSelected(null); }}>Hủy</button>
                <button className="btn btn-success fw-bold px-4" onClick={handleApprove} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reject */}
      {modalMode === 'reject' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-x-circle me-2"></i>Từ chối Yêu cầu Gỡ tin
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => { setModalMode(null); setSelected(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border mb-3">
                  <div className="fw-semibold">{selected.id} · {selected.title}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Lý do từ chối <span className="text-danger">*</span>
                  </label>
                  {REJECT_REASONS.map(r => (
                    <div key={r} className="form-check">
                      <input className="form-check-input" type="radio" name="rejectReason"
                        id={`rr_${r}`} value={r}
                        checked={rejectReason === r}
                        onChange={() => setRejectReason(r)} />
                      <label className="form-check-label" htmlFor={`rr_${r}`}>{r}</label>
                    </div>
                  ))}
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold">Ghi chú thêm</label>
                  <textarea className="form-control form-control-sm" rows={2}
                    placeholder="Chi tiết lý do từ chối..."
                    value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                </div>
                <div className="alert alert-warning small">
                  <i className="bi bi-info-circle me-1"></i>
                  Nếu từ chối: Bài đăng <strong>{formatListingId(selected.listingCode || selected.id)}</strong> sẽ tiếp tục ở trạng thái <strong>Đang niêm yết</strong>.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setSelected(null); }}>Hủy</button>
                <button className="btn btn-danger fw-bold px-4" onClick={handleReject}
                  disabled={submitting || !rejectReason}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Từ chối
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Detail Listing */}
      {listingDetail && (() => {
        const prop = getProp(listingDetail.property_id);
        const lgCode = formatListingId(listingDetail.listingCode || listingDetail.id);
        return (
          <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1055 }}>
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content border-0 shadow-lg">
                <div className="modal-header bg-light border-0">
                  <h5 className="modal-title fw-bold text-dark">
                    <i className="bi bi-file-earmark-richtext me-2 text-primary"></i>
                    Chi tiết Tin đăng {lgCode}
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setListingDetail(null)}></button>
                </div>
                <div className="modal-body p-4">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <div className="text-muted small mb-1">Tiêu đề Tin đăng</div>
                      <div className="fw-bold">{listingDetail.title}</div>
                    </div>
                    <div className="col-md-6 mb-3">
                      <div className="text-muted small mb-1">Trạng thái Tin đăng</div>
                      <ListingStatusBadge status={listingDetail.listing_status} />
                    </div>
                    <div className="col-md-12 mb-3">
                      <div className="text-muted small mb-1">Mô tả Tin đăng</div>
                      <div className="p-3 bg-light rounded small" style={{ whiteSpace: 'pre-wrap' }}>
                        {listingDetail.description || 'Chưa có mô tả'}
                      </div>
                    </div>
                  </div>
                  <hr className="my-3 text-muted" />
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <div className="text-muted small mb-1">Mã Tài sản gốc</div>
                      <div><span className="badge bg-secondary">{formatPropertyId(prop?.propertyCode || prop?.id || listingDetail.property_id)}</span></div>
                    </div>
                    <div className="col-md-6 mb-3">
                      <div className="text-muted small mb-1">Địa chỉ Tài sản</div>
                      <div className="fw-semibold">{prop?.address || '—'}</div>
                    </div>
                    <div className="col-md-4 mb-2">
                      <div className="text-muted small">Người tạo tin</div>
                      <div className="fw-semibold">{listingDetail.createdBy || '—'}</div>
                    </div>
                    <div className="col-md-4 mb-2">
                      <div className="text-muted small">Loại Giao dịch</div>
                      <div className="fw-semibold">{prop?.type || '—'}</div>
                    </div>
                    <div className="col-md-4 mb-2">
                      <div className="text-muted small">Giá niêm yết</div>
                      <div className="fw-semibold text-danger">{listingDetail.price_display || prop?.price_display || '—'}</div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button className="btn btn-outline-secondary" onClick={() => setListingDetail(null)}>Đóng</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
