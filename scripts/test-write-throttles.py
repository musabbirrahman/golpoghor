#!/usr/bin/env python3
"""Functional drill for migration 20261021100000_write_throttles.sql.

Minimal comments/reports tables, the real migration file, then burst
tests: limits hold per user, other users are unaffected, and the window
slides (an aged-out row frees capacity again).
"""
import pathlib
import sys

import pgserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase/migrations/20261021100000_write_throttles.sql"

U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"
CH = "99999999-9999-9999-9999-999999999999"

SCHEMA = """
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null, author_id uuid not null,
  body text not null, status text not null default 'visible',
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null, target_type text not null, target_id uuid not null,
  reason text not null default 'spam', details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create table test_log (case_name text, outcome text);
"""

CASES = [
    ("01 thirty comments in an hour pass",
     """
do $do$ begin
  for i in 1..30 loop
    insert into public.comments (chapter_id, author_id, body) values ('%s','%s','c');
  end loop;
  insert into test_log values ('01','OK');
exception when others then
  insert into test_log values ('01','RAISED: ' || sqlerrm);
end $do$;""" % (CH, U1),
     "OK"),
    ("02 the 31st comment is refused",
     """
do $do$ begin
  insert into public.comments (chapter_id, author_id, body) values ('%s','%s','c');
  insert into test_log values ('02','OK');
exception when others then
  insert into test_log values ('02','RAISED: ' || sqlerrm);
end $do$;""" % (CH, U1),
     "RAISED: RATE_LIMITED: Too many comments in the last hour. Please wait a while before commenting again."),
    ("03 another user still comments freely",
     """
do $do$ begin
  insert into public.comments (chapter_id, author_id, body) values ('%s','%s','c');
  insert into test_log values ('03','OK');
exception when others then
  insert into test_log values ('03','RAISED: ' || sqlerrm);
end $do$;""" % (CH, U2),
     "OK"),
    ("04 the window slides: aging one comment out frees capacity",
     """
update public.comments set created_at = now() - interval '61 minutes'
where id = (select id from public.comments where author_id='%s' limit 1);
do $do$ begin
  insert into public.comments (chapter_id, author_id, body) values ('%s','%s','c');
  insert into test_log values ('04','OK');
exception when others then
  insert into test_log values ('04','RAISED: ' || sqlerrm);
end $do$;""" % (U1, CH, U1),
     "OK"),
    ("05 ten reports in an hour pass",
     """
do $do$ begin
  for i in 1..10 loop
    insert into public.reports (reporter_id, target_type, target_id) values ('%s','chapter','%s');
  end loop;
  insert into test_log values ('05','OK');
exception when others then
  insert into test_log values ('05','RAISED: ' || sqlerrm);
end $do$;""" % (U1, CH),
     "OK"),
    ("06 the 11th report is refused",
     """
do $do$ begin
  insert into public.reports (reporter_id, target_type, target_id) values ('%s','chapter','%s');
  insert into test_log values ('06','OK');
exception when others then
  insert into test_log values ('06','RAISED: ' || sqlerrm);
end $do$;""" % (U1, CH),
     "RAISED: RATE_LIMITED: Too many reports in the last hour. Please wait a while before reporting again."),
    ("07 another reporter is unaffected",
     """
do $do$ begin
  insert into public.reports (reporter_id, target_type, target_id) values ('%s','chapter','%s');
  insert into test_log values ('07','OK');
exception when others then
  insert into test_log values ('07','RAISED: ' || sqlerrm);
end $do$;""" % (U2, CH),
     "OK"),
]


def main():
    server = pgserver.get_server("/tmp/drillpg-throttle")
    psql = server.psql
    psql(SCHEMA)
    psql(MIGRATION.read_text())
    expect = {}
    for name, sql, want in CASES:
        psql(sql)
        expect[name.split(" ")[0]] = (name, want)
    out = psql("select case_name, outcome from test_log order by case_name;")
    rows = {}
    for line in out.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 2 and parts[0]:
            rows[parts[0]] = parts[1]
    failed = 0
    for key, (name, want) in sorted(expect.items()):
        got = rows.get(key, "<no row>")
        ok = got == want
        failed += 0 if ok else 1
        print("%s %-58s -> %s" % ("PASS" if ok else "FAIL", name, got))
    print("\n%d/%d cases passed" % (len(expect) - failed, len(expect)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
