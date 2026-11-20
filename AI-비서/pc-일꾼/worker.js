// 🖥️ AI 비서 PC 일꾼
// 앱에서 맡긴 일을 이 PC에서 "따로 연 브라우저 창"으로 해요.
//   - 👀 지켜보기(watch): 페이지를 정해진 간격으로 새로고침하다가, 어떤 글자가 나타나거나 사라지면 폰으로 알려 줘요.
//   - 🖱️ 대신 하기(do): AI가 화면을 보고 하나씩 눌러요. 예약·결제·신청·보내기 같은 중요한 버튼 앞에서는 멈추고 앱에서 [허락]을 받아요.
// 비밀번호·카드번호는 일꾼이 절대 넣지 않아요. 로그인·본인인증은 열린 창에서 사람이 직접 해요(로그인은 이 창에 계속 남아요).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), readline = require('readline');

const SB_URL = 'https://aaiplfmwljguzsvgdxit.supabase.co';
const SB_KEY = 'sb_publishable_CJMXrbPYqKs8a1cxvYyQbw_iJtzslLD'; // 공개용 키(안전)
const VERSION = '0.5.0';
const TEST = process.env.AIW_TEST ? JSON.parse(fs.readFileSync(process.env.AIW_TEST, 'utf8')) : null; // 시험용(가짜 서버·가짜 AI)
const HOME = TEST ? fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-')) : path.join(process.env.LOCALAPPDATA || os.homedir(), 'AI비서일꾼');
fs.mkdirSync(HOME, { recursive: true });
const CFG_FILE = path.join(HOME, '설정.json'), AUTH_FILE = path.join(HOME, 'login.json');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const cfg = Object.assign({ model: 'gemini-flash-lite-latest', name: os.hostname() || 'PC', gkey: '' }, readJ(CFG_FILE, {}), TEST?.cfg || {});
const saveCfg = () => fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const say = (...a) => console.log(`[${now()}]`, ...a);

// 예약·결제처럼 되돌리기 어려운 버튼 (이 말이 들어간 버튼은 AI가 뭐라 해도 허락을 받아요)
const RISKY = /결제|구매|주문|예매|예약|신청|제출|보내기|전송|발송|확정|완료|등록|삭제|취소|탈퇴|동의|승인|송금|이체|충전|pay|buy|order|checkout|submit|confirm|book|reserve|purchase|send|delete/i;

