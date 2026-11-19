// Inert, checked-in policy peer. No provider imports/sign-in or task execution.
import readline from 'node:readline';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const mode=process.argv[2]||'success',thread='synthetic-thread',turn='synthetic-turn';
const policy={approval_policy:'on-request',sandbox_mode:'read-only',web_search:'disabled',allow_login_shell:false,project_doc_max_bytes:0,cli_auth_credentials_store:'ephemeral',history:{persistence:'none'},features:{shell_tool:false,shell_snapshot:false,apps:false,hooks:false,multi_agent:false,view_image:false,remote_plugin:false,skill_mcp_dependency_install:false,goals:false,memories:false},apps:{_default:{enabled:false}},plugins:{_default:{enabled:false}},mcp_servers:{}};
const canonical=v=>v && typeof v==='object' ? '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}' : JSON.stringify(v);
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
let ready=false,settings=false,requirements=false,catalog=false;
const args=process.argv.slice(3);
if(args.length){
 if(args.slice(0,3).join('|')!=='app-server|--listen|stdio://')process.exit(13);
 const config={};const lines=[];
 for(let i=3;i<args.length;i+=2){
  if(args[i]!=='-c'||typeof args[i+1]!=='string')process.exit(14);
  const at=args[i+1].indexOf('='),keys=args[i+1].slice(0,at).split('.');
  let parent=config;for(const k of keys.slice(0,-1))parent=parent[k]??={};
  parent[keys.at(-1)]=JSON.parse(args[i+1].slice(at+1));lines.push(args[i+1].replace('=',' = '));
 }
 if(canonical(config)!==canonical(policy))process.exit(15);
 if(!process.env.CODEX_HOME?.startsWith('/tmp/kxra-codex-')||process.env.HOME==='/tmp'||process.cwd()==='/tmp')process.exit(16);
 if(fs.readFileSync(process.env.CODEX_HOME+'/config.toml','utf8')!==lines.join('\n')+'\n')process.exit(17);
}
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize'){
  if(mode==='startup-tool'){send({id:900,method:'process/spawn',params:{}});return;}
  send({id:m.id,result:{userAgent:mode==='unknown-version'?'codex-unknown':'kxra-codex-policy-stub/1'}});
 }else if(m.method==='initialized')ready=true;
 else if(m.method==='configRequirements/read'){
  if(!ready)process.exit(18);requirements=true;
  send({id:m.id,result:{requirements:mode==='managed-requirements'?{allowedApprovalPolicies:['never']}:null}});
 }else if(m.method==='config/read'){
  settings=true;const config=structuredClone(policy);
  if(mode==='config-enabled')config.features.shell_tool=true;
  if(mode==='config-unknown')config.features.unknown_tool=false;
  if(mode==='config-missing')delete config.features.apps;
  if(mode==='config-result-error'){send({id:m.id,result:{config},error:{code:-1,message:'bad'}});return;}
  if(mode==='config-method-response'){send({id:m.id,method:false,result:{config}});return;}
  if(mode==='config-early-event'){send({method:'item/completed',params:{item:{type:'agentMessage',text:'early'}}});return;}
  if(mode==='config-close'){process.exit(0);return;}
  const ack={id:m.id,result:{config,origins:mode==='config-layer'?{'features.shell_tool':{type:'system'}}:{},layers:null}};
  if(mode==='config-delay'){setTimeout(()=>send(ack),200);return;}
  send(ack);if(mode==='config-duplicate')send(ack);
 }else if(m.method==='mcpServerStatus/list'){
  catalog=true;send({id:m.id,result:{data:mode==='mcp-enabled'?[{name:'unexpected'}]:[],nextCursor:mode==='mcp-cursor'?'more':null}});
 }else if(m.method==='thread/start'){
  if(!requirements||!settings||!catalog||m.params.sandbox!=='read-only'||m.params.approvalPolicy!=='on-request')process.exit(10);
  if(mode==='thread-tool-early')send({method:'process/spawn',params:{}});
  if(mode==='thread-tool-item')send({method:'item/started',params:{item:{type:'commandExecution'}}});
  if(mode==='thread-context-extra')send({method:'thread/started',params:{thread:{id:thread},threadId:'foreign'}});
  if(mode==='thread-foreign')send({method:'thread/started',params:{thread:{id:'foreign'}}});
  send({id:m.id,result:mode==='thread-config-extra'?{thread:{id:thread},config:{features:{shell_tool:true}}}:{thread:{id:thread}}});
 }else if(m.method==='turn/start'){
  if(m.params.approvalPolicy!=='on-request'||m.params.sandboxPolicy.access.readableRoots.length||m.params.sandboxPolicy.access.includePlatformDefaults!==false)process.exit(11);
  send({id:m.id,result:{turn:{id:turn}}});
  if(mode==='descendant'||mode==='descendant-no-pipes'){
   const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:mode==='descendant-no-pipes'?'ignore':['ignore',process.stdout,process.stderr],env:{PATH:'/usr/bin:/bin'}});
   send({method:'stub/descendant',params:{pid:child.pid}});process.exit(0);return;
  }
  if(mode==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);return;}
  if(mode==='stderr'){process.stderr.write('x'.repeat(70000));return;}
  if(mode==='disconnect'){process.exit(0);return;}
  if(mode==='tool'){send({id:900,method:'item/commandExecution/requestApproval',params:{}});return;}
  if(mode==='tool-null-id'){send({id:null,method:'item/permissions/requestApproval',params:{}});return;}
  if(mode==='tool-no-id'){send({method:'process/spawn',params:{}});return;}
  if(mode==='malformed'){process.stdout.write('null\n');return;}
  const event={method:'item/completed',params:{threadId:mode==='foreign'?'foreign-thread':thread,turnId:turn,item:{type:'agentMessage',text:mode==='oversize'?'x'.repeat(20001):'Synthetic Codex protocol draft café'}}};
  const complete=()=>send({method:'turn/completed',params:{threadId:thread,turn:{id:turn,status:'completed'}}});
  if(mode==='utf8'){
   const bytes=Buffer.from(JSON.stringify(event)+'\n'),index=bytes.indexOf(Buffer.from('é'))+1;
   process.stdout.write(bytes.subarray(0,index));setTimeout(()=>{process.stdout.write(bytes.subarray(index));complete();},5);
  }else{send(event);complete();}
 }else process.exit(12);
});
