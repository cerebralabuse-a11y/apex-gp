// Local workerd entry for consistency tests. Production uses verification.mjs.
import {createVerificationHandler,verificationResponse} from '../server/verification-handler.mjs';
const handle=createVerificationHandler();
export default{fetch(request){
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname))return verificationResponse(403,{error:'Local verification lab only'});
  return handle(request);
}};
