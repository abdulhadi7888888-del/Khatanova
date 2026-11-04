const {chromium}=require('playwright');const assert=require('assert');
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:800}});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 const cdp=await ctx.newCDPSession(pg);await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 const toast=()=>pg.innerText('#ts');
 const DS='.kn-dlg form button[type=submit]';
 const enter=async pin=>{for(const d of pin)await pg.click(`#lk [data-k="${d}"]`)};
 const locked=()=>pg.evaluate(()=>!document.getElementById('lk').classList.contains('hide'));
 const waitUnlocked=()=>pg.waitForSelector('#lk.hide',{state:'attached',timeout:8000});
 await pg.goto('http://localhost:8099/index.html');await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));
 assert.equal(await locked(),false);
 // ---- A/B: setup PIN
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 await pg.click('#ksc [data-a=setpin]');
 await pg.fill('#kdl-p1','111111');await pg.fill('#kdl-p2','111111');await pg.click(DS);console.log('WEAK PIN>',await pg.innerText('#kdl-err'));assert.ok(/too easy/.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-p1','123456');await pg.fill('#kdl-p2','123456');await pg.click(DS);assert.ok(/too easy/.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-p1','482915');await pg.fill('#kdl-p2','482916');await pg.click(DS);assert.ok(/do not match/.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-p2','482915');await pg.click(DS);
 await pg.waitForSelector('#kdl-ok');let code=(await pg.locator('div[style*="monospace"]').innerText()).trim();console.log('RECOVERY CODE shape:',code.replace(/[A-Z2-9]/g,'X'));assert.match(code,/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
 await pg.click(DS);assert.ok(/confirm/.test(await pg.innerText('#kdl-err')));await pg.check('#kdl-ok');await pg.click(DS);
 await pg.waitForSelector('#kdl-ok',{state:'detached'});
 const st=await pg.evaluate(()=>{const c=JSON.parse(localStorage.kn_sec2);return{len:c.len,iter:c.creds.u_owner.i,hlen:c.creds.u_owner.h.length,rec:!!c.rec,all:JSON.stringify(Object.assign({},localStorage)),legacy:localStorage.getItem('pvcdana_pin')}});
 console.log('STORED',JSON.stringify({len:st.len,iter:st.iter,hlen:st.hlen,rec:st.rec}));assert.equal(st.len,6);assert.equal(st.iter,150000);assert.ok(!st.all.includes('482915'));assert.ok(!st.all.includes(code)&&!st.all.includes(code.replace(/-/g,'')));
 // ---- C: biometric via virtual authenticator
 await pg.click('#ksc [data-a=bioon]');await pg.waitForTimeout(600);console.log('BIO ready:',await pg.evaluate(()=>KNSEC.core.bioReady()));assert.ok(await pg.evaluate(()=>KNSEC.core.bioReady()));
 await pg.click('#ksc [data-a=lock]');
 await waitUnlocked();console.log('BIOMETRIC unlock ok (auto prompt)');
 await pg.evaluate(()=>KNSEC.core.bioDisable());
 // ---- E: lockout
 await pg.evaluate(()=>KNA.lock('test'));assert.equal(await locked(),true);
 assert.equal(await pg.locator('#dots i').count(),6);
 for(let i=0;i<4;i++){await enter('000001');await pg.waitForTimeout(450)}
 console.log('MSG after 4 wrong:',await pg.innerText('#lm'));
 await enter('000001');await pg.waitForTimeout(600);
 const lm=await pg.innerText('#lm');console.log('MSG after 5 wrong:',lm);assert.ok(/Too many/.test(lm));
 await enter('482915');await pg.waitForTimeout(500);assert.equal(await locked(),true,'correct PIN must be ignored during lockout');console.log('correct PIN ignored during lockout: ok');
 const fails=await pg.evaluate(()=>JSON.parse(localStorage.kn_sec2).fails.u_owner);assert.ok(fails.n>=5&&fails.u>Date.now());
 await pg.evaluate(()=>{const c=JSON.parse(localStorage.kn_sec2);c.fails.u_owner.u=0;localStorage.kn_sec2=JSON.stringify(c)});await pg.waitForTimeout(1300);
 await enter('482915');await waitUnlocked();console.log('unlock with correct PIN after lockout expiry: ok');
 assert.equal(await pg.evaluate(()=>JSON.parse(localStorage.kn_sec2).fails.u_owner.n),0);
 // ---- F: cold start vs resume
 await pg.evaluate(()=>{sessionStorage.clear();Storage.prototype.setItem=function(){}});await pg.reload();await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));assert.equal(await locked(),true);console.log('cold start is locked: ok');
 await enter('482915');await waitUnlocked();await pg.reload();await pg.waitForFunction(()=>!document.getElementById('knDbVeil'));assert.equal(await locked(),false);console.log('quick reload resumes session: ok');
 // ---- G: auto-lock background + idle
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 await pg.selectOption('#ksc-bg','0');
 await pg.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await locked(),true);console.log('background auto-lock (immediate): ok');
 await pg.evaluate(()=>{delete document.hidden;});await enter('482915');await waitUnlocked();
 await pg.locator('[data-go=lock]:visible').first().click();await pg.selectOption('#ksc-bg','60');await pg.selectOption('#ksc-idle','60');await pg.click('#ksc [data-a=back]');
 await pg.evaluate(()=>{window.__r=Date.now;Date.now=()=>window.__r()+120000});await pg.waitForTimeout(5600);
 assert.equal(await locked(),true);console.log('idle auto-lock: ok');await pg.evaluate(()=>{Date.now=window.__r});
 await enter('482915');await waitUnlocked();
 // ---- H: recovery
 await pg.evaluate(()=>KNA.lock('test'));await pg.click('#kn-forgot');
 await pg.fill('#kdl-r','AAAA-BBBB-CCCC-DDDD');await pg.fill('#kdl-p1','739261');await pg.fill('#kdl-p2','739261');await pg.click(DS);await pg.waitForTimeout(700);console.log('WRONG RECOVERY>',await pg.innerText('#kdl-err'));assert.ok(/not correct/.test(await pg.innerText('#kdl-err')));
 await pg.fill('#kdl-r',code.toLowerCase());await pg.click(DS);await pg.waitForTimeout(800);console.log('RECOVERY RETRY err>',JSON.stringify(await pg.innerText('#kdl-err').catch(e=>'none')),'code=',code);
 await pg.waitForSelector('#kdl-ok');const code2=(await pg.locator('div[style*="monospace"]').innerText()).trim();assert.notEqual(code2,code);await pg.check('#kdl-ok');await pg.click(DS);
 await pg.waitForTimeout(400);assert.equal(await locked(),true);await enter('482915');await pg.waitForTimeout(500);assert.equal(await locked(),true);console.log('old PIN no longer works: ok');
 await enter('739261');await waitUnlocked();console.log('PIN reset by recovery code: ok');
 // ---- I: users & roles
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 await pg.click('#ksc [data-a=uadd]');await pg.fill('#kdl-n','Sara');await pg.click(DS);await pg.waitForTimeout(300);
 const sid=await pg.evaluate(()=>S.users.filter(u=>u.name==='Sara')[0].id);
 await pg.click(`#ksc [data-a=upin][data-id="${sid}"]`);await pg.fill('#kdl-p1','913572');await pg.fill('#kdl-p2','913572');await pg.click(DS);await pg.waitForTimeout(600);
 await pg.click('#ksc [data-a=logout]');await pg.waitForSelector('#kn-users button');console.log('USER CHIPS>',await pg.locator('#kn-users').innerText());
 await pg.click('#kn-users [data-u="'+sid+'"]');await enter('913572');await waitUnlocked();
 const r=await pg.evaluate(()=>({role:KNA.role(),rep:KNA.can('view_reports'),sale:KNA.can('sales_create'),cancel:KNA.can('cancel_docs'),set:KNA.can('settings_manage'),adminSec:KNA.rolePerms('admin').includes('security_manage')}));
 console.log('SARA',JSON.stringify(r));assert.deepEqual(r,{role:'salesperson',rep:false,sale:true,cancel:false,set:false,adminSec:false});
 await pg.locator('[data-kdash=reports]:visible').first().click();await pg.waitForTimeout(200);console.log('REPORTS TILE>',await toast());assert.ok(/permission/.test(await toast()));assert.equal(await pg.evaluate(()=>!!document.querySelector('#kd:not(.hide)')),false);
 await pg.locator('[data-go=set]:visible').first().click();await pg.waitForTimeout(200);assert.equal(await pg.evaluate(()=>document.getElementById('p-set').className.includes('hide')),true);console.log('SETTINGS blocked: ok');
 await pg.locator('[data-ktrade]:visible').first().click();await pg.waitForSelector('#kt:not(.hide)');console.log('SALE screen allowed: ok');await pg.click('#kt [data-a=back]');
 await pg.locator('[data-go=lock]:visible').first().click();console.log('SEC CENTER for Sara has Users section:',(await pg.innerText('#ksc')).includes('Role permissions'));assert.ok(!(await pg.innerText('#ksc')).includes('Role permissions'));
 await pg.click('#ksc [data-a=logout]');await pg.click('#kn-users [data-u="u_owner"]');await enter('739261');await waitUnlocked();
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 await pg.selectOption('#ksc-role','salesperson');await pg.check('#ksc-perms [data-p=view_reports]');await pg.click('#ksc [data-a=rsave]');
 await pg.click('#ksc [data-a=logout]');await pg.click('#kn-users [data-u="'+sid+'"]');await enter('913572');await waitUnlocked();
 assert.equal(await pg.evaluate(()=>KNA.can('view_reports')),true);console.log('role permission edit takes effect: ok');
 await pg.click('#kn-users [data-u="'+sid+'"]').catch(()=>{});
 await pg.evaluate(()=>KNA.logout());await pg.click('#kn-users [data-u="u_owner"]');await enter('739261');await waitUnlocked();
 // ---- J: security log + remove lock
 await pg.locator('[data-go=lock]:visible').first().click();await pg.waitForSelector('#ksc:not(.hide)');
 const log=await pg.innerText('#ksc');['PIN reset with recovery code','Role permissions changed','Signed in'].forEach(t=>assert.ok(log.includes(t),'log missing '+t));const acts=await pg.evaluate(()=>S.audit.map(a=>a.action));['sec:biometric-enabled','sec:login-failed','sec:lock','sec:pin-enabled','sec:denied','sec:user-added'].forEach(t=>assert.ok(acts.includes(t),'audit missing '+t));console.log('SECURITY LOG ok');
 await pg.click('#ksc [data-a=rmlock]');await pg.fill('#kdl-o','739261');await pg.click(DS);await pg.waitForTimeout(500);
 assert.equal(await pg.evaluate(()=>KNSEC.core.lockEnabled()),false);console.log('lock removed: ok');
 console.log('ERRORS:',errs.length?errs:'none');await b.close();
})().catch(e=>{console.log('TEST FAIL',e.stack||e.message);process.exit(1)});
