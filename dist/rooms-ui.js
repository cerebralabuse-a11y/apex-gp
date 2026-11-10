const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const button=(text,cls='rooms-button')=>{const el=node('button',cls,text);el.type='button';return el};
const time=ms=>Number.isFinite(ms)?`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(Math.floor(ms)%1000).padStart(3,'0')}`:'—';

export function createRoomsUI({api,client,onAccount}){
  const dialog=node('dialog','rooms-dialog');dialog.id='rooms-dialog';dialog.setAttribute('aria-labelledby','rooms-title');
  const header=node('header','rooms-header'),brand=node('span','title-wordmark','APEX GP / THE PADDOCK'),close=button('← BACK','close-button rooms-back');close.setAttribute('aria-label','Back to game');header.append(brand,close);
  const kicker=node('span','rooms-kicker','FRIENDS ON THE GRID'),title=node('h2','','PRIVATE ROOMS.');title.id='rooms-title';
  const intro=node('p','rooms-intro','Share a code. Race the waterfront together. 2–8 drivers, three laps, original circuit.');
  const badge=node('p','rooms-badge','MULTIPLAYER BETA · UNRANKED');
  const status=node('p','rooms-status','Connecting to your account…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const gate=node('section','rooms-gate'),gateCopy=node('p'),account=button('SIGN IN TO RACE');gate.append(gateCopy,account);account.addEventListener('click',()=>onAccount());
  const entry=node('section','rooms-entry'),host=node('div','rooms-create');host.append(node('h3','','Make your grid.'),node('p','','Create a private lobby and send the code to your friends.'));
  const create=button('CREATE ROOM','rooms-primary');host.append(create);
  const joinForm=node('form','rooms-join'),label=node('label'),caption=node('span','','ROOM CODE'),code=node('input');
  code.name='roomCode';code.autocomplete='off';code.maxLength=8;code.minLength=8;code.pattern='[A-HJ-NP-Za-hj-np-z2-9]{8}';code.placeholder='ABCD2345';code.required=true;code.setAttribute('aria-label','Room code');label.append(caption,code);
  const join=button('JOIN ROOM');join.type='submit';joinForm.append(node('h3','','Join your friends.'),label,join);entry.append(host,joinForm);
  const lobby=node('section','rooms-lobby'),lobbyHead=node('div','rooms-lobby-head'),roomLabel=node('div'),roomCaption=node('span','rooms-kicker','YOUR PRIVATE ROOM'),roomCode=node('strong','rooms-code'),copy=button('COPY INVITE');roomLabel.append(roomCaption,roomCode);lobbyHead.append(roomLabel,copy);
  const count=node('p','rooms-count'),roster=node('ol','rooms-roster');roster.setAttribute('aria-label','Room drivers');
  const actions=node('div','rooms-actions'),ready=button('READY UP'),start=button('START RACE','rooms-primary'),rematch=button('BACK TO LOBBY','rooms-primary'),leave=button('LEAVE ROOM','rooms-quiet');actions.append(ready,start,rematch,leave);
  const hint=node('p','rooms-hint','Everyone readies up. The host starts with at least two drivers.');
  const results=node('div','rooms-results');lobby.append(lobbyHead,count,roster,actions,hint,results);
  const note=node('p','rooms-note','Friendly races use non-contact cars. Room results stay separate from the verified leaderboard and prize competition.');
  dialog.append(header,kicker,title,intro,badge,status,gate,entry,lobby,note);document.body.append(dialog);
  gate.hidden=entry.hidden=lobby.hidden=true;
  let allowed=false,pending=false,profile=null,generation=0;
  const show=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error)};
  function render(){
    const room=client.snapshot,isConnected=client.connected;
    gate.hidden=allowed;entry.hidden=!allowed||!!room;lobby.hidden=!room;
    create.disabled=join.disabled=code.disabled=pending||!allowed;
    if(!room)return;
    roomCode.textContent=room.code;
    const players=room.players||[],me=players.find(p=>p.id===client.selfId),hostId=room.hostId,active=players.filter(p=>p.connected),isHost=hostId===client.selfId;
    count.textContent=`${active.length} / 8 CONNECTED · ${room.phase==='finished'?'RACE COMPLETE':room.phase==='lobby'?'LOBBY':room.phase==='countdown'?'FORMING THE GRID':'RACE IN PROGRESS'}`;
    roster.replaceChildren(...players.map(p=>{const row=node('li'),dot=node('i');dot.style.background=p.color;const name=node('strong','',p.driver+(p.id===client.selfId?' · YOU':'')),tag=node('span','',!p.connected?'RECONNECTING':p.id===hostId?(p.ready?'HOST · READY':'HOST'):p.ready?'READY':'WAITING');row.append(dot,name,tag);return row}));
    ready.hidden=start.hidden=room.phase!=='lobby';rematch.hidden=room.phase!=='finished'||!isHost;
    ready.textContent=me?.ready?'NOT READY':'READY UP';ready.setAttribute('aria-pressed',String(!!me?.ready));ready.disabled=pending||!isConnected;
    start.hidden||=!isHost;start.disabled=pending||!isConnected||active.length<2||active.length>8||active.some(p=>!p.ready);
    rematch.disabled=pending||!isConnected;leave.disabled=pending;copy.disabled=!isConnected;
    hint.textContent=!isConnected?'Reconnecting to your room…':room.phase==='lobby'?(active.length<2?'Invite a friend. At least two drivers are needed to start.':active.some(p=>!p.ready)?'Every connected driver must ready up before the host can start.':isHost?'Your grid is ready. Start when you are.':'Ready to race. Waiting for the host.'):room.phase==='finished'?'Room results are unranked. The host can return everyone to the lobby.':'Your friends are racing. Use Back to return to the circuit.';
    results.replaceChildren();
    if(room.phase==='finished')for(const r of room.results||[]){const row=node('p','rooms-result');row.append(node('strong','',r.dnf?'—':String(r.position).padStart(2,'0')),node('span','',r.driver),node('b','',r.dnf?'DNF':time(r.timeMs)));results.append(row)}
  }
  async function refresh(){
    const request=++generation;
    try{
      const config=await api.ready();if(request!==generation)return;
      const identity=await api.identity();if(request!==generation)return;
      profile=identity.signedIn?(await api.me()).profile:null;if(request!==generation)return;
      allowed=!!config.enabled&&!!config.roomServerUrl&&!!identity.signedIn&&!!profile;
      gateCopy.textContent=!config.roomServerUrl?'Private rooms are being prepared on this host.':!identity.signedIn?'Sign in, choose a driver name and meet your friends on the grid.':!profile?'Choose your public driver name in the timing room before joining.':'Your account is ready.';
      account.textContent=identity.signedIn?'OPEN MY DRIVER PROFILE':'SIGN IN TO RACE';account.hidden=!config.roomServerUrl;
      if(!client.snapshot)show(allowed?'Create a room, or enter a code from a friend.':'Private rooms · 2–8 drivers · Original circuit');
    }catch(error){if(request!==generation)return;allowed=false;gateCopy.textContent='Your account could not connect. Open your driver profile to reconnect.';account.hidden=false;show(error.message,true)}
    finally{if(request===generation)render()}
  }
  async function action(work){
    if(pending)return;pending=true;render();
    try{await work()}catch(error){show(error.message||'Room request failed. Please try again.',true)}finally{pending=false;render()}
  }
  create.addEventListener('click',()=>void action(async()=>{show('Creating your private room…');await client.connect({create:true});show('Room created. Share the invite with your friends.')}));
  joinForm.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{show('Joining your friends…');await client.connect({code:code.value});show('You joined the private room.')} )});
  ready.addEventListener('click',()=>void action(()=>client.setReady(!client.snapshot?.players.find(p=>p.id===client.selfId)?.ready)));
  start.addEventListener('click',()=>void action(()=>client.startRace()));rematch.addEventListener('click',()=>void action(()=>client.resetRace()));
  leave.addEventListener('click',()=>{client.leave();show('You left the private room.');render()});
  copy.addEventListener('click',()=>void action(async()=>{const invite=new URL(location.pathname,location.origin);invite.searchParams.set('room',client.snapshot.code);try{await navigator.clipboard.writeText(invite.href);show('Invite copied. Send it to your friends.')}catch{show('Copy the room code shown above: '+client.snapshot.code)}}));
  dialog.addEventListener('close',()=>{generation++;if(pending&&!client.connected)client.leave()});
  api.onAuthChange(()=>setTimeout(()=>{if(dialog.open)void refresh()},0));
  client.onEvent(event=>{if(event.type==='error')show(event.message,true);else if(event.type==='reconnecting'||event.type==='closed')show(event.message,event.type==='closed'&&!event.intentional);else if(event.type==='lobby')show('Private room connected.');else if(event.type==='results')show('Chequered flag. Results are ready.');render()});
  return{open(){const invite=new URLSearchParams(location.search).get('room');if(invite)code.value=invite.trim().toUpperCase();return refresh()},refresh};
}
