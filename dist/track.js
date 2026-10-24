import * as THREE from './vendor/three.module.js';

export function createCircuit() {
  const control=[[-250,-400],[-250,-260],[-250,0],[-245,240],[-180,390],[20,440],[230,350],[300,140],[280,-80],[140,-320],[-30,-360],[-130,-290],[-205,-390]].map(([x,z])=>new THREE.Vector3(x,0,z));
  const curve=new THREE.CatmullRomCurve3(control,true,'centripetal');
  const length=curve.getLength(),count=1600;
  return {points:curve.getSpacedPoints(count).map(p=>({x:p.x,z:p.z})),length,step:length/count,halfWidth:9,wallOffset:8.3,start:250,id:'jewel-lake-v1'};
}
