import { useState, useEffect } from 'react';

const API = 'http://localhost:5000';

const STATUS_CONFIG = {
  'Chờ duyệt':          { bg: 'warning', text: 'dark', icon: '⏳' },
  'Chờ duyệt chỉnh sửa':{ bg: 'info',    text: 'white', icon: '🔄' },
  'Đã duyệt':           { bg: 'success',  text: 'white', icon: '✅' },
  'Từ chối':            { bg: 'danger',   text: 'white', icon: '❌' },
  'Yêu cầu gỡ tin':     { bg: 'secondary',text: 'white', icon: '🔻' },
  'Đã gỡ':              { bg: 'dark',     text: 'white', icon: '🚫' },
};

export default function Feature5_MKTApproval() {
  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | 'view'
  const [rejectNote, setRejectNote] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [l, p] = await Promise.all([
      fetch(`${API}/listings`).then(r => r.json()),
      fetch(`${API}/properties`).then(r => r.json()),
    ]);
    setListings(l); setProperties(p);
  };

  const getProperty = (pid) => properties.find(p => p.id === pid) || {};

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filtered = listings.filter(l => {
    if (filterStatus === 'pending') return l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa';
    if (filterStatus === 'approved') return l.listing_status === 'Đã duyệt';
    if (filterStatus === 'rejected') return l.listing_status === 'Từ chối';
    return true;
  });

  const pendingCount = listings.filter(l => l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa').length;
  const approvedCount = listings.filter(l => l.listing_status === 'Đã duyệt').length;
  const rejectedCount = listings.filter(l => l.listing_status === 'Từ chối').length;

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    const prop = getProperty(selected.property_id);
    // Update listing
    await fetch(`${API}/listings/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Đã duyệt',
        approvedBy: 'Nguyễn Thị MKT',
        approvedBy_id: 'u_mkt1',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiredAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    // AUTO-SYNC: update property level2_status (BR-003)
    if (prop.id) {
      await fetch(`${API}/properties/${prop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level2_status: 'Đang niêm yết', updatedAt: new Date().toISOString() }),
      });
    }
    setSubmitting(false);
    setSelected(null); setMode(null);
    showToast(`✅ Đã duyệt bài đăng ${selected.id}! AUTO-SYNC: Tài sản ${selected.property_id} → "Đang niêm yết" (BR-003)`);
    loadData();
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) { showToast('Vui lòng nhập lý do từ chối!', 'danger'); return; }
    setSubmitting(true);
    await fetch(`${API}/listings/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Từ chối',
        rejection_note: rejectNote,
        rejectedBy: 'Nguyễn Thị MKT',
        rejectedBy_id: 'u_mkt1',
        rejectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    setSubmitting(false);
    showToast(`❌ Đã từ chối bài đăng ${selected.id}. Đầu chủ sẽ nhận thông báo để chỉnh sửa.`, 'warning');
    setSelected(null); setMode(null); setRejectNote('');
    loadData();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0fff4', padding: '24px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: '#1b5e20' }}>
            <i className="bi bi-patch-check me-2 text-success"></i>Feature 5 – Phê duyệt Niêm yết (UC005)
          </h4>
          <small className="text-muted">Kiểm duyệt nội dung & Phê duyệt công khai iHouzz.com | Actor: Chuyên viên Marketing</small>
        </div>
        <span className="badge bg-success px-3 py-2">BR-003: AUTO-SYNC khi duyệt</span>
      </div>

      {toast && (
        <div className={`alert alert-${toast.type} d-flex align-items-center mb-3`}>
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Chờ duyệt', count: pendingCount, color: '#f57c00', icon: 'bi-hourglass-split', filter: 'pending' },
          { label: 'Đã duyệt', count: approvedCount, color: '#2e7d32', icon: 'bi-broadcast', filter: 'approved' },
          { label: 'Từ chối', count: rejectedCount, color: '#c62828', icon: 'bi-x-circle', filter: 'rejected' },
          { label: 'Tổng bài đăng', count: listings.length, color: '#1565c0', icon: 'bi-collection', filter: 'all' },
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
        {/* Left: Listing list */}
        <div className={selected ? 'col-md-5' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-header border-0 d-flex align-items-center justify-content-between" style={{ background: '#e8f5e9' }}>
              <span className="fw-bold"><i className="bi bi-list-ul me-1"></i>Danh sách bài đăng ({filtered.length})</span>
              <div className="btn-group btn-group-sm">
                {[['pending','⏳ Chờ duyệt'],['approved','✅ Đã duyệt'],['rejected','❌ Từ chối'],['all','Tất cả']].map(([v, l]) => (
                  <button key={v} className={`btn ${filterStatus === v ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setFilterStatus(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có bài đăng nào.</p>
                </div>
              )}
              {filtered.map(l => {
                const prop = getProperty(l.property_id);
                const cfg = STATUS_CONFIG[l.listing_status] || { bg: 'secondary', text: 'white', icon: '?' };
                const isSelected = selected?.id === l.id;
                return (
                  <div key={l.id} className={`p-3 border-bottom ${isSelected ? 'bg-success bg-opacity-10' : ''}`}
                    style={{ cursor: 'pointer' }} onClick={() => { setSelected(l); setMode('view'); setRejectNote(''); }}>
                    <div className="d-flex align-items-start justify-content-between mb-1">
                      <div>
                        <span className="badge bg-dark me-1">{l.id}</span>
                        <span className={`badge bg-${cfg.bg} text-${cfg.text}`}>{cfg.icon} {l.listing_status}</span>
                        {l.listing_status === 'Chờ duyệt chỉnh sửa' && <span className="badge bg-info ms-1">Đã chỉnh sửa</span>}
                      </div>
                      {isSelected && <i className="bi bi-arrow-right-circle-fill text-success"></i>}
                    </div>
                    <div className="fw-semibold small mb-1" style={{ lineHeight: 1.3 }}>{l.title}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      <span className="me-2">📍 {prop.id}</span>
                      <span>👤 {l.createdBy}</span>
                      <span className="ms-2">🕐 {new Date(l.createdAt).toLocaleDateString('vi-VN')}</span>
                    </div>
                    {l.rejection_note && (
                      <div className="mt-1 text-danger small"><i className="bi bi-exclamation-circle me-1"></i>{l.rejection_note.substring(0, 60)}...</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Detail Panel */}
        {selected && (
          <div className="col-md-7">
            <div className="card border-0 shadow-sm">
              <div className="card-header border-0 d-flex align-items-center justify-content-between" style={{ background: '#c8e6c9' }}>
                <span className="fw-bold"><i className="bi bi-file-text me-1"></i>Chi tiết bài đăng – {selected.id}</span>
                <button className="btn-close" onClick={() => { setSelected(null); setMode('view'); }}></button>
              </div>
              <div className="card-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {/* Property info */}
                {(() => {
                  const prop = getProperty(selected.property_id);
                  return (
                    <div className="alert alert-light border mb-3">
                      <div className="fw-semibold small mb-1">🏠 Tài sản liên kết: <span className="badge bg-dark">{prop.id}</span></div>
                      <div className="small text-muted">{prop.address}</div>
                      <div className="d-flex gap-2 mt-1">
                        <span className="badge bg-light text-dark border">{prop.area}m²</span>
                        <span className="badge bg-light text-dark border">{prop.bedrooms}PN/{prop.bathrooms}WC</span>
                        <span className="badge bg-primary">{prop.price_display}</span>
                        <span className="badge bg-secondary">{prop.warehouse_type}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Images */}
                <div className="d-flex gap-2 mb-3">
                  {['🏠','🛋️','🌿'].map((e, i) => (
                    <div key={i} className="rounded border d-flex align-items-center justify-content-center" style={{ width: 80, height: 60, background: '#f8f9fa', fontSize: 28 }}>{e}</div>
                  ))}
                </div>

                {/* Title & Content */}
                <div className="mb-2"><span className="text-muted small">Tiêu đề:</span><div className="fw-bold">{selected.title}</div></div>
                <div className="mb-3"><span className="text-muted small">Nội dung mô tả:</span>
                  <pre className="bg-light rounded p-2 mt-1 small" style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{selected.description}</pre>
                </div>
                <div className="mb-3"><span className="text-muted small">📞 SĐT liên hệ:</span><div className="fw-semibold">{selected.contact_phone || 'N/A'}</div></div>

                {/* Previous rejection note */}
                {selected.prev_rejection_note && (
                  <div className="alert alert-warning small">
                    <strong>⚠️ Lý do từ chối trước:</strong> {selected.prev_rejection_note}
                  </div>
                )}
                {selected.rejection_note && (
                  <div className="alert alert-danger small">
                    <strong>❌ Lý do từ chối:</strong> {selected.rejection_note}
                    <div className="mt-1 text-muted">Từ chối bởi: {selected.rejectedBy} – {selected.rejectedAt ? new Date(selected.rejectedAt).toLocaleString('vi-VN') : ''}</div>
                  </div>
                )}

                {/* Action Buttons */}
                {(selected.listing_status === 'Chờ duyệt' || selected.listing_status === 'Chờ duyệt chỉnh sửa') && mode === 'view' && (
                  <div className="d-flex gap-2 mt-3">
                    <button className="btn btn-success flex-grow-1" onClick={() => setMode('approve')}>
                      <i className="bi bi-check-circle me-1"></i>Phê duyệt → LISTED
                    </button>
                    <button className="btn btn-danger flex-grow-1" onClick={() => setMode('reject')}>
                      <i className="bi bi-x-circle me-1"></i>Từ chối
                    </button>
                  </div>
                )}

                {/* Approve confirm */}
                {mode === 'approve' && (
                  <div className="alert alert-success mt-3">
                    <h6 className="fw-bold">✅ Xác nhận Phê duyệt</h6>
                    <p className="small mb-2">Bài đăng sẽ được <strong>công khai trên iHouzz.com</strong> và hệ thống sẽ tự động:<br/>
                      ▸ Cập nhật trạng thái tài sản <strong>{selected.property_id}</strong> Level 2 → <strong>"Đang niêm yết"</strong> (BR-003 AUTO-SYNC)<br/>
                      ▸ Thiết lập ngày hết hạn: <strong>90 ngày</strong> từ hôm nay
                    </p>
                    <div className="d-flex gap-2">
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => setMode('view')}>Hủy</button>
                      <button className="btn btn-success btn-sm" onClick={handleApprove} disabled={submitting}>
                        {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                        Xác nhận Duyệt
                      </button>
                    </div>
                  </div>
                )}

                {/* Reject form */}
                {mode === 'reject' && (
                  <div className="alert alert-danger mt-3">
                    <h6 className="fw-bold">❌ Từ chối bài đăng (BR-011)</h6>
                    <p className="small mb-2">Bài đăng sẽ được trả về Đầu chủ để chỉnh sửa. Tất cả trường sẽ được mở khóa để sửa.</p>
                    <label className="form-label small fw-semibold">Lý do từ chối <span className="text-danger">*</span></label>
                    <textarea className="form-control form-control-sm mb-2" rows={3} placeholder="Nhập lý do cụ thể để Đầu chủ chỉnh sửa..." value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                    <div className="mb-2">
                      {['Hình ảnh không đủ chất lượng','Mô tả sai thông tin tài sản','Thiếu thông tin liên hệ','Nội dung vi phạm quy định'].map(r => (
                        <button key={r} className="btn btn-outline-danger btn-sm me-1 mb-1" onClick={() => setRejectNote(r)}>{r}</button>
                      ))}
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => setMode('view')}>Hủy</button>
                      <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={submitting}>
                        {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                        Xác nhận Từ chối
                      </button>
                    </div>
                  </div>
                )}

                {/* Audit Trail */}
                <div className="mt-3">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowAudit(a => !a)}>
                    <i className="bi bi-clock-history me-1"></i>Lịch sử bài đăng
                  </button>
                  {showAudit && (
                    <div className="mt-2 small">
                      {[
                        { time: selected.createdAt, actor: selected.createdBy, action: 'Tạo bài đăng → Chờ duyệt', color: 'primary' },
                        selected.rejectedAt && { time: selected.rejectedAt, actor: selected.rejectedBy, action: `Từ chối: ${selected.rejection_note}`, color: 'danger' },
                        selected.approvedAt && { time: selected.approvedAt, actor: selected.approvedBy, action: 'Phê duyệt → LISTED (AUTO-SYNC)', color: 'success' },
                      ].filter(Boolean).map((e, i) => (
                        <div key={i} className={`border-start border-${e.color} border-3 ps-2 mb-2`}>
                          <div className="fw-semibold">{e.action}</div>
                          <div className="text-muted">{e.actor} – {new Date(e.time).toLocaleString('vi-VN')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
