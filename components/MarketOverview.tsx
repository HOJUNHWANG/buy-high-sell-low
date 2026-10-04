import Link from "next/link";
import { getAllStockPrices } from "@/lib/cached-data";
import { formatAssetPrice } from "@/lib/price-format";
import { getMarketStatus } from "@/lib/market-hours";

export async function MarketOverview() {
  const prices = await getAllStockPrices().catch(() => []);
  const status = getMarketStatus();
  const instruments = [
    { ticker: "SPY", label: "S&P 500 ETF", type: "US equities" },
    { ticker: "QQQ", label: "Nasdaq 100 ETF", type: "US equities" },
    { ticker: "BTC-USD", label: "Bitcoin", type: "Crypto · 24/7" },
    { ticker: "ETH-USD", label: "Ethereum", type: "Crypto · 24/7" },
  ];
  return <section className="market-overview design-v2-only" aria-label="Market overview">
    <div className="overview-intro">
      <div><p className="page-kicker">THE BIG PICTURE</p><h1>Your market.<br /><span>In focus.</span></h1><p>Follow the moves. Understand the story. Make your next move.</p><div className="overview-session"><span className={status.isOpen ? "is-open" : ""} />{status.isOpen ? "US market open" : "US market closed"}<span className="overview-session-divider">/</span>Crypto & Fictional · 24/7</div></div>
      <Link href="/paper" className="overview-practice-card"><div className="overview-practice-top"><span>PAPER TRADING</span><span aria-hidden="true">↗</span></div><strong>Ideas deserve<br />a practice run.</strong><p>Stocks, crypto and Fictional.<br />One place to build your portfolio.</p><span className="overview-practice-cta">Open your trading desk <span aria-hidden="true">→</span></span></Link>
    </div>
    <div className="overview-quotes">
      {instruments.map((instrument) => {
        const quote = prices.find((row) => row.ticker === instrument.ticker);
        const change = quote?.change_pct;
        return <Link key={instrument.ticker} href={`/stock/${instrument.ticker}`} className="overview-quote card-clickable">
          <div className="overview-quote-label"><span>{instrument.label}</span><span aria-hidden="true">↗</span></div>
          <strong className="stat-value">{quote ? formatAssetPrice(quote.price, instrument.ticker) : "—"}</strong>
          <div className="overview-quote-bottom"><span style={{ color: change == null ? "var(--text-3)" : change >= 0 ? "var(--up)" : "var(--down)" }}>{change == null ? "Quote unavailable" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span><span>{instrument.type}</span></div>
          <p className="overview-quote-time">{quote ? `As of ${new Date(quote.fetched_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET` : "Waiting for market data"}</p>
        </Link>;
      })}
    </div>
  </section>;
}
