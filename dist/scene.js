import * as THREE from './vendor/three.module.js';


let seed = 4829;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mat = (color, roughness = .95, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading:true });
const rubber = mat('#14181b'), carbon = mat('#1b2226', .46, .2), white = mat('#e8e9db'), metal = mat('#84928f', .4, .7);
const sharedCarMaterials = new Set([rubber, carbon, white, metal]);

function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function cylinderBetween(parent, a, b, radius, material) {
  const delta = b.clone().sub(a), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  parent.add(mesh); return mesh;
}
function canvasTexture(width, height, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  draw(c.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8; return texture;
}
function signTexture(text, bg = '#172424', fg = '#e7f256', sub = '') {
  return canvasTexture(1024, 192, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg;
    c.font = 'italic 900 88px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, sub ? 75 : h / 2);
    if (sub) { c.font = '500 23px Arial'; c.fillStyle = '#d2dbcc'; c.fillText(sub, w / 2, 146); }
  });
}
function panel(parent, width, height, texture, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .75, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

export function buildCar(color, number = 27) {
  const root = new THREE.Group();
  const paint = mat(color), accent = mat('#f4d737'), materials = [paint];
  const cyan=mat('#23bfc5'),pink=mat('#e95c9d'),purple=mat('#8456ba'),lime=mat('#a4d63c');
  box(root, 1.15, .32, 3.3, paint, 0, .43, -.15);
  box(root, 1.5, .12, 3.1, carbon, 0, .24, -.3);
  for (const side of [-1, 1]) {
    const pod = box(root, .44, .43, 1.65, side<0?purple:cyan, side * .65, .52, -.55); pod.rotation.z = side * -.07;
    box(root, .45, .06, 1.4, accent, side * .67, .76, -.65);
    box(root, .35, .14, .7, carbon, side * .67, .72, -.9);
    box(root, .16, .08, .31, paint, side * .75, .87, .4);
    cylinderBetween(root, new THREE.Vector3(side * .45, .73, .2), new THREE.Vector3(side * .74, .86, .4), .025, carbon);
  }
  const noseShape = new THREE.BufferGeometry();
  const vertices = new Float32Array([-.45,.35,.65, .45,.35,.65, -.14,.29,2.3, .14,.29,2.3, -.45,.61,.65, .45,.61,.65, -.14,.44,2.3, .14,.44,2.3]);
  noseShape.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  noseShape.setIndex([0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5]);noseShape.computeVertexNormals();
  const nose = new THREE.Mesh(noseShape, lime); nose.castShadow = true; root.add(nose);
  const stripeColors=['#ed574e','#f2a338','#efd936','#72c53b','#20b9b4','#6d5bbc'];
  const stripeTexture=canvasTexture(192,64,c=>stripeColors.forEach((color,i)=>{c.fillStyle=color;c.fillRect(i*32,0,32,64)}));
  const stripes=new THREE.Mesh(new THREE.PlaneGeometry(1.11,2.55),new THREE.MeshStandardMaterial({map:stripeTexture,roughness:.95}));stripes.rotation.x=-Math.PI/2;stripes.position.set(0,.64,-.22);root.add(stripes);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 10), carbon); cockpit.scale.set(.76,.36,1.35);cockpit.position.set(0,.7,-.15);root.add(cockpit);
  const cover = new THREE.Mesh(new THREE.ConeGeometry(.47,1.45,8),paint);cover.rotation.x=-Math.PI/2;cover.scale.z=.7;cover.position.set(0,.73,-1.12);cover.castShadow=true;root.add(cover);
  box(root,.045,.6,1.2,paint,0,.91,-1.19);
  const airbox = new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,.3,8),paint);airbox.position.set(0,1.1,-.63);root.add(airbox);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),mat('#ecf049',.3));helmet.scale.set(1,1.1,1);helmet.position.set(0,.9,-.13);root.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.226,16,8,0,Math.PI*2,Math.PI*.35,Math.PI*.28),mat('#161f2a',.15,.7));visor.position.copy(helmet.position);root.add(visor);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.43,.035,6,24),carbon);halo.rotation.x=Math.PI/2;halo.scale.y=1.43;halo.position.set(0,1.04,-.1);root.add(halo);
  cylinderBetween(root,new THREE.Vector3(0,.58,.6),new THREE.Vector3(0,1.04,.49),.032,carbon);
  box(root,2.28,.07,.37,carbon,0,.2,2.14);box(root,2.13,.065,.28,paint,0,.32,2.09);
  box(root,1.95,.055,.2,paint,0,.4,2.03);
  for(const side of [-1,1]){
    box(root,.06,.37,.65,paint,side*1.13,.33,2.1);
    box(root,.06,.68,.72,carbon,side*1.05,.8,-2.02);
    box(root,.07,.63,.15,carbon,side*.49,.65,-2.08);
  }
  box(root,2.1,.12,.65,pink,0,1.11,-2.05);box(root,2.02,.06,.22,accent,0,1.22,-2.25);
  box(root,1.3,.18,.5,carbon,0,.2,-1.94);
  const rearLight=box(root,.15,.1,.03,new THREE.MeshBasicMaterial({color:'#ff3b20'}),0,.44,-2.22);
  const numberTexture=canvasTexture(128,128,c=>{c.clearRect(0,0,128,128);c.fillStyle='#f8f4df';c.font='italic 900 85px Arial';c.textAlign='center';c.fillText(String(number),64,98)});
  const numberPlate=new THREE.Mesh(new THREE.PlaneGeometry(.47,.55),new THREE.MeshBasicMaterial({map:numberTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));numberPlate.rotation.x=-Math.PI/2;numberPlate.position.set(0,.66,.6);root.add(numberPlate);
  const wheels=[];
  for(const x of [-1.04,1.04]) for(const z of [-1.36,1.36]){
    const wheel=new THREE.Group();wheel.rotation.order='YXZ';wheel.position.set(x,.47,z);root.add(wheel);wheels.push(wheel);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.37,12),rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
    for(const side of [-1,1]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.355,.018,5,24),mat('#ddd247'));ring.rotation.y=Math.PI/2;ring.position.x=side*.191;wheel.add(ring);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.016,12),metal);hub.rotation.z=Math.PI/2;hub.position.x=side*.197;wheel.add(hub);
      const dot=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.023,8),carbon);dot.rotation.z=Math.PI/2;dot.position.x=side*.21;wheel.add(dot);
    }
    for(const dy of [.32,.53]){
      cylinderBetween(root,new THREE.Vector3(Math.sign(x)*.39,dy,z-.4),new THREE.Vector3(x,.48,z),.025,carbon);
      cylinderBetween(root,new THREE.Vector3(Math.sign(x)*.39,dy,z+.3),new THREE.Vector3(x,.48,z),.025,carbon);
    }
  }
  root.userData={paint,materials,wheels,rearLight,helmet,visor};
  root.scale.setScalar(1.3);
  return root;
}

