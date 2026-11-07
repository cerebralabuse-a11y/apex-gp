import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const RULESET='verification-original-balanced-v1',TRACK='palm-beach-3753-v2';
const USERS=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const hash=n=>n.toString(16).padStart(64,'0');
const result=(ticks=10000,total=24000)=>({ruleset:RULESET,trackId:TRACK,timeTicks:ticks,timeMs:-123,totalTicks:total,gates:28,crossings:31,final:{x:1,z:2,yaw:3,speed:80,energy:10}});

test('PostgreSQL enforces private beta records, one-use attempts and best-lap rankings',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, aud text, role text, email text,
      encrypted_password text, created_at timestamptz, updated_at timestamptz);
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  for(const id of USERS)await db.query('insert into auth.users(id) values($1)',[id]);
  async function rpc(name,args=[]){
    await db.exec('set role service_role');
    try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value}
    finally{await db.exec('reset role')}
  }
  const clear=()=>db.exec('truncate apex_private.profiles cascade');
  const profile=(id=USERS[0],name='Driver_1')=>rpc('apex_profile_set',[id,name]);
  const start=(id=USERS[0])=>rpc('apex_begin_attempt',[id,RULESET,TRACK]);
  const age=id=>db.query("update apex_private.attempts set started_at=clock_timestamp()-interval '210 seconds' where id=$1",[id]);
  const claim=(user,id,n=1,total=24000)=>rpc('apex_claim_attempt',[user,id,hash(n),total]);
  const finish=(user,id,n=1,value=result(),reason=null)=>rpc('apex_finish_attempt',[user,id,hash(n),value,reason]);
  async function saved(user,n,ticks=10000){const a=await start(user);await age(a.attemptId);await claim(user,a.attemptId,n);return{attempt:a,receipt:await finish(user,a.attemptId,n,result(ticks))}}

  await t.test('only service_role has table/RPC access; invoker views keep RLS',async()=>{
    const tables=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='apex_private'::regnamespace and relkind='r'")).rows;
    assert.equal(tables.length,3);assert.ok(tables.every(x=>x.relrowsecurity));
    const functions=(await db.query("select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'apex_%'")).rows;
    assert.equal(functions.length,6);assert.ok(functions.every(x=>!x.prosecdef&&x.proconfig.includes('search_path=""')));
    const view=(await db.query("select reloptions from pg_class where oid='apex_private.standings'::regclass")).rows[0];
    assert.ok(view.reloptions.includes('security_invoker=true'));
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      try{
        await assert.rejects(db.query('select public.apex_leaderboard()'),/permission denied/);
        await assert.rejects(db.query('select public.apex_profile_set($1,$2)',[USERS[0],'Tamper']),/permission denied/);
        await assert.rejects(db.query('select * from apex_private.laps'),/permission denied/);
        await assert.rejects(db.query('insert into apex_private.profiles(user_id,driver_name) values($1,$2)',[USERS[0],'Tamper']),/permission denied/);
      }finally{await db.exec('reset role')}
    }
    assert.deepEqual((await rpc('apex_leaderboard')).entries,[]);
  });

  await t.test('profile names are bounded, literal and case-insensitively unique',async()=>{
    await clear();
    assert.deepEqual(await rpc('apex_profile_get',[USERS[0]]),{profile:null,best:null});
    assert.deepEqual(await profile(),{driverName:'Driver_1'});
    await assert.rejects(profile(USERS[1],'driver_1'),/name_taken/);
    for(const name of ['ab','x'.repeat(21),'Pilot <script>','नवी','x\u0000y',"x';drop table"]){
      // PostgreSQL rejects NUL at its input parser; every other bad name reaches the constraint.
      await assert.rejects(profile(USERS[1],name),name.includes('\u0000')?/null|byte|encoding/i:/invalid_driver_name/);
    }
    assert.deepEqual(await profile(USERS[0],'New-name'),{driverName:'New-name'});
    assert.deepEqual(await rpc('apex_profile_get',[USERS[0]]),{profile:{driverName:'New-name'},best:null});
  });

  await t.test('server starts enforce ruleset, ownership profile, cooldown and hourly budget',async()=>{
    await clear();
    await assert.rejects(start(),/profile_required/);
    await profile();
    await assert.rejects(rpc('apex_begin_attempt',[USERS[0],'fake',TRACK]),/unsupported_ruleset/);
    const first=await start();
    assert.equal(first.ruleset,RULESET);assert.equal(first.trackId,TRACK);
    assert.equal(Date.parse(first.expiresAt)-Date.parse(first.startedAt),600000);
    await assert.rejects(start(),/rate_limited/);
    await db.query("update apex_private.attempts set started_at=clock_timestamp()-interval '11 seconds' where id=$1",[first.attemptId]);
    const second=await start();
    assert.notEqual(first.attemptId,second.attemptId);
    assert.equal((await db.query('select state from apex_private.attempts where id=$1',[first.attemptId])).rows[0].state,'cancelled');
    await db.exec('truncate apex_private.attempts cascade');
    await db.query(`insert into apex_private.attempts(user_id,ruleset,track_id,started_at,expires_at)
      select $1,$2,$3,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '9 minutes' from generate_series(1,20)`,[USERS[0],RULESET,TRACK]);
    await assert.rejects(start(),/rate_limited/);
  });

  await t.test('claim is atomic, wall-clock bounded, expiring, user-bound and lease-retryable',async()=>{
    await clear();await profile();await profile(USERS[1],'Driver_2');
    const a=await start();
    await assert.rejects(claim(USERS[1],a.attemptId),/attempt_not_found/);
    await assert.rejects(claim(USERS[0],a.attemptId),/attempt_too_early/);
    await assert.rejects(rpc('apex_claim_attempt',[USERS[0],a.attemptId,'f',24000]),/invalid_recording/);
    await assert.rejects(claim(USERS[0],a.attemptId,1,57601),/invalid_recording/);
    await age(a.attemptId);
    assert.deepEqual(await claim(USERS[0],a.attemptId),{state:'claimed'});
    await assert.rejects(claim(USERS[0],a.attemptId),/attempt_in_progress/);
    await assert.rejects(claim(USERS[0],a.attemptId,2),/attempt_used/);
    await assert.rejects(claim(USERS[0],a.attemptId,1,23000),/attempt_used/);
    await db.query("update apex_private.attempts set claimed_at=clock_timestamp()-interval '61 seconds' where id=$1",[a.attemptId]);
    assert.deepEqual(await claim(USERS[0],a.attemptId),{state:'claimed'});
    await db.query("update apex_private.attempts set started_at=clock_timestamp()-interval '11 minutes', expires_at=clock_timestamp()-interval '1 minute' where id=$1",[a.attemptId]);
    await assert.rejects(claim(USERS[0],a.attemptId),/attempt_expired/);
  });

  await t.test('finish derives times, keeps one best per driver, preserves ties and prevents replay reuse',async()=>{
    await clear();
    for(let i=0;i<3;i++)await profile(USERS[i],'Driver_'+(i+1));
    const first=await saved(USERS[0],1);
    assert.equal(first.receipt.saved,true);assert.equal(first.receipt.personalBest,true);assert.equal(first.receipt.prizeEligible,false);
    assert.equal(first.receipt.result.timeMs,83333.333); // The supplied -123 time is discarded.
    assert.deepEqual(await finish(USERS[0],first.attempt.attemptId,1,result(1)),first.receipt);
    assert.deepEqual(await claim(USERS[0],first.attempt.attemptId),{state:'accepted',receipt:first.receipt});
    await assert.rejects(finish(USERS[1],first.attempt.attemptId),/attempt_not_found/);
    await assert.rejects(finish(USERS[0],first.attempt.attemptId,99),/attempt_used/);
    const slower=await saved(USERS[0],2,11000);assert.equal(slower.receipt.personalBest,false);
    const faster=await saved(USERS[0],3,9000);assert.equal(faster.receipt.personalBest,true);
    await saved(USERS[1],4,8000);await saved(USERS[2],5,9000);
    const board=await rpc('apex_leaderboard');
    assert.equal(board.entries.length,3);
    assert.deepEqual(board.entries.map(x=>[x.driver,x.rank,x.timeTicks]),[['Driver_2',1,8000],['Driver_1',2,9000],['Driver_3',2,9000]]);
    assert.deepEqual(Object.keys(board.entries[0]).sort(),['driver','rank','recordedAt','timeMs','timeTicks'].sort());
    assert.equal((await rpc('apex_profile_get',[USERS[0]])).best.rank,2);
    const stolen=await start(USERS[1]);await age(stolen.attemptId);await claim(USERS[1],stolen.attemptId,1);
    await assert.rejects(finish(USERS[1],stolen.attemptId,1),/replay_duplicate/);
    const rejection=await finish(USERS[1],stolen.attemptId,1,null,'replay_duplicate');
    assert.equal(rejection.saved,false);assert.equal(rejection.reason,'replay_duplicate');
    await assert.rejects(claim(USERS[1],stolen.attemptId,1),/attempt_used/);
    assert.equal((await db.query('select count(*)::int as count from apex_private.laps')).rows[0].count,5);
  });

  await t.test('invalid or rejected results cannot overwrite a completed attempt',async()=>{
    await clear();await profile();const a=await start();await age(a.attemptId);await claim(USERS[0],a.attemptId);
    for(const value of [{...result(),gates:27},{...result(),timeTicks:0},{...result(),totalTicks:24001},{...result(),ruleset:'fake'}, {...result(),final:{x:1,z:2,yaw:3,speed:'fast',energy:100}}]){
      await assert.rejects(finish(USERS[0],a.attemptId,1,value),/invalid_result/);
    }
    const rejected=await finish(USERS[0],a.attemptId,1,null,'track_limits');
    assert.equal(rejected.saved,false);assert.equal(rejected.prizeEligible,false);
    assert.deepEqual(await finish(USERS[0],a.attemptId,1,result()),rejected);
    await assert.rejects(claim(USERS[0],a.attemptId),/attempt_used/);
    assert.deepEqual((await rpc('apex_leaderboard')).entries,[]);
  });

  await t.test('hosted smoke script exercises roles and RPCs and rolls back all test data',async()=>{
    await clear();
    const usersBefore=(await db.query('select count(*)::int as count from auth.users')).rows[0].count;
    await db.exec(await readFile(new URL('../supabase/smoke-test.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count,usersBefore);
    assert.equal((await db.query('select count(*)::int as count from apex_private.profiles')).rows[0].count,0);
    assert.equal((await db.query('select count(*)::int as count from apex_private.attempts')).rows[0].count,0);
    assert.equal((await db.query('select count(*)::int as count from apex_private.laps')).rows[0].count,0);
  });
});
