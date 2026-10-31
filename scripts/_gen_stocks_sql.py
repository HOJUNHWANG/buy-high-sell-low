"""Generate a reversible universe visibility update without deleting user history."""
from pathlib import Path
from tickers import SP100_TICKERS, TRACKED_EQUITY_TICKERS, ETF_TICKERS, CRYPTO_TICKERS
values = ", ".join("'" + ticker.replace("'", "''") + "'" for ticker in sorted(set(SP100_TICKERS + TRACKED_EQUITY_TICKERS + ETF_TICKERS + CRYPTO_TICKERS)))
Path("scripts/cleanup_stocks.sql").write_text(
    "-- Preserve holdings, transactions, challenges and market history.\n"
    + f"UPDATE public.stocks SET is_active = ticker IN ({values}), updated_at = now();\n", encoding="utf8")
