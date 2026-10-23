-- GolpoNeer: Argon Round 2 security fixes (verified 2026-10-24).
--
-- Covers R2-1, R2-2, R2-3, R2-4, R2-5, R2-6, R2-7, R2-8, R2-10, R2-12.
-- Deferred to a later round by owner call: R2-9 (notify_user rate limit /
-- dedupe — needs a cooldown design) and R2-11 (storage cleanup on account
-- deletion — needs the cover path layout verified first).
--
-- Design notes:
-- * Column guards use whole-row jsonb comparison (to_jsonb(new) minus the
--   allowed keys = to_jsonb(old) minus the same keys). This is deliberate:
--   R2-4 happened because an explicit column list went stale when new
--   columns were added. The jsonb form is fail-closed — a column added
--   later is protected by default until it is explicitly allowed.
-- * The keepsake guard is bypassed only by a transaction-local flag that
--   the publish / unpublish / moderate RPCs set themselves. Clients have
--   no SQL access, so they cannot set it; it dies with the transaction.
-- * Manual pd_verified process (until an admin control exists): an admin
--   runs `update public.stories set pd_verified = true where id = '...';`
--   in the Supabase dashboard SQL editor (postgres is exempt from the
--   guard below). Translators' keepsakes need this flag before they can
--   publish, now that own-story no longer covers non-originals.
-- * Nothing in this migration touches existing rows: no backfill, no
--   visibility/status change. Already-public keepsakes stay public.
-- * Rev 2 (2026-10-24, pre-apply Argon checkup): keepsakes guard changed
--   from SECURITY DEFINER to invoker (Critical #1 — the definer owner
--   made the postgres exemption always true); featured guard gains a
--   postgres / service_role exemption (Low #2).

-- ============================================================ R2-7 (DDL)
-- moderation_events: a moderator who ever logged an event could not
-- delete their account (ON DELETE RESTRICT), keepsake was missing from
-- the target types, and moderate_keepsake logged nothing.

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.moderation_events'::regclass and contype = 'f'
    and pg_get_constraintdef(oid) like '%moderator_id%';
  if c is not null then
    execute 'alter table public.moderation_events drop constraint ' || quote_ident(c);
  end if;
end $$;

alter table public.moderation_events alter column moderator_id drop not null;

alter table public.moderation_events
  add constraint moderation_events_moderator_id_fkey
  foreign key (moderator_id) references public.profiles (id) on delete set null;

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.moderation_events'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%target_type%';
  if c is not null then
    execute 'alter table public.moderation_events drop constraint ' || quote_ident(c);
  end if;
end $$;

alter table public.moderation_events
  add constraint moderation_events_target_type_check
  check (target_type in ('story', 'chapter', 'comment', 'profile', 'keepsake'));

-- ================================================== R2-1 + R2-3 + R2-7
-- publish_keepsake: (1) the owner check `owner <> auth.uid()` is NULL for
-- anon, so the raise was skipped — anon could publish/unpublish anyone's
-- keepsake and read the full row (including a private echo) in return;
-- (2) own-story now requires an original (or a legacy NULL origin_type),
-- so an uploaded translation / adaptation / classic no longer bypasses
-- PD verification through the author match. The projection is untouched:
-- already-public cards stay public (future-only).

create or replace function public.publish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer set search_path = public as $$
declare
  k public.keepsakes%rowtype;
  src public.stories%rowtype;
  basis text;
  new_slug text;
  attempts int := 0;
begin
  select * into k from public.keepsakes where id = p_keepsake_id;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  if auth.uid() is null or k.owner_id is distinct from auth.uid() then
    raise exception 'KEEPSAKE_NOT_OWNER: only the owner can publish a keepsake.';
  end if;
  select * into src from public.stories where id = k.story_id;
  if not found or not public.story_is_public(src) then
    raise exception 'KEEPSAKE_SOURCE_NOT_PUBLIC: the source story is not public.';
  end if;
  if k.owner_id = src.author_id and coalesce(src.origin_type, 'original') = 'original' then
    basis := 'own-story';
  elsif src.pd_verified then
    basis := 'public-domain';
  elsif src.origin_type = 'original' and public.story_keepsake_covered(src.id) then
    basis := 'licence';
  elsif src.origin_type = 'original' then
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NO_LICENCE: this story is not covered by a Keepsake Sharing Licence acceptance.';
  else
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NOT_VERIFIED: this text has no verified public-domain determination.';
  end if;
  perform set_config('app.keepsake_guard_bypass', 'on', true);
  if k.slug is null then
    loop
      attempts := attempts + 1;
      new_slug := 'k-' || substr(k.id::text, 1, 8);
      if attempts > 1 then
        new_slug := new_slug || '-' || substr(md5(random()::text), 1, 4);
      end if;
      begin
        update public.keepsakes set slug = new_slug where id = p_keepsake_id;
        exit;
      exception when unique_violation then
        if attempts >= 5 then raise; end if;
      end;
    end loop;
  end if;
  update public.keepsakes
    set visibility = 'public',
        published_at = now(),
        eligibility_basis = basis,
        updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;

create or replace function public.unpublish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer set search_path = public as $$
declare
  k public.keepsakes%rowtype;
begin
  select * into k from public.keepsakes where id = p_keepsake_id;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  if auth.uid() is null or k.owner_id is distinct from auth.uid() then
    raise exception 'KEEPSAKE_NOT_OWNER: only the owner can unpublish a keepsake.';
  end if;
  perform set_config('app.keepsake_guard_bypass', 'on', true);
  update public.keepsakes
    set visibility = 'private', updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;

-- moderate_keepsake: the role check already failed closed for anon
-- (NULL role is distinct from both roles), but it is revoked from anon
-- below anyway, and it now writes the audit row R2-7 found missing.

create or replace function public.moderate_keepsake(p_keepsake_id uuid, p_status text)
returns public.keepsakes language plpgsql security definer set search_path = public as $$
declare
  k public.keepsakes%rowtype;
  caller_role text;
begin
  if p_status not in ('restricted', 'active') then
    raise exception 'KEEPSAKE_BAD_STATUS: status must be restricted or active.';
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'moderator' and caller_role is distinct from 'admin' then
    raise exception 'KEEPSAKE_NOT_MODERATOR: moderators only.';
  end if;
  perform set_config('app.keepsake_guard_bypass', 'on', true);
  update public.keepsakes
    set status = p_status, updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  insert into public.moderation_events (moderator_id, action, target_type, target_id, details)
  values (auth.uid(),
          case when p_status = 'restricted' then 'restrict_keepsake' else 'restore_keepsake' end,
          'keepsake', p_keepsake_id, '{}'::jsonb);
  return k;
end;
$$;

-- keepsakes_public() stays anon-callable (public shelf + og.js use it).
-- Only the three owner/moderator RPCs lose anon access.
revoke execute on function public.publish_keepsake(uuid), public.unpublish_keepsake(uuid), public.moderate_keepsake(uuid, text) from anon, public;
grant execute on function public.publish_keepsake(uuid), public.unpublish_keepsake(uuid), public.moderate_keepsake(uuid, text) to authenticated, service_role;

-- ============================================================ R2-2
-- Keepsake column guard: owner INSERT/UPDATE policies had no column
-- limits, so an owner could publish from an unlicensed story, un-restrict
-- a takedown, or forge attribution by direct PostgREST writes. INSERT
-- forces the security columns and snapshots attribution from the story
-- itself (same sources the client snapshot uses); UPDATE allows only
-- excerpt / template / echo / echo_public / updated_at to change.

-- SECURITY INVOKER deliberately (the default): inside a SECURITY DEFINER
-- function, current_user is always the function owner (postgres), which
-- would make the postgres / service_role exemption below always true and
-- disable this guard entirely (Argon pre-apply checkup, Critical #1).
-- As an invoker function, direct client calls run as 'authenticated'
-- (guard enforced), RPC calls bypass via the flag set before any write,
-- and dashboard / backfill calls run as postgres (exempt).
create or replace function public.keepsakes_guard_columns()
returns trigger language plpgsql as $$
begin
  if current_setting('app.keepsake_guard_bypass', true) = 'on' then
    return new;
  end if;
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.visibility := 'private';
    new.status := 'active';
    new.slug := null;
    new.published_at := null;
    new.eligibility_basis := null;
    select s.title, p.display_name, s.original_author, s.original_title,
           s.translator_name, s.adapter_name, s.edition_source
      into new.source_title, new.source_author_name, new.source_original_author,
           new.source_original_title, new.source_translator_name,
           new.source_adapter_name, new.source_edition
      from public.stories s
      join public.profiles p on p.id = s.author_id
      where s.id = new.story_id;
    if not found then
      raise exception 'KEEPSAKE_SOURCE_NOT_FOUND: the source story does not exist.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'excerpt' - 'template' - 'echo' - 'echo_public' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'excerpt' - 'template' - 'echo' - 'echo_public' - 'updated_at')
  then
    raise exception 'KEEPSAKE_READONLY: visibility, status, slug, eligibility and attribution may only change through publish_keepsake, unpublish_keepsake or moderate_keepsake.';
  end if;
  return new;
end;
$$;

drop trigger if exists keepsakes_guard_columns on public.keepsakes;
create trigger keepsakes_guard_columns before insert or update on public.keepsakes
  for each row execute function public.keepsakes_guard_columns();

-- ============================================================ R2-3
-- Featured guard and publish gate were BEFORE UPDATE only, so an author
-- could INSERT a story already featured, or already public with no
-- published chapters. The featured function already handles INSERT
-- correctly (IS DISTINCT FROM treats a NULL old row as distinct); the
-- publish gate did not (old.status is NULL on INSERT, so the transition
-- check never fired) and is rewritten to branch on TG_OP.

-- The original guard had no postgres / service_role exemption, so
-- featuring from the SQL Editor or a seed script failed (pre-existing on
-- UPDATE, extended to INSERT by the trigger change below — Argon
-- pre-apply checkup, Low #2). Trusted server roles are now exempt; the
-- app path (moderator / admin via is_moderator()) is unchanged.
create or replace function public.prevent_featured_self_service()
returns trigger language plpgsql as $$
begin
  if new.featured_position is distinct from old.featured_position
     and not public.is_moderator()
     and current_user not in ('postgres', 'service_role') then
    raise exception 'FEATURED_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists stories_featured_guard on public.stories;
create trigger stories_featured_guard before insert or update on public.stories
  for each row execute function public.prevent_featured_self_service();

create or replace function public.require_published_chapter()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if new.status in ('ongoing', 'complete')
       and not exists (
         select 1 from public.chapters c
         where c.story_id = new.id and c.status = 'published'
       ) then
      raise exception 'Cannot publish a story with no published chapters.';
    end if;
  else
    if new.status in ('ongoing', 'complete')
       and old.status not in ('ongoing', 'complete')
       and not exists (
         select 1 from public.chapters c
         where c.story_id = new.id and c.status = 'published'
       ) then
      raise exception 'Cannot publish a story with no published chapters.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stories_publish_gate on public.stories;
create trigger stories_publish_gate before insert or update on public.stories
  for each row execute function public.require_published_chapter();

-- pd_verified / rights_evidence_ref: only admins (or postgres /
-- service_role, for backfills) may set or change them. Authors and
-- moderators are blocked on both INSERT and UPDATE.

create or replace function public.stories_pd_verified_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    if new.pd_verified or new.rights_evidence_ref is not null then
      raise exception 'PD_VERIFIED_ADMIN_ONLY: only admins may set pd_verified or rights_evidence_ref.';
    end if;
  else
    if new.pd_verified is distinct from old.pd_verified
       or new.rights_evidence_ref is distinct from old.rights_evidence_ref
    then
      raise exception 'PD_VERIFIED_ADMIN_ONLY: only admins may change pd_verified or rights_evidence_ref.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stories_pd_verified_guard on public.stories;
create trigger stories_pd_verified_guard before insert or update on public.stories
  for each row execute function public.stories_pd_verified_guard();

-- ============================================================ R2-4
-- Moderator column guard rewritten: the old list predated the 10 newer
-- story columns, so moderators could not feature standalone, but COULD
-- bundle pd_verified / featured / attribution changes with a status flip.
-- The jsonb form covers every column, so a future column is protected
-- by default. Admins, owners and postgres/service_role bypass as before.

create or replace function public.restrict_story_moderator_columns()
returns trigger language plpgsql as $$
begin
  if old.author_id = auth.uid() then return new; end if;
  if public.is_admin() then return new; end if;
  if current_user in ('postgres', 'service_role') then return new; end if;

  -- Moderator hide/restore: only the status may change.
  if new.status is distinct from old.status
     and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at')
  then
    return new;
  end if;

  -- View counter: only view_count may change.
  if new.view_count is distinct from old.view_count
     and (to_jsonb(new) - 'view_count' - 'updated_at') = (to_jsonb(old) - 'view_count' - 'updated_at')
  then
    return new;
  end if;

  -- Featured pick / move / remove: only featured_position may change.
  if public.is_moderator()
     and new.featured_position is distinct from old.featured_position
     and (to_jsonb(new) - 'featured_position' - 'updated_at') = (to_jsonb(old) - 'featured_position' - 'updated_at')
  then
    return new;
  end if;

  raise exception 'Moderators may only change a story''s status or featured_position.';
end $$;

-- ============================================================ R2-5
-- Direct profile renames bypassed change_username()'s 30-day cooldown
-- and redirect creation. The guard below blocks direct writes to username
-- / username_changed_at; change_username() sets the transaction-local
-- flag (and runs as postgres, which is exempt) so legitimate renames
-- still work. Display-name / bio / locale / avatar updates are untouched.

create or replace function public.profiles_username_direct_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role') then return new; end if;
  if current_setting('app.in_change_username', true) = 'true' then return new; end if;
  if new.username is distinct from old.username
     or new.username_changed_at is distinct from old.username_changed_at
  then
    raise exception 'USERNAME_DIRECT_CHANGE: change your username through change_username() so the cooldown and redirect are recorded.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_username_direct_guard on public.profiles;
create trigger profiles_username_direct_guard before update on public.profiles
  for each row execute function public.profiles_username_direct_guard();

create or replace function public.change_username(p_new_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_new    text := lower(trim(coalesce(p_new_username, '')));
  v_old    text;
  v_changed_at timestamptz;
begin
  if v_caller is null then
    raise exception 'Sign in required.';
  end if;
  perform set_config('app.in_change_username', 'true', true);
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
  if exists (
    select 1 from public.username_redirects
    where old_username = v_new and expires_at > now() and user_id <> v_caller
  ) then
    raise exception 'USERNAME_RESERVED: That username was recently in use and is still reserved.';
  end if;

  insert into public.username_redirects (old_username, user_id, new_username, expires_at)
  values (v_old, v_caller, v_new, now() + interval '30 days')
  on conflict (old_username) do update
    set user_id = excluded.user_id,
        new_username = excluded.new_username,
        created_at = now(),
        expires_at = excluded.expires_at;

  delete from public.username_redirects
  where old_username = v_new and user_id = v_caller;

  update public.profiles
  set username = v_new, username_changed_at = now()
  where id = v_caller;
end $$;

-- profiles_moderator_update is unused by the app (no suspend UI, no admin
-- profile editing) and let a moderator rewrite any profile except role,
-- including an admin's. Removed; moderators keep self-service through
-- profiles_owner_update.
drop policy if exists profiles_moderator_update on public.profiles;

-- Chapters / comments moderator guards: moderators may change only the
-- status (hide / restore / remove). Owners, admins and postgres /
-- service_role bypass as before; everyone else is still gated by RLS.
-- The admin hide flows update only { status }, so they keep working.

create or replace function public.chapters_moderator_columns()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.stories s where s.id = old.story_id and s.author_id = auth.uid()) then return new; end if;
  if public.is_admin() then return new; end if;
  if current_user in ('postgres', 'service_role') then return new; end if;
  if not public.is_moderator() then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then return new; end if;
  raise exception 'Moderators may only change a chapter''s status.';
end $$;

drop trigger if exists chapters_moderator_columns on public.chapters;
create trigger chapters_moderator_columns before update on public.chapters
  for each row execute function public.chapters_moderator_columns();

create or replace function public.comments_moderator_columns()
returns trigger language plpgsql as $$
begin
  if old.author_id = auth.uid() then return new; end if;
  if public.is_admin() then return new; end if;
  if current_user in ('postgres', 'service_role') then return new; end if;
  if not public.is_moderator() then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then return new; end if;
  raise exception 'Moderators may only change a comment''s status.';
end $$;

drop trigger if exists comments_moderator_columns on public.comments;
create trigger comments_moderator_columns before update on public.comments
  for each row execute function public.comments_moderator_columns();

-- ============================================================ R2-6
-- handle_new_user: only unique_violation was caught, so a reserved name
-- (P0001 from the reservation guard), a 26–30 char collision retry
-- (31–35 chars, violating the 3–30 format), or a 1–2 char email prefix
-- all aborted signup. Now: invalid names fall back to reader_<id>, the
-- retry truncates to fit 30 chars, and a second failure falls back to
-- reader_<id> instead of aborting. The client-side reserved check (in
-- this round's code patch) gives the friendly error before signup, so
-- the fallback should rarely be seen.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_display  text;
begin
  v_username := nullif(new.raw_user_meta_data->>'username', '');

  if v_username is null and new.email is not null then
    v_username := left(
      nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'), ''),
      20
    );
  end if;

  if v_username is null then
    v_username := 'reader_' || left(new.id::text, 8);
  end if;

  if v_username !~ '^[a-z0-9_]{3,30}$' then
    v_username := 'reader_' || left(new.id::text, 8);
  end if;

  v_display := nullif(new.raw_user_meta_data->>'display_name', '');
  if v_display is null then
    v_display := v_username;
  end if;

  begin
    insert into public.profiles (id, username, display_name, locale, role)
    values (new.id, v_username, v_display, 'bn', 'reader');
  exception when unique_violation or raise_exception then
    begin
      insert into public.profiles (id, username, display_name, locale, role)
      values (new.id, left(v_username, 25) || '_' || left(new.id::text, 4), v_display, 'bn', 'reader');
    exception when unique_violation or raise_exception then
      insert into public.profiles (id, username, display_name, locale, role)
      values (new.id, 'reader_' || left(new.id::text, 8), v_display, 'bn', 'reader');
    end;
  end;

  return new;
end;
$$;

-- =========================================================== R2-10
-- Licence UPDATE policy lacked the story-authorship check the 20261023
-- gate added to INSERT, so an author could move a licence row to another
-- story or re-activate a withdrawn row. Now: only an unwithdrawn row may
-- be updated, the update must leave it withdrawn (withdraw flow), and
-- the story must belong to the caller.

drop policy if exists story_keepsake_licence_author_update on public.story_keepsake_licence;
create policy story_keepsake_licence_author_update on public.story_keepsake_licence
  for update
  using (author_id = auth.uid() and withdrawn_at is null)
  with check (
    author_id = auth.uid()
    and withdrawn_at is not null
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

-- ============================================================ R2-8
-- search_path for the remaining SECURITY DEFINER functions (the ones
-- rewritten above carry it in their definitions; handle_new_user
-- already had it). Without it, a caller-controlled search_path could
-- shadow objects these functions resolve.

alter function public.is_moderator() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.record_story_view(uuid) set search_path = public;
alter function public.story_is_public(public.stories) set search_path = public;
alter function public.notify_user(uuid, text, jsonb, text) set search_path = public;
alter function public.guard_username_reservation() set search_path = public;
alter function public.delete_my_account() set search_path = public;
alter function public.throttle_comments() set search_path = public;
alter function public.throttle_reports() set search_path = public;
alter function public.keepsakes_source_readable() set search_path = public;
alter function public.keepsakes_public() set search_path = public;
alter function public.story_keepsake_covered(uuid) set search_path = public;
alter function public.get_admin_metrics() set search_path = public;

-- =========================================================== R2-12
create index if not exists story_views_viewed_on_idx on public.story_views (viewed_on);
create index if not exists keepsakes_public_idx on public.keepsakes (published_at desc) where visibility = 'public' and status = 'active';
