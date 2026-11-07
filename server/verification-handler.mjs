import {RULESET,VerificationError,verifyRecording} from '../dist/verification-core.js';
import {verificationTrack} from '../dist/verification-track.js';

const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'};
export const verificationResponse=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{...HEADERS,...headers}});

class BodyError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code}
}

async function readJson(request,maxBytes){
  const length=request.headers.get('content-length');
  if(length!==null){
    if(!/^\d+$/.test(length))throw new BodyError(400,'invalid_content_length');
    if(Number(length)>maxBytes)throw new BodyError(413,'recording_too_large');
  }
  if(!request.body)throw new BodyError(400,'empty_recording');
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new BodyError(413,'recording_too_large')}
      chunks.push(value);
    }
  }catch(error){if(error instanceof BodyError)throw error;throw new BodyError(400,'invalid_request_body')}
  finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new BodyError(400,'invalid_utf8')}
  try{return JSON.parse(text)}catch{throw new BodyError(400,'invalid_json')}
}

// Physics-feasibility lab only. The caller must restrict this to loopback or
// authenticate it. This in-isolate limit is not a production abuse control.
export function createVerificationHandler({track=verificationTrack,verify=verifyRecording,now=Date.now,maxBytes=1024*1024,requestsPerMinute=30}={}){
  let windowStart=now(),requests=0;
  return async function handle(request){
    const url=new URL(request.url),path=url.pathname;
    if(path!=='/api/verification/status'&&path!=='/api/verification/replay')return verificationResponse(404,{error:'not_found'});
    const origin=request.headers.get('origin');
    if(origin!==null&&origin!==url.origin)return verificationResponse(403,{error:'cross_origin_denied'});
    const method=path.endsWith('/status')?'GET':'POST';
    if(request.method!==method)return verificationResponse(405,{error:'method_not_allowed'},{allow:method});
    if(method==='GET')return verificationResponse(200,{enabled:true,ranked:false,ruleset:RULESET,mode:'physics-feasibility-lab'});
    const time=now();
    if(time-windowStart>=60000||time<windowStart){windowStart=time;requests=0}
    if(requests>=requestsPerMinute)return verificationResponse(429,{error:'lab_rate_limit'},{'retry-after':String(Math.max(1,Math.ceil((60000-(time-windowStart))/1000)))});
    requests++;
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return verificationResponse(415,{error:'json_required'});
    const encoding=request.headers.get('content-encoding');
    if(encoding&&encoding.toLowerCase()!=='identity')return verificationResponse(415,{error:'unsupported_content_encoding'});
    let recording;
    try{recording=await readJson(request,maxBytes)}catch(error){return verificationResponse(error.status||400,{error:error.code||'invalid_request_body'})}
    try{
      const result=await verify(track,recording);
      return verificationResponse(200,{status:'physics-valid',ranked:false,ruleset:RULESET,result});
    }catch(error){
      if(error instanceof VerificationError)return verificationResponse(422,{error:'invalid_recording',reason:error.message});
      return verificationResponse(500,{error:'verification_unavailable'});
    }
  };
}
