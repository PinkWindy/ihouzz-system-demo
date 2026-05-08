import React, { useState, useEffect } from 'react';
import axios from 'axios';

function POSDesktop() {
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('kho'); // 'kho', 'logs'
  const [showRemoved, setShowRemoved] = useState(false); // F9: Default hide "Đã gỡ nguồn"
  const [searchQuery, setSearchQuery] = useState('');

  const logAudit = async (action, entityId) => {
    await axios.post('http://localhost:5000/logs', {
      timestamp: new Date().toISOString(), action, entityId, user: 'Admin/Manager'
    });
  };

  useEffect(() => {
    fetchData();
    fetchLogs();
  }, []);

  const fetchData = async () => {
    const res = await axios.get('http://localhost:5000/properties');
    setProperties(res.data);
  };
  const fetchLogs = async () => {
    const res = await axios.get('http://localhost:5000/logs');
    setLogs(res.data);
  };

  const handleAction = async (prop, newLv1, newLv2, actionName) => {
    const updated = { ...prop, statusLv1: newLv1 || prop.statusLv1, statusLv2: newLv2 || prop.statusLv2 };
    await axios.put(`http://localhost:5000/properties/${prop.id}`, updated);
    await logAudit(actionName, prop.id);
    alert(`✅ Thành công: ${actionName}`);
    fetchData(); fetchLogs();
  };

  // Lọc dữ liệu (F9)
  const filteredProps = properties.filter(p => {
    if (!showRemoved && p.statusLv1 === 'Đã gỡ nguồn') return false;
    if (searchQuery && !p.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).reverse();

  return (
    <div className="container mt-4 pb-5">
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
        <h2><i className="bi bi-display"></i> Workspace Quản lý (PC)</h2>
        <div>
          <button className={`btn btn-${tab === 'kho' ? 'primary' : 'outline-primary'} me-2`} onClick={() => setTab('kho')}>Quản lý Kho</button>
          <button className={`btn btn-${tab === 'logs' ? 'dark' : 'outline-dark'}`} onClick={() => setTab('logs')}>Audit Logs (F11)</button>
        </div>
      </div>

      {tab === 'kho' && (
        <div className="card p-4 shadow-sm border-0">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h5 className="m-0 fw-bold">Danh sách Tài sản & Bài đăng</h5>
            <div className="d-flex gap-3">
              <input type="text" className="form-control form-control-sm" placeholder="Tìm LS-..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
              <div className="form-check form-switch d-flex align-items-center gap-2">
                <input className="form-check-input" type="checkbox" checked={showRemoved} onChange={e=>setShowRemoved(e.target.checked)} />
                <label className="form-check-label small text-nowrap">Hiện "Đã gỡ nguồn"</label>
              </div>
            </div>
          </div>
          
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-light">
                <tr><th>Mã LS-</th><th>Thông tin cơ bản</th><th>Level 1 (Kho)</th><th>Level 2 (Niêm yết)</th><th className="text-end">Thao tác (Actions)</th></tr>
              </thead>
              <tbody>
                {filteredProps.map(p => (
                  <tr key={p.id} className={p.statusLv1 === 'Đã gỡ nguồn' ? 'table-secondary opacity-50' : ''}>
                    <td className="fw-bold text-primary">{p.id}</td>
                    <td><div>{p.address}</div><div className="small text-muted">{p.type} • {p.area}m2 • {p.price.toLocaleString()} VNĐ</div></td>
                    <td><span className="badge bg-secondary">{p.statusLv1}</span></td>
                    <td><span className="badge bg-dark">{p.statusLv2}</span></td>
                    <td className="text-end">
                      {p.statusLv1 === 'Chờ POS duyệt' && (
                        <button className="btn btn-sm btn-success w-100" onClick={() => handleAction(p, 'Được duyệt', null, 'GĐ POS Duyệt nhập kho (F3)')}>Duyệt Kho (F3)</button>
                      )}
                      {p.statusLv2 === 'Chờ MKT duyệt' && (
                        <button className="btn btn-sm btn-info text-white w-100" onClick={() => handleAction(p, null, 'Đang niêm yết', 'MKT Duyệt Tin Đăng (F5)')}>MKT Duyệt Tin (F5)</button>
                      )}
                      {p.statusLv2.startsWith('Yêu cầu gỡ') && (
                        <button className="btn btn-sm btn-warning w-100" onClick={() => handleAction(p, null, p.statusLv2.replace('Yêu cầu gỡ: ', ''), 'Admin Duyệt Gỡ Tin (F7)')}>Duyệt Gỡ Tin (F7)</button>
                      )}
                      {p.statusLv1 === 'Chờ duyệt gỡ nguồn' && (
                        <button className="btn btn-sm btn-danger w-100 mt-1" onClick={() => handleAction(p, 'Đã gỡ nguồn', 'Đã gỡ nguồn', 'GĐ POS Duyệt Gỡ Nguồn (F8)')}>Duyệt Gỡ Nguồn (F8)</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card p-4 shadow-sm border-0 bg-light">
          <h5 className="mb-4 fw-bold"><i className="bi bi-clock-history"></i> System Audit Logs (F11)</h5>
          <div className="list-group">
            {logs.slice().reverse().map(l => (
              <div key={l.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                <div>
                  <span className="badge bg-primary me-3">{l.entityId}</span>
                  <span className="fw-semibold">{l.action}</span>
                </div>
                <div className="text-end text-muted small">
                  <div>{new Date(l.timestamp).toLocaleString()}</div>
                  <div><i className="bi bi-person"></i> {l.user}</div>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div className="text-center p-3 text-muted">Chưa có log hệ thống</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default POSDesktop;
