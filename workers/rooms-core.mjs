import {verificationTrack as track} from '../dist/verification-track.js';
import {sampleTrack} from '../dist/physics.js';
import {readJson} from '../server/verification-handler.mjs';

export const MIN_PLAYERS=2,MAX_PLAYERS=8;
const CODE=/^[A-HJ-NP-Z2-9]{8}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS=['#a2cf3e','#37c6ca','#e7a129','#4c68d9','#eeeecc','#ab82ca','#eb733f','#4caa75'];
const DEFAULT_ORIGINS=['https://apex-gp-kohl.vercel.app','https://apex-gp-git-codex-private-ba4907-aayush-sonis-projects-b4cb9b45.vercel.app','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:4190','http://localhost:4190','http://127.0.0.1:5188','http://localhost:5188'];
const json=(status,data,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>ALPHABET[v%32]).join('');
const randomTicket=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
class RoomError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const reject=(status,code,message)=>{throw new RoomError(status,code,message)};

async function authenticate(request,env){
  const token=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]{20,16384}$/.test(token))reject(401,'sign_in_required','Sign in and choose a driver name first.');
  if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)reject(503,'not_configured','Private rooms are not configured.');
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:token};
  const userResponse=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
  if(!userResponse.ok)reject(userResponse.status>=500?503:401,'sign_in_required','Sign in again to enter a room.');
  const user=await userResponse.json();
  if(!UUID.test(user.id)||user.is_anonymous||!user.email_confirmed_at)reject(401,'sign_in_required','A confirmed player account is required.');
  const profileResponse=await fetch(env.SUPABASE_URL+'/functions/v1/competition/me',{headers,signal:AbortSignal.timeout(10000)});
  if(!profileResponse.ok)reject(503,'profile_unavailable','Your driver profile could not load. Please try again.');
  const {profile}=await profileResponse.json();
  if(!profile||!/^[A-Za-z0-9_-]{3,20}$/.test(profile.driverName))reject(409,'profile_required','Choose a public driver name in Leaderboard first.');
  return{id:user.id,driver:profile.driverName};
}

// Dependency injection is for tests only. The deployed export always uses Auth.
export function createRoomsWorker({identify=authenticate}={}){
  return{async fetch(request,env){
    const origins=(env.GAME_ORIGINS||DEFAULT_ORIGINS.join(',')).split(',').map(value=>value.trim()).filter(Boolean);
    const origin=request.headers.get('Origin'),cors={Vary:'Origin',...(origins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
    try{
      if(origin!==null&&!origins.includes(origin))reject(403,'origin_denied','This game address is not enabled for private rooms.');
      const url=new URL(request.url),join=/^\/rooms\/([A-HJ-NP-Z2-9]{8})\/join$/.exec(url.pathname),connect=/^\/rooms\/([A-HJ-NP-Z2-9]{8})\/connect$/.exec(url.pathname);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'600'}});
      if(url.pathname==='/status'&&request.method==='GET')return json(200,{enabled:true,minPlayers:MIN_PLAYERS,maxPlayers:MAX_PLAYERS,ranked:false,trackId:track.id},cors);
      if(connect){
        if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')reject(426,'websocket_required','Open a WebSocket connection.');
        if(!origin)reject(403,'origin_denied','A permitted game Origin is required.');
        const stub=env.ROOMS.get(env.ROOMS.idFromName(connect[1]));
        return await stub.fetch(new Request('https://room.internal/connect?ticket='+encodeURIComponent(url.searchParams.get('ticket')||''),{headers:{Upgrade:'websocket'}}));
      }
      if(url.pathname!=='/rooms'&&!join)reject(404,'not_found','Room endpoint not found.');
      if(request.method!=='POST')return json(405,{error:'method_not_allowed'},{...cors,Allow:'POST'});
      if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json'||request.headers.has('Content-Encoding'))reject(415,'json_required','Send an uncompressed JSON request.');
      const identity=await identify(request,env),body=await readJson(request,1024);
      if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)reject(400,'invalid_request','This request must contain an empty JSON object.');
      const budget=env.ROOMS.get(env.ROOMS.idFromName('budget:'+identity.id));
      const allowance=await budget.fetch(new Request('https://room.internal/budget',{method:'POST',body:JSON.stringify({create:!join})}));
      if(!allowance.ok)return json(allowance.status,await allowance.json(),cors);
      for(let i=0;i<3;i++){
        const code=join?join[1]:randomCode(),stub=env.ROOMS.get(env.ROOMS.idFromName(code));
        const response=await stub.fetch(new Request('https://room.internal/'+(join?'join':'create'),{method:'POST',body:JSON.stringify({code,identity})}));
        if(!join&&response.status===409&&i<2)continue;
        return json(response.status,await response.json(),cors);
      }
    }catch(error){return json(error.status||503,{error:error.code||'room_unavailable',message:error.status?error.message:'Private rooms are temporarily unavailable. Please try again.'},cors)}
  }};
}
export default createRoomsWorker();

