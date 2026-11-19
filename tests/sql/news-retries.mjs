// Disposable PostgreSQL only. No network, credentials, or production access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2] || '.venv/io-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = await PGlite.create();
const schema = readFileSync('supabase/schema.sql','utf8');
const table = name => schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`))[0];
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const publicData = { related_tickers:['INTC'], ai_summary:'Intel raised its quarterly revenue forecast after demand for server chips improved.', summary_method:'source_excerpt', source_coverage:'lead', news_category:'company', relevance_score:90, event_key:'intel-forecast' };
const evidence = { source_text:'Intel updates guidance\n'+publicData.ai_summary, retry_attempt:1, retryable:true, analysis_status:'budget_deferred' };
const write = (id, pub=publicData, ev=evidence) => db.query('SELECT public.write_news_analysis_v3($1,$2,$3)',[id,JSON.stringify(pub),JSON.stringify(ev)]);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    ${table('stocks')}
    ${table('news_articles')}
    CREATE TABLE price_history_long(ticker text,date date,close numeric);
    INSERT INTO stocks(ticker,name) VALUES('INTC','Intel');
    ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_news ON news_articles FOR SELECT TO anon,authenticated USING(true);
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT SELECT ON news_articles TO anon,authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261031120921_add_news_quality_and_data_archive.sql','utf8'));
  await db.exec(`GRANT USAGE ON SCHEMA private TO service_role;
    INSERT INTO news_articles(id,title,url,published_at,summary_method,source_coverage,quality_version,relevance_score)
    VALUES(1,'Intel updates guidance','https://www.fool.com/a',now()-interval '2 hours','headline_only','headline',2,90),
      (2,'Intel earnings','https://example.com/b',now(),'verified_ai','lead',2,90),
      (3,'Old story','https://example.com/c',now()-interval '96 hours','headline_only','headline',2,90),
      (4,'Another Intel story','https://example.com/d',now(),'source_excerpt','lead',2,90);
    UPDATE news_articles SET ai_summary='Existing verified result' WHERE id=2;
    INSERT INTO private.news_evidence(article_id,source_text,evidence) VALUES(1,'Original source evidence','{}');`);
  await db.exec(readFileSync('supabase/migrations/20261101161717_news_retries_and_market_loading.sql','utf8'));
  assert.equal(Number((await one("SELECT count(*) n FROM pg_indexes WHERE indexname IN ('news_articles_published_id','price_history_long_date_ticker')")).n),2);
  await db.exec('SET ROLE anon');
  assert.equal(Number((await one('SELECT count(*) n FROM news_articles')).n),4);
  await assert.rejects(()=>db.query('SELECT * FROM get_news_retry_candidates(20)'),e=>e.code==='42501');
  await assert.rejects(()=>write(1),e=>e.code==='42501');
  await db.exec('RESET ROLE; SET ROLE service_role');
  assert.deepEqual((await db.query('SELECT id FROM get_news_retry_candidates(20) ORDER BY id')).rows.map(r=>Number(r.id)),[1,4]);
  await write(1);
  assert.equal((await one('SELECT quality_version FROM news_articles WHERE id=1')).quality_version,3);
  assert.equal((await one('SELECT attempts FROM private.news_retry_queue WHERE article_id=1')).attempts,1);
  assert.equal((await one("SELECT next_attempt_at >= now()+interval '119 minutes' ok FROM private.news_retry_queue WHERE article_id=1")).ok,true);
  await write(1); // Same request replay does not consume another attempt.
  assert.equal((await one('SELECT attempts FROM private.news_retry_queue WHERE article_id=1')).attempts,1);
  assert.equal(Number((await one("SELECT count(*) n FROM private.repair_archive WHERE repair_id='news-quality-v3' AND source_key='1'")).n),2);
  await write(1,{...publicData,summary_method:'verified_ai',ai_sentiment:'positive'},{...evidence,retryable:false});
  assert.equal(Number((await one('SELECT count(*) n FROM private.news_retry_queue WHERE article_id=1')).n),0);
  await write(1,{...publicData,ai_summary:null,summary_method:'headline_only',source_coverage:'headline'});
  assert.equal((await one('SELECT ai_summary FROM news_articles WHERE id=1')).ai_summary,publicData.ai_summary);
  await write(4,publicData,{...evidence,retry_attempt:4});
  assert.equal(Number((await one('SELECT count(*) n FROM private.news_retry_queue WHERE article_id=4')).n),0);
  await assert.rejects(()=>write(4,{...publicData,summary_method:'invented'}),e=>e.code==='P0001');
  assert.equal((await one('SELECT summary_method FROM news_articles WHERE id=4')).summary_method,'source_excerpt');
  console.log('News retry SQL: indexes, public reads, service-only evidence, bounded attempts, replay, archives, rollback and verified-result preservation passed.');

  await db.exec(`
    RESET ROLE;
    INSERT INTO stocks(ticker,name,logo_url) VALUES
      ('ANT','Anthropic',null),
      ('ADBE','Adobe','https://www.google.com/s2/favicons?domain=adobe.com&sz=128'),
      ('COST','Costco','https://example.com/already-replaced.png');
    INSERT INTO news_articles(id,title,url,published_at,fetched_at,quality_version,related_tickers,summary_method,ai_summary)
    VALUES
      (11,'Anthropic shares climb on IPO debut','https://example.com/ant-ipo','2026-11-19T20:00Z','2026-11-19T21:00Z',3,ARRAY['INTC'],'verified_ai','Existing verified summary'),
      (12,'Anthropic tools debut at a student event','https://example.com/ant-demo','2026-11-19T20:00Z','2026-11-19T21:00Z',3,ARRAY[]::text[],'headline_only',null),
      (13,'Anthropic IPO coverage after deployment','https://example.com/ant-later','2026-11-19T23:20Z','2026-11-19T23:21Z',3,ARRAY[]::text[],'headline_only',null);
    INSERT INTO private.news_evidence(article_id,source_text,evidence)
    VALUES (11,'Existing source excerpt','{"entities":[{"ticker":"INTC"}]}');
  `);
  const displayRepair=readFileSync('supabase/migrations/20261119234510_repair_market_display_data.sql','utf8');
  await db.transaction(tx=>tx.exec(displayRepair));
  await db.transaction(tx=>tx.exec(displayRepair));
  assert.deepEqual(await one('SELECT related_tickers, ai_summary, quality_version FROM news_articles WHERE id=11'), {
    related_tickers:['INTC','ANT'], ai_summary:'Existing verified summary', quality_version:3,
  });
  assert.deepEqual((await db.query('SELECT related_tickers FROM news_articles WHERE id IN (12,13) ORDER BY id')).rows, [
    { related_tickers:[] }, { related_tickers:[] },
  ]);
  const reviewed = await one('SELECT evidence, source_text FROM private.news_evidence WHERE article_id=11');
  assert.deepEqual(reviewed.evidence.entities.map(item=>item.ticker), ['INTC','ANT']);
  assert.equal(reviewed.source_text,'Existing source excerpt');
  assert.equal(Number((await one("SELECT count(*) n FROM private.repair_archive WHERE repair_id='anthropic-ipo-tags'")).n),2);
  assert.equal((await one("SELECT logo_url FROM stocks WHERE ticker='ADBE'")).logo_url,'https://financialmodelingprep.com/image-stock/ADBE.png');
  assert.equal((await one("SELECT logo_url FROM stocks WHERE ticker='COST'")).logo_url,'https://example.com/already-replaced.png');
  console.log('Market display data repair: scoped tags, evidence, old icons, existing summaries and replay passed.');
} finally { await db.close(); }
