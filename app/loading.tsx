export default function HomeLoading() {
  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      {/* Movers skeleton */}
      <div className="mb-10">
        <div className="skeleton h-3 w-28 mb-4" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="skeleton w-5 h-5 rounded" />
                <div className="skeleton h-3 w-12" />
              </div>
              <div className="space-y-1.5">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* News skeleton */}
      <div>
        <div className="skeleton h-3 w-24 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
              <div className="flex gap-3">
                <div className="skeleton w-0.5 h-20 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="skeleton h-3 w-12 rounded" />
                    <div className="skeleton h-3 w-16 rounded" />
                  </div>
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-3 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
