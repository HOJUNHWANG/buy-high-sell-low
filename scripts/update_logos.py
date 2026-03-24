"""
update_logos.py — Populate logo_url for stocks + crypto.
Usage: python scripts/update_logos.py

Stock icons:  DuckDuckGo favicon service (free, high quality)
Crypto icons: spothq CDN (16/20) + CoinGecko fallback (4/20)
"""
import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

sys.path.insert(0, os.path.dirname(__file__))
from tickers import SP500_TICKERS, CRYPTO_TICKERS, ETF_TICKERS

# ── Crypto logos ──
CRYPTO_ICON_BASE = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color"

CRYPTO_LOGO_MAP = {
    "BTC-USD": f"{CRYPTO_ICON_BASE}/btc.png",
    "ETH-USD": f"{CRYPTO_ICON_BASE}/eth.png",
    "USDT-USD": f"{CRYPTO_ICON_BASE}/usdt.png",
    "BNB-USD": f"{CRYPTO_ICON_BASE}/bnb.png",
    "SOL-USD": f"{CRYPTO_ICON_BASE}/sol.png",
    "XRP-USD": f"{CRYPTO_ICON_BASE}/xrp.png",
    "ADA-USD": f"{CRYPTO_ICON_BASE}/ada.png",
    "DOGE-USD": f"{CRYPTO_ICON_BASE}/doge.png",
    "AVAX-USD": f"{CRYPTO_ICON_BASE}/avax.png",
    "DOT-USD": f"{CRYPTO_ICON_BASE}/dot.png",
    "LINK-USD": f"{CRYPTO_ICON_BASE}/link.png",
    "UNI-USD": f"{CRYPTO_ICON_BASE}/uni.png",
    "ATOM-USD": f"{CRYPTO_ICON_BASE}/atom.png",
    "LTC-USD": f"{CRYPTO_ICON_BASE}/ltc.png",
    "FIL-USD": f"{CRYPTO_ICON_BASE}/fil.png",
    "AAVE-USD": f"{CRYPTO_ICON_BASE}/aave.png",
    # Not on spothq CDN — use CoinGecko static assets
    "NEAR-USD": "https://assets.coingecko.com/coins/images/10365/small/near.jpg",
    "APT-USD": "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png",
    "ARB-USD": "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
    "OP-USD": "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
}

