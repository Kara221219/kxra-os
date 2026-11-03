"""Prepared Linux synthetic-only CI controller. Never starts from a local default."""
from pathlib import Path
import datetime,hashlib,io,json,os,re,selectors,shutil,signal,stat,subprocess,sys,tarfile,tempfile,time,uuid
EXECUTION_ENABLED=True
CLEANUP_SAFE=True
LAST_COMMAND_DIAGNOSTIC=None
JOB_DEADLINE=None
IN_CLEANUP=False
CLEANUP_RESERVE=120
HERE=Path(__file__).resolve().parent
class Stop(Exception):pass
def require(ok,code):
 if not ok:raise Stop(code)
def digest(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def context(env,plan):
 require(env.get('GITHUB_ACTIONS')=='true' and env.get('GITHUB_REPOSITORY')==plan['sourceRepository'] and env.get('GITHUB_REF')=='refs/heads/'+plan['validationBranch'] and env.get('GITHUB_RUN_ATTEMPT')=='1' and env.get('KXRA_CLEAN_VALIDATION')=='ENABLED','CONTEXT')
 require(re.fullmatch(r'[0-9]{1,15}',env.get('GITHUB_RUN_ID','')) and re.fullmatch(r'[a-f0-9]{40}',env.get('GITHUB_SHA','')),'CONTEXT');return 'cl43-'+env['GITHUB_RUN_ID']+'-1'
def clean_env(node,private):
 return {'PATH':str(Path(node).parent)+':/usr/bin:/bin','HOME':str(private/'home'),'TMPDIR':str(private/'tmp'),'XDG_CONFIG_HOME':str(private/'xdg'),'LC_ALL':'C','LANG':'C','CI':'1','NO_COLOR':'1','NPM_CONFIG_USERCONFIG':'/dev/null','NPM_CONFIG_GLOBALCONFIG':'/dev/null','NPM_CONFIG_CACHE':str(private/'npm-cache'),'NPM_CONFIG_REGISTRY':'https://registry.npmjs.org','NPM_CONFIG_LOGS_MAX':'0','NPM_CONFIG_UPDATE_NOTIFIER':'false','KXRA_CLEAN_BUILD':'SYNTHETIC_ONLY_REVIEWED'}
def unit_properties(unit,source,harness,kind='proof'):
 require(re.fullmatch(r'kxra43-[0-9]{1,15}-1-[a-f0-9]{12}-(build|proof)',unit) and kind in ('build','proof'),'UNIT_SCOPE')
 for p in (source,harness):require(str(p).startswith('/var/tmp/kxra43-') and not re.search(r'[\s:\x00]',str(p)) and p.resolve()==p,'UNIT_SCOPE')
 target='/work/input' if kind=='build' else '/work/artifact'
 return ['DynamicUser=yes','PrivateNetwork=yes','PrivateTmp=yes','ProtectSystem=strict','ProtectHome=yes','ProtectProc=invisible','TemporaryFileSystem=/run:ro','BindReadOnlyPaths='+str(source)+':'+target+' '+str(harness)+':/work/harness','RuntimeDirectory='+unit,'RuntimeDirectoryMode=0700','RuntimeDirectoryPreserve=yes','BindPaths=/run/'+unit+':/work/runtime','ReadWritePaths=/work/runtime','RuntimeMaxSec='+('360' if kind=='build' else '240'),'TimeoutStopSec=15','KillMode=control-group','StandardOutput=null','StandardError=null']

def execute(argv,env,cwd,timeout,limit=4*1024*1024):
 """Private bounded output; every post-spawn path reconciles the owned child."""
 global CLEANUP_SAFE,LAST_COMMAND_DIAGNOSTIC
 if JOB_DEADLINE is not None:
  available=JOB_DEADLINE-time.monotonic()-(0 if IN_CLEANUP else CLEANUP_RESERVE);require(available>0,'JOB_BUDGET');timeout=min(timeout,available)
 p=None;sel=None;data=bytearray();total=0;deadline=time.monotonic()+timeout;reason=None;denied=False;phase='SPAWN';error_type=None;group_absent=False;close_failed=False
 try:
  p=subprocess.Popen(argv,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True);phase='REGISTER';sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ)
  while sel.get_map():
   if time.monotonic()>=deadline:reason='TIMEOUT';break
   phase='READ'
   for key,_ in sel.select(min(.2,max(0,deadline-time.monotonic()))):
    b=os.read(key.fileobj.fileno(),65536)
    if not b:sel.unregister(key.fileobj);continue
    total+=len(b)
    if len(data)<65536:data.extend(b[:65536-len(data)])
    if total>limit:reason='OUTPUT_LIMIT';break
   if reason:break
  if reason is None:phase='WAIT';p.wait(timeout=max(.1,deadline-time.monotonic()))
 except subprocess.TimeoutExpired:reason='TIMEOUT'
 except BaseException as e:
  reason='CHILD_IO_FAILURE';error_type=type(e).__name__ if type(e).__name__ in ('OSError','PermissionError','ValueError','TypeError') else 'UNCLASSIFIED'
 finally:
  if p is not None:
   try:
    if p.poll() is None:
     try:p.terminate()
     except ProcessLookupError:pass
     except PermissionError:denied=True
     if not denied:
      try:p.wait(timeout=5)
      except subprocess.TimeoutExpired:
       try:p.kill();p.wait(timeout=5)
       except ProcessLookupError:pass
       except PermissionError:denied=True
    for _ in range(20):
     try:os.killpg(p.pid,0)
     except ProcessLookupError:group_absent=True;break
     except PermissionError:break
     time.sleep(.05)
   except BaseException:group_absent=False
   try:p.stdout.close()
   except BaseException:close_failed=True
  if sel is not None:
   try:sel.close()
   except BaseException:close_failed=True
  if p is not None and (denied or not group_absent):CLEANUP_SAFE=False
 text=bytes(data).decode('utf8',errors='replace');details={'command':Path(argv[0]).name,'phase':phase,'exitCode':None if p is None else p.poll(),'reason':reason,'errorType':error_type,'signalDenied':denied,'ownedGroupAbsent':group_absent,'descriptorCloseFailed':close_failed,'finiteFlags':{'disk':'ENOSPC' in text,'permission':bool(re.search(r'EACCES|EPERM|Permission denied',text)),'dependencyIntegrity':bool(re.search(r'EINTEGRITY|integrity checksum',text)),'nativeSandbox':bool(re.search(r'No usable sandbox|userns_create|apparmor.*DENIED',text,re.I))},'rawOutputRetained':False}
 LAST_COMMAND_DIAGNOSTIC=details
 require(not denied,'CHILD_SIGNAL_DENIED');require(p is not None and p.poll() is not None,'CHILD_EXIT_UNCERTAIN');require(group_absent,'CHILD_GROUP_UNCERTAIN');require(not close_failed,'CHILD_DESCRIPTOR_CLOSE_UNCERTAIN');return bytes(data),details

