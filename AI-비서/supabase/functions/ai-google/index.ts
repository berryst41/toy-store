// AI 비서 — 구글 계정 여러 개 연결 + 캘린더 + 지메일 (Supabase Edge Function, 프로젝트 couple)
// 비밀값(코드에 없음, Supabase 비밀 설정에만): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// (선택) AI_TOKEN_KEY(32바이트 base64). 없으면 서버 비밀키(service role)에서 잠금 열쇠를 만들어요 — 그 키를 바꾸면 구글 계정을 다시 연결해야 해요.
// 구글 열쇠(refresh token)는 AES-GCM으로 잠가서 ai_google_accounts.token_enc에 두고, 브라우저로는 절대 내보내지 않아요.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const TKEY = Deno.env.get('AI_TOKEN_KEY') || '';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
const TZ = 'Asia/Seoul';

const SCOPES: Record<string, string[]> = {
  calendar: ['https://www.googleapis.com/auth/calendar.events'],
  mail_read: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly'],
  mail_send: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']
};

/* ---------- 잠그기 / 풀기 ---------- */
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyP: Promise<CryptoKey> | null = null;
const aesKey = () => keyP ??= (async () => crypto.subtle.importKey('raw', TKEY ? unb64(TKEY) : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SB_SERVICE + ':ai-google-tokens'))), 'AES-GCM', false, ['encrypt', 'decrypt']))();
async function seal(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(text)));
  return b64(iv) + '.' + b64(ct);
}
async function open(s: string) {
  const [iv, ct] = s.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(), unb64(ct)));
}

/* ---------- 구글 ---------- */
async function tokenCall(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, ...params }) });
  const d = await r.json();
  if (!r.ok) throw new Error('google_token: ' + (d.error_description || d.error || r.status));
  return d;
}
type Acct = { id: string; email: string; label: string; color: string; level: string; token_enc: string; is_default: boolean };
const access = new Map<string, string>();
async function at(a: Acct) {
  if (access.has(a.id)) return access.get(a.id)!;
  const d = await tokenCall({ grant_type: 'refresh_token', refresh_token: await open(a.token_enc) });
  access.set(a.id, d.access_token); return d.access_token as string;
}
async function g(a: Acct, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + await at(a), 'Content-Type': 'application/json' } });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`google ${r.status}: ${d.error?.message || ''}`.slice(0, 200));
  return d;
}
const pub = (a: Acct) => ({ id: a.id, email: a.email, label: a.label, color: a.color, level: a.level, is_default: a.is_default });
const canMail = (a: Acct) => a.level === 'mail_read' || a.level === 'mail_send';

