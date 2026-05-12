import { useState, useEffect, useMemo } from 'react';
import { mergePreviewImageUrls } from '../utils/listingWorkflow';

/**
 * Xem trước tin đăng theo layout tham chiếu ihouzz.com (gallery trái — thông tin phải — thuộc tính — nội dung — bản đồ minh họa).
 */
export default function ListingWebsitePreviewModal({
  show,
  onHide,
  title,
  description,
  contactPhone,
  property,
  listing,
  /** Ảnh từ editor (data URL / http) — ưu tiên trên ảnh listing gốc */
  extraImageUrls = [],
}) {
  const [slide, setSlide] = useState(0);

  const imageUrls = useMemo(() => {
    const fromExtra = (extraImageUrls || []).filter((u) => typeof u === 'string' && /^https?:|^data:/i.test(u.trim()));
    const base = mergePreviewImageUrls(listing || {}, property || {}, 1);
    const merged = [...fromExtra, ...base];
    const seen = new Set();
    const out = [];
    for (const u of merged) {
      const k = u.slice(0, 120);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(u);
      }
    }
    return out.length ? out : mergePreviewImageUrls({}, {}, 4);
  }, [listing, property, extraImageUrls]);

  useEffect(() => {
    setSlide(0);
  }, [show, title, imageUrls.length]);

  if (!show) return null;

  const safeSlide = imageUrls.length ? Math.min(slide, imageUrls.length - 1) : 0;
  const main = imageUrls[safeSlide];
  const priceText =
    property?.price_display ||
    (property && Number(property.price || 0).toLocaleString('en-US') + ' ' + (property.priceUnit || 'VNĐ')) ||
    '—';
  const addr = property?.address || '—';
  const pt = property?.propertyType || '—';
  const area = property?.area != null ? `${Number(property.area).toLocaleString('en-US')} m²` : '—';
  const bed = property?.bedrooms != null ? `${property.bedrooms} PN` : '—';
  const typeGd = property?.type || '—';

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(15,23,42,0.75)', zIndex: 2000 }} role="dialog">
      <div className="modal-dialog modal-fullscreen p-2 p-md-3">
        <div className="modal-content border-0 shadow-lg overflow-hidden" style={{ borderRadius: 12, maxHeight: '100%' }}>
          <div
            className="modal-header border-0 py-2 py-md-3 text-white d-flex align-items-center gap-2"
            style={{ background: 'linear-gradient(90deg,#0d47a1,#1565c0)' }}
          >
            <span className="fw-bold fs-5" style={{ letterSpacing: 2 }}>
              iHOUZZ
            </span>
            <span className="small opacity-75 d-none d-md-inline">Xem trước như trên website</span>
            <div className="ms-auto d-flex gap-2 align-items-center">
              <span className="badge bg-light text-primary">Demo preview</span>
              <button type="button" className="btn-close btn-close-white" aria-label="Đóng" onClick={onHide} />
            </div>
          </div>
          <div className="modal-body p-0 overflow-auto" style={{ background: '#fff' }}>
            <div className="border-bottom py-2 px-3 small text-muted d-flex flex-wrap gap-3 d-none d-md-flex" style={{ background: '#fafafa' }}>
              <span>Trang chủ</span>
              <span>Tiện ích</span>
              <span>Tin tức</span>
              <span>Về iHouzz</span>
            </div>

            <div className="container-fluid py-4" style={{ maxWidth: 1140 }}>
              <div className="row g-4 align-items-start">
                <div className="col-lg-6">
                  <div className="position-relative rounded-3 overflow-hidden border bg-dark" style={{ minHeight: 280 }}>
                    {main && (
                      <img src={main} alt="" className="w-100 d-block" style={{ maxHeight: 420, objectFit: 'contain' }} />
                    )}
                    <div
                      className="position-absolute bottom-0 end-0 m-2 px-2 py-1 rounded small text-white"
                      style={{ background: 'rgba(0,0,0,.55)' }}
                    >
                      {imageUrls.length ? `${safeSlide + 1}/${imageUrls.length}` : '0/0'}
                    </div>
                  </div>
                  {imageUrls.length > 1 && (
                    <div className="d-flex gap-2 flex-wrap mt-2">
                      {imageUrls.map((src, i) => (
                        <button
                          key={`${i}-${src.slice(0, 40)}`}
                          type="button"
                          className={`p-0 border rounded overflow-hidden bg-white ${i === safeSlide ? 'border-primary border-3' : 'border-2'}`}
                          style={{ width: 72, height: 54 }}
                          onClick={() => setSlide(i)}
                        >
                          <img src={src} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-lg-6">
                  <div className="d-flex justify-content-end gap-2 mb-2 text-muted small">
                    <span>♡ Lưu</span>
                    <span>⇄ So sánh</span>
                    <span>↗ Chia sẻ</span>
                  </div>
                  <h1 className="h4 fw-bold text-dark mb-2" style={{ lineHeight: 1.35 }}>
                    {title || '—'}
                  </h1>
                  <div className="fs-5 fw-bold text-primary mb-3">Giá: {priceText}</div>
                  <div className="d-flex flex-wrap gap-3 mb-3 text-secondary small">
                    <span>🏢 {pt}</span>
                    <span>📐 {area}</span>
                    <span>🛏 {bed}</span>
                  </div>
                  <div className="row small g-2 mb-3 text-dark">
                    <div className="col-6">
                      <div>
                        <span className="text-muted">Tình trạng:</span> {property?.condition || '—'}
                      </div>
                      <div>
                        <span className="text-muted">Nguồn hàng:</span> {property?.source || '—'}
                      </div>
                    </div>
                    <div className="col-6">
                      <div>
                        <span className="text-muted">Nội thất:</span> {property?.furniture || '—'}
                      </div>
                      <div>
                        <span className="text-muted">Tầng:</span> {property?.floor != null ? property.floor : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="d-flex align-items-start gap-2 text-dark small mb-3">
                    <span className="text-primary">📍</span>
                    <span>{addr}</span>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
                      Gọi ngay
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
                      Đặt lịch
                    </button>
                    <button type="button" className="btn btn-primary btn-sm fw-semibold" disabled>
                      Yêu cầu tư vấn
                    </button>
                  </div>
                  <div className="mt-3 small text-muted">
                    SĐT hiển thị: <strong className="text-dark">{contactPhone || '—'}</strong>
                  </div>
                </div>
              </div>

              <h2 className="h6 fw-bold mt-5 mb-3 border-bottom pb-2">Thuộc tính sản phẩm</h2>
              <div className="row row-cols-1 row-cols-md-3 g-3 small">
                {[
                  ['Hình thức', typeGd],
                  ['Loại hình', pt],
                  ['Hiện trạng', property?.condition || '—'],
                  ['Hướng', property?.direction || '—'],
                  ['Đường trước nhà (m)', property?.road_width != null ? String(property.road_width) : '—'],
                  ['Diện tích xây dựng', area],
                ].map(([k, v]) => (
                  <div key={k} className="col">
                    <div className="p-3 rounded-3 border bg-light h-100">
                      <div className="text-muted text-uppercase" style={{ fontSize: 10 }}>
                        {k}
                      </div>
                      <div className="fw-semibold mt-1">{v}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="h6 fw-bold mt-5 mb-3 border-bottom pb-2">Nội dung</h2>
              <div className="rounded-3 border p-3 bg-white small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                {description || '—'}
              </div>

              <h2 className="h6 fw-bold mt-5 mb-3 border-bottom pb-2">Bản đồ</h2>
              <div
                className="rounded-3 border d-flex align-items-center justify-content-center text-muted small flex-column gap-2"
                style={{ minHeight: 220, background: 'linear-gradient(135deg,#e3f2fd,#eceff1)' }}
              >
                <i className="bi bi-geo-alt fs-2 text-primary" />
                <span>Bản đồ minh họa theo địa chỉ tài sản</span>
                <span className="px-3 text-center">{addr}</span>
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 bg-light">
            <button type="button" className="btn btn-primary" onClick={onHide}>
              Đóng xem trước
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
