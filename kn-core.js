/* KhataNova 2030 core: decimal-safe money, ids, audit log, additive schema + migration.
   Never deletes or rewrites legacy records (grades, tx, ph, pt, cash, ...). */
(function(root){
'use strict';
var SCHEMA=2;
var NEW_ARRAYS=['products','warehouses','purchases','sales','stockMoves','accounts','audit','users','categories','quotes'];

/* ---- decimal-safe money: integers in minor units (paisa) ---- */
function toMinor(x){
  if(x===null||x===undefined||x==='')return 0;
  var s=String(x).trim().replace(/,/g,''),neg=false;
  if(s[0]==='-'){neg=true;s=s.slice(1)}
  if(!/^\d*\.?\d*$/.test(s)||s===''||s==='.')return 0;
  var p=s.split('.'),w=p[0]||'0',fr=(p[1]||'');
  var third=fr.length>2?+fr[2]:0;           /* round half up on 3rd decimal */
  var m=parseInt(w,10)*100+parseInt((fr+'00').slice(0,2),10)+(third>=5?1:0);
  return neg?-m:m;
}
function fromMinor(m){return Math.round(m)/100}
function fmt(m,dec){var v=fromMinor(m);return dec===undefined?v.toFixed(2):v.toFixed(dec)}
/* qty (up to 3 decimals) x rate (minor units) -> minor units, no float drift */
function lineMinor(qty,rateMinor){
  var q=Math.round(Number(qty)*1000);
  return Math.round(q*rateMinor/1000);
}
function pct(minor,rate){return Math.round(minor*Number(rate||0)/100)}

/* ---- ids ---- */
var seq=0;
function uid(prefix){
  seq=(seq+1)%1679616;
  var r=Math.floor(Math.random()*46656).toString(36);
  return (prefix||'id')+'_'+Date.now().toString(36)+seq.toString(36)+r;
}

/* ---- audit ---- */
function audit(S,action,entity,id,before,after,user){
  S.audit=Array.isArray(S.audit)?S.audit:[];
  var e={id:uid('au'),ts:Date.now(),action:action,entity:entity,ref:id,
    by:user||'owner',before:before===undefined?null:JSON.parse(JSON.stringify(before)),
    after:after===undefined?null:JSON.parse(JSON.stringify(after))};
  S.audit.push(e);return e;
}

/* ---- duplicate guard: idempotency keys ---- */
function once(S,key){
  S.meta=S.meta||{};S.meta.keys=S.meta.keys||{};
  if(S.meta.keys[key])return false;
  S.meta.keys[key]=Date.now();return true;
}

/* ---- schema normalisation + migration (additive) ---- */
function normalize(d){
  d=d&&typeof d==='object'?d:{};
  NEW_ARRAYS.forEach(function(k){d[k]=Array.isArray(d[k])?d[k]:[]});
  d.meta=d.meta&&typeof d.meta==='object'?d.meta:{};
  d.meta.keys=d.meta.keys&&typeof d.meta.keys==='object'?d.meta.keys:{};
  if(!d.warehouses.length)d.warehouses.push({id:'wh_main',name:'Main',active:true,created:Date.now()});
  if(!d.accounts.some(function(a){return a.type==='cash'}))d.accounts.push({id:'ac_cash',type:'cash',name:'Cash',opening:0,active:true});
  if(!d.users.length)d.users.push({id:'u_owner',name:'Owner',role:'owner',active:true,created:Date.now()});
  migrateGrades(d);
  d.meta.schema=SCHEMA;
  return d;
}
function migrateGrades(d){
  var have={};d.products.forEach(function(p){if(p.legacyGrade)have[p.legacyGrade]=1});
  (d.grades||[]).forEach(function(g){
    if(!g||!g.n||have[g.n])return;
    var wq=0,wv=0;(d.tx||[]).forEach(function(x){if(x.g===g.n&&x.t==='in'&&!x.adj&&!x.pr&&!x.ret&&+x.r>0&&+x.kg>0){wq+=+x.kg;wv+=(+x.kg)*(+x.r)}});
    var avg=wq?Math.round(wv/wq*100)/100:0;
    d.products.push({id:uid('p'),name:g.n,sku:'',barcode:'',category:g.k==='fin'?'Finished':'Raw',brand:'',
      unit:(d.cfg&&d.cfg.unit)||'kg',buyPrice:avg,sellPrice:0,wholesalePrice:0,minStock:Number(g.m)||0,
      desc:'',supplier:'',location:'',image:'',active:true,kind:g.k==='fin'?'fin':'raw',
      legacyGrade:g.n,warehouse:'wh_main',created:Date.now()});
    have[g.n]=1;
  });
}

/* ---- stock: legacy tx + new stock moves, one source of truth ---- */
function stockOf(d,p){
  var s=0;
  if(p.legacyGrade)(d.tx||[]).forEach(function(x){if(x.g===p.legacyGrade)s+=x.t==='in'?+x.kg:-x.kg});
  (d.stockMoves||[]).forEach(function(m){if(m.product===p.id)s+=m.qty});
  return Math.round(s*1000)/1000;
}

root.KN={SCHEMA:SCHEMA,toMinor:toMinor,fromMinor:fromMinor,fmt:fmt,lineMinor:lineMinor,pct:pct,
  uid:uid,audit:audit,once:once,normalize:normalize,migrateGrades:migrateGrades,stockOf:stockOf};
if(typeof module!=='undefined')module.exports=root.KN;
})(typeof window!=='undefined'?window:globalThis);
