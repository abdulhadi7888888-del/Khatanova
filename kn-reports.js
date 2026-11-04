/* KhataNova 2030 - Dashboard, analytics and exports (Phase 5).
   Every number is computed from saved records: legacy entries (S.tx, S.pay, S.exp, S.sp, S.cash)
   plus the Phase 3/4 documents (S.sales, S.purchases, S.stockMoves). Cancelled documents are excluded.
   Legacy sales have no stored cost, so their cost is estimated from the weighted average of that item's legacy purchases. */
(function(){
'use strict';
var root=null,V={view:'dash',rng:'month',from:'',to:'',rid:null,cat:'all'};
function loc(){return (typeof LOC==='string'&&LOC)||'en-IN'}
function sym(){return (typeof CS==='string'&&CS)||'Rs'}
function fm(m){return sym()+' '+((m||0)/100).toLocaleString(loc(),{maximumFractionDigits:2,minimumFractionDigits:0})}
function fq(n){return (Math.round(n*1000)/1000).toLocaleString(loc(),{maximumFractionDigits:3})}
function mi(x){return Math.round((+x||0)*100)}
function pad(n){return ('0'+n).slice(-2)}
function ds(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function addDays(s,n){var d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return ds(d)}
function mondayOf(s){var d=new Date(s+'T00:00:00'),w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return ds(d)}

/* ---------------- range ---------------- */
function range(){
  var t=today(),y=t.slice(0,4),m=t.slice(0,7);
  if(V.rng==='today')return{from:t,to:t,label:'Today'};
  if(V.rng==='week')return{from:mondayOf(t),to:t,label:'This week'};
  if(V.rng==='month')return{from:m+'-01',to:t,label:'This month'};
  if(V.rng==='year')return{from:y+'-01-01',to:t,label:'This year'};
  if(V.rng==='custom'&&V.from&&V.to&&V.from<=V.to)return{from:V.from,to:V.to,label:V.from+' to '+V.to};
  return{from:'0000-01-01',to:'9999-12-31',label:'All time'};
}

/* ---------------- data extraction ---------------- */
function legacyAvg(){var m={};S.tx.forEach(function(x){if(x.t==='in'&&!x.adj&&!x.pr&&!x.ret&&+x.r>0){var o=m[x.g]=m[x.g]||{q:0,v:0};o.q+=+x.kg;o.v+=(+x.kg)*(+x.r)}});return function(g){var o=m[g];return o&&o.q?o.v/o.q:0}}
/* sale / purchase item lines: {d,ref,party,name,unit,qty,amt,cost} in minor units; returns appear as negative lines */
function items(kind){
  var out=[],avg=legacyAvg(),docs=kind==='sale'?S.sales:S.purchases;
  S.tx.forEach(function(x){
    if(x.adj||x.pr)return;
    var sale=kind==='sale';
    if(x.ret){ if(sale?x.t!=='in':x.t!=='out')return; var a=mi((+x.kg)*(+x.r||0));out.push({d:x.d,ref:'Return',party:x.p||'',name:x.g,unit:UNp(),qty:-x.kg,amt:-a,cost:sale?-mi((+x.kg)*avg(x.g)):-a});return}
    if(sale?x.t!=='out':x.t!=='in')return;
    var am=mi((+x.kg)*(+x.r||0));out.push({d:x.d,ref:'Entry',party:x.p||'',name:x.g,unit:UNp(),qty:+x.kg,amt:am,cost:sale?mi((+x.kg)*avg(x.g)):am});
  });
  docs.forEach(function(d){if(d.void)return;
    d.items.forEach(function(it){out.push({d:d.date,ref:d.no,party:d.party||'',name:it.name,unit:it.unit,qty:it.qty,amt:it.net,cost:kind==='sale'?(it.cogs||0):it.net})});
    (d.returns||[]).forEach(function(r){r.items.forEach(function(ri){var it=d.items[ri.idx];out.push({d:r.date,ref:r.no,party:d.party||'',name:it.name,unit:it.unit,qty:-ri.qty,amt:-ri.net,cost:kind==='sale'?-(ri.cogs||0):-ri.net})})});
  });
  return out;
}
function UNp(){return (typeof UN==='string'&&UN)||'kg'}
/* expenses: ordinary expenses + salaries + stock losses (damage/lost/expired) */
function expenses(){
  var out=[];
  S.exp.forEach(function(x){out.push({d:x.d,cat:x.c||'Expense',note:x.n||'',amt:mi(x.a)})});
  S.sp.forEach(function(x){if(x.k==='adv')return;var st=S.staff.filter(function(q){return q.id===x.s})[0];out.push({d:x.d,cat:'Staff salary',note:st?st.n:'',amt:mi(x.a)})});
  S.stockMoves.forEach(function(m){if(m.loss>0){var p=KNP.getProduct(m.product);out.push({d:m.date,cat:'Stock loss ('+m.type+')',note:(p?p.name:'')+' '+(m.note||''),amt:m.loss})}});
  return out;
}
function inR(d,r){return d>=r.from&&d<=r.to}
function sum(a,f){var t=0;a.forEach(function(x){t+=f(x)});return t}
function metrics(r){
  var s=items('sale').filter(function(x){return inR(x.d,r)}),p=items('purchase').filter(function(x){return inR(x.d,r)}),e=expenses().filter(function(x){return inR(x.d,r)});
  var sales=sum(s,function(x){return x.amt}),cogs=sum(s,function(x){return x.cost}),exp=sum(e,function(x){return x.amt});
  return{sales:sales,cogs:cogs,gross:sales-cogs,purch:sum(p,function(x){return x.amt}),exp:exp,net:sales-cogs-exp,sItems:s,pItems:p,eItems:e};
}
function balancesNow(){
  var m=all(),rec=0,pay=0;Object.keys(m).forEach(function(k){var n=m[k].net;if(n>0)rec+=n;else pay-=n});
  var b=KNT.balances(),bank=0;b.banks.forEach(function(x){bank+=x.bal});
  return{rec:mi(rec),pay:mi(pay),cash:b.cash,bank:bank,banks:b.banks,stock:KNP.dashStats().buy};
}
function productStats(r){
  var m={};items('sale').forEach(function(x){if(!inR(x.d,r))return;var o=m[x.name]=m[x.name]||{name:x.name,unit:x.unit,qty:0,amt:0,cost:0};o.qty+=x.qty;o.amt+=x.amt;o.cost+=x.cost});
  return Object.keys(m).map(function(k){var o=m[k];o.profit=o.amt-o.cost;return o}).sort(function(a,b){return b.amt-a.amt});
}

/* ---------------- report models ---------------- */
/* col types: t text, m money(minor), q qty, p percent */
var C=function(n,t){return{n:n,t:t||'t'}};
function groupBy(arr,keyf){var g={};arr.forEach(function(x){var k=keyf(x);(g[k]=g[k]||[]).push(x)});return g}
function periodKey(unit,d){if(unit==='day')return d;if(unit==='week')return mondayOf(d);if(unit==='month')return d.slice(0,7);return d.slice(0,4)}
function periodReport(unit,title){return function(r){
  var s=items('sale').filter(function(x){return inR(x.d,r)}),g=groupBy(s,function(x){return periodKey(unit,x.d)}),rows=[];
  Object.keys(g).sort().forEach(function(k){var a=sum(g[k],function(x){return x.amt}),c=sum(g[k],function(x){return x.cost});rows.push([(unit==='week'?'Week of ':'')+k,a,c,a-c])});
  return{title:title,cols:[C('Period'),C('Sales','m'),C('Cost','m'),C('Gross profit','m')],rows:rows,foot:['Total',sum(rows,function(x){return x[1]}),sum(rows,function(x){return x[2]}),sum(rows,function(x){return x[3]})]}}}
var REPORTS=[
 {id:'sales',cat:'Sales & purchases',name:'Sales report',f:function(r){
   var rows=[];S.sales.forEach(function(d){if(!d.void&&inR(d.date,r))rows.push([d.date,d.no,d.party||'Walk-in',d.items.map(function(i){return i.name+' x'+fq(i.qty)}).join(', '),KNT.netTotal(d),KNT.paidNet(d),KNT.profitOf(d)])});
   var avg=legacyAvg();S.tx.forEach(function(x){if(x.t==='out'&&!x.ret&&!x.adj&&!x.pr&&inR(x.d,r)){var a=mi(x.kg*(+x.r||0));rows.push([x.d,'Entry',x.p||'',x.g+' x'+fq(x.kg)+' @'+(x.r||0),a,'',a-mi(x.kg*avg(x.g))])}});
   rows.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0});
   return{title:'Sales report',cols:[C('Date'),C('Ref'),C('Customer'),C('Details'),C('Amount','m'),C('Paid','m'),C('Profit','m')],rows:rows,foot:['Total','','','',sum(rows,function(x){return x[4]}),sum(rows,function(x){return x[5]||0}),sum(rows,function(x){return x[6]})]}}},
 {id:'purchases',cat:'Sales & purchases',name:'Purchase report',f:function(r){
   var rows=[];S.purchases.forEach(function(d){if(!d.void&&inR(d.date,r))rows.push([d.date,d.no,d.party,d.items.map(function(i){return i.name+' x'+fq(i.qty)}).join(', '),KNT.netTotal(d),KNT.paidNet(d)])});
   S.tx.forEach(function(x){if(x.t==='in'&&!x.ret&&!x.adj&&!x.pr&&+x.r>0&&inR(x.d,r))rows.push([x.d,'Entry',x.p||'',x.g+' x'+fq(x.kg)+' @'+x.r,mi(x.kg*x.r),''])});
   rows.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0});
   return{title:'Purchase report',cols:[C('Date'),C('Ref'),C('Supplier'),C('Details'),C('Amount','m'),C('Paid','m')],rows:rows,foot:['Total','','','',sum(rows,function(x){return x[4]}),sum(rows,function(x){return x[5]||0})]}}},
 {id:'ds',cat:'Sales & purchases',name:'Daily sales',f:periodReport('day','Daily sales')},
 {id:'ws',cat:'Sales & purchases',name:'Weekly sales',f:periodReport('week','Weekly sales')},
 {id:'ms',cat:'Sales & purchases',name:'Monthly sales',f:periodReport('month','Monthly sales')},
 {id:'ys',cat:'Sales & purchases',name:'Yearly sales',f:periodReport('year','Yearly sales')},
 {id:'pl',cat:'Profit',name:'Gross & net profit',f:function(r){
   var m=metrics(r),rows=[['Sales (after discount, before tax)',m.sales],['Cost of goods sold',-m.cogs],['Gross profit',m.gross]];
   var g=groupBy(m.eItems,function(x){return x.cat}),tot=0;Object.keys(g).sort().forEach(function(k){var a=sum(g[k],function(x){return x.amt});tot+=a;rows.push(['  '+k,-a])});
   rows.push(['Total expenses',-tot],['Net profit',m.gross-tot]);
   return{title:'Profit & loss',cols:[C('Item'),C('Amount','m')],rows:rows,foot:null}}},
 {id:'exp',cat:'Profit',name:'Expenses',f:function(r){
   var rows=expenses().filter(function(x){return inR(x.d,r)}).sort(function(a,b){return a.d<b.d?-1:1}).map(function(x){return[x.d,x.cat,x.note,x.amt]});
   return{title:'Expenses',cols:[C('Date'),C('Category'),C('Note'),C('Amount','m')],rows:rows,foot:['Total','','',sum(rows,function(x){return x[3]})]}}},
 {id:'cust',cat:'Parties',name:'Customer outstanding',f:function(){
   var m=all(),rows=[];Object.keys(m).forEach(function(k){if(m[k].net>0.004)rows.push([m[k].n,(S.ph&&S.ph[k])||'',m[k].d||'',mi(m[k].net)])});rows.sort(function(a,b){return b[3]-a[3]});
   return{title:'Customer outstanding (to receive)',cols:[C('Customer'),C('Phone'),C('Last entry'),C('Balance','m')],rows:rows,foot:['Total','','',sum(rows,function(x){return x[3]})]}}},
 {id:'sup',cat:'Parties',name:'Supplier outstanding',f:function(){
   var m=all(),rows=[];Object.keys(m).forEach(function(k){if(m[k].net<-0.004)rows.push([m[k].n,(S.ph&&S.ph[k])||'',m[k].d||'',mi(-m[k].net)])});rows.sort(function(a,b){return b[3]-a[3]});
   return{title:'Supplier outstanding (to pay)',cols:[C('Supplier'),C('Phone'),C('Last entry'),C('Balance','m')],rows:rows,foot:['Total','','',sum(rows,function(x){return x[3]})]}}},
 {id:'val',cat:'Stock',name:'Inventory valuation',f:function(){
   var sm=KNP.stockMap(),rows=[];S.products.forEach(function(p){if(!p.active)return;var q=sm[p.id],c=+(p.avgCost!=null?p.avgCost:p.buyPrice)||0;rows.push([p.name,p.unit,q,mi(c),q>0?Math.round(q*c*100):0,mi(p.sellPrice),q>0?Math.round(q*(+p.sellPrice||0)*100):0])});
   rows.sort(function(a,b){return a[0].localeCompare(b[0])});
   return{title:'Inventory / stock valuation',cols:[C('Product'),C('Unit'),C('Qty','q'),C('Avg cost','m'),C('Cost value','m'),C('Sale price','m'),C('Sale value','m')],rows:rows,foot:['Total','','','',sum(rows,function(x){return x[4]}),'',sum(rows,function(x){return x[6]})]}}},
 {id:'low',cat:'Stock',name:'Low stock',f:function(){
   var sm=KNP.stockMap(),rows=[];S.products.forEach(function(p){var q=sm[p.id];if(p.active&&q>0&&q<=(+p.minStock||0))rows.push([p.name,p.unit,q,+p.minStock||0,p.supplier||''])});
   return{title:'Low stock',cols:[C('Product'),C('Unit'),C('Qty','q'),C('Alert at','q'),C('Supplier')],rows:rows,foot:null}}},
 {id:'out',cat:'Stock',name:'Out of stock',f:function(){
   var sm=KNP.stockMap(),rows=[];S.products.forEach(function(p){if(p.active&&sm[p.id]<=0)rows.push([p.name,p.unit,sm[p.id],p.supplier||''])});
   return{title:'Out of stock',cols:[C('Product'),C('Unit'),C('Qty','q'),C('Supplier')],rows:rows,foot:null}}},
 {id:'perf',cat:'Stock',name:'Product profit / performance',f:function(r){
   var rows=productStats(r).map(function(o){return[o.name,o.unit,o.qty,o.amt,o.cost,o.profit,o.amt?Math.round(o.profit/o.amt*1000)/10:0]});
   return{title:'Product profit & performance',cols:[C('Product'),C('Unit'),C('Qty sold','q'),C('Revenue','m'),C('Cost','m'),C('Profit','m'),C('Margin %','p')],rows:rows,foot:['Total','','',sum(rows,function(x){return x[3]}),sum(rows,function(x){return x[4]}),sum(rows,function(x){return x[5]}),'']}}},
 {id:'mv',cat:'Stock',name:'Stock movement',f:function(r){
   var rows=[];S.products.forEach(function(p){KNP.movesOf(p).forEach(function(v){if(inR(v.d,r))rows.push([v.d,p.name,KNP.label(v.type),v.q,v.note||''])})});
   rows.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0});
   return{title:'Stock movement',cols:[C('Date'),C('Product'),C('Type'),C('Qty','q'),C('Note')],rows:rows,foot:null}}},
 {id:'cf',cat:'Cash',name:'Cash flow',f:function(r){
   var d={};function add(date,k,v){if(!inR(date,r))return;var o=d[date]=d[date]||{ci:0,co:0,bi:0,bo:0};o[k]+=v}
   S.cash.forEach(function(x){add(x.d,x.t==='in'?'ci':'co',mi(x.a))});
   S.pay.forEach(function(y){if(y.k==='rcv')add(y.d,'ci',mi(y.a));else if(y.k==='gv')add(y.d,'co',mi(y.a))});
   S.exp.forEach(function(x){add(x.d,'co',mi(x.a))});S.sp.forEach(function(x){add(x.d,'co',mi(x.a))});
   S.sales.concat(S.purchases).forEach(function(doc){if(doc.void)return;var inn=doc.kind==='sale';
     doc.payments.forEach(function(p){add(p.date,p.method==='cash'?(inn?'ci':'co'):(inn?'bi':'bo'),p.amount)});
     (doc.returns||[]).forEach(function(rt){if(rt.refund)add(rt.date,rt.refund.method==='cash'?(inn?'co':'ci'):(inn?'bo':'bi'),rt.refund.amount)})});
   var rows=Object.keys(d).sort().map(function(k){var o=d[k];return[k,o.ci,o.co,o.bi,o.bo,o.ci-o.co+o.bi-o.bo]});
   return{title:'Cash flow',cols:[C('Date'),C('Cash in','m'),C('Cash out','m'),C('Bank in','m'),C('Bank out','m'),C('Net','m')],rows:rows,foot:['Total',sum(rows,function(x){return x[1]}),sum(rows,function(x){return x[2]}),sum(rows,function(x){return x[3]}),sum(rows,function(x){return x[4]}),sum(rows,function(x){return x[5]})]}}}
];
var SHORT=[{id:'dsr',name:'Daily stock report',base:'mv',rng:'today'},{id:'msr',name:'Monthly stock report',base:'mv',rng:'month'}];
function byId(id){return REPORTS.filter(function(r){return r.id===id})[0]}

