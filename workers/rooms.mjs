import {DurableObject} from 'cloudflare:workers';
import {RaceRoom as RoomCore,createRoomsWorker} from './rooms-core.mjs';

export class RaceRoom extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.impl=new RoomCore(ctx,env)}
  fetch(request){return this.impl.fetch(request)}
  webSocketMessage(socket,message){return this.impl.webSocketMessage(socket,message)}
  webSocketClose(socket,code,reason){return this.impl.webSocketClose(socket,code,reason)}
  webSocketError(socket){return this.impl.webSocketError(socket)}
  alarm(){return this.impl.alarm()}
}
export default createRoomsWorker();
