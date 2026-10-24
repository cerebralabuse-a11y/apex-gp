export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const wrap = (v, n) => ((v % n) + n) % n;
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--.---';
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function sampleTrack(track, distance, offset = 0) {
  const s = wrap(distance, track.length);
  const index = Math.min(track.points.length - 2, Math.floor(s / track.step));
  const a = track.points[index], b = track.points[index + 1];
  const t = (s - index * track.step) / track.step;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = dx / len, tz = dz / len;
  return { x: a.x + dx * t - tz * offset, z: a.z + dz * t + tx * offset, tx, tz, yaw: Math.atan2(tx, tz), index, s };
}

export function nearestTrack(track, x, z, hint) {
  let best = Infinity, result;
  const n = track.points.length - 1;
  const search = hint === undefined ? n : 121;
  const start = hint === undefined ? 0 : hint - 60;
  for (let j = 0; j < search; j++) {
    const i = wrap(start + j, n);
    const a = track.points[i], b = track.points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      const len = Math.hypot(dx, dz);
      result = { x: px, z: pz, s: (i + t) * track.step, index: i, tx: dx / len, tz: dz / len, distance: Math.sqrt(d), offset: ((x - px) * -dz + (z - pz) * dx) / len };
    }
  }
  if (best > 10000 && hint !== undefined) return nearestTrack(track, x, z);
  return result;
}

export function createVehicle(track, distance, lane = 0) {
  const p = sampleTrack(track, distance, lane);
  return { x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0, speed: 0, steer: 0, energy: 100, boost: false, slip: 0, throttle: 0, brake: 0, road: nearestTrack(track, p.x, p.z), previousS: p.s, progress: distance, nextCheckpoint: 1, lap: 1, lapStart: 0, lapTimes: [], finished: false, finishTime: Infinity, collisionCooldown: 0, recovered: 0 };
}

export function stepVehicle(car, input, dt, halfWidth = 9) {
  const onRoad = car.road.distance < halfWidth + .6;
  const onCurb = car.road.distance < halfWidth + 2;
  const grip = onRoad ? 8.5 : onCurb ? 6 : 2.4;
  car.throttle = clamp(input.throttle || 0, 0, 1);
  car.brake = clamp(input.brake || 0, 0, 1);
  car.steer += (clamp(input.steer || 0, -1, 1) - car.steer) * (1 - Math.exp(-dt * 7));
  let fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let forward = car.vx * fx + car.vz * fz;
  const steeringAngle = car.steer * (.43 / (1 + Math.abs(forward) * .052));
  car.yaw -= (forward / 3.6) * Math.tan(steeringAngle) * dt * (onRoad ? 1 : .68);
  fx = Math.sin(car.yaw); fz = Math.cos(car.yaw);
  forward = car.vx * fx + car.vz * fz;
  const lateral = car.vx * fz - car.vz * fx;
  car.boost = !!input.boost && car.energy > .1 && car.throttle > .1 && forward > 5 && onRoad;
  const engine = car.throttle * (23 - clamp(forward / 95, 0, 1) * 9 + (car.boost ? 12 : 0));
  const drag = .00205 * forward * Math.abs(forward) + forward * (onRoad ? .028 : .38);
  const braking = car.brake * (forward > .6 ? 42 : 4.5);
  const newForward = clamp(forward + (engine - drag - braking) * dt, -9, car.boost ? 90.6 : 84);
  const newLateral = lateral * Math.exp(-grip * dt);
  car.vx = fx * newForward + fz * newLateral;
  car.vz = fz * newForward - fx * newLateral;
  car.x += car.vx * dt; car.z += car.vz * dt;
  car.speed = Math.hypot(car.vx, car.vz);
  car.slip = Math.abs(lateral);
  car.energy = clamp(car.energy + dt * (car.boost ? -17 : car.brake > .1 ? 10 : car.throttle < .1 ? 7 : 2), 0, 100);
  car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
  car.recovered = Math.max(0, car.recovered - dt);
}

