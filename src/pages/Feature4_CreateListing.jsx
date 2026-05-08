import { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

const STATUS_COLOR = {
  'Được duyệt': 'success',
  'Được đảm bảo': 'warning',
  'Chờ POS duyệt': 'secondary',
  'Bị từ chối': 'danger',
  'Đã gỡ nguồn': 'dark',
  'Chờ duyệt đảm bảo': 'info',
};

const WAREHOUSE_BADGE = {
  'Kho chuẩn': { bg: '#0d6efd', icon: '🏢' },
  'Kho đảm bảo': { bg: '#fd7e14', icon: '🛡️' },
};

export default function Feature4_CreateListing() {
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState(null);
  const [step, setStep] = useState('select'); // select | form | preview | success
  const [form, setForm] = useState({ title: '', description: '', contact_phone: '', images: [] });
  const [filterType, setFilterType] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadProperties(); }, []);

  const loadProperties = async () => {
    const res = await fetch(`${API}/properties`);
    const data = await res.json();
    setProperties(data);
  };

  const eligible = properties.filter(p =>
    (p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo') &&
    p.level2_status === 'Chưa niêm yết' &&
    (filterType === 'all' || p.type === filterType) &&
    (search === '' || p.address.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
  );

  const ineligible = properties.filter(p =>
    !(p.level1_status === 'Được duyệt' || p.level1_status === 'Được đảm bảo') ||
    p.level2_status !== 'Chưa niêm yết'
  );

  const autoFill = (prop) => {
    setSelectedProp(prop);
    const typeLabel = prop.type === 'Bán' ? 'Bán' : 'Cho thuê';
    const title = `${typeLabel} ${prop.area}m² – ${prop.address.split(',')[0]} – ${prop.bedrooms}PN/${prop.bathrooms}WC`;
    const desc = `🏠 ${prop.type === 'Bán' ? 'Nhà cần bán' : 'Nhà cho thuê'} tại ${prop.address}.\n` +
      `📐 Diện tích: ${prop.area}m²${prop.width ? ` (${prop.width}m x ${prop.length}m)` : ''}\n` +
      `🛏 ${prop.bedrooms} phòng ngủ | 🚿 ${prop.bathrooms} WC\n` +
      `🧭 Hướng: ${prop.direction} | 🛣 Đường trước: ${prop.road_width}\n` +
      `📋 Pháp lý: ${prop.legal}\n` +
      `💰 Giá: ${prop.price_display}`;
    setForm({ title, description: desc, contact_phone: '', images: [] });
    setStep('form');
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.contact_phone.trim()) {
      showToast('Vui lòng điền đầy đủ thông tin bắt buộc!', 'danger'); return;
    }
    setSubmitting(true);
    const listing = {
      property_id: selectedProp.id,
      title: form.title,
      description: form.description,
      contact_phone: form.contact_phone,
      images: form.images.length ? form.images : ['demo_img1.jpg', 'demo_img2.jpg'],
      listing_status: 'Chờ duyệt',
      createdBy: 'Đinh Việt Anh',
      createdBy_id: 'u002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiredAt: null,
    };
    await fetch(`${API}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listing) });
    setSubmitting(false);
    setStep('success');
    showToast('✅ Gửi tin đăng thành công! Đang chờ MKT duyệt.');
  };

  const reset = () => { setStep('select'); setSelectedProp(null); setForm({ title: '', description: '', contact_phone: '', images: [] }); loadProperties(); };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', padding: '24px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-0" style={{ color: '#1a237e' }}>
            <i className="bi bi-megaphone me-2 text-primary"></i>Feature 4 – Soạn Tin Đăng (UC004)
          </h4>
          <small className="text-muted">Thiết lập & Cấu hình Nội dung Niêm yết | Actor: Chuyên viên Đầu chủ</small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-primary px-3 py-2">BR-001: Chỉ SP đã duyệt mới tạo được tin</span>
        </div>
      </div>

      {toast && (
        <div className={`alert alert-${toast.type} alert-dismissible d-flex align-items-center mb-3`} role="alert">
          {toast.msg}
        </div>
      )}

      {/* ─── STEP 1: Chọn tài sản ─── */}
      {step === 'select' && (
        <>
          {/* Stats */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Chờ tạo tin', count: eligible.length, color: '#0d6efd', icon: 'bi-house-check' },
              { label: 'Đang niêm yết', count: properties.filter(p => p.level2_status === 'Đang niêm yết').length, color: '#198754', icon: 'bi-broadcast' },
              { label: 'Chưa đủ điều kiện', count: ineligible.length, color: '#6c757d', icon: 'bi-ban' },
              { label: 'Tổng tài sản', count: properties.length, color: '#6610f2', icon: 'bi-building' },
            ].map((s, i) => (
              <div key={i} className="col-md-3">
                <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid ${s.color}` }}>
                  <div className="card-body d-flex align-items-center gap-3">
                    <i className={`bi ${s.icon} fs-2`} style={{ color: s.color }}></i>
                    <div><div className="fw-bold fs-4" style={{ color: s.color }}>{s.count}</div><div className="text-muted small">{s.label}</div></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body d-flex gap-3 align-items-center flex-wrap">
              <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Tìm mã LS- hoặc địa chỉ..." value={search} onChange={e => setSearch(e.target.value)} />
              <div className="btn-group">
                {['all', 'Bán', 'Thuê'].map(t => (
                  <button key={t} className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFilterType(t)}>
                    {t === 'all' ? 'Tất cả' : t}
                  </button>
                ))}
              </div>
              <span className="ms-auto text-muted small">{eligible.length} tài sản sẵn sàng tạo tin</span>
            </div>
          </div>

          {/* Eligible Properties */}
          <h6 className="fw-bold text-success mb-3"><i className="bi bi-check-circle me-1"></i>Tài sản đủ điều kiện tạo tin ({eligible.length})</h6>
          {eligible.length === 0 && (
            <div className="card border-dashed text-center py-5 mb-4">
              <i className="bi bi-inbox fs-1 text-muted"></i>
              <p className="text-muted mt-2">Không có tài sản nào sẵn sàng.</p>
            </div>
          )}
          <div className="row g-3 mb-4">
            {eligible.map(p => {
              const wb = WAREHOUSE_BADGE[p.warehouse_type] || {};
              return (
                <div key={p.id} className="col-md-6 col-xl-4">
                  <div className="card border-0 shadow-sm h-100 position-relative" style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                    {/* Warehouse badge */}
                    <div className="position-absolute top-0 end-0 m-2">
                      <span className="badge" style={{ background: wb.bg }}>{wb.icon} {p.warehouse_type}</span>
                    </div>
                    <div className="card-body">
                      <div className="d-flex align-items-start gap-2 mb-2">
                        <span className="badge bg-dark">{p.id}</span>
                        <span className={`badge bg-${p.type === 'Bán' ? 'danger' : 'info'}`}>{p.type}</span>
                        <span className={`badge bg-${STATUS_COLOR[p.level1_status]}`}>{p.level1_status}</span>
                      </div>
                      <p className="fw-semibold mb-1" style={{ fontSize: 13 }}>{p.address}</p>
                      <div className="d-flex gap-3 text-muted small mb-2">
                        <span><i className="bi bi-arrows-angle-expand me-1"></i>{p.area}m²</span>
                        <span><i className="bi bi-door-open me-1"></i>{p.bedrooms}PN/{p.bathrooms}WC</span>
                        <span><i className="bi bi-compass me-1"></i>{p.direction}</span>
                      </div>
                      <div className="fw-bold text-primary mb-3">{p.price_display}</div>
                      <div className="text-muted small mb-3">
                        <i className="bi bi-person me-1"></i>{p.createdBy} &nbsp;|&nbsp; <i className="bi bi-building me-1"></i>{p.pos_name}
                      </div>
                      <button className="btn btn-primary btn-sm w-100" onClick={() => autoFill(p)}>
                        <i className="bi bi-magic me-1"></i>Auto-fill & Tạo tin đăng
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ineligible notice */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-light border-0">
              <h6 className="mb-0 text-muted"><i className="bi bi-info-circle me-1"></i>Tài sản chưa đủ điều kiện (BR-001)</h6>
            </div>
            <div className="card-body p-0">
              <table className="table table-hover mb-0 small">
                <thead className="table-light"><tr><th>Mã LS</th><th>Địa chỉ</th><th>Level 1</th><th>Level 2</th><th>Lý do chặn</th></tr></thead>
                <tbody>
                  {ineligible.slice(0, 8).map(p => (
                    <tr key={p.id}>
                      <td><span className="badge bg-dark">{p.id}</span></td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</td>
                      <td><span className={`badge bg-${STATUS_COLOR[p.level1_status] || 'secondary'}`}>{p.level1_status}</span></td>
                      <td><span className="badge bg-light text-dark border">{p.level2_status}</span></td>
                      <td className="text-danger">
                        {p.level2_status === 'Đang niêm yết' ? '⚠️ Đang có tin đăng hoạt động'
                          : p.level1_status === 'Đã gỡ nguồn' ? '🚫 Đã gỡ khỏi kho'
                          : p.level1_status === 'Bị từ chối' ? '❌ GĐ POS từ chối'
                          : p.level1_status === 'Chờ POS duyệt' ? '⏳ Chờ phê duyệt'
                          : '⏳ Chờ phê duyệt'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── STEP 2: Form soạn tin ─── */}
      {step === 'form' && selectedProp && (
        <div className="row g-4">
          {/* Left: Info tài sản */}
          <div className="col-md-4">
            <div className="card border-0 shadow-sm sticky-top" style={{ top: 24 }}>
              <div className="card-header fw-bold border-0" style={{ background: '#e8f4fd' }}>
                <i className="bi bi-info-circle me-1 text-primary"></i>Thông tin tài sản (Auto-fill)
              </div>
              <div className="card-body small">
                <div className="mb-2"><span className="badge bg-dark me-1">{selectedProp.id}</span><span className={`badge bg-${STATUS_COLOR[selectedProp.level1_status]}`}>{selectedProp.level1_status}</span></div>
                <p className="fw-semibold">{selectedProp.address}</p>
                <hr />
                {[
                  ['Loại hình', selectedProp.type],
                  ['Giá', selectedProp.price_display],
                  ['Diện tích', `${selectedProp.area}m²`],
                  ['Kích thước', selectedProp.width ? `${selectedProp.width}m × ${selectedProp.length}m` : 'Chung cư (N/A)'],
                  ['Phòng ngủ', `${selectedProp.bedrooms} PN`],
                  ['WC', `${selectedProp.bathrooms} WC`],
                  ['Hướng nhà', selectedProp.direction],
                  ['Đường trước', selectedProp.road_width],
                  ['Pháp lý', selectedProp.legal],
                  ['POS', selectedProp.pos_name],
                  ['Loại kho', selectedProp.warehouse_type],
                ].map(([k, v]) => (
                  <div key={k} className="d-flex justify-content-between mb-1">
                    <span className="text-muted">{k}:</span>
                    <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{v}</span>
                  </div>
                ))}
                <div className="alert alert-success mt-3 py-2 small">
                  <i className="bi bi-magic me-1"></i><strong>Auto-fill:</strong> Dữ liệu đã tự điền vào form bên phải.
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="col-md-8">
            <div className="card border-0 shadow-sm">
              <div className="card-header fw-bold border-0" style={{ background: '#f8f9fa' }}>
                <i className="bi bi-pencil-square me-1 text-primary"></i>Soạn nội dung tin đăng
                <span className="badge bg-warning text-dark ms-2">Bước 2/3</span>
              </div>
              <div className="card-body">
                {/* Title */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">Tiêu đề tin đăng <span className="text-danger">*</span></label>
                  <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Tiêu đề hiển thị công khai trên iHouzz.com" />
                  <div className="form-text">{form.title.length}/150 ký tự</div>
                </div>

                {/* Description */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">Mô tả chi tiết <span className="text-danger">*</span></label>
                  <textarea className="form-control" rows={8} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  <div className="form-text">{form.description.length}/2000 ký tự (khuyến nghị &gt; 300)</div>
                </div>

                {/* Contact */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">SĐT liên hệ <span className="text-danger">*</span></label>
                  <input className="form-control" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="0901 234 567" />
                </div>

                {/* Images - Demo */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">Hình ảnh / Video</label>
                  <div className="border rounded p-3 bg-light text-center">
                    <i className="bi bi-cloud-upload fs-3 text-muted"></i>
                    <p className="text-muted small mt-1 mb-0">Kéo thả hoặc click để upload (demo: 3 ảnh mặc định sẽ được gắn)</p>
                    <div className="mt-2 d-flex gap-2 justify-content-center">
                      {['🏠', '🛋️', '🌿'].map((e, i) => (
                        <div key={i} className="rounded border d-flex align-items-center justify-content-center" style={{ width: 64, height: 64, background: '#e9ecef', fontSize: 24 }}>{e}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary" onClick={() => setStep('select')}>← Quay lại</button>
                  <button className="btn btn-outline-primary" onClick={() => setStep('preview')}>
                    <i className="bi bi-eye me-1"></i>Xem trước
                  </button>
                  <button className="btn btn-primary ms-auto" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send me-1"></i>}
                    Gửi duyệt MKT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Preview ─── */}
      {step === 'preview' && selectedProp && (
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header fw-bold border-0 bg-info text-white">
                <i className="bi bi-eye me-1"></i>Xem trước bài đăng – Bước 3/3
              </div>
              <div className="card-body">
                <div className="rounded mb-3 d-flex gap-2">
                  {['🏠', '🛋️', '🌿'].map((e, i) => (
                    <div key={i} className="rounded d-flex align-items-center justify-content-center flex-grow-1" style={{ height: 140, background: '#e9ecef', fontSize: 40 }}>{e}</div>
                  ))}
                </div>
                <h5 className="fw-bold">{form.title}</h5>
                <div className="d-flex gap-2 mb-3">
                  <span className="badge bg-primary fs-6">{selectedProp.price_display}</span>
                  <span className="badge bg-light text-dark border">{selectedProp.area}m²</span>
                  <span className="badge bg-light text-dark border">{selectedProp.bedrooms}PN/{selectedProp.bathrooms}WC</span>
                  <span className={`badge bg-${selectedProp.type === 'Bán' ? 'danger' : 'info'}`}>{selectedProp.type}</span>
                </div>
                <pre className="bg-light rounded p-3 small" style={{ whiteSpace: 'pre-wrap' }}>{form.description}</pre>
                <div className="alert alert-light border">📞 <strong>{form.contact_phone}</strong></div>
                <div className="d-flex gap-2 mt-3">
                  <button className="btn btn-outline-secondary" onClick={() => setStep('form')}>← Sửa lại</button>
                  <button className="btn btn-success ms-auto" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send-check me-1"></i>}
                    Xác nhận gửi duyệt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 4: Success ─── */}
      {step === 'success' && (
        <div className="row justify-content-center">
          <div className="col-lg-6 text-center py-5">
            <div style={{ fontSize: 80 }}>✅</div>
            <h4 className="fw-bold mt-3 text-success">Gửi tin đăng thành công!</h4>
            <p className="text-muted">Bài đăng của bạn đã được gửi đến bộ phận <strong>Marketing</strong> để kiểm duyệt.</p>
            <div className="card border-0 shadow-sm text-start p-4 mb-4">
              <div className="fw-semibold mb-2">📋 Thông tin đã gửi:</div>
              <div className="small text-muted"><strong>Tài sản:</strong> {selectedProp?.id} – {selectedProp?.address}</div>
              <div className="small text-muted"><strong>Tiêu đề:</strong> {form.title}</div>
              <div className="small text-muted"><strong>Trạng thái bài đăng:</strong> <span className="badge bg-warning text-dark">Chờ duyệt</span></div>
              <div className="small text-muted"><strong>SRS Reference:</strong> UC004, BR-001, FR4-001 → FR4-007</div>
            </div>
            <div className="d-flex gap-2 justify-content-center">
              <button className="btn btn-primary" onClick={reset}><i className="bi bi-plus me-1"></i>Tạo tin mới</button>
              <a href="/feature5" className="btn btn-success"><i className="bi bi-check2-square me-1"></i>Xem MKT Duyệt (F5)</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
