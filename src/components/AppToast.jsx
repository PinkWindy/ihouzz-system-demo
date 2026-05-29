import React from 'react';

/**
 * Toast cố định góc màn hình (SRS 2.4.5 / 2.4.10).
 */
export default function AppToast({ toast, onDismiss }) {
  if (!toast) return null;
  const type = toast.type === 'danger' ? 'danger' : toast.type === 'warning' ? 'warning' : 'success';
  const icon =
    type === 'danger'
      ? 'bi-x-octagon-fill'
      : type === 'warning'
        ? 'bi-exclamation-triangle-fill'
        : 'bi-check-circle-fill';

  return (
    <div
      className="position-fixed bottom-0 end-0 p-3"
      style={{ zIndex: 2050, maxWidth: 440, minWidth: 280 }}
      role="alert"
    >
      <div className={`alert alert-${type} shadow-lg mb-0 py-3 pe-2`} style={{ borderRadius: 12 }}>
        <div className="d-flex align-items-start gap-2">
          <i className={`bi ${icon} fs-5 flex-shrink-0 mt-1`} />
          <div className="flex-grow-1 small">
            <p className="mb-0">{toast.msg}</p>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="btn btn-sm btn-outline-dark mt-2 fw-semibold"
                onClick={() => {
                  toast.onAction();
                  onDismiss?.();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-close flex-shrink-0"
            aria-label="Đóng"
            onClick={onDismiss}
          />
        </div>
      </div>
    </div>
  );
}
