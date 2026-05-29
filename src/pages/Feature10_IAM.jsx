import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ALL_PERMISSIONS, getPermissions, savePermissions,
  resetPermissions, hasPermission,
} from '../utils/permissions.js';
import { nextUserIdFromList, normalizeUserId, sameUserId } from '../utils/userId.js';
import {
  postEntityAudit,
  AUDIT_ACTION_TYPE,
  readSessionUser,
  accountAuditEntityId,
  API,
  SESSION_CHANGED_EVENT,
} from '../utils/listingWorkflow.js';

/** json-server / proxy có thể trả `{ data: [...] }` thay vì mảng thuần — đồng bộ F7/F9. */
function normalizeJsonList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Shape hiển thị F10 (POS mặc định khi trống — giữ tương thích UI cũ). */
function f10AuthFromUser(u) {
  if (!u || u.role === 'guest') {
    let pn = '';
    try {
      pn = localStorage.getItem('pos_name') || '';
    } catch {
      /* ignore */
    }
    return { role: 'guest', pos_name: pn || 'POS Chi Nhánh 1', name: '' };
  }
  let posExtra = '';
  try {
    posExtra = localStorage.getItem('pos_name') || '';
  } catch {
    /* ignore */
  }
  const posName =
    u.pos_name != null && String(u.pos_name).trim() !== ''
      ? String(u.pos_name)
      : (posExtra || 'POS Chi Nhánh 1');
  return { role: u.role || 'sales', pos_name: posName, name: u.name || '' };
}

const ROLES = ['admin', 'pos_manager', 'sales', 'marketing'];
const ROLE_LABEL = { admin: 'Admin Tổng', pos_manager: 'Giám đốc POS', sales: 'Chuyên viên Đầu chủ', marketing: 'Chuyên viên MKT' };
const ROLE_COLOR = { admin: 'danger', pos_manager: 'warning', sales: 'primary', marketing: 'info' };
const STATUS_COLOR = { active: 'success', locked: 'warning', pending: 'info', inactive: 'danger' };

function statusBadgeClass(bgKey) {
  const k = bgKey || 'secondary';
  if (k === 'light') return 'badge bg-light text-dark border';
  if (k === 'warning') return 'badge bg-warning text-dark';
  return `badge bg-${k}`;
}

function roleBadgeClass(role) {
  return statusBadgeClass(ROLE_COLOR[role] || 'secondary');
}

