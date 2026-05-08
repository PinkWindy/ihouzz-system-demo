import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="container text-center mt-5">
      <h1 className="fw-bold mb-4 text-primary">iHouzz Live Demo</h1>
      <p className="lead text-muted mb-5">Hệ thống mô phỏng toàn diện 11 Features theo tài liệu SRS iHouzz.</p>
      
      <div className="card shadow-sm border-0 p-5 mx-auto" style={{ maxWidth: '600px' }}>
        <h4 className="mb-4">Chào mừng đến với iHouzz Demo</h4>
        <p className="mb-4">Luồng nghiệp vụ được bắt đầu từ **Feature 1: Đăng nhập & Xác thực MFA**.<br/>Vui lòng đăng nhập để vào hệ thống.</p>
        <Link to="/login" className="btn btn-primary btn-lg w-100 fw-bold">Bắt đầu quá trình Demo (Go to Login)</Link>
      </div>
    </div>
  );
}

export default Home;
