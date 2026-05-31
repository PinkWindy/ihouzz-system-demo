import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  API,
  readSessionUser,
  SESSION_CHANGED_EVENT,
  postEntityAudit,
  AUDIT_ACTION_TYPE,
} from '../utils/listingWorkflow.js';

/** Đồng bộ F7/F9 — map `readSessionUser()` sang shape F8 (POS / role). */
function authFromSessionUser(u) {
  if (!u || u.role === 'guest') {
    return { role: 'sales', pos_name: '', pos_id: null, user_id: '', name: '', email: '' };
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
    email: u.email || '',
  };
}

/** Ngày local YYYY-MM-DD — đồng bộ F3/F7 (tránh lệch UTC `toISOString`). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF8DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

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

const CAN_UNSOURCE = ['Chưa niêm yết', 'Thẩm định phí'];

const STATUS_CONFIG = {
  'Được duyệt':          { bg: 'success', text: 'white', icon: '✅' },
  'Được đảm bảo':        { bg: 'warning', text: 'dark', icon: '🛡️' },
  'Chờ duyệt gỡ nguồn':  { bg: 'danger',  text: 'white', icon: '⏳' },
  'Đã gỡ nguồn':         { bg: 'dark',    text: 'white', icon: '🚫' },
};

/** L2 tài sản — tone đồng bộ F7 `StatusBadge`. */
const L2_PROPERTY_BADGE = {
  'Chưa niêm yết': 'secondary',
  'Đang niêm yết': 'success',
  'Thẩm định phí': 'info',
  'Đã gỡ nguồn': 'dark',
};

// Format mã LS chuẩn
const formatLSId = (id) => {
  if (!id) return '';
  if (id.startsWith('LS-')) return id;
  return `LS-${id.substring(0, 5).toUpperCase()}`;
};

