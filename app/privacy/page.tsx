export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 text-gray-300">
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="text-gray-500 text-sm">Last updated: March 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
        <p>We collect the following information when you use GlobalStock:</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Email address (when you create an account)</li>
          <li>Usage logs (pages visited, features used, stocks viewed)</li>
          <li>Cookies and similar tracking technologies</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>To provide and improve the service</li>
          <li>To send service-related emails (account confirmation, etc.)</li>
          <li>To enforce usage limits (AI summary rate limiting)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">3. Third-Party Services</h2>
        <p className="text-sm">We use the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            <strong>Google AdSense</strong>: Serves advertisements. Google may use cookies
            to show personalized ads. See{" "}
            <a
              href="https://policies.google.com/technologies/ads"
              className="text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google&apos;s advertising policies
            </a>
            .
          </li>
          <li>
            <strong>Supabase</strong>: Database and authentication provider.
          </li>
          <li>
            <strong>Anthropic Claude</strong>: AI analysis generation.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">4. Data Sharing</h2>
        <p className="text-sm">
          We do not sell your personal data. We share data only with third-party service
          providers necessary to operate the service (listed above).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">5. Cookies</h2>
        <p className="text-sm">
          We use cookies for authentication and to enable Google AdSense personalized
          advertising. You can opt out of personalized ads via Google&apos;s Ad Settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">6. Contact</h2>
        <p className="text-sm">
          For privacy inquiries, contact:{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
