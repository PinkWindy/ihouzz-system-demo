import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  UPDATE_REQUEST_PENDING,
  applyApprovedPendingToProperty,
  diffPropertyUpdate,
  estimateJsonBytes,
  replaceDataImageUrlsForSmallPayload,
  propertyHasLiveListingForUpdateLock,
} from '../utils/propertyUpdateWorkflow';

function isPendingPropertyUpdate(p) {
  return p && p.update_request_status === UPDATE_REQUEST_PENDING;
}

function Feature3_Approval() {
  const [properties, setProperties] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history'
  const [selectedProp, setSelectedProp] = useState(null); // Để xem chi tiết
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Lấy thông tin user từ localStorage
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const rawRole = user.role || 'pos_manager';
  const ROLE = rawRole === 'pos' ? 'pos_manager' : rawRole;
  const currentPosName = user.pos_name || '';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('http://localhost:5000/properties');
      setProperties(res.data);
    } catch (error) {
      console.error("Lỗi lấy dữ liệu:", error);
    } finally {
      setLoading(false);
    }
  };

  // Admin thấy tất cả, POS Manager chỉ thấy POS của mình
  const pendingList = properties.filter(p => {
    const isPendingNew = p.level1_status === 'Chờ POS duyệt' || p.level1_status === 'Chờ duyệt đảm bảo';
    const isPendingUpd = isPendingPropertyUpdate(p);
    if (!isPendingNew && !isPendingUpd) return false;
    if (ROLE === 'admin') return true;
    return p.pos_name === currentPosName;
  });

  const historyList = properties.filter(p => {
    const isDone = p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo' || p.level1_status === 'Bị từ chối';
    if (!isDone) return false;
    if (ROLE === 'admin') return true;
    return p.pos_name === currentPosName;
  });

  const handleApprove = async (type) => {
    if (!selectedProp) return;

    if (isPendingPropertyUpdate(selectedProp)) {
      const pending = selectedProp.pending_update_payload;
      if (!pending || typeof pending !== 'object') {
        alert('Thiếu dữ liệu bản cập nhật (pending_update_payload).');
        return;
      }
      try {
        const listingsRes = await axios.get('http://localhost:5000/listings');
        if (propertyHasLiveListingForUpdateLock(selectedProp, listingsRes.data)) {
          alert(
            'Không thể duyệt cập nhật kho: tài sản đang có bài đăng niêm yết (Lv2 Đang niêm yết hoặc tin Đã duyệt). Hãy từ chối yêu cầu này và yêu cầu Đầu chủ gỡ/tạm dừng tin trước.',
          );
          return;
        }
        const changes = diffPropertyUpdate(selectedProp, pending);
        let merged = applyApprovedPendingToProperty(selectedProp, pending);
        if (estimateJsonBytes(merged) > 95000) {
          merged = {
            ...merged,
            images: replaceDataImageUrlsForSmallPayload(merged.images, merged.id),
          };
        }
        await axios.put(`http://localhost:5000/properties/${encodeURIComponent(selectedProp.id)}`, merged);
        await axios.post('http://localhost:5000/logs', {
          entityId: selectedProp.id,
          action: 'F3-Duyệt phê duyệt cập nhật tài sản',
          user: user.name || 'GĐ POS',
          timestamp: new Date().toISOString(),
          approver: user.name || 'GĐ POS',
          approvalKind: 'property_update',
          changedAt: new Date().toISOString(),
          changes,
        });
        await axios.post('http://localhost:5000/notifications', {
          propertyId: selectedProp.id,
          recipient: selectedProp.createdBy,
          message: `GĐ POS đã duyệt cập nhật tài sản ${selectedProp.id}.`,
          type: 'success',
          createdAt: new Date().toISOString(),
          isRead: false,
        });
        alert('✅ Đã phê duyệt cập nhật — dữ liệu tài sản đã được ghi đè.');
        setSelectedProp(null);
        fetchData();
      } catch (error) {
        alert('Lỗi khi phê duyệt cập nhật!');
      }
      return;
    }

    try {
      const updatedStatus = type === 'Standard' ? 'Được duyệt' : 'Được đảm bảo';
      const warehouseType = type === 'Standard' ? 'Kho chuẩn' : 'Kho đảm bảo';

      await axios.patch(`http://localhost:5000/properties/${selectedProp.id}`, {
        level1_status: updatedStatus,
        level2_status: 'Chưa niêm yết',
        warehouse_type: warehouseType,
        approved_at: new Date().toISOString()
      });

      // Ghi log (F11)
      await axios.post('http://localhost:5000/logs', {
        entityId: selectedProp.id,
        action: type === 'Standard' ? 'APPROVE_STANDARD' : 'APPROVE_GUARANTEED',
        user: 'GĐ POS',
        timestamp: new Date().toISOString()
      });

      // Gửi Notification (F3-009)
      await axios.post('http://localhost:5000/notifications', {
        propertyId: selectedProp.id,
        recipient: selectedProp.createdBy,
        message: `Tài sản ${selectedProp.id} đã vào ${type === 'Standard' ? 'Kho Chuẩn' : 'Kho Đảm bảo'}.`,
        type: 'success',
        createdAt: new Date().toISOString(),
        isRead: false
      });

      alert("✅ Đã phê duyệt thành công!");
      setSelectedProp(null);
      fetchData();
    } catch (error) {
      alert("Lỗi khi phê duyệt!");
    }
  };

  const handleReject = async () => {
    if (!selectedProp) return;
    if (rejectReason.length < 10) {
      alert("Lý do từ chối phải ít nhất 10 ký tự (ERR-F3-002)");
      return;
    }

    try {
      if (isPendingPropertyUpdate(selectedProp)) {
        await axios.patch(`http://localhost:5000/properties/${selectedProp.id}`, {
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

        await axios.post('http://localhost:5000/logs', {
          entityId: selectedProp.id,
          action: 'F3-Từ chối phê duyệt cập nhật tài sản',
          user: user.name || 'GĐ POS',
          reason: rejectReason,
          timestamp: new Date().toISOString(),
        });

        await axios.post('http://localhost:5000/notifications', {
          propertyId: selectedProp.id,
          recipient: selectedProp.createdBy,
          message: `Yêu cầu cập nhật ${selectedProp.id} bị từ chối. Dữ liệu tài sản giữ nguyên. Lý do: ${rejectReason}`,
          type: 'danger',
          createdAt: new Date().toISOString(),
          isRead: false,
        });

        alert('❌ Đã từ chối phê duyệt cập nhật — thông tin tài sản không thay đổi.');
        setShowRejectModal(false);
        setRejectReason('');
        setSelectedProp(null);
        fetchData();
        return;
      }

      await axios.patch(`http://localhost:5000/properties/${selectedProp.id}`, {
        level1_status: 'Bị từ chối',
        rejected_reason: rejectReason,
        rejected_at: new Date().toISOString()
      });

      await axios.post('http://localhost:5000/logs', {
        entityId: selectedProp.id,
        action: 'REJECT',
        user: 'GĐ POS',
        reason: rejectReason,
        timestamp: new Date().toISOString()
      });

      // Gửi Notification (F3-009)
      await axios.post('http://localhost:5000/notifications', {
        propertyId: selectedProp.id,
        recipient: selectedProp.createdBy,
        message: `Hồ sơ ${selectedProp.id} bị từ chối. Lý do: ${rejectReason}`,
        type: 'danger',
        createdAt: new Date().toISOString(),
        isRead: false
      });

      alert("❌ Đã từ chối hồ sơ.");
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProp(null);
      fetchData();
    } catch (error) {
      alert("Lỗi khi từ chối!");
    }
  };

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold m-0">Kiểm duyệt & Phê duyệt Nhập kho (F3)</h3>
          <p className="text-muted small mb-0">Actor: Giám đốc POS | Chi nhánh: POS Quận 1</p>
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

      <div className="row">
        {/* Danh sách bên trái */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm overflow-hidden" style={{ height: '75vh' }}>
            <div className="card-header bg-white py-3">
              <input type="text" className="form-control form-control-sm" placeholder="Tìm mã LS-..." />
            </div>
            <div className="list-group list-group-flush overflow-auto">
              {(activeTab === 'pending' ? pendingList : historyList).map(p => (
                <button key={p.id} 
                  className={`list-group-item list-group-item-action p-3 border-start border-4 ${selectedProp?.id === p.id ? 'bg-light border-primary' : 'border-transparent'}`}
                  onClick={() => setSelectedProp(p)}
                >
                  <div className="d-flex justify-content-between mb-1">
                    <span className="fw-bold text-primary">{p.id}</span>
                    <span className="small text-muted">{new Date(p.createdAt).toLocaleDateString()}</span>
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
              {/* Image Gallery Mockup */}
              <div className="position-relative bg-dark" style={{ height: '300px' }}>
                <img src={(selectedProp.images && selectedProp.images[0]) || `https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1000&q=80`}
                  alt="Property" className="w-100 h-100 object-fit-cover opacity-75" />
                <div className="position-absolute bottom-0 start-0 p-4 text-white gradient-overlay w-100">
                  <h4 className="fw-bold mb-1">{selectedProp.id}: {selectedProp.type} {selectedProp.address.split(',')[0]}</h4>
                  <p className="mb-0 opacity-75"><i className="bi bi-geo-alt-fill me-2"></i>{selectedProp.address}</p>
                </div>
                <div className="position-absolute top-0 end-0 p-3 d-flex flex-column gap-1 align-items-end">
                  <span className={`badge ${selectedProp.level1_status?.includes('đảm bảo') ? 'bg-warning text-dark' : 'bg-success'} fs-6 shadow`}>
                    {selectedProp.level1_status}
                  </span>
                  {isPendingPropertyUpdate(selectedProp) && (
                    <span className="badge bg-primary fs-6 shadow">Chờ duyệt cập nhật</span>
                  )}
                </div>
              </div>

              <div className="card-body p-4">
                {isPendingPropertyUpdate(selectedProp) && selectedProp.pending_update_payload && (
                  <div className="alert alert-primary border-0 mb-4">
                    <h6 className="fw-bold mb-2"><i className="bi bi-arrow-left-right me-2"></i>So sánh dữ liệu cập nhật</h6>
                    <div className="row g-3 small">
                      <div className="col-md-6">
                        <div className="fw-semibold text-muted mb-1">Đang lưu</div>
                        <div className="border rounded p-2 bg-light" style={{ maxHeight: 220, overflow: 'auto' }}>
                          <div><span className="text-muted">Địa chỉ:</span> {selectedProp.address}</div>
                          <div><span className="text-muted">Giá:</span> {Number(selectedProp.price).toLocaleString('en-US')} {selectedProp.priceUnit}</div>
                          <div><span className="text-muted">DT:</span> {selectedProp.area} m² · PN/PT: {selectedProp.bedrooms}/{selectedProp.bathrooms}</div>
                          <div><span className="text-muted">Mô tả:</span> {(selectedProp.description || '—').slice(0, 400)}</div>
                          <div className="text-muted mt-1">Ảnh: {(selectedProp.images || []).length}</div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="fw-semibold text-primary mb-1">Đề xuất thay thế</div>
                        <div className="border border-primary rounded p-2 bg-primary bg-opacity-10" style={{ maxHeight: 220, overflow: 'auto' }}>
                          {(() => {
                            const q = selectedProp.pending_update_payload;
                            return (
                              <>
                                <div><span className="text-muted">Địa chỉ:</span> {q.address}</div>
                                <div><span className="text-muted">Giá:</span> {Number(q.price).toLocaleString('en-US')} {q.priceUnit}</div>
                                <div><span className="text-muted">DT:</span> {q.area} m² · PN/PT: {q.bedrooms}/{q.bathrooms}</div>
                                <div><span className="text-muted">Mô tả:</span> {(q.description || '—').slice(0, 400)}</div>
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
                    <div className="d-flex justify-content-between align-items-center mb-4 bg-light p-3 rounded-3">
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Diện tích</div>
                        <div className="fw-bold fs-5">{selectedProp.area} m²</div>
                      </div>
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Phòng ngủ</div>
                        <div className="fw-bold fs-5"><i className="bi bi-door-open me-1"></i>{selectedProp.bedrooms || 2}</div>
                      </div>
                      <div className="text-center px-3 border-end">
                        <div className="text-muted small">Phòng tắm</div>
                        <div className="fw-bold fs-5"><i className="bi bi-water me-1"></i>{selectedProp.bathrooms || 2}</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-muted small">Tầng</div>
                        <div className="fw-bold fs-5">{selectedProp.floor || 'Trệt'}</div>
                      </div>
                    </div>

                    <h6 className="fw-bold mb-3 border-bottom pb-2">Đặc điểm Bất động sản</h6>
                    <div className="row mb-4">
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Tình trạng:</span> <span className="fw-semibold ms-2">{selectedProp.condition || 'N/A'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Hướng:</span> <span className="fw-semibold ms-2">{selectedProp.direction || 'N/A'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Nguồn hàng:</span> <span className="fw-semibold ms-2">{selectedProp.source || 'N/A'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Nội thất:</span> <span className="fw-semibold ms-2">{selectedProp.furniture || 'N/A'}</span>
                      </div>
                      <div className="col-6 mb-2">
                        <span className="text-muted small">Pháp lý:</span> <span className="fw-semibold ms-2 text-success"><i className="bi bi-shield-check me-1"></i>{selectedProp.legalStatus || 'Sổ hồng riêng'}</span>
                      </div>
                    </div>

                    <h6 className="fw-bold mb-3 border-bottom pb-2">Hồ sơ đính kèm (Pháp lý)</h6>
                    <div className="d-flex gap-3 mb-4">
                      <div className="p-2 border rounded bg-light d-flex align-items-center gap-2 cursor-pointer hover-shadow" style={{ width: '180px' }}>
                        <i className="bi bi-file-earmark-pdf-fill text-danger fs-4"></i>
                        <div className="small text-truncate">Giấy chứng nhận.pdf</div>
                      </div>
                      <div className="p-2 border rounded bg-light d-flex align-items-center gap-2 cursor-pointer hover-shadow" style={{ width: '180px' }}>
                        <i className="bi bi-file-earmark-image-fill text-primary fs-4"></i>
                        <div className="small text-truncate">Ảnh thực tế_01.jpg</div>
                      </div>
                    </div>
                  </div>

                  {/* Cột phụ: Giá & Contact Card */}
                  <div className="col-md-4">
                    <div className="card border-0 bg-primary bg-opacity-10 p-3 mb-4 rounded-4">
                      <div className="text-muted small mb-1">Giá chào bán</div>
                      <div className="h3 fw-bold text-primary mb-0">{Number(selectedProp.price).toLocaleString('en-US')} {selectedProp.priceUnit || 'VNĐ'}</div>
                      <div className="small text-muted">~ {((Number(selectedProp.price) / selectedProp.area) / (selectedProp.priceUnit === 'tỷ VNĐ' ? 0.001 : 1000000)).toFixed(1)} triệu/m²</div>
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
                          <button type="button" className="btn btn-success fw-bold px-5 py-2 shadow-sm rounded-pill" onClick={() => handleApprove('Standard')}>
                            <i className="bi bi-check-circle-fill me-2"></i> PHÊ DUYỆT VÀO KHO CHUẨN
                          </button>
                        )}
                        {selectedProp.level1_status === 'Chờ duyệt đảm bảo' && (
                          <button type="button" className="btn btn-warning fw-bold px-5 py-2 shadow-sm rounded-pill" onClick={() => handleApprove('Guaranteed')}>
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
                        <small>Thực hiện bởi GĐ POS vào {new Date(selectedProp.approved_at || selectedProp.rejected_at).toLocaleString()}</small>
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

      {/* Modal Từ chối */}
      {showRejectModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title fw-bold">
                  {selectedProp && isPendingPropertyUpdate(selectedProp)
                    ? `Từ chối phê duyệt cập nhật — ${selectedProp.id}`
                    : `Từ chối hồ sơ ${selectedProp?.id}`}
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
    </div>
  );
}

export default Feature3_Approval;
