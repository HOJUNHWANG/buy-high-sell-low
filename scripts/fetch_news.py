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
import anthropic

load_dotenv()

SUPABASE_URL   = os.environ["SUPABASE_URL"]
SUPABASE_KEY   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NEWSAPI_KEY    = os.environ["NEWSAPI_KEY"]
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")

supabase       = create_client(SUPABASE_URL, SUPABASE_KEY)
claude         = anthropic.Anthropic(api_key=ANTHROPIC_KEY) if ANTHROPIC_KEY else None

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP100_TICKERS, COMPANY_NAMES

MAX_AI_PER_RUN = 30  # Claude calls per cron run — prevents surprise billing

RSS_FEEDS = [
    "https://feeds.reuters.com/reuters/businessNews",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
]


def map_ticker(title: str) -> str | None:
    title_upper = title.upper()
    for ticker, name in COMPANY_NAMES.items():
        if ticker in title_upper or name.upper() in title_upper:
            return ticker
    return None


def fetch_from_newsapi() -> list[dict]:
    url = "https://newsapi.org/v2/everything"
    params = {
        "q":        "stock market OR earnings OR revenue",
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
    prompt = f"""Analyze the following financial news for a general investor audience.

[STRICT RULES]
- Never recommend buying or selling any specific stock
- No investment advice or price predictions
- Facts and analysis only
- Output JSON only, no other text

[Output Format]
{{
  "summary": "2-3 sentence plain English summary",
  "impact": "one sentence: likely effect on stock price and why",
  "sentiment": "positive | neutral | negative",
  "caution": "one thing investors might overlook (null if none)"
}}

Title: {title}
Content: {content[:1000]}"""

    if not claude:
        return None
    try:
        msg = claude.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return json.loads(msg.content[0].text)
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
    try:
        articles = fetch_from_newsapi()
        print(f"  NewsAPI: {len(articles)} articles")
    except Exception as e:
        print(f"  NewsAPI failed ({e}), falling back to RSS...")
        articles = fetch_from_rss()
        print(f"  RSS: {len(articles)} articles")

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

        # Cap Claude calls per run to avoid unexpected cost spikes
        if ai_calls_this_run < MAX_AI_PER_RUN:
            ai = generate_ai_summary(title, content)
            if ai:
                ai_calls_this_run += 1
        else:
            ai = None

        row = {
            "ticker":          ticker,
            "title":           title[:500],
            "url":             url,
            "source":          source_name,
            "published_at":    published,
            "ai_summary":      ai.get("summary") if ai else None,
            "ai_insight":      ai.get("impact") if ai else None,
            "ai_sentiment":    ai.get("sentiment") if ai else None,
            "ai_generated_at": datetime.utcnow().isoformat() if ai else None,
        }

        try:
            supabase.table("news_articles").insert(row).execute()
            fetched += 1
        except Exception as e:
            print(f"  Insert error ({url[:60]}): {e}")
            failed.append(url)

        time.sleep(0.5)

    supabase.table("fetch_logs").insert({
        "job_name":        "news",
        "status":          "success" if not failed else "partial",
        "records_fetched": fetched,
        "records_failed":  len(failed),
        "error_message":   None,
    }).execute()

    print(f"Done. Inserted: {fetched}, Failed: {len(failed)}")


if __name__ == "__main__":
    main()
