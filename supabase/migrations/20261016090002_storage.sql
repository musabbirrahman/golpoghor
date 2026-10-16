-- GolpoGhor storage: public covers bucket, private drafts bucket.
-- Ownership is enforced on the object path prefix: <auth.uid()>/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('drafts', 'drafts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------ covers
-- Public reads: cover art of published stories.
create policy covers_public_read on storage.objects
  for select using (bucket_id = 'covers');

-- Authors: upload/replace/delete only under their own folder.
create policy covers_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy covers_owner_update on storage.objects
  for update using (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy covers_owner_delete on storage.objects
  for delete using (
    bucket_id = 'covers'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Moderators may remove abusive cover art.
create policy covers_moderator_delete on storage.objects
  for delete using (
    bucket_id = 'covers' and public.is_moderator()
  );

-- ------------------------------------------------------------------ drafts
-- Private bucket: only the owning author may read/write their own folder,
-- via signed URLs. Never referenced from public pages.
create policy drafts_owner_read on storage.objects
  for select using (
    bucket_id = 'drafts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy drafts_owner_write on storage.objects
  for insert with check (
    bucket_id = 'drafts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy drafts_owner_update on storage.objects
  for update using (
    bucket_id = 'drafts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy drafts_owner_delete on storage.objects
  for delete using (
    bucket_id = 'drafts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
