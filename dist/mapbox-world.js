import * as THREE from './vendor/three.module.js';
import {createCityCircuit,corridorPolygon} from './geo-track.js';
import {sampleTrack} from './physics.js';
import {trackBand} from './map-geometry.js';
import {AdaptiveResolution,renderScale} from './render-quality.js';

const token='pk.eyJ1IjoibmVhcmhvbWVsZXNzIiwiYSI6ImNtdnhraXlteTAyc2kyeXM5dDg5cngxOTMifQ.Q-TdcK9V7OJ3jm81HkqC_A';
async function json(url){const r=await fetch(url);if(!r.ok)throw new Error('City map files could not load. Please reload.');return r.json()}
async function loadMapbox(){
  if(window.mapboxgl)return window.mapboxgl;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://api.mapbox.com/mapbox-gl-js/v3.33.0/mapbox-gl.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('Mapbox could not load. Check your connection, or use the original map below.'));document.head.append(script);
  });
  return window.mapboxgl;
}

export async function createMapboxWorld(anchor,{quality:initialQuality='high'}={}){
  const [mb,data,area]=await Promise.all([loadMapbox(),json('./city-circuit.geojson'),json('./city-area.geojson')]);
  if(!mb.supported())throw new Error('This city map needs WebGL 2. Try an up-to-date browser or use the original map.');
  const track=createCityCircuit(data,area),frame=track.frame;
  const root=document.createElement('div'),mapContainer=document.createElement('div'),credits=document.createElement('div');
  root.id='city-map';mapContainer.className='city-map-canvas';credits.id='city-map-credits';root.append(mapContainer);anchor.before(root,credits);
  anchor.classList.add('mapbox-focus-surface');
  const status=document.createElement('output');status.id='city-map-status';status.textContent='Loading Navi Mumbai…';anchor.after(status);
  const scene=new THREE.Scene();scene.fog=new THREE.Fog('#e3aa92',1500,4200);
  const camera=new THREE.PerspectiveCamera(50,1,.2,6500),renderCamera=new THREE.Camera(),sky=new THREE.Group();
  renderCamera.matrixAutoUpdate=false;renderCamera.matrixWorldAutoUpdate=false;
  const ambient=new THREE.HemisphereLight('#ffe5c5','#8c9694',1.9),sun=new THREE.DirectionalLight('#ffd3a1',2.65);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:1000});sun.shadow.bias=-.00012;sun.shadow.normalBias=.025;scene.add(ambient,sun,sun.target,new THREE.AmbientLight('#d4dcee',.8));
  const materials=new Map(),material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true}));return materials.get(color)};
  function box(parent,w,h,d,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
  function place(group,s,offset=0){const p=sampleTrack(track,s,offset);group.position.set(p.x,0,p.z);group.rotation.y=p.yaw;scene.add(group);return group}
  function ribbon(inner,outer,y,mat){
    const positions=[],indices=[],count=Math.ceil(track.length/3);
    for(let i=0;i<=count;i++){
      const p=sampleTrack(track,i*track.length/count);
      for(const o of [inner,outer])positions.push(p.x-p.tz*o,y,p.z+p.tx*o);
      if(i){const k=i*2;indices.push(k-2,k-1,k,k,k-1,k+1)}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const m=mat.clone();m.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  const cream=material('#efe4ce'),rail=material('#51565b');
  ribbon(-9.8,9.8,.1,material('#454247'));
  ribbon(-9.1,-8.9,.115,cream);ribbon(8.9,9.1,.115,cream);
  const curb=material('#fff2db').clone();curb.vertexColors=true;
  for(const side of [-1,1]){
    scene.add(trackBand(track,side*9.65-.5,side*9.65+.5,.12,.28,curb,Math.ceil(track.length/3),['#d95443','#f4e9ce']));
    scene.add(trackBand(track,side*10.15-.325,side*10.15+.325,.1,.745,material('#93939b'),Math.ceil(track.length/3)));
    scene.add(trackBand(track,side*10.15-.045,side*10.15+.045,1.72,1.79,rail,Math.ceil(track.length/3)));
  }
  const dummy=new THREE.Object3D(),postCount=Math.ceil(track.length/6),posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.13,1.7,.13),rail,postCount*2);
  for(let i=0;i<postCount;i++)for(let side=0;side<2;side++){
    const p=sampleTrack(track,i*track.length/postCount,side?10.15:-10.15);dummy.position.set(p.x,1.25,p.z);dummy.rotation.set(0,p.yaw,0);dummy.updateMatrix();posts.setMatrixAt(i*2+side,dummy.matrix);
  }scene.add(posts);
  const racingLine=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,.02,2.2),new THREE.MeshBasicMaterial({color:'#b7df73'}),Math.floor(track.length/7));
  for(let i=0;i<racingLine.count;i++){const p=sampleTrack(track,i*7);dummy.position.set(p.x,.14,p.z);dummy.rotation.set(0,p.yaw,0);dummy.updateMatrix();racingLine.setMatrixAt(i,dummy.matrix)}racingLine.visible=false;scene.add(racingLine);
  const startLine=new THREE.Group();for(let i=0;i<18;i++)for(let j=0;j<2;j++)box(startLine,1,.025,1,material((i+j)%2?'#25262b':'#f5edda'),i-8.5,.135,j-.5);place(startLine,track.start);
  for(let i=0;i<8;i++){const grid=new THREE.Group();for(const x of [-1.65,1.65])box(grid,.12,.02,5,cream,x,.14,0);box(grid,3.4,.02,.12,cream,0,.14,2.5);place(grid,-8-i*14,i%2?1.6:-1.6)}
  const gantry=new THREE.Group();for(const x of [-11.5,11.5])box(gantry,.6,7,.6,rail,x,3.6,0);box(gantry,24,1.6,.55,material('#25463f'),0,7,0);
  const textCanvas=document.createElement('canvas');textCanvas.width=1024;textCanvas.height=128;const ctx=textCanvas.getContext('2d');ctx.fillStyle='#21433b';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#f9e6b7';ctx.font='bold 66px Arial';ctx.textAlign='center';ctx.fillText('JEWEL OF NAVI MUMBAI',512,88);
  const texture=new THREE.CanvasTexture(textCanvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(23,1.5),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.position.set(0,7,-.3);gantry.add(sign);
  const lamps=[];for(let i=0;i<5;i++){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.23,8,6),new THREE.MeshBasicMaterial({color:'#351b1e'}));lamp.position.set((i-2)*.65,5.9,-.1);gantry.add(lamp);lamps.push(lamp)}place(gantry,2);
  for(const c of track.corners){
    const board=new THREE.Group(),cvs=document.createElement('canvas');cvs.width=128;cvs.height=128;const g=cvs.getContext('2d');g.fillStyle='#23443b';g.fillRect(0,0,128,128);g.fillStyle='#ffe9ad';g.font='bold 65px Arial';g.textAlign='center';g.fillText('T'+c.number,64,88);const tex=new THREE.CanvasTexture(cvs);tex.colorSpace=THREE.SRGBColorSpace;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));panel.position.y=2.7;panel.rotation.y=Math.PI;board.add(panel);box(board,.1,2,.1,rail,0,1,0);place(board,c.s-12,12.3);
  }
  // Keep the mall blue, using its mapped podium and tower footprints and heights.
  const mallFeatures=data.features.filter(f=>f.properties.role==='mall-building');
  const mullions=[];
  for(const f of mallFeatures){
    const rings=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const polygon of rings){
      const pts=polygon[0].map(p=>frame.toWorld(p)),shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(p.x,-p.z)));
      for(const hole of polygon.slice(1))shape.holes.push(new THREE.Path(hole.map(p=>{const w=frame.toWorld(p);return new THREE.Vector2(w.x,-w.z)})));
      const height=f.properties.height,tower=height>20;
      const glass=tower?new THREE.MeshStandardMaterial({color:'#2d7da5',metalness:.25,roughness:.32,emissive:'#17405b',emissiveIntensity:.18}):material('#d6c9ad');
      const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),glass);mesh.rotation.x=-Math.PI/2;mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
      const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:1.4,bevelEnabled:false}),cream);roof.rotation.x=-Math.PI/2;roof.position.y=height;roof.castShadow=true;scene.add(roof);
      if(tower)for(let i=0;i<pts.length-1;i++){
        const a=pts[i],b=pts[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
        for(let y=4;y<height;y+=4)mullions.push({x:(a.x+b.x)/2,y,z:(a.z+b.z)/2,sx:.3,sy:.3,sz:len,yaw});
        for(let j=0;j<=Math.floor(len/6);j++){const t=j/Math.max(1,Math.floor(len/6));mullions.push({x:a.x+dx*t,y:height/2,z:a.z+dz*t,sx:.35,sy:height,sz:.35,yaw:0})}
      }
    }
  }
  const grid=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material('#cbd7d5'),mullions.length);
  mullions.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();grid.setMatrixAt(i,dummy.matrix)});dummy.scale.set(1,1,1);scene.add(grid);
  const lakes=data.features.filter(f=>f.properties.role==='water').flatMap(f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(p=>p[0].map(c=>frame.toWorld(c))));
  const landmarks=data.features.filter(f=>['mall','landmark'].includes(f.properties.role)).map(f=>({title:f.properties.name,...frame.toWorld(f.geometry.coordinates),y:42}));
  const origin=mb.MercatorCoordinate.fromLngLat(frame.origin),scale=origin.meterInMercatorCoordinateUnits();
  const transform=new THREE.Matrix4().set(scale,0,0,origin.x,0,0,scale,origin.y,0,scale,0,0,0,0,0,1);
  const smoke=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#d8d0b9',transparent:true,opacity:.23,depthWrite:false}),80),particles=Array.from({length:80},()=>({life:0}));scene.add(smoke);smoke.frustumCulled=false;
  dummy.scale.setScalar(0);dummy.updateMatrix();for(let i=0;i<80;i++)smoke.setMatrixAt(i,dummy.matrix);dummy.scale.setScalar(1);
  let particleIndex=0,spawnClock=0;
  let quality=initialQuality,lighting='golden',renderer,map,renderWidth=1,renderHeight=1,ratio=1,adaptive=new AdaptiveResolution(Math.min(devicePixelRatio,1.5)),lastFov=0;
  const start=frame.toGeo(sampleTrack(track,track.start));
  map=new mb.Map({container:mapContainer,accessToken:token,style:'mapbox://styles/nearhomeless/cmvz7tolg00an01s8a8t6hw32',projection:'mercator',center:start,zoom:19,pitch:60,bearing:0,minZoom:12,maxZoom:24,maxPitch:85,interactive:false,attributionControl:{compact:true},renderWorldCopies:false,maxTileCacheSize:64,antialias:initialQuality==='high',config:{basemap:{lightPreset:'day',showPlaceLabels:false,showRoadLabels:false,showPointOfInterestLabels:false,showTransitLabels:false,show3dBuildings:true,show3dLandmarks:true,show3dTrees:initialQuality==='high',show3dFacades:initialQuality!=='low'}}});
  credits.append(mapContainer.querySelector('.mapboxgl-control-container'));
  function setLighting(mode){
    lighting=mode;
    const day=mode==='day',dusk=mode==='dusk';
    map.setConfigProperty('basemap','lightPreset',dusk?'dusk':'day');
    for(const [key,color] of Object.entries({colorWater:'#418eac',colorGreenspace:'#799658',colorLand:'#aaa47d',colorBuildings:'#cbb89c',colorRoads:'#787471'}))map.setConfigProperty('basemap',key,color);
    map.setLights([{id:'race-ambient',type:'ambient',properties:{color:day?'#ffffff':dusk?'#c5c9ea':'#fff2df',intensity:.5}},{id:'race-sun',type:'directional',properties:{color:day?'#fff7df':dusk?'#efb6aa':'#ffd0a4',intensity:.55,direction:[220,day?35:75],'cast-shadows':quality!=='low','shadow-intensity':.35}}]);
    map.setFog({range:[3,20],color:day?'#c2d7df':dusk?'#ba9ba7':'#dba98d','high-color':day?'#80b5d5':dusk?'#716e9b':'#bd8590','space-color':day?'#b9d7eb':'#efb48f','horizon-blend':.15});
    sun.color.set(day?'#fff3d9':dusk?'#edb0ac':'#ffd2a0');sun.intensity=day?2.3:2.65;ambient.intensity=dusk?1.4:1.9;
  }
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The city map is taking too long to load. Check your connection, or use the original map.')),45000);
    map.on('error',e=>{if(e.error?.status===401||e.error?.status===403){clearTimeout(timer);reject(new Error('Mapbox access was rejected. The public token may need this game URL allowed.'))}});
    map.once('load',()=>{
      try{
        const [w,s,e,n]=area.bbox,outside={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[72.9,18.9],[73.2,18.9],[73.2,19.2],[72.9,19.2],[72.9,18.9]],[[w,s],[w,n],[e,n],[e,s],[w,s]]]}};
        const clipFeatures=[outside,corridorPolygon(track,11.8),...mallFeatures];
        map.addSource('race-clearance',{type:'geojson',data:{type:'FeatureCollection',features:clipFeatures}});
        map.addLayer({id:'race-clearance',type:'clip',source:'race-clearance',slot:'top',layout:{'clip-layer-scope':['basemap'],'clip-layer-types':['model','symbol']}});
        map.addLayer({id:'apex-race',type:'custom',renderingMode:'3d',onAdd(_,gl){
          renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl});renderer.autoClear=false;renderer.shadowMap.enabled=quality!=='low';renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;
        },render(gl,matrix){
          camera.updateMatrixWorld();renderCamera.matrixWorld.copy(camera.matrixWorld);renderCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
          renderCamera.projectionMatrix.fromArray(matrix).multiply(transform).multiply(camera.matrixWorld);renderCamera.projectionMatrixInverse.copy(renderCamera.projectionMatrix).invert();
          renderer.resetState();renderer.setViewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);renderer.render(scene,renderCamera);renderer.resetState();
        }});
        setLighting('golden');clearTimeout(timer);status.hidden=true;anchor.closest('section').dataset.mapSource='mapbox';resolve();
      }catch(error){clearTimeout(timer);reject(error)}
    });
  }).catch(error=>{map.remove();root.remove();credits.remove();status.remove();throw error});
  function followSun(x,z){sun.target.position.set(x,0,z);sun.position.set(x+360,240,z+300)}
  function updateShadowCamera(isOverview=false){const radius=isOverview?1100:55;Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,far:isOverview?3000:1000});sun.shadow.camera.updateProjectionMatrix()}
  function resize(width,height){
    renderWidth=Math.max(1,width);renderHeight=Math.max(1,height);
    ratio=quality==='mobile'?renderScale(width,height,adaptive.ratio,1400000):Math.min(devicePixelRatio,quality==='high'?2:1);
    const factor=ratio/devicePixelRatio;
    mapContainer.style.width=Math.max(1,Math.round(width*factor))+'px';mapContainer.style.height=Math.max(1,Math.round(height*factor))+'px';mapContainer.style.transform=`scale(${1/factor})`;map.resize();
  }
  function setQuality(value){quality=value;renderer.shadowMap.enabled=value!=='low';sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(value==='high'?2048:1024,value==='high'?2048:1024);map.setConfigProperty('basemap','show3dTrees',value==='high');map.setConfigProperty('basemap','show3dFacades',value!=='low');setLighting(lighting);adaptive=new AdaptiveResolution(Math.min(devicePixelRatio,1.5),adaptive.target);resize(renderWidth,renderHeight)}
  const direction=new THREE.Vector3();
  function render(){
    camera.getWorldDirection(direction);
    const free=map.getFreeCameraOptions();free.position=new mb.MercatorCoordinate(origin.x+camera.position.x*scale,origin.y+camera.position.z*scale,Math.max(1.5,camera.position.y)*scale);
    free.setPitchBearing(Math.min(85,Math.atan2(Math.hypot(direction.x,direction.z),-direction.y)*180/Math.PI),Math.atan2(direction.x,-direction.z)*180/Math.PI);
    const fov=Math.min(60,camera.fov);if(Math.abs(lastFov-fov)>.1){map.jumpTo({fov});lastFov=fov}
    map.setFreeCameraOptions(free);map.triggerRepaint();
  }
  function update(dt,cars){
    if(dt<=0)return;
    spawnClock+=dt;
    if(spawnClock>1/20){spawnClock=0;for(const car of cars)if(car.speed>7&&(car.boost||car.throttle>.5||car.slip>3)){
      const p=particles[particleIndex++%particles.length];Object.assign(p,{x:car.x-Math.sin(car.yaw)*3.2,y:.5,z:car.z-Math.cos(car.yaw)*3.2,life:1,size:.22+Math.random()*.18});
    }}
    particles.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);if(p.life){p.y+=dt*.5;dummy.position.set(p.x,p.y,p.z)}dummy.rotation.set(0,0,0);dummy.scale.setScalar(p.life?p.size*(2-p.life)*p.life:0);dummy.updateMatrix();smoke.setMatrixAt(i,dummy.matrix)});smoke.instanceMatrix.needsUpdate=true;dummy.scale.setScalar(1);
  }
  function setFrameTarget(fps){adaptive.target=fps;adaptive.average=1/fps;adaptive.slow=adaptive.fast=0}
  function updateQuality(dt,active){if(quality==='mobile'&&active&&adaptive.sample(dt))resize(renderWidth,renderHeight)}
  map.on('webglcontextlost',()=>{status.hidden=false;status.textContent='Graphics paused. Waiting for the city map to recover…';window.dispatchEvent(new Event('city-map-interrupted'))});
  map.on('webglcontextrestored',()=>{status.hidden=true});
  setQuality(initialQuality);
  return{THREE,renderer,scene,camera,track,sun,sky,racingLine,lamps,lakes,lakeBoundary:lakes[0],landmarks,roadHeight:.1,overviewRadius:2700,setLighting,setQuality,followSun,update,resize,updateShadowCamera,updateQuality,setFrameTarget,render};
}
