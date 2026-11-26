begin;

create schema quozz_security;
revoke all on schema quozz_security from public, anon, authenticated;
grant usage on schema quozz_security to authenticated;

alter table public.sessions
  add column auth_session_id uuid unique,
  add column expires_at timestamptz;
-- Legacy rows remain visible as history and cannot authorize access.
create index quozz_sessions_user_recent_idx on public.sessions (user_id, last_seen desc);

drop policy profiles_self_register on public.profiles;
drop policy sessions_self_register on public.sessions;
drop policy sessions_self_heartbeat on public.sessions;

revoke insert, update, delete, truncate, references, trigger on public.profiles, public.sessions
  from public, anon, authenticated;
revoke insert (id, username, banned, created_at), update (id, username, banned, created_at)
  on public.profiles from public, anon, authenticated;
revoke insert (id, user_id, device, revoked, started_at, last_seen, auth_session_id, expires_at),
       update (id, user_id, device, revoked, started_at, last_seen, auth_session_id, expires_at)
  on public.sessions from public, anon, authenticated;
revoke update on public.system_config from public, anon, authenticated;
revoke update (id, maintenance, notice, updated_at) on public.system_config from public, anon, authenticated;

create table quozz_security.audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  action text not null,
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb
);
create table quozz_security.vip_keys (
  id uuid primary key default gen_random_uuid(),
  digest bytea not null unique,
  duration_days integer not null check (duration_days between 1 and 365),
  redeem_before timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  redeemed_by uuid,
  redeemed_at timestamptz,
  revoked_at timestamptz
);
create table quozz_security.entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create table quozz_security.redemption_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create table quozz_security.resources (
  slug text primary key,
  content jsonb not null
);
insert into quozz_security.resources values
  ('membership', '{"title":"QUOZZ Member Area","message":"Quyền truy cập khu vực thành viên đang hoạt động."}');

alter table quozz_security.audit enable row level security;
alter table quozz_security.vip_keys enable row level security;
alter table quozz_security.entitlements enable row level security;
alter table quozz_security.redemption_limits enable row level security;
alter table quozz_security.resources enable row level security;
revoke all on all tables in schema quozz_security from public, anon, authenticated;
revoke all on all sequences in schema quozz_security from public, anon, authenticated;

create function quozz_security.auth_session() returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from auth.sessions s
  where s.id = case
    when (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then (auth.jwt()->>'session_id')::uuid
  end
    and s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > statement_timestamp())
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
$$;

-- Keep the existing Admin login RPC and RLS predicates working.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select quozz_security.auth_session()) is not null
    and exists (select 1 from public.admins a where a.user_id = auth.uid())
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function quozz_security.require_admin() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
end
$$;

create function quozz_security.lock_profile(p_user uuid) returns void
language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = p_user and not banned for update;
  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_ACCESS_DENIED';
  end if;
end
$$;

create function quozz_security.active_session() returns uuid
language sql stable set search_path = ''
as $$
  select s.id from public.sessions s
  join public.profiles p on p.id = s.user_id
  where s.auth_session_id = (select quozz_security.auth_session())
    and s.user_id = auth.uid() and not p.banned and not s.revoked
    and s.expires_at > statement_timestamp()
    and s.last_seen > statement_timestamp() - interval '5 minutes'
$$;

