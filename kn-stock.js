/* KhataNova 2030 - Stock adjustments, losses, physical count, warehouse transfers (Phase 4).
   Every change needs a reason, writes stock-movement rows and an audit record. Nothing is deleted. */
(function(){
'use strict';
var root=null,V={id:null,mode:'damage',key:null};
var MODES=[['damage','Damaged goods (stock out)'],['lost','Lost stock (stock out)'],['expired','Expired goods (stock out)'],['correct','Manual correction (+ / -)'],['count','Physical stock count'],['opening','Opening stock adjustment (stock in)'],['transfer','Warehouse to warehouse transfer']];
function loc(){return (typeof LOC==='string'&&LOC)||'en-IN'}
function money(m){return ((typeof CS==='string'&&CS)||'Rs')+' '+(m/100).toLocaleString(loc(),{maximumFractionDigits:2})}
function qty(n){return (Math.round(n*1000)/1000).toLocaleString(loc(),{maximumFractionDigits:3})}
function r3(n){return Math.round(n*1000)/1000}
function P(){return KNP.getProduct(V.id)}
function num(x){x=String(x==null?'':x).replace(/,/g,'').trim();return /^-?\d+(\.\d+)?$/.test(x)?Number(x):NaN}
function wname(id){var w=S.warehouses.filter(function(x){return x.id===id})[0];return w?w.name:id}
function wopts(sel){return S.warehouses.filter(function(w){return w.active!==false}).map(function(w){return '<option value="'+esc(w.id)+'"'+(w.id===sel?' selected':'')+'>'+esc(w.name)+'</option>'}).join('')}
function g(i){var e=document.getElementById('kj-'+i);return e?e.value.trim():''}
function html(){
  var p=P(),ws=KNP.whStock(p),def=p.warehouse||'wh_main';
  return '<div class="kp-h"><button data-a="x">&lsaquo; Back</button><b>Adjust stock</b></div><div class="kp-w"><form class="kp-fm" data-a="go" novalidate>'+
   '<div class="kp-c"><b>'+esc(p.name)+'</b><small>Total in stock: '+qty(KNP.stockMap()[p.id])+' '+esc(p.unit)+'</small></div>'+
   '<label for="kj-mode">Type of adjustment</label><select id="kj-mode">'+MODES.map(function(m){return '<option value="'+m[0]+'"'+(m[0]===V.mode?' selected':'')+'>'+m[1]+'</option>'}).join('')+'</select>'+
   '<div class="kp-2"><div><label for="kj-wh" id="kj-whl">Warehouse</label><select id="kj-wh">'+wopts(def)+'</select></div><div id="kj-towrap"><label for="kj-to">Transfer to</label><select id="kj-to">'+wopts(S.warehouses.filter(function(w){return w.id!==def})[0]&&S.warehouses.filter(function(w){return w.id!==def})[0].id)+'</select></div></div>'+
   '<div class="kp-c" id="kj-here" style="margin-top:8px"></div>'+
   '<label for="kj-q" id="kj-ql">Quantity</label><input id="kj-q" inputmode="decimal" placeholder="0">'+
   '<label for="kj-d">Date</label><input id="kj-d" type="date" value="'+today()+'">'+
   '<label for="kj-r">Reason * (saved in the audit history)</label><input id="kj-r" maxlength="140" placeholder="e.g. water damage in godown">'+
   '<button class="kp-pri" type="submit">Save adjustment</button><button type="button" class="kp-pri kp-dng" data-a="wh">Add warehouse</button></form></div>';
}
function sync(){
  var p=P(),m=g('mode'),ws=KNP.whStock(p),w=g('wh');
  var tw=document.getElementById('kj-towrap');if(tw)tw.style.display=m==='transfer'?'':'none';
  var l=document.getElementById('kj-ql');if(l)l.textContent=m==='count'?'Counted quantity (actual)':m==='correct'?'Correction (use - to reduce)':'Quantity';
  var h=document.getElementById('kj-here');if(h)h.innerHTML='<small>In '+esc(wname(w))+'</small><b>'+qty(ws[w]||0)+' '+esc(p.unit)+'</b>';
}
function open(id){
  if(window.KNA&&!KNA.guard('stock_adjust'))return;
  V.id=id;V.mode='damage';V.key=KN.uid('k');
  if(!root){root=document.createElement('div');root.id='kj';root.setAttribute('role','dialog');document.body.appendChild(root);
    var st=document.createElement('style');st.textContent=(window.KNP?KNP.css:'').replace(/#kp/g,'#kj')+'#kj{z-index:92}';document.head.appendChild(st);
    root.addEventListener('click',onClick);root.addEventListener('change',function(e){if(e.target.id==='kj-mode'||e.target.id==='kj-wh'){V.mode=g('mode');sync()}});
    root.addEventListener('submit',function(e){e.preventDefault();go()})}
  root.innerHTML=html();root.className='';sync();
}
function close(){if(root)root.className='hide';if(window.KNP)KNP.refresh();if(window.KNR)KNR.refresh()}
function onClick(e){
  var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a');
  if(a==='x')close();
  else if(a==='wh'){var n=(prompt('Warehouse name')||'').trim();if(!n)return;
    if(S.warehouses.some(function(w){return w.name.toLowerCase()===n.toLowerCase()}))return toast('This warehouse already exists');
    var w={id:KN.uid('wh'),name:n,active:true,created:Date.now()};S.warehouses.push(w);KN.audit(S,'create','warehouse',w.id,null,w);save();
    var keep={m:g('mode'),q:g('q'),r:g('r')};root.innerHTML=html();root.querySelector('#kj-mode').value=keep.m;root.querySelector('#kj-q').value=keep.q;root.querySelector('#kj-r').value=keep.r;V.mode=keep.m;sync();toast('Warehouse added')}
}
function go(){
  if(window.KNA&&!KNA.guard('stock_adjust'))return;
  var p=P(),mode=g('mode'),wh=g('wh'),to=g('to'),reason=g('r'),date=g('d')||today(),q=num(g('q'));
  function bad(m){toast(m);return false}
  if(!p)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return bad('Choose a valid date');
  if(isNaN(q))return bad('Enter a valid quantity');
  if(Math.round(q*1000)/1000!==q)return bad('Use at most 3 decimals');
  if(!reason)return bad('A reason is required for every adjustment');
  var ws=KNP.whStock(p),here=ws[wh]||0,neg=!!(S.cfg&&S.cfg.negStock),total=KNP.stockMap()[p.id],ts=Date.now(),avg=p.avgCost!=null?+p.avgCost:(+p.buyPrice||0),moves=[],label='';
  function mv(type,qq,whid,extra){var m={id:KN.uid('sm'),product:p.id,qty:r3(qq),type:type,date:date,ts:ts+moves.length,wh:whid,ref:null,note:reason,cost:avg,rev:null,cogs:null};if(extra)for(var k in extra)m[k]=extra[k];moves.push(m)}
  if(mode==='damage'||mode==='lost'||mode==='expired'){
    if(!(q>0))return bad('Quantity must be more than zero');
    if(!neg&&q>here+1e-9)return bad('Only '+qty(here)+' '+p.unit+' available in '+wname(wh));
    mv(mode,-q,wh,{loss:Math.round(q*avg*100)});label=mode;
  }else if(mode==='correct'){
    if(q===0)return bad('Correction cannot be zero');
    if(q<0&&!neg&&-q>here+1e-9)return bad('Only '+qty(here)+' '+p.unit+' available in '+wname(wh));
    mv('adjust',q,wh);label='correction';
  }else if(mode==='count'){
    if(q<0)return bad('Counted quantity cannot be negative');
    var diff=r3(q-here);
    if(diff===0){KN.audit(S,'count',p.id,p.id,{system:here},{counted:q,warehouse:wh,reason:reason});save();toast('Count matches the system. No change needed.');close();return true}
    mv('count',diff,wh);label='count';
  }else if(mode==='opening'){
    if(!(q>0))return bad('Quantity must be more than zero');mv('opening',q,wh);label='opening';
  }else if(mode==='transfer'){
    if(!to||to===wh)return bad('Choose a different destination warehouse');
    if(!(q>0))return bad('Quantity must be more than zero');
    if(!neg&&q>here+1e-9)return bad('Only '+qty(here)+' '+p.unit+' available in '+wname(wh));
    mv('transfer_out',-q,wh,{note:reason+' (to '+wname(to)+')'});mv('transfer_in',q,to,{note:reason+' (from '+wname(wh)+')'});label='transfer';
  }else return bad('Choose an adjustment type');
  if(!KN.once(S,'adj:'+V.key))return bad('This adjustment was already saved');
  var u=S.stockMoves.length,au=S.audit.length;
  try{
    moves.forEach(function(m){S.stockMoves.push(m)});
    KN.audit(S,'stock-'+label,'product',p.id,{total:total,warehouse:wh,warehouseQty:here},{total:KNP.stockMap()[p.id],reason:reason,moves:moves.map(function(m){return{type:m.type,qty:m.qty,wh:m.wh}})});
    save();toast('Stock adjustment saved');close();return true;
  }catch(err){console.error('KhataNova adjust rollback',err);S.stockMoves.length=u;S.audit.length=au;delete S.meta.keys['adj:'+V.key];toast('Could not save. Nothing was changed.');return false}
}
window.KNS={open:open};
})();
