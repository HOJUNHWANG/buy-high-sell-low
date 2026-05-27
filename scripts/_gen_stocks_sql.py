import sys
sys.path.insert(0, "scripts")
from tickers import ALL_TICKERS

keep = sorted(set(ALL_TICKERS))
tickers_sql = ", ".join([f"'{t}'" for t in keep])

sql = f"""-- Run in Supabase SQL Editor to hard-delete assets outside the active app universe.
-- This removes prices/history and user references for tickers no longer tracked.

-- 1. Remove dependent user and market-data rows first.
DELETE FROM paper_positions WHERE ticker NOT IN ({tickers_sql});
DELETE FROM paper_transactions WHERE ticker NOT IN ({tickers_sql});
DELETE FROM paper_challenges WHERE ticker NOT IN ({tickers_sql});
DELETE FROM watchlist WHERE ticker NOT IN ({tickers_sql});

DELETE FROM stock_prices WHERE ticker NOT IN ({tickers_sql});
DELETE FROM stock_price_history WHERE ticker NOT IN ({tickers_sql});
DELETE FROM price_history_long WHERE ticker NOT IN ({tickers_sql});

-- 2. Finally, delete them from the main 'stocks' table (the Screener list).
DELETE FROM stocks WHERE ticker NOT IN ({tickers_sql});
"""

with open("scripts/cleanup_stocks.sql", "w", encoding="utf-8", newline="\n") as f:
    f.write(sql)
    
print("SQL written to scripts/cleanup_stocks.sql")
