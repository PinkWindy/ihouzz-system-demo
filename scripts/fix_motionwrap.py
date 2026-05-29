from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src/pages/Feature1_Login.jsx"
text = p.read_text(encoding="utf-8")
bad = "<motionWrap />"
good = """<motionWrap />"""
good = good.replace("motionWrap", "div")
good = """                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="remember" disabled={loginLoading || isLoginLocked} />
                  <label className="form-check-label small" htmlFor="remember">
                    Ghi nhớ (7 ngày)
                  </label>
                </div>"""
if bad not in text:
    print("no bad tag")
else:
    text = text.replace(bad, good, 1)
    p.write_text(text, encoding="utf-8")
    print("fixed")
