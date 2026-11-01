import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from news_sentiment import compute_sentiment_breakdown


class NewsSentimentTests(unittest.TestCase):
    def test_keeps_21_unanalysed_articles_in_the_24_article_denominator(self):
        rows = [{"summary_method": "verified_ai", "ai_sentiment": s} for s in ["positive", "neutral", "neutral"]] + [{} for _ in range(21)]
        result = compute_sentiment_breakdown(rows)
        self.assertEqual(result["counts"], {"positive": 1, "neutral": 2, "negative": 0, "unknown": 21})
        self.assertEqual([result[k] for k in ["positive", "neutral", "negative", "unknown"]], [4, 8, 0, 88])

    def test_rounding_always_totals_100_and_preserves_exact_counts(self):
        for size in range(1, 25):
            rows = [{"summary_method": "verified_ai", "ai_sentiment": ["positive", "neutral", "negative"][i % 3]} for i in range(size)]
            result = compute_sentiment_breakdown(rows)
            self.assertEqual(sum(result[k] for k in ["positive", "neutral", "negative", "unknown"]), 100)
            self.assertEqual(sum(result["counts"].values()), size)

    def test_unverified_or_invalid_sentiment_is_unanalysed(self):
        result = compute_sentiment_breakdown([{"summary_method": "source_excerpt", "ai_sentiment": "positive"}, {"ai_sentiment": "neutral"}, {"summary_method": "verified_ai", "ai_sentiment": "bullish"}])
        self.assertEqual(result["unknown"], 100)
        self.assertEqual(result["counts"]["neutral"], 0)

    def test_empty_sample_has_no_fabricated_distribution(self):
        result = compute_sentiment_breakdown([])
        self.assertEqual(sum(result["counts"].values()), 0)
        self.assertEqual(sum(result[k] for k in ["positive", "neutral", "negative", "unknown"]), 0)
