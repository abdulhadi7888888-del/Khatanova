/* KhataNova 2030 - Business settings, automatic backups, integrity check, CSV import (Phase 7).
   Auto backups are extra records in the same IndexedDB store ('backup_<ts>' + small 'bmeta_<ts>'),
   so no schema change is needed and nothing existing is ever rewritten. Encrypted automatically when database encryption is on. */
(function(){
'use strict';
var root=null,V={msg:'',check:null,imp:null};
var KEEP_AUTO=7,KEEP_PRE=3,DAY=20*3600*1000;
function $(i){return document.getElementById(i)}
function can(p){return !window.KNA||KNA.guard(p)}
function mb(n){return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
function stamp(ts){return new Date(ts).toLocaleString()}

/* ---------------- IndexedDB helpers ---------------- */
function tx(mode,fn){return new Promise(function(res,rej){if(!window.knDb){rej(new Error('Database not ready'));return}var t=knDb.transaction('app_state',mode),st=t.objectStore('app_state'),r=fn(st);t.oncomplete=function(){res(r&&r.result)};t.onerror=function(){rej(t.error)};t.onabort=function(){rej(t.error||new Error('aborted'))}})}
function listMeta(){return tx('readonly',function(st){return st.getAll(IDBKeyRange.bound('bmeta_','bmeta_￿'))}).then(function(a){return(a||[]).sort(function(x,y){return y.ts-x.ts})})}
function counts(d){return{products:(d.products||[]).length,sales:(d.sales||[]).length,purchases:(d.purchases||[]).length,parties:Object.keys(d.pt||{}).length,entries:(d.tx||[]).length}}

/* ---------------- integrity check (pure; works on any state object) ---------------- */
function check(d){
  var E=[],W=[];function e(m){E.push(m)}function w(m){W.push(m)}
  if(!d||typeof d!=='object')return{errors:['No data'],warnings:[],counts:{}};
  ['grades','tx','pay','cash','exp','staff','att','sp','ot','bills','products','warehouses','purchases','sales','stockMoves','accounts','audit','users','quotes'].forEach(function(k){if(d[k]!==undefined&&!Array.isArray(d[k]))e('"'+k+'" is damaged (not a list)')});
  ['ph','pt','due','biz','cfg'].forEach(function(k){if(d[k]!==undefined&&(typeof d[k]!=='object'||Array.isArray(d[k])||d[k]===null))e('"'+k+'" is damaged (not an object)')});
  if(E.length)return{errors:E,warnings:W,counts:counts(d)};
  function dups(a,n){var s={};(a||[]).forEach(function(x){if(!x||x.id==null)return;if(s[x.id])e('Duplicate id in '+n+': '+x.id);s[x.id]=1})}
  dups(d.products,'products');dups(d.sales,'sales');dups(d.purchases,'purchases');dups(d.quotes,'quotes');dups(d.stockMoves,'stock movements');dups(d.warehouses,'warehouses');dups(d.users,'users');dups(d.accounts,'accounts');
  var pm={},names={},nos={};
  (d.products||[]).forEach(function(p){pm[p.id]=p;var n=String(p.name||'').toLowerCase();if(names[n])e('Two products have the same name: '+p.name);names[n]=1;if(!(p.name))e('A product has no name')});
  var whs={};(d.warehouses||[]).forEach(function(x){whs[x.id]=1});
  (d.stockMoves||[]).forEach(function(m){if(!pm[m.product])e('Stock movement for a missing product ('+m.product+')');if(!isFinite(m.qty))e('Stock movement with invalid quantity');if(m.wh&&!whs[m.wh])w('Stock movement uses an unknown warehouse')});
  var accs={cash:1};(d.accounts||[]).forEach(function(a){accs[a.id]=1});
  [['sales',d.sales],['purchases',d.purchases]].forEach(function(pair){(pair[1]||[]).forEach(function(doc){
    if(nos[pair[0]+doc.no])e('Duplicate document number '+doc.no);nos[pair[0]+doc.no]=1;
    if(doc.void)return;
    var sub=0,dis=0,net=0;(doc.items||[]).forEach(function(it,ix){var g=KN.lineMinor(it.qty,it.rate),dd=Math.min(it.disc||0,g);sub+=g;dis+=dd;net+=it.net;if(it.net!==g-dd)e(doc.no+': line '+(ix+1)+' amount does not match quantity x rate');if(!pm[it.product])w(doc.no+': product '+it.name+' no longer exists')});
    var taxable=sub-dis,tax=KN.pct(taxable,doc.taxRate||0);
    if(doc.subtotal!==sub||doc.discount!==dis)e(doc.no+': subtotal/discount do not match the items');
    if(doc.tax!==tax||doc.total!==taxable+tax)e(doc.no+': tax/total do not match ('+(taxable+tax)/100+' expected)');
    var ps=0;(doc.payments||[]).forEach(function(p){ps+=p.amount;if(!accs[p.method])w(doc.no+': payment uses an unknown account')});
    if(ps!==doc.paid)e(doc.no+': paid amount ('+doc.paid/100+') differs from the sum of payments ('+ps/100+')');
    var rq={};(doc.returns||[]).forEach(function(r){r.items.forEach(function(i){rq[i.idx]=(rq[i.idx]||0)+i.qty})});
    Object.keys(rq).forEach(function(ix){if(!doc.items[ix]||rq[ix]>doc.items[ix].qty+1e-9)e(doc.no+': returned quantity is more than sold/bought')});
  })});
  if(!(d.users||[]).some(function(u){return u.role==='owner'}))w('No owner user found');
  var bal={},g={};(d.tx||[]).forEach(function(x){g[x.g]=(g[x.g]||0)+(x.t==='in'?+x.kg:-x.kg)});
  (d.stockMoves||[]).forEach(function(m){bal[m.product]=(bal[m.product]||0)+m.qty});
  (d.products||[]).forEach(function(p){var q=(bal[p.id]||0)+(p.legacyGrade?(g[p.legacyGrade]||0):0);if(q<-1e-9&&!(d.cfg&&d.cfg.negStock))w('Negative stock for '+p.name+' ('+Math.round(q*1000)/1000+')')});
  return{errors:E,warnings:W,counts:counts(d)};
}

/* ---------------- backups ---------------- */
async function snapshot(kind){
  if(!window.knDb||typeof knReady==='undefined'||!knReady)throw new Error('Database not ready');
  var clone=JSON.parse(JSON.stringify(S)),ts=Date.now(),pre=window.KNSEC&&KNSEC.encRecord?await KNSEC.encRecord(clone):null;
  if(pre==='skip')throw new Error('Database is locked');
  var rec=pre||{data:clone};rec.id='backup_'+ts;rec.kind=kind;rec.createdAt=ts;
  var meta={id:'bmeta_'+ts,ts:ts,kind:kind,enc:!!rec.enc,counts:counts(clone),size:JSON.stringify(clone).length};
  await tx('readwrite',function(st){st.put(rec);st.put(meta)});
  await prune();return meta;
}
async function prune(){
  var m=await listMeta(),a=m.filter(function(x){return x.kind==='auto'||x.kind==='manual'}).slice(KEEP_AUTO),p=m.filter(function(x){return x.kind==='pre-restore'}).slice(KEEP_PRE),del=a.concat(p);
  if(!del.length)return;await tx('readwrite',function(st){del.forEach(function(x){st.delete('backup_'+x.ts);st.delete(x.id)})});
}
async function autoBackup(){
  if(S.cfg&&S.cfg.autoBackup===false)return null;
  var m=await listMeta(),last=m.filter(function(x){return x.kind==='auto'})[0];
  if(last&&Date.now()-last.ts<DAY)return null;
  var r=check(S);if(r.errors.length){console.warn('KhataNova: auto backup skipped, integrity errors',r.errors);return null}
  return snapshot('auto');
}
async function loadBackup(ts){
  var rec=await tx('readonly',function(st){return st.get('backup_'+ts)});if(!rec)throw new Error('Backup not found');
  if(rec.data)return rec.data;
  if(rec.enc&&KNSEC.core.openKeyed)return KNSEC.core.openKeyed(rec);
  throw new Error('Cannot open this backup');
}
async function restore(ts){
  if(!can('settings_manage'))return;
  var d;try{d=await loadBackup(ts)}catch(e){toast('Could not open this backup');return}
  var r=check(d);if(r.errors.length&&!confirm('This backup has '+r.errors.length+' integrity problem(s):\n- '+r.errors.slice(0,5).join('\n- ')+'\n\nRestore anyway?'))return;
  if(!confirm('Current records will be replaced by the backup from '+stamp(ts)+'. A safety copy of the current data is saved first. Continue?'))return;
  try{await snapshot('pre-restore');S=normalizeState(d);await knWriteState(JSON.parse(JSON.stringify(S)));try{if(!(window.KNSEC&&KNSEC.encOn()))localStorage.setItem(K,JSON.stringify(S))}catch(e){}location.reload()}catch(e){console.error(e);toast('Restore failed. Your current data was not changed.')}
}
async function shareBackup(pass){
  if(!pass||pass.length<8)return toast('Enter a backup password of at least 8 characters');
  if(!window.crypto||!crypto.subtle)return toast('Secure encryption is not available in this browser');
  try{await knWrite;var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify({format:'KhataNovaBackup',version:1,createdAt:new Date().toISOString(),data:S})),key=await knDerive(pass,salt),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,plain);
    var env={format:'KHATANOVA-ENCRYPTED-BACKUP',version:1,kdf:'PBKDF2-SHA256',iterations:250000,cipher:'AES-256-GCM',salt:knB64(salt),iv:knB64(iv),data:knB64(cipher)},name='khatanova-encrypted-backup-'+today()+'.knbackup';
    var file=new File([JSON.stringify(env)],name,{type:'application/octet-stream'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'KhataNova backup'});S.lbk=today();save();toast('Backup shared. Keep your password safe.');return}catch(e){if(e&&e.name==='AbortError')return}}
    knDownload(new Blob([JSON.stringify(env)],{type:'application/octet-stream'}),name);S.lbk=today();save();toast('Encrypted backup downloaded');
  }catch(e){console.error(e);toast('Could not create the backup')}
}
function exportAll(){
  if(!can('settings_manage'))return;
  knDownload(new Blob([JSON.stringify({format:'KhataNovaExport',version:2,exportedAt:new Date().toISOString(),data:S},null,1)],{type:'application/json'}),'khatanova-all-data-'+today()+'.json');toast('Exported. This file is NOT encrypted.');
}

