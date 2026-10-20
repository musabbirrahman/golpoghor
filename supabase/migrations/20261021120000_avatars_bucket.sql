-- GolpoNeer V4-22: avatar uploads.
-- A PUBLIC 'avatars' bucket (profile pictures are public dressing, unlike
-- draft covers): anyone may read, owners may write only inside their own
-- <auth.uid()> folder — the same path-prefix rule as covers.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Moderators may remove abusive avatars.
create policy avatars_moderator_delete on storage.objects
  for delete using (
    bucket_id = 'avatars' and public.is_moderator()
  );
