"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p
        className="text-5xl font-bold"
        style={{ color: "var(--down)", opacity: 0.3 }}
      >
        Oops
      </p>
      <h1 className="text-lg font-semibold mt-4" style={{ color: "var(--text)" }}>
        Something went wrong
      </h1>
      <p className="text-sm mt-2 max-w-sm" style={{ color: "var(--text-3)" }}>
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Try again
      </button>
    </div>
  );
}
