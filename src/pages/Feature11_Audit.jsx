import { useState, useEffect, useCallback } from 'react';
import {
  API,
  readSessionUser,
  formatListingId,
  formatPropertyId,
  postEntityAudit,
  AUDIT_ACTION_TYPE,
  SESSION_CHANGED_EVENT,
} from '../utils/listingWorkflow';

/** UC012 — Export CSV (đủ trường pháp lý / vận hành demo + action_type / modified_fields). */
const AUDIT_CSV_HEADERS = [
  'STT',
  'ID bản ghi log',
  'Thời gian (ISO 8601)',
  'Ngày (VN)',
  'Giờ (VN)',
  'Hành động / Sự kiện',
  'action_type (canonical)',
  'entityId',
  'listing_id',
  'property_id',
  'user_id',
  'Người thực hiện (tên)',
  'Chi nhánh POS',
  'Vai trò (suy ra)',
  'Trạng thái cũ',
  'Trạng thái mới',
  'Lý do',
  'Chi tiết / Context',
  'modified_fields (JSON)',
  'Loại đối tượng',
  'Mã tin (LT)',
  'Mã TS (LS)',
  'IP ghi nhận',
  'User-Agent',
  'Phiên / Session ref',
  'Kênh nguồn',
  'Kết quả / Outcome',
  'Mã lô export',
  'Thời điểm xuất file',
];

function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Ngày local YYYY-MM-DD — đồng bộ F7/F9/F10 (tránh lệch UTC `toISOString`). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF11DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

function auditCsvCell(v) {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function resolveAuditActor(log, userList) {
  if (log.user_id) {
    const u = userList.find((x) => x.id === log.user_id);
    if (u) return { pos: u.pos_name || '', role: u.role || '' };
  }
  const byName = userList.find((x) => x.name === log.user || x.email === log.user);
  return { pos: byName?.pos_name || '', role: byName?.role || '' };
}

const ACTION_ICON = {
  'Tạo': { icon: 'bi-plus-circle-fill', color: '#1976d2' },
  'Duyệt': { icon: 'bi-check-circle-fill', color: '#388e3c' },
  'Từ chối': { icon: 'bi-x-circle-fill', color: '#e53935' },
  'Gỡ tin': { icon: 'bi-sign-stop-fill', color: '#f57c00' },
  'Gỡ nguồn': { icon: 'bi-x-octagon-fill', color: '#616161' },
  'Khóa': { icon: 'bi-lock-fill', color: '#b71c1c' },
  'Mở khóa': { icon: 'bi-unlock-fill', color: '#1b5e20' },
  'Kích hoạt': { icon: 'bi-person-check-fill', color: '#0288d1' },
  'Export': { icon: 'bi-download', color: '#6a1b9a' },
};

const getActionMeta = (action) => {
  const key = Object.keys(ACTION_ICON).find(k => action?.includes(k));
  return ACTION_ICON[key] || { icon: 'bi-dot', color: '#9e9e9e' };
};

function AccessGuard({ role }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-5">
      <i className="bi bi-shield-lock-fill fs-1 text-danger mb-3"></i>
      <h5 className="fw-bold text-danger">Truy cập bị từ chối</h5>
      <p className="text-muted">Chỉ <strong>Admin Tổng</strong> mới có quyền xem Audit Trail.</p>
      <div className="badge bg-secondary mt-2">Role hiện tại: {String(role || 'guest').toUpperCase()}</div>
    </div>
  );
}

