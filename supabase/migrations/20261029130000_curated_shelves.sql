-- Curated shelves (Discover Phase 3b): moderator-picked shelf collections.
-- A shelf is a named, ordered list of stories; its layout is 'horizontal'
-- (cover strip) or 'vertical' (cover-left list, the Phase 2 template).
-- Positions are relative (no unique constraint), so swaps and renumbers
-- never collide — same rationale as stories.featured_position.
create table public.shelves (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  layout text not null default 'horizontal' check (layout in ('horizontal', 'vertical')),
  position integer not null check (position >= 1),
  created_at timestamptz not null default now()
);

create table public.shelf_items (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references public.shelves (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  position integer not null check (position >= 1),
  created_at timestamptz not null default now(),
  unique (shelf_id, story_id)
);

create index shelves_position_idx on public.shelves (position asc);
create index shelf_items_shelf_idx on public.shelf_items (shelf_id, position asc);

alter table public.shelves enable row level security;
alter table public.shelf_items enable row level security;

-- Public read: shelves are a browsing surface. Items are readable only
-- when their story is public, so drafts and hidden stories never leak
-- through a shelf, even though item rows carry no story content.
create policy shelves_public_read on public.shelves for select using (true);
create policy shelf_items_public_read on public.shelf_items for select using (
  exists (select 1 from public.stories s where s.id = story_id and s.status in ('ongoing', 'complete'))
);

-- Moderator-only writes. These tables hold no author-owned rows, so RLS
-- alone gates writes — no trigger needed (unlike stories.featured_position,
-- where authors can update their own rows).
create policy shelves_moderator_write on public.shelves for all using (public.is_moderator()) with check (public.is_moderator());
create policy shelf_items_moderator_write on public.shelf_items for all using (public.is_moderator()) with check (public.is_moderator());
