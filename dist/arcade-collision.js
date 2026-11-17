import {CAR_HALF_LENGTH,CAR_HALF_WIDTH,clamp,nearestTrack} from './physics.js';
import {SETUPS,setupId} from './vehicle-setup.js';

export function stepArcadeVehicle(car,input,dt,halfWidth=9){
  const edge=car.road.distance-halfWidth,kerb=clamp((edge+.1)/1.1,0,1),runoff=clamp((edge-1)/1.5,0,1),setup=SETUPS[setupId(car.setup)];
  const roadGrip=8.5*setup.grip,kerbGrip=roadGrip+(6-roadGrip)*kerb,grip=kerbGrip+(2.4-kerbGrip)*runoff,rollingDrag=.028+.052*kerb+.3*runoff;
  car.throttle=clamp(input.throttle||0,0,1);car.brake=clamp(input.brake||0,0,1);
  car.steer+=(clamp(input.steer||0,-1,1)-car.steer)*(1-Math.exp(-dt*7));
  let fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),forward=car.vx*fx+car.vz*fz;
  const steeringAngle=car.steer*(.43/(1+Math.abs(forward)*.052)),steeringGrip=1-.32*clamp((edge-.35)/1.2,0,1);
  car.yaw-=(forward/3.6)*Math.tan(steeringAngle)*dt*steeringGrip;
  fx=Math.sin(car.yaw);fz=Math.cos(car.yaw);forward=car.vx*fx+car.vz*fz;
  const lateral=car.vx*fz-car.vz*fx;
  if(!input.boost)car.ersEmpty=false;else if(car.energy<=.1)car.ersEmpty=true;
  const onRoad=edge<.2;
  car.boost=!!input.boost&&!car.ersEmpty&&car.energy>.1&&car.throttle>.1&&forward>5&&onRoad;
  const engine=car.throttle*(23-clamp(forward/95,0,1)*9+(car.boost?12:0));
  const drag=.00205*setup.drag*forward*Math.abs(forward)+forward*rollingDrag,braking=car.brake*(forward>.6?42:4.5);
  const newForward=clamp(forward+(engine-drag-braking)*dt,-9,car.boost?90.6:84),newLateral=lateral*Math.exp(-grip*dt);
  car.vx=fx*newForward+fz*newLateral;car.vz=fz*newForward-fx*newLateral;
  car.x+=car.vx*dt;car.z+=car.vz*dt;car.speed=Math.hypot(car.vx,car.vz);car.slip=Math.abs(lateral);
  car.energy=clamp(car.energy+dt*(car.boost?-17:car.brake>.1?10:car.throttle<.1?7:2),0,100);
  car.collisionCooldown=Math.max(0,car.collisionCooldown-dt);car.recovered=Math.max(0,car.recovered-dt);
}

export function updateKerbContact(car,track){
  const distance=car.road.distance,overKerb=distance>track.halfWidth+.12&&distance<track.halfWidth+1.2;
  if(overKerb&&!car.overKerb&&car.speed>12){
    const side=Math.sign(car.road.offset)||1,outward=Math.max(0,car.vx*(-car.road.tz*side)+car.vz*(car.road.tx*side));
    car.impact={type:'dust',x:car.x,z:car.z,strength:clamp((car.speed-8)/30,.35,1),shake:clamp((outward-5)/14,0,1)};
  }
  car.overKerb=overKerb;
}

export function resolveArcadeTrackWall(car,track){
  if(!track.wallOffset||car.road.distance<5.8)return false;
  const inside=9.825-.08,fx=Math.sin(car.yaw),fz=Math.cos(car.yaw);
  let contact=null;
  for(let pass=0;pass<4;pass++){
    let excess=0,worst;
    for(const side of [-1,1])for(const end of [-1,1]){
      const x=car.x+fz*side*CAR_HALF_WIDTH+fx*end*CAR_HALF_LENGTH,z=car.z-fx*side*CAR_HALF_WIDTH+fz*end*CAR_HALF_LENGTH,road=nearestTrack(track,x,z,car.road.index);
      if(road.distance-inside>excess){excess=road.distance-inside;worst={...road,x,z,excess}}
    }
    if(!worst)break;
    const side=Math.sign(worst.offset)||1;
    car.x+=worst.tz*side*(worst.excess+.015);car.z-=worst.tx*side*(worst.excess+.015);contact=worst;
  }
  if(!contact)return false;

  car.road=nearestTrack(track,car.x,car.z,car.road.index);
  const side=Math.sign(contact.offset)||1,nx=-contact.tz*side,nz=contact.tx*side;
  const outward=car.vx*nx+car.vz*nz;
  if(outward>.7){
    const severity=clamp(outward/32,0,1),restitution=.06+.08*severity;
    car.vx-=nx*outward*(1+restitution);car.vz-=nz*outward*(1+restitution);
    const along=car.vx*car.road.tx+car.vz*car.road.tz;
    const tangentLoss=.015+.065*severity,adjusted=along*(1-tangentLoss);
    car.vx+=car.road.tx*(adjusted-along);car.vz+=car.road.tz*(adjusted-along);
    car.impact={type:'spark',x:contact.x,z:contact.z,strength:severity,shake:clamp((severity-.3)/.7,0,1)};
    car.speed=Math.hypot(car.vx,car.vz);
  }else car.speed=Math.hypot(car.vx,car.vz);
  return outward>.7;
}

