-- GolpoGhor: let database superusers bootstrap the first admin.
--
-- prevent_role_escalation() blocked EVERYONE from changing profile roles,
-- including the postgres superuser and service_role in the SQL editor —
-- so the very first admin could never be created (chicken-and-egg).
-- RLS is already bypassed by these roles; the trigger now matches that:
-- app users (anon/authenticated JWTs) still cannot escalate roles, but
-- postgres / service_role may, which is the documented bootstrap path.
--
-- Verified on PostgreSQL 16 (2026-10-16).

create or replace function public.prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Only admins may change profile roles.';
  end if;
  return new;
end $$;
