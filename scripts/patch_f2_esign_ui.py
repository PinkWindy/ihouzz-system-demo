# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src" / "pages" / "Feature2_Create.jsx"
text = p.read_text(encoding="utf-8")
needle = (
    '        <motion className="card border-0 shadow-sm">\n'
    '          <motion className="card-header bg-white d-flex justify-content-between align-items-center py-3">'
).replace("motion", "div")

insert = """        <div className="card border-0 shadow-sm">
          {esignFlowProperty && (
            <div className="card-body border-bottom py-3 bg-primary bg-opacity-10">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                <div className="flex-grow-1">
                  <h6 className="fw-bold text-primary mb-2">
                    <i className="bi bi-pen me-2"></i>
                    Nhánh 1 — eSign HĐMG · {propertyDisplayCode(esignFlowProperty)}
                  </h6>
                  {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                    <>
                      <p className="small mb-2">
                        Đang chờ Khách hàng ký. Link eSign đã gửi qua <strong>Zalo OA / Email</strong> (demo).
                        {esignFlowProperty.esign_link_demo && (
                          <span className="d-block mt-1 text-muted">
                            Link: <code className="user-select-all">{esignFlowProperty.esign_link_demo}</code>
                          </span>
                        )}
                      </p>
                      <span className="badge bg-warning text-dark">Chờ KH ký</span>
                    </>
                  )}
                  {esignFlowProperty.level1_status === 'KH đã ký' && (
                    <>
                      <p className="small mb-2">KH đã ký HĐMG — bấm <strong>Gửi duyệt POS</strong> để sang «Chờ POS duyệt».</p>
                      <span className="badge bg-success">KH đã ký</span>
                    </>
                  )}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                    <button type="button" className="btn btn-primary btn-sm fw-bold"
                      onClick={() => handleConfirmKhSigned(esignFlowProperty)}>
                      <i className="bi bi-check2-circle me-1"></i>Xác nhận KH đã ký
                    </button>
                  )}
                  {esignFlowProperty.level1_status === 'KH đã ký' && (
                    <button type="button" className="btn btn-success btn-sm fw-bold"
                      onClick={() => handleSendEsignToPos(esignFlowProperty)}>
                      <i className="bi bi-send-check me-1"></i>Gửi duyệt POS
                    </button>
                  )}
                  <button type="button" className="btn btn-outline-secondary btn-sm"
                    onClick={() => { setEsignFlowPropId(null); setShowEsignFlowModal(false); }}>
                    Đóng theo dõi
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">"""

if needle not in text:
    raise SystemExit("needle not found")
text = text.replace(needle, insert, 1)

# myprops row actions
old_actions = """                        {lv1 === 'Mới' && (
                          <button type="button" className="btn btn-sm btn-warning me-1"
                            onClick={() => openDraftModal(p)}>
                            <i className="bi bi-pencil-square me-1"></i>Hoàn thiện hồ sơ
                          </button>
                        )}"""
new_actions = """                        {lv1 === 'Mới' && (
                          <button type="button" className="btn btn-sm btn-warning me-1"
                            onClick={() => openDraftModal(p)}>
                            <i className="bi bi-pencil-square me-1"></i>Hoàn thiện hồ sơ
                          </button>
                        )}
                        {lv1 === 'Chờ KH ký' && (
                          <button type="button" className="btn btn-sm btn-primary me-1"
                            onClick={() => { setEsignFlowPropId(p.id); handleConfirmKhSigned(p); }}>
                            <i className="bi bi-check2-circle me-1"></i>Xác nhận KH đã ký
                          </button>
                        )}
                        {lv1 === 'KH đã ký' && (
                          <button type="button" className="btn btn-sm btn-success me-1"
                            onClick={() => handleSendEsignToPos(p)}>
                            <i className="bi bi-send-check me-1"></i>Gửi duyệt POS
                          </button>
                        )}"""
if old_actions in text:
    text = text.replace(old_actions, new_actions, 1)

