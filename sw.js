// Nido · service worker
// - Abre la app aunque no haya señal
// - Aviso diario de lo que toca (en teléfonos que lo permiten)
const CACHE = 'nido-v4';
const DATA = 'nido-data'; // resumen que la app deja para el aviso diario
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './barcode-ponyfill.js', './juego.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('__digest.json')) return;
  // El lector de códigos (pesado) se guarda la primera vez y luego sale de la copia local
  if (url.pathname.endsWith('.wasm')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  // Lo demás: primero la red (para recibir mejoras); sin señal, la copia guardada
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

// ---------- Aviso diario ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

async function dailyNotice() {
  const c = await caches.open(DATA);
  const r = await c.match('./__digest.json');
  if (!r) return;
  const d = await r.json();
  const now = new Date(), today = ymd(now);
  if (now.getHours() < 6) return; // nada de madrugada
  const lastR = await c.match('./__last.txt');
  if (lastR && (await lastR.text()) === today) return;

  const ym = today.slice(0, 7), dow = now.getDay(), dom = now.getDate();
  const items = [];
  (d.chores || []).filter(x => (x.days || []).includes(dow)).forEach(x => items.push(x.name + (x.who ? ' (' + x.who + ')' : '')));
  (d.payments || []).filter(p => p.paid !== ym && p.day <= dom).forEach(p => items.push('Pagar ' + p.name));
  (d.todos || []).filter(t => t.due <= today).forEach(t => items.push(t.text));
  if (d.shop) items.push(d.shop === 1 ? 'Falta 1 cosa por comprar' : `Faltan ${d.shop} cosas por comprar`);
  if (!items.length) return;

  await self.registration.showNotification('Hoy en la casa', {
    body: items.slice(0, 4).join(' · ') + (items.length > 4 ? ` y ${items.length - 4} más` : ''),
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'nido-diario', renotify: false,
    data: { url: './?v=hoy' }
  });
  await c.put('./__last.txt', new Response(today));
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'nido-diario') e.waitUntil(dailyNotice());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { if (w.navigate) w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
