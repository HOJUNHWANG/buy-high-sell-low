export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 text-gray-300">
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="text-gray-500 text-sm">Last updated: March 2026</p>
      <p className="text-sm leading-relaxed">
        Buy High Sell Low (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates this website as an informational
        platform for US stock market data. This Privacy Policy explains how we collect, use,
        and protect your information when you visit Buy High Sell Low.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
        <p className="text-sm">We collect the following information when you use Buy High Sell Low:</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Email address (when you create an account or sign in via Google)</li>
          <li>Usage logs (pages visited, features used, stocks viewed, AI summaries requested)</li>
          <li>Watchlist data (tickers you choose to save)</li>
          <li>Cookies and similar tracking technologies (see Section 5)</li>
          <li>
            Device and browser information collected automatically by third-party services
            (Google AdSense, Supabase)
          </li>
        </ul>
        <p className="text-sm">
          We do not collect financial account information, payment details, or government IDs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>To provide, maintain, and improve the service</li>
          <li>To authenticate your account and secure your session</li>
          <li>To send transactional emails (account confirmation, password reset)</li>
          <li>To enforce usage limits (AI summary: 30 requests/user/day)</li>
          <li>To serve relevant advertisements via Google AdSense</li>
          <li>To detect and prevent abuse, spam, or unauthorized access</li>
        </ul>
        <p className="text-sm">
          We do not use your information to make automated trading decisions or provide
          investment recommendations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">3. Data Retention</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Account data: retained while your account is active</li>
          <li>Watchlist data: deleted when you remove items or delete your account</li>
          <li>Stock price history: 90 days rolling retention</li>
          <li>News articles: 90 days rolling retention (older articles are automatically deleted)</li>
          <li>AI usage logs: 12 months</li>
          <li>Fetch/error logs: 90 days</li>
        </ul>
        <p className="text-sm">
          To request deletion of your account and associated data, contact us at{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
          . We will process deletion requests within 30 days.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">4. Third-Party Services</h2>
        <p className="text-sm">We use the following third-party services which may collect data independently:</p>
        <ul className="list-disc list-inside space-y-2 text-sm">
          <li>
            <strong>Supabase</strong>: Authentication and database provider. Stores your email,
            watchlist, and usage data. Hosted in the EU (Ireland).{" "}
            <a href="https://supabase.com/privacy" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              Supabase Privacy Policy
            </a>
          </li>
          <li>
            <strong>Google AdSense</strong>: Serves advertisements and may use cookies to show
            personalized ads based on your browsing behaviour.{" "}
            <a href="https://policies.google.com/technologies/ads" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              Google Advertising Policies
            </a>
          </li>
          <li>
            <strong>Groq</strong>: Generates AI summaries of news articles using the Llama 3.3
            model. Article titles and content snippets are sent to Groq&apos;s API.{" "}
            <a href="https://groq.com/privacy-policy/" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              Groq Privacy Policy
            </a>
          </li>
          <li>
            <strong>Twelve Data / NewsAPI</strong>: Financial data and news providers.
            No personal data is shared with these services.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">5. Cookies</h2>
        <div className="text-sm space-y-2">
          <p>We use the following categories of cookies:</p>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  <th className="text-left px-3 py-2 text-gray-400">Cookie</th>
                  <th className="text-left px-3 py-2 text-gray-400">Purpose</th>
                  <th className="text-left px-3 py-2 text-gray-400">Required</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Supabase auth token", "Keeps you logged in",               "Yes"],
                  ["cookie_consent",      "Remembers your cookie preference",  "Yes"],
                ].map(([name, purpose, req]) => (
                  <tr key={name} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td className="px-3 py-2 text-gray-300 font-mono">{name}</td>
                    <td className="px-3 py-2 text-gray-400">{purpose}</td>
                    <td className="px-3 py-2 text-gray-400">{req}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We use only essential cookies required to operate the service. No advertising or
            analytics cookies are currently in use.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">6. Data Sharing</h2>
        <p className="text-sm">
          We do not sell, rent, or trade your personal data. We share data only with the
          third-party service providers listed in Section 4, strictly to operate the service.
          We may disclose data if required by law, court order, or to protect our legal rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">7. Affiliate Disclosure</h2>
        <p className="text-sm">
          Buy High Sell Low participates in affiliate programmes. Some links on this site (clearly
          labelled &quot;Sponsored&quot;) are affiliate links. If you click and open an account, we may
          receive a commission at no additional cost to you. We only include affiliate links
          for services we believe may be of genuine interest. Affiliate relationships do not
          influence editorial content or AI analysis results.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">8. Your Rights (GDPR)</h2>
        <p className="text-sm">
          If you are located in the European Economic Area (EEA) or United Kingdom, you have
          the following rights under the General Data Protection Regulation (GDPR):
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>Right of access</strong>: Request a copy of the data we hold about you</li>
          <li><strong>Right to rectification</strong>: Correct inaccurate or incomplete data</li>
          <li><strong>Right to erasure</strong>: Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
          <li><strong>Right to restriction</strong>: Limit how we process your data</li>
          <li><strong>Right to data portability</strong>: Receive your data in a structured, machine-readable format</li>
          <li><strong>Right to object</strong>: Object to processing based on legitimate interests</li>
        </ul>
        <p className="text-sm">
          To exercise any of these rights, email{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>{" "}
          with your request. We will respond within 30 days.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">9. California Privacy Rights (CCPA)</h2>
        <p className="text-sm">
          If you are a California resident, you have additional rights under the California
          Consumer Privacy Act (CCPA):
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>The right to know what personal information we collect and how it is used</li>
          <li>The right to delete personal information we have collected</li>
          <li>The right to opt out of the sale of personal information (we do not sell data)</li>
          <li>The right to non-discrimination for exercising your privacy rights</li>
        </ul>
        <p className="text-sm">
          To submit a CCPA request, contact{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">10. Security</h2>
        <p className="text-sm">
          We implement reasonable technical and organisational measures to protect your data,
          including encrypted connections (HTTPS/TLS), row-level security on our database,
          and bcrypt-based authentication via Supabase. However, no system is completely
          secure. You are responsible for maintaining the confidentiality of your account
          credentials.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">11. Children&apos;s Privacy</h2>
        <p className="text-sm">
          Buy High Sell Low is not directed at children under the age of 13 (or 16 in the EEA).
          We do not knowingly collect personal information from children. If you believe a
          child has provided us with their data, contact us and we will delete it promptly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">12. Changes to This Policy</h2>
        <p className="text-sm">
          We may update this Privacy Policy from time to time. Material changes will be
          indicated by updating the &quot;Last updated&quot; date above. Continued use of the service
          after changes constitutes acceptance of the revised policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">13. Contact</h2>
        <p className="text-sm">
          For any privacy-related questions, data requests, or complaints, please contact:
        </p>
        <p className="text-sm">
          <strong className="text-white">Buy High Sell Low</strong>
          <br />
          Email:{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
