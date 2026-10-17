-- Draft covers become private.
-- Previously the covers bucket allowed public reads of every file, so a
-- draft story's cover was viewable by anyone who guessed its URL.
-- Now: a cover is publicly readable only while it is the cover of a
-- public (published) story. Owners can always read their own covers
-- (used for draft previews via signed URLs).

drop policy if exists covers_public_read on storage.objects;

create policy covers_published_read on storage.objects
  for select using (
    bucket_id = 'covers'
    and exists (
      select 1
      from public.stories s
      where s.cover_path = storage.objects.name
        and public.story_is_public(s)
    )
  );

create policy covers_owner_read on storage.objects
  for select using (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Index to keep the published-cover check fast.
create index if not exists stories_cover_path_idx
  on public.stories (cover_path) where cover_path is not null;
