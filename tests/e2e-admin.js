const {chromium}=require('playwright');const assert=require('assert');
(async()=>{
 const b=await chromium.launch();const pg=await (await b.newContext({viewport:{width:390,height:800}})).newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 await pg.evaluate(()=>{S.products.push({id:'pw',name:'Widget',sku:'P-0001',unit:'pcs',buyPrice:10,sellPrice:15,wholesalePrice:0,minStock:2,active:true,warehouse:'wh_main',kind:'std',created:1});save()});
 // auto backup runs by itself after hydrate
 for(let i=0;i<40&&!(await pg.evaluate(async()=>(await KNADM.listMeta()).some(m=>m.kind==='auto')));i++)await pg.waitForTimeout(250);assert.ok(await pg.evaluate(async()=>(await KNADM.listMeta()).some(m=>m.kind==='auto')),'auto backup missing');
 // open from settings
 await pg.click('[data-go=set]:visible');await pg.click('[data-kadm]:visible');await pg.waitForSelector('#kad:not(.hide)');
 // settings
 await pg.fill('#kad-pre','SL-');await pg.fill('#kad-tt','5');await pg.fill('#kad-taxno','NTN-123');await pg.selectOption('#kad-df','dmy');await pg.click('#kad [data-a=savecfg]');
 let c=await pg.evaluate(()=>({p:S.cfg.invPrefix,t:S.cfg.tradeTax,n:S.biz.tax,d:S.cfg.dateFmt}));assert.deepEqual(c,{p:'SL-',t:5,n:'NTN-123',d:'dmy'});
 await pg.fill('#kad-pre','bad prefix!!');await pg.click('#kad [data-a=savecfg]');assert.equal(await pg.evaluate(()=>S.cfg.invPrefix),'SL-');
 // manual backup + list
 await pg.click('#kad [data-a=now]');await pg.waitForTimeout(800);await pg.waitForFunction(()=>document.querySelectorAll('#kad [data-a=restore]').length>=2);
 // integrity: clean, then corrupted
 await pg.click('#kad [data-a=check]');await pg.waitForSelector('#kad .kp-badge');const bt=await pg.innerText('#kad .kp-badge');assert.ok(/passed|OK with/.test(bt),bt);
 const r=await pg.evaluate(()=>{const d=JSON.parse(JSON.stringify(S));d.sales.push({id:'x',no:'S1',items:[{product:'pw',name:'W',qty:2,rate:15,net:1,disc:0}],subtotal:5,discount:0,tax:0,total:5,taxRate:0,paid:100,payments:[],returns:[]});return KNADM.check(d)});
 assert.ok(r.errors.length>=2,JSON.stringify(r));
 // CSV import
 const csv='name,sku,buy,sell,opening\nBolt,,12,18,200\nWidget,,1,2,3\nNut,,abc,1,1\n';
 const res=await pg.evaluate(t=>KNADM.importCsv(t),csv);assert.equal(res.added,1);assert.equal(res.skipped,2);
 const bolt=await pg.evaluate(()=>{const p=S.products.find(x=>x.name==='Bolt');return{sku:p.sku,q:KNP.stockMap()[p.id]}});assert.equal(bolt.q,200);assert.ok(/^P-\d+$/.test(bolt.sku));
 // restore from the backup taken before the import
 const ts=await pg.evaluate(async()=>(await KNADM.listMeta()).filter(m=>m.kind==='manual')[0].ts);
 await Promise.all([pg.waitForEvent('load'),pg.evaluate(t=>KNADM.restore(t),ts)]);
 await pg.waitForFunction(()=>!document.getElementById('knDbVeil')&&typeof knReady!=='undefined'&&knReady);
 const after=await pg.evaluate(()=>({bolt:!!S.products.find(x=>x.name==='Bolt'),w:!!S.products.find(x=>x.id==='pw'),pre:null}));
 assert.equal(after.bolt,false);assert.equal(after.w,true);
 assert.ok(await pg.evaluate(async()=>(await KNADM.listMeta()).some(m=>m.kind==='pre-restore')));
 // export / share download
 await pg.click('[data-go=set]:visible');await pg.click('[data-kadm]:visible');
 await pg.fill('#kad-pw','longpassword1');const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#kad [data-a=share]')]);assert.ok(dl.suggestedFilename().endsWith('.knbackup'));
 assert.deepEqual(errs,[]);console.log('ADMIN OK');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
