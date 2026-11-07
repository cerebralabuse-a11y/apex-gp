import test from 'node:test';
import assert from 'node:assert/strict';
import {createCircuit} from '../dist/track.js';
import {getAIControls} from '../dist/physics.js';
import {RULESET,TRACK_ID,TICK_HZ,MAX_TICKS,quantizeInput,decodeInput,createVerificationRun,stepVerificationRun,verifyRecording} from '../dist/verification-core.js';

const track=createCircuit();
function fixture(){
  const run=createVerificationRun(track),frames=[];
  Object.assign(run.car,{index:0,aiLane:0,aiSkill:1});
  while(run.stage!=='complete'&&run.stage!=='invalid'&&frames.length<MAX_TICKS){
    const frame=quantizeInput(getAIControls(run.car,[run.car],track,'club',run.ticks/TICK_HZ,1/TICK_HZ));
    frames.push(frame);stepVerificationRun(run,frame);
  }
  assert.equal(run.stage,'complete',run.invalidReason||String(run.car.progress));
  return {recording:{version:1,ruleset:RULESET,trackId:TRACK_ID,frames},result:run.result};
}
const valid=fixture();

test('shared recorded controls reproduce a full outlap and a flying lap exactly',()=>{
  const actual=verifyRecording(track,valid.recording);
  assert.deepEqual(actual,valid.result);assert.equal(actual.gates,28);assert.equal(actual.crossings,31);
  assert.ok(actual.timeTicks>120*50&&actual.timeTicks<120*180);
  assert.equal(actual.timeMs,Math.round(actual.timeTicks*1e6/TICK_HZ)/1000);
});

test('recordings reject invented initial states, claimed times, wrong rules and incomplete laps',()=>{
  for(const extra of [{initialState:{speed:90}},{timeMs:1},{setup:'straight'}])assert.throws(()=>verifyRecording(track,{...valid.recording,...extra}),/Unsupported/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,ruleset:'edited'}),/Unsupported/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,version:2}),/Unsupported/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,trackId:'city'}),/Unsupported/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,frames:valid.recording.frames.slice(0,-1)}),/complete/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,frames:[...valid.recording.frames,[0,0,0,0]]}),/after the finish/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,frames:Array(MAX_TICKS+1).fill([0,0,0,0])}),/oversized/);
});

test('frame validation rejects non-finite, fractional and out-of-range control values',()=>{
  assert.deepEqual(quantizeInput({steer:.5,throttle:1,brake:0,boost:true}),[16384,255,0,1]);
  assert.equal(decodeInput([32767,255,0,1]).steer,1);
  for(const frame of [null,[],[0,0,0],['0',0,0,0],[Infinity,0,0,0],[0,256,0,0],[0,0,-1,0],[0,0,0,2],[.1,0,0,0]])assert.throws(()=>decodeInput(frame),/frame/);
  assert.throws(()=>quantizeInput({steer:NaN}),/finite/);
  assert.throws(()=>verifyRecording(track,{...valid.recording,frames:[[0,0,0,2]]}),/frame/);
});

test('recovery, changed setup and wheel track limits invalidate the current attempt',()=>{
  for(const [field,value] of [['recovered',2],['setup','straight']]){
    const run=createVerificationRun(track);run.car[field]=value;stepVerificationRun(run,[0,0,0,0]);assert.equal(run.stage,'invalid');
  }
  const run=createVerificationRun(track);run.car.x+=track.points[0].x+10000;run.car.z+=10000;
  stepVerificationRun(run,[0,0,0,0]);assert.equal(run.stage,'invalid');
});
