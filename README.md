# Buy High Sell Low

A free, real-time US stock market intelligence platform covering **S&P 500**, **ETFs**, and **Crypto** with AI-powered news analysis and paper trading.

**[buyhighselllow.vercel.app](https://buyhighselllow.vercel.app)**

---

## Features

### Market Data
- **500+ stocks** (S&P 500) + **25 ETFs** + **19 cryptocurrencies**
- Interactive candlestick charts (1D / 1W / 1M / 3M / 6M / 1Y)
- Screener with market cap sorting and Top Movers
- Real-time price updates via Twelve Data

### AI News Analysis
- Aggregated news from RSS feeds and NewsAPI
- AI-generated summaries, sentiment scores, and caution flags (Groq / Llama 3.3 70B)
- Related ticker detection for cross-referencing
- Sentiment-based filtering (bullish / bearish / neutral)

### Paper Trading
- Simulated trading with $1,000 starting balance
- Buy/sell with dollar or share amount
- Portfolio tracking with real-time P&L
- Weekly Prediction Challenge (5 stock picks, up/down)
- 33 achievement badges across 5 tiers
- AI portfolio roast (daily)
- Daily check-in rewards
- Transaction history with pagination

### What If Calculator
- Historical "what if I bought X on date Y?" simulations
- 20+ years of price history
- Save and compare scenarios

### Authentication
- Google OAuth via Supabase Auth
- Tiered access (guest / free / premium)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (Google OAuth) |
| AI | Groq (Llama 3.3 70B) |
| Charts | lightweight-charts v5 |
| Market Data | Twelve Data API |
| Styling | Tailwind CSS (dark theme) |
| Testing | Vitest (195 tests) |
| Deployment | Vercel + GitHub Actions |

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your Supabase, Groq, and Twelve Data credentials

# Run development server
npm run dev

# Run tests
npm test
```

---

## Data Pipeline

Automated via GitHub Actions cron jobs:

| Script | Purpose |
|--------|---------|
| `fetch_prices.py` | Stock + ETF + crypto prices (Twelve Data) |
| `fetch_news.py` | News aggregation + AI summarization |
| `cleanup.py` | Data retention (400d history, 90d news) |
| `update_market_caps.py` | Market cap updates |
| `update_logos.py` | Stock & crypto logo refresh |

---

## Project Structure

```
app/
  page.tsx              # Home (hero + dashboard)
  stock/[ticker]/       # Stock detail (chart, news, trade)
  stocks/               # Screener (stocks/ETFs/crypto tabs)
  news/                 # News feed with sentiment filter
  paper/                # Paper trading dashboard
  whatif/               # What If calculator
  api/                  # API routes
components/             # Reusable UI components
lib/                    # Utilities, helpers, config
scripts/                # Python data pipeline
tests/                  # Vitest test suites
supabase/               # Schema + RLS policies
```

---

## License

This project is for personal/educational use.

---

> **Disclaimer**: All market data is delayed. AI-generated content is not investment advice. Paper trading uses simulated money only.
