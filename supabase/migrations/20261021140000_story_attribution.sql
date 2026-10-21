-- GolpoNeer V4-28: story attribution metadata.
--
-- A story can now say what it IS: the author's own original, a classic,
-- a translation, or an adaptation. origin_type drives conditional fields
-- in the story form (an original author sees none of the extra fields).
-- All attribution fields are nullable display metadata: an absent credit
-- renders as absent, never fabricated.
--
-- Display metadata is NOT rights evidence (plan §3 V4-28): the Classic/PD
-- label stays display-only, and rights_evidence_ref is an optional
-- owner-managed tracker reference for audit linkage — it is not
-- author-facing form data and is never rendered as a public legal claim.
--
-- Keepsake Sharing Licence acceptance storage (plan §3 V4-28, proposed
-- storage): a story is covered only while an unwithdrawn acceptance of
-- a licence version in force stands. This migration creates the table
-- only — coverage checks at publish/read time arrive with V4-27c, and
-- no behaviour changes here. No acceptance UI exists yet, so no story
-- is covered by default (including every story published before now).

alter table public.stories
  add column origin_type text
    check (origin_type in ('original', 'classic', 'translation', 'adaptation')),
  add column original_author text,
  add column original_title text,
  add column translator_name text,
  add column adapter_name text,
  add column edition_source text,
  add column publication_details text,
  add column rights_evidence_ref text;

create table public.story_keepsake_licence (
  id              uuid primary key default gen_random_uuid(),
  story_id        uuid not null references public.stories (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  licence_version text not null,
  accepted_at     timestamptz not null default now(),
  withdrawn_at    timestamptz
);
create index story_keepsake_licence_story_idx
  on public.story_keepsake_licence (story_id, accepted_at desc);

alter table public.story_keepsake_licence enable row level security;

-- Consent records belong to the accepting author only.
create policy story_keepsake_licence_author_select on public.story_keepsake_licence
  for select using (author_id = auth.uid());
create policy story_keepsake_licence_author_insert on public.story_keepsake_licence
  for insert with check (author_id = auth.uid());
create policy story_keepsake_licence_author_update on public.story_keepsake_licence
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
