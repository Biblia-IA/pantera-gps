// guarda o app inteiro no celular: abre sem internet
const C='pantera-v8', F=['./','index.html','dados.js','cadeado.js','rotas.js','manifest.webmanifest','icone.svg','icone.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n))))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request,{ignoreSearch:true}))));
