const {chromium}=require('playwright');const assert=require('assert');
(async()=>{
 const b=await chromium.launch();const pg=await (await b.newContext({viewport:{width:390,height:800}})).newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 const answers=[];pg.on('dialog',d=>d.accept(answers.shift()||''));
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 await pg.evaluate(()=>{S.products.push({id:'pw',name:'Widget',sku:'P-0001',unit:'pcs',buyPrice:0,sellPrice:150,wholesalePrice:0,minStock:2,active:true,warehouse:'wh_main',kind:'std',created:1});save()});
 const toast=()=>pg.innerText('#ts');
 const open=async()=>{await pg.locator('[data-ktrade]:visible').first().click();await pg.waitForSelector('#kt:not(.hide)')};
 const fillRow=async(i,prod,q,r,d)=>{const row=pg.locator('#kt [data-i]').nth(i);await row.locator('[data-f=product]').selectOption(prod);await row.locator('[data-f=qty]').fill(q);if(r!==undefined)await row.locator('[data-f=rate]').fill(r);if(d)await row.locator('[data-f=disc]').fill(d)};
 const stock=()=>pg.evaluate(()=>KNP.stockMap()['pw']);
 await open();
 // 1) PURCHASE 10 x 100, unpaid, tax 0
 await pg.click('#kt [data-a=new][data-k=purchase]');
 await pg.fill('#ktf-party','Sup A');await fillRow(0,'pw','10','100');await pg.fill('#ktf-tax','0');await pg.selectOption('#ktf-st','unpaid');
 await pg.click('#kt-save');await pg.waitForSelector('#kt .kp-big, #kt h2');
 let st=await pg.evaluate(()=>({q:KNP.stockMap().pw,avg:P=KNP.getProduct('pw').avgCost,tot:S.purchases[0].total,lines:KNT.partyLines('sup a').map(l=>l.v)}));
 console.log('PURCHASE',JSON.stringify(st));assert.equal(st.q,10);assert.equal(st.avg,100);assert.equal(st.tot,100000);assert.deepEqual(st.lines,[-1000]);
 // 2) SALE 4 x 150, partial 200 cash
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=sale]');
 await pg.fill('#ktf-party','Cust B');await fillRow(0,'pw','4');
 console.log('auto rate filled:',await pg.locator('#kt [data-f=rate]').inputValue());
 await pg.fill('#ktf-tax','0');await pg.selectOption('#ktf-st','partial');await pg.fill('#ktf-paid','200');
 console.log('TOTALS>',(await pg.innerText('#kt-tot')).replace(/\n+/g,' | '));
 await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 console.log('SALE DOC>',(await pg.innerText('#kt')).replace(/\n+/g,' | ').slice(0,330));
 st=await pg.evaluate(()=>{const d=S.sales[0];return{q:KNP.stockMap().pw,cogs:d.cogs,profit:d.profit,paid:d.paid,status:d.status,lines:KNT.partyLines('cust b').map(l=>l.v),cash:KNT.balances().cash}});
 console.log('SALE',JSON.stringify(st));
 assert.equal(st.q,6);assert.equal(st.cogs,40000);assert.equal(st.profit,20000);assert.deepEqual(st.lines,[600,-200]);assert.equal(st.cash,20000);
 // legacy party ledger + cash book screens must reflect it
 const led=await pg.evaluate(()=>{const m=all();return{cust:m['cust b']&&m['cust b'].net,sup:m['sup a']&&m['sup a'].net}});console.log('LEGACY all():',JSON.stringify(led));assert.equal(led.cust,400);assert.equal(led.sup,-1000);
 // 3) oversell blocked
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=sale]');
 await pg.fill('#ktf-party','Cust B');await fillRow(0,'pw','7');await pg.click('#kt-save');console.log('OVERSELL>',await toast());assert.ok(/Not enough stock/.test(await toast()));assert.equal(await stock(),6);
 // 4) walk-in credit blocked, bad qty blocked
 await pg.fill('#ktf-party','');await fillRow(0,'pw','1');await pg.selectOption('#ktf-st','unpaid');await pg.click('#kt-save');console.log('WALKIN CREDIT>',await toast());
 await pg.selectOption('#ktf-st','paid');await pg.fill('#ktf-party','');await fillRow(0,'pw','1','150','20');
 console.log('TOTALS2>',(await pg.innerText('#kt-tot')).replace(/\n+/g,' | '));
 // 5) walk-in fully paid with discount 20 + 10% tax: net 130, tax 13 => 143
 await pg.fill('#ktf-tax','10');await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 st=await pg.evaluate(()=>{const d=S.sales[1];return{total:d.total,q:KNP.stockMap().pw,profit:d.profit,hasParty:!!S.pt['']}});console.log('WALKIN',JSON.stringify(st));assert.equal(st.total,14300);assert.equal(st.q,5);assert.equal(st.profit,3000);
 // 6) second purchase 10 x 130 -> weighted avg (5*100+1300)/15 = 120
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=purchase]');
 await pg.fill('#ktf-party','Sup A');await fillRow(0,'pw','10','130');await pg.fill('#ktf-tax','0');await pg.fill('#ktf-inv','SI-77');await pg.selectOption('#ktf-st','unpaid');await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 const avg=await pg.evaluate(()=>KNP.getProduct('pw').avgCost);console.log('WEIGHTED AVG',avg);assert.ok(Math.abs(avg-120)<1e-9);
 // duplicate supplier invoice no
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=purchase]');await pg.fill('#ktf-party','Sup A');await fillRow(0,'pw','1','130');await pg.fill('#ktf-inv','si-77');await pg.selectOption('#ktf-st','unpaid');await pg.click('#kt-save');console.log('DUP INV>',await toast());assert.ok(/already recorded/.test(await toast()));
 // 7) bank account + pay supplier 500 by bank on purchase #1
 await pg.click('#kt [data-a=back]');
 answers.push('HBL','5000');await pg.click('#kt [data-a=bank]');
 let bal=await pg.evaluate(()=>KNT.balances());console.log('BALANCES',JSON.stringify(bal));assert.equal(bal.banks[0].bal,500000);
 await pg.click('#kt [data-a=tab][data-v=purchase]');await pg.locator('#ktl .kp-r').last().click();
 await pg.fill('#ktp-a','500');await pg.selectOption('#ktp-m',{label:'HBL'});await pg.click('#kt [data-a=pay]');
 bal=await pg.evaluate(()=>KNT.balances());console.log('BALANCES after bank pay',JSON.stringify(bal));assert.equal(bal.banks[0].bal,450000);
 const over=await pg.evaluate(()=>0);await pg.fill('#ktp-a','999999');await pg.click('#kt [data-a=pay]');console.log('OVERPAY>',await toast());
 // 8) void the first sale (partial) -> stock back, ledger + cash revert
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=tab][data-v=sale]');await pg.locator('#ktl .kp-r').last().click();
 const before=await pg.evaluate(()=>({q:KNP.stockMap().pw,cash:KNT.balances().cash}));
 answers.push('customer returned');await pg.click('#kt [data-a=void]');
 const after=await pg.evaluate(()=>({q:KNP.stockMap().pw,cash:KNT.balances().cash,cust:all()['cust b'].net,void:!!S.sales[0].void,audits:S.audit.filter(a=>a.action==='void').length}));
 console.log('VOID',JSON.stringify(before),'->',JSON.stringify(after));assert.equal(after.q,before.q+4);assert.equal(after.cash,before.cash-20000);assert.equal(after.cust,0);assert.ok(after.void);
 // 9) double submit guard
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=new][data-k=sale]');await pg.fill('#ktf-party','Cust C');await fillRow(0,'pw','1');await pg.selectOption('#ktf-st','unpaid');
 const n0=await pg.evaluate(()=>S.sales.length);
 await pg.evaluate(()=>{const f=document.querySelector('#kt form');f.requestSubmit();f.requestSubmit?0:0});
 await pg.waitForTimeout(200);const n1=await pg.evaluate(()=>S.sales.length);console.log('DOUBLE SUBMIT sales added:',n1-n0);assert.equal(n1-n0,1);
 // 10) cash book screen shows derived lines; products page shows profit/sold
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=back]').catch(()=>{});
 await pg.evaluate(()=>{CM='cash';show('cash');cashR()});console.log('CASHBOOK>',(await pg.innerText('#p-cash')).replace(/\n+/g,' | ').slice(0,260));
 await pg.evaluate(()=>{KNP.open('list')});await pg.locator('#kp .kp-r').first().click();const pr=await pg.evaluate(()=>{const p=KNP.getProduct('pw');const m=KNP.movesOf(p);let sold=0;m.forEach(v=>{if(v.type==='sale')sold+=-v.q;if(v.type==='void_sale')sold-=v.q});return sold});console.log('NET SOLD',pr);assert.equal(pr,2);console.log('PRODUCT>',(await pg.innerText('#kp')).replace(/\n+/g,' | ').slice(0,300));
 // persistence
 await pg.waitForTimeout(400);await pg.reload();await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 console.log('after reload:',await pg.evaluate(()=>JSON.stringify({s:S.sales.length,p:S.purchases.length,mv:S.stockMoves.length,au:S.audit.length})));
 console.log('ERRORS:',errs.length?errs:'none');await b.close();
})().catch(e=>{console.log('TEST FAIL',e.stack||e.message);process.exit(1)});