/* ---------- 캘린더 ---------- */
function toEvent(a: Acct, e: any) {
  const s = e.start?.dateTime || e.start?.date || '', en = e.end?.dateTime || e.end?.date || '';
  return { id: e.id, account: a.id, label: a.label || a.email, color: a.color, title: e.summary || '(제목 없음)', date: s.slice(0, 10), time: e.start?.dateTime ? s.slice(11, 16) : '', end: e.end?.dateTime ? en.slice(11, 16) : '', allDay: !e.start?.dateTime, link: e.htmlLink || '' };
}
async function calList(a: Acct, from: string, to: string) {
  const q = new URLSearchParams({ timeMin: `${from}T00:00:00+09:00`, timeMax: `${to}T23:59:59+09:00`, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
  const d = await g(a, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`);
  return (d.items || []).filter((e: any) => e.status !== 'cancelled').map((e: any) => toEvent(a, e));
}
function addMin(date: string, time: string, min: number) {
  const d = new Date(`${date}T${time}:00+09:00`); d.setMinutes(d.getMinutes() + min);
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
  return { date: k.slice(0, 10), time: k.slice(11, 16) };
}
async function calInsert(a: Acct, ev: { date: string; time?: string; end?: string; title: string; memo?: string }) {
  let body: any;
  if (ev.time) {
    const end = ev.end && ev.end > ev.time ? { date: ev.date, time: ev.end } : addMin(ev.date, ev.time, 60);
    body = { summary: ev.title, description: ev.memo || '', start: { dateTime: `${ev.date}T${ev.time}:00`, timeZone: TZ }, end: { dateTime: `${end.date}T${end.time}:00`, timeZone: TZ } };
  } else {
    const n = new Date(ev.date + 'T00:00:00Z'); n.setUTCDate(n.getUTCDate() + 1);
    body = { summary: ev.title, description: ev.memo || '', start: { date: ev.date }, end: { date: n.toISOString().slice(0, 10) } };
  }
  const made = await g(a, 'https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
  // 정말 들어갔는지 다시 읽어서 확인
  const back = await g(a, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(made.id)}`).catch(() => null);
  return { event: toEvent(a, made), verified: !!back && back.status !== 'cancelled' };
}
async function calDelete(a: Acct, id: string) {
  await g(a, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const back = await g(a, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`).catch(() => null);
  return { verified: !back || back.status === 'cancelled' };
}

/* ---------- 지메일 ---------- */
async function mailList(a: Acct, q: string, max: number) {
  const d = await g(a, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: String(max) })}`);
  const ids: string[] = (d.messages || []).map((m: any) => m.id);
  const out = await Promise.all(ids.map(async id => {
    const m = await g(a, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const h = (n: string) => (m.payload?.headers || []).find((x: any) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    return { id, account: a.id, label: a.label || a.email, color: a.color, from: h('From'), subject: h('Subject'), date: new Date(+m.internalDate).toISOString(), snippet: (m.snippet || '').slice(0, 200), unread: (m.labelIds || []).includes('UNREAD') };
  }));
  return out;
}
async function mailRead(a: Acct, id: string) {
  const m = await g(a, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
  let text = '';
  const walk = (p: any) => { if (!p || text) return; if (p.mimeType === 'text/plain' && p.body?.data) text = dec(p.body.data); (p.parts || []).forEach(walk); };
  walk(m.payload);
  if (!text) { const html = (function f(p: any): string { if (!p) return ''; if (p.mimeType === 'text/html' && p.body?.data) return dec(p.body.data); for (const c of p.parts || []) { const r = f(c); if (r) return r; } return ''; })(m.payload); text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }
  return { id, text: text.slice(0, 6000) };
}
const encH = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;
async function mailSend(a: Acct, to: string, subject: string, body: string) {
  const raw = [`From: ${a.email}`, `To: ${to}`, `Subject: ${encH(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(new TextEncoder().encode(body))].join('\r\n');
  const r64 = b64(new TextEncoder().encode(raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sent = await g(a, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: r64 }) });
  const back = await g(a, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sent.id}?format=minimal`).catch(() => null);
  return { id: sent.id, verified: !!back && (back.labelIds || []).includes('SENT') };
}

/* ---------- 아침 브리핑 (AI 없이 규칙으로 — 키가 없어도 돼요) ---------- */
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kst = () => new Date(Date.now() + 9 * 3600e3);
const kDate = () => kst().toISOString().slice(0, 10);
const addD = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mins = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
async function buildBrief(uid: string) {
  const t = kDate(), tm = addD(t, 1);
  const { data: items } = await admin.from('ai_items').select('kind,data').eq('user_id', uid).eq('deleted', false).in('kind', ['event', 'todo']);
  const ev: { time: string; title: string }[] = (items || []).filter((i: any) => i.kind === 'event' && i.data.date === t).map((i: any) => ({ time: i.data.time || '', title: i.data.title }));
  const todos = (items || []).filter((i: any) => i.kind === 'todo' && !i.data.done).map((i: any) => i.data);
  const { data: rows } = await admin.from('ai_google_accounts').select('*').eq('user_id', uid);
  let unread = 0;
  if (CID && CSECRET) for (const a of (rows || []) as Acct[]) {
    try { (await calList(a, t, t)).forEach((e: any) => ev.push({ time: e.time, title: e.title })); } catch (_) { /* 계정 하나가 안 돼도 계속 */ }
    if (canMail(a)) try { const d = await g(a, 'https://gmail.googleapis.com/gmail/v1/users/me/messages?' + new URLSearchParams({ q: 'is:unread in:inbox newer_than:1d', maxResults: '50' })); unread += (d.messages || []).length; } catch (_) { /* */ }
  }
  ev.sort((x, y) => (x.time || '00:00').localeCompare(y.time || '00:00'));
  const late = todos.filter((x: any) => x.due && x.due < t), dueToday = todos.filter((x: any) => x.due === t), dueTom = todos.filter((x: any) => x.due === tm);
  const lines: string[] = [];
  lines.push(ev.length ? `📅 오늘 일정 ${ev.length}개: ` + ev.slice(0, 5).map(e => `${e.time || '종일'} ${e.title}`).join(', ') : '📅 오늘 잡힌 일정 없음');
  if (dueToday.length) lines.push('⏰ 오늘 마감: ' + dueToday.slice(0, 3).map((x: any) => x.title).join(', '));
  if (late.length) lines.push(`⚠️ 마감 지난 할 일 ${late.length}개`);
  if (unread) lines.push(`📬 안 읽은 메일 ${unread}통`);
  const tips: string[] = [];
  if (dueTom.length) tips.push(`내일 마감 ${dueTom.length}개 미리 챙기기`);
  if (late.length) tips.push('마감 지난 할 일 정리하기');
  if (unread >= 3) tips.push('메일 요약 받아 보기');
  if (tips.length) lines.push('💡 ' + tips.join(' · '));
  const d = kst();
  return { title: `☀️ ${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]}) 아침 브리핑`, body: lines.join('\n') };
}
async function vapidKey() {
  const { data: cfg } = await admin.from('ai_push_config').select('*').eq('id', 1).single();
  if (cfg?.vapid_public) return cfg.vapid_public as string;
  const k = webpush.generateVAPIDKeys(); // 처음 한 번 서버 안에서 만들어 저장해요
  await admin.from('ai_push_config').update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq('id', 1);
  return k.publicKey;
}
async function pushTo(uid: string, msg: { title: string; body: string }) {
  const { data: cfg } = await admin.from('ai_push_config').select('*').eq('id', 1).single();
  if (!cfg?.vapid_public) return 0;
  webpush.setVapidDetails('mailto:noreply@ai-secretary.app', cfg.vapid_public, cfg.vapid_private);
  const { data: subs } = await admin.from('ai_push_subs').select('id,sub').eq('user_id', uid);
  let sent = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, tag: 'ai-brief', url: './?brief=1' }), { TTL: 6 * 3600 }); sent++; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await admin.from('ai_push_subs').delete().eq('id', s.id); }
  }
  return sent;
}

/* ---------- 요청 처리 ---------- */
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const act = body.action as string;
    if (act === 'config') return json({ configured: !!(CID && CSECRET), client_id: CID, scopes: SCOPES });

    // 로그인한 주인만
    const auth = req.headers.get('Authorization') || '';
    const userDb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await userDb.auth.getUser();
    if (!user) return json({ error: '로그인이 필요해요' }, 401);
    const { data: isOwner } = await userDb.rpc('ai_is_owner');
    if (!isOwner) return json({ error: '이 AI 비서의 주인만 쓸 수 있어요' }, 403);
    if (!(CID && CSECRET)) return json({ error: 'not_configured' }, 400);

    const { data: rows } = await admin.from('ai_google_accounts').select('*').eq('user_id', user.id).order('created_at');
    const accts = (rows || []) as Acct[];
    const pick = (k?: string) => { const q = (k || '').trim().toLowerCase(); return (q && accts.find(a => a.id === k || a.email.toLowerCase() === q || a.label.toLowerCase() === q)) || accts.find(a => a.is_default) || accts[0]; };

    if (act === 'list') return json({ accounts: accts.map(pub) });

    if (act === 'exchange') {
      const { code, redirect_uri, label, color, level } = body;
      const d = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri });
      const idp = JSON.parse(new TextDecoder().decode(unb64(d.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(d.id_token.split('.')[1].length / 4) * 4, '='))));
      const email = idp.email as string;
      const old = accts.find(a => a.email === email);
      const refresh = d.refresh_token || (old ? await open(old.token_enc) : '');
      if (!refresh) return json({ error: '구글이 열쇠를 주지 않았어요. 한 번 더 시도해 주세요' }, 400);
      const granted = String(d.scope || '');
      const real = granted.includes('gmail.send') ? 'mail_send' : granted.includes('gmail.readonly') ? 'mail_read' : 'calendar';
      const row = { user_id: user.id, email, label: label || old?.label || email.split('@')[0], color: color || old?.color || '#5b4fd6', level: real, token_enc: await seal(refresh), is_default: old ? old.is_default : accts.length === 0 };
      const { error } = await admin.from('ai_google_accounts').upsert(row, { onConflict: 'user_id,email' });
      if (error) throw error;
      return json({ ok: true, email, level: real, asked: level, accounts: ((await admin.from('ai_google_accounts').select('*').eq('user_id', user.id).order('created_at')).data || []).map(pub) });
    }

    if (act === 'update') {
      const a = accts.find(x => x.id === body.id); if (!a) return json({ error: '계정을 못 찾았어요' }, 404);
      const patch: any = {};
      if (typeof body.label === 'string') patch.label = body.label.slice(0, 20);
      if (typeof body.color === 'string') patch.color = body.color.slice(0, 9);
      if (body.is_default === true) { await admin.from('ai_google_accounts').update({ is_default: false }).eq('user_id', user.id); patch.is_default = true; }
      await admin.from('ai_google_accounts').update(patch).eq('id', a.id);
      return json({ ok: true });
    }

    if (act === 'remove') {
      const a = accts.find(x => x.id === body.id); if (!a) return json({ error: '계정을 못 찾았어요' }, 404);
      try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(await open(a.token_enc)), { method: 'POST' }); } catch (_) { /* 이미 끊긴 경우 */ }
      await admin.from('ai_google_accounts').delete().eq('id', a.id);
      if (a.is_default) { const next = accts.find(x => x.id !== a.id); if (next) await admin.from('ai_google_accounts').update({ is_default: true }).eq('id', next.id); }
      return json({ ok: true });
    }

    // 모든 계정 합쳐서: 일정(from~to) + 최근 메일
    if (act === 'context') {
      const errors: string[] = [];
      const evs = (await Promise.all(accts.map(a => calList(a, body.from, body.to).catch(e => { errors.push(`${a.label || a.email}: ${e.message}`); return []; })))).flat();
      const mails = body.mail === false ? [] : (await Promise.all(accts.filter(canMail).map(a => mailList(a, body.q || 'in:inbox newer_than:3d', body.max || 10).catch(e => { errors.push(`${a.label || a.email}: ${e.message}`); return []; })))).flat();
      mails.sort((x, y) => y.date.localeCompare(x.date));
      return json({ accounts: accts.map(pub), events: evs, mails, errors });
    }

    if (act === 'mail_read') { const a = pick(body.account); if (!a || !canMail(a)) return json({ error: '메일 읽기 권한이 있는 계정이 아니에요' }, 400); return json(await mailRead(a, body.id)); }
    if (act === 'mail_search') { const out = (await Promise.all(accts.filter(canMail).map(a => mailList(a, body.q, body.max || 10).catch(() => [])))).flat(); return json({ mails: out }); }

    // 아래는 앱에서 [허락]을 누른 뒤에만 불러요
    if (act === 'cal_insert') { const a = pick(body.account); if (!a) return json({ error: '연결된 구글 계정이 없어요' }, 400); return json({ account: pub(a), ...(await calInsert(a, body.event)) }); }
    if (act === 'cal_delete') { const a = pick(body.account); if (!a) return json({ error: '계정을 못 찾았어요' }, 400); return json(await calDelete(a, body.id)); }
    if (act === 'mail_send') {
      const a = pick(body.account);
      if (!a || a.level !== 'mail_send') return json({ error: '이 계정은 메일 보내기 허락을 안 받았어요. ⚙️에서 "메일 보내기까지"로 다시 연결해 주세요' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to || '')) return json({ error: '받는 사람 메일 주소가 이상해요' }, 400);
      return json({ account: pub(a), ...(await mailSend(a, body.to, body.subject || '', body.body || '')) });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
