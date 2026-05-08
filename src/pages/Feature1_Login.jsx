import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Feature1_Login() {
  const [step, setStep] = useState(1); // 1: Login, 2: OTP
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(300); // 5 phút = 300 giây
  const navigate = useNavigate();

  // Đếm ngược OTP
  useEffect(() => {
    let timer;
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (email === 'admin@ihouzz.com' || email === 'sales@ihouzz.com' || email === 'mkt@ihouzz.com') {
      if (password === '123456') {
        setError('');
        setStep(2); // Chuyển sang bước OTP
      } else {
        setError('Email hoặc mật khẩu không đúng. (ERR-F1-001)');
      }
    } else {
      setError('Tài khoản không tồn tại trong hệ thống.');
    }
  };

  const handleOtpChange = (element, index) => {
    if (isNaN(element.value)) return;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);
    // Auto focus next input
    if (element.nextSibling && element.value) {
      element.nextSibling.focus();
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length < 6) {
      setError('Vui lòng nhập đủ 6 số OTP.');
      return;
    }
    if (otpString === '111111') { // Mock OTP đúng
      // Lưu session (giả lập)
      localStorage.setItem('user_role', email.split('@')[0]);
      alert('✅ Đăng nhập thành công! Chuyển hướng đến Dashboard...');
      navigate('/dashboard');
    } else {
      setError('Mã OTP không hợp lệ. Vui lòng thử nhập: 111111');
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0056b3 0%, #00a2ff 100%)' }} className="d-flex align-items-center justify-content-center p-3">
      <div className="card shadow-lg border-0" style={{ maxWidth: '420px', width: '100%', borderRadius: '16px' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <h2 className="fw-bold text-primary mb-1">iHouzz</h2>
            <p className="text-muted small">Hệ thống Quản lý Kho Nội bộ</p>
          </div>

          {error && <div className="alert alert-danger py-2 small">{error}</div>}

          {step === 1 && (
            <form onSubmit={handleLoginSubmit}>
              <h5 className="fw-bold mb-4">Đăng nhập (F1)</h5>
              <div className="mb-3">
                <label className="form-label small text-muted">Email nhân viên</label>
                <input type="email" className="form-control" placeholder="sales@ihouzz.com" required 
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label small text-muted">Mật khẩu (Pass mẫu: 123456)</label>
                <input type="password" className="form-control" required 
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="remember" />
                  <label className="form-check-label small" htmlFor="remember">Ghi nhớ (7 ngày)</label>
                </div>
                <a href="#" className="small text-decoration-none" onClick={() => alert('Demo Quên MK: Gửi link reset (FR1-007)')}>Quên mật khẩu?</a>
              </div>
              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold">Đăng nhập</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleOtpSubmit}>
              <h5 className="fw-bold mb-3 text-center">Xác thực OTP (MFA)</h5>
              <p className="text-center small text-muted mb-4">
                Mã OTP 6 số đã được gửi đến Zalo/Email của bạn.<br/>
                Vui lòng nhập `111111` để tiếp tục.
              </p>
              
              <div className="d-flex justify-content-center gap-2 mb-4">
                {otp.map((data, index) => (
                  <input
                    key={index}
                    type="text"
                    maxLength="1"
                    className="form-control text-center fw-bold fs-4"
                    style={{ width: '45px', height: '55px' }}
                    value={data}
                    onChange={e => handleOtpChange(e.target, index)}
                    onFocus={e => e.target.select()}
                  />
                ))}
              </div>

              <div className="text-center mb-4">
                <span className={`fw-bold ${countdown < 60 ? 'text-danger' : 'text-primary'}`}>
                  Hiệu lực: {formatTime(countdown)}
                </span>
              </div>

              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold mb-3">Xác nhận OTP</button>
              
              <div className="text-center">
                <a href="#" className="small text-decoration-none text-muted" onClick={() => setStep(1)}>
                  <i className="bi bi-arrow-left"></i> Quay lại đăng nhập
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Feature1_Login;
