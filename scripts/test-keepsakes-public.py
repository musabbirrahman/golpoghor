#!/usr/bin/env python3
"""Functional drill for migration 20261021150000_keepsakes_public.sql (27c).

Boots throwaway Postgres (pgserver), builds the minimal schema the
migration touches (auth stub + profiles + stories + keepsakes + licence
table + reports), loads the migration file itself, and runs the publish /
projection / unpublish / restrict / licence-withdrawal matrix.

Exit 0 only if every case matches its expectation.
"""
import pathlib
import sys

import pgserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase/migrations/20261021150000_keepsakes_public.sql"

AUTHOR = "11111111-1111-1111-1111-111111111111"
READER = "22222222-2222-2222-2222-222222222222"
MOD = "33333333-3333-3333-3333-333333333333"
ORIG = "a0000000-0000-0000-0000-000000000001"   # author's original
CLASSIC = "a0000000-0000-0000-0000-000000000002"  # unverified classic
PD = "a0000000-0000-0000-0000-000000000003"   # verified-PD classic
K1 = "b0000000-0000-0000-0000-000000000001"   # reader keepsake, ORIG
K2 = "b0000000-0000-0000-0000-000000000002"   # reader keepsake, CLASSIC
K3 = "b0000000-0000-0000-0000-000000000003"   # reader keepsake, PD
K4 = "b0000000-0000-0000-0000-000000000004"   # author keepsake, ORIG

SCHEMA = """
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'reader'
);
create table public.stories (
  id uuid primary key,
  author_id uuid references public.profiles (id) on delete cascade,
  slug text not null,
  status text not null,
  origin_type text,
  rights_evidence_ref text
);
create or replace function public.story_is_public(s public.stories)
returns boolean language sql stable as
$$ select s.status in ('ongoing', 'complete') $$;
create table public.keepsakes (
  id uuid primary key,
  owner_id uuid references public.profiles (id) on delete cascade,
  story_id uuid references public.stories (id) on delete cascade,
  chapter_id uuid,
  excerpt text not null,
  template text not null,
  echo text,
  echo_public boolean not null default false,
  visibility text not null default 'private',
  status text not null default 'active',
  source_title text not null,
  source_author_name text not null,
  source_original_author text,
  source_original_title text,
  source_translator_name text,
  source_adapter_name text,
  source_edition text,
  published_at timestamptz,
  eligibility_basis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.story_keepsake_licence (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  licence_version text not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('story', 'chapter', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open'
);
create table test_log (case_name text, outcome text);

insert into auth.users values ('%s'), ('%s'), ('%s');
insert into public.profiles (id, username, role) values
  ('%s','author','reader'), ('%s','reader','reader'), ('%s','mod','moderator');
insert into public.stories (id, author_id, slug, status, origin_type) values
  ('%s','%s','orig-tale','ongoing','original'),
  ('%s','%s','old-tale','ongoing','classic'),
  ('%s','%s','pd-tale','ongoing','classic');
insert into public.keepsakes
  (id, owner_id, story_id, excerpt, template, source_title, source_author_name)
values
  ('%s','%s','%s','line one','midnight','Orig Tale','Author'),
  ('%s','%s','%s','line two','midnight','Old Tale','Author'),
  ('%s','%s','%s','line three','midnight','PD Tale','Author'),
  ('%s','%s','%s','my line','midnight','Orig Tale','Author');
""" % (AUTHOR, READER, MOD, AUTHOR, READER, MOD,
       ORIG, AUTHOR, CLASSIC, AUTHOR, PD, AUTHOR,
       K1, READER, ORIG, K2, READER, CLASSIC, K3, READER, PD, K4, AUTHOR, ORIG)


def attempt(name, caller, sql):
    # DO blocks need PERFORM for result-returning calls.
    stmt = sql.strip()
    if stmt.lower().startswith("select "):
        stmt = "perform " + stmt[len("select "):]
    return """
set test.uid = '%s';
do $do$
begin
  begin
    %s;
    insert into test_log values ('%s', 'OK');
  exception when others then
    insert into test_log values ('%s', 'RAISED: ' || sqlerrm);
  end;
end $do$;
""" % (caller, stmt, name, name)


