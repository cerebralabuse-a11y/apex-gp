import { createWorld, buildCar, disposeCar, drivingCameraTargets } from './scene.js';
import { createArcadeHUD } from './arcade-hud.js';
import {bindMobileControls} from './mobile-controls.js';
import {createMapboxWorld} from './mapbox-world.js';
import {selectedMap,mapUrl} from './map-choice.js';
import {createGarage} from './garage.js';
import {createDrivingFeel} from './driving-feel.js';
import {setupId,bestLapKey} from './vehicle-setup.js';
import {createCompetitionClient} from './competition-client.js';
import {createCompetitionUI} from './competition-ui.js';
import {createRoomClient} from './room-client.js';
import {createRoomsUI} from './rooms-ui.js';
import {createRecordedAttempt} from './competition-recording.js';
import { clamp, wrap, formatTime, sampleTrack, nearestTrack, createVehicle, stepVehicle, resolveTrackWall, updateProgress, collideVehicles, getAIControls } from './physics.js';

const $ = id => document.getElementById(id);
const canvas=$('world');
const storage={get(key,fallback){try{return localStorage.getItem('apex-'+key)||fallback}catch{return fallback}},set(key,value){try{localStorage.setItem('apex-'+key,String(value))}catch{}}};
const coarsePointer=matchMedia('(any-pointer: coarse)'),touchDevice=coarsePointer.matches||navigator.maxTouchPoints>0;
const savedQuality=storage.get('quality',touchDevice?'mobile':'high'),initialQuality=['high','mobile','low'].includes(savedQuality)?savedQuality:(touchDevice?'mobile':'high');
const mapMode=selectedMap(location.search);
const debugRender=new URLSearchParams(location.search).has('debug');
let world;
try { world=mapMode==='classic'?createWorld(canvas,{quality:initialQuality}):await createMapboxWorld(canvas,{quality:initialQuality}); } catch(e) { $('loading').hidden=true;$('webgl-error').hidden=false;$('webgl-error').querySelector('h2').textContent=mapMode==='city'?'The city map could not start':'The game could not start';$('webgl-error').querySelector('p').textContent=e.message;console.error(e);throw e; }
const {THREE,renderer,scene,camera,track,sun}=world;
$('map-select').value=mapMode;
$('map-choice').textContent=mapMode==='city'?'CITY MAP · BETA ↗':'ORIGINAL MAP ↗';
$('city-beta-badge').hidden=mapMode!=='city';
$('load-map').disabled=true;
$('map-select').addEventListener('change',e=>{$('load-map').disabled=e.target.value===mapMode});
$('load-map').addEventListener('click',()=>location.assign(mapUrl(location.href,$('map-select').value)));
const arcadeHUD=createArcadeHUD($('arcade-hud'));
const reducedMenuMotion=matchMedia('(prefers-reduced-motion: reduce)');let menuTime=0;
const keys=new Set();
let overviewFrom='menu',orbitYaw=-.18,orbitPitch=.96,orbitZoom=1;
let state='menu',photoFrom='menu',mode='race',difficulty='club',raceTime=0,countdown=0,accumulator=0,lastTime=0,uiClock=0,camMode=0,messageRemaining=0,messageCooldown=0;
let cars=[],player,selectedColor=storage.get('color','#a2cf3e'),personalBest=Number(storage.get('best-'+track.id,'Infinity')),sessionBest=Infinity,pausedFrom='racing',dialogReturn='menu';
let selectedSetup=setupId(storage.get('car-setup','balanced')),activeSetup=selectedSetup;
let pendingVerifiedTicket=null,verifiedSession=null,submittingVerified=false,verifiedStartGeneration=0;
const competition=createCompetitionClient();
const competitionUI=createCompetitionUI({api:competition,trackId:track.id,onStart:async()=>{
  if(mapMode!=='classic')throw new Error('Verified beta laps use the original map.');
  const generation=++verifiedStartGeneration,ticket=await competition.startAttempt();
  if(generation!==verifiedStartGeneration||!$('leaderboard-dialog').open)throw new Error('Attempt cancelled. Start a new one when ready.');
  $('leaderboard-dialog').close();pendingVerifiedTicket=ticket;startRace();
}});
const roomClient=createRoomClient({api:competition});
const roomsUI=createRoomsUI({api:competition,client:roomClient,onAccount:()=>openDialog('leaderboard-dialog')});
let roomRaceActive=false,roomRaceStartAt=0,roomRaceResults=[];
let motionSetting=storage.get('camera-effects','full');
if(!['full','subtle','off'].includes(motionSetting))motionSetting='full';
const drivingFeel=createDrivingFeel(),smoothCamera=new THREE.Vector3();
const effectiveMotion=()=>reducedMenuMotion.matches?'off':motionSetting;
const garage=createGarage({buildCar,disposeCar,color:selectedColor,setup:selectedSetup,
  onColor(color){selectedColor=color;storage.set('color',color);player.mesh.userData.paint.color.set(color);player.color=color},
  onSetup(id){selectedSetup=setupId(id);storage.set('car-setup',selectedSetup)}
});
let gamepadCamera=false,gamepadPause=false,gamepadActive=false;
let mobileEnabled=false,pendingMobileStart=false,rotationPaused=false,nextMobileFrame=0;
const mobileControls=bindMobileControls({steer:$('steer-pad'),pedals:$('pedal-pad'),brake:$('touch-brake'),drive:$('drive-pad'),enabled:()=>mobileEnabled&&innerWidth>innerHeight&&(state==='racing'||state==='countdown')&&!document.querySelector('dialog[open]')});
const touch=mobileControls.input;
function clearInputs(){keys.clear();mobileControls.clear()}
function portraitPhone(){return mobileEnabled&&innerHeight>innerWidth}
async function requestLandscape(){
  if(!mobileEnabled||!touchDevice)return;
  try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.()}catch{}
  try{await screen.orientation?.lock?.('landscape')}catch{}
}
function showRotatePrompt(show){
  const prompt=$('rotate-prompt'),opening=show&&prompt.hidden;prompt.hidden=!show;
  for(const child of $('race-view').children)if(child!==prompt)child.inert=show;
  if(opening)$('rotate-back').focus({preventScroll:true});
}
function syncOrientation(){
  const portrait=portraitPhone();
  if(portrait&&verifiedSession&&(state==='racing'||state==='countdown'))invalidateVerified('Rotation interrupted the beta attempt. Start again in landscape.');
  if(portrait&&(state==='racing'||state==='countdown')){pausedFrom=state;state='paused';rotationPaused=true;clearInputs()}
  showRotatePrompt(portrait&&(pendingMobileStart||rotationPaused));
  if(!portrait&&pendingMobileStart){pendingMobileStart=false;startRaceNow()}
  if(!portrait&&rotationPaused){rotationPaused=false;if(state==='paused'&&!document.querySelector('dialog[open]'))$('pause-dialog').showModal()}
}
function applyMobileControls(){
  mobileEnabled=$('touch-select').value==='on'||($('touch-select').value==='auto'&&(coarsePointer.matches||navigator.maxTouchPoints>0));
  document.body.classList.toggle('mobile-ui',mobileEnabled);clearInputs();syncOrientation();
}
const cameraTarget=new THREE.Vector3(),cameraLook=new THREE.Vector3(),smoothLook=new THREE.Vector3();
const teamNames=['M. Voss','L. Moretti','K. Sato','A. Silva','N. Laurent','O. Clarke','R. Costa','YOU'];
const teamColors=['#37c6ca','#e7a129','#4c68d9','#eeeecc','#ab82ca','#eb733f','#4caa75',selectedColor];
const minimap=$('minimap').getContext('2d');
const bounds=track.points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
const mapScale=Math.min(305/(bounds.maxX-bounds.minX),180/(bounds.maxZ-bounds.minZ));
function mapPoint(p){return{x:180+(p.x-(bounds.minX+bounds.maxX)/2)*mapScale,y:112+(p.z-(bounds.minZ+bounds.maxZ)/2)*mapScale}}
const mapPath=new Path2D();track.points.forEach((p,i)=>{const q=mapPoint(p);i?mapPath.lineTo(q.x,q.y):mapPath.moveTo(q.x,q.y)});mapPath.closePath();
$('circuit-length').textContent=(track.length/1000).toFixed(3);
document.querySelector('.overview-heading b').textContent=(track.length/1000).toFixed(3)+' KM';
document.querySelector('.board-circuit span:last-child').textContent='JEWEL LAKE / '+(track.length/1000).toFixed(3)+' KM / NAVI MUMBAI';
document.querySelector('.minimap-label span').textContent=(track.length/1000).toFixed(3)+' KM';
for(let i=0;i<18;i++)$('rpm-bar').appendChild(document.createElement('i'));
const rpmLights=[...$('rpm-bar').children];

