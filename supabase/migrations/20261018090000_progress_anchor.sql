-- Exact reading-position restore: store a content-block anchor alongside the
-- whole-document scroll ratio. block_index is the index of the topmost visible
-- rendered block inside the chapter body, block_offset the fraction of the way
-- through that block (0..1). The scroll_ratio stays as a fallback.
alter table public.reading_progress
  add column block_index integer,
  add column block_offset double precision check (block_offset between 0 and 1);