export function gridPosition(index){const p=sampleTrack(track,track.start-8-index*14,index%2===0?-1.6:1.6);return{x:p.x,z:p.z,yaw:p.yaw}}
export function validateState(value,previous,now,startAt,index){
  const numeric=['x','z','yaw','speed','steer','throttle','brake','energy','progress','lap'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==12||numeric.some(k=>typeof value[k]!=='number'||!Number.isFinite(value[k]))||typeof value.boost!=='boolean'||typeof value.finished!=='boolean')return false;
  if(Math.abs(value.x)>5000||Math.abs(value.z)>5000||Math.abs(value.yaw)>100000||value.speed<0||value.speed>125||Math.abs(value.steer)>1.01||value.throttle<0||value.throttle>1||value.brake<0||value.brake>1||value.energy<0||value.energy>100||!Number.isInteger(value.lap)||value.lap<1||value.lap>4||value.progress<-500||value.progress>track.length*3+30)return false;
  const before=previous?.state||{...gridPosition(index),progress:-8-index*14},elapsed=Math.max(0,(now-(previous?.at??startAt))/1000),travel=145*elapsed+8;
  if(Math.hypot(value.x-before.x,value.z-before.z)>travel||Math.abs(value.progress-before.progress)>travel)return false;
  return !value.finished||(value.lap===4&&value.progress>=track.length*3);
}