def main():
    server = pgserver.get_server("/tmp/pg-27c")
    psql = server.psql
    psql(SCHEMA)
    psql(MIGRATION.read_text())
    # PD backfill in the drill's own data (migration backfills fixed ids).
    psql("update public.stories set pd_verified = true where id = '%s'" % PD)

    cases = [
        ("uncovered original refused (licence code)", READER,
         "select public.publish_keepsake('%s')" % K1, "KEEPSAKE_NOT_ELIGIBLE_NO_LICENCE"),
        ("unverified classic refused (verified code)", READER,
         "select public.publish_keepsake('%s')" % K2, "KEEPSAKE_NOT_ELIGIBLE_NOT_VERIFIED"),
        ("verified PD publishes", READER,
         "select public.publish_keepsake('%s')" % K3, "OK"),
        ("own story publishes", AUTHOR,
         "select public.publish_keepsake('%s')" % K4, "OK"),
        ("non-owner publish refused", AUTHOR,
         "select public.publish_keepsake('%s')" % K1, "KEEPSAKE_NOT_OWNER"),
    ]
    for name, caller, sql, _ in cases:
        psql(attempt(name, caller, sql))
    out = psql("select case_name, outcome from test_log order by case_name;")
    rows = {}
    for line in out.splitlines():
        if "|" in line:
            n, o = line.split("|", 1)
            rows[n.strip()] = o.strip()
    ok = True
    for name, _, _, want in cases:
        got = rows.get(name, "MISSING")
        good = want in got
        ok &= good
        print(("PASS " if good else "FAIL ") + name + " -> " + got)

    def proj_count():
        out = psql("select count(*) from public.keepsakes_public();")
        for line in out.splitlines():
            if line.strip().isdigit():
                return int(line.strip())
        raise ValueError("no count in: " + out)

    n = proj_count()
    print(("PASS " if n == 2 else "FAIL ") + f"projection has 2 public rows (got {n})")
    ok &= n == 2
    slug_out = psql("select slug from public.keepsakes where id = '%s';" % K3)
    slug = [l.strip() for l in slug_out.splitlines() if l.strip().startswith("k-")][0]
    print(("PASS " if slug.startswith("k-") else "FAIL ") + f"slug assigned: {slug}")
    ok &= slug.startswith("k-")

    psql(attempt("licence accept", AUTHOR,
                 "insert into public.story_keepsake_licence (story_id, author_id, licence_version) values ('%s','%s','v1')" % (ORIG, AUTHOR)))
    psql(attempt("covered publish", READER,
                 "select public.publish_keepsake('%s')" % K1))
    psql(attempt("licence withdraw", AUTHOR,
                 "update public.story_keepsake_licence set withdrawn_at = now() where story_id = '%s' and withdrawn_at is null" % ORIG))
    out = psql("select case_name, outcome from test_log where case_name in ('licence accept','covered publish','licence withdraw');")
    for line in out.splitlines():
        if "|" in line:
            n2, o2 = line.split("|", 1)
            rows[n2.strip()] = o2.strip()
    for name in ("licence accept", "covered publish", "licence withdraw"):
        good = rows.get(name) == "OK"
        ok &= good
        print(("PASS " if good else "FAIL ") + name + " -> " + rows.get(name))
    n = proj_count()
    print(("PASS " if n == 3 else "FAIL ") + f"already-public stays after withdrawal (future-only, got {n})")
    ok &= n == 3
    psql("insert into public.keepsakes (id, owner_id, story_id, excerpt, template, source_title, source_author_name) values ('b0000000-0000-0000-0000-000000000009','%s','%s','late line','midnight','Orig Tale','Author');" % (READER, ORIG))
    psql(attempt("post-withdrawal publish blocked", READER,
                 "select public.publish_keepsake('b0000000-0000-0000-0000-000000000009')"))
    got_out = psql("select outcome from test_log where case_name = 'post-withdrawal publish blocked';")
    got = [l.strip() for l in got_out.splitlines() if l.strip() and "(1 row)" not in l and l.strip() != "outcome"][-1]
    good = "KEEPSAKE_NOT_ELIGIBLE_NO_LICENCE" in got
    ok &= good
    print(("PASS " if good else "FAIL ") + "post-withdrawal publish blocked -> " + got)

    psql(attempt("unpublish", READER, "select public.unpublish_keepsake('%s')" % K1))
    psql(attempt("moderator restrict", MOD, "select public.moderate_keepsake('%s','restricted')" % K3))
    psql(attempt("non-moderator restrict refused", READER, "select public.moderate_keepsake('%s','restricted')" % K4))
    out = psql("select case_name, outcome from test_log where case_name in ('unpublish','moderator restrict','non-moderator restrict refused');")
    for line in out.splitlines():
        if "|" in line:
            n2, o2 = line.split("|", 1)
            rows[n2.strip()] = o2.strip()
    for name, want in (("unpublish", "OK"), ("moderator restrict", "OK"),
                       ("non-moderator restrict refused", "KEEPSAKE_NOT_MODERATOR")):
        good = want in rows.get(name, "")
        ok &= good
        print(("PASS " if good else "FAIL ") + name + " -> " + rows.get(name))
    n = proj_count()
    print(("PASS " if n == 1 else "FAIL ") + f"projection down to 1 row after unpublish+restrict (got {n})")
    ok &= n == 1
    psql("update public.stories set status = 'hidden' where id = '%s';" % ORIG)
    n = proj_count()
    print(("PASS " if n == 0 else "FAIL ") + f"projection empty after source hidden (got {n})")
    ok &= n == 0

    print("\nALL PASS" if ok else "\nFAILURES PRESENT")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
