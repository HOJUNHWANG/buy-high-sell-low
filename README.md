<p align="center">
  <img src="app/icon.svg" width="80" alt="BHSL Logo" />
</p>

<h1 align="center">Buy High Sell Low</h1>

<p align="center">
  <strong>The stock market app for people who like to learn the hard way.</strong>
</p>

<p align="center">
  <a href="https://buyhighselllow.vercel.app">
    <img src="https://img.shields.io/badge/Live-buyhighselllow.vercel.app-black?style=for-the-badge&logo=vercel" alt="Live Demo" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/AI-Groq%20%2F%20Llama%203.3-FF6B35?logo=meta&logoColor=white" alt="Groq" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tests-207-brightgreen?logo=vitest&logoColor=white" alt="Tests" />
</p>

---

## What is this?

A free, real-time US stock market intelligence platform covering **S&P 100 + 19 Cryptocurrencies** — with AI-powered news analysis, paper trading, and a "What If" time machine.

> All data is delayed. Nothing here is investment advice. You will probably lose fake money.

---

## Features

### Market Intelligence
- **120+ tickers** with interactive candlestick charts (1D / 1W / 1M / 3M / 6M / 1Y)
- Screener with market cap sorting, sector tabs, and Top Movers
- Real-time price updates via Twelve Data API

### AI News Analysis
- Aggregated from RSS feeds (CoinTelegraph, CoinDesk, Decrypt) + NewsAPI
- AI-generated summaries, sentiment scores, and caution flags
- Sentiment filtering: bullish / bearish / neutral
- Tiered access with per-article unlock system

### Paper Trading
- **$1,000** starting balance — see how fast you can blow it up
- Long & Short positions with **1-100x leverage**
- Margin trading with real-time liquidation checks
- Weekly Prediction Challenge (5 random picks, up/down bets)
- **38 achievement badges** across 5 tiers (Bronze → Diamond)
- Daily AI portfolio roast & check-in rewards
- Full transaction history with pagination

### What If Calculator
- "What if I bought AAPL in 2005?" — 20+ years of price history
- Save & compare multiple scenarios

### Auth & Access
- Google OAuth via Supabase Auth
- Tiered access: Guest → Free → Premium

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Framework** | Next.js 16 (App Router, Server Components) |
| **Database** | Supabase (PostgreSQL + Row Level Security) |
| **Auth** | Supabase Auth (Google OAuth) |
| **AI** | Groq (Llama 3.3 70B) |
| **Charts** | lightweight-charts v5 |
| **Market Data** | Twelve Data API |
| **Styling** | Tailwind CSS (dark theme) |
| **Testing** | Vitest (207 tests) |
| **Deployment** | Vercel + GitHub Actions |
| **Scripts** | Python (data pipeline, seed, backfill) |

---

## Getting Started

```bash
# Clone
git clone https://github.com/HOJUNHWANG/buy-high-sell-low.git
cd buy-high-sell-low

# Install
npm install

# Environment
cp .env.example .env.local
# Fill in your Supabase, Groq, and Twelve Data credentials

# Run
npm run dev

# Test
npm test
```

### Environment Variables

| Variable | Required | Description |
|:---------|:--------:|:------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `GROQ_API_KEY` | Yes | Groq API key (AI summaries) |
| `TWELVE_DATA_API_KEY` | Yes | Twelve Data (market prices) |
| `NEWSAPI_KEY` | Yes | NewsAPI (news aggregation) |
| `FMP_API_KEY` | No | Financial Modeling Prep |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | No | Google AdSense |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry error monitoring |

---

## Data Pipeline

Automated via GitHub Actions cron jobs:

| Script | Schedule | Purpose |
|:-------|:---------|:--------|
| `fetch_prices.py` | Every 15 min (market hours) | Stock + crypto prices |
| `fetch_news.py` | Every 30 min | News aggregation + AI summarization |
| `update_market_caps.py` | Daily | Market cap refresh |
| `cleanup.py` | Daily | Data retention (400d prices, 90d news) |

---

## Project Structure

```
app/
├── page.tsx                    # Home (hero + dashboard)
├── stock/[ticker]/             # Stock detail (chart, news, trade CTA)
├── stocks/                     # Screener (stocks / ETFs / crypto tabs)
├── news/                       # News feed with sentiment filter
├── paper/                      # Paper trading dashboard
│   ├── trade/[ticker]/         #   Buy / Sell / Short / Cover
│   ├── history/                #   Transaction history
│   └── leaderboard/            #   Leaderboard
├── whatif/                     # What If calculator
└── api/                        # 17 API routes
components/                     # Reusable UI components
lib/                            # Utilities, types, Supabase clients
scripts/                        # Python data pipeline (13 scripts)
supabase/                       # Schema + RLS policies + migrations
tests/                          # Vitest (12 test suites, 207 tests)
```

---

## Disclaimer

All market data is delayed. AI-generated content is not investment advice. Paper trading uses simulated money only. Past performance does not guarantee future results. This project is for educational and entertainment purposes.

---

<p align="center">
  <sub>Built with caffeine and questionable financial decisions.</sub>
</p>
