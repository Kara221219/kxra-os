import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {containment,finiteFailure} from './runtime.mjs';import {inventory} from './inventory.mjs';
const [id,operationId]=process.argv.slice(2);let phase='SCOPE';const receipt={status:'SYNTHETIC_BUILD_FAIL',operationId,sourceSha:'43e3906859b58e69370a1069a44e6dc1cefc6d03'};
try{
 if(process.platform!=='linux'||process.getuid()===0||process.env.KXRA_CLEAN_UNIT!=='SYNTHETIC_ONLY_REVIEWED'||!/^cl43-[0-9]+-[0-9]+$/.test(id)||!/^op-[a-f0-9]{24}$/.test(operationId))throw Error('SCOPE');
 for(const name of ['home','tmp','xdg'])fs.mkdirSync('/work/runtime/'+name,{recursive:true,mode:0o700});phase='CONTAINMENT';receipt.containment=await containment('/work/input');
 phase='COPY_PUBLIC_INPUT';const input=inventory('/work/input');fs.cpSync('/work/input','/work/runtime/source',{recursive:true,dereference:false,verbatimSymlinks:true,force:false,errorOnExist:true});if(inventory('/work/runtime/source').sha256!==input.sha256)throw Error('ARTIFACT_DRIFT');phase='BUILD';
 const r=spawnSync(process.execPath,['/work/harness/build.mjs','/work/runtime/source',id],{env:{PATH:process.env.PATH,KXRA_CLEAN_BUILD:'SYNTHETIC_ONLY_REVIEWED'},stdio:'pipe',timeout:310000,maxBuffer:65536});
 if(r.status!==0)throw Error('BUILD');receipt.status='SYNTHETIC_BUILD_PASS';
}catch(e){receipt.failure=finiteFailure(e,phase);}
finally{fs.writeFileSync('/work/runtime/receipt.json',JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});}
process.exitCode=receipt.status==='SYNTHETIC_BUILD_PASS'?0:1;
