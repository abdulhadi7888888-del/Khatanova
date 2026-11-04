/* KhataNova 2030 - Sales & Purchases (Phase 3).
   One document = one source of truth. Party ledger lines and cash/bank balances are DERIVED from
   S.sales / S.purchases (hooks KNT.partyLines / KNT.cashLines), so nothing is ever posted twice.
   Money in documents is integer minor units (paisa). Stock cost = weighted average (p.avgCost). */
(function(){
'use strict';
var root=null,V={view:'hub',tab:'sale',kind:'sale',id:null,q:'',key:null,rows:[],busy:false,lastAuto:{}};
var SL={paid:'Paid',partial:'Partial',unpaid:'Unpaid'};

function loc(){return (typeof LOC==='string'&&LOC)||'en-IN'}
function money(m){return ((typeof CS==='string'&&CS)||'Rs')+' '+(m/100).toLocaleString(loc(),{maximumFractionDigits:2})}
function qty(n){return (Math.round(n*1000)/1000).toLocaleString(loc(),{maximumFractionDigits:3})}
function r3(n){return Math.round(n*1000)/1000}
function pkey(n){return String(n||'').trim().toLowerCase()}
function P(id){return KNP.getProduct(id)}
function methods(){return [['cash','Cash']].concat(S.accounts.filter(function(a){return a.type==='bank'&&a.active!==false}).map(function(a){return[a.id,a.name]}))}
function mName(id){if(id==='cash')return'Cash';var a=S.accounts.filter(function(x){return x.id===id})[0];return a?a.name:'Account'}
function docs(kind){return kind==='sale'?S.sales:kind==='quote'?S.quotes:S.purchases}
function findDoc(id){return S.sales.concat(S.purchases,S.quotes).filter(function(d){return d.id===id})[0]}
function retTotal(d){return (d.returns||[]).reduce(function(a,r){return a+r.amount},0)}
function refTotal(d){return (d.returns||[]).reduce(function(a,r){return a+(r.refund?r.refund.amount:0)},0)}
function netTotal(d){return d.total-retTotal(d)}
function paidNet(d){return d.paid-refTotal(d)}
function dueOf(d){return netTotal(d)-paidNet(d)}
function statusOf(d){return dueOf(d)<=0?'paid':paidNet(d)>0?'partial':'unpaid'}
function paidUpTo(d,pay){var t=0;for(var i=0;i<d.payments.length;i++){t+=d.payments[i].amount;if(d.payments[i]===pay)break}return t}
function profitOf(d){var r=0;(d.returns||[]).forEach(function(x){r+=x.net-(x.cogs||0)});return d.profit-r}
function remaining(d,idx){var q=d.items[idx].qty;(d.returns||[]).forEach(function(r){r.items.forEach(function(i){if(i.idx===idx)q-=i.qty})});return Math.round(q*1000)/1000}
function pnum(x){x=String(x==null?'':x).replace(/,/g,'').trim();return /^\d+(\.\d+)?$/.test(x)?Number(x):NaN}
function taxDefault(){return S.cfg&&S.cfg.tradeTax!=null?+S.cfg.tradeTax:(typeof TX==='number'?TX:0)}

/* ================= derived ledger / cash ================= */
function summary(d){return d.items.map(function(i){return i.name+' x'+qty(i.qty)}).join(', ')}
function partyLines(k){
  var L=[];
  S.sales.forEach(function(d){if(d.void||d.pk!==k)return;
    L.push({d:d.date,id:d.ts,s:'Sale '+d.no+': '+summary(d),a:d.total/100,v:d.total/100,n:d.note||'',det:'Sold: '+summary(d)});
    d.payments.forEach(function(p,i){L.push({d:p.date,id:p.ts||d.ts+i+1,s:'Payment received ('+mName(p.method)+') '+d.no,a:p.amount/100,v:-p.amount/100,n:''})});
    (d.returns||[]).forEach(function(r){L.push({d:r.date,id:r.ts,s:'Sales return '+r.no,a:r.amount/100,v:-r.amount/100,n:r.reason||''});if(r.refund)L.push({d:r.date,id:r.ts+1,s:'Refund paid ('+mName(r.refund.method)+') '+r.no,a:r.refund.amount/100,v:r.refund.amount/100,n:''})})});
  S.purchases.forEach(function(d){if(d.void||d.pk!==k)return;
    L.push({d:d.date,id:d.ts,s:'Purchase '+d.no+': '+summary(d),a:d.total/100,v:-d.total/100,n:(d.invNo?'Inv '+d.invNo:'')+(d.note?' '+d.note:''),det:'Bought: '+summary(d)});
    d.payments.forEach(function(p,i){L.push({d:p.date,id:p.ts||d.ts+i+1,s:'Payment given ('+mName(p.method)+') '+d.no,a:p.amount/100,v:p.amount/100,n:''})});
    (d.returns||[]).forEach(function(r){L.push({d:r.date,id:r.ts,s:'Purchase return '+r.no,a:r.amount/100,v:r.amount/100,n:r.reason||''});if(r.refund)L.push({d:r.date,id:r.ts+1,s:'Refund received ('+mName(r.refund.method)+') '+r.no,a:r.refund.amount/100,v:-r.refund.amount/100,n:''})})});
  return L;
}
function cashLines(){
  var L=[];
  S.sales.forEach(function(d){if(d.void)return;d.payments.forEach(function(p,i){if(p.method==='cash')L.push({d:p.date,id:p.ts||d.ts+i,s:'Sale '+d.no+(d.party?': '+d.party:''),v:p.amount/100})});(d.returns||[]).forEach(function(r){if(r.refund&&r.refund.method==='cash')L.push({d:r.date,id:r.ts+1,s:'Refund '+r.no+(d.party?': '+d.party:''),v:-r.refund.amount/100})})});
  S.purchases.forEach(function(d){if(d.void)return;d.payments.forEach(function(p,i){if(p.method==='cash')L.push({d:p.date,id:p.ts||d.ts+i,s:'Purchase '+d.no+': '+d.party,v:-p.amount/100})});(d.returns||[]).forEach(function(r){if(r.refund&&r.refund.method==='cash')L.push({d:r.date,id:r.ts+1,s:'Refund received '+r.no+': '+d.party,v:r.refund.amount/100})})});
  return L;
}
function balances(){
  var c=0;
  S.cash.forEach(function(x){c+=x.t==='in'?+x.a:-x.a});
  S.pay.forEach(function(y){if(y.k==='rcv')c+=+y.a;else if(y.k==='gv')c-=+y.a});
  S.exp.forEach(function(x){c-=+x.a});S.sp.forEach(function(x){c-=+x.a});
  var cash=Math.round(c*100),bank={};
  S.accounts.forEach(function(a){if(a.type==='bank')bank[a.id]=+a.opening||0});
  function mv(m,v){if(m==='cash')cash+=v;else if(bank[m]!==undefined)bank[m]+=v}
  function add(d,sign){if(d.void)return;d.payments.forEach(function(p){mv(p.method,sign*p.amount)});(d.returns||[]).forEach(function(r){if(r.refund)mv(r.refund.method,-sign*r.refund.amount)})}
  S.sales.forEach(function(d){add(d,1)});S.purchases.forEach(function(d){add(d,-1)});
  var cashOpen=S.accounts.filter(function(a){return a.type==='cash'})[0];if(cashOpen)cash+=+cashOpen.opening||0;
  return{cash:cash,banks:S.accounts.filter(function(a){return a.type==='bank'&&a.active!==false}).map(function(a){return{id:a.id,name:a.name,bal:bank[a.id]}})};
}

/* ================= calculation ================= */
function calc(rows,taxRate){
  var it=[],sub=0,dis=0;
  rows.forEach(function(r){var g=KN.lineMinor(r.qty,r.rate),d=Math.min(r.disc,g);it.push({product:r.product,qty:r.qty,rate:r.rate,disc:d,gross:g,net:g-d});sub+=g;dis+=d});
  var taxable=sub-dis,tax=KN.pct(taxable,taxRate);
  return{items:it,subtotal:sub,discount:dis,taxable:taxable,tax:tax,total:taxable+tax};
}
function readRows(){
  var out=[],err='';
  V.rows.forEach(function(r,i){
    if(err)return;if(!r.product&&r.qty===''&&r.rate==='')return;
    var n=i+1;
    if(!r.product){err='Row '+n+': choose a product';return}
    var q=pnum(r.qty),rt=pnum(r.rate),d=r.disc===''?0:pnum(r.disc);
    if(!(q>0)||Math.round(q*1000)/1000!==q){err='Row '+n+': enter a valid quantity (max 3 decimals)';return}
    if(isNaN(rt)){err='Row '+n+': enter a valid rate';return}
    if(isNaN(d)){err='Row '+n+': enter a valid discount';return}
    out.push({product:r.product,qty:q,rate:KN.toMinor(rt),disc:KN.toMinor(d)});
  });
  if(!err&&!out.length)err='Add at least one product';
  return{rows:out,err:err};
}
function readForm(){
  function g(i){var e=document.getElementById('ktf-'+i);return e?e.value.trim():''}
  return{party:g('party'),date:g('date')||today(),inv:g('inv'),note:g('note'),tax:g('tax'),status:g('st')||'paid',paid:g('paid'),method:g('method')||'cash'};
}

/* ================= posting (all-or-nothing) ================= */
function post(kind){
  if(V.busy)return;
  if(window.KNA&&!KNA.guard(kind==='purchase'?'purchase_create':'sales_create'))return;
  if(kind==='quote')return postQuote();
  var f=readForm(),rr=readRows();
  function bad(m){toast(m);return false}
  if(rr.err)return bad(rr.err);
  var taxRate=f.tax===''?0:pnum(f.tax);if(isNaN(taxRate)||taxRate>100)return bad('Enter a valid tax % (0-100)');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date))return bad('Choose a valid date');
  var c=calc(rr.rows,taxRate),sm=KNP.stockMap(),need={};
  for(var i=0;i<rr.rows.length;i++){var p=P(rr.rows[i].product);if(!p||!p.active)return bad('A selected product is missing or inactive');if(c.items[i].net<0)return bad('Discount is larger than the line amount');need[p.id]=(need[p.id]||0)+rr.rows[i].qty}
  var neg=!!(S.cfg&&S.cfg.negStock);
  if(kind==='sale'&&!neg)for(var id in need){if(need[id]>sm[id]+1e-9)return bad('Not enough stock for '+P(id).name+'. Available: '+qty(sm[id])+' '+P(id).unit)}
  var paid=0;
  if(f.status==='paid')paid=c.total;
  else if(f.status==='partial'){var pv=pnum(f.paid);if(isNaN(pv)||!(pv>0))return bad('Enter the amount paid');paid=KN.toMinor(pv);if(paid>=c.total)return bad('Partial amount must be less than the total')}
  if(c.total<=0&&f.status!=='paid')return bad('Total must be more than zero');
  if(paid>0&&!methods().some(function(m){return m[0]===f.method}))return bad('Choose a payment method');
  var name=f.party,k=pkey(name);
  if(kind==='purchase'&&!name)return bad('Select a supplier');
  if(kind==='sale'&&!name&&paid<c.total)return bad('Select a customer for credit or partial sales');
  if(kind==='purchase'&&f.inv&&S.purchases.some(function(d){return!d.void&&d.pk===k&&d.invNo&&d.invNo.toLowerCase()===f.inv.toLowerCase()}))return bad('This supplier invoice number is already recorded');
  if(!KN.once(S,'trade:'+V.key))return bad('This entry was already saved');
  /* ---- apply: validated, now mutate in one synchronous block with rollback ---- */
  V.busy=true;
  var undo={moves:S.stockMoves.length,pt:null,prod:{},arr:docs(kind).length,seqv:(S.meta.seq||{})[kind],ptNew:false,aud:S.audit.length};
  try{
    S.meta.seq=S.meta.seq||{};var no=(kind==='sale'?(S.cfg.invPrefix||'INV-'):'PUR-')+String((S.meta.seq[kind]||0)+1).padStart(6,'0');
    var run={},cogsT=0,items=[],ts=Date.now();
    c.items.forEach(function(it,i){
      var p=P(it.product);if(!undo.prod[p.id])undo.prod[p.id]={avgCost:p.avgCost,buyPrice:p.buyPrice};
      var qB=run[p.id]!==undefined?run[p.id]:sm[p.id],base=p.avgCost!=null?+p.avgCost:(+p.buyPrice||0),mv={id:KN.uid('sm'),product:p.id,date:f.date,ts:ts+i,wh:p.warehouse||'wh_main',ref:null,no:no,note:(name||'Walk-in')+' '+no};
      var rec={product:p.id,name:p.name,unit:p.unit,qty:it.qty,rate:it.rate,disc:it.disc,net:it.net};
      if(kind==='sale'){
        var cogs=Math.round(it.qty*base*100);rec.cogs=cogs;rec.cost=base;cogsT+=cogs;if(p.avgCost==null)p.avgCost=base;
        mv.qty=-it.qty;mv.type='sale';mv.rate=it.rate/100;mv.cost=base;mv.rev=it.net;mv.cogs=cogs;run[p.id]=r3(qB-it.qty);
      }else{
        var qb=Math.max(qB,0);p.avgCost=(qb*base+it.net/100)/(qb+it.qty);p.buyPrice=Math.round(it.rate)/100;
        mv.qty=it.qty;mv.type='purchase';mv.rate=it.rate/100;mv.cost=it.net/it.qty/100;mv.rev=null;mv.cogs=null;run[p.id]=r3(qB+it.qty);
      }
      items.push(rec);S.stockMoves.push(mv);
    });
    var doc={id:KN.uid(kind==='sale'?'sl':'pu'),no:no,kind:kind,date:f.date,party:name,pk:k,items:items,subtotal:c.subtotal,discount:c.discount,taxRate:taxRate,tax:c.tax,total:c.total,
      payments:[],paid:paid,status:paid>=c.total?'paid':paid>0?'partial':'unpaid',note:f.note,invNo:kind==='purchase'?f.inv:'',cogs:kind==='sale'?cogsT:null,profit:kind==='sale'?c.taxable-cogsT:null,ts:ts,by:'owner',void:null};
    if(paid>0)doc.payments.push({id:KN.uid('pm'),date:f.date,ts:ts+500,method:f.method,amount:paid});
    S.stockMoves.slice(undo.moves).forEach(function(m){m.ref=doc.id});
    if(name&&!S.pt[k]){S.pt[k]={t:kind==='sale'?'c':'s',n:name};undo.ptNew=k}
    docs(kind).push(doc);S.meta.seq[kind]=(S.meta.seq[kind]||0)+1;
    KN.audit(S,'create',kind,doc.id,null,{no:no,party:name,total:c.total,paid:paid,items:items.length});
    save();
    if(kind==='sale'&&V.fromQuote){var qd=findDoc(V.fromQuote);if(qd&&!qd.converted){qd.converted=doc.id;KN.audit(S,'convert','quote',qd.id,null,{sale:doc.no});save()}V.fromQuote=null}
    V.id=doc.id;V.view='doc';V.busy=false;toast((kind==='sale'?'Sale ':'Purchase ')+no+' saved');render();return true;
  }catch(e){
    console.error('KhataNova trade rollback',e);
    S.stockMoves.length=undo.moves;docs(kind).length=undo.arr;S.audit.length=undo.aud;S.meta.seq[kind]=undo.seqv;
    Object.keys(undo.prod).forEach(function(id){var p=P(id);p.avgCost=undo.prod[id].avgCost;p.buyPrice=undo.prod[id].buyPrice});
    if(undo.ptNew)delete S.pt[undo.ptNew];
    delete S.meta.keys['trade:'+V.key];V.busy=false;toast('Could not save. Nothing was changed.');return false;
  }
}
function addPayment(id){
  if(window.KNA&&!KNA.guard('payments_add'))return;
  var d=findDoc(id);if(!d||d.void)return;
  var a=pnum((document.getElementById('ktp-a')||{}).value),m=(document.getElementById('ktp-m')||{}).value||'cash',dt=(document.getElementById('ktp-d')||{}).value||today();
  if(isNaN(a)||!(a>0))return toast('Enter a valid amount');
  var minor=KN.toMinor(a),due=dueOf(d);
  if(minor>due)return toast('Amount is more than the balance due ('+money(due)+')');
  if(!d.party)return toast('This document has no party');
  if(!methods().some(function(x){return x[0]===m}))return toast('Choose a payment method');
  var pay={id:KN.uid('pm'),date:dt,ts:Date.now(),method:m,amount:minor};
  d.payments.push(pay);d.paid+=minor;d.status=statusOf(d);
  KN.audit(S,'payment',d.kind,d.id,null,{amount:minor,method:m});save();toast('Payment recorded');render();
}
function voidDoc(id){
  if(window.KNA&&!KNA.guard('cancel_docs'))return;
  var d=findDoc(id);if(!d||d.void)return;
  if(d.returns&&d.returns.length)return toast('This document has returns and cannot be cancelled');
  var reason=prompt('Reason for cancelling '+d.no+'? (required)');if(!reason||!reason.trim())return toast('A reason is required');
  var sm=KNP.stockMap(),neg=!!(S.cfg&&S.cfg.negStock),ts=Date.now();
  if(d.kind==='purchase'&&!neg){for(var i=0;i<d.items.length;i++){var it=d.items[i];if(sm[it.product]+1e-9<it.qty)return toast('Cannot cancel: "'+it.name+'" has already been sold or adjusted')}}
  d.items.forEach(function(it,i){
    var p=P(it.product);if(!p)return;var qB=Math.max(sm[p.id],0),base=p.avgCost!=null?+p.avgCost:(+p.buyPrice||0);
    if(d.kind==='sale'){p.avgCost=(qB*base+it.cogs/100)/(qB+it.qty)}
    else{var left=qB-it.qty;if(left>0)p.avgCost=Math.max(0,(qB*base-it.net/100)/left)}
    S.stockMoves.push({id:KN.uid('sm'),product:p.id,qty:d.kind==='sale'?it.qty:-it.qty,type:d.kind==='sale'?'void_sale':'void_purchase',date:today(),ts:ts+i,wh:p.warehouse||'wh_main',ref:d.id,no:d.no,note:'Cancelled '+d.no+': '+reason.trim(),rev:d.kind==='sale'?-it.net:null,cogs:d.kind==='sale'?-it.cogs:null});
    sm[p.id]=sm[p.id]+(d.kind==='sale'?it.qty:-it.qty);
  });
  d.void={ts:ts,reason:reason.trim(),by:'owner'};
  KN.audit(S,'void',d.kind,d.id,{total:d.total,paid:d.paid},{reason:reason.trim()});save();toast(d.no+' cancelled');render();
}

