export default function StocksLoading() {
  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="mb-6">
        <div className="skeleton h-5 w-36 rounded mb-2" />
        <div className="skeleton h-3 w-64 rounded" />
      </div>

      {/* Controls skeleton */}
      <div className="flex gap-3 mb-4">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-8 w-20 rounded-lg ml-auto" />
      </div>

      {/* Sector tabs skeleton */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-md" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-2.5" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="skeleton h-3 w-4 rounded" />
            <div className="flex items-center gap-2">
              <div className="skeleton h-5 w-5 rounded" />
              <div className="skeleton h-3 w-10 rounded" />
            </div>
            <div className="skeleton h-3 w-32 rounded hidden sm:block" />
            <div className="skeleton h-3 w-20 rounded hidden md:block" />
            <div className="skeleton h-3 w-16 rounded ml-auto" />
            <div className="skeleton h-5 w-16 rounded" />
            <div className="skeleton h-3 w-12 rounded hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
