import * as THREE from './vendor/three.module.js';
import {SETUPS as VEHICLE_SETUPS,setupId} from './vehicle-setup.js';

const LIVERIES=[['#a2cf3e','Jewel Lime'],['#37c6ca','Glacier Teal'],['#e7ef48','Acid Yellow'],['#e86138','Sunset Orange'],['#527ade','Pacific Blue'],['#ece9dd','Ivory Works']];
const SETUPS={
  balanced:{name:VEHICLE_SETUPS.balanced.name,tag:'ALL-ROUND',text:'A neutral baseline for learning the circuit. Equal emphasis on corner stability and straight-line pace.',grip:3,drag:3},
  corner:{name:VEHICLE_SETUPS.corner.name,tag:'HIGH DOWNFORCE',text:'More grip through bends, with more aerodynamic drag on the straights. Brake later and carry your momentum.',grip:5,drag:5},
  straight:{name:VEHICLE_SETUPS.straight.name,tag:'LOW DRAG',text:'Less drag for the long waterfront sections. Reduced corner grip means earlier braking and a smoother line.',grip:2,drag:1}
};

export function createGarage({buildCar,disposeCar,onColor,onSetup,color='#a2cf3e',setup='balanced'}){
  const $=id=>document.getElementById(id),stage=$('garage-stage'),canvas=$('garage-world');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer,scene,camera,car,active=false,locked=false,selected=color,applied=setupId(setup),draft=applied;
  let yaw=.65,pitch=.32,distance=10,auto=!reduced.matches,drag=null;
  const swatches=LIVERIES.map(([value,name])=>{
    const button=document.createElement('button');button.type='button';button.dataset.garageColor=value;button.style.setProperty('--livery',value);button.setAttribute('aria-label',name);button.innerHTML='<i aria-hidden="true"></i><span>'+name+'</span>';
    button.addEventListener('click',()=>{setColor(value);onColor(value)});$('garage-liveries').append(button);return button;
  });
  const presets=Object.entries(SETUPS).map(([id,info])=>{
    const button=document.createElement('button');button.type='button';button.dataset.garageSetup=id;button.innerHTML='<span>'+info.name+'</span><small>'+info.tag+'</small>';
    button.addEventListener('click',()=>{draft=id;syncSetup()});$('garage-presets').append(button);return button;
  });
  function syncSetup(){
    const info=SETUPS[draft];presets.forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.garageSetup===draft));b.disabled=locked});
    $('garage-setup-copy').textContent=info.text;
    for(const [id,value]of [['grip',info.grip],['drag',info.drag]])$('garage-'+id).style.setProperty('--level',value/5);
    $('garage-grip-value').textContent=info.grip===5?'HIGH':info.grip===2?'LOWER':'BALANCED';
    $('garage-drag-value').textContent=info.drag===5?'HIGH':info.drag===1?'LOW':'BALANCED';
    $('garage-apply').disabled=locked||draft===applied;
    $('garage-apply').textContent=draft===applied?'SETUP EQUIPPED':'EQUIP '+info.name.toUpperCase();
    $('garage-setup-note').textContent=locked?'Setup is locked during a session. Return to the title to change it.':'Applies to your next session. Equal engine power; personal bests are saved separately for each setup.';
    $('garage-equipped').textContent=SETUPS[applied].name+' setup';
  }
  function setColor(value){
    selected=value;car?.userData.paint.color.set(value);
    swatches.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.garageColor===value)));
    $('garage-livery-name').textContent=LIVERIES.find(([v])=>v===value)?.[1]||'Custom livery';
  }
  $('garage-apply').addEventListener('click',()=>{if(locked)return;applied=draft;onSetup(applied);syncSetup();$('garage-saved').textContent=SETUPS[applied].name+' setup equipped for the next session.'});
  function init(){
    if(renderer)return;
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
      renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      scene=new THREE.Scene();scene.background=new THREE.Color('#11191d');scene.fog=new THREE.Fog('#11191d',15,35);
      camera=new THREE.PerspectiveCamera(39,1,.1,60);
      scene.add(new THREE.HemisphereLight('#e5f4ff','#4f3e2d',2.4));
      const key=new THREE.DirectionalLight('#ffdfbb',4);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(512,512);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:1,far:20});key.shadow.bias=-.0002;key.shadow.normalBias=.025;scene.add(key);
      const rim=new THREE.DirectionalLight('#a8dcff',3);rim.position.set(4,3,-4);scene.add(rim);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#263035',roughness:.48,metalness:.3}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.025;scene.add(floor);
      const deck=new THREE.Mesh(new THREE.CylinderGeometry(4.1,4.1,.09,80),new THREE.MeshStandardMaterial({color:'#394348',roughness:.72,metalness:.15}));deck.position.y=-.065;deck.receiveShadow=true;scene.add(deck);
      const ring=new THREE.Mesh(new THREE.RingGeometry(3.94,3.975,96),new THREE.MeshBasicMaterial({color:'#c8d3b1',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.009;scene.add(ring);
      const grid=new THREE.GridHelper(40,40,'#445052','#303a3e');grid.position.y=-.015;scene.add(grid);
      car=buildCar(selected,27);car.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(car);car.position.y=-bounds.min.y;scene.add(car);
      $('garage-render-error').hidden=true;
    }catch(error){renderer?.dispose();renderer=null;$('garage-render-error').hidden=false;console.warn('Garage preview unavailable',error)}
  }
  function resize(){
    if(!renderer)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),scale=Math.min(1,Math.sqrt(700000/(w*h)));
    renderer.setSize(Math.round(w*scale),Math.round(h*scale),false);camera.aspect=w/h;camera.updateProjectionMatrix();distance=camera.aspect<.85?12:10;
  }
  function setAuto(value){auto=value;$('garage-auto').setAttribute('aria-pressed',String(auto));$('garage-auto').textContent=auto?'AUTO ROTATE ON':'AUTO ROTATE OFF'}
  for(const button of document.querySelectorAll('[data-garage-view]'))button.addEventListener('click',()=>{yaw={front:0,side:Math.PI/2,rear:Math.PI}[button.dataset.garageView];pitch=.24;setAuto(false)});
  $('garage-auto').addEventListener('click',()=>setAuto(!auto));
  canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);setAuto(false)});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.008;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.004,.08,.75);drag.x=e.clientX;drag.y=e.clientY});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();setAuto(false);if(e.key==='Home'){yaw=.65;pitch=.32}else if(e.key==='ArrowLeft')yaw-=.15;else if(e.key==='ArrowRight')yaw+=.15;else pitch=THREE.MathUtils.clamp(pitch+(e.key==='ArrowUp'?.06:-.06),.08,.75)});
  reduced.addEventListener?.('change',()=>{if(reduced.matches)setAuto(false)});
  new ResizeObserver(()=>{if(active)resize()}).observe(stage);
  setColor(color);syncSetup();setAuto(auto);
  return{
    open(options={}){selected=options.color||selected;applied=SETUPS[options.setup]?options.setup:applied;draft=applied;locked=!!options.locked;active=true;$('garage-dialog').scrollTop=0;document.querySelector('.garage-panel').scrollTop=0;$('garage-saved').textContent='';init();setColor(selected);syncSetup();resize();this.update(0)},
    close(){active=false;drag=null},
    setColor,
    update(dt){if(!active||!renderer)return;if(auto)yaw+=Math.min(dt,.05)*.16;camera.position.set(Math.sin(yaw)*distance*Math.cos(pitch),1+Math.sin(pitch)*distance,Math.cos(yaw)*distance*Math.cos(pitch));camera.lookAt(0,.65,0);renderer.render(scene,camera);if(new URLSearchParams(location.search).has('debug'))canvas.dataset.renderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures})},
    dispose(){active=false;if(car)disposeCar(car);scene?.traverse(o=>{if(o.isMesh&&o!==car&&!car?.getObjectById(o.id)){o.geometry?.dispose();o.material?.dispose?.()}});renderer?.dispose();renderer?.forceContextLoss()}
  };
}
