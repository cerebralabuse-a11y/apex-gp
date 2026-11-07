import {createVerificationHandler,verificationResponse} from '../server/verification-handler.mjs';

async function tokenMatches(provided,expected){
  const encoder=new TextEncoder(),[a,b]=await Promise.all([provided,expected].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
  const left=new Uint8Array(a),right=new Uint8Array(b);let difference=0;
  for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
  return difference===0;
}

let handler;
export default {
  async fetch(request,env={}){
    // Never expose the CPU-consuming prototype by merely deploying this file.
    if(env.VERIFICATION_LAB_ENABLED!=='true')return verificationResponse(404,{error:'not_available'});
    const secret=env.VERIFICATION_LAB_TOKEN;
    if(typeof secret!=='string'||secret.length<32||secret.length>256)return verificationResponse(503,{error:'lab_not_configured'});
    const authorization=request.headers.get('authorization')||'';
    const token=/^Bearer /i.test(authorization)?authorization.slice(7):'';
    if(token.length<32||token.length>256||!await tokenMatches(token,secret))return verificationResponse(401,{error:'unauthorized'},{'www-authenticate':'Bearer'});
    handler??=createVerificationHandler();
    return handler(request);
  }
};
