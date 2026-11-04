/* KhataNova 2030 - Security core (Phase 6).
   - PIN: PBKDF2-SHA256 (150k iterations, per-user random salt), 4-6 digits, escalating lockout, recovery code.
   - Auto-lock: background / idle timers, lock on page hide, session resume only within 60 s of a reload.
   - Biometric: WebAuthn platform authenticator in browsers; Capacitor BiometricAuth plugin when packaged natively.
     A plain website CANNOT read a fingerprint; WebAuthn only asks the OS to verify the user.
   - Roles + permissions (KNA.can / KNA.guard) enforced on navigation and on every sensitive action.
   - Optional encrypted local database (AES-256-GCM, key from a passphrase via PBKDF2 250k). Not recoverable if forgotten.
   Honest limit: this is client-side protection. Someone with developer tools on an unlocked device can bypass any web UI lock. */
(function(){
'use strict';
var LS='kn_sec2',LEG='pvcdana_pin',ENCF='kn_enc',SS='kn_sess',BIOK='khatanova_bio_credential_v1';
var DELAYS=[30,60,300,900,3600],RESUME_MS=60000,PIN_REQ_MS=72*3600*1000;
var TE=new TextEncoder(),TD=new TextDecoder();

/* ---------------- permissions ---------------- */
var PERMS=[['view_dashboard','View dashboard and financial summaries'],['view_reports','View and export reports'],['sales_create','Create sales and quotations'],['purchase_create','Create purchases'],['payments_add','Record payments'],['returns','Process returns'],['cancel_docs','Cancel sales / purchases'],
 ['party_view','View parties and ledgers'],['party_manage','Add / edit parties'],['stock_view','View products and stock'],['products_manage','Add / edit products'],['stock_adjust','Change stock balances'],['cash_manage','Cash book, expenses and bank'],['staff_manage','Staff and salary'],
 ['delete_records','Delete records'],['settings_manage','Sensitive settings and backup'],['users_manage','Manage users and roles'],['security_manage','Security settings']];
var ALLP=PERMS.map(function(p){return p[0]});
var ROLES=[['owner','Owner'],['admin','Admin'],['manager','Manager'],['salesperson','Salesperson'],['accountant','Accountant'],['stock','Stock operator']];
var DEF={admin:ALLP.filter(function(p){return p!=='security_manage'}),
 manager:['view_dashboard','view_reports','sales_create','purchase_create','payments_add','returns','party_view','party_manage','stock_view','products_manage','stock_adjust','cash_manage'],
 salesperson:['sales_create','payments_add','party_view','stock_view'],
 accountant:['view_dashboard','view_reports','payments_add','party_view','cash_manage','stock_view'],
 stock:['stock_view','products_manage','stock_adjust','purchase_create']};
var session={u:null,start:0,last:0},locked=false,pending=[],hiddenAt=0,selUser='',buf='',busy=false,tick=null;

/* ---------------- helpers ---------------- */
function $(i){return document.getElementById(i)}
function b64(u){var s='';u=new Uint8Array(u);for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
function ub64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function rnd(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return a}
async function pbk(pass,salt,iter,bits){var k=await crypto.subtle.importKey('raw',TE.encode(pass),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:iter},k,bits))}
function eq(a,b){if(a.length!==b.length)return false;var d=0;for(var i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function mkHash(secret){var salt=rnd(16),it=150000;return{s:b64(salt),i:it,h:b64(await pbk(secret,salt,it,256)),t:Date.now()}}
async function chkHash(secret,rec){return eq(b64(await pbk(secret,ub64(rec.s),rec.i,256)),rec.h)}
function cfg(){var c=null;try{c=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){}
  if(!c||typeof c!=='object')c={v:2,len:4,creds:{},fails:{},rec:null,bg:30,idle:300,bioUser:'',lastPin:{},users:[]};
  c.creds=c.creds||{};c.fails=c.fails||{};c.lastPin=c.lastPin||{};c.users=c.users||[];return c}
function put(c){try{localStorage.setItem(LS,JSON.stringify(c))}catch(e){}}
function legacyPin(){try{return localStorage.getItem(LEG)||''}catch(e){return''}}
function lockEnabled(){return Object.keys(cfg().creds).length>0||!!legacyPin()}
function toastx(m){if(typeof toast==='function')toast(m)}
function weakPin(p){return /^(\d)\1+$/.test(p)||'0123456789'.indexOf(p)>-1||'9876543210'.indexOf(p)>-1}
function fmtWait(ms){var s=Math.ceil(ms/1000);return s>=60?Math.floor(s/60)+'m '+('0'+(s%60)).slice(-2)+'s':s+'s'}

/* ---------------- users / audit log ---------------- */
function users(){return(window.S&&Array.isArray(S.users)&&S.users.length)?S.users:[{id:'u_owner',name:'Owner',role:'owner',active:true}]}
function userById(id){return users().filter(function(u){return u.id===id})[0]||null}
function syncUsers(){var c=cfg();c.users=users().map(function(u){return{id:u.id,name:u.name,role:u.role,active:u.active!==false}});put(c)}
function log(action,detail){
  var uid=session.u||selUser||'system';
  if(window.S&&window.KN&&typeof knReady!=='undefined'&&knReady){try{KN.audit(S,'sec:'+action,'security',uid,null,detail||null,uid);save()}catch(e){}}
  else pending.push([action,detail,uid]);
}
function flushLog(){if(!pending.length)return;var p=pending.splice(0);p.forEach(function(x){try{KN.audit(S,'sec:'+x[0],'security',x[2],null,x[1]||null,x[2])}catch(e){}});try{save()}catch(e){}}

/* ---------------- permission API ---------------- */
function curUser(){return session.u?userById(session.u):null}
function role(){if(!lockEnabled())return'owner';var u=curUser();return u?u.role:''}
function rolePerms(r){if(r==='owner')return ALLP;var o=window.S&&S.roles&&S.roles[r];return Array.isArray(o)?o:(DEF[r]||[])}
function can(p){if(!lockEnabled())return true;if(locked||!session.u)return false;var r=role();return r==='owner'||rolePerms(r).indexOf(p)>-1}
function guard(p,msg){if(can(p))return true;toastx(msg||'You do not have permission for this action');log('denied',{perm:p});return false}

/* ---------------- dialog builder ---------------- */
function dlg(o){
  return new Promise(function(resolve){
    var ov=document.createElement('div');ov.className='kn-dlg';ov.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(5,8,20,.72);display:grid;place-items:center;padding:16px;overflow:auto';
    var h='<form style="width:min(380px,100%);background:#10172d;color:#eef2ff;border:1px solid #2b3a63;border-radius:20px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.6)" novalidate><b style="font-size:1.05rem">'+esc(o.title||'')+'</b>';
    if(o.text)h+='<p style="color:#aebbe0;font-size:.85rem;margin:8px 0 4px">'+o.text+'</p>';
    (o.fields||[]).forEach(function(f){
      if(f.type==='note'){h+='<div style="margin:10px 0;padding:10px;border-radius:12px;background:#1a2447;font-size:.85rem;'+(f.mono?'font:700 1.05rem/1.4 monospace;letter-spacing:1px;text-align:center;user-select:all':'')+'">'+f.text+'</div>';return}
      h+='<label style="display:block;font-size:.8rem;color:#9fb0da;margin:10px 0 4px" for="kdl-'+f.id+'">'+esc(f.label||'')+'</label>';
      if(f.type==='select')h+='<select id="kdl-'+f.id+'" style="width:100%;padding:11px;border-radius:10px;background:#0b1226;color:#fff;border:1px solid #2b3a63">'+f.opts.map(function(p){return '<option value="'+esc(p[0])+'"'+(String(f.value)===String(p[0])?' selected':'')+'>'+esc(p[1])+'</option>'}).join('')+'</select>';
      else if(f.type==='checkbox')h+='<label style="display:flex;gap:8px;align-items:flex-start;font-size:.85rem;color:#dfe6ff"><input id="kdl-'+f.id+'" type="checkbox" style="width:auto;margin-top:3px"> <span>'+esc(f.text||'')+'</span></label>';
      else h+='<input id="kdl-'+f.id+'" type="'+(f.type||'text')+'" '+(f.inputmode?'inputmode="'+f.inputmode+'" ':'')+(f.maxlength?'maxlength="'+f.maxlength+'" ':'')+'autocomplete="off" value="'+esc(f.value||'')+'" placeholder="'+esc(f.ph||'')+'" style="width:100%;padding:11px;border-radius:10px;background:#0b1226;color:#fff;border:1px solid #2b3a63">';
    });
    h+='<div id="kdl-err" role="alert" style="color:#ff8b8b;font-size:.82rem;min-height:1.2em;margin-top:8px"></div><div style="display:flex;gap:8px;margin-top:6px">'+(o.noCancel?'':'<button type="button" id="kdl-c" style="flex:1;background:transparent;color:#cfd8ff;border:1px solid #3b4a78;border-radius:12px;padding:11px">Cancel</button>')+'<button type="submit" style="flex:2;background:linear-gradient(90deg,#3b5bff,#7c5cff);color:#fff;border:0;border-radius:12px;padding:11px;font-weight:700">'+esc(o.ok||'OK')+'</button></div></form>';
    ov.innerHTML=h;document.body.appendChild(ov);
    var form=ov.querySelector('form'),first=ov.querySelector('input,select');if(first&&first.type!=='checkbox')setTimeout(function(){first.focus()},30);
    function done(v){ov.remove();resolve(v)}
    var c=ov.querySelector('#kdl-c');if(c)c.onclick=function(){done(null)};
    form.onsubmit=async function(e){e.preventDefault();
      var v={};(o.fields||[]).forEach(function(f){var el=ov.querySelector('#kdl-'+f.id);if(el)v[f.id]=f.type==='checkbox'?el.checked:el.value.trim()});
      var btn=form.querySelector('button[type=submit]');btn.disabled=true;
      try{var err=o.check?await o.check(v):null;if(err){ov.querySelector('#kdl-err').textContent=err;btn.disabled=false;return}}catch(x){ov.querySelector('#kdl-err').textContent='Something went wrong. Try again.';btn.disabled=false;return}
      done(v)};
  });
}
function esc2(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function esc(s){return typeof window.esc==='function'?window.esc(s):esc2(s)}

/* ---------------- PIN / recovery management ---------------- */
function recoveryCode(){var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=rnd(16),s='';for(var i=0;i<16;i++){s+=A[r[i]%32];if(i%4===3&&i<15)s+='-'}return s}
async function showRecovery(code){await dlg({title:'Your recovery code',text:'Write this code on paper and keep it away from this phone. It is the ONLY way to reset the owner PIN if you forget it. It will not be shown again.',fields:[{type:'note',text:code,mono:true},{id:'ok',type:'checkbox',text:'I have saved my recovery code'}],ok:'Done',noCancel:true,check:function(v){return v.ok?null:'Please confirm that you saved the code'}})}
async function newRecovery(){var code=recoveryCode(),c=cfg();c.rec=await mkHash(code.replace(/-/g,''));put(c);await showRecovery(code);log('recovery-code-created')}
function pinCheck(p,len){if(!new RegExp('^\\d{'+len+'}$').test(p))return'PIN must be exactly '+len+' digits';if(weakPin(p))return'That PIN is too easy to guess. Avoid 1234, 0000 and similar.';return null}
async function setupPin(){
  if(lockEnabled()){toastx('PIN lock is already enabled');return false}
  var v=await dlg({title:'Set up PIN lock',text:'Choose a PIN you can remember. It protects the app screen on this device.',fields:[{id:'len',label:'PIN length',type:'select',opts:[['4','4 digits'],['5','5 digits'],['6','6 digits (recommended)']],value:'6'},{id:'p1',label:'New PIN',type:'password',inputmode:'numeric',maxlength:6},{id:'p2',label:'Repeat PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Enable lock',
    check:function(v){var e=pinCheck(v.p1,+v.len);if(e)return e;if(v.p1!==v.p2)return'The two PINs do not match';return null}});
  if(!v)return false;
  var c=cfg();c.len=+v.len;c.creds.u_owner=await mkHash(v.p1);c.lastPin.u_owner=Date.now();put(c);syncUsers();
  session={u:'u_owner',start:Date.now(),last:Date.now()};storeSess();log('pin-enabled');
  await newRecovery();toastx('PIN lock enabled');return true;
}
async function changePin(uid){
  uid=uid||session.u||'u_owner';var c=cfg();
  var v=await dlg({title:'Change PIN',fields:[{id:'o',label:'Current PIN',type:'password',inputmode:'numeric',maxlength:6},{id:'p1',label:'New PIN',type:'password',inputmode:'numeric',maxlength:6,ph:c.len+' digits'},{id:'p2',label:'Repeat new PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Change PIN',
    check:async function(v){var cc=cfg();if(!cc.creds[uid])return'No PIN is set for this user';if(!(await chkHash(v.o,cc.creds[uid])))return'Current PIN is wrong';var e=pinCheck(v.p1,cc.len);if(e)return e;if(v.p1===v.o)return'Choose a different PIN';if(v.p1!==v.p2)return'The two PINs do not match';return null}});
  if(!v)return false;c=cfg();c.creds[uid]=await mkHash(v.p1);c.lastPin[uid]=Date.now();c.fails[uid]={n:0,u:0};put(c);log('pin-changed',{user:uid});toastx('PIN changed');return true;
}
async function adminSetPin(uid){
  var c=cfg(),u=userById(uid);if(!u)return false;
  var v=await dlg({title:'Set PIN for '+u.name,text:'The user can change it later. PIN length is '+c.len+' digits.',fields:[{id:'p1',label:'New PIN',type:'password',inputmode:'numeric',maxlength:6},{id:'p2',label:'Repeat PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Save PIN',
    check:function(v){var e=pinCheck(v.p1,cfg().len);if(e)return e;if(v.p1!==v.p2)return'The two PINs do not match';return null}});
  if(!v)return false;c=cfg();c.creds[uid]=await mkHash(v.p1);c.fails[uid]={n:0,u:0};put(c);syncUsers();log('pin-set-by-admin',{user:uid});toastx('PIN saved for '+u.name);return true;
}
async function removeLock(){
  var v=await dlg({title:'Remove PIN lock',text:'Anyone who opens this phone will be able to open KhataNova. All user PINs and the biometric link are removed.',fields:[{id:'o',label:'Owner PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Remove lock',
    check:async function(v){var c=cfg();return c.creds.u_owner&&await chkHash(v.o,c.creds.u_owner)?null:'Owner PIN is wrong'}});
  if(!v)return false;
  log('pin-removed');var c=cfg();c.creds={};c.fails={};c.rec=null;c.bioUser='';put(c);try{localStorage.removeItem(LEG);localStorage.removeItem(BIOK)}catch(e){}
  session={u:'u_owner',start:Date.now(),last:Date.now()};toastx('App lock removed');return true;
}
async function regenRecovery(){
  var v=await dlg({title:'New recovery code',text:'The old code stops working.',fields:[{id:'o',label:'Owner PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Continue',check:async function(v){var c=cfg();return c.creds.u_owner&&await chkHash(v.o,c.creds.u_owner)?null:'Owner PIN is wrong'}});
  if(!v)return false;await newRecovery();return true;
}
async function recoverOwner(){
  var c=cfg();if(!c.rec){await dlg({title:'No recovery code',text:'No recovery code exists on this device. Restore your latest encrypted backup in a new browser profile, or erase local data from the database screen.',ok:'OK',noCancel:true});return}
  var v=await dlg({title:'Reset owner PIN',text:'Enter the recovery code you saved when you enabled PIN lock.',fields:[{id:'r',label:'Recovery code',ph:'XXXX-XXXX-XXXX-XXXX',maxlength:19},{id:'p1',label:'New PIN',type:'password',inputmode:'numeric',maxlength:6},{id:'p2',label:'Repeat new PIN',type:'password',inputmode:'numeric',maxlength:6}],ok:'Reset PIN',
    check:async function(v){var f=cfg().fails.recovery||{n:0,u:0};if(f.u>Date.now())return'Too many attempts. Try again in '+fmtWait(f.u-Date.now());
      var ok=await chkHash(v.r.toUpperCase().replace(/[^A-Z0-9]/g,''),cfg().rec);
      if(!ok){var cc=cfg(),ff=cc.fails.recovery||{n:0,u:0};ff.n++;if(ff.n>=5)ff.u=Date.now()+DELAYS[Math.min(ff.n-5,4)]*1000;cc.fails.recovery=ff;put(cc);log('recovery-failed');return'Recovery code is not correct'}
      var e=pinCheck(v.p1,cfg().len);if(e)return e;if(v.p1!==v.p2)return'The two PINs do not match';return null}});
  if(!v)return;c=cfg();c.creds.u_owner=await mkHash(v.p1);c.fails={};c.lastPin.u_owner=Date.now();put(c);log('pin-reset-by-recovery');
  await newRecovery();toastx('PIN reset. Unlock with your new PIN.');showLock();
}

/* ---------------- lock screen ---------------- */
function lockedOutMs(uid){var f=cfg().fails[uid]||{};return Math.max(0,(f.u||0)-Date.now())}
function activeLockUsers(){var c=cfg(),list=c.users.filter(function(u){return u.active!==false&&(c.creds[u.id]||(u.id==='u_owner'&&legacyPin()))});if(!list.length&&lockEnabled())list=[{id:'u_owner',name:'Owner',role:'owner'}];return list}
function setDots(){var len=cfg().len||4,d=$('dots');if(!d)return;if(d.children.length!==len)d.innerHTML=new Array(len+1).join('<i></i>');Array.prototype.forEach.call(d.children,function(i,k){i.className=k<buf.length?'f':''})}
function msg(t,bad){var m=$('lm');if(m){m.textContent=t;m.style.color=bad?'#ff9b9b':''}}
function renderChips(){
  var el=$('kn-users'),list=activeLockUsers();if(!el)return;
  if(list.length<2){el.innerHTML='';el.style.display='none';return}
  el.style.display='flex';el.innerHTML=list.map(function(u){return '<button type="button" data-u="'+esc(u.id)+'" class="'+(u.id===selUser?'on':'')+'">'+esc(u.name)+'</button>'}).join('');
}
function refreshWait(){
  clearInterval(tick);var ms=lockedOutMs(selUser);
  if(ms<=0){msg('Enter your PIN');return}
  function t(){var r=lockedOutMs(selUser);if(r<=0){clearInterval(tick);msg('Enter your PIN');return}msg('Too many wrong attempts. Try again in '+fmtWait(r),true)}
  t();tick=setInterval(t,1000);
}
function showLock(){
  if(!lockEnabled())return;
  locked=true;session.u=null;buf='';busy=false;var c=cfg(),list=activeLockUsers();
  if(!selUser||!list.some(function(u){return u.id===selUser}))selUser=(list[0]||{}).id||'u_owner';
  document.querySelectorAll('#kp,#kt,#kd,#kj,#ksc').forEach(function(e){e.className='hide'});document.body.style.overflow='';
  $('lk').className='lk';$('lp').value='';setDots();renderChips();refreshWait();
  var showBio=!!(c.bioUser&&c.bioUser===selUser&&bioReady()&&Date.now()-(c.lastPin[c.bioUser]||0)<PIN_REQ_MS);
  $('bioUnlock').style.display=showBio?'flex':'none';
  var fg=$('kn-forgot');if(fg)fg.style.display=selUser==='u_owner'?'':'none';
  if(showBio&&lockedOutMs(selUser)<=0)setTimeout(function(){if(locked)bioUnlock()},350);
}
function hideOverlays(){document.querySelectorAll('#kp,#kt,#kd,#kj,#ksc').forEach(function(e){e.className='hide'});document.body.style.overflow=''}
function storeSess(){try{sessionStorage.setItem(SS,JSON.stringify({u:session.u,last:Date.now()}))}catch(e){}}
function unlock(uid,how){
  locked=false;session={u:uid,start:Date.now(),last:Date.now()};buf='';busy=false;clearInterval(tick);
  $('lk').className='lk hide';$('lp').value='';storeSess();log('login',{how:how});
  if(window.KNR)try{KNR.refresh()}catch(e){}
}
function lock(reason){if(!lockEnabled()||locked)return;storeSess();log('lock',{reason:reason});showLock()}
function logout(){
  if(!lockEnabled()){toastx('Set up a PIN first. Logout locks the app.');return}
  log('logout');try{sessionStorage.removeItem(SS)}catch(e){}hideOverlays();selUser='';locked=false;showLock();try{show('home')}catch(e){}
}
async function tryPin(){
  var c=cfg(),uid=selUser,pin=buf,len=c.len||4;
  if(lockedOutMs(uid)>0){buf='';setDots();return}
  var ok=false,migrated=false;
  if(c.creds[uid])ok=await chkHash(pin,c.creds[uid]);
  else if(uid==='u_owner'&&legacyPin()&&typeof hp==='function'&&hp(pin)===legacyPin()){ok=true;migrated=true}
  c=cfg();
  if(ok){
    if(migrated){c.creds.u_owner=await mkHash(pin);c.len=pin.length;try{localStorage.removeItem(LEG)}catch(e){}}
    c.fails[uid]={n:0,u:0};c.lastPin[uid]=Date.now();put(c);unlock(uid,'pin');
    if(migrated){log('pin-migrated');setTimeout(function(){showRecovery_migrate()},400)}
    return;
  }
  var f=c.fails[uid]||{n:0,u:0};f.n++;var left=5-f.n;
  if(f.n>=5)f.u=Date.now()+DELAYS[Math.min(f.n-5,DELAYS.length-1)]*1000;
  c.fails[uid]=f;put(c);log('login-failed',{user:uid,count:f.n});
  var lc=document.querySelector('.lkc');if(lc){lc.classList.remove('sh');void lc.offsetWidth;lc.classList.add('sh')}
  buf='';setDots();
  if(f.u>Date.now())refreshWait();else msg('Wrong PIN. '+left+' attempt'+(left===1?'':'s')+' left before a temporary lock.',true);
}
function showRecovery_migrate(){newRecovery().then(function(){toastx('Your PIN was upgraded to stronger protection')})}
function press(k){
  if(!locked||busy||lockedOutMs(selUser)>0)return;var len=cfg().len||4;
  if(k==='x')buf=buf.slice(0,-1);else if(/^\d$/.test(k)&&buf.length<len)buf+=k;
  setDots();if(buf.length===len){busy=true;tryPin().then(function(){busy=false}).catch(function(){busy=false;buf='';setDots()})}
}

/* ---------------- biometric ---------------- */
function nativeBio(){var C=window.Capacitor;return(C&&C.isNativePlatform&&C.isNativePlatform()&&C.Plugins&&C.Plugins.BiometricAuth)||null}
function webBioOK(){return !!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext)}
function getBio(){try{return JSON.parse(localStorage.getItem(BIOK)||'null')}catch(e){return null}}
function bioReady(){var c=cfg();if(!c.bioUser)return false;return c.bioMode==='native'?!!nativeBio():(!!getBio()&&webBioOK())}
function b64u(buf){return btoa(String.fromCharCode.apply(null,new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64u(v){v=v.replace(/-/g,'+').replace(/_/g,'/');while(v.length%4)v+='=';return Uint8Array.from(atob(v),function(c){return c.charCodeAt(0)})}
async function bioEnable(){
  if(!lockEnabled()||!session.u){toastx('Set up a PIN first');return false}
  var c=cfg(),N=nativeBio();
  try{
    if(N){var r=await N.checkBiometry();if(!r||!r.isAvailable)throw new Error('No biometrics are enrolled on this phone');await N.authenticate({reason:'Enable biometric unlock for KhataNova',cancelTitle:'Cancel'});c.bioMode='native'}
    else{
      if(!webBioOK()){toastx('Biometric unlock needs HTTPS and a supported phone or browser');return false}
      var host=location.hostname,cred=await navigator.credentials.create({publicKey:{challenge:rnd(32),rp:{name:'KhataNova',id:host},user:{id:rnd(16),name:'khatanova-'+session.u,displayName:'KhataNova user'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},timeout:60000,attestation:'none'}});
      if(!cred)throw new Error('Cancelled');localStorage.setItem(BIOK,JSON.stringify({id:b64u(cred.rawId),created:Date.now(),rp:host}));c.bioMode='web'}
    c.bioUser=session.u;put(c);log('biometric-enabled',{mode:c.bioMode});toastx('Biometric unlock enabled');return true;
  }catch(e){toastx(e&&e.name==='NotAllowedError'?'Biometric setup cancelled':(e.message||'Could not enable biometric unlock'));return false}
}
function bioDisable(){var c=cfg();c.bioUser='';put(c);try{localStorage.removeItem(BIOK)}catch(e){}log('biometric-disabled');toastx('Biometric unlock turned off')}
async function bioUnlock(){
  var c=cfg();if(!c.bioUser||!bioReady())return;
  if(Date.now()-(c.lastPin[c.bioUser]||0)>=PIN_REQ_MS){msg('For safety, enter your PIN (required every 3 days).');$('bioUnlock').style.display='none';return}
  try{
    var N=nativeBio();
    if(N)await N.authenticate({reason:'Unlock KhataNova',cancelTitle:'Use PIN'});
    else{var b=getBio();await navigator.credentials.get({publicKey:{challenge:rnd(32),rpId:b.rp||location.hostname,allowCredentials:[{type:'public-key',id:unb64u(b.id)}],userVerification:'required',timeout:60000}})}
    if(locked&&c.bioUser===selUser)unlock(c.bioUser,'biometric');
  }catch(e){msg('Biometric not verified. Use your PIN.',true)}
}

/* ---------------- encrypted local database ---------------- */
var encKey=null,encMeta=null,encTry={n:0,u:0};
function encOn(){if(encKey)return true;try{return localStorage.getItem(ENCF)==='1'}catch(e){return false}}
async function dKey(pass,salt,iter){var k=await crypto.subtle.importKey('raw',TE.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:iter},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function sealObj(obj){var iv=rnd(12),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},encKey,TE.encode(JSON.stringify(obj)));return{v:1,salt:encMeta.salt,iter:encMeta.iter,iv:iv,ct:new Uint8Array(ct)}}
function encRecord(snapshot){
  if(!encKey)return Promise.resolve(encOn()?'skip':null);
  return sealObj(snapshot).then(function(e){return{id:'business',schemaVersion:2,updatedAt:Date.now(),enc:e}});
}
async function openRec(rec,pass){var salt=new Uint8Array(rec.enc.salt),k=await dKey(pass,salt,rec.enc.iter);var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(rec.enc.iv)},k,new Uint8Array(rec.enc.ct));return{key:k,data:JSON.parse(TD.decode(pt)),salt:salt,iter:rec.enc.iter}}
async function openKeyed(rec){if(!encKey||!rec||!rec.enc)throw new Error('locked');var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(rec.enc.iv)},encKey,new Uint8Array(rec.enc.ct));return JSON.parse(TD.decode(pt))}
function dbPrompt(rec){
  return new Promise(function(resolve){
    var ov=document.createElement('div');ov.id='kn-dbp';ov.style.cssText='position:fixed;inset:0;z-index:100000;background:radial-gradient(circle at 50% 0,#2b1458,#0b0a18 62%);display:grid;place-items:center;padding:16px;color:#fff';
    ov.innerHTML='<form style="width:min(360px,100%);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:24px;padding:22px;backdrop-filter:blur(14px)"><h2 style="margin:0 0 6px">Unlock database</h2><p style="color:#d6c8f0;margin:0 0 12px;font-size:.88rem">Your business data is encrypted on this device. Enter the database passphrase.</p><input id="kn-dbpw" type="password" autocomplete="off" placeholder="Database passphrase" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.35);color:#fff"><div id="kn-dbe" role="alert" style="color:#ff9b9b;font-size:.85rem;min-height:1.3em;margin:8px 0"></div><button type="submit" style="width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(90deg,#3b5bff,#7c5cff);color:#fff;font-weight:700">Unlock</button><button type="button" id="kn-dber" style="width:100%;margin-top:10px;background:transparent;border:0;color:#ffb4b4;font-size:.8rem">Forgot passphrase? Erase local data</button></form>';
    document.body.appendChild(ov);var inp=ov.querySelector('#kn-dbpw'),err=ov.querySelector('#kn-dbe');setTimeout(function(){inp.focus()},50);
    ov.querySelector('form').onsubmit=async function(e){e.preventDefault();
      if(encTry.u>Date.now()){err.textContent='Too many attempts. Wait '+fmtWait(encTry.u-Date.now())+'.';return}
      try{var r=await openRec(rec,inp.value);encKey=r.key;encMeta={salt:Array.from(r.salt),iter:r.iter};encTry={n:0,u:0};try{localStorage.setItem(ENCF,'1')}catch(x){}ov.remove();resolve({data:r.data})}
      catch(x){encTry.n++;if(encTry.n>=5)encTry.u=Date.now()+DELAYS[Math.min(encTry.n-5,4)]*1000;err.textContent='Wrong passphrase.';inp.value='';inp.focus()}};
    ov.querySelector('#kn-dber').onclick=async function(){
      var v=await dlg({title:'Erase local data',text:'This permanently deletes ALL business data stored on this device. You can restore a backup afterwards. Type ERASE to confirm.',fields:[{id:'t',label:'Type ERASE',ph:'ERASE'}],ok:'Erase everything',check:function(v){return v.t==='ERASE'?null:'Type ERASE exactly'}});
      if(v)eraseAll()};
  });
}
function eraseAll(){try{if(window.knDb)knDb.close()}catch(e){}
  var q=indexedDB.deleteDatabase('KhataNovaLocal');function fin(){['pvcdana_v1','pvcdana_u',ENCF,LS,LEG,BIOK,'pvcdana_migrated_v1'].forEach(function(k){try{localStorage.removeItem(k)}catch(e){}});try{sessionStorage.clear()}catch(e){}location.reload()}
  q.onsuccess=fin;q.onerror=fin;q.onblocked=fin}
/* hook used by knInit(): decrypts when the stored record is encrypted */
function read(fn){
  return fn().then(function(rec){
    if(rec&&rec.enc)return dbPrompt(rec);
    if(encOn()&&rec){try{localStorage.removeItem(ENCF)}catch(e){}}
    return rec;
  });
}
async function encEnable(){
  if(encKey||encOn()){toastx('Database encryption is already on');return false}
  var v=await dlg({title:'Encrypt local database',text:'Your data will be stored encrypted (AES-256). You must type this passphrase every time the app starts. <b>If you forget it, the data cannot be recovered</b> except from a backup. Download an encrypted backup first.',
    fields:[{id:'p1',label:'Database passphrase (min 10 characters)',type:'password'},{id:'p2',label:'Repeat passphrase',type:'password'},{id:'ok',type:'checkbox',text:'I understand it cannot be recovered if I forget it'}],ok:'Encrypt now',
    check:function(v){if(v.p1.length<10)return'Use at least 10 characters';if(v.p1!==v.p2)return'The passphrases do not match';if(!v.ok)return'Please confirm you understand';return null}});
  if(!v)return false;
  try{
    var salt=rnd(16),iter=250000;encKey=await dKey(v.p1,salt,iter);encMeta={salt:Array.from(salt),iter:iter};
    await knWriteState(S);
    var chk=await knRead();if(!chk||!chk.enc)throw new Error('verify failed');await openRec(chk,v.p1);
    localStorage.setItem(ENCF,'1');localStorage.removeItem('pvcdana_v1');localStorage.removeItem('pvcdana_u');
    log('db-encryption-on');toastx('Database encrypted');return true;
  }catch(e){console.error('KhataNova encrypt failed',e);encKey=null;encMeta=null;try{await knWriteState(S)}catch(x){}toastx('Could not encrypt. Your data was left unchanged.');return false}
}
async function encDisable(){
  if(!encKey){toastx('Database is not encrypted');return false}
  var v=await dlg({title:'Turn off encryption',text:'Data will be stored unencrypted on this device again.',fields:[{id:'p',label:'Database passphrase',type:'password'}],ok:'Turn off',
    check:async function(v){try{var rec=await knRead();await openRec(rec,v.p);return null}catch(e){return'Passphrase is wrong'}}});
  if(!v)return false;
  encKey=null;encMeta=null;try{localStorage.removeItem(ENCF)}catch(e){}
  try{await knWriteState(S);save();log('db-encryption-off');toastx('Encryption turned off');return true}catch(e){toastx('Could not save. Try again.');return false}
}

/* ---------------- navigation / action guard ---------------- */
function guardClick(e){
  if(!lockEnabled()||locked)return;
  var t=e.target;if(!t||!t.closest)return;var need=null,el;
  if((el=t.closest('[data-kdash]')))need=el.getAttribute('data-kdash')==='reports'?'view_reports':'view_dashboard';
  else if(t.closest('[data-ktrade]'))need=can('sales_create')||can('purchase_create')||can('payments_add')?null:'sales_create';
  else if(t.closest('[data-kprod]'))need='stock_view';
  else if((el=t.closest('nav button[data-p]'))){var p=el.getAttribute('data-p');if(p==='acc')need='party_view';else if(p==='stock')need='stock_view';else if(p==='entry')need=(can('stock_adjust')||can('sales_create')||can('purchase_create'))?null:'stock_adjust'}
  else if((el=t.closest('#p-home [data-go]'))){var g=el.getAttribute('data-go');need={rep:'view_reports',set:'settings_manage',cash:'cash_manage',exp:'cash_manage',staff:'staff_manage',bill:'sales_create',stock:'stock_view',acc:'party_view'}[g]||null}
  else if(t.closest('[data-pp]'))need='party_view';
  else if(t.closest('button.x'))need='delete_records';
  if(need&&!guard(need)){e.stopImmediatePropagation();e.preventDefault()}
}

/* ---------------- activity / timers ---------------- */
function touch(){if(!locked)session.last=Date.now()}
function onHide(){if(locked)return;hiddenAt=Date.now();storeSess();var c=cfg();if(c.bg===0)lock('background')}
function onShow(){
  if(locked||!hiddenAt)return;var c=cfg(),away=Date.now()-hiddenAt;hiddenAt=0;
  if(c.bg>=0&&away>=c.bg*1000)lock('background timeout');
}
function idleCheck(){if(locked||!lockEnabled())return;var c=cfg();if(c.idle>0&&Date.now()-session.last>c.idle*1000)lock('idle')}

/* ---------------- init ---------------- */
function init(){
  var c=cfg();
  /* neutralise the legacy 15-second / fixed-PIN logic: our own timers decide */
  window.lockNow=function(){};
  window.gp=function(){return lockEnabled()?'1':''};
  window.biometricUnlock=bioUnlock;window.setupBiometric=bioEnable;
  window.setLock=function(){if(window.KNSECUI)KNSECUI.open();else setupPin()};
  window.setBioStatus=function(){var el=$('bioStatus');if(el)el.textContent=bioReady()?'Biometric unlock is enabled for this device.':'Biometric unlock is off. Set a PIN first.'};
  var lkc=document.querySelector('.lkc');
  if(lkc&&!$('kn-users')){
    var st=document.createElement('style');st.textContent='#kn-users{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:12px}#kn-users button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:6px 12px;font-size:.82rem}#kn-users button.on{background:linear-gradient(90deg,#3b5bff,#7c5cff);border-color:transparent}#kn-forgot{background:transparent!important;color:#cdbdf3!important;border:0!important;font-size:.8rem;margin-top:10px;text-decoration:underline}';document.head.appendChild(st);
    var ch=document.createElement('div');ch.id='kn-users';ch.style.display='none';$('dots').parentNode.insertBefore(ch,$('dots'));
    var fg=document.createElement('button');fg.type='button';fg.id='kn-forgot';fg.textContent='Forgot PIN?';lkc.appendChild(fg);
    fg.onclick=recoverOwner;ch.onclick=function(e){var b=e.target.closest('[data-u]');if(!b)return;selUser=b.getAttribute('data-u');buf='';showLock()};
  }
  $('lk').onclick=function(e){var k=e.target.getAttribute&&e.target.getAttribute('data-k');if(k===null||k===undefined)return;press(k)};
  $('lp').oninput=null;$('bioUnlock').onclick=bioUnlock;
  document.addEventListener('keydown',function(e){if(!locked||document.getElementById('kn-dbp')||e.target.closest&&e.target.closest('form'))return;if(/^\d$/.test(e.key))press(e.key);else if(e.key==='Backspace')press('x')});
  document.addEventListener('visibilitychange',function(){if(document.hidden)onHide();else onShow()});
  window.addEventListener('pagehide',function(){storeSess();var cc=cfg();if(cc.bg===0&&!locked&&lockEnabled())lock('pagehide')});
  window.addEventListener('pageshow',function(e){if(e.persisted&&lockEnabled())lock('restored')});
  ['pointerdown','keydown','touchstart','scroll'].forEach(function(n){document.addEventListener(n,touch,{passive:true,capture:true})});
  setInterval(idleCheck,5000);setInterval(function(){if(!locked&&session.u)storeSess()},10000);
  document.addEventListener('click',guardClick,true);
  /* start state */
  if(!lockEnabled()){session={u:'u_owner',start:Date.now(),last:Date.now()};return}
  var resume=null;try{resume=JSON.parse(sessionStorage.getItem(SS)||'null')}catch(e){}
  if(resume&&resume.u&&Date.now()-resume.last<RESUME_MS&&cfg().creds[resume.u]){session={u:resume.u,start:Date.now(),last:Date.now()};locked=false;$('lk').className='lk hide';return}
  selUser=c.lastUser||'';showLock();
}
function afterHydrate(){
  try{KN.normalize(S)}catch(e){}
  syncUsers();flushLog();
  if(lockEnabled()&&!locked&&session.u&&!userById(session.u))lock('user removed');
}

window.KNA={can:can,guard:guard,role:role,user:function(){return curUser()},isLocked:function(){return locked},lock:lock,logout:logout,perms:PERMS,roles:ROLES,defaults:DEF,rolePerms:rolePerms};
window.KNSEC={init:init,read:read,encRecord:encRecord,encOn:encOn,afterHydrate:afterHydrate,dlg:dlg,
  core:{openKeyed:openKeyed,cfg:cfg,put:put,lockEnabled:lockEnabled,setupPin:setupPin,changePin:changePin,adminSetPin:adminSetPin,removeLock:removeLock,regenRecovery:regenRecovery,bioEnable:bioEnable,bioDisable:bioDisable,bioReady:bioReady,nativeBio:nativeBio,webBioOK:webBioOK,
   encEnable:encEnable,encDisable:encDisable,encActive:function(){return !!encKey},syncUsers:syncUsers,log:log,session:function(){return session},users:users,userById:userById,mkHash:mkHash,chkHash:chkHash,fmtWait:fmtWait,eraseAll:eraseAll}};
})();
