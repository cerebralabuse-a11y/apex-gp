import { createWorld, buildCar, disposeCar } from './scene.js';
import { clamp, wrap, formatTime, sampleTrack, nearestTrack, createVehicle, stepVehicle, updateProgress, collideVehicles, getAIControls } from './physics.js';

const $ = id => document.getElementById(id);
const canvas=$('world');
let world;
try { world=createWorld(canvas); } catch(e) { $('loading').hidden=true;$('webgl-error').hidden=false;console.error(e);throw e; }
const {THREE,renderer,scene,camera,track,sun}=world;
const keys=new Set(),touch={};
const storage={get(key,fallback){try{return localStorage.getItem('apex-'+key)||fallback}catch{return fallback}},set(key,value){try{localStorage.setItem('apex-'+key,String(value))}catch{}}};
let state='menu',mode='race',difficulty='club',raceTime=0,countdown=0,accumulator=0,lastTime=0,uiClock=0,camMode=0,messageRemaining=0,messageCooldown=0;
let cars=[],player,selectedColor=storage.get('color','#e83426'),personalBest=Number(storage.get('best','Infinity')),sessionBest=Infinity,pausedFrom='racing',dialogReturn='menu';
let gamepadCamera=false,gamepadPause=false,gamepadActive=false;
const cameraTarget=new THREE.Vector3(),cameraLook=new THREE.Vector3(),smoothLook=new THREE.Vector3();
const teamNames=['M. Voss','L. Moretti','K. Sato','A. Silva','N. Laurent','O. Clarke','R. Costa','YOU'];
const teamColors=['#37c6ca','#e7a129','#4c68d9','#eeeecc','#ab82ca','#eb733f','#4caa75',selectedColor];
const minimap=$('minimap').getContext('2d');
const bounds=track.points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
const mapScale=Math.min(305/(bounds.maxX-bounds.minX),180/(bounds.maxZ-bounds.minZ));
function mapPoint(p){return{x:180+(p.x-(bounds.minX+bounds.maxX)/2)*mapScale,y:112-(p.z-(bounds.minZ+bounds.maxZ)/2)*mapScale}}
const mapPath=new Path2D();track.points.forEach((p,i)=>{const q=mapPoint(p);i?mapPath.lineTo(q.x,q.y):mapPath.moveTo(q.x,q.y)});mapPath.closePath();
$('circuit-length').textContent=(track.length/1000).toFixed(1);
document.querySelector('.minimap-label span').textContent=(track.length/1000).toFixed(1)+' KM';
for(let i=0;i<18;i++)$('rpm-bar').appendChild(document.createElement('i'));
const rpmLights=[...$('rpm-bar').children];

