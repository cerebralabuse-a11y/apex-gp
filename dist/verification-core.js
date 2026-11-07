import {clamp,wrap,createVehicle,stepVehicle,nearestTrack,resolveTrackWall,sampleTrack} from './physics.js';

export const RULESET='verification-original-balanced-v1';
export const TRACK_ID='palm-beach-3753-v2';
export const TICK_HZ=120;
export const MAX_TICKS=TICK_HZ*480;
const DT=1/TICK_HZ;
const CORNER_COUNT=14;

export class VerificationError extends Error {
  constructor(message){super(message);this.name='VerificationError';this.code='INVALID_RECORDING'}
}
function fail(message){throw new VerificationError(message)}
function integer(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max}
function exactKeys(value,keys){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}

// Apply decodeInput(quantizeInput(raw)) to the local simulation too. Rounding
// only when uploading would describe a different drive from the one displayed.
export function quantizeInput(input){
  if(!input||typeof input!=='object')fail('Driving input is required');
  const values=['steer','throttle','brake'].map(k=>input[k]??0);
  if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail('Driving inputs must be finite numbers');
  return [Math.round(clamp(values[0],-1,1)*32767),Math.round(clamp(values[1],0,1)*255),Math.round(clamp(values[2],0,1)*255),input.boost?1:0];
}

export function decodeInput(frame){
  if(!Array.isArray(frame)||frame.length!==4||!integer(frame[0],-32767,32767)||!integer(frame[1],0,255)||!integer(frame[2],0,255)||!integer(frame[3],0,1))fail('Invalid encoded driving frame');
  return {steer:frame[0]/32767,throttle:frame[1]/255,brake:frame[2]/255,boost:frame[3]===1};
}

function gate(track,progress,kind){
  return {progress,kind,...sampleTrack(track,track.start+progress)};
}

export function createVerificationRun(track){
  if(track?.id!==TRACK_ID||!Number.isFinite(track.length)||track.length<=0||!Array.isArray(track.points)||!Array.isArray(track.corners)||track.corners.length!==CORNER_COUNT)fail('Unsupported verification circuit');
  const offsets=track.corners.map(c=>wrap(c.s-track.start,track.length)).sort((a,b)=>a-b);
  if(offsets.some((s,i)=>!Number.isFinite(s)||s<.001||(i>0&&s-offsets[i-1]<.001)))fail('Circuit gates must be distinct');
  const gates=[gate(track,0,'start')];
  for(let lap=0;lap<2;lap++){
    for(const s of offsets)gates.push(gate(track,lap*track.length+s,'corner'));
    gates.push(gate(track,(lap+1)*track.length,lap===0?'timed-start':'finish'));
  }
  const car=createVehicle(track,track.start-8,0);
  car.setup='balanced';car.progress=-8;
  return {track,car,ticks:0,stage:'outlap',invalidReason:null,result:null,gates,nextGate:0,cornerGates:0,timedStartTick:null};
}

function invalidate(run,reason){run.stage='invalid';run.invalidReason=reason;return run}
function allWheelsOutside(car,track){
  // Wheel centres match the current displayed F4's track and axle positions.
  // Within 9m the complete wheel rectangle is inside the 11m road+kerb band.
  if(car.road.distance<=track.halfWidth)return false;
  const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),limit=track.halfWidth+2;
  for(const side of [-1,1])for(const end of [-1,1]){
    const road=nearestTrack(track,car.x+fz*side*.97+fx*end*1.65,car.z-fx*side*.97+fz*end*1.65,car.road.index);
    if(road.distance<=limit)return false;
  }
  return true;
}

export function stepVerificationRun(run,frame){
  if(run.stage==='complete'||run.stage==='invalid')fail('Verification attempt has already ended');
  const input=decodeInput(frame),{car,track}=run;
  if(run.ticks>=MAX_TICKS)return invalidate(run,'Attempt exceeded the time limit');
  if(car.recovered>0||car.setup!=='balanced')return invalidate(run,'Recovery or setup changes invalidate an attempt');
  const previousX=car.x,previousZ=car.z,previousS=car.road.s;
  stepVehicle(car,input,DT,track.halfWidth);
  car.road=nearestTrack(track,car.x,car.z,car.road.index);
  run.ticks++;
  // Check track limits before the wall resolver can move a car back in-bounds.
  if(allWheelsOutside(car,track))return invalidate(run,'All four wheels left the road and kerbs');
  resolveTrackWall(car,track);
  if(![car.x,car.z,car.yaw,car.vx,car.vz,car.energy,car.road.s].every(Number.isFinite))return invalidate(run,'Non-finite vehicle state');
  const delta=wrap(car.road.s-previousS+track.length/2,track.length)-track.length/2;
  if(Math.abs(delta)>Math.max(4,car.speed*DT*2.5))return invalidate(run,'Vehicle jumped between route segments');
  car.progress+=delta;car.previousS=car.road.s;
  const next=run.gates[run.nextGate];
  if(car.progress>next.progress+8)return invalidate(run,'An ordered circuit gate was missed');
  if(Math.abs(car.progress-next.progress)<=8){
    const before=(previousX-next.x)*next.tx+(previousZ-next.z)*next.tz;
    const after=(car.x-next.x)*next.tx+(car.z-next.z)*next.tz;
    if(before<0&&after>=0&&after>before){
      const f=-before/(after-before),x=previousX+(car.x-previousX)*f,z=previousZ+(car.z-previousZ)*f;
      const offset=(x-next.x)*-next.tz+(z-next.z)*next.tx;
      if(Math.abs(offset)>track.halfWidth+2)return invalidate(run,'Circuit gate crossed outside the road');
      run.nextGate++;
      if(next.kind==='corner')run.cornerGates++;
      if(next.kind==='timed-start'){
        run.stage='timed';run.timedStartTick=run.ticks;car.lap=2;
      }
      if(next.kind==='finish'){
        const timeTicks=run.ticks-run.timedStartTick;
        run.stage='complete';car.lap=3;
        run.result={ruleset:RULESET,trackId:track.id,timeTicks,timeMs:Math.round(timeTicks*1e6/TICK_HZ)/1000,totalTicks:run.ticks,gates:run.cornerGates,crossings:run.nextGate,final:{x:car.x,z:car.z,yaw:car.yaw,speed:car.speed,energy:car.energy}};
      }
    }
  }
  return run;
}

export function verifyRecording(track,recording){
  if(!exactKeys(recording,['version','ruleset','trackId','frames'])||recording.version!==1||recording.ruleset!==RULESET||recording.trackId!==TRACK_ID||!Array.isArray(recording.frames)||recording.frames.length<1||recording.frames.length>MAX_TICKS)fail('Unsupported or oversized verification recording');
  const run=createVerificationRun(track);
  for(let i=0;i<recording.frames.length;i++){
    if(run.stage==='complete')fail('Recording contains frames after the finish');
    stepVerificationRun(run,recording.frames[i]);
    if(run.stage==='invalid')fail(run.invalidReason);
  }
  if(run.stage!=='complete')fail('Recording does not include a complete outlap and flying lap');
  return run.result;
}