# ── Stock logos via DuckDuckGo favicon service ──
STOCK_DOMAINS = {
    # A
    "A": "agilent.com", "AAPL": "apple.com", "ABBV": "abbvie.com",
    "ABNB": "airbnb.com", "ABT": "abbott.com", "ACGL": "archgroup.com",
    "ACN": "accenture.com", "ADBE": "adobe.com", "ADI": "analog.com",
    "ADM": "adm.com", "ADP": "adp.com", "ADSK": "autodesk.com",
    "AEE": "ameren.com", "AEP": "aep.com", "AES": "aes.com",
    "AFL": "aflac.com", "AIG": "aig.com", "AIZ": "assurant.com",
    "AJG": "ajg.com", "AKAM": "akamai.com", "ALB": "albemarle.com",
    "ALGN": "aligntech.com", "ALL": "allstate.com", "ALLE": "allegion.com",
    "AMAT": "appliedmaterials.com", "AMCR": "amcor.com", "AMD": "amd.com",
    "AME": "ametek.com", "AMGN": "amgen.com", "AMP": "ameriprise.com",
    "AMT": "americantower.com", "AMZN": "amazon.com", "ANET": "arista.com",
    "AON": "aon.com", "AOS": "aosmith.com", "APA": "apacorp.com",
    "APD": "airproducts.com", "APH": "amphenol.com", "APO": "apollo.com",
    "APP": "applovin.com", "APTV": "aptiv.com", "ARE": "are.com",
    "ARES": "aresmgmt.com", "ATO": "atmosenergy.com", "AVB": "avalonbay.com",
    "AVGO": "broadcom.com", "AVY": "averydennison.com", "AWK": "amwater.com",
    "AXON": "axon.com", "AXP": "americanexpress.com", "AZO": "autozone.com",
    # B
    "BA": "boeing.com", "BAC": "bankofamerica.com", "BALL": "ball.com",
    "BAX": "baxter.com", "BBY": "bestbuy.com", "BDX": "bd.com",
    "BEN": "franklintempleton.com", "BF.B": "brown-forman.com", "BG": "bunge.com",
    "BIIB": "biogen.com", "BK": "bnymellon.com", "BKNG": "booking.com",
    "BKR": "bakerhughes.com", "BLDR": "bldr.com", "BLK": "blackrock.com",
    "BMY": "bms.com", "BR": "broadridge.com", "BRK.B": "berkshirehathaway.com",
    "BRO": "bbinsurance.com", "BSX": "bostonscientific.com", "BX": "blackstone.com",
    "BXP": "bxp.com",
    # C
    "C": "citigroup.com", "CAG": "conagrabrands.com", "CAH": "cardinalhealth.com",
    "CARR": "carrier.com", "CAT": "caterpillar.com", "CB": "chubb.com",
    "CBOE": "cboe.com", "CBRE": "cbre.com", "CCI": "crowncastle.com",
    "CCL": "carnival.com", "CDNS": "cadence.com", "CDW": "cdw.com",
    "CEG": "constellationenergy.com", "CF": "cfindustries.com", "CFG": "citizensbank.com",
    "CHD": "churchdwight.com", "CHRW": "chrobinson.com", "CHTR": "charter.com",
    "CI": "thecignagroup.com", "CIEN": "ciena.com", "CINF": "cinfin.com",
    "CL": "colgatepalmolive.com", "CLX": "thecloroxcompany.com", "CMCSA": "comcast.com",
    "CME": "cmegroup.com", "CMG": "chipotle.com", "CMI": "cummins.com",
    "CMS": "cmsenergy.com", "CNC": "centene.com", "CNP": "centerpointenergy.com",
    "COF": "capitalone.com", "COIN": "coinbase.com", "COO": "coopercos.com",
    "COP": "conocophillips.com", "COR": "cencora.com", "COST": "costco.com",
    "CPAY": "corpay.com", "CPB": "campbells.com", "CPRT": "copart.com",
    "CPT": "camdenliving.com", "CRH": "crh.com", "CRL": "criver.com",
    "CRM": "salesforce.com", "CRWD": "crowdstrike.com", "CSCO": "cisco.com",
    "CSGP": "costargroup.com", "CSX": "csx.com", "CTAS": "cintas.com",
    "CTRA": "coterra.com", "CTSH": "cognizant.com", "CTVA": "corteva.com",
    "CVNA": "carvana.com", "CVS": "cvshealth.com", "CVX": "chevron.com",
    # D
    "D": "dominionenergy.com", "DAL": "delta.com", "DASH": "doordash.com",
    "DD": "dupont.com", "DDOG": "datadoghq.com", "DE": "deere.com",
    "DECK": "deckers.com", "DELL": "dell.com", "DG": "dollargeneral.com",
    "DGX": "questdiagnostics.com", "DHI": "drhorton.com", "DHR": "danaher.com",
    "DIS": "disney.com", "DLR": "digitalrealty.com", "DLTR": "dollartree.com",
    "DOC": "healthpeak.com", "DOV": "dovercorporation.com", "DOW": "dow.com",
    "DPZ": "dominos.com", "DRI": "darden.com", "DTE": "dteenergy.com",
    "DUK": "duke-energy.com", "DVA": "davita.com", "DVN": "devonenergy.com",
    "DXCM": "dexcom.com",
    # E
    "EA": "ea.com", "EBAY": "ebay.com", "ECL": "ecolab.com",
    "ED": "coned.com", "EFX": "equifax.com", "EG": "everestgroup.com",
    "EIX": "edison.com", "EL": "esteelauder.com", "ELV": "elevancehealth.com",
    "EME": "emcorgroup.com", "EMR": "emerson.com", "EOG": "eogresources.com",
    "EPAM": "epam.com", "EQIX": "equinix.com", "EQR": "equityapartments.com",
    "EQT": "eqt.com", "ERIE": "erieinsurance.com", "ES": "eversource.com",
    "ESS": "essexapartmenthomes.com", "ETN": "eaton.com", "ETR": "entergy.com",
    "EVRG": "evergy.com", "EW": "edwards.com", "EXC": "exeloncorp.com",
    "EXE": "expandenergy.com", "EXPD": "expeditors.com", "EXPE": "expedia.com",
    "EXR": "extraspace.com",
    # F
    "F": "ford.com", "FANG": "diamondbackenergy.com", "FAST": "fastenal.com",
    "FCX": "fcx.com", "FDS": "factset.com", "FDX": "fedex.com",
    "FE": "firstenergycorp.com", "FFIV": "f5.com", "FICO": "fico.com",
    "FIS": "fisglobal.com", "FISV": "fiserv.com", "FITB": "53.com",
    "FIX": "comfortsystemsusa.com", "FOX": "foxcorporation.com",
    "FOXA": "foxcorporation.com", "FRT": "federalrealty.com",
    "FSLR": "firstsolar.com", "FTNT": "fortinet.com", "FTV": "fortive.com",
    # G
    "GD": "gd.com", "GDDY": "godaddy.com", "GE": "ge.com",
    "GEHC": "gehealthcare.com", "GEN": "gendigital.com", "GEV": "gevernova.com",
    "GILD": "gilead.com", "GIS": "generalmills.com", "GL": "globelifeinsurance.com",
    "GLW": "corning.com", "GM": "gm.com", "GNRC": "generac.com",
    "GOOG": "google.com", "GOOGL": "google.com", "GPC": "genpt.com",
    "GPN": "globalpayments.com", "GRMN": "garmin.com", "GS": "goldmansachs.com",
    "GWW": "grainger.com",
    # H
    "HAL": "halliburton.com", "HAS": "hasbro.com", "HBAN": "huntington.com",
    "HCA": "hcahealthcare.com", "HD": "homedepot.com", "HIG": "thehartford.com",
    "HII": "huntingtoningalls.com", "HLT": "hilton.com", "HOLX": "hologic.com",
    "HON": "honeywell.com", "HOOD": "robinhood.com", "HPE": "hpe.com",
    "HPQ": "hp.com", "HRL": "hormelfoods.com", "HSIC": "henryschein.com",
    "HST": "hosthotels.com", "HSY": "thehersheycompany.com", "HUBB": "hubbell.com",
    "HUM": "humana.com", "HWM": "howmet.com",
    # I
    "IBKR": "interactivebrokers.com", "IBM": "ibm.com", "ICE": "ice.com",
    "IDXX": "idexx.com", "IEX": "idexcorp.com", "IFF": "iff.com",
    "INCY": "incyte.com", "INTC": "intel.com", "INTU": "intuit.com",
    "INVH": "invitationhomes.com", "IP": "internationalpaper.com",
    "IQV": "iqvia.com", "IR": "irco.com", "IRM": "ironmountain.com",
    "ISRG": "intuitive.com", "IT": "gartner.com", "ITW": "itw.com",
    "IVZ": "invesco.com",
    # J
    "J": "jacobs.com", "JBHT": "jbhunt.com", "JBL": "jabil.com",
    "JCI": "johnsoncontrols.com", "JKHY": "jackhenry.com", "JNJ": "jnj.com",
    "JPM": "jpmorganchase.com",
    # K
    "KDP": "keurigdrpepper.com", "KEY": "key.com", "KEYS": "keysight.com",
    "KHC": "kraftheinzcompany.com", "KIM": "kimcorealty.com", "KKR": "kkr.com",
    "KLAC": "kla.com", "KMB": "kimberly-clark.com", "KMI": "kindermorgan.com",
    "KO": "coca-cola.com", "KR": "kroger.com", "KVUE": "kenvue.com",
    # L
    "L": "loews.com", "LDOS": "leidos.com", "LEN": "lennar.com",
    "LH": "labcorp.com", "LHX": "l3harris.com", "LII": "lennoxinternational.com",
    "LIN": "linde.com", "LLY": "lilly.com", "LMT": "lockheedmartin.com",
    "LNT": "alliantenergy.com", "LOW": "lowes.com", "LRCX": "lamresearch.com",
    "LULU": "lululemon.com", "LUV": "southwest.com", "LVS": "sands.com",
    "LW": "lambweston.com", "LYB": "lyondellbasell.com", "LYV": "livenationentertainment.com",
    # M
    "MA": "mastercard.com", "MAA": "maac.com", "MAR": "marriott.com",
    "MAS": "masco.com", "MCD": "mcdonalds.com", "MCHP": "microchip.com",
    "MCK": "mckesson.com", "MCO": "moodys.com", "MDLZ": "mondelezinternational.com",
    "MDT": "medtronic.com", "MET": "metlife.com", "META": "meta.com",
    "MGM": "mgmresorts.com", "MKC": "mccormick.com", "MLM": "martinmarietta.com",
    "MMM": "3m.com", "MNST": "monsterbevcorp.com", "MO": "altria.com",
    "MOH": "molinahealthcare.com", "MOS": "mosaicco.com", "MPC": "marathonpetroleum.com",
    "MPWR": "monolithicpower.com", "MRK": "merck.com", "MRNA": "modernatx.com",
    "MS": "morganstanley.com", "MSCI": "msci.com", "MSFT": "microsoft.com",
    "MSI": "motorolasolutions.com", "MTB": "mtb.com", "MTCH": "match.com",
    "MTD": "mt.com", "MU": "micron.com",
    # N
    "NCLH": "ncl.com", "NDAQ": "nasdaq.com", "NDSN": "nordson.com",
    "NEE": "nexteraenergy.com", "NEM": "newmont.com", "NFLX": "netflix.com",
    "NI": "nisource.com", "NKE": "nike.com", "NOC": "northropgrumman.com",
    "NOW": "servicenow.com", "NRG": "nrg.com", "NSC": "norfolksouthern.com",
    "NTAP": "netapp.com", "NTRS": "northerntrust.com", "NUE": "nucor.com",
    "NVDA": "nvidia.com", "NVR": "nvrinc.com", "NWS": "newscorp.com",
    "NWSA": "newscorp.com", "NXPI": "nxp.com",
    # O
    "O": "realtyincome.com", "ODFL": "odfl.com", "OKE": "oneok.com",
    "OMC": "omnicomgroup.com", "ON": "onsemi.com", "ORCL": "oracle.com",
    "ORLY": "oreillyauto.com", "OTIS": "otis.com", "OXY": "oxy.com",
    # P
    "PANW": "paloaltonetworks.com", "PAYC": "paycom.com", "PAYX": "paychex.com",
    "PCAR": "paccar.com", "PCG": "pge.com", "PEG": "pseg.com",
    "PEP": "pepsico.com", "PFE": "pfizer.com", "PFG": "principal.com",
    "PG": "pg.com", "PGR": "progressive.com", "PH": "parker.com",
    "PHM": "pultegroup.com", "PKG": "packagingcorp.com", "PLD": "prologis.com",
    "PLTR": "palantir.com", "PM": "pmi.com", "PNC": "pnc.com",
    "PNR": "pentair.com", "PNW": "pinnaclewest.com", "PODD": "insulet.com",
    "POOL": "poolcorp.com", "PPG": "ppg.com", "PPL": "pplweb.com",
    "PRU": "prudential.com", "PSA": "publicstorage.com", "PSX": "phillips66.com",
    "PTC": "ptc.com", "PWR": "quantaservices.com", "PYPL": "paypal.com",
    # Q
    "QCOM": "qualcomm.com",
    # R
    "RCL": "royalcaribbean.com", "REG": "regencycenters.com",
    "REGN": "regeneron.com", "RF": "regionsbank.com", "RJF": "raymondjames.com",
    "RL": "ralphlauren.com", "RMD": "resmed.com", "ROK": "rockwellautomation.com",
    "ROL": "rollins.com", "ROP": "ropertech.com", "ROST": "rossstores.com",
    "RSG": "republicservices.com", "RTX": "rtx.com", "RVTY": "revvity.com",
    # S
    "SBAC": "sbasite.com", "SBUX": "starbucks.com", "SCHW": "schwab.com",
    "SHW": "sherwin-williams.com", "SJM": "jmsmucker.com", "SLB": "slb.com",
    "SMCI": "supermicro.com", "SNA": "snapon.com", "SNPS": "synopsys.com",
    "SO": "southerncompany.com", "SOLV": "solventum.com", "SPG": "simon.com",
    "SPGI": "spglobal.com", "SRE": "sempra.com", "STE": "steris.com",
    "STLD": "steeldynamics.com", "STT": "statestreet.com", "STX": "seagate.com",
    "STZ": "cbrands.com", "SWK": "stanleyblackanddecker.com",
    "SWKS": "skyworksinc.com", "SYF": "synchrony.com", "SYK": "stryker.com",
    "SYY": "sysco.com",
    # T
    "T": "att.com", "TAP": "molsoncoors.com", "TDG": "transdigm.com",
    "TDY": "teledyne.com", "TECH": "bio-techne.com", "TEL": "te.com",
    "TER": "teradyne.com", "TFC": "truist.com", "TGT": "target.com",
    "TJX": "tjx.com", "TMO": "thermofisher.com", "TMUS": "t-mobile.com",
    "TPL": "texaspacific.com", "TPR": "tapestry.com", "TRGP": "targaresources.com",
    "TRMB": "trimble.com", "TROW": "troweprice.com", "TRV": "travelers.com",
    "TSCO": "tractorsupply.com", "TSLA": "tesla.com", "TSN": "tysonfoods.com",
    "TT": "tranetechnologies.com", "TTD": "thetradedesk.com",
    "TTWO": "take2games.com", "TXN": "ti.com", "TXT": "textron.com",
    "TYL": "tylertech.com",
    # U
    "UAL": "united.com", "UBER": "uber.com", "UDR": "udr.com",
    "UHS": "uhs.com", "ULTA": "ulta.com", "UNH": "unitedhealthgroup.com",
    "UNP": "up.com", "UPS": "ups.com", "URI": "unitedrentals.com",
    "USB": "usbank.com",
    # V
    "V": "visa.com", "VICI": "vfreit.com", "VLO": "valero.com",
    "VLTO": "veralto.com", "VMC": "vulcanmaterials.com", "VRSK": "verisk.com",
    "VRSN": "verisign.com", "VRTX": "vrtx.com", "VST": "vistracorp.com",
    "VTR": "ventasreit.com", "VTRS": "viatris.com", "VZ": "verizon.com",
    # W
    "WAB": "wabteccorp.com", "WAT": "waters.com", "WBD": "wbd.com",
    "WDAY": "workday.com", "WDC": "westerndigital.com", "WEC": "wecenergygroup.com",
    "WELL": "welltower.com", "WFC": "wellsfargo.com", "WM": "wm.com",
    "WMB": "williams.com", "WMT": "walmart.com", "WRB": "berkley.com",
    "WSM": "williams-sonoma.com", "WST": "westpharma.com", "WTW": "wtwco.com",
    "WY": "weyerhaeuser.com", "WYNN": "wynnresorts.com",
    # X-Z
    "XEL": "xcelenergy.com", "XOM": "exxonmobil.com", "XYL": "xylem.com",
    "YUM": "yum.com", "ZBH": "zimmerbiomet.com", "ZBRA": "zebra.com",
    "ZTS": "zoetis.com",
    # ETFs
    "SPY": "ssga.com", "QQQ": "invesco.com", "DIA": "ssga.com", "IWM": "ishares.com",
    "XLK": "ssga.com", "XLF": "ssga.com", "XLE": "ssga.com", "XLV": "ssga.com",
    "XLI": "ssga.com", "XLP": "ssga.com", "XLY": "ssga.com", "XLU": "ssga.com",
    "XLRE": "ssga.com", "XLC": "ssga.com", "XLB": "ssga.com",
    "TLT": "ishares.com", "BND": "vanguard.com", "HYG": "ishares.com",
    "GLD": "ssga.com", "SLV": "ishares.com", "USO": "uscfinvestments.com",
    "EFA": "ishares.com", "EEM": "ishares.com",
    "ARKK": "ark-invest.com", "SOXX": "ishares.com", "XBI": "ssga.com",
}


