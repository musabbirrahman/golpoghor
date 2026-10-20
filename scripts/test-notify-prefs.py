#!/usr/bin/env python3
"""Functional drill for migration 20261020220000_notify_user_respect_prefs.sql.

Boots a throwaway Postgres (pgserver), builds the minimal schema that
notify_user() touches, loads the function FROM THE MIGRATION FILE, and runs
a 10-case scenario matrix. The bug being fixed: notification_prefs is
owner-only (RLS), so the sender's client can never see a recipient's
opt-out; the gate must live in the SECURITY DEFINER function.

Exit 0 only if every case matches its expectation.
"""
import pathlib
import sys

import pgserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase/migrations/20261020220000_notify_user_respect_prefs.sql"

AUTHOR = "11111111-1111-1111-1111-111111111111"
READER = "22222222-2222-2222-2222-222222222222"   # follows AUTHOR
NONFOL = "33333333-3333-3333-3333-333333333333"   # does not follow
MOD = "44444444-4444-4444-4444-444444444444"
STORY = "55555555-5555-5555-5555-555555555555"

SCHEMA = """
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.profiles (id uuid primary key, role text not null default 'reader');
create table public.follows (follower_id uuid, author_id uuid);
create table public.stories (id uuid primary key, author_id uuid);
create table public.chapters (story_id uuid, slug text, status text);
create table public.reports (reporter_id uuid, created_at timestamptz);
create table public.appeals (author_id uuid, created_at timestamptz);
create table public.notifications (
  id serial primary key, user_id uuid, type text, data jsonb, link text);
create table public.notification_prefs (
  user_id uuid primary key, prefs jsonb not null default '{}');
create table test_log (case_name text, outcome text, notif_count int);

insert into public.profiles (id, role) values
  ('%s','author'), ('%s','reader'), ('%s','reader'), ('%s','moderator');
insert into public.follows values ('%s','%s');
insert into public.stories values ('%s','%s');
insert into public.chapters values ('%s','ch-1','published');
""" % (AUTHOR, READER, NONFOL, MOD, READER, AUTHOR, STORY, AUTHOR, STORY)

DATA = '{"storyId":"%s","chapterSlug":"ch-1"}' % STORY


def case(name, caller, prefs_sql, call_sql, recipient):
    """One scenario: reset state, set prefs, call as `caller`, log outcome."""
    return """
delete from public.notifications;
delete from public.notification_prefs;
%s
set test.uid = '%s';
do $do$
declare n int;
begin
  begin
    perform %s;
    select count(*) into n from public.notifications where user_id = '%s';
    insert into test_log values ('%s', 'OK', n);
  exception when others then
    insert into test_log values ('%s', 'RAISED: ' || sqlerrm, -1);
  end;
end $do$;
""" % (prefs_sql, caller, call_sql, recipient, name, name)


def prefs(user, json):
    return "insert into public.notification_prefs values ('%s','%s'::jsonb);" % (user, json)


CASES = [
    # (name, sql, expected_outcome, expected_count)
    ("01 follower, no prefs row -> delivered",
     case("01", AUTHOR, "", "public.notify_user('%s','new_chapter','%s'::jsonb,'/x')" % (READER, DATA), READER),
     "OK", 1),
    ("02 follower, new_chapter=false -> skipped silently",
     case("02", AUTHOR, prefs(READER, '{"new_chapter": false}'),
          "public.notify_user('%s','new_chapter','%s'::jsonb,'/x')" % (READER, DATA), READER),
     "OK", 0),
    ("03 follower, new_chapter=true -> delivered",
     case("03", AUTHOR, prefs(READER, '{"new_chapter": true}'),
          "public.notify_user('%s','new_chapter','%s'::jsonb,'/x')" % (READER, DATA), READER),
     "OK", 1),
    ("04 follower, unrelated key off -> still delivered",
     case("04", AUTHOR, prefs(READER, '{"report_updates": false}'),
          "public.notify_user('%s','new_chapter','%s'::jsonb,'/x')" % (READER, DATA), READER),
     "OK", 1),
    ("05 non-follower -> still rejected",
     case("05", AUTHOR, "", "public.notify_user('%s','new_chapter','%s'::jsonb,'/x')" % (NONFOL, DATA), NONFOL),
     "RAISED: New-chapter alerts may only go to followers.", -1),
    ("06 external link -> still rejected",
     case("06", AUTHOR, "", "public.notify_user('%s','new_chapter','%s'::jsonb,'https://evil.example')" % (READER, DATA), READER),
     "RAISED: Notification links must be internal.", -1),
    ("07 moderator report_update, recipient opted out -> skipped",
     case("07", MOD, prefs(READER, '{"report_updates": false}'),
          "public.notify_user('%s','report_update','{}'::jsonb,'/x')" % READER, READER),
     "OK", 0),
    ("08 moderator report_update, no prefs -> delivered",
     case("08", MOD, "", "public.notify_user('%s','report_update','{}'::jsonb,'/x')" % READER, READER),
     "OK", 1),
    ("09 non-moderator report_update -> still rejected",
     case("09", AUTHOR, "", "public.notify_user('%s','report_update','{}'::jsonb,'/x')" % READER, READER),
     "RAISED: Only moderators may send this notification.", -1),
    ("10 wrong story in data -> still rejected",
     case("10", AUTHOR, "",
          "public.notify_user('%s','new_chapter','{\"storyId\":\"99999999-9999-9999-9999-999999999999\",\"chapterSlug\":\"ch-1\"}'::jsonb,'/x')" % READER, READER),
     "RAISED: Not authorized to announce this chapter.", -1),
]


def main():
    server = pgserver.get_server("/tmp/drillpg-notify")
    psql = server.psql
    psql(SCHEMA)
    psql(MIGRATION.read_text())
    for _, sql, _, _ in CASES:
        psql(sql)
    out = psql("select case_name, outcome, notif_count from test_log order by case_name;")
    rows = {}
    for line in out.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 3 and parts[0] and parts[0][0].isdigit():
            rows[parts[0]] = (parts[1], int(parts[2]))
    failed = 0
    for name, _, want_outcome, want_count in CASES:
        key = name.split(" ")[0]
        got = rows.get(key)
        ok = got == (want_outcome, want_count)
        failed += 0 if ok else 1
        print("%s %-52s -> %s" % ("PASS" if ok else "FAIL", name, got))
    print("\n%d/%d cases passed" % (len(CASES) - failed, len(CASES)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