export default function Feature11_Audit() {
  const [user, setUser] = useState(() => readSessionUser());
  const auditRole = user?.role || 'guest';

  useEffect(() => {
    const bump = () => setUser(readSessionUser());
    const onStorage = (e) => {
      if (e.key === 'user' || e.key === 'user_role' || e.key === null) bump();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, bump);
    };
  }, []);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [tab, setTab] = useState('table'); // 'table' | 'timeline'
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { from: f11From, to: f11To } = defaultF11DateRange();
  const [dateFrom, setDateFrom] = useState(f11From);
  const [dateTo, setDateTo] = useState(f11To);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, uRaw] = await Promise.all([
        // json-server v1: `_order` không phải reserved → bị parse thành filter (0 bản ghi). Desc dùng tiền tố `-` (sort-on).
        fetch(`${API}/logs?_sort=-timestamp&_per_page=10000`).then((r) => r.json()),
        fetch(`${API}/users`).then((r) => r.json()).catch(() => []),
      ]);
      setLogs(normalizeJsonList(logRes));
      setUsers(normalizeJsonList(uRaw));
    } catch (err) {
      console.error('Audit load error', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auditRole !== 'admin') return;
    load();
  }, [auditRole, load]);

  if (auditRole !== 'admin') return (
    <div className="p-4" style={{ background: 'var(--ih-audit-deny-bg, #fff0f0)', minHeight: '100vh' }}>
      <h4 className="fw-bold mb-3 text-danger">
        <i className="bi bi-shield-lock me-2"></i>Nhật ký thao tác
      </h4>
      <AccessGuard role={auditRole} />
    </div>
  );

  const postExportLog = async () => {
    const actor = user.name || 'Admin';
    await postEntityAudit({
      action: `Export nhật ký thao tác · ${filtered.length} bản ghi`,
      actionType: AUDIT_ACTION_TYPE.AUDIT_EXPORT_RUN,
      entityId: 'SYSTEM',
      user: actor,
      user_id: user.id || '',
    });
  };

  const handleExport = async () => {
    setExporting(true);
    await new Promise(r => setTimeout(r, 1200)); // simulate latency
    await postExportLog();
    if (AUDIT_CSV_HEADERS.length !== 29) {
      console.error('F11 CSV: số cột không đúng 29');
    }
    const batchId = `EXP-${Date.now()}`;
    const exportTs = new Date().toISOString();
    const dataRows = filtered.map((l, idx) => {
      const actor = resolveAuditActor(l, users);
      const ts = l.timestamp || '';
      const day = ts.slice(0, 10);
      const time = ts.length > 11 ? ts.slice(11, 19) : '';
      const entityId = l.entityId != null ? String(l.entityId) : '';
      const listingIdRaw = l.listing_id != null ? String(l.listing_id) : entityId;
      let entityType = 'Hệ thống';
      if (entityId.startsWith('LT-')) entityType = 'Tin đăng';
      else if (entityId.startsWith('LS-')) entityType = 'Tài sản';
      else if (entityId.startsWith('ACCOUNT:')) entityType = 'Tài khoản';
      else if (entityId === 'ACCOUNT') entityType = 'Tài khoản';
      else if (entityId && entityId !== 'SYSTEM') entityType = 'Khác';
      const lt = formatListingId(l.listingCode || listingIdRaw || entityId);
      const pidRaw = l.property_id != null ? String(l.property_id) : '';
      const ls = pidRaw.startsWith('LS-') ? formatPropertyId(pidRaw) : pidRaw;
      const outcome = l.new_status || (l.action ? String(l.action).slice(0, 120) : '');
      let modifiedJson = '';
      if (l.modified_fields != null) {
        try {
          modifiedJson = typeof l.modified_fields === 'string' ? l.modified_fields : JSON.stringify(l.modified_fields);
        } catch {
          modifiedJson = String(l.modified_fields);
        }
      }
      const cells = [
        idx + 1,
        l.id ?? '',
        ts,
        day,
        time,
        l.action || '',
        l.action_type || '',
        entityId,
        listingIdRaw,
        l.property_id || '',
        l.user_id || '',
        l.user || '',
        actor.pos,
        actor.role,
        l.old_status || '',
        l.new_status || '',
        l.reason || '',
        l.detail || '',
        modifiedJson,
        entityType,
        lt,
        ls,
        '',
        '',
        '',
        'Web / Demo',
        outcome,
        batchId,
        exportTs,
      ];
      return cells.map(auditCsvCell).join(',');
    });
    const csv = [AUDIT_CSV_HEADERS.map(auditCsvCell).join(','), ...dataRows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `ihouzz_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExporting(false); setShowExportModal(false);
    load(); // refresh to show the export log itself
  };

  const allUsers = [...new Set(logs.map(l => l.user).filter(Boolean))];
  const allEntities = [...new Set(logs.map(l => l.entityId).filter(Boolean))];

  const filtered = logs.filter(l => {
    const entitySearch = String(l.entityId ?? '').toLowerCase();
    if (search && !l.action?.toLowerCase().includes(search.toLowerCase()) && !entitySearch.includes(search.toLowerCase())) return false;
    if (filterUser && l.user !== filterUser) return false;
    if (filterEntity && String(l.entityId ?? '') !== String(filterEntity)) return false;
    if (l.timestamp) {
      const d = l.timestamp.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
    }
    return true;
  });

  const getUserDisplay = (userName) => {
    if (!userName) return '—';
    const u = users.find(x => x.name === userName || x.email === userName);
    if (u) return `${u.name} · ${u.pos_name || 'Hệ thống'}`;
    return userName;
  };

  const formatEntity = (id) => {
    if (id == null || id === '') return id;
    const s = String(id);
    if (s === 'SYSTEM' || s === 'ACCOUNT') return s;
    if (s.startsWith('ACCOUNT:')) return s;
    if (s.startsWith('LT-')) return formatListingId(s);
    return formatPropertyId(s);
  };

  return (
    <div className="p-4" style={{ background: 'var(--ih-audit-bg, #0d1117)', minHeight: '100vh', color: '#e6edf3' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#58a6ff' }}>
            <i className="bi bi-journal-text me-2"></i>Nhật ký thao tác
          </h4>
          <small style={{ color: '#8b949e' }}>
            Chỉ Admin · Read-only · Append-only · Immutable
          </small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-danger px-3 py-2">🔒 Chỉ đọc</span>
          <button className="btn btn-sm" style={{ background: '#238636', color: '#fff' }}
            onClick={() => setShowExportModal(true)}>
            <i className="bi bi-download me-1"></i>Export CSV
          </button>
          <button className="btn btn-sm btn-outline-secondary" style={{ borderColor: '#30363d', color: '#e6edf3' }} onClick={load}>
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Tổng sự kiện', value: logs.length, color: '#58a6ff', icon: 'bi-list-ul' },
          { label: 'Người dùng', value: allUsers.length, color: '#3fb950', icon: 'bi-people' },
          { label: 'Đối tượng', value: allEntities.length, color: '#d29922', icon: 'bi-database' },
          { label: 'Hôm nay', value: logs.filter(l => l.timestamp?.startsWith(formatLocalYmd(new Date()))).length, color: '#f78166', icon: 'bi-calendar-day' },
        ].map(s => (
          <div key={s.label} className="col-6 col-md-3">
            <div className="card border-0 p-3 d-flex flex-row align-items-center gap-3"
              style={{ background: '#161b22', border: '1px solid #30363d' }}>
              <i className={`bi ${s.icon} fs-4`} style={{ color: s.color }}></i>
              <div>
                <div className="fw-bold fs-5 lh-1" style={{ color: '#f0f6fc' }}>
                  {s.value}
                </div>
                <div className="small" style={{ color: '#8b949e' }}>{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Immutability banner */}
      <div className="alert d-flex align-items-start gap-2 mb-4 py-2" style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8 }}>
        <i className="bi bi-shield-check text-info mt-1"></i>
        <span className="small">
          <strong style={{ color: '#58a6ff' }}>Nguyên tắc Append-only:</strong> Không có hành động Sửa/Xóa nào được phép trên Audit Log. Mọi thao tác Export cũng tự động tạo thêm 1 bản ghi mới.
        </span>
      </div>

      {/* Tabs */}
      <div className="d-flex gap-2 mb-3">
        <button className={`btn btn-sm ${tab === 'table' ? 'btn-primary' : 'btn-outline-secondary'}`}
          style={tab !== 'table' ? { borderColor: '#30363d', color: '#e6edf3' } : {}}
          onClick={() => setTab('table')}>
          <i className="bi bi-table me-1"></i>Bảng log
        </button>
        <button className={`btn btn-sm ${tab === 'timeline' ? 'btn-primary' : 'btn-outline-secondary'}`}
          style={tab !== 'timeline' ? { borderColor: '#30363d', color: '#e6edf3' } : {}}
          onClick={() => setTab('timeline')}>
          <i className="bi bi-diagram-3 me-1"></i>Timeline
        </button>
      </div>

      {/* Filters */}
      <div className="card border-0 p-3 mb-3" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <div className="row g-2">
          <div className="col-md-4">
            <input className="form-control form-control-sm" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }}
              placeholder="🔍 Tìm hành động hoặc đối tượng..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="col-md-3">
            <select className="form-select form-select-sm" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }}
              value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="">Tất cả người thực hiện</option>
              {allUsers.map(u => <option key={u} value={u}>{getUserDisplay(u)}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <select className="form-select form-select-sm" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }}
              value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              <option value="">Tất cả đối tượng</option>
              {allEntities.map(e => <option key={e} value={e}>{formatEntity(e)}</option>)}
            </select>
          </div>
          <div className="col-md-4 d-flex align-items-center gap-2">
            <input type="date" className="form-control form-control-sm" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', width: 130 }}
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span style={{ color: '#8b949e' }}>—</span>
            <input type="date" className="form-control form-control-sm" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', width: 130 }}
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <button type="button" className="btn btn-sm btn-outline-secondary" style={{ borderColor: '#30363d', color: '#8b949e' }}
              onClick={() => {
                const r = defaultF11DateRange();
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
              title="Đặt lại: đầu tháng → hôm nay"
            >
              Đặt lại
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" style={{ borderColor: '#30363d', color: '#8b949e' }}
              onClick={() => { setDateFrom(''); setDateTo(''); }}>×</button>
          </div>
          <div className="col-md-2 d-flex align-items-center">
            <small style={{ color: '#8b949e' }}>{filtered.length} / {logs.length} bản ghi</small>
          </div>
        </div>
      </div>

      {/* TABLE View */}
      {tab === 'table' && (
        <div className="card border-0" style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div className="card-body p-0" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            {loading && (
              <div className="text-center py-5" style={{ color: '#8b949e' }}>
                <div className="spinner-border" style={{ color: '#58a6ff' }}></div>
                <p className="mt-2">Đang tải audit log...</p>
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-5" style={{ color: '#8b949e' }}>
                <i className="bi bi-inbox fs-2"></i>
                <p className="mt-2">Không có bản ghi nào.</p>
              </div>
            )}
            {!loading && filtered.map((l, i) => {
              const meta = getActionMeta(l.action);
              const isSelected = selected?.id === l.id;
              return (
                <div key={l.id || i}
                  className={`p-3 d-flex align-items-start gap-3 ${isSelected ? 'bg-primary bg-opacity-25' : ''}`}
                  style={{ borderBottom: '1px solid #21262d', cursor: 'pointer', transition: '0.15s' }}
                  onClick={() => setSelected(isSelected ? null : l)}>
                  <i className={`bi ${meta.icon} mt-1 flex-shrink-0`} style={{ color: meta.color, fontSize: 18 }}></i>
                  <div className="flex-grow-1">
                    <div className="small" style={{ color: '#e6edf3', lineHeight: 1.5 }}>{l.action}</div>
                    <div className="d-flex gap-3 mt-1 flex-wrap">
                      <span className="badge" style={{ background: '#21262d', color: '#58a6ff' }}>{formatEntity(l.entityId)}</span>
                      <span className="small" style={{ color: '#8b949e' }}>
                        <i className="bi bi-person me-1"></i>{getUserDisplay(l.user)}
                      </span>
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0" style={{ color: '#8b949e', fontSize: 11 }}>
                    {l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TIMELINE View */}
      {tab === 'timeline' && (
        <div className="card border-0 p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
          {filtered.length === 0 && (
            <div className="text-center py-4" style={{ color: '#8b949e' }}>
              <i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có sự kiện nào.</p>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            {filtered.slice(0, 30).map((l, i) => {
              const meta = getActionMeta(l.action);
              return (
                <div key={l.id || i} className="d-flex align-items-start gap-3 mb-3"
                  style={{ position: 'relative' }}>
                  {/* Vertical line */}
                  {i < filtered.slice(0, 30).length - 1 && (
                    <div style={{ position: 'absolute', left: 11, top: 26, width: 2, height: 'calc(100% + 12px)', background: '#21262d' }}></div>
                  )}
                  <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 24, height: 24, background: meta.color + '30', border: `2px solid ${meta.color}`, zIndex: 1 }}>
                    <i className={`bi ${meta.icon}`} style={{ color: meta.color, fontSize: 10 }}></i>
                  </div>
                  <div className="flex-grow-1" style={{ paddingBottom: 4 }}>
                    <div className="small" style={{ color: '#e6edf3' }}>{l.action}</div>
                    <div className="d-flex gap-2 mt-1 flex-wrap">
                      <span style={{ color: '#58a6ff', fontSize: 11 }}>{formatEntity(l.entityId)}</span>
                      <span style={{ color: '#8b949e', fontSize: 11 }}>· {getUserDisplay(l.user)}</span>
                      <span style={{ color: '#8b949e', fontSize: 11 }}>· {l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : ''}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 30 && (
              <div className="text-center small" style={{ color: '#8b949e' }}>... và {filtered.length - 30} sự kiện khác. Dùng filter để thu hẹp.</div>
            )}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="card border-0 mt-3 p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
          <div className="d-flex justify-content-between mb-3">
            <h6 className="fw-bold" style={{ color: '#58a6ff' }}>
              <i className="bi bi-zoom-in me-2"></i>Chi tiết Sự kiện
            </h6>
            <button className="btn-close btn-close-white btn-sm" onClick={() => setSelected(null)}></button>
          </div>
          <div className="row g-3">
            {[
              ['Thời gian', selected.timestamp ? new Date(selected.timestamp).toLocaleString('vi-VN') : '—'],
              ['Đối tượng', formatEntity(selected.entityId)],
              ['Người thực hiện', getUserDisplay(selected.user)],
              ['Hành động', selected.action],
            ].map(([k, v]) => (
              <div key={k} className="col-md-6">
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 2 }}>{k}</div>
                  <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="alert mt-3 py-2 small" style={{ background: '#1c2128', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8 }}>
            <i className="bi bi-shield-check me-1 text-success"></i>
            Bản ghi này <strong style={{ color: '#3fb950' }}>không thể sửa hoặc xóa</strong>. Audit Log là bất biến (Immutable).
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }}>
              <div className="modal-header border-0" style={{ borderBottom: '1px solid #30363d' }}>
                <h5 className="modal-title fw-bold" style={{ color: '#58a6ff' }}>
                  <i className="bi bi-download me-2"></i>Export Audit Log
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowExportModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert py-2 small" style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8 }}>
                  <i className="bi bi-info-circle me-1 text-info"></i>
                  Hành động Export sẽ <strong style={{ color: '#58a6ff' }}>tự động tạo thêm 1 bản ghi Audit</strong> ghi nhận việc xuất dữ liệu (Append-only principle).
                </div>
                <div className="mt-3">
                  <div className="fw-semibold mb-2">Phạm vi export:</div>
                  <div className="p-2 rounded small" style={{ background: '#0d1117', border: '1px solid #30363d' }}>
                    <div>📊 {filtered.length} bản ghi (theo bộ lọc hiện tại)</div>
                    <div className="mt-1" style={{ color: '#8b949e' }}>Format: CSV · UTF-8 BOM · {AUDIT_CSV_HEADERS.length} cột</div>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0" style={{ borderTop: '1px solid #30363d' }}>
                <button className="btn btn-outline-secondary" style={{ borderColor: '#30363d', color: '#e6edf3' }}
                  onClick={() => setShowExportModal(false)}>Hủy</button>
                <button className="btn fw-bold px-4" style={{ background: '#238636', color: '#fff' }}
                  onClick={handleExport} disabled={exporting}>
                  {exporting ? <><span className="spinner-border spinner-border-sm me-2"></span>Đang export...</> : <><i className="bi bi-download me-2"></i>Export CSV</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
