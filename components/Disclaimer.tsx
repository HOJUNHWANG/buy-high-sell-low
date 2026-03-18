export function Disclaimer() {
  return (
    <footer className="border-t border-gray-800 py-6 px-4 text-center text-xs text-gray-500">
      <p>
        This service is for informational purposes only and does not constitute
        investment advice.{" "}
        <a href="/privacy" className="underline hover:text-gray-300">
          Privacy Policy
        </a>
      </p>
    </footer>
  );
}
