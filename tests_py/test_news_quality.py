import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from news_quality import baseline_analysis,entity_evidence,grounded_summary,canonical_url,event_key,allowed_source_url,extract_article_text,yahoo_feed_url,summary_candidates,selected_summary,clean_source_text,source_lead
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

    def test_short_complete_lead_is_not_discarded(self):
        text='Intel raised its quarterly revenue forecast after demand for server chips improved.'
        self.assertLess(len(text),150)
        public,_=baseline_analysis('Intel updates chip guidance',text)
        self.assertEqual(public['summary_method'],'source_excerpt')
        self.assertEqual(public['ai_summary'],text)
        self.assertIsNone(public['ai_sentiment'])

    def test_headline_repeat_promotions_and_truncated_short_text_are_not_summaries(self):
        title='Intel raises quarterly revenue guidance after stronger demand for server chips.'
        for body in [title,'Subscribe to our newsletter for the latest stock market news and updates.',
                     'Intel raised its quarterly revenue forecast after demand for server chips…']:
            self.assertEqual(baseline_analysis(title,body)[0]['summary_method'],'headline_only')

    def test_sentence_ids_preserve_actor_amount_negation_and_abbreviations(self):
        text='U.S. regulators did not approve Intel\'s plan to acquire the chip supplier.\nIntel said its revenue rose by $2.4 billion during the quarter.'
        candidates=summary_candidates(text)
        self.assertEqual(candidates[0]['text'],text.splitlines()[0])
        chosen=selected_summary({'sentence_id':1},candidates)
        self.assertIn('did not approve',chosen)
        self.assertTrue(grounded_summary({'sentences':[chosen]},text))
        self.assertIsNone(selected_summary({'sentence_id':True},candidates))
        self.assertIsNone(selected_summary({'sentence_id':99},candidates))
        self.assertIsNone(selected_summary({'sentence_id':'1'},candidates))
        text='The U.S. Treasury did not approve the proposed financing plan on Friday.'
        sentence=selected_summary({'sentence_id':1},summary_candidates(text))
        self.assertEqual(sentence,text)
        self.assertTrue(grounded_summary({'sentences':[sentence]},text))

    def test_cointelegraph_new_body_and_noise_exclusion(self):
        document='<main><div class="ct-prose"><p>Intel raised its quarterly revenue forecast after demand for server chips improved.</p><aside><p>Bitcoin rallied while Ethereum rose as traders bought tokens in the unrelated market widget.</p></aside></div></main>'
        text=extract_article_text(document)
        self.assertIn('Intel raised',text)
        self.assertNotIn('Bitcoin',text)

    def test_fool_is_allowed_but_redirects_still_require_public_dns(self):
        with patch('news_quality.socket.getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443))]):
            self.assertTrue(allowed_source_url('https://www.fool.com/investing/story'))
            self.assertFalse(allowed_source_url('https://fool.com.evil.test/story'))
        with patch('news_quality.socket.getaddrinfo',return_value=[(2,1,6,'',('10.0.0.1',443))]):
            self.assertFalse(allowed_source_url('https://www.fool.com/investing/story'))

    def test_newsapi_suffix_and_syndication_tracking_are_removed(self):
        self.assertEqual(clean_source_text('Intel raises revenue outlook. [+1234 chars]'),'Intel raises revenue outlook.')
        self.assertEqual(canonical_url('https://www.fool.com/a?.tsrc=rss&utm_source=y&tlnk=abc'),'https://www.fool.com/a')

    def test_source_http_status_is_recorded_without_bypassing_access(self):
        from unittest.mock import Mock
        response=Mock(status_code=429,is_redirect=False,headers={'Retry-After':'3600','Content-Type':'text/html'})
        session=Mock();session.get.return_value.__enter__=Mock(return_value=response);session.get.return_value.__exit__=Mock(return_value=False)
        diagnostics={}
        with patch('news_quality.allowed_source_url',return_value=True):
            self.assertEqual(source_lead(session,'https://www.coindesk.com/a',diagnostics),'')
        self.assertEqual(diagnostics['source_status'],'rate_limited')
        self.assertEqual(diagnostics['retry_after'],'3600')
        self.assertEqual(session.get.call_count,1)

if __name__=='__main__': unittest.main()
