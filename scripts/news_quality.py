"""Grounded news entities and summaries; no database or model calls on import."""
from __future__ import annotations
import hashlib
import html
import ipaddress
import json
import re
import socket
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, urljoin
from bs4 import BeautifulSoup
from tickers import COMPANY_NAMES

QUALITY_VERSION = 2
ALIASES = {
    "SPCX": ["SpaceX", "Space Exploration Technologies"], "INTC": ["Intel"],
    "GOOG": ["Google", "Alphabet"], "GOOGL": ["Google", "Alphabet"],
    "META": ["Meta Platforms", "Meta", "Facebook", "Instagram"], "NVDA": ["Nvidia"],
    "BRK.B": ["Berkshire Hathaway", "Berkshire"], "BKNG": ["Booking Holdings", "Booking.com"],
    "USDC-USD": ["USDC", "USD Coin"], "USDT-USD": ["USDT", "Tether"],
    "BTC-USD": ["Bitcoin", "BTC"], "ETH-USD": ["Ethereum", "Ether", "ETH"],
    "SOL-USD": ["Solana", "SOL"], "NEAR-USD": ["NEAR Protocol"],
    "UNI-USD": ["Uniswap"], "XLM-USD": ["Stellar Lumens"], "AVAX-USD": ["Avalanche", "AVAX"],
}
AMBIGUOUS = {"T", "V", "C", "F", "SO", "NOW", "ALL", "LOW", "NEAR", "DIA", "CAT", "A", "B", "AMT", "UPS"}
MATERIAL_ACTION = re.compile(r"\b(earnings|revenue|profit|shares?|stocks?|dividend|IPO|buyback|guidance|raised|cut|fell|rose|freez\w*|froze|frozen|seized|stolen|stole|theft|exploit\w*|hack\w*|breach|transferred|issued|redemption|depeg|supply|delist\w*|listed|liquidations?)\b", re.I)
CRIME = re.compile(r"\b(kidnapp?\w*|ransom|robbery|tortur\w*|murder\w*)\b", re.I)
FINANCIAL = re.compile(r"\b(earnings|revenue|shares?|stock|profit|guidance|acqui\w*|merger|dividend|buyback|IPO|ETF|fund|regulat\w*|SEC|lawsuit|hack\w*|exploit\w*|breach|freez\w*|froze|frozen|stablecoins?|supply|token|blockchain|mainnet|protocol|treasur\w*|rate|inflation|GDP|jobs|tariff\w*|launch\w*|contracts?|partnership|production|deliveries|recall|chips?|cloud|satellites?|FCC|FDA|approval|antitrust|CEO|CFO)\b", re.I)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "nav", "header", "footer", "aside", "form", "svg"}: self.skip+=1
    def handle_endtag(self, tag):
        if tag in {"script", "style", "nav", "header", "footer", "aside", "form", "svg"}: self.skip=max(0,self.skip-1)
        if not self.skip and tag in {"p", "div", "h1", "h2", "br"}: self.parts.append("\n")
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)


def plain_text(value: str) -> str:
    parser=TextExtractor(); parser.feed(html.unescape(value or ""))
    return re.sub(r"[ \t]+", " ", html.unescape(" ".join(parser.parts))).strip()


