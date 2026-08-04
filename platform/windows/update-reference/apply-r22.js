"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
function fail(m){console.error(`ERRO: ${m}`);process.exit(1)}
function sha(p){return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")}
function copy(source,target){if(!fs.existsSync(source))fail(`arquivo ausente: ${source}`);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);if(sha(source)!==sha(target))fail(`falha SHA-256: ${target}`)}
function findExt(root){for(const c of [path.join(root,"Extension"),path.join(root,"extension"),path.join(root,"ChromeExtension"),path.join(root,"App","Extension")])if(fs.existsSync(path.join(c,"manifest.json"))&&fs.existsSync(path.join(c,"sidepanel.js")))return c;const q=[{d:root,n:0}];while(q.length){const{x:d,n}=q.shift();if(n>5)continue;let e=[];try{e=fs.readdirSync(d,{withFileTypes:true})}catch{continue}if(e.some(x=>x.isFile()&&x.name==="manifest.json")&&e.some(x=>x.isFile()&&x.name==="sidepanel.js"))return d;for(const x of e)if(x.isDirectory()&&!['Projects','Backups','Logs','Temp','node_modules'].includes(x.name))q.push({d:path.join(d,x.name),n:n+1})}return null}
const root=path.join(process.env.LOCALAPPDATA||"","LovableBridgeNative");
const settings=path.join(root,"Config","settings.json"),host=path.join(root,"Host","host.js"),ext=findExt(root);
if(!fs.existsSync(settings)||!fs.existsSync(host)||!ext)fail("instalacao atual do Lovable Bridge nao localizada");
const pkg=__dirname,files=[['payload/host/host.js',host],['payload/extension/sidepanel.js',path.join(ext,'sidepanel.js')],['payload/extension/preview-selector.js',path.join(ext,'preview-selector.js')],['payload/extension/preview-selector.css',path.join(ext,'preview-selector.css')]];
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,''),backup=path.join(root,'Backups',`R22-${stamp}`);fs.mkdirSync(backup,{recursive:true});
for(const[,target]of files)if(fs.existsSync(target))fs.copyFileSync(target,path.join(backup,path.basename(target)+'.before-R22'));
fs.copyFileSync(settings,path.join(backup,'settings-before-R22.json'));
for(const[source,target]of files)copy(path.join(pkg,source),target);
const cfg=JSON.parse(fs.readFileSync(settings,'utf8'));cfg.release=cfg.release||{};cfg.release.hotfix='R22-Windows';cfg.release.updatedAt=new Date().toISOString();fs.writeFileSync(settings,JSON.stringify(cfg,null,2),'utf8');
fs.writeFileSync(path.join(backup,'applied-r22.json'),JSON.stringify({release:'R22-Windows',appliedAt:new Date().toISOString(),root,extensionDir:ext,backup},null,2));
console.log('[OK] Companion 1.6.0 R22 atualizado.');console.log(`[OK] Interface R22 atualizada em: ${ext}`);console.log(`[OK] Backup: ${backup}`);