/* ---------------- CSV import (products) ---------------- */
function parseCsv(t){
  t=t.replace(/^﻿/,'');var rows=[],r=[],c='',q=false;
  for(var i=0;i<t.length;i++){var ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch==='"')q=true;else if(ch===','){r.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);c='';if(r.some(function(x){return x.trim()!==''}))rows.push(r);r=[]}else c+=ch}
  r.push(c);if(r.some(function(x){return x.trim()!==''}))rows.push(r);return rows;
}
var HDR={name:'name',product:'name',sku:'sku',code:'sku',barcode:'barcode',category:'category',brand:'brand',unit:'unit',buy:'buy',purchase:'buy','purchase price':'buy',cost:'buy',sell:'sell','sale price':'sell',price:'sell',wholesale:'whp','wholesale price':'whp',min:'min','minimum stock':'min',opening:'open','opening stock':'open',stock:'open',supplier:'supplier',location:'loc'};
function importCsv(text){
  if(!can('products_manage'))return null;
  var rows=parseCsv(text),res={added:0,skipped:0,errors:[]};
  if(rows.length<2){res.errors.push('The file has no data rows');return res}
  var h=rows[0].map(function(x){return HDR[x.trim().toLowerCase()]||''});if(h.indexOf('name')<0){res.errors.push('A "name" column is required');return res}
  var names={},skus={},bcs={};S.products.forEach(function(p){names[p.name.toLowerCase()]=1;if(p.sku)skus[p.sku.toLowerCase()]=1;if(p.barcode)bcs[p.barcode]=1});
  var mx=0;S.products.forEach(function(p){var m=/^P-(\d+)$/.exec(p.sku||'');if(m)mx=Math.max(mx,+m[1])});
  var add=[],moves=[];
  rows.slice(1).forEach(function(r,ix){
    var o={};h.forEach(function(k,i){if(k)o[k]=(r[i]||'').trim()});var ln=ix+2;
    function bad(m){res.errors.push('Row '+ln+': '+m);res.skipped++}
    if(!o.name)return bad('name is empty');
    var nums={buy:o.buy,sell:o.sell,whp:o.whp,min:o.min,open:o.open};
    for(var k in nums){if(nums[k]&&!/^\d+(\.\d+)?$/.test(nums[k].replace(/,/g,'')))return bad(k+' "'+nums[k]+'" is not a number')}
    if(names[o.name.toLowerCase()])return bad('"'+o.name+'" already exists');
    if(o.sku&&skus[o.sku.toLowerCase()])return bad('SKU "'+o.sku+'" already used');
    if(o.barcode&&bcs[o.barcode])return bad('barcode "'+o.barcode+'" already used');
    var n=function(v){return v?Number(v.replace(/,/g,'')):0},sku=o.sku||('P-'+String(++mx).padStart(4,'0'));
    var p={id:KN.uid('p'),name:o.name,sku:sku,barcode:o.barcode||'',category:o.category||'',brand:o.brand||'',unit:o.unit||'pcs',buyPrice:n(o.buy),sellPrice:n(o.sell),wholesalePrice:n(o.whp),minStock:n(o.min),desc:'',supplier:o.supplier||'',location:o.loc||'',image:'',active:true,kind:'std',warehouse:'wh_main',created:Date.now()};
    names[o.name.toLowerCase()]=1;skus[sku.toLowerCase()]=1;if(o.barcode)bcs[o.barcode]=1;add.push(p);
    if(n(o.open)>0)moves.push({id:KN.uid('sm'),product:p.id,qty:Math.round(n(o.open)*1000)/1000,type:'opening',date:today(),ts:Date.now()+ix,wh:'wh_main',rate:p.buyPrice,cost:p.buyPrice,note:'Opening stock (CSV import)'});
  });
  add.forEach(function(p){S.products.push(p)});moves.forEach(function(m){S.stockMoves.push(m)});res.added=add.length;
  if(add.length){KN.audit(S,'import','products','csv',null,{added:add.length,skipped:res.skipped});save()}
  return res;
}
function csvTemplate(){return 'name,sku,barcode,category,brand,unit,buy,sell,wholesale,min,opening,supplier,location\r\nSteel Bolt 12mm,,8901234567890,Hardware,Acme,pcs,12,18,16,50,200,Ali Traders,Rack A\r\n'}

