import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function inventory(root){
 const base=path.resolve(root);if(fs.realpathSync(base)!==base||fs.lstatSync(base).isSymbolicLink())throw Error('ROOT_SCOPE');let total=0,count=0;const entries=[];
 const stamp=s=>[s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeMs,s.ctimeMs];
 const same=(a,b)=>JSON.stringify(stamp(a))===JSON.stringify(stamp(b));
 function walk(dir){const start=fs.lstatSync(dir);if(!start.isDirectory()||start.isSymbolicLink())throw Error('DIRECTORY_SCOPE');for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),relative=path.relative(base,file),s=fs.lstatSync(file);if(++count>100000)throw Error('INVENTORY_LIMIT');
  if(s.isSymbolicLink()){const target=fs.readlinkSync(file),real=fs.realpathSync(file);if(path.isAbsolute(target)||!real.startsWith(base+path.sep)||!same(s,fs.lstatSync(file)))throw Error('LINK_SCOPE');entries.push({path:relative,kind:'link',target});}
  else if(s.isDirectory())walk(file);
  else if(s.isFile()){
   if(s.size>256*1024**2||(total+=s.size)>2*1024**3)throw Error('INVENTORY_LIMIT');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const digest=crypto.createHash('sha256');let size=0;
   try{const opened=fs.fstatSync(fd);if(!same(s,opened))throw Error('INVENTORY_DRIFT');const buffer=Buffer.alloc(65536);while(true){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;size+=n;if(size>s.size)throw Error('INVENTORY_DRIFT');digest.update(buffer.subarray(0,n));}if(size!==s.size||!same(opened,fs.fstatSync(fd))||!same(opened,fs.lstatSync(file)))throw Error('INVENTORY_DRIFT');}finally{fs.closeSync(fd);}entries.push({path:relative,kind:'file',bytes:s.size,executable:Boolean(s.mode&0o111),sha256:digest.digest('hex')});
  }else throw Error('INVENTORY_SPECIAL');
 }if(!same(start,fs.lstatSync(dir)))throw Error('DIRECTORY_DRIFT');}walk(base);return {sha256:hash(JSON.stringify(entries)),files:entries.filter(x=>x.kind==='file').length,links:entries.filter(x=>x.kind==='link').length,bytes:total};
}
export function isPrefetch(headers){const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).toLowerCase()]));return Object.hasOwn(h,'next-router-prefetch')||Object.hasOwn(h,'next-router-segment-prefetch')||/(?:^|[\s,;])prefetch(?:$|[\s,;]|$)/.test(h.purpose??'')||/(?:^|[\s,;])prefetch(?:$|[\s,;]|$)/.test(h['sec-purpose']??'');}
export function clickRsc(request,origin,clicked){const u=new URL(request.url());return clicked&&u.origin===origin&&u.pathname==='/reset-password'&&request.headers().rsc==='1'&&!isPrefetch(request.headers())&&!request.isNavigationRequest();}
export function syntheticEnv(id,origin,home='/work/runtime'){
 if(!/^cl43-[0-9]+-[0-9]+$/.test(id)||id.length>32||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))throw Error('SYNTHETIC_SCOPE');
 const e={PATH:process.env.PATH,HOME:home+'/home',TMPDIR:home+'/tmp',XDG_CONFIG_HOME:home+'/xdg',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',CI:'1',KXRA_ENVIRONMENT:'staging',KXRA_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_SYNTHETIC_OFFLINE_NONFUNCTIONAL_VALUE',DATABASE_URL:'postgresql://synthetic:SYNTHETIC_OFFLINE_NONFUNCTIONAL_VALUE@127.0.0.1:9/synthetic?sslmode=verify-full',KXRA_DATABASE_CA_CERT_BASE64:Buffer.from('SYNTHETIC_NOT_A_CERTIFICATE').toString('base64'),KXRA_JOIN_SECRET:'SYNTHETIC_OFFLINE_NONFUNCTIONAL_VALUE_'.repeat(3)};
 for(const name of ['KXRA_AI_ENABLED','KXRA_STORAGE_ENABLED','KXRA_WHATSAPP_ENABLED','KXRA_TELEMETRY_ENABLED','KXRA_PUBLIC_WEB_ENABLED','KXRA_BILLING_ENABLED','KXRA_EMAIL_ENABLED','KXRA_HOSTED_SELF_SERVICE_ENABLED','KXRA_LIVE_BILLING_ENTRY_ENABLED','KXRA_MODERN_SANDBOX_WEBHOOK_ENABLED','KXRA_MODERN_BILLING_DISPATCH_ENABLED','KXRA_BILLING_HTTP_ENABLED','KXRA_PAID_PROOF_REFRESH_ENABLED','KXRA_HOSTED_ROOM_JOBS','KXRA_ROOM_MAINTENANCE_ENABLED','KXRA_REDUCED_BILLING_SHADOW_ENABLED','KXRA_BILLING_REFRESH_SCHEDULER_ENABLED','KXRA_BILLING_RECONCILIATION_STATUS_ENABLED','KXRA_PILOT_STRIPE_ENABLED'])e[name]='false';return e;
}
