// 서비스 워커: 항상 인터넷에서 최신 파일을 먼저 받고, 안 되면(오프라인) 저장해 둔 걸 써요.
// → 코드를 고쳐 올리면 앱을 다시 설치하지 않아도 다음에 열 때 바로 바뀌어요.
const CACHE = 'insta-v0.1.0';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png'])));
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
