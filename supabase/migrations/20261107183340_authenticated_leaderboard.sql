-- Beta timing records. Browser roles cannot read or write these tables or RPCs.
-- Only the verifier backend's service_role may call these SECURITY INVOKER RPCs.
create schema apex_private;
revoke all on schema apex_private from public, anon, authenticated;
grant usage on schema apex_private to service_role;

create table apex_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  driver_name text not null check (driver_name ~ '^[A-Za-z0-9_-]{3,20}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index apex_profiles_driver_name on apex_private.profiles (lower(driver_name));

create table apex_private.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references apex_private.profiles(user_id) on delete cascade,
  ruleset text not null check (ruleset = 'verification-original-balanced-v1'),
  track_id text not null check (track_id = 'palm-beach-3753-v2'),
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'checking', 'accepted', 'rejected', 'cancelled')),
  claimed_at timestamptz,
  recording_hash text check (recording_hash ~ '^[0-9a-f]{64}$'),
  total_ticks integer check (total_ticks between 1 and 57600),
  receipt jsonb,
  check (expires_at > started_at)
);
create index apex_attempts_user_started on apex_private.attempts (user_id, started_at desc);

create table apex_private.laps (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references apex_private.attempts(id) on delete cascade,
  user_id uuid not null references apex_private.profiles(user_id) on delete cascade,
  ruleset text not null check (ruleset = 'verification-original-balanced-v1'),
  recording_hash text not null check (recording_hash ~ '^[0-9a-f]{64}$'),
  time_ticks integer not null check (time_ticks between 1 and 57599),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (ruleset, recording_hash)
);
create index apex_laps_personal_best on apex_private.laps (user_id, ruleset, time_ticks, recorded_at, id);

alter table apex_private.profiles enable row level security;
alter table apex_private.attempts enable row level security;
alter table apex_private.laps enable row level security;
revoke all on apex_private.profiles, apex_private.attempts, apex_private.laps from public, anon, authenticated;
grant select, insert, update on apex_private.profiles, apex_private.attempts to service_role;
grant select, insert on apex_private.laps to service_role;

-- ponytail: derive best laps at read time for the beta; maintain a best-laps
-- table only if measured record counts make this indexed query expensive.
create view apex_private.standings with (security_invoker = true) as
  with best as (
    select distinct on (l.user_id) l.user_id, l.time_ticks, l.recorded_at
    from apex_private.laps l
    where l.ruleset = 'verification-original-balanced-v1'
    order by l.user_id, l.time_ticks, l.recorded_at, l.id
  )
  select best.user_id, p.driver_name, best.time_ticks, best.recorded_at,
    rank() over (order by best.time_ticks) as rank
  from best join apex_private.profiles p using (user_id);
revoke all on apex_private.standings from public, anon, authenticated;
grant select on apex_private.standings to service_role;

create function public.apex_profile_get(p_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('driverName', p.driver_name) from apex_private.profiles p where p.user_id = p_user_id),
    'best', (select jsonb_build_object('rank', s.rank, 'timeTicks', s.time_ticks,
      'timeMs', round(s.time_ticks * 1000.0 / 120, 3), 'recordedAt', s.recorded_at)
      from apex_private.standings s where s.user_id = p_user_id)
  );
$$;

