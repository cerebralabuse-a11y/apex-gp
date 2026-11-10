import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomClient,interpolateRoomStates} from '../dist/room-client.js';

class FakeSocket{
  static all=[];
  constructor(url){this.url=url;this.readyState=0;this.sent=[];this.listeners=new Map();FakeSocket.all.push(this)}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list)}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event)}
  open(){this.readyState=1;this.emit('open')}
  receive(value){this.emit('message',{data:JSON.stringify(value)})}
  send(value){this.sent.push(JSON.parse(value))}
  close(){if(this.readyState===3)return;this.readyState=3;this.emit('close')}
}
const player=(id,index)=>({id,index,driver:'Driver_'+index,color:'#edcc85',ready:false,connected:true,grid:{x:index*4,z:0,yaw:0}});
const lobby=()=>({type:'lobby',code:'ABCD2345',hostId:'p1',phase:'lobby',raceId:null,startAt:null,serverNow:1000,players:[player('p1',0),player('p2',1)],results:[]});
const race=()=>({type:'race',code:'ABCD2345',hostId:'p1',raceId:'race1',startAt:6000,serverNow:1000,players:lobby().players});
const state=(x=0,yaw=0)=>({x,z:0,yaw,speed:10,steer:0,throttle:1,brake:0,boost:false,energy:100,progress:x,lap:1,finished:false});
const api={ready:async()=>({enabled:true,roomServerUrl:'https://apex-test.workers.dev'}),getAccessToken:async()=>'private-access-token',identity:async()=>({signedIn:true}),onAuthChange:()=>()=>{}};
const response=()=>Response.json({code:'ABCD2345',selfId:'p1',ticket:'one-time',socketPath:'/rooms/ABCD2345/connect?ticket=one-time'});
async function flushUntil(check){for(let i=0;i<30&&!check();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(check(),'Async operation reached expected boundary')}
async function establish(client){const previous=FakeSocket.all.length,promise=client.connect({create:true});await flushUntil(()=>FakeSocket.all.length>previous);const socket=FakeSocket.all.at(-1);socket.open();socket.receive(lobby());await promise;return socket}

test('room handshake authenticates HTTP only, resolves on welcome, and cleans up on leave',async()=>{
  const calls=[],events=[];const client=createRoomClient({api,WebSocketImpl:FakeSocket,fetcher:async(url,init)=>{calls.push({url,init});return response()}});client.onEvent(e=>events.push(e));
  const socket=await establish(client);
  assert.equal(calls[0].init.headers.Authorization,'Bearer private-access-token');assert.equal(calls[0].url,'https://apex-test.workers.dev/rooms');
  assert.ok(socket.url.startsWith('wss://apex-test.workers.dev/rooms/ABCD2345/connect?ticket='));assert.ok(!socket.url.includes('private-access-token'));
  assert.equal(client.connected,true);assert.equal(client.selfId,'p1');assert.equal(events.filter(e=>e.type==='connected').length,1);
  client.setReady(true);client.startRace();assert.deepEqual(socket.sent.slice(-2),[{type:'ready',ready:true},{type:'start'}]);
  client.leave();assert.equal(socket.readyState,3);assert.equal(client.snapshot,null);assert.equal(client.selfId,null);assert.equal(client.connected,false);assert.equal(events.at(-1).intentional,true);
});

test('cancelled HTTP join cannot revive a socket or an abandoned room',async()=>{
  let finishRequest,requestSignal;const client=createRoomClient({api,WebSocketImpl:FakeSocket,fetcher:async(url,init)=>{requestSignal=init.signal;return new Promise(resolve=>finishRequest=resolve)}});
  const before=FakeSocket.all.length,promise=client.connect({code:' abcd2345 '});await flushUntil(()=>finishRequest);client.leave();assert.equal(requestSignal.aborted,true);finishRequest(response());
  await assert.rejects(promise,/cancelled/);assert.equal(FakeSocket.all.length,before);assert.equal(client.snapshot,null);
});

test('remote cars interpolate across yaw wrap, ignore stale or foreign packets and expire',async()=>{
  let clock=1000;const client=createRoomClient({api,WebSocketImpl:FakeSocket,fetcher:async()=>response(),now:()=>clock,wallNow:()=>clock});const socket=await establish(client);socket.receive(race());
  socket.receive({type:'state',id:'p2',seq:1,serverNow:clock,state:state(0,3.1)});clock=1100;
  socket.receive({type:'state',id:'p2',seq:2,serverNow:clock,state:state(10,-3.1)});socket.receive({type:'state',id:'p2',seq:1,serverNow:clock,state:state(999)});
  socket.receive({type:'state',id:'not-in-room',seq:1,serverNow:clock,state:state(999)});socket.receive({type:'state',id:'p2',seq:3,serverNow:clock,state:state(Infinity)});
  const sample=client.sampleRemote('p2',1150);assert.equal(sample.x,5);assert.ok(Math.abs(sample.yaw-Math.PI)<1e-8);assert.equal(client.sampleRemote('not-in-room'),null);assert.equal(client.sampleRemote('p2',3101),null);
  assert.equal(interpolateRoomStates(state(0),state(10),3).x,10);client.dispose();
});

test('movement is bounded to20Hz and partial results do not end other players race',async()=>{
  let clock=1000;const client=createRoomClient({api,WebSocketImpl:FakeSocket,fetcher:async()=>response(),now:()=>clock,wallNow:()=>clock});const socket=await establish(client);socket.receive(race());
  assert.equal(client.sendState(state()),true);clock+=10;assert.equal(client.sendState(state()),false);clock+=40;assert.equal(client.sendState(state(1)),true);
  assert.equal(client.sendState({...state(1),finished:true,lap:4}),true);assert.equal(socket.sent.filter(e=>e.type==='state').length,3);assert.deepEqual(socket.sent.filter(e=>e.type==='state').map(e=>e.seq),[1,2,3]);
  socket.receive({type:'results',raceId:'race1',results:[{id:'p2',driver:'Driver_1',position:1,timeMs:60000,dnf:false}]});assert.notEqual(client.snapshot.phase,'finished');
  socket.receive({type:'results',raceId:'race1',results:[{id:'p2',driver:'Driver_1',position:1,timeMs:60000,dnf:false},{id:'p1',driver:'Driver_0',position:null,timeMs:null,dnf:true}]});assert.equal(client.snapshot.phase,'finished');client.dispose();
});

test('invalid room codes and external server addresses never receive the access token',async()=>{
  let tokens=0;const insecure={...api,getAccessToken:async()=>{tokens++;return'never-send'},ready:async()=>({enabled:true,roomServerUrl:'https://untrusted.test'})};
  const client=createRoomClient({api:insecure,WebSocketImpl:FakeSocket,fetcher:async()=>{throw new Error('unexpected network')}});
  await assert.rejects(client.connect({code:'BAD'}),/eight-character/);await assert.rejects(client.connect({create:true}),/invalid/);assert.equal(tokens,0);client.dispose();
});
