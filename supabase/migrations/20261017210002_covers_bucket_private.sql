-- The covers bucket must NOT be public: public buckets serve files via
-- public URLs bypassing RLS entirely. With the bucket private, all reads
-- go through the RLS policies (covers_published_read for published
-- stories' covers, covers_owner_read for owners' draft previews).

update storage.buckets set public = false where id = 'covers';