const audio={enabled:false,ctx:null,oscillators:[],gain:null,wind:null,filter:null,
  async start(){
    if(!this.ctx){
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.gain=this.ctx.createGain();this.gain.gain.value=0;this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.Q.value=.8;
      this.filter.connect(this.gain);this.gain.connect(this.ctx.destination);
      for(const [type,multiple,volume] of [['sawtooth',1,.4],['triangle',2,.28],['sawtooth',.5,.25]]){
        const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;g.gain.value=volume;o.connect(g);g.connect(this.filter);o.start();this.oscillators.push({o,multiple});
      }
      const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()-.5)*.5;
      const noise=this.ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;
      this.wind=this.ctx.createGain();this.wind.gain.value=0;noise.connect(filter);filter.connect(this.wind);this.wind.connect(this.ctx.destination);noise.start();
    }
    await this.ctx.resume();
  },
  async set(enabled){this.enabled=enabled;if(enabled){try{await this.start()}catch{this.enabled=false}}$('audio-select').value=this.enabled?'on':'off';$('sound-button').style.color=this.enabled?'var(--acid)':'';$('sound-button').setAttribute('aria-label',this.enabled?'Mute engine audio':'Enable engine audio')},
  update(rpm){if(!this.ctx)return;const t=this.ctx.currentTime,active=state==='racing';this.oscillators.forEach(({o,multiple})=>o.frequency.setTargetAtTime((70+rpm*200)*multiple,t,.055));this.filter.frequency.setTargetAtTime(600+rpm*2100,t,.08);this.gain.gain.setTargetAtTime(this.enabled?(active?.048*(.6+player.throttle*.4):state==='menu'?.008:0):0,t,.08);this.wind.gain.setTargetAtTime(this.enabled&&active?.008*player.speed/80:0,t,.1)},
  beep(freq,duration=.09){if(!this.enabled||!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(this.ctx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.stop(this.ctx.currentTime+duration)}
};

function notify(text,duration=2.5){$('race-message').textContent=text;$('race-message').classList.add('show');messageRemaining=duration}
function gearInfo(){const forward=player.vx*Math.sin(player.yaw)+player.vz*Math.cos(player.yaw);if(forward<-.7)return{gear:'R',rpm:.35};if(player.speed<1)return{gear:state==='menu'?'N':'1',rpm:.25};const thresholds=[0,12,23,34,45,55,65,75,91];let gear=1;while(gear<8&&player.speed>thresholds[gear])gear++;return{gear,rpm:clamp(.3+(player.speed-thresholds[gear-1])/(thresholds[gear]-thresholds[gear-1])*.7,.2,1)}}

function resetGrid(){
  for(const c of cars){scene.remove(c.mesh);disposeCar(c.mesh)}
  cars=[];mode=$('mode-select').value;difficulty=$('difficulty-select').value;
  const total=mode==='race'?8:1;
  for(let i=0;i<total;i++){
    const isPlayer=i===total-1,gridOffset=mode==='race'?-8-Math.floor(i/2)*10-(i%2)*4:-8;
    const car=createVehicle(track,track.start+gridOffset,mode==='race'?(i%2===0?-3.6:3.6):0);
    car.progress=gridOffset;car.index=i;car.isPlayer=isPlayer;car.name=isPlayer?'YOU':teamNames[i];car.color=isPlayer?selectedColor:teamColors[i];car.aiLane=i%2===0?-1.6:1.6;car.targetLane=car.aiLane;car.aiSkill=.96+(i%3)*.018;car.stuckTime=0;
    car.mesh=buildCar(car.color,isPlayer?27:11+i*7);scene.add(car.mesh);cars.push(car);if(isPlayer)player=car;
  }
  raceTime=0;sessionBest=Infinity;countdown=0;accumulator=0;messageRemaining=0;$('race-message').classList.remove('show');
  $('finish-card').hidden=true;$('start-lights').hidden=true;$('menu-card').hidden=false;
  document.body.classList.remove('racing');$('session-tag').innerHTML='<i></i> ON THE GRID';
  $('lap-total').textContent=mode==='race'?'/ 03':'/ ∞';
  const facts=document.querySelectorAll('.menu-facts b');facts[0].textContent=mode==='race'?'03':'∞';facts[1].textContent=String(total).padStart(2,'0');
  $('mode-button').innerHTML=(mode==='race'?'GRAND PRIX':mode==='time'?'TIME TRIAL':'FREE DRIVE')+' <span>⌄</span>';
  $('menu-card').querySelector('p').textContent=mode==='race'?'Eight drivers. One racing line. Everything to prove.':mode==='time'?'Just you, the circuit, and a thousandth of a second.':'No clock to chase. Just the freedom to drive.';
  updateModels(0);updateCamera(1,true);updateUI();
}

function startRace(){
  resetGrid();keys.clear();document.body.classList.add('racing');$('menu-card').hidden=true;
  state='countdown';countdown=0;$('start-lights').hidden=false;$('session-tag').innerHTML='<i></i> FORMATION COMPLETE';
  [...$('start-lights').querySelectorAll('i')].forEach(l=>l.classList.remove('lit'));
  canvas.focus({preventScroll:true});if(audio.enabled)audio.start();
}
function recover(car,automatic=false){
  const road=nearestTrack(track,car.x,car.z),p=sampleTrack(track,road.s,car.isPlayer?0:car.aiLane);
  car.x=p.x;car.z=p.z;car.yaw=p.yaw;car.vx=p.tx*(automatic?18:0);car.vz=p.tz*(automatic?18:0);car.speed=automatic?18:0;car.steer=0;car.road=nearestTrack(track,car.x,car.z);car.previousS=p.s;car.recovered=2;car.stuckTime=0;
  if(car.isPlayer){notify('BACK ON TRACK · KEEP PUSHING',2);updateCamera(1,true)}
}

function getPlayerInput(){
  let steer=(keys.has('KeyD')||keys.has('ArrowRight')||touch.right?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||touch.left?1:0);
  let throttle=keys.has('KeyW')||keys.has('ArrowUp')||touch.throttle?1:0,brake=keys.has('KeyS')||keys.has('ArrowDown')||touch.brake||keys.has('Space')?1:0,boost=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost;
  const gamepads=navigator.getGamepads?.()||[],pad=[...gamepads].find(Boolean);
  if(pad){
    const axis=pad.axes[0]||0;if(Math.abs(axis)>.12)steer=(Math.abs(axis)-.12)/.88*Math.sign(axis);
    throttle=Math.max(throttle,pad.buttons[7]?.value||0);brake=Math.max(brake,pad.buttons[6]?.value||0);boost=boost||pad.buttons[0]?.pressed;
    if(!gamepadActive){gamepadActive=true;notify('GAMEPAD CONNECTED',2)}
  }
  return{steer,throttle,brake,boost};
}
function pollGamepad(){
  const pad=[...(navigator.getGamepads?.()||[])].find(Boolean);if(!pad)return;
  const c=pad.buttons[3]?.pressed,p=pad.buttons[9]?.pressed;
  if(c&&!gamepadCamera&&!document.querySelector('dialog[open]'))cycleCamera();
  if(p&&!gamepadPause&&(!document.querySelector('dialog[open]')||$('pause-dialog').open))togglePause();
  gamepadCamera=c;gamepadPause=p;
}
function aiInput(car,dt){
  car.stuckTime=car.speed<5?car.stuckTime+dt:0;
  if(car.stuckTime>4||car.road.distance>20)recover(car,true);
  return getAIControls(car,cars,track,difficulty,raceTime,dt);
}

function simulate(dt){
  if(state==='countdown'){
    const before=Math.floor(countdown/.65);countdown+=dt;const count=Math.min(5,Math.floor(countdown/.65));
    if(count!==before&&count<=5&&count>0){audio.beep(420,.08);[...$('start-lights').querySelectorAll('i')].forEach((l,i)=>l.classList.toggle('lit',i<count));world.lamps.forEach((l,i)=>l.material.color.set(i<count?'#f3392c':'#351b1e'))}
    if(countdown>4.45){state='racing';$('start-lights').hidden=true;$('session-tag').innerHTML='<i></i> '+(mode==='race'?'RACE IN PROGRESS':mode==='time'?'TIME TRIAL':'FREE DRIVE');world.lamps.forEach(l=>l.material.color.set('#351b1e'));audio.beep(840,.25);notify('LIGHTS OUT. FULL SEND.',2)}
    return;
  }
  if(state!=='racing')return;
  raceTime+=dt;messageCooldown=Math.max(0,messageCooldown-dt);
  const input=getPlayerInput();
  for(const car of cars){
    if(car.finished)continue;
    let controls=car.isPlayer?{...input}:aiInput(car,dt);
    if(car.isPlayer&&car.throttle>.1){
      const lead=cars.find(c=>c!==car&&c.road.s-car.road.s>5&&c.road.s-car.road.s<32&&Math.abs(c.road.offset-car.road.offset)<2.4);
      if(lead&&car.speed>40){car.vx+=Math.sin(car.yaw)*1.8*dt;car.vz+=Math.cos(car.yaw)*1.8*dt;if(messageCooldown===0){notify('SLIPSTREAM · MAKE YOUR MOVE',1.7);messageCooldown=12}}
    }
    stepVehicle(car,controls,dt,track.halfWidth);
    car.road=nearestTrack(track,car.x,car.z,car.road.index);
    if(car.road.distance>25){
      const p=sampleTrack(track,car.road.s,Math.sign(car.road.offset)*24.6);car.x=p.x;car.z=p.z;car.vx*=.45;car.vz*=.45;
      if(car.isPlayer&&car.collisionCooldown===0){notify('BARRIER CONTACT · RECOVER WITH R',2);car.collisionCooldown=2;audio.beep(90,.12)}
    }
    const completed=updateProgress(car,track,raceTime,dt);
    if(completed){
      const lapTime=car.lapTimes.at(-1);
      if(car.isPlayer){
        sessionBest=Math.min(sessionBest,lapTime);
        if(lapTime<personalBest){personalBest=lapTime;storage.set('best',personalBest);notify('NEW PERSONAL BEST · '+formatTime(lapTime),4)}
        else notify('LAP '+(car.lap-1)+' · '+formatTime(lapTime),3);
        audio.beep(1000,.1);
      }
      if(mode==='race'&&car.lap>3){car.finished=true;car.finishTime=raceTime;}
    }
    if(car.isPlayer&&car.road.distance>11&&messageCooldown===0){notify('OFF CIRCUIT · EASY ON THE THROTTLE',2);messageCooldown=9}
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    if(collideVehicles(cars[i],cars[j])&&(cars[i].isPlayer||cars[j].isPlayer)&&player.collisionCooldown===0){player.collisionCooldown=1.5;notify('CONTACT · KEEP IT CLEAN',1.4);audio.beep(75,.1)}
  }
  if(player.finished)finishRace();
}

function sortedCars(){return [...cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress)}
function finishRace(){
  state='finished';keys.clear();$('finish-card').hidden=false;$('session-tag').innerHTML='<i></i> CHEQUERED FLAG';
  const pos=sortedCars().indexOf(player)+1;
  $('finish-title').textContent=pos===1?'THIS IS YOUR MOMENT.':pos<=3?'PODIUM. EARNED.':'WHAT A RACE.';
  $('finish-subtitle').textContent=pos===1?'You owned Valle Rossa. See you on the top step.':pos<=3?'A place on the podium. A little closer to the limit.':'Every lap makes you faster. The next one is yours.';
  $('finish-position').textContent=String(pos).padStart(2,'0')+' / 08';$('finish-time').textContent=formatTime(raceTime);$('finish-best').textContent=formatTime(sessionBest);
  notify('FINISH · P'+pos,3);audio.beep(1000,.35);updateUI();
}

function updateModels(dt){
  for(const car of cars){
    car.mesh.position.set(car.x,.035+((car.road.distance>9&&car.speed>5)?Math.sin(performance.now()*.07)*.025:0),car.z);car.mesh.rotation.set(0,car.yaw,clamp(car.steer*car.speed*.0007,-.05,.05));
    car.mesh.userData.wheels.forEach((wheel,i)=>{wheel.rotation.x+=car.speed*dt/.47;if(i%2===1)wheel.rotation.y=-car.steer*.2});
    car.mesh.userData.rearLight.visible=car.brake>.1||Math.floor(performance.now()/350)%2===0;
    car.mesh.userData.helmet.visible=car.mesh.userData.visor.visible=!car.isPlayer||camMode!==1;
    car.mesh.visible=car.recovered<=0||Math.floor(performance.now()/120)%2===0;
  }
}
function updateCamera(dt,snap=false){
  if(!player)return;
  const fx=Math.sin(player.yaw),fz=Math.cos(player.yaw),speed=player.speed;
  const menu=state==='menu',orbit=menu?Math.sin(performance.now()*.00012)*1.7:0;
  if(camMode===0){cameraTarget.set(player.x-fx*(menu?11:10.8)-fz*(menu?3+orbit:0),menu?4.8:4.7+speed*.007,player.z-fz*(menu?11:10.8)+fx*(menu?3+orbit:0));cameraLook.set(player.x+fx*(menu?9:12+speed*.05),1.05,player.z+fz*(menu?9:12+speed*.05))}
  else if(camMode===1){cameraTarget.set(player.x+fx*.65,1.12,player.z+fz*.65);cameraLook.set(player.x+fx*60,1.12,player.z+fz*60)}
  else{cameraTarget.set(player.x-fx*19-fz*4,10,player.z-fz*19+fx*4);cameraLook.set(player.x+fx*12,0,player.z+fz*12)}
  const rate=snap||camMode===1?1:1-Math.exp(-dt*6.5);camera.position.lerp(cameraTarget,rate);smoothLook.lerp(cameraLook,snap?1:1-Math.exp(-dt*10));camera.lookAt(smoothLook);
  const fov=(camMode===1?72:camMode===2?54:58)+speed*.11+(player.boost?4:0);camera.fov+=(fov-camera.fov)*(snap?1:1-Math.exp(-dt*3));camera.updateProjectionMatrix();
  sun.position.set(player.x-240,410,player.z-230);sun.target.position.set(player.x,0,player.z);
}
function drawMap(){
  const ctx=minimap;ctx.clearRect(0,0,360,230);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.strokeStyle='#0d2424aa';ctx.lineWidth=13;ctx.stroke(mapPath);ctx.strokeStyle='#f0f0d68c';ctx.lineWidth=6;ctx.stroke(mapPath);ctx.strokeStyle='#4f6e57';ctx.lineWidth=2;ctx.stroke(mapPath);
  const p=mapPoint(sampleTrack(track,track.start));ctx.fillStyle='#fff';ctx.fillRect(p.x-3,p.y-6,6,12);
  for(const c of cars){if(c.isPlayer)continue;const q=mapPoint(c);ctx.beginPath();ctx.arc(q.x,q.y,3.3,0,Math.PI*2);ctx.fillStyle='#f5eee2';ctx.fill()}
  const q=mapPoint(player);ctx.beginPath();ctx.arc(q.x,q.y,9,0,Math.PI*2);ctx.fillStyle='#e8f45a30';ctx.fill();ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fillStyle='#e8f45a';ctx.fill();ctx.strokeStyle='#17251d';ctx.lineWidth=1.5;ctx.stroke();
}
function updateUI(){
  const ranking=sortedCars(),pos=ranking.indexOf(player)+1,gear=gearInfo();
  $('pause-button').disabled=state==='menu'||state==='finished';
  $('position').textContent=String(pos).padStart(2,'0');document.querySelector('.race-stat small').textContent='/ '+String(cars.length).padStart(2,'0');
  $('lap').textContent=String(Math.min(player.lap,mode==='race'?3:999)).padStart(2,'0');
  $('lap-time').textContent=formatTime(state==='finished'?player.lapTimes.at(-1)||0:raceTime-player.lapStart);$('best-time').textContent=formatTime(personalBest);
  $('speed').textContent=String(Math.round(player.speed*3.6)).padStart(3,'0');$('gear').textContent=gear.gear;
  $('throttle-meter').style.height=player.throttle*100+'%';$('brake-meter').style.height=player.brake*100+'%';
  $('ers-value').textContent=Math.round(player.energy)+'%';$('ers-bar').style.width=player.energy+'%';$('ers-bar').style.background=player.boost?'#ffffff':'var(--acid)';
  $('speed-lines').style.opacity=player.boost?'1':'0';
  rpmLights.forEach((light,i)=>{light.className=(i<gear.rpm*18?'on':'')+(i>13?' red':'')});
  $('sector').textContent=String((Math.floor(Math.max(0,player.progress)/track.length*4)%4)+1).padStart(2,'0');
  const fraction=wrap(player.road.s-track.start,track.length)/track.length;
  const turns=['T01 / RETTILINEO','T02 / CURVA NORD','T04 / BELVEDERE','T06 / ESSE ROSSA','T08 / VALLE','T10 / CURVA SUD'];$('map-turn').textContent=turns[Math.floor(fraction*turns.length)];
  $('standings').innerHTML=ranking.map((c,i)=>{
    const gap=i===0?'LEADER':c.finished?'FINISHED':'+'+Math.abs((ranking[0].progress-c.progress)/Math.max(ranking[0].speed,35)).toFixed(1)+'s';
    return `<div class="driver-row${c.isPlayer?' you':''}" style="--team:${c.color}"><span class="rank">${i+1}</span><i class="team-color"></i><span class="driver-name">${c.name}</span><span class="interval">${gap}</span></div>`;
  }).join('');
  drawMap();audio.update(gear.rpm);
}
function resize(){const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(canvas);
function cycleCamera(){camMode=(camMode+1)%3;$('camera-label').textContent=['CHASE CAM','COCKPIT CAM','BROADCAST CAM'][camMode];updateCamera(1,true);storage.set('camera',camMode)}
function togglePause(){
  if(state==='paused'&&$('pause-dialog').open){$('pause-dialog').close();state=pausedFrom;keys.clear();canvas.focus({preventScroll:true});return}
  if(state==='racing'||state==='countdown'){pausedFrom=state;state='paused';keys.clear();$('pause-dialog').showModal()}
}
function openDialog(id){
  if(document.querySelector('dialog[open]'))return;
  dialogReturn=state;if(state==='racing'||state==='countdown')state='paused';keys.clear();$(id).showModal();
}
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelectorAll('.close-button').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
  dialog.addEventListener('close',()=>{if(dialog.id==='pause-dialog'){if(state==='paused')state=pausedFrom}else{if(state==='paused')state=dialogReturn;if(state==='menu')resetGrid()}keys.clear()});
}
$('start-button').addEventListener('click',startRace);
$('race-again').addEventListener('click',()=>{state='menu';resetGrid()});
$('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));
$('setup-button').addEventListener('click',()=>openDialog('settings-dialog'));
$('mode-button').addEventListener('click',()=>{$('mode-select').focus();openDialog('settings-dialog')});
$('garage-nav').addEventListener('click',()=>openDialog('garage-dialog'));
$('guide-nav').addEventListener('click',()=>openDialog('guide-dialog'));
$('race-nav').addEventListener('click',()=>{document.querySelector('dialog[open]')?.close();if(state==='paused')togglePause();canvas.focus({preventScroll:true})});
$('camera-button').addEventListener('click',cycleCamera);
$('pause-button').addEventListener('click',togglePause);
$('resume-button').addEventListener('click',togglePause);
$('restart-button').addEventListener('click',()=>{$('pause-dialog').close();startRace()});
$('quit-button').addEventListener('click',()=>{state='menu';$('pause-dialog').close();resetGrid()});
$('sound-button').addEventListener('click',()=>audio.set(!audio.enabled));
$('audio-select').addEventListener('change',e=>audio.set(e.target.value==='on'));
$('time-select').addEventListener('change',e=>{world.setLighting(e.target.value);$('weather-label').textContent=e.target.value==='dusk'?'DUSK':'CLEAR'});
$('quality-select').addEventListener('change',e=>{world.setQuality(e.target.value==='high');resize()});
$('line-select').addEventListener('change',e=>{world.racingLine.visible=e.target.value==='on'});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('race-view').requestFullscreen()}catch{notify('FULLSCREEN UNAVAILABLE IN THIS WINDOW',3)}});
document.querySelectorAll('[data-color]').forEach(b=>{if(b.dataset.color===selectedColor){document.querySelectorAll('[data-color]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')}b.addEventListener('click',()=>{selectedColor=b.dataset.color;storage.set('color',selectedColor);player.mesh.userData.paint.color.set(selectedColor);player.color=selectedColor;document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('selected',x===b))})});

