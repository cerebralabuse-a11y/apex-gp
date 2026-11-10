const CODE=/^[A-HJ-NP-Z2-9]{8}$/;
const phases=new Set(['lobby','countdown','racing','finished']);
const loopback=host=>['localhost','127.0.0.1','[::1]'].includes(host);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
const validState=s=>s&&finite(s.x,-20000,20000)&&finite(s.z,-20000,20000)&&finite(s.yaw,-10000,10000)&&finite(s.speed,0,150)&&finite(s.steer,-1,1)&&finite(s.throttle,0,1)&&finite(s.brake,0,1)&&finite(s.energy,0,100)&&finite(s.progress,-2000,20000)&&Number.isInteger(s.lap)&&s.lap>=1&&s.lap<=4&&typeof s.boost==='boolean'&&typeof s.finished==='boolean';
const validPlayers=players=>Array.isArray(players)&&players.length<=8&&players.every(p=>validId(p.id)&&typeof p.driver==='string'&&p.driver.length<=20&&/^#[a-f0-9]{6}$/i.test(p.color)&&Number.isInteger(p.index)&&p.index>=0&&p.index<8&&typeof p.ready==='boolean'&&typeof p.connected==='boolean'&&p.grid&&finite(p.grid.x,-20000,20000)&&finite(p.grid.z,-20000,20000)&&finite(p.grid.yaw,-10000,10000))&&new Set(players.map(p=>p.id)).size===players.length;

export function interpolateRoomStates(a,b,t){
  const weight=Math.max(0,Math.min(1,t)),state={...b};
  for(const key of ['x','z','speed','steer','throttle','brake','energy','progress'])state[key]=a[key]+(b[key]-a[key])*weight;
  state.yaw=a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*weight;
  return state;
}

export function createRoomClient({api,WebSocketImpl=globalThis.WebSocket,fetcher=globalThis.fetch,now=()=>performance.now(),wallNow=Date.now}={}){
  const listeners=new Set(),buffers=new Map();
  let socket=null,snapshot=null,selfId=null,generation=0,controller=null,pingTimer=null,retryTimer=null,connectTimer=null;
  let lastSent=-Infinity,sequence=0,lastFinished=false,clockOffset=0,bestRtt=Infinity,reconnectSince=0,pendingReject=null;
  const emit=event=>{for(const listener of listeners)listener(event)};
  const connected=()=>socket?.readyState===1;
  const clearTimers=()=>{clearInterval(pingTimer);clearTimeout(retryTimer);clearTimeout(connectTimer);pingTimer=retryTimer=connectTimer=null};
  const send=message=>{if(!connected())throw new Error('The room is disconnected. Please reconnect.');socket.send(JSON.stringify(message))};
  function cancelConnection(){controller?.abort();controller=null;clearTimers();if(pendingReject){pendingReject(new Error('Room connection cancelled.'));pendingReject=null}const previous=socket;socket=null;if(previous&&previous.readyState<2)previous.close(1000,'Leaving room')}
  function leave(){
    generation++;if(connected())try{send({type:'leave'})}catch{}
    cancelConnection();snapshot=null;selfId=null;buffers.clear();reconnectSince=0;emit({type:'closed',intentional:true,message:'You left the private room.'});
  }
  function updateClock(event){
    if(!finite(event.serverNow,0,1e15))return;
    if(event.type==='pong'&&finite(event.sentAt,0,1e15)){
      const rtt=wallNow()-event.sentAt;if(rtt>=0&&rtt<bestRtt){bestRtt=rtt;clockOffset=event.serverNow-(event.sentAt+wallNow())/2}
    }else if(bestRtt===Infinity)clockOffset=event.serverNow-wallNow();
  }
  function receive(raw,resolve){
    if(typeof raw!=='string'||raw.length>32768)return;
    let event;try{event=JSON.parse(raw)}catch{return}
    if(!event||typeof event!=='object')return;updateClock(event);
    if(event.type==='lobby'){
      if(!CODE.test(event.code)||!phases.has(event.phase)||!validId(event.hostId)||!validPlayers(event.players))return;
      if(snapshot?.raceId!==event.raceId){buffers.clear();lastSent=-Infinity;sequence=0;lastFinished=false}
      snapshot={...event,selfId};reconnectSince=0;
      if(resolve){clearTimeout(connectTimer);connectTimer=null;pendingReject=null;resolve(snapshot);emit({type:'connected',room:snapshot})}
      emit(snapshot);return;
    }
    if(!snapshot)return;
    if(event.type==='race'){
      if(!validId(event.raceId)||!finite(event.startAt,0,1e15)||!validPlayers(event.players))return;
      snapshot={...snapshot,...event,type:'lobby',phase:'countdown',selfId,results:[]};buffers.clear();lastSent=-Infinity;sequence=0;lastFinished=false;emit(event);return;
    }
    if(event.type==='state'){
      if(event.id===selfId||!snapshot.players.some(p=>p.id===event.id)||!Number.isInteger(event.seq)||event.seq<0||!validState(event.state))return;
      const buffer=buffers.get(event.id)||[];if(buffer.length&&event.seq<=buffer.at(-1).seq)return;
      buffer.push({time:now(),seq:event.seq,state:event.state});if(buffer.length>5)buffer.shift();buffers.set(event.id,buffer);
      if(snapshot.phase==='countdown')snapshot={...snapshot,phase:'racing'};emit(event);return;
    }
    if(event.type==='results'){
      if(event.raceId!==snapshot.raceId||!Array.isArray(event.results)||event.results.length>8||event.results.some(r=>!snapshot.players.some(p=>p.id===r.id)||typeof r.driver!=='string'||r.driver.length>20||typeof r.dnf!=='boolean'||(!r.dnf&&(!Number.isInteger(r.position)||r.position<1||r.position>8||!finite(r.timeMs,0,1200000)))))return;
      const complete=snapshot.players.every(p=>event.results.some(r=>r.id===p.id));
      snapshot={...snapshot,phase:complete?'finished':snapshot.phase,results:event.results};emit({...event,complete});return;
    }
    if(event.type==='pong'){emit(event);return}
    if(event.type==='error')emit({type:'error',code:String(event.code||'room_error').slice(0,80),message:String(event.message||'Room request failed.').slice(0,250)});
  }
  async function endpoint(){
    const config=await api.ready();if(!config.enabled||!config.roomServerUrl)throw new Error('Private rooms are not available on this host yet.');
    const url=new URL(config.roomServerUrl),local=loopback(globalThis.location?.hostname||'');
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'&&url.hostname.endsWith('.workers.dev')||local&&url.protocol==='http:'&&loopback(url.hostname)))throw new Error('The private-room server address is invalid.');
    return url.origin;
  }
  async function openConnection(create,code,requestGeneration){
    const base=await endpoint();if(requestGeneration!==generation)throw new Error('Room connection cancelled.');
    const token=await api.getAccessToken();if(requestGeneration!==generation)throw new Error('Room connection cancelled.');
    controller=new AbortController();const requestController=controller,timeout=setTimeout(()=>requestController.abort(),15000);
    let data;
    try{
      const response=await fetcher(base+(create?'/rooms':'/rooms/'+code+'/join'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:requestController.signal});
      data=await response.json();if(!response.ok)throw new Error(data.message||'Could not join this private room.');
    }finally{clearTimeout(timeout);if(controller===requestController)controller=null}
    if(requestGeneration!==generation)throw new Error('Room connection cancelled.');
    if(!CODE.test(data.code)||!validId(data.selfId)||typeof data.socketPath!=='string'||data.socketPath.length>1024||!data.socketPath.startsWith('/rooms/'+data.code+'/connect?'))throw new Error('The room server returned an invalid connection.');
    const url=new URL(data.socketPath,base);if(url.origin!==base)throw new Error('The room connection address is invalid.');
    url.protocol=url.protocol==='https:'?'wss:':'ws:';selfId=data.selfId;
    return new Promise((resolve,reject)=>{
      let welcomed=false,settled=false;const ws=new WebSocketImpl(url.href);socket=ws;sequence=0;
      const accept=value=>{if(settled)return;settled=true;welcomed=true;resolve(value)};
      const fail=error=>{if(settled)return;settled=true;pendingReject=null;clearTimeout(connectTimer);reject(error)};
      pendingReject=fail;connectTimer=setTimeout(()=>{fail(new Error('The room connection timed out.'));ws.close()},10000);
      ws.addEventListener('open',()=>{
        if(requestGeneration!==generation||socket!==ws){ws.close();return}
        clearInterval(pingTimer);pingTimer=setInterval(()=>{if(connected())send({type:'ping',sentAt:wallNow()})},5000);pingTimer?.unref?.();
        send({type:'ping',sentAt:wallNow()});
      });
      ws.addEventListener('message',event=>{if(requestGeneration===generation&&socket===ws)receive(event.data,welcomed?null:accept)});
      ws.addEventListener('error',()=>{if(!welcomed)fail(new Error('Could not connect to the private room.'))});
      ws.addEventListener('close',()=>{
        if(requestGeneration!==generation||socket!==ws)return;
        socket=null;clearTimers();fail(new Error('The room connection closed.'));
        if(welcomed&&snapshot){emit({type:'reconnecting',message:'Connection lost. Rejoining your room…'});scheduleReconnect(requestGeneration,data.code)}
        else emit({type:'closed',intentional:false,message:'The room connection closed.'});
      });
    });
  }
  function scheduleReconnect(requestGeneration,code){
    reconnectSince||=wallNow();
    if(wallNow()-reconnectSince>15000){snapshot=null;selfId=null;buffers.clear();emit({type:'closed',intentional:false,message:'Could not rejoin the room. Join again when ready.'});return}
    retryTimer=setTimeout(async()=>{
      if(requestGeneration!==generation)return;
      try{await openConnection(false,code,requestGeneration)}catch(error){if(requestGeneration!==generation)return;emit({type:'reconnecting',message:error.message});scheduleReconnect(requestGeneration,code)}
    },1000);
  }
  const stopAuth=api.onAuthChange(()=>{setTimeout(async()=>{try{if(!(await api.identity()).signedIn&&(socket||snapshot))leave()}catch{if(socket||snapshot)leave()}},0)});
  return{
    async connect({create=false,code}={}){
      code=String(code||'').trim().toUpperCase();if(!create&&!CODE.test(code))throw new Error('Enter the eight-character room code.');
      generation++;cancelConnection();snapshot=null;selfId=null;buffers.clear();reconnectSince=0;bestRtt=Infinity;
      return openConnection(create,code,generation);
    },
    leave,setReady:ready=>send({type:'ready',ready:!!ready}),startRace:()=>send({type:'start'}),resetRace:()=>send({type:'reset'}),
    sendState(car){
      if(!connected()||!snapshot?.raceId||!['countdown','racing'].includes(snapshot.phase))return false;
      const time=now(),state={};for(const key of ['x','z','yaw','speed','steer','throttle','brake','boost','energy','progress','lap','finished'])state[key]=car[key];
      if(!validState(state)||time-lastSent<50&&state.finished===lastFinished)return false;
      lastSent=time;lastFinished=state.finished;send({type:'state',raceId:snapshot.raceId,seq:++sequence,state});return true;
    },
    sampleRemote(id,time=now()){
      const buffer=buffers.get(id);if(!buffer?.length||time-buffer.at(-1).time>2000)return null;
      const target=time-100;let a=buffer[0],b=a;
      for(const entry of buffer){if(entry.time<=target)a=entry;if(entry.time>=target){b=entry;break}b=entry}
      return interpolateRoomStates(a.state,b.state,b.time===a.time?1:(target-a.time)/(b.time-a.time));
    },
    onEvent(fn){listeners.add(fn);return()=>listeners.delete(fn)},serverNow:()=>wallNow()+clockOffset,
    get snapshot(){return snapshot},get selfId(){return selfId},get connected(){return connected()},
    dispose(){leave();stopAuth?.();listeners.clear()}
  };
}
