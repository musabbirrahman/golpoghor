-- Perf: card-size (320px) thumbnails for story cards.
--
-- WHY: PageSpeed (mobile, 2026-11-12) flags "improve image delivery"
-- with ~1,103 KiB savings on the homepage: cards display covers at
-- ~144-156px wide on mobile but download the 440px thumbnail. A third,
-- 320px card-size derivation (`<uid>/thumb-xs-<file>`, JPEG q0.65)
-- cuts card image bytes by ~58% (measured: homepage thumbs 1,453 KiB
-- -> ~610 KiB; LCP file 47.8 KB -> ~19.9 KB). Heroes keep the 640px
-- derivation; the 440px derivation stays as the card fallback.
--
-- PRIVACY: this extends ONLY the Phase 2 insert gate
-- (`20261030180000_cover_thumbs_public.sql`, Argon-hardened, as extended
-- by `20261030190000_cover_thumbs_small.sql` and tightened by
-- `20261030230000_cover_folder_guard.sql`) with the SAME rules —
-- folder owner or moderator, AND the object must be the thumbnail of
-- a currently public story, AND the cover file must live in that
-- story author's own folder (the `20261030230000` folder-match guard,
-- preserved here — it stops one author pointing their public story at
-- another author's cover). The `thumb-xs-` derivation gets no new
-- privilege: it is gated by the identical story-public + folder checks,
-- so a draft thumbnail or an arbitrary image still cannot enter the
-- bucket. No UPDATE policy is added (uploads stay create-only,
-- 409 = already there), no SELECT policy is added (public URLs need
-- none; lingering files stay unenumerable), the private `covers`
-- bucket and all its policies are untouched (its owner-insert policy
-- is folder-only, so small private thumbnails need no change there),
-- and the delete policies are untouched.
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
        and (storage.foldername(s.cover_path))[1] = s.author_id::text
        and (
          name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-')
          or name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-sm-')
          or name = regexp_replace(s.cover_path, '^([^/]+)/', '\1/thumb-xs-')
        )
    )
  );