const audio={enabled:false,ctx:null,oscillators:[],gain:null,wind:null,filter:null,windFilter:null,boostBuffer:null,boostGain:null,wasBoost:false,
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
      this.boostBuffer=buffer;const noise=this.ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;this.windFilter=filter;
      this.wind=this.ctx.createGain();this.wind.gain.value=0;noise.connect(filter);filter.connect(this.wind);this.wind.connect(this.ctx.destination);noise.start();this.boostGain=this.ctx.createGain();this.boostGain.gain.value=0;this.boostGain.connect(this.ctx.destination);
    }
    await this.ctx.resume();
  },
  async set(enabled){this.enabled=enabled;if(enabled){try{await this.start()}catch{this.enabled=false}}$('audio-select').value=this.enabled?'on':'off';$('sound-button').style.color=this.enabled?'var(--acid)':'';$('sound-button').setAttribute('aria-label',this.enabled?'Mute engine audio':'Enable engine audio')},
  update(rpm){if(!this.ctx)return;const t=this.ctx.currentTime,active=state==='racing';this.oscillators.forEach(({o,multiple})=>o.frequency.setTargetAtTime((70+rpm*200)*multiple,t,.055));this.filter.frequency.setTargetAtTime(600+rpm*2100,t,.08);this.gain.gain.setTargetAtTime(this.enabled?(active?.048*(.6+player.throttle*.4):state==='menu'?.008:0):0,t,.08);this.wind.gain.setTargetAtTime(this.enabled&&active?(.008*player.speed/80+.018*Math.pow(player.speed/90,3)+(player.boost?.014:0)):0,t,.1);this.windFilter.frequency.setTargetAtTime(700+player.speed*22+(player.boost?1100:0),t,.08);this.boostGain.gain.setTargetAtTime(this.enabled&&active?1:0,t,.025);const deploying=this.enabled&&active&&player.boost;if(deploying&&!this.wasBoost){const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),high=this.ctx.createBiquadFilter();source.buffer=this.boostBuffer;high.type='highpass';high.frequency.value=1300;source.connect(high);high.connect(gain);gain.connect(this.boostGain);gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.09,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+.48);source.start();source.stop(t+.5);source.onended=()=>{source.disconnect();high.disconnect();gain.disconnect()}}this.wasBoost=deploying},
  beep(freq,duration=.09){if(!this.enabled||!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(this.ctx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.stop(this.ctx.currentTime+duration)}
};

function notify(text,duration=2.5){$('race-message').textContent=text;$('race-message').classList.add('show');messageRemaining=duration}
function gearInfo(){const forward=player.vx*Math.sin(player.yaw)+player.vz*Math.cos(player.yaw);if(forward<-.7)return{gear:'R',rpm:.35};if(player.speed<1)return{gear:state==='menu'?'N':'1',rpm:.25};const thresholds=[0,12,23,34,45,55,65,75,91];let gear=1;while(gear<8&&player.speed>thresholds[gear])gear++;return{gear,rpm:clamp(.3+(player.speed-thresholds[gear-1])/(thresholds[gear]-thresholds[gear-1])*.7,.2,1)}}

function resetGrid({verifiedTicket=null,roomPlayers=null,roomSelfId=null}={}){
  pendingVerifiedTicket=null;
  clearInputs();pendingMobileStart=rotationPaused=false;showRotatePrompt(false);
  verifiedSession=null;roomRaceActive=!!roomPlayers;roomRaceResults=[];activeSetup=verifiedTicket?'balanced':selectedSetup;personalBest=Number(storage.get(bestLapKey(track.id,activeSetup),'Infinity'));drivingFeel.reset();
  for(const c of cars){scene.remove(c.mesh);disposeCar(c.mesh)}
  cars=[];mode=roomRaceActive?'room':verifiedTicket?'time':$('mode-select').value;difficulty=$('difficulty-select').value;
  const total=roomRaceActive?roomPlayers.length:mode==='race'?8:1;
  for(let i=0;i<total;i++){
    const roomEntry=roomRaceActive?roomPlayers[i]:null,isPlayer=roomRaceActive?roomEntry.id===roomSelfId:i===total-1,gridOffset=roomRaceActive?-8-roomEntry.index*14:mode==='race'?-8-i*14:-8;
    const car=createVehicle(track,track.start+gridOffset,roomRaceActive?(roomEntry.index%2===0?-1.6:1.6):mode==='race'?(i%2===0?-1.6:1.6):0);
    car.progress=gridOffset;car.index=i;car.isPlayer=isPlayer;car.name=roomRaceActive?roomEntry.driver:isPlayer?'YOU':teamNames[i];car.color=roomRaceActive?roomEntry.color:isPlayer?selectedColor:teamColors[i];car.aiLane=i%2===0?-1.6:1.6;car.targetLane=car.aiLane;car.aiSkill=.96+(i%3)*.018;car.stuckTime=0;
    if(roomRaceActive){car.roomId=roomEntry.id;car.roomIndex=roomEntry.index;car.roomRemote=!isPlayer;car.x=roomEntry.grid.x;car.z=roomEntry.grid.z;car.yaw=roomEntry.grid.yaw;car.road=nearestTrack(track,car.x,car.z);car.previousS=car.road.s;car.progress=gridOffset;car.lap=1;car.lapStart=0;car.lapTimes=[];car.finished=false}
    car.setup=isPlayer?activeSetup:'balanced';car.mesh=buildCar(car.color,isPlayer?27:11+i*7);scene.add(car.mesh);cars.push(car);if(isPlayer)player=car;
  }
  if(verifiedTicket)verifiedSession=createRecordedAttempt(verifiedTicket,player);
  $('verified-retry')?.remove();
  raceTime=0;sessionBest=Infinity;countdown=0;accumulator=0;messageRemaining=0;$('race-message').classList.remove('show');
  $('finish-card').hidden=true;$('start-lights').hidden=true;$('menu-card').hidden=false;
  document.body.classList.remove('racing');document.body.classList.add('on-title');$('session-tag').innerHTML='<i></i> ON THE GRID';
  $('lap-total').textContent=mode==='race'||mode==='room'?'/ 03':'/ ∞';
  const facts=document.querySelectorAll('.menu-facts b');facts[0].textContent=mode==='race'?'03':'∞';facts[1].textContent=String(total).padStart(2,'0');
  $('mode-button').innerHTML=(mode==='race'?'GRAND PRIX':mode==='time'?'TIME TRIAL':'FREE DRIVE')+' <span>⌄</span>';
  $('menu-card').querySelector('p').textContent=mode==='race'?'Race the waterfront. Chase the last light.':mode==='time'?'Just you, Jewel Lake, and the clock.':'A sunset, a lakeside road, and the freedom to drive.';
  updateModels(0);updateCamera(1,true);updateUI();
}

function startRace(){
  clearInputs();void requestLandscape();
  if(portraitPhone()){pendingMobileStart=true;syncOrientation();return}
  startRaceNow();
}
function startRaceNow(){
  const verifiedTicket=pendingVerifiedTicket;pendingVerifiedTicket=null;
  resetGrid({verifiedTicket});keys.clear();document.body.classList.add('racing');document.body.classList.remove('on-title');$('menu-card').hidden=true;
  state='countdown';countdown=0;$('start-lights').hidden=false;$('session-tag').innerHTML='<i></i> '+(roomRaceActive?'PRIVATE ROOM · UNRANKED':'FORMATION COMPLETE');
  [...$('start-lights').querySelectorAll('i')].forEach(l=>l.classList.remove('lit'));
  canvas.focus({preventScroll:true});if(audio.enabled)audio.start();
}
function recover(car,automatic=false){
  if(roomRaceActive&&car.isPlayer){notify('RECOVERY IS DISABLED IN PRIVATE ROOMS',2);return}
  if(car.isPlayer&&verifiedSession){invalidateVerified('Recovery invalidates a beta attempt. Start a new one.');return}
  const road=nearestTrack(track,car.x,car.z),p=sampleTrack(track,road.s,car.isPlayer?0:car.aiLane);
  car.x=p.x;car.z=p.z;car.yaw=p.yaw;car.vx=p.tx*(automatic?18:0);car.vz=p.tz*(automatic?18:0);car.speed=automatic?18:0;car.steer=0;car.road=nearestTrack(track,car.x,car.z);car.previousS=p.s;car.recovered=2;car.stuckTime=0;
  if(car.isPlayer){notify('BACK ON TRACK · KEEP PUSHING',2);updateCamera(1,true)}
}

function getPlayerInput(){
  let steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  if(touch.pointers.has('steer'))steer=touch.steer;
  let throttle=keys.has('KeyW')||keys.has('ArrowUp')||touch.throttle?1:0,brake=keys.has('KeyS')||keys.has('ArrowDown')||touch.brake||keys.has('Space')?1:0,boost=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost;
  const gamepads=navigator.getGamepads?.()||[],pad=[...gamepads].find(Boolean);
  if(pad){
    const axis=pad.axes[0]||0;if(Math.abs(axis)>.12)steer=(Math.abs(axis)-.12)/.88*Math.sign(axis);
    throttle=Math.max(throttle,pad.buttons[7]?.value||0);brake=Math.max(brake,pad.buttons[6]?.value||0);boost=boost||pad.buttons[0]?.pressed;
    if(!gamepadActive){gamepadActive=true;notify('GAMEPAD CONNECTED',2)}
  }
  if(touch.brake){throttle=0;boost=false}
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
    if(roomRaceActive){
      const remaining=Math.max(0,(roomRaceStartAt-roomClient.serverNow())/1000),count=Math.min(5,Math.max(0,Math.ceil(remaining)));
      countdown=5-remaining;
      [...$('start-lights').querySelectorAll('i')].forEach((l,i)=>l.classList.toggle('lit',i>=count&&count>0));
      if(remaining<=0){state='racing';countdown=5;$('start-lights').hidden=true;$('session-tag').innerHTML='<i></i> PRIVATE ROOM · UNRANKED';audio.beep(840,.25);notify('LIGHTS OUT · PRIVATE ROOM',3)}
      return;
    }
    const before=Math.floor(countdown/.65);countdown+=dt;const count=Math.min(5,Math.floor(countdown/.65));
    if(count!==before&&count<=5&&count>0){audio.beep(420,.08);[...$('start-lights').querySelectorAll('i')].forEach((l,i)=>l.classList.toggle('lit',i<count));world.lamps.forEach((l,i)=>l.material.color.set(i<count?'#f3392c':'#351b1e'))}
    if(countdown>4.45){state='racing';$('start-lights').hidden=true;$('session-tag').innerHTML='<i></i> '+(verifiedSession?'VERIFIED BETA · OUTLAP':mode==='race'?'RACE IN PROGRESS':mode==='time'?'TIME TRIAL':'FREE DRIVE');world.lamps.forEach(l=>l.material.color.set('#351b1e'));audio.beep(840,.25);notify(verifiedSession?'BETA OUTLAP · NEXT LAP IS TIMED':'LIGHTS OUT. FULL SEND.',3)}
    return;
  }
  if(state!=='racing')return;
  raceTime+=dt;messageCooldown=Math.max(0,messageCooldown-dt);
  const input=getPlayerInput();
  if(verifiedSession){
    const before=verifiedSession.run.stage,stage=verifiedSession.step(input);
    if(before==='outlap'&&stage==='timed'){player.lapStart=raceTime;$('session-tag').innerHTML='<i></i> VERIFIED BETA · FLYING LAP';notify('FLYING LAP · MAKE IT COUNT',3)}
    if(stage==='invalid')invalidateVerified(verifiedSession.run.invalidReason);
    else if(stage==='complete')finishVerified();
    return;
  }
  if(roomRaceActive){
    if(!player.finished){
      stepVehicle(player,input,dt,track.halfWidth);player.road=nearestTrack(track,player.x,player.z,player.road.index);
      resolveTrackWall(player,track);updateProgress(player,track,raceTime,dt);
      if(player.lap>3){player.finished=true;player.finishTime=raceTime;player.throttle=0;player.brake=0;player.boost=false;notify('CHEQUERED FLAG · WAITING FOR YOUR GRID',3)}
      roomClient.sendState(player);
    }
    return;
  }
  for(const car of cars){
    if(car.finished)continue;
    let controls=car.isPlayer?{...input}:aiInput(car,dt);
    if(car.isPlayer&&car.throttle>.1){
      const lead=cars.find(c=>c!==car&&c.road.s-car.road.s>5&&c.road.s-car.road.s<32&&Math.abs(c.road.offset-car.road.offset)<2.4);
      if(lead&&car.speed>40){car.vx+=Math.sin(car.yaw)*1.8*dt;car.vz+=Math.cos(car.yaw)*1.8*dt;if(messageCooldown===0){notify('SLIPSTREAM · MAKE YOUR MOVE',1.7);messageCooldown=12}}
    }
    stepVehicle(car,controls,dt,track.halfWidth);
    car.road=nearestTrack(track,car.x,car.z,car.road.index);
    if(resolveTrackWall(car,track)){
      if(car.isPlayer&&car.collisionCooldown===0){notify('BARRIER CONTACT · RECOVER WITH R',2);car.collisionCooldown=2;audio.beep(90,.12)}
    }
    const completed=updateProgress(car,track,raceTime,dt);
    if(completed){
      const lapTime=car.lapTimes.at(-1);
      if(car.isPlayer){
        sessionBest=Math.min(sessionBest,lapTime);
        if(lapTime<personalBest){personalBest=lapTime;storage.set(bestLapKey(track.id,activeSetup),personalBest);notify('NEW PERSONAL BEST · '+formatTime(lapTime),4)}
        else notify('LAP '+(car.lap-1)+' · '+formatTime(lapTime),3);
        audio.beep(1000,.1);
      }
      if(mode==='race'&&car.lap>3){car.finished=true;car.finishTime=raceTime;}
    }
    if(car.isPlayer&&car.road.distance>11&&messageCooldown===0){notify('OFF CIRCUIT · EASY ON THE THROTTLE',2);messageCooldown=9}
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    if(cars[i].finished||cars[j].finished)continue;
    if(collideVehicles(cars[i],cars[j])&&(cars[i].isPlayer||cars[j].isPlayer)&&player.collisionCooldown===0){player.collisionCooldown=1.5;notify('CONTACT · KEEP IT CLEAN',1.4);audio.beep(75,.1)}
  }
  if(player.finished)finishRace();
}

