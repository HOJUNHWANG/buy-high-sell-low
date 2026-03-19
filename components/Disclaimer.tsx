export function Disclaimer() {
  return (
    <footer
      className="px-5 py-5 text-center text-xs"
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}
    >
      For informational purposes only. Not investment advice.{" "}
      <a href="/privacy" className="nav-link">
        Privacy Policy
      </a>
    </footer>
  );
}
