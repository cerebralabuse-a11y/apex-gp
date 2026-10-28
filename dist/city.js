import * as THREE from './vendor/three.module.js';
import { mapToWorld, MAP_SCALE } from './track.js';
import {nearestTrack,sampleTrack} from './physics.js';
import {clipPolygon} from './map-geometry.js';

// All placements share the circuit reference's map coordinate system.
export function buildNaviMumbai(scene,track){
  const cityRoot=new THREE.Group();scene.add(cityRoot);
  const materials=new Map(),m=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.95,flatShading:true}));return materials.get(c)};
  const cream=m('#f0d6a5'),roof=m('#cf8762'),blue=m('#4d9ab4'),glass=m('#487c99'),dark=m('#424b53'),sand=m('#ddc38b');
  const labels=[];
  function box(g,w,h,d,mat,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o}
  function cylinder(g,rt,rb,h,n,mat,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,n),mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o}
  function group(u,v,angle=0){const g=new THREE.Group(),p=mapToWorld(u,v);g.position.set(p.x,0,p.z);g.rotation.y=angle;cityRoot.add(g);return g}
  function line(g,a,b,r,mat){const d=b.clone().sub(a),o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),6),mat);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.add(o);return o}
  function text(g,title,w,h,x,y,z,color='#fff0bf',bg='#285b52'){
    const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.font='bold 68px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title,512,68,990);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,roughness:1}));o.position.set(x,y,z);g.add(o);return o;
  }
  function label(title,u,v,y=12){const p=mapToWorld(u,v);labels.push({title,x:p.x,z:p.z,y})}
  function road(coords,width=8,walking=false){
    for(let i=1;i<coords.length;i++){
      const a=mapToWorld(...coords[i-1]),b=mapToWorld(...coords[i]),d=Math.hypot(b.x-a.x,b.z-a.z),g=new THREE.Group();g.position.set((a.x+b.x)/2,0,(a.z+b.z)/2);g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);cityRoot.add(g);
      // Background streets stay above terrain but below the racing asphalt.
      box(g,width+5,.1,d+3,sand,0,-.105,0);box(g,width,.02,d+1,walking?m('#d4b890'):m('#666160'),0,-.05,0);
      if(!walking)for(let z=-d/2+5;z<d/2;z+=13)box(g,.22,.005,5,cream,0,-.0325,z);
    }
  }
  road([[105,251],[174,232],[267,235],[363,248],[377,287]]);
  road([[171,233],[174,190]]);road([[228,235],[230,190]]);road([[289,238],[291,194]]);
  road([[400,404],[445,448],[478,502],[470,523],[338,528],[215,528],[83,524],[30,486]]);
  road([[319,481],[347,511],[338,528]]);road([[370,425],[413,475],[416,525]]);
  road([[119,434],[87,471],[83,524]]);road([[151,446],[142,521]]);road([[187,455],[193,522]]);
  road([[14,307],[-12,346],[-27,426],[-22,503]]);
  road([[152,306],[169,324],[194,341],[216,347],[241,347],[261,338]],3,true);
  road([[215,333],[216,347],[223,359]],3,true);
  road([[288,370],[312,375],[332,380],[352,389]],3,true);
  // Residential blocks: warm plaster, hipped terracotta roofs, recessed windows.
  function house(u,v,w,h,d,color,angle=0){
    const g=group(u,v,angle);box(g,w,h,d,m(color),0,h/2,0);box(g,w+1.4,1,d+1.4,cream,0,h,0);
    if(h<33){const r=new THREE.Mesh(new THREE.ConeGeometry(1,7,4),roof);r.scale.set(w*.76,1,d*.76);r.rotation.y=Math.PI/4;r.position.y=h+3.5;r.castShadow=true;g.add(r)}else box(g,w*.4,3,d*.4,cream,0,h+1.5,0);
    for(const s of [-1,1])for(let x=-w/2+3;x<w/2-1;x+=5)for(let y=4;y<h-2;y+=6)box(g,1.5,2,.15,m('#827974'),x,y,s*(d/2+.04));
    return g;
  }
  let seed=8274;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const plaster=['#e6c89b','#e3ceac','#eddbb2','#d8b69a','#f0d5ab'];
  const homes=[];
  for(let row=0;row<2;row++)for(let col=0;col<9;col++)homes.push([136+col*26,196+row*20]);
  for(let row=0;row<2;row++)for(let col=0;col<6;col++)homes.push([99+col*21,473+row*29]);
  for(let row=0;row<2;row++)for(let col=0;col<5;col++)homes.push([351+col*24,493+row*20]);
  [[411,322],[417,349],[423,376],[364,271],[318,269],[278,269],[8,397],[-4,455],[51,473]].forEach(p=>homes.push(p));
  for(const [u,v] of homes){const p=mapToWorld(u,v);let near=Infinity;for(let i=0;i<track.points.length;i+=5)near=Math.min(near,Math.hypot(p.x-track.points[i].x,p.z-track.points[i].z));if(near<35)continue;house(u,v,16+rnd()*11,15+rnd()*35,16+rnd()*10,plaster[Math.floor(rnd()*5)],(rnd()-.5)*.15)}
  // Blue circular gymkhana on the northern urban edge.
  const gym=group(253,217);cylinder(gym,22,22,23,24,blue,0,11.5);cylinder(gym,24,24,2,24,cream,0,24);
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;box(gym,.6,21,.6,cream,Math.cos(a)*22,11.5,Math.sin(a)*22)}
  label('NERUL GYMKHANA',253,217,33);
  // Temple: stepped sandstone podium, carved arches, four satellite spires.
  const temple=group(335,397,.12);box(temple,63,1.2,58,sand,0,.6);box(temple,45,6,42,cream,0,4);box(temple,37,21,33,m('#d6ad78'),0,17.5);
  for(let level=0;level<3;level++)box(temple,40-level*4,2,36-level*4,cream,0,11+level*8);
  for(const x of [-12,-6,0,6,12])for(const z of [-16.6,16.6]){box(temple,2.5,4,.18,dark,x,17,z);box(temple,2.5,3,.18,dark,x,25,z)}
  for(let step=0;step<5;step++)box(temple,18,1,4+step*2,sand,0,.8+step,-24+step);
  cylinder(temple,9,13,7,4,cream,0,32);cylinder(temple,.2,10,22,8,m('#d9b276'),0,46);cylinder(temple,.35,.5,4,6,m('#c68736'),0,59);
  for(const x of [-13,13])for(const z of [-11,11]){cylinder(temple,4,5,5,8,cream,x,31,z);cylinder(temple,0,4.5,14,8,m('#d9b276'),x,40,z)}
  label('LAKESIDE TEMPLE',335,397,64);
  // East-side glass complex: five offset glazed wings on a common podium.
  const office=group(421,434,-.64);box(office,133,5,57,cream,0,2.5);box(office,125,6,48,sand,0,8);
  for(let i=0;i<5;i++){
    const x=(i-2)*24,h=49+(i%2)*11,z=(i%2)*5;
    box(office,23,h,32,glass,x,13+h/2,z);box(office,24,2,34,cream,x,h+14,z);box(office,12,5,18,cream,x,h+17,z);
    for(let dx=-10;dx<=10;dx+=5)box(office,.45,h,32.6,m('#aac4c8'),x+dx,13+h/2,z);
    for(let y=18;y<h+13;y+=6){box(office,23.2,.45,32.4,blue,x,y,z)}
    for(const side of [-1,1])box(office,1.6,h,33,cream,x+side*11.4,13+h/2,z);
  }
  label('PALM BEACH BUSINESS DISTRICT',421,434,88);
  // Sports academy with a blue-roofed pavilion, running oval and tennis courts.
  const sports=group(354,469,-.65);sports.scale.setScalar(1.25);sports.updateMatrixWorld(true);
  const sportsRoad=nearestTrack(track,sports.position.x,sports.position.z),edge=sampleTrack(track,sportsRoad.s,13),normal=new THREE.Vector3(-edge.tz,0,edge.tx);
  const sportsDistance=p=>{const v=sports.localToWorld(new THREE.Vector3(p.x,0,p.z));return(v.x-edge.x)*normal.x+(v.z-edge.z)*normal.z};
  const sportsOutline=(w,d)=>clipPolygon([{x:-w/2,z:-d/2},{x:w/2,z:-d/2},{x:w/2,z:d/2},{x:-w/2,z:d/2}],sportsDistance);
  function sportsSurface(w,d,height,depth,mat){
    const points=sportsOutline(w,d),shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,-p.z)));
    const geometry=depth?new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    const mesh=new THREE.Mesh(geometry,mat);mesh.rotation.x=-Math.PI/2;mesh.position.y=height;mesh.castShadow=mesh.receiveShadow=true;sports.add(mesh);
  }
  sportsSurface(102,80,0,.8,sand);sportsSurface(94,72,.91,0,m('#769a49'));
  const academy=new THREE.Group();sports.add(academy);box(academy,63,12,16,cream,0,7,-26);box(academy,66,1.5,19,blue,0,13.8,-26);
  for(let x=-27;x<=27;x+=6){box(academy,2.4,5,.15,glass,x,7,-17.9);box(academy,2.4,4,.15,glass,x,8,-34.1);box(academy,.8,11,1,roof,x,6.5,-17.5)}
  text(academy,'NAVI MUMBAI SPORTS ACADEMY',52,3,0,12,-17.8);
  const ovalShape=new THREE.Shape();ovalShape.absellipse(-17,9,24,15,0,Math.PI*2,false,0);
  const oval=new THREE.Mesh(new THREE.ShapeGeometry(ovalShape,36),m('#d98a39'));oval.rotation.x=-Math.PI/2;oval.position.y=1;sports.add(oval);
  const innerShape=new THREE.Shape();innerShape.absellipse(-17,9,17,8,0,Math.PI*2,false,0);
  const inner=new THREE.Mesh(new THREE.ShapeGeometry(innerShape,36),m('#159f9b'));inner.rotation.x=-Math.PI/2;inner.position.y=1.05;sports.add(inner);
  for(const radius of [20,22]){const pts=Array.from({length:65},(_,i)=>new THREE.Vector3(-17+Math.cos(i/64*Math.PI*2)*radius,1.08,-9+Math.sin(i/64*Math.PI*2)*(radius-9)));sports.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#f9df76'})))}
  for(let iz=0;iz<2;iz++){
    const z=-2+iz*23;box(sports,27,.08,20,m('#31a99d'),30,1,z);
    for(const x of [17,43])box(sports,.18,.04,19,cream,x,1.07,z);
    for(const dz of [-9,0,9])box(sports,26,.04,.18,cream,30,1.07,z+dz);
    box(sports,.1,1,20,cream,30,1.6,z);
  }
  const sportsFence=sportsOutline(100,80);
  sportsFence.forEach((a,i)=>{const b=sportsFence[(i+1)%sportsFence.length],wall=box(sports,.6,3,Math.hypot(b.x-a.x,b.z-a.z),roof,(a.x+b.x)/2,2,(a.z+b.z)/2);wall.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)});
  label('SPORTS ACADEMY',354,469,25);
  // Karave gateway on the southern approach, deliberately outside the racing envelope.
  const gate=group(276,495,-.15);for(const x of [-13,13])box(gate,5,12,6,cream,x,6);box(gate,33,5,8,cream,0,14.5);box(gate,35,1.2,10,sand,0,17.5);text(gate,'KARAVE',25,3,0,14.5,4.1,'#604c3a','#efd6a5');label('KARAVE',276,495,23);
  // Pink flamingo sculpture on the Jewel peninsula, beside the diamond monument.
  const bird=group(237,338,.6),pink=m('#df6a8b');
  const body=new THREE.Mesh(new THREE.IcosahedronGeometry(4,1),pink);body.scale.set(.75,1,1.65);body.position.set(0,13,0);bird.add(body);
  line(bird,new THREE.Vector3(-1.3,0,0),new THREE.Vector3(-1.3,11,0),.23,pink);line(bird,new THREE.Vector3(1.3,0,-2),new THREE.Vector3(1.3,11,0),.23,pink);
  const neckCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,14,3),new THREE.Vector3(0,19,5),new THREE.Vector3(0,23,3),new THREE.Vector3(0,26,4.5)]);
  bird.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve,16,.9,6,false),pink));const head=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6,1),pink);head.position.set(0,26,5.2);bird.add(head);line(bird,new THREE.Vector3(0,26,6),new THREE.Vector3(0,24,8),.65,cream);line(bird,new THREE.Vector3(0,24,8),new THREE.Vector3(0,23,8.2),.55,dark);
  label('JEWEL OF NAVI MUMBAI',220,331,34);
  const sign=group(220,350,.15);for(const x of [-25,25])box(sign,.5,4,.5,cream,x,2);text(sign,'JEWEL OF NAVI MUMBAI',56,4,0,5.5,0);
  // Palms: faceted trunks and long, angular fronds rather than conical trees.
  const palmSites=[];
  for(let i=0;i<track.length;i+=37){const j=Math.floor(i/track.step),p=track.points[j],q=track.points[j+1],d=Math.hypot(q.x-p.x,q.z-p.z);palmSites.push({x:p.x-(q.z-p.z)/d*25,z:p.z+(q.x-p.x)/d*25})}
  for(const [u,v] of [[213,343],[225,345],[244,341],[316,395],[354,406],[365,467],[338,470],[270,489]])palmSites.push(mapToWorld(u,v));
  const trunkGeo=new THREE.CylinderGeometry(.35,.7,12,6),frondGeo=new THREE.ConeGeometry(1,1,3),trunks=new THREE.InstancedMesh(trunkGeo,m('#8b7048'),palmSites.length),fronds=new THREE.InstancedMesh(frondGeo,m('#527733'),palmSites.length*7),dummy=new THREE.Object3D();
  palmSites.forEach((p,i)=>{dummy.position.set(p.x,6,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<7;j++){const a=j/7*Math.PI*2;dummy.position.set(p.x+Math.sin(a)*3,12.2,p.z+Math.cos(a)*3);dummy.rotation.set(Math.PI/2+.25,a,0);dummy.scale.set(1.1,6,1);dummy.updateMatrix();fronds.setMatrixAt(i*7+j,dummy.matrix)}});trunks.castShadow=fronds.castShadow=true;cityRoot.add(trunks,fronds);
  temple.scale.setScalar(1.5);office.scale.setScalar(1.35);sports.scale.setScalar(1.25);bird.scale.setScalar(1.5);
  cityRoot.updateMatrixWorld(true);
  const batches=new Map(),originals=[];
  cityRoot.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const geo=o.geometry.clone().applyMatrix4(o.matrixWorld),g=geo.index?geo.toNonIndexed():geo;
    if(!batches.has(o.material))batches.set(o.material,{position:[],normal:[],uv:[]});const b=batches.get(o.material);
    for(const key of ['position','normal','uv'])if(g.attributes[key])b[key].push(g.attributes[key].array);
    originals.push(o);if(g!==geo)geo.dispose();g.dispose();
  });
  for(const o of originals){o.parent.remove(o);o.geometry.dispose()}
  for(const [mat,b] of batches){const geometry=new THREE.BufferGeometry();for(const [key,size] of [['position',3],['normal',3],['uv',2]]){const chunks=b[key];if(!chunks.length)continue;const merged=new Float32Array(chunks.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of chunks){merged.set(a,offset);offset+=a.length}geometry.setAttribute(key,new THREE.BufferAttribute(merged,size))}const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh)}
  return{labels};
}
