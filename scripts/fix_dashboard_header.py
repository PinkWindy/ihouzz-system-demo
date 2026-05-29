# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src/pages/Feature12_Dashboard.jsx"
text = p.read_text(encoding="utf-8")
start = text.index('      <motionWrap />')
if '<motionWrap' not in text:
    start = text.index('      <motionWrap />')
start = text.index('      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">')
end = text.index('      <div className="alert alert-info py-2 small mb-4">')

d = "div"
header = f'''      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <{d}>
          <h3 className="fw-bold mb-1" style={{{{ color: '#0d47a1' }}}}>
            <i className="bi bi-pie-chart-fill me-2"></i>
            Dashboard Báo Cáo Tổng Hợp
          </h3>
          <{d} className="text-muted small">US021 · FR12-001 — Thống kê theo phạm vi quyền</{d}>
          <{d} className="small mt-1">
            Phạm vi: <strong className="text-primary">{{scopeLabel}}</strong>
          </{d}>
        </{d}>
        <{d} className="d-flex align-items-center gap-2 flex-wrap">
          {{(ROLE === 'admin' || ROLE === 'marketing') && (
            <{d} className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
              <i className="bi bi-filter-circle text-primary fs-5"></i>
              <span className="fw-semibold small text-nowrap">Lọc POS:</span>
              <select
                className="form-select form-select-sm border-0 bg-light"
                style={{{{ width: 200 }}}}
                value={{selectedPos}}
                onChange={{(e) => setSelectedPos(e.target.value)}}
              >
                <option value="ALL">Tất cả chi nhánh</option>
                {{posList.map((p) => (
                  <option key={{p.id}} value={{p.name}}>
                    {{p.name}}
                  </option>
                ))}}
              </select>
            </{d}>
          )}}
          {{ROLE === 'pos_manager' && (
            <{d} className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
              <i className="bi bi-person-lines-fill text-primary fs-5"></i>
              <span className="fw-semibold small text-nowrap">Nhân viên:</span>
              <select
                className="form-select form-select-sm border-0 bg-light"
                style={{{{ width: 220 }}}}
                value={{selectedStaff}}
                onChange={{(e) => setSelectedStaff(e.target.value)}}
              >
                <option value="ALL">Tất cả nhân viên POS</option>
                {{posStaffList.map((u) => (
                  <option key={{u.id}} value={{u.id}}>
                    {{u.name}}
                  </option>
                ))}}
              </select>
            </{d}>
          )}}
          <{d} className="d-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
            <i className="bi bi-calendar-range text-primary"></i>
            <span className="small fw-semibold text-nowrap">Từ</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={{dateFrom}}
              onChange={{(e) => setDateFrom(e.target.value)}}
            />
            <span className="small fw-semibold text-nowrap">Đến</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={{dateTo}}
              onChange={{(e) => setDateTo(e.target.value)}}
            />
            {{(dateFrom || dateTo) && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={{() => {{
                  setDateFrom('');
                  setDateTo('');
                }}}}
              >
                Xóa
              </button>
            )}}
          </{d}>
          {{ROLE === 'sales' && (
            <{d} className="bg-white px-4 py-2 rounded shadow-sm border-start border-4 border-primary">
              <span className="text-muted small me-2">Báo cáo:</span>
              <strong className="text-primary">Cá nhân — {{USER_NAME}}</strong>
            </{d}>
          )}}
          <button className="btn btn-primary d-flex align-items-center gap-2" onClick={{handleExportDashboard}}>
            <i className="bi bi-download"></i> Xuất Báo cáo
          </button>
        </{d}>
      </{d}>

'''

text = text[:start] + header + text[end:]
if "motionWrap" in text:
    text = text.replace("motionWrap", "div")
p.write_text(text, encoding="utf-8")
print("ok")
