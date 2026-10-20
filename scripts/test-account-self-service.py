#!/usr/bin/env python3
"""Functional drill for migration 20261021090000_account_self_service.sql.

Boots throwaway Postgres (pgserver), builds the minimal schema the
migration touches (auth stub + profiles + a cascade child), loads the
migration file itself, and runs the scenario matrix for change_username,
the reservation guard, and delete_my_account.

Exit 0 only if every case matches its expectation.
"""
import pathlib
import sys

import pgserver

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase/migrations/20261021090000_account_self_service.sql"

U1 = "11111111-1111-1111-1111-111111111111"  # starts as @oldname
U2 = "22222222-2222-2222-2222-222222222222"  # starts as @otheruser
U3 = "33333333-3333-3333-3333-333333333333"  # newcomer

SCHEMA = """
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  constraint username_format check (username ~ '^[a-z0-9_]{3,30}$')
);
create table public.stories (
  id uuid primary key, author_id uuid references public.profiles (id) on delete cascade
);
create table test_log (case_name text, outcome text);

insert into auth.users values ('%s'), ('%s'), ('%s');
insert into public.profiles (id, username) values ('%s','oldname'), ('%s','otheruser');
insert into public.stories values ('99999999-9999-9999-9999-999999999999','%s');
""" % (U1, U2, U3, U1, U2, U1)


def attempt(name, caller, sql):
    """Run sql as `caller`, logging OK or the raised message."""
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
""" % (caller, sql, name, name)


CASES = [
    ("01 rename to a free valid handle",
     attempt("01", U1, "perform public.change_username('newname')"),
     "OK"),
    ("02 old handle redirects to the new one",
     "insert into test_log select '02', case when exists (select 1 from public.username_redirects where old_username='oldname' and new_username='newname' and expires_at > now() + interval '29 days') then 'OK' else 'MISSING' end;",
     "OK"),
    ("03 immediate second rename hits the cooldown",
     attempt("03", U1, "perform public.change_username('another')"),
     "RAISED: USERNAME_COOLDOWN: You can change your username again after"),
    ("04 invalid format refused",
     attempt("04", U2, "perform public.change_username('Bad Name!')"),
     "RAISED: USERNAME_INVALID: Usernames are 3-30 characters of lowercase letters, numbers and underscores."),
    ("05 same name refused",
     attempt("05", U2, "perform public.change_username('otheruser')"),
     "RAISED: USERNAME_SAME: That is already your username."),
    ("06 taken name refused",
     attempt("06", U2, "perform public.change_username('newname')"),
     "RAISED: USERNAME_TAKEN: That username is already taken."),
    ("07 another user cannot rename into the reserved handle",
     attempt("07", U2, "perform public.change_username('oldname')"),
     "RAISED: USERNAME_RESERVED: That username was recently in use and is still reserved."),
    ("08 a new signup cannot take the reserved handle",
     attempt("08", U3, "insert into public.profiles (id, username) values ('%s','oldname')" % U3),
     "RAISED: USERNAME_RESERVED: That username was recently in use and is still reserved."),
    ("09 owner reclaims their own old handle after cooldown",
     "update public.profiles set username_changed_at = now() - interval '31 days' where id = '%s';" % U1
     + attempt("09", U1, "perform public.change_username('oldname')"),
     "OK"),
    ("10 reclaim swaps the reservation to the intermediate handle",
     "insert into test_log select '10', case when exists (select 1 from public.username_redirects where old_username='newname' and new_username='oldname') and not exists (select 1 from public.username_redirects where old_username='oldname') then 'OK' else 'WRONG' end;",
     "OK"),
    ("11 delete_my_account cascades everything",
     attempt("11a", U1, "perform public.delete_my_account()")
     + "insert into test_log select '11', case when not exists (select 1 from auth.users where id='%s') and not exists (select 1 from public.profiles where id='%s') and not exists (select 1 from public.stories where author_id='%s') and exists (select 1 from public.profiles where id='%s') then 'OK' else 'WRONG' end;" % (U1, U1, U1, U2),
     "OK"),
]


def main():
    server = pgserver.get_server("/tmp/drillpg-acct")
    psql = server.psql
    psql(SCHEMA)
    psql(MIGRATION.read_text())
    expect = {}
    for name, sql, want in CASES:
        psql(sql)
        key = name.split(" ")[0]
        expect[key] = (name, want)
    out = psql("select case_name, outcome from test_log order by case_name;")
    rows = {}
    for line in out.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 2 and parts[0]:
            rows[parts[0]] = parts[1]
    failed = 0
    for key, (name, want) in sorted(expect.items()):
        got = rows.get(key, "<no row>")
        ok = got.startswith(want) if want.startswith("RAISED") or want == "OK" else got == want
        if key == "11":
            ok = got == "OK"
        failed += 0 if ok else 1
        print("%s %-58s -> %s" % ("PASS" if ok else "FAIL", name, got))
    print("\n%d/%d cases passed" % (len(expect) - failed, len(expect)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
