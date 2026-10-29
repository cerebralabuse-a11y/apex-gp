const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const inside=(x,y,r,margin=0)=>x>=r.left-margin&&x<=r.right+margin&&y>=r.top-margin&&y<=r.bottom+margin;

export class MobileInput {
  constructor(){this.pointers=new Map();this.sensitivity=1;this.clear()}
  clear(){this.pointers.clear();this.steer=0;this.throttle=0;this.brake=0;this.boost=false}
  start(id,zone,x,y,rects){
    if(this.pointers.has(zone))return false;
    this.pointers.set(zone,{id,x,y,origin:x,rects});this.update();return true;
  }
  move(id,x,y,rects){for(const p of this.pointers.values())if(p.id===id){p.x=x;p.y=y;if(rects)p.rects=rects;this.update()}}
  end(id){for(const [zone,p] of this.pointers)if(p.id===id)this.pointers.delete(zone);this.update()}
  update(){
    this.steer=0;this.throttle=0;this.brake=0;this.boost=false;
    const steer=this.pointers.get('steer'),pedal=this.pointers.get('pedals');
    if(steer){const travel=Math.max(24,steer.rects.steer.width*.28)/this.sensitivity,d=steer.x-steer.origin;this.steer=Math.sign(d)*clamp((Math.abs(d)-3)/(travel-3),0,1)}
    if(pedal){const {x,y,rects}=pedal;
      if(inside(x,y,rects.brake,6))this.brake=1;
      else if(inside(x,y,rects.drive,12)){this.throttle=1;this.boost=y<rects.drive.top+rects.drive.height*.42}
    }
  }
}

export function bindMobileControls({steer,pedals,brake,drive,enabled}){
  const input=new MobileInput();
  const rects=()=>({steer:steer.getBoundingClientRect(),brake:brake.getBoundingClientRect(),drive:drive.getBoundingClientRect()});
  function paint(){steer.style.setProperty('--steer',input.steer);steer.setAttribute('aria-valuenow',Math.round(input.steer*100));drive.classList.toggle('pressed',!!input.throttle);drive.classList.toggle('boosting',input.boost);brake.classList.toggle('pressed',!!input.brake);drive.setAttribute('aria-pressed',String(!!input.throttle));brake.setAttribute('aria-pressed',String(!!input.brake))}
  for(const [element,zone] of [[steer,'steer'],[pedals,'pedals']]){
    element.addEventListener('pointerdown',e=>{if(!enabled()||e.button>0)return;e.preventDefault();if(input.start(e.pointerId,zone,e.clientX,e.clientY,rects())){element.setPointerCapture?.(e.pointerId);paint()}});
    element.addEventListener('pointermove',e=>{input.move(e.pointerId,e.clientX,e.clientY);paint()});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,e=>{input.end(e.pointerId);paint()});
    element.addEventListener('contextmenu',e=>e.preventDefault());
  }
  for(const button of [brake,drive]){
    button.addEventListener('keydown',e=>{if(!['Space','Enter'].includes(e.code)||e.repeat||!enabled())return;e.preventDefault();e.stopPropagation();const r=button.getBoundingClientRect();input.start('key-pedal','pedals',r.left+r.width/2,r.top+r.height*.7,rects());paint()});
    button.addEventListener('keyup',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();input.end('key-pedal');paint()}});
  }
  steer.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.code)||!enabled())return;e.preventDefault();e.stopPropagation();const r=rects();input.end('key-steer');input.start('key-steer','steer',r.steer.left+r.steer.width/2,0,r);input.move('key-steer',r.steer.left+r.steer.width*(e.code==='ArrowRight'?.9:.1),0,r);paint()});
  steer.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight'].includes(e.code)){e.stopPropagation();input.end('key-steer');paint()}});
  return {input,clear(){input.clear();paint()}};
}