def project_receipt(value,id,tree):
 require(type(value) is dict and value.get('sourceSha')=='43e3906859b58e69370a1069a44e6dc1cefc6d03' and value.get('provenance')=='NEW_LINUX_NEXT_PRODUCTION_BUILD_NOT_MAC_ARTIFACT' and value.get('artifactTreeSha256')==tree and value.get('deploymentId')==id and value.get('macArtifactIdentityPreserved') is False,'RECEIPT_SCOPE')
 require(type(value.get('cases')) is list and len(value['cases'])<=2 and all(type(x) is dict for x in value['cases']) and type(value.get('cleanup')) is dict and type(value.get('containment',{})) is dict,'RECEIPT_SHAPE')
 status=value.get('status');require(status in ('SYNTHETIC_CLEAN_SOURCE_UI_PASS','SYNTHETIC_CLEAN_SOURCE_UI_FAIL'),'RECEIPT_STATUS');out={'status':status,'sourceSha':value['sourceSha'],'provenance':value['provenance'],'artifactTreeSha256':tree,'macArtifactIdentityPreserved':False,'casesPassed':sum(x.get('passed') is True for x in value.get('cases',[]) if type(x) is dict),'cleanup':{k:value.get('cleanup',{}).get(k) is True for k in ('browserClosed','serverExited','proofSettled')},'containment':{k:value.get('containment',{}).get(k) is True for k in ('onlyLoopbackInterfaces','loopbackConnectionPassed','externalConnectionDenied','artifactWriteDenied','privateRuntimeWritePassed','hostRunAndHomeMasked')}}
 failure=value.get('failure');
 if type(failure) is dict:out['failure']={k:failure.get(k) if failure.get(k) in allowed else 'UNCLASSIFIED' for k,allowed in [('phase',('SCOPE','CONTAINMENT','ARTIFACT','BROWSER','SERVER','NAVIGATION','ID_ASSERTION','FINAL_INVENTORY','CLEANUP')),('category',('SCOPE','CONTAINMENT','ARTIFACT_DRIFT','BUILD','BUILD_ID','BROWSER','SERVER','NAVIGATION','ID_ASSERTION','NETWORK_SCOPE','CLEANUP','TIMEOUT','CANCELLED','UNCLASSIFIED')),('code',('EPERM','EACCES','ENETUNREACH','EROFS','ECONNREFUSED',None))]}
 if status.endswith('_PASS'):
  require([x.get('mode') for x in value.get('cases',[])]==['RUNTIME_ID_ABSENT','RUNTIME_ID_CONFLICTING'],'RECEIPT_CASES')
  require(all(x.get('passed') is True and x.get('loginStatus')==200 and x.get('rscStatus')==200 and type(x.get('staticAssetCount')) is int and x['staticAssetCount']>0 and x.get('actualClickRequestIdMatches') is True and x.get('responseIdMatches') is True and x.get('destinationVisible') is True and x.get('resetDocumentRequests')==0 and x.get('unexpectedRequests')==0 and x.get('cookieCount')==0 for x in value['cases']),'RECEIPT_CASES')
  require(value.get('terminal') is True and out['casesPassed']==2 and all(out['cleanup'].values()) and all(out['containment'].values()) and value.get('realCredentialsUsed') is False and value.get('realEmailsRequested')==0 and value.get('providerCallsPermitted') is False,'RECEIPT_PASS_GUARDS')
 return out
