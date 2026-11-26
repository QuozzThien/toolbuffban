-- Proposed retention rollback. Review and verify a backup before use.
-- V3.2 records stay in a restricted archive schema. This script restores V3.1 permissions.
begin;
set local lock_timeout = '5s';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop function public.quozz_register_session(text),public.quozz_heartbeat(),public.quozz_close_session(),
  public.quozz_get_resource(text),public.quozz_kick(uuid),public.quozz_set_ban(uuid,boolean),
  public.quozz_set_system(boolean,text,timestamptz),public.quozz_issue_key(integer,timestamptz),
  public.quozz_revoke_key(uuid),public.quozz_redeem_key(text),public.quozz_admin_data(text,bigint);

drop function quozz_security.admin_data(text,bigint),quozz_security.redeem_key(text),
  quozz_security.revoke_key(uuid),quozz_security.issue_key(integer,timestamptz),
  quozz_security.set_system(boolean,text,timestamptz),quozz_security.set_ban(uuid,boolean),
  quozz_security.kick(uuid),quozz_security.get_resource(text),quozz_security.close_session(),
  quozz_security.heartbeat(),quozz_security.register_session(text),quozz_security.active_session(),
  quozz_security.lock_profile(uuid),quozz_security.require_admin(),quozz_security.auth_session();
-- Preserve the V3.2 rows and the session bindings before removing the live schema.
create table quozz_security.session_binding_archive as
  select id as app_session_id, user_id, auth_session_id, expires_at
  from public.sessions where auth_session_id is not null;
alter table quozz_security.session_binding_archive enable row level security;
revoke all on all tables in schema quozz_security from public, anon, authenticated, service_role;
revoke all on all sequences in schema quozz_security from public, anon, authenticated, service_role;
revoke all on schema quozz_security from public, anon, authenticated, service_role;
do $archive$
declare
  archive_name text := 'quozz_security_archive_' || to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24MISSUS');
begin
  execute format('alter schema quozz_security rename to %I',archive_name);
end
$archive$;

drop index public.quozz_sessions_user_recent_idx;
alter table public.sessions drop column auth_session_id,drop column expires_at;

grant insert, update on public.profiles,public.sessions to authenticated;
grant update on public.system_config to authenticated;

create policy profiles_self_register on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and banned = false);
create policy sessions_self_register on public.sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.banned));
create policy sessions_self_heartbeat on public.sessions for update to authenticated
  using (user_id = (select auth.uid()) and revoked = false and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.banned))
  with check (user_id = (select auth.uid()) and revoked = false and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.banned));

notify pgrst,'reload schema';
commit;