def canonical_url(value: str) -> str:
    try:
        u=urlsplit(value)
        if u.scheme not in {"http", "https"} or not u.hostname or u.username or u.password: return ""
        query=[(k,v) for k,v in parse_qsl(u.query) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid","gclid","ref","source"}]
        return urlunsplit((u.scheme,u.netloc.lower(),u.path.rstrip("/") or "/",urlencode(query),""))
    except ValueError: return ""


def entity_evidence(title: str, content: str = "") -> list[dict]:
    title=plain_text(title); content=plain_text(content)
    text=title+"\n"+content
    if CRIME.search(title) and not re.search(r"\b(exchange|protocol|company|corporate|SEC)\b",title,re.I): return []
    found=[]
    lifestyle=bool(re.search(r"\b(recipes?|snacks?|nutrition|cooking|vitamins?)\b",title,re.I))
    for ticker, company in COMPANY_NAMES.items():
        if ticker=="AAPL" and lifestyle: continue
        aliases=list(dict.fromkeys([company]+ALIASES.get(ticker,[])))
        # Short ordinary words require a cash tag or explicit exchange notation.
        symbol=ticker.removesuffix("-USD")
        if symbol not in AMBIGUOUS and len(symbol)>=3: aliases.append(symbol)
        matches=[]
        for alias in aliases:
            if alias.upper() in AMBIGUOUS: continue
            pattern=r"(?<![\w])"+re.escape(alias)+r"(?![\w])"
            for m in re.finditer(pattern,text,re.I):
                # Uppercase symbol evidence avoids generic words such as 'link'.
                if alias == symbol and m.group()!=symbol and alias not in ALIASES.get(ticker,[]): continue
                start=max(0,text.rfind("\n",0,m.start())+1,text.rfind(". ",0,m.start())+2)
                end=text.find(". ",m.end()); end=len(text) if end<0 else end+1
                sentence=text[start:min(end,start+600)].strip()
                direct=m.start()<len(title)
                if not direct and not FINANCIAL.search(sentence): continue
                # Company names in unrelated consumer lifestyle stories do not
                # constitute market evidence for the security.
                if not FINANCIAL.search(text) and not ticker.endswith("-USD"): continue
                nearby=text[max(start,m.start()-80):min(end,m.end()+80)]
                material=bool(MATERIAL_ACTION.search(nearby))
                relation="direct" if direct else "material" if material else "mentioned"
                matches.append({"ticker":ticker,"alias":m.group(),"relationship":relation,
                    "confidence":0.99 if direct else 0.95 if material else 0.6,"evidence":sentence[:350]})
        explicit=re.search(r"(?:\$|\b(?:NASDAQ|NYSE):\s*)"+re.escape(symbol)+r"\b",text)
        if explicit: matches.append({"ticker":ticker,"alias":explicit.group(),"relationship":"direct","confidence":0.99,"evidence":text[max(0,explicit.start()-50):explicit.end()+100]})
        if matches: found.append(max(matches,key=lambda x:x["confidence"]))
    return found


def event_key(title: str, evidence: list[dict], published: str | None = None) -> str:
    text=title.lower()
    entities=sorted(set("GOOG" if e["ticker"]=="GOOGL" else e["ticker"] for e in evidence))
    # This named incident generated many substantially duplicate headlines.
    if "binance" in text and re.search(r"hack|stolen|heist|theft|breach",text):
        try: week=datetime.fromisoformat((published or "").replace("Z","+00:00")).strftime("%G-%V")
        except ValueError: week="undated"
        key="binance-security-incident:"+week
    else: key=" ".join(re.findall(r"[a-z0-9]+",text))
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def baseline_analysis(title: str, content: str = "", published: str | None = None) -> tuple[dict,dict]:
    title=plain_text(title); text=plain_text(content)[:14000]
    evidence=entity_evidence(title,text)
    relevant=[e for e in evidence if e["relationship"] in {"direct","material"}]
    category="company" if relevant else "macro" if re.search(r"\b(Fed|inflation|CPI|GDP|jobs|tariffs?|Treasury|interest rates?)\b",title,re.I) else "sector" if FINANCIAL.search(title) else "general"
    coverage="full_text" if len(text)>1800 else "lead" if len(text)>150 else "headline"
    # A short source excerpt is deliberately distinguished from AI analysis.
    # Never synthesize causation from a headline-only input.
    excerpt=(" ".join(text.split()[:24]) + ("…" if len(text.split())>24 else "")) if coverage!="headline" else None
    public={"related_tickers":sorted(e["ticker"] for e in relevant),"ai_summary":excerpt,"ai_insight":None,
        "ai_sentiment":None,"ai_caution":None,"summary_method":"source_excerpt" if excerpt else "headline_only",
        "source_coverage":coverage,"news_category":category,"relevance_score":90 if any(e["relationship"]=="direct" for e in evidence) else 65 if relevant else 60 if category=="macro" else 35 if category=="sector" else 10,
        "event_key":event_key(title,evidence,published)}
    private={"source_text":title+"\n"+text,"entities":evidence,"quality_version":QUALITY_VERSION,"checked_at":datetime.now(timezone.utc).isoformat()}
    return public,private


def grounded_summary(result: dict, source_text: str) -> bool:
    """Extractive sentence evidence prevents actor/amount/action substitutions.

    The model selects salient source sentences; every displayed sentence must
    occur verbatim in the supplied source. A separate free-form 'impact' is not
    accepted, even when all its numbers happen to occur somewhere in the story.
    """
    sentences=result.get("sentences")
    if not isinstance(sentences,list) or not 1<=len(sentences)<=2: return False
    sentences_in_source=set()
    for paragraph in source_text.splitlines():
        sentences_in_source.update(" ".join(s.split()) for s in re.split(r'(?<=[.!?])\s+(?=[A-Z“\"\'])',paragraph.strip()) if s.strip())
    if sum(len(s.split()) for s in sentences if isinstance(s,str))>25:return False
    return all(isinstance(s,str) and 20<=len(s)<=500 and " ".join(s.split()) in sentences_in_source for s in sentences)



PUBLISHERS={"decrypt.co","coindesk.com","cointelegraph.com","cnbc.com","marketwatch.com","bbc.com","bbc.co.uk","finance.yahoo.com","reuters.com","apnews.com","investor.intel.com","ir.spacex.com"}
def extract_article_text(document: str) -> str:
    soup=BeautifulSoup(document,"html.parser")
    candidates=soup.select('article, [itemprop="articleBody"], .post-content, .post__content, .article__body, .article-body, .article-content, .entry-content, [class*="ArticleBody-articleBody"], main .prose')
    texts=[]
    for root in candidates:
        for noise in root.select('script,style,nav,aside,footer,form,iframe,[class*="widget"],[id*="widget"],[class*="newsletter"],[class*="advertisement"],[class*="share-button"]'):
            noise.decompose()
        text="\n".join(p.get_text(" ",strip=True) for p in root.find_all("p") if len(p.get_text(" ",strip=True))>60)
        if text:texts.append(text)
    return max(texts,key=len)[:14000] if texts else ""


def allowed_source_url(url: str) -> bool:
    try:
        u=urlsplit(url)
        if u.scheme!="https" or u.port not in (None,443) or u.username or u.password: return False
        host=u.hostname or ""
        if not any(host==p or host.endswith("."+p) for p in PUBLISHERS): return False
        return all(ipaddress.ip_address(a[4][0]).is_global for a in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM))
    except (ValueError,OSError): return False