function userStatusBadgeClass(status) {
  return statusBadgeClass(STATUS_COLOR[status] || 'secondary');
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 mb-3`} style={{ borderRadius: 10 }}>
      <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}></i>
      {toast.msg}
    </div>
  );
}

export default function Feature10_IAM() {
  const [user, setUser] = useState(() => readSessionUser());
  const [permRev, setPermRev] = useState(0);
  const auth = useMemo(() => f10AuthFromUser(user), [user]);
  const { role: ROLE, pos_name: POS_NAME, name: actorName } = auth;

  useEffect(() => {
    const bumpUser = () => setUser(readSessionUser());
    const onStorage = (e) => {
      bumpUser();
      if (!e.key || e.key === 'ihouzz_permissions' || e.key === 'user_role' || e.key === 'pos_name' || e.key === 'user') {
        setPermRev((n) => n + 1);
      }
    };
    const onSession = () => {
      bumpUser();
      setPermRev((n) => n + 1);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, onSession);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, onSession);
    };
  }, []);

  const [users, setUsers] = useState([]);
  const [posList, setPosList] = useState([]);
  const [tab, setTab] = useState('users'); // 'users' | 'pos' | 'perms'
  const [permMatrix, setPermMatrix] = useState(() => getPermissions());
  const [permSaved, setPermSaved] = useState(false);
  useEffect(() => {
    setPermMatrix(getPermissions());
  }, [user, permRev]);
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'lock'|'unlock'|'create'|'pos_detail'|'edit'|'create_pos'|'edit_pos'|'inactive_user'
  const [lockReason, setLockReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', role: 'sales', pos_name: '', email: '', phone: '' });
  const [editUser, setEditUser] = useState(null);
  const [newPos, setNewPos] = useState({ name: '', manager_id: '', manager_name: '', manager_user: null });
  const [editPos, setEditPos] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [uRaw, pRaw] = await Promise.all([
        fetch(`${API}/users`).then((r) => r.json()),
        fetch(`${API}/pos`).then((r) => r.json()).catch(() => []),
      ]);
      setUsers(normalizeJsonList(uRaw));
      setPosList(normalizeJsonList(pRaw));
    } catch {
      setUsers([]);
      setPosList([]);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const resolvePosIdFromName = (posName) => {
    if (!posName || !Array.isArray(posList)) return null;
    const found = posList.find((p) => p.name === posName);
    if (!found) return null;
    const n = Number(found.id);
    return Number.isNaN(n) ? null : n;
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const postLog = async (action, entityId, actionType, extra = {}) => {
    await postEntityAudit({
      action,
      entityId,
      actionType,
      user: user.name || actorName || 'Admin (F10)',
      user_id: user.id ?? '',
      ...extra,
    });
  };

  const handleLock = async () => {
    if (lockReason.trim().length < 10) { showToast('Lý do khóa phải từ 10 ký tự trở lên!', 'danger'); return; }
    setSubmitting(true);
    await fetch(`${API}/users/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'locked', lockReason: lockReason.trim(), lockedAt: new Date().toISOString(), lockedBy: 'Admin Demo' }),
    });
    await postLog(`[F10] Khóa tài khoản · Lý do: ${lockReason.trim()}`, selected.id, AUDIT_ACTION_TYPE.IAM_USER_LOCK, {
      reason: lockReason.trim(),
      old_status: selected.status,
      new_status: 'locked',
    });
    showToast(`🔒 Đã khóa tài khoản "${selected.name}".`);
    setSelected(null); setModalMode(null); setLockReason('');
    setSubmitting(false); loadAll();
  };

  const handleUnlock = async () => {
    setSubmitting(true);
    await fetch(`${API}/users/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', lockReason: null, lockedAt: null, lockedBy: null, unlockedAt: new Date().toISOString() }),
    });
    await postLog(`[F10] Mở khóa/Phục hồi tài khoản`, selected.id, AUDIT_ACTION_TYPE.IAM_USER_UNLOCK, {
      old_status: 'locked',
      new_status: 'active',
    });
    showToast(`🔓 Đã mở khóa tài khoản "${selected.name}".`, 'success');
    setSelected(null); setModalMode(null);
    setSubmitting(false); loadAll();
  };

  const handleInactiveUser = async () => {
    setSubmitting(true);
    await fetch(`${API}/users/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive', inactiveAt: new Date().toISOString() }),
    });
    await postLog(`[F10] Báo nghỉ việc nhân sự`, selected.id, AUDIT_ACTION_TYPE.IAM_USER_INACTIVE, {
      old_status: selected.status,
      new_status: 'inactive',
    });
    showToast(`⚠️ Đã cập nhật tài khoản "${selected.name}" thành Nghỉ việc.`, 'warning');
    setSelected(null); setModalMode(null);
    setSubmitting(false); loadAll();
  };

  const handleActivate = async (u) => {
    await fetch(`${API}/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', activatedAt: new Date().toISOString() }),
    });
    await postLog(`[F10] Kích hoạt tài khoản`, u.id, AUDIT_ACTION_TYPE.IAM_USER_ACTIVATE, {
      new_status: 'active',
    });
    showToast(`✅ Đã kích hoạt tài khoản "${u.name}".`);
    loadAll();
  };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.role) { showToast('Vui lòng điền tên và vai trò!', 'danger'); return; }
    setSubmitting(true);
    const id = nextUserIdFromList(users);
    const pos_id = resolvePosIdFromName(newUser.pos_name);
    await fetch(`${API}/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newUser,
        id,
        pos_id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }),
    });
    await postLog(`[F10] Tạo tài khoản mới: ${newUser.name} (${newUser.role})`, id, AUDIT_ACTION_TYPE.IAM_USER_CREATE, {
      new_status: 'pending',
      detail: `${newUser.name} · ${newUser.role}`,
    });
    showToast(`✅ Đã tạo tài khoản "${newUser.name}". Trạng thái: Chờ kích hoạt.`);
    setNewUser({ name: '', role: 'sales', pos_name: '', email: '', phone: '' });
    setModalMode(null); setSubmitting(false); loadAll();
  };

  const handleEditUser = async () => {
    if (!editUser.name.trim()) { showToast('Tên không được trống!', 'danger'); return; }
    setSubmitting(true);
    const pos_id = resolvePosIdFromName(editUser.pos_name);
    await fetch(`${API}/users/${editUser.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editUser.name,
        role: editUser.role,
        pos_name: editUser.pos_name,
        pos_id,
        email: editUser.email,
        phone: editUser.phone,
      }),
    });
    await postLog(`[F10] Cập nhật tài khoản: ${editUser.name} (${editUser.role})`, editUser.id, AUDIT_ACTION_TYPE.IAM_USER_UPDATE);
    showToast(`✅ Đã cập nhật tài khoản "${editUser.name}".`);
    setModalMode(null); setEditUser(null); setSubmitting(false); loadAll();
  };

  const handleAdminResetPasswordDemo = async () => {
    if (!editUser?.id) return;
    const emailT = String(editUser.email || '').trim();
    if (!emailT) {
      showToast('Cần email nhân viên để ghi audit ACCOUNT:<email>.', 'danger');
      return;
    }
    if (
      !window.confirm(
        'Xác nhận reset mật khẩu theo kịch bản demo (đăng nhập vẫn dùng MK mẫu 123456)? Hệ thống ghi AUTH_PASSWORD_RESET_BY_ADMIN + PATCH metadata user.',
      )
    ) {
      return;
    }
    setSubmitting(true);
    const now = new Date().toISOString();
    try {
      await fetch(`${API}/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_password_reset_at: now, demo_password_note: 'admin_reset_demo' }),
      });
      const adminId = normalizeUserId(user.id) ?? String(user.id ?? '');
      const targetId = normalizeUserId(editUser.id) ?? String(editUser.id ?? '');
      await postEntityAudit({
        action: `Admin cấp lại mật khẩu — ${editUser.name}`,
        actionType: AUDIT_ACTION_TYPE.AUTH_PASSWORD_RESET_BY_ADMIN,
        entityId: accountAuditEntityId(emailT),
        user: user.name || 'Admin',
        user_id: adminId,
        detail: `target_user_id=${targetId}`,
        extra: { target_email: emailT, target_user_id: targetId, admin_user_id: adminId },
      });
      showToast('✅ Đã ghi AUTH_PASSWORD_RESET_BY_ADMIN + cập nhật user.', 'success');
      setModalMode(null);
      setEditUser(null);
      await loadAll();
    } catch {
      showToast('Lỗi PATCH user hoặc audit.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePos = async () => {
    if (!newPos.name.trim()) { showToast('Vui lòng nhập tên POS!', 'danger'); return; }
    if (newPos.manager_id && !newPos.manager_name) { showToast('ID nhân sự không hợp lệ!', 'danger'); return; }
    
    // Cảnh báo luân chuyển
    if (newPos.manager_user && newPos.manager_user.pos_name) {
      const roleText = ROLE_LABEL[newPos.manager_user.role] || newPos.manager_user.role;
      const posText = newPos.manager_user.pos_name;
      const isSure = window.confirm(
        `CẢNH BÁO LUÂN CHUYỂN:\n\nNhân sự "${newPos.manager_name}" hiện đang là [${roleText}] tại chi nhánh [${posText}].\n\nBạn có chắc chắn muốn hủy vị trí cũ và thăng chức người này làm Giám đốc cho POS mới không?`
      );
      if (!isSure) return;
    }
    
    setSubmitting(true);
    const id = `pos_${Date.now()}`;
    await fetch(`${API}/pos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPos.name, manager: newPos.manager_name, id, status: 'active' }),
    });
    
    // Nếu có gán GĐ POS, tiến hành tự động update user đó về POS mới
    if (newPos.manager_id && newPos.manager_name) {
      const user = users.find(u => u.id === newPos.manager_id || u.email === newPos.manager_id);
      if (user) {
        const pos_id = resolvePosIdFromName(newPos.name);
        await fetch(`${API}/users/${user.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pos_name: newPos.name, role: 'pos_manager', pos_id }),
        });
      }
    }

    await postLog(`[F10] Tạo POS mới: ${newPos.name}`, id, AUDIT_ACTION_TYPE.IAM_POS_CREATE, { detail: newPos.name });
    showToast(`✅ Đã tạo POS "${newPos.name}".`);
    setNewPos({ name: '', manager_id: '', manager_name: '', manager_user: null });
    setModalMode(null); setSubmitting(false); loadAll();
  };

  const handleEditPos = async () => {
    if (!editPos.name.trim()) { showToast('Vui lòng nhập tên POS!', 'danger'); return; }
    setSubmitting(true);
    
    // Nếu gán GĐ mới
    if (editPos.manager_id && editPos.manager_name) {
      const user = users.find(u => u.id === editPos.manager_id || u.email === editPos.manager_id);
      if (user && (user.pos_name !== editPos.name || user.role !== 'pos_manager')) {
        const pos_id = resolvePosIdFromName(editPos.name);
        await fetch(`${API}/users/${user.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pos_name: editPos.name, role: 'pos_manager', pos_id }),
        });
      }
    }

    await fetch(`${API}/pos/${editPos.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: editPos.name, 
        manager: editPos.manager_name || editPos.manager, 
        status: editPos.status 
      }),
    });
    await postLog(`[F10] Cập nhật POS: ${editPos.name}`, editPos.id, AUDIT_ACTION_TYPE.IAM_POS_UPDATE);
    showToast(`✅ Đã cập nhật POS "${editPos.name}".`);
    setModalMode(null); setEditPos(null); setSubmitting(false); loadAll();
  };

  const filteredUsers = ROLE === 'admin' ? users : users.filter(u => u.pos_name === POS_NAME);
  const usersByStatus = { 
    active: filteredUsers.filter(u => u.status === 'active' || !u.status), 
    locked: filteredUsers.filter(u => u.status === 'locked'), 
    pending: filteredUsers.filter(u => u.status === 'pending'),
    inactive: filteredUsers.filter(u => u.status === 'inactive')
  };

  // Tính toán cảnh báo POS thiếu GĐ hoặc GĐ bị inactive
  const posMissingManager = posList.filter(p => {
    if (p.status === 'inactive') return false; // Không cảnh báo POS đã đóng
    const mgr = users.find(u => u.pos_name === p.name && u.role === 'pos_manager' && u.status === 'active');
    return !mgr;
  });

  return (
    <div className="p-4" style={{ background: 'var(--ih-main-bg, #f0f4ff)', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#1a237e' }}>
            <i className="bi bi-people-fill me-2"></i>IAM &amp; cấu hình POS
          </h4>
          <small className="text-muted">Quản trị tài khoản · RBAC · Vòng đời nhân viên · Không có nút Xóa</small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-danger px-3 py-2 d-flex align-items-center">⛔ Không Xóa</span>
          {ROLE === 'admin' && (
            <>
              <button className="btn btn-warning btn-sm text-dark fw-semibold" onClick={() => setModalMode('create_pos')}>
                <i className="bi bi-building-add me-1"></i>Tạo POS mới
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setModalMode('create')}>
                <i className="bi bi-person-plus me-1"></i>Tạo tài khoản
              </button>
            </>
          )}
        </div>
      </div>

      <Toast toast={toast} />

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Tổng nhân sự', value: filteredUsers.length, color: '#1976d2', icon: 'bi-people' },
          { label: 'Đang hoạt động', value: usersByStatus.active.length, color: '#388e3c', icon: 'bi-person-check' },
          { label: 'Bị khóa', value: usersByStatus.locked.length, color: '#f57c00', icon: 'bi-person-lock' },
          { label: 'Đã nghỉ việc', value: usersByStatus.inactive.length, color: '#e53935', icon: 'bi-person-dash' },
          { label: 'Số POS', value: posList.length, color: '#7b1fa2', icon: 'bi-building' },
        ].map(s => (
          <div key={s.label} className="col-6 col-md">
            <div className="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bi ${s.icon} fs-5`} style={{ color: s.color }}></i>
              </div>
              <div><div className="fw-bold fs-5 lh-1">{s.value}</div><div className="text-muted small">{s.label}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2 d-flex gap-2 flex-wrap">
          <button className={`btn btn-sm ${tab === 'users' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('users')}>
            <i className="bi bi-people me-1"></i>Quản lý Nhân sự
          </button>
          <button className={`btn btn-sm ${tab === 'pos' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTab('pos')}>
            <i className="bi bi-building me-1"></i>Cấu hình POS ({posList.length})
          </button>
          {ROLE === 'admin' && (
            <button className={`btn btn-sm ${tab === 'perms' ? 'btn-warning text-dark' : 'btn-outline-warning'}`} onClick={() => setTab('perms')}>
              <i className="bi bi-shield-lock me-1"></i>Ma trận Phân quyền
              <span className="badge bg-danger ms-1" style={{fontSize:9}}>ADMIN</span>
            </button>
          )}
        </div>
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          {/* Cảnh báo POS thiếu GĐ */}
          {ROLE === 'admin' && posMissingManager.length > 0 && (
            <div className="alert alert-danger border-danger shadow-sm d-flex align-items-start gap-2 mb-3">
              <i className="bi bi-exclamation-triangle-fill fs-5 text-danger mt-1"></i>
              <div>
                <strong>CẢNH BÁO BẢO MẬT: Phát hiện {posMissingManager.length} POS không có Giám đốc hoạt động!</strong>
                <div className="small mt-1">
                  Các POS sau đang chưa có người quản lý (chưa gắn GĐ hoặc GĐ đã Nghỉ việc/Bị khóa): 
                  <span className="fw-bold"> {posMissingManager.map(p => p.name).join(', ')}</span>. 
                  Vui lòng cập nhật ngay để tránh ngắt quãng quy trình phê duyệt (F3, F8).
                </div>
              </div>
            </div>
          )}

          {/* Pending activation */}
          {usersByStatus.pending.length > 0 && (
            <div className="card border-warning border-2 shadow-sm mb-3">
              <div className="card-header bg-warning bg-opacity-10 fw-bold border-0">
                <i className="bi bi-exclamation-circle me-1 text-warning"></i>
                {usersByStatus.pending.length} tài khoản chờ kích hoạt
              </div>
              <div className="card-body p-0">
                {usersByStatus.pending.map(u => (
                  <div key={u.id} className="p-3 border-bottom d-flex align-items-center justify-content-between">
                    <div>
                      <span className="fw-semibold me-2">{u.name}</span>
                      <span className={`${roleBadgeClass(u.role)} me-2`}>{ROLE_LABEL[u.role] || u.role}</span>
                      <span className="badge bg-warning text-dark">Chờ kích hoạt</span>
                    </div>
                    <button className="btn btn-sm btn-success" onClick={() => handleActivate(u)}>
                      <i className="bi bi-check-circle me-1"></i>Kích hoạt
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User table */}
          <div className="card border-0 shadow-sm">
            <div className="card-header border-0 bg-white fw-semibold">Danh sách Nhân sự ({filteredUsers.length})</div>
            <div className="card-body p-0">
              {filteredUsers.length === 0 && <div className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Chưa có nhân viên nào.</p></div>}
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted">Mã NV</th>
                      <th className="small text-muted">User</th>
                      <th className="small text-muted">Họ và tên</th>
                      <th className="small text-muted">Chức vụ</th>
                      <th className="small text-muted">Chi nhánh làm việc</th>
                      <th className="small text-muted">Số ĐT</th>
                      <th className="small text-muted text-center">Trạng thái</th>
                      <th className="small text-muted text-end">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => {
                      const status = u.status || 'active';
                      const userMail = u.email ? u.email.split('@')[0] : 'N/A';
                      return (
                        <tr key={u.id} className={status === 'locked' || status === 'inactive' ? 'opacity-75 bg-light' : ''}>
                          <td><span className="badge bg-secondary">{u.id}</span></td>
                          <td className="fw-semibold text-primary">{userMail}</td>
                          <td className="fw-bold">{u.name}</td>
                          <td>
                            <span className={roleBadgeClass(u.role)}>
                              {ROLE_LABEL[u.role] || u.role}
                            </span>
                          </td>
                          <td>
                            <i className="bi bi-building me-1 text-muted"></i>
                            <span className="fw-semibold">{u.pos_name || '—'}</span>
                          </td>
                          <td>{u.phone || '—'}</td>
                          <td className="text-center">
                            <span className={userStatusBadgeClass(status)}>
                              {status === 'active' ? '✅ Hoạt động' : status === 'locked' ? '🔒 Bị khóa' : status === 'inactive' ? '🚫 Nghỉ việc' : '⏳ Chờ kích hoạt'}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex gap-1 justify-content-end">
                              {ROLE === 'admin' && (
                                <button className="btn btn-sm btn-outline-primary" onClick={() => { setEditUser(u); setModalMode('edit'); }} title="Sửa">
                                  <i className="bi bi-pencil"></i>
                                </button>
                              )}
                              {status === 'active' && (
                                <>
                                  <button className="btn btn-sm btn-outline-warning text-dark" onClick={() => { setSelected(u); setModalMode('lock'); setLockReason(''); }} title="Khóa">
                                    <i className="bi bi-lock"></i>
                                  </button>
                                  {ROLE === 'admin' && (
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => { setSelected(u); setModalMode('inactive_user'); }} title="Báo nghỉ việc">
                                      <i className="bi bi-person-dash"></i>
                                    </button>
                                  )}
                                </>
                              )}
                              {(status === 'locked' || status === 'inactive') && (
                                <button className="btn btn-sm btn-outline-success" onClick={() => { setSelected(u); setModalMode('unlock'); }} title="Phục hồi">
                                  <i className="bi bi-unlock"></i>
                                </button>
                              )}
                              {status === 'pending' && (
                                <button className="btn btn-sm btn-success" onClick={() => handleActivate(u)} title="Kích hoạt">
                                  <i className="bi bi-check"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS Tab */}
      {tab === 'pos' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 bg-white fw-semibold d-flex justify-content-between">
            <span><i className="bi bi-building me-1"></i>Danh sách POS ({posList.length})</span>
            <span className="text-muted small fw-normal">Có thể vô hiệu hóa (Inactive) POS ngừng hoạt động</span>
          </div>
          <div className="card-body p-0">
            {posList.length === 0 && <div className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Chưa có POS nào.</p></div>}
            {posList.map(pos => {
              // hasManager: match pos_name + role=pos_manager, status không được là locked/inactive
              const hasManager = users.some(u =>
                u.pos_name === pos.name &&
                u.role === 'pos_manager' &&
                u.status !== 'locked' && u.status !== 'inactive'
              );
              return (
              <div key={pos.id} className={`p-4 border-bottom d-flex align-items-start justify-content-between ${pos.status === 'inactive' ? 'opacity-50 bg-light' : ''}`}>
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="fw-semibold fs-6">{pos.name}</span>
                    <span className={`badge ${pos.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                      {pos.status === 'active' ? '✅ Đang hoạt động' : '🚫 Vô hiệu hóa'}
                    </span>
                    {pos.status === 'active' && !hasManager && (
                      <span className="badge bg-warning text-dark"><i className="bi bi-exclamation-triangle me-1"></i>Thiếu GĐ</span>
                    )}
                  </div>
                  <div className="text-muted small mb-1"><i className="bi bi-person me-1"></i>GĐ POS: <strong className={!hasManager ? 'text-danger' : ''}>{pos.manager || 'Chưa gán'}</strong></div>
                  <div className="text-muted small"><i className="bi bi-house me-1"></i>POS ID: {pos.id}</div>
                </div>
                <div className="d-flex flex-column gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => { setSelected(pos); setModalMode('pos_detail'); }}>
                    <i className="bi bi-eye me-1"></i>Chi tiết
                  </button>
                  {ROLE === 'admin' && (
                    <button className="btn btn-sm btn-outline-primary" onClick={() => { setEditPos({ ...pos, manager_id: '', manager_name: '', manager_user: null }); setModalMode('edit_pos'); }}>
                      <i className="bi bi-pencil me-1"></i>Sửa / Inactive
                    </button>
                  )}
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* ===================== PERMISSION MATRIX TAB ===================== */}
      {tab === 'perms' && (() => {
        const CONFIGURABLE = ['pos_manager', 'sales', 'marketing'];
        const groups = [...new Set(ALL_PERMISSIONS.map(p => p.group))];
        const handleToggle = (role, code) => {
          if (role === 'admin') return;
          const curr = { ...permMatrix };
          const rolePerms = [...(curr[role] || [])];
          const idx = rolePerms.indexOf(code);
          if (idx >= 0) rolePerms.splice(idx, 1); else rolePerms.push(code);
          curr[role] = rolePerms;
          setPermMatrix(curr);
          setPermSaved(false);
        };
        const handleSave = async () => {
          savePermissions(permMatrix);
          setPermSaved(true);
          await postLog('[F10] Cập nhật Ma trận Phân quyền', 'SYSTEM', AUDIT_ACTION_TYPE.IAM_PERMISSION_MATRIX_SAVE);
          showToast('✅ Đã lưu Ma trận Phân quyền. Hiệu lực ngay lập tức!', 'success');
        };
        const handleReset = () => {
          resetPermissions();
          setPermMatrix(getPermissions());
          setPermSaved(false);
          showToast('🔄 Đã reset về cấu hình mặc định.', 'warning');
        };
        return (
          <div>
            <div className="alert alert-warning d-flex align-items-start gap-2 mb-3">
              <i className="bi bi-shield-exclamation fs-5 mt-1"></i>
              <div className="small">
                <strong>Cấu hình Phân quyền Động (Permission-based RBAC)</strong><br/>
                Tick/bỏ tick để cấp/thu hồi quyền theo Role. Thay đổi có hiệu lực ngay lập tức mà không cần sửa code.
                Admin Tổng luôn có toàn quyền và không thể thay đổi.
              </div>
            </div>
            <div className="card border-0 shadow-sm" style={{overflowX:'auto'}}>
              <div className="card-header border-0 bg-white d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-table me-1"></i>Ma trận Quyền hạn ({ALL_PERMISSIONS.length} quyền)</span>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={handleReset}>
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Reset mặc định
                  </button>
                  <button className="btn btn-sm btn-warning fw-bold" onClick={handleSave}>
                    <i className="bi bi-save me-1"></i>Lưu thay đổi
                    {!permSaved && <span className="badge bg-danger ms-1">Chưa lưu</span>}
                  </button>
                </div>
              </div>
              <table className="table table-bordered table-hover mb-0" style={{minWidth:700}}>
                <thead style={{background:'#1a237e',color:'#fff'}}>
                  <tr>
                    <th style={{width:'40%',fontSize:12}}>Quyền hạn</th>
                    <th style={{width:'10%',fontSize:12}}>Scope</th>
                    <th className="text-center" style={{fontSize:12}}>Admin Tổng</th>
                    {CONFIGURABLE.map(r => (
                      <th key={r} className="text-center" style={{fontSize:12}}>
                        <span className={roleBadgeClass(r)}>{ROLE_LABEL[r]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <>
                      <tr key={group} style={{background:'#e8eaf6'}}>
                        <td colSpan={3 + CONFIGURABLE.length} className="fw-bold small ps-3" style={{color:'#1a237e'}}>
                          <i className="bi bi-folder me-1"></i>{group}
                        </td>
                      </tr>
                      {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => (
                        <tr key={perm.code}>
                          <td style={{fontSize:12}}>
                            <div className="fw-semibold">{perm.label}</div>
                            <code style={{fontSize:10,color:'#555'}}>{perm.code}</code>
                            {perm.masking && <span className="badge bg-warning text-dark ms-1" style={{fontSize:9}}>{perm.masking}</span>}
                          </td>
                          <td><span className="badge bg-light text-dark border" style={{fontSize:9}}>{perm.scope}</span></td>
                          {/* Admin luôn tick — không thể sửa */}
                          <td className="text-center">
                            <i className="bi bi-check-circle-fill text-success fs-5"></i>
                          </td>
                          {CONFIGURABLE.map(role => {
                            const checked = (permMatrix[role] || []).includes(perm.code);
                            return (
                              <td key={role} className="text-center">
                                <div className="form-check form-switch d-flex justify-content-center mb-0">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    role="switch"
                                    checked={checked}
                                    onChange={() => handleToggle(role, perm.code)}
                                    style={{cursor:'pointer', transform:'scale(1.2)'}}
                                    title={`${checked ? 'Thu hồi' : 'Cấp'} quyền "${perm.label}" cho ${ROLE_LABEL[role]}`}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="alert alert-info small mt-3">
              <i className="bi bi-lightbulb me-1"></i>
              <strong>Demo Kịch bản:</strong> Tắt quyền <code>PROPERTY_VIEW_ADDRESS_OTHER_POS</code> của Đầu chủ → 
              Lưu → Vào F9 xem ngay địa chỉ tài sản POS khác sẽ hiển thị <code>***</code> ngay lập tức.
            </div>
          </div>
        );
      })()}

      {/* MODAL: Lock */}
      {modalMode === 'lock' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-lock me-2"></i>Khóa Tài khoản</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border mb-3">
                  <div className="fw-semibold">{selected.name}</div>
                  <div className="small text-muted">{ROLE_LABEL[selected.role]} · {selected.pos_name}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Lý do khóa <span className="text-danger">*</span> <span className="badge bg-secondary">Tối thiểu 10 ký tự</span></label>
                  <textarea className="form-control" rows={3} value={lockReason}
                    onChange={e => setLockReason(e.target.value)}
                    placeholder="VD: Vi phạm quy trình nội bộ, lộ thông tin tài sản chi nhánh khác..." />
                  <div className={`form-text ${lockReason.length < 10 ? 'text-danger' : 'text-success'}`}>
                    {lockReason.length}/10 ký tự tối thiểu
                  </div>
                </div>
                <div className="alert alert-warning small">
                  <i className="bi bi-info-circle me-1"></i>
                  Tài khoản bị khóa sẽ không thể đăng nhập. Tài sản và lịch sử không bị mất.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-danger fw-bold px-4" onClick={handleLock}
                  disabled={submitting || lockReason.trim().length < 10}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Khóa tài khoản
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Unlock / Phục hồi */}
      {modalMode === 'unlock' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-success text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-unlock me-2"></i>Phục hồi Tài khoản</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border mb-3">
                  <div className="fw-semibold">{selected.name}</div>
                  <div className="small text-muted">{ROLE_LABEL[selected.role]} · {selected.pos_name}</div>
                  {selected.lockReason && <div className="small text-danger mt-1"><i className="bi bi-lock me-1"></i>Lý do khóa: {selected.lockReason}</div>}
                </div>
                <div className="alert alert-info small">
                  <i className="bi bi-arrow-counterclockwise me-1"></i>
                  Tài khoản sẽ được phục hồi trạng thái <strong>"Đang hoạt động"</strong> và có thể đăng nhập lại bình thường.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-success fw-bold px-4" onClick={handleUnlock} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Phục hồi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Inactive User (Nghỉ việc) */}
      {modalMode === 'inactive_user' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-person-dash me-2"></i>Báo Nghỉ Việc Nhân Sự</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border border-danger mb-3">
                  <div className="fw-semibold">{selected.name}</div>
                  <div className="small text-muted">{ROLE_LABEL[selected.role]} · {selected.pos_name}</div>
                </div>
                <div className="alert alert-warning small">
                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                  Hành động này sẽ đánh dấu nhân sự là <strong>"Đã nghỉ việc" (Inactive)</strong>. Tài khoản bị vô hiệu hóa vĩnh viễn quyền đăng nhập, không còn nằm trong danh sách hoạt động, nhưng dữ liệu lịch sử tài sản không bị xóa.
                </div>
                {selected.role === 'pos_manager' && (
                  <div className="alert alert-danger small mb-0">
                    <i className="bi bi-shield-lock-fill me-1"></i>
                    <strong>Chú ý:</strong> Đây là Giám đốc POS! Khi báo nghỉ việc, POS <strong>{selected.pos_name}</strong> sẽ thiếu Giám đốc và hệ thống sẽ bật cảnh báo bảo mật ở F10.
                  </div>
                )}
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-danger fw-bold px-4" onClick={handleInactiveUser} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Nghỉ việc
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create User */}
      {modalMode === 'create' && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-person-plus me-2"></i>Tạo Tài khoản Mới</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Họ tên <span className="text-danger">*</span></label>
                  <input className="form-control" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="Nguyễn Văn A" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Vai trò <span className="text-danger">*</span></label>
                  <select className="form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold small">Thuộc POS (Chi nhánh)</label>
                    <select className="form-select form-select-sm" value={newUser.pos_name} onChange={e => setNewUser({ ...newUser, pos_name: e.target.value })}>
                      <option value="">-- Chọn POS --</option>
                      {posList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Email</label>
                    <input className="form-control form-control-sm" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="email@ihouzz.com" />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Số điện thoại</label>
                    <input className="form-control form-control-sm" value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} placeholder="09xx xxx xxx" />
                  </div>
                </div>
                <div className="alert alert-info small">
                  <i className="bi bi-info-circle me-1"></i>
                  Tài khoản sẽ được tạo với trạng thái <strong>"Chờ kích hoạt"</strong>. Admin phải kích hoạt thủ công trước khi nhân viên đăng nhập.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-primary fw-bold px-4" onClick={handleCreateUser} disabled={submitting || !newUser.name.trim()}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Tạo tài khoản
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit User */}
      {modalMode === 'edit' && editUser && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-pencil me-2"></i>Chỉnh sửa Tài khoản</h5>
                <button className="btn-close btn-close-white" onClick={() => { setModalMode(null); setEditUser(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Họ tên <span className="text-danger">*</span></label>
                  <input className="form-control" value={editUser.name} onChange={e => setEditUser({ ...editUser, name: e.target.value })} placeholder="Nguyễn Văn A" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Vai trò <span className="text-danger">*</span></label>
                  <select className="form-select" value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold small">Thuộc POS (Chi nhánh)</label>
                    <select className="form-select form-select-sm" value={editUser.pos_name} onChange={e => setEditUser({ ...editUser, pos_name: e.target.value })}>
                      <option value="">-- Chọn POS --</option>
                      {posList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Email</label>
                    <input className="form-control form-control-sm" type="email" value={editUser.email || ''} onChange={e => setEditUser({ ...editUser, email: e.target.value })} placeholder="email@ihouzz.com" />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Số điện thoại</label>
                    <input className="form-control form-control-sm" value={editUser.phone || ''} onChange={e => setEditUser({ ...editUser, phone: e.target.value })} placeholder="09xx xxx xxx" />
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 d-flex flex-wrap align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  onClick={handleAdminResetPasswordDemo}
                  disabled={submitting}
                >
                  Reset mật khẩu (có ghi nhật ký)
                </button>
                <div className="ms-auto d-flex gap-2">
                  <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setEditUser(null); }}>Hủy</button>
                  <button className="btn btn-primary fw-bold px-4" onClick={handleEditUser} disabled={submitting || !editUser.name.trim()}>
                    {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                    Cập nhật
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create POS */}
      {modalMode === 'create_pos' && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-warning text-dark border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-building-add me-2"></i>Tạo POS Mới</h5>
                <button className="btn-close" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Tên POS <span className="text-danger">*</span></label>
                  <input className="form-control" value={newPos.name} onChange={e => setNewPos({ ...newPos, name: e.target.value })} placeholder="VD: POS Q1, POS Thủ Đức..." />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">ID Tài khoản Giám đốc POS</label>
                  <input className="form-control" value={newPos.manager_id} onChange={e => {
                    const val = e.target.value;
                    const valTrim = val.trim();
                    const found = users.find((u) => sameUserId(u.id, valTrim) || u.email === valTrim);
                    setNewPos({ ...newPos, manager_id: found ? found.id : val, manager_name: found ? found.name : '', manager_user: found || null });
                  }} placeholder="Nhập user_id (vd: 2) hoặc Email..." />
                  
                  {newPos.manager_id && newPos.manager_user && (
                    <div className="alert alert-warning mt-2 py-2 px-3 small mb-0 border-warning">
                      <div className="text-success fw-bold mb-1"><i className="bi bi-check-circle me-1"></i>Họ tên GĐ: {newPos.manager_name}</div>
                      {newPos.manager_user.pos_name && (
                        <div className="text-danger fw-semibold">
                          <i className="bi bi-exclamation-triangle-fill me-1"></i>
                          Hiện đang là {ROLE_LABEL[newPos.manager_user.role] || newPos.manager_user.role} tại {newPos.manager_user.pos_name}
                        </div>
                      )}
                    </div>
                  )}
                  {newPos.manager_id && !newPos.manager_user && (
                    <div className="form-text text-danger mt-2"><i className="bi bi-x-circle me-1"></i>Không tìm thấy nhân sự! Hãy tạo tài khoản trước.</div>
                  )}
                </div>
                <div className="alert alert-info small">
                  <i className="bi bi-info-circle me-1"></i>
                  Khi gán thành công, hệ thống sẽ tự động cập nhật tài khoản này thành <strong>Giám đốc POS</strong> và gán vào POS mới. Hệ thống sẽ có cảnh báo xác nhận nếu luân chuyển.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-warning fw-bold px-4 text-dark" onClick={handleCreatePos} disabled={submitting || !newPos.name.trim()}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Tạo POS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit POS */}
      {modalMode === 'edit_pos' && editPos && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-building-gear me-2"></i>Chỉnh sửa / Vô hiệu hóa POS</h5>
                <button className="btn-close btn-close-white" onClick={() => { setModalMode(null); setEditPos(null); }}></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Tên POS <span className="text-danger">*</span></label>
                  <input className="form-control" value={editPos.name} onChange={e => setEditPos({ ...editPos, name: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Đổi Giám đốc POS (Nhập ID/Email)</label>
                  <input className="form-control" value={editPos.manager_id} onChange={e => {
                    const val = e.target.value;
                    const valTrim = val.trim();
                    const found = users.find((u) => sameUserId(u.id, valTrim) || u.email === valTrim);
                    setEditPos({ ...editPos, manager_id: found ? found.id : val, manager_name: found ? found.name : '', manager_user: found || null });
                  }} placeholder="Bỏ trống nếu không muốn đổi..." />
                  
                  {editPos.manager_id && editPos.manager_user && (
                    <div className="alert alert-warning mt-2 py-2 px-3 small mb-0 border-warning">
                      <div className="text-success fw-bold mb-1"><i className="bi bi-check-circle me-1"></i>Họ tên GĐ Mới: {editPos.manager_name}</div>
                      {editPos.manager_user.pos_name && (
                        <div className="text-danger fw-semibold">
                          <i className="bi bi-exclamation-triangle-fill me-1"></i>
                          Sẽ bị luân chuyển từ {ROLE_LABEL[editPos.manager_user.role] || editPos.manager_user.role} tại {editPos.manager_user.pos_name}
                        </div>
                      )}
                    </div>
                  )}
                  {editPos.manager_id && !editPos.manager_user && (
                    <div className="form-text text-danger mt-2"><i className="bi bi-x-circle me-1"></i>Không tìm thấy nhân sự!</div>
                  )}
                  {!editPos.manager_id && (
                    <div className="form-text text-muted mt-1"><i className="bi bi-info-circle me-1"></i>GĐ hiện tại: <strong>{editPos.manager || 'Chưa gán'}</strong></div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Trạng thái hoạt động</label>
                  <select className="form-select" value={editPos.status} onChange={e => setEditPos({ ...editPos, status: e.target.value })}>
                    <option value="active">✅ Đang hoạt động</option>
                    <option value="inactive">🚫 Vô hiệu hóa (Inactive)</option>
                  </select>
                </div>
                {editPos.status === 'inactive' && (
                  <div className="alert alert-danger small">
                    <i className="bi bi-x-octagon-fill me-1"></i>
                    POS bị <strong>Vô hiệu hóa</strong> sẽ không nhận tài sản mới và hiển thị mờ trong danh sách.
                  </div>
                )}
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => { setModalMode(null); setEditPos(null); }}>Hủy</button>
                <button className="btn btn-primary fw-bold px-4" onClick={handleEditPos} disabled={submitting || !editPos.name.trim()}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Cập nhật POS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: POS Detail */}
      {modalMode === 'pos_detail' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-dark text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-building me-2"></i>Chi tiết POS</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalMode(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-2 fw-bold fs-5">{selected.name}</div>
                <div className="mb-3">
                  <span className={`badge ${selected.status === 'active' ? 'bg-success' : 'bg-secondary'} me-2`}>
                    {selected.status === 'active' ? '✅ Hoạt động' : '⛔ Vô hiệu hóa'}
                  </span>
                </div>
                <table className="table table-sm table-bordered small">
                  <tbody>
                    <tr><th>GĐ POS</th><td>{selected.manager}</td></tr>
                    <tr><th>Số tài sản</th><td>{selected.propCount}</td></tr>
                    <tr><th>Trạng thái</th><td>{selected.status}</td></tr>
                  </tbody>
                </table>
                <div className="alert alert-warning small">
                  <i className="bi bi-info-circle me-1"></i>
                  <strong>Không có nút Xóa POS.</strong> Chỉ có thể vô hiệu hóa để ẩn khỏi hoạt động mới.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
