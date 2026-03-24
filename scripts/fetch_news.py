"""
fetch_news.py — Fetch news + generate AI summaries via Claude.
Schedule: 0 * * * * (every hour)
"""
import os
import sys
import json
import time
import requests
import feedparser
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client
from groq import Groq

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NEWSAPI_KEY  = os.environ["NEWSAPI_KEY"]
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
groq     = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP500_TICKERS, CRYPTO_TICKERS, COMPANY_NAMES

MAX_AI_PER_RUN = 200  # Groq free tier: 14,400/day, 30/min — 200/hr is safe

RSS_FEEDS = [
    # Stock feeds
    "https://feeds.finance.yahoo.com/rss/2.0/headline?region=US&lang=en-US",
    "https://feeds.marketwatch.com/marketwatch/topstories/",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://www.cnbc.com/id/10001147/device/rss/rss.html",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    # Crypto feeds
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
]


def map_ticker(title: str) -> str | None:
    title_upper = title.upper()
    for ticker, name in COMPANY_NAMES.items():
        if ticker in title_upper or name.upper() in title_upper:
            return ticker
    return None


def map_all_tickers(title: str) -> list[str]:
    """Extract ALL matching tickers from a title (not just the first)."""
    title_upper = title.upper()
    found = []
    for ticker, name in COMPANY_NAMES.items():
        if ticker in title_upper or name.upper() in title_upper:
            found.append(ticker)
    return found


def fetch_from_newsapi() -> list[dict]:
    url = "https://newsapi.org/v2/everything"
    params = {
        "q":        "stock market OR earnings OR revenue OR Bitcoin OR Ethereum OR crypto",
        "language": "en",
        "sortBy":   "publishedAt",
        "pageSize": 100,
        "apiKey":   NEWSAPI_KEY,
    }
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json().get("articles", [])


def fetch_from_rss() -> list[dict]:
    articles = []
    for feed_url in RSS_FEEDS:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries[:30]:
            articles.append({
                "title":       entry.get("title", ""),
                "url":         entry.get("link", ""),
                "source":      feed.feed.get("title", "RSS"),
                "publishedAt": entry.get("published", None),
                "content":     entry.get("summary", ""),
            })
    return articles


def generate_ai_summary(title: str, content: str) -> dict | None:
    ticker_list = ", ".join(sorted(COMPANY_NAMES.keys()))
    prompt = f"""Analyze the following financial news for a general investor audience.

[STRICT RULES]
- Never recommend buying or selling any specific stock
- No investment advice or price predictions
- Facts and analysis only
- Output JSON only, no other text

[KNOWN TICKERS]
{ticker_list}

[Output Format]
{{
  "summary": "2-3 sentence plain English summary",
  "impact": "one sentence: likely effect on stock price and why",
  "sentiment": "positive | neutral | negative",
  "caution": "one thing investors might overlook (null if none)",
  "related_tickers": ["TICKER1", "TICKER2"]
}}

For related_tickers: list ALL tickers from the KNOWN TICKERS list that are directly mentioned, affected by, or closely related to this news. Include competitors and sector peers when the news clearly impacts them. Only use tickers from the known list. Return an empty array if none apply.

Title: {title}
Content: {content[:1000]}"""

    if not groq:
        return None
    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(msg.choices[0].message.content or "{}")
    except Exception as e:
        print(f"  AI error: {e}")
        return None


def get_existing_urls() -> set[str]:
    # Limit to last 7 days to avoid hitting PostgREST 1000-row default max-rows cap.
    # NewsAPI returns articles from the last ~24–48h, so 7 days is ample for dedup.
    since = (datetime.utcnow() - timedelta(days=7)).isoformat()
    result = supabase.table("news_articles").select("url").gte("fetched_at", since).execute()
    return {row["url"] for row in result.data}


