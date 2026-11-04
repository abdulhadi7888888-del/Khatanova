const {chromium}=require('playwright');const assert=require('assert');const fs=require('fs');
const OUT='.';
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:800},acceptDownloads:true});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 await pg.evaluate(()=>{const t=today();S.grades.push({n:'PVC',m:10,k:'raw'});
  S.tx.push({id:1,t:'in',g:'PVC',kg:100,p:'Ali',r:80,d:t},{id:2,t:'out',g:'PVC',kg:30,p:'Cust X',r:100,d:t});
  S.exp.push({id:3,a:500,c:'Rent',n:'shop',d:t});S.staff.push({id:1,n:'Sara'});S.sp.push({id:4,s:1,d:t,a:1000,k:'sal'},{id:5,s:1,d:t,a:300,k:'adv'});
  S.pt['cust x']={t:'c',n:'Cust X'};S.pt['ali']={t:'s',n:'Ali'};
  KN.normalize(S);S.products.push({id:'pw',name:'Widget',sku:'P-0001',unit:'pcs',buyPrice:0,sellPrice:150,wholesalePrice:0,minStock:2,active:true,warehouse:'wh_main',kind:'std',created:1});save()});
 const fillRow=async(prod,q,r)=>{const row=pg.locator('#kt [data-i]').first();await row.locator('[data-f=product]').selectOption(prod);await row.locator('[data-f=qty]').fill(q);if(r)await row.locator('[data-f=rate]').fill(r)};
 await pg.locator('[data-ktrade]:visible').first().click();await pg.waitForSelector('#kt:not(.hide)');
 await pg.click('#kt [data-a=new][data-k=purchase]');await pg.fill('#ktf-party','Sup A');await fillRow('pw','10','100');await pg.fill('#ktf-tax','0');await pg.click('#kt-save');await pg.waitForSelector('#kt h2');await pg.click('#kt [data-a=back]');
 await pg.click('#kt [data-a=new][data-k=sale]');await pg.fill('#ktf-party','Cust B');await fillRow('pw','4');await pg.fill('#ktf-tax','0');await pg.selectOption('#ktf-st','partial');await pg.fill('#ktf-paid','200');await pg.click('#kt-save');await pg.waitForSelector('#kt h2');
 await pg.click('#kt [data-a=back]');await pg.click('#kt [data-a=back]');
 // ---- numbers
 const n=await pg.evaluate(()=>{KNR.setRange('all');const r=KNR.range(),m=KNR.metrics(r),b=KNR.balancesNow();return{sales:m.sales,cogs:m.cogs,gross:m.gross,purch:m.purch,exp:m.exp,net:m.net,rec:b.rec,pay:b.pay,cash:b.cash,bank:b.bank,stock:b.stock}});
 console.log('METRICS',JSON.stringify(n));
 assert.deepEqual(n,{sales:360000,cogs:280000,gross:80000,purch:900000,exp:150000,net:-70000,rec:340000,pay:800000,cash:-260000,bank:0,stock:620000});
 // ---- dashboard UI
 await pg.locator('[data-kdash=dash]:visible').first().click();await pg.waitForSelector('#kd:not(.hide)');
 let t=await pg.innerText('#kd');console.log('DASH>',t.replace(/\n+/g,' | ').slice(0,420));
 assert.ok(await pg.locator('#kd svg.kd-chart rect').count()>0);
 for(const r of ['today','week','month','year','all']){await pg.click(`#kd [data-a=rng][data-v=${r}]`);assert.ok(await pg.locator('#kd svg.kd-chart').count()===1,'chart '+r)}
 await pg.click('#kd [data-a=rng][data-v=custom]');await pg.fill('#kd-f','2030-01-01');await pg.fill('#kd-t','2030-01-31');
 await pg.waitForTimeout(100);t=await pg.innerText('#kd');assert.ok(/Total sales\s*\n?\s*Rs 0/.test(t),'custom empty range should show 0 sales');console.log('custom empty range ok');
 await pg.click('#kd [data-a=rng][data-v=all]');
 // ---- reports
 await pg.click('#kd [data-a=view][data-v=reports]');
 const open=async id=>{await pg.click(`#kd [data-a=rep][data-id=${id}]`);await pg.waitForSelector('#kd table')};
 await open('pl');t=await pg.innerText('#kd');console.log('P&L>',t.replace(/\n+/g,' | ').slice(0,330));
 ['Rent','Staff salary','Net profit'].forEach(k=>assert.ok(t.includes(k)));assert.ok(!t.includes('advance'));
 await pg.click('#kd [data-a=back]');await open('cust');t=await pg.innerText('#kd');assert.ok(t.includes('Cust X')&&t.includes('Cust B'));console.log('CUSTOMER OUTSTANDING ok');
 await pg.click('#kd [data-a=back]');await open('sup');t=await pg.innerText('#kd');assert.ok(t.includes('Ali'));assert.ok(!t.includes('Sup A'));
 await pg.click('#kd [data-a=back]');await open('perf');t=await pg.innerText('#kd');console.log('PERF>',t.replace(/\n+/g,' | ').slice(60,260));
 await pg.click('#kd [data-a=back]');await open('val');await pg.click('#kd [data-a=back]');await open('cf');await pg.click('#kd [data-a=back]');await open('mv');await pg.click('#kd [data-a=back]');
 for(const id of ['sales','purchases','ds','ws','ms','ys','exp','low','out']){await open(id);await pg.click('#kd [data-a=back]')}
 console.log('all 17 reports render');
 // ---- exports of Sales report
 await open('sales');
 let [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#kd [data-a=ex][data-t=csv]')]);await dl.saveAs('/tmp/_s.csv');console.log('CSV file:',dl.suggestedFilename());
 [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#kd [data-a=ex][data-t=xlsx]')]);await dl.saveAs('/tmp/_s.xlsx');console.log('XLSX file:',dl.suggestedFilename());
 await pg.click('#kd [data-a=ex][data-t=pdf]');await pg.waitForSelector('#krp iframe');const src=await pg.evaluate(()=>document.querySelector('#krp iframe').srcdoc);assert.ok(src.includes('Sales report')&&src.includes('Cust B')&&src.includes('Total'));console.log('PDF preview ok');await pg.click('#krp-x');
 // stock shortcut reports
 await pg.click('#kd [data-a=back]');await pg.click('#kd [data-a=short][data-id=dsr]');await pg.waitForSelector('#kd table');console.log('daily stock report ok');
 console.log('ERRORS:',errs.length?errs:'none');await b.close();
})().catch(e=>{console.log('TEST FAIL',e.stack||e.message);process.exit(1)});
