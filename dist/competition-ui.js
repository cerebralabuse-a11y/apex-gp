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

export function createCompetitionUI({api,onStart,onResumeRanked,trackId,onAccount}){
  const dialog=document.getElementById('leaderboard-dialog'),table=dialog.querySelector('.future-board'),tbody=table.tBodies[0];
  const profileDialog=document.getElementById('profile-dialog');
  const playerAccount=document.getElementById('player-account'),playerAccountLabel=document.getElementById('player-account-label');
  const rankedButton=document.getElementById('ranked-race-button');
  const entry=element('section','competition-entry');entry.setAttribute('aria-label','Verified beta entry');
  const account=element('div','competition-account');
  account.append(element('span','competition-kicker','YOUR DRIVER PROFILE'));
  const accountHeading=element('h3','','Choose your driver name.');account.append(accountHeading);
  const connection=element('p','competition-hint','Connecting to the online beta…');account.append(connection);

  const signInForm=element('form','competition-form'),email=field('EMAIL ADDRESS','email','email'),send=button('SEND SIGN-IN LINK');
  email.input.autocomplete='email';email.input.required=true;email.input.maxLength=254;send.type='submit';
  signInForm.append(email.label,send);signInForm.hidden=true;account.append(signInForm);
  const emailNote=element('p','competition-hint','A secure link signs you in. Your email stays private.');emailNote.hidden=true;account.append(emailNote);
  const google=button('CONTINUE WITH GOOGLE','competition-button competition-google');google.hidden=true;account.insertBefore(google,signInForm);

  const signedIn=element('div','competition-identity'),identityText=element('span'),signOut=button('SIGN OUT','competition-text-button');
  signedIn.append(identityText,signOut);signedIn.hidden=true;account.append(signedIn);
  const profileForm=element('form','competition-form'),name=field('PUBLIC DRIVER NAME','text','driverName'),suggest=button('SUGGEST A NAME','competition-text-button'),save=button('CONFIRM PERMANENT NAME');
  name.input.autocomplete='nickname';name.input.required=true;name.input.minLength=3;name.input.maxLength=20;name.input.pattern='[A-Za-z0-9_-]{3,20}';
  suggest.type='button';
  const nameHint=element('p','competition-hint','3–20 letters, numbers, underscores or dashes. Confirming locks it permanently. If a suggestion is taken, generate another.');
  nameHint.id='competition-name-hint';name.input.setAttribute('aria-describedby',nameHint.id);save.type='submit';
  profileForm.append(name.label,suggest,save,nameHint);profileForm.hidden=true;account.append(profileForm);
  const lockedName=element('div','competition-name-locked');lockedName.hidden=true;
  lockedName.append(element('span','competition-kicker','YOUR PERMANENT DRIVER NAME'),element('strong'),element('small','','This name is locked and appears on the leaderboard.'));
  account.append(lockedName);
  const entryStatus=element('p','competition-status');entryStatus.setAttribute('role','status');entryStatus.setAttribute('aria-live','polite');account.append(entryStatus);

  const best=element('div','competition-best'),bestLabel=element('span','competition-kicker','YOUR VERIFIED BETA BEST'),bestTime=element('strong','','--:--.---'),bestRank=element('span','competition-best-rank','No verified lap yet.');
  best.append(bestLabel,bestTime,bestRank);account.append(best);entry.append(account);
  profileDialog.querySelector('.profile-content').append(entry);

  const boardActions=element('div','competition-board-actions'),boardState=element('p','','Loading global standings…'),boardStats=element('div','competition-board-stats'),refreshButton=button('REFRESH STANDINGS','competition-text-button');
  boardState.setAttribute('role','status');boardState.setAttribute('aria-live','polite');boardActions.append(boardState,boardStats,refreshButton);dialog.querySelector('.board-table-wrap').before(boardActions);
  dialog.querySelector('.board-status').textContent='BETA / PRIZES NOT ACTIVE';
  table.caption.textContent='Verified beta fastest lap standings';
  dialog.querySelector('.board-circuit>span:first-child').textContent='VERIFIED BETA · FASTEST LAP';
  dialog.querySelector('.board-intro p').textContent='Set a verified lap. Find your place on the grid.';
  dialog.querySelector('.board-footer-note').textContent='Beta standings do not award prizes. Verified beta laps and browser-only practice records are separate. Equal tick times share a rank.';
  const menuTag=document.querySelector('#leaderboard-menu .menu-soon');if(menuTag)menuTag.textContent='BETA';

  const resumeRankedKey='apex-resume-ranked',authCallback=new URLSearchParams(location.search).get('auth')==='callback';
  let resumeRanked=false;
  try{resumeRanked=authCallback&&sessionStorage.getItem(resumeRankedKey)==='1';if(!authCallback)sessionStorage.removeItem(resumeRankedKey)}catch{}
  function clearRankedResume(){resumeRanked=false;try{sessionStorage.removeItem(resumeRankedKey)}catch{}}
  function continueRanked(){if(!resumeRanked||!profile)return;clearRankedResume();onResumeRanked?.()}
  let enabled=false,signed=false,profile=null,pending=false,generation=0,lastEmail=null,attemptMessage='',dirtyName=false;
  function message(text,isError=false){entryStatus.textContent=text;entryStatus.dataset.error=String(isError)}
  function suggestedDriverName(){return `Racer-${crypto.randomUUID().slice(0,8).toUpperCase()}`}
  function renderPlayerAccount(name,isSignedIn=signed){
    playerAccountLabel.textContent=isSignedIn?(name||'PROFILE'):'SIGN IN WITH GOOGLE';
    playerAccount.querySelector('.account-mark').innerHTML=isSignedIn?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-4.1 3.2-6.3 7.5-6.3s7 2.2 7.5 6.3z"/></svg>':'<svg viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.5-5c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4h-6.7v5.2C9.3 39.6 16 44 24 44z"/><path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18z"/><path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4 16 4 9.3 8.4 5.9 15l6.7 5.2c1.6-4.8 6.1-8.4 11.4-8.4z"/></svg>';
    const mobileDriver=document.getElementById('mobile-driver');
    mobileDriver.textContent=name||'';mobileDriver.hidden=!isSignedIn;
    playerAccount.setAttribute('aria-label',name?`Signed in as ${name}. Open account settings.`:'Sign in with Google');
    playerAccount.title=name?`Signed in as ${name}. Open account settings.`:'Sign in with Google';
    playerAccount.classList.toggle('is-signed-in',isSignedIn);
    playerAccount.querySelector('.account-arrow').textContent=isSignedIn?'⌄':'↗';
  }
  let accountGeneration=0,accountBusy=false;
  async function refreshPlayerAccount(){
    const request=++accountGeneration;
    try{
      const config=await api.ready();if(request!==accountGeneration)return;
      enabled=!!config.enabled;playerAccount.disabled=!enabled;controls();
      if(!config.enabled){signed=false;profile=null;renderPlayerAccount('ONLINE SIGN-IN UNAVAILABLE',false);return}
      const identity=await api.identity();if(request!==accountGeneration)return;
      signed=!!identity.signedIn;
      const fallback=identity.signedIn?(identity.email?.split('@')[0]||'SIGNED IN'):'';
      renderPlayerAccount(fallback,signed);
      if(identity.signedIn){
        try{const me=await api.me();if(request===accountGeneration){
          profile=me?.profile||null;renderPlayerAccount(profile?.driverName||fallback,true);
          google.hidden=signInForm.hidden=emailNote.hidden=true;identityText.textContent=identity.email||'Signed in';signedIn.hidden=false;
          profileForm.hidden=!!profile;lockedName.hidden=!profile;
          accountHeading.textContent=profile?'Your identity is locked.':'Choose your driver name.';
          if(profile)lockedName.querySelector('strong').textContent=profile.driverName;
          else if(!dirtyName&&!name.input.value)name.input.value=suggestedDriverName();
          if(!profile&&!profileDialog.open){onAccount?.();setTimeout(()=>name.input.focus({preventScroll:true}),0)}else continueRanked();
        }}catch{}
      }else{
        profile=null;google.hidden=signInForm.hidden=emailNote.hidden=false;signedIn.hidden=true;profileForm.hidden=true;lockedName.hidden=true;
      }
    }catch{if(request===accountGeneration){playerAccount.disabled=false;renderPlayerAccount('SIGN IN WITH GOOGLE',false)}}
  }
  function controls(){
    google.disabled=send.disabled=save.disabled=signOut.disabled=pending||!enabled;
    rankedButton.disabled=pending;
    email.input.disabled=name.input.disabled=suggest.disabled=pending||!enabled;
    refreshButton.disabled=pending;
  }
  function emptyBoard(title,copy){
    const row=element('tr'),cell=element('td'),empty=element('div','board-empty');cell.colSpan=4;
    empty.append(element('h3','',title),element('p','',copy));cell.append(empty);row.append(cell);tbody.replaceChildren(row);
  }
  function renderBoard(data){
    const entries=data?.entries;
    if(!Array.isArray(entries)||entries.some(e=>!Number.isInteger(e.rank)||e.rank<1||typeof e.driver!=='string'||!Number.isInteger(e.timeTicks)||e.timeTicks<=0))throw new Error('Standings could not be read. Please refresh.');
    if(!entries.length){emptyBoard('The grid is waiting.','No verified beta laps yet. Set the first clean lap.');boardState.textContent='No verified beta laps yet.';boardStats.textContent='0 DRIVERS · NO LAP YET';return}
    const fastest=Math.min(...entries.map(e=>e.timeTicks)),average=Math.round(entries.reduce((sum,e)=>sum+e.timeTicks,0)/entries.length),rows=[];
    for(const item of entries){
      const row=element('tr','competition-result-row');if(item.rank<=3)row.classList.add('competition-podium');
      const rank=element('td','competition-rank',String(item.rank).padStart(2,'0')),driver=element('th','competition-driver',item.driver);driver.scope='row';
      const time=element('td','competition-time',tickTime(item.timeTicks)),gap=element('td','competition-gap',item.timeTicks===fastest?'LEADER':`+${((item.timeTicks-fastest)/120).toFixed(3)}`);
      row.append(rank,driver,time,gap);rows.push(row);
    }
    tbody.replaceChildren(...rows);boardState.textContent=`${entries.length} ${entries.length===1?'driver':'drivers'} · All verified standings`;boardStats.textContent=`${entries.length} DRIVERS · FASTEST ${tickTime(fastest)} · AVG ${tickTime(average)}`;
  }
  async function refresh(){
    const request=++generation;refreshButton.disabled=true;
    try{
      const config=await api.ready();if(request!==generation)return false;
      enabled=!!config.enabled;
      if(!enabled){
        signed=false;profile=null;google.hidden=signInForm.hidden=emailNote.hidden=signedIn.hidden=profileForm.hidden=true;
        renderPlayerAccount('ONLINE SIGN-IN UNAVAILABLE',false);playerAccount.disabled=true;
        connection.textContent=config.reason||'Online beta is not configured on this host.';
        emptyBoard('Practice is open.','The online beta is unavailable right now. Your browser-only practice records are still available below.');boardState.textContent='Online beta unavailable.';boardStats.textContent='STANDINGS UNAVAILABLE';return false;
      }
      const identity=await api.identity();if(request!==generation)return false;
      signed=!!identity.signedIn;
      renderPlayerAccount(signed?(identity.email?.split('@')[0]||'SIGNED IN'):'');
      if(lastEmail!==(identity.email||null)){profile=null;dirtyName=false;name.input.value='';attemptMessage='';message('');lastEmail=identity.email||null}
      google.hidden=signInForm.hidden=emailNote.hidden=signed;signedIn.hidden=!signed;
      if(signed){identityText.textContent=identity.email||'Signed in'}
      connection.textContent=signed?'SIGNED IN · VERIFIED BETA':'Sign in to save verified laps across devices.';
      identityText.textContent=identity.email||'Signed in';
      const [boardResult,meResult]=await Promise.allSettled([api.leaderboard(),signed?api.me():Promise.resolve(null)]);if(request!==generation)return false;
      if(boardResult.status==='fulfilled')renderBoard(boardResult.value);
      else{emptyBoard('Standings could not load.','Your result has not changed. Use Refresh standings to try again.');boardState.textContent=boardResult.reason?.message||'Standings unavailable.';boardStats.textContent='STANDINGS UNAVAILABLE'}
      if(meResult.status==='fulfilled'){
        profile=meResult.value?.profile||null;
        renderPlayerAccount(signed?(profile?.driverName||identity.email?.split('@')[0]||'SIGNED IN'):'');
        profileForm.hidden=!signed||!!profile;lockedName.hidden=!signed||!profile;
        if(profile)lockedName.querySelector('strong').textContent=profile.driverName;
        if(!dirtyName&&!profile&&!name.input.value)name.input.value=suggestedDriverName();
        if(signed&&!profile&&!profileDialog.open){onAccount?.();setTimeout(()=>name.input.focus({preventScroll:true}),0)}else continueRanked();
        const personal=meResult.value?.best;bestTime.textContent=tickTime(personal?.timeTicks);
        bestRank.textContent=personal?`GLOBAL RANK ${personal.rank} · VERIFIED BETA`:signed?'No verified lap yet.':'Sign in to see your verified best.';
        if(!attemptMessage&&!pending)message(signed&&!profile?'Choose the driver name others will see.':'');
        return true;
      }else{profile=null;bestTime.textContent='--:--.---';bestRank.textContent='Verified best unavailable.';if(!attemptMessage)message(meResult.reason?.message||'Your profile could not load. Please refresh.',true);return false}
    }catch(error){
      if(request!==generation)return false;enabled=false;profile=null;connection.textContent='The online beta could not connect.';
      message(error.message||'Please try again.',true);emptyBoard('Connection interrupted.','Your practice records remain on this browser. Use Refresh standings to reconnect.');boardState.textContent='Could not connect.';boardStats.textContent='STANDINGS OFFLINE';
      return false;
    }finally{if(request===generation)controls()}
  }
  async function action(work,success){
    if(pending)return;pending=true;attemptMessage='';message('');controls();
    try{const succeeded=await work();if(success&&succeeded!==false)message(success)}catch(error){message(error.message||'Something went wrong. Please try again.',true)}
    finally{pending=false;controls()}
  }
  function showAttemptStatus(text){attemptMessage=String(text||'');message(attemptMessage);if(dialog.open)void refresh()}
  signInForm.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{send.textContent='SENDING LINK…';try{await api.sendSignInLink(email.input.value.trim())}finally{send.textContent='SEND SIGN-IN LINK'}},'Check your email for the sign-in link. Open it in this browser to finish signing in.')});
  playerAccount.addEventListener('click',async()=>{
    if(accountBusy)return;
    if(signed){onAccount?.();return}
    accountBusy=true;playerAccount.disabled=true;playerAccountLabel.textContent='OPENING GOOGLE…';
    try{await api.ready();await api.signInWithGoogle()}
    catch(error){showAttemptStatus(error.message||'Google sign-in could not start.');onAccount?.()}
    finally{accountBusy=false;playerAccount.disabled=false;void refreshPlayerAccount()}
  });
  google.addEventListener('click',()=>void action(async()=>{google.textContent='OPENING GOOGLE…';try{await api.signInWithGoogle()}finally{google.textContent='CONTINUE WITH GOOGLE'}}));
  suggest.addEventListener('click',()=>{name.input.value=suggestedDriverName();dirtyName=true;name.input.focus()});
  name.input.addEventListener('input',()=>{dirtyName=true});
  profileForm.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{save.textContent='LOCKING NAME…';try{profile=await api.saveProfile(name.input.value.trim());dirtyName=false;const saved=await refresh();if(saved){profileDialog.close();continueRanked()}return saved}finally{save.textContent='CONFIRM PERMANENT NAME'}},'Permanent driver name saved. Your next verified lap is ready.')});
  signOut.addEventListener('click',()=>void action(async()=>{++generation;await api.signOut();profile=null;signed=false;bestTime.textContent='--:--.---';await refresh()},'Signed out. Practice is still open.'));
  refreshButton.addEventListener('click',()=>void refresh());
  async function startRanked(){
    if(pending)return;
    const status=document.getElementById('ranked-race-status');
    if(trackId!==ORIGINAL_TRACK){status.textContent='Choose the Original map in Race Setup for ranked laps.';return}
    status.textContent='Checking your ranked entry…';status.classList.add('is-loading');status.setAttribute('aria-busy','true');pending=true;controls();
    try{
      const ready=await refresh();
      if(!ready||!enabled)throw new Error('Online ranking is unavailable. Please try again.');
      if(!signed||!profile){resumeRanked=true;try{sessionStorage.setItem(resumeRankedKey,'1')}catch{};onAccount?.();return}
      clearRankedResume();
      status.textContent='Preparing your verified lap…';
      await onStart();
    }catch(error){status.textContent=error.message||'Could not start the ranked lap.'}
    finally{status.classList.remove('is-loading');status.removeAttribute('aria-busy');pending=false;controls()}
  }
  api.onAuthChange(()=>setTimeout(()=>{void refreshPlayerAccount();if(dialog.open)void refresh()},0));
  controls();
  void refreshPlayerAccount();
  return{open:refresh,refresh,refreshPlayerAccount,showAttemptStatus,startRanked,openProfile:refreshPlayerAccount};
}

