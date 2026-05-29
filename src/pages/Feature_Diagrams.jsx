import React from 'react';

const DiagramBlock = ({ title, bgClass = 'bg-primary', description, icon }) => (
  <div className="card text-center shadow-sm" style={{ minWidth: '160px', zIndex: 2 }}>
    <div className={`card-header text-white ${bgClass} py-2 d-flex align-items-center justify-content-center gap-2`}>
      {icon && <i className={`bi ${icon}`}></i>}
      <strong>{title}</strong>
    </div>
    {description && (
      <div className="card-body p-2" style={{ fontSize: '0.85rem' }}>
        {description}
      </div>
    )}
  </div>
);

const ArrowH = ({ label }) => (
  <div className="d-flex flex-column align-items-center justify-content-center px-3" style={{ color: '#6c757d' }}>
    {label && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '-5px' }}>{label}</span>}
    <div className="d-flex align-items-center">
      <div style={{ height: '3px', width: '40px', backgroundColor: '#6c757d' }}></div>
      <div style={{
        width: 0, height: 0, 
        borderTop: '6px solid transparent', 
        borderBottom: '6px solid transparent', 
        borderLeft: '10px solid #6c757d'
      }}></div>
    </div>
  </div>
);

const ArrowV = ({ label, reverse = false }) => (
  <div className="d-flex flex-column align-items-center justify-content-center py-2" style={{ color: '#6c757d' }}>
    {!reverse && (
      <div style={{
        width: 0, height: 0, 
        borderLeft: '6px solid transparent', 
        borderRight: '6px solid transparent', 
        borderTop: '10px solid #6c757d'
      }}></div>
    )}
    <div style={{ width: '3px', height: '30px', backgroundColor: '#6c757d' }}></div>
    {reverse && (
      <div style={{
        width: 0, height: 0, 
        borderLeft: '6px solid transparent', 
        borderRight: '6px solid transparent', 
        borderBottom: '10px solid #6c757d'
      }}></div>
    )}
    {label && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', marginTop: '2px' }}>{label}</span>}
  </div>
);


export default function Feature_Diagrams() {
  return (
    <div className="p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div className="mb-4">
        <h2 className="text-primary mb-1">
          <i className="bi bi-diagram-3 me-2"></i>Sơ Đồ Hệ Thống
        </h2>
        <p className="text-muted">Biểu diễn vòng đời trạng thái của Kho Tài sản và Tin đăng trên hệ thống iHouzz.</p>
      </div>

      <div className="row g-4">
        {/* Vòng đời Tài sản (Level 1) */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h5 className="card-title text-success mb-4 border-bottom pb-2">
                <i className="bi bi-box-seam me-2"></i>1. Vòng Đời Kho Tài Sản (Level 1 Status)
              </h5>
              
              <div className="d-flex flex-wrap align-items-center justify-content-center" style={{ overflowX: 'auto', padding: '20px 0' }}>
                <DiagramBlock 
                  title="Mới" 
                  bgClass="bg-secondary" 
                  icon="bi-file-earmark-plus"
                  description="Đầu chủ vừa tạo" 
                />
                <ArrowH label="Gửi duyệt" />
                <DiagramBlock 
                  title="Chờ duyệt" 
                  bgClass="bg-warning text-dark" 
                  icon="bi-hourglass-split"
                  description="GĐ POS đang thẩm định" 
                />
                <ArrowH label="Phê duyệt" />
                
                <div className="d-flex flex-column gap-3">
                  <div className="d-flex align-items-center">
                    <DiagramBlock 
                      title="Được duyệt" 
                      bgClass="bg-success" 
                      icon="bi-check-circle"
                      description="Kho thường (Sale)" 
                    />
                    <ArrowH label="Gỡ nguồn" />
                    <DiagramBlock 
                      title="Gỡ nguồn" 
                      bgClass="bg-danger" 
                      icon="bi-x-octagon"
                      description="Hủy tài sản" 
                    />
                  </div>
                  <div className="d-flex align-items-center">
                    <DiagramBlock 
                      title="Được đảm bảo" 
                      bgClass="bg-info text-dark" 
                      icon="bi-shield-check"
                      description="Độc quyền (O2O)" 
                    />
                    <ArrowH label="Gỡ nguồn" />
                    <DiagramBlock 
                      title="Gỡ nguồn" 
                      bgClass="bg-danger" 
                      icon="bi-x-octagon"
                      description="Hủy tài sản" 
                    />
                  </div>
                </div>

              </div>
              <div className="alert alert-light border mt-3 text-muted" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-info-circle me-1"></i> <strong>Lưu ý:</strong> Tài sản chỉ có thể tạo Tin đăng (Level 2) khi đang ở trạng thái <strong>Được duyệt</strong> hoặc <strong>Được đảm bảo</strong>.
              </div>
            </div>
          </div>
        </div>

        {/* Vòng đời Tin đăng (Level 2) */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h5 className="card-title text-primary mb-4 border-bottom pb-2">
                <i className="bi bi-megaphone me-2"></i>2. Vòng Đời Tin Đăng (Level 2 Status)
              </h5>
              
              <div className="d-flex flex-wrap align-items-center justify-content-center" style={{ overflowX: 'auto', padding: '20px 0' }}>
                
                <div className="d-flex flex-column align-items-center">
                  <DiagramBlock 
                    title="Chưa niêm yết" 
                    bgClass="bg-secondary" 
                    icon="bi-dash-circle"
                    description="Mặc định / Gỡ tin" 
                  />
                  <div className="d-flex">
                    <div style={{ width: '50px' }}></div>
                    <ArrowV label="Duyệt cập nhật" reverse={true} />
                  </div>
                  <DiagramBlock 
                    title="Thẩm định phí" 
                    bgClass="bg-warning text-dark" 
                    icon="bi-currency-dollar"
                    description="Xử lý phí mới" 
                  />
                </div>

                <div className="d-flex flex-column align-items-center justify-content-start h-100" style={{ marginTop: '-135px' }}>
                  <ArrowH label="Gửi duyệt" />
                </div>

                <div className="d-flex flex-column align-items-center justify-content-start h-100" style={{ marginTop: '-135px' }}>
                  <DiagramBlock 
                    title="Chờ duyệt" 
                    bgClass="bg-warning text-dark" 
                    icon="bi-hourglass-top"
                    description="MKT / Leader duyệt" 
                  />
                </div>

                <div className="d-flex flex-column align-items-center justify-content-start h-100" style={{ marginTop: '-135px' }}>
                  <ArrowH label="Phê duyệt" />
                </div>

                <div className="d-flex flex-column align-items-center justify-content-start h-100" style={{ marginTop: '-135px' }}>
                  <DiagramBlock 
                    title="Đang niêm yết" 
                    bgClass="bg-success" 
                    icon="bi-broadcast"
                    description="Tin đang public" 
                  />
                </div>

                <div className="d-flex flex-column align-items-center justify-content-start h-100" style={{ marginTop: '-135px' }}>
                  <ArrowH label="Gỡ tin" />
                </div>

                <div className="d-flex flex-column gap-3 mt-4 pt-2">
                  <DiagramBlock 
                    title="Chờ duyệt ngưng" 
                    bgClass="bg-danger" 
                    icon="bi-sign-stop"
                    description="Duyệt tắt tin" 
                  />
                  <DiagramBlock 
                    title="Đã chốt" 
                    bgClass="bg-primary" 
                    icon="bi-award"
                    description="Giao dịch thành công" 
                  />
                </div>

              </div>
              <div className="alert alert-light border mt-3 text-muted" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-lightbulb text-warning me-1"></i> <strong>Tính năng nổi bật:</strong> Hệ thống tự động khóa tính năng cập nhật tài sản khi tin đang <strong>Niêm yết</strong>. Nếu tài sản ở trạng thái <strong>Thẩm định phí</strong>, sau khi duyệt thông tin thay đổi qua Ghi chú, hệ thống sẽ tự động reset về <strong>Chưa niêm yết</strong> để bắt đầu lại luồng đăng tin.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
