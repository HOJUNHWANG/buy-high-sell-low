"""
backfill_related_tickers.py — Retroactively populate related_tickers for existing news articles.
Uses Groq (Llama 3.3) to analyze each article and extract related tickers.
Run once: python scripts/backfill_related_tickers.py
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
groq = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

sys.path.insert(0, os.path.dirname(__file__))
from tickers import COMPANY_NAMES


def map_all_tickers(title: str) -> list[str]:
    """Extract ALL matching tickers from a title."""
    title_upper = title.upper()
    found = []
    for ticker, name in COMPANY_NAMES.items():
        if ticker in title_upper or name.upper() in title_upper:
            found.append(ticker)
    return found


def ai_related_tickers(title: str) -> list[str]:
    """Use Groq to detect related tickers from news title."""
    if not groq:
        return []
    ticker_list = ", ".join(sorted(COMPANY_NAMES.keys()))
    prompt = f"""Given the following financial news headline, identify ALL stock/crypto tickers from the known list that are directly mentioned, affected by, or closely related to this news.

[KNOWN TICKERS]
{ticker_list}

[RULES]
- Only use tickers from the known list above
- Include competitors and sector peers when the news clearly impacts them
- Return JSON only: {{"related_tickers": ["TICKER1", "TICKER2"]}}
- Return empty array if none apply

Title: {title}"""

    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(msg.choices[0].message.content or "{}")
        return result.get("related_tickers", [])
    except Exception as e:
        print(f"  AI error: {e}")
        return []


def main():
    # Fetch all articles that don't have related_tickers yet
    result = supabase.table("news_articles") \
        .select("id, title, ticker") \
        .is_("related_tickers", "null") \
        .order("id", desc=False) \
        .limit(500) \
        .execute()

    articles = result.data
    print(f"Found {len(articles)} articles without related_tickers")

    all_known = set(COMPANY_NAMES.keys())
    updated = 0
    skipped = 0

    for i, article in enumerate(articles):
        title = article["title"]
        primary = article["ticker"]
        article_id = article["id"]

        # Get tickers from title matching
        title_tickers = map_all_tickers(title)

        # Get tickers from AI
        ai_tickers = ai_related_tickers(title)

        # Merge, deduplicate, filter to known, exclude primary
        related = sorted(set(
            t for t in (ai_tickers + title_tickers)
            if t in all_known and t != primary
        ))

        if related:
            supabase.table("news_articles") \
                .update({"related_tickers": related}) \
                .eq("id", article_id) \
                .execute()
            updated += 1
            print(f"  [{i+1}/{len(articles)}] id={article_id}: {related}")
        else:
            # Set empty array so we don't re-process
            supabase.table("news_articles") \
                .update({"related_tickers": []}) \
                .eq("id", article_id) \
                .execute()
            skipped += 1
            print(f"  [{i+1}/{len(articles)}] id={article_id}: (no related tickers)")

        # Rate limit: Groq free tier = 30 req/min
        time.sleep(2.5)

    print(f"\nDone. Updated: {updated}, No related: {skipped}")


if __name__ == "__main__":
    main()
