-- R2-11 follow-up (Argon-verified 2026-10-24): the avatars bucket had
-- owner insert/update/delete policies but NO select policy, so Storage
-- list() AND remove() silently matched 0 rows for authenticated users
-- (Supabase remove() requires delete + select permissions on
-- storage.objects). This single policy mirrors covers_owner_read and
-- makes deleteAccount()'s covers+avatars cleanup actually see and
-- delete the user's avatar files. Avatars are public by design, so
-- granting owners select on their own folder is no privacy regression.

create policy avatars_owner_read on storage.objects
  for select using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
