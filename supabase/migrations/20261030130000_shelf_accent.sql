-- Per-shelf accent color for curated shelves (icon + rule), chosen by the
-- moderator in the admin Shelves tab. Existing shelves keep gold, the
-- look they already have. The key is a display token only — the hex
-- lives in the app's shelf palette — so no color value ever reaches
-- the database, and the public read policy already covering shelves
-- needs no change: an accent key leaks nothing about any account.
alter table public.shelves
  add column accent text not null default 'gold'
  check (accent in ('gold', 'river', 'clay', 'blue', 'purple'));
