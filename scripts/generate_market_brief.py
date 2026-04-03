"""
generate_market_brief.py — Generate a daily AI market brief.
Schedule: once daily after market close (e.g. 22:00 UTC = 5PM ET + buffer)
Can also run more frequently — output is upserted so reruns overwrite today's entry.

Usage:
  python scripts/generate_market_brief.py
"""
import os
import json
import time
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client
from groq import Groq

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
groq = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_movers(limit: int = 8) -> tuple[list[dict], list[dict]]:
    """Fetch top gainers and losers from stock_prices (excludes stablecoins/ETFs)."""
    result = supabase.table("stock_prices") \
        .select("ticker, price, change_pct") \
        .not_.is_("change_pct", "null") \
        .neq("ticker", "USDT-USD") \
        .execute()

    prices = sorted(
        [r for r in result.data if r["change_pct"] is not None],
        key=lambda x: x["change_pct"],
    )

    # Get stock names
    all_tickers = [r["ticker"] for r in prices]
    names_res = supabase.table("stocks").select("ticker, name").in_("ticker", all_tickers).execute()
    name_map = {r["ticker"]: r["name"] for r in (names_res.data or [])}

    def enrich(rows: list[dict]) -> list[dict]:
        return [
            {
                "ticker": r["ticker"],
                "name": name_map.get(r["ticker"], r["ticker"]),
                "price": r["price"],
                "change_pct": r["change_pct"],
            }
            for r in rows
        ]

    losers  = enrich(prices[:limit])
    gainers = enrich(list(reversed(prices[-limit:])))
    return gainers, losers


def fetch_recent_news(hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    result = supabase.table("news_articles") \
        .select("title, ai_sentiment, related_tickers") \
        .gte("published_at", since) \
        .not_.is_("title", "null") \
        .order("published_at", desc=True) \
        .limit(60) \
        .execute()
    return result.data or []


def fetch_crypto_prices() -> list[dict]:
    crypto_tickers = [
        "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD",
        "DOGE-USD", "ADA-USD", "AVAX-USD",
    ]
    result = supabase.table("stock_prices") \
        .select("ticker, price, change_pct") \
        .in_("ticker", crypto_tickers) \
        .execute()
    return result.data or []


def compute_sentiment_breakdown(news: list[dict]) -> dict:
    counts = {"positive": 0, "neutral": 0, "negative": 0, "unknown": 0}
    for n in news:
        s = n.get("ai_sentiment") or "unknown"
        counts[s if s in counts else "unknown"] += 1
    total = max(sum(counts.values()), 1)
    return {k: round(v / total * 100) for k, v in counts.items()}


def generate_brief(gainers: list[dict], losers: list[dict],
                   news: list[dict], crypto: list[dict]) -> dict:
    if not groq:
        return {}

    gainers_str = "\n".join(
        f"  {g['ticker']} ({g['name']}): {'+' if g['change_pct'] >= 0 else ''}{g['change_pct']:.2f}% @ ${g['price']:.2f}"
        for g in gainers[:5]
    )
    losers_str = "\n".join(
        f"  {l['ticker']} ({l['name']}): {l['change_pct']:.2f}% @ ${l['price']:.2f}"
        for l in losers[:5]
    )
    crypto_str = "\n".join(
        f"  {c['ticker']}: {'+' if (c['change_pct'] or 0) >= 0 else ''}{(c['change_pct'] or 0):.2f}% @ ${c['price']:.2f}"
        for c in crypto
    )
    headlines = "\n".join(f"- {n['title']}" for n in news[:20])

    prompt = f"""You are a senior market analyst writing a professional end-of-day market brief for {TODAY}.

TOP GAINERS:
{gainers_str or "No data"}

TOP LOSERS:
{losers_str or "No data"}

CRYPTO:
{crypto_str or "No data"}

KEY HEADLINES ({len(news)} total today):
{headlines or "No headlines"}

Write a professional market brief in JSON:
{{
  "headline": "one compelling headline summarizing the day (max 15 words)",
  "overall_sentiment": "bullish|bearish|neutral",
  "summary": "3-4 sentence narrative overview of today's market action, connecting the major themes",
  "bullets": [
    "key takeaway or market-moving event 1",
    "key takeaway or market-moving event 2",
    "key takeaway or market-moving event 3",
    "key takeaway or market-moving event 4",
    "key takeaway or market-moving event 5"
  ],
  "crypto_notes": "2-3 sentence overview of crypto market performance today",
  "sector_notes": "1 sentence each on notable sector trends observed"
}}"""

    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(msg.choices[0].message.content or "{}")
    except Exception as e:
        print(f"  Groq error: {e}")
        return {}


def main():
    print(f"Generating market brief for {TODAY}...")

    gainers, losers = fetch_movers()
    print(f"  Movers: {len(gainers)} gainers, {len(losers)} losers")

    news = fetch_recent_news(hours=24)
    print(f"  News: {len(news)} articles in last 24h")

    crypto = fetch_crypto_prices()
    print(f"  Crypto: {len(crypto)} prices")

    sentiment_breakdown = compute_sentiment_breakdown(news)
    print(f"  Sentiment: {sentiment_breakdown}")

    brief = generate_brief(gainers, losers, news, crypto)
    if not brief:
        print("  AI generation failed — storing raw data only")

    row = {
        "date":                TODAY,
        "headline":            brief.get("headline", f"Market Update — {TODAY}"),
        "overall_sentiment":   brief.get("overall_sentiment", "neutral"),
        "summary":             brief.get("summary", ""),
        "bullets":             brief.get("bullets", []),
        "crypto_notes":        brief.get("crypto_notes", ""),
        "sector_notes":        brief.get("sector_notes", ""),
        "top_gainers":         gainers[:5],
        "top_losers":          losers[:5],
        "sentiment_breakdown": sentiment_breakdown,
        "news_count":          len(news),
        "generated_at":        datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("market_briefs").upsert(row, on_conflict="date").execute()
    print(f"  Saved brief: \"{row['headline']}\"")
    print("Done.")


if __name__ == "__main__":
    main()
