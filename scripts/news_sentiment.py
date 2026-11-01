"""Sentiment coverage for the selected brief articles, including unavailable data."""

SENTIMENT_KEYS = ("positive", "neutral", "negative", "unknown")


def compute_sentiment_breakdown(news: list[dict]) -> dict:
    counts = dict.fromkeys(SENTIMENT_KEYS, 0)
    for row in news:
        sentiment = row.get("ai_sentiment")
        if row.get("summary_method") != "verified_ai" or sentiment not in SENTIMENT_KEYS[:3]:
            sentiment = "unknown"
        counts[sentiment] += 1
    total = len(news)
    # Integer remainders avoid independent rounding that can sum to 99 or 101.
    percentages = {key: counts[key] * 100 // total if total else 0 for key in SENTIMENT_KEYS}
    if total:
        remaining = 100 - sum(percentages.values())
        ranked = sorted(SENTIMENT_KEYS, key=lambda key: counts[key] * 100 % total, reverse=True)
        for key in ranked[:remaining]:
            percentages[key] += 1
    return {**percentages, "counts": counts}
