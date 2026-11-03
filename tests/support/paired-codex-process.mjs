// Synthetic app-server peer only. No provider imports, credentials, tools or task execution.
import readline from 'node:readline';
const mode=process.argv[2]||'success',thread='synthetic-thread',turn='synthetic-turn';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic'}});
 else if(m.method==='initialized'){}
 else if(m.method==='thread/start'){
  if(m.params.sandbox!=='read-only'||m.params.approvalPolicy!=='untrusted')process.exit(10);
  send({id:m.id,result:{thread:{id:thread}}});
 }else if(m.method==='turn/start'){
  if(m.params.sandboxPolicy.access.readableRoots.length||m.params.sandboxPolicy.access.includePlatformDefaults!==false)process.exit(11);
  send({id:m.id,result:{turn:{id:turn}}});
  if(mode==='disconnect'){process.exit(0);return;}
  if(mode==='tool'){send({id:900,method:'item/commandExecution/requestApproval',params:{}});return;}
  if(mode==='malformed'){process.stdout.write('null\n');return;}
  const event={method:'item/completed',params:{threadId:mode==='foreign'?'foreign-thread':thread,turnId:turn,item:{type:'agentMessage',text:mode==='oversize'?'x'.repeat(20001):'Synthetic Codex protocol draft café'}}};
  const complete=()=>send({method:'turn/completed',params:{threadId:thread,turn:{id:turn,status:'completed'}}});
  if(mode==='utf8'){
   const bytes=Buffer.from(JSON.stringify(event)+'\n'),index=bytes.indexOf(Buffer.from('é'))+1;
   process.stdout.write(bytes.subarray(0,index));setTimeout(()=>{process.stdout.write(bytes.subarray(index));complete();},5);
  }else{send(event);complete();}
 }else process.exit(12);
});
