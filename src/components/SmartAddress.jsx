import React, { useState, useEffect, useRef } from 'react';
import { HCM_DISTRICTS, HCM_STREETS, DEFAULT_PROVINCE } from '../data/hcmAdminUnits';
import { FUTURE_WARDS_HCM } from '../data/futureWards';

/**
 * SmartAddress Component
 * Dùng chung cho Web (Feature2_Create) và Mobile (SalesMobile)
 * Props:
 *   value: { province, district, ward, futureWard, houseNumber, street }
 *   onChange: (newValue) => void
 *   compact: boolean (true = Mobile layout, false = Web layout)
 */
function SmartAddress({ value = {}, onChange, compact = false }) {
  const {
    province = DEFAULT_PROVINCE,
    district = '',
    ward = '',
    futureWard = '',
    houseNumber = '',
    street = '',
  } = value;

  const [wardOptions, setWardOptions] = useState([]);
  const [streetSuggestions, setStreetSuggestions] = useState([]);
  const [futureSuggestions, setFutureSuggestions] = useState([]);
  const [showStreetDrop, setShowStreetDrop] = useState(false);
  const [showFutureDrop, setShowFutureDrop] = useState(false);
  const streetRef = useRef(null);
  const futureRef = useRef(null);

  // Khi district thay đổi -> load phường tương ứng
  useEffect(() => {
    if (district) {
      const found = HCM_DISTRICTS.find(d => d.name === district);
      setWardOptions(found ? found.wards : []);
      onChange({ ...value, district, ward: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district]);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handleClick = (e) => {
      if (streetRef.current && !streetRef.current.contains(e.target)) setShowStreetDrop(false);
      if (futureRef.current && !futureRef.current.contains(e.target)) setShowFutureDrop(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (field, val) => {
    onChange({ ...value, [field]: val });
  };

  const handleStreetInput = (val) => {
    handleChange('street', val);
    if (val.length >= 2) {
      const q = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const filtered = HCM_STREETS.filter(s =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
      ).slice(0, 8);
      setStreetSuggestions(filtered);
      setShowStreetDrop(filtered.length > 0);
    } else {
      setShowStreetDrop(false);
    }
  };

  const handleFutureInput = (val) => {
    handleChange('futureWard', val);
    if (val.length >= 1) {
      const q = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const filtered = FUTURE_WARDS_HCM.filter(w =>
        w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
      ).slice(0, 8);
      setFutureSuggestions(filtered);
      setShowFutureDrop(filtered.length > 0);
    } else {
      setShowFutureDrop(false);
    }
  };

  const gridClass = compact ? '' : 'row';
  const colClass = compact ? 'mb-3' : 'col-md-6 mb-3';
  const col4Class = compact ? 'mb-3' : 'col-md-4 mb-3';

  return (
    <div>
      {/* Tỉnh/TP (cố định) */}
      <div className={compact ? 'mb-3' : 'row mb-3'}>
        <div className={compact ? '' : 'col-md-4'}>
          <label className="form-label small fw-semibold text-muted">
            Tỉnh / Thành phố <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className="form-control bg-light"
            value={province}
            readOnly
            title="Hệ thống hiện chỉ hỗ trợ TP. Hồ Chí Minh"
          />
          <div className="form-text">
            <i className="bi bi-lock-fill me-1 text-secondary"></i>
            Mặc định TP. Hồ Chí Minh (Phase 1)
          </div>
        </div>

        {/* Quận/Huyện */}
        <div className={compact ? 'mt-3' : 'col-md-4'}>
          <label className="form-label small fw-semibold text-muted">
            Quận / Huyện <span className="text-danger">*</span>
          </label>
          <select
            className="form-select"
            value={district}
            onChange={e => {
              const found = HCM_DISTRICTS.find(d => d.name === e.target.value);
              setWardOptions(found ? found.wards : []);
              onChange({ ...value, district: e.target.value, ward: '' });
            }}
            required
          >
            <option value="">-- Chọn Quận/Huyện --</option>
            {HCM_DISTRICTS.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Phường/Xã */}
        <div className={compact ? 'mt-3' : 'col-md-4'}>
          <label className="form-label small fw-semibold text-muted">
            Phường / Xã (hiện hành) <span className="text-danger">*</span>
          </label>
          <select
            className="form-select"
            value={ward}
            onChange={e => handleChange('ward', e.target.value)}
            disabled={!district}
            required
          >
            <option value="">
              {district ? '-- Chọn Phường/Xã --' : '-- Chọn Quận trước --'}
            </option>
            {wardOptions.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          {!district && (
            <div className="form-text text-warning">
              <i className="bi bi-arrow-up me-1"></i>Chọn Quận/Huyện để mở danh sách
            </div>
          )}
        </div>
      </div>

      {/* Phường mới sau sáp nhập */}
      <div className="mb-3" ref={futureRef} style={{ position: 'relative' }}>
        <label className="form-label small fw-semibold text-muted">
          Phường / Xã mới (sau sáp nhập)
          <span className="badge bg-info text-dark ms-2 fs-tiny">Tùy chọn</span>
        </label>
        <div className="input-group">
          <span className="input-group-text bg-info bg-opacity-10 border-info">
            <i className="bi bi-map text-info"></i>
          </span>
          <input
            type="text"
            className="form-control"
            placeholder="Gõ tên phường mới để tìm kiếm..."
            value={futureWard}
            onChange={e => handleFutureInput(e.target.value)}
            onFocus={() => futureWard.length >= 1 && setShowFutureDrop(true)}
            autoComplete="off"
          />
          {futureWard && (
            <button className="btn btn-outline-secondary" type="button"
              onClick={() => { handleChange('futureWard', ''); setShowFutureDrop(false); }}>
              <i className="bi bi-x"></i>
            </button>
          )}
        </div>
        <div className="form-text">
          <i className="bi bi-info-circle me-1 text-info"></i>
          Ghi nhận theo quy hoạch sáp nhập hành chính mới nhất của Chính phủ.
        </div>
        {showFutureDrop && (
          <ul className="list-group shadow" style={{
            position: 'absolute', zIndex: 1050, width: '100%', maxHeight: 220, overflowY: 'auto'
          }}>
            {futureSuggestions.map(s => (
              <li key={s} className="list-group-item list-group-item-action py-2"
                style={{ cursor: 'pointer' }}
                onMouseDown={() => {
                  handleChange('futureWard', s);
                  setShowFutureDrop(false);
                }}>
                <i className="bi bi-geo-alt-fill text-info me-2"></i>{s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Số nhà + Tên đường */}
      <div className={gridClass}>
        <div className={col4Class}>
          <label className="form-label small fw-semibold text-muted">
            Số nhà <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className="form-control"
            placeholder="VD: 23, 15A, 7/2"
            value={houseNumber}
            onChange={e => handleChange('houseNumber', e.target.value)}
            required
          />
        </div>

        <div className={compact ? 'mb-3' : 'col-md-8 mb-3'} ref={streetRef} style={{ position: 'relative' }}>
          <label className="form-label small fw-semibold text-muted">
            Tên đường <span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">
              <i className="bi bi-signpost-2"></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Gõ tên đường, hệ thống sẽ gợi ý..."
              value={street}
              onChange={e => handleStreetInput(e.target.value)}
              onFocus={() => street.length >= 2 && setShowStreetDrop(true)}
              autoComplete="off"
              required
            />
          </div>
          {showStreetDrop && (
            <ul className="list-group shadow" style={{
              position: 'absolute', zIndex: 1050, width: '100%', maxHeight: 220, overflowY: 'auto'
            }}>
              {streetSuggestions.map(s => (
                <li key={s} className="list-group-item list-group-item-action py-2"
                  style={{ cursor: 'pointer' }}
                  onMouseDown={() => {
                    handleChange('street', s);
                    setShowStreetDrop(false);
                  }}>
                  <i className="bi bi-signpost text-secondary me-2"></i>{s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Preview địa chỉ tự build */}
      {(houseNumber || street || ward || district) && (
        <div className="alert alert-success py-2 px-3 mt-1 d-flex align-items-center gap-2">
          <i className="bi bi-pin-map-fill text-success"></i>
          <small>
            <strong>Địa chỉ đầy đủ: </strong>
            {[houseNumber, street && `đường ${street}`, ward, district, province]
              .filter(Boolean).join(', ')}
          </small>
        </div>
      )}
    </div>
  );
}

export default SmartAddress;
