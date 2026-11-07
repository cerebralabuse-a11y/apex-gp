import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerificationHandler} from '../server/verification-handler.mjs';
import worker from '../workers/verification.mjs';
import {verificationTrack} from '../dist/verification-track.js';
import {RULESET,TRACK_ID,MAX_TICKS,TICK_HZ,VerificationError,createVerificationRun,stepVerificationRun,quantizeInput} from '../dist/verification-core.js';
import {getAIControls} from '../dist/physics.js';

const base='http://localhost:4173/api/verification/';
const post=(body='{}',headers={})=>new Request(base+'replay',{method:'POST',headers:{'content-type':'application/json',...headers},body});

test('verification gateway exposes a no-store unranked status and restricts routes/methods/origins',async()=>{
  const handle=createVerificationHandler({verify:()=>({timeMs:123})});
  const status=await handle(new Request(base+'status'));
  assert.equal(status.status,200);assert.equal((await status.json()).ranked,false);assert.equal(status.headers.get('cache-control'),'no-store');
  assert.equal((await handle(new Request(base+'unknown'))).status,404);
  const wrong=await handle(new Request(base+'replay'));assert.equal(wrong.status,405);assert.equal(wrong.headers.get('allow'),'POST');
  assert.equal((await handle(post('{}',{origin:'https://malicious.example'}))).status,403);
  assert.equal((await handle(post('{}',{origin:'null'}))).status,403);
  assert.equal((await handle(post('{}',{origin:'http://localhost:4173'}))).status,200);
});

test('gateway rejects malformed, invalid-UTF8 and oversized streamed bodies before replay',async()=>{
  let calls=0;const handle=createVerificationHandler({maxBytes:32,verify:()=>{calls++;return{timeMs:123}}});
  assert.equal((await handle(post('{broken'))).status,400);
  assert.equal((await handle(post('{}',{'content-type':'text/plain'}))).status,415);
  assert.equal((await handle(post('{}',{'content-encoding':'gzip'}))).status,415);
  assert.equal((await handle(post('{}',{'content-length':'33'}))).status,413);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20));controller.enqueue(new Uint8Array(20));controller.close()}});
  const request=new Request(base+'replay',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'});
  assert.equal((await handle(request)).status,413);
  const utf8=new Request(base+'replay',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([0xff])});
  assert.equal((await handle(utf8)).status,400);assert.equal(calls,0);
});

test('gateway returns computed results and safe errors with a bounded lab replay limit',async()=>{
  let time=0,calls=0;const handle=createVerificationHandler({now:()=>time,requestsPerMinute:2,verify:(_track,recording)=>{calls++;return{timeMs:123,echo:recording.example}}});
  const valid=await handle(post('{"example":1}'));const body=await valid.json();
  assert.equal(valid.status,200);assert.equal(body.status,'physics-valid');assert.equal(body.ranked,false);assert.equal(body.result.timeMs,123);
  await handle(post());const limited=await handle(post());assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');assert.equal(calls,2);
  time=60000;assert.equal((await handle(post())).status,200);
  const invalid=createVerificationHandler({verify(){throw new VerificationError('missing gates')}});
  const rejected=await invalid(post());assert.equal(rejected.status,422);assert.deepEqual(await rejected.json(),{error:'invalid_recording',reason:'missing gates'});
  const faulty=createVerificationHandler({verify(){throw new Error('sensitive implementation detail')}});
  const failed=await faulty(post());assert.equal(failed.status,500);assert.deepEqual(await failed.json(),{error:'verification_unavailable'});
});

test('real HTTP replay independently computes the flying lap and rejects a posted claimed time',async()=>{
  const run=createVerificationRun(verificationTrack),frames=[];
  Object.assign(run.car,{index:0,aiLane:0,aiSkill:1});
  while(run.stage!=='complete'&&run.stage!=='invalid'&&frames.length<MAX_TICKS){
    const frame=quantizeInput(getAIControls(run.car,[run.car],verificationTrack,'club',run.ticks/TICK_HZ,1/TICK_HZ));
    frames.push(frame);stepVerificationRun(run,frame);
  }
  assert.equal(run.stage,'complete',run.invalidReason);
  const recording={version:1,ruleset:RULESET,trackId:TRACK_ID,frames},handle=createVerificationHandler();
  const response=await handle(post(JSON.stringify(recording))),body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(body.result,run.result);assert.equal(body.ranked,false);
  const tampered=await handle(post(JSON.stringify({...recording,timeMs:1})));
  assert.equal(tampered.status,422);assert.equal((await tampered.json()).error,'invalid_recording');
});

test('Worker lab is disabled by default and requires a configured secret bearer token',async()=>{
  const request=()=>new Request(base+'status');
  assert.equal((await worker.fetch(request())).status,404);
  assert.equal((await worker.fetch(request(),{VERIFICATION_LAB_ENABLED:'true'})).status,503);
  const env={VERIFICATION_LAB_ENABLED:'true',VERIFICATION_LAB_TOKEN:'a'.repeat(64)};
  assert.equal((await worker.fetch(request(),env)).status,401);
  const wrong=new Request(base+'status',{headers:{authorization:'Bearer '+'b'.repeat(64)}});
  assert.equal((await worker.fetch(wrong,env)).status,401);
  const valid=new Request(base+'status',{headers:{authorization:'Bearer '+env.VERIFICATION_LAB_TOKEN}});
  assert.equal((await worker.fetch(valid,env)).status,200);
});
