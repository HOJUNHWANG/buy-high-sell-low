export const metadata = {
  title: "Disclaimer",
};

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 text-gray-300">
      <h1 className="text-3xl font-bold text-white">Disclaimer</h1>
      <p className="text-gray-500 text-sm">Last updated: March 2026</p>

      {/* Financial Disclaimer - prominent red box */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Investment Risk Disclaimer</h2>
        <div
          className="rounded-lg p-4 text-sm leading-relaxed space-y-2"
          style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <p className="font-semibold" style={{ color: "#f87171" }}>
            IMPORTANT — NOT FINANCIAL ADVICE
          </p>
          <p>
            All content on Buy High Sell Low (<a href="https://bhsl.app" className="text-blue-400 hover:underline">bhsl.app</a>)
            is provided for <strong>informational and educational purposes only</strong>. Nothing on
            this website constitutes financial, investment, tax, or legal advice, nor is it a
            recommendation to buy, sell, or hold any security or cryptocurrency.
          </p>
          <p>
            Market data (S&amp;P 500 stocks, ETFs, and cryptocurrencies) may be delayed by up to
            15 minutes. Data is sourced from third-party providers and is provided &quot;as-is&quot;
            without any guarantee of accuracy, completeness, or timeliness.
          </p>
          <p>
            Past performance of any financial instrument is not indicative of future results. All
            investments carry risk, including the possible loss of principal. You should always
            consult a qualified, licensed financial advisor before making any investment decisions.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">AI-Generated Content</h2>
        <p className="text-sm leading-relaxed">
          Buy High Sell Low uses artificial intelligence (Groq / Llama 3.3) to generate news
          summaries and market analysis. This AI-generated content:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Is produced automatically without human review</li>
          <li>May contain factual errors, omissions, or misinterpretations</li>
          <li>Does not represent the views or opinions of Buy High Sell Low</li>
          <li>Must not be relied upon as the sole basis for any financial decision</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Paper Trading Simulator</h2>
        <p className="text-sm leading-relaxed">
          The paper trading feature uses virtual currency ($1,000 starting balance) for educational
          purposes only. Simulated results do not account for real-world factors such as slippage,
          liquidity, market impact, or execution delays. Paper trading performance is not indicative
          of results achievable with real money.
        </p>
      </section>

      {/* Affiliate Disclosure - FTC compliant */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Affiliate &amp; Advertising Disclosure</h2>
        <div
          className="rounded-lg p-4 text-sm leading-relaxed space-y-2"
          style={{ background: "rgba(124,108,252,0.06)", border: "1px solid rgba(124,108,252,0.2)" }}
        >
          <p className="font-semibold" style={{ color: "#7c6cfc" }}>
            FTC DISCLOSURE
          </p>
          <p>
            In accordance with the Federal Trade Commission (FTC) guidelines, Buy High Sell Low
            discloses the following:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              This site displays advertisements served by <strong>Google AdSense</strong>. We earn
              revenue when visitors view or click on these ads.
            </li>
            <li>
              Some links on this site are <strong>affiliate links</strong>, clearly labeled as
              &quot;Sponsored&quot; or &quot;Ad&quot;. If you click on an affiliate link and sign up
              for a product or service, we may receive a commission at no additional cost to you.
            </li>
            <li>
              Affiliate relationships and advertising do <strong>not</strong> influence our editorial
              content, AI-generated analysis, or the data displayed on this site.
            </li>
            <li>
              We only partner with services we believe may be of genuine interest to our users.
              However, we encourage you to do your own research before signing up for any
              third-party service.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Google AdSense</h2>
        <p className="text-sm leading-relaxed">
          This site uses Google AdSense to serve advertisements. Google may use cookies and web
          beacons to serve ads based on your prior visits to this site or other websites. You can
          opt out of personalized advertising by visiting{" "}
          <a
            href="https://www.google.com/settings/ads"
            className="text-blue-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Ads Settings
          </a>
          . For more information, see the{" "}
          <a
            href="https://policies.google.com/technologies/ads"
            className="text-blue-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Advertising Policies
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Third-Party Links</h2>
        <p className="text-sm leading-relaxed">
          This site may contain links to third-party websites, products, or services. Buy High
          Sell Low is not responsible for the content, accuracy, privacy practices, or availability
          of any third-party site. Following any external link is at your own risk.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Limitation of Liability</h2>
        <p className="text-sm leading-relaxed">
          To the maximum extent permitted by applicable law, Buy High Sell Low and its operators
          shall not be liable for any direct, indirect, incidental, consequential, or punitive
          damages arising from your use of or reliance on any content, data, or services provided
          on this site.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Contact</h2>
        <p className="text-sm">
          If you have questions about this disclaimer, contact:{" "}
          <a href="mailto:adind96@gmail.com" className="text-blue-400 hover:underline">
            adind96@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
