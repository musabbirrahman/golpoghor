-- Perf: card-size (440px) thumbnails for story cards.
--
-- WHY: PageSpeed (mobile, post-Phase-2 backfill, 2026-10-30) flags
-- "improve image delivery" with ~1,259 KB savings on a 1,542 KB
-- homepage: cards display covers at ~100-280px wide but download the
-- 640px thumbnail. A second, 440px card-size derivation
-- (`<uid>/thumb-sm-<file>`) cuts card image bytes roughly in half;
-- heroes keep the 640px derivation (they display up to 220px wide,
-- and 640px stays crisp on 3x screens).
--
-- PRIVACY: this extends ONLY the Phase 2 insert gate
-- (`20261030180000_cover_thumbs_public.sql`, Argon-hardened) with the
-- SAME rules — folder owner or moderator, AND the object must be the
-- thumbnail of a currently public story. The `thumb-sm-` derivation
-- gets no new privilege: it is gated by the identical story-public
-- check, so a draft thumbnail or an arbitrary image still cannot
-- enter the bucket. No UPDATE policy is added (uploads stay
-- create-only, 409 = already there), no SELECT policy is added
-- (public URLs need none; lingering files stay unenumerable), the
-- private `covers` bucket and all its policies are untouched (its
-- owner-insert policy is folder-only, so small private thumbnails
-- need no change there), and the delete policies are untouched.
-- The drop + recreate runs as one migration: any insert attempted
-- in between fails CLOSED (denied), never open, and the app retries
-- via its normal backfill path.

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
        and (
          name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-')
          or name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-sm-')
        )
    )
  );
