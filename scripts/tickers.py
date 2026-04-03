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


# S&P 100 (OEX) — top 100 large-cap US companies
SP100_TICKERS = [
    "AAPL", "ABBV", "ABT", "ACN", "ADBE", "AIG", "AMAT", "AMD", "AMGN", "AMZN",
    "AVGO", "AXP", "BA", "BAC", "BK", "BKNG", "BLK", "BMY", "BRK.B", "C",
    "CAT", "CHTR", "CI", "CL", "CMCSA", "COF", "COP", "CRM", "CSCO", "COST",
    "CVS", "CVX", "DE", "DHR", "DIS", "DUK", "EMR", "EXC", "F", "FDX",
    "GD", "GE", "GILD", "GM", "GOOG", "GOOGL", "GS", "HD", "HON", "IBM",
    "INTC", "INTU", "ISRG", "JNJ", "JPM", "KHC", "KO", "LIN", "LLY", "LMT",
    "LOW", "MA", "MCD", "MDLZ", "MDT", "MET", "META", "MO", "MRK", "MS",
    "MSFT", "NEE", "NFLX", "NKE", "NOW", "NVDA", "ORCL", "PEP", "PFE", "PG",
    "PGR", "PM", "PYPL", "QCOM", "RTX", "SBUX", "SCHW", "SLB", "SO", "SPG",
    "T", "TGT", "TMO", "TMUS", "TSLA", "TXN", "UNH", "UNP", "UPS", "USB",
    "V", "VZ", "WFC", "WMT", "XOM",
]  # 105 tickers (S&P 100 + a few share classes)

# Backward compatibility alias
SP500_TICKERS = SP100_TICKERS

# Top 19 crypto by market cap
CRYPTO_TICKERS = [
    "BTC-USD", "ETH-USD", "USDT-USD", "BNB-USD", "SOL-USD", "XRP-USD",
    "ADA-USD", "DOGE-USD", "AVAX-USD", "DOT-USD",
    "LINK-USD", "ATOM-USD", "LTC-USD", "FIL-USD",
    "NEAR-USD", "APT-USD", "ARB-USD", "OP-USD", "AAVE-USD",
]  # 19 crypto

# ETFs removed — free tier optimization
ETF_TICKERS = []  # was 25 ETFs, removed to stay within Twelve Data free plan

# Combined list for scripts that handle both
ALL_TICKERS = SP100_TICKERS + CRYPTO_TICKERS + ETF_TICKERS

# Official company names for news ticker mapping
COMPANY_NAMES = {
    # S&P 100
    "AAPL": "Apple", "ABBV": "AbbVie", "ABT": "Abbott", "ACN": "Accenture",
    "ADBE": "Adobe", "AIG": "AIG", "AMAT": "Applied Materials", "AMD": "AMD",
    "AMGN": "Amgen", "AMZN": "Amazon", "AVGO": "Broadcom", "AXP": "American Express",
    "BA": "Boeing", "BAC": "Bank of America", "BK": "BNY Mellon",
    "BKNG": "Booking Holdings", "BLK": "BlackRock", "BMY": "Bristol Myers Squibb",
    "BRK.B": "Berkshire Hathaway", "C": "Citigroup", "CAT": "Caterpillar",
    "CHTR": "Charter Communications", "CI": "Cigna", "CL": "Colgate-Palmolive",
    "CMCSA": "Comcast", "COF": "Capital One", "COP": "ConocoPhillips",
    "CRM": "Salesforce", "CSCO": "Cisco", "COST": "Costco",
    "CVS": "CVS Health", "CVX": "Chevron", "DE": "Deere", "DHR": "Danaher",
    "DIS": "Walt Disney", "DUK": "Duke Energy", "EMR": "Emerson Electric",
    "EXC": "Exelon", "F": "Ford", "FDX": "FedEx", "GD": "General Dynamics",
    "GE": "GE Aerospace", "GILD": "Gilead Sciences", "GM": "General Motors",
    "GOOG": "Alphabet C", "GOOGL": "Alphabet A", "GS": "Goldman Sachs",
    "HD": "Home Depot", "HON": "Honeywell", "IBM": "IBM", "INTC": "Intel",
    "INTU": "Intuit", "ISRG": "Intuitive Surgical", "JNJ": "Johnson & Johnson",
    "JPM": "JPMorgan Chase", "KHC": "Kraft Heinz", "KO": "Coca-Cola",
    "LIN": "Linde", "LLY": "Eli Lilly", "LMT": "Lockheed Martin", "LOW": "Lowe's",
    "MA": "Mastercard", "MCD": "McDonald's", "MDLZ": "Mondelez",
    "MDT": "Medtronic", "MET": "MetLife", "META": "Meta Platforms",
    "MO": "Altria", "MRK": "Merck", "MS": "Morgan Stanley", "MSFT": "Microsoft",
    "NEE": "NextEra Energy", "NFLX": "Netflix", "NKE": "Nike",
    "NOW": "ServiceNow", "NVDA": "Nvidia", "ORCL": "Oracle", "PEP": "PepsiCo",
    "PFE": "Pfizer", "PG": "Procter & Gamble", "PGR": "Progressive",
    "PM": "Philip Morris", "PYPL": "PayPal", "QCOM": "Qualcomm", "RTX": "RTX",
    "SBUX": "Starbucks", "SCHW": "Charles Schwab", "SLB": "Schlumberger",
    "SO": "Southern Company", "SPG": "Simon Property", "T": "AT&T",
    "TGT": "Target", "TMO": "Thermo Fisher", "TMUS": "T-Mobile",
    "TSLA": "Tesla", "TXN": "Texas Instruments", "UNH": "UnitedHealth",
    "UNP": "Union Pacific", "UPS": "UPS", "USB": "U.S. Bancorp", "V": "Visa",
    "VZ": "Verizon", "WFC": "Wells Fargo", "WMT": "Walmart", "XOM": "ExxonMobil",
    # Crypto
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "USDT-USD": "Tether",
    "BNB-USD": "BNB",
    "SOL-USD": "Solana", "XRP-USD": "XRP", "ADA-USD": "Cardano",
    "DOGE-USD": "Dogecoin", "AVAX-USD": "Avalanche", "DOT-USD": "Polkadot",
    "LINK-USD": "Chainlink",
    "ATOM-USD": "Cosmos", "LTC-USD": "Litecoin", "FIL-USD": "Filecoin",
    "NEAR-USD": "NEAR Protocol", "APT-USD": "Aptos", "ARB-USD": "Arbitrum",
    "OP-USD": "Optimism", "AAVE-USD": "Aave",
}
