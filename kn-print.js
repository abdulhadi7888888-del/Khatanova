/* KhataNova 2030 - Printable documents (Phase 4): invoice, purchase invoice, quotation,
   delivery note, payment receipt, return note. Rendered in an in-app overlay (iframe) so it works
   without pop-ups; "Print / Save as PDF" uses the device print dialog. WhatsApp shares a text summary. */
(function(){
'use strict';
function loc(){return (typeof LOC==='string'&&LOC)||'en-IN'}
function sym(){return (typeof CS==='string'&&CS)||'Rs'}
function money(m){return sym()+' '+(m/100).toLocaleString(loc(),{minimumFractionDigits:2,maximumFractionDigits:2})}
function qty(n){return (Math.round(n*1000)/1000).toLocaleString(loc(),{maximumFractionDigits:3})}
var CSS='*{box-sizing:border-box}body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:22px}.hd{display:flex;justify-content:space-between;gap:14px;border-bottom:3px solid #3b5bff;padding-bottom:12px}'+
'.hd img{max-height:58px;max-width:140px;margin-bottom:6px}.hd h1{margin:0;font-size:20px}.hd small{display:block;color:#555}.ti{text-align:right}.ti h2{margin:0;font-size:18px;color:#3b5bff;letter-spacing:.5px}'+
'.pp{display:flex;justify-content:space-between;margin:14px 0}.pp div{max-width:48%}.pp small{color:#666;text-transform:uppercase;font-size:10px;letter-spacing:.6px;display:block}'+
'table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#eef1ff;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px}th,td{padding:7px 8px;border-bottom:1px solid #e3e6f0}td.r,th.r{text-align:right;white-space:nowrap}'+
'.tt{margin:14px 0 0 auto;width:min(320px,100%)}.tt div{display:flex;justify-content:space-between;padding:4px 0}.tt .g{border-top:2px solid #111;font-weight:700;font-size:15px;margin-top:4px;padding-top:7px}'+
'.nt{margin-top:16px;color:#444}.sg{display:flex;justify-content:space-between;margin-top:56px}.sg span{border-top:1px solid #444;padding-top:4px;width:40%;text-align:center;font-size:11px}.ft{margin-top:26px;text-align:center;color:#777;font-size:11px}'+
'.bd{display:inline-block;border:2px solid;border-radius:6px;padding:2px 9px;font-weight:700;font-size:12px;margin-top:6px}.paid{color:#0a8a4a}.due{color:#c2410c}.void{color:#b91c1c}@page{size:A4;margin:12mm}';

function fd(x){var m=/^(\d{4})-(\d\d)-(\d\d)/.exec(x||''),f=S.cfg&&S.cfg.dateFmt;if(!m||!f||f==='iso')return x;return f==='dmy'?m[3]+'/'+m[2]+'/'+m[1]:m[2]+'/'+m[3]+'/'+m[1]}
function bizHtml(){
  var b=S.biz||{};
  return '<div>'+(b.logo&&/^data:image\//.test(b.logo)?'<img alt="" src="'+esc(b.logo)+'">':'')+'<h1>'+esc(b.n||'KhataNova')+'</h1>'+(b.a?'<small>'+esc(b.a)+'</small>':'')+(b.p?'<small>Phone: '+esc(b.p)+'</small>':'')+(b.tax?'<small>Tax no: '+esc(b.tax)+'</small>':'')+'</div>';
}
function titleOf(d,type,ret){
  if(type==='quote')return 'QUOTATION';if(type==='delivery')return 'DELIVERY NOTE';if(type==='receipt')return 'PAYMENT RECEIPT';
  if(type==='return')return d.kind==='sale'?'SALES RETURN':'PURCHASE RETURN';return d.kind==='sale'?'SALES INVOICE':'PURCHASE INVOICE';
}
function build(d,type,x){
  var T=KNT,pay=null,ret=null,no=d.no,date=fd(d.date),prices=type!=='delivery',rows=d.items,out='';
  if(type==='receipt'){pay=d.payments.filter(function(p){return p.id===x})[0];if(!pay)return'';no='RCT-'+d.no+'-'+(d.payments.indexOf(pay)+1);date=fd(pay.date)}
  if(type==='return'){ret=(d.returns||[]).filter(function(r){return r.id===x})[0];if(!ret)return'';no=ret.no;date=fd(ret.date)}
  var partyLbl=d.kind==='purchase'?'Supplier':(type==='receipt'&&d.kind==='purchase'?'Paid to':'Bill to');
  var ph=d.pk&&S.ph&&S.ph[d.pk]?S.ph[d.pk]:'';
  out+='<div class="hd">'+bizHtml()+'<div class="ti"><h2>'+titleOf(d,type)+'</h2><small>No: <b>'+esc(no)+'</b></small><small>Date: '+esc(date)+'</small>'+(type==='receipt'||type==='return'?'<small>Against: '+esc(d.no)+'</small>':'')+(d.invNo&&type!=='receipt'?'<small>Supplier inv: '+esc(d.invNo)+'</small>':'')+'</div></div>';
  out+='<div class="pp"><div><small>'+partyLbl+'</small><b>'+esc(d.party||'Walk-in customer')+'</b>'+(ph?'<br>'+esc(ph):'')+'</div>'+(d.void?'<div style="text-align:right"><span class="bd void">CANCELLED</span></div>':'')+'</div>';
  if(type==='receipt'){
    var paidTo=T.paidUpTo(d,pay);
    out+='<table><tbody><tr><td>Amount received'+(d.kind==='purchase'?' (paid)':'')+'</td><td class="r"><b style="font-size:17px">'+money(pay.amount)+'</b></td></tr><tr><td>Method</td><td class="r">'+esc(T.mName(pay.method))+'</td></tr><tr><td>Invoice total</td><td class="r">'+money(T.netTotal(d))+'</td></tr><tr><td>Paid to date</td><td class="r">'+money(paidTo)+'</td></tr><tr><td><b>Balance after this payment</b></td><td class="r"><b>'+money(Math.max(T.netTotal(d)-paidTo,0))+'</b></td></tr></tbody></table>';
  }else{
    if(type==='return'){rows=ret.items.map(function(r){var it=d.items[r.idx];return{name:it.name,unit:it.unit,qty:r.qty,rate:it.rate,disc:0,net:r.net}})}
    out+='<table><thead><tr><th style="width:28px">#</th><th>Product</th><th class="r">Qty</th>'+(prices?'<th class="r">Rate</th><th class="r">Disc</th><th class="r">Amount</th>':'')+'</tr></thead><tbody>'+
      rows.map(function(i,n){return '<tr><td>'+(n+1)+'</td><td>'+esc(i.name)+'</td><td class="r">'+qty(i.qty)+' '+esc(i.unit)+'</td>'+(prices?'<td class="r">'+money(i.rate)+'</td><td class="r">'+(i.disc?money(i.disc):'-')+'</td><td class="r">'+money(i.net)+'</td>':'')+'</tr>'}).join('')+'</tbody></table>';
    if(prices){
      var sub=0,dis=0,tax,tot;
      if(type==='return'){tot=ret.amount;tax=ret.amount-ret.net;out+='<div class="tt"><div><span>Return value</span><b>'+money(ret.net)+'</b></div>'+(tax?'<div><span>Tax</span><b>'+money(tax)+'</b></div>':'')+'<div class="g"><span>Credit total</span><span>'+money(tot)+'</span></div>'+(ret.refund?'<div><span>Refunded ('+esc(T.mName(ret.refund.method))+')</span><b>'+money(ret.refund.amount)+'</b></div>':'')+'</div>'}
      else{
        out+='<div class="tt"><div><span>Subtotal</span><b>'+money(d.subtotal)+'</b></div>'+(d.discount?'<div><span>Discount</span><b>-'+money(d.discount)+'</b></div>':'')+(d.tax?'<div><span>Tax '+d.taxRate+'%</span><b>'+money(d.tax)+'</b></div>':'')+'<div class="g"><span>Grand total</span><span>'+money(d.total)+'</span></div>';
        if(type!=='quote'){var rt=T.retTotal(d);if(rt)out+='<div><span>Returns</span><b>-'+money(rt)+'</b></div>';out+='<div><span>Paid</span><b>'+money(T.paidNet(d))+'</b></div><div><span><b>Balance due</b></span><b>'+money(Math.max(T.dueOf(d),0))+'</b></div>'}
        out+='</div>';
        if(type!=='quote'){var st=T.statusOf(d);out+='<span class="bd '+(st==='paid'?'paid':'due')+'">'+(st==='paid'?'PAID':st==='partial'?'PARTLY PAID':'UNPAID')+'</span>'}
      }
    }
  }
  if(d.note)out+='<div class="nt"><b>Note:</b> '+esc(d.note)+'</div>';
  if(type==='delivery')out+='<div class="sg"><span>Delivered by</span><span>Received by</span></div>';
  if(type==='quote')out+='<div class="nt">This quotation is an estimate and does not reserve stock.</div>';
  out+='<div class="ft">Thank you for your business. Generated by KhataNova</div>';
  return out;
}
function waText(d,type,x){
  var T=KNT,t=(S.biz&&S.biz.n||'KhataNova')+'\n'+titleOf(d,type)+' '+d.no+'\nDate: '+d.date+'\n';
  if(d.party)t+='Party: '+d.party+'\n';
  if(type!=='receipt'&&type!=='delivery')t+='\n'+d.items.map(function(i){return i.name+': '+qty(i.qty)+' '+i.unit+' x '+money(i.rate)}).join('\n')+'\n';
  if(type==='delivery')t+='\n'+d.items.map(function(i){return i.name+': '+qty(i.qty)+' '+i.unit}).join('\n')+'\n';
  if(type==='receipt'){var p=d.payments.filter(function(z){return z.id===x})[0];if(p)t+='\nPayment received: '+money(p.amount)+' ('+T.mName(p.method)+')\n'}
  if(type==='invoice'||type==='quote')t+='\nTotal: '+money(d.total)+'\n';
  if(type==='invoice'){t+='Paid: '+money(T.paidNet(d))+'\nBalance due: '+money(Math.max(T.dueOf(d),0))+'\n'}
  return t+'\nThank you.';
}
var ov=null;
function show(d,type,x){
  var html=build(d,type,x);if(!html){toast('Nothing to print');return}
  if(!ov){ov=document.createElement('div');ov.id='kpr';ov.style.cssText='position:fixed;inset:0;z-index:97;background:#1a1f33;display:flex;flex-direction:column';document.body.appendChild(ov)}
  ov.innerHTML='<div style="display:flex;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:linear-gradient(135deg,#1c2f8f,#7c3aed)"><button id="kpr-x" style="flex:1">Close</button><button id="kpr-p" style="flex:2">Print / Save as PDF</button><button id="kpr-w" style="flex:2;background:#1faa59">WhatsApp</button></div><iframe id="kpr-f" title="Document preview" style="flex:1;border:0;background:#fff;width:100%"></iframe>';
  var f=ov.querySelector('iframe');f.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(titleOf(d,type)+' '+d.no)+'</title><style>'+CSS+'</style></head><body>'+html+'</body></html>';
  ov.style.display='flex';
  ov.querySelector('#kpr-x').onclick=function(){ov.style.display='none'};
  ov.querySelector('#kpr-p').onclick=function(){try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Printing is not available in this browser')}};
  ov.querySelector('#kpr-w').onclick=function(){var n=d.pk&&S.ph&&S.ph[d.pk]&&typeof num==='function'?num(S.ph[d.pk]):'';window.open('https://wa.me/'+n+'?text='+encodeURIComponent(waText(d,type,x)),'_blank')};
}
window.KNPR={show:show,build:build,waText:waText};
})();
