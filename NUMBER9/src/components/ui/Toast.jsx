import { useEffect } from "react";
import { TOAST_DURATION_MS } from "../../constants";

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timerId = setTimeout(() => onClose?.(), TOAST_DURATION_MS);
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
    <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-6 py-3 text-sm font-semibold ${typeClass}`}>
      {toast.text}
    </div>
  );
}
