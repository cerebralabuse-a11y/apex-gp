import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {createVerificationHandler} from './server/verification-handler.mjs';
const root = resolve('dist');
const labRoot=resolve('verification-lab'),verify=createVerificationHandler();
const port = Number(process.env.PORT || 4173);
const localNames=['127.0.0.1','localhost','[::1]'];
function readLabBody(req,res){return new Promise(resolve=>{let size=0,done=false;const chunks=[];req.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>1024*1024){done=true;res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"error":"recording_too_large"}');resolve(null);return}chunks.push(chunk)});req.on('end',()=>{if(!done){done=true;resolve(Buffer.concat(chunks))}});req.on('error',()=>{if(!done){done=true;resolve(null)}})})}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
createServer(async (req, res) => {
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/verification/')){
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403).end();return}
      const base=`http://${req.headers.host||'localhost:'+port}`,url=new URL(req.url,base),worker=url.pathname==='/api/verification/worker';
      if(!localNames.includes(url.hostname)){res.writeHead(403).end();return}
      const body=['GET','HEAD'].includes(req.method)?null:await readLabBody(req,res);if(body===null&&!['GET','HEAD'].includes(req.method))return;
      const request=new Request(new URL(worker?'/api/verification/replay':req.url,base),{method:req.method,headers:req.headers,...(body?{body}: {})});
      let response=await verify(request);
      if(worker&&response.ok){
        try{response=await fetch('http://127.0.0.1:8790/api/verification/replay',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(10000)})}
        catch{response=Response.json({error:'Local Workers runtime is not running. Use npm run verifier:dev.'},{status:503})}
      }
      if(pathname==='/api/verification/status'&&response.ok){let workerAvailable=false;try{const r=await fetch('http://127.0.0.1:8790/api/verification/status',{signal:AbortSignal.timeout(500)});workerAvailable=r.ok&&(await r.json()).ranked===false}catch{}response=Response.json({...await response.json(),workerAvailable})}
      // fetch() may decompress the upstream body. Do not forward its transport
      // headers with decoded JSON; retain only application response headers.
      const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      for(const key of ['allow','retry-after','cross-origin-resource-policy'])if(response.headers.has(key))headers[key]=response.headers.get(key);
      res.writeHead(response.status,headers).end(await response.text());return;
    }
    const lab=pathname.startsWith('/verification/'),directory=lab?labRoot:root;
    if(lab&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403).end();return}
    if(lab&&!localNames.includes(new URL(req.url,`http://${req.headers.host||'localhost:'+port}`).hostname)){res.writeHead(403).end();return}
    const path = resolve(directory, '.' + decodeURIComponent(lab?pathname.slice('/verification'.length):pathname).replace(/\/$/, '/index.html'));
    if (!path.startsWith(directory + sep)) { res.writeHead(403).end(); return; }
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(file);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Local: http://localhost:${port}`));
