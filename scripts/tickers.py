"""Central ticker lists — imported by all data scripts."""

# yfinance uses different symbols for some tickers.
# Only used by seed scripts (local, 1-time use).
YFINANCE_MAP = {
    "BRK.B": "BRK-B",
    "BF.B": "BF-B",
}


def to_yf(ticker: str) -> str:
    """Convert our DB ticker to yfinance-compatible symbol."""
    return YFINANCE_MAP.get(ticker, ticker)


def from_yf(yf_symbol: str) -> str:
    """Convert yfinance symbol back to our DB ticker."""
    _reverse = {v: k for k, v in YFINANCE_MAP.items()}
    return _reverse.get(yf_symbol, yf_symbol)


def to_twelve_data_crypto(ticker: str) -> str:
    """Convert DB crypto ticker (BTC-USD) to Twelve Data format (BTC/USD)."""
    return ticker.replace("-USD", "/USD")


# S&P 100 (OEX) as tracked by OEF holdings, refreshed May 2026.
SP100_TICKERS = [
    "NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "AVGO", "GOOG", "META", "TSLA", "BRK.B",
    "MU", "JPM", "LLY", "AMD", "XOM", "WMT", "JNJ", "INTC", "V", "COST",
    "CSCO", "CAT", "MA", "LRCX", "ABBV", "NFLX", "UNH", "CVX", "AMAT", "ORCL",
    "PG", "BAC", "KO", "GE", "PLTR", "HD", "PM", "GEV", "GS", "MRK",
    "TXN", "LIN", "RTX", "MS", "WFC", "C", "QCOM", "IBM", "PEP", "NEE",
    "VZ", "MCD", "DIS", "AMGN", "BA", "T", "TMO", "AXP", "GILD", "UNP",
    "BLK", "CRM", "UBER", "ISRG", "SCHW", "ABT", "PFE", "COP", "DE", "HON",
    "LOW", "BKNG", "CVS", "MO", "SBUX", "COF", "BMY", "LMT", "INTU", "DHR",
    "SO", "ACN", "MDT", "ADBE", "DUK", "NOW", "BNY", "CMCSA", "TMUS", "GD",
    "USB", "FDX", "AMT", "MDLZ", "EMR", "MMM", "UPS", "CL", "GM", "SPG",
    "NKE",
]  # 101 equity tickers; dual share classes make the count differ from 100 companies.

# Backward compatibility alias
SP500_TICKERS = SP100_TICKERS

# Extra equities tracked outside the S&P 100 universe.
TRACKED_EQUITY_TICKERS = [
    "SPCX",
    "HONA",
]

TRACKED_EQUITY_METADATA = {
    "SPCX": {
        "name": "SpaceX",
        "exchange": "NASDAQ",
        "sector": "Aerospace & Defense",
    },
    "HONA": {
        "name": "Honeywell Aerospace",
        "exchange": "NASDAQ",
        "sector": "Aerospace & Defense",
    },
}

# Large-cap, liquid crypto assets. Stablecoins are deliberately included because
# they are market-cap leaders and give the crypto view a complete market snapshot.
CRYPTO_TICKERS = [
    "BTC-USD", "ETH-USD", "USDT-USD", "BNB-USD", "USDC-USD", "XRP-USD",
    "SOL-USD", "TRX-USD", "DOGE-USD", "ZEC-USD", "ADA-USD", "XLM-USD",
    "XMR-USD", "LINK-USD", "BCH-USD", "AVAX-USD", "LTC-USD", "DOT-USD",
    "AAVE-USD",
]  # 19 crypto

# Core market ETFs: broad benchmarks and major macro/sector proxies.
ETF_TICKERS = [
    "VOO", "QQQ", "SPY", "VTI", "IWM",
    "DIA", "GLD", "TLT", "AGG", "XLK", "OEF",
]

# Combined lists for scripts that handle multiple asset classes
ALL_EQUITY_TICKERS = SP100_TICKERS + TRACKED_EQUITY_TICKERS
ALL_TICKERS = ALL_EQUITY_TICKERS + CRYPTO_TICKERS + ETF_TICKERS

# Tickers eligible for an up-to-1Y backfill. Newly listed equities naturally
# receive only the history that exists since listing.
HISTORY_SEED_TICKERS = ALL_EQUITY_TICKERS + CRYPTO_TICKERS + ETF_TICKERS

