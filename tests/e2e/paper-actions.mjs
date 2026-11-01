// Explicit opt-in only. Uses a new isolated identity, never a genuine account.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

if (!process.argv.includes('--allow-live-test')) {
  console.log('Run after expanded RPCs and compatible APIs are deployed: node tests/e2e/paper-actions.mjs --allow-live-test');
  process.exit(0);
}
try { process.loadEnvFile('.env.local'); } catch { /* CI may provide variables. */ }
const base=process.env.PAPER_QA_BASE_URL ?? 'http://localhost:3000';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const { chromium }=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE ?? '.venv/ui-audit/node_modules/playwright-core/index.mjs')).href);
const email=`qa-remediation-${randomUUID()}@bhsl.invalid`;
const password=randomUUID()+'aB!9';
const checks=[];let userId;let browser;let cleanup=false;let failure;let cleanupFailure;
const ok=(name)=>checks.push(name);
try {
  // Admin createUser with email_confirm sends no verification email.
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error)throw created.error;
  userId=created.data.user.id;
  const init=await admin.rpc('execute_paper_action',{p_user_id:userId,p_action:'init'});
  if(init.error)throw init.error;
  const flag=await admin.from('paper_accounts').update({is_test_account:true}).eq('user_id',userId);
  if(flag.error)throw flag.error;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/auth/login?next=%2Fpaper%2Ftrade%2FAAPL');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/paper/trade/AAPL',{timeout:20000});
  ok('password login returns to original ticker');
  const request=async(path,payload,key)=>page.evaluate(async({path,payload,key})=>{
    const r=await fetch(path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    return {status:r.status,data:await r.json()};
  },{path,payload,key});
  const quotes=await admin.from('stock_prices').select('ticker,price').in('ticker',['AAPL','MSFT']);
  if(quotes.error)throw quotes.error;
  const prices=Object.fromEntries(quotes.data.map(q=>[q.ticker,Number(q.price)]));
  const keys=[randomUUID(),randomUUID()];
  const buys=await Promise.all(['AAPL','MSFT'].map((ticker,i)=>request('/api/paper/buy',{ticker,shares:300/prices[ticker]},keys[i])));
  assert.ok(buys.every(r=>r.status===200),JSON.stringify(buys.map(r=>({status:r.status,error:r.data.error}))));
  let portfolio=(await request('/api/paper/portfolio')).data;
  const expectedCash=1000-buys.reduce((n,r)=>n+r.data.margin,0);
  assert.ok(Math.abs(portfolio.cashBalance-expectedCash)<0.000001);
  ok('simultaneous purchases conserve account cash');
  const replay=await request('/api/paper/buy',{ticker:'AAPL',shares:300/prices.AAPL},keys[0]);
  assert.equal(replay.data.replayed,true);
  assert.ok(Math.abs((await request('/api/paper/portfolio')).data.cashBalance-expectedCash)<0.000001);
  ok('idempotent retry executes one transaction');
  assert.equal((await request('/api/paper/short',{ticker:'AAPL',shares:100/prices.AAPL,leverage:2},randomUUID())).status,200);
  const shortBefore=(await request('/api/paper/portfolio')).data.positions.find(p=>p.ticker==='AAPL'&&p.side==='short');
  assert.equal((await request('/api/paper/buy',{ticker:'AAPL',shares:50/prices.AAPL},randomUUID())).status,200);
  const shortAfter=(await request('/api/paper/portfolio')).data.positions.find(p=>p.ticker==='AAPL'&&p.side==='short');
  assert.equal(shortAfter.shares,shortBefore.shares);assert.equal(shortAfter.borrowed,shortBefore.borrowed);
  ok('buy preserves the same ticker short position');
  const signIn=await client.auth.signInWithPassword({email,password});
  if(signIn.error)throw signIn.error;
  const forged=await client.from('paper_accounts').update({cash_balance:999999}).eq('user_id',userId);
  assert.equal(forged.error?.code,'42501');
  const direct=await client.rpc('execute_paper_action',{p_user_id:userId,p_action:'checkin'});
  assert.ok(['42501','PGRST202'].includes(direct.error?.code));
  ok('direct financial writes and service RPCs are denied');
  portfolio=(await request('/api/paper/portfolio')).data;
  for(const position of portfolio.positions){
    const closed=await request(`/api/paper/${position.side==='short'?'cover':'sell'}`,{ticker:position.ticker,shares:position.shares},randomUUID());
    assert.equal(closed.status,200);
  }
  assert.equal((await request('/api/paper/portfolio')).data.positions.length,0);
  const book=await admin.from("paper_transactions").select("side,total").eq("user_id",userId);
  if(book.error)throw book.error;
  assert.equal(book.data.length,7);
  const bookBalance=1000+book.data.reduce((n,t)=>n+(["buy","short"].includes(t.side)?-1:1)*Number(t.total),0);
  assert.ok(Math.abs((await request("/api/paper/portfolio")).data.cashBalance-bookBalance)<0.000001);
  ok("cash agrees with the complete transaction ledger");
  const rewardBefore=(await request('/api/paper/portfolio')).data.cashBalance;
  const rewards=await Promise.all([request('/api/paper/checkin',{}),request('/api/paper/checkin',{})]);
  assert.ok(rewards.every(r=>r.status===200));
  assert.equal(rewards.filter(r=>r.data.alreadyCheckedIn).length,1);
  assert.ok(Math.abs((await request('/api/paper/portfolio')).data.cashBalance-rewardBefore-120)<0.000001);
  ok('sell/cover close positions and concurrent check-in pays once');
  const board=await request('/api/paper/leaderboard');
  assert.ok(!board.data.entries.some(e=>e.userId===userId));
  assert.equal(board.data.myRank,null);ok('QA identity is excluded from rankings');
  for(const path of ['/paper','/paper/history','/paper/leaderboard']){
    const leaderboard=path==='/paper/leaderboard' ? page.waitForResponse(r=>r.url().includes('/api/paper/leaderboard?')&&r.request().method()==='GET') : null;
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
    if(path==='/paper')await page.getByText('Total Value',{exact:true}).waitFor();
    else await page.getByRole('heading',{name:path==='/paper/history'?'Transaction History':'Leaderboard',exact:true}).waitFor();
    if(leaderboard)assert.equal((await leaderboard).status(),200);
    if(path==='/paper/history')assert.equal(await page.getByText('No transactions yet.',{exact:true}).count(),0);
  }
  assert.equal(errors.length,0);ok('authenticated portfolio, history and ranking screens load');
} catch(error) { failure=error; }
finally {
  if(browser)await browser.close();
  if(userId){
    try {
      const identity=await admin.auth.admin.getUserById(userId);
      assert.equal(identity.data.user?.email,email);
      for(const table of ['paper_positions','paper_transactions','paper_challenges','paper_graveyard','paper_achievements','paper_ai_usage','watchlist','ai_why_usage','summary_unlocks','user_preferences','user_profiles','paper_accounts']){
        const result=await admin.from(table).delete().eq('user_id',userId);
        if(result.error && !["42P01","PGRST205"].includes(result.error.code))throw new Error(`Cleanup ${table}: ${result.error.message}`);
      }
      const removed=await admin.auth.admin.deleteUser(userId);
      if(removed.error)throw removed.error;
      cleanup=true;
    } catch(error) { cleanupFailure=error;failure=failure ?? error; }
  }
}
const report={checks,cleanupSucceeded:cleanup,cleanupError:cleanupFailure?.message?.slice(0,240) ?? null,error:failure?.message?.slice(0,240) ?? null};
console.log(JSON.stringify(report));
if(failure||!cleanup)process.exitCode=1;
