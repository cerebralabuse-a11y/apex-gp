import {RULESET,TRACK_ID} from './verification-core.js';

const errors={unauthorized:'Sign in with a confirmed email to save a lap.',unavailable:'Online timing is unavailable. You can still practice.'};
export function createCompetitionClient(){
  let configPromise,clientPromise,client,authSubscription;const listeners=new Set();
  const config=()=>configPromise??=fetch(new URL('competition-config.json',import.meta.url),{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error(errors.unavailable);return r.json()}).then(c=>{
    if(!c.enabled)return c;
    if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.supabaseUrl)||!c.publishableKey?.startsWith('sb_publishable_')||!c.apiUrl?.startsWith(c.supabaseUrl+'/functions/v1/'))throw new Error(errors.unavailable);
    if(!c.roomServerUrl&&['localhost','127.0.0.1','[::1]'].includes(location.hostname))c.roomServerUrl='http://127.0.0.1:8791';
    return c;
  }).catch(error=>{configPromise=null;throw error});
  async function ready(){
    const c=await config();if(!c.enabled)return c;
    clientPromise??=import('./vendor/supabase-client.js').then(async({createClient})=>{
      client=createClient(c.supabaseUrl,c.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'apex-gp-auth'}});
      authSubscription=client.auth.onAuthStateChange(()=>{for(const fn of listeners)setTimeout(fn,0)}).data.subscription;
      const {error}=await client.auth.getSession();if(error)throw error;return client;
    }).catch(error=>{authSubscription?.unsubscribe();client=null;clientPromise=null;throw error});
    await clientPromise;return c;
  }
  async function identity(){await ready();if(!client)return{signedIn:false};const {data}=await client.auth.getSession();return{signedIn:!!data.session,email:data.session?.user?.email}}
  function redirectUrl(){const url=new URL(location.pathname,location.origin);url.searchParams.set('auth','callback');const room=new URLSearchParams(location.search).get('room');if(/^[A-Z2-9]{8}$/.test(room||''))url.searchParams.set('room',room);return url.href}
  async function getAccessToken(){await ready();if(!client)throw new Error(errors.unavailable);const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error(errors.unauthorized);return data.session.access_token}
  async function request(path,{method='GET',body,auth=false}={}){
    const c=await config();if(!c.enabled)throw new Error(errors.unavailable);
    const headers={apikey:c.publishableKey};
    if(auth){await ready();const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error(errors.unauthorized);headers.Authorization='Bearer '+data.session.access_token}
    if(body)headers['Content-Type']='application/json';
    const response=await fetch(c.apiUrl+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
    const value=await response.json();if(!response.ok)throw new Error(value.message||errors[value.error]||errors.unavailable);return value;
  }
  return{
    ready,identity,getAccessToken,
    onAuthChange(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    async sendSignInLink(email){await ready();if(!client)throw new Error(errors.unavailable);const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectUrl()}});if(error)throw new Error(error.message)},
    async signInWithGoogle(){await ready();if(!client)throw new Error(errors.unavailable);const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectUrl()}});if(error)throw new Error(error.message)},
    async signOut(){await ready();if(client){const {error}=await client.auth.signOut();if(error)throw new Error(error.message)}},
    status:()=>request('/status'),leaderboard:()=>request('/leaderboard'),me:()=>request('/me',{auth:true}),
    saveProfile:driverName=>request('/profile',{method:'PUT',body:{driverName},auth:true}),
    startAttempt:()=>request('/attempts',{method:'POST',body:{ruleset:RULESET,trackId:TRACK_ID},auth:true}),
    submit:(attemptId,recording)=>request('/attempts/'+encodeURIComponent(attemptId)+'/submit',{method:'POST',body:{recording},auth:true}),
    dispose(){authSubscription?.unsubscribe();listeners.clear()}
  };
}
