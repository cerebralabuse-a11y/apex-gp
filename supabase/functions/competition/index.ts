import {createCompetitionHandler} from '../../../server/competition-handler.mjs';

// Supabase supplies these credentials to the backend; never copy them into dist.
const keys=(name:string)=>{try{return JSON.parse(Deno.env.get(name)||'{}')}catch{return {}}};
const handle=createCompetitionHandler({
  supabaseUrl:Deno.env.get('SUPABASE_URL'),
  publishableKey:keys('SUPABASE_PUBLISHABLE_KEYS').default||Deno.env.get('SUPABASE_ANON_KEY'),
  secretKey:keys('SUPABASE_SECRET_KEYS').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins:['https://apex-gp-kohl.vercel.app','http://127.0.0.1:5188','http://localhost:5188','http://127.0.0.1:4173','http://localhost:4173']
});
Deno.serve(request=>{
  const url=new URL(request.url),prefix='/competition',index=url.pathname.indexOf(prefix);
  url.pathname='/api/competition'+(index>=0?url.pathname.slice(index+prefix.length):'/status');
  return handle(new Request(url,request));
});
