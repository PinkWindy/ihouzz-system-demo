import { API_BASE_URL } from '../config';
import { useState, useEffect } from 'react';
import { formatListingId, formatPropertyId, postInAppNotification, postAuditLog, AUDIT_ACTION_TYPE } from '../utils/listingWorkflow';
import { normalizeUserId, sameUserId } from '../utils/userId.js';

const API = API_BASE_URL;

const UNLIST_NOTE_MAX = 500;

const UNLIST_REASONS = [
  { value: 'Ngưng niêm yết', label: 'Ngưng niêm yết', icon: '🔕', desc: 'Tài sản chưa giao dịch, muốn tạm ẩn khỏi iHouzz.com.', nextLv2: 'Chưa niêm yết' },
  { value: 'Thẩm định phí', label: 'Thẩm định phí hoa hồng', icon: '💰', desc: 'Đang xác minh / tranh chấp phí hoa hồng với khách hàng.', nextLv2: 'Thẩm định phí' },
];

/** FR6-012: Đầu chủ chỉ thấy tin gắn tài sản do chính mình tạo (theo createdBy_id). Admin xem tất cả trên tab Đầu chủ (demo). */
function listingInSalesScope(listing, property, user, role) {
  if (role === 'admin') return true;
  if (role !== 'sales') return false;
  if (!property || !user?.id) return false;
  return sameUserId(property.createdBy_id, user.id);
}

