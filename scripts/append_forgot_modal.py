from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src/pages/Feature1_Login.jsx"
text = p.read_text(encoding="utf-8")
marker = "    </motionWrap>\n  );\n}\n\nexport default Feature1_Login;"
marker = "    </div>\n  );\n}\n\nexport default Feature1_Login;"

T = "div"
modal = f"""
      {{showForgotModal && (
        <{T} className="modal show d-block" style={{{{ backgroundColor: 'rgba(0,0,0,0.45)' }}}} role="dialog" aria-modal="true">
          <{T} className="modal-dialog modal-dialog-centered">
            <{T} className="modal-content">
              <form onSubmit={{handleForgotRequest}}>
                <{T} className="modal-header">
                  <h5 className="modal-title">Yêu cầu cấp lại mật khẩu (Admin)</h5>
                  <button type="button" className="btn-close" aria-label="Đóng" onClick={{() => setShowForgotModal(false)}} />
                </{T}>
                <{T} className="modal-body">
                  <p className="small text-muted">
                    Hệ thống nội bộ iHouzz <strong>không</strong> tự gửi link đặt lại mật khẩu. Mật khẩu trùng email công ty —
                    Admin (Feature 10) sẽ xác minh và cấp lại qua kênh nội bộ.
                  </p>
                  <{T} className="mb-3">
                    <label className="form-label small">Email nhân viên</label>
                    <input type="email" className="form-control" value={{email}} readOnly />
                  </{T}>
                  <{T} className="mb-2">
                    <label className="form-label small">Ghi chú (tùy chọn)</label>
                    <textarea className="form-control" rows={{2}} placeholder="VD: Quên mật khẩu sau khi đổi máy..." value={{forgotNote}} onChange={{(e) => setForgotNote(e.target.value)}} />
                  </{T}>
                  {{forgotSuccess && <{T} className="alert alert-success py-2 small mb-0">{{forgotSuccess}}</{T}>}}
                </{T}>
                <{T} className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={{() => setShowForgotModal(false)}}>Đóng</button>
                  <button type="submit" className="btn btn-primary" disabled={{forgotSubmitting}}>{{forgotSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu'}}</button>
                </{T}>
              </form>
            </{T}>
          </{T}>
        </{T}>
      )}}
    </{T}>
  );
}}

export default Feature1_Login;"""

if marker not in text:
    raise SystemExit("marker not found: " + repr(text[-80:]))

text = text.replace(marker, modal)
p.write_text(text, encoding="utf-8")
print("ok")
