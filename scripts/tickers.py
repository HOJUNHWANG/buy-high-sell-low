"""Central ticker lists — imported by all data scripts."""

SP100_TICKERS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B",
    "UNH", "XOM", "LLY", "JPM", "JNJ", "V", "PG", "MA", "HD", "CVX",
    "MRK", "ABBV", "PEP", "COST", "AVGO", "KO", "WMT", "BAC", "MCD",
    "ACN", "TMO", "CRM", "CSCO", "ABT", "LIN", "DHR", "NEE", "TXN",
    "NKE", "PM", "ORCL", "RTX", "HON", "UPS", "IBM", "AMGN", "QCOM",
    "LOW", "INTU", "SPGI", "CAT", "GE", "BA", "GS", "MS", "BLK",
    "AMAT", "ISRG", "AXP", "DE", "SYK", "MDLZ", "ADI", "GILD", "MMC",
    "SCHW", "ELV", "ZTS", "C", "ADP", "TJX", "MO", "CI", "CB", "SO",
    "DUK", "CL", "BDX", "ITW", "EOG", "BSX", "WM", "PLD", "CME",
    "NOC", "TGT", "USB", "EMR", "F", "GM", "PNC", "NSC", "ICE",
    "AON", "MCO", "HUM", "REGN", "VRTX", "PANW", "SNPS", "CDNS",
]  # 100 tickers

# Top 20 crypto by market cap (yfinance format: SYMBOL-USD)
CRYPTO_TICKERS = [
    "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD",
    "ADA-USD", "DOGE-USD", "AVAX-USD", "DOT-USD", "MATIC-USD",
    "LINK-USD", "UNI-USD", "ATOM-USD", "LTC-USD", "FIL-USD",
    "NEAR-USD", "APT-USD", "ARB-USD", "OP-USD", "AAVE-USD",
]  # 20 crypto

# Combined list for scripts that handle both
ALL_TICKERS = SP100_TICKERS + CRYPTO_TICKERS

# Official company names for news ticker mapping
COMPANY_NAMES = {
    "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "Nvidia", "AMZN": "Amazon",
    "GOOGL": "Google", "META": "Meta", "TSLA": "Tesla", "BRK.B": "Berkshire",
    "UNH": "UnitedHealth", "XOM": "ExxonMobil", "LLY": "Eli Lilly", "JPM": "JPMorgan",
    "JNJ": "Johnson & Johnson", "V": "Visa", "PG": "Procter & Gamble", "MA": "Mastercard",
    "HD": "Home Depot", "CVX": "Chevron", "MRK": "Merck", "ABBV": "AbbVie",
    "PEP": "PepsiCo", "COST": "Costco", "AVGO": "Broadcom", "KO": "Coca-Cola",
    "WMT": "Walmart", "BAC": "Bank of America", "MCD": "McDonald's", "ACN": "Accenture",
    "TMO": "Thermo Fisher", "CRM": "Salesforce", "CSCO": "Cisco", "ABT": "Abbott",
    "LIN": "Linde", "DHR": "Danaher", "NEE": "NextEra", "TXN": "Texas Instruments",
    "NKE": "Nike", "PM": "Philip Morris", "ORCL": "Oracle", "RTX": "Raytheon",
    "HON": "Honeywell", "UPS": "UPS", "IBM": "IBM", "AMGN": "Amgen", "QCOM": "Qualcomm",
    "LOW": "Lowe's", "INTU": "Intuit", "SPGI": "S&P Global", "CAT": "Caterpillar",
    "GE": "GE", "BA": "Boeing", "GS": "Goldman Sachs", "MS": "Morgan Stanley",
    "BLK": "BlackRock", "AMAT": "Applied Materials", "ISRG": "Intuitive Surgical",
    "AXP": "American Express", "DE": "John Deere", "SYK": "Stryker", "MDLZ": "Mondelez",
    "ADI": "Analog Devices", "GILD": "Gilead", "MMC": "Marsh & McLennan",
    "SCHW": "Charles Schwab", "ELV": "Elevance", "ZTS": "Zoetis", "C": "Citigroup",
    "ADP": "ADP", "TJX": "TJX", "MO": "Altria", "CI": "Cigna", "CB": "Chubb",
    "SO": "Southern Company", "DUK": "Duke Energy", "CL": "Colgate-Palmolive",
    "BDX": "Becton Dickinson", "ITW": "Illinois Tool Works", "EOG": "EOG Resources",
    "BSX": "Boston Scientific", "WM": "Waste Management", "PLD": "Prologis",
    "CME": "CME Group", "NOC": "Northrop Grumman", "TGT": "Target", "USB": "US Bancorp",
    "EMR": "Emerson Electric", "F": "Ford", "GM": "General Motors", "PNC": "PNC Financial",
    "NSC": "Norfolk Southern", "ICE": "ICE", "AON": "Aon", "MCO": "Moody's",
    "HUM": "Humana", "REGN": "Regeneron", "VRTX": "Vertex", "PANW": "Palo Alto Networks",
    "SNPS": "Synopsys", "CDNS": "Cadence",
    # Crypto
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "BNB-USD": "BNB",
    "SOL-USD": "Solana", "XRP-USD": "XRP", "ADA-USD": "Cardano",
    "DOGE-USD": "Dogecoin", "AVAX-USD": "Avalanche", "DOT-USD": "Polkadot",
    "MATIC-USD": "Polygon", "LINK-USD": "Chainlink", "UNI-USD": "Uniswap",
    "ATOM-USD": "Cosmos", "LTC-USD": "Litecoin", "FIL-USD": "Filecoin",
    "NEAR-USD": "NEAR Protocol", "APT-USD": "Aptos", "ARB-USD": "Arbitrum",
    "OP-USD": "Optimism", "AAVE-USD": "Aave",
}
