import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RULESET} from '../dist/verification-core.js';
const root=new URL('../',import.meta.url),path=new URL('verification-manifest.json',root);
const files={};
for(const name of ['dist/physics.js','dist/vehicle-setup.js','dist/verification-core.js','dist/verification-track.js'])files[name]=createHash('sha256').update((await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n')).digest('hex');
const current={ruleset:RULESET,files};let saved;
try{saved=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(process.argv.includes('--update')){
  if(saved?.ruleset===RULESET&&JSON.stringify(saved)!==JSON.stringify(current))throw new Error('Bump the verification RULESET before freezing changed race logic.');
  await writeFile(path,JSON.stringify(current,null,2)+'\n');console.log('Frozen verification ruleset '+RULESET);
}else{
  if(JSON.stringify(saved)!==JSON.stringify(current))throw new Error('Verification logic changed. Issue a new RULESET and run node scripts/check-verification.mjs --update.');
  console.log('Verification ruleset hashes match.');
}
