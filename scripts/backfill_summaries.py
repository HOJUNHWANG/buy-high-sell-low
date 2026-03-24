"""
backfill_summaries.py — Generate AI summaries for existing articles that have none.
Run manually: python scripts/backfill_summaries.py

Groq free tier: 100K tokens/day. Optimized prompt uses ~400 tokens/call → ~250 articles/day.
Stops gracefully on 429 rate limit instead of wasting attempts.
"""
import os
import sys
import json
import time
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client
from groq import Groq

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GROQ_API_KEY = os.environ["GROQ_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
groq     = Groq(api_key=GROQ_API_KEY)

SLEEP_BETWEEN = 2.2  # seconds between calls (~27 req/min)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import COMPANY_NAMES


def map_all_tickers(title: str) -> list[str]:
    title_upper = title.upper()
    found = []
    for ticker, name in COMPANY_NAMES.items():
        if ticker in title_upper or name.upper() in title_upper:
            found.append(ticker)
    return found


def generate_summary(title: str) -> dict | str | None:
    """Returns dict on success, 'RATE_LIMITED' on 429, None on other errors."""
    prompt = f"""Summarize this financial news in JSON. No investment advice.
{{
  "summary": "2-3 sentence summary",
  "impact": "1 sentence market effect",
  "sentiment": "positive|neutral|negative",
  "caution": "1 overlooked risk or null"
}}

{title}"""

    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(msg.choices[0].message.content or "{}")
    except Exception as e:
        if "429" in str(e):
            return "RATE_LIMITED"
        print(f"    Groq error: {e}")
        return None


def main():
    # Fetch all articles without summary (paginated)
    all_articles = []
    offset = 0
    while True:
        result = supabase.table("news_articles") \
            .select("id, title") \
            .is_("ai_summary", "null") \
            .order("published_at", desc=True) \
            .range(offset, offset + 999) \
            .execute()
        all_articles.extend(result.data or [])
        if len(result.data or []) < 1000:
            break
        offset += 1000

    total = len(all_articles)
    print(f"Articles without summary: {total}")

    if total == 0:
        print("Nothing to backfill.")
        return

    all_known = set(COMPANY_NAMES.keys())
    done, failed = 0, 0
    for i, article in enumerate(all_articles, 1):
        print(f"  [{i}/{total}] {article['title'][:70]}...")
        ai = generate_summary(article["title"])

        if ai == "RATE_LIMITED":
            print(f"\n  Rate limited after {done} summaries. Run again later (limit resets daily).")
            break

        if ai:
            title_tickers = map_all_tickers(article["title"])
            related = sorted(set(t for t in title_tickers if t in all_known))

            supabase.table("news_articles").update({
                "ai_summary":      ai.get("summary"),
                "ai_insight":      ai.get("impact"),
                "ai_sentiment":    ai.get("sentiment"),
                "ai_caution":      ai.get("caution"),
                "ai_generated_at": datetime.utcnow().isoformat(),
                "related_tickers": related if related else None,
            }).eq("id", article["id"]).execute()
            done += 1
        else:
            failed += 1

        time.sleep(SLEEP_BETWEEN)

    print(f"\nBackfill complete. Done: {done}, Failed: {failed}, Remaining: {total - done - failed}")


if __name__ == "__main__":
    main()