def update_crypto_logos():
    print("Updating crypto logos...")
    updated = 0
    for ticker, logo_url in CRYPTO_LOGO_MAP.items():
        supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
        print(f"  {ticker}: OK")
        updated += 1
    print(f"Crypto logos updated: {updated}/{len(CRYPTO_LOGO_MAP)}")


def update_stock_logos():
    """Use DuckDuckGo favicon service — higher quality than gstatic."""
    result = supabase.table("stocks").select("ticker").neq("sector", "Cryptocurrency").execute()
    all_stocks = [r["ticker"] for r in result.data]

    print(f"\nUpdating logos for {len(all_stocks)} stocks via DuckDuckGo Favicon...")
    updated, too_small, no_domain = 0, 0, 0

    for ticker in all_stocks:
        domain = STOCK_DOMAINS.get(ticker)
        if not domain:
            print(f"  {ticker}: no domain mapping, skipping")
            no_domain += 1
            continue

        logo_url = f"https://icons.duckduckgo.com/ip3/{domain}.ico"

        try:
            r = requests.get(logo_url, timeout=5)
            if r.status_code == 200 and len(r.content) > 200:
                supabase.table("stocks").update({"logo_url": logo_url}).eq("ticker", ticker).execute()
                print(f"  {ticker}: OK ({domain}, {len(r.content)}B)")
                updated += 1
            else:
                supabase.table("stocks").update({"logo_url": None}).eq("ticker", ticker).execute()
                print(f"  {ticker}: too small ({len(r.content)}B), using letter fallback")
                too_small += 1
        except Exception as e:
            print(f"  {ticker}: error — {e}")
            supabase.table("stocks").update({"logo_url": None}).eq("ticker", ticker).execute()
            too_small += 1

        time.sleep(0.1)

    print(f"Stock logos: {updated} OK, {too_small} letter fallback, {no_domain} no domain")


if __name__ == "__main__":
    update_crypto_logos()
    update_stock_logos()