/* ============ 서버 (진짜 / 시험) ============ */
let sb = null, me = null;
const B = TEST ? testBackend() : {
  async tasks(statuses) { const { data, error } = await sb.from('ai_tasks').select('*').in('status', statuses).order('created_at'); if (error) throw error; return data; },
  async get(id) { const { data } = await sb.from('ai_tasks').select('*').eq('id', id).maybeSingle(); return data; },
  async update(id, patch) { const { error } = await sb.from('ai_tasks').update(patch).eq('id', id); if (error) say('⚠️ 저장 실패', error.message); },
  async add(row) { await sb.from('ai_tasks').insert({ ...row, user_id: me.id }); },
  async notify(title, body) { try { await sb.functions.invoke('ai-google', { body: { action: 'notify', title, body } }); } catch (e) { /* 알림 실패는 넘어가요 */ } },
  async beat(info) { await sb.from('ai_workers').upsert({ user_id: me.id, name: cfg.name, last_seen: new Date().toISOString(), info }); },
  async coolAll() { const { data, error } = await sb.from('ai_cool').select('id,done,done_src,gone'); if (error) throw error; return data; },
  async coolUpsert(rows) { for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('ai_cool').upsert(rows.slice(i, i + 200).map(r => ({ ...r, user_id: me.id }))); if (error) throw error; } },
  async coolGone(ids) { const { error } = await sb.from('ai_cool').update({ gone: true }).in('id', ids); if (error) throw error; }
};
function testBackend() {
  const rows = (TEST.tasks || []).map((t, i) => ({ id: 't' + i, status: 'queued', log: [], ...t }));
  const cool = TEST.cool || [];
  return {
    rows, cool,
    async coolAll() { return cool.map(r => ({ ...r })); },
    async coolGone(ids) { cool.filter(x => ids.includes(x.id)).forEach(x => x.gone = true); },
    async coolUpsert(list) { for (const r of list) { const o = cool.find(x => x.id === r.id); if (o) Object.assign(o, r); else cool.push({ kind: 'todo', text: '', done: false, gone: false, ...r }); } },
    async tasks(st) { return rows.filter(r => st.includes(r.status)); },
    async get(id) { const r = rows.find(x => x.id === id); if (r && r.status === 'need_ok' && TEST.answer) { r.answer = TEST.answer; r.status = 'running'; } return r; },
    async update(id, p) { Object.assign(rows.find(x => x.id === id), p); if (p.status || p.step) say('  ↳', id, p.status || '', p.step || ''); },
    async add(row) { rows.push({ id: 't' + rows.length, status: 'queued', log: [], ...row }); },
    async notify(t, b) { say('🔔 알림:', t, '/', b); (TEST.notified ||= []).push(t); },
    async beat() {}
  };
}
async function login() {
  const { createClient } = require('@supabase/supabase-js');
  const storage = {
    getItem: k => readJ(AUTH_FILE, {})[k] ?? null,
    setItem: (k, v) => { const o = readJ(AUTH_FILE, {}); o[k] = v; fs.writeFileSync(AUTH_FILE, JSON.stringify(o)); },
    removeItem: k => { const o = readJ(AUTH_FILE, {}); delete o[k]; fs.writeFileSync(AUTH_FILE, JSON.stringify(o)); }
  };
  sb = createClient(SB_URL, SB_KEY, { auth: { storage, storageKey: 'aiw.auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  let { data: { session } } = await sb.auth.getSession();
  if (session) { const { data, error } = await sb.auth.getUser(); if (error || !data.user) session = null; }
  while (!session) {
    console.log('\n📱 앱 ⚙️ 설정 → 🖥️ PC 일꾼 → [연결 코드 만들기]를 누르면 8글자 코드가 나와요.');
    const code = (await ask('   그 코드를 여기에 쓰고 Enter: ')).trim().toUpperCase();
    const { data, error } = await sb.functions.invoke('ai-google', { body: { action: 'pair_use', code } });
    let msg = error?.message; try { if (error) msg = (await error.context.json()).error || msg; } catch (e) {}
    if (error || data?.error) { console.log('   ⚠️', data?.error || msg); continue; }
    const v = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (v.error) { console.log('   ⚠️ 로그인 실패:', v.error.message); continue; }
    session = v.data.session;
    if (data.gkey) { cfg.gkey = data.gkey; saveCfg(); }
    console.log(`   ✅ ${data.email} 비서와 연결했어요. 다음부터는 코드 없이 켜져요.`);
  }
  me = (await sb.auth.getUser()).data.user;
  const { data: owner } = await sb.rpc('ai_is_owner');
  if (!owner) throw new Error('이 계정은 AI 비서 주인이 아니에요');
  if (!cfg.gkey) { cfg.gkey = (await ask('\n🤖 Gemini API 키를 넣어 주세요(앱 ⚙️에 넣은 것과 같은 키): ')).trim(); saveCfg(); }
}
function ask(q) { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return new Promise(r => rl.question(q, a => { rl.close(); r(a); })); }

/* ============ AI (Gemini) ============ */
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    thought: { type: 'STRING' },
    action: { type: 'STRING', enum: ['click', 'type', 'select', 'press_enter', 'scroll', 'goto', 'back', 'wait', 'need_person', 'done', 'fail'] },
    n: { type: 'INTEGER' }, text: { type: 'STRING' }, url: { type: 'STRING' },
    risky: { type: 'BOOLEAN' }, why: { type: 'STRING' }, summary: { type: 'STRING' }, evidence: { type: 'STRING' }
  },
  required: ['thought', 'action']
};
const RULES = `너는 사람 대신 웹사이트를 조작하는 꼼꼼한 비서야. 목표를 이루기 위해 "지금 화면에서 할 다음 한 가지"만 정해.
규칙:
- 아래 [누를 수 있는 것] 목록의 번호(n)만 써. 목록에 없으면 scroll이나 wait를 해.
- 되돌리기 어려운 일(예약·예매 확정, 결제, 주문, 신청·제출, 보내기, 삭제, 취소, 약관 동의)은 반드시 risky=true, why에 무엇이 일어나는지 한 줄로.
- 비밀번호·카드번호·주민번호·인증번호는 절대 입력하지 마. 로그인·본인인증·보안문자·결제 비밀번호가 필요하면 action=need_person, why에 사람이 할 일을 써.
- 목표와 다른 일은 하지 마. 고를 게 여러 개라 애매하면(날짜·지점·좌석 등) need_person으로 물어봐.
- 목표를 다 이뤘으면 action=done, summary에 결과(예약번호·날짜·금액 등), evidence에 지금 화면에 실제로 보이는 확인 글자(예: "예약이 완료되었습니다")를 그대로 써. 화면에 확인 글자가 없으면 done 하지 마.
- 더 할 수 없으면 action=fail, why에 이유.
- thought는 한국어 한 줄.`;
async function gemini(parts) {
  if (TEST) { const r = TEST.gemini.shift(); if (!r) throw new Error('시험 AI 답이 떨어졌어요'); return r; }
  for (let tryN = 0; tryN < 3; tryN++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.gkey },
      body: JSON.stringify({ system_instruction: { parts: [{ text: RULES }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } })
    });
    if (res.status === 429 || res.status === 503) { await sleep(20000); continue; }
    if (!res.ok) throw new Error(`AI 오류 ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const d = await res.json();
    return JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}');
  }
  throw new Error('AI가 계속 바빠요(무료 한도). 잠시 뒤 다시 맡겨 주세요');
}

/* ============ 브라우저 (따로 연 창) ============ */
let ctx = null, opening = null;
function browser() {
  if (ctx) return Promise.resolve(ctx);
  return opening ??= (async () => { // 일이 동시에 와도 창은 한 번만 열어요
    const { chromium } = require('playwright-core');
    const dir = path.join(HOME, 'browser');
    const opts = { headless: !!TEST, viewport: TEST ? { width: 1100, height: 800 } : null, args: TEST ? [] : ['--start-maximized'] };
    for (const channel of ['chrome', 'msedge']) {
      try { ctx = await chromium.launchPersistentContext(dir, { ...opts, channel }); break; } catch (e) { say('브라우저 열기 실패', channel, e.message.split('\n')[0]); }
    }
    opening = null;
    if (!ctx) throw new Error('크롬이나 엣지를 열 수 없어요. 크롬을 설치해 주세요');
    ctx.on('close', () => { ctx = null; });
    return ctx;
  })();
}
const shot = async page => 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 45 })).toString('base64');
async function mark(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-ai-n]').forEach(e => e.removeAttribute('data-ai-n'));
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 2; };
    const out = []; let n = 0;
    for (const e of document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=option],[role=checkbox],[role=radio],[onclick],label')) {
      if (n >= 160 || !vis(e)) continue;
      const lab = e.labels?.[0]?.innerText || '';
      const t = (e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || e.title || e.alt || lab || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const field = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName);
      if (!t && !field) continue;
      if (e.type === 'password') continue; // 비밀번호 칸은 아예 보여 주지 않아요
      e.setAttribute('data-ai-n', n);
      out.push({ n, tag: e.tagName.toLowerCase(), type: e.type || '', text: t, label: field ? lab.trim().slice(0, 30) : '', off: !!(e.disabled || e.getAttribute('aria-disabled') === 'true') });
      n++;
    }
    return out;
  });
}
const pageText = page => page.evaluate(() => (document.body?.innerText || '').replace(/\n{2,}/g, '\n')).catch(() => '');

/* ============ 일 처리 ============ */
const running = new Map(); // id → 'watch' | 'do'
async function log(t, line, extra = {}) {
  t.log = [...(t.log || []), `${now()} ${line}`].slice(-40);
  await B.update(t.id, { log: t.log, step: line, ...extra });
}
async function stopped(t) { const r = await B.get(t.id); return !r || r.status === 'stopped'; }
// 앱에서 [허락]/[안 함]을 누를 때까지 기다려요
async function permission(t, why, action, img) {
  await B.update(t.id, { status: 'need_ok', need: { why, action }, shot: img, answer: null, step: '✋ 허락 기다리는 중: ' + action });
  await B.notify('✋ 허락이 필요해요', `${t.title}\n${action}`);
  say('✋ 허락 기다림:', action);
  for (;;) {
    await sleep(2000);
    const r = await B.get(t.id);
    if (!r || r.status === 'stopped') return false;
    const ans = r.answer;
    if (ans === 'yes' || ans === 'no') { await B.update(t.id, { answer: null, need: null, status: 'running' }); return ans === 'yes'; }
  }
}

async function runWatch(t) {
  const s = t.spec || {}, every = Math.max(TEST ? 1 : 30, +s.every || 60) * 1000, until = Date.now() + Math.min(24, +s.hours || 6) * 3600e3;
  const want = String(s.text || '').trim();
  if (!s.url || !want) { await B.update(t.id, { status: 'failed', step: '주소나 찾을 글자가 없어요' }); return; }
  await B.update(t.id, { status: 'running' });
  const page = await (await browser()).newPage();
  let n = 0, hitTimes = 0;
  try {
    await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    while (Date.now() < until) {
      if (await stopped(t)) { await page.close().catch(() => {}); return; }
      if (n > 0) await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(2500); n++;
      const txt = await pageText(page);
      const loaded = txt.length > 80;
      const hit = loaded && (s.mode === 'disappear' ? !txt.includes(want) : txt.includes(want));
      hitTimes = hit ? hitTimes + 1 : 0;
      // "사라짐"은 페이지가 덜 떠서 생길 수 있으니 두 번 연속일 때만 믿어요
      if (hitTimes >= (s.mode === 'disappear' ? 2 : 1)) {
        const img = await shot(page);
        const msg = s.mode === 'disappear' ? `"${want}"이(가) 사라졌어요` : `"${want}"이(가) 나타났어요`;
        await log(t, `🔔 ${msg}! (${n}번째 확인)`, { status: 'done', result: { ok: true, summary: msg, url: page.url() }, shot: img });
        await B.notify('🔔 ' + (t.title || '지켜보던 것'), msg + ' — 앱에서 확인해 주세요');
        if (s.then_goal) await B.add({ kind: 'do', title: '이어서: ' + s.then_goal.slice(0, 40), spec: { url: page.url(), goal: s.then_goal } });
        return; // 창은 열어 둬요(바로 직접 할 수 있게)
      }
      if (n % 5 === 1 || !loaded) await log(t, loaded ? `👀 ${n}번째 확인 · 아직이에요` : `⚠️ ${n}번째 확인 · 페이지가 잘 안 떠요`);
      await sleep(Math.max(0, every - 2500));
    }
    await log(t, '⏰ 지켜보는 시간이 끝났어요', { status: 'failed' });
    await page.close().catch(() => {});
  } catch (e) { await log(t, '⚠️ ' + e.message.split('\n')[0], { status: 'failed' }); }
}

async function runDo(t) {
  const s = t.spec || {};
  await B.update(t.id, { status: 'running' });
  const page = await (await browser()).newPage();
  const hist = [];
  try {
    if (s.url) await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let step = 1; step <= 30; step++) {
      if (await stopped(t)) return;
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const els = await mark(page), img = await shot(page), txt = (await pageText(page)).slice(0, 2500);
      const parts = [
        { text: `[목표] ${s.goal}\n[지금 주소] ${page.url()}\n[제목] ${await page.title()}\n[지금까지 한 일]\n${hist.slice(-10).join('\n') || '(처음)'}\n[누를 수 있는 것]\n${els.map(e => `${e.n}: <${e.tag}${e.type ? ' ' + e.type : ''}${e.off ? ' 꺼짐' : ''}> ${e.label ? e.label + ': ' : ''}${e.text}`).join('\n')}\n[화면 글자]\n${txt}` },
        { inline_data: { mime_type: 'image/jpeg', data: img.split(',')[1] } }
      ];
      const a = await gemini(parts);
      const el = els.find(e => e.n === a.n);
      await log(t, `${step}. ${a.thought || ''}`.slice(0, 160), { shot: img });
      if (a.action === 'done') {
        const fin = await pageText(page), ev = String(a.evidence || '').trim();
        const verified = !!ev && fin.includes(ev); // 했다는 말 대신 화면에 진짜 있는지 확인
        const img2 = await shot(page);
        await log(t, verified ? `✅ 끝났어요 · 화면에서 "${ev}" 확인` : '✅ 끝났다고 했지만 화면에서 확인 글자를 못 찾았어요 — 직접 봐 주세요', { status: 'done', result: { ok: true, verified, summary: a.summary || '', url: page.url() }, shot: img2 });
        await B.notify(verified ? '✅ 다 했어요' : '⚠️ 했는데 확인이 필요해요', `${t.title}\n${a.summary || ''}`);
        return;
      }
      if (a.action === 'fail') { await log(t, '❌ ' + (a.why || '더 할 수 없어요'), { status: 'failed' }); await B.notify('❌ 못 했어요', `${t.title}\n${a.why || ''}`); return; }
      if (a.action === 'need_person') {
        const ok = await permission(t, a.why || '', `👤 사람이 할 일: ${a.why || ''} (PC의 일꾼 창에서 하고 [허락]을 눌러 주세요)`, img);
        if (!ok) { await log(t, '🚫 멈췄어요', { status: 'stopped' }); return; }
        hist.push(`${step}. 사람이 직접 처리함: ${a.why}`); continue;
      }
      if (['click', 'type', 'select', 'press_enter'].includes(a.action) && !el) { hist.push(`${step}. ${a.n}번이 목록에 없어서 다시 봄`); continue; }
      const risky = a.action === 'click' && (a.risky || RISKY.test(el.text)) || a.action === 'press_enter' && a.risky;
      if (risky) {
        const ok = await permission(t, a.why || '', `「${el?.text || 'Enter'}」 누르기 — ${a.why || '되돌리기 어려운 버튼이에요'}`, img);
        if (!ok) { await log(t, '🚫 허락하지 않아서 멈췄어요', { status: 'stopped' }); return; }
      }
      const loc = el ? page.locator(`[data-ai-n="${el.n}"]`).first() : null;
      try {
        if (a.action === 'click') await loc.click({ timeout: 8000 });
        else if (a.action === 'type') { if (el.type === 'password') throw new Error('비밀번호 칸은 안 써요'); await loc.fill(String(a.text || ''), { timeout: 8000 }); }
        else if (a.action === 'select') await loc.selectOption({ label: String(a.text || '') }, { timeout: 8000 }).catch(() => loc.selectOption(String(a.text || '')));
        else if (a.action === 'press_enter') await (loc || page.keyboard).press('Enter');
        else if (a.action === 'scroll') await page.mouse.wheel(0, 700);
        else if (a.action === 'goto' && /^https?:\/\//.test(a.url || '')) await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        else if (a.action === 'back') await page.goBack().catch(() => {});
        else await sleep(3000);
        hist.push(`${step}. ${a.action}${el ? ` [${el.text}]` : ''}${a.text ? ` "${a.text}"` : ''}`);
      } catch (e) { hist.push(`${step}. ${a.action} 실패: ${e.message.split('\n')[0].slice(0, 80)}`); }
      await sleep(1200);
    }
    await log(t, '⏹️ 30단계 안에 끝내지 못했어요', { status: 'failed' });
  } catch (e) { await log(t, '⚠️ ' + e.message.split('\n')[0], { status: 'failed' }); }
}

/* ============ 📨 쿨메신저 비서 정리 항목 맞추기 (v0.6) ============
   쿨메신저 비서가 같은 PC에 저장한 items.json(정리된 항목)과 done.json(체크한 것)을 읽어서
   정리된 항목만 서버에 올리고, 앱에서 체크한 것은 done.json에 적어 쿨메신저 비서 창에도 체크되게 해요.
   쪽지 원문(msgs.json)과 쿨메신저 비서의 키·설정은 절대 읽지도 올리지도 않아요. */
const COOL_DIR = process.env.AIW_COOL_DIR || TEST?.coolDir || path.join(process.env.LOCALAPPDATA || os.homedir(), 'CoolAI');
const COOL_STATE = path.join(HOME, '쿨메신저-맞춤.json'); // 지난번에 맞춘 체크 상태(어느 쪽이 바꿨는지 알려고)
const COOL_KINDS = ['todo', 'note', 'remember'];
let coolInfo = null;
async function coolSync() {
  const itemsF = path.join(COOL_DIR, 'items.json'), doneF = path.join(COOL_DIR, 'done.json');
  if (!fs.existsSync(itemsF)) return (coolInfo = null); // 쿨메신저 비서가 없는 PC(예: 집 PC)
  const items = readJ(itemsF, null), doneArr = readJ(doneF, []);
  if (!Array.isArray(items) || !Array.isArray(doneArr)) return; // 쓰는 중일 수 있어요 → 다음 번에
  const pc = new Set(doneArr.map(String));
  const st = readJ(COOL_STATE, { base: {}, sig: {} });
  const srv = new Map((await B.coolAll()).map(r => [r.id, r]));
  const up = [], gone = [], seen = new Set(), base = {};
  let fromApp = 0, fromPc = 0;
  for (const it of items) {
    const id = String(it?.id || ''); if (!id || seen.has(id)) continue; seen.add(id);
    const row = {
      id, kind: COOL_KINDS.includes(it.kind) ? it.kind : 'todo', text: String(it.text || '').slice(0, 500),
      due: /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : '', time: /^\d{2}:\d{2}$/.test(it.time || '') ? it.time : '',
      sender: String(it.sender || '').slice(0, 60), recv: String(it.recv || '').slice(0, 20), fav: !!it.fav
    };
    const s = srv.get(id), b = st.base[id], p = pc.has(id);
    // 체크 맞추기: 지난번 맞춘 값(b)과 달라진 쪽을 따라가요. 둘 다 바뀌었으면 앱(폰)이 이겨요.
    let done = p;
    if (s) {
      if (b === undefined) done = p || s.done;
      else if (s.done !== b) done = s.done;
    }
    if (done !== p) { done ? pc.add(id) : pc.delete(id); fromApp++; }
    base[id] = done;
    const sig = JSON.stringify(row);
    const pcChanged = !!s && s.done !== done;
    if (!s || s.gone || pcChanged || st.sig[id] !== sig) {
      up.push({ ...row, done, gone: false, done_src: pcChanged || (!s && done) ? 'pc' : s?.done_src ?? null }); // 모든 줄의 칸을 똑같이(빠진 칸은 비워지니까)
      if (pcChanged) fromPc++;
    }
    st.sig[id] = sig;
  }
  // 쿨메신저 비서에서 없어진 항목은 '사라짐' 표시만 (파일을 잘못 읽어 비어 보일 때는 건너뛰어요)
  if (seen.size || srv.size < 5) for (const [id, s] of srv) if (!seen.has(id) && !s.gone) { up.push({ id, gone: true }); delete st.sig[id]; }
  if (fromApp) { // 앱에서 체크한 것 → done.json (쿨메신저 비서 창이 2초 안에 다시 읽어요)
    const tmp = doneF + '.aiw.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...pc]), 'utf8');
    fs.renameSync(tmp, doneF);
  }
  if (up.length) await B.coolUpsert(up);
  st.base = base;
  fs.writeFileSync(COOL_STATE, JSON.stringify(st));
  if (up.length || fromApp) say(`📨 쿨메신저: 올림 ${up.length}개${fromPc ? ` (PC 체크 ${fromPc})` : ''}${fromApp ? ` · 앱 체크 ${fromApp}개를 쿨메신저 비서에 반영` : ''}`);
  return (coolInfo = { n: seen.size, at: new Date().toISOString() });
}

/* ============ 시작 ============ */
(async () => {
  console.log(`🖥️ AI 비서 PC 일꾼 v${VERSION}\n   이 검은 창을 닫으면 일꾼도 꺼져요. 일꾼이 여는 브라우저 창은 닫지 말고 그대로 두세요.`);
  if (!TEST) await login();
  // 일꾼이 꺼져 있는 동안 "하는 중"이던 일 정리: 지켜보기는 다시 시작, 대신 하기는 멈춤 표시
  for (const t of await B.tasks(['running', 'need_ok'])) {
    if (t.kind === 'watch') await B.update(t.id, { status: 'queued' });
    else await B.update(t.id, { status: 'failed', step: '일꾼이 다시 켜져서 멈췄어요. 다시 맡겨 주세요' });
  }
  if (!TEST) await browser();
  say('✅ 준비됐어요. 앱에서 일을 맡겨 주세요.');
  let doBusy = false, lastBeat = 0;
  for (let loops = 0; ; loops++) {
    try {
      if (Date.now() - lastBeat > 30000) { lastBeat = Date.now(); await B.beat({ v: VERSION, running: running.size }); }
      for (const t of await B.tasks(['queued'])) {
        if (running.has(t.id)) continue;
        if (t.kind === 'do' && doBusy) continue; // 대신 하기는 한 번에 하나씩
        running.set(t.id, t.kind); say(t.kind === 'watch' ? '👀 지켜보기 시작:' : '🖱️ 대신 하기 시작:', t.title);
        if (t.kind === 'do') doBusy = true;
        (t.kind === 'watch' ? runWatch(t) : runDo(t)).finally(() => { running.delete(t.id); if (t.kind === 'do') doBusy = false; say('끝:', t.title); });
      }
    } catch (e) { say('⚠️', e.message); }
    if (TEST && !running.size && !(await B.tasks(['queued'])).length) break;
    await sleep(3000);
  }
  if (TEST) { fs.writeFileSync(process.env.AIW_TEST + '.out.json', JSON.stringify({ rows: B.rows, notified: TEST.notified || [] }, null, 1)); if (ctx) await ctx.close(); process.exit(0); }
})().catch(e => { console.error('\n❌', e.message); if (!TEST) ask('Enter를 누르면 닫혀요').then(() => process.exit(1)); else process.exit(1); });
