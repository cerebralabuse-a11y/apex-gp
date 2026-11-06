const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Camera-only feedback: never changes the car, steering or simulation clock.
export function createDrivingFeel(){
  let speed=0,boost=0,kick=0,acceleration=0,previousSpeed=0,wasBoost=false,time=0;
  const output={fov:0,pullback:0,x:0,y:0,roll:0,speed:0,boost:0};
  function reset(currentSpeed=0,currentBoost=false){
    speed=boost=kick=acceleration=time=0;previousSpeed=currentSpeed;wasBoost=currentBoost;
    for(const key in output)output[key]=0;
    return output;
  }
  function update(dt,car,active,effects='full'){
    if(!active)return reset(car.speed,car.boost);
    dt=clamp(dt,0,.1);if(!dt)return output;
    time+=dt;
    const deploying=!!car.boost&&car.speed>5;
    if(deploying&&!wasBoost)kick=1;
    wasBoost=deploying;
    const ease=1-Math.exp(-dt*7);
    speed+=(clamp((car.speed-12)/72,0,1)-speed)*ease;
    boost+=((deploying?1:0)-boost)*(1-Math.exp(-dt*(deploying?12:8)));
    acceleration+=(clamp((car.speed-previousSpeed)/dt/24,-1,1)-acceleration)*(1-Math.exp(-dt*5));
    previousSpeed=car.speed;kick*=Math.exp(-dt*5);
    const strength=effects==='full'?1:effects==='subtle'?.3:0;
    const vibration=(.005*speed*speed+.035*boost+.055*kick)*strength;
    output.fov=(speed*5+boost*6+kick*1.8)*strength;
    output.pullback=(Math.max(0,acceleration)*.55+boost*.55+kick*.65)*strength;
    output.x=(Math.sin(time*43)*.6+Math.sin(time*71)*.4)*vibration;
    output.y=(Math.sin(time*57+.7)*.65+Math.sin(time*89)*.35)*vibration*.65;
    output.roll=(Math.sin(time*37)*boost*.0015+Math.sin(time*51)*kick*.002)*strength;
    output.speed=speed;output.boost=boost;
    return output;
  }
  return{update,reset};
}
