"""
backfill_summaries.py — Generate AI summaries for existing articles that have none.
Run once manually: python scripts/backfill_summaries.py

Groq free tier: 14,400 req/day, 30 req/min → script auto-throttles.
"""
import os
import sys
import json
import time
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

BATCH_SIZE    = 25   # stay under 30 req/min limit
SLEEP_BETWEEN = 2.2  # seconds between calls (~27 req/min)


def generate_summary(title: str) -> dict | None:
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

Title: {title}"""

    try:
        msg = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(msg.choices[0].message.content or "{}")
    except Exception as e:
        print(f"    Groq error: {e}")
        return None


def main():
    # Fetch all articles without summary
    result = supabase.table("news_articles") \
        .select("id, title") \
        .is_("ai_summary", "null") \
        .order("published_at", desc=True) \
        .execute()

    articles = result.data or []
    total = len(articles)
    print(f"Articles without summary: {total}")

    if total == 0:
        print("Nothing to backfill.")
        return

    done, failed = 0, 0
    for i, article in enumerate(articles, 1):
        print(f"  [{i}/{total}] {article['title'][:70]}...")
        ai = generate_summary(article["title"])

        if ai:
            supabase.table("news_articles").update({
                "ai_summary":      ai.get("summary"),
                "ai_insight":      ai.get("impact"),
                "ai_sentiment":    ai.get("sentiment"),
                "ai_generated_at": __import__("datetime").datetime.utcnow().isoformat(),
            }).eq("id", article["id"]).execute()
            done += 1
        else:
            failed += 1

        # Throttle to stay within 30 req/min
        if i % BATCH_SIZE == 0:
            print(f"  --- Batch {i // BATCH_SIZE} done, pausing 10s ---")
            time.sleep(10)
        else:
            time.sleep(SLEEP_BETWEEN)

    print(f"\nBackfill complete. Done: {done}, Failed: {failed}")


if __name__ == "__main__":
    main()
