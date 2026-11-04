const {chromium}=require('playwright');const assert=require('assert');
(async()=>{
 const b=await chromium.launch();const pg=await (await b.newContext({viewport:{width:390,height:800}})).newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 const answers=[];pg.on('dialog',d=>d.accept(answers.shift()||''));
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 await pg.evaluate(()=>{S.products.push({id:'pw',name:'Widget',sku:'P-0001',unit:'pcs',buyPrice:0,sellPrice:150,wholesalePrice:0,minStock:2,active:true,warehouse:'wh_main',kind:'std',created:1});S.biz={n:'Nova Traders',a:'Main Bazar, Lahore',p:'03001112222'};S.ph['cust b']='0300-1234567';save()});
 const toast=()=>pg.innerText('#ts');
 const fillRow=async(i,prod,q,r)=>{const row=pg.locator('#kt [data-i]').nth(i);await row.locator('[data-f=product]').selectOption(prod);await row.locator('[data-f=qty]').fill(q);if(r!==undefined)await row.locator('[data-f=rate]').fill(r)};
 const q=(f)=>pg.evaluate(f);
 const newDoc=async(kind,party,qty,rate,status,paid,extra)=>{await pg.click(`#kt [data-a=new][data-k=${kind}]`);await pg.fill('#ktf-party',party);await fillRow(0,'pw',qty,rate);await pg.fill('#ktf-tax',extra&&extra.tax||'0');if(status){await pg.selectOption('#ktf-st',status);if(paid)await pg.fill('#ktf-paid',paid)}await pg.click('#kt-save');await pg.waitForSelector('#kt h2')};
 const doReturn=async(qty,reason,refund,amt)=>{await pg.click('#kt [data-a=ret]');await pg.fill('#kt [data-r="0"]',qty);await pg.fill('#ktr-reason',reason);if(refund){await pg.selectOption('#ktr-m',refund);await pg.fill('#ktr-a',amt)}await pg.click('#kt form button[type=submit]')};
 await pg.locator('[data-ktrade]:visible').first().click();await pg.waitForSelector('#kt:not(.hide)');
 await newDoc('purchase','Sup A','10','100','paid');
await pg.click('#kt [data-a=back]');
 await newDoc('sale','Cust B','4','150','partial','200');
 // ---- sales return, no refund
 await doReturn('1','damaged box');await pg.waitForSelector('#kt h2');
 let r=await q(()=>{const d=S.sales[0];return{stock:KNP.stockMap().pw,due:KNT.dueOf(d),profit:KNT.profitOf(d),cust:all()['cust b'].net,status:KNT.statusOf(d),ret:d.returns.length}});
 console.log('RETURN1',JSON.stringify(r));assert.deepEqual(r,{stock:7,due:25000,profit:15000,cust:250,status:'partial',ret:1});
 // refund more than allowed -> rejected
 await doReturn('1','again','cash','100');console.log('REFUND CAP>',await toast());assert.ok(/cannot be more than/.test(await toast()));
 await pg.click('#kt [data-a=back]');
 console.log('VOID after return>',await pg.evaluate(()=>document.querySelector('#kt [data-a=void]')?'button present':'no cancel button'));
 await pg.click('#kt [data-a=back]');
 // ---- fully paid sale then return with cash refund
 await newDoc('sale','Cust D','2','150','paid');
 await doReturn('1','customer changed mind','cash','150');await pg.waitForSelector('#kt h2');
 r=await q(()=>({stock:KNP.stockMap().pw,cust:all()['cust d'].net,cash:KNT.balances().cash,due:KNT.dueOf(S.sales[1])}));
 console.log('RETURN2 refund',JSON.stringify(r));assert.deepEqual(r,{stock:6,cust:0,cash:-65000,due:0});
 // ---- purchase return with cash refund from supplier
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=tab][data-v=purchase]');await pg.locator('#ktl .kp-r').first().click();
 await doReturn('2','wrong grade','cash','200');await pg.waitForSelector('#kt h2');
 r=await q(()=>({stock:KNP.stockMap().pw,sup:all()['sup a'].net,cash:KNT.balances().cash}));
 console.log('PURCHASE RETURN',JSON.stringify(r));assert.deepEqual(r,{stock:4,sup:0,cash:-45000});
 // ---- quotation -> print -> convert
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=quote]');
 await pg.fill('#ktf-party','Cust E');await fillRow(0,'pw','3');await pg.fill('#ktf-tax','10');await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 let qd=await q(()=>({no:S.quotes[0].no,total:S.quotes[0].total,stock:KNP.stockMap().pw,ledger:S.sales.length}));console.log('QUOTE',JSON.stringify(qd));assert.deepEqual(qd,{no:'QUO-000001',total:49500,stock:4,ledger:2});
 await pg.click('#kt [data-a=print][data-t=quote]');await pg.waitForSelector('#kpr iframe');
 let src=await q(()=>document.querySelector('#kpr iframe').srcdoc);
 ['QUOTATION','QUO-000001','Nova Traders','Main Bazar','Cust E','495.00','does not reserve stock'].forEach(t=>assert.ok(src.includes(t),'quote print missing '+t));console.log('QUOTE PRINT ok, length',src.length);
 await pg.click('#kpr-x');
 await pg.click('#kt [data-a=convert]');
 assert.equal(await pg.inputValue('#ktf-party'),'Cust E');assert.equal(await pg.inputValue('#kt [data-f=qty]'),'3');
 await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 r=await q(()=>({conv:!!S.quotes[0].converted,stock:KNP.stockMap().pw,cash:KNT.balances().cash,total:S.sales[2].total}));
 console.log('CONVERT',JSON.stringify(r));assert.deepEqual(r,{conv:true,stock:1,cash:4500,total:49500});
 // ---- invoice, delivery, receipt prints
 await pg.click('#kt [data-a=print][data-t=invoice]');src=await q(()=>document.querySelector('#kpr iframe').srcdoc);
 ['SALES INVOICE','INV-000003','Grand total','PAID','Nova Traders'].forEach(t=>assert.ok(src.includes(t),'invoice missing '+t));await pg.click('#kpr-x');
 await pg.click('#kt [data-a=print][data-t=delivery]');src=await q(()=>document.querySelector('#kpr iframe').srcdoc);
 assert.ok(src.includes('DELIVERY NOTE')&&src.includes('Received by')&&!src.includes('Grand total'));await pg.click('#kpr-x');
 await pg.click('#kt [data-a=print][data-t=receipt]');src=await q(()=>document.querySelector('#kpr iframe').srcdoc);
 assert.ok(src.includes('PAYMENT RECEIPT')&&src.includes('RCT-INV-000003-1')&&src.includes('495.00'));await pg.click('#kpr-x');
 // return note print for first sale
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=tab][data-v=sale]');await pg.locator('#ktl .kp-r').last().click();
 // list is reversed: last = oldest (INV-000001)
 await pg.locator('#kt [data-a=print][data-t=return]').first().click();src=await q(()=>document.querySelector('#kpr iframe').srcdoc);
 assert.ok(src.includes('SALES RETURN')&&src.includes('INV-000001-R1')&&src.includes('Credit total'));await pg.click('#kpr-x');console.log('PRINTS ok (invoice, delivery, receipt, return)');
 // whatsapp text
 const wa=await q(()=>KNPR.waText(S.sales[0],'invoice'));assert.ok(wa.includes('Nova Traders')&&wa.includes('Balance due'));console.log('WA>',wa.replace(/\n/g,' / ').slice(0,200));
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=back]');
 // ---- stock adjustments
 await pg.evaluate(()=>{KNP.open('list')});await pg.locator('#kp .kp-r').first().click();await pg.click('#kp [data-a=adj]');await pg.waitForSelector('#kj:not(.hide)');
 await pg.selectOption('#kj-mode','damage');await pg.fill('#kj-q','1');await pg.click('#kj form button[type=submit]');console.log('NO REASON>',await toast());assert.ok(/reason/.test(await toast()));
 await pg.fill('#kj-r','dropped');await pg.click('#kj form button[type=submit]');await pg.waitForSelector('#kj.hide',{state:'attached'});
 r=await q(()=>({stock:KNP.stockMap().pw,loss:S.stockMoves.filter(m=>m.type==='damage')[0].loss,aud:S.audit.filter(a=>a.action==='stock-damage').length}));
 console.log('DAMAGE',JSON.stringify(r));assert.equal(r.stock,0);assert.equal(r.aud,1);assert.ok(r.loss>0);
 await pg.click('#kp [data-a=adj]');await pg.selectOption('#kj-mode','damage');await pg.fill('#kj-q','1');await pg.fill('#kj-r','x');await pg.click('#kj form button[type=submit]');console.log('OVER-DAMAGE>',await toast());assert.ok(/Only 0/.test(await toast()));
 await pg.selectOption('#kj-mode','count');await pg.fill('#kj-q','5');await pg.fill('#kj-r','physical count');await pg.click('#kj form button[type=submit]');
 assert.equal(await q(()=>KNP.stockMap().pw),5);
 answers.push('Shop');await pg.click('#kp [data-a=adj]');await pg.click('#kj [data-a=wh]');
 await pg.selectOption('#kj-mode','transfer');await pg.selectOption('#kj-to',{label:'Shop'});await pg.fill('#kj-q','2');await pg.fill('#kj-r','shop display');await pg.click('#kj form button[type=submit]');
 r=await q(()=>{const p=KNP.getProduct('pw');const w=KNP.whStock(p);return{total:KNP.stockMap().pw,main:w.wh_main,shop:Object.keys(w).filter(k=>k!=='wh_main').map(k=>w[k])[0]}});
 console.log('TRANSFER',JSON.stringify(r));assert.deepEqual(r,{total:5,main:3,shop:2});
 console.log('DETAIL>',(await pg.innerText('#kp')).replace(/\n+/g,' | ').slice(0,520));
 await pg.waitForTimeout(400);await pg.reload();await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 console.log('after reload:',await q(()=>JSON.stringify({sales:S.sales.length,quotes:S.quotes.length,wh:S.warehouses.length,stock:KNP.stockMap().pw,audit:S.audit.length})));
 console.log('ERRORS:',errs.length?errs:'none');await b.close();
})().catch(e=>{console.log('TEST FAIL',e.stack||e.message);process.exit(1)});
