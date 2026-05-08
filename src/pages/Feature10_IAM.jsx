import { useState, useEffect } from 'react';
import {
  ALL_PERMISSIONS, getPermissions, savePermissions,
  resetPermissions, hasPermission
} from '../utils/permissions.js';
const API = 'http://localhost:5000';

const ROLES = ['admin', 'pos_manager', 'sales', 'marketing'];
const ROLE_LABEL = { admin: 'Admin Tổng', pos_manager: 'Giám đốc POS', sales: 'Chuyên viên Đầu chủ', marketing: 'Chuyên viên MKT' };
const ROLE_COLOR = { admin: 'danger', pos_manager: 'warning', sales: 'primary', marketing: 'info' };
const STATUS_COLOR = { active: 'success', locked: 'danger', pending: 'warning' };

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
  const [users, setUsers] = useState([]);
  const [posList, setPosList] = useState([]);
  const [tab, setTab] = useState('users'); // 'users' | 'pos' | 'perms'
  const [permMatrix, setPermMatrix] = useState(() => getPermissions());
  const [permSaved, setPermSaved] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'lock'|'unlock'|'create'|'pos_detail'
  const [lockReason, setLockReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', role: 'sales', pos_id: '', email: '', phone: '' });

  // Derived POS list from properties (since db.json doesn't have a 'pos' collection)
  const properties = [];

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [u, p] = await Promise.all([
      fetch(`${API}/users`).then(r => r.json()),
      fetch(`${API}/properties`).then(r => r.json()),
    ]);
    setUsers(u);
    // Build POS list from properties
    const posMap = {};
    p.forEach(prop => {
      if (prop.pos_id && !posMap[prop.pos_id]) {
        posMap[prop.pos_id] = { id: prop.pos_id, name: prop.pos_name, manager: prop.pos_manager, propCount: 0, status: 'active' };
      }
      if (prop.pos_id) posMap[prop.pos_id].propCount = (posMap[prop.pos_id].propCount || 0) + 1;
    });
    setPosList(Object.values(posMap));
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const postLog = (action, entityId) => fetch(`${API}/logs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp: new Date().toISOString(), action, entityId, user: 'Admin (F10)' }),
  });

  const handleLock = async () => {
    if (lockReason.trim().length < 10) { showToast('Lý do khóa phải từ 10 ký tự trở lên!', 'danger'); return; }
    setSubmitting(true);
    await fetch(`${API}/users/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'locked', lockReason: lockReason.trim(), lockedAt: new Date().toISOString(), lockedBy: 'Admin Demo' }),
    });
    await postLog(`[F10] Khóa tài khoản · Lý do: ${lockReason.trim()}`, selected.id);
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
    await postLog(`[F10] Mở khóa tài khoản`, selected.id);
    showToast(`🔓 Đã mở khóa tài khoản "${selected.name}".`, 'warning');
    setSelected(null); setModalMode(null);
    setSubmitting(false); loadAll();
  };

  const handleActivate = async (u) => {
    await fetch(`${API}/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', activatedAt: new Date().toISOString() }),
    });
    await postLog(`[F10] Kích hoạt tài khoản`, u.id);
    showToast(`✅ Đã kích hoạt tài khoản "${u.name}".`);
    loadAll();
  };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.role) { showToast('Vui lòng điền tên và vai trò!', 'danger'); return; }
    setSubmitting(true);
    const id = `u_new_${Date.now()}`;
    await fetch(`${API}/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, id, status: 'pending', createdAt: new Date().toISOString() }),
    });
    await postLog(`[F10] Tạo tài khoản mới: ${newUser.name} (${newUser.role})`, id);
    showToast(`✅ Đã tạo tài khoản "${newUser.name}". Trạng thái: Chờ kích hoạt.`);
    setNewUser({ name: '', role: 'sales', pos_id: '', email: '', phone: '' });
    setModalMode(null); setSubmitting(false); loadAll();
  };

  const usersByStatus = { active: users.filter(u => u.status === 'active' || !u.status), locked: users.filter(u => u.status === 'locked'), pending: users.filter(u => u.status === 'pending') };

  return (
    <div className="p-4" style={{ background: '#f0f4ff', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: '#1a237e' }}>
            <i className="bi bi-people-fill me-2"></i>Feature 10 – IAM & Cấu hình POS (UC011 + UC013)
          </h4>
          <small className="text-muted">Quản trị tài khoản · RBAC · Vòng đời nhân viên · Không có nút Xóa</small>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-danger px-3 py-2">⛔ Không Xóa</span>
          <button className="btn btn-primary btn-sm" onClick={() => setModalMode('create')}>
            <i className="bi bi-person-plus me-1"></i>Tạo tài khoản
          </button>
        </div>
      </div>

      <Toast toast={toast} />

      {/* Stats */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Tổng nhân sự', value: users.length, color: '#1976d2', icon: 'bi-people' },
          { label: 'Đang hoạt động', value: usersByStatus.active.length, color: '#388e3c', icon: 'bi-person-check' },
          { label: 'Bị khóa', value: usersByStatus.locked.length, color: '#e53935', icon: 'bi-person-lock' },
          { label: 'Chờ kích hoạt', value: usersByStatus.pending.length, color: '#f57c00', icon: 'bi-person-exclamation' },
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
          <button className={`btn btn-sm ${tab === 'perms' ? 'btn-warning text-dark' : 'btn-outline-warning'}`} onClick={() => setTab('perms')}>
            <i className="bi bi-shield-lock me-1"></i>Ma trận Phân quyền
            <span className="badge bg-danger ms-1" style={{fontSize:9}}>ADMIN</span>
          </button>
        </div>
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
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
                      <span className={`badge bg-${ROLE_COLOR[u.role] || 'secondary'} me-2`}>{ROLE_LABEL[u.role] || u.role}</span>
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
            <div className="card-header border-0 bg-white fw-semibold">Danh sách Nhân sự ({users.length})</div>
            <div className="card-body p-0">
              {users.length === 0 && <div className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Chưa có nhân viên nào.</p></div>}
              {users.map(u => {
                const status = u.status || 'active';
                return (
                  <div key={u.id} className={`p-3 border-bottom d-flex align-items-start gap-3 ${status === 'locked' ? 'opacity-60 bg-light' : ''}`}>
                    <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                      style={{ width: 40, height: 40, fontSize: 16 }}>
                      {u.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        <span className="fw-semibold">{u.name}</span>
                        <span className={`badge bg-${ROLE_COLOR[u.role] || 'secondary'} ${u.role === 'pos_manager' ? 'text-dark' : ''}`}>{ROLE_LABEL[u.role] || u.role}</span>
                        <span className={`badge bg-${STATUS_COLOR[status] || 'secondary'} ${status === 'pending' ? 'text-dark' : ''}`}>{status === 'active' ? '✅ Đang hoạt động' : status === 'locked' ? '🔒 Bị khóa' : '⏳ Chờ kích hoạt'}</span>
                      </div>
                      <div className="text-muted small">
                        <span className="me-3"><i className="bi bi-building me-1"></i>{u.pos_name || '—'}</span>
                        <span className="me-3"><i className="bi bi-tag me-1"></i>{u.id}</span>
                      </div>
                      {status === 'locked' && u.lockReason && (
                        <div className="alert alert-danger py-1 px-2 small mt-1 mb-0">
                          <i className="bi bi-lock me-1"></i><strong>Lý do khóa:</strong> {u.lockReason}
                        </div>
                      )}
                    </div>
                    <div className="d-flex flex-column gap-1 flex-shrink-0">
                      {status === 'active' && (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => { setSelected(u); setModalMode('lock'); setLockReason(''); }}>
                          <i className="bi bi-lock me-1"></i>Khóa
                        </button>
                      )}
                      {status === 'locked' && (
                        <button className="btn btn-sm btn-outline-success" onClick={() => { setSelected(u); setModalMode('unlock'); }}>
                          <i className="bi bi-unlock me-1"></i>Mở khóa
                        </button>
                      )}
                      {status === 'pending' && (
                        <button className="btn btn-sm btn-success" onClick={() => handleActivate(u)}>
                          <i className="bi bi-check me-1"></i>Kích hoạt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* POS Tab */}
      {tab === 'pos' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header border-0 bg-white fw-semibold d-flex justify-content-between">
            <span><i className="bi bi-building me-1"></i>Danh sách POS ({posList.length})</span>
            <span className="text-muted small fw-normal">⛔ Không thể xóa POS — chỉ Vô hiệu hóa</span>
          </div>
          <div className="card-body p-0">
            {posList.length === 0 && <div className="text-center py-5 text-muted"><i className="bi bi-inbox fs-2"></i><p className="mt-2">Chưa có POS nào.</p></div>}
            {posList.map(pos => (
              <div key={pos.id} className="p-4 border-bottom d-flex align-items-start justify-content-between">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="fw-semibold fs-6">{pos.name}</span>
                    <span className={`badge ${pos.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                      {pos.status === 'active' ? '✅ Đang hoạt động' : '⛔ Vô hiệu hóa'}
                    </span>
                  </div>
                  <div className="text-muted small mb-1"><i className="bi bi-person me-1"></i>GĐ POS: <strong>{pos.manager}</strong></div>
                  <div className="text-muted small"><i className="bi bi-house me-1"></i>{pos.propCount} tài sản trong kho</div>
                  {pos.status !== 'active' && (
                    <div className="alert alert-warning py-1 px-2 small mt-2 mb-0">
                      <i className="bi bi-info-circle me-1"></i>POS vô hiệu hóa không nhận tài sản mới.
                    </div>
                  )}
                </div>
                <div className="d-flex flex-column gap-1">
                  <button className={`btn btn-sm ${pos.status === 'active' ? 'btn-outline-secondary' : 'btn-outline-success'}`}
                    onClick={() => { setSelected(pos); setModalMode('pos_detail'); }}>
                    <i className="bi bi-eye me-1"></i>Chi tiết
                  </button>
                </div>
              </div>
            ))}
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
        const handleSave = () => {
          savePermissions(permMatrix);
          setPermSaved(true);
          postLog('[F10] Cập nhật Ma trận Phân quyền', 'SYSTEM');
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
                        <span className={`badge bg-${ROLE_COLOR[r]} ${r==='pos_manager'?'text-dark':''}`}>{ROLE_LABEL[r]}</span>
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

      {/* MODAL: Unlock */}
      {modalMode === 'unlock' && selected && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-success text-white border-0">
                <h5 className="modal-title fw-bold"><i className="bi bi-unlock me-2"></i>Mở khóa Tài khoản</h5>
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
                  Tài khoản sẽ được phục hồi trạng thái <strong>"Đang hoạt động"</strong> và có thể đăng nhập bình thường.
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-outline-secondary" onClick={() => setModalMode(null)}>Hủy</button>
                <button className="btn btn-success fw-bold px-4" onClick={handleUnlock} disabled={submitting}>
                  {submitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                  Xác nhận Mở khóa
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
