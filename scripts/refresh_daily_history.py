"""Refresh suspected split discontinuities from Twelve Data's adjusted series."""
import argparse
import os
from datetime import date,timedelta
import requests
from dotenv import load_dotenv
from supabase import create_client
from market_calendar import is_market_holiday
from db_requests import execute_db

load_dotenv(os.path.join(os.path.dirname(__file__),'..','.env.local'));load_dotenv()

def fetch_adjusted_history(ticker):
    symbol=ticker.replace('-USD','/USD')
    response=requests.get('https://api.twelvedata.com/time_series',params={'symbol':symbol,'interval':'1day','outputsize':365,'adjust':'splits','apikey':os.environ['TWELVE_DATA_API_KEY']},timeout=30)
    response.raise_for_status();payload=response.json()
    if payload.get('status')=='error': raise RuntimeError('Twelve Data history unavailable: '+str(payload.get('code')))
    rows=[];cutoff=(date.today()-timedelta(days=366)).isoformat()
    for value in payload.get('values',[]):
        day=date.fromisoformat(value['datetime'][:10])
        if day.isoformat()<cutoff or day>date.today():continue
        if not ticker.endswith('-USD') and (day.weekday()>=5 or is_market_holiday(day)):continue
        row={'date':day.isoformat(),**{k:float(value[k]) for k in ['open','high','low','close'] if value.get(k) not in (None,'')}}
        row['volume']=int(float(value['volume'])) if value.get('volume') not in (None,'') else None
        rows.append(row)
    return rows

def main():
    parser=argparse.ArgumentParser();parser.add_argument('tickers',nargs='*');parser.add_argument('--scan',action='store_true');parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    client=create_client(os.environ.get('SUPABASE_URL') or os.environ['NEXT_PUBLIC_SUPABASE_URL'],os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    tickers=list(args.tickers)
    if args.scan:tickers+=[r['ticker'] for r in execute_db(client.rpc('find_history_discontinuities',{}),operation='history:scan',retry_safe=True).data or []]
    failed=[]
    for ticker in sorted(set(tickers)):
        try:
            rows=fetch_adjusted_history(ticker)
            if args.dry_run:print(ticker,{'rows':len(rows),'latest':max(r['date'] for r in rows),'first_close':rows[-1]['close']});continue
            result=execute_db(client.rpc('replace_split_adjusted_history',{'p_ticker':ticker,'p_rows':rows}),operation='history:replace',retry_safe=True)
            print(ticker,{'changed_rows':result.data})
        except Exception as exc:failed.append(ticker);print(ticker,{'error':type(exc).__name__})
    return 1 if failed else 0

if __name__=='__main__':raise SystemExit(main())
