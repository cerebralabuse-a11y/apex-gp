import * as THREE from './vendor/three.module.js';

// Authored from the Mygale M21-F4's proportions, not a licensed CAD model.
// Local Z points forward. The 1.3 display scale preserves the game's readability.
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const surface=(color,roughness=.48,metalness=.08)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

function mesh(parent,name,geometry,material,x=0,y=0,z=0){
  const item=new THREE.Mesh(geometry,material);item.name=name;item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;
}
function box(parent,name,w,h,d,material,x=0,y=0,z=0){return mesh(parent,name,new THREE.BoxGeometry(w,h,d),material,x,y,z)}
function rod(parent,name,a,b,radius,material){
  const delta=b.clone().sub(a),item=mesh(parent,name,new THREE.CylinderGeometry(radius,radius,delta.length(),6),material);
  item.position.copy(a).add(b).multiplyScalar(.5);item.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return item;
}
// Eight-sided cross sections give the body a deliberate shoulder and undercut.
function loft(parent,name,sections,material,x=0){
  const positions=[],indices=[];
  for(const [z,width,bottom,top] of sections){
    const h=top-bottom;
    for(const [px,py] of [[-.72,0],[.72,0],[1,.2],[1,.68],[.66,1],[-.66,1],[-1,.68],[-1,.2]])positions.push(x+px*width,bottom+py*h,z);
  }
  for(let s=0;s<sections.length-1;s++)for(let i=0;i<8;i++){
    const a=s*8+i,b=s*8+(i+1)%8,c=b+8,d=a+8;indices.push(a,b,d,b,c,d);
  }
  for(let i=1;i<7;i++){indices.push(0,i+1,i);const last=(sections.length-1)*8;indices.push(last,last+i,last+i+1)}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(parent,name,geometry,material);
}
function labelTexture(number){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d');
  c.clearRect(0,0,256,256);c.fillStyle='#f4f0df';c.font='italic 900 148px Arial';c.textAlign='center';c.fillText(String(number),128,159);c.font='700 31px Arial';c.fillText('APEX / F4',128,216);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
// Batch static parts by material. Wheels and driver remain independent pivots.
function batchStatic(group){
  const groups=new Map();
  for(const child of [...group.children])if(child.isMesh&&!child.userData.keepSeparate){
    child.updateMatrix();const geometry=child.geometry.toNonIndexed?child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone():child.geometry.clone();geometry.applyMatrix4(child.matrix);
    const list=groups.get(child.material)||[];list.push(geometry);groups.set(child.material,list);group.remove(child);child.geometry.dispose();
  }
  for(const [material,list] of groups){
    const attributes={};
    for(const key of ['position','normal','uv']){
      if(!list.every(g=>g.attributes[key]))continue;
      const size=list[0].attributes[key].itemSize,total=list.reduce((n,g)=>n+g.attributes[key].array.length,0),array=new Float32Array(total);let offset=0;
      for(const g of list){array.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length}
      attributes[key]=new THREE.BufferAttribute(array,size);
    }
    const combined=new THREE.BufferGeometry();for(const [key,attribute] of Object.entries(attributes))combined.setAttribute(key,attribute);
    const item=mesh(group,'batched-'+material.name,combined,material);item.userData.staticBatch=true;list.forEach(g=>g.dispose());
  }
}

export function buildCar(color,number=27){
  const root=new THREE.Group();root.name='M21-inspired-F4';
  const paint=surface(color,.35,.2),ivory=surface('#f2eddb',.42,.1),carbon=surface('#1b2026',.62,.13),rubber=surface('#151719',.94,0),alloy=surface('#a5abb0',.31,.8),dark=surface('#070c10',.8,0),yellow=surface('#d5ad4c',.65,0);
  [paint,ivory,carbon,rubber,alloy,dark,yellow].forEach((m,i)=>m.name=['paint','ivory','carbon','rubber','alloy','intake','tire-mark'][i]);
  const body=new THREE.Group();body.name='bodywork';root.add(body);
  loft(body,'carbon-floor',[[-1.83,.54,.065,.095],[-1.3,.69,.065,.095],[.34,.69,.065,.095],[.75,.32,.065,.095]],carbon);
  loft(body,'raised-tapered-nose',[[.52,.3,.18,.55],[.92,.245,.2,.505],[1.52,.14,.21,.397],[2.09,.095,.21,.3]],paint);
  loft(body,'nose-center-stripe',[[.54,.045,.551,.56],[.92,.042,.506,.515],[1.52,.025,.398,.407],[2.04,.02,.303,.312]],ivory);
  // An open cockpit rather than a sphere resting on a solid central box.
  loft(body,'cockpit-undertray',[[-.69,.3,.12,.31],[.55,.3,.12,.31]],carbon);
  for(const side of [-1,1]){
    loft(body,'cockpit-shoulder',[[-.75,.09,.2,.61],[-.32,.075,.2,.57],[.28,.075,.2,.54],[.62,.06,.2,.51]],paint,side*.285);
    loft(body,'sidepod',[[-1.61,.095,.12,.3],[-1.15,.2,.12,.41],[-.22,.205,.12,.48],[.32,.18,.16,.48]],paint,side*.455);
    box(body,'sidepod-intake',.29,.205,.026,dark,side*.465,.329,.339);
    box(body,'intake-splitter',.29,.018,.04,carbon,side*.465,.329,.355);
    box(body,'sidepod-ivory-belt',.018,.035,1.33,ivory,side*.662,.35,-.42);
    for(let i=0;i<5;i++){
      const vent=box(body,'engine-cooling-louvre',.16,.018,.03,dark,side*.46,.472-i*.00715,-.67-i*.095);vent.rotation.z=side*.1;
    }
    rod(body,'mirror-stalk',v(side*.3,.49,.34),v(side*.52,.62,.46),.012,carbon);
    loft(body,'mirror',[[.39,.055,.585,.65],[.51,.055,.585,.65]],paint,side*.53);
    box(body,'mirror-glass',.09,.045,.008,alloy,side*.53,.616,.382);
    rod(body,'halo-rear-support',v(side*.29,.56,-.52),v(side*.29,.81,-.42),.026,carbon);
  }
  loft(body,'engine-cover',[[-1.77,.1,.18,.28],[-1.3,.2,.17,.42],[-.76,.245,.18,.66],[-.52,.22,.2,.7]],paint);
  loft(body,'airbox-rollhoop',[[-.96,.075,.46,.69],[-.72,.14,.48,.955],[-.48,.115,.5,.93]],paint);
  box(body,'airbox-inlet',.17,.17,.013,dark,0,.826,-.467);
  box(body,'airbox-divider',.016,.174,.02,carbon,0,.826,-.453);
  rod(body,'rollhoop-tow-pin',v(-.055,.955,-.64),v(.055,.955,-.64),.016,alloy);
  const haloCurve=new THREE.CatmullRomCurve3([v(-.29,.81,-.43),v(-.34,.83,-.12),v(-.27,.84,.32),v(0,.84,.48),v(.27,.84,.32),v(.34,.83,-.12),v(.29,.81,-.43)]);
  mesh(body,'safety-halo',new THREE.TubeGeometry(haloCurve,28,.025,7,false),carbon);
  rod(body,'halo-center-pillar',v(0,.475,.61),v(0,.84,.48),.024,carbon);
  // A modest F4 front wing and two-element rear wing; no F1 bargeboards.
  const front=box(body,'front-wing-mainplane',1.66,.035,.32,carbon,0,.143,1.97);front.rotation.x=-.045;
  const frontFlap=box(body,'front-wing-flap',1.58,.035,.145,paint,0,.205,1.84);frontFlap.rotation.x=-.14;
  for(const side of [-1,1]){
    box(body,'front-wing-endplate',.025,.235,.43,paint,side*.847,.207,1.955);
    box(body,'front-wing-footplate',.11,.018,.43,carbon,side*.803,.097,1.955);
    rod(body,'front-wing-pylon',v(side*.075,.21,1.8),v(side*.075,.34,1.8),.015,carbon);
    box(body,'rear-wing-endplate',.025,.43,.46,paint,side*.67,.69,-1.945);
    box(body,'rear-wing-ivory-tip',.03,.033,.46,ivory,side*.67,.915,-1.945);
    box(body,'rear-wing-pylon',.026,.56,.075,carbon,side*.19,.465,-1.88);
    box(body,'rear-diffuser-fence',.015,.12,.43,carbon,side*.46,.117,-1.72);
  }
  const rearPlane=box(body,'rear-wing-mainplane',1.32,.045,.32,carbon,0,.7,-1.95);rearPlane.rotation.x=.1;
  const rearFlap=box(body,'rear-wing-upper-flap',1.32,.038,.17,paint,0,.848,-2.01);rearFlap.rotation.x=.22;
  const diffuser=box(body,'rear-diffuser-ramp',1.03,.035,.48,carbon,0,.12,-1.73);diffuser.rotation.x=-.14;
  for(const x of [-.25,0,.25])box(body,'diffuser-strake',.015,.105,.43,carbon,x,.105,-1.73);
  rod(body,'exhaust',v(.13,.36,-1.58),v(.13,.38,-1.88),.037,alloy);
  const rearLight=box(root,'rain-light',.1,.07,.025,new THREE.MeshBasicMaterial({color:'#ff3427'}),0,.29,-1.974);rearLight.userData.keepSeparate=true;
  for(const side of [-1,1])for(const z of [-1.28,1.25]){
    const frontAxle=z>0,outer=side*(frontAxle?.708:.719),y=frontAxle?.285:.295;
    for(const h of [.17,.32]){
      rod(body,'wishbone-front',v(side*.23,h,z+.22),v(outer,y,z),.012,carbon);
      rod(body,'wishbone-rear',v(side*.23,h,z-.25),v(outer,y,z),.012,carbon);
    }
    rod(body,'pushrod',v(side*.25,.47,z-.13),v(outer,y-.045,z),.013,alloy);
    rod(body,'trackrod',v(side*.28,.26,z+.08),v(outer,y,z+.08),.009,alloy);
  }
  const helmet=mesh(root,'driver-helmet',new THREE.SphereGeometry(.143,20,12),surface('#ece6ce',.3,.12),0,.747,-.115);helmet.scale.set(1,1.08,1.08);helmet.userData.keepSeparate=true;
  const visor=mesh(root,'driver-visor',new THREE.SphereGeometry(.146,20,8,0,Math.PI*2,Math.PI*.36,Math.PI*.23),surface('#183b50',.12,.7),0,.747,-.115);visor.scale.copy(helmet.scale);visor.userData.keepSeparate=true;
  const shoulder=box(body,'driver-shoulders',.35,.12,.16,carbon,0,.57,-.23);shoulder.rotation.x=.15;
  const steering=mesh(body,'steering-wheel',new THREE.TorusGeometry(.095,.014,5,16),carbon,0,.56,.19);steering.rotation.x=-.25;
  const label=new THREE.MeshBasicMaterial({map:labelTexture(number),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});label.name='number';
  const noseNumber=mesh(body,'nose-number',new THREE.PlaneGeometry(.21,.25),label,0,.508,1.04);noseNumber.rotation.x=-Math.PI/2+.178;
  for(const side of [-1,1]){
    const sideNumber=mesh(body,'side-number',new THREE.PlaneGeometry(.31,.31),label,side*.68,.285,-.22);sideNumber.rotation.y=side*Math.PI/2;
  }
  batchStatic(body);
  const wheels=[];
  for(const side of [-1,1])for(const z of [-1.28,1.25]){
    const front=z>0,radius=front?.285:.295,width=front?.22:.29,x=side*(front?.748:.716);
    const wheel=new THREE.Group();wheel.name=(side<0?'left-':'right-')+(front?'front':'rear');wheel.position.set(x,radius,z);wheel.rotation.order='YXZ';root.add(wheel);wheels.push(wheel);
    const profile=[v(.18,-width*.5,0),v(radius*.91,-width*.5,0),v(radius,-width*.38,0),v(radius,width*.38,0),v(radius*.91,width*.5,0),v(.18,width*.5,0)].map(p=>new THREE.Vector2(p.x,p.y));
    const tire=mesh(wheel,'slick-tire',new THREE.LatheGeometry(profile,24),rubber);tire.rotation.z=Math.PI/2;
    for(const face of [-1,1]){
      const cavity=mesh(wheel,'wheel-recess',new THREE.CylinderGeometry(.18,.18,.012,20),dark,face*(width*.5-.014),0,0);cavity.rotation.z=Math.PI/2;
      const rim=mesh(wheel,'alloy-rim',new THREE.TorusGeometry(.159,.012,6,20),alloy,face*(width*.5+.004),0,0);rim.rotation.y=Math.PI/2;
      const lettering=mesh(wheel,'sidewall-compound-ring',new THREE.TorusGeometry(radius*.825,.004,4,24),yellow,face*(width*.5+.001),0,0);lettering.rotation.y=Math.PI/2;
      for(let spoke=0;spoke<8;spoke++){
        const a=spoke*Math.PI/4;rod(wheel,'wheel-spoke',v(face*(width*.5+.004),Math.sin(a)*.045,Math.cos(a)*.045),v(face*(width*.5+.004),Math.sin(a)*.149,Math.cos(a)*.149),.012,alloy);
      }
      const hub=mesh(wheel,'center-lock',new THREE.CylinderGeometry(.035,.035,.023,8),side<0?ivory:yellow,face*(width*.5+.015),0,0);hub.rotation.z=Math.PI/2;
    }
    batchStatic(wheel);
  }
  root.scale.setScalar(1.3);
  root.userData={paint,materials:[paint],wheels,rearLight,helmet,visor,wheelRadius:.377,model:'Mygale M21-F4 inspired',displayScale:1.3};
  return root;
}

export function setCarColor(root,color){root.userData.paint.color.set(color)}

export function disposeCar(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>{if(m.map)textures.add(m.map);m.dispose()});textures.forEach(t=>t.dispose());
}
