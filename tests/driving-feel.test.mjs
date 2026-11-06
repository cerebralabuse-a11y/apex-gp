import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrivingFeel} from '../dist/driving-feel.js';

test('boost kicks then settles, camera motion stays bounded and clears on pause',()=>{
  const feel=createDrivingFeel(),car={speed:55,boost:false};
  for(let i=0;i<120;i++)feel.update(1/60,car,true);
  const cruise={...feel.update(1/60,car,true)};
  car.boost=true;const punch={...feel.update(1/60,car,true)};
  assert.ok(punch.pullback>cruise.pullback+.4);
  for(let i=0;i<600;i++){
    const v=feel.update(1/60,car,true);assert.ok(Math.abs(v.x)<.1&&Math.abs(v.y)<.07&&Math.abs(v.roll)<.004);
  }
  assert.ok(feel.update(1/60,car,true).fov>cruise.fov+5);
  assert.ok(feel.update(1/60,car,true).pullback<punch.pullback);
  const paused=feel.update(1/60,car,false);assert.ok(Object.values(paused).every(v=>v===0));
  const off=feel.update(1/60,car,true,'off');assert.equal(off.fov+off.pullback+Math.abs(off.x)+Math.abs(off.y)+Math.abs(off.roll),0);
  car.boost=false;for(let i=0;i<180;i++)feel.update(1/60,car,true);
  assert.ok(feel.update(1/60,car,true).boost<1e-6);
});
