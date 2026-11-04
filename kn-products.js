/* KhataNova 2030 - Product inventory module (Phase 2).
   Full-screen overlay; uses globals from the main app: S, save, toast, esc, today, CS, LOC and KN (kn-core.js).
   Legacy grades appear as products (migrated by KN.normalize) and keep their old stock history. */
(function(){
'use strict';
var UNITS=[['pcs','Pieces'],['box','Boxes'],['ctn','Cartons'],['kg','Kilograms'],['g','Grams'],['L','Litres'],['m','Metres'],['ft','Feet']];
var MT={opening:'Opening stock',purchase:'Purchase',sale:'Sale',return_in:'Sale return',return_out:'Purchase return',adjust:'Adjustment',damage:'Damaged',lost:'Lost',expired:'Expired',count:'Stock count',transfer_in:'Transfer in',transfer_out:'Transfer out',void_sale:'Sale voided',void_purchase:'Purchase voided'};
var IN_T={purchase:1,opening:1,return_in:1},OUT_T={sale:1,return_out:1};
var V={view:'dash',q:'',flt:'all',id:null,edit:null,img:''};
var root=null;

var CSS='#kp{position:fixed;inset:0;z-index:90;background:var(--bg);color:var(--ink);overflow:auto;-webkit-overflow-scrolling:touch;padding-bottom:40px}#kp.hide{display:none}'+
'#kp .kp-h{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 12px;background:linear-gradient(135deg,#1c2f8f,#4b3bd6 55%,#7c3aed);color:#fff}'+
'#kp .kp-h b{flex:1;font-size:1.1rem}#kp .kp-h button{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:12px;padding:8px 12px;backdrop-filter:blur(8px)}'+
'#kp .kp-w{max-width:900px;margin:0 auto;padding:14px}'+
'#kp .kp-t{display:flex;gap:6px;margin-bottom:12px}#kp .kp-t button{flex:1;background:var(--card);color:var(--mute);border:1px solid var(--line);border-radius:12px}#kp .kp-t button.on{background:linear-gradient(90deg,#3b5bff,#7c5cff);color:#fff;border-color:transparent}'+
'#kp .kp-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}'+
'#kp .kp-c{background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,0) 45%),var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;transition:transform .15s}#kp .kp-c small{display:block;color:var(--mute);font-size:.78rem}#kp .kp-c b{font-size:1.15rem}'+
'#kp .kp-c.warn b{color:var(--warn)}#kp .kp-c.ok b{color:var(--in)}'+
'#kp .kp-r{display:flex;gap:12px;align-items:center;cursor:pointer;margin-bottom:8px}#kp .kp-r:active{transform:scale(.99)}'+
'#kp .kp-im{width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,#3b5bff33,#7c5cff33);display:grid;place-items:center;font-weight:800;color:var(--ink);overflow:hidden;flex:none}#kp .kp-im img{width:100%;height:100%;object-fit:cover}'+
'#kp .kp-big{width:100%;max-width:220px;aspect-ratio:1;border-radius:18px;margin:0 auto 12px;font-size:3rem}'+
'#kp .kp-f{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}#kp .kp-f button{background:var(--card);color:var(--mute);border:1px solid var(--line);border-radius:20px;padding:6px 12px;font-size:.85rem}#kp .kp-f button.on{background:#3b5bff;color:#fff;border-color:#3b5bff}'+
'#kp .kp-fm label{display:block;font-size:.82rem;color:var(--mute);margin:10px 0 4px}#kp .kp-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
'#kp .kp-pri{background:linear-gradient(90deg,#3b5bff,#7c5cff);color:#fff;width:100%;margin-top:14px;padding:13px;border-radius:14px}#kp .kp-dng{background:transparent;color:var(--warn);border:1px solid var(--warn)}'+
'#kp .kp-mv{display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);font-size:.9rem}#kp .kp-mv small{display:block;color:var(--mute)}'+
'#kp .pos{color:var(--in);font-weight:700}#kp .neg{color:var(--warn);font-weight:700}#kp .kp-badge{font-size:.72rem;font-weight:700;border-radius:8px;padding:2px 8px}'+
'#kp .kp-ok{background:rgba(53,199,89,.16);color:var(--in)}#kp .kp-lo{background:rgba(255,160,0,.18);color:#ffa000}#kp .kp-ou{background:rgba(255,82,82,.18);color:var(--warn)}#kp .kp-off{background:rgba(127,127,127,.22);color:var(--mute)}'+
'#kp .kp-ico{width:18px;height:18px;vertical-align:-3px;margin-right:6px}'+
'@media(min-width:760px){#kp .kp-w{padding:22px}}@media print{#kp{display:none!important}}';

/* ---------- helpers ---------- */
function r3(n){return Math.round(n*1000)/1000}
function num(x){var n=Number(String(x==null?'':x).replace(/,/g,'').trim());return isFinite(n)?n:0}
function money(minor){var sym=(typeof CS==='string'&&CS)||'Rs',loc=(typeof LOC==='string'&&LOC)||'en-IN';return sym+' '+(minor/100).toLocaleString(loc,{maximumFractionDigits:2})}
function qty(n){return r3(n).toLocaleString((typeof LOC==='string'&&LOC)||'en-IN',{maximumFractionDigits:3})}
function pm(v){return KN.toMinor(v)}
function snap(p){var c=JSON.parse(JSON.stringify(p));if(c.image)c.image='[image]';return c}
function P(id){for(var i=0;i<S.products.length;i++)if(S.products[i].id===id)return S.products[i];return null}
function costOf(p){return p.avgCost!=null?p.avgCost:p.buyPrice}
function valMinor(q,p){return Math.round(q*(+costOf(p)||0)*100)}

function stockMap(){
  var m={},g={};
  S.tx.forEach(function(x){g[x.g]=(g[x.g]||0)+(x.t==='in'?+x.kg:-x.kg)});
  S.stockMoves.forEach(function(v){m[v.product]=(m[v.product]||0)+v.qty});
  S.products.forEach(function(p){m[p.id]=r3((m[p.id]||0)+(p.legacyGrade?(g[p.legacyGrade]||0):0))});
  return m;
}
function whStock(p){
  var m={},def=p.warehouse||'wh_main';S.warehouses.forEach(function(w){m[w.id]=0});
  S.stockMoves.forEach(function(v){if(v.product===p.id){var w=v.wh||def;m[w]=r3((m[w]||0)+v.qty)}});
  if(p.legacyGrade)S.tx.forEach(function(x){if(x.g===p.legacyGrade)m[def]=r3((m[def]||0)+(x.t==='in'?+x.kg:-x.kg))});
  return m;
}
function statusOf(p,q){if(!p.active)return['off','Inactive'];if(q<=0)return['ou','Out of stock'];if(q<=(+p.minStock||0))return['lo','Low stock'];return['ok','In stock']}
function movesOf(p){
  var a=S.stockMoves.filter(function(v){return v.product===p.id}).map(function(v){return{d:v.date||'',ts:v.ts||0,type:v.type,q:v.qty,note:v.note||'',rate:v.rate,cost:v.cost,rev:v.rev,cogs:v.cogs}});
  if(p.legacyGrade)S.tx.forEach(function(x){if(x.g!==p.legacyGrade)return;var ty=x.adj?'adjust':x.ret?(x.t==='in'?'return_in':'return_out'):x.pr?(x.t==='in'?'opening':'sale'):(x.t==='in'?'purchase':'sale');
    a.push({d:x.d||'',ts:+x.id||0,type:ty,q:x.t==='in'?+x.kg:-x.kg,note:(x.p?x.p+' ':'')+(x.pr?'Production ':'')+(x.n||''),rate:x.r,legacy:true,pr:!!x.pr})});
  a.sort(function(x,y){return (y.d+String(1e15+y.ts)).localeCompare(x.d+String(1e15+x.ts))});
  return a;
}
function ico(name){
  var p={box:'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',plus:'M12 5v14M5 12h14',search:'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4-4',back:'M15 18l-6-6 6-6'}[name];
  return '<svg class="kp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+p+'"/></svg>';
}
function thumb(p,cls){return '<div class="kp-im '+(cls||'')+'">'+(p.image?'<img alt="" src="'+esc(p.image)+'">':esc((p.name||'?').charAt(0).toUpperCase()))+'</div>'}

/* ---------- dashboard ---------- */
function dashStats(){
  var m=stockMap(),t=today(),o={n:S.products.length,q:0,buy:0,sell:0,low:0,out:0,tin:0,tout:0,adj:0};
  S.products.forEach(function(p){var q=m[p.id];if(p.active){if(q>0){o.q+=q;o.buy+=valMinor(q,p);o.sell+=KN.lineMinor(q,pm(p.sellPrice))}
    if(q<=0)o.out++;else if(q<=(+p.minStock||0))o.low++}});
  S.stockMoves.forEach(function(v){if(v.date!==t)return;if(IN_T[v.type])o.tin+=v.qty;else if(OUT_T[v.type])o.tout+=-v.qty;else if(v.type==='void_sale')o.tout-=v.qty;else if(v.type==='void_purchase')o.tin+=v.qty;else o.adj++});
  S.tx.forEach(function(x){if(x.d!==t)return;if(x.adj){o.adj++;return}if(x.t==='in')o.tin+=+x.kg;else o.tout+=+x.kg});
  o.q=r3(o.q);o.tin=r3(o.tin);o.tout=r3(o.tout);return o;
}
function tile(l,v,c){return '<div class="kp-c '+(c||'')+'"><small>'+l+'</small><b>'+v+'</b></div>'}
function dashHtml(){
  var o=dashStats();
  return '<div class="kp-g">'+tile('Total products',o.n)+tile('Total stock quantity',qty(o.q))+tile('Stock purchase value',money(o.buy))+tile('Stock sale value',money(o.sell),'ok')+
   tile('Low stock products',o.low,o.low?'warn':'')+tile('Out of stock',o.out,o.out?'warn':'')+tile("Today's stock in",qty(o.tin),'ok')+tile("Today's stock out",qty(o.tout))+tile('Stock adjustments today',o.adj)+'</div>'+
   (S.products.length?'':'<div class="kp-c">No products yet. Tap <b>New</b> to add your first product.</div>');
}

/* ---------- list ---------- */
function listHtml(){
  var m=stockMap(),q=V.q.toLowerCase().trim(),h='',n=0;
  S.products.slice().sort(function(a,b){return a.name.localeCompare(b.name)}).forEach(function(p){
    var s=statusOf(p,m[p.id]);
    if(V.flt==='low'&&s[0]!=='lo')return;if(V.flt==='out'&&s[0]!=='ou')return;if(V.flt==='off'&&p.active)return;if(V.flt==='active'&&!p.active)return;
    if(q&&[p.name,p.sku,p.barcode,p.category,p.brand].join(' ').toLowerCase().indexOf(q)<0)return;
    n++;h+='<div class="kp-c kp-r" data-a="open" data-id="'+esc(p.id)+'">'+thumb(p)+'<div style="flex:1;min-width:0"><b>'+esc(p.name)+'</b><small>'+esc([p.sku,p.category].filter(Boolean).join(' | ')||'—')+'</small></div>'+
      '<div style="text-align:right"><b>'+qty(m[p.id])+' '+esc(p.unit)+'</b><br><span class="kp-badge kp-'+s[0]+'">'+s[1]+'</span></div></div>'});
  return h||'<div class="kp-c">'+(S.products.length?'No product matches.':'No products yet. Tap <b>New</b> to add one.')+'</div>';
}
function fltHtml(){return '<div class="kp-f">'+[['all','All'],['active','Active'],['low','Low stock'],['out','Out of stock'],['off','Inactive']].map(function(f){return '<button data-a="flt" data-v="'+f[0]+'" class="'+(V.flt===f[0]?'on':'')+'">'+f[1]+'</button>'}).join('')+'</div>'}

/* ---------- detail ---------- */
function detailHtml(p){
  var m=stockMap(),q=m[p.id],s=statusOf(p,q),mv=movesOf(p),sold=0,bought=0,gp=0;
  mv.forEach(function(v){if(v.pr)return;if(v.type==='sale'){sold+=-v.q;if(v.rev!=null&&v.cogs!=null)gp+=v.rev-v.cogs}if(v.type==='purchase')bought+=v.q;if(v.type==='void_sale'){sold-=v.q;if(v.rev!=null&&v.cogs!=null)gp+=v.rev-v.cogs}if(v.type==='void_purchase'||v.type==='return_out')bought+=v.q;if(v.type==='return_in'){sold-=v.q;if(v.rev!=null&&v.cogs!=null)gp+=v.rev-v.cogs}});
  var val=q>0?valMinor(q,p):0;
  var rows=mv.slice(0,200).map(function(v){return '<div class="kp-mv"><div><b>'+esc(MT[v.type]||v.type)+'</b><small>'+esc(v.d)+(v.note?' | '+esc(v.note):'')+'</small></div><span class="'+(v.q>=0?'pos':'neg')+'">'+(v.q>=0?'+':'')+qty(v.q)+' '+esc(p.unit)+'</span></div>'}).join('');
  return '<div style="text-align:center">'+thumb(p,'kp-big')+'<h2 style="margin:0">'+esc(p.name)+'</h2><span class="kp-badge kp-'+s[0]+'">'+s[1]+'</span></div>'+
   '<div class="kp-g" style="margin-top:12px">'+tile('Available',qty(q)+' '+esc(p.unit))+tile('Stock valuation',money(val))+tile('Purchase price',money(pm(p.buyPrice)))+tile('Sale price',money(pm(p.sellPrice)))+tile('Wholesale price',money(pm(p.wholesalePrice)))+
   tile('Total purchased',qty(bought)+' '+esc(p.unit))+tile('Total sold',qty(sold)+' '+esc(p.unit))+tile('Gross profit',money(gp),gp>0?'ok':'')+tile('Low-stock alert at',qty(+p.minStock||0)+' '+esc(p.unit))+'</div>'+
   (S.warehouses.length>1?'<div class="kp-c" style="margin-bottom:10px"><small>Stock by warehouse</small>'+(function(){var w=whStock(p);return S.warehouses.map(function(x){return '<div class="kp-mv"><span>'+esc(x.name)+'</span><b>'+qty(w[x.id]||0)+' '+esc(p.unit)+'</b></div>'}).join('')})()+'</div>':'')+
   '<div class="kp-c"><small>Details</small>'+[['SKU',p.sku],['Barcode',p.barcode],['Category',p.category],['Brand',p.brand],['Supplier',p.supplier],['Storage',p.location],['Warehouse',(S.warehouses.filter(function(w){return w.id===p.warehouse})[0]||{}).name],['Description',p.desc]].filter(function(r){return r[1]}).map(function(r){return '<div class="kp-mv"><span>'+r[0]+'</span><b style="font-size:.95rem;text-align:right">'+esc(r[1])+'</b></div>'}).join('')+'</div>'+
   '<div class="kp-c" style="margin-top:10px"><small>Stock movement history</small>'+(rows||'<div style="padding:10px 0;color:var(--mute)">No movements yet.</div>')+'</div>'+
   (window.KNS?'<button class="kp-pri" data-a="adj" data-id="'+esc(p.id)+'">Adjust / transfer stock</button>':'')+
   '<button class="kp-pri" data-a="edit" data-id="'+esc(p.id)+'">Edit product</button>'+
   '<button class="kp-pri kp-dng" data-a="toggle" data-id="'+esc(p.id)+'">'+(p.active?'Mark inactive':'Mark active')+'</button>'+
   (p.legacyGrade?'':'<button class="kp-pri kp-dng" data-a="del" data-id="'+esc(p.id)+'">Delete product</button>');
}

/* ---------- form ---------- */
function fld(id,label,val,attrs){return '<div><label for="kpf-'+id+'">'+label+'</label><input id="kpf-'+id+'" value="'+esc(val==null?'':val)+'" '+(attrs||'')+'></div>'}
function formHtml(p){
  var isNew=!p,d=p||{unit:'pcs',active:true,warehouse:'wh_main',minStock:0},cats={},sups={};
  S.products.forEach(function(x){if(x.category)cats[x.category]=1});
  Object.keys(S.pt||{}).forEach(function(k){var e=S.pt[k];if(e&&e.t==='s'&&e.n)sups[e.n]=1});
  var std=UNITS.some(function(u){return u[0]===d.unit});
  return '<form class="kp-fm" data-a="save" novalidate><div style="text-align:center">'+thumb({name:d.name||'+',image:V.img},'kp-big')+'<input id="kpf-img" type="file" accept="image/*"><button type="button" class="kp-pri kp-dng" style="margin-top:6px" data-a="noimg">Remove image</button></div>'+
   fld('name','Product name *',d.name,(d.legacyGrade?'readonly':'')+' maxlength="80"')+
   '<div class="kp-2">'+fld('sku','SKU / product code (blank = auto)',d.sku,'maxlength="40"')+'<div><label for="kpf-barcode">Barcode</label><div style="display:flex;gap:6px"><input id="kpf-barcode" value="'+esc(d.barcode||'')+'" maxlength="40" inputmode="numeric"><button type="button" data-a="scan" class="ghost" style="white-space:nowrap">Scan</button></div></div></div>'+
   '<div class="kp-2">'+fld('category','Category',d.category,'list="kpl-cat" maxlength="40"')+fld('brand','Brand',d.brand,'maxlength="40"')+'</div>'+
   '<datalist id="kpl-cat">'+Object.keys(cats).map(function(c){return '<option value="'+esc(c)+'">'}).join('')+'</datalist>'+
   '<div class="kp-2"><div><label for="kpf-unit">Unit</label><select id="kpf-unit">'+UNITS.map(function(u){return '<option value="'+u[0]+'"'+(d.unit===u[0]?' selected':'')+'>'+u[1]+'</option>'}).join('')+'<option value="__c"'+(std?'':' selected')+'>Custom…</option></select></div>'+fld('cunit','Custom unit',std?'':d.unit,'maxlength="12" placeholder="e.g. bag"')+'</div>'+
   '<div class="kp-2">'+fld('buy','Purchase price',d.buyPrice||'','inputmode="decimal"')+fld('sell','Sale price',d.sellPrice||'','inputmode="decimal"')+'</div>'+
   '<div class="kp-2">'+fld('whp','Wholesale price',d.wholesalePrice||'','inputmode="decimal"')+fld('min','Minimum stock alert',d.minStock||'','inputmode="decimal"')+'</div>'+
   (isNew?fld('open','Opening stock',"",'inputmode="decimal" placeholder="0"'):'')+
   '<div class="kp-2">'+fld('supplier','Supplier',d.supplier,'list="kpl-sup" maxlength="60"')+fld('loc','Storage location',d.location,'maxlength="40"')+'</div>'+
   '<datalist id="kpl-sup">'+Object.keys(sups).map(function(c){return '<option value="'+esc(c)+'">'}).join('')+'</datalist>'+
   '<label for="kpf-wh">Warehouse</label><select id="kpf-wh">'+S.warehouses.map(function(w){return '<option value="'+esc(w.id)+'"'+(d.warehouse===w.id?' selected':'')+'>'+esc(w.name)+'</option>'}).join('')+'</select>'+
   '<label for="kpf-desc">Description</label><input id="kpf-desc" value="'+esc(d.desc||'')+'" maxlength="300">'+
   '<label><input id="kpf-act" type="checkbox" style="width:auto" '+(d.active!==false?'checked':'')+'> Active</label>'+
   '<button class="kp-pri" type="submit">'+(isNew?'Save product':'Save changes')+'</button></form>';
}
function val(id){var e=document.getElementById('kpf-'+id);return e?e.value.trim():''}
function nextSku(){var mx=0;S.products.forEach(function(p){var m=/^P-(\d+)$/.exec(p.sku||'');if(m)mx=Math.max(mx,+m[1])});return 'P-'+String(mx+1).padStart(4,'0')}
function saveForm(){
  if(window.KNA&&!KNA.guard('products_manage'))return;
  var id=V.edit,old=id?P(id):null,name=val('name'),sku=val('sku'),bc=val('barcode'),unit=val('unit')==='__c'?val('cunit'):val('unit');
  var buy=val('buy'),sell=val('sell'),wh=val('whp'),mn=val('min'),op=val('open');
  function bad(m){toast(m);return false}
  if(!name)return bad('Product name is required');
  if(!unit)return bad('Enter a unit');
  var nums=[['Purchase price',buy],['Sale price',sell],['Wholesale price',wh],['Minimum stock',mn],['Opening stock',op]];
  for(var i=0;i<nums.length;i++){if(nums[i][1]!==''&&(!/^\d+(\.\d+)?$/.test(nums[i][1].replace(/,/g,''))))return bad(nums[i][0]+' must be a positive number')}
  var dup=S.products.some(function(p){return p.id!==id&&p.name.toLowerCase()===name.toLowerCase()});if(dup)return bad('A product with this name already exists');
  if(sku&&S.products.some(function(p){return p.id!==id&&p.sku&&p.sku.toLowerCase()===sku.toLowerCase()}))return bad('This SKU is already used');
  if(bc&&S.products.some(function(p){return p.id!==id&&p.barcode&&p.barcode===bc}))return bad('This barcode is already used');
  var rec={name:name,sku:sku||(old&&old.sku)||nextSku(),barcode:bc,category:val('category'),brand:val('brand'),unit:unit,buyPrice:num(buy),sellPrice:num(sell),wholesalePrice:num(wh),
    minStock:num(mn),desc:val('desc'),supplier:val('supplier'),location:val('loc'),warehouse:val('wh')||'wh_main',active:document.getElementById('kpf-act').checked,image:V.img||''};
  if(old){
    if(old.legacyGrade)rec.name=old.name;
    var before=snap(old);Object.keys(rec).forEach(function(k){old[k]=rec[k]});old.updated=Date.now();KN.audit(S,'update','product',old.id,before,snap(old));
    save();toast('Product updated');V.id=old.id;V.view='detail';
  }else{
    rec.id=KN.uid('p');rec.created=Date.now();rec.kind='std';S.products.push(rec);
    var q=num(op);
    if(q>0)S.stockMoves.push({id:KN.uid('sm'),product:rec.id,qty:r3(q),type:'opening',date:today(),ts:Date.now(),wh:rec.warehouse,rate:rec.buyPrice,cost:rec.buyPrice,note:'Opening stock'});
    KN.audit(S,'create','product',rec.id,null,snap(rec));save();toast('Product saved');V.id=rec.id;V.view='detail';
  }
  V.edit=null;V.img='';render();return true;
}
function readImage(file){
  if(!file)return;var fr=new FileReader();
  fr.onload=function(){var im=new Image();im.onload=function(){var s=Math.min(1,320/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);V.img=c.toDataURL('image/jpeg',.8);var b=root.querySelector('.kp-big');if(b)b.innerHTML='<img alt="" src="'+V.img+'">'};
    im.onerror=function(){toast('Could not read this image')};im.src=fr.result};
  fr.onerror=function(){toast('Could not read this image')};fr.readAsDataURL(file);
}
/* camera barcode scan - only where the browser provides BarcodeDetector */
function scan(){
  if(!('BarcodeDetector'in window)||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Barcode scanning is not supported in this browser. Type the barcode.');return}
  var box=document.createElement('div');box.style.cssText='position:fixed;inset:0;z-index:99;background:#000;display:flex;flex-direction:column';
  box.innerHTML='<video playsinline muted style="flex:1;width:100%;object-fit:cover"></video><button style="margin:14px">Cancel</button>';document.body.appendChild(box);
  var v=box.querySelector('video'),stream,live=true,det=new BarcodeDetector();
  function stop(){live=false;if(stream)stream.getTracks().forEach(function(t){t.stop()});box.remove()}
  box.querySelector('button').onclick=stop;
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(s){stream=s;v.srcObject=s;v.play();
    (function tick(){if(!live)return;det.detect(v).then(function(r){if(r&&r.length){var e=document.getElementById('kpf-barcode');if(e)e.value=r[0].rawValue;stop()}else setTimeout(tick,250)}).catch(function(){setTimeout(tick,400)})})()}).catch(function(){stop();toast('Camera permission was not granted')});
}

/* ---------- shell ---------- */
function render(){
  if(!root)return;
  var title=V.view==='form'?(V.edit?'Edit product':'New product'):V.view==='detail'?'Product details':'Products';
  var body='';
  if(V.view==='dash')body=tabs()+dashHtml();
  else if(V.view==='list')body=tabs()+'<input id="kp-q" type="search" placeholder="Search name, SKU, barcode" value="'+esc(V.q)+'">'+fltHtml()+'<div id="kpl">'+listHtml()+'</div>';
  else if(V.view==='detail'){var p=P(V.id);if(!p){V.view='list';return render()}body=detailHtml(p)}
  else body=formHtml(V.edit?P(V.edit):null);
  root.innerHTML='<div class="kp-h"><button data-a="back">'+ico('back')+'Back</button><b>'+title+'</b>'+(V.view==='form'||V.view==='detail'?'':'<button data-a="add">'+ico('plus')+'New</button>')+'</div><div class="kp-w">'+body+'</div>';
  root.scrollTop=0;
}
function tabs(){return '<div class="kp-t"><button data-a="view" data-v="dash" class="'+(V.view==='dash'?'on':'')+'">Dashboard</button><button data-a="view" data-v="list" class="'+(V.view==='list'?'on':'')+'">Products</button></div>'}

function onClick(e){
  var b=e.target.closest('[data-a]');if(!b||!root.contains(b))return;var a=b.getAttribute('data-a'),id=b.getAttribute('data-id');
  if(a==='save')return;
  if(a==='close'||(a==='back'&&(V.view==='dash'||V.view==='list'))){close();return}
  if(a==='back'){if(V.view==='form'&&V.edit){V.view='detail';V.id=V.edit}else V.view='list';V.edit=null;V.img='';render();return}
  if(a==='view'){V.view=b.getAttribute('data-v');render()}
  else if(a==='flt'){V.flt=b.getAttribute('data-v');render()}
  else if(a==='add'){V.edit=null;V.img='';V.view='form';render()}
  else if(a==='open'){V.id=id;V.view='detail';render()}
  else if(a==='edit'){V.edit=id;V.img=(P(id)||{}).image||'';V.view='form';render()}
  else if(a==='noimg'){V.img='';var big=root.querySelector('.kp-big');if(big)big.textContent=(val('name')||'?').charAt(0).toUpperCase()}
  else if(a==='scan')scan();
  else if(a==='adj'){if(window.KNS)KNS.open(id)}
  else if(a==='toggle'){if(window.KNA&&!KNA.guard('products_manage'))return;var p=P(id);if(p){var bf=snap(p);p.active=!p.active;KN.audit(S,p.active?'activate':'deactivate','product',p.id,bf,snap(p));save();toast(p.active?'Product activated':'Product marked inactive');render()}}
  else if(a==='del'){if(window.KNA&&!KNA.guard('delete_records'))return;var q=P(id);if(!q)return;
    if(q.legacyGrade||movesOf(q).length){toast('This product has stock history. Mark it inactive instead.');return}
    if(!confirm('Delete "'+q.name+'"? This cannot be undone.'))return;
    KN.audit(S,'delete','product',q.id,snap(q),null);S.products.splice(S.products.indexOf(q),1);save();toast('Product deleted');V.view='list';render()}
}
function open(view){
  if(!root){var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);root=document.createElement('div');root.id='kp';root.setAttribute('role','dialog');root.setAttribute('aria-label','Product inventory');document.body.appendChild(root);
    root.addEventListener('click',onClick);
    root.addEventListener('submit',function(e){e.preventDefault();saveForm()});
    root.addEventListener('input',function(e){if(e.target.id==='kp-q'){V.q=e.target.value;var l=document.getElementById('kpl');if(l)l.innerHTML=listHtml()}});
    root.addEventListener('change',function(e){if(e.target.id==='kpf-img')readImage(e.target.files&&e.target.files[0])});}
  V.view=view||'dash';V.edit=null;V.img='';render();root.className='';document.body.style.overflow='hidden';
}
function close(){if(root)root.className='hide';document.body.style.overflow='';if(typeof render==='function'&&window.render!==undefined){try{window.render()}catch(e){}}if(window.KNR)KNR.refresh()}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-kprod]');if(!t)return;e.stopImmediatePropagation();e.preventDefault();
  var lk=document.querySelector('.lk:not(.hide)');if(lk)return;open(t.getAttribute('data-kprod')||'dash')},true);
window.KNP={label:function(t){return MT[t]||t},refresh:function(){render()},whStock:whStock,css:CSS,getProduct:P,r3:r3,open:open,close:close,stockMap:stockMap,movesOf:movesOf,dashStats:dashStats,saveForm:saveForm};
})();
