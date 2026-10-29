-- Finished chapters: a per-reader mark for each chapter, automatic when
-- the reader scrolls to the end of a chapter, toggleable by hand in the
-- story page Contents list (for accidental scrolls). One row per
-- (reader, chapter). Private by construction: the only policy is
-- owner-only, so no reader can see, add, or remove another's marks.
-- Deleting a profile, a story, or a chapter cascades its rows away.
create table public.finished_chapters (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  story_id    uuid not null references public.stories (id) on delete cascade,
  chapter_id  uuid not null references public.chapters (id) on delete cascade,
  finished_at timestamptz not null default now(),
  constraint finished_chapters_pkey primary key (user_id, chapter_id)
);

create index finished_chapters_user_story_idx on public.finished_chapters (user_id, story_id);

alter table public.finished_chapters enable row level security;

create policy finished_chapters_owner_all on public.finished_chapters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- finished_stories gains an auto flag so the sync can tell its own rows
-- from the reader's manual mark: when every published chapter of a story
-- is finished, the client inserts an auto row; when a chapter is unmarked
-- again, only auto rows are removed — a manual story mark survives
-- chapter unmarks. Existing rows are manual (default false).
alter table public.finished_stories
  add column is_auto boolean not null default false;
