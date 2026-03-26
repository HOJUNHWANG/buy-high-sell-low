import sys
sys.path.insert(0, "scripts")
from tickers import ALL_TICKERS

keep = sorted(set(ALL_TICKERS))
tickers_sql = ", ".join([f"'{t}'" for t in keep])

sql = f"""-- Run in Supabase SQL Editor to clean up the 'stocks' table (Screener list)

-- 1. Remove orphaned paper trading positions/transactions (if any)
DELETE FROM paper_positions WHERE ticker NOT IN ({tickers_sql});
DELETE FROM paper_transactions WHERE ticker NOT IN ({tickers_sql});

-- 2. Remove orphaned WhatIf scenarios (if any)
DELETE FROM whatif_scenarios WHERE ticker NOT IN ({tickers_sql});

-- 3. Finally, delete them from the main 'stocks' table (the Screener list)
DELETE FROM stocks WHERE ticker NOT IN ({tickers_sql});
"""

with open("scripts/cleanup_stocks.sql", "w", encoding="utf-8") as f:
    f.write(sql)
    
print("SQL written to scripts/cleanup_stocks.sql")
