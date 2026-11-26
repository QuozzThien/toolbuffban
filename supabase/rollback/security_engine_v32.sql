-- Back up quozz_security and public.sessions before executing this rollback.
-- V3.2-only security data is removed. Existing profiles and session revocation flags are retained.
begin;

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
drop table quozz_security.audit,quozz_security.vip_keys,quozz_security.entitlements,
  quozz_security.redemption_limits,quozz_security.resources;
drop schema quozz_security;

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