def unit_state(unit,env,root):
 raw,diag=execute(['sudo','-n','systemctl','show',unit,'--property=Description','--property=LoadState'],env,root,10)
 require(not diag['finiteFlags']['permission'],'UNIT_METADATA_DENIED');fields=dict(line.split('=',1) for line in raw.decode().splitlines() if '=' in line)
 return fields

def cleanup_owned(record,state,runtime_exists):
 expected='KXRA_CLEAN:'+record['operation']
 if state.get('Description')==expected:record['owned']=True;return True
 require(state.get('LoadState')=='not-found','UNIT_IDENTITY_DRIFT')
 require(record['owned'] or not runtime_exists,'UNIT_OWNERSHIP_UNCERTAIN');return record['owned']

def launch_unit(unit,kind,source,harness,node,id,tree,operation,env,root,records,report=None):
 if JOB_DEADLINE is not None:require(JOB_DEADLINE-time.monotonic()>=(380 if kind=='build' else 260)+CLEANUP_RESERVE,'UNIT_BUDGET_NOT_AVAILABLE')
 runtime=Path('/run')/unit;before=unit_state(unit,env,root);require(before.get('LoadState')=='not-found' and not runtime.exists() and not runtime.is_symlink(),'UNIT_NOT_FRESH')
 record={'unit':unit,'operation':operation,'owned':False};records.append(record)
 props=unit_properties(unit,source,harness,kind);script='unit-build.mjs' if kind=='build' else 'runtime.mjs';args=[id,operation] if kind=='build' else [id,tree,operation]
 argv=['sudo','-n','systemd-run','--quiet','--wait','--unit='+unit,'--description=KXRA_CLEAN:'+operation]+['--property='+x for x in props]+['/usr/bin/env','-i','PATH='+str(Path(node).parent)+':/usr/bin:/bin','HOME=/work/runtime/home','TMPDIR=/work/runtime/tmp','XDG_CONFIG_HOME=/work/runtime/xdg','NODE_ENV=production','KXRA_CLEAN_UNIT=SYNTHETIC_ONLY_REVIEWED',node,'/work/harness/'+script,*args]
 _,diag=execute(argv,env,root,380 if kind=='build' else 260)
 if report is not None:report.setdefault('unitObservations',[]).append({'kind':kind,'diagnostic':diag})
 state=unit_state(unit,env,root)
 if state.get('Description')=='KXRA_CLEAN:'+operation:record['owned']=True
 else:require(state.get('LoadState')=='not-found','UNIT_IDENTITY_DRIFT')
 raw,rd=execute(['sudo','-n','cat','--',str(runtime/'receipt.json')],env,root,10,65536);require(rd['exitCode']==0 and not rd['reason'],'RECEIPT_UNAVAILABLE');value=json.loads(raw);require(value.get('operationId')==operation,'UNIT_RECEIPT_IDENTITY');record['owned']=True
 if report is not None and type(value.get('failure')) is dict:report.setdefault('unitFailures',[]).append({'kind':kind,'category':value['failure'].get('category') if value['failure'].get('category') in ('SCOPE','CONTAINMENT','BUILD','TIMEOUT','UNCLASSIFIED','SERVER','BROWSER','CLEANUP') else 'UNCLASSIFIED'})
 if str(value.get('status','')).endswith('_PASS'):require(diag['exitCode']==0 and not diag['reason'],'UNIT_OUTCOME_UNCERTAIN')
 cgroup=Path('/sys/fs/cgroup/system.slice/'+unit+'.service/cgroup.events');require(not cgroup.exists() or 'populated 0' in cgroup.read_text(),'UNIT_CGROUP_POPULATED');return value

