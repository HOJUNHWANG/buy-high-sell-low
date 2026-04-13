"""
fetch_news.py — Fetch news + generate AI summaries via Groq.
Schedule: 0 * * * * (every hour)

Root cause fix (2026-03-24):
- get_existing_urls() paginated to overcome PostgREST 1000-row limit
- Within-batch dedup to avoid cross-feed duplicate inserts
- Insert-first, then Groq: only spend AI quota on successfully inserted articles
- Backfill uses all remaining quota after new articles are processed
"""
import os
import sys
import json
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
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
from tickers import COMPANY_NAMES

ALL_KNOWN_TICKERS = sorted(COMPANY_NAMES.keys())
TICKER_LIST_STR = ", ".join(ALL_KNOWN_TICKERS)

# Configure resilient HTTP session
retry_strategy = Retry(
    total=3,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["HEAD", "GET", "OPTIONS"],
    backoff_factor=1
)
adapter = HTTPAdapter(max_retries=retry_strategy)
http_session = requests.Session()
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)

MAX_AI_PER_RUN = 200  # Groq paid tier — 200/hr is safe with 2.1s sleep

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


def fetch_from_newsapi() -> list[dict]:
    url = "https://newsapi.org/v2/everything"
    params = {
        "q":        "stock market OR earnings OR revenue OR Bitcoin OR Ethereum OR crypto",
        "language": "en",
        "sortBy":   "publishedAt",
        "pageSize": 100,
        "apiKey":   NEWSAPI_KEY,
    }
    # Increased timeout and resilient session
    r = http_session.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("articles", [])


def fetch_from_rss() -> list[dict]:
    articles = []
    for feed_url in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:30]:
                articles.append({
                    "title":       entry.get("title", ""),
                    "url":         entry.get("link", ""),
                    "source":      feed.feed.get("title", "RSS"),
                    "publishedAt": entry.get("published", None),
                    "content":     entry.get("summary", ""),
                })
        except Exception as e:
            print(f"  RSS feed error ({feed_url[:50]}): {e}")
    return articles


def generate_ai_summary(title: str, content: str) -> dict | None:
    """Generate AI summary + related tickers in one call."""
    prompt = f"""Analyze this financial news. Return JSON only. No investment advice.

[KNOWN TICKERS]
{TICKER_LIST_STR}

[OUTPUT FORMAT]
{{
  "summary": "2-3 sentence summary",
  "impact": "1 sentence market effect",
  "sentiment": "positive|neutral|negative",
  "caution": "1 overlooked risk or null",
  "related_tickers": ["TICKER1", "TICKER2"]
}}

[RULES for related_tickers]
- Only use tickers from the known list above
- Only include tickers that are directly mentioned or directly affected by this specific news
- Do NOT include competitors, sector peers, or loosely related tickers
- Do NOT match just because a word in the headline looks like a ticker (e.g. "now" is not ServiceNow, "ford" in "affordable" is not Ford)
- Return empty array if none apply

{title}
{content[:500]}"""

    if not groq:
        return None
    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(msg.choices[0].message.content or "{}")
        # Filter related_tickers to only known tickers
        known_set = set(ALL_KNOWN_TICKERS)
        raw_tickers = result.get("related_tickers", [])
        result["related_tickers"] = sorted(
            t for t in raw_tickers if isinstance(t, str) and t in known_set
        )
        return result
    except Exception as e:
        err_str = str(e)
        if "429" in err_str:
            print(f"  Rate limited — stopping AI generation for this run")
            return "RATE_LIMITED"  # signal to caller
        print(f"  AI error: {e}")
        return None


