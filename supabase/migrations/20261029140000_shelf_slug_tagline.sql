-- Shelf pages (Phase 3b follow-up): shareable shelf URLs + taglines.
-- slug is the public URL key (/shelves/<slug>), generated from the name and
-- never changed on rename, so shared links never break. Existing rows are
-- backfilled from their names; the backfill assumes no two existing names
-- slugify to the same value (true for the one live shelf) — a collision
-- fails loudly on the unique index instead of silently renaming a shelf.
-- No RLS change: the 3b policies already cover these columns.
alter table public.shelves add column slug text;
alter table public.shelves add column tagline text check (tagline is null or char_length(tagline) <= 160);

update public.shelves
  set slug = regexp_replace(
    regexp_replace(lower(btrim(name)), '''', '', 'g'),
    '[^a-z0-9]+', '-', 'g');
update public.shelves
  set slug = regexp_replace(slug, '^-+|-+$', '', 'g')
  where slug like '-%' or slug like '%-';
update public.shelves
  set slug = 'shelf-' || substr(id::text, 1, 8)
  where slug is null or slug = '';

alter table public.shelves alter column slug set not null;
create unique index shelves_slug_idx on public.shelves (slug);
