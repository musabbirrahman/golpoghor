-- Standalone keepsake saving: maker keepsakes have no source story.
--
-- Three changes, keepsakes table only:
--   1. story_id becomes nullable (the FK stays: NULL never violates
--      it, and a non-null story_id must still reference a real story).
--   2. The readable-source insert trigger lets story-less rows
--      through (otherwise every maker save would fail with
--      KEEPSAKE_SOURCE_NOT_FOUND).
--   3. publish_keepsake() refuses story-less rows explicitly (today
--      it already fails for them, but with a misleading message).
-- Deliberately unchanged: RLS (owner_id only), keepsakes_public()
-- (inner-joins stories, so a NULL-story row can never appear in the
-- public projection), and every CHECK on the table. Both re-created
-- functions keep the Round 2 hardening (security definer,
-- search_path = public); CREATE OR REPLACE preserves the Round 2
-- EXECUTE grants, so no grant statements are repeated here.

alter table public.keepsakes alter column story_id drop not null;

comment on column public.keepsakes.story_id is
  'NULL for standalone maker keepsakes (no source story).';

create or replace function public.keepsakes_source_readable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  src public.stories%rowtype;
begin
  if new.story_id is null then
    return new;
  end if;
  select * into src from public.stories where id = new.story_id;
  if not found then
    raise exception 'KEEPSAKE_SOURCE_NOT_FOUND: the source story does not exist.';
  end if;
  if public.story_is_public(src) or src.author_id = auth.uid() then
    return new;
  end if;
  raise exception 'KEEPSAKE_SOURCE_NOT_READABLE: the source story is not readable by you.';
end;
$$;

create or replace function public.publish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer set search_path = public as $$
declare
  k public.keepsakes%rowtype;
  src public.stories%rowtype;
  basis text;
  new_slug text;
  attempts int := 0;
begin
  select * into k from public.keepsakes where id = p_keepsake_id;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  if auth.uid() is null or k.owner_id is distinct from auth.uid() then
    raise exception 'KEEPSAKE_NOT_OWNER: only the owner can publish a keepsake.';
  end if;
  if k.story_id is null then
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NO_SOURCE: a standalone keepsake has no source story and cannot be published.';
  end if;
  select * into src from public.stories where id = k.story_id;
  if not found or not public.story_is_public(src) then
    raise exception 'KEEPSAKE_SOURCE_NOT_PUBLIC: the source story is not public.';
  end if;
  if k.owner_id = src.author_id and coalesce(src.origin_type, 'original') = 'original' then
    basis := 'own-story';
  elsif src.pd_verified then
    basis := 'public-domain';
  elsif src.origin_type = 'original' and public.story_keepsake_covered(src.id) then
    basis := 'licence';
  elsif src.origin_type = 'original' then
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NO_LICENCE: this story is not covered by a Keepsake Sharing Licence acceptance.';
  else
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NOT_VERIFIED: this text has no verified public-domain determination.';
  end if;
  perform set_config('app.keepsake_guard_bypass', 'on', true);
  if k.slug is null then
    loop
      attempts := attempts + 1;
      new_slug := 'k-' || substr(k.id::text, 1, 8);
      if attempts > 1 then
        new_slug := new_slug || '-' || substr(md5(random()::text), 1, 4);
      end if;
      begin
        update public.keepsakes set slug = new_slug where id = p_keepsake_id;
        exit;
      exception when unique_violation then
        if attempts >= 5 then raise; end if;
      end;
    end loop;
  end if;
  update public.keepsakes
    set visibility = 'public',
        published_at = now(),
        eligibility_basis = basis,
        updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;
