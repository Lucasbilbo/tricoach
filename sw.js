const CACHE = 'tricoach-v3';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/.netlify/functions/')) return;
  if (e.request.url.includes('api.github.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ─── PUSH NOTIFICATIONS ───
self.addEventListener('push', e => {
  let title = 'TriCoach AI';
  let body = 'Tienes un entreno pendiente';
  let tag = 'tricoach';

  try {
    if (e.data) {
      const text = e.data.text();
      const data = JSON.parse(text);
      title = data.title || title;
      body = data.body || body;
      tag = data.tag || tag;
    }
  } catch(err) {
    // If parse fails use defaults
    if (e.data) body = e.data.text() || body;
  }

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: true,
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      if (wins.length > 0) return wins[0].focus();
      return clients.openWindow('/');
    })
  );
});
