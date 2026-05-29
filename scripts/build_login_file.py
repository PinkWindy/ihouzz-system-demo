# -*- coding: utf-8 -*-
from pathlib import Path

out_path = Path(__file__).resolve().parent.parent / "src/pages/Feature1_Login.jsx"

# Full file in one write — logic + UI
content = r'''import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifySessionChanged } from '../utils/listingWorkflow';

const DEMO_OTP = '111111';
const OTP_TTL_SEC = 300;
const RESEND_COOLDOWN_SEC = 60;
const MAX_OTP_ATTEMPTS = 3;

const ERR = {
  ERR1_001: 'Email hoặc mật khẩu không đúng.',
  ERR1_002: 'Tài khoản bị tạm khóa. Vui lòng thử lại sau 30 phút hoặc liên hệ Admin.',
  ERR1_003: 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
  ERR1_004: 'Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
};

const VALID_EMAILS = [
  'admin@ihouzz.com',
  'sales@ihouzz.com',
  'mkt@ihouzz.com',
  'marketing@ihouzz.com',
  'pos@ihouzz.com',
  'pos_manager@ihouzz.com',
  'pos2_manager@ihouzz.com',
  'sales2@ihouzz.com',
  'hungnv@ihouzz.com',
  'anhdv@ihouzz.com',
  'tungtt@ihouzz.com',
];

function Feature1_Login() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(OTP_TTL_SEC);
  const [currentOtp, setCurrentOtp] = useState(DEMO_OTP);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const otpRefs = useRef([]);

  useEffect(() => {
    let timer;
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const resetToLogin = useCallback((message) => {
    setStep(1);
    setOtp(['', '', '', '', '', '']);
    setCountdown(OTP_TTL_SEC);
    setCurrentOtp(DEMO_OTP);
    setOtpAttempts(0);
    setResendCooldown(0);
    if (message) setError(message);
  }, []);

  const startMfaStep = () => {
    setCurrentOtp(DEMO_OTP);
    setOtpAttempts(0);
    setCountdown(OTP_TTL_SEC);
    setOtp(['', '', '', '', '', '']);
    setError('');
    setStep(2);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailNorm = email.trim();
    if (!VALID_EMAILS.includes(emailNorm)) {
      setError('Tài khoản không tồn tại trong hệ thống.');
      return;
    }
    if (password !== '123456') {
      setError(ERR.ERR1_001);
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('http://localhost:5000/users');
      const allUsers = await res.json();
      const matched = allUsers.find((u) => u.email === emailNorm);
      if (matched?.status === 'inactive') {
        setError(ERR.ERR1_003);
        return;
      }
      if (matched?.status === 'locked') {
        setError(ERR.ERR1_002);
        return;
      }
      startMfaStep();
    } catch {
      setError('Không thể kết nối máy chủ. Hãy chắc chắn API đang chạy ở cổng 5000.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOtpChange = (element, index) => {
    const val = element.value.replace(/\D/g, '');
    if (!val) {
      const cleared = [...otp];
      cleared[index] = '';
      setOtp(cleared);
      return;
    }
    const digit = val.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (element.nextSibling && digit) {
      element.nextSibling.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length < 6) return;
    e.preventDefault();
    setOtp(pasted.split(''));
    otpRefs.current[5]?.focus();
  };

  const handleResendOtp = async (e) => {
    e.preventDefault();
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError('');
    await new Promise((r) => setTimeout(r, 400));
    setCurrentOtp(DEMO_OTP);
    setCountdown(OTP_TTL_SEC);
    setOtp(['', '', '', '', '', '']);
    setOtpAttempts(0);
    setResendCooldown(RESEND_COOLDOWN_SEC);
    setResendLoading(false);
    otpRefs.current[0]?.focus();
  };

  const completeLogin = async () => {
    const res = await fetch('http://localhost:5000/users');
    const allUsers = await res.json();
    const emailNorm = email.trim();
    let matchedUser = allUsers.find((u) => u.email === emailNorm);

    if (!matchedUser) {
      let r = emailNorm.split('@')[0];
      if (r === 'mkt' || r === 'marketing') r = 'marketing';
      else if (r.startsWith('pos')) r = 'pos_manager';
      else if (r.startsWith('sales')) r = 'sales';
      else if (r === 'admin') r = 'admin';

      let posName = r === 'admin' || r === 'marketing' ? null : 'POS Q1';
      if (emailNorm.includes('pos2') || emailNorm.includes('sales2')) posName = 'POS Chi Nhánh 2';

      const posIdFallback = posName === 'POS Chi Nhánh 2' ? 3 : posName ? 1 : null;
      matchedUser = {
        id: `u_${r}`,
        name: r === 'marketing' || r === 'mkt' ? 'Nguyễn Thị MKT' : emailNorm.split('@')[0],
        role: r,
        pos_name: posName,
        pos_id: posIdFallback,
        email: emailNorm,
        status: 'active',
      };
    }

    let role = matchedUser.role;
    if (role === 'pos') role = 'pos_manager';
    if (role === 'mkt') role = 'marketing';
    const pidRaw = matchedUser.pos_id;
    const pos_id = pidRaw === '' || pidRaw == null ? null : Number(pidRaw);
    matchedUser = {
      ...matchedUser,
      role,
      pos_id: Number.isNaN(pos_id) ? null : pos_id,
    };

    localStorage.setItem('user', JSON.stringify(matchedUser));
    localStorage.setItem('user_role', role);
    localStorage.setItem('pos_name', matchedUser.pos_name || '');
    notifySessionChanged();
    navigate('/dashboard');
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (countdown <= 0) {
      setError(ERR.ERR1_004);
      return;
    }

    const otpString = otp.join('');
    if (otpString.length < 6) {
      setError('Vui lòng nhập đủ 6 số OTP.');
      return;
    }

    if (otpString !== currentOtp) {
      const nextAttempts = otpAttempts + 1;
      setOtpAttempts(nextAttempts);
      if (nextAttempts >= MAX_OTP_ATTEMPTS) {
        resetToLogin(
          `${ERR.ERR1_004} Bạn đã nhập sai quá ${MAX_OTP_ATTEMPTS} lần. Vui lòng đăng nhập lại từ đầu.`,
        );
        return;
      }
      setError(ERR.ERR1_004);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      return;
    }

    setOtpSubmitting(true);
    try {
      await completeLogin();
    } catch {
      setError('Không thể kết nối máy chủ. Hãy chắc chắn API đang chạy ở cổng 5000.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <motionWrap />
  );
}

export default Feature1_Login;
'''

