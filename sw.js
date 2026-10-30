// KhataNova service worker: makes the app open offline.
const V='khatanova-v1',CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','logo.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET')return;
  const same=u.origin===location.origin,fbjs=u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/');
  if(!same&&!fbjs)return; // never touch Firestore / Auth network calls
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(h=>h.put('index.html',c));return x}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(V).then(k=>k.put(r,c))}return x}).catch(()=>h);return h||n}))});
