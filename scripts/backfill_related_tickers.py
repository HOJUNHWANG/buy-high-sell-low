"""
backfill_related_tickers.py — Re-tag related_tickers for existing news articles using AI.

Modes:
  python scripts/backfill_related_tickers.py           # backfill articles with empty/null related_tickers
  python scripts/backfill_related_tickers.py --all      # re-tag ALL articles (fix old text-matched ones)
"""
import os
import sys
import json
import time
from dotenv import load_dotenv
from supabase import create_client
from groq import Groq

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

sys.path.insert(0, os.path.dirname(__file__))
from tickers import COMPANY_NAMES

ALL_KNOWN_TICKERS = sorted(COMPANY_NAMES.keys())
TICKER_LIST_STR = ", ".join(ALL_KNOWN_TICKERS)
KNOWN_SET = set(ALL_KNOWN_TICKERS)


def ai_related_tickers(title: str) -> list[str] | str:
    """Use Groq to detect related tickers from news title."""
    if not groq_client:
        return []
    prompt = f"""Given the following financial news headline, identify ALL stock/crypto tickers from the known list that are directly mentioned, affected by, or closely related to this news.

[KNOWN TICKERS]
{TICKER_LIST_STR}

[RULES]
- Only use tickers from the known list above
- Only include tickers that are directly mentioned or directly affected by this specific news
- Do NOT include competitors, sector peers, or loosely related tickers
- Do NOT match just because a word looks like a ticker (e.g. "now" is not ServiceNow, "ford" in "affordable" is not Ford)
- Return JSON only: {{"related_tickers": ["TICKER1", "TICKER2"]}}
- Return empty array if none apply

Title: {title}"""

    try:
        msg = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(msg.choices[0].message.content or "{}")
        raw = result.get("related_tickers", [])
        return sorted(t for t in raw if isinstance(t, str) and t in KNOWN_SET)
    except Exception as e:
        if "429" in str(e):
            return "RATE_LIMITED"
        print(f"  AI error: {e}")
        return []


def main():
    retag_all = "--all" in sys.argv

    if retag_all:
        print("Mode: re-tag ALL articles (replacing old text-matched tickers)")
        # Process in batches, newest first
        result = supabase.table("news_articles") \
            .select("id, title") \
            .order("published_at", desc=True) \
            .limit(500) \
            .execute()
    else:
        print("Mode: backfill articles with empty/null related_tickers")
        result = supabase.table("news_articles") \
            .select("id, title") \
            .or_("related_tickers.is.null,related_tickers.eq.[]") \
            .order("published_at", desc=True) \
            .limit(500) \
            .execute()

    articles = result.data
    print(f"Found {len(articles)} articles to process")

    updated = 0
    empty = 0

    for i, article in enumerate(articles):
        title = article["title"]
        article_id = article["id"]

        related = ai_related_tickers(title)
        if related == "RATE_LIMITED":
            print(f"  Rate limited at article {i+1} — stopping")
            break

        supabase.table("news_articles") \
            .update({"related_tickers": related}) \
            .eq("id", article_id) \
            .execute()

        if related:
            updated += 1
            print(f"  [{i+1}/{len(articles)}] id={article_id}: {related}")
        else:
            empty += 1
            print(f"  [{i+1}/{len(articles)}] id={article_id}: (none)")

        time.sleep(2.1)  # rate limit

    print(f"\nDone. Tagged: {updated}, No related: {empty}")


if __name__ == "__main__":
    main()
