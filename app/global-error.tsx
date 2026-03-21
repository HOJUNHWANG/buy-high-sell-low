"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#080808",
          color: "#f0f0f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <p style={{ fontSize: "48px", fontWeight: 700, color: "#f87171", opacity: 0.3 }}>
            Error
          </p>
          <h1 style={{ fontSize: "18px", fontWeight: 600, marginTop: "16px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "14px", color: "#444", marginTop: "8px", maxWidth: "320px" }}>
            A critical error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "24px",
              fontSize: "12px",
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#7c6cfc",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
