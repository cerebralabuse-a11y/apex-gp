export function createArcadeHUD(canvas) {
  const ctx=canvas.getContext('2d');let w=1,h=1,dpr=1,needle=0;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const streaks=Array.from({length:40},(_,i)=>({angle:i*2.39996,phase:(i*.618034)%1}));
  let boostGlow=0;
  function drawBoost(data,dt){
    boostGlow=data.racing?boostGlow+((data.boost?1:0)-boostGlow)*(1-Math.exp(-dt*(data.boost?18:12))):0;
    if(boostGlow<.01)return;
    const cx=w*.5,cy=h*.44;
    ctx.save();ctx.globalAlpha=boostGlow;
    const glow=ctx.createRadialGradient(cx,cy,h*.25,cx,cy,Math.max(w,h)*.65);
    glow.addColorStop(0,'#75eaff00');glow.addColorStop(1,'#75eaff38');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    if(!reducedMotion.matches){
      const velocity=.6+Math.min(data.speed/326,1)*1.2;
      for(let i=0;i<(data.compact?20:streaks.length);i++){
        const p=streaks[i];
        p.phase=(p.phase+dt*velocity)%1;
        const radius=.58+p.phase*p.phase*.88,tail=radius-(.07+p.phase*.21);
        const dx=Math.cos(p.angle)*w*.64,dy=Math.sin(p.angle)*h*.76;
        const x=cx+dx*radius,y=cy+dy*radius,tx=cx+dx*tail,ty=cy+dy*tail;
        const line=ctx.createLinearGradient(tx,ty,x,y);
        line.addColorStop(0,'#a4efff00');line.addColorStop(1,'#e4fbff');
        ctx.globalAlpha=boostGlow*Math.sin(p.phase*Math.PI);
        ctx.strokeStyle=line;ctx.lineWidth=(1.4+p.phase*2)*Math.min(w/1024,h/572);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function resize(width,height){w=width;h=height;dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px'}
  const font=(size,weight=700)=>`${weight} ${size}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  function dial(x,y,r,rpm,lower=false){
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='rgba(31,32,29,.91)';ctx.strokeStyle='#ede2ca';ctx.lineWidth=2.2;
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#655c57';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r-5,0,Math.PI*2);ctx.stroke();
    const start=Math.PI*.75,sweep=Math.PI*1.5,max=lower?9:11;
    ctx.lineWidth=lower?7:4;ctx.strokeStyle=lower?'#1bc8e4':'#d7d0b7';ctx.beginPath();ctx.arc(0,0,r-10,start,start+sweep*.74);ctx.stroke();ctx.strokeStyle='#ed443b';ctx.beginPath();ctx.arc(0,0,r-10,start+sweep*.74,start+sweep);ctx.stroke();
    for(let i=0;i<=max*5;i++){
      const a=start+i/(max*5)*sweep,major=i%5===0;ctx.strokeStyle=i>max*3.8?'#f16a4a':'#e8dfc9';ctx.lineWidth=major?1.8:.8;ctx.beginPath();ctx.moveTo(Math.cos(a)*(r-13),Math.sin(a)*(r-13));ctx.lineTo(Math.cos(a)*(r-(major?22:17)),Math.sin(a)*(r-(major?22:17)));ctx.stroke();
      if(major){ctx.font=font(r*.145,600);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=i>max*3.8?'#ef6b50':'#f1e8d2';ctx.fillText(String(i/5),Math.cos(a)*(r-31),Math.sin(a)*(r-31))}
    }
    ctx.font=font(r*.105);ctx.fillStyle='#f3ead7';ctx.textAlign='center';ctx.fillText('TACHOMETER',0,-r*.24);
    const angle=start+Math.max(.03,Math.min(1,rpm))*sweep;
    ctx.rotate(angle);ctx.fillStyle='#dc4c35';ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(r-21,0);ctx.lineTo(-9,4);ctx.closePath();ctx.fill();ctx.rotate(-angle);ctx.fillStyle='#c8b796';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function strip(x,y,width,label,value,gold=false){
    ctx.fillStyle='rgba(68,52,40,.78)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.lineTo(x+width-9,y+31);ctx.lineTo(x,y+31);ctx.closePath();ctx.fill();
    ctx.font=font(25,800);ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=gold?'#f4ca53':'#fff9e8';ctx.fillText(label,x+8,y+16);ctx.fillStyle='#fff9e8';ctx.fillText(value,x+69,y+16);
  }
  function draw(data,dt){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    drawBoost(data,dt);
    if(data.compact)return;
    const s=Math.min(1.6,Math.max(.67,Math.min(w/1024,h/572)));ctx.save();ctx.scale(s,s);
    strip(22,21,126,'LAP',`${Math.min(data.lap,3)}/${data.totalLaps}`);strip(22,62,114,'POS',`${data.position}/${data.drivers}`,true);
    const right=w/s, bottom=h/s;needle+=(data.rpm-needle)*(1-Math.exp(-dt*13));
    dial(right-84,98,76,needle,false);
    ctx.font=font(21,800);ctx.textAlign='right';ctx.fillStyle='#eee8d0';ctx.fillText((needle*10).toFixed(1),right-41,125);
    ctx.fillStyle='#222820';ctx.fillRect(right-106,137,33,17);for(let i=0;i<4;i++){ctx.fillStyle=i<data.energy/25?'#c1b25b':'#585548';ctx.fillRect(right-102+i*6,140,3,11)}
    dial(right-94,bottom-80,78,needle,true);
    ctx.fillStyle='rgba(28,31,27,.94)';ctx.beginPath();ctx.moveTo(right-195,bottom-80);ctx.lineTo(right-162,bottom-80);ctx.lineTo(right-156,bottom-43);ctx.lineTo(right-21,bottom-43);ctx.lineTo(right-21,bottom-5);ctx.lineTo(right-195,bottom-5);ctx.closePath();ctx.fill();
    ctx.textAlign='left';ctx.font=font(11);ctx.fillStyle=data.boost&&data.racing?'#a4efff':'#d4c96a';ctx.fillText(data.boost&&data.racing?'ERS ON':'BOOST',right-187,bottom-72);
    for(let i=0;i<5;i++){ctx.fillStyle=i<data.energy/20?'#a7b84b':'#634333';ctx.fillRect(right-185+i*8,bottom-62,4,12)}
    ctx.font=font(35,800);ctx.fillStyle='#f9f8e8';ctx.fillText(String(Math.round(data.speed)),right-177,bottom-25);ctx.font=font(40,800);ctx.textAlign='right';ctx.fillStyle='#d1d2c0';ctx.fillText(typeof data.gear==='number'?'F'+data.gear:data.gear,right-31,bottom-44);
    ctx.font=font(12,600);ctx.fillStyle='#e1e5cf';ctx.fillText('KM/H',right-32,bottom-15);
    ctx.restore();
  }
  return{resize,draw};
}