export default function Feature6_Unlist() {
  const userStr = localStorage.getItem('user');
  const userObj = userStr ? JSON.parse(userStr) : {};
  const role = userObj.role || '';
  const ROLE = role === 'pos' ? 'pos_manager' : role === 'mkt' ? 'marketing' : role;

  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [tab, setTab] = useState(ROLE === 'admin' || ROLE === 'marketing' ? 'admin' : 'sales');
  const [selected, setSelected] = useState(null);
  const [unlistReason, setUnlistReason] = useState('');
  const [unlistNote, setUnlistNote] = useState('');
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState(null); // 'request' | 'approve_admin' | 'pending_cancel'
  const [blockError, setBlockError] = useState(null);
  const [reasonInlineError, setReasonInlineError] = useState('');
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  const appendListingAudit = async ({
    actionText,
    actionType,
    listingId,
    propertyId,
    oldStatus,
    newStatus,
    reason,
    detail,
    modifiedFields,
    actorName,
    actorUserId,
  }) => {
    await postAuditLog({
      actionText,
      actionType,
      listingId,
      propertyId,
      userName: actorName ?? userObj?.name ?? 'User',
      userId: actorUserId ?? normalizeUserId(userObj?.id) ?? '',
      oldStatus,
      newStatus,
      reason,
      detail,
      modifiedFields,
    });
  };

  const notifyMktAdminNewUnlistRequest = async (listing, reasonLabel, code) => {
    const msg = `Có yêu cầu gỡ tin mới cần xử lý: ${code}. Lý do: ${reasonLabel}.`;
    try {
      await postInAppNotification({
        propertyId: listing.property_id,
        listingId: listing.id,
        recipient: 'Admin iHouzz',
        message: msg,
        type: 'warning',
      });
      await postInAppNotification({
        propertyId: listing.property_id,
        listingId: listing.id,
        recipient: 'Nguyễn Thị MKT',
        message: msg,
        type: 'warning',
      });
    } catch {
      /* ignore */
    }
  };

  const notifyMktAdminCancelUnlist = async (listing, code) => {
    const msg = `Yêu cầu gỡ tin ${code} đã bị hủy bởi Đầu chủ.`;
    try {
      await postInAppNotification({
        propertyId: listing.property_id,
        listingId: listing.id,
        recipient: 'Admin iHouzz',
        message: msg,
        type: 'info',
      });
      await postInAppNotification({
        propertyId: listing.property_id,
        listingId: listing.id,
        recipient: 'Nguyễn Thị MKT',
        message: msg,
        type: 'info',
      });
    } catch {
      /* ignore */
    }
  };

  // Sales view: tin Đã duyệt + Yêu cầu gỡ tin (theo phạm vi FR6-012)
  const activeListing = listings.filter((l) => {
    if (l.listing_status !== 'Đã duyệt') return false;
    const prop = getProp(l.property_id);
    return listingInSalesScope(l, prop, userObj, ROLE);
  });
  const myPendingUnlist = listings.filter((l) => {
    if (l.listing_status !== 'Yêu cầu gỡ tin') return false;
    const prop = getProp(l.property_id);
    return listingInSalesScope(l, prop, userObj, ROLE);
  });
  // Admin view: pending unlist requests
  const unlistRequests = listings.filter(l => l.listing_status === 'Yêu cầu gỡ tin');

  const handleRequestUnlist = async () => {
    setReasonInlineError('');
    if (unlistNote.length > UNLIST_NOTE_MAX) {
      showToast(`Ghi chú không được vượt quá ${UNLIST_NOTE_MAX} ký tự.`, 'danger');
      return;
    }
    if (!unlistReason) {
      setReasonInlineError('Vui lòng chọn lý do tạm ngưng niêm yết.');
      return;
    }
    setShowConfirmSend(true);
  };

  const handleConfirmSendUnlist = async () => {
    if (!selected || !unlistReason) return;
    setSubmitting(true);
    const now = new Date().toISOString();
    const prop = getProp(selected.property_id);
    const reasonLabel = UNLIST_REASONS.find((r) => r.value === unlistReason)?.label || unlistReason;
    const code = formatListingId(selected.listingCode || selected.id);
    try {
      await fetch(`${API}/listings/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_status: 'Yêu cầu gỡ tin',
          unlist_reason: unlistReason,
          unlist_note: unlistNote.trim() || null,
          unlistRequestedAt: now,
          unlistRequestedBy: userObj?.name || '',
          unlistRequestedBy_id: normalizeUserId(userObj?.id),
          updatedAt: now,
        }),
      });

      await appendListingAudit({
        actionText: `Yêu cầu gỡ tin — ${code} · ${unlistReason}`,
        actionType: AUDIT_ACTION_TYPE.UC006_REQUEST_UNLIST,
        listingId: selected.id,
        propertyId: prop.id || selected.property_id,
        oldStatus: 'Đã duyệt',
        newStatus: 'Yêu cầu gỡ tin',
        reason: unlistReason,
        detail: unlistNote.trim() || undefined,
      });

      await notifyMktAdminNewUnlistRequest(selected, reasonLabel, code);

      showToast(`Đã gửi yêu cầu gỡ tin ${code}. Bài vẫn hiển thị công khai cho đến khi MKT/Admin duyệt.`, 'success');
      setSelected(null);
      setMode(null);
      setUnlistReason('');
      setUnlistNote('');
      setShowConfirmSend(false);
      setReasonInlineError('');
      loadData();
    } catch {
      showToast('Lỗi khi gửi yêu cầu.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelUnlistRequest = async () => {
    if (!selected || selected.listing_status !== 'Yêu cầu gỡ tin') return;
    setSubmitting(true);
    const now = new Date().toISOString();
    const prop = getProp(selected.property_id);
    const code = formatListingId(selected.listingCode || selected.id);
    try {
      await fetch(`${API}/listings/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_status: 'Đã duyệt',
          unlist_reason: null,
          unlist_note: null,
          unlistRequestedAt: null,
          unlistRequestedBy: null,
          unlistRequestedBy_id: null,
          updatedAt: now,
        }),
      });

      await appendListingAudit({
        actionText: `Hủy yêu cầu gỡ tin — ${code}`,
        actionType: AUDIT_ACTION_TYPE.UC006_CANCEL_UNLIST_REQUEST,
        listingId: selected.id,
        propertyId: prop.id || selected.property_id,
        oldStatus: 'Yêu cầu gỡ tin',
        newStatus: 'Đã duyệt',
      });

      await notifyMktAdminCancelUnlist(selected, code);

      showToast(`Đã hủy yêu cầu gỡ tin ${code}.`, 'success');
      setSelected(null);
      setMode(null);
      setShowCancelConfirm(false);
      loadData();
    } catch {
      showToast('Lỗi khi hủy yêu cầu.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveUnlist = async (l) => {
    setSubmitting(true);
    try {
      const reason = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
      const nextLv2 = reason?.nextLv2 || 'Chưa niêm yết';
      const prop = getProp(l.property_id);
      const prevLv2 = prop.level2_status || prop.statusLv2 || '—';
      await fetch(`${API}/listings/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_status: 'Đã gỡ', updatedAt: new Date().toISOString() }),
      });
      if (prop.id) {
        await fetch(`${API}/properties/${prop.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level2_status: nextLv2, statusLv2: nextLv2, updatedAt: new Date().toISOString() }),
        });
      }

      await appendListingAudit({
        actionText: `Duyệt gỡ tin — ${formatListingId(l.listingCode || l.id)} · Lv2 → "${nextLv2}"`,
        actionType: AUDIT_ACTION_TYPE.UC007_APPROVE_UNLIST,
        listingId: l.id,
        propertyId: prop.id || l.property_id,
        oldStatus: 'Yêu cầu gỡ tin',
        newStatus: 'Đã gỡ',
        reason: l.unlist_reason || undefined,
        detail: l.unlist_note || undefined,
        modifiedFields: { level2_status: { from: prevLv2, to: nextLv2 } },
      });

      showToast(`✅ Đã duyệt gỡ tin ${l.id}. Tài sản ${l.property_id} Level 2 → "${nextLv2}".`);
      loadData();
    } catch {
      showToast('Lỗi khi duyệt gỡ tin.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectUnlist = async (l) => {
    const now = new Date().toISOString();
    await fetch(`${API}/listings/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_status: 'Đã duyệt',
        unlist_reason: null,
        unlist_note: null,
        unlistRequestedAt: null,
        unlistRequestedBy: null,
        unlistRequestedBy_id: null,
        updatedAt: now,
      }),
    });

    const prop = getProp(l.property_id);
    await appendListingAudit({
      actionText: `Từ chối gỡ tin — ${formatListingId(l.listingCode || l.id)}`,
      actionType: AUDIT_ACTION_TYPE.UC007_REJECT_UNLIST,
      listingId: l.id,
      propertyId: prop.id || l.property_id,
      oldStatus: 'Yêu cầu gỡ tin',
      newStatus: 'Đã duyệt',
    });

    showToast(`↩️ Đã từ chối yêu cầu gỡ tin ${l.id}. Bài đăng vẫn tiếp tục niêm yết.`, 'warning');
    loadData();
  };

  // BR-010 check: block if property is "Đang niêm yết" for Gỡ nguồn
  const checkBlockGoNguon = (prop) => {
    if (prop.level2_status === 'Đang niêm yết') {
      setBlockError('Không thể gỡ nguồn khi tài sản đang «Đang niêm yết». Vui lòng gỡ tin trước, sau đó mới gỡ nguồn.');
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
            <i className="bi bi-sign-stop me-2 text-warning"></i>Yêu cầu gỡ tin
          </h4>
          <small className="text-muted">Tạm ngưng Niêm yết | Actor: Đầu chủ (gửi) + Marketing/Admin (duyệt)</small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-warning text-dark px-3 py-2">Gỡ tin thủ công</span>
          <span className="badge bg-danger px-3 py-2">Gỡ nguồn sau khi gỡ tin</span>
        </div>
      </div>

      {toast && <div className={`alert alert-${toast.type} mb-3`}>{toast.msg}</div>}

      {/* Tab switch */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2 d-flex gap-2 align-items-center flex-wrap">
          {/* Tab Đầu chủ: Sales + Admin đều thấy */}
          {(ROLE === 'sales' || ROLE === 'admin') && (
            <button className={`btn ${tab === 'sales' ? 'btn-warning' : 'btn-outline-warning'}`} onClick={() => setTab('sales')}>
              <i className="bi bi-person me-1"></i>Góc Đầu chủ – Gửi yêu cầu gỡ tin
            </button>
          )}
          {/* Tab Admin/MKT: Admin + Marketing thấy */}
          {(ROLE === 'admin' || ROLE === 'marketing') && (
            <button className={`btn ${tab === 'admin' ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setTab('admin')}>
              <i className="bi bi-shield-check me-1"></i>Góc Admin/MKT – Duyệt yêu cầu
              {unlistRequests.length > 0 && <span className="badge bg-light text-danger ms-1">{unlistRequests.length}</span>}
            </button>
          )}
          <button className="btn btn-outline-secondary ms-auto" onClick={() => setTab('br010')}>
            <i className="bi bi-shield-exclamation me-1"></i>Chính sách: gỡ nguồn &amp; niêm yết
          </button>
        </div>
      </div>

      {/* ─── TAB: SALES ─── */}
      {tab === 'sales' && (
        <div className="row g-4">
          <div className={selected && (mode === 'request' || mode === 'pending_cancel') ? 'col-md-5' : 'col-12'}>
            <div className="d-flex flex-column gap-3" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <div className="card border-0 shadow-sm">
              <div className="card-header border-0 fw-bold" style={{ background: '#fff3e0' }}>
                <i className="bi bi-broadcast me-1 text-warning"></i>Tin đang niêm yết ({activeListing.length})
                <span className="text-muted small ms-2 fw-normal">— Chọn tin để gửi yêu cầu gỡ</span>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                    <thead className="table-light sticky-top">
                      <tr>
                        <th className="small text-muted text-danger fw-bold"><i className="bi bi-alarm"></i> Hết hạn</th>
                        <th className="small text-muted">Mã Bài Đăng</th>
                        <th className="small text-muted">Mã TS (Địa chỉ)</th>
                        <th className="small text-muted">Tiêu đề</th>
                        <th className="small text-muted">Loại/Giá</th>
                        <th className="small text-muted text-end">Lượt xem</th>
                        <th className="small text-muted text-end">Lượt Like</th>
                        <th className="small text-muted text-end">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeListing.length === 0 && (
                        <tr><td colSpan="8" className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có tin đang niêm yết.</p></td></tr>
                      )}
                      {activeListing.map(l => {
                        const prop = getProp(l.property_id);
                        const isSelected = selected?.id === l.id;
                        const views = l.views || Math.floor(((l.id?.charCodeAt(0) || 65) * 12.5) + 100);
                        const likes = l.likes || Math.floor(views * 0.15);
                        return (
                          <tr
                            key={l.id}
                            className={`${isSelected ? 'bg-warning bg-opacity-10' : ''}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelected(l);
                              setMode('request');
                              setUnlistReason('');
                              setUnlistNote('');
                              setBlockError(null);
                              setReasonInlineError('');
                              setShowConfirmSend(false);
                            }}
                          >
                            <td className="text-danger fw-bold">{l.expiredAt ? new Date(l.expiredAt).toLocaleDateString('vi-VN') : '—'}</td>
                            <td>
                              <span className="badge bg-success me-1">Đang niêm yết</span>
                              <span className="badge bg-dark">{formatListingId(l.listingCode || l.id)}</span>
                            </td>
                            <td>
                              <div className="fw-semibold">{formatPropertyId(prop?.propertyCode || prop?.id || l.property_id)}</div>
                              <div className="text-muted small" style={{ fontSize: 11, maxWidth: 150, textOverflow: 'ellipsis', overflow: 'hidden' }}>{prop.address}</div>
                            </td>
                            <td className="fw-semibold text-truncate" style={{ maxWidth: 150 }} title={l.title}>{l.title}</td>
                            <td>
                              <span className={`badge ${prop.type === 'Bán' ? 'bg-danger' : 'bg-info'}`}>{prop.type}</span>
                              <div className="fw-bold small mt-1">{prop.price_display}</div>
                            </td>
                            <td className="text-end fw-semibold text-primary">{views} <i className="bi bi-eye"></i></td>
                            <td className="text-end fw-semibold text-danger">{likes} <i className="bi bi-heart-fill"></i></td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(l);
                                  setMode('request');
                                  setUnlistReason('');
                                  setUnlistNote('');
                                  setReasonInlineError('');
                                  setShowConfirmSend(false);
                                }}
                              >
                                <i className="bi bi-sign-stop me-1"></i>Gỡ tin
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm border-warning">
              <div className="card-header border-0 fw-bold d-flex align-items-center justify-content-between" style={{ background: '#fff8e1' }}>
                <span>
                  <i className="bi bi-hourglass-split me-1 text-warning"></i>Chờ Marketing/Admin xử lý ({myPendingUnlist.length})
                </span>
                <span className="badge bg-warning text-dark">Yêu cầu gỡ tin</span>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '36vh', overflowY: 'auto' }}>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0 small">
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>Mã tin</th>
                        <th>Lý do</th>
                        <th className="text-end">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPendingUnlist.length === 0 && (
                        <tr>
                          <td colSpan="3" className="text-center py-4 text-muted">Không có yêu cầu gỡ tin đang chờ.</td>
                        </tr>
                      )}
                      {myPendingUnlist.map((l) => {
                        const r = UNLIST_REASONS.find((x) => x.value === l.unlist_reason);
                        const code = formatListingId(l.listingCode || l.id);
                        const isSel = selected?.id === l.id && mode === 'pending_cancel';
                        return (
                          <tr
                            key={l.id}
                            className={isSel ? 'table-warning' : ''}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelected(l);
                              setMode('pending_cancel');
                              setReasonInlineError('');
                              setShowConfirmSend(false);
                              setShowCancelConfirm(false);
                            }}
                          >
                            <td>
                              <span className="badge bg-warning text-dark me-1">Chờ gỡ tin</span>
                              <span className="badge bg-dark">{code}</span>
                            </td>
                            <td>
                              <span className="badge" style={{ background: '#ff9800' }}>
                                {r?.icon} {r?.label || l.unlist_reason || '—'}
                              </span>
                            </td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(l);
                                  setMode('pending_cancel');
                                  setShowCancelConfirm(true);
                                }}
                              >
                                Hủy yêu cầu
                              </button>
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
          </div>

          {/* Request Form */}
          {selected && mode === 'request' && (
            <div className="col-md-7">
              <div className="card border-0 shadow-sm">
                <div className="card-header border-0 fw-bold" style={{ background: '#ffe0b2' }}>
                  <i className="bi bi-pause-circle me-1 text-warning"></i>Yêu cầu tạm ngưng niêm yết – {formatListingId(selected.listingCode || selected.id)}
                </div>
                <div className="card-body">
                  <div className="alert alert-warning border-0 small mb-3" style={{ background: '#fff3e0' }}>
                    <i className="bi bi-info-circle me-1"></i>
                    Bài đăng <strong>vẫn hiển thị công khai</strong> cho đến khi Marketing/Admin phê duyệt gỡ tin.
                  </div>
                  {/* Listing summary */}
                  <div className="alert alert-light border mb-3">
                    <div className="fw-semibold">{selected.title}</div>
                    <div className="text-muted small">Tài sản: {formatPropertyId(selected.propertyCode || selected.property_id)} | Duyệt bởi: {selected.approvedBy || 'N/A'}</div>
                  </div>

                  {/* Choose reason — MANDATORY (BR-005) */}
                  <div className="mb-3">
                    <label className="form-label fw-bold">Lý do tạm ngưng <span className="text-danger">*</span></label>
                    {reasonInlineError && <div className="text-danger small mb-2">{reasonInlineError}</div>}
                    <div className="row g-3">
                      {UNLIST_REASONS.map((r) => (
                        <div key={r.value} className="col-md-6">
                          <div
                            className={`card h-100 border-2 ${unlistReason === r.value ? 'border-primary bg-light' : 'border-light'}`}
                            style={{ cursor: 'pointer', transition: '0.2s' }}
                            onClick={() => {
                              setUnlistReason(r.value);
                              setReasonInlineError('');
                            }}
                          >
                            <div className="card-body text-center">
                              <div style={{ fontSize: 36 }}>{r.icon}</div>
                              <div className="fw-bold mt-1">{r.label}</div>
                              <div className="text-muted small mt-1">{r.desc}</div>
                              <div className="mt-2">
                                <span className="badge bg-secondary">Sau khi duyệt · Lv2 → &quot;{r.nextLv2}&quot;</span>
                              </div>
                              {unlistReason === r.value && (
                                <div className="mt-2">
                                  <i className="bi bi-check-circle-fill text-primary fs-5"></i>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Ghi chú bổ sung (tùy chọn, tối đa {UNLIST_NOTE_MAX} ký tự)</label>
                    <textarea
                      className={`form-control ${unlistNote.length > UNLIST_NOTE_MAX ? 'is-invalid' : ''}`}
                      rows={3}
                      placeholder="Nhập ghi chú thêm (không bắt buộc)..."
                      value={unlistNote}
                      maxLength={UNLIST_NOTE_MAX + 50}
                      onChange={(e) => setUnlistNote(e.target.value.slice(0, UNLIST_NOTE_MAX))}
                    />
                    <div className="form-text text-end">
                      {unlistNote.length}/{UNLIST_NOTE_MAX}
                    </div>
                  </div>

                  <div className="alert alert-warning py-2 small mb-3">
                    ⚠️ Bài đăng vẫn hiển thị công khai cho đến khi yêu cầu được phê duyệt.
                  </div>

                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setSelected(null);
                        setMode(null);
                        setReasonInlineError('');
                        setShowConfirmSend(false);
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger ms-auto"
                      onClick={handleRequestUnlist}
                      disabled={submitting || !unlistReason}
                    >
                      {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send me-1"></i>}
                      Gửi yêu cầu
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selected && mode === 'pending_cancel' && !showCancelConfirm && (
            <div className="col-md-7">
              <div className="card border-0 shadow-sm border-warning">
                <div className="card-header border-0 fw-bold" style={{ background: '#fff8e1' }}>
                  <i className="bi bi-hourglass-split me-1"></i>Chờ duyệt gỡ tin – {formatListingId(selected.listingCode || selected.id)}
                </div>
                <div className="card-body">
                  <div className="alert alert-warning small mb-3">
                    🕐 Yêu cầu tạm ngưng đang chờ Marketing/Admin phê duyệt. Lý do:{' '}
                    <strong>{UNLIST_REASONS.find((x) => x.value === selected.unlist_reason)?.label || selected.unlist_reason}</strong>.
                    Bài đăng vẫn hiển thị công khai cho đến khi yêu cầu được phê duyệt.
                  </div>
                  <div className="fw-semibold mb-2">{selected.title}</div>
                  {selected.unlist_note && (
                    <div className="text-muted small mb-3">
                      <strong>Ghi chú Đầu chủ:</strong> {selected.unlist_note}
                    </div>
                  )}
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCancelConfirm(true)}>
                    Hủy yêu cầu gỡ tin
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => { setSelected(null); setMode(null); }}>
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}

          {showConfirmSend && selected && mode === 'request' && (
            <div className="col-12">
              <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">Xác nhận gửi yêu cầu</h5>
                      <button type="button" className="btn-close" onClick={() => setShowConfirmSend(false)} aria-label="Close" />
                    </div>
                    <div className="modal-body">
                      <p className="mb-2">
                        <i className="bi bi-exclamation-triangle text-warning me-2"></i>
                        Xác nhận gửi yêu cầu tạm ngưng bài đăng <strong>{formatListingId(selected.listingCode || selected.id)}</strong> với lý do:{' '}
                        <strong>{UNLIST_REASONS.find((r) => r.value === unlistReason)?.label}</strong>?
                      </p>
                      <p className="small text-muted mb-0">Bài đăng vẫn hiển thị cho đến khi được phê duyệt.</p>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setShowConfirmSend(false)}>
                        Quay lại
                      </button>
                      <button type="button" className="btn btn-danger" onClick={handleConfirmSendUnlist} disabled={submitting}>
                        Xác nhận gửi
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCancelConfirm && selected && selected.listing_status === 'Yêu cầu gỡ tin' && (
            <div className="col-12">
              <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">Hủy yêu cầu gỡ tin</h5>
                      <button type="button" className="btn-close" onClick={() => setShowCancelConfirm(false)} aria-label="Close" />
                    </div>
                    <div className="modal-body">
                      <p className="mb-0">
                        Bạn có chắc muốn hủy yêu cầu gỡ tin cho <strong>{formatListingId(selected.listingCode || selected.id)}</strong>? Trạng thái sẽ trở lại <strong>Đã duyệt</strong>.
                      </p>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCancelConfirm(false)}>
                        Đóng
                      </button>
                      <button type="button" className="btn btn-danger" onClick={handleCancelUnlistRequest} disabled={submitting}>
                        Xác nhận hủy yêu cầu
                      </button>
                    </div>
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
            <span className="text-muted small ms-2 fw-normal">— Marketing/Admin phê duyệt</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="small text-muted">Mã Bài Đăng / Mã TS</th>
                    <th className="small text-muted">Tiêu đề</th>
                    <th className="small text-muted">Người yêu cầu / POS</th>
                    <th className="small text-muted">Lý do gỡ / Ghi chú</th>
                    <th className="small text-muted text-end">Lượt xem</th>
                    <th className="small text-muted text-end">Lượt Like</th>
                    <th className="small text-muted text-end">Hành động duyệt</th>
                  </tr>
                </thead>
                <tbody>
                  {unlistRequests.length === 0 && (
                    <tr><td colSpan="7" className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Không có yêu cầu gỡ tin nào đang chờ.</p></td></tr>
                  )}
                  {unlistRequests.map(l => {
                    const prop = getProp(l.property_id);
                    const reason = UNLIST_REASONS.find(r => r.value === l.unlist_reason);
                    const views = l.views || Math.floor(((l.id?.charCodeAt(0) || 65) * 12.5) + 100);
                    const likes = l.likes || Math.floor(views * 0.15);
                    return (
                      <tr key={l.id}>
                        <td>
                          <div><span className="badge bg-dark">{formatListingId(l.listingCode || l.id)}</span></div>
                          <div className="mt-1"><span className="badge bg-secondary">{formatPropertyId(prop?.propertyCode || prop?.id || l.property_id)}</span></div>
                        </td>
                        <td className="fw-semibold text-truncate" style={{ maxWidth: 200 }} title={l.title}>{l.title}</td>
                        <td>
                          <div>{l.createdBy}</div>
                          <div className="text-muted small">{prop.pos_name}</div>
                        </td>
                        <td>
                          {reason && <span className="badge" style={{ background: '#ff6f00' }}>{reason.icon} {reason.label}</span>}
                          {l.unlist_note && <div className="text-muted small mt-1" style={{ maxWidth: 200, textOverflow: 'ellipsis', overflow: 'hidden' }}>{l.unlist_note}</div>}
                        </td>
                        <td className="text-end fw-semibold text-primary">{views} <i className="bi bi-eye"></i></td>
                        <td className="text-end fw-semibold text-danger">{likes} <i className="bi bi-heart-fill"></i></td>
                        <td className="text-end">
                          <button className="btn btn-sm btn-success me-2" onClick={() => handleApproveUnlist(l)} disabled={submitting}>Duyệt Gỡ</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleRejectUnlist(l)} disabled={submitting}>Từ chối</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab minh họa: gỡ nguồn khi đang niêm yết */}
      {tab === 'br010' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card border-0 shadow-sm border-danger">
              <div className="card-header fw-bold text-white" style={{ background: '#b71c1c' }}>
                <i className="bi bi-shield-exclamation me-1"></i>Khi nào được gỡ nguồn?
              </div>
              <div className="card-body">
                <div className="alert alert-danger">
                  <strong>Quy định nghiệp vụ:</strong><br/>
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
                              <span className="badge bg-dark">{p.propertyCode || p.id}</span>
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
                              <i className="bi bi-trash me-1"></i>Gỡ nguồn {p.propertyCode || p.id}
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
              <div className="card-header border-0 fw-bold" style={{ background: '#e8eaf6' }}>Tình huống minh họa</div>
              <div className="card-body small">
                {[
                  { id: 'TC6-05', title: 'Gỡ nguồn khi đang niêm yết', expect: 'Hệ thống chặn', type: 'danger' },
                  { id: 'TC6-06', title: 'Gỡ nguồn khi chưa niêm yết', expect: 'Cho phép', type: 'success' },
                  { id: 'TC6-07', title: 'Gỡ nguồn khi thẩm định phí', expect: 'Cho phép', type: 'success' },
                ].map((tc, idx) => (
                  <div key={tc.id} className="border rounded p-2 mb-2">
                    <div className="d-flex justify-content-between">
                      <span className="fw-semibold">Tình huống {idx + 1}</span>
                      <span className={`badge bg-${tc.type}`}>{tc.expect}</span>
                    </div>
                    <div className="text-muted">{tc.title}</div>
                  </div>
                ))}
                <div className="alert alert-info mt-2 py-2">
                  <strong>Luồng đúng:</strong><br/>
                  Gửi yêu cầu gỡ tin → được duyệt → khi tài sản không còn «Đang niêm yết» → có thể gỡ nguồn tại Giám sát kho.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
