import test from 'node:test';
import assert from 'node:assert/strict';
import {stepVehicle} from '../dist/physics.js';
import {bestLapKey,setupId} from '../dist/vehicle-setup.js';

function vehicle(setup){return{setup,x:0,z:0,yaw:0,vx:4,vz:65,speed:65,steer:0,energy:100,road:{distance:0},collisionCooldown:0,recovered:0}}
test('setup choices trade grip for drag, preserve the default, and separate lap records',()=>{
  const cars=['balanced','corner','straight','invalid',undefined].map(vehicle);
  const input={throttle:1,steer:0};cars.forEach(c=>stepVehicle(c,input,1/120));
  const [balanced,corner,straight,invalid,unset]=cars;
  assert.ok(corner.vx<balanced.vx&&straight.vx>balanced.vx,'high downforce sheds lateral slip faster');
  assert.ok(corner.vz<balanced.vz&&straight.vz>balanced.vz,'extra grip costs straight-line acceleration');
  assert.equal(invalid.vz,balanced.vz);assert.equal(unset.vx,balanced.vx);
  assert.equal(setupId('__proto__'),'balanced');
  assert.equal(bestLapKey('original','balanced'),'best-original');
  assert.notEqual(bestLapKey('original','corner'),bestLapKey('original','straight'));
  assert.notEqual(bestLapKey('city','corner'),bestLapKey('original','corner'));
});

test('holding ERS on an empty battery cannot pulse boost or retrigger effects',()=>{
  const car=vehicle('balanced');car.energy=.05;
  for(let i=0;i<240;i++){stepVehicle(car,{throttle:1,boost:true},1/120);assert.equal(car.boost,false)}
  assert.ok(car.energy>1);
  stepVehicle(car,{throttle:1,boost:false},1/120);
  stepVehicle(car,{throttle:1,boost:true},1/120);assert.equal(car.boost,true);
});
