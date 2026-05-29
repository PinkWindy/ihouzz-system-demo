import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MS = 10000;

/**
 * Toast góc màn hình — dùng kèm <AppToast />.
 */
export function useAppToast(autoDismissMs = DEFAULT_MS) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    ({ msg, type = 'success', actionLabel, onAction, durationMs }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ msg, type, actionLabel, onAction });
      const ms = durationMs ?? (actionLabel ? autoDismissMs + 4000 : autoDismissMs);
      if (ms > 0) {
        timerRef.current = setTimeout(() => setToast(null), ms);
      }
    },
    [autoDismissMs],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast, dismissToast };
}
