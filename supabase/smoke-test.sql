-- Run as postgres after applying the migration. No emails are sent and every
-- test row is rolled back. A failed assertion aborts the transaction too.
begin;
set local statement_timeout = '10s';

do $$
declare
  v_one uuid := gen_random_uuid();
  v_two uuid := gen_random_uuid();
  v_function regprocedure;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
    values (v_one, 'authenticated', 'authenticated', 'apex-smoke-' || v_one || '@example.invalid', '', clock_timestamp(), clock_timestamp()),
      (v_two, 'authenticated', 'authenticated', 'apex-smoke-' || v_two || '@example.invalid', '', clock_timestamp(), clock_timestamp());
  perform set_config('apex_smoke.user_one', v_one::text, true);
  perform set_config('apex_smoke.user_two', v_two::text, true);
  foreach v_function in array array[
    'public.apex_profile_get(uuid)'::regprocedure,
    'public.apex_profile_set(uuid,text)'::regprocedure,
    'public.apex_begin_attempt(uuid,text,text)'::regprocedure,
    'public.apex_claim_attempt(uuid,uuid,text,integer)'::regprocedure,
    'public.apex_finish_attempt(uuid,uuid,text,jsonb,text)'::regprocedure,
    'public.apex_leaderboard()'::regprocedure
  ] loop
    assert not has_function_privilege('anon', v_function, 'execute'), 'anon RPC execution is exposed';
    assert not has_function_privilege('authenticated', v_function, 'execute'), 'authenticated RPC execution is exposed';
    assert has_function_privilege('service_role', v_function, 'execute'), 'backend RPC execution is missing';
  end loop;
  assert not has_schema_privilege('anon', 'apex_private', 'usage'), 'anon private schema access is exposed';
  assert not has_schema_privilege('authenticated', 'apex_private', 'usage'), 'authenticated private schema access is exposed';
  assert (select bool_and(relrowsecurity) from pg_class where relnamespace = 'apex_private'::regnamespace and relkind = 'r'), 'RLS is missing';
end;
$$;

set local role anon;
do $$
declare v_denied boolean := false;
begin
  begin perform public.apex_leaderboard(); exception when insufficient_privilege then v_denied := true; end;
  assert v_denied, 'anon called a backend-only RPC';
end;
$$;
reset role;

set local role authenticated;
do $$
declare v_denied boolean := false;
begin
  begin perform public.apex_leaderboard(); exception when insufficient_privilege then v_denied := true; end;
  assert v_denied, 'authenticated called a backend-only RPC';
end;
$$;
reset role;

set local role service_role;
do $$
declare
  v_one uuid := current_setting('apex_smoke.user_one')::uuid;
  v_two uuid := current_setting('apex_smoke.user_two')::uuid;
  v_ticket jsonb;
  v_denied boolean := false;
begin
  perform public.apex_profile_set(v_one, 'Smoke_' || left(replace(v_one::text, '-', ''), 12));
  perform public.apex_profile_set(v_two, 'Smoke_' || left(replace(v_two::text, '-', ''), 12));
  v_ticket := public.apex_begin_attempt(v_one, 'verification-original-balanced-v1', 'palm-beach-3753-v2');
  assert (v_ticket ->> 'ruleset') = 'verification-original-balanced-v1', 'wrong attempt ruleset';
  assert extract(epoch from (v_ticket ->> 'expiresAt')::timestamptz - (v_ticket ->> 'startedAt')::timestamptz) = 600, 'wrong attempt expiry';
  perform set_config('apex_smoke.attempt_one', v_ticket ->> 'attemptId', true);
  v_ticket := public.apex_begin_attempt(v_two, 'verification-original-balanced-v1', 'palm-beach-3753-v2');
  perform set_config('apex_smoke.attempt_two', v_ticket ->> 'attemptId', true);
  begin
    perform public.apex_claim_attempt(v_two, current_setting('apex_smoke.attempt_one')::uuid, repeat(replace(v_one::text, '-', ''), 2), 24000);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'attempt_not_found' then raise; end if;
    v_denied := true;
  end;
  assert v_denied, 'cross-driver attempt access was accepted';
  v_denied := false;
  begin
    perform public.apex_claim_attempt(v_one, current_setting('apex_smoke.attempt_one')::uuid, repeat(replace(v_one::text, '-', ''), 2), 24000);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'attempt_too_early' then raise; end if;
    v_denied := true;
  end;
  assert v_denied, 'accelerated recording upload was accepted';