function sortedCars(){return [...cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress)}
function finishRace(){
  if(roomRaceActive)return;
  const labels=$('finish-card').querySelectorAll('.finish-stats small');labels[0].textContent='POSITION';labels[1].textContent='RACE TIME';labels[2].textContent='BEST LAP';
  state='finished';clearInputs();$('finish-card').hidden=false;$('session-tag').innerHTML='<i></i> CHEQUERED FLAG';
  const pos=sortedCars().indexOf(player)+1;
  $('finish-title').textContent=pos===1?'THIS IS YOUR MOMENT.':pos<=3?'PODIUM. EARNED.':'WHAT A RACE.';
  $('finish-subtitle').textContent=pos===1?'You owned Jewel Lake. See you on the top step.':pos<=3?'A place on the podium. A little closer to the limit.':'Every lap makes you faster. The next one is yours.';
  $('finish-position').textContent=String(pos).padStart(2,'0')+' / 08';$('finish-time').textContent=formatTime(raceTime);$('finish-best').textContent=formatTime(sessionBest);
  notify('FINISH · P'+pos,3);audio.beep(1000,.35);updateUI();
}

function finishRoomRace(results){
  if(!roomRaceActive||state==='finished')return;
  roomRaceResults=results;state='finished';clearInputs();$('start-lights').hidden=true;$('finish-card').hidden=false;
  const own=results.find(result=>result.id===roomClient.selfId),position=own?.position;
  const labels=$('finish-card').querySelectorAll('.finish-stats small');labels[0].textContent='ROOM PLACE';labels[1].textContent='ROOM TIME';labels[2].textContent='STATUS';
  $('finish-title').textContent=own?.dnf?'RACE COMPLETE.':position===1?'ROOM WINNER.':position<=3?'PRIVATE ROOM PODIUM.':'CHEQUERED FLAG.';
  $('finish-subtitle').textContent='Private room result · unranked · not submitted to the prize leaderboard.';
  $('finish-position').textContent=own?.dnf?'DNF':String(position||'—').padStart(2,'0')+' / '+String(results.filter(result=>!result.dnf).length).padStart(2,'0');
  $('finish-time').textContent=own&&!own.dnf?formatTime(own.timeMs/1000):'—:—.---';$('finish-best').textContent='UNRANKED';
  $('session-tag').innerHTML='<i></i> PRIVATE ROOM · COMPLETE';notify('ROOM RESULTS ARE READY',3);updateUI();
}

