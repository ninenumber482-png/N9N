export function DarkCard({ header, icon: Icon, children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14] ${className}`}>
      {header && (
        <div className="border-b border-[#1f2128] px-4 py-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-yellow-400" />}
            <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-400">
              {header}
            </p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

