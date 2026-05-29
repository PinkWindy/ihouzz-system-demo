import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="ih-landing">
      <div className="ih-landing-card text-center">
        <div className="ih-landing-badge">
          <i className="bi bi-layers-fill" aria-hidden />
          Bản demo nội bộ iHouzz
        </div>
        <h1 className="h2 fw-bold mb-2 text-primary">iHouzz</h1>
        <p className="text-muted mb-4 lh-base" style={{ maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
          Bản mô phỏng nghiệp vụ nội bộ — đăng nhập MFA, kho tài sản, niêm yết, quản trị người dùng và nhật ký thao tác.
        </p>

        <p className="small text-secondary mb-4 px-1">
          Luồng chuẩn bắt đầu từ <strong>Đăng nhập &amp; xác thực MFA</strong>. Dùng tài khoản demo (vd.{' '}
          <code className="user-select-all">admin@ihouzz.com</code>, mật khẩu <code>123456</code>, OTP <code>111111</code>).
        </p>

        <Link to="/login" className="btn btn-primary btn-lg w-100 fw-semibold">
          Vào đăng nhập
        </Link>

        <p className="small text-muted mt-4 mb-0">Chạy kèm API mock cổng 5000 (json-server).</p>
      </div>
    </div>
  );
}

export default Home;