def main():
    print("Fetching news...")
    articles = fetch_from_rss()
    print(f"  RSS: {len(articles)} articles")

    if len(articles) < 10:
        print("  RSS low yield — supplementing with NewsAPI...")
        try:
            articles += fetch_from_newsapi()
            print(f"  Total after NewsAPI supplement: {len(articles)} articles")
        except Exception as e:
            print(f"  NewsAPI also failed ({e})")

    existing_urls = get_existing_urls()
    new_articles = [a for a in articles if a.get("url") and a["url"] not in existing_urls]
    print(f"  New articles: {len(new_articles)}")

    fetched, failed = 0, []
    ai_calls_this_run = 0
    for article in new_articles:
        title   = article.get("title", "")
        url     = article.get("url", "")
        source  = article.get("source", {})
        source_name = source.get("name") if isinstance(source, dict) else str(source)
        published   = article.get("publishedAt")
        content     = article.get("content") or article.get("description") or ""
        ticker      = map_ticker(title)

        # Cap Groq calls per run to stay within rate limits
        if ai_calls_this_run < MAX_AI_PER_RUN:
            ai = generate_ai_summary(title, content)
            ai_calls_this_run += 1  # count every attempt (success or fail)
        else:
            ai = None

        # Merge AI-detected related tickers with title-extracted ones
        ai_tickers = ai.get("related_tickers", []) if ai else []
        title_tickers = map_all_tickers(title)
        # Deduplicate, filter to known tickers, exclude primary ticker
        all_known = set(COMPANY_NAMES.keys())
        related = sorted(set(
            t for t in (ai_tickers + title_tickers)
            if t in all_known and t != ticker
        ))

        row = {
            "ticker":           ticker,
            "title":            title[:500],
            "url":              url,
            "source":           source_name,
            "published_at":     published,
            "ai_summary":       ai.get("summary")   if ai else None,
            "ai_insight":       ai.get("impact")    if ai else None,
            "ai_sentiment":     ai.get("sentiment") if ai else None,
            "ai_caution":       ai.get("caution")   if ai else None,
            "ai_generated_at":  datetime.utcnow().isoformat() if ai else None,
            "related_tickers":  related if related else None,
        }

        try:
            supabase.table("news_articles").insert(row).execute()
            fetched += 1
        except Exception as e:
            print(f"  Insert error ({url[:60]}): {e}")
            failed.append(url)

        time.sleep(2.1)  # ~28 req/min — stay under Groq's 30 req/min limit

    # ── Backfill: retry AI summaries for articles that have none ──
    backfilled = 0
    if ai_calls_this_run < MAX_AI_PER_RUN:
        remaining = MAX_AI_PER_RUN - ai_calls_this_run
        result = supabase.table("news_articles") \
            .select("id, title, url, source") \
            .is_("ai_summary", "null") \
            .order("published_at", desc=True) \
            .limit(remaining) \
            .execute()
        backfill_articles = result.data or []
        if backfill_articles:
            print(f"  Backfilling {len(backfill_articles)} articles without AI summary...")
        for article in backfill_articles:
            content = article.get("title", "")  # title as fallback content
            ai = generate_ai_summary(article["title"], content)
            ai_calls_this_run += 1
            if ai:
                ai_tickers = ai.get("related_tickers", [])
                title_tickers = map_all_tickers(article["title"])
                all_known = set(COMPANY_NAMES.keys())
                related = sorted(set(
                    t for t in (ai_tickers + title_tickers)
                    if t in all_known
                ))
                supabase.table("news_articles").update({
                    "ai_summary":       ai.get("summary"),
                    "ai_insight":       ai.get("impact"),
                    "ai_sentiment":     ai.get("sentiment"),
                    "ai_caution":       ai.get("caution"),
                    "ai_generated_at":  datetime.utcnow().isoformat(),
                    "related_tickers":  related if related else None,
                }).eq("id", article["id"]).execute()
                backfilled += 1
            if ai_calls_this_run >= MAX_AI_PER_RUN:
                break
            time.sleep(2)

    supabase.table("fetch_logs").insert({
        "job_name":        "news",
        "status":          "success" if not failed else "partial",
        "records_fetched": fetched,
        "records_failed":  len(failed),
        "error_message":   f"backfilled:{backfilled}" if backfilled else None,
    }).execute()

    print(f"Done. Inserted: {fetched}, Failed: {len(failed)}, Backfilled: {backfilled}")


if __name__ == "__main__":
    main()
