import { API_BASE_URL } from '../config.js';
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  UPDATE_REQUEST_PENDING,
  applyApprovedPendingToProperty,
  diffPropertyUpdate,
  estimateJsonBytes,
  replaceDataImageUrlsForSmallPayload,
  propertyHasLiveListingForUpdateLock,
} from '../utils/propertyUpdateWorkflow';
import { formatPropertyPriceDisplay, shouldMaskPrice } from '../utils/permissions';
import AppToast from '../components/AppToast';
import { useAppToast } from '../hooks/useAppToast';
import {
  buildWarehouseApprovalMessage,
  buildUpdateApprovalMessage,
  listOverduePendingApprovals,
  NOTIF_CATEGORY,
  propertyDisplayCode,
  SLA_REMINDER_DAYS,
} from '../utils/approvalNotifications';
import { formatPropertyId, formatDateTimeVi, postEntityAudit, AUDIT_ACTION_TYPE } from '../utils/listingWorkflow';
import { normalizeUserId } from '../utils/userId';

const F3_FALLBACK_HERO =
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1000&q=80';

/** Ngày local YYYY-MM-DD — đồng bộ với F9 (tránh lệch UTC của `toISOString()`). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultF3DateRange() {
  const now = new Date();
  return {
    from: formatLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatLocalYmd(now),
  };
}

function f3CountLabel(v) {
  if (v === '' || v == null) return '—';
  const n = Number(v);
  if (Number.isFinite(n)) return String(n);
  return String(v);
}

function f3FloorLabel(v) {
  if (v === '' || v == null) return '—';
  return String(v);
}

function isPendingPropertyUpdate(p) {
  return p && p.update_request_status === UPDATE_REQUEST_PENDING;
}

function Feature3_Approval() {
  const [properties, setProperties] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history'
  const [selectedProp, setSelectedProp] = useState(null); // Để xem chi tiết
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  /** 'Standard' | 'Guaranteed' — xác nhận trước khi duyệt nhập kho */
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [pendingApproveType, setPendingApproveType] = useState(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [f3HeroImageIndex, setF3HeroImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { from: f3DateFrom, to: f3DateTo } = defaultF3DateRange();
  const [dateFrom, setDateFrom] = useState(f3DateFrom);
  const [dateTo, setDateTo] = useState(f3DateTo);
  const { toast, showToast, dismissToast } = useAppToast();

  // Lấy thông tin user từ localStorage
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const rawRole = user.role || 'pos_manager';
  const ROLE = rawRole === 'pos' ? 'pos_manager' : rawRole;
  const currentPosName = user.pos_name || '';
  const rawPid = user.pos_id;
  const POS_ID_NUM = rawPid === '' || rawPid == null ? null : Number(rawPid);
  const POS_ID = Number.isNaN(POS_ID_NUM) ? null : POS_ID_NUM;

  const displayPrice = (propLike) =>
    formatPropertyPriceDisplay(ROLE, propLike, POS_ID, currentPosName);

  const pricePerSqmLabel = (propLike) => {
    if (!propLike || shouldMaskPrice(ROLE, propLike, POS_ID, currentPosName)) return null;
    const area = Number(propLike.area);
    if (!Number.isFinite(area) || area <= 0) return null;
    const unit = propLike.priceUnit === 'tỷ VNĐ' ? 0.001 : 1000000;
    const v = (Number(propLike.price) / area) / unit;
    if (!Number.isFinite(v)) return null;
    return `~ ${v.toFixed(1)} triệu/m²`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setF3HeroImageIndex(0);
  }, [selectedProp?.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/properties`);
      const payload = res.data;
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      setProperties(rows);
    } catch (error) {
      console.error("Lỗi lấy dữ liệu:", error);
    } finally {
      setLoading(false);
    }
  };

  // Admin thấy tất cả, POS Manager chỉ thấy POS của mình
  const applySearch = (list) => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(p =>
      String(p.id).toLowerCase().includes(q) ||
      (p.propertyCode && String(p.propertyCode).toLowerCase().includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q)) ||
      (p.createdBy && p.createdBy.toLowerCase().includes(q))
    );
  };

  const applyDateRange = (list) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(p => {
      const fields = [p.createdAt, p.updatedAt, p.approvedAt, p.approved_at, p.update_requested_at];
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

  const pendingList = applyDateRange(applySearch(properties.filter(p => {
    const isPendingNew = p.level1_status === 'Chờ POS duyệt' || p.level1_status === 'Chờ duyệt đảm bảo';
    const isPendingUpd = isPendingPropertyUpdate(p);
    if (!isPendingNew && !isPendingUpd) return false;
    if (ROLE === 'admin') return true;
    return p.pos_name === currentPosName;
  })));

  const historyList = applyDateRange(applySearch(properties.filter(p => {
    const isDone = p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo' || p.level1_status === 'Bị từ chối';
    if (!isDone) return false;
    if (ROLE === 'admin') return true;
    return p.pos_name === currentPosName;
  })));

  const overduePending = useMemo(
    () => listOverduePendingApprovals(
      properties.filter((p) => {
        if (ROLE === 'admin') return true;
        return p.pos_name === currentPosName;
      }),
    ),
    [properties, ROLE, currentPosName],
  );

  const f3DetailMedia = useMemo(() => {
    if (!selectedProp) {
      return { galleryImages: [F3_FALLBACK_HERO], heroSrc: F3_FALLBACK_HERO, showThumbStrip: false };
    }
    const raw = Array.isArray(selectedProp.images) ? selectedProp.images.filter(Boolean) : [];
    const galleryImages = raw.length > 0 ? raw : [F3_FALLBACK_HERO];
    const idx = Math.min(Math.max(0, f3HeroImageIndex), galleryImages.length - 1);
    return {
      galleryImages,
      heroSrc: galleryImages[idx],
      showThumbStrip: galleryImages.length > 1,
    };
  }, [selectedProp, f3HeroImageIndex]);

  const openWarehouseApproveConfirm = (type) => {
    setPendingApproveType(type);
    setShowApproveModal(true);
  };

  const closeWarehouseApproveConfirm = () => {
    if (approveSubmitting) return;
    setShowApproveModal(false);
    setPendingApproveType(null);
  };

  const confirmWarehouseApprove = async () => {
    if (!pendingApproveType || !selectedProp || approveSubmitting) return;
    setApproveSubmitting(true);
    try {
      const ok = await handleApprove(pendingApproveType);
      if (ok) {
        setShowApproveModal(false);
        setPendingApproveType(null);
      }
    } finally {
      setApproveSubmitting(false);
    }
  };

  const handleApprove = async (type) => {
    if (!selectedProp) return;

    if (isPendingPropertyUpdate(selectedProp)) {
      const pending = selectedProp.pending_update_payload;
      if (!pending || typeof pending !== 'object') {
        alert('Thiếu dữ liệu bản cập nhật (pending_update_payload).');
        return;
      }
      try {
        const listingsRes = await axios.get(`${API_BASE_URL}/listings`);
        const listingsPayload = listingsRes.data;
        const listingsRows = Array.isArray(listingsPayload)
          ? listingsPayload
          : Array.isArray(listingsPayload?.data)
            ? listingsPayload.data
            : [];
        if (propertyHasLiveListingForUpdateLock(selectedProp, listingsRows)) {
          alert(
            'Không thể duyệt cập nhật kho: tài sản đang có bài đăng niêm yết (Lv2 Đang niêm yết hoặc tin Đã duyệt). Hãy từ chối yêu cầu này và yêu cầu Đầu chủ gỡ/tạm dừng tin trước.',
          );
          return;
        }
        const changes = diffPropertyUpdate(selectedProp, pending);
        let merged = applyApprovedPendingToProperty(selectedProp, pending);

        let resetLevel2Reason = null;
        if (selectedProp.level2_status === 'Thẩm định phí' || selectedProp.statusLv2 === 'Thẩm định phí') {
          merged.level2_status = 'Chưa niêm yết';
          merged.statusLv2 = 'Chưa niêm yết';
          resetLevel2Reason = 'Tự động reset Level 2 từ Thẩm định phí về Chưa niêm yết sau khi duyệt cập nhật.';
        }

        if (estimateJsonBytes(merged) > 95000) {
          merged = {
            ...merged,
            images: replaceDataImageUrlsForSmallPayload(merged.images, merged.id),
          };
        }
        await axios.put(`${API_BASE_URL}/properties/${encodeURIComponent(selectedProp.id)}`, merged);
        await postEntityAudit({
          action: 'F3-Duyệt phê duyệt cập nhật tài sản',
          actionType: AUDIT_ACTION_TYPE.PROPERTY_F3_APPROVE_UPDATE,
          entityId: selectedProp.id,
          property_id: selectedProp.propertyCode || selectedProp.id,
          user: user.name || 'GĐ POS',
          user_id: normalizeUserId(user.id) ?? '',
          extra: {
            approver: user.name || 'GĐ POS',
            approvalKind: 'property_update',
            changedAt: new Date().toISOString(),
            changes,
            ...(resetLevel2Reason ? { resetLevel2Reason } : {})
          },
        });
        const updMsg = buildUpdateApprovalMessage(selectedProp.propertyCode || selectedProp.id, true);
        await axios.post(`${API_BASE_URL}/notifications`, {
          propertyId: selectedProp.id,
          recipient: selectedProp.createdBy,
          message: updMsg,
          category: NOTIF_CATEGORY.UPDATE_APPROVE,
          type: 'success',
          createdAt: new Date().toISOString(),
          isRead: false,
        });
        showToast({ msg: updMsg, type: 'success' });
        setSelectedProp(null);
        fetchData();
        return true;
      } catch (error) {
        alert('Lỗi khi phê duyệt cập nhật!');
      }
      return false;
    }

    try {
      const updatedStatus = type === 'Standard' ? 'Được duyệt' : 'Được đảm bảo';
      const warehouseType = type === 'Standard' ? 'Kho chuẩn' : 'Kho đảm bảo';
      const now = new Date().toISOString();
      await axios.patch(`${API_BASE_URL}/properties/${selectedProp.id}`, {
        level1_status: updatedStatus,
        level2_status: 'Chưa niêm yết',
        warehouse_type: warehouseType,
        approvedAt: now,
        approvedBy: user.name || 'GĐ POS',
        approved_at: now
      });

      const oldLv1 = selectedProp.level1_status || selectedProp.statusLv1 || '';
      await postEntityAudit({
        action: type === 'Standard' ? `Duyệt vào Kho chuẩn` : `Duyệt vào Kho đảm bảo`,
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F3_APPROVE_WAREHOUSE,
        entityId: selectedProp.id,
        property_id: selectedProp.propertyCode || selectedProp.id,
        user: user.name || 'GĐ POS',
        user_id: normalizeUserId(user.id) ?? '',
        old_status: oldLv1,
        new_status: updatedStatus,
        extra: { warehouseType, approvalBranch: type },
      });

      const whMsg = buildWarehouseApprovalMessage({
        propertyId: selectedProp.id,
        kind: 'approve',
        warehouseType: warehouseType,
      });
      await axios.post(`${API_BASE_URL}/notifications`, {
        propertyId: selectedProp.id,
        recipient: selectedProp.createdBy,
        message: whMsg,
        category: NOTIF_CATEGORY.WAREHOUSE_APPROVE,
        type: 'success',
        createdAt: now,
        isRead: false,
      });

      showToast({ msg: whMsg, type: 'success' });
      setSelectedProp(null);
      fetchData();
      return true;
    } catch (error) {
      alert("Lỗi khi phê duyệt!");
      return false;
    }
  };

  const handleReject = async () => {
    if (!selectedProp) return;
    if (rejectReason.length < 10) {
      alert("Lý do từ chối phải ít nhất 10 ký tự.");
      return;
    }

    try {
      if (isPendingPropertyUpdate(selectedProp)) {
        await axios.patch(`${API_BASE_URL}/properties/${selectedProp.id}`, {
          pending_update_payload: null,
          update_request_status: null,
          update_requested_at: null,
          update_requested_by: null,
          update_requested_by_id: null,
          update_request_note: null,
          update_rejection_reason: rejectReason,
          update_rejected_at: new Date().toISOString(),
          update_rejected_by: user.name || 'GĐ POS',
        });

        await postEntityAudit({
          action: 'F3-Từ chối phê duyệt cập nhật tài sản',
          actionType: AUDIT_ACTION_TYPE.PROPERTY_F3_REJECT_UPDATE,
          entityId: selectedProp.id,
          property_id: selectedProp.propertyCode || selectedProp.id,
          user: user.name || 'GĐ POS',
          user_id: normalizeUserId(user.id) ?? '',
          reason: rejectReason,
        });

        const updRejectMsg = buildUpdateApprovalMessage(selectedProp.propertyCode || selectedProp.id, false);
        await axios.post(`${API_BASE_URL}/notifications`, {
          propertyId: selectedProp.id,
          recipient: selectedProp.createdBy,
          message: `${updRejectMsg} Lý do: ${rejectReason}`,
          category: NOTIF_CATEGORY.UPDATE_REJECT,
          type: 'danger',
          createdAt: new Date().toISOString(),
          isRead: false,
        });

        showToast({ msg: updRejectMsg, type: 'danger' });
        setShowRejectModal(false);
        setRejectReason('');
        setSelectedProp(null);
        fetchData();
        return;
      }

      const now = new Date().toISOString();
      await axios.patch(`${API_BASE_URL}/properties/${selectedProp.id}`, {
        level1_status: 'Bị từ chối',
        rejected_reason: rejectReason,
        rejectedAt: now,
        rejectedBy: user.name || 'GĐ POS',
        rejected_at: now
      });

      await postEntityAudit({
        action: 'Từ chối phê duyệt tài sản',
        actionType: AUDIT_ACTION_TYPE.PROPERTY_F3_REJECT_WAREHOUSE,
        entityId: selectedProp.id,
        property_id: selectedProp.propertyCode || selectedProp.id,
        user: user.name || 'GĐ POS',
        user_id: normalizeUserId(user.id) ?? '',
        reason: rejectReason,
        old_status: selectedProp.level1_status || selectedProp.statusLv1,
        new_status: 'Bị từ chối',
      });

      const rejectMsg = buildWarehouseApprovalMessage({
        propertyId: selectedProp.id,
        kind: 'reject',
        rejectReason,
      });
      await axios.post(`${API_BASE_URL}/notifications`, {
        propertyId: selectedProp.id,
        recipient: selectedProp.createdBy,
        message: rejectMsg,
        category: NOTIF_CATEGORY.WAREHOUSE_REJECT,
        type: 'danger',
        createdAt: now,
        isRead: false,
      });

      showToast({ msg: rejectMsg, type: 'danger' });
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProp(null);
      fetchData();
    } catch (error) {
      alert("Lỗi khi từ chối!");
    }
  };

  return (
    <div className="container-fluid p-4" style={{ background: 'var(--ih-main-bg, #f1f5f9)', minHeight: '100%' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold m-0">Kiểm duyệt & Phê duyệt Nhập kho (F3)</h3>
          <p className="text-muted small mb-0">
            Actor: Giám đốc POS | Chi nhánh:{' '}
            <strong className="text-primary">{ROLE === 'admin' ? 'Toàn hệ thống (Admin)' : currentPosName || 'Chưa xác định'}</strong>
          </p>
        </div>
        <div className="btn-group shadow-sm">
          <button className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => {setActiveTab('pending'); setSelectedProp(null);}}>
            Chờ duyệt <span className="badge bg-danger ms-2">{pendingList.length}</span>
          </button>
          <button className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => {setActiveTab('history'); setSelectedProp(null);}}>
            Đã xử lý
          </button>
        </div>
      </div>

      {activeTab === 'pending' && overduePending.length > 0 && (
        <div className="alert alert-warning border-0 shadow-sm mb-3 d-flex align-items-start gap-2">
          <i className="bi bi-clock-history fs-5 flex-shrink-0" />
          <div>
            <strong>SLA nhắc hạn ({SLA_REMINDER_DAYS} ngày):</strong>{' '}
            {overduePending.length} hồ sơ chờ xử lý quá hạn —{' '}
            {overduePending.map((p) => formatPropertyId(p.propertyCode || p.id)).join(', ')}
          </div>
        </div>
      )}

      <div className="row">
        {/* Danh sách bên trái */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm overflow-hidden" style={{ height: '75vh' }}>
            <div className="card-header bg-white py-3">
              <div className="input-group input-group-sm mb-2">
                <span className="input-group-text bg-light border-end-0">
                  <i className="bi bi-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Tìm mã LS-, địa chỉ, người tạo..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedProp(null); }}
                />
                {search && (
                  <button className="btn btn-outline-secondary" onClick={() => { setSearch(''); setSelectedProp(null); }}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>
              <div className="d-flex gap-1 align-items-center">
                <span className="input-group-text bg-white border rounded-start" style={{fontSize:12}}><i className="bi bi-calendar3"></i></span>
                <input type="date" className="form-control form-control-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Từ ngày" />
                <span className="small text-muted px-1">—</span>
                <input type="date" className="form-control form-control-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Đến ngày" />
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    const r = defaultF3DateRange();
                    setDateFrom(r.from);
                    setDateTo(r.to);
                  }}
                  title="Đặt lại: đầu tháng → hôm nay"
                >
                  Đặt lại
                </button>
              </div>
            </div>
            <div className="list-group list-group-flush overflow-auto">
              {(activeTab === 'pending' ? pendingList : historyList).map(p => (
                <button key={p.id} 
                  className={`list-group-item list-group-item-action p-3 border-start border-4 ${selectedProp?.id === p.id ? 'bg-light border-primary' : 'border-transparent'}`}
                  onClick={() => setSelectedProp(p)}
                >
                  <div className="d-flex justify-content-between mb-1">
                    <span className="fw-bold text-primary">{p.propertyCode || p.id}</span>
                    <span className="small text-muted">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '—'}</span>
                  </div>
                  <div className="small text-truncate mb-2">{p.address}</div>
                  <div className="d-flex gap-2 flex-wrap">
                    <span className={`badge ${p.level1_status?.includes('đảm bảo') ? 'bg-warning text-dark' : 'bg-info text-white'}`}>{p.level1_status}</span>
                    {isPendingPropertyUpdate(p) && (
                      <span className="badge bg-primary">YC cập nhật TS</span>
                    )}
                    <span className="badge bg-secondary">{p.type}</span>
                  </div>
                </button>
              ))}
              {(activeTab === 'pending' ? pendingList : historyList).length === 0 && (
                <div className="text-center p-5 text-muted">Không có hồ sơ nào</div>
              )}
            </div>
          </div>
        </div>

        {/* Chi tiết bên phải */}
        <div className="col-md-8">
          {selectedProp ? (
            <div className="card border-0 shadow-sm h-100 overflow-hidden">
              {/* Ảnh đại diện + gallery */}
              <div className="position-relative bg-dark" style={{ height: '300px' }}>
                <img
                  src={f3DetailMedia.heroSrc}
                  alt="Property"
                  className="w-100 h-100 object-fit-cover opacity-90"
                />
                <div className="position-absolute top-0 end-0 p-3 d-flex flex-column gap-1 align-items-end">
                  <span className={`badge ${selectedProp.level1_status?.includes('đảm bảo') ? 'bg-warning text-dark' : 'bg-success'} fs-6 shadow`}>
                    {selectedProp.level1_status}
                  </span>
                  {isPendingPropertyUpdate(selectedProp) && (
                    <span className="badge bg-primary fs-6 shadow">Chờ duyệt cập nhật</span>
                  )}
                </div>
              </div>
              {f3DetailMedia.showThumbStrip && (
                <div className="d-flex gap-2 p-2 bg-dark border-top border-secondary overflow-auto">
                  {f3DetailMedia.galleryImages.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      className="p-0 border-0 rounded overflow-hidden flex-shrink-0 bg-secondary"
                      style={{
                        width: 88,
                        height: 56,
                        boxShadow: i === f3HeroImageIndex ? '0 0 0 3px #ffc107' : 'none',
                      }}
                      onClick={() => setF3HeroImageIndex(i)}
                      title={`Ảnh ${i + 1}`}
                    >
                      <img src={src} alt="" className="w-100 h-100 object-fit-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Tiêu đề & Địa chỉ (chuyển xuống dưới ảnh) */}
              <div className="p-4 bg-white border-bottom">
                <h4 className="fw-bold mb-1 text-dark">
                  {formatPropertyId(selectedProp.propertyCode || selectedProp.id)}
                  {(() => {
                    const sub = [selectedProp.type, selectedProp.propertyType].filter(Boolean).join(' · ');
                    return sub ? `: ${sub}` : '';
                  })()}
                </h4>
                <p className="mb-0 text-muted"><i className="bi bi-geo-alt-fill me-2"></i>{selectedProp.address}</p>
                {(selectedProp.district || selectedProp.ward || selectedProp.futureWard) && (
                  <p className="mb-0 mt-1 small text-muted">
                    {[selectedProp.ward, selectedProp.district].filter(Boolean).join(' · ')}
                    {selectedProp.futureWard ? (
                      <span className="ms-1">· Phường sau sáp nhập: <strong>{selectedProp.futureWard}</strong></span>
                    ) : null}
                  </p>
                )}
              </div>

              <div className="card-body p-4">
                {isPendingPropertyUpdate(selectedProp) && selectedProp.pending_update_payload && (
                  <div className="alert alert-primary border-0 mb-4">
                    <h6 className="fw-bold mb-2"><i className="bi bi-arrow-left-right me-2"></i>So sánh dữ liệu cập nhật</h6>
                    <div className="row g-3 small">
                      <div className="col-md-6">
                        <div className="fw-semibold text-muted mb-1">Đang lưu</div>
                        <div className="border rounded p-2 bg-light" style={{ maxHeight: 280, overflow: 'auto' }}>
                          <div><span className="text-muted">Địa chỉ:</span> {selectedProp.address}</div>
                          <div><span className="text-muted">Giá:</span> {displayPrice(selectedProp)}</div>
                          <div><span className="text-muted">DT:</span> {selectedProp.area} m² · PN/PT: {f3CountLabel(selectedProp.bedrooms)}/{f3CountLabel(selectedProp.bathrooms)}</div>
                          <div className="mt-1"><span className="text-muted">Mô tả:</span> {selectedProp.description?.trim() || '—'}</div>
                          <div className="text-muted mt-1">Ảnh: {(selectedProp.images || []).length}</div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="fw-semibold text-primary mb-1">Đề xuất thay thế</div>
                        <div className="border border-primary rounded p-2 bg-primary bg-opacity-10" style={{ maxHeight: 280, overflow: 'auto' }}>
                          {(() => {
                            const q = selectedProp.pending_update_payload;
                            return (
                              <>
                                <div><span className="text-muted">Địa chỉ:</span> {q.address}</div>
                                <div><span className="text-muted">Giá:</span> {displayPrice({ ...selectedProp, price: q.price, priceUnit: q.priceUnit, price_display: q.price_display })}</div>
                                <div><span className="text-muted">DT:</span> {q.area} m² · PN/PT: {f3CountLabel(q.bedrooms)}/{f3CountLabel(q.bathrooms)}</div>
                                <div className="mt-1"><span className="text-muted">Mô tả:</span> {(q.description && String(q.description).trim()) || '—'}</div>
                                <div className="text-muted mt-1">Ảnh: {(q.images || []).length}</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    {selectedProp.update_request_note && (
                      <div className="mt-2 small"><span className="text-muted">Ghi chú Đầu chủ:</span> {selectedProp.update_request_note}</div>
                    )}
                  </div>
                )}
                <div className="row g-4">
                  {/* Cột chính: Thông số & Mô tả */}
                  <div className="col-md-8">
                    <div className="d-flex justify-content-between align-items-center mb-3 bg-light p-3 rounded-3 flex-wrap gap-2">
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Diện tích</div>
                        <div className="fw-bold fs-5">{selectedProp.area} m²</div>
                      </div>
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Phòng ngủ</div>
                        <div className="fw-bold fs-5"><i className="bi bi-door-open me-1"></i>{f3CountLabel(selectedProp.bedrooms)}</div>
                      </div>
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Phòng tắm</div>
                        <div className="fw-bold fs-5"><i className="bi bi-water me-1"></i>{f3CountLabel(selectedProp.bathrooms)}</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-muted small">Tầng</div>
                        <div className="fw-bold fs-5">{f3FloorLabel(selectedProp.floor)}</div>
                      </div>
                    </div>

                    <div className="small text-muted mb-4 d-flex flex-wrap gap-3">
                      {selectedProp.warehouse_type && <span><i className="bi bi-box-seam me-1"></i>Loại kho: <strong className="text-body">{selectedProp.warehouse_type}</strong></span>}
                      <span><i className="bi bi-calendar-event me-1"></i>Tạo: <strong className="text-body">{formatDateTimeVi(selectedProp.createdAt)}</strong></span>
                      {selectedProp.updatedAt && (
                        <span><i className="bi bi-pencil-square me-1"></i>Cập nhật: <strong className="text-body">{formatDateTimeVi(selectedProp.updatedAt)}</strong></span>
                      )}
                    </div>

                    <h6 className="fw-bold mb-3 border-bottom pb-2">Đặc điểm Bất động sản</h6>
                    <div className="row mb-4">
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Loại BĐS:</span> <span className="fw-semibold ms-2">{selectedProp.propertyType || '—'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Tình trạng:</span> <span className="fw-semibold ms-2">{selectedProp.condition || '—'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Hướng:</span> <span className="fw-semibold ms-2">{selectedProp.direction || '—'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Nguồn hàng:</span> <span className="fw-semibold ms-2">{selectedProp.source || '—'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Nội thất:</span> <span className="fw-semibold ms-2">{selectedProp.furniture || '—'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Pháp lý:</span> <span className="fw-semibold ms-2 text-success"><i className="bi bi-shield-check me-1"></i>{selectedProp.legalStatus || '—'}</span>
                      </div>
                      {(selectedProp.houseNumber || selectedProp.street) && (
                        <div className="col-12 mb-2">
                          <span className="text-muted small">Số nhà / Đường:</span>{' '}
                          <span className="fw-semibold ms-2">
                            {[selectedProp.houseNumber, selectedProp.street].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <h6 className="fw-bold mb-3 border-bottom pb-2">Mô tả</h6>
                    <div className="mb-4 small text-body" style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedProp.description?.trim() || '—'}
                    </div>

                    <h6 className="fw-bold mb-3 border-bottom pb-2">Ảnh & hồ sơ đính kèm</h6>
                    {Array.isArray(selectedProp.images) && selectedProp.images.length > 0 ? (
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        {selectedProp.images.map((src, i) => (
                          <a
                            key={`att-${i}`}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="border rounded overflow-hidden bg-light"
                            style={{ width: 112, height: 80 }}
                            title="Mở ảnh"
                          >
                            <img src={src} alt="" className="w-100 h-100 object-fit-cover" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="small text-muted mb-3">Chưa có ảnh trong dữ liệu tài sản — đang dùng ảnh minh họa ở banner.</p>
                    )}
                    <div className="d-flex gap-3 mb-4 flex-wrap">
                      <div className="p-2 border rounded bg-light d-flex align-items-center gap-2" style={{ width: '180px' }}>
                        <i className="bi bi-file-earmark-pdf-fill text-danger fs-4"></i>
                        <div className="small text-truncate">Giấy chứng nhận (demo)</div>
                      </div>
                      <div className="p-2 border rounded bg-light d-flex align-items-center gap-2" style={{ width: '180px' }}>
                        <i className="bi bi-info-circle text-secondary fs-4"></i>
                        <div className="small">File pháp lý đầy đủ sẽ nối API lưu trữ</div>
                      </div>
                    </div>
                  </div>

                  {/* Cột phụ: Giá & Contact Card */}
                  <div className="col-md-4">
                    <div className="card border-0 bg-primary bg-opacity-10 p-3 mb-4 rounded-4">
                      <div className="text-muted small mb-1">Giá chào bán</div>
                      <div className="h3 fw-bold text-primary mb-0">{displayPrice(selectedProp)}</div>
                      {pricePerSqmLabel(selectedProp) && (
                        <div className="small text-muted">{pricePerSqmLabel(selectedProp)}</div>
                      )}
                    </div>

                    <div className="card border p-3 rounded-4 shadow-sm">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <img src={`https://ui-avatars.com/api/?name=${selectedProp.createdBy}&background=random`} 
                          alt="Avatar" className="rounded-circle" style={{ width: '45px', height: '45px' }} />
                        <div>
                          <div className="fw-bold small">{selectedProp.createdBy || 'Nguyễn Văn A'}</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>Chuyên viên Đầu chủ</div>
                        </div>
                      </div>
                      <div className="d-grid gap-2">
                        <button className="btn btn-outline-primary btn-sm"><i className="bi bi-telephone me-2"></i>0908 494 ***</button>
                        <button className="btn btn-primary btn-sm fw-bold"><i className="bi bi-chat-dots me-2"></i>Chat qua Zalo</button>
                      </div>
                    </div>
                  </div>
                </div>

                {activeTab === 'pending' ? (
                  <div className="mt-4 border-top pt-4 d-flex gap-3 justify-content-center flex-wrap">
                    {isPendingPropertyUpdate(selectedProp) ? (
                      <>
                        <button type="button" className="btn btn-success fw-bold px-5 py-2 shadow-sm rounded-pill" onClick={() => handleApprove('UPDATE')}>
                          <i className="bi bi-check2-all me-2"></i>PHÊ DUYỆT CẬP NHẬT TÀI SẢN
                        </button>
                        <button type="button" className="btn btn-outline-danger fw-bold px-4 py-2 rounded-pill" onClick={() => setShowRejectModal(true)}>
                          <i className="bi bi-x-circle me-2"></i>TỪ CHỐI CẬP NHẬT
                        </button>
                      </>
                    ) : (
                      <>
                        {selectedProp.level1_status === 'Chờ POS duyệt' && (
                          <button type="button" className="btn btn-success fw-bold px-5 py-2 shadow-sm rounded-pill" onClick={() => openWarehouseApproveConfirm('Standard')}>
                            <i className="bi bi-check-circle-fill me-2"></i> PHÊ DUYỆT VÀO KHO CHUẨN
                          </button>
                        )}
                        {selectedProp.level1_status === 'Chờ duyệt đảm bảo' && (
                          <button type="button" className="btn btn-warning fw-bold px-5 py-2 shadow-sm rounded-pill text-dark" onClick={() => openWarehouseApproveConfirm('Guaranteed')}>
                            <i className="bi bi-shield-fill-check me-2"></i> PHÊ DUYỆT ĐẢM BẢO
                          </button>
                        )}
                        <button type="button" className="btn btn-outline-danger fw-bold px-4 py-2 rounded-pill" onClick={() => setShowRejectModal(true)}>
                          <i className="bi bi-x-circle me-2"></i> TỪ CHỐI
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 border-top pt-4">
                    <div className={`alert d-flex align-items-center gap-3 ${selectedProp.level1_status === 'Bị từ chối' ? 'alert-danger' : 'alert-success'} border-0 rounded-4`}>
                      <i className={`bi ${selectedProp.level1_status === 'Bị từ chối' ? 'bi-x-octagon-fill' : 'bi-check-seal-fill'} fs-3`}></i>
                      <div>
                        <strong>Kết quả xử lý: {selectedProp.level1_status}</strong><br/>
                        <small>Thực hiện bởi {selectedProp.approvedBy || selectedProp.rejectedBy || 'GĐ POS'} vào {new Date(selectedProp.approvedAt || selectedProp.rejectedAt || selectedProp.approved_at || selectedProp.rejected_at).toLocaleString()}</small>
                        {selectedProp.rejected_reason && (
                          <div className="mt-2 text-dark opacity-75 small">Lý do: {selectedProp.rejected_reason}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card border-0 shadow-sm h-100 d-flex align-items-center justify-content-center text-muted p-5 bg-light">
              <div className="text-center">
                <i className="bi bi-file-earmark-text display-1 mb-3 opacity-25"></i>
                <h5>Chọn một hồ sơ từ danh sách để xem chi tiết</h5>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal xác nhận duyệt nhập kho */}
      {showApproveModal && selectedProp && pendingApproveType && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div
                className={`modal-header text-white ${pendingApproveType === 'Guaranteed' ? 'bg-warning' : 'bg-success'}`}
              >
                <h5 className="modal-title fw-bold">
                  <i className={`bi ${pendingApproveType === 'Guaranteed' ? 'bi-shield-fill-check' : 'bi-check-circle-fill'} me-2`} />
                  Xác nhận phê duyệt nhập kho
                </h5>
                <button
                  type="button"
                  className={`btn-close ${pendingApproveType === 'Guaranteed' ? '' : 'btn-close-white'}`}
                  onClick={closeWarehouseApproveConfirm}
                  disabled={approveSubmitting}
                />
              </div>
              <div className="modal-body p-4">
                <p className="mb-3">
                  Bạn có chắc muốn phê duyệt tài sản vào{' '}
                  <strong>
                    {pendingApproveType === 'Guaranteed' ? 'Kho Đảm bảo' : 'Kho Chuẩn'}
                  </strong>
                  ? Hành động này sẽ gửi thông báo tới Đầu chủ và ghi Audit Log.
                </p>
                <ul className="list-unstyled small mb-0 bg-light rounded-3 p-3">
                  <li className="mb-2">
                    <span className="text-muted">Mã tài sản:</span>{' '}
                    <strong className="text-primary">{formatPropertyId(selectedProp.propertyCode || selectedProp.id)}</strong>
                  </li>
                  <li className="mb-2">
                    <span className="text-muted">Địa chỉ:</span> {selectedProp.address || '—'}
                  </li>
                  <li className="mb-2">
                    <span className="text-muted">Đầu chủ:</span> {selectedProp.createdBy || '—'}
                  </li>
                  <li>
                    <span className="text-muted">Giá chào:</span> {displayPrice(selectedProp)}
                  </li>
                </ul>
              </div>
              <div className="modal-footer bg-light border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeWarehouseApproveConfirm}
                  disabled={approveSubmitting}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className={`btn fw-bold px-4 ${pendingApproveType === 'Guaranteed' ? 'btn-warning text-dark' : 'btn-success'}`}
                  onClick={confirmWarehouseApprove}
                  disabled={approveSubmitting}
                >
                  {approveSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Đang xử lý…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle me-1" />
                      Xác nhận phê duyệt
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Từ chối */}
      {showRejectModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title fw-bold">
                  {selectedProp && isPendingPropertyUpdate(selectedProp)
                    ? `Từ chối phê duyệt cập nhật — ${formatPropertyId(selectedProp.propertyCode || selectedProp.id)}`
                    : `Từ chối hồ sơ ${formatPropertyId(selectedProp.propertyCode || selectedProp?.id)}`}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowRejectModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <label className="form-label fw-bold">Lý do từ chối <span className="text-danger">*</span></label>
                <textarea className="form-control" rows="5" placeholder="Vui lòng nhập lý do chi tiết (tối thiểu 10 ký tự)..."
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                ></textarea>
                <div className="text-end mt-2 small text-muted">
                  {rejectReason.length}/500 ký tự
                </div>
              </div>
              <div className="modal-footer bg-light border-0">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>Hủy</button>
                <button type="button" className="btn btn-danger fw-bold px-4" onClick={handleReject}>Xác nhận Từ chối</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AppToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default Feature3_Approval;