def get_existing_urls() -> set[str]:
    """Paginated fetch of all existing URLs to avoid PostgREST 1000-row cap."""
    since = (datetime.utcnow() - timedelta(days=7)).isoformat()
    urls: set[str] = set()
    offset = 0
    page_size = 1000
    while True:
        result = supabase.table("news_articles") \
            .select("url") \
            .gte("fetched_at", since) \
            .range(offset, offset + page_size - 1) \
            .execute()
        for row in result.data:
            urls.add(row["url"])
        if len(result.data) < page_size:
            break
        offset += page_size
    return urls


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
    print(f"  Existing URLs in DB: {len(existing_urls)}")

    # Dedup: against DB + within batch (cross-feed duplicates)
    seen_urls: set[str] = set()
    new_articles: list[dict] = []
    for a in articles:
        url = a.get("url")
        if url and url not in existing_urls and url not in seen_urls:
            seen_urls.add(url)
            new_articles.append(a)

    print(f"  New articles after dedup: {len(new_articles)}")

    # ── Phase 1: Insert articles (without AI), then generate AI for inserted ones ──
    inserted: list[dict] = []  # rows that were successfully inserted
    skipped = 0
    for article in new_articles:
        title   = article.get("title", "")
        url     = article.get("url", "")
        source  = article.get("source", {})
        source_name = source.get("name") if isinstance(source, dict) else str(source)
        published   = article.get("publishedAt")
        row = {
            "ticker":          None,
            "title":           title[:500],
            "url":             url,
            "source":          source_name,
            "published_at":    published,
            "related_tickers": [],  # populated by AI in Phase 2
        }

        try:
            result = supabase.table("news_articles").insert(row).execute()
            new_id = result.data[0]["id"]
            inserted.append({
                "id": new_id,
                "title": title,
                "content": article.get("content") or article.get("description") or "",
            })
        except Exception as e:
            err_msg = str(e)
            if "23505" in err_msg:
                skipped += 1  # duplicate URL — silently skip
            else:
                print(f"  Insert error ({url[:60]}): {e}")

    print(f"  Inserted: {len(inserted)}, Skipped duplicates: {skipped}")

    # ── Phase 2: Generate AI summaries for all inserted articles ──
    ai_calls_this_run = 0
    summarized = 0
    rate_limited = False

    for article in inserted:
        if ai_calls_this_run >= MAX_AI_PER_RUN or rate_limited:
            break

        ai = generate_ai_summary(article["title"], article["content"])
        if ai == "RATE_LIMITED":
            rate_limited = True
            break
        if ai is None:
            continue

        ai_calls_this_run += 1
        summarized += 1

        supabase.table("news_articles").update({
            "ai_summary":       ai.get("summary"),
            "ai_insight":       ai.get("impact"),
            "ai_sentiment":     ai.get("sentiment"),
            "ai_caution":       ai.get("caution"),
            "ai_generated_at":  datetime.utcnow().isoformat(),
            "related_tickers":  ai.get("related_tickers", []),
        }).eq("id", article["id"]).execute()

        time.sleep(2.1)  # ~28 req/min — stay under Groq rate limit

    print(f"  Summarized: {summarized}/{len(inserted)}{' (rate limited)' if rate_limited else ''}")

    # ── Phase 3: Backfill articles that still have no AI summary ──
    backfilled = 0
    if ai_calls_this_run < MAX_AI_PER_RUN and not rate_limited:
        remaining = MAX_AI_PER_RUN - ai_calls_this_run
        result = supabase.table("news_articles") \
            .select("id, title") \
            .is_("ai_summary", "null") \
            .order("published_at", desc=True) \
            .limit(remaining) \
            .execute()
        backfill_articles = result.data or []
        if backfill_articles:
            print(f"  Backfilling {len(backfill_articles)} articles without AI summary...")
        for article in backfill_articles:
            if ai_calls_this_run >= MAX_AI_PER_RUN:
                break
            ai = generate_ai_summary(article["title"], article["title"])
            if ai == "RATE_LIMITED":
                break
            if ai:
                ai_calls_this_run += 1
                supabase.table("news_articles").update({
                    "ai_summary":       ai.get("summary"),
                    "ai_insight":       ai.get("impact"),
                    "ai_sentiment":     ai.get("sentiment"),
                    "ai_caution":       ai.get("caution"),
                    "ai_generated_at":  datetime.utcnow().isoformat(),
                    "related_tickers":  ai.get("related_tickers", []),
                }).eq("id", article["id"]).execute()
                backfilled += 1
            time.sleep(2.1)

    supabase.table("fetch_logs").insert({
        "job_name":        "news",
        "status":          "success",
        "records_fetched": len(inserted),
        "records_failed":  skipped,
        "error_message":   f"summarized:{summarized},backfilled:{backfilled}" if (summarized or backfilled) else None,
    }).execute()

    print(f"Done. Inserted: {len(inserted)}, Summarized: {summarized}, Backfilled: {backfilled}")
    print("  (related_tickers now AI-powered — no more text matching)")


if __name__ == "__main__":
    main()
