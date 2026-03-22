export default function WhatIfLoading() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="skeleton h-9 w-40 mx-auto" />
        <div className="skeleton h-4 w-72 mx-auto" />
      </div>
      <div className="card rounded-xl p-5 space-y-4">
        <div className="skeleton h-10 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
        </div>
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}
