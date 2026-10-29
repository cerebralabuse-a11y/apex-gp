export function renderScale(width,height,ratio,pixelBudget=Infinity){return Math.min(ratio,Math.sqrt(pixelBudget/Math.max(1,width*height)))}

export class AdaptiveResolution {
  constructor(max=1.5,target=60){this.max=max;this.min=Math.min(.85,max);this.ratio=max;this.target=target;this.average=1/target;this.slow=0;this.fast=0;this.cooldown=2}
  sample(dt){
    if(dt<=0||dt>.1)return false;
    this.average+=(dt-this.average)*.05;this.cooldown=Math.max(0,this.cooldown-dt);
    this.slow=this.average>1/(this.target*.76)?this.slow+dt:0;
    this.fast=this.average<1/(this.target*.97)?this.fast+dt:0;
    if(this.cooldown)return false;
    const before=this.ratio;
    if(this.slow>1.2)this.ratio=Math.max(this.min,this.ratio-.15);
    else if(this.fast>4)this.ratio=Math.min(this.max,this.ratio+.05);
    if(before===this.ratio)return false;
    this.slow=this.fast=0;this.cooldown=2;return true;
  }
}
