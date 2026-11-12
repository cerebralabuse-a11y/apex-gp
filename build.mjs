import {copyFile,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2020',outfile:'dist/vendor/supabase-client.js',legalComments:'eof'});
await copyFile('node_modules/@supabase/supabase-js/LICENSE','dist/vendor/SUPABASE-LICENSE.txt');

const sdk=new URL(import.meta.resolve('@vercel/analytics'));
await copyFile(sdk,'dist/vendor/vercel-analytics.js');
await copyFile(new URL('../LICENSE',sdk),'dist/vendor/VERCEL-ANALYTICS-LICENSE.txt');
const competitionConfig=JSON.parse(await readFile('dist/competition-config.json','utf8'));
const roomServerUrl=(process.env.APEX_ROOMS_URL||competitionConfig.roomServerUrl||'').trim();
if(roomServerUrl){
  const url=new URL(roomServerUrl);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.pathname!=='/'||url.search||url.hash)throw new Error('APEX_ROOMS_URL must be an HTTPS workers.dev origin.');
}
competitionConfig.roomServerUrl=roomServerUrl;
await writeFile('dist/competition-config.json',JSON.stringify(competitionConfig,null,2)+'\n');
const config=process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG||'';
await writeFile('dist/analytics.js',`import {inject} from './vendor/vercel-analytics.js';\n// Vercel supplies the collection endpoints; local and Sites builds do not collect.\n${process.env.VERCEL==='1'?`inject({mode:'production'},${JSON.stringify(config)});`:'// Analytics disabled outside Vercel.'}\n`);
console.log(`Static game ready; Vercel Analytics ${process.env.VERCEL==='1'?'enabled':'disabled on this host'}.`);

