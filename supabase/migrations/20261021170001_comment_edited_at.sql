-- GolpoNeer V4-15: comment editing marker.
--
-- No new RLS policy is needed: the existing comments_owner_update policy
-- (20261016090001_rls.sql) already allows only the author to update, and
-- only while the comment is visible — which is exactly the edit rule.
-- This migration only adds the edited_at column that marks edited comments.
-- NOTE: structurally validated only — NOT executed against live Postgres here.

alter table public.comments add column if not exists edited_at timestamptz;
