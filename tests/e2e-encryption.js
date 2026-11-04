const {chromium}=require('playwright');const assert=require('assert');
const DS='.kn-dlg form button[type=submit]';
(async()=>{
 const b=await chromium.launch();const errs=[];
 const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:800}});const p=await c.newPage();p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});return p};
 // ---------- legacy PIN migration ----------
 let pg=await mk();
 await pg.addInitScript(()=>{if(!localStorage.getItem('kn_sec2')&&!localStorage.getItem('seeded')){const hp=p=>{let x=7;for(let i=0;i<p.length;i++)x=(x*31+p.charCodeAt(i))%1000003;return 'k'+x};localStorage.setItem('pvcdana_pin',hp('4321'));localStorage.setItem('seeded','1')}});
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 assert.equal(await pg.evaluate(()=>!document.getElementById('lk').classList.contains('hide')),true);assert.equal(await pg.locator('#dots i').count(),4);
 for(const d of '4321')await pg.click(`#lk [data-k="${d}"]`);
 await pg.waitForSelector('#lk.hide',{state:'attached'});await pg.waitForSelector('#kdl-ok',{timeout:5000});await pg.check('#kdl-ok');await pg.click(DS);
 const m=await pg.evaluate(()=>({legacy:localStorage.getItem('pvcdana_pin'),c:JSON.parse(localStorage.kn_sec2)}));
 console.log('MIGRATION',JSON.stringify({legacyGone:m.legacy===null,iter:m.c.creds.u_owner.i,len:m.c.len,rec:!!m.c.rec}));assert.equal(m.legacy,null);assert.equal(m.c.creds.u_owner.i,150000);assert.equal(m.c.len,4);
 // ---------- encrypted database ----------
 pg=await mk();
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 await pg.evaluate(()=>{S.products.push({id:'ps',name:'SecretWidget',sku:'P-0001',unit:'pcs',buyPrice:5,sellPrice:9,wholesalePrice:0,minStock:0,active:true,warehouse:'wh_main',kind:'std',created:1});save()});
 await pg.waitForTimeout(300);
 const rawIdb=()=>pg.evaluate(()=>new Promise(r=>{const q=indexedDB.open('KhataNovaLocal');q.onsuccess=()=>{const g=q.result.transaction('app_state').objectStore('app_state').get('business');g.onsuccess=()=>{const v=g.result;r({enc:!!v.enc,data:!!v.data,txt:JSON.stringify(v.data||{iv:Array.from(v.enc.iv)}) ,ctLen:v.enc?v.enc.ct.length:0,ctHasPlain:v.enc?new TextDecoder().decode(v.enc.ct).includes('SecretWidget'):false})}}}));
 let r=await rawIdb();assert.equal(r.data,true);assert.ok(r.txt.includes('SecretWidget'));
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 await pg.click('#ksc [data-a=encon]');
 await pg.fill('#kdl-p1','short');await pg.fill('#kdl-p2','short');await pg.click(DS);assert.ok(/at least 10/.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-p1','correct horse battery');await pg.fill('#kdl-p2','correct horse battery');await pg.click(DS);assert.ok(/understand/.test(await pg.innerText('#kdl-err')));
 await pg.check('#kdl-ok');await pg.click(DS);await pg.waitForSelector('.kn-dlg',{state:'detached',timeout:20000});await pg.waitForTimeout(500);
 r=await rawIdb();const mirror=await pg.evaluate(()=>localStorage.getItem('pvcdana_v1'));
 console.log('ENCRYPTED',JSON.stringify({enc:r.enc,plainData:r.data,ctLen:r.ctLen,ctHasPlain:r.ctHasPlain,mirrorRemoved:mirror===null}));
 assert.ok(r.enc&&!r.data&&!r.ctHasPlain&&mirror===null);
 await pg.evaluate(()=>{S.products.push({id:'p2',name:'AfterEncrypt',sku:'P-0002',unit:'pcs',buyPrice:1,sellPrice:2,wholesalePrice:0,minStock:0,active:true,warehouse:'wh_main',kind:'std',created:2});save()});await pg.waitForTimeout(400);
 assert.equal(await pg.evaluate(()=>localStorage.getItem('pvcdana_v1')),null);console.log('saves stay encrypted, no plaintext mirror: ok');
 await pg.reload();await pg.waitForSelector('#kn-dbp');console.log('passphrase screen shown after restart: ok');
 await pg.fill('#kn-dbpw','wrong passphrase!!');await pg.click('#kn-dbp button[type=submit]');await pg.waitForTimeout(900);console.log('WRONG>',await pg.innerText('#kn-dbe'));assert.ok(/Wrong/.test(await pg.innerText('#kn-dbe')));
 await pg.fill('#kn-dbpw','correct horse battery');await pg.click('#kn-dbp button[type=submit]');await pg.waitForFunction(()=>!document.getElementById('knDbVeil')&&!document.getElementById('kn-dbp'),null,{timeout:15000});
 const names=await pg.evaluate(()=>S.products.map(p=>p.name).join(','));console.log('DATA after unlock:',names);assert.equal(names,'SecretWidget,AfterEncrypt');
 // turn off
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');await pg.click('#ksc [data-a=encoff]');
 await pg.fill('#kdl-p','nope nope nope');await pg.click(DS);await pg.waitForTimeout(900);assert.ok(/wrong/i.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-p','correct horse battery');await pg.click(DS);await pg.waitForSelector('.kn-dlg',{state:'detached',timeout:15000});await pg.waitForTimeout(500);
 r=await rawIdb();const mir=await pg.evaluate(()=>!!localStorage.getItem('pvcdana_v1'));console.log('DECRYPTED',JSON.stringify({plain:r.data,enc:r.enc,mirror:mir}));assert.ok(r.data&&!r.enc&&mir);
 await pg.reload();await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));assert.equal(await pg.evaluate(()=>S.products.length),2);console.log('after reload (no passphrase needed): ok');
 console.log('ERRORS:',errs.length?errs:'none');await b.close();
})().catch(e=>{console.log('TEST FAIL',e.stack||e.message);process.exit(1)});
