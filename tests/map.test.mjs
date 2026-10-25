import test from 'node:test';
import assert from 'node:assert/strict';
import {createCircuit,mapToWorld,lakeOutlines} from '../dist/track.js';
import {nearestTrack,sampleTrack,wrap} from '../dist/physics.js';

test('the traced Palm Beach circuit is 3.753 km with 14 ordered corners and a straight starting grid',()=>{
  const t=createCircuit();assert.ok(Math.abs(t.length-3753)<.02);assert.equal(t.corners.length,14);
  assert.deepEqual(t.corners.map(c=>c.number),Array.from({length:14},(_,i)=>i+1));
  for(let i=1;i<t.corners.length;i++)assert.ok(t.corners[i].s>t.corners[i-1].s,'corner numbers follow race direction');
  const p=mapToWorld(380,292);assert.ok(nearestTrack(t,p.x,p.z).distance<2,'eastern corner follows the supplied trace');
  const grid=Array.from({length:8},(_,i)=>sampleTrack(t,t.start-8-i*14));
  for(const p of grid)assert.ok(Math.abs(p.yaw-grid[0].yaw)<.1,'all eight grid slots stay on the start straight');
  assert.equal(lakeOutlines.length,4);assert.ok(wrap(t.corners[0].s-t.start,t.length)<400,'first turn is ahead of the grid');
});
