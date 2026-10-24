-- GolpoNeer: Argon Round 1 recheck fixes (N1 + R1-14).
--
-- N1: the Round 2 security migration narrowed the own-story keepsake
-- gate (publish_keepsake) to originals, but keepsakes_public() still
-- served a card whenever owner = story author OR the stored basis was
-- 'licence', with no origin_type check. An author could publish while
-- origin_type = 'original', then flip the story to 'translation' /
-- 'classic' / 'adaptation' — the card stayed public, bypassing the
-- Round 2 gate at read time. Flipping also hid <LicenceCard> (it only
-- renders for originals) while the licence row stayed active, with no
-- UI to withdraw it.
--
-- Fix (this migration):
--   1. keepsakes_public() now requires origin_type = 'original' (or
--      legacy NULL) on the owner and licence branches, matching the
--      publish gate. The pd_verified branch is unchanged.
--      Live impact: NONE — the 2 live public cards are both
--      verified-PD (pd_verified branch), not owner/licence cards.
--   2. A trigger withdraws a story's active licences the moment its
--      origin_type flips away from 'original', so a licence can never
--      sit active-but-hidden. (Flipping back to 'original' does NOT
--      silently reactivate it — the author re-accepts explicitly.)
--
-- R1-14: attachCounts fetched chapter/like ROWS and counted in JS,
-- subject to PostgREST's 1,000-row cap, and counted published chapters
-- only (draft stories showed 0 on the owner's dashboard).
-- Fix: story_counts() aggregates server-side (one call, no row ship,
-- no cap) with a published-only flag the caller sets.

-- ---------------------------------------------------------------- N1
-- keepsakes_public(): return type UNCHANGED (17 columns), so CREATE OR
-- REPLACE suffices (no DROP). search_path pinned (Round 2 §R2-8 rule).
create or replace function public.keepsakes_public()
returns table (
  id uuid,
  slug text,
  excerpt text,
  template text,
  echo text,
  source_title text,
  source_author_name text,
  source_original_author text,
  source_original_title text,
  source_translator_name text,
  source_adapter_name text,
  source_edition text,
  source_slug text,
  source_author_username text,
  keeper_name text,
  published_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select k.id, k.slug, k.excerpt, k.template,
    case when k.echo_public then k.echo else null end,
    k.source_title, k.source_author_name, k.source_original_author,
    k.source_original_title, k.source_translator_name, k.source_adapter_name,
    k.source_edition, s.slug, p.username, o.display_name, k.published_at, k.created_at
  from public.keepsakes k
  join public.stories s on s.id = k.story_id
  join public.profiles p on p.id = s.author_id
  join public.profiles o on o.id = k.owner_id
  where k.visibility = 'public'
    and k.status = 'active'
    and public.story_is_public(s)
    and (
      (k.owner_id = s.author_id and coalesce(s.origin_type, 'original') = 'original')
      or s.pd_verified
      or (coalesce(s.origin_type, 'original') = 'original' and k.eligibility_basis = 'licence')
    );
$$;

-- Withdraw active licences when a story stops being an original.
-- SECURITY DEFINER (system-maintained consistency, like a cascade) with
-- a pinned search_path; the trigger fires only on origin_type updates,
-- and the inner condition guards no-op updates.
create or replace function public.withdraw_licence_on_origin_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.origin_type, 'original') = 'original'
     and coalesce(new.origin_type, 'original') <> 'original' then
    update public.story_keepsake_licence
       set withdrawn_at = now()
     where story_id = new.id and withdrawn_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists stories_origin_change_withdraw_licence on public.stories;
create trigger stories_origin_change_withdraw_licence
  after update of origin_type on public.stories
  for each row execute function public.withdraw_licence_on_origin_change();

-- ------------------------------------------------------------- R1-14
-- Server-side per-story counts. INVOKER (default): RLS still applies,
-- so a caller only ever counts rows they can read (published chapters
-- for the public, own chapters for owners, all for moderators) — the
-- published-only flag cannot leak draft counts to strangers.
create or replace function public.story_counts(p_story_ids uuid[], p_published_only boolean default true)
returns table (
  story_id uuid,
  chapter_count bigint,
  word_count bigint,
  like_count bigint
)
language sql stable set search_path = public as $$
  select s.id,
    (select count(*) from public.chapters c
      where c.story_id = s.id
        and (not p_published_only or c.status = 'published')),
    (select coalesce(sum(c.word_count), 0) from public.chapters c
      where c.story_id = s.id
        and (not p_published_only or c.status = 'published')),
    (select count(*) from public.likes l where l.story_id = s.id)
  from public.stories s
  where s.id = any(p_story_ids);
$$;
