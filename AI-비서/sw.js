// 서비스 워커: 항상 인터넷에서 최신 파일을 먼저 받고, 안 되면(오프라인) 저장해 둔 걸 써요.
// → 코드를 고쳐 올리면 앱을 다시 설치하지 않아도 다음에 열 때 바로 바뀌어요.
const CACHE = 'ai-secretary-v0.8.0';
// 아침 브리핑 알림 받기 → 누르면 앱 열기
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = { title: 'AI 비서', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'AI berryst', { body: d.body || '', tag: d.tag || 'ai', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(self.registration.scope));
    if (w) { w.navigate(url); return w.focus(); }
    return clients.openWindow(url);
  }));
});
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'lib/supabase.js'])));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // 구글 AI 호출 등은 건드리지 않음
  e.respondWith(
    fetch(r, { cache: 'no-cache' })
      .then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