/* ---------------- formatting + export ---------------- */
function cell(c,v,forExport){
  if(v===''||v==null)return'';
  if(c.t==='m')return forExport?(v/100).toFixed(2):fm(v);
  if(c.t==='q')return forExport?String(v):fq(v);
  if(c.t==='p')return v+'%';
  return String(v);
}
function csv(model){
  function q(x){x=String(x==null?'':x);return /[",\n\r]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}
  var L=[model.cols.map(function(c){return q(c.n)}).join(',')];
  model.rows.forEach(function(r){L.push(r.map(function(v,i){return q(cell(model.cols[i],v,true))}).join(','))});
  if(model.foot)L.push(model.foot.map(function(v,i){return q(cell(model.cols[i],v,true))}).join(','));
  return '﻿'+L.join('\r\n');
}
/* --- minimal XLSX writer (stored zip, inline strings) --- */
var CRC=(function(){var t=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){var c=0xFFFFFFFF;for(var i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function u8(s){return new TextEncoder().encode(s)}
function le(n,b){var a=[];for(var i=0;i<b;i++)a.push((n>>>(8*i))&255);return a}
function zip(files){
  var out=[],cd=[],off=0;
  files.forEach(function(f){var nm=u8(f.n),d=u8(f.c),crc=crc32(d);
    var h=[].concat(le(0x04034b50,4),le(20,2),le(0x0800,2),le(0,2),le(0,2),le(0x21,2),le(crc,4),le(d.length,4),le(d.length,4),le(nm.length,2),le(0,2));
    out.push(new Uint8Array(h),nm,d);
    cd.push(new Uint8Array([].concat(le(0x02014b50,4),le(20,2),le(20,2),le(0x0800,2),le(0,2),le(0,2),le(0x21,2),le(crc,4),le(d.length,4),le(d.length,4),le(nm.length,2),le(0,2),le(0,2),le(0,2),le(0,2),le(0,4),le(off,4))),nm);
    off+=h.length+nm.length+d.length});
  var cs=0;cd.forEach(function(x){cs+=x.length});
  var end=new Uint8Array([].concat(le(0x06054b50,4),le(0,2),le(0,2),le(files.length,2),le(files.length,2),le(cs,4),le(off,4),le(0,2)));
  return new Blob(out.concat(cd,[end]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function x(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')}
function colName(i){var s='';i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function xlsx(model,sheet){
  var rows=[],all=[model.cols.map(function(c){return{v:c.n,s:1}})];
  model.rows.forEach(function(r){all.push(r.map(function(v,i){return{v:v,t:model.cols[i].t}}))});
  if(model.foot)all.push(model.foot.map(function(v,i){return{v:v,t:model.cols[i].t,s:1}}));
  all.forEach(function(r,ri){var cs=r.map(function(c,ci){var ref=colName(ci)+(ri+1),v=c.v;
    if(v===''||v==null)return '<c r="'+ref+'"/>';
    if(c.t==='m'&&typeof v==='number')return '<c r="'+ref+'" s="'+(c.s?3:2)+'"><v>'+(v/100).toFixed(2)+'</v></c>';
    if((c.t==='q'||c.t==='p')&&typeof v==='number')return '<c r="'+ref+'"'+(c.s?' s="1"':'')+'><v>'+v+'</v></c>';
    return '<c r="'+ref+'" t="inlineStr"'+(c.s?' s="1"':'')+'><is><t xml:space="preserve">'+x(v)+'</t></is></c>'}).join('');rows.push('<row r="'+(ri+1)+'">'+cs+'</row>')});
  var cols='<cols>'+model.cols.map(function(c,i){return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(c.t==='t'?26:16)+'" customWidth="1"/>'}).join('')+'</cols>';
  var NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
   {n:'[Content_Types].xml',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
   {n:'_rels/.rels',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+R+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
   {n:'xl/workbook.xml',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook '+NS+' xmlns:r="'+R+'"><sheets><sheet name="'+x((sheet||'Report').replace(/[\[\]\*\?\/\\:]/g,' ').slice(0,31))+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
   {n:'xl/_rels/workbook.xml.rels',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+R+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+R+'/styles" Target="styles.xml"/></Relationships>'},
   {n:'xl/styles.xml',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet '+NS+'><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
   {n:'xl/worksheets/sheet1.xml',c:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet '+NS+'>'+cols+'<sheetData>'+rows.join('')+'</sheetData></worksheet>'}]);
}
function download(blob,name){
  var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(u)},1500);
}
function fname(m,ext){return m.title.replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').toLowerCase()+'-'+today()+'.'+ext}
function pdfView(model,rg){
  var b=S.biz||{},th=model.cols.map(function(c){return '<th'+(c.t!=='t'?' class="r"':'')+'>'+esc(c.n)+'</th>'}).join('');
  function row(r,bold){return '<tr'+(bold?' class="f"':'')+'>'+r.map(function(v,i){return '<td'+(model.cols[i].t!=='t'?' class="r"':'')+'>'+esc(cell(model.cols[i],v))+'</td>'}).join('')+'</tr>'}
  var html='<h1>'+esc(b.n||'KhataNova')+'</h1><h2>'+esc(model.title)+'</h2><p>'+esc(rg.label)+' | printed '+esc(today())+'</p><table><thead><tr>'+th+'</tr></thead><tbody>'+model.rows.map(function(r){return row(r)}).join('')+(model.foot?row(model.foot,true):'')+'</tbody></table>';
  var css='body{font:12px Arial;margin:18px;color:#111}h1{margin:0;font-size:18px}h2{margin:2px 0;font-size:15px;color:#3b5bff}p{color:#555;margin:2px 0 10px}table{width:100%;border-collapse:collapse}th{background:#eef1ff;text-align:left;font-size:10px;text-transform:uppercase}th,td{padding:5px 6px;border-bottom:1px solid #ddd}.r{text-align:right;white-space:nowrap}.f td{font-weight:700;border-top:2px solid #111}@page{size:A4 landscape;margin:10mm}';
  var ov=document.getElementById('krp');if(!ov){ov=document.createElement('div');ov.id='krp';ov.style.cssText='position:fixed;inset:0;z-index:97;background:#1a1f33;display:flex;flex-direction:column';document.body.appendChild(ov)}
  ov.innerHTML='<div style="display:flex;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:linear-gradient(135deg,#1c2f8f,#7c3aed)"><button id="krp-x" style="flex:1">Close</button><button id="krp-p" style="flex:2">Print / Save as PDF</button></div><iframe title="Report preview" style="flex:1;border:0;background:#fff;width:100%"></iframe>';
  var f=ov.querySelector('iframe');f.srcdoc='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(model.title)+'</title><style>'+css+'</style></head><body>'+html+'</body></html>';ov.style.display='flex';
  ov.querySelector('#krp-x').onclick=function(){ov.style.display='none'};ov.querySelector('#krp-p').onclick=function(){try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Printing is not available in this browser')}};
}

/* ---------------- UI ---------------- */
var CSS_EXTRA='#kd{z-index:80}#kd .kd-chart{width:100%;height:auto}#kd .kd-bar{height:9px;border-radius:6px;background:linear-gradient(90deg,#3b5bff,#7c5cff)}#kd .kd-sc{overflow:auto;border:1px solid var(--line);border-radius:14px}#kd table{border-collapse:collapse;width:100%;font-size:.85rem}#kd th{position:sticky;top:0;background:var(--card);text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;color:var(--mute)}#kd th,#kd td{padding:8px 10px;border-bottom:1px solid var(--line)}#kd td.r,#kd th.r{text-align:right;white-space:nowrap}#kd tr.f td{font-weight:800}#kd .kd-ex{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}#kd .kp-w{padding-bottom:60px}#kd .kd-rl{display:flex;justify-content:space-between;align-items:center;gap:10px}#kd h3{margin:16px 0 6px;font-size:.8rem;letter-spacing:.8px;color:var(--mute);text-transform:uppercase}#kd .kd-qa{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}#kd .kd-qa button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:12px 6px}';
function rangeBar(){
  var ch=[['today','Today'],['week','Week'],['month','Month'],['year','Year'],['all','All'],['custom','Custom']];
  return '<div class="kp-f">'+ch.map(function(c){return '<button data-a="rng" data-v="'+c[0]+'" class="'+(V.rng===c[0]?'on':'')+'">'+c[1]+'</button>'}).join('')+'</div>'+
   (V.rng==='custom'?'<div class="kp-2" style="margin-bottom:12px"><div><label for="kd-f">From</label><input id="kd-f" type="date" value="'+esc(V.from)+'"></div><div><label for="kd-t">To</label><input id="kd-t" type="date" value="'+esc(V.to)+'"></div></div>':'');
}
function tile(l,v,c){return '<div class="kp-c '+(c||'')+'"><small>'+l+'</small><b>'+v+'</b></div>'}
function buckets(r){
  var out=[],t=today();
  if(V.rng==='today'||V.rng==='week'){var st=V.rng==='today'?addDays(t,-6):r.from;for(var d=st;d<=t;d=addDays(d,1))out.push({l:d.slice(8),a:d,b:d});}
  else if(V.rng==='month'||V.rng==='custom'){var e=r.to>t?t:r.to,s=r.from;if(s<addDays(e,-30))s=addDays(e,-30);for(var d2=s;d2<=e;d2=addDays(d2,1))out.push({l:d2.slice(8),a:d2,b:d2})}
  else{var y=+t.slice(0,4),m=+t.slice(5,7);var list=[];for(var i=11;i>=0;i--){var mm=m-i,yy=y;while(mm<1){mm+=12;yy--}list.push(yy+'-'+pad(mm))}
    if(V.rng==='year'){list=[];for(var k=1;k<=m;k++)list.push(y+'-'+pad(k))}
    list.forEach(function(k2){out.push({l:k2.slice(5),a:k2+'-01',b:k2+'-31'})})}
  return out;
}
function chart(m,r){
  var bk=buckets(r);if(!bk.length)return'';
  var allS=items('sale'),allE=expenses();
  var s=bk.map(function(b){return sum(allS,function(x){return x.d>=b.a&&x.d<=b.b?x.amt:0})});
  var e=bk.map(function(b){return sum(allE,function(x){return x.d>=b.a&&x.d<=b.b?x.amt:0})});
  var mx=Math.max.apply(null,s.concat(e,[1])),W=340,H=150,pl=6,bw=(W-pl*2)/bk.length,out='<svg class="kd-chart" viewBox="0 0 '+W+' '+(H+22)+'" role="img" aria-label="Sales and expenses chart"><defs><linearGradient id="kdg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#3b5bff"/></linearGradient><linearGradient id="kdg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>';
  for(var g=0;g<=3;g++){var yy=H-H*g/3;out+='<line x1="0" x2="'+W+'" y1="'+yy+'" y2="'+yy+'" stroke="currentColor" stroke-opacity=".12"/>'}
  bk.forEach(function(b,i){var w=Math.max(2,bw/2-1.5),x0=pl+i*bw+bw*.1,hs=s[i]/mx*H,he=e[i]/mx*H;
    out+='<rect x="'+x0.toFixed(1)+'" y="'+(H-hs).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+hs.toFixed(1)+'" rx="2" fill="url(#kdg1)"><title>'+esc(b.a+': sales '+fm(s[i]))+'</title></rect><rect x="'+(x0+w+1).toFixed(1)+'" y="'+(H-he).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+he.toFixed(1)+'" rx="2" fill="url(#kdg2)"><title>'+esc(b.a+': expenses '+fm(e[i]))+'</title></rect>';
    if(bk.length<=16||i%Math.ceil(bk.length/12)===0)out+='<text x="'+(x0+w).toFixed(1)+'" y="'+(H+14)+'" text-anchor="middle" font-size="9" fill="currentColor" fill-opacity=".6">'+esc(b.l)+'</text>'});
  return out+'</svg><div style="display:flex;gap:14px;font-size:.78rem;color:var(--mute)"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#5b5bff"></i> Sales</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#f97316"></i> Expenses</span><span style="margin-left:auto">Peak '+fm(mx)+'</span></div>';
}
function recent(){
  var ev=[];
  S.sales.forEach(function(d){if(!d.void)ev.push({d:d.date,ts:d.ts,t:'Sale '+d.no,s:d.party||'Walk-in',a:d.total,k:'in'})});
  S.purchases.forEach(function(d){if(!d.void)ev.push({d:d.date,ts:d.ts,t:'Purchase '+d.no,s:d.party,a:d.total,k:'out'})});
  S.tx.forEach(function(x){if(x.adj||x.pr)return;var a=mi((+x.kg)*(+x.r||0));ev.push({d:x.d,ts:+x.id||0,t:(x.ret?'Return: ':x.t==='out'?'Sold: ':'Bought: ')+x.g+' '+fq(x.kg)+' '+UNp(),s:x.p||'',a:a,k:x.t==='out'?'in':'out'})});
  S.pay.forEach(function(y){if(y.k==='rcv'||y.k==='gv')ev.push({d:y.d,ts:+y.id||0,t:y.k==='rcv'?'Payment received':'Payment given',s:y.p,a:mi(y.a),k:y.k==='rcv'?'in':'out'})});
  S.exp.forEach(function(x){ev.push({d:x.d,ts:+x.id||0,t:'Expense: '+(x.c||''),s:x.n||'',a:mi(x.a),k:'out'})});
  ev.sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:b.ts-a.ts});
  return ev.slice(0,8);
}
function dashHtml(){
  var r=range(),m=metrics(r),b=balancesNow(),top=productStats(r).slice(0,5),mxT=top.length?top[0].amt||1:1,sm=KNP.stockMap();
  var low=S.products.filter(function(p){return p.active&&sm[p.id]<=(+p.minStock||0)}).slice(0,6);
  var t=today(),dm=metrics({from:t,to:t});
  return rangeBar()+
   '<div class="kp-g">'+tile('Total sales',fm(m.sales),'ok')+tile('Total purchases',fm(m.purch))+tile('Gross profit',fm(m.gross),m.gross>=0?'ok':'warn')+tile('Net profit',fm(m.net),m.net>=0?'ok':'warn')+tile('Total expenses',fm(m.exp))+'</div>'+
   '<h3>Balances today</h3><div class="kp-g">'+tile('Receivables',fm(b.rec))+tile('Payables',fm(b.pay))+tile('Cash',fm(b.cash))+tile('Bank balance',fm(b.bank))+tile('Stock value',fm(b.stock))+'</div>'+
   '<h3>Sales vs expenses</h3><div class="kp-c">'+chart(m,r)+'</div>'+
   '<h3>Daily summary</h3><div class="kp-g">'+tile('Sales today',fm(dm.sales))+tile('Purchases today',fm(dm.purch))+tile('Expenses today',fm(dm.exp))+tile('Profit today',fm(dm.net),dm.net>=0?'ok':'warn')+'</div>'+
   '<h3>Top selling products</h3><div class="kp-c">'+(top.length?top.map(function(o){return '<div style="margin:8px 0"><div class="kd-rl"><b>'+esc(o.name)+'</b><span>'+fm(o.amt)+'</span></div><small style="color:var(--mute)">'+fq(o.qty)+' '+esc(o.unit)+' | profit '+fm(o.profit)+'</small><div class="kd-bar" style="width:'+Math.max(4,Math.round(o.amt/mxT*100))+'%"></div></div>'}).join(''):'<small style="color:var(--mute)">No sales in this period.</small>')+'</div>'+
   '<h3>Low stock alerts</h3><div class="kp-c">'+(low.length?low.map(function(p){return '<div class="kd-rl" style="padding:5px 0"><span>'+esc(p.name)+'</span><b class="'+(sm[p.id]<=0?'neg':'')+'" style="'+(sm[p.id]>0?'color:#ffa000':'')+'">'+fq(sm[p.id])+' '+esc(p.unit)+'</b></div>'}).join(''):'<small style="color:var(--mute)">All products are above their alert level.</small>')+'</div>'+
   '<h3>Recent transactions</h3><div class="kp-c">'+(recent().map(function(e){return '<div class="kp-mv"><div><b>'+esc(e.t)+'</b><small>'+esc(e.d)+(e.s?' | '+esc(e.s):'')+'</small></div><span class="'+(e.k==='in'?'pos':'neg')+'">'+(e.k==='in'?'+':'-')+fm(e.a)+'</span></div>'}).join('')||'<small style="color:var(--mute)">No transactions yet.</small>')+'</div>'+
   '<h3>Quick actions</h3><div class="kd-qa"><button data-ktrade="1">New sale / purchase</button><button data-kprod="dash">Products</button><button data-a="view" data-v="reports">Reports</button><button data-a="legacy" data-g="cash">Cash book</button><button data-a="legacy" data-g="acc">Parties</button></div>'+
   '<p style="color:var(--mute);font-size:.75rem">Sales exclude tax. Cost of old (pre-2030) sales is estimated from the average of your earlier purchases of the same item. Cancelled documents are excluded.</p>';
}
function reportsHtml(){
  var cats={};REPORTS.forEach(function(r){(cats[r.cat]=cats[r.cat]||[]).push(r)});
  return Object.keys(cats).map(function(c){return '<h3>'+c+'</h3>'+cats[c].map(function(r){return '<div class="kp-c kp-r" data-a="rep" data-id="'+r.id+'"><b style="flex:1">'+esc(r.name)+'</b><span style="color:var(--mute)">&rsaquo;</span></div>'}).join('')}).join('')+
   '<h3>Shortcuts</h3>'+SHORT.map(function(s){return '<div class="kp-c kp-r" data-a="short" data-id="'+s.id+'"><b style="flex:1">'+esc(s.name)+'</b><span style="color:var(--mute)">&rsaquo;</span></div>'}).join('');
}
function reportHtml(){
  var def=byId(V.rid);if(!def){V.view='reports';return reportsHtml()}
  var r=range(),model=def.f(r),head=model.cols.map(function(c){return '<th'+(c.t!=='t'?' class="r"':'')+'>'+esc(c.n)+'</th>'}).join('');
  function row(rw,f){return '<tr'+(f?' class="f"':'')+'>'+rw.map(function(v,i){return '<td'+(model.cols[i].t!=='t'?' class="r"':'')+'>'+esc(cell(model.cols[i],v))+'</td>'}).join('')+'</tr>'}
  return rangeBar()+'<div class="kp-c"><b>'+esc(model.title)+'</b><small>'+esc(r.label)+' | '+model.rows.length+' rows</small></div>'+
   '<div class="kd-ex"><button class="kp-pri" style="margin:0" data-a="ex" data-t="csv">CSV</button><button class="kp-pri" style="margin:0" data-a="ex" data-t="xlsx">Excel</button><button class="kp-pri" style="margin:0" data-a="ex" data-t="pdf">PDF</button></div>'+
   '<div class="kd-sc"><table><thead><tr>'+head+'</tr></thead><tbody>'+(model.rows.length?model.rows.map(function(x2){return row(x2)}).join(''):'<tr><td colspan="'+model.cols.length+'" style="color:var(--mute)">No data for this period.</td></tr>')+(model.foot&&model.rows.length?row(model.foot,true):'')+'</tbody></table></div>';
}
function render(){
  if(!root)return;
  var title=V.view==='dash'?'Dashboard':V.view==='reports'?'Reports':(byId(V.rid)||{name:'Report'}).name,body='';
  if(V.view==='dash')body=dashHtml();else if(V.view==='reports')body=reportsHtml();else body=reportHtml();
  var tabs=V.view==='report'?'':'<div class="kp-t"><button data-a="view" data-v="dash" class="'+(V.view==='dash'?'on':'')+'">Dashboard</button><button data-a="view" data-v="reports" class="'+(V.view==='reports'?'on':'')+'">Reports</button></div>';
  var st=root.scrollTop;
  root.innerHTML='<div class="kp-h"><button data-a="back">&lsaquo; Back</button><b>'+esc(title)+'</b></div><div class="kp-w">'+tabs+body+'</div>';
  root.scrollTop=V.keepScroll?st:0;V.keepScroll=false;
}
function model(){var def=byId(V.rid);return def?def.f(range()):null}
function onClick(e){
  var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a');
  if(a==='back'){if(V.view==='report'){V.view='reports';render()}else close()}
  else if(a==='view'){V.view=b.getAttribute('data-v');render()}
  else if(a==='rng'){V.rng=b.getAttribute('data-v');if(V.rng==='custom'&&!V.from){V.from=today().slice(0,7)+'-01';V.to=today()}V.keepScroll=true;render()}
  else if(a==='rep'){V.rid=b.getAttribute('data-id');V.view='report';render()}
  else if(a==='short'){var s=SHORT.filter(function(x2){return x2.id===b.getAttribute('data-id')})[0];V.rid=s.base;V.rng=s.rng;V.view='report';render()}
  else if(a==='legacy'){var g=b.getAttribute('data-g');close();try{if(g==='cash'){CM='cash';show('cash');cashR()}else{show('acc');acc()}}catch(x3){}}
  else if(a==='ex'){if(window.KNA&&!KNA.guard('view_reports'))return;var m=model();if(!m)return;var t=b.getAttribute('data-t');
    if(t==='csv')download(new Blob([csv(m)],{type:'text/csv;charset=utf-8'}),fname(m,'csv'));
    else if(t==='xlsx')download(xlsx(m,m.title),fname(m,'xlsx'));
    else pdfView(m,range());toast(t==='pdf'?'Report ready':'Download started')}
}
function open(view){
  if(window.KNA&&!KNA.guard(view==='reports'?'view_reports':'view_dashboard'))return;
  if(!root){var st=document.createElement('style');st.textContent=(window.KNP?KNP.css:'').replace(/#kp/g,'#kd')+CSS_EXTRA;document.head.appendChild(st);
    root=document.createElement('div');root.id='kd';root.setAttribute('role','dialog');root.setAttribute('aria-label','Dashboard and reports');document.body.appendChild(root);
    root.addEventListener('click',onClick);
    root.addEventListener('change',function(e){if(e.target.id==='kd-f'||e.target.id==='kd-t'){V.from=(document.getElementById('kd-f')||{}).value||V.from;V.to=(document.getElementById('kd-t')||{}).value||V.to;V.keepScroll=true;render()}})}
  V.view=view==='reports'?'reports':'dash';render();root.className='';document.body.style.overflow='hidden';
}
function close(){if(root)root.className='hide';document.body.style.overflow='';try{window.render()}catch(e){}}
function refresh(){if(root&&root.className!=='hide'&&V.view!=='report'){V.keepScroll=true;render()}else if(root&&root.className!=='hide'){V.keepScroll=true;render()}}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-kdash]');if(!t)return;e.stopImmediatePropagation();e.preventDefault();if(document.querySelector('.lk:not(.hide)'))return;open(t.getAttribute('data-kdash'))},true);
window.KNR={open:open,refresh:refresh,metrics:metrics,items:items,expenses:expenses,reports:REPORTS,csv:csv,xlsx:xlsx,range:range,setRange:function(r,f,t){V.rng=r;V.from=f||'';V.to=t||''},balancesNow:balancesNow,productStats:productStats};
})();
