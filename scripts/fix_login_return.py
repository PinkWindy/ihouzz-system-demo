# -*- coding: utf-8 -*-
from pathlib import Path

logic_path = Path(__file__).resolve().parent.parent / "src/pages/Feature1_Login.jsx"
text = logic_path.read_text(encoding="utf-8")
marker = "  return ("
idx = text.index(marker)
logic = text[:idx].rstrip() + "\n\n"

ui = r'''  return (
    <motionWrap />
  );
}
'''

# Build UI with explicit div tags (no autocorrect)
close = "</" + "motionWrap>"
# wrong - use div
close = "</" + "div>"

ui = f'''  return (
    <div
      style={{{{ minHeight: '100vh', background: 'linear-gradient(135deg, #0056b3 0%, #00a2ff 100%)' }}}}
      className="d-flex align-items-center justify-content-center p-3"
    >
      <div className="card shadow-lg border-0" style={{{{ maxWidth: '420px', width: '100%', borderRadius: '16px' }}}}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <h2 className="fw-bold text-primary mb-1">iHouzz</h2>
            <p className="text-muted small">Hệ thống Quản lý Kho Nội bộ</p>
          {close}
          {{error && <div className="alert alert-danger py-2 small">{{error}}</motionWrap>}}
'''

print("fix script needs manual completion")
