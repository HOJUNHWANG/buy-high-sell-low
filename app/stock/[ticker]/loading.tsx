export default function StockLoading() {
  return (
    <div className="max-w-7xl mx-auto px-5 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <div className="skeleton h-5 w-40" />
              <div className="skeleton h-3 w-28" />
            </div>
          </div>
          {/* Price */}
          <div className="rounded-xl p-5 space-y-2" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-baseline gap-3">
              <div className="skeleton h-10 w-32" />
              <div className="skeleton h-6 w-20" />
            </div>
            <div className="skeleton h-3 w-48" />
          </div>
          {/* Chart */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
              {["1D","1W","1M","1Y"].map((r) => (
                <div key={r} className="skeleton h-6 w-8 rounded-md" />
              ))}
            </div>
            <div className="skeleton" style={{ height: 260 }} />
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-2">
          <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--border)" }}>
            <div className="skeleton h-3 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="skeleton h-3 w-16" />
                <div className="skeleton h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