export function disposeCar(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))});
  geometries.forEach(g=>g.dispose());
  materials.forEach(m=>{if(sharedCarMaterials.has(m))return;if(m.map)textures.add(m.map);m.dispose()});
  textures.forEach(t=>t.dispose());
}

export { createCircuit } from './track.js';
export { createLakesideWorld as createWorld } from './lakeside.js';

export function drivingCameraTargets(car,mode,aspect,target,look){
  const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),lead=Math.min(car.speed*.025,1.5),fit=Math.max(1,Math.min(1.7,1/aspect));
  if(mode===0){const ahead=aspect<1?8:14,side=aspect<1?0:6;target.set(car.x-fx*(22*fit-lead)-fz*9*fit,13*fit,car.z-fz*(22*fit-lead)+fx*9*fit);look.set(car.x+fx*ahead+fz*side,0,car.z+fz*ahead-fx*side)}
  else if(mode===1){target.set(car.x+fx*.85,1.48,car.z+fz*.85);look.set(car.x+fx*60,1.4,car.z+fz*60)}
  else{target.set(car.x-fx*(12*fit-lead),6.5*fit,car.z-fz*(12*fit-lead));look.set(car.x+fx*8,1.1,car.z+fz*8)}
  return(mode===1?68:mode===2?60:50)+car.speed*.025+(car.boost?2:0);
}
