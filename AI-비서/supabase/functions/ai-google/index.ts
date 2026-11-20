// AI 비서 — 구글 계정 여러 개 연결 + 캘린더 + 지메일 + (v0.7) 구글 할 일·드라이브·시트·설문·유튜브·새 문서 (Supabase Edge Function, 프로젝트 couple)
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
  mail_send: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
  // v0.7: 체크하면 위에 더해서 받는 허락 (구글 할 일·드라이브·시트·설문·유튜브·새 문서 만들기)
  extra: ['https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/forms.body.readonly', 'https://www.googleapis.com/auth/forms.responses.readonly', 'https://www.googleapis.com/auth/youtube.readonly']
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
type Acct = { id: string; email: string; label: string; color: string; level: string; token_enc: string; is_default: boolean; scopes?: string };
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
const has = (a: Acct, sc: string) => (a.scopes || '').split(' ').some(x => x === 'https://www.googleapis.com/auth/' + sc);
const caps = (a: Acct) => ({ tasks: has(a, 'tasks'), drive: has(a, 'drive.readonly'), make: has(a, 'documents'), sheets: has(a, 'spreadsheets'), forms: has(a, 'forms.responses.readonly'), youtube: has(a, 'youtube.readonly') });
type Cap = keyof ReturnType<typeof caps>;
const pub = (a: Acct) => ({ id: a.id, email: a.email, label: a.label, color: a.color, level: a.level, is_default: a.is_default, caps: caps(a) });
const canMail = (a: Acct) => a.level === 'mail_read' || a.level === 'mail_send';

