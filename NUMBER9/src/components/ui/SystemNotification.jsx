import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";

export default function SystemNotification() {
  const notification = useStore((s) => s.systemNotification);
  const clear = useStore((s) => s.clearSystemNotification);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) return;
    setVisible(true);
    let timer;
    let cleanupTimer;
    timer = setTimeout(() => {
      setVisible(false);
      cleanupTimer = setTimeout(clear, 300);
    }, 5000);
    return () => {
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
    };
  }, [notification, clear]);

  if (!notification) return null;

  return (
    <div className={`fixed top-[max(4.5rem,calc(4rem+env(safe-area-inset-top)))] right-4 z-40 lg:top-4 transition-all duration-300 ${visible ? 'animate-slide-in opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}>
      <div className="max-w-sm rounded-xl border border-white/10 bg-[#1a1a2e]/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{notification.title}</p>
            <p className="mt-1 text-xs text-white/60">{notification.message}</p>
          </div>
          <button
            onClick={() => { setVisible(false); setTimeout(clear, 300); }}
            className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
