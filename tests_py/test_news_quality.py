import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from news_quality import baseline_analysis,entity_evidence,grounded_summary,canonical_url,event_key,allowed_source_url,extract_article_text,yahoo_feed_url
from urllib.parse import urlsplit,parse_qs
from tickers import SP100_TICKERS,TRACKED_EQUITY_TICKERS,to_yf

class NewsQualityTests(unittest.TestCase):
    def test_yahoo_feed_requires_symbols_and_rotates_all_tracked_stocks(self):
        symbols=set();urls=set()
        for slot in range(13):
            url=yahoo_feed_url(slot*1800);urls.add(url)
            group=parse_qs(urlsplit(url).query)['s'][0].split(',')
            self.assertTrue(1<=len(group)<=8);symbols.update(group)
        self.assertEqual(len(urls),13)
        self.assertEqual(symbols,{to_yf(t) for t in TRACKED_EQUITY_TICKERS+SP100_TICKERS})
        self.assertIn('BRK-B',symbols)

    def tags(self,title,content=''): return set(baseline_analysis(title,content)[0]['related_tickers'])
    def test_explicit_issuers(self):
        for title,ticker in [('SpaceX shares rise after revenue update','SPCX'),('Intel confirms chip demand in earnings report','INTC'),('Apple earnings beat expectations','AAPL'),('Nvidia raises revenue guidance','NVDA'),('Meta stock falls on spending outlook','META')]:
            self.assertIn(ticker,self.tags(title))
    def test_short_symbols_and_unrelated_bonds(self):
        self.assertNotIn('NOW',self.tags('Stocks are now rising as earnings improve'))
        self.assertNotIn('SO',self.tags('So stocks rallied after the Fed decision'))
        self.assertNotIn('TLT',self.tags('Series I savings bonds now pay 5.51%'))
        self.assertIn('NOW',self.tags('ServiceNow raises earnings guidance'))
    def test_no_sector_or_crime_inferences(self):
        self.assertEqual(self.tags('Crypto investor kidnapped for ransom paid in Bitcoin'),set())
        self.assertNotIn('ETH-USD',self.tags('Bitcoin investor kidnapping sparks debate'))
        self.assertEqual(self.tags('Federal Reserve raises interest rates'),set())
    def test_stablecoin_evidence_does_not_infer_bitcoin(self):
        tags=self.tags('Circle freezes $823 million USDC after Binance hack','Tether also froze USDT. The exchange reported a $6.4 billion theft.')
        self.assertIn('USDC-USD',tags);self.assertIn('USDT-USD',tags);self.assertNotIn('BTC-USD',tags)
    def test_background_protocol_mentions_are_not_price_drivers(self):
        self.assertEqual(self.tags('SpaceX shares rise','Aave and Uniswap are other decentralized protocols.'),{'SPCX'})
    def test_missing_body_is_labeled_without_invented_summary(self):
        public,_=baseline_analysis('SpaceX shares rise')
        self.assertEqual(public['summary_method'],'headline_only');self.assertIsNone(public['ai_summary']);self.assertIsNone(public['ai_insight'])
    def test_amount_actor_action_substitution_is_rejected(self):
        source='Circle froze $823 million in USDC. Binance reported a $6.4 billion theft.'
        self.assertTrue(grounded_summary({'sentences':['Circle froze $823 million in USDC.']},source))
        self.assertFalse(grounded_summary({'sentences':['Binance reported an $823 million theft.']},source))
    def test_partial_sentence_cannot_drop_a_negation(self):
        self.assertFalse(grounded_summary({'sentences':['Binance reported an $823 million theft.']},'It is false that Binance reported an $823 million theft.'))
    def test_canonical_urls_and_event_diversity(self):
        self.assertEqual(canonical_url('https://decrypt.co/story/?utm_source=x#top'),'https://decrypt.co/story')
        self.assertEqual(event_key('Binance hack probe expands',[],'2026-10-30'),event_key('Funds stolen in Binance heist',[],'2026-10-31'))
        self.assertNotEqual(event_key('Apple earnings rise',[]),event_key('Apple acquires another company',[]))
    def test_source_fetch_does_not_allow_arbitrary_hosts(self):
        for url in ['http://localhost/a','https://127.0.0.1/a','https://cnbc.com.evil.test/a','https://user:pass@cnbc.com/a']:
            self.assertFalse(allowed_source_url(url))
        with patch('news_quality.socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            self.assertFalse(allowed_source_url('https://cnbc.com/a'))
    def test_publisher_body_is_read_without_price_widgets(self):
        source='<div class="post-content"><p>Circle froze USDC after the exchange breach. Tether also froze USDT during the investigation.</p><div id="myriad-pm-widget-content"><p>Bitcoin and Ethereum prices are displayed in an unrelated promotional market widget.</p></div></div>'
        text=extract_article_text(source)
        self.assertIn('Circle froze USDC',text)
        self.assertNotIn('Bitcoin',text)
        self.assertEqual(self.tags('Stablecoin freeze investigation',text),{'USDC-USD','USDT-USD'})

if __name__=='__main__': unittest.main()