create function quozz_security.register_session(p_device text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_auth uuid := quozz_security.auth_session();
  v_id uuid;
  v_expires timestamptz;
begin
  if v_auth is null then
    raise exception using errcode = '42501', message = 'AUTH_SESSION_REQUIRED';
  end if;
  if p_device is not null and char_length(p_device) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_DEVICE';
  end if;

  insert into public.profiles(id, username) values (v_user, null)
    on conflict (id) do nothing;
  perform quozz_security.lock_profile(v_user);

  insert into public.sessions(user_id, auth_session_id, device, expires_at)
    values (v_user, v_auth, nullif(btrim(p_device), ''), statement_timestamp() + interval '12 hours')
    on conflict (auth_session_id) do nothing;
  select s.id, s.expires_at into v_id, v_expires from public.sessions s
    where s.id = quozz_security.active_session();
  if v_id is null then
    raise exception using errcode = '42501', message = 'APP_SESSION_INACTIVE';
  end if;
  return jsonb_build_object('id', v_id, 'expires_at', v_expires, 'idle_timeout_seconds', 300);
end
$$;

create function quozz_security.heartbeat() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  perform quozz_security.lock_profile(auth.uid());
  select * into v_session from public.sessions where id = quozz_security.active_session() for update;
  if not found or v_session.revoked then
    raise exception using errcode = '42501', message = 'APP_SESSION_INACTIVE';
  end if;
  if v_session.last_seen <= statement_timestamp() - interval '15 seconds' then
    update public.sessions set last_seen = statement_timestamp()
      where id = v_session.id returning * into v_session;
  end if;
  return jsonb_build_object('id',v_session.id,'last_seen',v_session.last_seen,'expires_at',v_session.expires_at);
end
$$;

create function quozz_security.close_session() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_auth uuid := quozz_security.auth_session();
begin
  if v_auth is null then
    raise exception using errcode = '42501', message = 'AUTH_SESSION_REQUIRED';
  end if;
  -- Record a tombstone even when the Auth session had not registered yet.
  perform 1 from auth.users where id = auth.uid() for key share;
  insert into public.sessions (user_id,auth_session_id,revoked)
    values (auth.uid(),v_auth,true)
    on conflict (auth_session_id) do update set revoked = true
    where not public.sessions.revoked;
  return found;
end
$$;

create function quozz_security.get_resource(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_expiry timestamptz; v_content jsonb;
begin
  if quozz_security.active_session() is null then
    raise exception using errcode = '42501', message = 'APP_SESSION_INACTIVE';
  end if;
  if not exists (select 1 from public.system_config where id = 1 and not maintenance) then
    raise exception using errcode = '42501', message = 'MAINTENANCE';
  end if;
  select expires_at into v_expiry from quozz_security.entitlements where user_id = auth.uid();
  if v_expiry is null or v_expiry <= statement_timestamp() then
    raise exception using errcode = '42501', message = 'VIP_REQUIRED';
  end if;
  select content into v_content from quozz_security.resources where slug = p_slug;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESOURCE_NOT_FOUND';
  end if;
  return jsonb_build_object('content',v_content,'vip_expires_at',v_expiry);
end
$$;

create function quozz_security.kick(p_session_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform quozz_security.require_admin();
  update public.sessions set revoked = true where id = p_session_id and not revoked;
  if not found then return false; end if;
  insert into quozz_security.audit(actor_id,action,target_id)
    values (auth.uid(),'session.kick',p_session_id);
  return true;
end
$$;

create function quozz_security.set_ban(p_user_id uuid, p_banned boolean) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_revoked integer := 0;
begin
  perform quozz_security.require_admin();
  if p_user_id is null or p_banned is null then
    raise exception using errcode = '22023', message = 'INVALID_BAN_REQUEST';
  end if;
  if exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception using errcode = '42501', message = 'ADMIN_TARGET_FORBIDDEN';
  end if;
  update public.profiles set banned = p_banned
    where id = p_user_id and banned is distinct from p_banned;
  if not found then return false; end if;
  if p_banned then
    update public.sessions set revoked = true where user_id = p_user_id and not revoked;
    get diagnostics v_revoked = row_count;
  end if;
  insert into quozz_security.audit(actor_id,action,target_id,details)
    values (auth.uid(),case when p_banned then 'user.ban' else 'user.unban' end,
      p_user_id,jsonb_build_object('revoked_sessions',v_revoked));
  return true;
end
$$;

create function quozz_security.set_system(p_maintenance boolean, p_notice text,
  p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.system_config%rowtype;
begin
  perform quozz_security.require_admin();
  if p_maintenance is null or p_notice is null or char_length(p_notice) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_SYSTEM_SETTINGS';
  end if;
  update public.system_config
    set maintenance = p_maintenance, notice = p_notice, updated_at = clock_timestamp()
    where id = 1 and updated_at is not distinct from p_expected_updated_at
    returning * into v_row;
  if not found then
    raise exception using errcode = '40001', message = 'SYSTEM_SETTINGS_CHANGED';
  end if;
  insert into quozz_security.audit(actor_id,action,target_id,details)
    values (auth.uid(),'system.update',auth.uid(),jsonb_build_object('maintenance',p_maintenance));
  return to_jsonb(v_row);
end
$$;

create function quozz_security.issue_key(p_duration_days integer, p_redeem_before timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := 'qv32_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  perform quozz_security.require_admin();
  if p_duration_days is null or p_duration_days not between 1 and 365
    or p_redeem_before is null or p_redeem_before <= statement_timestamp()
    or p_redeem_before > statement_timestamp() + interval '365 days' then
    raise exception using errcode = '22023', message = 'INVALID_VIP_TERMS';
  end if;
  insert into quozz_security.vip_keys(digest,duration_days,redeem_before)
    values (sha256(convert_to(v_key,'UTF8')),p_duration_days,p_redeem_before) returning id into v_id;
  insert into quozz_security.audit(actor_id,action,target_id,details)
    values (auth.uid(),'vip.issue',v_id,jsonb_build_object('duration_days',p_duration_days,'redeem_before',p_redeem_before));
  return jsonb_build_object('id',v_id,'key',v_key,'redeem_before',p_redeem_before,'duration_days',p_duration_days);
end
$$;

create function quozz_security.revoke_key(p_key_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform quozz_security.require_admin();
  update quozz_security.vip_keys set revoked_at = clock_timestamp()
    where id = p_key_id and revoked_at is null and redeemed_at is null;
  if not found then return false; end if;
  insert into quozz_security.audit(actor_id,action,target_id)
    values (auth.uid(),'vip.revoke',p_key_id);
  return true;
end
$$;

create function quozz_security.redeem_key(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_attempts integer; v_days integer; v_expiry timestamptz; v_key_id uuid; v_session uuid;
begin
  perform quozz_security.lock_profile(auth.uid());
  select id into v_session from public.sessions
    where id = quozz_security.active_session() and not revoked for update;
  if not found then
    raise exception using errcode = '42501', message = 'APP_SESSION_INACTIVE';
  end if;
  insert into quozz_security.redemption_limits as limits(user_id,window_started_at,attempts)
    values (auth.uid(),statement_timestamp(),1)
    on conflict (user_id) do update set
      attempts = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
        then 1 else least(limits.attempts + 1, 6) end,
      window_started_at = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
        then statement_timestamp() else limits.window_started_at end
    returning attempts into v_attempts;
  if v_attempts > 5 then return jsonb_build_object('status','rate_limited'); end if;
  if p_key is null or char_length(p_key) <> 69 or p_key !~ '^qv32_[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  update quozz_security.vip_keys set redeemed_by = auth.uid(), redeemed_at = clock_timestamp()
    where digest = sha256(convert_to(p_key,'UTF8')) and redeemed_at is null
      and revoked_at is null and redeem_before > clock_timestamp()
    returning id,duration_days into v_key_id,v_days;
  if not found then return jsonb_build_object('status','invalid'); end if;
  insert into quozz_security.entitlements as entitlement(user_id,expires_at)
    values (auth.uid(),statement_timestamp() + make_interval(days => v_days))
    on conflict (user_id) do update
      set expires_at = greatest(entitlement.expires_at,statement_timestamp()) + make_interval(days => v_days)
    returning expires_at into v_expiry;
  insert into quozz_security.audit(actor_id,action,target_id)
    values (auth.uid(),'vip.redeem',v_key_id);
  return jsonb_build_object('status','redeemed','expires_at',v_expiry);
end
$$;

create function quozz_security.admin_data(p_kind text, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform quozz_security.require_admin();
  case p_kind
    when 'audit' then
      return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (
        select * from quozz_security.audit where p_before is null or id < p_before order by id desc limit 50
      ) a),'[]'::jsonb);
    when 'keys' then
      return coalesce((select jsonb_agg(to_jsonb(k) order by k.created_at desc, k.id) from (
        select id,duration_days,redeem_before,created_at,redeemed_at,revoked_at
          from quozz_security.vip_keys order by created_at desc,id limit 100
      ) k),'[]'::jsonb);
    when 'overview' then
      return jsonb_build_object(
        'users',(select count(*) from public.profiles),
        'banned',(select count(*) from public.profiles where banned),
        'sessions',(select count(*) from public.sessions),
        'online_users',(select count(distinct s.user_id) from public.sessions s
          join public.profiles p on p.id = s.user_id and not p.banned
          join auth.sessions a on a.id = s.auth_session_id and a.user_id = s.user_id
          where not s.revoked and s.expires_at > statement_timestamp()
            and s.last_seen > statement_timestamp() - interval '2 minutes'
            and (a.not_after is null or a.not_after > statement_timestamp())));
    when 'sessions' then
      return coalesce((select jsonb_agg(to_jsonb(s) order by s.last_seen desc nulls last,s.id) from (
        select s.id,s.user_id,s.device,s.revoked,s.started_at,s.last_seen,s.expires_at,
          case when s.revoked then 'revoked'
               when s.auth_session_id is null then 'legacy'
               when a.id is null or a.not_after <= statement_timestamp() then 'auth_ended'
               when p.banned then 'banned'
               when s.expires_at <= statement_timestamp()
                 or s.last_seen <= statement_timestamp() - interval '5 minutes' then 'expired'
               when s.last_seen > statement_timestamp() - interval '2 minutes' then 'online'
               else 'idle' end as status
          from public.sessions s
          left join auth.sessions a on a.id=s.auth_session_id and a.user_id=s.user_id
          left join public.profiles p on p.id=s.user_id
          order by s.last_seen desc nulls last,s.id limit 300
      ) s),'[]'::jsonb);
    when 'profiles' then
      return coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc nulls last,p.id) from (
        select p.id,p.username,p.banned,p.created_at,e.expires_at as vip_expires_at,
          (select max(s.last_seen) from public.sessions s where s.user_id=p.id and s.auth_session_id is not null) last_seen,
          exists(select 1 from public.admins a where a.user_id=p.id) as is_admin
        from public.profiles p left join quozz_security.entitlements e on e.user_id=p.id
        order by p.created_at desc nulls last,p.id limit 300
      ) p),'[]'::jsonb);
    else
      raise exception using errcode = '22023', message = 'INVALID_ADMIN_DATA_KIND';
  end case;
end
$$;

-- Public RPCs are SECURITY INVOKER. Implementations live outside PostgREST's exposed schemas.
create function public.quozz_register_session(p_device text default null) returns jsonb
language sql set search_path = '' as $$ select quozz_security.register_session(p_device) $$;
create function public.quozz_heartbeat() returns jsonb
language sql set search_path = '' as $$ select quozz_security.heartbeat() $$;
create function public.quozz_close_session() returns boolean
language sql set search_path = '' as $$ select quozz_security.close_session() $$;
create function public.quozz_get_resource(p_slug text) returns jsonb
language sql stable set search_path = '' as $$ select quozz_security.get_resource(p_slug) $$;
create function public.quozz_kick(p_session_id uuid) returns boolean
language sql set search_path = '' as $$ select quozz_security.kick(p_session_id) $$;
create function public.quozz_set_ban(p_user_id uuid,p_banned boolean) returns boolean
language sql set search_path = '' as $$ select quozz_security.set_ban(p_user_id,p_banned) $$;
create function public.quozz_set_system(p_maintenance boolean,p_notice text,p_expected_updated_at timestamptz) returns jsonb
language sql set search_path = '' as $$ select quozz_security.set_system(p_maintenance,p_notice,p_expected_updated_at) $$;
create function public.quozz_issue_key(p_duration_days integer,p_redeem_before timestamptz) returns jsonb
language sql set search_path = '' as $$ select quozz_security.issue_key(p_duration_days,p_redeem_before) $$;
create function public.quozz_revoke_key(p_key_id uuid) returns boolean
language sql set search_path = '' as $$ select quozz_security.revoke_key(p_key_id) $$;
create function public.quozz_redeem_key(p_key text) returns jsonb
language sql set search_path = '' as $$ select quozz_security.redeem_key(p_key) $$;
create function public.quozz_admin_data(p_kind text,p_before bigint default null) returns jsonb
language sql stable set search_path = '' as $$ select quozz_security.admin_data(p_kind,p_before) $$;

revoke execute on all functions in schema quozz_security from public, anon, authenticated;
grant execute on function
  quozz_security.register_session(text),quozz_security.heartbeat(),quozz_security.close_session(),
  quozz_security.get_resource(text),quozz_security.kick(uuid),quozz_security.set_ban(uuid,boolean),
  quozz_security.set_system(boolean,text,timestamptz),quozz_security.issue_key(integer,timestamptz),
  quozz_security.revoke_key(uuid),quozz_security.redeem_key(text),quozz_security.admin_data(text,bigint)
to authenticated;

revoke execute on function
  public.quozz_register_session(text),public.quozz_heartbeat(),public.quozz_close_session(),
  public.quozz_get_resource(text),public.quozz_kick(uuid),public.quozz_set_ban(uuid,boolean),
  public.quozz_set_system(boolean,text,timestamptz),public.quozz_issue_key(integer,timestamptz),
  public.quozz_revoke_key(uuid),public.quozz_redeem_key(text),public.quozz_admin_data(text,bigint)
from public, anon, authenticated;
grant execute on function
  public.quozz_register_session(text),public.quozz_heartbeat(),public.quozz_close_session(),
  public.quozz_get_resource(text),public.quozz_kick(uuid),public.quozz_set_ban(uuid,boolean),
  public.quozz_set_system(boolean,text,timestamptz),public.quozz_issue_key(integer,timestamptz),
  public.quozz_revoke_key(uuid),public.quozz_redeem_key(text),public.quozz_admin_data(text,bigint)
to authenticated;

notify pgrst,'reload schema';
commit;
