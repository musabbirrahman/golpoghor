-- GolpoGhor schema: profiles, stories, chapters, follows, reading lists,
-- reading progress, likes, comments, reports, moderation audit trail.
-- Conventions: UUID primary keys, UTC timestamps, deliberate delete behavior.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  display_name text not null,
  bio         text not null default '',
  avatar_path text,
  locale      text not null default 'bn' check (locale in ('bn', 'en')),
  role        text not null default 'reader' check (role in ('reader', 'moderator', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,30}$')
);
create index profiles_username_idx on public.profiles (username);
create index profiles_role_idx on public.profiles (role) where role in ('moderator', 'admin');

-- ----------------------------------------------------------------- stories
create table public.stories (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  slug           text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary        text not null default '' check (char_length(summary) <= 2000),
  language       text not null check (language in ('bn', 'en')),
  genre          text not null default 'general' check (char_length(genre) between 1 and 60),
  tags           text[] not null default '{}',
  status         text not null default 'draft'
                 check (status in ('draft', 'ongoing', 'complete', 'hidden')),
  content_notice text not null default '',
  cover_path     text,
  view_count     bigint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint stories_author_slug_unique unique (author_id, slug)
);
create index stories_public_idx
  on public.stories (status, language, genre, published_at desc)
  where status in ('ongoing', 'complete');
create index stories_author_idx on public.stories (author_id, updated_at desc);
-- NOTE (2026-10-16): full-text GIN indexes over title/summary/tags were
-- removed here. to_tsvector('simple', ...) is STABLE and array_to_string()
-- is not IMMUTABLE, so Postgres rejects them in index expressions
-- (error 42P17) — verified against real PostgreSQL 16. The app searches
-- with ilike today, so nothing is lost; reintroduce FTS as a tested
-- migration if/when the app switches to tsvector search.

-- ---------------------------------------------------------------- chapters
create table public.chapters (
  id           uuid primary key default gen_random_uuid(),
  story_id     uuid not null references public.stories (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  slug         text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  body_json    jsonb not null default '{"type":"doc","content":[]}',
  body_text    text not null default '',
  position     integer not null check (position >= 0),
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'unpublished', 'hidden')),
  word_count   integer not null default 0 check (word_count >= 0),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chapters_story_slug_unique unique (story_id, slug),
  constraint chapters_story_position_unique unique (story_id, position)
);
create index chapters_story_idx on public.chapters (story_id, position);
create index chapters_published_idx
  on public.chapters (story_id, position)
  where status = 'published';
-- (Full-text GIN index removed — see the note on stories above.)

-- ----------------------------------------------------------------- follows
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint follows_pkey primary key (follower_id, author_id),
  constraint follows_no_self check (follower_id <> author_id)
);
create index follows_author_idx on public.follows (author_id);

-- ------------------------------------------------------------ reading list
create table public.reading_list (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  story_id   uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reading_list_pkey primary key (user_id, story_id)
);

-- --------------------------------------------------------- reading progress
create table public.reading_progress (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  story_id    uuid not null references public.stories (id) on delete cascade,
  chapter_id  uuid references public.chapters (id) on delete set null,
  scroll_ratio double precision not null default 0 check (scroll_ratio between 0 and 1),
  updated_at  timestamptz not null default now(),
  constraint reading_progress_pkey primary key (user_id, story_id)
);

-- ------------------------------------------------------------------- likes
create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  story_id   uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_pkey primary key (user_id, story_id)
);

-- ---------------------------------------------------------------- comments
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  status     text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_chapter_idx on public.comments (chapter_id, created_at);

-- ----------------------------------------------------------------- reports
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('story', 'chapter', 'comment', 'profile')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 120),
  details     text not null default '' check (char_length(details) <= 2000),
  status      text not null default 'open'
              check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index reports_queue_idx on public.reports (status, created_at) where status in ('open', 'in_review');
create index reports_target_idx on public.reports (target_type, target_id);

-- ------------------------------------------------------- moderation events
create table public.moderation_events (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles (id) on delete restrict,
  action       text not null check (char_length(action) between 1 and 60),
  target_type  text not null check (target_type in ('story', 'chapter', 'comment', 'profile')),
  target_id    uuid not null,
  details      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index moderation_events_target_idx on public.moderation_events (target_type, target_id, created_at desc);

-- ------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger stories_touch before update on public.stories
  for each row execute function public.touch_updated_at();
create trigger chapters_touch before update on public.chapters
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();
