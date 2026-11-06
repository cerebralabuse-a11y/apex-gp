import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCar,disposeCar,setCarColor} from '../dist/f4-car.js';

globalThis.document={createElement(){return{width:0,height:0,getContext(){return{fillRect(){},clearRect(){},fillText(){}}}}}};

test('F4 model has compact proportions, independent steering pivots and a bounded render cost',()=>{
  const car=buildCar('#a2cf3e');car.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3()).divideScalar(1.3);
  assert.ok(size.x>1.7&&size.x<1.8);assert.ok(size.z>4.3&&size.z<4.4);assert.ok(size.y<1);
  let draws=0,triangles=0;
  car.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const x of o.geometry.attributes.position.array)assert.ok(Number.isFinite(x))}});
  assert.ok(draws<=30);assert.ok(triangles<12000);assert.equal(car.userData.wheels.length,4);
  for(const [i,wheel] of car.userData.wheels.entries()){
    assert.equal(wheel.rotation.order,'YXZ');assert.equal(wheel.position.z>0,i%2===1);
    wheel.rotation.set(2,.2,0);assert.ok(Math.abs(new THREE.Vector3(1,0,0).applyEuler(wheel.rotation).y)<1e-8);
  }
  setCarColor(car,'#db3333');assert.equal(car.userData.paint.color.getHexString(),'db3333');disposeCar(car);
});

test('new cooling louvres and number decals have real clearance from the body panels',()=>{
  const car=buildCar('#a2cf3e');car.updateMatrixWorld(true);const ray=new THREE.Raycaster();
  for(const side of [-1,1])for(let i=0;i<5;i++){
    ray.set(new THREE.Vector3(side*.46*1.3,3,(-.67-i*.095)*1.3),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObject(car,true).filter(h=>!h.object.material.transparent);
    const top=hits.find(h=>h.object.material.name==='intake'),body=hits.find(h=>h.object.material.name==='paint');
    assert.ok(top&&body);assert.ok(body.distance-top.distance>.025,'vents sit above the body instead of fighting for the same depth');
  }
  const number=car.getObjectByName('bodywork').children.find(o=>o.material?.name==='number');
  assert.equal(number.material.depthWrite,false);assert.equal(number.material.polygonOffset,true);
  const another=buildCar('#23bfc5');let disposed=false;another.userData.paint.addEventListener('dispose',()=>disposed=true);
  disposeCar(car);assert.equal(disposed,false,'disposing one car cannot invalidate another car or garage preview');disposeCar(another);
});