window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLSelectElement||e.target instanceof HTMLInputElement)return;
  if(document.querySelector('dialog[open]')){if((e.code==='Escape'||e.code==='KeyP')&&$('pause-dialog').open){e.preventDefault();togglePause()}return}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyC')cycleCamera();if(e.code==='Escape'||e.code==='KeyP')togglePause();
  if(e.code==='KeyR'&&state==='racing')recover(player);if(e.code==='KeyM')audio.set(!audio.enabled);
  if(e.code==='Enter'&&state==='menu')startRace();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();Object.keys(touch).forEach(k=>touch[k]=false);if(state==='racing'||state==='countdown')togglePause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='racing'||state==='countdown'))togglePause()});
document.querySelectorAll('[data-control]').forEach(button=>{
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touch[button.dataset.control]=true});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touch[button.dataset.control]=false);
});

function frame(timestamp){
  const dt=Math.min((timestamp-lastTime)/1000||0,.1);lastTime=timestamp;
  pollGamepad();
  accumulator+=dt;let steps=0;while(accumulator>=1/120&&steps<12){simulate(1/120);accumulator-=1/120;steps++}
  if(messageRemaining>0){messageRemaining-=dt;if(messageRemaining<=0)$('race-message').classList.remove('show')}
  updateModels(state==='racing'?dt:0);updateCamera(dt);uiClock+=dt;if(uiClock>.08){updateUI();uiClock=0}
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
resetGrid();resize();
requestAnimationFrame(timestamp=>{lastTime=timestamp;frame(timestamp);$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,550)});
// Read-only telemetry is useful for race replays, accessibility tools, and QA.
window.apex={get telemetry(){return{state,mode,time:raceTime,position:sortedCars().indexOf(player)+1,lap:player.lap,speed:player.speed*3.6,energy:player.energy,roadOffset:player.road.offset,progress:player.progress,trackLength:track.length,drivers:cars.map(c=>({name:c.name,speed:c.speed*3.6,offset:c.road.offset,progress:c.progress,lap:c.lap}))}},get renderer(){return renderer.info.render}};