/* ================= UI ================= */
function badge(d){if(d.void)return '<span class="kp-badge kp-off">Cancelled</span>';if(d.kind==='quote')return d.converted?'<span class="kp-badge kp-ok">Converted</span>':'<span class="kp-badge kp-lo">Open</span>';var st=statusOf(d);return '<span class="kp-badge kp-'+(st==='paid'?'ok':st==='partial'?'lo':'ou')+'">'+SL[st]+'</span>'}
function listRows(){
  var list=docs(V.tab).slice().reverse(),q=V.q.toLowerCase().trim();
  var rows=list.filter(function(d){return!q||(d.no+' '+d.party+' '+(d.invNo||'')).toLowerCase().indexOf(q)>-1}).slice(0,150).map(function(d){
    return '<div class="kp-c kp-r" data-a="open" data-id="'+esc(d.id)+'"><div style="flex:1;min-width:0"><b>'+esc(d.no)+'</b><small>'+esc(d.date)+' | '+esc(d.party||'Walk-in')+'</small></div><div style="text-align:right"><b>'+money(d.total)+'</b><br>'+badge(d)+'</div></div>'}).join('');
  return rows||'<div class="kp-c">No '+(V.tab==='sale'?'sales':V.tab==='quote'?'quotations':'purchases')+' yet.</div>';
}
function hubHtml(){
  var b=balances();
  return '<div class="kp-g">'+'<div class="kp-c ok"><small>Cash balance</small><b>'+money(b.cash)+'</b></div>'+b.banks.map(function(x){return '<div class="kp-c"><small>'+esc(x.name)+'</small><b>'+money(x.bal)+'</b></div>'}).join('')+'</div>'+
   '<div class="kp-2"><button class="kp-pri" data-a="new" data-k="sale">New sale</button><button class="kp-pri" data-a="new" data-k="purchase">New purchase</button></div><button class="kp-pri" style="margin-top:8px;background:linear-gradient(90deg,#0ea5e9,#3b5bff)" data-a="new" data-k="quote">New quotation</button>'+
   '<button class="kp-pri kp-dng" style="margin-top:8px" data-a="bank">Add bank account</button>'+
   '<div class="kp-t" style="margin-top:14px"><button data-a="tab" data-v="sale" class="'+(V.tab==='sale'?'on':'')+'">Sales</button><button data-a="tab" data-v="purchase" class="'+(V.tab==='purchase'?'on':'')+'">Purchases</button><button data-a="tab" data-v="quote" class="'+(V.tab==='quote'?'on':'')+'">Quotes</button></div>'+
   '<input id="kt-q" type="search" placeholder="Search number, party, invoice" value="'+esc(V.q)+'" style="margin-bottom:10px"><div id="ktl">'+listRows()+'</div>';
}
function docHtml(d){
  if(d.kind==='quote')return quoteHtml(d);
  var lines=d.items.map(function(i){return '<div class="kp-mv"><div><b>'+esc(i.name)+'</b><small>'+qty(i.qty)+' '+esc(i.unit)+' x '+money(i.rate)+(i.disc?' | disc '+money(i.disc):'')+'</small></div><b>'+money(i.net)+'</b></div>'}).join('');
  var pays=d.payments.map(function(p){return '<div class="kp-mv"><div><b>'+money(p.amount)+'</b><small>'+esc(p.date)+' | '+esc(mName(p.method))+'</small></div><button class="ghost" data-a="print" data-t="receipt" data-id="'+esc(d.id)+'" data-x="'+esc(p.id)+'">Receipt</button></div>'}).join('');
  var rets=(d.returns||[]).map(function(r){return '<div class="kp-mv"><div><b>'+esc(r.no)+'</b><small>'+esc(r.date)+' | '+esc(r.reason||'')+(r.refund?' | refund '+money(r.refund.amount):'')+'</small></div><div style="text-align:right"><b>-'+money(r.amount)+'</b><br><button class="ghost" data-a="print" data-t="return" data-id="'+esc(d.id)+'" data-x="'+esc(r.id)+'">Print</button></div></div>'}).join('');
  var due=dueOf(d),canRet=!d.void&&d.items.some(function(i,ix){return remaining(d,ix)>0});
  return '<div style="text-align:center"><h2 style="margin:0">'+esc(d.no)+'</h2><small>'+esc(d.date)+' | '+esc(d.party||'Walk-in')+(d.invNo?' | Supplier inv '+esc(d.invNo):'')+'</small><br>'+badge(d)+'</div>'+
   '<div class="kp-g" style="margin-top:12px"><div class="kp-c"><small>Total'+(retTotal(d)?' (after returns)':'')+'</small><b>'+money(netTotal(d))+'</b></div><div class="kp-c ok"><small>Paid</small><b>'+money(paidNet(d))+'</b></div><div class="kp-c '+(due>0?'warn':'')+'"><small>'+(due<0?'Credit / overpaid':'Balance due')+'</small><b>'+money(Math.abs(due))+'</b></div>'+
   (d.kind==='sale'?'<div class="kp-c"><small>Cost of goods sold</small><b>'+money(d.cogs-(d.returns||[]).reduce(function(a,r){return a+(r.cogs||0)},0))+'</b></div><div class="kp-c ok"><small>Gross profit</small><b>'+money(profitOf(d))+'</b></div>':'')+'</div>'+
   '<div class="kp-2"><button class="kp-pri" data-a="print" data-t="invoice" data-id="'+esc(d.id)+'">'+(d.kind==='sale'?'Print invoice':'Print purchase')+'</button><button class="kp-pri" style="background:#1faa59" data-a="wa" data-t="invoice" data-id="'+esc(d.id)+'">WhatsApp</button></div>'+
   (d.kind==='sale'?'<button class="kp-pri kp-dng" style="margin-top:8px" data-a="print" data-t="delivery" data-id="'+esc(d.id)+'">Delivery note</button>':'')+
   '<div class="kp-c" style="margin-top:12px"><small>Items</small>'+lines+(d.discount?'<div class="kp-mv"><span>Discount</span><b>-'+money(d.discount)+'</b></div>':'')+(d.tax?'<div class="kp-mv"><span>Tax '+d.taxRate+'%</span><b>'+money(d.tax)+'</b></div>':'')+'<div class="kp-mv"><span><b>Grand total</b></span><b>'+money(d.total)+'</b></div></div>'+
   '<div class="kp-c" style="margin-top:10px"><small>Payments</small>'+(pays||'<div style="padding:8px 0;color:var(--mute)">No payment recorded.</div>')+'</div>'+
   (rets?'<div class="kp-c" style="margin-top:10px"><small>Returns</small>'+rets+'</div>':'')+
   (d.void?'<div class="kp-c warn"><small>Cancelled</small><b style="font-size:.95rem">'+esc(d.void.reason)+'</b></div>':
    (due>0&&d.party?'<div class="kp-c kp-fm" style="margin-top:10px"><small>Add payment</small><div class="kp-2"><div><label for="ktp-a">Amount</label><input id="ktp-a" inputmode="decimal" value="'+(due/100)+'"></div><div><label for="ktp-m">Method</label><select id="ktp-m">'+methods().map(function(m){return '<option value="'+esc(m[0])+'">'+esc(m[1])+'</option>'}).join('')+'</select></div></div><label for="ktp-d">Date</label><input id="ktp-d" type="date" value="'+today()+'"><button class="kp-pri" data-a="pay" data-id="'+esc(d.id)+'">Record payment</button></div>':'')+
    (canRet?'<button class="kp-pri" style="margin-top:10px" data-a="ret" data-id="'+esc(d.id)+'">'+(d.kind==='sale'?'Sales return':'Purchase return')+'</button>':'')+
    (retTotal(d)?'':'<button class="kp-pri kp-dng" data-a="void" data-id="'+esc(d.id)+'">Cancel this '+(d.kind==='sale'?'sale':'purchase')+'</button>'));
}
function quoteHtml(d){
  var lines=d.items.map(function(i){return '<div class="kp-mv"><div><b>'+esc(i.name)+'</b><small>'+qty(i.qty)+' '+esc(i.unit)+' x '+money(i.rate)+(i.disc?' | disc '+money(i.disc):'')+'</small></div><b>'+money(i.net)+'</b></div>'}).join('');
  var conv=d.converted?findDoc(d.converted):null;
  return '<div style="text-align:center"><h2 style="margin:0">'+esc(d.no)+'</h2><small>'+esc(d.date)+' | '+esc(d.party||'No customer')+'</small><br>'+badge(d)+(conv?'<small style="display:block">Sale '+esc(conv.no)+'</small>':'')+'</div>'+
   '<div class="kp-c" style="margin-top:12px"><small>Items</small>'+lines+(d.discount?'<div class="kp-mv"><span>Discount</span><b>-'+money(d.discount)+'</b></div>':'')+(d.tax?'<div class="kp-mv"><span>Tax '+d.taxRate+'%</span><b>'+money(d.tax)+'</b></div>':'')+'<div class="kp-mv"><span><b>Grand total</b></span><b>'+money(d.total)+'</b></div></div>'+
   '<div class="kp-2"><button class="kp-pri" data-a="print" data-t="quote" data-id="'+esc(d.id)+'">Print quotation</button><button class="kp-pri" style="background:#1faa59" data-a="wa" data-t="quote" data-id="'+esc(d.id)+'">WhatsApp</button></div>'+
   (d.void?'<div class="kp-c warn" style="margin-top:10px"><small>Cancelled</small></div>':(d.converted?'':'<button class="kp-pri" style="margin-top:8px" data-a="convert" data-id="'+esc(d.id)+'">Convert to sale</button><button class="kp-pri kp-dng" data-a="qvoid" data-id="'+esc(d.id)+'">Cancel quotation</button>'));
}
function retHtml(d){
  var rows=d.items.map(function(it,ix){var rem=remaining(d,ix);return '<div class="kp-c"><b>'+esc(it.name)+'</b><small style="display:block;color:var(--mute);margin:2px 0 6px">'+(d.kind==='sale'?'Sold ':'Bought ')+qty(it.qty)+' | can return '+qty(rem)+' '+esc(it.unit)+'</small>'+(rem>0?'<input data-r="'+ix+'" inputmode="decimal" placeholder="Return quantity" aria-label="Return quantity">':'<small>Fully returned</small>')+'</div>'}).join('');
  return '<form class="kp-fm" data-a="postret" novalidate><div class="kp-c"><b>'+esc(d.no)+'</b><small style="display:block;color:var(--mute)">'+esc(d.party||'Walk-in')+'</small></div>'+rows+
   '<label for="ktr-reason">Reason *</label><input id="ktr-reason" maxlength="120" placeholder="e.g. damaged goods">'+
   '<div class="kp-2"><div><label for="ktr-m">Refund</label><select id="ktr-m"><option value="none">No refund (adjust account)</option>'+methods().map(function(m){return '<option value="'+esc(m[0])+'">'+(d.kind==='sale'?'Pay back: ':'Received: ')+esc(m[1])+'</option>'}).join('')+'</select></div><div><label for="ktr-a">Refund amount</label><input id="ktr-a" inputmode="decimal"></div></div>'+
   '<button class="kp-pri" type="submit">Save return</button></form>';
}
function postQuote(){
  var f=readForm(),rr=readRows();function bad(m){toast(m);return false}
  if(rr.err)return bad(rr.err);
  var taxRate=f.tax===''?0:pnum(f.tax);if(isNaN(taxRate)||taxRate>100)return bad('Enter a valid tax % (0-100)');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date))return bad('Choose a valid date');
  var c=calc(rr.rows,taxRate);
  for(var i=0;i<c.items.length;i++){var p=P(c.items[i].product);if(!p||!p.active)return bad('A selected product is missing or inactive');if(c.items[i].net<0)return bad('Discount is larger than the line amount')}
  if(!KN.once(S,'trade:'+V.key))return bad('This entry was already saved');
  S.meta.seq=S.meta.seq||{};var no='QUO-'+String((S.meta.seq.quote||0)+1).padStart(6,'0'),ts=Date.now();
  var doc={id:KN.uid('qt'),no:no,kind:'quote',date:f.date,party:f.party,pk:pkey(f.party),items:c.items.map(function(it){var p=P(it.product);return{product:p.id,name:p.name,unit:p.unit,qty:it.qty,rate:it.rate,disc:it.disc,net:it.net}}),
    subtotal:c.subtotal,discount:c.discount,taxRate:taxRate,tax:c.tax,total:c.total,payments:[],paid:0,returns:[],note:f.note,ts:ts,by:'owner',void:null,converted:null};
  S.quotes.push(doc);S.meta.seq.quote=(S.meta.seq.quote||0)+1;KN.audit(S,'create','quote',doc.id,null,{no:no,party:f.party,total:c.total});save();
  V.id=doc.id;V.view='doc';toast('Quotation '+no+' saved');render();return true;
}
function postReturn(){
  if(window.KNA&&!KNA.guard('returns'))return;
  var d=findDoc(V.id);if(!d||d.void||d.kind==='quote')return;function bad(m){toast(m);return false}
  var reason=((document.getElementById('ktr-reason')||{}).value||'').trim(),sel=[];
  for(var ix=0;ix<d.items.length;ix++){var el=document.querySelector('#kt [data-r="'+ix+'"]'),raw=el?el.value.trim():'';if(raw==='')continue;
    var q=pnum(raw);if(!(q>0)||Math.round(q*1000)/1000!==q)return bad('Enter a valid return quantity for '+d.items[ix].name);
    if(q>remaining(d,ix)+1e-9)return bad('Only '+qty(remaining(d,ix))+' of '+d.items[ix].name+' can be returned');sel.push({idx:ix,qty:q})}
  if(!sel.length)return bad('Enter a quantity to return');if(!reason)return bad('Enter a reason for the return');
  var sm=KNP.stockMap(),neg=!!(S.cfg&&S.cfg.negStock),amount=0,net=0,cogsT=0,items=[];
  for(var k=0;k<sel.length;k++){var it=d.items[sel[k].idx],p=P(it.product);if(!p)return bad('Product no longer exists');
    var already=0;(d.returns||[]).forEach(function(r){r.items.forEach(function(x){if(x.idx===sel[k].idx)already+=x.net})});
    var n=Math.min(Math.round(it.net*sel[k].qty/it.qty),it.net-already),cg=d.kind==='sale'?Math.round(it.cogs*sel[k].qty/it.qty):0;
    if(d.kind==='purchase'&&!neg&&sm[p.id]+1e-9<sel[k].qty)return bad('Not enough stock of '+it.name+' to return to the supplier');
    items.push({idx:sel[k].idx,qty:sel[k].qty,net:n,cogs:cg});net+=n;cogsT+=cg;amount+=n+KN.pct(n,d.taxRate)}
  var m=(document.getElementById('ktr-m')||{}).value||'none',refund=null;
  if(m!=='none'){var ra=pnum((document.getElementById('ktr-a')||{}).value);if(isNaN(ra)||!(ra>0))return bad('Enter the refund amount');var rm=KN.toMinor(ra),max=Math.max(0,paidNet(d)-(netTotal(d)-amount));
    if(rm>max)return bad('Refund cannot be more than '+money(max));if(!methods().some(function(x){return x[0]===m}))return bad('Choose a refund method');refund={method:m,amount:rm}}
  if(!KN.once(S,'trade:'+V.key))return bad('This entry was already saved');
  var ts=Date.now(),no=d.no+'-R'+((d.returns||[]).length+1),undo=S.stockMoves.length,prodUndo={};
  try{
    sel.forEach(function(sl,i){var it=d.items[sl.idx],p=P(it.product),qB=Math.max(sm[p.id],0),base=p.avgCost!=null?+p.avgCost:(+p.buyPrice||0),r=items[i];
      if(!prodUndo[p.id])prodUndo[p.id]=p.avgCost;
      if(d.kind==='sale'){p.avgCost=(qB*base+r.cogs/100)/(qB+sl.qty)}else{var left=qB-sl.qty;if(left>0)p.avgCost=Math.max(0,(qB*base-r.net/100)/left)}
      S.stockMoves.push({id:KN.uid('sm'),product:p.id,qty:d.kind==='sale'?sl.qty:-sl.qty,type:d.kind==='sale'?'return_in':'return_out',date:today(),ts:ts+i,wh:p.warehouse||'wh_main',ref:d.id,no:no,note:reason,rev:d.kind==='sale'?-r.net:null,cogs:d.kind==='sale'?-r.cogs:null});
      sm[p.id]+=d.kind==='sale'?sl.qty:-sl.qty});
    d.returns=d.returns||[];d.returns.push({id:KN.uid('rt'),no:no,date:today(),ts:ts+50,items:items,net:net,cogs:cogsT,amount:amount,refund:refund,reason:reason});
    d.status=statusOf(d);KN.audit(S,'return',d.kind,d.id,null,{no:no,amount:amount,refund:refund});save();
    toast('Return '+no+' saved');V.view='doc';render();return true;
  }catch(e){console.error('KhataNova return rollback',e);S.stockMoves.length=undo;d.returns.pop();Object.keys(prodUndo).forEach(function(id){P(id).avgCost=prodUndo[id]});delete S.meta.keys['trade:'+V.key];toast('Could not save the return. Nothing was changed.');return false}
}
function convertQuote(id){
  var q=findDoc(id);if(!q||q.void||q.converted)return;
  newForm('sale');V.fromQuote=id;
  V.rows=q.items.map(function(i){return{product:i.product,qty:String(i.qty),rate:String(i.rate/100),disc:i.disc?String(i.disc/100):''}});
  render();var a=document.getElementById('ktf-party'),t=document.getElementById('ktf-tax');if(a)a.value=q.party||'';if(t)t.value=q.taxRate;syncForm();
}
function voidQuote(id){if(window.KNA&&!KNA.guard('cancel_docs'))return;var q=findDoc(id);if(!q||q.void||q.converted)return;if(!confirm('Cancel quotation '+q.no+'?'))return;q.void={ts:Date.now(),reason:'Cancelled by user',by:'owner'};KN.audit(S,'void','quote',q.id,null,null);save();toast(q.no+' cancelled');render()}
function rowsHtml(){
  var kind=V.kind,sm=KNP.stockMap(),prods=S.products.filter(function(p){return p.active}).sort(function(a,b){return a.name.localeCompare(b.name)});
  return V.rows.map(function(r,i){
    var p=r.product?P(r.product):null,avail=p?(kind==='sale'?'Available: '+qty(sm[p.id])+' '+esc(p.unit):'In stock: '+qty(sm[p.id])+' '+esc(p.unit)):'';
    return '<div class="kp-c" data-i="'+i+'"><select data-f="product" aria-label="Product"><option value="">Select product</option>'+prods.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===r.product?' selected':'')+'>'+esc(x.name)+'</option>'}).join('')+'</select>'+
      '<small style="display:block;color:var(--mute);margin:4px 0">'+avail+'</small><div class="kp-2" style="grid-template-columns:1fr 1fr 1fr auto"><input data-f="qty" inputmode="decimal" placeholder="Qty" value="'+esc(r.qty)+'" aria-label="Quantity"><input data-f="rate" inputmode="decimal" placeholder="Rate" value="'+esc(r.rate)+'" aria-label="Rate"><input data-f="disc" inputmode="decimal" placeholder="Discount" value="'+esc(r.disc)+'" aria-label="Discount">'+
      (V.rows.length>1?'<button type="button" class="ghost" data-a="rm" data-i="'+i+'" aria-label="Remove row">&times;</button>':'<span></span>')+'</div></div>'}).join('');
}
function formHtml(){
  var kind=V.kind,sale=kind==='sale',quote=kind==='quote',sups={};
  Object.keys(S.pt||{}).forEach(function(k){var e=S.pt[k];if(e&&e.n&&(kind!=='purchase'?e.t!=='s':e.t==='s'||e.t==='b'))sups[e.n]=1});
  return '<form class="kp-fm" data-a="post" novalidate><label for="ktf-party">'+(kind==='purchase'?'Supplier *':'Customer')+'</label><input id="ktf-party" list="ktl-p" maxlength="60" placeholder="'+(kind==='purchase'?'Supplier name':quote?'Customer name (optional)':'Walk-in (only if fully paid)')+'" autocomplete="off"><datalist id="ktl-p">'+Object.keys(sups).map(function(n){return '<option value="'+esc(n)+'">'}).join('')+'</datalist>'+
   '<div class="kp-2"><div><label for="ktf-date">Date</label><input id="ktf-date" type="date" value="'+today()+'"></div>'+(kind!=='purchase'?'<div><label>'+(quote?'Quotation no.':'Invoice no.')+'</label><input value="Auto" disabled></div>':'<div><label for="ktf-inv">Supplier invoice no.</label><input id="ktf-inv" maxlength="40"></div>')+'</div>'+
   '<label style="margin-top:14px"><b>Products</b></label><div id="kt-rows">'+rowsHtml()+'</div><button type="button" class="ghost" data-a="addrow" style="width:100%">+ Add product</button>'+
   '<div class="kp-2"><div><label for="ktf-tax">Tax %</label><input id="ktf-tax" inputmode="decimal" value="'+taxDefault()+'"></div><div><label for="ktf-note">Note</label><input id="ktf-note" maxlength="120"></div></div>'+
   '<div class="kp-c" id="kt-tot" style="margin-top:12px"></div>'+
   (quote?'':'<div class="kp-2"><div><label for="ktf-st">Payment</label><select id="ktf-st"><option value="paid">Fully paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid (credit)</option></select></div><div id="kt-pm"><label for="ktf-method">Method</label><select id="ktf-method">'+methods().map(function(m){return '<option value="'+esc(m[0])+'">'+esc(m[1])+'</option>'}).join('')+'</select></div></div>'+
   '<div id="kt-pa" class="hide"><label for="ktf-paid">Amount paid now</label><input id="ktf-paid" inputmode="decimal"></div>')+
   (sale?'<label><input id="ktf-neg" type="checkbox" style="width:auto" '+(S.cfg&&S.cfg.negStock?'checked':'')+'> Allow selling below zero stock (owner option)</label>':'')+
   '<button class="kp-pri" type="submit" id="kt-save">Save '+(sale?'sale':quote?'quotation':'purchase')+'</button></form>';
}
function totalsHtml(){
  var rr=readRows(),f=readForm(),t=pnum(f.tax);if(isNaN(t))t=0;
  var rows=[];V.rows.forEach(function(r){var q=pnum(r.qty),rt=pnum(r.rate);if(r.product&&q>0&&!isNaN(rt))rows.push({product:r.product,qty:q,rate:KN.toMinor(rt),disc:KN.toMinor(pnum(r.disc)||0)})});
  var c=calc(rows,t);
  return '<div class="kp-mv"><span>Subtotal</span><b>'+money(c.subtotal)+'</b></div>'+(c.discount?'<div class="kp-mv"><span>Discount</span><b>-'+money(c.discount)+'</b></div>':'')+'<div class="kp-mv"><span>Tax</span><b>'+money(c.tax)+'</b></div><div class="kp-mv"><span><b>Grand total</b></span><b>'+money(c.total)+'</b></div>';
}
function syncForm(){
  var t=document.getElementById('kt-tot');if(t)t.innerHTML=totalsHtml();
  var st=(document.getElementById('ktf-st')||{}).value;
  var pm=document.getElementById('kt-pm'),pa=document.getElementById('kt-pa');if(pm)pm.className=st==='unpaid'?'hide':'';if(pa)pa.className=st==='partial'?'':'hide';
}
function render(){
  if(!root)return;
  var title=V.view==='form'?(V.kind==='sale'?'New sale':V.kind==='quote'?'New quotation':'New purchase'):V.view==='ret'?'Return items':V.view==='doc'?'Details':'Sales & Purchases',body='';
  if(V.view==='hub')body=hubHtml();
  else if(V.view==='form')body=formHtml();
  else if(V.view==='ret'){var rd=findDoc(V.id);if(!rd){V.view='hub';return render()}body=retHtml(rd)}
  else{var d=findDoc(V.id);if(!d){V.view='hub';return render()}body=docHtml(d)}
  root.innerHTML='<div class="kp-h"><button data-a="back">&lsaquo; Back</button><b>'+title+'</b></div><div class="kp-w">'+body+'</div>';
  root.scrollTop=0;if(V.view==='form')syncForm();
}
function newForm(kind){V.fromQuote=null;V.kind=kind;V.view='form';V.key=KN.uid('k');V.busy=false;V.rows=[{product:'',qty:'',rate:'',disc:''}];render()}
function onClick(e){
  var b=e.target.closest('[data-a]');if(!b||!root.contains(b))return;var a=b.getAttribute('data-a');if(a==='post'||a==='postret')return;
  if(a==='back'){if(V.view==='hub'){close()}else if(V.view==='ret'){V.view='doc';render()}else{V.view='hub';render()}}
  else if(a==='tab'){V.tab=b.getAttribute('data-v');render()}
  else if(a==='new')newForm(b.getAttribute('data-k'));
  else if(a==='open'){V.id=b.getAttribute('data-id');V.view='doc';render()}
  else if(a==='addrow'){V.rows.push({product:'',qty:'',rate:'',disc:''});keepForm()}
  else if(a==='rm'){V.rows.splice(+b.getAttribute('data-i'),1);keepForm()}
  else if(a==='pay')addPayment(b.getAttribute('data-id'));
  else if(a==='print'){var pd=findDoc(b.getAttribute('data-id'));if(pd)KNPR.show(pd,b.getAttribute('data-t'),b.getAttribute('data-x'))}
  else if(a==='wa'){var wd=findDoc(b.getAttribute('data-id'));if(wd){var wt=b.getAttribute('data-t'),ph=wd.pk&&S.ph&&S.ph[wd.pk]&&typeof num==='function'?num(S.ph[wd.pk]):'';window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(KNPR.waText(wd,wt)),'_blank')}}
  else if(a==='ret'){V.id=b.getAttribute('data-id');V.key=KN.uid('k');V.view='ret';render()}
  else if(a==='convert')convertQuote(b.getAttribute('data-id'));
  else if(a==='qvoid')voidQuote(b.getAttribute('data-id'));
  else if(a==='void')voidDoc(b.getAttribute('data-id'));
  else if(a==='bank'){if(window.KNA&&!KNA.guard('cash_manage'))return;var n=(prompt('Bank account name')||'').trim();if(!n)return;if(S.accounts.some(function(x){return x.name.toLowerCase()===n.toLowerCase()}))return toast('This account already exists');
    var ob=prompt('Opening balance (leave 0 if none)','0');var o=pnum(ob===null?'0':ob||'0');if(isNaN(o))return toast('Enter a valid opening balance');
    var acc={id:KN.uid('ac'),type:'bank',name:n,opening:KN.toMinor(o),active:true};S.accounts.push(acc);KN.audit(S,'create','account',acc.id,null,acc);save();toast('Bank account added');render()}
}
function keepForm(){ /* re-render rows only, keep the other form values */
  var rows=document.getElementById('kt-rows');if(rows)rows.innerHTML=rowsHtml();syncForm();
}
function onInput(e){
  var t=e.target;
  if(t.id==='kt-q'){V.q=t.value;var l=document.getElementById('ktl');if(l)l.innerHTML=listRows();return}
  var row=t.closest&&t.closest('[data-i]');
  if(row&&t.getAttribute('data-f')){var r=V.rows[+row.getAttribute('data-i')],f=t.getAttribute('data-f');
    if(f==='product'){r.product=t.value;var p=r.product?P(r.product):null;if(p){var def=V.kind!=='purchase'?p.sellPrice:(p.avgCost!=null?Math.round(p.avgCost*100)/100:p.buyPrice);if(r.rate===''||r.rate===String(V.lastAuto[V.rows.indexOf(r)]))r.rate=def?String(def):'';V.lastAuto[V.rows.indexOf(r)]=r.rate}keepForm();return}
    r[f]=t.value;syncForm();return}
  if(t.id==='ktf-neg'){if(window.KNA&&!KNA.guard('settings_manage')){t.checked=!t.checked;return}S.cfg=S.cfg||{};S.cfg.negStock=t.checked;KN.audit(S,'setting','cfg','negStock',null,t.checked);save();return}
  if(t.id==='ktf-tax'||t.id==='ktf-st'||t.id==='ktf-paid')syncForm();
}
function open(){
  if(!root){var st=document.createElement('style');st.textContent=(window.KNP?KNP.css:'').replace(/#kp/g,'#kt')+'#kt .hide{display:none!important}';document.head.appendChild(st);
    root=document.createElement('div');root.id='kt';root.setAttribute('role','dialog');root.setAttribute('aria-label','Sales and purchases');document.body.appendChild(root);
    root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onInput);
    root.addEventListener('submit',function(e){e.preventDefault();if(V.view==='ret')postReturn();else post(V.kind)});}
  V.view='hub';V.q='';render();root.className='';document.body.style.overflow='hidden';
}
function close(){if(root)root.className='hide';document.body.style.overflow='';try{window.render()}catch(e){}if(window.acc)try{acc()}catch(e){};if(window.KNR)KNR.refresh()}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-ktrade]');if(!t)return;e.stopImmediatePropagation();e.preventDefault();
  if(document.querySelector('.lk:not(.hide)'))return;open()},true);
window.KNT={open:open,partyLines:partyLines,cashLines:cashLines,balances:balances,calc:calc,mName:mName,retTotal:retTotal,paidNet:paidNet,netTotal:netTotal,dueOf:dueOf,statusOf:statusOf,paidUpTo:paidUpTo,profitOf:profitOf};
})();
