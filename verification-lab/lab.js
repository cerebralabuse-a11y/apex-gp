import {verificationTrack as track} from '/verification-track.js';
import {RULESET,TRACK_ID,TICK_HZ,MAX_TICKS,quantizeInput,createVerificationRun,stepVerificationRun} from '/verification-core.js';
import {getAIControls,formatTime} from '/physics.js';

const $=id=>document.getElementById(id),canvas=$('track'),ctx=canvas.getContext('2d');
let run=createVerificationRun(track),recording=null,running=false,reference=false,previous=0,accumulator=0,serverReady=false,workerReady=false,busy=false;
const keys=new Set(),pointers=new Map(),trace=[];
const bounds=track.points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
const scale=Math.min(800/(bounds.maxX-bounds.minX),490/(bounds.maxZ-bounds.minZ));
const point=p=>({x:450+(p.x-(bounds.maxX+bounds.minX)/2)*scale,y:300+(p.z-(bounds.maxZ+bounds.minZ)/2)*scale});
const path=new Path2D();track.points.forEach((p,i)=>{const q=point(p);i?path.lineTo(q.x,q.y):path.moveTo(q.x,q.y)});path.closePath();
$('ruleset').textContent=RULESET;
function message(s){$('status').textContent=s}
function clearControls(){keys.clear();pointers.clear();document.querySelectorAll('[data-control]').forEach(b=>b.setAttribute('aria-pressed','false'))}
function results(rows){$('results').replaceChildren();for(const [label,value] of rows){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);div.append(dt,dd);$('results').append(div)}}
function buttons(){const complete=run.stage==='complete';$('reference').disabled=$('manual').disabled=running||busy;$('stop').disabled=!running;$('verify').disabled=!complete||!serverReady||busy;$('worker').disabled=!complete||!workerReady||busy;$('download').disabled=!complete||busy}
function start(auto){run=createVerificationRun(track);Object.assign(run.car,{index:0,aiLane:0,aiSkill:1});recording={version:1,ruleset:RULESET,trackId:TRACK_ID,frames:[]};running=true;reference=auto;trace.length=0;accumulator=0;clearControls();previous=performance.now();results([]);message(auto?'Recording quantized reference-driver inputs in the browser…':'Manual recording started. Drive one outlap, then the timed lap.');buttons()}
function stop(reason){running=false;clearControls();message(reason);buttons()}
function input(){const held=name=>[...pointers.values()].includes(name);return{steer:(keys.has('KeyD')||keys.has('ArrowRight')||held('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||held('left')?1:0),throttle:keys.has('KeyW')||keys.has('ArrowUp')||held('gas')?1:0,brake:keys.has('KeyS')||keys.has('ArrowDown')||held('brake')?1:0,boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||held('boost')}}
function tick(){
  const raw=reference?getAIControls(run.car,[run.car],track,'club',run.ticks/TICK_HZ,1/TICK_HZ):input();
  const frame=quantizeInput(raw);recording.frames.push(frame);stepVerificationRun(run,frame);
  if(run.ticks%12===0)trace.push(point(run.car));
  if(run.stage==='complete'){running=false;results([['Browser flying lap',formatTime(run.result.timeMs/1000)],['Simulation ticks',run.result.totalTicks],['Ordered corner gates',run.result.gates],['Recording bytes',new TextEncoder().encode(JSON.stringify(recording)).length],['Source',reference?'Browser reference driver':'Manual browser inputs']]);message('Recording complete. Send the inputs to an independent backend.');buttons()}
  else if(run.stage==='invalid'||run.ticks>=MAX_TICKS)stop('Invalid attempt: '+(run.invalidReason||'Time limit exceeded'));
}
function draw(){
  ctx.fillStyle='#17282b';ctx.fillRect(0,0,900,600);ctx.lineJoin='round';ctx.strokeStyle='#60746b';ctx.lineWidth=track.halfWidth*2*scale+7;ctx.stroke(path);ctx.strokeStyle='#101b1d';ctx.lineWidth=track.halfWidth*2*scale;ctx.stroke(path);
  for(const c of track.corners){const p=point(c);ctx.fillStyle='#a6bda5';ctx.font='12px Arial';ctx.fillText('T'+c.number,p.x+8,p.y-8)}
  if(trace.length){ctx.beginPath();trace.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#d9eb8e';ctx.lineWidth=2;ctx.stroke()}
  const p=point(run.car);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-run.car.yaw);ctx.fillStyle='#e7f45b';ctx.beginPath();ctx.moveTo(0,9);ctx.lineTo(-5,-6);ctx.lineTo(5,-6);ctx.closePath();ctx.fill();ctx.restore();
  $('stage').textContent=run.stage.toUpperCase();$('speed').textContent=Math.round(run.car.speed*3.6)+' KM/H';$('ticks').textContent=run.ticks.toLocaleString()+' TICKS';
}
function frame(now){const dt=Math.min((now-previous)/1000,.1);previous=now;if(running){if(reference){for(let i=0;i<400&&running;i++)tick()}else{accumulator+=dt;while(accumulator>=1/TICK_HZ&&running){tick();accumulator-=1/TICK_HZ}}}draw();requestAnimationFrame(frame)}
async function verify(worker){
  busy=true;buttons();results([]);message('Backend replaying the full input recording…');
  try{const response=await fetch(worker?'/api/verification/worker':'/api/verification/replay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(recording)});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.error||'Verification failed');
    const actual=data.result,expected=run.result,error=Math.hypot(actual.final.x-expected.final.x,actual.final.z-expected.final.z),stateError=Math.max(...['yaw','speed','energy'].map(k=>Math.abs(actual.final[k]-expected.final[k]))),matched=actual.ruleset===expected.ruleset&&actual.trackId===expected.trackId&&actual.timeTicks===expected.timeTicks&&actual.timeMs===expected.timeMs&&actual.totalTicks===expected.totalTicks&&actual.gates===expected.gates&&actual.crossings===expected.crossings&&error<1e-6&&stateError<1e-6;
    results([['Backend',worker?'Cloudflare workerd (local)':'Node (local)'],['Browser flying lap',formatTime(expected.timeMs/1000)],['Backend flying lap',formatTime(actual.timeMs/1000)],['Position difference',error.toExponential(2)+' m'],['Heading / speed / energy error',stateError.toExponential(2)],['Ordered corner gates',actual.gates],['Clock resolution',(1000/TICK_HZ).toFixed(3)+' ms'],['Comparison',matched?'MATCH':'MISMATCH'],['Prize eligible','NO · physics feasibility only']]);
    message(matched?'MATCH — the backend reproduced the browser recording. This is not a ranked result.':'MISMATCH — investigate runtime consistency before enabling ranked submissions.');
  }catch(e){message('Verification failed: '+e.message)}finally{busy=false;buttons()}
}
$('reference').addEventListener('click',()=>start(true));$('manual').addEventListener('click',()=>start(false));$('stop').addEventListener('click',()=>{run.stage='invalid';stop('Recording stopped. Start a new attempt.')});$('verify').addEventListener('click',()=>verify(false));$('worker').addEventListener('click',()=>verify(true));
$('download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(recording)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='apex-verification-inputs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
addEventListener('keydown',e=>{if(!running||reference)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();keys.add(e.code)});addEventListener('keyup',e=>keys.delete(e.code));
function interrupted(){clearControls();if(running&&!reference){run.stage='invalid';stop('Manual attempt invalidated by focus loss. Start a new attempt.')}}addEventListener('blur',interrupted);document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupted()});
for(const b of document.querySelectorAll('[data-control]')){b.setAttribute('aria-pressed','false');b.addEventListener('pointerdown',e=>{if(!running||reference)return;b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,b.dataset.control);b.setAttribute('aria-pressed','true')});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{pointers.delete(e.pointerId);b.setAttribute('aria-pressed','false')})}
try{const r=await fetch('/api/verification/status'),data=await r.json();serverReady=r.ok&&data.ranked===false;workerReady=!!data.workerAvailable;$('availability').textContent=serverReady?'Local Node verifier ready. '+(workerReady?'Workers runtime connected.':'Start the optional Workers runtime to compare it too.'):'Verifier unavailable.'}catch{$('availability').textContent='Run npm run dev locally to enable backend verification.'}buttons();requestAnimationFrame(t=>{previous=t;frame(t)});
