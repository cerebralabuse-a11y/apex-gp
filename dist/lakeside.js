import * as THREE from './vendor/three.module.js';
import { createCircuit } from './track.js';
import { sampleTrack, nearestTrack } from './physics.js';

export function createLakesideWorld(canvas) {
  let seed=73643;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true});
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.fog=new THREE.Fog('#d8b3a8',850,2400);
  const camera=new THREE.PerspectiveCamera(50,1,.2,3600);
  const ambient=new THREE.HemisphereLight('#ffe5c5','#ada48d',1.9);scene.add(ambient,new THREE.AmbientLight('#b9c1e3',1));
  const sun=new THREE.DirectionalLight('#ffd3a1',2.65);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:1200});sun.shadow.bias=-.00012;sun.shadow.normalBias=.025;sun.position.set(300,230,300);scene.add(sun,sun.target);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms:{top:{value:new THREE.Color('#cd7e85')},bottom:{value:new THREE.Color('#ffb18b')}},vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform vec3 top;uniform vec3 bottom;varying vec3 vPosition;
    void main(){float h=normalize(vPosition).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.04,.52,h)),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,24,12),skyMaterial);scene.add(sky);
  const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(115,12,8),new THREE.MeshBasicMaterial({color:'#fff1b0',toneMapped:false,fog:false}));sunDisc.position.set(1680,190,1200);scene.add(sunDisc);
  const track=createCircuit(),{length,points}=track;
  const grass=material('#476b32'),road=material('#4b4146'),paving=material('#c48068'),cream=material('#d6c8bc'),wall=material('#7c7e98'),rail=material('#5a5b70'),bark=material('#594331');
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),grass);ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;scene.add(ground);
  function box(parent,w,h,d,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh}
  function between(parent,a,b,r,mat){const d=b.clone().sub(a),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),5),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());m.castShadow=true;parent.add(m);return m}
  function place(group,s,offset=0){const p=sampleTrack(track,s,offset);group.position.set(p.x,0,p.z);group.rotation.y=p.yaw;scene.add(group);return group}
  function ribbon(inner,outer,y,mat){
    const vertices=[],indices=[];
    for(let i=0;i<points.length;i++){
      const p=sampleTrack(track,Math.min(i*track.step,length-.001));
      for(const o of [inner,outer])vertices.push(p.x-p.tz*o,y,p.z+p.tx*o);
      if(i){const k=i*2;indices.push(k-2,k-1,k,k,k-1,k+1)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  ribbon(-37,37,-.08,grass);ribbon(-22,-9.5,.18,paving);ribbon(9.5,17.5,.18,paving);ribbon(-9.5,9.5,0,road);
  ribbon(-9.2,-8.9,.02,cream);ribbon(8.9,9.2,.02,cream);ribbon(-10.6,-9.5,.07,material('#7f8196'));ribbon(9.5,10.6,.07,material('#7f8196'));

  const lakeShape=new THREE.Shape();
  const lakeBoundary=[];
  for(let i=0;i<=256;i++){const p=sampleTrack(track,i*length/256,-44);lakeBoundary.push(p);i?lakeShape.lineTo(p.x,-p.z):lakeShape.moveTo(p.x,-p.z)}lakeShape.closePath();
  const lakeMaterial=new THREE.ShaderMaterial({toneMapped:false,uniforms:{time:{value:0},deep:{value:new THREE.Color('#677f96')},warm:{value:new THREE.Color('#bd9398')}},vertexShader:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}',fragmentShader:`uniform float time;uniform vec3 deep;uniform vec3 warm;varying vec3 vWorld;
    void main(){vec3 eye=normalize(cameraPosition-vWorld);float fresnel=pow(1.-abs(eye.y),2.);float wave=sin(vWorld.z*2.2+sin(vWorld.x*.65)+time*.8)*sin(vWorld.x*1.3+vWorld.z*.2-time*.5);
    float trail=exp(-pow((vWorld.x+115.-vWorld.z*.18)/105.,2.));float ripple=pow(max(0.,sin(vWorld.z*4.5+wave*1.5+time)),12.);
    vec3 color=mix(deep,warm,.28+fresnel*.42)+wave*.016+vec3(1.,.5,.19)*trail*(.3+ripple*.15);
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const lake=new THREE.Mesh(new THREE.ShapeGeometry(lakeShape,64),lakeMaterial);lake.rotation.x=-Math.PI/2;lake.position.y=-.035;scene.add(lake);
  ribbon(-44.7,-43.3,.02,material('#c9bb9c'));ribbon(-44,-43.4,-.1,wall);

  // Real rail geometry casts the long lattice shadows visible in the reference.
  function railingGeometry(){
    const positions=[],normals=[];
    const add=(w,h,d,x,y,z)=>{
      const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();
    };
    add(.13,1.9,.13,0,1.52,-2);add(.13,1.9,.13,0,1.52,2);
    for(const y of [.8,1.15,1.5,1.85,2.2])add(.07,.055,4,0,y,0);
    for(let z=-1.5;z<2;z+=.5)add(.05,1.4,.045,0,1.5,z);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return g;
  }
  const railCount=Math.floor(length/4),rails=new THREE.InstancedMesh(railingGeometry(),rail,railCount*2),bases=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,.65,4.1),wall,railCount*2),dummy=new THREE.Object3D();
  let k=0;
  for(let i=0;i<railCount;i++)for(const side of [-1,1]){
    const p=sampleTrack(track,i*length/railCount,side*10.15);dummy.position.set(p.x,0,p.z);dummy.rotation.set(0,p.yaw,0);dummy.updateMatrix();rails.setMatrixAt(k,dummy.matrix);dummy.position.y=.32;dummy.updateMatrix();bases.setMatrixAt(k++,dummy.matrix);
  }
  rails.castShadow=bases.castShadow=true;rails.receiveShadow=bases.receiveShadow=true;scene.add(rails,bases);
  const racingLine=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,.015,2.2),new THREE.MeshBasicMaterial({color:'#aadc69',transparent:true,opacity:.55}),Math.floor(length/7));
  for(let i=0;i<racingLine.count;i++){const p=sampleTrack(track,i*7);dummy.position.set(p.x,.025,p.z);dummy.rotation.set(0,p.yaw,0);dummy.updateMatrix();racingLine.setMatrixAt(i,dummy.matrix)}racingLine.visible=false;scene.add(racingLine);

  // Faceted tree crowns are deliberately separate clusters, rather than smooth cones.
  const treePoints=[];
  for(let i=0;i<Math.floor(length/12);i++)for(const side of [-1,1]){
    if(side<0&&(i%4!==0||Math.abs(i*12-(track.start-86))<54))continue;
    treePoints.push({...sampleTrack(track,i*12+random()*3,side*((side>0?20:25)+random()*8)),size:.85+random()*.65});
    if(side>0&&i%2===0)treePoints.push({...sampleTrack(track,i*12+4,side*(38+random()*4)),size:.9+random()*.8});
  }
  treePoints.push({...sampleTrack(track,track.start-92,-18),size:.8,noShadow:true},{...sampleTrack(track,track.start-111,-17),size:.42,wide:3});
  for(let i=0;i<160;i++){
    const x=-600+random()*1400,z=-650+random()*1500;
    if(nearestTrack(track,x,z).distance<48)continue;
    // Keep the actual lake open; distant park trees sit beyond the circuit.
    if(x>-205&&x<265&&z>-310&&z<390)continue;
    treePoints.push({x,z,size:1+random()*.8});
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.4,6,5),bark,treePoints.length),crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),material('#ffffff'),treePoints.length*4);
  const greens=['#243b21','#3c5526','#53682b','#718139','#405c2d'];
  let ci=0;
  treePoints.forEach((p,i)=>{
    const s=p.size;dummy.rotation.set(0,random()*6,0);dummy.position.set(p.x,3*s,p.z);dummy.scale.set(s,s,s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<4;j++){
      dummy.position.set(p.x+(j%2?1:-1)*s*1.7,6.2*s+(j>1?2.3:0)*s,p.z+(j<2?1.1:-1.1)*s);dummy.scale.set((2.4+random()*.6)*s*(p.wide||1),(2.1+random()*.6)*s*(p.wide?2:1),(2.3+random()*.6)*s*(p.wide||1));dummy.rotation.set(random()*.3,random()*6,random()*.3);
      const color=greens[Math.floor(random()*greens.length)];
      if(p.wide||p.noShadow){const foreground=new THREE.Mesh(crowns.geometry,material(color));foreground.position.copy(dummy.position);foreground.rotation.copy(dummy.rotation);foreground.scale.copy(dummy.scale);foreground.receiveShadow=true;scene.add(foreground);dummy.scale.setScalar(0)}
      dummy.updateMatrix();crowns.setMatrixAt(ci,dummy.matrix);crowns.setColorAt(ci++,new THREE.Color(color));
    }
  });dummy.scale.set(1,1,1);trunks.castShadow=crowns.castShadow=true;crowns.receiveShadow=true;scene.add(trunks,crowns);

  // Spectators have separate skin, clothing, arms, and legs with instanced geometry.
  const spectators=[];
  for(let i=0;i<Math.floor(length/3);i++){
    spectators.push({...sampleTrack(track,i*3+random(),12.2+random()*2.5),yaw:sampleTrack(track,i*3).yaw+Math.PI/2});
    if(i%2===0)spectators.push({...sampleTrack(track,i*3+2,17+random()*2),yaw:sampleTrack(track,i*3).yaw+Math.PI/2});
    if(i%7===0)spectators.push({...sampleTrack(track,i*3,-15-random()*3),yaw:sampleTrack(track,i*3).yaw-Math.PI/2});
  }
  const heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.21,1),material('#ffffff'),spectators.length),bodies=new THREE.InstancedMesh(new THREE.BoxGeometry(.44,.66,.29),material('#ffffff'),spectators.length),limbs=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.65,.17),material('#ffffff'),spectators.length*4);
  const clothes=['#f4b339','#3154ba','#db3d42','#eeeece','#632d71','#2ba9b3','#ef824a','#272d36'],skins=['#b57954','#e0ac82','#8d5e43','#eac49b'];
  spectators.forEach((p,i)=>{
    const s=.9+random()*.3;dummy.rotation.set(0,p.yaw,0);dummy.scale.set(s,s,s);dummy.position.set(p.x,1.73*s+.18,p.z);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);heads.setColorAt(i,new THREE.Color(skins[i%skins.length]));
    dummy.position.y=1.22*s+.18;dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);bodies.setColorAt(i,new THREE.Color(clothes[i%clothes.length]));
    const right=new THREE.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw));
    for(let j=0;j<4;j++){
      const side=j%2?1:-1,arm=j>1,wave=arm&&i%4===0&&j===3;dummy.position.set(p.x+right.x*side*(arm?.31:.12)*s,(wave?1.9:arm?1.13:.55)*s+.18,p.z+right.z*side*(arm?.31:.12)*s);dummy.rotation.set(0,p.yaw,arm?side*(wave?-1.9:.17):0);dummy.updateMatrix();limbs.setMatrixAt(i*4+j,dummy.matrix);limbs.setColorAt(i*4+j,new THREE.Color(arm?skins[i%4]:'#303044'));
    }
  });dummy.scale.set(1,1,1);heads.castShadow=bodies.castShadow=limbs.castShadow=true;scene.add(heads,bodies,limbs);

  const wood=material('#71543b'),lampMetal=material('#39434b');
  for(let i=0;i<Math.floor(length/28);i++){
    const s=i*28,bench=new THREE.Group();
    for(let j=0;j<3;j++)box(bench,.23,.12,2.9,wood,j*.25,.8,0);
    for(let j=0;j<3;j++)box(bench,.1,.2,2.9,wood,.75,1.05+j*.22,0);
    for(const z of [-1,1])box(bench,.6,.65,.12,lampMetal,.3,.43,z);place(bench,s,-18.5);
    const lamp=new THREE.Group();box(lamp,.12,5.4,.12,lampMetal,0,2.85,0);box(lamp,.55,.12,.55,lampMetal,0,5.25,0);
    const glass=new THREE.Mesh(new THREE.CylinderGeometry(.25,.16,.55,4),new THREE.MeshBasicMaterial({color:'#ffe2a7'}));glass.position.y=5.6;lamp.add(glass);const cap=new THREE.Mesh(new THREE.ConeGeometry(.4,.4,4),lampMetal);cap.position.y=6.02;lamp.add(cap);place(lamp,s+10,-14.3);
    if(i%2===0){const bin=new THREE.Group();box(bin,.55,1.05,.55,material('#a74e39'),0,.7,0);box(bin,.65,.12,.65,lampMetal,0,1.3,0);place(bin,s+15,14.6)}
  }

  // The jewel sculpture and its lakeside plaza are visible from the starting straight.
  const monumentS=track.start-86,plazaP=sampleTrack(track,monumentS,-40),plaza=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(14,14,1,32),cream);base.position.y=-.23;base.receiveShadow=true;plaza.add(base);
  const plazaTop=new THREE.Mesh(new THREE.CylinderGeometry(13.6,13.6,.1,32),paving);plazaTop.position.y=.33;plazaTop.receiveShadow=true;plaza.add(plazaTop);
  for(const [r,h,y] of [[5.8,.5,.65],[4.7,.6,1.2]]){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),cream);m.position.y=y;m.castShadow=true;plaza.add(m)}
  const pedestalMaterial=material('#50516c');for(let i=0;i<3;i++){const a=i/3*Math.PI*2;between(plaza,new THREE.Vector3(Math.sin(a)*.9,1.5,Math.cos(a)*.9),new THREE.Vector3(Math.sin(a)*3.2,10.2,Math.cos(a)*3.2),.8,pedestalMaterial)}
  box(plaza,.65,9,.65,new THREE.MeshStandardMaterial({color:'#ffd474',emissive:'#eaa33b',emissiveIntensity:.7}),0,6.2,0);
  const gemVertices=[],gemColors=[],gemPoints=[new THREE.Vector3(0,11,0)],faceColors=['#ac8dc2','#c99aac','#adb6c9','#dec59d','#9c8db6','#e9c0b4'];
  for(let ring=0;ring<2;ring++)for(let i=0;i<6;i++){const a=i/6*Math.PI*2;gemPoints.push(new THREE.Vector3(Math.cos(a)*(ring?4.1:6.6),ring?24:20.5,Math.sin(a)*(ring?4.1:6.6)))}
  const triangles=[];
  for(let i=0;i<6;i++){const a=1+i,b=1+(i+1)%6,c=7+i,d=7+(i+1)%6;triangles.push([0,b,a],[a,b,c],[b,d,c])}
  for(let i=1;i<5;i++)triangles.push([7,7+i,8+i]);
  triangles.forEach((tri,i)=>{const color=new THREE.Color(faceColors[i%6]);tri.forEach(index=>{gemVertices.push(...gemPoints[index].toArray());gemColors.push(color.r,color.g,color.b)})});
  const gemGeometry=new THREE.BufferGeometry();gemGeometry.setAttribute('position',new THREE.Float32BufferAttribute(gemVertices,3));gemGeometry.setAttribute('color',new THREE.Float32BufferAttribute(gemColors,3));gemGeometry.computeVertexNormals();
  const gem=new THREE.Mesh(gemGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,flatShading:true,side:THREE.DoubleSide,emissive:'#41313a',emissiveIntensity:.15}));gem.castShadow=true;plaza.add(gem);
  const edges=new THREE.EdgesGeometry(gemGeometry,1),edgePoints=edges.attributes.position.array,gold=new THREE.MeshBasicMaterial({color:'#ffe5a0'});
  for(let i=0;i<edgePoints.length;i+=6)between(plaza,new THREE.Vector3(...edgePoints.slice(i,i+3)),new THREE.Vector3(...edgePoints.slice(i+3,i+6)),.085,gold);
  plaza.position.set(plazaP.x,0,plazaP.z);plaza.rotation.y=plazaP.yaw;plaza.scale.set(.7,.55,.7);scene.add(plaza);
  const walk=new THREE.Group();box(walk,24,.3,7,paving,0,.12,0);for(const z of [-3.5,3.5]){box(walk,24,.5,.3,cream,0,.3,z);box(walk,24,.08,.09,rail,0,1.4,z);for(let x=-12;x<13;x+=3)box(walk,.09,1.1,.09,rail,x,.9,z)}place(walk,monumentS,-29);

  // Across the water: apartment towers, smaller blocks, and a tree-lined shoreline.
  const windows=[];
  for(let i=0;i<44;i++){
    const near=i<9,w=near?38+random()*9:18+random()*25,h=near?98+random()*32:16+random()*45,d=20+random()*24;
    const building=new THREE.Group(),facade=material(near?'#9991a5':'#b6a0a0');
    box(building,w,h,d,facade,0,h/2,0);box(building,w+.5,.9,d+.5,material('#b19b9c'),0,h,0);if(i%2===0)box(building,w*.3,3,d*.4,material('#b6a0a0'),0,h+1.5,0);
    building.position.set(near?250+i*55:160+(i-9)*24,0,near?500+random()*45:600+random()*100);scene.add(building);
    for(let y=3;y<h-2;y+=4.6){for(let x=-w/2+2;x<w/2-1;x+=3.6)windows.push({x:building.position.x+x,y,z:building.position.z-d/2-.03,ry:Math.PI});for(let z=-d/2+2;z<d/2-1;z+=3.6)windows.push({x:building.position.x-w/2-.03,y,z:building.position.z+z,ry:-Math.PI/2})}
  }
  const windowMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2,2.2),new THREE.MeshBasicMaterial({color:'#ffffff',polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),windows.length);
  windows.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.ry,0);dummy.scale.set(1,1,1);dummy.updateMatrix();windowMesh.setMatrixAt(i,dummy.matrix);windowMesh.setColorAt(i,new THREE.Color(random()<.12?'#c9b4aa':'#5a5569'))});scene.add(windowMesh);
  for(let i=0;i<18;i++){
    const h=20+random()*40,building=new THREE.Group();box(building,25,h,27,material('#a79c9f'),0,h/2,0);building.position.set(530+random()*350,0,-300+i*65);scene.add(building);
  }

  const gantry=new THREE.Group(),gantrySteel=material('#66667d'),bannerCanvas=document.createElement('canvas');bannerCanvas.width=1536;bannerCanvas.height=256;
  const bc=bannerCanvas.getContext('2d');bc.fillStyle='#355850';bc.fillRect(0,0,1536,256);bc.strokeStyle='#cabfa1';bc.lineWidth=6;bc.strokeRect(9,9,1518,238);bc.fillStyle='#e1d8c6';bc.textAlign='center';bc.font='bold 82px Arial';bc.fillText('JEWEL OF NAVI MUMBAI',768,106);bc.font='35px Arial';bc.fillText('NERUL, NAVI MUMBAI',768,168);bc.font='30px Arial';bc.fillText('नेरुळ',125,86);bc.fillText('नवी मुंबई',1415,90);bc.fillText('नवी मुंबई',125,144);bc.fillText('नेरुळ',1415,146);
  const bannerTexture=new THREE.CanvasTexture(bannerCanvas);bannerTexture.colorSpace=THREE.SRGBColorSpace;
  for(const side of [-1,1]){
    for(const z of [-.65,.65])box(gantry,.22,9,.22,gantrySteel,side*11.2,4.5,z);
    for(let y=.5;y<9;y+=1.3){between(gantry,new THREE.Vector3(side*11.2,y,-.65),new THREE.Vector3(side*11.2,y+1.3,.65),.08,gantrySteel);between(gantry,new THREE.Vector3(side*11.2,y,.65),new THREE.Vector3(side*11.2,y+1.3,-.65),.08,gantrySteel)}
  }
  box(gantry,23,.22,1.5,gantrySteel,0,9,0);box(gantry,22.6,.18,1.5,gantrySteel,0,6.8,0);
  for(let x=-11;x<10;x+=2.2)for(const z of [-.65,.65]){between(gantry,new THREE.Vector3(x,6.8,z),new THREE.Vector3(x+2.2,9,z),.07,gantrySteel);between(gantry,new THREE.Vector3(x,9,z),new THREE.Vector3(x+2.2,6.8,z),.07,gantrySteel)}
  const banner=new THREE.Mesh(new THREE.PlaneGeometry(22.1,2.12),new THREE.MeshStandardMaterial({map:bannerTexture,roughness:1,side:THREE.DoubleSide}));banner.position.set(0,7.92,-.8);banner.rotation.y=Math.PI;gantry.add(banner);
  const lamps=[];for(let i=0;i<5;i++)lamps.push(box(gantry,.22,.22,.1,new THREE.MeshBasicMaterial({color:'#34282c'}),-.8+i*.4,6.5,-.7));place(gantry,track.start-49);
  const gantryMaterials=new Set();gantry.traverse(o=>{if(o.material){o.material.transparent=true;gantryMaterials.add(o.material)}});

  const smokeCount=240,smoke=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#ddd2c8',transparent:true,opacity:.27,depthWrite:false}),smokeCount),particles=Array.from({length:smokeCount},()=>({life:0}));smoke.frustumCulled=false;scene.add(smoke);let smokeIndex=0,smokeClock=0;
  function update(dt,cars,elapsed){
    lakeMaterial.uniforms.time.value=elapsed;smokeClock+=dt;
    const player=cars.find(c=>c.isPlayer);
    if(player){const along=(gantry.position.x-player.x)*Math.sin(player.yaw)+(gantry.position.z-player.z)*Math.cos(player.yaw);const opacity=Math.max(.06,Math.min(1,(Math.abs(along+7)-14)/9));gantryMaterials.forEach(m=>{m.opacity=opacity;m.depthWrite=opacity>.98})}
    if(smokeClock>.065){smokeClock=0;for(const car of cars){if(car.speed<3||car.throttle<.2)continue;const p=particles[smokeIndex++%smokeCount];Object.assign(p,{life:1,x:car.x-Math.sin(car.yaw)*3.3,z:car.z-Math.cos(car.yaw)*3.3,y:.35,size:.18+random()*.16,drift:(random()-.5)*.6})}}
    particles.forEach((p,i)=>{p.life=Math.max(0,p.life-dt*.75);p.y+=dt*.45;p.x+=dt*(p.drift||0);const scale=p.life>0?p.size*(1+(1-p.life)*3)*Math.min(1,p.life*5):0;dummy.position.set(p.x||0,p.y||0,p.z||0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(scale);dummy.updateMatrix();smoke.setMatrixAt(i,dummy.matrix)});smoke.instanceMatrix.needsUpdate=true;dummy.scale.set(1,1,1);
  }
  function setLighting(mode){
    const settings={golden:['#cd7e85','#ffb18b','#ffd3a1',2.65,1.9,'#e3aa92'],day:['#8cb5cd','#d9d4b1','#fff0dc',2.3,1.8,'#bfccd0'],dusk:['#655b86','#d7958c','#eeac96',1.9,1.3,'#af9da9']},s=settings[mode];
    skyMaterial.uniforms.top.value.set(s[0]);skyMaterial.uniforms.bottom.value.set(s[1]);sun.color.set(s[2]);sun.intensity=s[3];ambient.intensity=s[4];scene.fog.color.set(s[5]);sunDisc.visible=mode!=='day';
  }
  function setQuality(high){renderer.setPixelRatio(Math.min(devicePixelRatio,high?2:1));renderer.shadowMap.enabled=high}
  return {THREE,renderer,scene,camera,track,sun,sky,racingLine,lamps,lakeBoundary,setLighting,setQuality,update};
}