/* ---------- 구글 할 일 (Tasks) ---------- */
const TK = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
async function taskList(a: Acct) {
  const d = await g(a, TK + '?' + new URLSearchParams({ showCompleted: 'false', showHidden: 'false', maxResults: '100' }));
  return (d.items || []).filter((t: any) => t.title).map((t: any) => ({ id: t.id, account: a.id, label: a.label || a.email, color: a.color, title: t.title, due: (t.due || '').slice(0, 10), notes: (t.notes || '').slice(0, 200) }));
}
async function taskAdd(a: Acct, title: string, due: string) {
  const body: any = { title: String(title || '').slice(0, 200) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(due || '')) body.due = due + 'T00:00:00.000Z';
  const t = await g(a, TK, { method: 'POST', body: JSON.stringify(body) });
  const back = await g(a, `${TK}/${encodeURIComponent(t.id)}`).catch(() => null);
  return { id: t.id, verified: !!back && back.title === body.title };
}
async function taskDone(a: Acct, id: string) {
  await g(a, `${TK}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
  const back = await g(a, `${TK}/${encodeURIComponent(id)}`).catch(() => null);
  return { verified: back?.status === 'completed' };
}

/* ---------- 드라이브·문서·시트·설문·유튜브 ---------- */
const KIND: Record<string, string> = { 'application/vnd.google-apps.document': '문서', 'application/vnd.google-apps.spreadsheet': '시트', 'application/vnd.google-apps.presentation': '슬라이드', 'application/vnd.google-apps.form': '설문', 'application/vnd.google-apps.folder': '폴더', 'application/pdf': 'PDF' };
const fileId = (s: string) => (String(s || '').match(/\/d\/([\w-]{20,})/) || [])[1] || (String(s || '').match(/[?&]id=([\w-]{20,})/) || [])[1] || String(s || '').trim();
async function gText(a: Acct, url: string) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await at(a) } });
  if (!r.ok) throw new Error(`google ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return await r.text();
}
async function driveFind(a: Acct, q: string, max = 8) {
  const w = String(q || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim();
  const p: Record<string, string> = { pageSize: String(max), fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', q: w ? `(name contains '${w}' or fullText contains '${w}') and trashed = false` : 'trashed = false' };
  if (!w) p.orderBy = 'modifiedTime desc';
  const d = await g(a, 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams(p));
  return (d.files || []).map((x: any) => ({ id: x.id, account: a.id, label: a.label || a.email, name: x.name, kind: KIND[x.mimeType] || '파일', modified: (x.modifiedTime || '').slice(0, 10), link: x.webViewLink || '' }));
}
async function formRead(a: Acct, id: string) {
  const f = await g(a, `https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}`);
  const qs: [string, string][] = [];
  for (const it of f.items || []) {
    const qid = it.questionItem?.question?.questionId; if (qid) qs.push([qid, it.title || '(질문)']);
    for (const q of it.questionGroupItem?.questions || []) qs.push([q.questionId, `${it.title || ''} - ${q.rowQuestion?.title || ''}`]);
  }
  const r = await g(a, `https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}/responses?pageSize=1000`);
  const resp = r.responses || [], vals: Record<string, string[]> = {};
  for (const x of resp) for (const [qid, ans] of Object.entries<any>(x.answers || {})) (vals[qid] ??= []).push(...(ans.textAnswers?.answers || []).map((y: any) => String(y.value)));
  let out = `설문 "${f.info?.title || ''}" — 응답 ${resp.length}개\n`;
  for (const [qid, title] of qs) {
    const v = vals[qid] || [], cnt = new Map<string, number>(); v.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    out += `\n■ ${title} (${v.length}개 답)\n` + (cnt.size <= 15 ? [...cnt].sort((p, q) => q[1] - p[1]).map(([k, n]) => `- ${k}: ${n}명`).join('\n') : v.slice(0, 40).map(x => '- ' + x.slice(0, 200)).join('\n'));
  }
  return out;
}
async function fileRead(a: Acct, raw: string) {
  const id = fileId(raw);
  const f = await g(a, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink`);
  const m = f.mimeType as string, base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  let text = '';
  if (m === 'application/vnd.google-apps.document' || m === 'application/vnd.google-apps.presentation') text = await gText(a, base + '/export?mimeType=text/plain');
  else if (m === 'application/vnd.google-apps.spreadsheet') {
    if (has(a, 'spreadsheets')) {
      const meta = await g(a, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
      for (const sh of (meta.sheets || []).slice(0, 5)) {
        const t = sh.properties.title as string;
        const v = await g(a, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:Z300`)}`);
        text += `## 탭: ${t}\n` + (v.values || []).map((r: string[]) => r.join(' | ')).join('\n') + '\n\n';
      }
    } else text = await gText(a, base + '/export?mimeType=text/csv');
  } else if (m === 'application/vnd.google-apps.form') text = has(a, 'forms.responses.readonly') ? await formRead(a, id) : '(설문 결과를 읽는 허락이 없어요)';
  else if (/^text\/|json|csv|xml/.test(m)) text = await gText(a, base + '?alt=media');
  else text = `(이 파일 종류(${KIND[m] || m})는 내용을 읽을 수 없어요. 파일을 받아서 📎로 붙여 주면 읽을 수 있어요)`;
  return { id, name: f.name, kind: KIND[m] || '파일', link: f.webViewLink || '', text: text.slice(0, 15000), cut: text.length > 15000 };
}
const unent = (s: string) => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
async function ytFind(a: Acct, q: string) {
  const d = await g(a, 'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({ part: 'snippet', q: String(q || '').slice(0, 100), type: 'video', maxResults: '6', regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'moderate' }));
  return (d.items || []).filter((v: any) => v.id?.videoId).map((v: any) => ({ title: unent(v.snippet.title), channel: unent(v.snippet.channelTitle), date: (v.snippet.publishedAt || '').slice(0, 10), link: 'https://www.youtube.com/watch?v=' + v.id.videoId }));
}
async function sheetAppend(a: Acct, raw: string, values: unknown) {
  const id = fileId(raw), row = (Array.isArray(values) ? values : [values]).slice(0, 26).map(v => String(v ?? '').slice(0, 500));
  if (!row.length || !row.some(x => x)) throw new Error('더할 내용이 없어요');
  const d = await g(a, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [row] }) });
  const meta = await g(a, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=properties.title,spreadsheetUrl`).catch(() => ({} as any));
  return { verified: d.updates?.updatedRows === 1, range: d.updates?.updatedRange || '', name: meta.properties?.title || '', link: meta.spreadsheetUrl || '' };
}
// 새 구글 문서: Docs API(documents 허락)로 만들고 글을 넣어요. (drive.file 허락은 유튜브 허락과 같이 받을 수 없어서 안 써요)
async function docCreate(a: Acct, title: string, text: string) {
  const name = String(title || '새 문서').slice(0, 120), body = String(text || '').slice(0, 200000);
  const d = await g(a, 'https://docs.googleapis.com/v1/documents', { method: 'POST', body: JSON.stringify({ title: name }) });
  if (body) await g(a, `https://docs.googleapis.com/v1/documents/${d.documentId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: body } }] }) });
  const back = await g(a, `https://docs.googleapis.com/v1/documents/${d.documentId}?fields=title,body.content`).catch(() => null);
  const len = JSON.stringify(back?.body?.content || []).length;
  return { verified: !!back && back.title === name && (!body || len > 200), name, link: `https://docs.google.com/document/d/${d.documentId}/edit` };
}

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
  // 📨 쿨메신저 비서 할 일 (v0.6)
  const { data: cool } = await admin.from('ai_cool').select('text,due').eq('user_id', uid).eq('kind', 'todo').eq('done', false).eq('gone', false);
  const cT = (cool || []).filter((x: any) => x.due === t), cLate = (cool || []).filter((x: any) => x.due && x.due < t);
  if (cT.length) lines.push('📨 쿨메신저 오늘 마감: ' + cT.slice(0, 3).map((x: any) => x.text.slice(0, 25)).join(', '));
  if (cLate.length) lines.push(`📨 쿨메신저 마감 지남 ${cLate.length}개`);
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
async function pushTo(uid: string, msg: { title: string; body: string; url?: string; tag?: string }) {
  const { data: cfg } = await admin.from('ai_push_config').select('*').eq('id', 1).single();
  if (!cfg?.vapid_public) return 0;
  webpush.setVapidDetails('mailto:noreply@ai-secretary.app', cfg.vapid_public, cfg.vapid_private);
  const { data: subs } = await admin.from('ai_push_subs').select('id,sub').eq('user_id', uid);
  let sent = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.sub, JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag || 'ai-brief', url: msg.url || './?brief=1' }), { TTL: 6 * 3600 }); sent++; }
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

    // 5분마다 예약 작업(pg_cron)이 불러요: 정한 시각이 지났고 오늘 아직 안 보냈으면 브리핑 알림
    if (act === 'cron_brief') {
      const { data: cfg } = await admin.from('ai_push_config').select('cron_secret, vapid_public').eq('id', 1).single();
      if (!cfg || req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
      if (!cfg.vapid_public) return json({ skip: 'no subscribers yet' });
      const t = kDate(), now = mins(kst().toISOString().slice(11, 16)), out: unknown[] = [];
      const { data: owners } = await admin.from('ai_owner').select('user_id');
      for (const o of owners || []) {
        const { data: p } = await admin.from('ai_profile').select('settings, brief_sent').eq('user_id', o.user_id).maybeSingle();
        const b = p?.settings?.brief; if (!b?.on) continue;
        const at = /^\d{2}:\d{2}$/.test(b.time || '') ? mins(b.time) : mins('07:30');
        if (p.brief_sent === t || now < at || now > at + 180) continue;
        await admin.from('ai_profile').update({ brief_sent: t }).eq('user_id', o.user_id); // 먼저 표시 → 두 번 안 가게
        out.push(await pushTo(o.user_id, await buildBrief(o.user_id)));
      }
      return json({ ok: true, out });
    }

    // PC 일꾼 연결: 앱에서 만든 10분짜리 코드를 일꾼이 내면, 일꾼 전용 로그인 열쇠(한 번용)를 줘요
    if (act === 'pair_use') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!/^[A-Z2-9]{8}$/.test(code)) return json({ error: '코드 모양이 이상해요' }, 400);
      const { data: row } = await admin.from('ai_pair').select('*').eq('code', code).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!row) return json({ error: '코드가 틀렸거나 10분이 지났어요. 앱에서 새 코드를 만들어 주세요' }, 400);
      await admin.from('ai_pair').delete().eq('code', code); // 한 번만 쓰기
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      const email = u?.user?.email; if (!email) return json({ error: '주인 계정을 못 찾았어요' }, 400);
      const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      if (error) throw error;
      return json({ token_hash: link.properties.hashed_token, email, gkey: row.gkey });
    }

    // 로그인한 주인만
    const auth = req.headers.get('Authorization') || '';
    const userDb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await userDb.auth.getUser();
    if (!user) return json({ error: '로그인이 필요해요' }, 401);
    const { data: isOwner } = await userDb.rpc('ai_is_owner');
    if (!isOwner) return json({ error: '이 AI 비서의 주인만 쓸 수 있어요' }, 403);
    // 알림·브리핑은 구글 설정이 없어도 돼요
    if (act === 'push_key') return json({ key: await vapidKey() });
    if (act === 'brief') return json(await buildBrief(user.id));
    if (act === 'pair_create') {
      const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8));
      const code = Array.from(r, x => AB[x % AB.length]).join('');
      const expires_at = new Date(Date.now() + 10 * 60e3).toISOString();
      await admin.from('ai_pair').delete().eq('user_id', user.id);
      await admin.from('ai_pair').insert({ code, user_id: user.id, gkey: String(body.gkey || '').slice(0, 200), expires_at });
      return json({ code, expires_at });
    }
    if (act === 'notify') return json({ sent: await pushTo(user.id, { title: String(body.title || 'AI 비서').slice(0, 60), body: String(body.body || '').slice(0, 300), url: './?tab=work', tag: String(body.tag || 'ai-work').slice(0, 40) }) });
    if (act === 'push_test') { await vapidKey(); const msg = await buildBrief(user.id); return json({ sent: await pushTo(user.id, msg), ...msg }); }
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
      const row = { user_id: user.id, email, label: label || old?.label || email.split('@')[0], color: color || old?.color || '#5b4fd6', level: real, scopes: granted, token_enc: await seal(refresh), is_default: old ? old.is_default : accts.length === 0 };
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
      const tasks = (await Promise.all(accts.filter(a => caps(a).tasks).map(a => taskList(a).catch(e => { errors.push(`${a.label || a.email} 할 일: ${e.message}`); return []; })))).flat();
      return json({ accounts: accts.map(pub), events: evs, mails, tasks, errors });
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
    // v0.7: 찾아보기(읽기만)
    const withCap = (k: Cap) => accts.filter(a => caps(a)[k]);
    const pickCap = (k: Cap, want?: string) => { const l = withCap(k), q = (want || '').trim().toLowerCase(); return (q && l.find(a => a.id === want || a.email.toLowerCase() === q || a.label.toLowerCase() === q)) || l.find(a => a.is_default) || l[0]; };
    const noCap = (what: string) => json({ error: `${what} 허락을 받은 구글 계정이 없어요. ⚙️에서 "📁 드라이브·시트…도"를 켜고 계정을 다시 연결해 주세요` }, 400);
    if (act === 'drive_find') {
      const l = withCap('drive'); if (!l.length) return noCap('드라이브');
      const errs: string[] = [];
      const files = (await Promise.all(l.map(a => driveFind(a, body.q, 8).catch(e => { errs.push(`${a.label}: ${e.message}`); return []; })))).flat();
      return json({ files, errors: errs });
    }
    if (act === 'file_read') {
      const l = body.account ? accts.filter(a => a.id === body.account && caps(a).drive) : withCap('drive'); if (!l.length) return noCap('드라이브');
      let last = '';
      for (const a of l) { try { return json({ account: pub(a), ...(await fileRead(a, body.id)) }); } catch (e) { last = (e as Error).message; } }
      return json({ error: /404/.test(last) ? '그 파일을 찾지 못했어요(주소나 계정을 확인해 주세요)' : last }, 400);
    }
    if (act === 'yt_find') { const a = pickCap('youtube'); if (!a) return noCap('유튜브'); return json({ videos: await ytFind(a, body.q) }); }
    // 아래는 앱에서 [허락]을 누른 뒤에만 불러요
    if (act === 'gtask_add') { const a = pickCap('tasks', body.account); if (!a) return noCap('구글 할 일'); return json({ account: pub(a), ...(await taskAdd(a, body.title, body.due)) }); }
    if (act === 'gtask_done') { const a = accts.find(x => x.id === body.account && caps(x).tasks) || pickCap('tasks'); if (!a) return noCap('구글 할 일'); return json(await taskDone(a, body.id)); }
    if (act === 'sheet_append') {
      const l = body.account ? accts.filter(a => a.id === body.account && caps(a).sheets) : withCap('sheets'); if (!l.length) return noCap('시트');
      let last = '';
      for (const a of l) { try { return json({ account: pub(a), ...(await sheetAppend(a, body.id, body.values)) }); } catch (e) { last = (e as Error).message; } }
      return json({ error: last }, 400);
    }
    if (act === 'doc_create') { const a = pickCap('make', body.account); if (!a) return noCap('문서 만들기'); return json({ account: pub(a), ...(await docCreate(a, body.title, body.text)) }); }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
