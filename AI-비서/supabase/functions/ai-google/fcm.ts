// AI 딸기: 🍓 캘린더 다리 앱을 "바로 깨우기"(FCM HTTP v1) — v0.11.0
// 같은 Supabase 프로젝트의 비밀값 FCM_SERVICE_ACCOUNT(Firebase 서비스 계정 JSON)를 같이 써요. 없으면 조용히 건너뛰어요.
// (커플 앱 my-own-/couple/supabase/_shared/fcm.ts 를 그대로 옮겨 온 것)

type SA = { client_email: string; private_key: string; project_id: string };
let cached: { token: string; until: number } | null = null;

/** 붙여 넣는 화면이 글자 속 \\n을 진짜 줄바꿈으로 바꿔 버리면 JSON이 깨져요 → 따옴표 안의 줄바꿈만 다시 \\n으로 */
function escapeNewlines(t: string): string {
  let out = '', inStr = false, esc = false;
  for (const ch of t) {
    if (inStr && !esc && (ch === '\n' || ch === '\r')) { if (ch === '\n') out += '\\n'; continue; }
    out += ch;
    if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = !inStr;
  }
  return out;
}

/** 비밀값을 읽어요. 붙여 넣다 생긴 앞뒤 따옴표·공백, 두 번 감싼 JSON, base64도 받아 줘요 */
function parseSecret(raw: string): Record<string, unknown> | null {
  let v: unknown = raw.trim().replace(/^\uFEFF/, '');
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    const t = (v as string).trim();
    if (!t.startsWith('{') && !t.startsWith('"')) { try { v = atob(t); continue; } catch { return null; } }
    try { v = JSON.parse(t); } catch { try { v = JSON.parse(escapeNewlines(t)); } catch { return null; } }
  }
  return v && typeof v === 'object' ? v as Record<string, unknown> : null;
}

export function fcmAccount(): SA | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  const sa = parseSecret(raw) as SA | null;
  if (!sa || !sa.client_email || !sa.private_key || !sa.project_id) return null;
  sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
  return sa;
}

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa: SA): Promise<string> {
  if (cached && cached.until > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64url(sig) }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('fcm token: ' + JSON.stringify(j).slice(0, 200));
  cached = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

/** 앱 하나에 보내요. 돌려주는 값: 'ok' | 'gone'(열쇠가 끊김 → 줄을 지워요) | 'error' */
export async function sendFcm(sa: SA, token: string, data: Record<string, string>, ttlSec = 86400): Promise<'ok' | 'gone' | 'error'> {
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await accessToken(sa), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data, android: { priority: 'high', ttl: ttlSec + 's' } } }),
    });
    if (r.ok) return 'ok';
    const t = await r.text();
    if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(t)) return 'gone';
    console.warn('fcm', r.status, t.slice(0, 200));
    return 'error';
  } catch (e) { console.warn('fcm', String(e)); return 'error'; }
}

/** 비밀값이 맞는지 확인: 구글에서 출입증을 받아 봐요 (보내지는 않아요) */
export async function fcmCheck(): Promise<string> {
  const sa = fcmAccount();
  if (!sa) {
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!raw) return 'no secret';
    // 열쇠 내용은 보이지 않게, 모양만 알려 줘요
    const o = parseSecret(raw);
    return `bad secret · length ${raw.length} · starts ${JSON.stringify(raw.trim().slice(0, 1))} · ` + (o ? 'keys ' + Object.keys(o).join(',') : 'not json');
  }
  try { await accessToken(sa); return 'ok ' + sa.project_id; } catch (e) { return String(e).slice(0, 200); }
}

/** couple_push 줄 하나가 앱(FCM)인지 */
export const fcmToken = (row: { sub?: { endpoint?: string; fcm?: string } }) =>
  row?.sub?.fcm || (row?.sub?.endpoint?.startsWith('fcm:') ? row.sub.endpoint.slice(4) : '');