export default function Feature8_Unsource() {
  const [user, setUser] = useState(() => readSessionUser());
  const auth = useMemo(() => authFromSessionUser(user), [user]);
  const { role: ROLE, pos_name: currentPosName, name: userName } = auth;

  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(null); // 'request' | 'approve' | 'reject' | 'view'
  const [unsourceNote, setUnsourceNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [filterStatus, setFilterStatus] = useState(() =>
    authFromSessionUser(readSessionUser()).role === 'sales' ? 'eligible' : 'pending',
  );
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const { from: f8From, to: f8To } = defaultF8DateRange();
  const [dateFrom, setDateFrom] = useState(f8From);
  const [dateTo, setDateTo] = useState(f8To);

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
    setFilterStatus(auth.role === 'sales' ? 'eligible' : 'pending');
  }, [auth.user_id, auth.role]);

  const loadData = useCallback(async () => {
    try {
      const raw = await fetch(`${API}/properties`).then((r) => r.json());
      setProperties(normalizeJsonList(raw));
    } catch (_) {
      setProperties([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const postLog = async (action, entityId, actionType, opts = {}) => {
    await postEntityAudit({
      action,
      entityId,
      actionType,
      user: auth.name || userName || 'Demo User',
      user_id: auth.user_id || '',
      property_id: entityId,
      ...opts,
    });
  };

  const patchProp = (id, data) => fetch(`${API}/properties/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
  });

  const applyDateRange8 = (list) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(p => {
      const fields = [p.createdAt, p.updatedAt, p.unsourceRequestedAt, p.unsourceApprovedAt, p.unsourceRejectedAt];
      return fields.some(d => {
        if (!d) return false;
        const local = new Date(d);
        if (isNaN(local.getTime())) return false;
        const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      });
    });
  };

  const filtered = applyDateRange8(properties.filter(p => {
    // Lọc theo POS: admin thấy hết, còn lại thấy POS mình
    if (ROLE !== 'admin' && p.pos_name !== currentPosName) return false;

    if (filterStatus === 'eligible') {
      return ['Được duyệt','Được đảm bảo'].includes(p.level1_status) && p.level1_status !== 'Đã gỡ nguồn' && p.level1_status !== 'Chờ duyệt gỡ nguồn';
    }
    if (filterStatus === 'pending') return p.level1_status === 'Chờ duyệt gỡ nguồn';
    if (filterStatus === 'approved') return p.level1_status === 'Đã gỡ nguồn';
    return true; // 'all'
  }));

  const eligibleCount = properties.filter(p => (ROLE === 'admin' || p.pos_name === currentPosName) && ['Được duyệt','Được đảm bảo'].includes(p.level1_status) && p.level1_status !== 'Đã gỡ nguồn' && p.level1_status !== 'Chờ duyệt gỡ nguồn').length;
  const pendingCount = properties.filter(p => (ROLE === 'admin' || p.pos_name === currentPosName) && p.level1_status === 'Chờ duyệt gỡ nguồn').length;
  const approvedCount = properties.filter(p => (ROLE === 'admin' || p.pos_name === currentPosName) && p.level1_status === 'Đã gỡ nguồn').length;

  // UC008: Sales request unsource
  const handleRequestUnsource = async () => {
    const canDo = CAN_UNSOURCE.includes(selected.level2_status);
    if (!canDo) {
      showToast('Cần gỡ tin (yêu cầu tạm ngưng niêm yết và được duyệt) trước khi gỡ nguồn.', 'danger');
      return;
    }
    setSubmitting(true);
    await patchProp(selected.id, {
      level1_status: 'Chờ duyệt gỡ nguồn',
      /** Lưu L1 trước yêu cầu để UC009 từ chối khôi phục đúng (Được duyệt / Được đảm bảo). */
      prev_level1: selected.level1_status,
      unsource_note: unsourceNote,
      unsourceRequestedAt: new Date().toISOString(),
      unsourceRequestedBy: userName || 'Đầu chủ',
    });
    await postLog(`Đầu chủ yêu cầu gỡ nguồn · Ghi chú: ${unsourceNote || '—'}`, selected.id, AUDIT_ACTION_TYPE.PROPERTY_F8_UNSOURCE_REQUEST, {
      detail: unsourceNote || undefined,
    });
    showToast(`✅ Đã gửi yêu cầu gỡ nguồn ${selected.id} đến GĐ POS.`);
    setSelected(null); setMode(null); setUnsourceNote('');
    setSubmitting(false); loadData();
  };

  // UC009: GĐ POS approve
  const handleApprove = async () => {
    setSubmitting(true);
    const now = new Date().toISOString();
    await patchProp(selected.id, {
      level1_status: 'Đã gỡ nguồn', level2_status: 'Đã gỡ nguồn',
      prev_level1: null,
      unsourceApprovedBy: userName || 'GĐ POS', unsourceApprovedAt: now,
    });
    try {
      const allRaw = await fetch(`${API}/listings`).then((r) => r.json());
      const allListings = normalizeJsonList(allRaw);
      const related = allListings.filter(l => l.property_id === selected.id && l.listing_status !== 'Đã gỡ');
      await Promise.all(related.map(l => fetch(`${API}/listings/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_status: 'Đã gỡ', updatedAt: now }),
      })));
    } catch (_) {}
    await postLog(`GĐ POS duyệt gỡ nguồn → Lv1+Lv2 «Đã gỡ nguồn», đồng bộ tin đăng`, selected.id, AUDIT_ACTION_TYPE.PROPERTY_F8_UNSOURCE_APPROVE);
    showToast(`✅ Đã duyệt gỡ nguồn ${selected.id}. Tài sản ẩn khỏi mặc định. Listings liên quan đã gỡ.`);
    setSelected(null); setMode(null);
    setSubmitting(false); loadData();
  };

  // UC009: GĐ POS reject
  const handleReject = async () => {
    if (!rejectNote.trim()) { showToast('Vui lòng nhập lý do từ chối!', 'danger'); return; }
    setSubmitting(true);
    const prev = selected.prev_level1 || 'Được duyệt';
    await patchProp(selected.id, {
      level1_status: prev,
      prev_level1: null,
      unsource_note: null,
      unsourceRejectedBy: userName || 'GĐ POS',
      unsourceRejectedAt: new Date().toISOString(),
      unsourceRejectNote: rejectNote,
    });
    await postLog(`GĐ POS từ chối gỡ nguồn · Lý do: ${rejectNote}`, selected.id, AUDIT_ACTION_TYPE.PROPERTY_F8_UNSOURCE_REJECT, {
      reason: rejectNote,
    });
    showToast(`↩️ Đã từ chối gỡ nguồn ${selected.id}. Tài sản phục hồi trạng thái.`, 'warning');
    setSelected(null); setMode(null); setRejectNote('');
    setSubmitting(false); loadData();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ih-main-bg, #fff8f0)', padding: '24px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: '#7b2d00' }}>
            <i className="bi bi-x-octagon-fill text-danger me-2"></i>Gỡ nguồn tài sản
          </h4>
          <small className="text-muted">Đầu chủ yêu cầu · GĐ POS phê duyệt</small>
        </div>
        <span className="badge bg-danger px-3 py-2">Gỡ tin trước khi gỡ nguồn</span>
      </div>

      {toast && (
        <div className={`alert alert-${toast.type} d-flex align-items-center mb-3`}>
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Đủ điều kiện gỡ', count: eligibleCount, color: '#1565c0', icon: 'bi-building', filter: 'eligible' },
          { label: 'Chờ duyệt gỡ', count: pendingCount, color: '#f57c00', icon: 'bi-hourglass-split', filter: 'pending' },
          { label: 'Đã gỡ nguồn', count: approvedCount, color: '#212529', icon: 'bi-archive', filter: 'approved' },
          { label: 'Tổng tài sản', count: properties.filter(p => ROLE === 'admin' || p.pos_name === currentPosName).length, color: '#2e7d32', icon: 'bi-collection', filter: 'all' },
        ].map((s, i) => (
          <div key={i} className="col-md-3">
            <div className="card border-0 shadow-sm h-100" style={{ cursor: 'pointer', borderLeft: `4px solid ${s.color}`, transform: filterStatus === s.filter ? 'scale(1.02)' : 'scale(1)', transition: '0.2s' }}
              onClick={() => setFilterStatus(s.filter)}>
              <div className="card-body d-flex align-items-center gap-3">
                <i className={`bi ${s.icon} fs-2`} style={{ color: s.color }}></i>
                <div>
                  <div className="fw-bold fs-3" style={{ color: s.color }}>{s.count}</div>
                  <div className="text-muted small">{s.label}</div>
                </div>
                {filterStatus === s.filter && <i className="bi bi-check-circle-fill ms-auto" style={{ color: s.color }}></i>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        {/* Properties list */}
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-header border-0 d-flex align-items-center justify-content-between flex-wrap gap-2" style={{ background: '#fdede8' }}>
              <span className="fw-bold"><i className="bi bi-list-ul me-1"></i>Danh sách Tài sản ({filtered.length})</span>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <div className="btn-group btn-group-sm">
                  {[['eligible','🏢 Đủ ĐK gỡ'],['pending','⏳ Chờ POS duyệt'],['approved','✅ Đã gỡ'],['all','Tất cả']].map(([v, l]) => (
                    <button key={v} className={`btn ${filterStatus === v ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setFilterStatus(v)}>{l}</button>
                  ))}
                </div>
                <div className="d-flex gap-1 align-items-center">
                  <span className="input-group-text bg-white border rounded" style={{fontSize:11}}><i className="bi bi-calendar3"></i></span>
                  <input type="date" className="form-control form-control-sm" style={{width:120}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Từ ngày" />
                  <span className="small text-muted">—</span>
                  <input type="date" className="form-control form-control-sm" style={{width:120}} value={dateTo} onChange={e => setDateTo(e.target.value)} title="Đến ngày" />
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => {
                      const r = defaultF8DateRange();
                      setDateFrom(r.from);
                      setDateTo(r.to);
                    }}
                    title="Đặt lại: đầu tháng → hôm nay"
                  >
                    Đặt lại
                  </button>
                  {(dateFrom || dateTo) && (
                    <button type="button" className="btn btn-outline-secondary btn-sm" title="Bỏ lọc ngày" onClick={() => { setDateFrom(''); setDateTo(''); }}>×</button>
                  )}
                </div>
              </div>
            </div>
            <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="small text-muted">Mã Tài Sản</th>
                      <th className="small text-muted">Địa chỉ</th>
                      <th className="small text-muted">POS quản lý</th>
                      <th className="small text-muted">Người tạo</th>
                      <th className="small text-muted">Ngày tạo</th>
                      <th className="small text-muted">Trạng thái L1</th>
                      <th className="small text-muted">Trạng thái L2</th>
                      <th className="small text-muted text-end">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan="8" className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có tài sản nào.</p></td></tr>
                    )}
                    {filtered.map(p => {
                      const cfg = STATUS_CONFIG[p.level1_status] || { bg: 'secondary', text: 'white', icon: '?' };
                      const isSelected = selected?.id === p.id;
                      return (
                        <tr key={p.id} className={`${isSelected ? 'bg-danger bg-opacity-10' : ''}`} style={{ cursor: 'pointer' }} onClick={() => { setSelected(p); setMode('view'); setRejectNote(''); setUnsourceNote(''); }}>
                          <td><span className="badge bg-dark">{formatLSId(p.propertyCode || p.id)}</span></td>
                          <td className="fw-semibold text-truncate" style={{ maxWidth: 200 }} title={p.address}>{p.address}</td>
                          <td><span className="badge bg-light text-dark border">{p.pos_name || '—'}</span></td>
                          <td>{p.createdBy}</td>
                          <td>{new Date(p.createdAt).toLocaleDateString('vi-VN')}</td>
                          <td><span className={statusBadgeClass(cfg.bg)}>{cfg.icon} {p.level1_status}</span></td>
                          <td><span className={statusBadgeClass(L2_PROPERTY_BADGE[p.level2_status] || 'secondary')}>{p.level2_status}</span></td>
                          <td className="text-end">
                            <i className="bi bi-arrow-right-circle-fill text-danger fs-5"></i>
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

        {/* Full Screen Modal Preview */}
        {selected && (() => {
          const prop = selected;
          const priceText = prop.price_display || `${Number(prop.price).toLocaleString('en-US')} ${prop.priceUnit || 'VNĐ'}`;
          const canDoRequest = CAN_UNSOURCE.includes(prop.level2_status) && ['Được duyệt','Được đảm bảo'].includes(prop.level1_status);
          
          return (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050 }}>
              <div className="modal-dialog modal-xl modal-dialog-scrollable">
                <div className="modal-content border-0">
                  <div className="modal-header bg-light border-bottom">
                    <h5 className="modal-title fw-bold text-danger"><i className="bi bi-x-octagon me-2"></i>Chi tiết Gỡ Nguồn Tài Sản</h5>
                    <button type="button" className="btn-close" onClick={() => { setSelected(null); setMode(null); }}></button>
                  </div>
                  <div className="modal-body p-0" style={{ backgroundColor: '#f8f9fa' }}>
                    
                    {/* Top Alert Action Bar */}
                    <div className="bg-white p-3 border-bottom shadow-sm d-flex justify-content-between align-items-center sticky-top" style={{ zIndex: 10 }}>
                      <div>
                        <span className="badge bg-dark me-2">{prop.propertyCode || prop.id}</span>
                        <span className={`${statusBadgeClass(STATUS_CONFIG[prop.level1_status]?.bg || 'secondary')} me-2`}>
                          {STATUS_CONFIG[prop.level1_status]?.icon} L1: {prop.level1_status}
                        </span>
                        <span className={`${statusBadgeClass(L2_PROPERTY_BADGE[prop.level2_status] || 'secondary')} me-2`}>
                          L2: {prop.level2_status}
                        </span>
                        <span className="text-muted small">Người tạo: {prop.createdBy}</span>
                      </div>
                      <div className="d-flex gap-2">
                        {/* Hành động cho SALES */}
                        {(ROLE === 'sales' || ROLE === 'admin') && ['Được duyệt','Được đảm bảo'].includes(prop.level1_status) && mode !== 'request' && (
                          canDoRequest ? (
                            <button className="btn btn-outline-danger fw-bold" onClick={() => setMode('request')}><i className="bi bi-x-octagon me-1"></i>Gửi Yêu cầu Gỡ nguồn</button>
                          ) : (
                            <span className="badge bg-danger p-2"><i className="bi bi-shield-lock me-1"></i>Cần gỡ tin trước</span>
                          )
                        )}
                        
                        {/* Hành động cho POS MANAGER */}
                        {(ROLE === 'pos_manager' || ROLE === 'admin') && prop.level1_status === 'Chờ duyệt gỡ nguồn' && mode !== 'reject' && (
                          <>
                            <button className="btn btn-outline-danger fw-bold" onClick={() => setMode('reject')}><i className="bi bi-x-circle me-1"></i>Từ chối Yêu cầu</button>
                            <button className="btn btn-danger fw-bold" onClick={handleApprove} disabled={submitting}>
                              {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-circle me-1"></i>} Phê duyệt Gỡ nguồn
                            </button>
                          </>
                        )}

                        {prop.level1_status === 'Đã gỡ nguồn' && (
                          <span className="badge bg-dark p-2"><i className="bi bi-archive me-1"></i>Tài sản đã được gỡ nguồn</span>
                        )}
                      </div>
                    </div>

                    {/* Request form overlay (Sales) */}
                    {mode === 'request' && (
                      <div className="bg-warning bg-opacity-10 p-3 border-bottom border-warning">
                        <h6 className="fw-bold text-danger">⚠️ Gửi yêu cầu gỡ nguồn tài sản</h6>
                        <textarea className="form-control mb-2" rows={2} placeholder="Nhập lý do cần gỡ nguồn..." value={unsourceNote} onChange={e => setUnsourceNote(e.target.value)} />
                        <div className="d-flex gap-2">
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => setMode('view')}>Hủy</button>
                          <button className="btn btn-danger btn-sm" onClick={handleRequestUnsource} disabled={submitting}>Xác nhận Gửi yêu cầu</button>
                        </div>
                      </div>
                    )}

                    {/* Reject form overlay (POS Manager) */}
                    {mode === 'reject' && (
                      <div className="bg-danger bg-opacity-10 p-3 border-bottom border-danger">
                        <h6 className="fw-bold text-danger">❌ Từ chối yêu cầu gỡ nguồn</h6>
                        <textarea className="form-control mb-2" rows={2} placeholder="Nhập lý do từ chối (bắt buộc)..." value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                        <div className="d-flex gap-2">
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => setMode('view')}>Hủy</button>
                          <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={submitting}>Xác nhận Từ chối</button>
                        </div>
                      </div>
                    )}

                    {/* Thông tin tài sản (View mode) */}
                    <div className="container-fluid py-4" style={{ maxWidth: '1200px' }}>
                      <div className="row g-4">
                        <div className="col-md-8">
                          <div className="bg-white p-4 shadow-sm rounded">
                            <h5 className="fw-bold mb-4">Thông tin chi tiết Tài sản</h5>
                            <div className="row g-4 mb-4 pb-4 border-bottom">
                              <div className="col-md-6">
                                <div className="text-muted small mb-1">Địa chỉ:</div>
                                <div className="fw-semibold">{prop.address}</div>
                              </div>
                              <div className="col-md-3">
                                <div className="text-muted small mb-1">Giá:</div>
                                <div className="fw-bold text-primary fs-5">{priceText}</div>
                              </div>
                              <div className="col-md-3">
                                <div className="text-muted small mb-1">Diện tích:</div>
                                <div className="fw-semibold">{prop.area} m²</div>
                              </div>
                            </div>
                            <div className="row g-4">
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Hình thức:</div><div className="fw-semibold">{prop.type}</div></div>
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Loại hình:</div><div className="fw-semibold">{prop.propertyType || 'Chung cư'}</div></div>
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Phòng ngủ:</div><div className="fw-semibold">{prop.bedrooms} PN</div></div>
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Tầng:</div><div className="fw-semibold">{prop.floor || 'N/A'}</div></div>
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Tình trạng:</div><div className="fw-semibold">{prop.condition || 'N/A'}</div></div>
                              <div className="col-md-3 col-6"><div className="text-muted small mb-1">Pháp lý:</div><div className="fw-semibold">{prop.legal || 'N/A'}</div></div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-md-4">
                          <div className="bg-white p-4 shadow-sm rounded h-100">
                            <h5 className="fw-bold mb-4">Lịch sử Gỡ nguồn</h5>
                            <div className="timeline-wrapper">
                              {prop.unsourceRequestedAt && (
                                <div className="mb-3 border-bottom pb-2">
                                  <div className="fw-semibold text-warning"><i className="bi bi-clock-history me-1"></i>Yêu cầu Gỡ nguồn</div>
                                  <div className="small text-muted">{new Date(prop.unsourceRequestedAt).toLocaleString('vi-VN')} bởi {prop.unsourceRequestedBy || 'Đầu chủ'}</div>
                                  <div className="small mt-1">Lý do: {prop.unsource_note || 'Không có ghi chú'}</div>
                                </div>
                              )}
                              {prop.unsourceApprovedAt && (
                                <div className="mb-3 border-bottom pb-2">
                                  <div className="fw-semibold text-success"><i className="bi bi-check-circle me-1"></i>Đã phê duyệt Gỡ nguồn</div>
                                  <div className="small text-muted">{new Date(prop.unsourceApprovedAt).toLocaleString('vi-VN')} bởi {prop.unsourceApprovedBy || 'GĐ POS'}</div>
                                </div>
                              )}
                              {prop.unsourceRejectedAt && (
                                <div className="mb-3 border-bottom pb-2">
                                  <div className="fw-semibold text-danger"><i className="bi bi-x-circle me-1"></i>Đã từ chối Gỡ nguồn</div>
                                  <div className="small text-muted">{new Date(prop.unsourceRejectedAt).toLocaleString('vi-VN')} bởi {prop.unsourceRejectedBy || 'GĐ POS'}</div>
                                  <div className="small mt-1 text-danger">Lý do từ chối: {prop.unsourceRejectNote || 'Không có'}</div>
                                </div>
                              )}
                              {!prop.unsourceRequestedAt && <div className="text-muted small">Chưa có dữ liệu.</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
