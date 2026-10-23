-- Featured stories: admin-picked homepage shelf, in admin-chosen order.
-- featured_position is null when not featured, otherwise 1-based display order.
-- No unique constraint: ordering is relative, so swaps and renumbers never collide.
alter table public.stories
  add column featured_position integer check (featured_position >= 1);

create index stories_featured_idx
  on public.stories (featured_position asc, published_at desc)
  where featured_position is not null;

-- Authors can update their own stories, so without this guard an author could
-- feature their own story. Only moderators/admins may change featured_position.
-- (Same pattern as the ownership guard in 20261016090001_rls.sql.)
create or replace function public.prevent_featured_self_service()
returns trigger language plpgsql as $$
begin
  if new.featured_position is distinct from old.featured_position
     and not public.is_moderator() then
    raise exception 'FEATURED_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists stories_featured_guard on public.stories;
create trigger stories_featured_guard before update on public.stories
  for each row execute function public.prevent_featured_self_service();
