import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import SmartAddress from '../components/SmartAddress';
import { DEFAULT_PROVINCE } from '../data/hcmAdminUnits';

function Feature2_Create() {
  const navigate = useNavigate();

  const [address, setAddress] = useState({
    province: DEFAULT_PROVINCE,
    district: '',
    ward: '',
    futureWard: '',
    houseNumber: '',
    street: '',
  });

  const [formData, setFormData] = useState({
    type: 'Bán',
    propertyType: 'Căn hộ chung cư',
    area: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    description: '',
    legalStatus: 'Sổ đỏ',
  });

  const [dupStatus, setDupStatus] = useState(null); // null | 'checking' | {dup} | 'clear'
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [dupInfo, setDupInfo] = useState(null);

  const fullAddress = [address.houseNumber, address.street && `đường ${address.street}`,
    address.ward, address.district, address.province].filter(Boolean).join(', ');

  // Check trùng khi blur khỏi số nhà + đường
  const handleBlurDupCheck = async () => {
    if (formData.type !== 'Bán' || !address.houseNumber || !address.street) return;
    setDupStatus('checking');
    try {
      const res = await axios.get('http://localhost:5000/properties');
      const q = `${address.houseNumber} ${address.street}`.toLowerCase();
      const dups = res.data.filter(p =>
        p.type === 'Bán' && p.address && p.address.toLowerCase().includes(q)
      );
      if (dups.length > 0) {
        setDupInfo(dups[0]);
        setDupStatus('dup');
        setShowDuplicateModal(true);
      } else {
        setDupStatus('clear');
      }
    } catch {
      setDupStatus(null);
    }
  };

  const handleContinueToBranch = (e) => {
    e.preventDefault();
    if (!address.district || !address.ward || !address.houseNumber || !address.street) {
      alert('Vui lòng điền đầy đủ thông tin địa chỉ (Quận, Phường, Số nhà, Tên đường)');
      return;
    }
    if (!formData.area || !formData.price) {
      alert('Vui lòng điền Diện tích và Giá (ERR-F2-001)');
      return;
    }
    setShowBranchModal(true);
  };

  const handleSubmitBranch = async () => {
    if (!selectedBranch) return;
    let lv1Status = '';
    if (selectedBranch === 1) lv1Status = 'Chờ KH ký';
    else if (selectedBranch === 2) lv1Status = 'Chờ duyệt đảm bảo';
    else if (selectedBranch === 3) lv1Status = 'Chờ POS duyệt';

    const res = await axios.get('http://localhost:5000/properties');
    const newId = `LS-${String(res.data.length + 1).padStart(5, '0')}`;

    await axios.post('http://localhost:5000/properties', {
      id: newId,
      address: fullAddress,
      futureWard: address.futureWard || null,
      district: address.district,
      ward: address.ward,
      type: formData.type,
      propertyType: formData.propertyType,
      price: Number(formData.price),
      area: Number(formData.area),
      bedrooms: Number(formData.bedrooms) || 0,
      bathrooms: Number(formData.bathrooms) || 0,
      legalStatus: formData.legalStatus,
      description: formData.description,
      statusLv1: lv1Status,
      statusLv2: 'Chưa niêm yết',
      createdAt: new Date().toISOString(),
    });

    alert(`✅ Thành công! Đã tạo mã ${newId} và gửi vào nhánh duyệt.`);
    navigate('/dashboard');
  };

  const dupIconClass = dupStatus === 'checking'
    ? 'text-warning' : dupStatus === 'dup'
    ? 'text-danger' : dupStatus === 'clear'
    ? 'text-success' : 'd-none';

  return (
    <div className="container-fluid p-4">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><a href="/dashboard">Kho hàng</a></li>
          <li className="breadcrumb-item active">Tạo Hồ sơ Tài sản (F2)</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold m-0">Khởi tạo Hồ sơ Tài sản</h3>
          <small className="text-muted">FR2-001 • Chuyên viên Đầu chủ thực hiện</small>
        </div>
        <span className="badge bg-secondary fs-6">Trạng thái: Mới</span>
      </div>

      <form onSubmit={handleContinueToBranch}>
        <div className="row">
          {/* Cột trái */}
          <div className="col-md-8">

            {/* Section 1: Loại giao dịch */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-tags-fill text-primary me-2"></i>1. Loại hình Giao dịch
              </h5>
              <div className="d-flex gap-4">
                {['Bán', 'Thuê'].map(t => (
                  <div className="form-check" key={t}>
                    <input className="form-check-input" type="radio" name="gdType"
                      id={`gd${t}`} value={t}
                      checked={formData.type === t}
                      onChange={e => {
                        setFormData({ ...formData, type: e.target.value });
                        setDupStatus(null);
                      }} />
                    <label className="form-check-label" htmlFor={`gd${t}`}>
                      {t === 'Bán' ? '🏷️ Mua Bán (kiểm tra trùng BR-001)' : '🔑 Cho Thuê'}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Thông tin Địa chỉ (SmartAddress) */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-geo-alt-fill text-danger me-2"></i>2. Vị trí Bất động sản
              </h5>

              <SmartAddress
                value={address}
                onChange={(newAddr) => {
                  setAddress(newAddr);
                  setDupStatus(null);
                }}
              />

              {/* Inline duplicate check indicator */}
              <div className="mt-2" onBlur={handleBlurDupCheck}>
                {dupStatus === 'checking' && (
                  <div className="alert alert-warning py-2 px-3">
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Đang kiểm tra trùng địa chỉ...
                  </div>
                )}
                {dupStatus === 'clear' && (
                  <div className="alert alert-success py-2 px-3">
                    <i className="bi bi-check-circle-fill me-2"></i>Địa chỉ chưa có trong hệ thống. Bạn có thể tiếp tục.
                  </div>
                )}
                {dupStatus === 'dup' && (
                  <div className="alert alert-danger py-2 px-3">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    Phát hiện địa chỉ trùng lặp! Vui lòng kiểm tra lại.
                    <button type="button" className="btn btn-sm btn-outline-danger ms-3"
                      onClick={() => setShowDuplicateModal(true)}>Xem chi tiết</button>
                  </div>
                )}
              </div>
              <div className="d-flex justify-content-end mt-2">
                <button type="button" className="btn btn-sm btn-outline-primary"
                  onClick={handleBlurDupCheck} disabled={!address.houseNumber || !address.street}>
                  <i className="bi bi-search me-1"></i>Kiểm tra trùng địa chỉ (BR-001)
                </button>
              </div>
            </div>

            {/* Section 3: Thông tin kỹ thuật */}
            <div className="card shadow-sm border-0 mb-4 p-4">
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-building me-2 text-success"></i>3. Thông tin Kỹ thuật & Giá
              </h5>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label small text-muted">Loại BĐS <span className="text-danger">*</span></label>
                  <select className="form-select" value={formData.propertyType}
                    onChange={e => setFormData({ ...formData, propertyType: e.target.value })}>
                    <option>Căn hộ chung cư</option>
                    <option>Nhà phố</option>
                    <option>Đất nền</option>
                    <option>Biệt thự</option>
                    <option>Shophouse</option>
                    <option>Văn phòng</option>
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label small text-muted">Pháp lý <span className="text-danger">*</span></label>
                  <select className="form-select" value={formData.legalStatus}
                    onChange={e => setFormData({ ...formData, legalStatus: e.target.value })}>
                    <option>Sổ đỏ</option>
                    <option>Sổ hồng</option>
                    <option>Hợp đồng mua bán</option>
                    <option>Đang chờ sổ</option>
                  </select>
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small text-muted">Diện tích (m²) <span className="text-danger">*</span></label>
                  <input type="number" className="form-control" min="1" required
                    value={formData.area} onChange={e => setFormData({ ...formData, area: e.target.value })} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small text-muted">Giá (VNĐ) <span className="text-danger">*</span></label>
                  <input type="number" className="form-control" min="0" required
                    value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                  {formData.price && (
                    <div className="form-text text-success">
                      ≈ {(Number(formData.price) / 1e9).toFixed(2)} tỷ VNĐ
                    </div>
                  )}
                </div>
                <div className="col-md-2 mb-3">
                  <label className="form-label small text-muted">Phòng ngủ</label>
                  <input type="number" className="form-control" min="0"
                    value={formData.bedrooms} onChange={e => setFormData({ ...formData, bedrooms: e.target.value })} />
                </div>
                <div className="col-md-2 mb-3">
                  <label className="form-label small text-muted">Phòng tắm</label>
                  <input type="number" className="form-control" min="0"
                    value={formData.bathrooms} onChange={e => setFormData({ ...formData, bathrooms: e.target.value })} />
                </div>
                <div className="col-12 mb-1">
                  <label className="form-label small text-muted">Mô tả chi tiết</label>
                  <textarea className="form-control" rows="3"
                    placeholder="Nhập mô tả thêm về tài sản..."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })} />
                  <div className="form-text text-end">{formData.description.length}/500 ký tự</div>
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: Đính kèm & Actions */}
          <div className="col-md-4">
            <div className="card shadow-sm border-0 mb-4 p-4 sticky-top" style={{ top: 20 }}>
              <h5 className="fw-bold mb-3 border-bottom pb-2">
                <i className="bi bi-paperclip me-2 text-warning"></i>4. Tệp Pháp lý
              </h5>
              <div className="border border-2 border-dashed rounded p-4 text-center bg-light text-muted mb-3">
                <i className="bi bi-cloud-arrow-up fs-2"></i>
                <p className="mt-2 mb-1">Kéo thả file vào đây</p>
                <small>Sổ đỏ, CMND, HĐMG (PDF/JPG, Max 10MB)</small>
              </div>

              {/* Summary card */}
              <div className="card bg-light border-0 p-3 mb-3">
                <div className="small text-muted mb-1">📍 Địa chỉ tạm:</div>
                <div className="small fw-semibold">
                  {fullAddress || <span className="text-muted fst-italic">Chưa nhập địa chỉ</span>}
                </div>
                {address.futureWard && (
                  <div className="small mt-1 text-info">
                    <i className="bi bi-arrow-right me-1"></i>Phường mới: <strong>{address.futureWard}</strong>
                  </div>
                )}
              </div>

              <div className="d-grid gap-2">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={() => alert('Đã lưu nháp! (FR2-010)')}>
                  <i className="bi bi-floppy me-2"></i>Lưu Nháp
                </button>
                <button type="submit" className="btn btn-primary fw-bold">
                  Tiếp tục → Chọn Nhánh Gửi Duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Modal: Cảnh báo trùng lặp (BR-001) */}
      {showDuplicateModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-warning border-2">
              <div className="modal-header bg-warning bg-opacity-10 border-0">
                <h5 className="modal-title fw-bold text-warning-emphasis">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                  Phát hiện địa chỉ có thể trùng lặp (BR-001)
                </h5>
              </div>
              <div className="modal-body">
                <p>Địa chỉ bạn nhập tương đồng với tài sản đang hoạt động trong hệ thống:</p>
                <table className="table table-sm table-bordered">
                  <thead className="table-light">
                    <tr><th>Mã LS-</th><th>POS Sở hữu</th><th>Kho (Lv1)</th><th>Niêm yết (Lv2)</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="fw-bold text-primary">{dupInfo?.id}</td>
                      <td>POS Quận 1 (Khác chi nhánh)</td>
                      <td><span className="badge bg-success">{dupInfo?.statusLv1}</span></td>
                      <td><span className="badge bg-info text-dark">{dupInfo?.statusLv2}</span></td>
                    </tr>
                  </tbody>
                </table>
                <p className="small text-danger fst-italic">
                  * Địa chỉ chi tiết bị ẩn do tài sản thuộc chi nhánh khác (BR-016).
                </p>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={() => { setShowDuplicateModal(false); setDupStatus(null); }}>
                  Quay lại chỉnh sửa
                </button>
                <button type="button" className="btn btn-warning fw-bold"
                  onClick={() => setShowDuplicateModal(false)}>
                  Xác nhận, tiếp tục tạo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chọn nhánh gửi duyệt (FR2-004, FR2-005, FR2-006) */}
      {showBranchModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-diagram-3 me-2"></i>Chọn Nhánh Gửi Duyệt Hồ sơ
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => setShowBranchModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <p className="mb-4 text-center text-muted">
                  Chọn 1 trong 3 nhánh quy trình theo tình trạng Hợp đồng Môi giới (HĐMG)
                </p>
                <div className="row g-3">
                  {[
                    { id: 1, icon: 'bi-pen', color: 'primary', label: 'Gửi KH ký online', desc: 'Hệ thống gửi link eSign qua Zalo. Chờ KH ký mới gửi duyệt tiếp.', badge: 'Kho Chuẩn', badgeColor: 'success' },
                    { id: 2, icon: 'bi-shield-check', color: 'warning', label: 'Gửi duyệt Đảm bảo', desc: 'Cam kết không ký HĐMG. Gửi thẳng lên GĐ POS duyệt ngay.', badge: 'Kho Đảm bảo', badgeColor: 'warning' },
                    { id: 3, icon: 'bi-file-earmark-check', color: 'success', label: 'Gửi (đã ký sẵn)', desc: 'Đã có hợp đồng giấy/online. Đính kèm file HĐMG để gửi duyệt.', badge: 'Kho Chuẩn', badgeColor: 'success' },
                  ].map(b => (
                    <div key={b.id} className="col-md-4">
                      <div
                        className={`card h-100 text-center p-3 border-2 ${selectedBranch === b.id ? `border-${b.color} bg-${b.color} bg-opacity-10` : 'border-light'}`}
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setSelectedBranch(b.id)}
                      >
                        <i className={`bi ${b.icon} fs-1 text-${b.color} mb-2`}></i>
                        <h6 className="fw-bold">{b.label}</h6>
                        <p className="small text-muted mb-3">{b.desc}</p>
                        <span className={`badge bg-${b.badgeColor} ${b.badgeColor === 'warning' ? 'text-dark' : ''}`}>→ {b.badge}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer bg-light border-0">
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowBranchModal(false)}>Hủy</button>
                <button type="button" className="btn btn-primary fw-bold px-4"
                  disabled={!selectedBranch} onClick={handleSubmitBranch}>
                  <i className="bi bi-send me-2"></i>Xác nhận Gửi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Feature2_Create;