# Official company names for news ticker mapping
COMPANY_NAMES = {
    # S&P 100
    "AAPL": "Apple", "ABBV": "AbbVie", "ABT": "Abbott", "ACN": "Accenture",
    "ADBE": "Adobe", "AMAT": "Applied Materials", "AMD": "AMD",
    "AMGN": "Amgen", "AMZN": "Amazon", "AVGO": "Broadcom", "AXP": "American Express",
    "BA": "Boeing", "BAC": "Bank of America", "BNY": "BNY Mellon",
    "BKNG": "Booking Holdings", "BLK": "BlackRock", "BMY": "Bristol Myers Squibb",
    "BRK.B": "Berkshire Hathaway", "C": "Citigroup", "CAT": "Caterpillar",
    "CL": "Colgate-Palmolive",
    "CMCSA": "Comcast", "COF": "Capital One", "COP": "ConocoPhillips",
    "CRM": "Salesforce", "CSCO": "Cisco", "COST": "Costco",
    "CVS": "CVS Health", "CVX": "Chevron", "DE": "Deere", "DHR": "Danaher",
    "DIS": "Walt Disney", "DUK": "Duke Energy", "EMR": "Emerson Electric",
    "FDX": "FedEx", "GD": "General Dynamics",
    "GE": "GE Aerospace", "GILD": "Gilead Sciences", "GM": "General Motors",
    "GEV": "GE Vernova",
    "GOOG": "Alphabet C", "GOOGL": "Alphabet A", "GS": "Goldman Sachs",
    "HD": "Home Depot", "HON": "Honeywell", "IBM": "IBM", "INTC": "Intel",
    "INTU": "Intuit", "ISRG": "Intuitive Surgical", "JNJ": "Johnson & Johnson",
    "JPM": "JPMorgan Chase", "KO": "Coca-Cola",
    "LIN": "Linde", "LLY": "Eli Lilly", "LMT": "Lockheed Martin", "LOW": "Lowe's",
    "LRCX": "Lam Research",
    "MA": "Mastercard", "MCD": "McDonald's", "MDLZ": "Mondelez",
    "MDT": "Medtronic", "META": "Meta Platforms", "MMM": "3M", "MU": "Micron Technology",
    "MO": "Altria", "MRK": "Merck", "MS": "Morgan Stanley", "MSFT": "Microsoft",
    "NEE": "NextEra Energy", "NFLX": "Netflix", "NKE": "Nike",
    "NOW": "ServiceNow", "NVDA": "Nvidia", "ORCL": "Oracle", "PEP": "PepsiCo",
    "PFE": "Pfizer", "PG": "Procter & Gamble", "PLTR": "Palantir",
    "PM": "Philip Morris", "QCOM": "Qualcomm", "RTX": "RTX",
    "SBUX": "Starbucks", "SCHW": "Charles Schwab",
    "SO": "Southern Company", "SPG": "Simon Property", "T": "AT&T",
    "TMO": "Thermo Fisher", "TMUS": "T-Mobile",
    "TSLA": "Tesla", "TXN": "Texas Instruments", "UNH": "UnitedHealth",
    "UNP": "Union Pacific", "UPS": "UPS", "USB": "U.S. Bancorp", "UBER": "Uber",
    "V": "Visa",
    "VZ": "Verizon", "WFC": "Wells Fargo", "WMT": "Walmart", "XOM": "ExxonMobil",
    # Additional tracked equities
    "SPCX": "SpaceX", "HONA": "Honeywell Aerospace",
    # Core ETFs
    "VOO": "Vanguard S&P 500 ETF", "QQQ": "Invesco QQQ Trust",
    "SPY": "SPDR S&P 500 ETF Trust", "VTI": "Vanguard Total Stock Market ETF",
    "IWM": "iShares Russell 2000 ETF", "DIA": "SPDR Dow Jones Industrial Average ETF Trust",
    "GLD": "SPDR Gold Shares", "TLT": "iShares 20+ Year Treasury Bond ETF",
    "AGG": "iShares Core U.S. Aggregate Bond ETF", "XLK": "Technology Select Sector SPDR Fund",
    "OEF": "iShares S&P 100 ETF",
    # Crypto
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "USDT-USD": "Tether",
    "BNB-USD": "BNB", "USDC-USD": "USD Coin", "XRP-USD": "XRP",
    "SOL-USD": "Solana", "TRX-USD": "TRON", "DOGE-USD": "Dogecoin", "ZEC-USD": "Zcash",
    "ADA-USD": "Cardano", "XLM-USD": "Stellar", "XMR-USD": "Monero",
    "LINK-USD": "Chainlink", "BCH-USD": "Bitcoin Cash", "AVAX-USD": "Avalanche",
    "LTC-USD": "Litecoin", "DOT-USD": "Polkadot", "AAVE-USD": "Aave",
}
