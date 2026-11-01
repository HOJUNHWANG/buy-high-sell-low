import importlib
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
with patch.dict(os.environ,{'SUPABASE_URL':'https://example.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'test','GROQ_API_KEY':''}), patch('supabase.create_client',return_value=Mock()):
    news=importlib.import_module('fetch_news')

BODY='Intel raised its quarterly revenue forecast after demand for server chips improved.'

class NewsPipelineTests(unittest.TestCase):
    def setUp(self):
        news.AI_ATTEMPTS=0;news.AI_DISABLED=False;news.SOURCE_COOLDOWNS.clear()
        self.model=Mock()
        self.model.chat.completions.create.return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'sentence_id':1,'sentiment':'positive'})))])
        self.patch=patch.object(news,'groq',self.model);self.patch.start();self.addCleanup(self.patch.stop)

    def test_headline_does_not_consume_model_budget(self):
        public,_=news.analyze_article('Intel updates guidance',fetch_body=False)
        self.assertEqual(public['summary_method'],'headline_only')
        self.assertEqual(news.AI_ATTEMPTS,0)
        self.model.chat.completions.create.assert_not_called()

    def test_id_selection_recovers_short_lead_without_rewriting(self):
        public,evidence=news.analyze_article('Intel updates guidance',BODY,fetch_body=False)
        self.assertEqual(public['ai_summary'],BODY)
        self.assertEqual(public['summary_method'],'verified_ai')
        self.assertEqual(evidence['summary_evidence'],[BODY])
        self.assertEqual(news.AI_ATTEMPTS,1)

    def test_invalid_selection_preserves_excerpt_and_schedules_retry(self):
        self.model.chat.completions.create.return_value.choices[0].message.content='{"sentence_id":99,"sentiment":"positive"}'
        public,evidence=news.analyze_article('Intel updates guidance',BODY,fetch_body=False)
        self.assertEqual(public['summary_method'],'source_excerpt')
        self.assertEqual(public['ai_summary'],BODY)
        self.assertIsNone(public['ai_sentiment'])
        self.assertTrue(evidence['retryable'])

    def test_budget_counts_actual_calls_only(self):
        with patch.object(news,'MAX_AI_PER_RUN',2):
            news.analyze_article('No body here',fetch_body=False)
            for _ in range(2):news.analyze_article('Intel updates guidance',BODY,fetch_body=False)
            public,evidence=news.analyze_article('Intel updates guidance',BODY,fetch_body=False)
        self.assertEqual(news.AI_ATTEMPTS,2)
        self.assertEqual(public['summary_method'],'source_excerpt')
        self.assertEqual(evidence['analysis_status'],'budget_deferred')

    def test_rate_limit_cools_down_the_publisher_across_articles(self):
        def limited(session,url,diagnostics):
            diagnostics.update(source_status='rate_limited',http_status=429,retry_after='3600')
            return ''
        with patch.object(news,'source_lead',side_effect=limited) as fetch:
            for suffix in ['a','b']:
                public,evidence=news.analyze_article('Intel updates guidance','',f'https://www.coindesk.com/{suffix}')
                self.assertEqual(public['summary_method'],'headline_only')
                self.assertTrue(evidence['retryable'])
            self.assertEqual(fetch.call_count,1)

    def test_description_can_be_more_useful_than_truncated_content(self):
        article={'title':'Intel updates guidance','content':'Intel '+('incomplete context '*20)+'[+1200 chars]','description':BODY}
        self.assertEqual(news.best_content(article),BODY)

if __name__=='__main__':unittest.main()
