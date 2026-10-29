-- Finished stories (Library "Finished" shelf): a manual per-reader mark.
-- One row per (reader, story). Private by construction: the only policy
-- is owner-only, so no reader can see, add, or remove another's marks.
-- Deleting a profile or a story cascades its rows away.
create table public.finished_stories (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  story_id    uuid not null references public.stories (id) on delete cascade,
  finished_at timestamptz not null default now(),
  constraint finished_stories_pkey primary key (user_id, story_id)
);

create index finished_stories_user_idx on public.finished_stories (user_id, finished_at desc);

alter table public.finished_stories enable row level security;

create policy finished_stories_owner_all on public.finished_stories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