# esign modal after branch modal
modal = """
      {/* Modal: Nhánh 1 — Theo dõi eSign (Screen 2.4.4) */}
      {showEsignFlowModal && esignFlowProperty && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <motion className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-pen me-2"></i>Nhánh 1 — Chờ Khách hàng ký HĐMG
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => setShowEsignFlowModal(false)} />
              </motion>
              <div className="modal-body p-4">
                <div className="alert alert-info border-0 mb-3">
                  <strong>{propertyDisplayCode(esignFlowProperty)}</strong> — Trạng thái:{' '}
                  <span className="badge bg-warning text-dark">{esignFlowProperty.level1_status}</span>
                </motion>
                <p className="mb-2">
                  Hệ thống đã gửi <strong>link ký điện tử (eSign)</strong> tới Khách hàng qua Zalo OA / Email (demo).
                </p>
                {esignFlowProperty.esign_link_demo && (
                  <p className="small text-muted">Link demo: <code>{esignFlowProperty.esign_link_demo}</code></p>
                )}
                <p className="small text-muted mb-0">
                  Sau khi KH ký xong, bấm <strong>Xác nhận KH đã ký</strong> → rồi <strong>Gửi duyệt POS</strong>.
                </p>
              </motion>
              <div className="modal-footer border-0 bg-light">
                {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                  <button type="button" className="btn btn-primary fw-bold"
                    onClick={() => handleConfirmKhSigned(esignFlowProperty)}>
                    Xác nhận KH đã ký
                  </button>
                )}
                {esignFlowProperty.level1_status === 'KH đã ký' && (
                  <button type="button" className="btn btn-success fw-bold"
                    onClick={() => handleSendEsignToPos(esignFlowProperty)}>
                    Gửi duyệt POS
                  </button>
                )}
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setShowEsignFlowModal(false); setMainTab('myprops'); }}>
                  Xem trong danh sách
                </button>
              </motion>
            </motion>
          </motion>
        </motion>
      )}
"""
modal = modal.replace("motion", "motion").replace("motion", "motion")
modal = modal.replace("motion", "motion")
# fix all motion to div
import re
modal = re.sub(r"</?motion", lambda m: m.group(0).replace("motion", "div"), modal)
modal = modal.replace("motion", "motion")  # still broken - do manually
modal = """
      {/* Modal: Nhánh 1 — Theo dõi eSign (Screen 2.4.4) */}
      {showEsignFlowModal && esignFlowProperty && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-pen me-2"></i>Nhánh 1 — Chờ Khách hàng ký HĐMG
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => setShowEsignFlowModal(false)} />
              </motion>
              <div className="modal-body p-4">
                <div className="alert alert-info border-0 mb-3">
                  <strong>{propertyDisplayCode(esignFlowProperty)}</strong> — Trạng thái:{' '}
                  <span className="badge bg-warning text-dark">{esignFlowProperty.level1_status}</span>
                </motion>
                <p className="mb-2">
                  Hệ thống đã gửi <strong>link ký điện tử (eSign)</strong> tới Khách hàng qua Zalo OA / Email (demo).
                </p>
                {esignFlowProperty.esign_link_demo && (
                  <p className="small text-muted">Link demo: <code>{esignFlowProperty.esign_link_demo}</code></p>
                )}
                <p className="small text-muted mb-0">
                  Sau khi KH ký xong, bấm <strong>Xác nhận KH đã ký</strong> → rồi <strong>Gửi duyệt POS</strong>.
                </p>
              </motion>
              <div className="modal-footer border-0 bg-light">
                {esignFlowProperty.level1_status === 'Chờ KH ký' && (
                  <button type="button" className="btn btn-primary fw-bold"
                    onClick={() => handleConfirmKhSigned(esignFlowProperty)}>
                    Xác nhận KH đã ký
                  </button>
                )}
                {esignFlowProperty.level1_status === 'KH đã ký' && (
                  <button type="button" className="btn btn-success fw-bold"
                    onClick={() => handleSendEsignToPos(esignFlowProperty)}>
                    Gửi duyệt POS
                  </button>
                )}
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setShowEsignFlowModal(false); setMainTab('myprops'); }}>
                  Xem trong danh sách
                </button>
              </motion>
            </motion>
          </motion>
        </motion>
      )}
"""
modal = modal.replace("motion", "div")

anchor = "      {/* Modal: Chọn nhánh gửi duyệt (FR2-004, FR2-005, FR2-006) */}"
if anchor in text and "showEsignFlowModal" not in text:
    text = text.replace(anchor, modal + "\n" + anchor, 1)

p.write_text(text, encoding="utf-8")
print("OK")
