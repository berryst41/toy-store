// 서비스 워커: 항상 인터넷에서 최신 파일을 먼저 받고, 안 되면(오프라인) 저장해 둔 걸 써요.
// → 코드를 고쳐 올리면 앱을 다시 설치하지 않아도 다음에 열 때 바로 바뀌어요.
const CACHE = 'ai-secretary-v0.27.1';
// 아침 브리핑 알림 받기 → 누르면 앱 열기
// ☀️ 아침 브리핑이면 앱이 'ai-cfg' 캐시에 적어 둔 날씨 지역으로 오늘 날씨를 받아 한 줄 붙여요(4초 안에 못 받으면 그냥 보내요)
const WX_ICON = c => c === 0 ? '☀️ 맑음' : c <= 2 ? '🌤️ 구름 조금' : c === 3 ? '☁️ 흐림' : c <= 48 ? '🌫️ 안개' : c <= 57 ? '🌦️ 이슬비' : c <= 67 ? '🌧️ 비' : c <= 77 ? '🌨️ 눈' : c <= 82 ? '🌧️ 소나기' : c <= 86 ? '🌨️ 눈' : '⛈️ 뇌우';
async function wxLine() {
  try {
    const hit = await (await caches.open('ai-cfg')).match(new URL('__wx', self.registration.scope).href); if (!hit) return '';
    const L = await hit.json(), ac = new AbortController(), tm = setTimeout(() => ac.abort(), 4000);
    const q = `latitude=${L.lat}&longitude=${L.lon}&timezone=Asia%2FSeoul`;
    const [f, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1`, { signal: ac.signal }).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm10,pm2_5&forecast_days=1`, { signal: ac.signal }).then(r => r.json()).catch(() => null)]);
    clearTimeout(tm);
    const d = f.daily, max = Math.round(d.temperature_2m_max[0]), min = Math.round(d.temperature_2m_min[0]), pop = d.precipitation_probability_max[0] ?? 0;
    let dust = -1;
    if (a?.hourly) a.hourly.time.forEach((t, i) => { const h = +t.slice(11, 13); if (h < 8 || h > 17) return; const p10 = a.hourly.pm10[i] ?? 0, p25 = a.hourly.pm2_5[i] ?? 0; dust = Math.max(dust, p10 <= 30 ? 0 : p10 <= 80 ? 1 : p10 <= 150 ? 2 : 3, p25 <= 15 ? 0 : p25 <= 35 ? 1 : p25 <= 75 ? 2 : 3); });
    const tips = [pop >= 50 ? '☔ 우산' : '', dust >= 2 ? '😷 마스크' : '', max - min >= 10 ? '🧥 일교차 큼' : ''].filter(Boolean);
    return `${WX_ICON(d.weather_code[0])} ${min}~${max}° 비 ${pop}%${dust >= 0 ? ` 미세먼지 ${['좋음', '보통', '나쁨', '매우 나쁨'][dust]}` : ''}${tips.length ? ' · ' + tips.join(' ') : ''}`;
  } catch (_) { return ''; }
}
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = { title: 'AI 비서', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    if (/아침 브리핑/.test(d.title || '')) { const w = await wxLine(); if (w) d.body = w + '\n' + (d.body || ''); }
    // ⏰ 반복 일 알림(일꾼이 tag ai-routine으로 보냄)은 누르면 대화 화면으로
    const url = d.tag === 'ai-routine' ? './' : d.url || './';
    await self.registration.showNotification(d.title || 'AI berryst', { body: d.body || '', tag: d.tag || 'ai', icon: 'icon-192.png', badge: 'badge.png', data: { url } });
  })());
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
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'badge.png', 'lib/supabase.js', 'school.js'])));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'ai-cfg' && k !== 'ai-share').map(k => caches.delete(k)))).then(() => clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const r = e.request;
  // 📤 다른 앱에서 '공유하기 → AI 딸기'(글·녹음 파일·사진·PDF) → 'ai-share' 캐시에 잠깐 두고 앱을 ?shared=1로 열어요
  if (r.method === 'POST' && new URL(r.url).pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await r.formData(), c = await caches.open('ai-share');
        for (const k of await c.keys()) await c.delete(k);
        const files = fd.getAll('f').filter(f => f && typeof f === 'object' && f.size);
        await c.put('/__share/meta', new Response(JSON.stringify({ title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', files: files.map(f => ({ name: f.name, type: f.type, size: f.size })) })));
        for (let i = 0; i < files.length; i++) await c.put('/__share/f' + i, new Response(files[i], { headers: { 'content-type': files[i].type || 'application/octet-stream' } }));
      } catch (_) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // 구글 AI 호출 등은 건드리지 않음
  e.respondWith(
    fetch(r, { cache: 'no-cache' })
      .then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
