export {buildCar,disposeCar,setCarColor} from './f4-car.js';

export { createCircuit } from './track.js';
export { createLakesideWorld as createWorld } from './lakeside.js';

export function drivingCameraTargets(car,mode,aspect,target,look){
  const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),lead=Math.min(car.speed*.025,1.5),fit=Math.max(1,Math.min(1.7,1/aspect));
  if(mode===0){const ahead=aspect<1?7:11,side=aspect<1?0:5;target.set(car.x-fx*(19*fit-lead)-fz*8*fit,11*fit,car.z-fz*(19*fit-lead)+fx*8*fit);look.set(car.x+fx*ahead+fz*side,0,car.z+fz*ahead-fx*side)}
  else if(mode===1){target.set(car.x+fx*.85,1.48,car.z+fz*.85);look.set(car.x+fx*60,1.4,car.z+fz*60)}
  else{target.set(car.x-fx*(11*fit-lead),4.8*fit,car.z-fz*(11*fit-lead));look.set(car.x+fx*8,1.1,car.z+fz*8)}
  return(mode===1?68:mode===2?60:50)+car.speed*.025;
}
