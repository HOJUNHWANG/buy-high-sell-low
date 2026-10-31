"""Recoverable legacy-news reclassification. No headline-only LLM backfill.

Every overwritten analysis is archived by the DB RPC before the update.
Use --dry-run to inspect counts; --all to replace legacy analysis with grounded
headline evidence. Source retrieval is bounded and limited to recent articles.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
from fetch_news import supabase,analyze_article,persist_analysis,fetch_from_rss
from news_quality import baseline_analysis,canonical_url
from db_requests import execute_db

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--all',action='store_true');parser.add_argument('--dry-run',action='store_true');parser.add_argument('--recent-source-limit',type=int,default=150);parser.add_argument('--ai-limit',type=int,default=20);args=parser.parse_args()
    rows=[];offset=0
    while True:
        query=supabase.table('news_articles').select('id,title,url,published_at,quality_version').lt('quality_version',2).order('id')
        if not args.all: query=query.eq('quality_version',0)
        batch=execute_db(query.range(offset,offset+999),operation='news-repair:read',retry_safe=True).data or []
        rows+=batch
        if len(batch)<1000:break
        offset+=1000
    since=(datetime.now(timezone.utc)-timedelta(days=7)).isoformat()
    recent=[r for r in rows if (r.get('published_at') or '')>=since]
    recent.sort(key=lambda r:(baseline_analysis(r['title'])[0]['relevance_score'],r.get('published_at') or ''),reverse=True)
    selected={r['id'] for r in recent[:args.recent_source_limit]}
    # Known audit regressions must be reassessed from source even if displaced
    # from the latest pages while remediation is running.
    selected.update(r['id'] for r in rows if r['id'] in {102417,102427,102428,102443,102448})
    print({'articles':len(rows),'source_retrievals':len(selected),'dry_run':args.dry_run},flush=True)
    if args.dry_run:return
    rss={canonical_url(a['url']):a.get('content','') for a in fetch_from_rss()}
    def analyze(row):
        if row['id'] in selected:
            # No model concurrency; source retrieval only in the pool.
            public,evidence=analyze_article(row['title'],rss.get(canonical_url(row['url']),''),row['url'],row.get('published_at'),allow_ai=False)
        else:public,evidence=baseline_analysis(row['title'],rss.get(canonical_url(row['url']),''),row.get('published_at'))
        return {'id':row['id'],'public':public,'evidence':evidence}
    buffer=[];done=0;enriched=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for item in pool.map(analyze,rows):
            buffer.append(item)
            if item['id'] in selected and item['public']['source_coverage']!='headline':enriched.append(item)
            if len(buffer)>=100:
                execute_db(supabase.rpc('write_news_analysis_batch',{'p_items':buffer}),operation='news-repair:batch',retry_safe=True)
                done+=len(buffer);buffer=[];print({'reclassified':done},flush=True)
    if buffer:execute_db(supabase.rpc('write_news_analysis_batch',{'p_items':buffer}),operation='news-repair:batch',retry_safe=True)
    by_id={r["id"]:r for r in rows}
    enriched.sort(key=lambda x:(x["id"] in {102417,102427,102428,102443,102448},x["public"]["relevance_score"],by_id[x["id"]].get("published_at") or ""),reverse=True)
    seen_events=set(); chosen=[]
    for item in enriched:
        event=item["public"]["event_key"]
        if event in seen_events:continue
        seen_events.add(event);chosen.append(item)
    for item in chosen[:args.ai_limit]:
        row=next(r for r in rows if r['id']==item['id'])
        content=item['evidence']['source_text'].split('\n',1)[-1]
        public,evidence=analyze_article(row['title'],content,row['url'],row.get('published_at'),fetch_body=False)
        persist_analysis(row['id'],public,evidence)
    print({'reclassified':len(rows),'with_source':len(enriched),'model_budget':args.ai_limit},flush=True)

if __name__=='__main__':main()
