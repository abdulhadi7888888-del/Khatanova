/* KhataNova 2030 - Security Center screens (Phase 6): PIN, auto-lock, biometric, recovery, database encryption,
   users, role permissions, security log. Logic lives in kn-security.js; this file is only the interface. */
(function(){
'use strict';
var root=null,V={role:'manager'};
var BG=[[0,'Immediately when app is hidden'],[30,'After 30 seconds'],[60,'After 1 minute'],[300,'After 5 minutes'],[900,'After 15 minutes'],[-1,'Never (only on idle or manual)']];
var IDLE=[[0,'Off'],[60,'1 minute'],[300,'5 minutes'],[900,'15 minutes'],[1800,'30 minutes']];
var LOGL={'sec:login':'Signed in','sec:login-failed':'Wrong PIN','sec:lock':'App locked','sec:logout':'Signed out','sec:pin-enabled':'PIN lock enabled','sec:pin-changed':'PIN changed','sec:pin-removed':'PIN lock removed','sec:pin-set-by-admin':'PIN set by admin','sec:pin-reset-by-recovery':'PIN reset with recovery code','sec:recovery-failed':'Wrong recovery code','sec:recovery-code-created':'New recovery code','sec:biometric-enabled':'Biometric enabled','sec:biometric-disabled':'Biometric disabled','sec:db-encryption-on':'Database encryption on','sec:db-encryption-off':'Database encryption off','sec:denied':'Permission denied','sec:pin-migrated':'Old PIN upgraded','sec:user-added':'User added','sec:user-updated':'User updated','sec:roles-updated':'Role permissions changed'};
function K(){return KNSEC.core}
function isOwner(){return !K().lockEnabled()||(KNA.role()==='owner')}
function can(p){return KNA.can(p)}
function row(t,s,btns){return '<div class="kp-mv" style="align-items:center"><div><b>'+esc(t)+'</b>'+(s?'<small>'+s+'</small>':'')+'</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+(btns||'')+'</div></div>'}
function btn(a,l,extra){return '<button class="ghost" data-a="'+a+'" '+(extra||'')+'>'+l+'</button>'}
function sel(id,opts,val){return '<select id="'+id+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(String(val)===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select>'}
function logHtml(){
  var L=(window.S&&S.audit||[]).filter(function(a){return a.action&&a.action.indexOf('sec:')===0}).slice(-40).reverse();
  return L.length?L.map(function(a){var u=K().userById(a.by);return '<div class="kp-mv"><div><b>'+esc(LOGL[a.action]||a.action.slice(4))+'</b><small>'+esc(new Date(a.ts).toLocaleString())+' | '+esc(u?u.name:a.by||'')+'</small></div></div>'}).join(''):'<small style="color:var(--mute)">No security events yet.</small>';
}
function html(){
  var c=K().cfg(),on=K().lockEnabled(),me=KNA.user(),h='',sm=!on||can('security_manage'),um=!on||can('users_manage');
  h+='<div class="kp-c"><small>Signed in as</small><b>'+esc(me?me.name:'Owner')+'</b> <span class="kp-badge kp-ok">'+esc((KNA.roles.filter(function(r){return r[0]===KNA.role()})[0]||['','Owner'])[1])+'</span>'+
     '<div class="kp-2" style="margin-top:10px"><button class="kp-pri" style="margin:0" data-a="lock">Lock now</button><button class="kp-pri kp-dng" style="margin:0" data-a="logout">Log out</button></div></div>';
  h+='<div class="kp-c" style="margin-top:10px"><b>App lock (PIN)</b><small style="display:block;color:var(--mute)">'+(on?'Enabled: '+c.len+'-digit PIN, stored as a salted PBKDF2 hash. 5 wrong tries cause a temporary lockout.':'Off. Anyone who opens this phone can open KhataNova.')+'</small>'+
     (on?row('Change my PIN','',btn('chpin','Change')):'')+
     (on&&sm?row('Remove PIN lock','Owner PIN needed',btn('rmlock','Remove')):'')+
     (!on?'<button class="kp-pri" data-a="setpin">Set up PIN lock</button>':'')+'</div>';
  if(on&&sm)h+='<div class="kp-c kp-fm" style="margin-top:10px"><b>Auto-lock</b><label for="ksc-bg">When the app goes to the background</label>'+sel('ksc-bg',BG,c.bg)+'<label for="ksc-idle">When idle for</label>'+sel('ksc-idle',IDLE,c.idle)+'</div>';
  var N=K().nativeBio(),mode=N?'Native Android / iOS biometric prompt detected.':(K().webBioOK()?'Browser mode (WebAuthn): your phone verifies you with its own fingerprint / face / screen lock. The website never sees your fingerprint.':'Not available here. It needs HTTPS and a supported phone, or the native app build.');
  if(on)h+='<div class="kp-c" style="margin-top:10px"><b>Biometric unlock</b><small style="display:block;color:var(--mute)">'+mode+' PIN is still required every 3 days.</small>'+
     (K().bioReady()?row('Enabled','for '+esc((K().userById(c.bioUser)||{}).name||''),btn('biooff','Turn off')):row('Not enabled','',btn('bioon','Enable')))+'</div>';
  if(on&&sm)h+='<div class="kp-c" style="margin-top:10px"><b>Recovery code</b><small style="display:block;color:var(--mute)">Resets the owner PIN if you forget it. '+(c.rec?'A code exists.':'No code yet.')+'</small>'+row('Create a new recovery code','Old code stops working',btn('recov','Create'))+'</div>';
  if(sm)h+='<div class="kp-c" style="margin-top:10px"><b>Database encryption</b><small style="display:block;color:var(--mute)">'+(K().encActive()?'ON: data on this device is encrypted (AES-256-GCM). Passphrase is asked at every app start.':'OFF: data is stored unencrypted in the browser. Use device encryption and a screen lock, or turn this on.')+'</small>'+
     (K().encActive()?row('Encrypted','',btn('encoff','Turn off')):row('Not encrypted','Needs a passphrase you must not forget',btn('encon','Encrypt')))+'</div>';
  if(um){
    var us=K().users();
    h+='<div class="kp-c" style="margin-top:10px"><b>Users</b>'+us.map(function(u){var has=!!c.creds[u.id];return row(u.name+(u.active===false?' (disabled)':''),esc((KNA.roles.filter(function(r){return r[0]===u.role})[0]||['',u.role])[1])+(on?(has?' | PIN set':' | no PIN'):''),(on?btn('upin','PIN','data-id="'+esc(u.id)+'"'):'')+(u.id==='u_owner'&&!isOwner()?'':btn('uedit','Edit','data-id="'+esc(u.id)+'"')))}).join('')+
      '<button class="kp-pri" data-a="uadd">Add user</button>'+(!on?'<small style="display:block;color:var(--mute);margin-top:6px">Turn on PIN lock so each user must sign in.</small>':'')+'</div>';
    if(isOwner()){
      var r=V.role,perms=KNA.rolePerms(r);
      h+='<div class="kp-c kp-fm" style="margin-top:10px"><b>Role permissions</b><label for="ksc-role">Role</label>'+sel('ksc-role',KNA.roles.filter(function(x){return x[0]!=='owner'}),r)+
       '<div id="ksc-perms" style="margin-top:6px">'+KNA.perms.map(function(p){return '<label style="display:flex;gap:8px;align-items:center;margin:6px 0;color:var(--ink)"><input type="checkbox" data-p="'+p[0]+'" style="width:auto" '+(perms.indexOf(p[0])>-1?'checked':'')+'> '+esc(p[1])+'</label>'}).join('')+'</div>'+
       '<div class="kp-2"><button class="kp-pri" style="margin:10px 0 0" data-a="rsave">Save permissions</button><button class="kp-pri kp-dng" style="margin:10px 0 0" data-a="rreset">Reset to default</button></div></div>';
    }
  }
  h+='<div class="kp-c" style="margin-top:10px"><b>Security log</b>'+logHtml()+'</div>';
  h+='<p style="color:var(--mute);font-size:.75rem;margin-top:12px">A web app cannot stop someone who has developer access to an unlocked device. Keep a strong phone screen lock and make encrypted backups.</p>';
  return h;
}
function render(){if(!root)return;var st=root.scrollTop;root.innerHTML='<div class="kp-h"><button data-a="back">&lsaquo; Back</button><b>Security</b></div><div class="kp-w">'+html()+'</div>';root.scrollTop=st}
async function userDlg(u){
  var ownerEdit=u&&u.id==='u_owner';
  var roles=KNA.roles.filter(function(r){return r[0]!=='owner'&&(isOwner()||r[0]!=='admin')});
  var v=await KNSEC.dlg({title:u?'Edit user':'Add user',fields:[{id:'n',label:'Name',value:u?u.name:'',maxlength:40}].concat(ownerEdit?[]:[{id:'r',label:'Role',type:'select',opts:roles.map(function(r){return[r[0],r[1]]}),value:u?u.role:'salesperson'}]).concat(u&&!ownerEdit?[{id:'a',label:'Status',type:'select',opts:[['1','Active'],['0','Disabled']],value:u.active===false?'0':'1'}]:[]),ok:'Save',
    check:function(v){if(!v.n)return'Name is required';if(users().some(function(x){return x.id!==(u&&u.id)&&x.name.toLowerCase()===v.n.toLowerCase()}))return'This name is already used';return null}});
  if(!v)return;
  if(u){var b={name:u.name,role:u.role,active:u.active};u.name=v.n;if(!ownerEdit){u.role=v.r;u.active=v.a!=='0'}KN.audit(S,'update','user',u.id,b,{name:u.name,role:u.role,active:u.active});K().log('user-updated',{user:u.id})}
  else{var nu={id:KN.uid('u'),name:v.n,role:v.r,active:true,created:Date.now()};S.users.push(nu);KN.audit(S,'create','user',nu.id,null,{name:nu.name,role:nu.role});K().log('user-added',{user:nu.id})}
  save();K().syncUsers();render();
}
function users(){return S.users}
async function onClick(e){
  var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a'),id=b.getAttribute('data-id'),k=K();
  if(a==='back'){close();return}
  if(a==='lock'){close();KNA.lock('manual');return}
  if(a==='logout'){close();KNA.logout();return}
  if(a==='setpin'){await k.setupPin();render();return}
  if(a==='chpin'){await k.changePin();render();return}
  if(a==='rmlock'){if(!KNA.guard('security_manage'))return;await k.removeLock();render();return}
  if(a==='bioon'){await k.bioEnable();render();return}
  if(a==='biooff'){k.bioDisable();render();return}
  if(a==='recov'){if(!KNA.guard('security_manage'))return;await k.regenRecovery();render();return}
  if(a==='encon'){if(!KNA.guard('security_manage'))return;await k.encEnable();render();return}
  if(a==='encoff'){if(!KNA.guard('security_manage'))return;await k.encDisable();render();return}
  if(a==='upin'){if(!KNA.guard('users_manage'))return;if(!k.lockEnabled()){toast('Turn on PIN lock first');return}if(id==='u_owner'&&!isOwner())return;await k.adminSetPin(id);render();return}
  if(a==='uadd'){if(!KNA.guard('users_manage'))return;await userDlg(null);return}
  if(a==='uedit'){if(!KNA.guard('users_manage'))return;var u=k.userById(id);if(u&&(u.role==='admin'||u.id==='u_owner')&&!isOwner())return toast('Only the owner can edit this user');if(u)await userDlg(u);return}
  if(a==='rsave'||a==='rreset'){if(!isOwner())return;S.roles=S.roles&&typeof S.roles==='object'?S.roles:{};var before=S.roles[V.role];
    if(a==='rreset')delete S.roles[V.role];else S.roles[V.role]=Array.prototype.map.call(root.querySelectorAll('#ksc-perms input:checked'),function(i){return i.getAttribute('data-p')});
    KN.audit(S,'update','role',V.role,before||null,S.roles[V.role]||'default');k.log('roles-updated',{role:V.role});save();toast(a==='rreset'?'Role reset to default':'Permissions saved');render();return}
}
function onChange(e){
  var t=e.target,c=K().cfg();
  if(t.id==='ksc-bg'){if(!KNA.guard('security_manage'))return;c.bg=+t.value;K().put(c);toast('Auto-lock updated')}
  else if(t.id==='ksc-idle'){if(!KNA.guard('security_manage'))return;c.idle=+t.value;K().put(c);toast('Idle lock updated')}
  else if(t.id==='ksc-role'){V.role=t.value;render()}
}
function open(){
  if(!root){var st=document.createElement('style');st.textContent=(window.KNP?KNP.css:'').replace(/#kp/g,'#ksc')+'#ksc{z-index:92}#ksc .kp-mv small{display:block}';document.head.appendChild(st);
    root=document.createElement('div');root.id='ksc';root.setAttribute('role','dialog');root.setAttribute('aria-label','Security');document.body.appendChild(root);
    root.addEventListener('click',onClick);root.addEventListener('change',onChange)}
  render();root.className='';document.body.style.overflow='hidden';
}
function close(){if(root)root.className='hide';document.body.style.overflow=''}
window.KNSECUI={open:open,close:close};
})();
