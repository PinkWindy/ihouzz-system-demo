import { useState, useEffect } from 'react';

const API = 'http://localhost:5000';

const UNLIST_REASONS = [
  { value: 'Ngưng niêm yết', label: 'Ngưng niêm yết', icon: '⏸️', desc: 'Tạm ngưng hiển thị, tài sản về "Chưa niêm yết". Có thể đăng lại sau.', nextLv2: 'Chưa niêm yết' },
  { value: 'Thẩm định phí', label: 'Thẩm định phí hoa hồng', icon: '💰', desc: 'Tạm ngưng để thẩm định lại phí hoa hồng. Tài sản về "Thẩm định phí".', nextLv2: 'Thẩm định phí' },
];

export default function Feature6_Unlist() {
  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [tab, setTab] = useState('sales'); // 'sales' | 'admin'
  const [selected, setSelected] = useState(null);
  const [unlistReason, setUnlistReason] = useState('');
  const [unlistNote, setUnlistNote] = useState('');
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState(null); // 'request' | 'approve_admin'
  const [blockError, setBlockError] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [l, p] = await Promise.all([
      fetch(`${API}/listings`).then(r => r.json()),
      fetch(`${API}/properties`).then(r => r.json()),
    ]);
    setListings(l); setProperties(p);
  };

  const getProp = (pid) => properties.find(p => p.id === pid) || {};
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  // Sales view: active listings that can be unlisted
  const activeListing = listings.filter(l => l.listing_status === 'Đã duyệt');
  // Admin view: pending unlist requests
  const unlistRequests = listings.filter(l => l.listing_status === 'Yêu cầu gỡ tin');

  const handleRequestUnlist = async () => {
    if (!unlistReason) { showToast('Vui lòng chọn lý do gỡ tin!', 'danger'); return; }
    setSubmitting(true);
    await fetch(`${API}/listings/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Yêu cầu gỡ tin',
        unlist_reason: unlistReason,
        unlist_note: unlistNote,
        unlistRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    setSubmitting(false);
    showToast(`🔻 Đã gửi yêu cầu gỡ tin cho ${selected.id}. Đang chờ Admin/MKT phê duyệt.`);
    setSelected(null); setMode(null); setUnlistReason(''); setUnlistNote('');
    loadData();
    setTab('admin');
  };

  const handleApproveUnlist = async (l) => {
    setSubmitting(true);
    const reason = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
    const nextLv2 = reason?.nextLv2 || 'Chưa niêm yết';
    // Update listing
    await fetch(`${API}/listings/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_status: 'Đã gỡ', updatedAt: new Date().toISOString() }),
    });
    // AUTO-SYNC property (BR-003, BR-005)
    const prop = getProp(l.property_id);
    if (prop.id) {
      await fetch(`${API}/properties/${prop.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level2_status: nextLv2, updatedAt: new Date().toISOString() }),
      });
    }
    setSubmitting(false);
    showToast(`✅ Đã duyệt gỡ tin ${l.id}. Tài sản ${l.property_id} Level 2 → "${nextLv2}" (BR-005 AUTO-SYNC)`);
    loadData();
  };

  const handleRejectUnlist = async (l) => {
    await fetch(`${API}/listings/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_status: 'Đã duyệt', unlist_reason: null, unlist_note: null, updatedAt: new Date().toISOString() }),
    });
    showToast(`↩️ Đã từ chối yêu cầu gỡ tin ${l.id}. Bài đăng vẫn tiếp tục niêm yết.`, 'warning');
    loadData();
  };

  // BR-010 check: block if property is "Đang niêm yết" for Gỡ nguồn
  const checkBlockGoNguon = (prop) => {
    if (prop.level2_status === 'Đang niêm yết') {
      setBlockError(`⛔ BR-010: Không thể Gỡ nguồn khi tài sản đang "Đang niêm yết". Vui lòng Gỡ tin trước rồi mới Gỡ nguồn.`);
    } else {
      setBlockError(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff8f0', padding: '24px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: '#7b2d00' }}>
            <i className="bi bi-sign-stop me-2 text-warning"></i>Feature 6 – Yêu cầu Gỡ tin (UC006 / UC007)
          </h4>
          <small className="text-muted">Tạm ngưng Niêm yết | Actor: Đầu chủ (gửi) + Marketing/Admin (duyệt)</small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-warning text-dark px-3 py-2">BR-005: Gỡ tin thủ công</span>
          <span className="badge bg-danger px-3 py-2">BR-010: Chặn Gỡ nguồn</span>
        </div>
      </div>

      {toast && <div className={`alert alert-${toast.type} mb-3`}>{toast.msg}</div>}

      {/* Tab switch */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2 d-flex gap-2 align-items-center">
          <button className={`btn ${tab === 'sales' ? 'btn-warning' : 'btn-outline-warning'}`} onClick={() => setTab('sales')}>
            <i className="bi bi-person me-1"></i>Góc Đầu chủ – Gửi yêu cầu gỡ tin
          </button>
          <button className={`btn ${tab === 'admin' ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setTab('admin')}>
            <i className="bi bi-shield-check me-1"></i>Góc Admin/MKT – Duyệt yêu cầu
            {unlistRequests.length > 0 && <span className="badge bg-light text-danger ms-1">{unlistRequests.length}</span>}
          </button>
          <button className="btn btn-outline-secondary ms-auto" onClick={() => setTab('br010')}>
            <i className="bi bi-shield-exclamation me-1"></i>Demo BR-010 (Gỡ nguồn bị chặn)
          </button>
        </div>
      </div>

      {/* ─── TAB: SALES ─── */}
      {tab === 'sales' && (
        <div className="row g-4">
          <div className={selected ? 'col-md-5' : 'col-12'}>
            <div className="card border-0 shadow-sm">
              <div className="card-header border-0 fw-bold" style={{ background: '#fff3e0' }}>
                <i className="bi bi-broadcast me-1 text-warning"></i>Tin đang niêm yết ({activeListing.length})
                <span className="text-muted small ms-2 fw-normal">— Chọn tin để gửi yêu cầu gỡ (UC006)</span>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {activeListing.length === 0 && (
                  <div className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có tin đang niêm yết.</p></div>
                )}
                {activeListing.map(l => {
                  const prop = getProp(l.property_id);
                  const isSelected = selected?.id === l.id;
                  return (
                    <div key={l.id} className={`p-3 border-bottom ${isSelected ? 'bg-warning bg-opacity-10' : ''}`}
                      style={{ cursor: 'pointer' }} onClick={() => { setSelected(l); setMode('request'); setUnlistReason(''); setUnlistNote(''); setBlockError(null); }}>
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <div>
                          <span className="badge bg-dark me-1">{l.id}</span>
                          <span className="badge bg-success">✅ Đang niêm yết</span>
                          <span className={`badge ms-1 ${prop.type === 'Bán' ? 'bg-danger' : 'bg-info'}`}>{prop.type}</span>
                        </div>
                        <small className="text-muted">{l.approvedAt ? new Date(l.approvedAt).toLocaleDateString('vi-VN') : ''}</small>
                      </div>
                      <div className="fw-semibold small">{l.title}</div>
                      <div className="text-muted small">📍 {prop.address}</div>
                      <div className="text-muted small">
                        <span className="me-2">💰 {prop.price_display}</span>
                        <span>📐 {prop.area}m² | {prop.bedrooms}PN/{prop.bathrooms}WC</span>
                      </div>
                      {l.expiredAt && (
                        <div className="small text-warning mt-1">
                          ⏰ Hết hạn: {new Date(l.expiredAt).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Request Form */}
          {selected && mode === 'request' && (
            <div className="col-md-7">
              <div className="card border-0 shadow-sm">
                <div className="card-header border-0 fw-bold" style={{ background: '#ffe0b2' }}>
                  <i className="bi bi-exclamation-triangle me-1 text-warning"></i>Gửi Yêu cầu Gỡ tin – {selected.id}
                </div>
                <div className="card-body">
                  {/* Listing summary */}
                  <div className="alert alert-light border mb-3">
                    <div className="fw-semibold">{selected.title}</div>
                    <div className="text-muted small">Tài sản: {selected.property_id} | Duyệt bởi: {selected.approvedBy || 'N/A'}</div>
                  </div>

                  {/* Choose reason — MANDATORY (BR-005) */}
                  <div className="mb-4">
                    <label className="form-label fw-bold">Lý do gỡ tin <span className="text-danger">*</span> <span className="badge bg-warning text-dark ms-1">BR-005: Bắt buộc chọn</span></label>
                    <div className="row g-3">
                      {UNLIST_REASONS.map(r => (
                        <div key={r.value} className="col-md-6">
                          <div className={`card h-100 border-2 ${unlistReason === r.value ? 'border-warning' : 'border-light'}`}
                            style={{ cursor: 'pointer', transition: '0.2s' }} onClick={() => setUnlistReason(r.value)}>
                            <div className="card-body text-center">
                              <div style={{ fontSize: 36 }}>{r.icon}</div>
                              <div className="fw-bold mt-1">{r.label}</div>
                              <div className="text-muted small mt-1">{r.desc}</div>
                              <div className="mt-2">
                                <span className="badge bg-secondary">Tài sản Lv2 → "{r.nextLv2}"</span>
                              </div>
                              {unlistReason === r.value && (
                                <div className="mt-2"><i className="bi bi-check-circle-fill text-warning fs-5"></i></div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Optional note */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Ghi chú thêm (tùy chọn)</label>
                    <textarea className="form-control" rows={3} placeholder="Lý do chi tiết, ví dụ: Chủ nhà đã tìm được người mua..." value={unlistNote} onChange={e => setUnlistNote(e.target.value)} />
                  </div>

                  {/* Flow diagram */}
                  <div className="alert alert-info small mb-3">
                    <strong>📋 Luồng xử lý (UC006 → UC007):</strong><br/>
                    Đầu chủ gửi yêu cầu → <strong>Admin/MKT duyệt</strong> → Tài sản Level 2 cập nhật tự động (BR-005)
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn btn-outline-secondary" onClick={() => { setSelected(null); setMode(null); }}>← Hủy</button>
                    <button className="btn btn-warning text-dark ms-auto" onClick={handleRequestUnlist} disabled={submitting || !unlistReason}>
                      {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send me-1"></i>}
                      Gửi yêu cầu gỡ tin
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: ADMIN ─── */}
      {tab === 'admin' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 fw-bold d-flex align-items-center" style={{ background: '#fce4ec' }}>
            <i className="bi bi-shield-check me-1 text-danger"></i>Yêu cầu Gỡ tin đang chờ duyệt ({unlistRequests.length})
            <span className="text-muted small ms-2 fw-normal">— Admin/MKT phê duyệt (UC007)</span>
          </div>
          <div className="card-body p-0">
            {unlistRequests.length === 0 && (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có yêu cầu gỡ tin nào đang chờ.</p>
              </div>
            )}
            {unlistRequests.map(l => {
              const prop = getProp(l.property_id);
              const reason = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
              return (
                <div key={l.id} className="p-4 border-bottom">
                  <div className="row align-items-start">
                    <div className="col-md-7">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <span className="badge bg-dark">{l.id}</span>
                        <span className="badge bg-secondary">🔻 Yêu cầu gỡ tin</span>
                        {reason && <span className="badge" style={{ background: '#ff6f00' }}>{reason.icon} {reason.label}</span>}
                      </div>
                      <div className="fw-semibold mb-1">{l.title}</div>
                      <div className="text-muted small">📍 {prop.address}</div>
                      <div className="text-muted small mb-2">Người yêu cầu: {l.createdBy} | POS: {prop.pos_name}</div>
                      {l.unlist_note && (
                        <div className="alert alert-light border py-2 small">
                          <i className="bi bi-chat-left-text me-1"></i><strong>Ghi chú của Đầu chủ:</strong> {l.unlist_note}
                        </div>
                      )}
                      {reason && (
                        <div className="small text-muted">
                          ▸ Nếu duyệt: Tài sản <strong>{prop.id}</strong> Level 2 sẽ → <span className="badge bg-secondary">"{reason.nextLv2}"</span>
                        </div>
                      )}
                    </div>
                    <div className="col-md-5 d-flex flex-column gap-2 mt-3 mt-md-0">
                      <button className="btn btn-success" onClick={() => handleApproveUnlist(l)} disabled={submitting}>
                        <i className="bi bi-check-circle me-1"></i>Duyệt Gỡ tin + AUTO-SYNC (BR-005)
                      </button>
                      <button className="btn btn-outline-danger" onClick={() => handleRejectUnlist(l)}>
                        <i className="bi bi-x-circle me-1"></i>Từ chối – Giữ niêm yết
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB: BR-010 DEMO ─── */}
      {tab === 'br010' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card border-0 shadow-sm border-danger">
              <div className="card-header fw-bold text-white" style={{ background: '#b71c1c' }}>
                <i className="bi bi-shield-exclamation me-1"></i>Demo BR-010: Chặn Gỡ nguồn khi đang niêm yết
              </div>
              <div className="card-body">
                <div className="alert alert-danger">
                  <strong>📋 Business Rule BR-010:</strong><br/>
                  Tài sản chỉ được Gỡ nguồn khi Level 2 là <strong>"Chưa niêm yết"</strong> hoặc <strong>"Thẩm định phí"</strong>.<br/>
                  Nếu đang <strong>"Đang niêm yết"</strong> → Hệ thống <strong>chặn</strong> và yêu cầu Gỡ tin trước.
                </div>
                <h6 className="fw-bold mb-3">Thử Gỡ nguồn trên các tài sản – click để kiểm tra:</h6>
                <div className="row g-3">
                  {properties.filter(p => p.level1_status !== 'Đã gỡ nguồn').slice(0, 8).map(p => {
                    const canRemove = p.level2_status === 'Chưa niêm yết' || p.level2_status === 'Thẩm định phí';
                    return (
                      <div key={p.id} className="col-md-6">
                        <div className="card border h-100">
                          <div className="card-body py-2">
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <span className="badge bg-dark">{p.id}</span>
                              <span className={`badge ${canRemove ? 'bg-success' : 'bg-danger'}`}>
                                {canRemove ? '✅ Được phép' : '🚫 Bị chặn'}
                              </span>
                            </div>
                            <div className="small text-muted mb-1" style={{ fontSize: 11 }}>{p.address.split(',')[0]}</div>
                            <div className="small"><strong>Level 2:</strong> <span className={`badge ${p.level2_status === 'Đang niêm yết' ? 'bg-danger' : 'bg-secondary'}`}>{p.level2_status}</span></div>
                            <button
                              className={`btn btn-sm mt-2 w-100 ${canRemove ? 'btn-outline-danger' : 'btn-danger'}`}
                              onClick={() => checkBlockGoNguon(p)}
                            >
                              <i className="bi bi-trash me-1"></i>Gỡ nguồn {p.id}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {blockError && (
                  <div className="alert alert-danger mt-3 d-flex align-items-start gap-2">
                    <i className="bi bi-shield-x fs-4"></i>
                    <div>
                      <strong>Hệ thống chặn thao tác!</strong><br/>
                      {blockError}
                      <div className="mt-2">
                        <button className="btn btn-warning btn-sm" onClick={() => setTab('sales')}>
                          → Vào tab Gỡ tin để gỡ tin trước
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {blockError === null && blockError !== null && (
                  <div className="alert alert-success mt-3">✅ Tài sản đủ điều kiện Gỡ nguồn. Tiếp tục quy trình.</div>
                )}
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="card border-0 shadow-sm">
              <div className="card-header border-0 fw-bold" style={{ background: '#e8eaf6' }}>📋 Test Cases – BR-010</div>
              <div className="card-body small">
                {[
                  { id: 'TC6-05', title: 'Gỡ nguồn khi Đang niêm yết', expect: 'Hệ thống CHẶN', type: 'danger' },
                  { id: 'TC6-06', title: 'Gỡ nguồn khi Chưa niêm yết', expect: 'Cho phép', type: 'success' },
                  { id: 'TC6-07', title: 'Gỡ nguồn khi Thẩm định phí', expect: 'Cho phép', type: 'success' },
                ].map(tc => (
                  <div key={tc.id} className="border rounded p-2 mb-2">
                    <div className="d-flex justify-content-between">
                      <span className="fw-semibold">{tc.id}</span>
                      <span className={`badge bg-${tc.type}`}>{tc.expect}</span>
                    </div>
                    <div className="text-muted">{tc.title}</div>
                  </div>
                ))}
                <div className="alert alert-info mt-2 py-2">
                  <strong>Luồng đúng:</strong><br/>
                  Gỡ tin (F6) → Admin duyệt → Level2 ≠ "Đang niêm yết" → Được phép Gỡ nguồn (F9)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
