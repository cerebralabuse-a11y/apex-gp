import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityCircuit,geographicFrame,corridorPolygon} from '../dist/geo-track.js';
import {createVehicle,stepVehicle,nearestTrack,resolveTrackWall,getAIControls,updateProgress,sampleTrack} from '../dist/physics.js';
const data=JSON.parse(await readFile(new URL('../dist/city-circuit.geojson',import.meta.url)));
const area=JSON.parse(await readFile(new URL('../dist/city-area.geojson',import.meta.url)));
const track=createCityCircuit(data,area);

test('the real-city circuit and mall stay within the user-selected footprint',()=>{
  assert.deepEqual(area.bbox,[73.002858,19.018653,73.021193,19.035861]);
  const f=geographicFrame(area.bbox);
  for(const p of [f.origin,[73.018508,19.021751],[73.007,19.031]]){
    const restored=f.toGeo(f.toWorld(p));assert.ok(Math.hypot(restored[0]-p[0],restored[1]-p[1])<1e-10);
  }
  for(const p of track.points){const [lng,lat]=f.toGeo(p);assert.ok(lng>area.bbox[0]&&lng<area.bbox[2]&&lat>area.bbox[1]&&lat<area.bbox[3])}
  assert.ok(track.length>3600&&track.length<3800);assert.equal(track.corners.length,14);
  const source=data.features.find(f=>f.properties.role==='circuit').geometry.coordinates.map(p=>f.toWorld(p));
  for(let i=1;i<source.length-1;i++){
    const a=source[i-1],b=source[i],c=source[i+1];
    assert.ok(!(Math.hypot(a.x-c.x,a.z-c.z)<1&&Math.hypot(a.x-b.x,a.z-b.z)>4),'a road junction cannot contain a double-back into the opposite carriageway');
  }
  for(let i=1;i<14;i++)assert.ok(track.corners[i].s>track.corners[i-1].s);
  assert.ok(Math.hypot(track.points[0].x-track.points.at(-1).x,track.points[0].z-track.points.at(-1).z)<.001);
  const grid=Array.from({length:8},(_,i)=>sampleTrack(track,-8-i*14));
  assert.ok(grid.every(p=>Math.abs(p.yaw-grid[0].yaw)<.06),'all grid positions share the mapped start straight');
  const ring=corridorPolygon(track,11.8).geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));
  assert.equal(data.features.filter(f=>f.properties.role==='mall-building').length,3);
});

test('an AI car completes a valid lap on the georeferenced circuit without recovery',()=>{
  const car=Object.assign(createVehicle(track,-8),{index:0,aiLane:0,aiSkill:1,progress:-8});
  const dt=1/120;let maxOffset=0;
  for(let k=0;k<120*180&&car.lap===1;k++){
    stepVehicle(car,getAIControls(car,[car],track,'club',k*dt,dt),dt,track.halfWidth);
    car.road=nearestTrack(track,car.x,car.z,car.road.index);resolveTrackWall(car,track);maxOffset=Math.max(maxOffset,car.road.distance);updateProgress(car,track,k*dt,dt);
  }
  assert.equal(car.lap,2,`AI reached ${Math.round(car.progress)} / ${Math.round(track.length)} m; offset ${car.road.distance.toFixed(2)}`);
  assert.ok(maxOffset<9);assert.equal(car.lapTimes.length,1);
});
