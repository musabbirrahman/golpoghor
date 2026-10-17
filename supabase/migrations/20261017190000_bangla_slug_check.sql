-- Allow Bangla letters (U+0980–U+09FF) in story and chapter slugs.
-- The app's slugify() keeps Bangla characters, but the original CHECK
-- constraints only allowed latin a-z0-9, so saving a Bangla-titled story
-- failed with PostgreSQL error 23514 (check_violation).
-- The regex matches the slugify() character class in src/lib/utils.ts.

alter table public.stories
  drop constraint if exists stories_slug_check;
alter table public.stories
  add constraint stories_slug_check
  check (slug ~ E'^[a-z0-9\u0980-\u09FF]+(?:-[a-z0-9\u0980-\u09FF]+)*$');

alter table public.chapters
  drop constraint if exists chapters_slug_check;
alter table public.chapters
  add constraint chapters_slug_check
  check (slug ~ E'^[a-z0-9\u0980-\u09FF]+(?:-[a-z0-9\u0980-\u09FF]+)*$');