function verifiedFinishCard(title,description){
  state='finished';clearInputs();$('start-lights').hidden=true;$('finish-card').hidden=false;
  $('finish-title').textContent=title;$('finish-subtitle').textContent=description;
  const labels=$('finish-card').querySelectorAll('.finish-stats small');labels[0].textContent='MODE';labels[1].textContent='FLYING LAP';labels[2].textContent='SAVE STATUS';
  $('finish-position').textContent='BETA';$('finish-time').textContent=verifiedSession?.run.result?formatTime(verifiedSession.run.result.timeMs/1000):'--:--.---';$('finish-best').textContent='UNSAVED';
  $('session-tag').innerHTML='<i></i> BETA · PRIZES NOT ACTIVE';
}
function startRoomRace(event){
  if(mapMode!=='classic'||!Array.isArray(event.players)||!event.players.some(p=>p.id===roomClient.selfId))return;
  state='room-transition';if($('rooms-dialog').open)$('rooms-dialog').close();
  roomRaceStartAt=event.startAt;resetGrid({roomPlayers:event.players,roomSelfId:roomClient.selfId});
  document.body.classList.add('racing');document.body.classList.remove('on-title');$('menu-card').hidden=true;
  state='countdown';countdown=0;$('start-lights').hidden=false;$('session-tag').innerHTML='<i></i> PRIVATE ROOM · UNRANKED';
  [...$('start-lights').querySelectorAll('i')].forEach(l=>l.classList.remove('lit'));
  if(audio.enabled)audio.start();canvas.focus({preventScroll:true});
}
roomClient.onEvent(event=>{
  if(event.type==='race')startRoomRace(event);
  if(event.type==='connected'&&['countdown','racing'].includes(event.room?.phase)&&event.room.raceId)startRoomRace(event.room);
  if(event.type==='results'&&event.raceId===roomClient.snapshot?.raceId){
    roomRaceResults=event.results;
    for(const result of event.results){const car=cars.find(entry=>entry.roomId===result.id);if(car&&!result.dnf){car.finished=true;car.finishTime=result.timeMs/1000}}
    if(event.complete)finishRoomRace(event.results);
  }
  if(event.type==='closed'&&roomRaceActive){roomRaceActive=false;state='menu';$('finish-card').hidden=true;resetGrid();notify('ROOM CONNECTION ENDED · BACK ON THE GRID',3)}
});
function invalidateVerified(reason){
  if(!verifiedSession||state==='finished')return;
  verifiedSession.invalidate(reason);verifiedFinishCard('ATTEMPT ENDED.',reason);competitionUI.showAttemptStatus(reason);updateUI();
}
function finishVerified(){
  const run=verifiedSession.run;player.lapTimes=[run.result.timeMs/1000];sessionBest=run.result.timeMs/1000;
  verifiedFinishCard('LAP COMPLETE.','The server is replaying your inputs. Prizes are not active.');
  const retry=document.createElement('button');retry.id='verified-retry';retry.className='primary-button';retry.textContent='RETRY SAVE';retry.hidden=true;retry.addEventListener('click',()=>submitVerified(verifiedSession));$('finish-card').append(retry);
  updateUI();void submitVerified(verifiedSession);
}
async function submitVerified(session){
  if(submittingVerified||session.run.stage!=='complete')return;submittingVerified=true;
  const retry=$('verified-retry');if(retry)retry.hidden=true;competitionUI.showAttemptStatus('Verifying your beta lap…');
  try{
    const receipt=await competition.submit(session.ticket.attemptId,session.recording);
    if(!receipt.saved)throw new Error('The server did not save this attempt.');
    competitionUI.showAttemptStatus('Lap verified and saved to the beta leaderboard. Prizes are not active.');
    if(verifiedSession===session){$('finish-title').textContent='LAP VERIFIED.';$('finish-subtitle').textContent='Saved to the global beta leaderboard. Prizes are not active.';$('finish-best').textContent='SAVED'}
  }catch(error){
    competitionUI.showAttemptStatus(error.message);
    if(verifiedSession===session){$('finish-subtitle').textContent=error.message;$('finish-best').textContent='UNSAVED';if(retry)retry.hidden=false}
  }finally{submittingVerified=false}
}

