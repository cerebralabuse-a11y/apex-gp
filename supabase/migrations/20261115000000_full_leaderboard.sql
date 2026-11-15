create or replace function public.apex_finish_attempt(p_user_id uuid, p_attempt_id uuid, p_recording_hash text,
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
    or (p_result ->> 'gates') is distinct from '14'
    or (p_result ->> 'crossings') is distinct from '16'
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
    'gates', 14, 'crossings', 16, 'final', p_result -> 'final');
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

create or replace function public.apex_leaderboard() returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('ruleset', 'verification-original-balanced-v1', 'trackId', 'palm-beach-3753-v2',
    'updatedAt', clock_timestamp(), 'entries', coalesce((
      select jsonb_agg(jsonb_build_object('rank', s.rank, 'driver', s.driver_name,
        'timeTicks', s.time_ticks, 'timeMs', round(s.time_ticks * 1000.0 / 120, 3),
        'recordedAt', s.recorded_at) order by s.time_ticks, s.recorded_at, s.user_id)
      from apex_private.standings s
    ), '[]'::jsonb));
$$;

