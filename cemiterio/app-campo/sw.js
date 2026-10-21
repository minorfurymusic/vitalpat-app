// Guarda os arquivos do aplicativo no aparelho para funcionar sem internet.
// Ao mudar qualquer arquivo abaixo, aumentar a VERSAO para os aparelhos baixarem de novo.
const PREFIXO = 'vitalpat-cemiterio-';
const VERSAO = PREFIXO + 'v8';
const ARQUIVOS = [
  './',
  './index.html',
  './estilo.css',
  './app.js',
  './envio.js',
  './vendor/supabase.js',
  '../config-servidor.js',
  './dados-exemplo.js',
  './manifest.webmanifest',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/logo-vitalpat.svg',
  './icones/icone-vitalpat.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // Só apaga versões antigas DESTE sistema; o outro sistema pode estar no mesmo endereço
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith(PREFIXO) && n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Primeiro tenta o que está guardado no aparelho; se não tiver, busca na internet.
// Servidor (outro endereço) nunca passa pelo que está guardado. O arquivo de configuração busca na
// internet primeiro, para uma mudança de servidor chegar logo; sem internet, usa o guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.url.includes('config-servidor.js')) {
    e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request))
  );
});
