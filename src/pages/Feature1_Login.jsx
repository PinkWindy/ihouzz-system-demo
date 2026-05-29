import { API_BASE_URL } from '../config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  notifySessionChanged,
  postEntityAudit,
  AUDIT_ACTION_TYPE,
  accountAuditEntityId,
  initAuthSessionActivity,
} from '../utils/listingWorkflow';
import { nextUserIdFromList, normalizeUserId } from '../utils/userId';

const DEMO_OTP = '111111';
const OTP_TTL_SEC = 300;
const RESEND_COOLDOWN_SEC = 60;
const MAX_OTP_ATTEMPTS = 3;
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;
const LOCK_STORAGE_PREFIX = 'ihouzz_login_lock_';
const RESET_REQUESTS_KEY = 'ihouzz_password_reset_requests';

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

/** Ghi audit UC001 — không chặn UI; lỗi mạng chỉ `console.warn`. */
function auditUc001Log(payload) {
  void postEntityAudit(payload).catch((err) => {
    console.warn('[Đăng nhập] POST /logs', err?.message || err);
  });
}

function readLoginLock(emailNorm) {
  if (!emailNorm) return null;
  try {
    const raw = localStorage.getItem(`${LOCK_STORAGE_PREFIX}${emailNorm}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
      localStorage.removeItem(`${LOCK_STORAGE_PREFIX}${emailNorm}`);
      return null;
    }
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return data;
    }
    if (data.failedAttempts) {
      return { failedAttempts: data.failedAttempts, lockedUntil: null };
    }
    return null;
  } catch {
    return null;
  }
}

function writeLoginLock(emailNorm, failedAttempts) {
  const payload = {
    failedAttempts,
    lockedUntil: Date.now() + LOCK_DURATION_MS,
  };
  localStorage.setItem(`${LOCK_STORAGE_PREFIX}${emailNorm}`, JSON.stringify(payload));
  return payload;
}

function clearLoginLock(emailNorm) {
  if (emailNorm) localStorage.removeItem(`${LOCK_STORAGE_PREFIX}${emailNorm}`);
}

function formatLockRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${s.toString().padStart(2, '0')} giây`;
}

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
  const [loginLock, setLoginLock] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
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

  useEffect(() => {
    const emailNorm = email.trim();
    setLoginLock(emailNorm ? readLoginLock(emailNorm) : null);
  }, [email]);

  useEffect(() => {
    if (!loginLock?.lockedUntil) return undefined;
    const tick = setInterval(() => {
      const emailNorm = email.trim();
      const current = readLoginLock(emailNorm);
      setLoginLock(current);
    }, 1000);
    return () => clearInterval(tick);
  }, [email, loginLock?.lockedUntil]);

  const isLoginLocked = Boolean(loginLock?.lockedUntil && Date.now() < loginLock.lockedUntil);

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

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    const emailNorm = email.trim();
    if (!emailNorm) {
      setForgotSuccess('');
      setError('Vui lòng nhập email nhân viên trước khi gửi yêu cầu.');
      setShowForgotModal(false);
      return;
    }
    setForgotSubmitting(true);
    setForgotSuccess('');
    await new Promise((r) => setTimeout(r, 350));
    try {
      const existing = JSON.parse(localStorage.getItem(RESET_REQUESTS_KEY) || '[]');
      existing.push({
        email: emailNorm,
        note: forgotNote.trim(),
        requestedAt: new Date().toISOString(),
        status: 'pending',
      });
      localStorage.setItem(RESET_REQUESTS_KEY, JSON.stringify(existing));
      auditUc001Log({
        action: 'Yêu cầu cấp lại mật khẩu — gửi Admin (phương án B)',
        actionType: AUDIT_ACTION_TYPE.AUTH_PASSWORD_RESET_REQUESTED,
        entityId: accountAuditEntityId(emailNorm),
        user: emailNorm,
        user_id: '',
        detail: forgotNote.trim() || undefined,
      });
      setForgotSuccess(
        'Yêu cầu đã được ghi nhận (demo). Quản trị viên sẽ xử lý và cấp lại mật khẩu qua kênh nội bộ. Không tự đặt lại qua link email.',
      );
      setForgotNote('');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailNorm = email.trim();
    if (!VALID_EMAILS.includes(emailNorm)) {
      setError('Tài khoản không tồn tại trong hệ thống.');
      auditUc001Log({
        action: 'Đăng nhập thất bại — email không thuộc whitelist demo',
        actionType: AUDIT_ACTION_TYPE.AUTH_CREDENTIALS_FAILED,
        entityId: accountAuditEntityId(emailNorm || email),
        user: emailNorm || email.trim() || '—',
        user_id: '',
        reason: 'email_not_whitelisted',
      });
      return;
    }

    const activeLock = readLoginLock(emailNorm);
    if (activeLock?.lockedUntil && Date.now() < activeLock.lockedUntil) {
      setLoginLock(activeLock);
      setError(
        `${ERR.ERR1_002} Còn ${formatLockRemaining(activeLock.lockedUntil - Date.now())}. Hoặc gửi yêu cầu cấp lại mật khẩu cho Admin.`,
      );
      auditUc001Log({
        action: 'Đăng nhập thất bại — tài khoản đang tạm khóa (sai MK 5 lần)',
        actionType: AUDIT_ACTION_TYPE.AUTH_CREDENTIALS_FAILED,
        entityId: accountAuditEntityId(emailNorm),
        user: emailNorm,
        user_id: '',
        detail: 'temporary_password_lockout_active',
      });
      return;
    }

    if (password !== '123456') {
      const prevFails = activeLock?.failedAttempts || 0;
      const nextFails = prevFails + 1;
      if (nextFails >= MAX_PASSWORD_ATTEMPTS) {
        const lock = writeLoginLock(emailNorm, nextFails);
        setLoginLock(lock);
        setError(
          `${ERR.ERR1_002} Bạn đã nhập sai mật khẩu ${MAX_PASSWORD_ATTEMPTS} lần. Vui lòng liên hệ Admin để được cấp lại mật khẩu.`,
        );
        auditUc001Log({
          action: 'Khóa tạm 30 phút — sai mật khẩu 5 lần liên tiếp',
          actionType: AUDIT_ACTION_TYPE.AUTH_ACCOUNT_TEMP_LOCKED,
          entityId: accountAuditEntityId(emailNorm),
          user: emailNorm,
          user_id: '',
          new_status: 'temp_locked_30m',
        });
      } else {
        const left = MAX_PASSWORD_ATTEMPTS - nextFails;
        localStorage.setItem(`${LOCK_STORAGE_PREFIX}${emailNorm}`, JSON.stringify({ failedAttempts: nextFails }));
        setError(`${ERR.ERR1_001} (Còn ${left} lần thử trước khi tài khoản bị tạm khóa.)`);
        auditUc001Log({
          action: `Sai mật khẩu (lần ${nextFails}/${MAX_PASSWORD_ATTEMPTS})`,
          actionType: AUDIT_ACTION_TYPE.AUTH_CREDENTIALS_FAILED,
          entityId: accountAuditEntityId(emailNorm),
          user: emailNorm,
          user_id: '',
          extra: { failedAttempts: nextFails, maxAttempts: MAX_PASSWORD_ATTEMPTS },
        });
      }
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch(`\${API_BASE_URL}/users`);
      const allUsers = await res.json();
      const matched = allUsers.find((u) => u.email === emailNorm);
      if (matched?.status === 'inactive') {
        setError(ERR.ERR1_003);
        auditUc001Log({
          action: 'Đăng nhập bị chặn — tài khoản inactive',
          actionType: AUDIT_ACTION_TYPE.AUTH_CREDENTIALS_BLOCKED,
          entityId: accountAuditEntityId(emailNorm),
          user: matched?.name || emailNorm,
          user_id: normalizeUserId(matched?.id) ?? '',
          reason: 'inactive',
        });
        return;
      }
      if (matched?.status === 'locked') {
        setError(`${ERR.ERR1_002} Liên hệ quản trị viên để mở khóa tài khoản.`);
        auditUc001Log({
          action: 'Đăng nhập bị chặn — tài khoản locked (Admin)',
          actionType: AUDIT_ACTION_TYPE.AUTH_CREDENTIALS_BLOCKED,
          entityId: accountAuditEntityId(emailNorm),
          user: matched?.name || emailNorm,
          user_id: normalizeUserId(matched?.id) ?? '',
          reason: 'locked_by_admin',
        });
        return;
      }
      const uidPre = normalizeUserId(matched?.id) ?? (matched?.id != null ? String(matched.id) : '');
      auditUc001Log({
        action: 'Bước 1 thành công — tạo thử thách MFA',
        actionType: AUDIT_ACTION_TYPE.AUTH_MFA_CHALLENGE_CREATED,
        entityId: accountAuditEntityId(emailNorm),
        user: matched?.name || emailNorm,
        user_id: uidPre,
      });
      auditUc001Log({
        action: 'OTP đã gửi (mô phỏng kênh Zalo/Email)',
        actionType: AUDIT_ACTION_TYPE.AUTH_OTP_ISSUED,
        entityId: accountAuditEntityId(emailNorm),
        user: matched?.name || emailNorm,
        user_id: uidPre,
        detail: 'demo_placeholder_channel',
      });
      clearLoginLock(emailNorm);
      setLoginLock(null);
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
    auditUc001Log({
      action: 'Gửi lại OTP (cooldown đã hết)',
      actionType: AUDIT_ACTION_TYPE.AUTH_OTP_RESENT,
      entityId: accountAuditEntityId(email.trim()),
      user: email.trim(),
      user_id: '',
    });
    setResendLoading(false);
    otpRefs.current[0]?.focus();
  };

  const completeLogin = async () => {
    const res = await fetch(`\${API_BASE_URL}/users`);
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
      let posIdFallback = posName ? 1 : null;
      if (emailNorm.includes('pos2') || emailNorm.includes('anhdv') || emailNorm.includes('sales2')) {
        posName = 'POS Q.5';
        posIdFallback = 3;
      }
      matchedUser = {
        id: nextUserIdFromList(allUsers),
        name: r === 'marketing' || r === 'mkt' ? 'Nguyễn Thị MKT' : emailNorm.split('@')[0],
        role: r,
        pos_name: posName,
        pos_id: posIdFallback,
        email: emailNorm,
        status: 'active',
      };
    }

    const uid = normalizeUserId(matchedUser.id);
    if (uid != null) matchedUser = { ...matchedUser, id: uid };

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

    const uidNorm = normalizeUserId(matchedUser.id);
    const uidStr =
      uidNorm != null && String(uidNorm).trim() !== ''
        ? String(uidNorm)
        : matchedUser.id != null && matchedUser.id !== ''
          ? String(matchedUser.id)
          : '';

    try {
      await postEntityAudit({
        action: 'MFA xác minh thành công',
        actionType: AUDIT_ACTION_TYPE.AUTH_MFA_VERIFY_SUCCESS,
        entityId: accountAuditEntityId(emailNorm),
        user: matchedUser.name || emailNorm,
        user_id: uidStr,
      });
      await postEntityAudit({
        action: 'Phiên làm việc khởi tạo',
        actionType: AUDIT_ACTION_TYPE.AUTH_SESSION_ESTABLISHED,
        entityId: accountAuditEntityId(emailNorm),
        user: matchedUser.name || emailNorm,
        user_id: uidStr,
        new_status: 'session_active',
        detail: 'demo_session_localStorage',
      });
    } catch (err) {
      console.warn('Audit sau MFA', err);
    }

    initAuthSessionActivity();

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
      auditUc001Log({
        action: 'MFA thất bại — OTP hết hiệu lực (đếm ngược)',
        actionType: AUDIT_ACTION_TYPE.AUTH_MFA_VERIFY_FAILED,
        entityId: accountAuditEntityId(email.trim()),
        user: email.trim(),
        user_id: '',
        reason: 'otp_expired_countdown',
      });
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
      auditUc001Log({
        action: `MFA thất bại — sai OTP (lần ${nextAttempts}/${MAX_OTP_ATTEMPTS})`,
        actionType: AUDIT_ACTION_TYPE.AUTH_MFA_VERIFY_FAILED,
        entityId: accountAuditEntityId(email.trim()),
        user: email.trim(),
        user_id: '',
        reason: 'otp_mismatch',
        extra: { attempt: nextAttempts, maxAttempts: MAX_OTP_ATTEMPTS },
      });
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
    <div className="ih-auth-page">
      <div className="ih-auth-card card border-0 shadow-none">
        <div className="card-body">
          <div className="text-center mb-4">
            <div className="ih-auth-logo" aria-hidden>
              iH
            </div>
            <h1 className="h4 fw-bold text-primary mb-1">iHouzz</h1>
            <p className="text-muted small mb-0">Đăng nhập nội bộ</p>
          </div>

          {error && <div className="alert alert-danger py-2 small">{error}</div>}

          {step === 1 && isLoginLocked && (
            <div className="alert alert-warning py-2 small mb-3">
              <strong>Tài khoản tạm khóa.</strong> Thử lại sau{' '}
              {formatLockRemaining(loginLock.lockedUntil - Date.now())} hoặc gửi yêu cầu cấp lại mật khẩu cho Admin.
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleLoginSubmit}>
              <h2 className="h5 fw-bold mb-4">Đăng nhập</h2>
              <div className="mb-3">
                <label className="form-label small text-muted">Email nhân viên</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="sales@ihouzz.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loginLoading || isLoginLocked}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small text-muted">Mật khẩu (Pass mẫu: 123456)</label>
                <div className="input-group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loginLoading || isLoginLocked}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>
              <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div className="form-check mb-0">
                  <input type="checkbox" className="form-check-input" id="remember" disabled={loginLoading || isLoginLocked} />
                  <label className="form-check-label small" htmlFor="remember">
                    Ghi nhớ (7 ngày)
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none"
                  onClick={() => {
                    setForgotSuccess('');
                    setShowForgotModal(true);
                  }}
                >
                  Quên mật khẩu? Gửi yêu cầu tới Admin
                </button>
              </div>
              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold" disabled={loginLoading || isLoginLocked}>
                {loginLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Đang xử lý…
                  </>
                ) : (
                  'Đăng nhập'
                )}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleOtpSubmit}>
              <h2 className="h5 fw-bold mb-3 text-center">Xác thực OTP (MFA)</h2>
              <p className="text-center small text-muted mb-4">
                Mã OTP 6 số đã được gửi đến Zalo/Email của bạn.
                <br />
                Demo: nhập <code className="user-select-all">111111</code> để tiếp tục.
              </p>

              <div className="d-flex justify-content-center gap-2 mb-4" onPaste={handleOtpPaste}>
                {otp.map((data, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength="1"
                    className="form-control text-center fw-bold fs-4"
                    style={{ width: '45px', height: '55px' }}
                    value={data}
                    onChange={(e) => handleOtpChange(e.target, index)}
                    onFocus={(e) => e.target.select()}
                    disabled={otpSubmitting}
                  />
                ))}
              </div>

              <div className="text-center mb-3">
                <span className={`fw-bold ${countdown < 60 ? 'text-danger' : 'text-primary'}`}>
                  Hiệu lực: {formatTime(countdown)}
                </span>
              </div>

              <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold mb-3" disabled={otpSubmitting}>
                {otpSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Đang xác nhận…
                  </>
                ) : (
                  'Xác nhận OTP'
                )}
              </button>

              <div className="text-center mb-3">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-decoration-none p-0"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resendLoading || otpSubmitting}
                >
                  {resendLoading ? 'Đang gửi lại…' : resendCooldown > 0 ? `Gửi lại OTP (${resendCooldown}s)` : 'Gửi lại OTP'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-decoration-none text-muted p-0"
                  onClick={() => resetToLogin()}
                  disabled={otpSubmitting}
                >
                  ← Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showForgotModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleForgotRequest}>
                <div className="modal-header">
                  <h5 className="modal-title">Yêu cầu cấp lại mật khẩu (Admin)</h5>
                  <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setShowForgotModal(false)} />
                </div>
                <div className="modal-body">
                  <p className="small text-muted">
                    Hệ thống nội bộ iHouzz <strong>không</strong> tự gửi link đặt lại mật khẩu. Mật khẩu trùng email công ty —
                    Quản trị viên sẽ xác minh và cấp lại qua kênh nội bộ.
                  </p>
                  <div className="mb-3">
                    <label className="form-label small">Email nhân viên</label>
                    <input type="email" className="form-control" value={email} readOnly />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small">Ghi chú (tùy chọn)</label>
                    <textarea className="form-control" rows={2} placeholder="VD: Quên mật khẩu sau khi đổi máy..." value={forgotNote} onChange={(e) => setForgotNote(e.target.value)} />
                  </div>
                  {forgotSuccess && <div className="alert alert-success py-2 small mb-0">{forgotSuccess}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowForgotModal(false)}>Đóng</button>
                  <button type="submit" className="btn btn-primary" disabled={forgotSubmitting}>{forgotSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Feature1_Login;