function updateModels(dt){
  for(const car of cars){
    if(roomRaceActive&&car.roomRemote){const remote=roomClient.sampleRemote(car.roomId);if(remote){Object.assign(car,remote);car.road=nearestTrack(track,car.x,car.z,car.road?.index)}}
    car.mesh.position.set(car.x,(world.roadHeight||0)+.035+((car.road.distance>9&&car.speed>5)?Math.sin(raceTime*70)*.025:0),car.z);car.mesh.rotation.set(0,car.yaw,clamp(car.steer*car.speed*.0007,-.05,.05));
    car.mesh.userData.wheels.forEach((wheel,i)=>{wheel.rotation.x=(wheel.rotation.x+car.speed*dt/(car.mesh.userData.wheelRadius||.47))%(Math.PI*2);if(i%2===1)wheel.rotation.y=-car.steer*.2});
    car.mesh.userData.rearLight.visible=car.brake>.1||Math.floor(raceTime/.35)%2===0;
    car.mesh.userData.helmet.visible=car.mesh.userData.visor.visible=!car.isPlayer||camMode!==1;
    car.mesh.visible=state!=='menu'||car.isPlayer;
  }
}
function updateCamera(dt,snap=false){
  if(!player)return;
  if(snap||state!=='racing'||document.querySelector('dialog[open]'))drivingFeel.reset(player.speed,player.boost);
  const fx=Math.sin(player.yaw),fz=Math.cos(player.yaw),speed=player.speed;
  if(state==='overview'){
    const radius=(world.overviewRadius||1600)*orbitZoom*Math.max(1,1.5/camera.aspect),cx=world.overviewRadius?0:90,cz=world.overviewRadius?0:35;
    camera.position.set(cx+Math.sin(orbitYaw)*Math.cos(orbitPitch)*radius,Math.sin(orbitPitch)*radius,cz+Math.cos(orbitYaw)*Math.cos(orbitPitch)*radius);camera.lookAt(cx,0,cz);camera.near=8;camera.far=24000;camera.fov=38;camera.updateProjectionMatrix();
    world.sky.position.copy(camera.position);scene.fog.near=18000;scene.fog.far=24000;
    sun.position.set(400,650,400);sun.target.position.set(40,0,20);world.updateShadowCamera(true);
    updateOverviewLabels();return;
  }
  camera.near=camMode===1?.2:.5;camera.far=6500;scene.fog.near=1500;scene.fog.far=4200;
  world.updateShadowCamera();
  if(state==='menu'){
    if(!reducedMenuMotion.matches)menuTime+=dt;
    const drift=Math.sin(menuTime*.12)*1.2,narrow=camera.aspect<1;
    camera.position.set(player.x-fx*(12+drift)-fz*11,4.5,player.z-fz*(12+drift)+fx*11);
    cameraLook.set(player.x+fz*(narrow?1:6),.65,player.z-fx*(narrow?1:6));camera.lookAt(cameraLook);smoothLook.copy(cameraLook);smoothCamera.copy(camera.position);camera.fov=narrow?55:44;camera.updateProjectionMatrix();
    world.followSun(player.x,player.z);world.sky.position.copy(camera.position);return;
  }
  const feel=drivingFeel.update(dt,player,state==='racing'&&!document.querySelector('dialog[open]'),effectiveMotion());
  const fov=drivingCameraTargets(player,camMode,camera.aspect,cameraTarget,cameraLook)+feel.fov;
  const cockpit=camMode===1,shakeScale=cockpit?.45:1;
  if(!cockpit){cameraTarget.x-=fx*feel.pullback;cameraTarget.z-=fz*feel.pullback}
  const rate=snap||cockpit?1:1-Math.exp(-dt*6.5);smoothCamera.lerp(cameraTarget,rate);camera.position.copy(smoothCamera);smoothLook.lerp(cameraLook,snap?1:1-Math.exp(-dt*10));
  camera.position.x+=fz*feel.x*shakeScale;camera.position.z-=fx*feel.x*shakeScale;camera.position.y+=feel.y*shakeScale;
  camera.lookAt(smoothLook);camera.rotateZ(feel.roll*shakeScale);
  camera.fov+=(fov-camera.fov)*(snap?1:1-Math.exp(-dt*5));camera.updateProjectionMatrix();
  world.followSun(player.x,player.z);
  world.sky.position.copy(camera.position);
}
function drawMap(){
  const ctx=minimap;ctx.clearRect(0,0,360,230);ctx.fillStyle='#4a673a';ctx.fillRect(0,0,360,230);ctx.lineJoin='round';ctx.lineCap='round';
  for(const lake of world.lakes||[world.lakeBoundary]){ctx.beginPath();lake.forEach((p,i)=>{const q=mapPoint(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();ctx.fillStyle='#77b7c7';ctx.fill()}
  ctx.strokeStyle='#b5b493';ctx.lineWidth=18;ctx.stroke(mapPath);ctx.strokeStyle='#fff3d1';ctx.lineWidth=12;ctx.stroke(mapPath);ctx.strokeStyle='#60804b';ctx.lineWidth=6;ctx.stroke(mapPath);
  const p=mapPoint(sampleTrack(track,track.start));ctx.fillStyle='#fff';ctx.fillRect(p.x-3,p.y-6,6,12);
  for(const c of cars){if(c.isPlayer)continue;const q=mapPoint(c);ctx.beginPath();ctx.arc(q.x,q.y,3.3,0,Math.PI*2);ctx.fillStyle='#f5eee2';ctx.fill()}
  const q=mapPoint(player);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#e94236';ctx.fill();ctx.strokeStyle='#ffd58c';ctx.lineWidth=1.5;ctx.stroke();
}
function updateUI(){
  const ranking=sortedCars(),pos=ranking.indexOf(player)+1,gear=gearInfo();
  $('pause-button').disabled=state==='menu'||state==='finished';
  $('map-button').disabled=state==='countdown';
  $('position').textContent=String(pos).padStart(2,'0');document.querySelector('.race-stat small').textContent='/ '+String(cars.length).padStart(2,'0');
  $('lap').textContent=String(Math.min(player.lap,mode==='race'||mode==='room'?3:999)).padStart(2,'0');
  $('lap-time').textContent=formatTime(state==='finished'?player.lapTimes.at(-1)||0:raceTime-player.lapStart);$('best-time').textContent=formatTime(personalBest);
  $('speed').textContent=String(Math.round(player.speed*3.6)).padStart(3,'0');$('gear').textContent=gear.gear;
  $('mobile-lap').textContent=player.lap+'/'+(mode==='race'||mode==='room'?'3':'∞');$('mobile-position').textContent=pos+'/'+cars.length;$('mobile-speed').textContent=Math.round(player.speed*3.6);$('mobile-gear').textContent=gear.gear;
  $('mobile-energy').textContent=Math.round(player.energy)+'%';$('mobile-energy-bar').style.width=player.energy+'%';$('mobile-energy-bar').style.background=player.boost?'#b8f4fb':'#edcc85';
  $('throttle-meter').style.height=player.throttle*100+'%';$('brake-meter').style.height=player.brake*100+'%';
  $('ers-value').textContent=Math.round(player.energy)+'%';$('ers-bar').style.width=player.energy+'%';$('ers-bar').style.background=player.boost?'#ffffff':'var(--acid)';
  rpmLights.forEach((light,i)=>{light.className=(i<gear.rpm*18?'on':'')+(i>13?' red':'')});
  $('sector').textContent=String((Math.floor(Math.max(0,player.progress)/track.length*4)%4)+1).padStart(2,'0');
  const fraction=wrap(player.road.s-track.start,track.length)/track.length;
  const next=track.corners.reduce((best,c)=>wrap(c.s-player.road.s,track.length)<wrap(best.s-player.road.s,track.length)?c:best);$('map-turn').textContent='T'+next.number+' / '+next.name.toUpperCase();
  $('standings').innerHTML=ranking.map((c,i)=>{
    const gap=i===0?'LEADER':c.finished?'FINISHED':'+'+Math.abs((ranking[0].progress-c.progress)/Math.max(ranking[0].speed,35)).toFixed(1)+'s';
    return `<div class="driver-row${c.isPlayer?' you':''}" style="--team:${c.color}"><span class="rank">${i+1}</span><i class="team-color"></i><span class="driver-name">${c.name}</span><span class="interval">${gap}</span></div>`;
  }).join('');
  drawMap();audio.update(gear.rpm);
  $('arcade-hud').setAttribute('aria-label',`Lap ${player.lap} of ${mode==='race'?3:'unlimited'}. Position ${pos} of ${cars.length}. ${Math.round(player.speed*3.6)} kilometers per hour.`);
}
const overview=$('circuit-overview'),overviewLabels=[];
for(const corner of track.corners){const p=sampleTrack(track,corner.s,19),el=document.createElement('span');el.className='overview-corner';el.textContent='T'+corner.number;overview.appendChild(el);overviewLabels.push({el,x:p.x,y:5,z:p.z})}
for(const landmark of world.landmarks){const el=document.createElement('span');el.className='overview-landmark';el.textContent=landmark.title;overview.appendChild(el);overviewLabels.push({el,...landmark})}
function updateOverviewLabels(){for(const p of overviewLabels){const v=new THREE.Vector3(p.x,p.y,p.z).project(camera),margin=p.el.offsetWidth/2+6;p.el.style.left=clamp((v.x*.5+.5)*overview.clientWidth,margin,overview.clientWidth-margin)+'px';p.el.style.top=(-v.y*.5+.5)*100+'%';p.el.hidden=v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1}}
function toggleOverview(){
  if(verifiedSession&&(state==='racing'||state==='countdown')){invalidateVerified('Opening the map ended the beta attempt. Start again when ready.');return}
  if(document.querySelector('dialog[open]')||state==='countdown')return;
  if(state==='overview'){state=overviewFrom;overview.hidden=true;document.body.classList.remove('overview');$('map-button').setAttribute('aria-expanded','false');updateCamera(1,true);canvas.focus({preventScroll:true})}
  else{overviewFrom=state;state='overview';clearInputs();document.body.classList.add('overview');overview.hidden=false;$('map-button').setAttribute('aria-expanded','true');updateCamera(1,true);$('close-overview').focus({preventScroll:true})}
}
$('map-button').addEventListener('click',toggleOverview);$('close-overview').addEventListener('click',toggleOverview);
$('overview-zoom-in').addEventListener('click',()=>orbitZoom=Math.max(.55,orbitZoom-.12));$('overview-zoom-out').addEventListener('click',()=>orbitZoom=Math.min(1.8,orbitZoom+.12));
$('overview-labels').addEventListener('click',e=>{const hidden=overview.classList.toggle('hide-labels');e.currentTarget.textContent=hidden?'SHOW LABELS':'HIDE LABELS';e.currentTarget.setAttribute('aria-pressed',String(!hidden))});
let orbitPointer=null;
overview.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;orbitPointer={id:e.pointerId,x:e.clientX,y:e.clientY};overview.setPointerCapture(e.pointerId)});
overview.addEventListener('pointermove',e=>{if(!orbitPointer||e.pointerId!==orbitPointer.id)return;orbitYaw-=(e.clientX-orbitPointer.x)*.005;orbitPitch=clamp(orbitPitch+(e.clientY-orbitPointer.y)*.003,.5,1.5);orbitPointer.x=e.clientX;orbitPointer.y=e.clientY});
for(const event of ['pointerup','pointercancel','lostpointercapture'])overview.addEventListener(event,()=>orbitPointer=null);
overview.addEventListener('wheel',e=>{e.preventDefault();orbitZoom=clamp(orbitZoom+Math.sign(e.deltaY)*.06,.55,1.8)},{passive:false});
function resize(){const rect=canvas.getBoundingClientRect();world.resize(rect.width,rect.height);arcadeHUD.resize(rect.width,rect.height);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();clearInputs();syncOrientation()}
new ResizeObserver(resize).observe(canvas);
function cycleCamera(){if(state==='overview')toggleOverview();camMode=(camMode+1)%3;$('camera-label').textContent=['ARCADE CAM','COCKPIT CAM','CHASE CAM'][camMode];updateCamera(1,true);storage.set('camera',camMode)}
function togglePause(){
  if(roomRaceActive){clearInputs();notify('PRIVATE ROOM RACES CANNOT BE PAUSED',2);return}
  if(verifiedSession&&(state==='racing'||state==='countdown')){invalidateVerified('Pausing or losing focus ends a beta attempt. Start a new one.');return}
  clearInputs();
  if(state==='paused'&&$('pause-dialog').open){if(portraitPhone()){rotationPaused=true;$('pause-dialog').close();syncOrientation();return}$('pause-dialog').close();state=pausedFrom;canvas.focus({preventScroll:true});return}
  if(state==='racing'||state==='countdown'){pausedFrom=state;state='paused';$('pause-dialog').showModal()}
}
function openDialog(id){
  if(roomRaceActive&&(state==='racing'||state==='countdown')){notify('ROOM CONTROLS ARE LOCKED DURING THE RACE',2);return}
  if(document.querySelector('dialog[open]'))return;
  if(verifiedSession&&(state==='racing'||state==='countdown'))invalidateVerified('Opening a menu ended the beta attempt. Start again when ready.');
  if(id==='leaderboard-dialog')$('board-personal-best').textContent=personalBest>0?formatTime(personalBest):'--:--.---';
  dialogReturn=state;if(state==='racing'||state==='countdown')state='paused';clearInputs();$(id).showModal();
  if(id==='leaderboard-dialog')void competitionUI.open();
  if(id==='rooms-dialog')void roomsUI.open();
  if(id==='garage-dialog')garage.open({color:selectedColor,setup:selectedSetup,locked:dialogReturn!=='menu'&&dialogReturn!=='finished'});
}
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelectorAll('.close-button').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
  dialog.addEventListener('close',()=>{if(dialog.id==='leaderboard-dialog')verifiedStartGeneration++;if(dialog.id==='garage-dialog')garage.close();if(dialog.id==='pause-dialog'){if(state==='paused'&&!rotationPaused&&!document.querySelector('dialog[open]'))state=pausedFrom}else{if(state==='paused')state=dialogReturn;if(state==='menu'&&!pendingMobileStart&&!roomClient.snapshot)resetGrid()}clearInputs();syncOrientation()});
}
$('start-button').addEventListener('click',startRace);
$('race-again').addEventListener('click',()=>{if(roomRaceActive&&roomClient.snapshot){openDialog('rooms-dialog');return}state='menu';roomClient.leave();resetGrid()});
$('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));
$('setup-button').addEventListener('click',()=>openDialog('settings-dialog'));
$('mode-button').addEventListener('click',()=>{$('mode-select').focus();openDialog('settings-dialog')});
$('map-choice').addEventListener('click',()=>{openDialog('settings-dialog');$('map-select').focus()});
$('garage-nav').addEventListener('click',()=>openDialog('garage-dialog'));
$('garage-menu').addEventListener('click',()=>openDialog('garage-dialog'));
$('leaderboard-menu').addEventListener('click',()=>openDialog('leaderboard-dialog'));
$('rooms-menu').addEventListener('click',()=>openDialog('rooms-dialog'));
$('title-help').addEventListener('click',()=>openDialog('guide-dialog'));
$('board-practice').addEventListener('click',()=>{$('leaderboard-dialog').close();$('mode-select').value='time';startRace()});
for(const [id,label,dialog] of [['garage-shortcut','GARAGE','garage-dialog'],['setup-shortcut','SETUP','settings-dialog'],['help-shortcut','HELP','guide-dialog']]){const b=document.createElement('button');b.id=id;b.className='glass-icon';b.textContent=label;b.setAttribute('aria-label','Open '+label.toLowerCase());b.addEventListener('click',()=>openDialog(dialog));document.querySelector('.session-actions').appendChild(b)}
$('guide-nav').addEventListener('click',()=>openDialog('guide-dialog'));
$('race-nav').addEventListener('click',()=>{document.querySelector('dialog[open]')?.close();if(state==='paused')togglePause();canvas.focus({preventScroll:true})});
$('camera-button').addEventListener('click',cycleCamera);
$('pause-button').addEventListener('click',togglePause);
$('pause-setup').addEventListener('click',()=>{const from=pausedFrom;$('pause-dialog').close();openDialog('settings-dialog');dialogReturn=from});
$('rotate-back').addEventListener('click',()=>{state='menu';pendingMobileStart=rotationPaused=false;resetGrid()});
const mobileRecover=document.createElement('button');mobileRecover.id='mobile-recover';mobileRecover.className='glass-icon';mobileRecover.textContent='↻';mobileRecover.setAttribute('aria-label','Recover to circuit');mobileRecover.addEventListener('click',()=>{if(state==='racing'){clearInputs();recover(player)}});document.querySelector('.session-actions').appendChild(mobileRecover);
$('resume-button').addEventListener('click',togglePause);
$('restart-button').addEventListener('click',()=>{$('pause-dialog').close();startRace()});
$('quit-button').addEventListener('click',()=>{state='menu';$('pause-dialog').close();resetGrid()});
$('sound-button').addEventListener('click',()=>audio.set(!audio.enabled));
$('audio-select').addEventListener('change',e=>audio.set(e.target.value==='on'));
$('time-select').addEventListener('change',e=>{world.setLighting(e.target.value);$('weather-label').textContent=e.target.value==='dusk'?'DUSK':'CLEAR'});
$('quality-select').value=initialQuality;
$('quality-select').addEventListener('change',e=>{world.setQuality(e.target.value);storage.set('quality',e.target.value);resize()});
$('touch-select').value=storage.get('touch-controls','auto');
$('touch-select').addEventListener('change',e=>{storage.set('touch-controls',e.target.value);applyMobileControls();resize()});
coarsePointer.addEventListener?.('change',applyMobileControls);
$('steering-sensitivity').value=storage.get('steering-sensitivity','1');touch.sensitivity=Number($('steering-sensitivity').value);
$('steering-sensitivity').addEventListener('input',e=>{touch.sensitivity=Number(e.target.value);storage.set('steering-sensitivity',e.target.value)});
$('mobile-fps').value=storage.get('mobile-fps','60');world.setFrameTarget(Number($('mobile-fps').value));
$('mobile-fps').addEventListener('change',e=>{storage.set('mobile-fps',e.target.value);world.setFrameTarget(Number(e.target.value));nextMobileFrame=0});
$('line-select').addEventListener('change',e=>{world.racingLine.visible=e.target.value==='on'});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('race-view').requestFullscreen()}catch{notify('FULLSCREEN UNAVAILABLE IN THIS WINDOW',3)}});
$('camera-effects').value=motionSetting;
$('camera-effects').addEventListener('change',e=>{motionSetting=e.target.value;storage.set('camera-effects',motionSetting);drivingFeel.reset(player.speed,player.boost)});