def source_lead(session, url: str) -> str:
    """Read permitted public article metadata/paragraphs without bypassing access controls."""
    for _ in range(4):
        if not allowed_source_url(url): return ""
        with session.get(url,timeout=(4,8),allow_redirects=False,stream=True) as response:
            if response.is_redirect: url=urljoin(url,response.headers.get("Location","")); continue
            if response.status_code!=200 or "html" not in response.headers.get("Content-Type",""): return ""
            chunks=[]; size=0
            for chunk in response.iter_content(16384):
                size+=len(chunk)
                if size>2_000_000: return ""
                chunks.append(chunk)
            document=b"".join(chunks).decode(response.encoding or "utf8",errors="replace")
        # JSON-LD articleBody excludes navigation, price widgets and ads.
        for value in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',document,re.S|re.I):
            try:
                stack=[json.loads(html.unescape(value))]
                while stack:
                    item=stack.pop()
                    if isinstance(item,list): stack.extend(item)
                    elif isinstance(item,dict):
                        if isinstance(item.get("articleBody"),str): return plain_text(item["articleBody"])[:14000]
                        stack.extend(v for v in item.values() if isinstance(v,(list,dict)))
            except (ValueError,TypeError): pass
        # Prefer article content, then description; never scrape a site's entire
        # body where unrelated ticker widgets could create false matches.
        text=extract_article_text(document)
        if text:return text
        for meta in re.findall(r"<meta\b[^>]*>",document,re.I):
            if re.search(r'(?:name|property)=["\'](?:description|og:description)["\']',meta,re.I):
                match=re.search(r'content=(["\'])(.*?)\1',meta,re.S|re.I)
                if match: return plain_text(match.group(2))[:2000]
        return ""
    return ""
