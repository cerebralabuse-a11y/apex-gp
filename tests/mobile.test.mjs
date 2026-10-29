import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {MobileInput} from '../dist/mobile-controls.js';
import {AdaptiveResolution,renderScale} from '../dist/render-quality.js';
import {createInstanceDetail} from '../dist/instance-detail.js';

const rects={steer:{left:0,right:200,top:100,bottom:180,width:200,height:80},brake:{left:300,right:380,top:100,bottom:200,width:80,height:100},drive:{left:400,right:500,top:50,bottom:200,width:100,height:150}};

test('two thumbs can steer, accelerate, slide into ERS, brake, and coast independently',()=>{
  const input=new MobileInput();
  input.start(1,'steer',100,150,rects);input.move(1,125,150);
  assert.ok(input.steer>.2&&input.steer<.8,'steering is proportional rather than full-lock');
  assert.equal(input.throttle,0,'there is no automatic acceleration');
  input.start(2,'pedals',450,175,rects);assert.equal(input.throttle,1);assert.equal(input.boost,false);
  input.move(2,450,70);assert.equal(input.throttle,1);assert.equal(input.boost,true);assert.ok(input.steer>0);
  input.move(2,450,175,rects);assert.equal(input.boost,false);assert.equal(input.throttle,1);
  input.move(2,340,150,rects);assert.equal(input.brake,1);assert.equal(input.throttle,0);assert.equal(input.boost,false);assert.ok(input.steer>0);
  input.end(2);assert.equal(input.throttle,0);assert.equal(input.brake,0);assert.ok(input.steer>0,'lifting the right thumb does not cancel steering');
  input.end(1);assert.equal(input.steer,0);
});

test('cancelled, duplicate and out-of-bounds touches cannot leave stuck inputs',()=>{
  const input=new MobileInput();input.start(11,'steer',100,150,rects);input.move(11,1000,150,rects);assert.equal(input.steer,1);
  assert.equal(input.start(12,'steer',100,150,rects),false,'a second finger cannot steal the steering pointer');
  input.end(12);assert.equal(input.steer,1,'an unrelated release cannot clear the held pointer');
  input.start(21,'pedals',450,70,rects);input.move(21,600,300,rects);assert.equal(input.throttle,0);assert.equal(input.boost,false);
  input.move(21,450,70,rects);input.clear();input.move(21,450,70,rects);
  assert.equal(input.pointers.size,0);assert.equal(input.steer,0);assert.equal(input.throttle,0);assert.equal(input.boost,false);
});

test('mobile resolution stays within a pixel budget and adapts gradually without oscillating',()=>{
  const ratio=renderScale(2400,1080,2,1400000);assert.ok(2400*1080*ratio*ratio<=1400000.01);
  const adaptive=new AdaptiveResolution(1.5);
  for(let i=0;i<600;i++)adaptive.sample(1/30);assert.ok(adaptive.ratio<1.5&&adaptive.ratio>=.85);
  const slow=adaptive.ratio;for(let i=0;i<1800;i++)adaptive.sample(1/60);assert.ok(adaptive.ratio>slow&&adaptive.ratio<=1.5);
  const before=adaptive.ratio;adaptive.sample(5);assert.equal(adaptive.ratio,before,'a background-tab stall must not reduce quality');
});

test('mobile crowd detail retains nearby transforms/colors and restores every instance for High or overview',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial(),3),matrix=new THREE.Matrix4(),color=new THREE.Color();
  const matches=c=>color.toArray().every((v,i)=>Math.abs(v-new THREE.Color(c).toArray()[i])<1e-6);
  const positions=[1000,0,100],colors=['red','green','blue'];positions.forEach((x,i)=>{mesh.setMatrixAt(i,matrix.makeTranslation(x,2,0));mesh.setColorAt(i,new THREE.Color(colors[i]))});
  const update=createInstanceDetail(mesh,320);update(0,0,true);assert.equal(mesh.count,2);mesh.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],0);mesh.getColorAt(0,color);assert.ok(matches('green'));
  update(1000,0,true);assert.equal(mesh.count,1);mesh.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],1000);mesh.getColorAt(0,color);assert.ok(matches('red'));
  update(1000,0,false);assert.equal(mesh.count,3);positions.forEach((x,i)=>{mesh.getMatrixAt(i,matrix);assert.equal(matrix.elements[12],x);mesh.getColorAt(i,color);assert.ok(matches(colors[i]))});
});
