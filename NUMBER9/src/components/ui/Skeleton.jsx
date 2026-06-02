// Skeleton loaders for loading states
export function SkeletonCard({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 rounded-xl border border-[#1f2128] bg-[#0c0e14] p-4 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-[#1f2128]" />
      ))}
    </div>
  );
}

export function SkeletonInput({ className = "" }) {
  return (
    <div className={`h-11 animate-pulse rounded-xl border border-[#1f2128] bg-[#0c0e14] ${className}`} />
  );
}

export function SkeletonButton({ className = "" }) {
  return (
    <div className={`h-12 animate-pulse rounded-xl bg-[#1f2128] ${className}`} />
  );
}

export function SkeletonList({ items = 3, className = "" }) {
  return (
    <div className={`space-y-2 rounded-xl border border-[#1f2128] bg-[#0c0e14] divide-y divide-[#1f2128] overflow-hidden ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="p-4 space-y-2">
          <div className="h-4 animate-pulse rounded bg-[#1f2128]" />
          <div className="h-3 animate-pulse rounded bg-[#1f2128] w-2/3" />
        </div>
      ))}
    </div>
  );
}