export class RaceRoom{
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.room=null;
    this.ready=ctx.blockConcurrencyWhile(async()=>{
      this.room=await ctx.storage.get('room')||null;
      if(this.room)for(const p of this.room.players){const connected=this.sockets().some(s=>s.deserializeAttachment()?.id===p.id);if(p.connected&&!connected)p.disconnectedAt??=Date.now();p.connected=connected}
    });
  }
  sockets(){return this.ctx.getWebSockets().filter(s=>s.readyState===1)}
  playerSocket(id){return this.sockets().find(s=>s.deserializeAttachment()?.id===id)}
  send(socket,value){try{socket.send(JSON.stringify(value))}catch{}}
  broadcast(value,except){for(const socket of this.sockets())if(socket!==except)this.send(socket,value)}
  lobby(selfId){const r=this.room;return{type:'lobby',code:r.code,...(selfId?{selfId}:{}),hostId:r.hostId,phase:r.phase,raceId:r.raceId,startAt:r.startAt,serverNow:Date.now(),minPlayers:2,maxPlayers:8,players:r.players.map(({disconnectedAt,reservedUntil,...p})=>({...p,grid:gridPosition(p.index)})),results:r.results}}
  async save(){await this.ctx.storage.put('room',this.room);await this.schedule()}
  async schedule(){
    const r=this.room;if(!r)return;
    const deadlines=[r.expiresAt];
    for(const p of r.players){if(!p.connected)deadlines.push(p.disconnectedAt?p.disconnectedAt+15000:p.reservedUntil||r.expiresAt)}
    if(r.phase==='countdown'||r.phase==='racing')deadlines.push(r.startAt+600000);
    await this.ctx.storage.setAlarm(Math.max(Date.now()+100,Math.min(...deadlines)));
  }
  async budget(create){
    return this.ctx.blockConcurrencyWhile(async()=>{
      const now=Date.now(),stored=await this.ctx.storage.get('budget')||{creates:[],joins:[]};
      stored.creates=stored.creates.filter(t=>t>now-3600000);stored.joins=stored.joins.filter(t=>t>now-60000);
      if(stored.joins.length>=30||(create&&stored.creates.length>=5))return json(429,{error:'room_rate_limit',message:'Too many room requests. Please wait before trying again.'});
      stored.joins.push(now);if(create)stored.creates.push(now);await this.ctx.storage.put('budget',stored);await this.ctx.storage.setAlarm(now+3600000);return json(200,{allowed:true});
    });
  }
  async prune(){
    const r=this.room;if(!r)return false;const now=Date.now();
    if(now>=r.expiresAt){for(const s of this.sockets())s.close(4000,'Room expired');this.room=null;await this.ctx.storage.deleteAll();return true}
    let changed=false;
    for(const p of [...r.players]){
      if(p.connected)continue;
      if((p.disconnectedAt&&now-p.disconnectedAt>=15000)||(!p.disconnectedAt&&p.reservedUntil<=now)){
        if(r.phase==='countdown'||r.phase==='racing'){if(!r.results.some(x=>x.id===p.id)){r.results.push({id:p.id,driver:p.driver,position:null,timeMs:null,dnf:true});changed=true}p.reservedUntil=r.expiresAt;p.disconnectedAt=null}
        else{r.players=r.players.filter(x=>x.id!==p.id);changed=true}
      }
    }
    if((r.phase==='countdown'||r.phase==='racing')&&now>=r.startAt+600000){for(const p of r.players)if(!r.results.some(x=>x.id===p.id))r.results.push({id:p.id,driver:p.driver,position:null,timeMs:null,dnf:true});changed=true}
    if((r.phase==='countdown'||r.phase==='racing')&&r.players.every(p=>r.results.some(x=>x.id===p.id))){r.phase='finished';this.broadcast({type:'results',raceId:r.raceId,results:r.results});changed=true}
    if(!r.players.some(p=>p.id===r.hostId&&p.connected)){const host=r.players.find(p=>p.connected);if(host&&host.id!==r.hostId){r.hostId=host.id;changed=true}}
    if(changed){await this.save();this.broadcast(this.lobby())}return changed;
  }
  async fetch(request){
    await this.ready;
    try{
      const url=new URL(request.url);
      if(url.pathname==='/budget'){const {create}=await request.json();return this.budget(create===true)}
      await this.prune();
      if(url.pathname==='/connect')return await this.connect(url.searchParams.get('ticket'));
      const {code,identity}=await request.json();
      if(!CODE.test(code)||!UUID.test(identity?.id)||!/^[A-Za-z0-9_-]{3,20}$/.test(identity.driver))reject(400,'invalid_identity','Invalid room identity.');
      if(url.pathname==='/create'){
        if(this.room)reject(409,'room_exists','Room code already in use.');
        this.room={code,hostId:identity.id,phase:'lobby',raceId:null,startAt:null,expiresAt:Date.now()+1200000,players:[],results:[],tickets:{}};
      }else if(url.pathname!=='/join')reject(404,'not_found','Room endpoint not found.');
      if(!this.room)reject(404,'room_not_found','Room not found or expired.');
      const r=this.room;let player=r.players.find(p=>p.id===identity.id);
      if(!player&&(r.phase==='countdown'||r.phase==='racing'))reject(409,'race_in_progress','This race has already started. Join the next race.');
      if(player&&(r.phase==='countdown'||r.phase==='racing')&&r.results.some(x=>x.id===player.id&&x.dnf))reject(409,'reconnect_expired','Your reconnect window ended. Join the next race.');
      if(!player){if(r.players.length>=8)reject(409,'room_full','This room already has eight players.');const index=[0,1,2,3,4,5,6,7].find(i=>!r.players.some(p=>p.index===i));player={id:identity.id,driver:identity.driver,color:COLORS[index],index,ready:false,connected:false,reservedUntil:Date.now()+30000};r.players.push(player)}
      player.driver=identity.driver;
      const ticket=randomTicket();r.tickets=Object.fromEntries(Object.entries(r.tickets).filter(([,v])=>v.expiresAt>Date.now()&&v.id!==identity.id));r.tickets[ticket]={id:identity.id,expiresAt:Date.now()+30000};
      await this.save();return json(201,{code:r.code,ticket,socketPath:'/rooms/'+r.code+'/connect?ticket='+ticket,selfId:identity.id});
    }catch(error){return json(error.status||503,{error:error.code||'room_unavailable',message:error.status?error.message:'Room temporarily unavailable.'})}
  }
  async connect(ticket){
    const r=this.room,claim=r?.tickets[ticket];
    if(!claim||claim.expiresAt<=Date.now())reject(401,'invalid_ticket','Connection ticket expired. Rejoin the room.');
    delete r.tickets[ticket];const player=r.players.find(p=>p.id===claim.id);if(!player)reject(401,'invalid_ticket','Room membership ended.');
    for(const old of this.sockets())if(old.deserializeAttachment()?.id===player.id)old.close(4001,'Connected in another tab');
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server);server.serializeAttachment({id:player.id,seq:-1,windowAt:Date.now(),count:0,controlAt:Date.now(),controls:0,last:null});player.connected=true;player.disconnectedAt=null;player.reservedUntil=null;
    await this.save();this.send(server,this.lobby(player.id));this.broadcast(this.lobby(),server);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(socket,message){
    await this.ready;await this.prune();if(!this.room)return;
    try{
      if(typeof message!=='string'||new TextEncoder().encode(message).length>2048)reject(400,'invalid_message','Room messages must be small JSON objects.');
      const packet=JSON.parse(message),r=this.room,attachment=socket.deserializeAttachment(),player=r.players.find(p=>p.id===attachment?.id);
      if(!player||this.playerSocket(player.id)!==socket)reject(401,'membership_ended','Room membership ended.');
      if(packet.type!=='state'){
        const now=Date.now();if(now-attachment.controlAt>=10000){attachment.controlAt=now;attachment.controls=0}
        attachment.controls++;socket.serializeAttachment(attachment);
        if(attachment.controls>6)reject(429,'message_rate_limit','Please wait before sending another room command.');
      }
      if(packet.type==='ping'){if(typeof packet.sentAt==='number'&&Number.isFinite(packet.sentAt))this.send(socket,{type:'pong',sentAt:packet.sentAt,serverNow:Date.now()});return}
      if(packet.type==='leave'){await this.disconnect(socket,true);socket.close(1000,'Left room');return}
      if(packet.type==='ready'){
        if(r.phase!=='lobby'||typeof packet.ready!=='boolean')reject(409,'not_in_lobby','Readiness can only change in the lobby.');if(player.ready===packet.ready)return;player.ready=packet.ready;await this.save();this.broadcast(this.lobby());return;
      }
      if(packet.type==='start'){
        if(player.id!==r.hostId)reject(403,'host_only','Only the host can start the race.');
        if(r.phase!=='lobby'||r.players.length<2||r.players.length>8||!r.players.every(p=>p.connected&&p.ready))reject(409,'players_not_ready','At least two connected players must be ready.');
        r.phase='countdown';r.raceId=crypto.randomUUID();r.startAt=Date.now()+5000;r.results=[];
        for(const s of this.sockets()){const a=s.deserializeAttachment();a.seq=-1;a.last=null;s.serializeAttachment(a)}
        await this.save();this.broadcast({type:'race',code:r.code,hostId:r.hostId,raceId:r.raceId,startAt:r.startAt,serverNow:Date.now(),players:this.lobby().players});return;
      }
      if(packet.type==='reset'){
        if(player.id!==r.hostId)reject(403,'host_only','Only the host can return the room to the lobby.');if(r.phase!=='finished')reject(409,'race_in_progress','Finish the current race first.');
        r.phase='lobby';r.raceId=null;r.startAt=null;r.results=[];r.players=r.players.filter(p=>p.connected);r.players.forEach(p=>p.ready=false);await this.save();this.broadcast(this.lobby());return;
      }
      if(packet.type!=='state')reject(400,'unknown_message','Unknown room message.');
      const now=Date.now();if((r.phase!=='countdown'&&r.phase!=='racing')||packet.raceId!==r.raceId||now<r.startAt||r.results.some(x=>x.id===player.id))return;
      if(!Number.isInteger(packet.seq)||packet.seq<0||packet.seq<=attachment.seq)reject(400,'invalid_sequence','Movement messages must arrive in sequence.');
      if(now-attachment.windowAt>=1000){attachment.windowAt=now;attachment.count=0}
      if(++attachment.count>30){socket.serializeAttachment(attachment);return}
      if(!validateState(packet.state,attachment.last,now,r.startAt,player.index))reject(400,'invalid_state','An invalid movement update was ignored.');
      const first=r.phase==='countdown';r.phase='racing';attachment.seq=packet.seq;attachment.last={at:now,state:packet.state};socket.serializeAttachment(attachment);
      this.broadcast({type:'state',id:player.id,seq:packet.seq,serverNow:now,state:packet.state},socket);
      if(packet.state.finished){const position=1+r.results.filter(x=>!x.dnf).length;r.results.push({id:player.id,driver:player.driver,position,timeMs:now-r.startAt,dnf:false});await this.save();this.broadcast({type:'results',raceId:r.raceId,results:r.results});await this.prune()}
      else if(first)await this.save();
    }catch(error){this.send(socket,{type:'error',code:error.code||'invalid_message',message:error.status?error.message:'Invalid room message.'})}
  }
  async disconnect(socket,leave=false){
    const r=this.room;if(!r)return;const id=socket.deserializeAttachment()?.id,player=r.players.find(p=>p.id===id);
    if(!player||this.sockets().some(s=>s!==socket&&s.deserializeAttachment()?.id===id))return;
    player.connected=false;player.ready=false;player.disconnectedAt=leave?Date.now()-15000:Date.now();
    if(r.hostId===id){const next=r.players.find(p=>p.connected);if(next)r.hostId=next.id}
    await this.save();await this.prune();if(this.room)this.broadcast(this.lobby());
  }
  async webSocketClose(socket,code,reason){await this.ready;await this.disconnect(socket);try{socket.close(code===1005?1000:code,reason)}catch{}}
  async webSocketError(socket){await this.ready;await this.disconnect(socket);try{socket.close(1011,'Connection interrupted')}catch{}}
  async alarm(){await this.ready;if(this.room){await this.prune();await this.schedule()}else await this.ctx.storage.deleteAll()}
}

