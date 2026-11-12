import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompetitionHandler} from '../server/competition-handler.mjs';
import {createRecordedAttempt} from '../dist/competition-recording.js';
import {RULESET,TRACK_ID,VerificationError} from '../dist/verification-core.js';
import {getAIControls} from '../dist/physics.js';
import {verificationTrack} from '../dist/verification-track.js';
import {createCompetitionClient} from '../dist/competition-client.js';

const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',base='https://api.test/api/competition',origin='https://game.test';
const make=(path,body,headers={},method=body?'POST':'GET')=>new Request(base+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
const auth=async r=>{if(r.headers.get('Authorization')!=='Bearer player')throw Object.assign(new Error(),{status:401,code:'unauthorized'});return user};
const ticket={attemptId:id,ruleset:RULESET,trackId:TRACK_ID};

test('the browser client can retry a failed first configuration request',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{if(++calls===1)throw new Error('offline');return Response.json({enabled:false})});
  const client=createCompetitionClient();await assert.rejects(client.ready(),/offline/);
  assert.equal((await client.ready()).enabled,false);assert.deepEqual(await client.identity(),{signedIn:false});assert.equal(calls,2);client.dispose();
});

test('competition API restricts origins, authenticates mutations and caches only public standings',async()=>{
  let calls=[];const handle=createCompetitionHandler({allowedOrigins:[origin],authenticate:auth,rpc:async(name,args)=>{calls.push([name,args]);return{entries:[]}}});
  assert.equal((await handle(make('/status'))).status,200);
  assert.equal((await handle(make('/leaderboard',null,{Origin:'https://other.test'}))).status,403);
  const preflight=await handle(make('/profile',null,{},'OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  assert.equal((await handle(make('/profile',{driverName:'DRIVER'}, {},'PUT'))).status,401);assert.equal(calls.length,0);
  const headers={Authorization:'Bearer player'};
  assert.equal((await handle(make('/profile',{driverName:'DRIVER',userId:'forged'},headers,'PUT'))).status,400);
  assert.equal((await handle(make('/profile',{driverName:'<script>'},headers,'PUT'))).status,400);
  assert.equal((await handle(make('/profile',{driverName:'DRIVER'},headers,'PUT'))).status,200);assert.equal(calls[0][1].p_user_id,user);
  assert.equal((await handle(make('/attempts',{ruleset:RULESET,trackId:TRACK_ID},headers))).status,201);
  assert.equal((await handle(make('/attempts',{ruleset:RULESET,trackId:'city'},headers))).status,400);
  assert.equal((await handle(make('/leaderboard'))).headers.get('cache-control'),'public, max-age=15');await handle(make('/leaderboard'));
  assert.equal(calls.filter(c=>c[0]==='apex_leaderboard').length,1);
  assert.equal((await handle(make('/me',null,headers))).headers.get('cache-control'),'no-store');
});

test('server resolves identity through Auth and rejects anonymous or unconfirmed users before touching data',async()=>{
  let touches=0;let authUser={id:user,email:'driver@example.test',email_confirmed_at:new Date().toISOString(),is_anonymous:false};
  const handle=createCompetitionHandler({supabaseUrl:'https://supabase.test',publishableKey:'public',secretKey:'server-only',allowedOrigins:[origin],rpc:async()=>{touches++;return{}},fetcher:async(url,init)=>{assert.equal(url,'https://supabase.test/auth/v1/user');assert.equal(init.headers.apikey,'public');return Response.json(authUser)}});
  const headers={Authorization:'Bearer '+ 'a'.repeat(30)};
  assert.equal((await handle(make('/me',null,headers))).status,200);assert.equal(touches,1);
  authUser={...authUser,is_anonymous:true};assert.equal((await handle(make('/me',null,headers))).status,401);
  authUser={...authUser,is_anonymous:false,email_confirmed_at:null};assert.equal((await handle(make('/me',null,headers))).status,401);assert.equal(touches,1);
  assert.equal((await handle(make('/me'))).status,401);
});

test('full browser protocol is replayed before persistence; accepted retries bypass CPU and have canonical hashes',async()=>{
  const session=createRecordedAttempt(ticket);Object.assign(session.run.car,{index:0,aiLane:0,aiSkill:1});
  while(!['complete','invalid'].includes(session.run.stage))session.step(getAIControls(session.run.car,[session.run.car],verificationTrack,'club',session.run.ticks/120,1/120));
  assert.equal(session.run.stage,'complete');let receipt,claimedHash,verifies=0,claims=0;
  const handle=createCompetitionHandler({allowedOrigins:[origin],authenticate:auth,verify:async(track,recording)=>{verifies++;const {verifyRecording}=await import('../dist/verification-core.js');return verifyRecording(track,recording)},rpc:async(name,args)=>{
    assert.equal(args.p_user_id,user);
    if(name==='apex_claim_attempt'){claims++;if(claimedHash)assert.equal(args.p_recording_hash,claimedHash);claimedHash=args.p_recording_hash;return receipt?{state:'accepted',receipt}:{state:'claimed'}}
    assert.equal(name,'apex_finish_attempt');assert.deepEqual(args.p_result,session.run.result);return receipt={saved:true,result:args.p_result,prizeEligible:false};
  }});
  const headers={Authorization:'Bearer player'},path='/attempts/'+id+'/submit';
  let result=await handle(make(path,{recording:session.recording},headers));assert.equal(result.status,200);assert.equal((await result.json()).saved,true);
  const reordered={frames:session.recording.frames,trackId:TRACK_ID,ruleset:RULESET,version:1};
  result=await handle(make(path,{recording:reordered},headers));assert.equal(result.status,200);assert.equal(verifies,1);assert.equal(claims,2);
  assert.equal((await handle(make(path,{recording:{...session.recording,timeMs:1}},headers))).status,400);
  session.invalidate('late invalidation');assert.equal(session.run.stage,'complete');
});

test('invalid claimed recordings are consumed; streamed oversized bodies are bounded before verification',async()=>{
  const calls=[];let verifies=0;const handle=createCompetitionHandler({allowedOrigins:[origin],authenticate:auth,verify:()=>{verifies++;throw new VerificationError('Incomplete lap')},rpc:async(name,args)=>{calls.push([name,args]);return{state:'claimed'}}});
  const headers={Authorization:'Bearer player'},path='/attempts/'+id+'/submit';
  const r=await handle(make(path,{recording:{version:1,ruleset:RULESET,trackId:TRACK_ID,frames:[[0,255,0,0]]}},headers));assert.equal(r.status,422);assert.equal(calls.at(-1)[1].p_result,null);assert.equal(calls.at(-1)[1].p_rejection,'invalid_recording');
  const huge=new Request(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer player'},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(1024*1024+1));c.close()}}),duplex:'half'});
  assert.equal((await handle(huge)).status,413);assert.equal(verifies,1);
  const car={mesh:'render-only',isPlayer:true};const attempt=createRecordedAttempt(ticket,car);assert.equal(attempt.run.car,car);assert.equal(car.mesh,'render-only');attempt.invalidate('focus loss');assert.equal(attempt.run.stage,'invalid');assert.throws(()=>attempt.step({throttle:1}),/ended/);
});
