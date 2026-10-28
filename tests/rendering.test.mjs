import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCar,disposeCar,drivingCameraTargets} from '../dist/scene.js';
import {createCircuit,mapToWorld,lakeOutlines} from '../dist/track.js';
import {createVehicle,nearestTrack,resolveTrackWall,sampleTrack,CAR_HALF_WIDTH,CAR_HALF_LENGTH} from '../dist/physics.js';
import {buildNaviMumbai} from '../dist/city.js';
import {offsetContour,trackBand} from '../dist/map-geometry.js';

// Textures need a drawing surface; geometry checks do not require a GPU.
globalThis.document={createElement(){return{width:0,height:0,getContext(){return{fillRect(){},clearRect(){},fillText(){}}}}}};
const track=createCircuit();

test('scenery platforms and road trims do not cover the racing corridor',()=>{
  const scene=new THREE.Scene();buildNaviMumbai(scene,track);scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),blocked=[];
  for(let s=0;s<track.length;s+=8)for(const offset of [-8,0,8]){
    const p=sampleTrack(track,s,offset);ray.set(new THREE.Vector3(p.x,200,p.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(scene.children,true).find(h=>h.point.y>.005&&h.point.y<5);
    if(hit)blocked.push({s,offset,y:hit.point.y});
  }
  assert.deepEqual(blocked,[],'no academy base, perimeter wall or pale road surface intrudes over the asphalt');
});

test('front-wheel axles stay horizontal while simultaneously steering and rolling',()=>{
  const car=buildCar('#a2cf3e');
  for(const wheel of car.userData.wheels)for(const steer of [-.2,0,.2]){
    let first;
    for(let i=0;i<24;i++){
      wheel.rotation.set(i*Math.PI/12,steer,0);const axle=new THREE.Vector3(1,0,0).applyEuler(wheel.rotation);
      assert.ok(Math.abs(axle.y)<1e-7,'rolling cannot tilt the steering axis');
      if(!first)first=axle;else assert.ok(first.distanceTo(axle)<1e-7,'axle orientation is independent of wheel spin');
      car.rotation.z=Math.sign(steer)*.05;car.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(car,true);
      assert.ok(bounds.min.x>=-CAR_HALF_WIDTH&&bounds.max.x<=CAR_HALF_WIDTH&&bounds.min.z>=-CAR_HALF_LENGTH&&bounds.max.z<=CAR_HALF_LENGTH,'collision footprint includes steered tires and wings');
    }
  }
  disposeCar(car);
});

test('arcade and chase cameras contain the actual car geometry through top speed',()=>{
  const mesh=buildCar('#a2cf3e'),target=new THREE.Vector3(),look=new THREE.Vector3();
  for(const aspect of [16/9,4/3,9/16])for(const mode of [0,2])for(const speed of [0,15,40,60,90.6]){
    const car={x:200,z:-100,yaw:.7,speed,boost:speed>84};mesh.position.set(car.x,.035,car.z);mesh.rotation.y=car.yaw;mesh.updateMatrixWorld(true);
    const fov=drivingCameraTargets(car,mode,aspect,target,look),camera=new THREE.PerspectiveCamera(fov,aspect,.5,6500);camera.position.copy(target);camera.lookAt(look);camera.updateMatrixWorld(true);
    mesh.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera);
      assert.ok(Math.abs(p.x)<.98&&Math.abs(p.y)<.98&&p.z>-1&&p.z<1,`mode ${mode}, aspect ${aspect}, speed ${speed}: vertex (${p.x}, ${p.y}) stays in frame`);
    }});
  }
  disposeCar(mesh);
});

test('the full rotated car stays inside the rail at all fourteen corners',()=>{
  for(const corner of track.corners)for(const ds of [-4,0,4])for(const side of [-1,1])for(const angle of [-Math.PI/2,-Math.PI/6,0,Math.PI/6,Math.PI/2,Math.PI]){
    const car=createVehicle(track,corner.s+ds,side*8.5);car.yaw+=angle;car.vx=20;car.vz=30;
    resolveTrackWall(car,track);
    const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=car.x+fz*sx*CAR_HALF_WIDTH+fx*sz*CAR_HALF_LENGTH,z=car.z-fx*sx*CAR_HALF_WIDTH+fz*sz*CAR_HALF_LENGTH;
      assert.ok(nearestTrack(track,x,z,car.road.index).distance<9.825-.04,`T${corner.number}: wings and wheels remain inside`);
    }
  }
});

test('concrete, kerbs and rail bands share exact endpoints around the closed circuit',()=>{
  const mesh=trackBand(track,9.825,10.475,0,.645,new THREE.MeshBasicMaterial()),p=mesh.geometry.attributes.position,count=p.count/8;
  for(let i=0;i<count;i++)for(let corner=0;corner<4;corner++){
    const a=new THREE.Vector3().fromBufferAttribute(p,i*8+4+corner),b=new THREE.Vector3().fromBufferAttribute(p,((i+1)%count)*8+corner);
    assert.ok(a.distanceTo(b)<.0001,'adjacent sections and the finish-line seam have no gap');
  }
  mesh.geometry.dispose();mesh.material.dispose();
});

test('shore bands have bounded width and finite vertices at every lake',()=>{
  for(const outline of lakeOutlines){
    const controls=outline.map(([u,v])=>{const p=mapToWorld(u,v);return new THREE.Vector3(p.x,0,p.z)}),poly=new THREE.CatmullRomCurve3(controls,true,'centripetal').getPoints(200).slice(0,-1).map(p=>({x:p.x,z:p.z})),shore=offsetContour(poly,4);
    for(let i=0;i<poly.length;i++){const d=Math.hypot(shore[i].x-poly[i].x,shore[i].z-poly[i].z);assert.ok(Number.isFinite(d)&&d>=3.99&&d<=8.001,'shore width cannot expand into a long triangular spike')}
  }
});
