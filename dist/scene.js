import * as THREE from './vendor/three.module.js';
import { sampleTrack, nearestTrack } from './physics.js';

let seed = 4829;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mat = (color, roughness = .8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
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
  const paint = mat(color, .3, .22), accent = mat('#f1f1de', .4), materials = [paint];
  box(root, 1.15, .32, 3.3, paint, 0, .43, -.15);
  box(root, 1.5, .12, 3.1, carbon, 0, .24, -.3);
  for (const side of [-1, 1]) {
    const pod = box(root, .44, .43, 1.65, paint, side * .65, .52, -.55); pod.rotation.z = side * -.07;
    box(root, .45, .06, 1.4, accent, side * .67, .76, -.65);
    box(root, .35, .14, .7, carbon, side * .67, .72, -.9);
    box(root, .16, .08, .31, paint, side * .75, .87, .4);
    cylinderBetween(root, new THREE.Vector3(side * .45, .73, .2), new THREE.Vector3(side * .74, .86, .4), .025, carbon);
  }
  const noseShape = new THREE.BufferGeometry();
  const vertices = new Float32Array([-.45,.35,.65, .45,.35,.65, -.14,.29,2.3, .14,.29,2.3, -.45,.61,.65, .45,.61,.65, -.14,.44,2.3, .14,.44,2.3]);
  noseShape.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  noseShape.setIndex([0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5]);noseShape.computeVertexNormals();
  const nose = new THREE.Mesh(noseShape, paint); nose.castShadow = true; root.add(nose);
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
  box(root,2.1,.12,.65,paint,0,1.11,-2.05);box(root,2.02,.06,.22,accent,0,1.22,-2.25);
  box(root,1.3,.18,.5,carbon,0,.2,-1.94);
  const rearLight=box(root,.15,.1,.03,new THREE.MeshBasicMaterial({color:'#ff3b20'}),0,.44,-2.22);
  const wingText=panel(root,1.65,.27,signTexture('APEX GP','#e8e8d5','#1b2424'),0,1.12,-2.39);wingText.rotation.y=Math.PI;
  const numberTexture=canvasTexture(128,128,c=>{c.clearRect(0,0,128,128);c.fillStyle='#f8f4df';c.font='italic 900 85px Arial';c.textAlign='center';c.fillText(String(number),64,98)});
  const numberPlate=new THREE.Mesh(new THREE.PlaneGeometry(.47,.55),new THREE.MeshBasicMaterial({map:numberTexture,transparent:true}));numberPlate.rotation.x=-Math.PI/2;numberPlate.position.set(0,.625,.6);root.add(numberPlate);
  const wheels=[];
  for(const x of [-1.04,1.04]) for(const z of [-1.36,1.36]){
    const wheel=new THREE.Group();wheel.position.set(x,.47,z);root.add(wheel);wheels.push(wheel);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.37,20),rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
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
  return root;
}

export function disposeCar(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))});
  geometries.forEach(g=>g.dispose());
  materials.forEach(m=>{if(sharedCarMaterials.has(m))return;if(m.map)textures.add(m.map);m.dispose()});
  textures.forEach(t=>t.dispose());
}

