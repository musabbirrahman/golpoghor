-- Scale Phase 2: a PUBLIC 'cover-thumbs' bucket for story-cover thumbnails.
--
-- WHY: thumbnails are the site's most-served bytes (every card, every
-- hero, every list). Today they live in the private 'covers' bucket and
-- are served by signed URLs, which bypass the CDN: every view costs
-- origin egress (7.681 / 5 GB, 154%, with 34 MAU). A public bucket serves
-- the same bytes through Supabase's CDN (cached-egress quota, currently
-- 4% used), so repeat views of the same 18 covers stop costing origin
-- egress. That is what makes hundreds of active users viable.
--
-- PRIVACY, READ FIRST: this deliberately does NOT reopen the
-- 2026-10-17 draft-cover decision (20261017210001_cover_privacy.sql).
-- Public-bucket URLs bypass RLS by design, so this bucket can NEVER
-- enforce "only while public" at the storage layer for READS. The
-- enforcement that remains is split:
--   * WRITES are DB-enforced (see cover_thumbs_owner_insert below):
--     a row can only be inserted when it is the thumbnail of a
--     currently public story (or by a moderator, for backfill).
--     INSERT into a public bucket does NOT bypass RLS, so even a buggy
--     or malicious client cannot upload a draft thumbnail or use this
--     bucket as a free image host.
--   * READS via public URL bypass RLS by design — that is the point
--     (CDN caching). So generation gating (only public stories' thumbs
--     are ever written) + cleanup on hide/delete (app code) are the
--     enforcement for reads. Thumbnails are ≤640px JPEG derivatives of
--     covers that were already public; originals stay private.
--   * NO public-read SELECT policy exists on purpose (Argon Q2): a
--     SELECT policy would let anyone `.list('<uid>')` lingering
--     hidden/deleted thumbnail filenames. Public `<img>` URLs work
--     without any SELECT policy, so lingering files are reachable
--     only by their exact random path, never enumerable.
-- The private 'covers' bucket and all of its policies are UNTOUCHED:
-- originals stay private, and the signed-URL fallback chain stays in
-- place for any thumbnail not yet migrated here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cover-thumbs', 'cover-thumbs', true, 1048576, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owners may write only inside their own <auth.uid()> folder AND only
-- the thumbnail of a currently public story (Argon Q4 hardening);
-- moderators may write any public story's thumbnail (Argon Q3/Q5:
-- Day-1 backfill of the 16 existing covers without waiting for each
-- dormant author to log in). Uploads use { upsert: false } — there is
-- deliberately NO UPDATE policy, so an existing object can never be
-- overwritten (a 409 means "already there", treated as success).
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
        and name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-')
    )
  );

create policy cover_thumbs_owner_delete on storage.objects
  for delete using (
    bucket_id = 'cover-thumbs'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Moderators may remove abusive thumbnails.
create policy cover_thumbs_moderator_delete on storage.objects
  for delete using (
    bucket_id = 'cover-thumbs' and public.is_moderator()
  );
