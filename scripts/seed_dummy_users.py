import os
import random
import uuid
import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE environment variables.")
    exit(1)

supabase: Client = create_client(url, key)

print("Starting dummy user generation...")

# Fetch available tickers and prices
prices_res = supabase.table("stock_prices").select("ticker, price").execute()
if not prices_res.data:
    print("No prices found, please run fetch_prices.py first.")
    exit(1)

valid_tickers = [p["ticker"] for p in prices_res.data]
price_map = {p["ticker"]: p["price"] for p in prices_res.data}
crypto_tickers = [t for t in valid_tickers if "-USD" in t]
stock_tickers = [t for t in valid_tickers if "-USD" not in t]

DUMMY_COUNT = 30
dummy_ids = []

for i in range(1, DUMMY_COUNT + 1):
    random_hex = uuid.uuid4().hex[:6].upper()
    email = f"dummy_{random_hex}@bhsl.local"
    password = f"DummyPass{random_hex}!"
    nickname = f"Trader_{random_hex}"
    
    # 1. Create Auth User
    try:
        user_res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        uid = user_res.user.id
        dummy_ids.append(uid)
        print(f"Created user {nickname} ({uid})")
    except Exception as e:
        print(f"Failed to create user {email}: {e}")
        continue

    # 2. Assign Nickname to paper_accounts
    supabase.table("paper_accounts").update({
        "nickname": nickname
    }).eq("user_id", uid).execute()

    # 3. Randomize Strategy
    strategy = random.choice(["conservative", "growth", "crypto_degen", "degenerate", "margin_call"])
    
    cash_left = 1000.0
    
    if strategy == "conservative":
        # Just 1-2 stock positions, 1x leverage, lots of cash left
        picks = random.sample(stock_tickers, k=random.randint(1, 2))
        for t in picks:
            alloc = random.uniform(100, 300)
            price = price_map[t]
            shares = alloc / price
            cash_left -= alloc
            supabase.table("paper_positions").insert({
                "user_id": uid, "ticker": t, "side": "long", "shares": shares, "avg_cost": price*0.99, "leverage": 1, "borrowed": 0
            }).execute()
            
    elif strategy == "growth":
        # 3-5 positions, mixed stocks/crypto, 1x-2x leverage
        picks = random.sample(valid_tickers, k=random.randint(3, 5))
        for t in picks:
            lev = random.choice([1, 1, 2])
            alloc = random.uniform(100, 400)
            price = price_map[t]
            shares = (alloc * lev) / price
            borrowed = alloc * (lev - 1)
            cash_left -= alloc
            supabase.table("paper_positions").insert({
                "user_id": uid, "ticker": t, "side": "long", "shares": shares, "avg_cost": price*0.95, "leverage": lev, "borrowed": borrowed
            }).execute()
            
    elif strategy == "crypto_degen":
        # Only crypto, high leverage
        picks = random.sample(crypto_tickers, k=random.randint(1, 3))
        for t in picks:
            lev = random.choice([5, 10, 25])
            alloc = random.uniform(100, 600)
            if cash_left < alloc: alloc = cash_left
            if alloc <= 0: continue
            price = price_map[t]
            shares = (alloc * lev) / price
            borrowed = alloc * (lev - 1)
            cash_left -= alloc
            supabase.table("paper_positions").insert({
                "user_id": uid, "ticker": t, "side": "long", "shares": shares, "avg_cost": price * 0.9, "leverage": lev, "borrowed": borrowed
            }).execute()

    elif strategy == "degenerate":
        # Max leverage, probably underwater
        t = random.choice(valid_tickers)
        lev = random.choice([50, 100])
        alloc = 900.0
        price = price_map[t]
        shares = (alloc * lev) / price
        borrowed = alloc * (lev - 1)
        cash_left -= alloc
        # Simulate bought at a higher price (losing money)
        avg_cost = price * random.uniform(1.05, 1.15) 
        supabase.table("paper_positions").insert({
            "user_id": uid, "ticker": t, "side": "short", "shares": shares, "avg_cost": avg_cost, "leverage": lev, "borrowed": borrowed
        }).execute()

    elif strategy == "margin_call":
        # Specifically force margin call status
        t = random.choice(valid_tickers)
        lev = 25
        alloc = 950.0
        price = price_map[t]
        shares = (alloc * lev) / price
        borrowed = alloc * (lev - 1)
        cash_left -= alloc
        # Bought incredibly high, huge loss
        avg_cost = price * random.uniform(1.01, 1.03)
        supabase.table("paper_positions").insert({
            "user_id": uid, "ticker": t, "side": "long", "shares": shares, "avg_cost": avg_cost, "leverage": lev, "borrowed": borrowed
        }).execute()
        
        # Manually force the account status
        supabase.table("paper_accounts").update({
            "status": "margin_call",
            "cash_balance": cash_left
        }).eq("user_id", uid).execute()
        continue # skip normal cash update
        
    supabase.table("paper_accounts").update({"cash_balance": max(0, cash_left)}).eq("user_id", uid).execute()

print(f"✅ Successfully seeded {DUMMY_COUNT} dummy users with random portfolios based on S&P 100 and Crypto!")
