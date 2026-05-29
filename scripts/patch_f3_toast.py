from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src" / "pages" / "Feature3_Approval.jsx"
text = p.read_text(encoding="utf-8")

marker = (
    '      </motion>\n\n      <div className="row">\n        {/* Danh sách bên trái */}'
)
marker = marker.replace("</motion>", "</div>").replace("<motion ", "<div ")

insert = """      </div>

      {activeTab === 'pending' && overduePending.length > 0 && (
        <div className="alert alert-warning border-0 shadow-sm mb-3 d-flex align-items-start gap-2">
          <i className="bi bi-clock-history fs-5 flex-shrink-0" />
          <div>
            <strong>SLA nhắc hạn ({SLA_REMINDER_DAYS} ngày):</strong>{' '}
            {overduePending.length} hồ sơ chờ xử lý quá hạn —{' '}
            {overduePending.map((p) => propertyDisplayCode(p.id)).join(', ')}
          </div>
        </div>
      )}

      <div className="row">
        {/* Danh sách bên trái */}"""

real_marker = '      </div>\n\n      <motion className="row">\n        {/* Danh sách bên trái */}'
real_marker = '      </div>\n\n      <div className="row">\n        {/* Danh sách bên trái */}'

if "overduePending.length > 0" not in text:
    if real_marker not in text:
        raise SystemExit("marker not found")
    text = text.replace(real_marker, insert, 1)

if "<AppToast" not in text:
    old_end = "      )}\n    </div>\n  );\n}\n\nexport default Feature3_Approval;"
    new_end = "      )}\n      <AppToast toast={toast} onDismiss={dismissToast} />\n    </div>\n  );\n}\n\nexport default Feature3_Approval;"
    if old_end not in text:
        raise SystemExit("end marker not found")
    text = text.replace(old_end, new_end, 1)

p.write_text(text, encoding="utf-8")
print("patched Feature3_Approval.jsx")
