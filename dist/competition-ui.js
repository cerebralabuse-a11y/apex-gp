const ORIGINAL_TRACK='palm-beach-3753-v2';
const tickTime=ticks=>{
  if(!Number.isInteger(ticks)||ticks<=0)return '--:--.---';
  const ms=Math.floor(ticks*1000/120),minutes=Math.floor(ms/60000);
  return `${String(minutes).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
};
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function button(text,className='competition-button'){const node=element('button',className,text);node.type='button';return node}
function field(labelText,type,name){
  const label=element('label','competition-field'),caption=element('span','',labelText),input=element('input');
  input.type=type;input.name=name;label.append(caption,input);return{label,input};
}

export function createCompetitionUI({api,onStart,trackId}){
  const dialog=document.getElementById('leaderboard-dialog'),table=dialog.querySelector('.future-board'),tbody=table.tBodies[0];
  const entry=element('section','competition-entry');entry.setAttribute('aria-label','Verified beta entry');
  const account=element('div','competition-account'),launch=element('div','competition-launch');
  account.append(element('span','competition-kicker','YOUR PLACE ON THE GRID'),element('h3','','Race under your own name.'));
  const connection=element('p','competition-hint','Connecting to the online beta…');account.append(connection);

  const signInForm=element('form','competition-form'),email=field('EMAIL ADDRESS','email','email'),send=button('SEND SIGN-IN LINK');
  email.input.autocomplete='email';email.input.required=true;email.input.maxLength=254;send.type='submit';
  signInForm.append(email.label,send);signInForm.hidden=true;account.append(signInForm);
  const emailNote=element('p','competition-hint','A secure link signs you in. Your email stays private.');emailNote.hidden=true;account.append(emailNote);
  const google=button('CONTINUE WITH GOOGLE','competition-button competition-google');google.hidden=true;account.insertBefore(google,signInForm);

  const signedIn=element('div','competition-identity'),identityText=element('span'),signOut=button('SIGN OUT','competition-text-button');
  signedIn.append(identityText,signOut);signedIn.hidden=true;account.append(signedIn);
  const profileForm=element('form','competition-form'),name=field('PUBLIC DRIVER NAME','text','driverName'),save=button('SAVE DRIVER NAME');
  name.input.autocomplete='nickname';name.input.required=true;name.input.minLength=3;name.input.maxLength=20;name.input.pattern='[A-Za-z0-9_-]{3,20}';
  const nameHint=element('p','competition-hint','3–20 letters, numbers, underscores or dashes. Your name appears on the leaderboard.');
  nameHint.id='competition-name-hint';name.input.setAttribute('aria-describedby',nameHint.id);save.type='submit';
  profileForm.append(name.label,save,nameHint);profileForm.hidden=true;account.append(profileForm);
  const entryStatus=element('p','competition-status');entryStatus.setAttribute('role','status');entryStatus.setAttribute('aria-live','polite');account.append(entryStatus);

  launch.append(element('span','competition-kicker','ORIGINAL CIRCUIT · BALANCED'),element('h3','','One clean flying lap.'));
  const rules=element('p','competition-rules','Drive an outlap, then one timed lap. Stay within the circuit limits. Pausing, leaving the game or recovering ends the attempt.');
  const start=button('START VERIFIED BETA LAP','competition-start');start.disabled=true;
  const startHint=element('p','competition-hint','Sign in and choose a driver name to enter.');
  const best=element('div','competition-best'),bestLabel=element('span','competition-kicker','YOUR VERIFIED BETA BEST'),bestTime=element('strong','','--:--.---'),bestRank=element('span','competition-best-rank','No verified lap yet.');
  best.append(bestLabel,bestTime,bestRank);launch.append(rules,start,startHint,best);entry.append(account,launch);
  dialog.querySelector('.board-circuit').before(entry);

  const boardActions=element('div','competition-board-actions'),boardState=element('p','','Loading global standings…'),refreshButton=button('REFRESH STANDINGS','competition-text-button');
  boardState.setAttribute('role','status');boardState.setAttribute('aria-live','polite');boardActions.append(boardState,refreshButton);dialog.querySelector('.board-table-wrap').before(boardActions);
  dialog.querySelector('.board-status').textContent='BETA / PRIZES NOT ACTIVE';
  table.caption.textContent='Verified beta fastest lap standings';
  dialog.querySelector('.board-circuit>span:first-child').textContent='VERIFIED BETA · FASTEST LAP';
  dialog.querySelector('.board-intro p').textContent='Set a verified lap. Find your place on the grid.';
  dialog.querySelector('.board-footer-note').textContent='Beta standings do not award prizes. Verified beta laps and browser-only practice records are separate. Equal tick times share a rank.';
  const menuTag=document.querySelector('#leaderboard-menu .menu-soon');if(menuTag)menuTag.textContent='BETA';

  let enabled=false,signed=false,profile=null,pending=false,generation=0,lastEmail=null,attemptMessage='',dirtyName=false;
  function message(text,isError=false){entryStatus.textContent=text;entryStatus.dataset.error=String(isError)}
  function controls(){
    google.disabled=send.disabled=save.disabled=signOut.disabled=pending||!enabled;
    email.input.disabled=name.input.disabled=pending||!enabled;
    refreshButton.disabled=pending;
    start.disabled=pending||!enabled||!signed||!profile||trackId!==ORIGINAL_TRACK;
    startHint.textContent=trackId!==ORIGINAL_TRACK?'Choose the Original map in Race Setup to enter a verified beta lap.':!enabled?'Online beta is unavailable. You can still practice below.':!signed?'Sign in and choose a driver name to enter.':!profile?'Save your public driver name to enter.':'Your lap is replayed on the server before it can enter the beta standings.';
  }
  function emptyBoard(title,copy){
    const row=element('tr'),cell=element('td'),empty=element('div','board-empty');cell.colSpan=4;
    empty.append(element('h3','',title),element('p','',copy));cell.append(empty);row.append(cell);tbody.replaceChildren(row);
  }
  function renderBoard(data){
    const entries=data?.entries;
    if(!Array.isArray(entries)||entries.some(e=>!Number.isInteger(e.rank)||e.rank<1||typeof e.driver!=='string'||!Number.isInteger(e.timeTicks)||e.timeTicks<=0))throw new Error('Standings could not be read. Please refresh.');
    if(!entries.length){emptyBoard('The grid is waiting.','No verified beta laps yet. Set the first clean flying lap.');boardState.textContent='No verified beta laps yet.';return}
    const fastest=Math.min(...entries.map(e=>e.timeTicks)),rows=[];
    for(const item of entries.slice(0,50)){
      const row=element('tr','competition-result-row');if(item.rank<=3)row.classList.add('competition-podium');
      const rank=element('td','competition-rank',String(item.rank).padStart(2,'0')),driver=element('th','competition-driver',item.driver);driver.scope='row';
      const time=element('td','competition-time',tickTime(item.timeTicks)),gap=element('td','competition-gap',item.timeTicks===fastest?'LEADER':`+${((item.timeTicks-fastest)/120).toFixed(3)}`);
      row.append(rank,driver,time,gap);rows.push(row);
    }
    tbody.replaceChildren(...rows);boardState.textContent=`${Math.min(entries.length,50)} ${entries.length===1?'driver':'drivers'} · Best lap per driver · Top 50`;
  }
  async function refresh(){
    const request=++generation;refreshButton.disabled=true;
    try{
      const config=await api.ready();if(request!==generation)return false;
      enabled=!!config.enabled;
      if(!enabled){
        signed=false;profile=null;google.hidden=signInForm.hidden=emailNote.hidden=signedIn.hidden=profileForm.hidden=true;
        connection.textContent=config.reason||'Online beta is not configured on this host.';
        emptyBoard('Practice is open.','The online beta is unavailable right now. Your browser-only practice records are still available below.');boardState.textContent='Online beta unavailable.';return false;
      }
      const identity=await api.identity();if(request!==generation)return false;
      signed=!!identity.signedIn;
      if(lastEmail!==(identity.email||null)){profile=null;dirtyName=false;name.input.value='';attemptMessage='';message('');lastEmail=identity.email||null}
      google.hidden=signInForm.hidden=emailNote.hidden=signed;signedIn.hidden=profileForm.hidden=!signed;
      connection.textContent=signed?'SIGNED IN · VERIFIED BETA':'Sign in to save verified laps across devices.';
      identityText.textContent=identity.email||'Signed in';
      const [boardResult,meResult]=await Promise.allSettled([api.leaderboard(),signed?api.me():Promise.resolve(null)]);if(request!==generation)return false;
      if(boardResult.status==='fulfilled')renderBoard(boardResult.value);
      else{emptyBoard('Standings could not load.','Your result has not changed. Use Refresh standings to try again.');boardState.textContent=boardResult.reason?.message||'Standings unavailable.'}
      if(meResult.status==='fulfilled'){
        profile=meResult.value?.profile||null;
        if(!dirtyName)name.input.value=profile?.driverName||'';
        save.textContent=profile?'UPDATE DRIVER NAME':'SAVE DRIVER NAME';
        const personal=meResult.value?.best;bestTime.textContent=tickTime(personal?.timeTicks);
        bestRank.textContent=personal?`GLOBAL RANK ${personal.rank} · VERIFIED BETA`:signed?'No verified lap yet.':'Sign in to see your verified best.';
        if(!attemptMessage&&!pending)message(signed&&!profile?'Choose the driver name others will see.':'');
        return true;
      }else{profile=null;bestTime.textContent='--:--.---';bestRank.textContent='Verified best unavailable.';if(!attemptMessage)message(meResult.reason?.message||'Your profile could not load. Please refresh.',true);return false}
    }catch(error){
      if(request!==generation)return false;enabled=false;profile=null;connection.textContent='The online beta could not connect.';
      message(error.message||'Please try again.',true);emptyBoard('Connection interrupted.','Your practice records remain on this browser. Use Refresh standings to reconnect.');boardState.textContent='Could not connect.';
      return false;
    }finally{if(request===generation)controls()}
  }
  async function action(work,success){
    if(pending)return;pending=true;attemptMessage='';message('');controls();
    try{const succeeded=await work();if(success&&succeeded!==false)message(success)}catch(error){message(error.message||'Something went wrong. Please try again.',true)}
    finally{pending=false;controls()}
  }
  signInForm.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{send.textContent='SENDING LINK…';try{await api.sendSignInLink(email.input.value.trim())}finally{send.textContent='SEND SIGN-IN LINK'}},'Check your email for the sign-in link. Open it in this browser to finish signing in.')});
  google.addEventListener('click',()=>void action(async()=>{google.textContent='OPENING GOOGLE…';try{await api.signInWithGoogle()}finally{google.textContent='CONTINUE WITH GOOGLE'}}));
  name.input.addEventListener('input',()=>{dirtyName=true});
  profileForm.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{save.textContent='SAVING…';try{profile=await api.saveProfile(name.input.value.trim());dirtyName=false;return await refresh()}finally{save.textContent=profile?'UPDATE DRIVER NAME':'SAVE DRIVER NAME'}},'Driver name saved. Your next verified lap is ready.')});
  signOut.addEventListener('click',()=>void action(async()=>{++generation;await api.signOut();profile=null;signed=false;bestTime.textContent='--:--.---';await refresh()},'Signed out. Practice is still open.'));
  refreshButton.addEventListener('click',()=>void refresh());
  start.addEventListener('click',()=>{if(start.disabled)return;void action(async()=>{message('Preparing your verified beta attempt…');await onStart()})});
  api.onAuthChange(()=>setTimeout(()=>{if(dialog.open)void refresh()},0));
  controls();
  return{open:refresh,refresh,showAttemptStatus(text){attemptMessage=String(text||'');message(attemptMessage);if(dialog.open)void refresh()}};
}
