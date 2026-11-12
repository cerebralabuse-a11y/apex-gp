import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {RaceRoom,createRoomsWorker,gridPosition,validateState} from '../workers/rooms-core.mjs';
import {verificationTrack as track} from '../dist/verification-track.js';

const origin='http://localhost:4173';
const uid=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const position=(index=0)=>({...gridPosition(index),speed:0,steer:0,throttle:0,brake:0,boost:false,energy:100,progress:-8-index*14,lap:1,finished:false});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,description){for(let i=0;i<150;i++){const result=check();if(result)return result;await pause(20)}throw new Error('Timed out: '+description)}

test('room movement checks finite bounds, surface-independent travel, sequence payload shape and honest finish threshold',()=>{
  const now=Date.now(),state=position();assert.equal(validateState(state,null,now,now,0),true);
  for(const next of [{...state,x:NaN},{...state,x:5001},{...state,speed:200},{...state,energy:-1},{...state,lap:1.1},{...state,finished:true},{...state,userId:uid(2)},{...state,x:state.x+100}])assert.equal(validateState(next,null,now,now,0),false);
  assert.equal(validateState({...state,x:state.x+10,progress:2},{at:now-100,state},now,now-1000,0),true);
});

test('room HTTP boundary never accepts forged identities and requires configured confirmed Auth',async()=>{
  const handler=createRoomsWorker();const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'};
  const send=(path,headers={},method='POST',body='{}')=>handler.fetch(new Request('https://rooms.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='POST'?{body}:{})}),env);
  assert.equal((await send('/status',{},'GET')).status,200);
  assert.equal((await send('/rooms',{Origin:'https://other.test'})).status,403);
  assert.equal((await send('/rooms',{'x-player-id':uid(1),'x-player-name':'FORGED'})).status,401);
  assert.equal((await send('/rooms',{},'GET')).status,405);
  assert.equal((await send('/rooms/ABCDEFGH/connect',{},'GET')).status,426);
});

test('room CORS can allow exact deployment origins without opening access to other sites',async()=>{
  const handler=createRoomsWorker(),env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',GAME_ORIGINS:'https://preview.example, https://game.example'};
  const response=await handler.fetch(new Request('https://rooms.test/rooms',{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(response.status,401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://preview.example');
  const rejected=await handler.fetch(new Request('https://rooms.test/rooms',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(rejected.status,403);
  assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
});

test('real workerd rooms enforce 2–8 players, ready host start, isolated relay, one-use tickets and reconnect',async t=>{
  const bundled=await build({stdin:{contents:`import {RaceRoom} from './workers/rooms.mjs'; import {createRoomsWorker} from './workers/rooms-core.mjs'; export {RaceRoom}; export default createRoomsWorker({identify:async request=>{const token=request.headers.get('Authorization')||''; const n=Number(token.replace('Bearer test-',''));if(!Number.isInteger(n)||n<1||n>30)throw Object.assign(new Error('Sign in required'),{status:401,code:'sign_in_required'});return{id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),driver:'TEST_'+n}}});`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-11-01',durableObjects:{ROOMS:{className:'RaceRoom',useSQLite:true}},log:new Log(LogLevel.ERROR)}));
  t.after(()=>mf.dispose());const sockets=[];t.after(()=>{for(const socket of sockets)try{socket.close()}catch{}});
  async function request(path,n,body={}){const response=await mf.dispatchFetch('http://rooms.test'+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer test-'+n,'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()}}
  async function connect(ticket){const response=await mf.dispatchFetch('http://rooms.test'+ticket.socketPath,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);const socket=response.webSocket,packets=[];socket.addEventListener('message',event=>packets.push(JSON.parse(event.data)));socket.accept();sockets.push(socket);await waitFor(()=>packets.find(p=>p.type==='lobby'),'welcome');return{socket,packets,send:value=>socket.send(JSON.stringify(value))}}
  const created=await request('/rooms',1);assert.equal(created.status,201);assert.match(created.data.code,/^[A-HJ-NP-Z2-9]{8}$/);
  const code=created.data.code,host=await connect(created.data);host.send({type:'start'});assert.equal((await waitFor(()=>host.packets.find(p=>p.type==='error'),'single player rejection')).code,'players_not_ready');
  const reused=await mf.dispatchFetch('http://rooms.test'+created.data.socketPath,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(reused.status,401);
  const peers=[host];for(let n=2;n<=8;n++){const joined=await request('/rooms/'+code+'/join',n);assert.equal(joined.status,201);peers.push(await connect(joined.data))}
  const ninth=await request('/rooms/'+code+'/join',9);assert.equal(ninth.status,409);assert.equal(ninth.data.error,'room_full');
  peers[1].send({type:'start'});assert.equal((await waitFor(()=>peers[1].packets.find(p=>p.type==='error'),'host-only rejection')).code,'host_only');
  for(const peer of peers)peer.send({type:'ready',ready:true});await waitFor(()=>host.packets.some(p=>p.type==='lobby'&&p.players.length===8&&p.players.every(x=>x.ready)),'all ready');
  host.send({type:'start'});const race=await waitFor(()=>host.packets.find(p=>p.type==='race'),'race start');assert.equal(race.players.length,8);assert.ok(race.startAt-race.serverNow>=4900);
  const locked=await request('/rooms/'+code+'/join',10);assert.equal(locked.status,409);assert.equal(locked.data.error,'race_in_progress');
  const other=await request('/rooms',11),isolated=await connect(other.data);
  await pause(Math.max(0,race.startAt-Date.now()+30));
  host.send({type:'state',raceId:race.raceId,seq:0,id:uid(7),state:position()});
  const relayed=await waitFor(()=>peers[1].packets.find(p=>p.type==='state'),'movement relay');assert.equal(relayed.id,uid(1));assert.equal(relayed.seq,0);assert.equal(isolated.packets.some(p=>p.type==='state'),false);
  const statesBefore=peers[1].packets.filter(p=>p.type==='state').length;
  host.send({type:'state',raceId:race.raceId,seq:1,state:{...position(),x:4000}});await waitFor(()=>host.packets.find(p=>p.type==='error'&&p.code==='invalid_state'),'teleport rejection');assert.equal(peers[1].packets.filter(p=>p.type==='state').length,statesBefore);
  host.socket.close(1000,'Test reconnect');await waitFor(()=>peers[1].packets.some(p=>p.type==='lobby'&&p.hostId===uid(2)&&p.players.some(x=>x.id===uid(1)&&!x.connected)),'host transfer');
  const returned=await request('/rooms/'+code+'/join',1);assert.equal(returned.status,201);const reconnected=await connect(returned.data);assert.ok(reconnected.packets.find(p=>p.type==='lobby').players.some(p=>p.id===uid(1)&&p.connected));
});

test('room lifecycle times out disconnected racers, derives result time and returns to lobby without database writes',async()=>{
  const map=new Map(),sockets=[];let storedWrites=0;
  const ctx={blockConcurrencyWhile:fn=>fn(),getWebSockets:()=>sockets,storage:{async get(key){return map.get(key)},async put(key,value){storedWrites++;map.set(key,structuredClone(value))},async setAlarm(){},async deleteAll(){map.clear()}}};
  const room=new RaceRoom(ctx,{});await room.ready;const now=Date.now();
  room.room={code:'ABCDEFGH',hostId:uid(1),phase:'racing',raceId:'race',startAt:now-10000,expiresAt:now+600000,players:[{id:uid(1),driver:'FIRST',index:0,color:'#fff',ready:true,connected:true},{id:uid(2),driver:'SECOND',index:1,color:'#fff',ready:true,connected:false,disconnectedAt:now-16000}],results:[],tickets:{}};
  let attachment={id:uid(1),seq:0,windowAt:now,count:0,controlAt:now,controls:0,last:{at:now-100,state:{...position(),progress:track.length*3-1}}};const packets=[];
  const socket={readyState:1,deserializeAttachment:()=>attachment,serializeAttachment:value=>{attachment=value},send:value=>packets.push(JSON.parse(value)),close(){this.readyState=3}};sockets.push(socket);
  await room.webSocketMessage(socket,JSON.stringify({type:'state',raceId:'race',seq:1,state:{...position(),progress:track.length*3,lap:4,finished:true}}));
  assert.equal(room.room.phase,'finished');assert.equal(room.room.results.find(p=>p.id===uid(2)).dnf,true);const winner=room.room.results.find(p=>p.id===uid(1));assert.equal(winner.position,1);assert.ok(winner.timeMs>=10000);assert.equal(storedWrites,3);
  await room.webSocketMessage(socket,JSON.stringify({type:'reset'}));assert.equal(room.room.phase,'lobby');assert.equal(room.room.players.length,1);assert.equal(room.room.players[0].ready,false);
});