window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLSelectElement||e.target instanceof HTMLInputElement)return;
  if(document.querySelector('dialog[open]')){if((e.code==='Escape'||e.code==='KeyP')&&$('pause-dialog').open){e.preventDefault();togglePause()}return}
  if(state==='menu'&&(e.code==='ArrowDown'||e.code==='ArrowUp')){e.preventDefault();const buttons=[...document.querySelectorAll('.title-nav button')],index=buttons.indexOf(document.activeElement),direction=e.code==='ArrowDown'?1:-1;buttons[index<0?(direction>0?0:buttons.length-1):wrap(index+direction,buttons.length)].focus();return}
  if(state==='menu'&&(e.code==='Enter'||e.code==='Space')&&e.target instanceof HTMLButtonElement)return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyB'){toggleOverview();return}
  if(state==='overview'){if(e.code==='Escape')toggleOverview();keys.clear();return}
  if(e.code==='KeyV'){if(verifiedSession&&state==='racing'){invalidateVerified('Photo mode ended the beta attempt.');return}if(state==='photo'){state=photoFrom;document.body.classList.remove('photo')}else if(state==='menu'||state==='racing'){photoFrom=state;state='photo';document.body.classList.add('photo')}clearInputs();return}
  if(e.code==='KeyC')cycleCamera();if(e.code==='Escape'||e.code==='KeyP')togglePause();
  if(e.code==='KeyG')openDialog('garage-dialog');if(e.code==='KeyO')openDialog('settings-dialog');if(e.code==='KeyH')openDialog('guide-dialog');
  if(e.code==='KeyR'&&state==='racing')recover(player);if(e.code==='KeyM')audio.set(!audio.enabled);
  if(e.code==='Enter'&&state==='menu')startRace();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInputs();if(state==='racing'||state==='countdown')togglePause()});