create function public.apex_profile_set(p_user_id uuid, p_driver_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_driver_name is null or p_driver_name !~ '^[A-Za-z0-9_-]{3,20}$' then
    raise exception using errcode = 'P0001', message = 'invalid_driver_name';
  end if;
  insert into apex_private.profiles (user_id, driver_name) values (p_user_id, p_driver_name)
    on conflict (user_id) do update set driver_name = excluded.driver_name, updated_at = clock_timestamp();
  return jsonb_build_object('driverName', p_driver_name);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'name_taken';
end;
$$;

create function public.apex_begin_attempt(p_user_id uuid, p_ruleset text, p_track_id text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt apex_private.attempts;
begin
  if p_ruleset is distinct from 'verification-original-balanced-v1' or p_track_id is distinct from 'palm-beach-3753-v2' then
    raise exception using errcode = 'P0001', message = 'unsupported_ruleset';
  end if;
  -- Serialize starts per driver so concurrent requests cannot bypass the limit.
  perform 1 from apex_private.profiles where user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'profile_required'; end if;
  if exists (select 1 from apex_private.attempts where user_id = p_user_id and started_at > v_now - interval '10 seconds')
    or (select count(*) from apex_private.attempts where user_id = p_user_id and started_at > v_now - interval '1 hour') >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  update apex_private.attempts set state = 'cancelled' where user_id = p_user_id and state = 'pending';
  insert into apex_private.attempts (user_id, ruleset, track_id, started_at, expires_at)
    values (p_user_id, p_ruleset, p_track_id, v_now, v_now + interval '10 minutes') returning * into v_attempt;
  return jsonb_build_object('attemptId', v_attempt.id, 'startedAt', v_attempt.started_at,
    'expiresAt', v_attempt.expires_at, 'ruleset', v_attempt.ruleset, 'trackId', v_attempt.track_id);
end;
$$;

create function public.apex_claim_attempt(p_user_id uuid, p_attempt_id uuid, p_recording_hash text, p_total_ticks integer) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt apex_private.attempts;
  v_now timestamptz := clock_timestamp();
begin
  if p_recording_hash is null or p_recording_hash !~ '^[0-9a-f]{64}$' or p_total_ticks is null or p_total_ticks not between 1 and 57600 then
    raise exception using errcode = 'P0001', message = 'invalid_recording';
  end if;
  select * into v_attempt from apex_private.attempts where id = p_attempt_id and user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'attempt_not_found'; end if;
  if v_attempt.state = 'accepted' and v_attempt.recording_hash = p_recording_hash and v_attempt.total_ticks = p_total_ticks then
    return jsonb_build_object('state', 'accepted', 'receipt', v_attempt.receipt);
  end if;
  if v_attempt.state not in ('pending', 'checking') or
    (v_attempt.recording_hash is not null and (v_attempt.recording_hash <> p_recording_hash or v_attempt.total_ticks <> p_total_ticks)) then
    raise exception using errcode = 'P0001', message = 'attempt_used';
  end if;
  if v_attempt.expires_at <= v_now then raise exception using errcode = 'P0001', message = 'attempt_expired'; end if;
  if v_attempt.state = 'checking' and v_attempt.claimed_at > v_now - interval '60 seconds' then
    raise exception using errcode = 'P0001', message = 'attempt_in_progress';
  end if;
  if extract(epoch from v_now - v_attempt.started_at) < p_total_ticks / 120.0 - 2 then
    raise exception using errcode = 'P0001', message = 'attempt_too_early';
  end if;
  update apex_private.attempts set state = 'checking', recording_hash = p_recording_hash,
    total_ticks = p_total_ticks, claimed_at = v_now where id = p_attempt_id;
  return jsonb_build_object('state', 'claimed');
end;
$$;

create function public.apex_finish_attempt(p_user_id uuid, p_attempt_id uuid, p_recording_hash text,
  p_result jsonb, p_rejection text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt apex_private.attempts;
  v_ticks integer;
  v_total integer;
  v_previous integer;
  v_result jsonb;
  v_receipt jsonb;
  v_field text;
begin
  -- Match begin_attempt's lock order: profile, then attempt. This also
  -- serializes finishes for one driver and its personal-best comparison.
  perform 1 from apex_private.profiles where user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'attempt_not_found'; end if;
  select * into v_attempt from apex_private.attempts where id = p_attempt_id and user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'attempt_not_found'; end if;
  if v_attempt.recording_hash is distinct from p_recording_hash then
    raise exception using errcode = 'P0001', message = 'attempt_used';
  end if;
  if v_attempt.state in ('accepted', 'rejected') then return v_attempt.receipt; end if;
  if v_attempt.state <> 'checking' then raise exception using errcode = 'P0001', message = 'attempt_used'; end if;
  if p_result is null then
    v_receipt := jsonb_build_object('saved', false, 'rejected', true,
      'reason', left(coalesce(p_rejection, 'invalid_recording'), 100), 'prizeEligible', false);
    update apex_private.attempts set state = 'rejected', receipt = v_receipt where id = p_attempt_id;
    return v_receipt;
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text) > 2048
    or (p_result ->> 'ruleset') is distinct from v_attempt.ruleset
    or (p_result ->> 'trackId') is distinct from v_attempt.track_id
    or coalesce(p_result ->> 'timeTicks', '') !~ '^[0-9]{1,5}$'
    or coalesce(p_result ->> 'totalTicks', '') !~ '^[0-9]{1,5}$'
    or (p_result ->> 'gates') is distinct from '28'
    or (p_result ->> 'crossings') is distinct from '31'
    or jsonb_typeof(p_result -> 'final') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_result';
  end if;
  v_ticks := (p_result ->> 'timeTicks')::integer;
  v_total := (p_result ->> 'totalTicks')::integer;
  if v_ticks < 1 or v_ticks >= v_total or v_total <> v_attempt.total_ticks then
    raise exception using errcode = 'P0001', message = 'invalid_result';
  end if;
  foreach v_field in array array['x', 'z', 'yaw', 'speed', 'energy'] loop
    if jsonb_typeof(p_result -> 'final' -> v_field) is distinct from 'number'
      or abs((p_result -> 'final' ->> v_field)::numeric) > 1000000 then
      raise exception using errcode = 'P0001', message = 'invalid_result';
    end if;
  end loop;
  v_result := jsonb_build_object('ruleset', v_attempt.ruleset, 'trackId', v_attempt.track_id,
    'timeTicks', v_ticks, 'timeMs', round(v_ticks * 1000.0 / 120, 3), 'totalTicks', v_total,
    'gates', 28, 'crossings', 31, 'final', p_result -> 'final');
  select min(time_ticks) into v_previous from apex_private.laps where user_id = p_user_id and ruleset = v_attempt.ruleset;
  begin
    insert into apex_private.laps (attempt_id, user_id, ruleset, recording_hash, time_ticks)
      values (p_attempt_id, p_user_id, v_attempt.ruleset, p_recording_hash, v_ticks);
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'replay_duplicate';
  end;
  v_receipt := jsonb_build_object('saved', true, 'personalBest', v_previous is null or v_ticks < v_previous,
    'result', v_result, 'prizeEligible', false);
  update apex_private.attempts set state = 'accepted', receipt = v_receipt where id = p_attempt_id;
  return v_receipt;
end;
$$;

create function public.apex_leaderboard() returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('ruleset', 'verification-original-balanced-v1', 'trackId', 'palm-beach-3753-v2',
    'updatedAt', clock_timestamp(), 'entries', coalesce((
      select jsonb_agg(jsonb_build_object('rank', s.rank, 'driver', s.driver_name,
        'timeTicks', s.time_ticks, 'timeMs', round(s.time_ticks * 1000.0 / 120, 3),
        'recordedAt', s.recorded_at) order by s.time_ticks, s.recorded_at, s.user_id)
      from (select * from apex_private.standings order by time_ticks, recorded_at, user_id limit 50) s
    ), '[]'::jsonb));
$$;

revoke all on function public.apex_profile_get(uuid), public.apex_profile_set(uuid, text),
  public.apex_begin_attempt(uuid, text, text), public.apex_claim_attempt(uuid, uuid, text, integer),
  public.apex_finish_attempt(uuid, uuid, text, jsonb, text), public.apex_leaderboard()
  from public, anon, authenticated;
grant execute on function public.apex_profile_get(uuid), public.apex_profile_set(uuid, text),
  public.apex_begin_attempt(uuid, text, text), public.apex_claim_attempt(uuid, uuid, text, integer),
  public.apex_finish_attempt(uuid, uuid, text, jsonb, text), public.apex_leaderboard()
  to service_role;