end;
$$;
reset role;

-- Simulate elapsed real time without slowing down the smoke test.
update apex_private.attempts set started_at = clock_timestamp() - interval '210 seconds'
  where id in (current_setting('apex_smoke.attempt_one')::uuid, current_setting('apex_smoke.attempt_two')::uuid);

set local role service_role;
do $$
declare
  v_one uuid := current_setting('apex_smoke.user_one')::uuid;
  v_two uuid := current_setting('apex_smoke.user_two')::uuid;
  v_first uuid := current_setting('apex_smoke.attempt_one')::uuid;
  v_second uuid := current_setting('apex_smoke.attempt_two')::uuid;
  v_hash_one text := repeat(replace(v_one::text, '-', ''), 2);
  v_hash_two text := repeat(replace(v_two::text, '-', ''), 2);
  v_result jsonb := jsonb_build_object('ruleset', 'verification-original-balanced-v1', 'trackId', 'palm-beach-3753-v2',
    'timeTicks', 2500, 'timeMs', -100, 'totalTicks', 24000, 'gates', 28, 'crossings', 31,
    'final', jsonb_build_object('x', 1, 'z', 2, 'yaw', 3, 'speed', 80, 'energy', 10));
  v_receipt jsonb;
  v_best_one jsonb;
  v_best_two jsonb;
  v_board jsonb;
begin
  assert public.apex_claim_attempt(v_one, v_first, v_hash_one, 24000) = '{"state":"claimed"}'::jsonb, 'first claim failed';
  v_receipt := public.apex_finish_attempt(v_one, v_first, v_hash_one, v_result);
  assert (v_receipt ->> 'saved')::boolean and (v_receipt ->> 'personalBest')::boolean, 'verified result was not saved';
  assert not (v_receipt ->> 'prizeEligible')::boolean, 'beta result became prize eligible';
  assert (v_receipt -> 'result' ->> 'timeMs')::numeric = 20833.333, 'claimed browser time was trusted';
  assert public.apex_finish_attempt(v_one, v_first, v_hash_one, v_result) = v_receipt, 'finish was not idempotent';
  assert public.apex_claim_attempt(v_one, v_first, v_hash_one, 24000) -> 'receipt' = v_receipt, 'accepted retry did not return its receipt';
  assert public.apex_claim_attempt(v_two, v_second, v_hash_two, 24000) = '{"state":"claimed"}'::jsonb, 'second claim failed';
  perform public.apex_finish_attempt(v_two, v_second, v_hash_two, v_result || '{"timeTicks":2600}'::jsonb);
  v_best_one := public.apex_profile_get(v_one) -> 'best';
  v_best_two := public.apex_profile_get(v_two) -> 'best';
  assert (v_best_one ->> 'timeTicks')::integer = 2500, 'first personal best is incorrect';
  assert (v_best_two ->> 'timeTicks')::integer = 2600, 'second personal best is incorrect';
  assert (v_best_one ->> 'rank')::integer < (v_best_two ->> 'rank')::integer, 'best-lap ordering is incorrect';
  v_board := public.apex_leaderboard();
  assert jsonb_typeof(v_board -> 'entries') = 'array' and jsonb_array_length(v_board -> 'entries') <= 50, 'leaderboard is not bounded';
  assert not exists (select 1 from jsonb_array_elements(v_board -> 'entries') e
    where e ? 'user_id' or e ? 'userId' or e ? 'email'), 'public standings disclose account data';
end;
$$;
reset role;

select 'Authenticated leaderboard SQL smoke test passed; all test data will be rolled back.' as result;
rollback;