window.addEventListener('city-map-interrupted',()=>{clearInputs();if(state==='racing'||state==='countdown')togglePause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(state==='racing'||state==='countdown')togglePause()}});
document.addEventListener('fullscreenchange',()=>{clearInputs();if(!document.fullscreenElement&&mobileEnabled&&(state==='racing'||state==='countdown'))togglePause()});

function frame(timestamp){
  requestAnimationFrame(frame);
  const capped=(mobileEnabled||$('quality-select').value==='mobile')&&$('mobile-fps').value==='30';
  if(capped&&timestamp+.5<nextMobileFrame)return;nextMobileFrame=timestamp+(capped?1000/30:0);
  const elapsed=(timestamp-lastTime)/1000||0,dt=Math.min(elapsed,.1);lastTime=timestamp;
  if($('garage-dialog').open){audio.update(gearInfo().rpm);garage.update(dt);return}
  world.updateQuality(elapsed,state==='racing'&&!document.hidden);
  pollGamepad();
  accumulator+=dt;let steps=0;while(accumulator>=1/120&&steps<12){simulate(1/120);accumulator-=1/120;steps++}
  if(messageRemaining>0){messageRemaining-=dt;if(messageRemaining<=0)$('race-message').classList.remove('show')}
  updateModels(state==='racing'?dt:0);updateCamera(dt);uiClock+=dt;if(uiClock>.08){updateUI();uiClock=0}
  world.update?.(state==='photo'||state==='overview'?0:dt,cars,timestamp/1000);
  const gear=gearInfo();if(state!=='menu')arcadeHUD.draw({compact:mobileEnabled,lap:player.lap,totalLaps:mode==='race'?3:'∞',position:sortedCars().indexOf(player)+1,drivers:cars.length,speed:player.speed*3.6,gear:gear.gear,rpm:gear.rpm,energy:player.energy,boost:player.boost,racing:state==='racing',effects:effectiveMotion()},dt);
  if(world.render)world.render();else renderer.render(scene,camera);
  if(debugRender)canvas.dataset.renderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,fov:camera.fov,effects:effectiveMotion(),boost:player.boost,setup:activeSetup});
}
applyMobileControls();resetGrid();resize();
const launchParams=new URLSearchParams(location.search),inviteCode=launchParams.get('room');
if(inviteCode&&/^[A-HJ-NP-Z2-9]{8}$/i.test(inviteCode)){openDialog('rooms-dialog');void roomsUI.open()}
else if(launchParams.get('auth')==='callback')void competition.ready().then(()=>openDialog('leaderboard-dialog')).catch(error=>{openDialog('leaderboard-dialog');competitionUI.showAttemptStatus(error.message)});
requestAnimationFrame(timestamp=>{lastTime=timestamp;frame(timestamp);$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,550)});
// Read-only telemetry is useful for race replays, accessibility tools, and QA.
window.apex={get telemetry(){return{state,mode,time:raceTime,position:sortedCars().indexOf(player)+1,lap:player.lap,speed:player.speed*3.6,energy:player.energy,roadOffset:player.road.offset,progress:player.progress,trackLength:track.length,drivers:cars.map(c=>({name:c.name,speed:c.speed*3.6,offset:c.road.offset,progress:c.progress,lap:c.lap}))}},get renderer(){return renderer.info.render}};
