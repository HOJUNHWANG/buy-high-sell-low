export const metadata = {
  title: "Terms of Use",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 text-gray-300">
      <h1 className="text-3xl font-bold text-white">Terms of Use</h1>
      <p className="text-gray-500 text-sm">Last updated: March 2026</p>
      <p className="text-sm leading-relaxed">
        Please read these Terms of Use carefully before using Buy High Sell Low. By accessing or
        using this service, you agree to be bound by these terms. If you do not agree, do not
        use the service.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">1. Not Financial Advice</h2>
        <div
          className="rounded-lg p-4 text-sm leading-relaxed space-y-2"
          style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <p className="font-semibold" style={{ color: "#f87171" }}>
            IMPORTANT — INVESTMENT RISK DISCLAIMER
          </p>
          <p>
            Buy High Sell Low provides market data, news aggregation, and AI-generated content for
            <strong> informational and educational purposes only</strong>. Nothing on this site
            constitutes or should be construed as financial, investment, tax, or legal advice.
          </p>
          <p>
            AI-generated summaries and analysis are produced by automated systems and may be
            inaccurate, incomplete, or outdated. They do not reflect the views of Buy High Sell Low
            and must not be relied upon as the basis for any investment decision.
          </p>
          <p>
            Past performance of any financial instrument is not indicative of future results.
            All investments carry risk, including the possible loss of principal. Always consult
            a qualified, licensed financial advisor before making investment decisions.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">2. Data Accuracy &amp; Delays</h2>
        <p className="text-sm leading-relaxed">
          Market prices, percentage changes, and financial data displayed on Buy High Sell Low may
          be delayed by up to 15 minutes or more. Data is sourced from third-party providers
          (Twelve Data, NewsAPI) and is provided &quot;as-is&quot; without warranty of accuracy,
          completeness, or timeliness. Buy High Sell Low covers S&amp;P 100 stocks and
          cryptocurrencies. ETFs are available for data viewing only and are excluded from paper
          trading and the What If calculator. Buy High Sell Low makes no guarantees about the reliability of market
          data and is not liable for decisions made based on information displayed on this site.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">3. AI-Generated Content</h2>
        <p className="text-sm leading-relaxed">
          Buy High Sell Low uses Groq (Llama 3.3) to generate AI summaries and analysis of news
          articles. These summaries:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Are generated automatically and have not been reviewed by a human</li>
          <li>May contain factual errors, omissions, or misinterpretations</li>
          <li>Do not constitute investment advice or recommendations</li>
          <li>Are limited to 30 requests per user per day to ensure fair use</li>
        </ul>
        <p className="text-sm">
          Buy High Sell Low is not responsible for any actions taken based on AI-generated content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">4. Paper Trading Simulator</h2>
        <p className="text-sm leading-relaxed">
          Buy High Sell Low offers a paper trading simulator that uses virtual currency (starting
          balance of $1,000) for educational purposes. Paper trading results:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Use real market prices but simulate trades with virtual money only</li>
          <li>Do not reflect actual market conditions such as slippage, liquidity, or order execution</li>
          <li>Are not indicative of future results with real money</li>
          <li>Should not be used as a basis for real investment decisions</li>
        </ul>
        <p className="text-sm">
          Achievements, rewards, and leaderboard positions are purely for entertainment and
          have no monetary value.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">5. Acceptable Use</h2>
        <p className="text-sm">By using Buy High Sell Low, you agree not to:</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Scrape, crawl, or systematically extract data from the site without prior written consent</li>
          <li>Attempt to reverse-engineer, decompile, or exploit any part of the platform</li>
          <li>Use automated bots to abuse the AI summary feature or API endpoints</li>
          <li>Use the service for any unlawful purpose or in violation of applicable laws</li>
          <li>Impersonate other users or attempt to gain unauthorised access to other accounts</li>
          <li>Distribute malware or attempt to disrupt the availability of the service (DDoS)</li>
        </ul>
        <p className="text-sm">
          We reserve the right to suspend or terminate access to any user who violates these terms
          without prior notice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">6. User Accounts</h2>
        <p className="text-sm leading-relaxed">
          You are responsible for maintaining the security of your account credentials. You agree
          to notify us immediately at{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>{" "}
          if you suspect unauthorised access to your account. Buy High Sell Low is not liable for any
          losses resulting from unauthorised account use.
        </p>
        <p className="text-sm">
          We reserve the right to terminate accounts that are inactive for more than 24 months
          or that are found to be in violation of these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">7. Affiliate Links &amp; Third-Party Sites</h2>
        <p className="text-sm leading-relaxed">
          Buy High Sell Low may display links to third-party websites, including affiliate partners
          (clearly labelled &quot;Sponsored&quot;). We may earn a commission if you sign up or make a
          purchase through such links. We are not responsible for the content, privacy practices,
          or services of any third-party sites. Following an affiliate link and signing up with
          a partner is entirely at your own risk.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">8. Intellectual Property</h2>
        <p className="text-sm leading-relaxed">
          The Buy High Sell Low brand, logo, and original content (excluding third-party news and
          financial data) are owned by or licensed to Buy High Sell Low. You may not reproduce,
          distribute, or create derivative works from our content without explicit written
          permission. News articles displayed are the property of their respective publishers
          and are linked to, not reproduced in full.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">9. Limitation of Liability</h2>
        <p className="text-sm leading-relaxed">
          To the maximum extent permitted by applicable law, Buy High Sell Low and its operators
          shall not be liable for any direct, indirect, incidental, consequential, or punitive
          damages arising from:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Use of or inability to use the service</li>
          <li>Investment decisions made based on content displayed on this site</li>
          <li>Inaccurate, delayed, or missing financial data</li>
          <li>AI-generated content that proves to be incorrect or misleading</li>
          <li>Unauthorised access to your account</li>
        </ul>
        <p className="text-sm">
          Your sole remedy for dissatisfaction with the service is to stop using it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">10. Disclaimer of Warranties</h2>
        <p className="text-sm leading-relaxed">
          Buy High Sell Low is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
          express or implied. We do not warrant that the service will be uninterrupted,
          error-free, or free of viruses or other harmful components. We disclaim all implied
          warranties, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">11. Governing Law</h2>
        <p className="text-sm leading-relaxed">
          These Terms are governed by and construed in accordance with applicable law. Any
          disputes arising from these Terms or your use of Buy High Sell Low shall be resolved through
          good-faith negotiation. If unresolved, disputes shall be subject to the exclusive
          jurisdiction of the courts in the operator&apos;s country of residence.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">12. Changes to These Terms</h2>
        <p className="text-sm leading-relaxed">
          We reserve the right to modify these Terms at any time. Material changes will be
          reflected in the &quot;Last updated&quot; date above. Continued use of the service after
          changes take effect constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">13. Contact</h2>
        <p className="text-sm">
          For questions about these Terms, contact:{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
