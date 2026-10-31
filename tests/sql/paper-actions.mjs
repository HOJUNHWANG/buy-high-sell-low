// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// This creates a disposable database; it never connects to production.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2] || process.env.PGLITE_MODULE || '.venv/io-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=await PGlite.create();
const schema=readFileSync('supabase/schema.sql','utf8');
const migration=suffix=>readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(p=>p.endsWith(suffix)),'utf8');
const table=name=>schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`))[0];
const uid='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', demo='00000000-0000-4000-8000-000000000003';
const one=async sql=>(await db.query(sql)).rows[0];
const act=async(action,payload={},key=null)=>(await db.query('SELECT execute_paper_action($1,$2,$3,$4) result',[uid,action,JSON.stringify(payload),key])).rows[0].result;
const check=async(action,payload,code)=>assert.rejects(()=>act(action,payload),e=>e.code===code);
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 ${['stocks','stock_prices','paper_accounts','paper_positions','paper_transactions','paper_ai_usage'].map(table).join('\n')}
 CREATE TABLE price_history_long(ticker text,date date,open numeric,high numeric,low numeric,close numeric,volume bigint,primary key(ticker,date));
 CREATE TABLE paper_challenges(id bigserial primary key,user_id uuid references auth.users,ticker text references stocks,
 challenge_type text,target_pct numeric,week_start date,week_end date,entry_price numeric,status text default 'active',
 reward_usd numeric default 0,picks jsonb,submitted_at timestamptz,reward_claimed boolean default false,unique(user_id,week_start));
 CREATE TABLE paper_graveyard(id bigserial primary key,user_id uuid,final_value numeric,cash_at_death numeric,
 positions_json jsonb,liquidated_at timestamptz,month text);
 INSERT INTO auth.users VALUES('${uid}','real@example.test'),('${other}','other@example.test'),('${demo}','dummy_1@bhsl.local');
 INSERT INTO stocks(ticker,name,is_active) VALUES('AAPL','Apple',true),('MSFT','Microsoft',true),('NVDA','Nvidia',true),('AMZN','Amazon',true),('META','Meta',true),('OLD','Retired',false);
 INSERT INTO stock_prices(ticker,price) SELECT ticker,100 FROM stocks;
 GRANT USAGE ON SCHEMA public,auth TO service_role;
 REVOKE ALL ON auth.users FROM service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261015213638_reduce_market_ingestion_io.sql','utf8').split('CREATE TRIGGER skip_unchanged_fictional_daily')[0]);
 await db.exec(migration('_add_atomic_paper_actions.sql'));
 await db.exec(migration('_remove_paper_auth_lookup.sql'));
 await db.exec('SET ROLE service_role');
 assert.equal((await one("SELECT has_table_privilege('service_role','auth.users','select') ok")).ok,false);
 await act('init');
 await assert.rejects(()=>db.query("SELECT execute_paper_action('00000000-0000-4000-8000-000000000099','init')"),e=>e.code==='23503');
 for (const [date,deadline] of [['2026-07-10','2026-07-10T20:00:00Z'],['2026-01-09','2026-01-09T21:00:00Z'],['2026-11-27','2026-11-27T18:00:00Z']]) assert.equal((await db.query('SELECT private.paper_challenge_deadline($1)=$2::timestamptz ok',[date,deadline])).rows[0].ok,true);
 // Requests launched together conserve cash and assets. PGlite serializes SQL
 // connections; the production account FOR UPDATE provides the same ordering.
 await Promise.all([act('buy',{ticker:'AAPL',shares:3}),act('buy',{ticker:'MSFT',shares:3})]);
 assert.equal(Number((await one(`SELECT cash_balance FROM paper_accounts WHERE user_id='${uid}'`)).cash_balance),400);
 assert.equal(Number((await one(`SELECT sum(shares*avg_cost) n FROM paper_positions WHERE user_id='${uid}'`)).n),600);
 await act('short',{ticker:'AAPL',shares:1,leverage:2});
 await act('buy',{ticker:'AAPL',shares:1});
 const short=await one(`SELECT shares,borrowed FROM paper_positions WHERE user_id='${uid}' AND side='short'`);
 assert.equal(Number(short.shares),2); assert.equal(Number(short.borrowed),100);
 const key='00000000-0000-4000-8000-000000000099';
 await act('buy',{ticker:'NVDA',shares:1},key);
 assert.equal((await act('buy',{ticker:'NVDA',shares:1,quote_fetched_at:'2000-01-01'},key)).replayed,true);
 await assert.rejects(()=>act('buy',{ticker:'NVDA',shares:2},key),e=>e.code==='P0409');
 const before=await one(`SELECT cash_balance FROM paper_accounts WHERE user_id='${uid}'`);
 await db.exec(`RESET ROLE; CREATE FUNCTION reject_tx() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END $$;
 CREATE TRIGGER fail_tx BEFORE INSERT ON paper_transactions FOR EACH ROW EXECUTE FUNCTION reject_tx(); SET ROLE service_role;`);
 await assert.rejects(()=>act('buy',{ticker:'META',shares:0.1}));
 assert.deepEqual(await one(`SELECT cash_balance FROM paper_accounts WHERE user_id='${uid}'`),before);
 assert.equal((await one(`SELECT count(*)::int n FROM paper_positions WHERE ticker='META'`)).n,0);
 await db.exec('RESET ROLE; DROP TRIGGER fail_tx ON paper_transactions; SET ROLE service_role');
 await check('buy',{ticker:'OLD',shares:1},'P0404');
 await check('buy',{ticker:'AAPL',shares:-1},'P0400');
 await check('challenge_submit',{picks:{}},'P0404');
 const reward=await act('checkin'); assert.equal(reward.reward,120);
 assert.equal((await act('checkin')).alreadyCheckedIn,true);
 await act('claim_roast');
 await check('claim_roast',{},'P0429');
 await act('refund_roast');
 await act('claim_roast');
 await act('nickname',{nickname:' Tester '});
 await check('nickname',{nickname:'Again'},'P0429');
 const ch=await act('challenge_create',{eligible_tickers:['AAPL','MSFT','NVDA','AMZN','META']}); assert.equal(ch.picks.length,5);
 await db.exec(`UPDATE paper_challenges SET status='active',week_end=(now() AT TIME ZONE 'America/New_York')::date+7 WHERE id=${ch.id}`);
 await check('challenge_submit',{picks:{}},'P0400');
 await check('challenge_submit',{picks:Array(5).fill({ticker:ch.picks[0].ticker,direction:'up'})},'P0400');
 assert.equal((await act('challenge_submit',{picks:ch.picks.map(p=>({ticker:p.ticker,direction:'up'}))})).status,'pending');
 // Claiming an old completed week is independent of this week's new challenge.
 await db.exec(`INSERT INTO paper_challenges(user_id,ticker,week_start,week_end,status,reward_usd) VALUES('${uid}','AAPL','2026-01-05','2026-01-09','completed',600)`);
 const old=await one("SELECT id FROM paper_challenges WHERE week_start='2026-01-05'");
 assert.equal((await act('claim_reward',{challenge_id:old.id})).reward,600);
 assert.equal((await act('claim_reward',{challenge_id:old.id})).alreadyClaimed,true);
 // Missing prices cannot liquidate a portfolio at zero.
 await db.exec(`UPDATE stock_prices SET fetched_at=now()-interval '30 days' WHERE ticker='AAPL'`);
 assert.equal((await act('liquidation')).status,'price_unavailable');
 await check('sell',{ticker:'AAPL',shares:1},'P0503');
 await assert.rejects(()=>db.query('SELECT execute_paper_action($1,\'init\')',[demo]),e=>e.code==='P0403');
 await db.exec('RESET ROLE; SET ROLE authenticated');
 await assert.rejects(()=>db.query('SELECT execute_paper_action($1,\'init\')',[uid]),e=>e.code==='42501');
 await db.exec('RESET ROLE');
 assert.equal((await one(`SELECT count(*)::int n FROM paper_accounts WHERE user_id='${other}'`)).n,0);
 const hedge='00000000-0000-4000-8000-000000000004';
 await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[hedge,'hedge@example.test']);
 await db.exec("UPDATE stock_prices SET price=100,fetched_at=now() WHERE ticker='AAPL'");
 const hedgeAct=async(action,payload={})=>(await db.query('SELECT execute_paper_action($1,$2,$3) result',[hedge,action,JSON.stringify(payload)])).rows[0].result;
 await hedgeAct('buy',{ticker:'AAPL',shares:5,leverage:100});
 await hedgeAct('short',{ticker:'AAPL',shares:5,leverage:100});
 await db.exec("UPDATE stock_prices SET price=110 WHERE ticker='AAPL'");
 assert.equal((await hedgeAct('cover',{ticker:'AAPL',shares:500})).cashBalance,-4500);
 assert.equal((await hedgeAct('sell',{ticker:'AAPL',shares:500})).cashBalance,1000);
 await db.exec("UPDATE stock_prices SET price=100 WHERE ticker='AAPL'");
 await hedgeAct('buy',{ticker:'AAPL',shares:0.1,leverage:100});
 await db.exec(`UPDATE stock_prices SET price=1 WHERE ticker='AAPL'; UPDATE paper_accounts SET status='margin_call',margin_call_at=now()-interval '25 hours' WHERE user_id='${hedge}'`);
 const liquidated=await hedgeAct('liquidation');
 assert.equal(liquidated.status,'suspended');assert.equal(liquidated.cashBalance,10);
 await db.exec(`${table('news_articles')} GRANT ALL ON public.news_articles TO service_role; GRANT USAGE ON SEQUENCE public.news_articles_id_seq TO service_role;`);
 await db.exec(migration('_add_news_quality_and_data_archive.sql'));
 await db.exec("INSERT INTO stocks(ticker,name,is_active) VALUES('ABT','Abbott',true); INSERT INTO price_history_long(ticker,date,open,high,low,close) VALUES('ABT','2026-03-23',107.07,106.95,104.1,104.85),('AAPL','2026-04-03',100,101,99,100)");
 await db.exec(migration('_enforce_market_history_quality.sql'));
 await db.exec("INSERT INTO price_history_long(ticker,date,open,high,low,close) VALUES('AAPL','2026-02-05',100,101,99,100)");
 assert.equal((await db.query("UPDATE price_history_long SET source='metadata-test' WHERE ticker='AAPL' AND date='2026-02-05' RETURNING source")).rows[0].source,'metadata-test');
 assert.equal((await db.query("UPDATE price_history_long SET source='metadata-test' WHERE ticker='AAPL' AND date='2026-02-05' RETURNING source")).rows.length,0);
 await db.exec("SET ROLE service_role");
 await assert.rejects(()=>db.exec("INSERT INTO price_history_long(ticker,date,open,high,low,close) VALUES('AAPL','2026-04-03',100,101,99,100)"),e=>e.message.includes('trading session'));
 await assert.rejects(()=>db.exec("INSERT INTO price_history_long(ticker,date,open,high,low,close) VALUES('AAPL','2026-04-02',107,106,100,103)"),e=>e.message.includes('OHLCV'));
 const newsId=(await one("INSERT INTO news_articles(title,url,ai_summary,related_tickers) VALUES('Circle freezes USDC','https://example.test/1','wrong theft claim',ARRAY['BTC-USD']) RETURNING id")).id;
 const publicNews={summary_method:'source_excerpt',source_coverage:'lead',news_category:'company',related_tickers:['USDC-USD','FAKE'],relevance_score:90,ai_summary:'Circle froze USDC.',event_key:'incident'};
 await db.query("SELECT write_news_analysis($1,$2,$3)",[newsId,JSON.stringify(publicNews),JSON.stringify({source_text:'Circle froze USDC.',entities:[]})]);
 assert.deepEqual((await one("SELECT related_tickers FROM news_articles WHERE id="+newsId)).related_tickers,[]); // Untracked fixture symbols are excluded.
 assert.equal((await one("SELECT record->>'ai_summary' summary FROM private.repair_archive WHERE source_table='news_articles'")).summary,'wrong theft claim');
 const historicPicks=JSON.stringify(['AAPL','MSFT','NVDA','AMZN','META'].map(ticker=>({ticker,base_price:90,direction:'up'})));
 await db.query("INSERT INTO paper_challenges(user_id,ticker,week_start,week_end,status,picks) VALUES($1,'AAPL','2026-02-02','2026-02-06','pending',$2)",[uid,historicPicks]);
 await db.exec("INSERT INTO price_history_long(ticker,date,open,high,low,close) SELECT ticker,'2026-02-06',100,101,99,100 FROM stocks WHERE is_active");
 const resolution=(await db.query("SELECT resolve_paper_challenges($1) result",[uid])).rows[0].result;
 assert.equal(resolution.settled,1);
 assert.equal(Number((await one("SELECT reward_usd FROM paper_challenges WHERE week_start='2026-02-02'")).reward_usd),1000);
 await db.exec('RESET ROLE');
 await db.exec(`CREATE SCHEMA cron; CREATE TABLE cron.job_run_details(runid bigint primary key,end_time timestamptz); GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;`);
 await db.exec(migration('_restrict_paper_writes_and_optimize_policies.sql'));
 await db.exec('SET ROLE authenticated');
 for (const sql of ["UPDATE paper_accounts SET cash_balance=1000000", "INSERT INTO paper_positions(user_id,ticker,shares,avg_cost) VALUES('"+uid+"','META',1000,1)","TRUNCATE paper_transactions"]) {
   await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
 }
 await db.exec('RESET ROLE');
 await db.exec(`INSERT INTO paper_accounts(user_id,cash_balance,is_demo) VALUES('${demo}',999999,true);
 INSERT INTO paper_positions(user_id,ticker,shares,avg_cost) VALUES('${demo}','AAPL',100,1);`);
 const realBefore=await one(`SELECT cash_balance FROM paper_accounts WHERE user_id='${uid}'`);
 await db.exec(migration('_quarantine_seeded_demo_ledger.sql'));
 assert.deepEqual(await one(`SELECT cash_balance FROM paper_accounts WHERE user_id='${uid}'`),realBefore);
 assert.equal((await one(`SELECT count(*)::int n FROM paper_positions WHERE user_id='${demo}'`)).n,0);
 assert.equal((await one(`SELECT count(*)::int n FROM private.demo_ledger_archive WHERE user_id='${demo}'`)).n,2);
 await db.exec("CREATE TABLE cron.job(jobid int); ALTER TABLE cron.job_run_details ADD COLUMN start_time timestamptz; INSERT INTO cron.job_run_details VALUES(1,now()-interval '100 days',now()-interval '101 days'); CREATE TABLE market_cap_snapshots(ticker text,date date,market_cap bigint,observed_at timestamptz,source text,metric text)");
 await db.exec(migration('_repair_verified_legacy_market_data.sql'));
 assert.equal(Number((await one("SELECT high FROM price_history_long WHERE ticker='ABT' AND date='2026-03-23'")).high),107.14);
 assert.equal((await one("SELECT count(*)::int n FROM price_history_long WHERE ticker='AAPL' AND date='2026-04-03'")).n,0);
 assert.equal((await one("SELECT count(*)::int n FROM cron.job_run_details")).n,0);
 assert.equal((await one("SELECT count(*)::int n FROM private.repair_archive WHERE repair_id='market-quality-2026-10-31' AND source_table='price_history_long'")).n,2);
 const holidays=new Set(JSON.parse(readFileSync('data/us-market-holidays.json','utf8')).map(x=>x.date));
 const replacements=[];
 for(let days=300;days>=1;days--){const d=new Date(Date.now()-days*86400000);const date=d.toISOString().slice(0,10);if(d.getUTCDay()===0||d.getUTCDay()===6||holidays.has(date))continue;replacements.push({date,open:100,high:101,low:99,close:100,volume:100});}
 await db.exec('SET ROLE service_role');
 const replace=async()=>(await db.query('SELECT replace_split_adjusted_history($1,$2) n',['AAPL',JSON.stringify(replacements)])).rows[0].n;
 assert.ok(await replace()>100);assert.equal(await replace(),0);
 await db.exec('RESET ROLE');
 console.log('Atomic paper actions: cash conservation, side isolation, rollback, idempotency, claims, freshness and service-only access passed.');
} catch (e) { console.error(JSON.stringify({error:e.message,code:e.code,where:e.where,detail:e.detail,position:e.position,internalPosition:e.internalPosition,internalQuery:e.internalQuery})); process.exitCode=1; } finally { await db.close(); }
