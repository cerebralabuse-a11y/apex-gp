import {readJson} from './verification-handler.mjs';
import {RULESET,TRACK_ID,TICK_HZ,MAX_TICKS,VerificationError,verifyRecording} from '../dist/verification-core.js';
import {verificationTrack} from '../dist/verification-track.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages={
  profile_required:'Choose a driver name before starting.', name_taken:'That driver name is already taken.', invalid_driver_name:'Use 3–20 letters, numbers, underscores or hyphens.',
  rate_limited:'Too many attempts. Please wait before starting another.', attempt_not_found:'Attempt not found for this player.', attempt_expired:'This attempt expired. Start a new lap.',
  attempt_too_early:'The recording finished faster than real time. Try again after the lap duration has elapsed.', attempt_in_progress:'Verification is already running. Retry in a minute.',
  attempt_used:'This attempt has already been used.', replay_duplicate:'This exact recording has already been submitted.', unsupported_ruleset:'This game version is no longer accepted.',
  unauthorized:'Sign in with a confirmed email to save a lap.', invalid_request:'The request format is invalid.', unavailable:'Online timing is temporarily unavailable. Your practice game is still available.'
};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
class ApiError extends Error{constructor(status,code){super(messages[code]||messages.unavailable);this.status=status;this.code=code}}

// No SDK or credentials travel with the game replay code. Server keys stay in
// the function environment, and every mutation derives identity from Auth.
export function createCompetitionHandler({supabaseUrl,publishableKey,secretKey,allowedOrigins=[],fetcher=fetch,now=Date.now,authenticate,rpc,verify=verifyRecording}={}){
  let boardCache=null;
  const configured=Boolean(supabaseUrl&&publishableKey&&secretKey)||Boolean(authenticate&&rpc);
  rpc??=async(name,args)=>{
    const response=await fetcher(supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:secretKey,'Content-Type':'application/json',...(secretKey.startsWith('eyJ')?{Authorization:'Bearer '+secretKey}:{})},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
    const value=await response.json();
    if(!response.ok){const code=value.code==='P0001'?value.message:null;throw new ApiError(code&&messages[code]?(code==='rate_limited'?429:409):503,code&&messages[code]?code:'unavailable')}
    return value;
  };
  authenticate??=async request=>{
    const header=request.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9_.-]{20,16384}$/.test(header))throw new ApiError(401,'unauthorized');
    const response=await fetcher(supabaseUrl+'/auth/v1/user',{headers:{apikey:publishableKey,Authorization:header},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new ApiError(response.status>=500?503:401,response.status>=500?'unavailable':'unauthorized');
    const user=await response.json();
    if(!UUID.test(user.id)||user.is_anonymous===true||!user.email||!user.email_confirmed_at)throw new ApiError(401,'unauthorized');
    return user.id;
  };
  return async request=>{
    const origin=request.headers.get('origin'),allowed=origin!==null&&allowedOrigins.includes(origin);
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin',...(allowed?{'Access-Control-Allow-Origin':origin}:{})};
    const respond=(status,data,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
    if(origin!==null&&!allowed)return respond(403,{error:'cross_origin_denied',message:'This game origin is not enabled for online timing.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'}});
    const path=new URL(request.url).pathname.replace(/\/$/,''),submit=/^\/api\/competition\/attempts\/([0-9a-f-]{36})\/submit$/i.exec(path);
    if(!path.startsWith('/api/competition/'))return respond(404,{error:'not_found'});
    const route=path.slice('/api/competition'.length);
    const method=route==='/profile'?'PUT':route==='/attempts'||submit?'POST':'GET';
    if(!['/status','/leaderboard','/me','/profile','/attempts'].includes(route)&&!submit)return respond(404,{error:'not_found'});
    if(request.method!==method)return respond(405,{error:'method_not_allowed'},{Allow:method});
    if(route==='/status')return respond(200,{enabled:configured,beta:true,prizeEligible:false,ruleset:RULESET,trackId:TRACK_ID,tickHz:TICK_HZ,maxSeconds:MAX_TICKS/TICK_HZ});
    if(!configured)return respond(503,{error:'unavailable',message:messages.unavailable});
    try{
      if(route==='/leaderboard'){
        if(!boardCache||now()-boardCache.time>15000)boardCache={time:now(),data:await rpc('apex_leaderboard',{})};
        return respond(200,{...boardCache.data,beta:true,prizeEligible:false},{'Cache-Control':'public, max-age=15'});
      }
      const userId=await authenticate(request);
      if(!UUID.test(userId))throw new ApiError(401,'unauthorized');
      if(route==='/me')return respond(200,await rpc('apex_profile_get',{p_user_id:userId}));
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||request.headers.has('content-encoding'))return respond(415,{error:'json_required',message:'Send an uncompressed JSON request.'});
      const body=await readJson(request,submit?1024*1024:1024);
      if(route==='/profile'){
        if(!exact(body,['driverName'])||typeof body.driverName!=='string'||!/^[A-Za-z0-9_-]{3,20}$/.test(body.driverName))throw new ApiError(400,'invalid_driver_name');
        const profile=await rpc('apex_profile_set',{p_user_id:userId,p_driver_name:body.driverName});boardCache=null;return respond(200,profile);
      }
      if(route==='/attempts'){
        if(!exact(body,['ruleset','trackId'])||body.ruleset!==RULESET||body.trackId!==TRACK_ID)throw new ApiError(400,'unsupported_ruleset');
        return respond(201,await rpc('apex_begin_attempt',{p_user_id:userId,p_ruleset:RULESET,p_track_id:TRACK_ID}));
      }
      if(!UUID.test(submit[1])||!exact(body,['recording']))throw new ApiError(400,'invalid_request');
      const recording=body.recording;
      if(!exact(recording,['version','ruleset','trackId','frames'])||recording.version!==1||recording.ruleset!==RULESET||recording.trackId!==TRACK_ID||!Array.isArray(recording.frames)||recording.frames.length<1||recording.frames.length>MAX_TICKS)throw new ApiError(400,'invalid_request');
      // Canonical field order prevents key-order changes from bypassing the
      // global duplicate-recording hash. Encoded controls have fixed integers.
      const bytes=new TextEncoder().encode(JSON.stringify({version:1,ruleset:RULESET,trackId:TRACK_ID,frames:recording.frames}));
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      const identity={p_user_id:userId,p_attempt_id:submit[1],p_recording_hash:hash};
      const claim=await rpc('apex_claim_attempt',{...identity,p_total_ticks:recording.frames.length});
      if(claim.state==='accepted')return respond(200,claim.receipt);
      if(claim.state!=='claimed')throw new ApiError(409,'attempt_in_progress');
      let result;
      try{result=await verify(verificationTrack,recording)}catch(error){
        if(!(error instanceof VerificationError))throw error;
        await rpc('apex_finish_attempt',{...identity,p_result:null,p_rejection:'invalid_recording'});
        return respond(422,{error:'invalid_recording',message:error.message,prizeEligible:false});
      }
      try{
        const receipt=await rpc('apex_finish_attempt',{...identity,p_result:result,p_rejection:null});boardCache=null;return respond(200,receipt);
      }catch(error){
        if(error.code==='replay_duplicate')await rpc('apex_finish_attempt',{...identity,p_result:null,p_rejection:'replay_duplicate'});
        throw error;
      }
    }catch(error){
      const status=error.status||503,code=error.code||'unavailable';
      return respond(status,{error:code,message:error instanceof ApiError?error.message:(error.status?messages.invalid_request:messages.unavailable)},status===429?{'Retry-After':'60'}:{});
    }
  };
}
