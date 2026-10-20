-- GolpoNeer V4-07: account self-service support.
--  * profiles.username_changed_at — drives the 30-day username cooldown.
--  * public.username_redirects — old handles keep resolving (and stay
--    reserved for their owner) for 30 days after a change, so old profile
--    and story URLs redirect instead of dying, and nobody can grab a
--    just-released handle to impersonate its former owner.
--  * public.change_username(text) — the whole change, atomically, in one
--    SECURITY DEFINER function: format, cooldown, uniqueness, reservation.
--  * public.delete_my_account() — deletes the caller's auth.users row;
--    existing FK cascades remove profile, stories, chapters, comments,
--    progress, notifications and prefs (the same cascade the dashboard
--    user-delete used in the M1 test-account cleanup).

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

create table if not exists public.username_redirects (
  old_username text primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  new_username text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

alter table public.username_redirects enable row level security;

-- Redirects are a public lookup service (old links must resolve for
-- signed-out visitors too). Writes happen only inside change_username().
create policy username_redirects_public_read on public.username_redirects
  for select using (true);

create or replace function public.change_username(p_new_username text)
returns void language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
  v_new    text := lower(trim(coalesce(p_new_username, '')));
  v_old    text;
  v_changed_at timestamptz;
begin
  if v_caller is null then
    raise exception 'Sign in required.';
  end if;
  if v_new !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'USERNAME_INVALID: Usernames are 3-30 characters of lowercase letters, numbers and underscores.';
  end if;

  select username, username_changed_at into v_old, v_changed_at
  from public.profiles where id = v_caller;
  if v_old is null then
    raise exception 'Unknown account.';
  end if;
  if v_new = v_old then
    raise exception 'USERNAME_SAME: That is already your username.';
  end if;
  if v_changed_at is not null and v_changed_at > now() - interval '30 days' then
    raise exception 'USERNAME_COOLDOWN: You can change your username again after %',
      to_char(v_changed_at + interval '30 days', 'YYYY-MM-DD');
  end if;
  if exists (select 1 from public.profiles where username = v_new and id <> v_caller) then
    raise exception 'USERNAME_TAKEN: That username is already taken.';
  end if;
  -- A handle inside its reservation window belongs to its former owner;
  -- only that owner may reclaim it.
  if exists (
    select 1 from public.username_redirects
    where old_username = v_new and expires_at > now() and user_id <> v_caller
  ) then
    raise exception 'USERNAME_RESERVED: That username was recently in use and is still reserved.';
  end if;

  -- Record the redirect for the old handle (refresh if re-taking a name
  -- the caller themselves held before).
  insert into public.username_redirects (old_username, user_id, new_username, expires_at)
  values (v_old, v_caller, v_new, now() + interval '30 days')
  on conflict (old_username) do update
    set user_id = excluded.user_id,
        new_username = excluded.new_username,
        created_at = now(),
        expires_at = excluded.expires_at;

  -- The caller's own earlier reservation of the new name is now moot.
  delete from public.username_redirects
  where old_username = v_new and user_id = v_caller;

  update public.profiles
  set username = v_new, username_changed_at = now()
  where id = v_caller;
end $$;

-- A reserved handle must also stay unavailable to brand-new signups, not
-- just to renames — otherwise the impersonation hole reopens at the
-- signup form. This guard fires on any profile insert/rename; the owner
-- reclaiming their own handle (redirect.user_id = profile id) is allowed.
create or replace function public.guard_username_reservation()
returns trigger language plpgsql security definer as $$
begin
  if exists (
    select 1 from public.username_redirects
    where old_username = new.username
      and expires_at > now()
      and user_id <> new.id
  ) then
    raise exception 'USERNAME_RESERVED: That username was recently in use and is still reserved.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_username_reservation_guard on public.profiles;
create trigger profiles_username_reservation_guard
  before insert or update of username on public.profiles
  for each row execute function public.guard_username_reservation();

create or replace function public.delete_my_account()
returns void language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Sign in required.';
  end if;
  -- Cascades (profiles -> everything) do the rest, exactly as when an
  -- admin deletes the user from the dashboard.
  delete from auth.users where id = v_caller;
end $$;
