import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createTcpServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

async function unusedPort(){
  const socket=createTcpServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;
}
function request(port,{path='/',method='GET',headers={},body}={}){
  return new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path,method,headers,agent:false},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    });
    req.once('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('Development-server request timed out')));
    if(body!==undefined)req.write(body);req.end();
  });
}

test('actual development-server adapter preserves verification trust boundaries and response headers',async t=>{
  const port=await unusedPort();
  const server=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(server.exitCode===null){server.kill();await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,2000).unref()})}});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Development server did not start')),5000);
    server.once('error',error=>{clearTimeout(timeout);reject(error)});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error('Development server exited before ready: '+code))});
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('Local:')){clearTimeout(timeout);resolve()}});
  });
  const game=await request(port);assert.equal(game.status,200);assert.match(game.body,/APEX GP/);
  assert.equal((await request(port,{path:'/verification/'})).status,200);
  const status=await request(port,{path:'/api/verification/status'});
  assert.equal(status.status,200);assert.equal(JSON.parse(status.body).ranked,false);assert.equal(status.headers['cache-control'],'no-store');
  assert.equal((await request(port,{path:'/api/verification/status',headers:{host:'attacker.example'}})).status,403);
  assert.equal((await request(port,{path:'/verification/',headers:{host:'attacker.example'}})).status,403);
  const crossOrigin=await request(port,{path:'/api/verification/replay',method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
  assert.equal(crossOrigin.status,403);
  const wrongMethod=await request(port,{path:'/api/verification/replay'});
  assert.equal(wrongMethod.status,405);assert.equal(wrongMethod.headers.allow,'POST');
  const malformed=await request(port,{path:'/api/verification/replay',method:'POST',headers:{'content-type':'application/json'},body:'{broken'});
  assert.equal(malformed.status,400);assert.equal(JSON.parse(malformed.body).error,'invalid_json');
  const oversized=await request(port,{path:'/api/verification/replay',method:'POST',headers:{'content-type':'application/json'},body:Buffer.alloc(1024*1024+1,32)});
  assert.equal(oversized.status,413);assert.equal(JSON.parse(oversized.body).error,'recording_too_large');
  let limited;
  for(let i=0;i<40;i++){
    const response=await request(port,{path:'/api/verification/replay',method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    if(response.status===429){limited=response;break}
    assert.equal(response.status,422);
  }
  assert.ok(limited,'replay quota is enforced at the actual HTTP adapter');assert.ok(Number(limited.headers['retry-after'])>0);
});