def main():
 global JOB_DEADLINE,IN_CLEANUP
 if not EXECUTION_ENABLED:print(json.dumps({'status':'DISABLED_NO_EFFECT','executed':False}));return 0
 require(sys.platform=='linux' and os.getuid()!=0,'LINUX_REQUIRED');started=float(os.environ['KXRA_JOB_STARTED_MONOTONIC']);require(0<=time.monotonic()-started<780,'JOB_CLOCK');JOB_DEADLINE=started+780;plan=json.loads((HERE/'plan.json').read_text());id=context(os.environ,plan);root=Path(os.environ['GITHUB_WORKSPACE']).resolve();checkout=root/'source';harness=root/'harness';require(HERE==harness/'validation/source43-linux','HARNESS_PATH');report={'status':'FAILED','phase':'PREFLIGHT','sourceSha':plan['sourceSha'],'provenance':'NEW_LINUX_NEXT_PRODUCTION_BUILD_NOT_MAC_ARTIFACT','hostedApplicationChanges':False};stage=None;unit='kxra43-'+os.environ['GITHUB_RUN_ID']+'-1';unit_records=[];cleaned=False
 try:
  bundle=json.loads((HERE/'BUNDLE.json').read_text());require(digest(__file__)==bundle['bootstrapProspectiveEnabledSha256'],'HARNESS_PIN');require(set(p.name for p in HERE.iterdir())==set(bundle['files'])|{'bootstrap.py','BUNDLE.json'},'HARNESS_FILE_SET')
  for name,sha in bundle['files'].items():require(digest(HERE/name)==sha,'HARNESS_PIN')
  node=shutil.which('node');npm=shutil.which('npm');require(node and npm,'TOOLS');env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','HOME':'/nonexistent','LC_ALL':'C'}
  raw,diag=execute([node,'--version'],env,root,10);require(raw.strip().decode()=='v'+plan['nodeVersion'],'NODE_VERSION')
  for directory,expected in [(checkout,plan['sourceSha']),(harness,os.environ['GITHUB_SHA'])]:
   raw,_=execute(['/usr/bin/git','-c','core.fsmonitor=false','-C',str(directory),'rev-parse','HEAD'],env,root,10);require(raw.strip().decode()==expected,'COMMIT_BINDING')
  for name,key in [('package-lock.json','packageLockSha256'),('package.json','packageSha256'),('apps/os/package.json','osPackageSha256'),('apps/os/next.config.mjs','nextConfigSha256')]:require(digest(checkout/name)==plan[key],'INPUT_PIN')
  lock=json.loads((checkout/'package-lock.json').read_text());require(all(not x.get('resolved','').startswith(('http:','https:')) or x['resolved'].startswith('https://registry.npmjs.org/') for x in lock['packages'].values()),'REGISTRY_SCOPE')
  stage=Path(tempfile.mkdtemp(prefix=unit+'-',dir='/var/tmp'));os.chmod(stage,0o700);source=stage/'source';source.mkdir();private=stage/'private';
  for name in ('home','tmp','xdg'): (private/name).mkdir(parents=True,mode=0o700)
  env=clean_env(node,private)
  archive=stage/'source.tar';_,diag=execute(['/usr/bin/git','-c','core.fsmonitor=false','-C',str(checkout),'archive','--format=tar','--output='+str(archive),plan['sourceSha']],env,root,30);require(diag['exitCode']==0 and archive.stat().st_size<=64*1024*1024,'SOURCE_ARCHIVE')
  with tarfile.open(archive) as tar:require(all(not Path(x.name).name.startswith('.env') or x.name==plan['approvedSourceEnvTemplate']['path'] for x in tar.getmembers()),'ENV_INPUT');tar.extractall(source,filter='data')
  require(not (source/'.git').exists() and digest(source/plan['approvedSourceEnvTemplate']['path'])==plan['approvedSourceEnvTemplate']['sha256'],'SOURCE_ARCHIVE');report['phase']='INSTALL';_,diag=execute([npm,'ci','--ignore-scripts','--no-audit','--fund=false'],env,source,180);report['install']=diag;require(diag['exitCode']==0 and not diag['reason'],'INSTALL_FAILED')
  public_harness=stage/'harness';shutil.copytree(HERE,public_harness);report['phase']='BUILD';token=uuid.uuid4().hex[:12];build_unit=unit+'-'+token+'-build';operation='op-'+uuid.uuid4().hex[:24];built=launch_unit(build_unit,'build',source,public_harness,node,id,None,operation,env,root,unit_records,report);require(built.get('status')=='SYNTHETIC_BUILD_PASS' and built.get('sourceSha')==plan['sourceSha'],'BUILD_FAILED');report['build']={'status':'SYNTHETIC_BUILD_PASS','contained':True};artifact=stage/'artifact';_,diag=execute(['sudo','-n','cp','-a','--','/run/'+build_unit+'/source',str(artifact)],env,root,60);require(diag['exitCode']==0,'BUILD_COPY');_,diag=execute(['sudo','-n','chown','-R','-h','--',str(os.getuid())+':'+str(os.getgid()),str(artifact)],env,root,30);require(diag['exitCode']==0,'BUILD_CUSTODY');source=artifact
  required=json.loads((source/'apps/os/.next/required-server-files.json').read_text());require(required['config'].get('deploymentId')==id and required['config']['experimental'].get('runtimeServerDeploymentId') is False,'BUILD_ID');
  # The entire new source/dependency/build tree becomes a read-only test input.
  for base,dirs,files in os.walk(source,followlinks=False):
   os.chmod(base,0o555)
   for name in files:
    file=Path(base)/name
    if not file.is_symlink():os.chmod(file,0o555 if file.stat().st_mode&0o111 else 0o444)
  seal_code="import {inventory} from './inventory.mjs';console.log(JSON.stringify(inventory(process.argv[1])));";raw,diag=execute([node,'--input-type=module','-e',seal_code,str(source)],env,public_harness,60);require(diag['exitCode']==0,'INVENTORY');sealed=json.loads(raw);tree=sealed['sha256'];require(re.fullmatch(r'[a-f0-9]{64}',tree),'INVENTORY');report['artifactTreeSha256']=tree;report['artifactCounts']={k:sealed[k] for k in ('files','links','bytes')}
  report['phase']='CONFINED_PROOF';proof_unit=unit+'-'+uuid.uuid4().hex[:12]+'-proof';operation='op-'+uuid.uuid4().hex[:24];value=launch_unit(proof_unit,'proof',source,public_harness,node,id,tree,operation,env,root,unit_records,report);result=project_receipt(value,id,tree);report['proof']=result;require(result['status'].endswith('_PASS'),'PROOF_FAILED');report['status']='PASS'
 except Stop as e:report['failedPhase']=report['phase'];report['failureCategory']=str(e);report['lastCommandDiagnostic']=LAST_COMMAND_DIAGNOSTIC
 except BaseException as e:
  report['failedPhase']=report['phase'];report['lastCommandDiagnostic']=LAST_COMMAND_DIAGNOSTIC;report['failureCategory']='UNCLASSIFIED_NO_RAW_ERROR';report['errorType']=type(e).__name__ if type(e).__name__ in ('ValueError','TypeError','KeyError','FileNotFoundError','PermissionError','OSError','TimeoutError') else 'UNCLASSIFIED';report['errno']=getattr(e,'errno',None) if getattr(e,'errno',None) in (1,2,13,28,30) else None
 finally:
  IN_CLEANUP=True;report['phase']='CLEANUP'
  try:
   for record in unit_records:
    unit_name=record['unit'];state=unit_state(unit_name,env,root)
    if not cleanup_owned(record,state,Path('/run',unit_name).exists()):continue
    if state.get('LoadState')!='not-found':
     require(state.get('Description')=='KXRA_CLEAN:'+record['operation'],'UNIT_IDENTITY_DRIFT');_,stop_diag=execute(['sudo','-n','systemctl','stop',unit_name],env,root,20);require(not stop_diag['finiteFlags']['permission'],'UNIT_STOP_DENIED')
    _,state_diag=execute(['sudo','-n','systemctl','is-active',unit_name],env,root,10);require(state_diag['exitCode'] in (3,4),'UNIT_ABSENCE_UNCERTAIN');cgroup=Path('/sys/fs/cgroup/system.slice/'+unit_name+'.service/cgroup.events');require(not cgroup.exists() or 'populated 0' in cgroup.read_text(),'UNIT_CGROUP_POPULATED')
   report['ownedUnitsInactive']=True
   require(CLEANUP_SAFE,'CHILD_CLEANUP_UNCERTAIN')
   if stage is not None:
    require(stage.parent==Path('/var/tmp') and stage.name.startswith(unit+'-') and not stage.is_symlink(),'CLEANUP_SCOPE');
    # Read-only source inputs are in our exclusive generated tree only.
    for base,dirs,files in os.walk(stage,followlinks=False):os.chmod(base,0o700)
    shutil.rmtree(stage);cleaned=True
   report['stageRemoved']=cleaned or stage is None
   for record in unit_records:
    if record['owned']:
     _,remove_diag=execute(['sudo','-n','rm','-rf','--','/run/'+record['unit']],env,root,15);require(remove_diag['exitCode']==0,'RUNTIME_CLEANUP');require(not Path('/run',record['unit']).exists(),'RUNTIME_CLEANUP')
   report['runtimeRemoved']=True
  except BaseException:report['status']='FAILED';report['cleanupCategory']='OWNED_CLEANUP_UNCERTAIN'
  report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();print(json.dumps(report));return 0 if report['status']=='PASS' else 1
if __name__=='__main__':
 try:code=main()
 except BaseException:print(json.dumps({'status':'PREFLIGHT_REJECTED_NO_EFFECT','rawErrorRetained':False}));code=1
 raise SystemExit(code)
