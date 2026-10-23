import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuit } from '../dist/scene.js';
import { createVehicle, stepVehicle, nearestTrack, updateProgress, getAIControls, collideVehicles, sampleTrack } from '../dist/physics.js';
const track=createCircuit();

function advance(car,controls,seconds,dt=1/120){for(let t=0;t<seconds;t+=dt)stepVehicle(car,controls,dt)}

test('braking stops forward motion and holding it allows bounded reverse',()=>{
  const c=createVehicle(track,120);advance(c,{throttle:1},3);const speed=c.speed;
  assert.ok(speed>45,'car accelerates to racing speed');advance(c,{brake:1},2);
  assert.ok(c.speed<speed*.2,'braking substantially slows the car');advance(c,{brake:1},8);
  const f=c.vx*Math.sin(c.yaw)+c.vz*Math.cos(c.yaw);assert.ok(f<-3&&f>=-9.01,'reverse is usable and limited');
});

test('ERS spends finite energy, gives extra acceleration, and braking recharges it',()=>{
  const a=createVehicle(track,120),b=createVehicle(track,120);advance(a,{throttle:1},2);advance(b,{throttle:1},2);
  advance(a,{throttle:1,boost:true},2);advance(b,{throttle:1},2);assert.ok(a.speed>b.speed+8);assert.ok(a.energy<70);
  const before=a.energy;advance(a,{brake:1},2);assert.ok(a.energy>before);
  advance(a,{throttle:1,boost:true},30);assert.ok(a.energy>=0&&a.energy<=100);assert.ok(a.speed<=90.61);
});

test('the same driving inputs give consistent results at two fixed time steps',()=>{
  const a=createVehicle(track,120),b=createVehicle(track,120);advance(a,{throttle:1,steer:.12},4,1/120);advance(b,{throttle:1,steer:.12},4,1/240);
  assert.ok(Math.abs(a.speed-b.speed)<.25);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.8);
});

test('grass reduces speed and collisions remove closing speed',()=>{
  const road=createVehicle(track,120),grass=createVehicle(track,120);grass.road.distance=14;
  advance(road,{throttle:1},8);advance(grass,{throttle:1},8);assert.ok(road.speed>grass.speed+15);
  const a=createVehicle(track,120),b=createVehicle(track,120);a.x=0;a.z=0;b.x=2;b.z=0;a.vx=30;b.vx=0;
  assert.equal(collideVehicles(a,b),true);assert.ok(a.vx<30);assert.ok(b.vx>0);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=3.09);
});

test('reversing or jumping over the circuit cannot award a lap',()=>{
  const c=createVehicle(track,track.start-8);c.progress=-8;
  for(let i=0;i<100;i++){
    const p=sampleTrack(track,track.start-i*1.5);c.road=nearestTrack(track,p.x,p.z);c.speed=30;updateProgress(c,track,i/20,.05);
  }
  assert.equal(c.lap,1);assert.equal(c.nextCheckpoint,1);
  const p=sampleTrack(track,track.start+track.length*.8);c.road=nearestTrack(track,p.x,p.z);updateProgress(c,track,6,.05);
  assert.equal(c.lap,1);assert.equal(c.nextCheckpoint,1);
});

test('an eight-car field completes a three-lap Grand Prix on the real circuit',()=>{
  const cars=Array.from({length:8},(_,i)=>{
    const offset=-8-Math.floor(i/2)*10-(i%2)*4,c=createVehicle(track,track.start+offset,i%2?3.6:-3.6);
    return Object.assign(c,{index:i,aiLane:i%2?1.6:-1.6,aiSkill:.96+(i%3)*.018,progress:offset,maxOffset:0});
  });
  const dt=1/120;
  for(let k=0;k<36000&&cars.some(c=>c.lap<=3);k++){
    for(const c of cars){
      if(c.lap>3)continue;
      stepVehicle(c,getAIControls(c,cars,track,'club',k*dt,dt),dt);c.road=nearestTrack(track,c.x,c.z,c.road.index);
      c.maxOffset=Math.max(c.maxOffset,c.road.distance);updateProgress(c,track,k*dt,dt);
    }
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)if(cars[i].lap<=3&&cars[j].lap<=3)collideVehicles(cars[i],cars[j]);
  }
  for(const c of cars){assert.equal(c.lap,4,`driver ${c.index} finished all three laps`);assert.ok(c.maxOffset<14,`driver ${c.index} stayed within the runoff without recovery`);assert.equal(c.lapTimes.length,3);assert.ok(c.lapTimes.every(t=>t>40&&t<100))}
});