/* ---------------- logo ---------------- */
function readLogo(file){
  if(!file)return;if(!/^image\//.test(file.type)){toast('Choose an image file');return}
  var fr=new FileReader();fr.onload=function(){var im=new Image();im.onload=function(){var s=Math.min(1,320/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    S.biz=S.biz||{};S.biz.logo=c.toDataURL('image/png');KN.audit(S,'update','settings','logo',null,'changed');save();toast('Logo saved');render()};im.onerror=function(){toast('Could not read this image')};im.src=fr.result};fr.readAsDataURL(file);
}

/* ---------------- UI ---------------- */
function row(t,s,b){return '<div class="kp-mv" style="align-items:center"><div><b>'+esc(t)+'</b>'+(s?'<small>'+s+'</small>':'')+'</div><div style="display:flex;gap:6px">'+(b||'')+'</div></div>'}
function html(meta){
  var cf=S.cfg||{},b=S.biz||{},h='';
  h+='<div class="kp-c kp-fm"><b>Business and invoice</b>'+
   '<div style="display:flex;gap:12px;align-items:center;margin-top:8px"><div class="kp-im" style="width:64px;height:64px">'+(b.logo?'<img alt="Logo" src="'+esc(b.logo)+'">':'Logo')+'</div><div style="flex:1"><input id="kad-logo" type="file" accept="image/*">'+(b.logo?'<button class="ghost" data-a="nologo" style="margin-top:6px">Remove logo</button>':'')+'</div></div>'+
   '<label for="kad-tax">Tax / registration number (printed on documents)</label><input id="kad-taxno" value="'+esc(b.tax||'')+'" maxlength="40">'+
   '<div class="kp-2"><div><label for="kad-pre">Invoice prefix</label><input id="kad-pre" value="'+esc(cf.invPrefix||'INV-')+'" maxlength="8"></div><div><label for="kad-tt">Default tax %</label><input id="kad-tt" inputmode="decimal" value="'+esc(cf.tradeTax!=null?cf.tradeTax:'')+'" placeholder="0"></div></div>'+
   '<label for="kad-df">Date format on documents</label><select id="kad-df">'+[['iso','2026-11-04'],['dmy','04/11/2026'],['mdy','11/04/2026']].map(function(o){return '<option value="'+o[0]+'"'+((cf.dateFmt||'iso')===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>'+
   '<label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input id="kad-neg" type="checkbox" style="width:auto" '+(cf.negStock?'checked':'')+'> Allow selling below zero stock</label>'+
   '<label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input id="kad-auto" type="checkbox" style="width:auto" '+(cf.autoBackup===false?'':'checked')+'> Automatic daily backup on this device</label>'+
   '<button class="kp-pri" data-a="savecfg">Save settings</button></div>';
  var last=meta[0],age=last?Math.floor((Date.now()-last.ts)/86400000):null;
  h+='<div class="kp-c" style="margin-top:10px"><b>Local backups</b><small style="display:block;color:var(--mute)">'+(last?'Last: '+stamp(last.ts)+(age>7?' (over a week ago!)':''):'No backup yet.')+' Last 7 daily copies are kept on this device only. Also download a copy off the phone.</small>'+
   meta.map(function(m){return row(stamp(m.ts),(m.kind==='pre-restore'?'before restore':m.kind)+' | '+m.counts.products+' products, '+m.counts.sales+' sales, '+m.counts.entries+' entries | '+mb(m.size)+(m.enc?' | encrypted':''),'<button class="ghost" data-a="restore" data-ts="'+m.ts+'">Restore</button>')}).join('')+
   '<button class="kp-pri" data-a="now">Back up now</button></div>';
  h+='<div class="kp-c kp-fm" style="margin-top:10px"><b>Backup file (share to Drive, WhatsApp, email)</b><small style="display:block;color:var(--mute)">AES-256 encrypted .knbackup. Needs the password to restore (Settings, Restore backup). On phones this opens the share sheet.</small><label for="kad-pw">Backup password (min 8)</label><input id="kad-pw" type="password" autocomplete="new-password"><div class="kp-2"><button class="kp-pri" style="margin:10px 0 0" data-a="share">Create and share</button><button class="kp-pri kp-dng" style="margin:10px 0 0" data-a="export">Export all (plain JSON)</button></div></div>';
  h+='<div class="kp-c" style="margin-top:10px"><b>Data integrity</b><small style="display:block;color:var(--mute)">Re-calculates every invoice, payment and return and checks stock links.</small><button class="kp-pri" data-a="check">Run integrity check</button>'+(V.check?checkHtml():'')+'</div>';
  h+='<div class="kp-c kp-fm" style="margin-top:10px"><b>Import products (CSV)</b><small style="display:block;color:var(--mute)">Columns: name, sku, barcode, category, brand, unit, buy, sell, wholesale, min, opening, supplier, location. Duplicates are skipped.</small><div class="kp-2"><button class="kp-pri" style="margin:10px 0 0" data-a="tpl">Download template</button><button class="kp-pri" style="margin:10px 0 0" data-a="pick">Choose CSV file</button></div><input id="kad-csv" type="file" accept=".csv,text/csv" style="display:none">'+(V.imp?'<div style="margin-top:8px"><b>'+V.imp.added+' imported, '+V.imp.skipped+' skipped</b>'+V.imp.errors.slice(0,8).map(function(x){return '<small style="display:block;color:var(--warn)">'+esc(x)+'</small>'}).join('')+'</div>':'')+'</div>';
  return h;
}
function checkHtml(){
  var r=V.check,c=r.counts;
  return '<div style="margin-top:10px"><span class="kp-badge kp-'+(r.errors.length?'ou':r.warnings.length?'lo':'ok')+'">'+(r.errors.length?r.errors.length+' problem(s)':r.warnings.length?'OK with '+r.warnings.length+' warning(s)':'All checks passed')+'</span> <small style="color:var(--mute)">'+(c.products||0)+' products, '+(c.sales||0)+' sales, '+(c.purchases||0)+' purchases</small>'+
   r.errors.map(function(x){return '<small style="display:block;color:var(--warn)">'+esc(x)+'</small>'}).join('')+r.warnings.map(function(x){return '<small style="display:block;color:#ffa000">'+esc(x)+'</small>'}).join('')+'</div>';
}
async function render(){
  if(!root)return;var meta=[];try{meta=await listMeta()}catch(e){}
  var st=root.scrollTop;root.innerHTML='<div class="kp-h"><button data-a="back">&lsaquo; Back</button><b>Business and data tools</b></div><div class="kp-w">'+html(meta)+'</div>';root.scrollTop=st;
}
async function onClick(e){
  var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a');
  if(a==='back'){close();return}
  if(a==='nologo'){if(S.biz)delete S.biz.logo;save();render();return}
  if(a==='savecfg'){if(!can('settings_manage'))return;
    var pre=$('kad-pre').value.trim()||'INV-',tt=$('kad-tt').value.trim();
    if(!/^[A-Za-z0-9\-_/]{1,8}$/.test(pre))return toast('Invoice prefix: letters, numbers, - _ / (max 8)');
    if(tt!==''&&!(/^\d+(\.\d+)?$/.test(tt)&&+tt<=100))return toast('Default tax must be 0 to 100');
    S.cfg=S.cfg||{};S.biz=S.biz||{};var before=JSON.stringify([S.cfg.invPrefix,S.cfg.tradeTax,S.cfg.dateFmt,S.cfg.negStock,S.cfg.autoBackup,S.biz.tax]);
    S.cfg.invPrefix=pre;S.cfg.tradeTax=tt===''?undefined:+tt;S.cfg.dateFmt=$('kad-df').value;S.cfg.negStock=$('kad-neg').checked;S.cfg.autoBackup=$('kad-auto').checked;S.biz.tax=$('kad-taxno').value.trim();
    KN.audit(S,'update','settings','business',before,'saved');save();toast('Settings saved');return}
  if(a==='now'){try{await snapshot('manual');toast('Backup saved on this device');render()}catch(e){toast('Backup failed: '+e.message)}return}
  if(a==='restore'){restore(+b.getAttribute('data-ts'));return}
  if(a==='share'){shareBackup($('kad-pw').value);return}
  if(a==='export'){exportAll();return}
  if(a==='check'){V.check=check(S);render();return}
  if(a==='tpl'){knDownload(new Blob([csvTemplate()],{type:'text/csv'}),'khatanova-products-template.csv');return}
  if(a==='pick'){$('kad-csv').click();return}
}
function onChange(e){
  if(e.target.id==='kad-logo')readLogo(e.target.files&&e.target.files[0]);
  else if(e.target.id==='kad-csv'){var f=e.target.files&&e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){V.imp=importCsv(String(rd.result));if(V.imp)toast(V.imp.added+' product(s) imported');render()};rd.readAsText(f);e.target.value=''}
}
function open(){
  if(!can('settings_manage'))return;
  if(!root){var st=document.createElement('style');st.textContent=(window.KNP?KNP.css:'').replace(/#kp/g,'#kad')+'#kad{z-index:93}#kad .kp-mv small{display:block}#kad input[type=file]{padding:8px}';document.head.appendChild(st);
    root=document.createElement('div');root.id='kad';root.setAttribute('role','dialog');root.setAttribute('aria-label','Business and data tools');document.body.appendChild(root);
    root.addEventListener('click',onClick);root.addEventListener('change',onChange)}
  V.check=null;V.imp=null;render();root.className='';document.body.style.overflow='hidden';
}
function close(){if(root)root.className='hide';document.body.style.overflow=''}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-kadm]');if(!t)return;e.stopImmediatePropagation();e.preventDefault();if(document.querySelector('.lk:not(.hide)'))return;open()},true);
/* background jobs: once the database is open, take the daily backup and remind if backups are old */
var poll=setInterval(function(){if(typeof knReady!=='undefined'&&knReady){clearInterval(poll);setTimeout(function(){autoBackup().catch(function(e){console.warn('auto backup',e)});
  listMeta().then(function(m){var l=Math.max((m[0]||{}).ts||0,S.lbk?new Date(S.lbk).getTime():0);if(S.tx.length+S.sales.length+S.purchases.length>0&&Date.now()-l>7*86400000&&typeof toast==='function')toast('No backup for over a week. Open Settings and back up now.')}).catch(function(){})},2500)}},500);
window.KNADM={open:open,check:check,snapshot:snapshot,autoBackup:autoBackup,listMeta:listMeta,importCsv:importCsv,parseCsv:parseCsv,restore:restore,shareBackup:shareBackup};
})();
