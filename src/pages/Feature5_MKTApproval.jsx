import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  API,
  readSessionUser,
  listingVisibleForActor,
  postAuditLog,
  postInAppNotification,
  buildLogAction,
  AUDIT_ACTION_TYPE,
  REJECT_REASON_MIN,
  ADJUSTMENT_NOTE_MIN,
  LISTING_APPROVAL_VALID_DAYS,
  formatListingId,
  formatPropertyId,
  confirmDuplicateListingWarningAsync,
  listingRequestHeaders,
  resolveDuplicateListing409,
} from '../utils/listingWorkflow';
import ListingWebsitePreviewModal from '../components/ListingWebsitePreviewModal';
import { formatPropertyPriceDisplay } from '../utils/permissions';

function ListingMediaReadonly({ listing }) {
  const imgs = Array.isArray(listing.images) ? listing.images.filter(Boolean) : [];
  const vids = Array.isArray(listing.videos) ? listing.videos.filter(Boolean) : [];
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    setSlide(0);
  }, [listing.id]);
  if (!imgs.length && !vids.length) return null;
  const safe = imgs.length ? Math.min(slide, imgs.length - 1) : 0;
  const main = imgs[safe];
  return (
    <div className="mb-4 p-3 rounded-3 border bg-white">
      <div className="fw-semibold mb-2">
        <i className="bi bi-images me-2 text-primary" />
        Ảnh & video tin đăng
      </div>
      {main && (
        <div className="rounded-3 overflow-hidden border bg-dark mb-2">
          <img src={main} alt="" className="w-100 d-block" style={{ maxHeight: 280, objectFit: 'contain' }} />
        </div>
      )}
      {imgs.length > 1 && (
        <div className="d-flex gap-2 flex-wrap mb-2">
          {imgs.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              className={`p-0 border-2 rounded overflow-hidden ${i === safe ? 'border-primary' : 'border-transparent'}`}
              style={{ width: 64, height: 48 }}
              onClick={() => setSlide(i)}
            >
              <img src={src} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      {vids.length > 0 && (
        <div className="row g-2">
          {vids.map((src, i) => (
            <div key={`v-${i}`} className="col-md-6">
              <video src={src} controls className="w-100 rounded border" style={{ maxHeight: 220 }} playsInline />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_META = {
  'Chờ duyệt': { tone: 'warning', icon: '⏳' },
  'Chờ duyệt chỉnh sửa': { tone: 'info', icon: '🔄' },
  'Đã duyệt': { tone: 'success', icon: '✓' },
  'Từ chối': { tone: 'danger', icon: '✕' },
  'Yêu cầu gỡ tin': { tone: 'secondary', icon: '🔻' },
  'Đã gỡ': { tone: 'dark', icon: '🚫' },
  'Hết hạn': { tone: 'secondary', icon: '⏱' },
};

function toneToBadge(tone) {
  const map = { warning: 'warning', info: 'info', success: 'success', danger: 'danger', secondary: 'secondary', dark: 'dark' };
  return map[tone] || 'secondary';
}

export default function Feature5_MKTApproval() {
  const [user, setUser] = useState(() => readSessionUser());
  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [panelTab, setPanelTab] = useState('review'); // review | history
  const now5 = new Date();
  const y = now5.getFullYear();
  const m = String(now5.getMonth() + 1).padStart(2, '0');
  const d = String(now5.getDate()).padStart(2, '0');
  const todayStr5 = `${y}-${m}-${d}`;
  const past5 = new Date(now5.getTime() - 60 * 24 * 60 * 60 * 1000);
  const py = past5.getFullYear();
  const pm = String(past5.getMonth() + 1).padStart(2, '0');
  const pd = String(past5.getDate()).padStart(2, '0');
  const sixtyDaysAgoStr = `${py}-${pm}-${pd}`;
  const [dateFrom, setDateFrom] = useState(sixtyDaysAgoStr);
  const [dateTo, setDateTo] = useState(todayStr5);

  /** Soạn thảo trong panel duyệt */
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [baselineTitle, setBaselineTitle] = useState('');
  const [baselineDesc, setBaselineDesc] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showPublicPreview, setShowPublicPreview] = useState(false);

  useEffect(() => {
    const onStorage = () => setUser(readSessionUser());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const loadData = useCallback(async () => {
    const [l, p] = await Promise.all([
      fetch(`${API}/listings`).then((r) => r.json()),
      fetch(`${API}/properties`).then((r) => r.json()),
    ]);
    setListings(l);
    setProperties(p);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setShowPublicPreview(false);
  }, [selectedId]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getProperty = useCallback((pid) => properties.find((p) => p.id === pid) || null, [properties]);

  const scopedListings = useMemo(() => {
    return listings.filter((l) => {
      const prop = getProperty(l.property_id);
      return listingVisibleForActor(l, prop, user);
    });
  }, [listings, getProperty, user]);

  const filtered = useMemo(() => {
    const list = scopedListings.filter((l) => {
      if (filterStatus === 'pending')
        return l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa';
      if (filterStatus === 'approved') return l.listing_status === 'Đã duyệt';
      if (filterStatus === 'rejected') return l.listing_status === 'Từ chối';
      return true;
    }).filter((l) => {
      if (!dateFrom && !dateTo) return true;
      const fields = [l.createdAt, l.updatedAt, l.approvedAt];
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

    return [...list].sort((a, b) => {
      const getLatestTime = (x) => {
        const times = [x.updatedAt, x.createdAt, x.approvedAt, x.resubmittedAt]
          .filter(Boolean)
          .map(t => new Date(t).getTime());
        return times.length > 0 ? Math.max(...times) : 0;
      };
      return getLatestTime(b) - getLatestTime(a);
    });
  }, [scopedListings, filterStatus, dateFrom, dateTo]);

  const selected = useMemo(() => scopedListings.find((l) => l.id === selectedId) || null, [scopedListings, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraftTitle('');
      setDraftDesc('');
      setBaselineTitle('');
      setBaselineDesc('');
      setAdjustmentNote('');
      setRejectNote('');
      setRejectError('');
      setAdjustError('');
      return;
    }
    setDraftTitle(selected.title || '');
    setDraftDesc(selected.description || '');
    setBaselineTitle(selected.title || '');
    setBaselineDesc(selected.description || '');
    setAdjustmentNote('');
    setRejectNote('');
    setRejectError('');
    setAdjustError('');
  }, [selected?.id]);

  const contentEdited =
    selected &&
    (draftTitle.trim() !== (baselineTitle || '').trim() || draftDesc.trim() !== (baselineDesc || '').trim());

  const loadHistory = useCallback(async (listingId) => {
    if (!listingId) return;
    setHistoryLoading(true);
    try {
      const rows = await fetch(`${API}/logs?entityId=${encodeURIComponent(listingId)}`).then((r) => r.json());
      const sorted = Array.isArray(rows) ? rows.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')) : [];
      setHistoryLogs(sorted);
    } catch {
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (panelTab === 'history' && selectedId) loadHistory(selectedId);
  }, [panelTab, selectedId, loadHistory]);

  const canAct = user.role === 'admin' || user.role === 'marketing';
  const pendingAction =
    selected && (selected.listing_status === 'Chờ duyệt' || selected.listing_status === 'Chờ duyệt chỉnh sửa');

  const pendingCount = scopedListings.filter(
    (l) => l.listing_status === 'Chờ duyệt' || l.listing_status === 'Chờ duyệt chỉnh sửa',
  ).length;
  const approvedCount = scopedListings.filter((l) => l.listing_status === 'Đã duyệt').length;
  const rejectedCount = scopedListings.filter((l) => l.listing_status === 'Từ chối').length;

  const handleApprove = async () => {
    if (!selected || !canAct) return;
    const u = readSessionUser();
    if (contentEdited && adjustmentNote.trim().length < ADJUSTMENT_NOTE_MIN) {
      setAdjustError(`Bắt buộc nhập nội dung điều chỉnh (tối thiểu ${ADJUSTMENT_NOTE_MIN} ký tự) khi MKT sửa tiêu đề hoặc mô tả.`);
      return;
    }
    setAdjustError('');
    
    const prop = getProperty(selected.property_id);
    const dupConfirm = await confirmDuplicateListingWarningAsync({
      listings,
      propertyRef: selected.property_id,
      propertyCode: prop?.propertyCode || selected.property_id,
      excludeListingId: selected.id,
      actionPrompt:
        'Bạn có chắc chắn muốn PHÊ DUYỆT tin đăng này không? (Chọn OK để tiếp tục — vẫn được duyệt sau khi đồng ý.)',
      audit: {
        userName: u.name || u.email || 'MKT',
        userId: u.id || '',
        propertyId: selected.property_id,
        listingId: selected.id,
        screen: 'F5',
        action: 'LISTING_APPROVE',
      },
    });
    if (!dupConfirm.ok) return;

    setSubmitting(true);
    const now = new Date().toISOString();
    const expiredAt = new Date(Date.now() + LISTING_APPROVAL_VALID_DAYS * 24 * 3600 * 1000).toISOString();
    const oldStatus = selected.listing_status;
    const wasEdited = contentEdited;

    try {
      const patchBody = JSON.stringify({
        title: draftTitle.trim(),
        description: draftDesc.trim(),
        listing_status: 'Đã duyệt',
        approvedBy: u.name || 'MKT',
        approvedBy_id: u.id || '',
        approvedAt: now,
        updatedAt: now,
        expiredAt,
        lastMktAdjustmentNote: wasEdited ? adjustmentNote.trim() : null,
        lastMktEditedAt: wasEdited ? now : null,
      });
      const doPatch = (force) =>
        fetch(`${API}/listings/${selected.id}`, {
          method: 'PATCH',
          headers: listingRequestHeaders(force),
          body: patchBody,
        });
      let patchRes = await doPatch(dupConfirm.forceDuplicate);
      if (patchRes.status === 409) {
        const retried = await resolveDuplicateListing409(
          patchRes,
          (force) => doPatch(force),
          {
            listings,
            propertyRef: selected.property_id,
            propertyCode: prop?.propertyCode || selected.property_id,
            excludeListingId: selected.id,
            actionPrompt:
              'Bạn có chắc chắn muốn PHÊ DUYỆT tin đăng này không? (Chọn OK để tiếp tục — vẫn được duyệt sau khi đồng ý.)',
            audit: {
              userName: u.name || u.email || 'MKT',
              userId: u.id || '',
              propertyId: selected.property_id,
              listingId: selected.id,
              screen: 'F5',
              action: 'LISTING_APPROVE',
            },
          },
        );
        if (retried === null) {
          setSubmitting(false);
          return;
        }
        patchRes = retried;
      }
      if (!patchRes.ok) throw new Error(`PATCH listing ${patchRes.status}`);
      if (prop?.id) {
        const pid = encodeURIComponent(prop.id);
        await fetch(`${API}/properties/${pid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level2_status: 'Đang niêm yết', statusLv2: 'Đang niêm yết', updatedAt: now, mktApproveBy: u.name || 'MKT', mktApproveAt: now }),
        });
      }

      const verb = wasEdited ? 'Chỉnh sửa & Duyệt niêm yết' : 'Duyệt niêm yết';
      const modifiedFields = wasEdited
        ? {
            title: { from: baselineTitle || '', to: draftTitle.trim() },
            description: { from: baselineDesc || '', to: draftDesc.trim() },
            adjustment_note: adjustmentNote.trim(),
          }
        : undefined;
      await postAuditLog({
        actionText: buildLogAction(verb, selected.id, wasEdited ? `Điều chỉnh: ${adjustmentNote.trim().slice(0, 160)}` : `TS ${selected.property_id}`),
        actionType: wasEdited ? AUDIT_ACTION_TYPE.LISTING_APPROVE_WITH_ADJUSTMENT : AUDIT_ACTION_TYPE.LISTING_APPROVE,
        listingId: selected.id,
        userName: u.name || u.email || 'MKT',
        userId: u.id || '',
        propertyId: selected.property_id,
        oldStatus,
        newStatus: 'Đã duyệt',
        detail: wasEdited ? adjustmentNote.trim() : undefined,
        modifiedFields,
      });

      await postInAppNotification({
        propertyId: selected.property_id,
        listingId: selected.id,
        recipient: selected.createdBy,
        message: wasEdited
          ? `Bài ${selected.id} đã được duyệt (MKT đã chỉnh sửa nội dung). Kiểm tra tin trên iHouzz.`
          : `Bài ${selected.id} đã được phê duyệt và đang niêm yết.`,
        type: 'success',
      });

      showToast(wasEdited ? 'Đã lưu chỉnh sửa và phê duyệt.' : 'Đã phê duyệt niêm yết.', 'success');
      setSelectedId(null);
      setPanelTab('review');
      await loadData();
    } catch {
      showToast('Lỗi khi phê duyệt.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !canAct) return;
    const note = rejectNote.trim();
    if (note.length < REJECT_REASON_MIN) {
      setRejectError(`Lý do từ chối tối thiểu ${REJECT_REASON_MIN} ký tự.`);
      return;
    }
    setRejectError('');
    setSubmitting(true);
    const u = readSessionUser();
    const now = new Date().toISOString();
    const oldStatus = selected.listing_status;
    try {
      await fetch(`${API}/listings/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_status: 'Từ chối',
          rejection_note: note,
          rejectedBy: u.name || 'MKT',
          rejectedBy_id: u.id || '',
          rejectedAt: now,
          updatedAt: now,
        }),
      });
      const rejProp = getProperty(selected.property_id);
      if (rejProp?.id) {
        await fetch(`${API}/properties/${encodeURIComponent(String(rejProp.id))}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level2_status: 'Chờ chỉnh sửa',
            statusLv2: 'Chờ chỉnh sửa',
            updatedAt: now,
          }),
        });
      }
      await postAuditLog({
        actionText: buildLogAction('Từ chối bài đăng', selected.id, note.slice(0, 120)),
        listingId: selected.id,
        userName: u.name || u.email || 'MKT',
        userId: u.id || '',
        propertyId: selected.property_id,
        oldStatus,
        newStatus: 'Từ chối',
        reason: note,
      });
      await postInAppNotification({
        propertyId: selected.property_id,
        listingId: selected.id,
        recipient: selected.createdBy,
        message: `Bài ${selected.id} bị từ chối. Lý do: ${note}`,
        type: 'danger',
      });
      showToast('Đã từ chối bài đăng.', 'warning');
      setSelectedId(null);
      setRejectNote('');
      await loadData();
    } catch {
      showToast('Lỗi khi từ chối.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const prop = selected ? getProperty(selected.property_id) : null;
  const rawPidMkt = user.pos_id;
  const posIdMkt = rawPidMkt === '' || rawPidMkt == null ? null : Number(rawPidMkt);
  const POS_ID_MKT = Number.isNaN(posIdMkt) ? null : posIdMkt;
  const priceText = prop
    ? formatPropertyPriceDisplay(user.role, prop, POS_ID_MKT, user.pos_name || '')
    : '';

  return (
    <div className="p-0" style={{ minHeight: '100vh', background: '#fafafa' }}>
      <div className="border-bottom bg-white shadow-sm">
        <div className="px-4 py-3 mx-auto d-flex flex-wrap align-items-center justify-content-between gap-3" style={{ maxWidth: 1400 }}>
          <div>
            <div className="text-uppercase small fw-bold text-muted mb-1" style={{ letterSpacing: '0.1em' }}>
              Kiểm duyệt niêm yết
            </div>
            <h4 className="fw-bold mb-0 text-dark">Trung tâm phê duyệt bài đăng</h4>
            <small className="text-muted">Marketing / Admin — khi duyệt, trạng thái niêm yết trên tài sản được đồng bộ tự động.</small>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="badge rounded-pill bg-light text-dark border px-3 py-2">{user.name}</span>
            <span className="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2">
              {user.role === 'sales' ? 'Chỉ xem' : 'Được thao tác duyệt'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 mx-auto" style={{ maxWidth: 1400 }}>
        {toast && (
          <div className={`alert alert-${toast.type} border-0 shadow-sm mb-3`} role="alert">
            {toast.msg}
          </div>
        )}

        <div className="row g-3 mb-4">
          {[
            { key: 'pending', label: 'Chờ xử lý', count: pendingCount, color: '#ea580c' },
            { key: 'approved', label: 'Đã duyệt', count: approvedCount, color: '#16a34a' },
            { key: 'rejected', label: 'Từ chối', count: rejectedCount, color: '#dc2626' },
            { key: 'all', label: 'Tất cả (phạm vi)', count: scopedListings.length, color: '#2563eb' },
          ].map((s) => (
            <div key={s.key} className="col-6 col-lg-3">
              <button
                type="button"
                className="w-100 text-start p-3 border-0 rounded-3 shadow-sm h-100 bg-white position-relative"
                style={{
                  outline: filterStatus === s.key ? `2px solid ${s.color}` : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setFilterStatus(s.key)}
              >
                <div className="fw-bold fs-3" style={{ color: s.color }}>
                  {s.count}
                </div>
                <div className="small text-muted">{s.label}</div>
              </button>
            </div>
          ))}
        </div>

        <div className="row g-3">
          <div className="col-lg-5">
            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
              <div className="card-header bg-white border-0 py-3 fw-semibold d-flex flex-wrap gap-2 align-items-center">
                <span>Danh sách ({filtered.length})</span>
                <div className="ms-auto d-flex flex-wrap gap-1 align-items-center">
                  <div className="btn-group btn-group-sm me-1">
                    {[
                      ['pending', 'Chờ'],
                      ['approved', 'Đã duyệt'],
                      ['rejected', 'Từ chối'],
                      ['all', 'Tất cả'],
                    ].map(([k, lab]) => (
                      <button
                        key={k}
                        type="button"
                        className={`btn ${filterStatus === k ? 'btn-dark' : 'btn-outline-secondary'}`}
                        onClick={() => setFilterStatus(k)}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                  <div className="d-flex gap-1 align-items-center">
                    <span className="input-group-text bg-white border rounded-start" style={{fontSize:11}}><i className="bi bi-calendar3"></i></span>
                    <input type="date" className="form-control form-control-sm" style={{width:130}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span className="small text-muted">—</span>
                    <input type="date" className="form-control form-control-sm" style={{width:130}} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      style={{ fontSize: 10, padding: '2px 6px', lineHeight: 1.1 }}
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      Đặt
                      <br />
                      lại
                    </button>
                  </div>
                </div>
              </div>
              <div className="list-group list-group-flush overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {filtered.length === 0 && (
                  <div className="p-5 text-center text-muted small">Không có bài đăng trong bộ lọc này.</div>
                )}
                {filtered.map((l) => {
                  const meta = STATUS_META[l.listing_status] || { tone: 'secondary', icon: '·' };
                  const p = getProperty(l.property_id);
                  const active = selectedId === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`list-group-item list-group-item-action py-3 px-3 text-start border-0 ${active ? 'bg-primary bg-opacity-10' : ''}`}
                      onClick={() => {
                        setSelectedId(l.id);
                        setPanelTab('review');
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="fw-bold text-dark">{formatListingId(l.listingCode || l.id)}</div>
                          <div className="small text-muted text-truncate" style={{ maxWidth: 220 }} title={l.title}>
                            {l.title}
                          </div>
                          <div className="small mt-1">
                            <span className="text-muted">{formatPropertyId(p?.propertyCode || p?.id || l.property_id)}</span>
                            {p?.pos_name && <span className="ms-2 badge bg-light text-dark border">{p.pos_name}</span>}
                          </div>
                        </div>
                        <span className={`badge bg-${toneToBadge(meta.tone)}`}>
                          {meta.icon} {l.listing_status}
                        </span>
                      </div>
                      <div className="small text-muted mt-2">
                        Người soạn: {l.createdBy} · Ngày tạo: {l.createdAt ? new Date(l.createdAt).toLocaleDateString('vi-VN') : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-lg-7">
            {!selected && (
              <div
                className="card border-0 shadow-sm d-flex align-items-center justify-content-center text-muted"
                style={{ borderRadius: 12, minHeight: 420 }}
              >
                Chọn một bài đăng bên trái để xem chi tiết, chỉnh sửa và duyệt.
              </div>
            )}

            {selected && (
              <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
                <div className="card-header bg-white border-bottom py-3 d-flex flex-wrap align-items-center gap-2">
                  <div className="fw-bold fs-5">{formatListingId(selected.listingCode || selected.id)}</div>
                  <span className={`badge bg-${toneToBadge((STATUS_META[selected.listing_status] || {}).tone)}`}>
                    {selected.listing_status}
                  </span>
                  <div className="ms-auto btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn ${panelTab === 'review' ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setPanelTab('review')}
                    >
                      Duyệt & nội dung
                    </button>
                    <button
                      type="button"
                      className={`btn ${panelTab === 'history' ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setPanelTab('history')}
                    >
                      Lịch sử thao tác
                    </button>
                  </div>
                </div>

                {panelTab === 'history' && (
                  <div className="card-body" style={{ minHeight: 360 }}>
                    {historyLoading && <div className="text-muted small py-4 text-center">Đang tải lịch sử…</div>}
                    {!historyLoading && historyLogs.length === 0 && (
                      <p className="text-muted small mb-0">Chưa có log cho mã tin này (các thao tác mới sẽ hiển thị tại đây).</p>
                    )}
                    <ul className="list-unstyled mb-0">
                      {historyLogs.map((lg) => (
                        <li key={lg.id || lg.timestamp} className="mb-3 pb-3 border-bottom">
                          <div className="small text-muted">{new Date(lg.timestamp).toLocaleString('vi-VN')}</div>
                          <div className="fw-semibold">{lg.user || '—'}</div>
                          <div className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                            {lg.action ? lg.action.replace(selected.id, formatListingId(selected.listingCode || selected.id)).replace(selected.property_id, formatPropertyId(prop?.propertyCode || prop?.id || selected.property_id)) : '—'}
                          </div>
                          {lg.old_status && lg.new_status && (
                            <div className="small mt-1">
                              <span className="badge bg-light text-dark border me-1">{lg.old_status}</span>
                              →
                              <span className="badge bg-light text-dark border ms-1">{lg.new_status}</span>
                            </div>
                          )}
                          {lg.action_type && (
                            <div className="small mt-1">
                              <span className="badge bg-secondary bg-opacity-25 text-dark border">action_type: {lg.action_type}</span>
                            </div>
                          )}
                          {lg.modified_fields && typeof lg.modified_fields === 'object' && (
                            <details className="small mt-1">
                              <summary className="text-primary" style={{ cursor: 'pointer' }}>
                                modified_fields (MKT chỉnh sửa)
                              </summary>
                              <pre className="bg-light border rounded p-2 mt-1 mb-0" style={{ fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                                {JSON.stringify(lg.modified_fields, null, 2)}
                              </pre>
                            </details>
                          )}
                          {lg.reason && (
                            <div className="small text-danger mt-1">
                              <strong>Lý do:</strong> {lg.reason}
                            </div>
                          )}
                          {lg.detail && !(lg.reason && lg.detail === lg.reason) && (
                            <div className="small text-muted mt-1">{lg.detail}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {panelTab === 'review' && (
                  <div className="card-body">
                    {prop && (
                      <div className="row g-3 mb-4 small">
                        <div className="col-md-6">
                          <div className="p-3 rounded-3 bg-light border">
                            <div className="text-muted text-uppercase fw-bold mb-2" style={{ fontSize: 11 }}>
                              Tài sản nguồn
                            </div>
                            <div>
                              <strong>Địa chỉ:</strong> {prop.address}
                            </div>
                            <div className="mt-1">
                              <strong>Giá:</strong> {priceText}
                            </div>
                            <div className="mt-1">
                              <strong>Lv1 / Lv2:</strong> {prop.level1_status || prop.statusLv1} · {prop.level2_status || prop.statusLv2}
                            </div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="p-3 rounded-3 bg-light border h-100">
                            <div className="text-muted text-uppercase fw-bold mb-2" style={{ fontSize: 11 }}>
                              Người soạn tin
                            </div>
                            <div>{selected.createdBy}</div>
                            <div className="text-muted small mt-1">
                              <i className="bi bi-calendar2-check me-1"></i>
                              Ngày tạo: {selected.createdAt ? new Date(selected.createdAt).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
                            </div>
                            {selected.listing_status === 'Chờ duyệt chỉnh sửa' && selected.resubmit_note && (
                              <div className="mt-2 p-2 bg-info bg-opacity-10 rounded small">
                                <strong>Ghi chú gửi lại:</strong> {selected.resubmit_note}
                              </div>
                            )}
                            {selected.listing_status === 'Chờ duyệt chỉnh sửa' && selected.prev_rejection_note && (
                              <div className="mt-2 small text-muted">
                                <em>Lý do từ chối trước:</em> {selected.prev_rejection_note}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <ListingMediaReadonly listing={selected} />

                    <div className="d-flex flex-wrap gap-2 mb-3">
                      <button type="button" className="btn btn-outline-primary btn-sm fw-semibold" onClick={() => setShowPublicPreview(true)}>
                        <i className="bi bi-eye me-1" />
                        Xem trước website
                      </button>
                      <small className="text-muted align-self-center">Hiển thị theo bản nháp tiêu đề / mô tả hiện tại</small>
                    </div>

                    <div className="mb-3">
                      <label className="form-label fw-semibold">Tiêu đề công khai</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={draftTitle}
                        disabled={!canAct || !pendingAction}
                        onChange={(e) => setDraftTitle(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold">Mô tả</label>
                      <textarea
                        className="form-control"
                        rows={8}
                        value={draftDesc}
                        disabled={!canAct || !pendingAction}
                        onChange={(e) => setDraftDesc(e.target.value)}
                      />
                    </div>

                    {contentEdited && canAct && pendingAction && (
                      <div className="mb-3 p-3 rounded-3 border border-warning bg-warning bg-opacity-10">
                        <label className="form-label fw-bold text-warning-emphasis">
                          Nội dung điều chỉnh của MKT <span className="text-danger">*</span> (≥ {ADJUSTMENT_NOTE_MIN} ký tự)
                        </label>
                        <textarea
                          className="form-control"
                          rows={3}
                          placeholder="Ghi rõ phần đã sửa và lý do chỉnh sửa…"
                          value={adjustmentNote}
                          onChange={(e) => {
                            setAdjustmentNote(e.target.value);
                            setAdjustError('');
                          }}
                        />
                        {adjustError && <div className="text-danger small mt-2">{adjustError}</div>}
                      </div>
                    )}

                    {!canAct && (
                      <div className="alert alert-secondary small mb-0">Bạn đang xem ở chế độ chỉ đọc (Sales).</div>
                    )}

                    {canAct && pendingAction && (
                      <div className="d-flex flex-wrap gap-2 align-items-start justify-content-between mt-4">
                        <div style={{ minWidth: 280, flex: 1 }} className="me-md-3">
                          <label className="form-label fw-semibold text-danger">Từ chối — lý do (≥ {REJECT_REASON_MIN} ký tự)</label>
                          <textarea
                            className="form-control border-danger border-opacity-50"
                            rows={3}
                            placeholder="Nhập lý do từ chối cho đầu chủ…"
                            value={rejectNote}
                            onChange={(e) => {
                              setRejectNote(e.target.value);
                              setRejectError('');
                            }}
                          />
                          {rejectError && <div className="text-danger small mt-2">{rejectError}</div>}
                          <button
                            type="button"
                            className="btn btn-outline-danger mt-2"
                            disabled={submitting}
                            onClick={handleReject}
                          >
                            Xác nhận từ chối
                          </button>
                        </div>
                        <div className="d-flex flex-column align-items-stretch gap-2" style={{ minWidth: 200 }}>
                          <button type="button" className="btn btn-success fw-bold px-4 py-2" disabled={submitting} onClick={handleApprove}>
                            {submitting ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                            {contentEdited ? 'Lưu chỉnh sửa & Phê duyệt' : 'Phê duyệt niêm yết'}
                          </button>
                          <small className="text-muted">
                            Hết hạn niêm yết demo: {LISTING_APPROVAL_VALID_DAYS} ngày kể từ duyệt.
                          </small>
                        </div>
                      </div>
                    )}

                    {selected.listing_status === 'Đã duyệt' && (
                      <div className="mt-3 small text-muted">
                        Duyệt bởi <strong>{selected.approvedBy}</strong> · {selected.approvedAt && new Date(selected.approvedAt).toLocaleString('vi-VN')}
                        {selected.lastMktAdjustmentNote && (
                          <div className="mt-2 p-2 bg-light border rounded">
                            <strong>Ghi chú điều chỉnh MKT:</strong> {selected.lastMktAdjustmentNote}
                          </div>
                        )}
                      </div>
                    )}
                    {selected.listing_status === 'Từ chối' && (
                      <div className="mt-3 small">
                        <span className="text-danger fw-semibold">Từ chối bởi {selected.rejectedBy}</span>
                        {selected.rejectedAt && <span className="text-muted"> · {new Date(selected.rejectedAt).toLocaleString('vi-VN')}</span>}
                        <div className="mt-2 p-3 bg-danger bg-opacity-10 rounded border border-danger border-opacity-25">
                          {selected.rejection_note}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ListingWebsitePreviewModal
        show={showPublicPreview && !!selected}
        onHide={() => setShowPublicPreview(false)}
        title={draftTitle}
        description={draftDesc}
        contactPhone={selected?.contact_phone || ''}
        property={prop}
        listing={selected}
        extraImageUrls={[]}
      />
    </div>
  );
}