export function resolveTrackWall(car, track) {
  if (!track.wallOffset || car.road.distance <= track.wallOffset) return false;
  const p=sampleTrack(track,car.road.s,Math.sign(car.road.offset)*(track.wallOffset-.25));
  const along=(car.vx*p.tx+car.vz*p.tz)*.65;
  car.x=p.x;car.z=p.z;car.vx=p.tx*along;car.vz=p.tz*along;car.speed=Math.abs(along);
  car.road=nearestTrack(track,car.x,car.z,car.road.index);
  return true;
}

export function updateProgress(car, track, raceTime, dt) {
  const delta = wrap(car.road.s - car.previousS + track.length / 2, track.length) - track.length / 2;
  car.previousS = car.road.s;
  // A nearest-segment jump or recovery cannot award distance or checkpoints.
  if (Math.abs(delta) > Math.max(4, car.speed * dt * 2.5)) return false;
  car.progress += delta;
  const threshold = car.nextCheckpoint * track.length / 4;
  if (car.progress >= threshold && delta > 0 && car.road.distance < track.halfWidth + 7) {
    car.nextCheckpoint++;
    if ((car.nextCheckpoint - 1) % 4 === 0) {
      const lapTime = raceTime - car.lapStart;
      car.lapTimes.push(lapTime);
      car.lapStart = raceTime;
      car.lap++;
      return true;
    }
  }
  return false;
}

export function collideVehicles(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= 3.1 || dist < .001 || a.recovered > 0 || b.recovered > 0) return false;
  const nx = dx / dist, nz = dz / dist, overlap = (3.1 - dist) * .5;
  a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing > 0) {
    const impulse = closing * .65;
    a.vx -= nx * impulse; a.vz -= nz * impulse; b.vx += nx * impulse; b.vz += nz * impulse;
  }
  return closing > 3;
}

export function getAIControls(car, cars, track, difficulty, raceTime, dt) {
  const speed=car.speed,lookAhead=12+speed*.48;
  const forward=Math.sin(car.yaw),fz=Math.cos(car.yaw);
  car.targetLane=(car.index%2===0?-1.25:1.25)+Math.sin(raceTime*.12+car.index)*.35;
  for(const other of cars){
    if(other===car)continue;
    const dx=other.x-car.x,dz=other.z-car.z,ahead=dx*forward+dz*fz;
    if(ahead>1&&ahead<30&&Math.hypot(dx,dz)<33&&Math.abs(other.road.offset-car.aiLane)<2.5){car.targetLane=clamp(other.road.offset+(car.index%2?3.6:-3.6),-5.6,5.6);break}
  }
  car.aiLane+=(car.targetLane-car.aiLane)*Math.min(1,dt*1.7);
  const target=sampleTrack(track,car.road.s+lookAhead,car.aiLane),err=angleDelta(Math.atan2(target.x-car.x,target.z-car.z),car.yaw);
  const steering=-Math.atan(2*3.6*Math.sin(err)/lookAhead)/(.43/(1+speed*.052));
  const level=difficulty==='rookie'?.72:difficulty==='pro'?1.08:.91;
  let targetSpeed=82*level*car.aiSkill;
  for(let ds=0;ds<=160;ds+=20){
    const a=sampleTrack(track,car.road.s+ds),b=sampleTrack(track,car.road.s+ds+18);
    const curvature=Math.abs(angleDelta(b.yaw,a.yaw))/18;
    const cornerSpeed=clamp(Math.sqrt(14.5/Math.max(curvature,.001)),24,84)*level*car.aiSkill;
    targetSpeed=Math.min(targetSpeed,Math.sqrt(cornerSpeed*cornerSpeed+2*26*ds));
  }
  if(Math.abs(err)>.6)targetSpeed=Math.min(targetSpeed,25);
  if(car.road.distance>9)targetSpeed=Math.min(targetSpeed,28);
  return{steer:clamp(steering,-1,1),throttle:clamp((targetSpeed-speed)*.35,0,1),brake:clamp((speed-targetSpeed)*.18,0,1),boost:Math.abs(err)<.035&&speed>60&&car.energy>35&&difficulty==='pro'};
}
