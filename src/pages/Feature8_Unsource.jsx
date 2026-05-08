import { useState, useEffect } from 'react';
const API = 'http://localhost:5000';

const CAN_UNSOURCE = ['Chưa niêm yết', 'Thẩm định phí'];

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 mb-3`}>
      <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}></i>
      {toast.msg}
    </div>
  );
}

export default function Feature8_Unsource() {
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('sales'); // 'sales' | 'pos' | 'history'
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'request'|'approve'|'reject'
  const [unsourceNote, setUnsourceNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [p, lg] = await Promise.all([
      fetch(`${API}/properties`).then(r => r.json()),
      fetch(`${API}/logs`).then(r => r.json()),
    ]);
    setProperties(p); setLogs(lg);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const postLog = async (action, entityId) => {
    await fetch(`${API}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), action, entityId, user: 'Demo User' }),
    });
  };

  const patchProp = (id, data) => fetch(`${API}/properties/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
  });

  // UC008: Sales request unsource
  const handleRequestUnsource = async () => {
    const canDo = CAN_UNSOURCE.includes(selected.level2_status);
    if (!canDo) {
      showToast('⛔ BR-010: Phải Gỡ tin (F6→F7) trước khi Gỡ nguồn!', 'danger');
      setModalMode(null); return;
    }
    setSubmitting(true);
    await patchProp(selected.id, {
      level1_status: 'Chờ duyệt gỡ nguồn',
      unsource_note: unsourceNote,
      unsourceRequestedAt: new Date().toISOString(),
      unsourceRequestedBy: 'Đầu chủ Demo',
    });
    await postLog(`[F8-UC008] Sales yêu cầu gỡ nguồn · Ghi chú: ${unsourceNote || 'N/A'}`, selected.id);
    showToast(`✅ Đã gửi yêu cầu gỡ nguồn ${selected.id} đến GĐ POS.`);
    setSelected(null); setModalMode(null); setUnsourceNote('');
    setSubmitting(false); loadAll(); setTab('pos');
  };

  // UC009: GĐ POS approve
  const handleApprove = async () => {
    setSubmitting(true);
    const now = new Date().toISOString();
    // Update property Lv1 + Lv2 simultaneously
    await patchProp(selected.id, {
      level1_status: 'Đã gỡ nguồn', level2_status: 'Đã gỡ nguồn',
      unsourceApprovedBy: 'GĐ POS Demo', unsourceApprovedAt: now,
    });
    // CASCADE: auto-update all listings of this property (BR-005 cascade)
    try {
      const allListings = await fetch(`${API}/listings`).then(r => r.json());
      const related = allListings.filter(l => l.property_id === selected.id && l.listing_status !== 'Đã gỡ');
      await Promise.all(related.map(l => fetch(`${API}/listings/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_status: 'Đã gỡ', updatedAt: now }),
      })));
    } catch (_) {}
    await postLog(`[F8-UC009] GĐ POS duyệt gỡ nguồn → Lv1+Lv2="Đã gỡ nguồn" + CASCADE listings`, selected.id);
    showToast(`✅ Đã duyệt gỡ nguồn ${selected.id}. Tài sản ẩn khỏi mặc định. Listings liên quan đã gỡ.`);
    setSelected(null); setModalMode(null);
    setSubmitting(false); loadAll();
  };


  // UC009: GĐ POS reject
  const handleReject = async () => {
    if (!rejectNote.trim()) { showToast('Vui lòng nhập lý do từ chối!', 'danger'); return; }
    setSubmitting(true);
    const prev = selected.prev_level1 || 'Được duyệt';
    await patchProp(selected.id, {
      level1_status: prev, unsource_note: null,
      unsourceRejectedBy: 'GĐ POS Demo',
      unsourceRejectedAt: new Date().toISOString(),
      unsourceRejectNote: rejectNote,
    });
    await postLog(`[F8-UC009] GĐ POS từ chối gỡ nguồn · Lý do: ${rejectNote}`, selected.id);
    showToast(`↩️ Đã từ chối gỡ nguồn ${selected.id}. Tài sản phục hồi trạng thái.`, 'warning');
    setSelected(null); setModalMode(null); setRejectNote('');
    setSubmitting(false); loadAll();
  };

  const salesProps = properties.filter(p =>
    ['Được duyệt','Được đảm bảo','Chưa niêm yết'].includes(p.level1_status) &&
    p.level1_status !== 'Đã gỡ nguồn' && p.level1_status !== 'Chờ duyệt gỡ nguồn'
  );
  const pendingUnsource = properties.filter(p => p.level1_status === 'Chờ duyệt gỡ nguồn');
  const historyProps = properties.filter(p => p.level1_status === 'Đã gỡ nguồn');

  const lv2Color = { 'Chưa niêm yết':'secondary','Đang niêm yết':'success','Thẩm định phí':'info','Đã gỡ nguồn':'dark' };
  const lv1Color = { 'Được duyệt':'success','Được đảm bảo':'warning','Chờ duyệt gỡ nguồn':'danger','Đã gỡ nguồn':'dark' };

  return (
    <div style={{ minHeight:'100vh', background:'#fff8f0', padding:24 }}>
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color:'#7b2d00' }}>
            <i className="bi bi-x-octagon-fill text-danger me-2"></i>
            Feature 8 – Yêu cầu & Phê duyệt Gỡ nguồn (UC008 + UC009)
          </h4>
          <small className="text-muted">UC008: Đầu chủ gửi yêu cầu · UC009: GĐ POS phê duyệt · BR-010 Validation</small>
        </div>
        <div className="d-flex gap-2">
          {pendingUnsource.length > 0 && (
            <span className="badge bg-danger fs-6 px-3 py-2">
              <i className="bi bi-bell-fill me-1"></i>{pendingUnsource.length} chờ GĐ POS
            </span>
          )}
          <span className="badge bg-warning text-dark px-3 py-2">BR-010</span>
        </div>
      </div>

      <Toast toast={toast} />

      {/* BR-010 rule banner */}
      <div className="alert alert-danger d-flex align-items-start gap-2 mb-4 py-2">
        <i className="bi bi-shield-exclamation fs-5 flex-shrink-0 mt-1"></i>
        <div className="small">
          <strong>BR-010:</strong> Chỉ được Gỡ nguồn khi Level 2 ∈ {'{'}
          <strong>"Chưa niêm yết"</strong>, <strong>"Thẩm định phí"</strong>
          {'}'}. Nếu Level 2 = "Đang niêm yết" → Phải thực hiện UC006 → UC007 trước.
        </div>
      </div>

      {/* Tabs */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2 d-flex gap-2">
          <button className={`btn btn-sm ${tab==='sales'?'btn-warning':'btn-outline-warning'}`}
            onClick={() => setTab('sales')}>
            <i className="bi bi-person me-1"></i>Đầu chủ – Gửi yêu cầu (UC008)
          </button>
          <button className={`btn btn-sm ${tab==='pos'?'btn-danger':'btn-outline-danger'}`}
            onClick={() => setTab('pos')}>
            <i className="bi bi-shield-check me-1"></i>GĐ POS – Phê duyệt (UC009)
            {pendingUnsource.length > 0 && <span className="badge bg-light text-danger ms-1">{pendingUnsource.length}</span>}
          </button>
          <button className={`btn btn-sm ${tab==='history'?'btn-dark':'btn-outline-dark'}`}
            onClick={() => setTab('history')}>
            <i className="bi bi-archive me-1"></i>Đã gỡ nguồn ({historyProps.length})
          </button>
        </div>
      </div>

      {/* TAB: SALES */}
      {tab === 'sales' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 fw-bold bg-white">
            <i className="bi bi-building me-1"></i>Tài sản có thể yêu cầu Gỡ nguồn ({salesProps.length})
            <span className="text-muted small ms-2 fw-normal">— Chọn tài sản để gửi yêu cầu</span>
          </div>
          <div className="card-body p-0">
            {salesProps.length === 0 && (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có tài sản phù hợp.</p>
              </div>
            )}
            {salesProps.map(p => {
              const canDo = CAN_UNSOURCE.includes(p.level2_status);
              return (
                <div key={p.id} className="p-3 border-bottom d-flex align-items-start gap-3">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span className="badge bg-dark">{p.id}</span>
                      <span className={`badge bg-${lv1Color[p.level1_status]||'secondary'} text-${p.level1_status==='Được đảm bảo'?'dark':''}`}>
                        Lv1: {p.level1_status}
                      </span>
                      <span className={`badge bg-${lv2Color[p.level2_status]||'secondary'}`}>
                        Lv2: {p.level2_status}
                      </span>
                      {canDo
                        ? <span className="badge bg-success">✅ Đủ điều kiện BR-010</span>
                        : <span className="badge bg-danger">🚫 Bị chặn BR-010</span>
                      }
                    </div>
                    <div className="fw-semibold small">{p.address}</div>
                    <div className="text-muted small">{p.pos_name} · {p.type} · {p.area}m² · {p.price_display}</div>
                    {!canDo && (
                      <div className="alert alert-danger py-1 px-2 small mt-2 mb-0">
                        <i className="bi bi-lock-fill me-1"></i>
                        Level 2 đang <strong>"{p.level2_status}"</strong> — Phải Gỡ tin (F6→F7) trước!
                      </div>
                    )}
                  </div>
                  <button
                    className={`btn btn-sm flex-shrink-0 ${canDo ? 'btn-outline-danger' : 'btn-secondary'}`}
                    disabled={!canDo}
                    onClick={() => { setSelected(p); setModalMode('request'); setUnsourceNote(''); }}>
                    <i className="bi bi-x-octagon me-1"></i>Gỡ nguồn
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: GĐ POS */}
      {tab === 'pos' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 fw-bold bg-white">
            <i className="bi bi-shield-check text-danger me-1"></i>
            Yêu cầu Gỡ nguồn chờ phê duyệt ({pendingUnsource.length})
          </div>
          <div className="card-body p-0">
            {pendingUnsource.length === 0 && (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có yêu cầu nào đang chờ.</p>
              </div>
            )}
            {pendingUnsource.map(p => (
              <div key={p.id} className="p-4 border-bottom">
                <div className="row align-items-center">
                  <div className="col-md-7">
                    <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                      <span className="badge bg-dark">{p.id}</span>
                      <span className="badge bg-danger">Chờ duyệt gỡ nguồn</span>
                    </div>
                    <div className="fw-semibold mb-1">{p.address}</div>
                    <div className="text-muted small mb-1">
                      <span className="me-3"><i className="bi bi-building me-1"></i>{p.pos_name}</span>
                      <span><i className="bi bi-person me-1"></i>{p.unsourceRequestedBy || p.createdBy}</span>
                    </div>
                    <div className="text-muted small mb-2">
                      <i className="bi bi-clock me-1"></i>
                      {p.unsourceRequestedAt ? new Date(p.unsourceRequestedAt).toLocaleString('vi-VN') : ''}
                    </div>
                    {p.unsource_note && (
                      <div className="alert alert-light border py-2 px-2 small mb-2">
                        <i className="bi bi-chat-left-dots me-1"></i>
                        <strong>Ghi chú:</strong> {p.unsource_note}
                      </div>
                    )}
                    <div className="alert alert-danger py-1 px-2 small mb-0">
                      <i className="bi bi-lightning-charge me-1"></i>
                      <strong>Nếu duyệt:</strong> Level 1 + Level 2 → <strong>"Đã gỡ nguồn"</strong> đồng thời. Tài sản ẩn khỏi default view.
                    </div>
                  </div>
                  <div className="col-md-2 text-center">
                    <div className="small text-muted mb-1">Level 2</div>
                    <span className={`badge bg-${lv2Color[p.level2_status]||'secondary'}`}>{p.level2_status}</span>
                    <div className="small text-muted mt-2">{p.type} · {p.area}m²</div>
                    <div className="small fw-semibold">{p.price_display}</div>
                  </div>
                  <div className="col-md-3 d-flex flex-column gap-2">
                    <button className="btn btn-success fw-semibold"
                      onClick={() => { setSelected(p); setModalMode('approve'); }}>
                      <i className="bi bi-check-circle me-1"></i>Duyệt Gỡ nguồn
                    </button>
                    <button className="btn btn-outline-danger"
                      onClick={() => { setSelected(p); setModalMode('reject'); setRejectNote(''); }}>
                      <i className="bi bi-x-circle me-1"></i>Từ chối
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: HISTORY */}
      {tab === 'history' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 fw-bold bg-white">
            <i className="bi bi-archive me-1"></i>Tài sản đã Gỡ nguồn ({historyProps.length})
            <span className="badge bg-secondary ms-2 small">Không xóa DB · Ẩn khỏi default view</span>
          </div>
          <div className="card-body p-0">
            {historyProps.length === 0 && (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-folder2-open fs-2"></i><p className="mt-2">Chưa có tài sản nào được gỡ nguồn.</p>
              </div>
            )}
            {historyProps.map(p => (
              <div key={p.id} className="p-3 border-bottom opacity-75">
                <div className="d-flex align-items-start justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="badge bg-dark">{p.id}</span>
                      <span className="badge bg-secondary">Đã gỡ nguồn</span>
                    </div>
                    <div className="fw-semibold small text-muted">{p.address}</div>
                    <div className="text-muted small">
                      {p.pos_name} · {p.type} · {p.area}m²
                    </div>
                    {p.unsourceApprovedBy && (
                      <div className="small text-muted mt-1">
                        <i className="bi bi-check-circle text-success me-1"></i>
                        Duyệt bởi: {p.unsourceApprovedBy} ·{' '}
                        {p.unsourceApprovedAt ? new Date(p.unsourceApprovedAt).toLocaleString('vi-VN') : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-end">
                    <span className="badge bg-dark">Lv1: Đã gỡ nguồn</span><br/>
                    <span className="badge bg-dark mt-1">Lv2: Đã gỡ nguồn</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Request unsource (UC008) */}
      {modalMode === 'request' && selected && (
        <div className="modal show d-block" style={{ backgroundColor:'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-warning border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-x-octagon me-2"></i>Yêu cầu Gỡ nguồn (UC008)
                </h5>
                <button className="btn-close" onClick={() => { setModalMode(null); setSelected(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-warning bg-warning bg-opacity-10 border-warning mb-3">
                  <div className="fw-semibold">{selected.id}</div>
                  <div className="small text-muted">{selected.address}</div>
                  <div className="small mt-1">
                    Level 2: <span className={`badge bg-${lv2Color[selected.level2_status]||'secondary'}`}>{selected.level2_status}</span>
                    {' '}→ Đủ điều kiện BR-010 ✅
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Ghi chú lý do gỡ nguồn</label>
                  <textarea className="form-control" rows={3}
                    placeholder="VD: Chủ nhà không còn nhu cầu bán, tài sản đã chuyển nhượng nội bộ..."
                    value={unsourceNote} onChange={e => setUnsourceNote(e.target.value)} />
                </div>
                <div className="alert alert-info small">
                  <i className="bi bi-arrow-right me-1"></i>
                  Yêu cầu sẽ gửi đến <strong>GĐ POS</strong> để phê duyệt (UC009).
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setSelected(null); }}>Hủy</button>
                <button className="btn btn-warning fw-bold px-4" onClick={handleRequestUnsource} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Gửi Yêu cầu Gỡ nguồn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Approve (UC009) */}
      {modalMode === 'approve' && selected && (
        <div className="modal show d-block" style={{ backgroundColor:'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-exclamation-triangle me-2"></i>Xác nhận Duyệt Gỡ nguồn (UC009)
                </h5>
                <button className="btn-close btn-close-white" onClick={() => { setModalMode(null); setSelected(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-danger mb-3">
                  <strong>⚠️ Hành động không thể hoàn tác trong luồng thông thường!</strong>
                </div>
                <div className="alert alert-light border mb-3">
                  <div className="fw-semibold">{selected.id}</div>
                  <div className="small text-muted">{selected.address}</div>
                  <div className="small text-muted mt-1">{selected.pos_name} · {selected.price_display}</div>
                </div>
                <div className="alert alert-warning small">
                  <i className="bi bi-lightning-charge-fill me-1"></i>
                  <strong>Sau khi duyệt:</strong><br/>
                  • Level 1: <strong>"Đã gỡ nguồn"</strong><br/>
                  • Level 2: <strong>"Đã gỡ nguồn"</strong><br/>
                  • Tài sản <strong>ẩn</strong> khỏi danh sách mặc định (không bị xóa DB)
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setSelected(null); }}>Hủy</button>
                <button className="btn btn-danger fw-bold px-4" onClick={handleApprove} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Duyệt Gỡ nguồn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reject (UC009) */}
      {modalMode === 'reject' && selected && (
        <div className="modal show d-block" style={{ backgroundColor:'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-secondary text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-x-circle me-2"></i>Từ chối Yêu cầu Gỡ nguồn
                </h5>
                <button className="btn-close btn-close-white" onClick={() => { setModalMode(null); setSelected(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border mb-3">
                  <div className="fw-semibold">{selected.id}</div>
                  <div className="small text-muted">{selected.address}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Lý do từ chối <span className="text-danger">*</span>
                  </label>
                  <textarea className="form-control" rows={3} required
                    placeholder="Nhập lý do từ chối yêu cầu gỡ nguồn..."
                    value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                </div>
                <div className="alert alert-info small">
                  <i className="bi bi-arrow-counterclockwise me-1"></i>
                  Tài sản sẽ phục hồi về trạng thái trước khi yêu cầu gỡ nguồn.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setSelected(null); }}>Hủy</button>
                <button className="btn btn-secondary fw-bold px-4" onClick={handleReject}
                  disabled={submitting || !rejectNote.trim()}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Từ chối
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
