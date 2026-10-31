"""Ban seeded identities after their ledger has been privately archived.

No emails are sent, no real identities are deleted, and no passwords are read.
Default is a dry run; --apply performs the already-authorized quarantine step.
"""
import argparse
import os
import re
from dotenv import load_dotenv
from supabase import create_client

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    load_dotenv(os.path.join(os.path.dirname(__file__),'..','.env.local'));load_dotenv()
    client=create_client(os.environ.get('SUPABASE_URL') or os.environ['NEXT_PUBLIC_SUPABASE_URL'],os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    # Missing expand migration or an unarchived demo account must stop the run.
    active_demo=client.table('paper_accounts').select('user_id').eq('is_demo',True).limit(1).execute().data or []
    if active_demo:raise RuntimeError('Archive and quarantine demo ledger records first')
    users=[];page=1
    while True:
        batch=client.auth.admin.list_users(page=page,per_page=200)
        users.extend(batch)
        if len(batch)<200:break
        page+=1
    seeded=[u for u in users if re.fullmatch(r'dummy_.*@bhsl\.local',u.email or '')]
    if len(seeded)>100:raise RuntimeError('Unexpected seed population; inspect before continuing')
    print({'seeded_identities':len(seeded),'apply':args.apply})
    if args.apply:
        for user in seeded:client.auth.admin.update_user_by_id(user.id,{'ban_duration':'876000h'})
        print({'banned':len(seeded)})

if __name__=='__main__':main()
