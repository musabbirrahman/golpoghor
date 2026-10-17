-- ---------------------------------------------------------------------------
-- Create the public profile row the moment an auth user is created.
--
-- Why: signUp() with email confirmation enabled returns no session, so the
-- app-side ensureProfile() was skipped. The user could then confirm their
-- email and land on the site signed in but with NO profile row — the header
-- showed "?" and the account looked broken until they signed out and back
-- in (signIn ran ensureProfile). A database trigger fixes this at the
-- source: the profile exists before the confirmation email is even opened.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display  text;
begin
  -- Prefer the username chosen at signup (stored in user metadata).
  v_username := nullif(new.raw_user_meta_data->>'username', '');

  -- Fall back to a slug of the email local part.
  -- NOTE: lower() must wrap split_part() BEFORE regexp_replace, otherwise
  -- uppercase letters are stripped by the [^a-z0-9_] class instead of kept.
  if v_username is null and new.email is not null then
    v_username := left(
      nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'), ''),
      20
    );
  end if;

  -- Last resort: deterministic reader_ id.
  if v_username is null then
    v_username := 'reader_' || left(new.id::text, 8);
  end if;

  v_display := nullif(new.raw_user_meta_data->>'display_name', '');
  if v_display is null then
    v_display := v_username;
  end if;

  begin
    insert into public.profiles (id, username, display_name, locale, role)
    values (new.id, v_username, v_display, 'bn', 'reader');
  exception when unique_violation then
    -- Username raced with another signup: retry once with a suffix.
    -- (The id PK cannot collide here; only the username unique index can.)
    insert into public.profiles (id, username, display_name, locale, role)
    values (new.id, v_username || '_' || left(new.id::text, 4), v_display, 'bn', 'reader');
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
