// New test-build adapter, not the old Vercel handler or Mac artifact.
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {createRequire} from 'node:module';
const root='/work/artifact',app=root+'/apps/os',port=Number(process.argv[2]),id=process.argv[3];
if(process.platform!=='linux'||!Number.isInteger(port)||port<1||port>65535||!/^cl43-[0-9]+-[0-9]+$/.test(id))throw Error('SERVER_SCOPE');
const required=JSON.parse(fs.readFileSync(app+'/.next/required-server-files.json','utf8'));
if(required.config.deploymentId!==id||required.config.experimental.runtimeServerDeploymentId!==false||required.config.distDir!=='.next')throw Error('COMPILED_CONFIG');
const require=createRequire(app+'/package.json');if(require('next/package.json').version!=='16.4.3')throw Error('NEXT_VERSION');
const NextServer=require('next/dist/server/next-server.js').default;
// Use captured compiled configuration, not next start/loadConfig runtime override.
const next=new NextServer({dir:app,conf:required.config,dev:false,hostname:'127.0.0.1',port});await next.prepare();const handler=next.getRequestHandler();
const server=http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)||req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;res.end();return;}
 const u=new URL(req.url,`http://127.0.0.1:${port}`);if(u.origin!==`http://127.0.0.1:${port}`){res.statusCode=403;res.end();return;}
 if(u.pathname==='/__clean_ready'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'synthetic-clean43',id}));return;}
 if(!['/login','/reset-password','/favicon.svg'].includes(u.pathname)&&!u.pathname.startsWith('/_next/static/')){res.statusCode=403;res.end();return;}
 await handler(req,res);
 }catch{res.destroy();}});
server.listen(port,'127.0.0.1');process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
