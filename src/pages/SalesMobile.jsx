import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SmartAddress from '../components/SmartAddress';
import { DEFAULT_PROVINCE } from '../data/hcmAdminUnits';

/**
 * SalesMobile - Màn hình App Mobile dành cho Chuyên viên Đầu chủ
 * Dùng cùng SmartAddress component với Feature2_Create (Web) để đảm bảo đồng nhất dữ liệu.
 * Tab: Tạo tài sản | Tài sản của tôi
 */
function SalesMobile() {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'myprops'
  const [properties, setProperties] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state - ĐỒNG NHẤT với Feature2_Create
  const [address, setAddress] = useState({
    province: DEFAULT_PROVINCE, district: '', ward: '',
    futureWard: '', houseNumber: '', street: '',
  });
  const [formData, setFormData] = useState({
    type: 'Bán', propertyType: 'Căn hộ chung cư',
    area: '', price: '', bedrooms: '', bathrooms: '',
    description: '', legalStatus: 'Sổ đỏ',
  });
  const [dupAlert, setDupAlert] = useState(null); // null | 'dup' | 'clear'
  const [dupInfo, setDupInfo] = useState(null);

  // Listing form state
  const [listingForm, setListingForm] = useState(null);
  const [listingTitle, setListingTitle] = useState('');
  const [listingDesc, setListingDesc] = useState('');

  // Unlist state
  const [unlistTarget, setUnlistTarget] = useState(null);
  const [unlistReason, setUnlistReason] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const res = await axios.get('http://localhost:5000/properties');
    setProperties(res.data);
  };

  const logAudit = async (action, entityId) => {
    await axios.post('http://localhost:5000/logs', {
      timestamp: new Date().toISOString(), action, entityId, user: 'Đầu chủ (Mobile)'
    });
  };

  const fullAddress = [address.houseNumber, address.street && `đường ${address.street}`,
    address.ward, address.district, address.province].filter(Boolean).join(', ');

  const handleDupCheck = async () => {
    if (formData.type !== 'Bán' || !address.houseNumber || !address.street) return;
    const res = await axios.get('http://localhost:5000/properties');
    const q = `${address.houseNumber} ${address.street}`.toLowerCase();
    const dups = res.data.filter(p => p.type === 'Bán' && p.address?.toLowerCase().includes(q));
    if (dups.length > 0) { setDupAlert('dup'); setDupInfo(dups[0]); }
    else { setDupAlert('clear'); }
  };

  const handleCreateProp = async (e) => {
    e.preventDefault();
    if (!address.district || !address.ward || !address.houseNumber || !address.street) {
      alert('Vui lòng điền đầy đủ địa chỉ (Quận, Phường, Số nhà, Tên đường)');
      return;
    }
    if (dupAlert === 'dup') {
      if (!window.confirm(`⚠️ Địa chỉ này có thể trùng với ${dupInfo?.id}. Bạn có muốn tiếp tục không?`)) return;
    }
    setSubmitting(true);
    try {
      const res = await axios.get('http://localhost:5000/properties');
      const newId = `LS-${String(res.data.length + 1).padStart(5, '0')}`;
      await axios.post('http://localhost:5000/properties', {
        id: newId, address: fullAddress,
        futureWard: address.futureWard || null,
        district: address.district, ward: address.ward,
        type: formData.type, propertyType: formData.propertyType,
        price: Number(formData.price), area: Number(formData.area),
        bedrooms: Number(formData.bedrooms) || 0,
        bathrooms: Number(formData.bathrooms) || 0,
        legalStatus: formData.legalStatus,
        description: formData.description,
        statusLv1: 'Chờ POS duyệt', statusLv2: 'Chưa niêm yết',
        createdAt: new Date().toISOString(),
      });
      await logAudit('Tạo tài sản mới (Mobile)', newId);
      alert(`✅ Đã gửi duyệt nhập kho: ${newId}`);
      setAddress({ province: DEFAULT_PROVINCE, district: '', ward: '', futureWard: '', houseNumber: '', street: '' });
      setFormData({ type: 'Bán', propertyType: 'Căn hộ chung cư', area: '', price: '', bedrooms: '', bathrooms: '', description: '', legalStatus: 'Sổ đỏ' });
      setDupAlert(null);
      setActiveTab('myprops');
      fetchData();
    } finally { setSubmitting(false); }
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    if (!listingTitle.trim()) { alert('Vui lòng nhập tiêu đề tin đăng'); return; }
    const updated = { ...listingForm, statusLv2: 'Chờ MKT duyệt', listingTitle, listingDesc };
    await axios.put(`http://localhost:5000/properties/${listingForm.id}`, updated);
    await logAudit('Gửi duyệt tin đăng (Mobile F4)', listingForm.id);
    alert('✅ Đã gửi MKT duyệt tin!');
    setListingForm(null); setListingTitle(''); setListingDesc('');
    fetchData();
  };

  const handleRequestUnlist = async () => {
    if (!unlistReason) { alert('❌ Bắt buộc chọn lý do gỡ tin! (BR-005)'); return; }
    const p = unlistTarget;
    await axios.put(`http://localhost:5000/properties/${p.id}`, { ...p, statusLv2: `Yêu cầu gỡ: ${unlistReason}` });
    await logAudit(`Yêu cầu gỡ tin: ${unlistReason}`, p.id);
    alert('✅ Đã gửi yêu cầu gỡ tin!');
    setUnlistTarget(null); setUnlistReason('');
    fetchData();
  };

  const handleRemoveSource = async (p) => {
    if (p.statusLv2 === 'Đang niêm yết') {
      alert('❌ Tài sản đang niêm yết! Phải gỡ tin trước (BR-010)'); return;
    }
    if (!window.confirm('⚠️ Yêu cầu Gỡ Nguồn sẽ gửi đến GĐ POS duyệt. Xác nhận?')) return;
    await axios.put(`http://localhost:5000/properties/${p.id}`, { ...p, statusLv1: 'Chờ duyệt gỡ nguồn' });
    await logAudit('Yêu cầu gỡ nguồn (Mobile F8)', p.id);
    alert('✅ Đã gửi yêu cầu gỡ nguồn!');
    fetchData();
  };

  const statusBadge = (lv1, lv2) => {
    const colorMap = {
      'Chờ POS duyệt': 'warning', 'Được duyệt': 'success', 'Từ chối': 'danger',
      'Chờ KH ký': 'info', 'Đã gỡ nguồn': 'secondary', 'Chờ duyệt gỡ nguồn': 'danger',
    };
    const colorMap2 = {
      'Chưa niêm yết': 'secondary', 'Chờ MKT duyệt': 'info',
      'Đang niêm yết': 'success', 'Đã gỡ': 'dark',
    };
    return (
      <div className="d-flex flex-column gap-1 align-items-end">
        <span className={`badge bg-${colorMap[lv1] || 'secondary'}`}>{lv1}</span>
        <span className={`badge bg-${colorMap2[lv2] || 'secondary'}`}>{lv2}</span>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }} className="p-3 pb-5">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="fw-bold m-0"><i className="bi bi-phone-fill text-primary me-2"></i>App Đầu Chủ</h5>
          <small className="text-muted">iHouzz Internal System</small>
        </div>
        <span className="badge bg-primary">F2 · F4 · F6 · F8</span>
      </div>

      {/* Tab bar */}
      <div className="btn-group w-100 mb-4" role="group">
        <button className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setActiveTab('create')}>
          <i className="bi bi-plus-circle me-1"></i>Tạo Tài sản
        </button>
        <button className={`btn ${activeTab === 'myprops' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => { setActiveTab('myprops'); fetchData(); }}>
          <i className="bi bi-building me-1"></i>Tài sản của tôi
          <span className="badge bg-white text-primary ms-2">{properties.length}</span>
        </button>
      </div>

      {/* TAB: Tạo tài sản */}
      {activeTab === 'create' && !listingForm && (
        <form onSubmit={handleCreateProp}>
          {/* Loại giao dịch */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-2"><i className="bi bi-tags-fill text-primary me-2"></i>Loại Giao Dịch</h6>
            <div className="d-flex gap-3">
              {['Bán', 'Thuê'].map(t => (
                <div className="form-check" key={t}>
                  <input className="form-check-input" type="radio" name="mob_gdType"
                    id={`mob_gd${t}`} value={t} checked={formData.type === t}
                    onChange={e => { setFormData({ ...formData, type: e.target.value }); setDupAlert(null); }} />
                  <label className="form-check-label small" htmlFor={`mob_gd${t}`}>
                    {t === 'Bán' ? '🏷️ Mua Bán' : '🔑 Cho Thuê'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* SmartAddress - compact mode */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-3"><i className="bi bi-geo-alt-fill text-danger me-2"></i>Địa Chỉ Tài Sản</h6>
            <SmartAddress value={address} onChange={newAddr => { setAddress(newAddr); setDupAlert(null); }} compact={true} />
            <button type="button" className="btn btn-sm btn-outline-primary mt-2 w-100"
              onClick={handleDupCheck} disabled={!address.houseNumber || !address.street}>
              <i className="bi bi-search me-1"></i>Kiểm tra trùng địa chỉ
            </button>
            {dupAlert === 'clear' && <div className="alert alert-success py-1 px-2 mt-2 small"><i className="bi bi-check-circle-fill me-1"></i>Địa chỉ chưa có trong hệ thống</div>}
            {dupAlert === 'dup' && <div className="alert alert-warning py-1 px-2 mt-2 small"><i className="bi bi-exclamation-triangle-fill me-1"></i>Có thể trùng với {dupInfo?.id}. Vẫn có thể tiếp tục.</div>}
          </div>

          {/* Thông tin kỹ thuật */}
          <div className="card border-0 shadow-sm p-3 mb-3">
            <h6 className="fw-bold mb-2"><i className="bi bi-building me-2 text-success"></i>Thông Tin Kỹ Thuật</h6>
            <div className="mb-2">
              <label className="form-label small text-muted">Loại BĐS</label>
              <select className="form-select form-select-sm" value={formData.propertyType}
                onChange={e => setFormData({ ...formData, propertyType: e.target.value })}>
                <option>Căn hộ chung cư</option><option>Nhà phố</option>
                <option>Đất nền</option><option>Biệt thự</option><option>Shophouse</option>
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label small text-muted">Pháp lý</label>
              <select className="form-select form-select-sm" value={formData.legalStatus}
                onChange={e => setFormData({ ...formData, legalStatus: e.target.value })}>
                <option>Sổ đỏ</option><option>Sổ hồng</option><option>Hợp đồng mua bán</option><option>Đang chờ sổ</option>
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label small text-muted">Diện tích (m²) *</label>
                <input type="number" className="form-control form-control-sm" required min="1"
                  placeholder="VD: 60" value={formData.area}
                  onChange={e => setFormData({ ...formData, area: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Giá (VNĐ) *</label>
                <input type="number" className="form-control form-control-sm" required min="0"
                  placeholder="VD: 3500000000" value={formData.price}
                  onChange={e => setFormData({ ...formData, price: e.target.value })} />
                {formData.price && <div className="form-text text-success">{(Number(formData.price) / 1e9).toFixed(2)} tỷ</div>}
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Phòng ngủ</label>
                <input type="number" className="form-control form-control-sm" min="0"
                  value={formData.bedrooms} onChange={e => setFormData({ ...formData, bedrooms: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small text-muted">Phòng tắm</label>
                <input type="number" className="form-control form-control-sm" min="0"
                  value={formData.bathrooms} onChange={e => setFormData({ ...formData, bathrooms: e.target.value })} />
              </div>
            </div>
            <textarea className="form-control form-control-sm" rows="2"
              placeholder="Mô tả thêm..." value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={submitting}>
            {submitting ? <><span className="spinner-border spinner-border-sm me-2"></span>Đang gửi...</> :
              <><i className="bi bi-send me-2"></i>Gửi Duyệt Nhập Kho</>}
          </button>
        </form>
      )}

      {/* Soạn Tin Đăng (F4) - Mobile */}
      {activeTab === 'create' && listingForm && (
        <div className="card border-info border-2 p-3 mb-3">
          <h6 className="fw-bold text-info mb-3"><i className="bi bi-megaphone me-2"></i>Soạn Tin Đăng (F4)</h6>
          <form onSubmit={handleCreateListing}>
            <div className="alert alert-info py-2 px-2 small mb-3">
              <i className="bi bi-lightning-charge-fill me-1"></i>Auto-fill từ <strong>{listingForm.id}</strong>
            </div>
            <input className="form-control form-control-sm mb-2" disabled value={listingForm.address} />
            <input className="form-control form-control-sm mb-2" disabled
              value={`${listingForm.propertyType || ''} • ${listingForm.area}m² • ${Number(listingForm.price).toLocaleString()} VNĐ`} />
            <div className="mb-2">
              <label className="form-label small text-muted">Tiêu đề tin đăng *</label>
              <input className="form-control form-control-sm" required maxLength={100}
                placeholder="VD: Bán căn hộ 2PN view sông đẹp, full nội thất..."
                value={listingTitle} onChange={e => setListingTitle(e.target.value)} />
              <div className="form-text text-end">{listingTitle.length}/100</div>
            </div>
            <div className="mb-3">
              <label className="form-label small text-muted">Mô tả tin đăng</label>
              <textarea className="form-control form-control-sm" rows="3"
                placeholder="Mô tả chi tiết thu hút người mua..."
                value={listingDesc} onChange={e => setListingDesc(e.target.value)} />
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm flex-fill"
                onClick={() => { setListingForm(null); setListingTitle(''); setListingDesc(''); }}>Hủy</button>
              <button type="submit" className="btn btn-info text-white btn-sm flex-fill fw-bold">
                <i className="bi bi-send me-1"></i>Gửi MKT Duyệt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB: Tài sản của tôi */}
      {activeTab === 'myprops' && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold m-0">Tài sản của tôi</h6>
            <button className="btn btn-sm btn-outline-primary" onClick={fetchData}>
              <i className="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          {properties.length === 0 && <div className="text-center text-muted py-5">Chưa có tài sản nào</div>}
          {properties.slice().reverse().map(p => (
            <div key={p.id} className="card shadow-sm border-0 mb-3 p-3">
              <div className="d-flex justify-content-between mb-2">
                <span className="fw-bold text-primary">{p.id}</span>
                {statusBadge(p.statusLv1, p.statusLv2)}
              </div>
              <div className="small text-muted mb-1">{p.address}</div>
              {p.futureWard && <div className="small text-info mb-1"><i className="bi bi-map me-1"></i>P.mới: {p.futureWard}</div>}
              <div className="small text-muted mb-2">{p.propertyType} • {p.area}m² • {Number(p.price).toLocaleString()} VNĐ</div>

              <div className="d-flex flex-column gap-2">
                {p.statusLv1 === 'Được duyệt' && p.statusLv2 === 'Chưa niêm yết' && (
                  <button className="btn btn-outline-info btn-sm"
                    onClick={() => { setListingForm(p); setActiveTab('create'); }}>
                    <i className="bi bi-megaphone me-1"></i>Soạn Tin Đăng (F4)
                  </button>
                )}
                {p.statusLv2 === 'Đang niêm yết' && (
                  <div>
                    <select className="form-select form-select-sm mb-2"
                      value={unlistTarget?.id === p.id ? unlistReason : ''}
                      onChange={e => { setUnlistTarget(p); setUnlistReason(e.target.value); }}>
                      <option value="">-- Chọn lý do gỡ tin --</option>
                      <option value="Đã bán">Đã bán</option>
                      <option value="Chủ ngưng bán">Chủ ngưng bán</option>
                      <option value="Thẩm định phí">Thẩm định phí</option>
                      <option value="Lý do khác">Lý do khác</option>
                    </select>
                    <button className="btn btn-danger btn-sm w-100"
                      onClick={() => { setUnlistTarget(p); handleRequestUnlist(); }}
                      disabled={!unlistReason || unlistTarget?.id !== p.id}>
                      <i className="bi bi-sign-stop me-1"></i>Gửi Yêu cầu Gỡ Tin (F6)
                    </button>
                  </div>
                )}
                {p.statusLv1 === 'Được duyệt' && p.statusLv2 !== 'Đang niêm yết' && p.statusLv2 !== 'Chờ MKT duyệt' && (
                  <button className="btn btn-outline-danger btn-sm"
                    onClick={() => handleRemoveSource(p)}>
                    <i className="bi bi-x-octagon me-1"></i>Yêu cầu Gỡ Nguồn (F8 · BR-010)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SalesMobile;
