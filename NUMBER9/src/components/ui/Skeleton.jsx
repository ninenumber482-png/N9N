export function Shimmer({ className = "" }) {
  return <div className={`animate-shimmer rounded ${className}`} />;
}

function ShimmerCard({ className = "" }) {
  return (
    <div className={`rounded-xl border border-[#1f2128] bg-[#0c0e14] p-4 space-y-3 ${className}`}>
      <Shimmer className="h-5 w-2/5" />
      <Shimmer className="h-8 w-3/5" />
      <Shimmer className="h-4 w-full" />
    </div>
  );
}

export function SkeletonCard({ lines = 3, className = "" }) {
  return (
    <div className={`rounded-xl border border-[#1f2128] bg-[#0c0e14] p-4 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i} className={`h-4 mb-2 ${i === lines - 1 ? "w-3/5" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonInput({ className = "" }) {
  return <Shimmer className={`h-11 rounded-xl border border-[#1f2128] ${className}`} />;
}

export function SkeletonButton({ className = "" }) {
  return <Shimmer className={`h-12 rounded-xl ${className}`} />;
}

export function SkeletonList({ items = 3, className = "" }) {
  return (
    <div className={`rounded-xl border border-[#1f2128] bg-[#0c0e14] divide-y divide-[#1f2128] overflow-hidden ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="p-4 space-y-2">
          <Shimmer className="h-4 w-4/5" />
          <Shimmer className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ className = "" }) {
  return <Shimmer className={`rounded-full ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Shimmer className="h-3 w-48 mb-3" />
        <div className="flex items-baseline gap-3">
          <Shimmer className="h-12 w-40" />
          <Shimmer className="h-6 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ShimmerCard />
        <ShimmerCard />
      </div>
      <div className="flex gap-3">
        <Shimmer className="h-10 w-28 rounded-lg" />
        <Shimmer className="h-10 w-28 rounded-lg" />
        <Shimmer className="h-10 w-28 rounded-lg" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <Shimmer className="h-5 w-40" />
          <Shimmer className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-[#0c0e14] border border-[#1f2128]">
              <div className="flex items-center gap-4">
                <Shimmer className="h-4 w-10" />
                <div>
                  <Shimmer className="h-4 w-48 mb-1" />
                  <Shimmer className="h-3 w-24" />
                </div>
              </div>
              <Shimmer className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({ type = "dashboard" }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pt-4 sm:px-6 sm:pt-8 lg:px-10 lg:py-10">
      <div className="flex items-center justify-between">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-8 w-32 rounded-lg" />
      </div>
      {type === "dashboard" ? <DashboardSkeleton /> : (
        <div className="space-y-4">
          {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
        </div>
      )}
    </div>
  );
}
