import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p
        className="text-6xl font-bold tabular-nums"
        style={{ color: "var(--accent)", opacity: 0.3 }}
      >
        404
      </p>
      <h1 className="text-lg font-semibold mt-4" style={{ color: "var(--text)" }}>
        Page not found
      </h1>
      <p className="text-sm mt-2 max-w-sm" style={{ color: "var(--text-3)" }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex items-center gap-3 mt-6">
        <Link
          href="/"
          className="text-xs font-semibold px-4 py-2 rounded-lg"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Go home
        </Link>
        <Link
          href="/stocks"
          className="text-xs font-medium px-4 py-2 rounded-lg"
          style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}
        >
          Browse stocks
        </Link>
      </div>
    </div>
  );
}
