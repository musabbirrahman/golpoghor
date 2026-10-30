-- Argon follow-up (2026-10-30): folder-match guard on cover policies.
--
-- WHY: a story author fully controls their own story's cover_path via
-- direct PostgREST (stories_owner_all allows updating any own column),
-- so a policy that trusts "some public story references this file" is
-- only sound if the file also lives in that story author's own folder.
-- Without the folder match, one author could point their public story
-- at another author's cover file: the file then becomes signable by
-- anyone (covers_published_read is satisfied by the attacker's own
-- public story), and a moderator viewing the attacker's card would
-- backfill its thumbnail into the public cover-thumbs bucket.
-- Legitimate covers are always written by uploadCover into the
-- uploader's own <auth.uid()>/ folder, so the folder match rejects
-- nothing legitimate.
--
-- Both policies are dropped and recreated. Between the drop and the
-- recreate, the affected operation fails CLOSED (RLS default-deny):
-- cover-thumbs inserts are denied outright, and non-owner reads of
-- public covers are denied (owners keep their own-folder read policy
-- throughout). Before applying, sanity-check live data first:
--   select count(*) from stories
--   where cover_path is not null
--     and split_part(cover_path, '/', 1) <> author_id::text;
-- Expect 0. If nonzero, STOP and report — a legitimate story would
-- break under the new policies.

-- 1. Public thumbnails insert gate (from
-- 20261030190000_cover_thumbs_small.sql, plus the folder-match line).
drop policy if exists cover_thumbs_owner_insert on storage.objects;

create policy cover_thumbs_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'cover-thumbs'
    and auth.role() = 'authenticated'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator()
    )
    and exists (
      select 1 from public.stories s
      where public.story_is_public(s)
        and (storage.foldername(s.cover_path))[1] = s.author_id::text
        and (
          name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-')
          or name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-sm-')
        )
    )
  );

-- 2. Published-cover read gate (from
-- 20261017210001_cover_privacy.sql, plus the folder-match line).
drop policy if exists covers_published_read on storage.objects;

create policy covers_published_read on storage.objects
  for select using (
    bucket_id = 'covers'
    and exists (
      select 1
      from public.stories s
      where s.cover_path = storage.objects.name
        and public.story_is_public(s)
        and (storage.foldername(s.cover_path))[1] = s.author_id::text
    )
  );