# Replace placeholder with UI (avoid accidental tag typo in editor)
ui = """
    <motionWrap />
""".strip()
ui = ui.replace("motionWrap", "div")
content = content.replace("    <motionWrap />", ui, 1)
# Fix the multiline ui - build properly
ui = '''    <div
      style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0056b3 0%, #00a2ff 100%)' }}
      className="d-flex align-items-center justify-content-center p-3"
    >
      <motionWrap />
    </motionWrap>'''.replace("motionWrap", "motionWrap")  # noop

# Direct assignment
ui = """    <div
      style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0056b3 0%, #00a2ff 100%)' }}
      className="d-flex align-items-center justify-content-center p-3"
    >
      <div className="card shadow-lg border-0" style={{ maxWidth: '420px', width: '100%', borderRadius: '16px' }}>
        <div className="card-body p-5">
          <motionWrap />
        </motionWrap>
      </motionWrap>
    </motionWrap>"""

T = "div"
ui = f"""    <{T}
      style={{{{ minHeight: '100vh', background: 'linear-gradient(135deg, #0056b3 0%, #00a2ff 100%)' }}}}
      className="d-flex align-items-center justify-content-center p-3"
    >
      <{T} className="card shadow-lg border-0" style={{{{ maxWidth: '420px', width: '100%', borderRadius: '16px' }}}}>
        <{T} className="card-body p-5">
          <{T} className="text-center mb-4">
            <h2 className="fw-bold text-primary mb-1">iHouzz</h2>
            <p className="text-muted small">Hệ thống Quản lý Kho Nội bộ</p>
          </{T}>
          {{error && <{T} className="alert alert-danger py-2 small">{{error}}</{T}>}}
          {{step === 1 && (
            <form onSubmit={{handleLoginSubmit}}>
              <h5 className="fw-bold mb-4">Đăng nhập (F1)</h5>
              <{T} className="mb-3">
                <label className="form-label small text-muted">Email nhân viên</label>
                <input type="email" className="form-control" placeholder="sales@ihouzz.com" required value={{email}} onChange={{(e) => setEmail(e.target.value)}} disabled={{loginLoading}} />
              </{T}>
              <{T} className="mb-3">
                <label className="form-label small text-muted">Mật khẩu (Pass mẫu: 123456)</label>
                <{T} className="input-group">
                  <input type={{showPassword ? 'text' : 'password'}} className="form-control" required value={{password}} onChange={{(e) => setPassword(e.target.value)}} disabled={{loginLoading}} />
                  <button type="button" className="btn btn-outline-secondary" onClick={{() => setShowPassword((v) => !v)}} aria-label={{showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}} tabIndex={{-1}}>{{showPassword ? 'Ẩn' : 'Hiện'}}</button>
                </{T}>
              </{T}>
              <{T} className="mb-4">
                <{T} className="form-check">
                  <input type="checkbox" className="form-check-input" id="remember" disabled={{loginLoading}} />
                  <label className="form-check-label small" htmlFor="remember">Ghi nhớ (7 ngày)</label>
                </{T}>
              </{T}>
              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold" disabled={{loginLoading}}>
                {{loginLoading ? (<><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Đang xử lý…</>) : ('Đăng nhập')}}
              </button>
            </form>
          )}}
          {{step === 2 && (
            <form onSubmit={{handleOtpSubmit}}>
              <h5 className="fw-bold mb-3 text-center">Xác thực OTP (MFA)</h5>
              <p className="text-center small text-muted mb-4">Mã OTP 6 số đã được gửi đến Zalo/Email của bạn.<br />Vui lòng nhập `111111` để tiếp tục.</p>
              <{T} className="d-flex justify-content-center gap-2 mb-4" onPaste={{handleOtpPaste}}>
                {{otp.map((data, index) => (
                  <input key={{index}} ref={{(el) => {{ otpRefs.current[index] = el; }}}} type="text" inputMode="numeric" maxLength="1" className="form-control text-center fw-bold fs-4" style={{{{ width: '45px', height: '55px' }}}} value={{data}} onChange={{(e) => handleOtpChange(e.target, index)}} onFocus={{(e) => e.target.select()}} disabled={{otpSubmitting}} />
                ))}}
              </{T}>
              <{T} className="text-center mb-3">
                <span className={{`fw-bold ${{countdown < 60 ? 'text-danger' : 'text-primary'}}`}}>Hiệu lực: {{formatTime(countdown)}}</span>
              </{T}>
              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold mb-3" disabled={{otpSubmitting}}>
                {{otpSubmitting ? (<><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Đang xác nhận…</>) : ('Xác nhận OTP')}}
              </button>
              <{T} className="text-center mb-3">
                <button type="button" className="btn btn-link btn-sm text-decoration-none p-0" onClick={{handleResendOtp}} disabled={{resendCooldown > 0 || resendLoading || otpSubmitting}}>
                  {{resendLoading ? 'Đang gửi lại…' : resendCooldown > 0 ? `Gửi lại OTP (${{resendCooldown}}s)` : 'Gửi lại OTP'}}
                </button>
              </{T}>
              <{T} className="text-center">
                <button type="button" className="btn btn-link btn-sm text-decoration-none text-muted p-0" onClick={{() => resetToLogin()}} disabled={{otpSubmitting}}>← Quay lại đăng nhập</button>
              </{T}>
            </form>
          )}}
        </{T}>
      </{T}>
    </{T}>"""

content = content.replace("    <motionWrap />", ui)

out_path.write_text(content, encoding="utf-8")
print("ok", out_path, "lines", content.count("\n"))
