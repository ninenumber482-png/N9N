import { useEffect, useRef } from "react";
import { TOAST_DURATION_MS } from "../../constants";

export default function Toast({ toast, onClose }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!toast) return;
    const timerId = setTimeout(() => onCloseRef.current?.(), TOAST_DURATION_MS);
    return () => clearTimeout(timerId);
  }, [toast]);

  if (!toast) return null;

  // Three severities: 'ok' (success), 'err' (failure), 'warn' (advisory).
  // 'warn' uses the yellow accent to match the platform palette.
  const typeClass =
    toast.type === "ok"   ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400" :
    toast.type === "warn" ? "border border-yellow-400/30 bg-yellow-400/15 text-yellow-300"     :
                            "border border-red-500/30 bg-red-500/20 text-red-400";

  return (
    <div className={`fixed bottom-[max(6rem,calc(5.5rem+env(safe-area-inset-bottom)))] right-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg px-4 py-3 text-sm font-semibold shadow-lg lg:bottom-6 lg:right-6 lg:max-w-sm ${typeClass}`}>
      {toast.text}
    </div>
  );
}