export function createCircuit() {
  const control=[[-260,-350],[-260,-240],[-260,-100],[-260,100],[-260,210],[-160,370],[35,400],[145,290],[75,165],[215,110],[340,-35],[325,-220],[175,-340],[55,-240],[-55,-365],[-155,-425]].map(([x,z])=>new THREE.Vector3(x,0,z));
  const curve=new THREE.CatmullRomCurve3(control,true,'centripetal');
  const length=curve.getLength(),count=1600;
  const points=curve.getSpacedPoints(count).map(p=>({x:p.x,z:p.z}));
  return {points,length,step:length/count,halfWidth:9,start:200};
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.fog=new THREE.Fog('#c8d2c5',260,1800);
  const camera=new THREE.PerspectiveCamera(58,1,.15,4200);
  const ambient=new THREE.HemisphereLight('#c2dded','#7a8053',2.0);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff0cb',3.1);sun.position.set(-300,410,-220);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.near=1;sun.shadow.camera.far=1000;sun.shadow.bias=-.00035;sun.shadow.normalBias=.12;scene.add(sun,sun.target);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#6eabca')},bottom:{value:new THREE.Color('#e4dfc2')}},vertexShader:'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vP;void main(){float h=normalize(vP).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.06,.65,h)),1.);}'});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(3500,24,16),skyMaterial);scene.add(sky);
  const grassTexture=canvasTexture(256,256,c=>{c.fillStyle='#74815b';c.fillRect(0,0,256,256);for(let i=0;i<23000;i++){const a=random();c.fillStyle=a>.5?'#a1aa7026':'#31482e20';c.fillRect(random()*256,random()*256,1+random()*3,1+random()*4)}},true);grassTexture.repeat.set(180,180);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4500,4500),new THREE.MeshStandardMaterial({map:grassTexture,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
  const track=createCircuit(),{points,length}=track,count=points.length-1;
  const asphalt=canvasTexture(256,256,c=>{c.fillStyle='#454b4b';c.fillRect(0,0,256,256);for(let i=0;i<23000;i++){const k=random()>.5?'#00000013':'#ffffff11';c.fillStyle=k;c.fillRect(random()*256,random()*256,random()*1.5+.5,random()*1.5+.5)}},true);
  const roadMat=new THREE.MeshStandardMaterial({map:asphalt,roughness:.98,side:THREE.DoubleSide});
  const gravel=canvasTexture(256,256,c=>{c.fillStyle='#b1a58b';c.fillRect(0,0,256,256);for(let i=0;i<14000;i++){c.fillStyle=random()>.5?'#f3e8c333':'#574c3c22';c.fillRect(random()*256,random()*256,2,2)}},true);
  const gravelMat=new THREE.MeshStandardMaterial({map:gravel,roughness:1,side:THREE.DoubleSide});
  const curbRed=new THREE.MeshStandardMaterial({color:'#ca3e35',roughness:.9,side:THREE.DoubleSide});
  const curbWhite=new THREE.MeshStandardMaterial({color:'#dfded0',roughness:.9,side:THREE.DoubleSide});
  function ribbon(inner,outer,y,material,from=0,to=count){
    const pos=[],uv=[],indices=[];
    for(let i=from;i<=to;i++){
      const p=points[i],next=points[(i+1)%count],prev=points[(i+count-1)%count];
      const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      for(const side of [inner,outer]){pos.push(p.x+nx*side,y,p.z+nz*side);uv.push((side-inner)/(outer-inner),i*track.step/16)}
      if(i>from){const k=(i-from)*2;indices.push(k-2,k,k-1,k,k+1,k-1)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  ribbon(-24,24,-.07,gravelMat);ribbon(-9,9,0,roadMat);
  const lineMat=new THREE.MeshStandardMaterial({color:'#e2e3cb',roughness:1,side:THREE.DoubleSide});
  ribbon(-8.75,-8.62,.016,lineMat);ribbon(8.62,8.75,.016,lineMat);
  for(let i=0;i<count;i+=8){const color=(i/8)%2?curbWhite:curbRed;ribbon(-10.5,-9,.04,color,i,Math.min(i+8,count));ribbon(9,10.5,.04,color,i,Math.min(i+8,count))}
  // A few tire-darkened rubber lines give the tarmac scale without external assets.
  const rubberLine=new THREE.MeshStandardMaterial({color:'#333a38',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false});ribbon(-2,-1.65,.018,rubberLine);ribbon(1.65,2,.018,rubberLine);
  const helper=new THREE.Object3D();
  const railMat=mat('#adb8ae',.55,.45),postMat=mat('#849186',.7,.35);
  const railCount=Math.floor(length/8),rails=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,.3,8.3),railMat,railCount*4),posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,1.4,.15),postMat,railCount*2);
  let ri=0,pi=0;
  for(let i=0;i<railCount;i++)for(const side of [-1,1]){
    const p=sampleTrack(track,i*length/railCount,side*25.5);
    for(const y of [.65,1.06]){helper.position.set(p.x,y,p.z);helper.rotation.set(0,p.yaw,0);helper.updateMatrix();rails.setMatrixAt(ri++,helper.matrix)}
    helper.position.set(p.x,.6,p.z);helper.updateMatrix();posts.setMatrixAt(pi++,helper.matrix);
  }
  rails.castShadow=true;rails.receiveShadow=true;scene.add(rails,posts);
  const fenceTexture=canvasTexture(128,128,c=>{c.clearRect(0,0,128,128);c.strokeStyle='#aab9af80';c.lineWidth=1;for(let i=-128;i<256;i+=16){c.beginPath();c.moveTo(i,0);c.lineTo(i+128,128);c.stroke();c.beginPath();c.moveTo(i,0);c.lineTo(i-128,128);c.stroke()}},true);fenceTexture.repeat.set(1,1);
  const fenceMat=new THREE.MeshStandardMaterial({map:fenceTexture,transparent:true,alphaTest:.15,side:THREE.DoubleSide,color:'#c8d1c7'});
  const fences=new THREE.InstancedMesh(new THREE.PlaneGeometry(16.3,3),fenceMat,Math.floor(railCount/2)*2);let fi=0;
  for(let i=0;i<Math.floor(railCount/2);i++)for(const side of [-1,1]){const p=sampleTrack(track,i*16,side*26);helper.position.set(p.x,2.55,p.z);helper.rotation.set(0,p.yaw+Math.PI/2,0);helper.updateMatrix();fences.setMatrixAt(fi++,helper.matrix)}scene.add(fences);
  const racingLine=new THREE.InstancedMesh(new THREE.BoxGeometry(.22,.018,2.5),new THREE.MeshBasicMaterial({transparent:true,opacity:.65}),Math.floor(length/7));
  for(let i=0;i<racingLine.count;i++){
    const s=i*7,p=sampleTrack(track,s),a=sampleTrack(track,s+35),b=sampleTrack(track,s+65);
    const bend=Math.abs(Math.atan2(a.tx*b.tz-a.tz*b.tx,a.tx*b.tx+a.tz*b.tz));
    helper.position.set(p.x,.025,p.z);helper.rotation.set(0,p.yaw,0);helper.updateMatrix();racingLine.setMatrixAt(i,helper.matrix);racingLine.setColorAt(i,new THREE.Color(bend>.4?'#f97052':bend>.23?'#efd250':'#b4df66'));
  }scene.add(racingLine);
  const finishP=sampleTrack(track,track.start);
  const checker=canvasTexture(512,64,c=>{for(let x=0;x<32;x++)for(let y=0;y<4;y++){c.fillStyle=(x+y)%2?'#e9e7d9':'#252d2c';c.fillRect(x*16,y*16,16,16)}},false);
  const line=new THREE.Mesh(new THREE.PlaneGeometry(17.2,2.15),new THREE.MeshStandardMaterial({map:checker,roughness:1}));line.rotation.set(-Math.PI/2,0,-finishP.yaw);line.position.set(finishP.x,.031,finishP.z);scene.add(line);
  for(let row=0;row<5;row++)for(const side of [-1,1]){
    const p=sampleTrack(track,track.start-8-row*9-(side===1?4:0),side*3.8),g=new THREE.Group();g.position.set(p.x,.025,p.z);g.rotation.y=p.yaw;
    box(g,2.6,.01,.08,lineMat,0,0,2);for(const sx of [-1,1])box(g,.08,.01,1.3,lineMat,sx*1.3,0,1.35);scene.add(g);
  }
  const gantry=new THREE.Group();gantry.position.set(finishP.x,0,finishP.z);gantry.rotation.y=finishP.yaw;
  for(const x of [-12,12]){box(gantry,.6,8.5,.65,metal,x,4.25,0);box(gantry,1.6,.4,1.8,carbon,x,.2,0)}
  box(gantry,25,2.25,1,carbon,0,8.1,0);const gantryFace=panel(gantry,23.4,1.8,signTexture('APEX / GRAND PRIX','#192a27','#e4ed65','VALLE ROSSA  •  ITALIA'),0,8.15,-.52);gantryFace.rotation.y=Math.PI;
  const lamps=[];
  for(let i=0;i<5;i++){const lamp=box(gantry,.35,.35,.2,new THREE.MeshBasicMaterial({color:'#351b1e'}),-1.1+i*.55,6.65,-.3);lamps.push(lamp)}scene.add(gantry);
  function place(group,s,offset){const p=sampleTrack(track,s,offset);group.position.set(p.x,0,p.z);group.rotation.y=p.yaw;scene.add(group);return group}
  const pit=new THREE.Group(),pitBase=mat('#c4c2b3'),glass=mat('#3e666c',.21,.5),dark=mat('#304849',.65,.2);
  box(pit,15,7.5,150,pitBase,0,3.75,0);box(pit,15.3,.5,153,dark,0,7.65,0);box(pit,15.5,.45,152,white,0,4.4,0);
  for(let i=0;i<13;i++){
    const z=-68+i*11.3;box(pit,.08,2.5,9.4,glass,-7.56,5.9,z);box(pit,.1,2.75,8.4,carbon,-7.57,1.65,z);
    box(pit,1.4,.08,8.7,mat(i%2?'#e44837':'#dfec6b'),-8.1,3.4,z);
    box(pit,1.4,.2,.18,metal,-8.1,3.5,z-4.4);
  }
  box(pit,16,.4,156,white,0,8.7,0);box(pit,.3,2.9,153,glass,6.9,6.2,0);
  const pitSign=panel(pit,18,2.1,signTexture('APEX MOTORSPORT','#172728','#edf268'),-7.7,9,-12);pitSign.rotation.y=-Math.PI/2;
  place(pit,track.start+115,-42);
  function grandstand(s,offset,length=110){
    const stand=new THREE.Group(),seats=mat('#657168'),structure=mat('#dddacf',.85),roof=mat('#c4c6b6',.5,.2);
    for(let row=0;row<10;row++)box(stand,1.6,(row+1)*.7,length,seats,row*1.3,.35*(row+1),0);
    for(const z of [-length/2+2,0,length/2-2]){box(stand,.35,13,.35,structure,13,6.5,z);cylinderBetween(stand,new THREE.Vector3(13,12.6,z),new THREE.Vector3(-3,11.1,z),.15,metal)}
    box(stand,19,.28,length+6,roof,5,12.3,0);box(stand,.12,1,length+5,dark,-4.5,11.9,0);
    const crowdCount=Math.floor(length/1.1)*9,crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(.42,.65,.44),mat('#ffffff'),crowdCount);
    const colors=['#e8e3c1','#c44939','#1f3438','#789394','#d5b986','#eae5d8','#426477'];let k=0;
    for(let row=0;row<9;row++)for(let col=0;col<Math.floor(length/1.1);col++){
      if(k>=crowdCount)break;helper.position.set(row*1.3+.5,(row+1)*.7+.34,-length/2+col*1.1+random()*.25);helper.rotation.set(0,random(),0);helper.scale.set(1,.8+random()*.4,1);helper.updateMatrix();crowd.setMatrixAt(k,helper.matrix);crowd.setColorAt(k++,new THREE.Color(colors[Math.floor(random()*colors.length)]));
    }helper.scale.set(1,1,1);stand.add(crowd);place(stand,s,offset);if(offset<0)stand.rotateY(Math.PI);
  }
  grandstand(track.start+100,33,105);grandstand(track.start+350,40,85);grandstand(length*.44,39,75);
  const boardTextures=[signTexture('APEX GP','#e1ec6a','#243122'),signTexture('FIND YOUR LIMIT.','#203734','#eff0d7'),signTexture('VALLE ROSSA','#e2ddc7','#33463e')];
  for(let i=0;i<32;i++){
    const board=new THREE.Group();box(board,7.5,1.4,.15,carbon,0,1.15,0);panel(board,7.4,1.3,boardTextures[i%3],0,1.15,-.09).rotation.y=Math.PI;
    const p=sampleTrack(track,i*length/32,23);board.position.set(p.x,0,p.z);board.rotation.y=p.yaw+Math.PI/2;scene.add(board);
  }
  for(const [s,text] of [[330,'150'],[375,'100'],[420,'50'],[length*.41,'100'],[length*.64,'100'],[length*.78,'50']]){
    const board=new THREE.Group();box(board,.1,3,.1,metal,0,1.5,0);const face=panel(board,1.6,2,signTexture(text,'#f2f0dd','#25302d'),0,2.3,0);face.rotation.y=Math.PI;place(board,s,-13);
  }
  const mountains=new THREE.Group();
  for(let i=0;i<24;i++){
    const angle=i/24*Math.PI*2,rad=1100+random()*500,height=160+random()*300;
    const hill=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),mat(i%2?'#829a8a':'#98aa95',1));hill.scale.set(280+random()*200,height,300+random()*200);hill.position.set(Math.sin(angle)*rad,-height*.55,Math.cos(angle)*rad);hill.rotation.y=random()*6;mountains.add(hill);
  }scene.add(mountains);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.38,4,5),mat('#756b52'),430),foliage=new THREE.InstancedMesh(new THREE.ConeGeometry(2.8,9,7),mat('#3e6041'),430),leafTops=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.7,1),mat('#667d45'),430);
  let treeCount=0;
  for(let tries=0;tries<3000&&treeCount<430;tries++){
    const x=(random()-.5)*2100,z=(random()-.5)*1900;
    if(nearestTrack(track,x,z).distance<43||((x>-340&&x<-200)&&(z>-350&&z<270)))continue;
    const scale=.7+random()*1.1;
    helper.position.set(x,1.6*scale,z);helper.rotation.set(0,random()*6,0);helper.scale.set(scale,scale,scale);helper.updateMatrix();trunks.setMatrixAt(treeCount,helper.matrix);
    helper.position.y=6.1*scale;helper.updateMatrix();foliage.setMatrixAt(treeCount,helper.matrix);foliage.setColorAt(treeCount,new THREE.Color().setHSL(.27+random()*.06,.2+random()*.1,.21+random()*.12));
    helper.position.y=5.3*scale;helper.scale.set(scale,scale*.8,scale);helper.updateMatrix();leafTops.setMatrixAt(treeCount,helper.matrix);leafTops.setColorAt(treeCount,new THREE.Color().setHSL(.25+random()*.07,.25,.24+random()*.15));treeCount++;
  }
  helper.scale.set(1,1,1);trunks.count=foliage.count=leafTops.count=treeCount;foliage.castShadow=true;leafTops.castShadow=true;scene.add(trunks,foliage,leafTops);
  const cloudMat=new THREE.MeshBasicMaterial({color:'#f0eddb',transparent:true,opacity:.32,depthWrite:false});
  for(let i=0;i<20;i++){
    const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,12,6),cloudMat);cloud.position.set((random()-.5)*3500,260+random()*180,(random()-.5)*3500);cloud.scale.set(120+random()*180,8+random()*17,50+random()*100);scene.add(cloud);
  }
  const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(32,20,12),new THREE.MeshBasicMaterial({color:'#fff3c9'}));sunDisc.position.set(-1450,510,1550);scene.add(sunDisc);
  function setLighting(mode){
    const styles={golden:['#6eabca','#e4dfc2','#fff0cb',3.1,2,1.12,'#c8d2c5'],day:['#639fc5','#d6e6dd','#fff6e8',3,2.3,1.05,'#c2d4cd'],dusk:['#414c75','#cdb5ab','#e8b7a0',1.8,1.7,1.2,'#a9b5c1']},s=styles[mode];
    skyMaterial.uniforms.top.value.set(s[0]);skyMaterial.uniforms.bottom.value.set(s[1]);sun.color.set(s[2]);sun.intensity=s[3];ambient.intensity=s[4];renderer.toneMappingExposure=s[5];scene.fog.color.set(s[6]);sunDisc.visible=mode!=='day';
  }
  function setQuality(high){renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.75:1));renderer.shadowMap.enabled=high;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true})}
  return {THREE,renderer,scene,camera,track,sun,sky,racingLine,lamps,setLighting,setQuality};
}
