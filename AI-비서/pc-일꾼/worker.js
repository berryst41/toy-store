// 🖥️ AI 비서 PC 일꾼
// 앱에서 맡긴 일을 이 PC에서 "따로 연 브라우저 창"으로 해요.
//   - 👀 지켜보기(watch): 페이지를 정해진 간격으로 새로고침하다가, 어떤 글자가 나타나거나 사라지면 폰으로 알려 줘요.
//   - 🖱️ 대신 하기(do): AI가 화면을 보고 하나씩 눌러요. 예약·결제·신청·보내기 같은 중요한 버튼 앞에서는 멈추고 앱에서 [허락]을 받아요.
// 비밀번호·카드번호는 일꾼이 절대 넣지 않아요. 로그인·본인인증은 열린 창에서 사람이 직접 해요(로그인은 이 창에 계속 남아요).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), readline = require('readline');

const SB_URL = 'https://aaiplfmwljguzsvgdxit.supabase.co';
const SB_KEY = 'sb_publishable_CJMXrbPYqKs8a1cxvYyQbw_iJtzslLD'; // 공개용 키(안전)
const VERSION = '0.10.0';
const TEST = process.env.AIW_TEST ? JSON.parse(fs.readFileSync(process.env.AIW_TEST, 'utf8')) : null; // 시험용(가짜 서버·가짜 AI)
const HOME = TEST?.home || (TEST ? fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-')) : path.join(process.env.LOCALAPPDATA || os.homedir(), 'AI비서일꾼'));
fs.mkdirSync(HOME, { recursive: true });
const CFG_FILE = path.join(HOME, '설정.json'), AUTH_FILE = path.join(HOME, 'login.json');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const cfg = Object.assign({ model: 'gemini-flash-lite-latest', name: os.hostname() || 'PC', gkey: '' }, readJ(CFG_FILE, {}), TEST?.cfg || {});
const saveCfg = () => fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
// 숨어서 켜기(--hidden): PC를 켤 때 autostart.ps1이 창 없이 켜요. 글은 화면 대신 기록 파일에 남겨요.
const HIDDEN = process.argv.includes('--hidden');
const LOG_FILE = path.join(HOME, '일꾼-기록.txt');
if (HIDDEN) {
  try { if (fs.statSync(LOG_FILE).size > 1e6) fs.renameSync(LOG_FILE, LOG_FILE + '.old'); } catch (e) {}
  const w = (...a) => { try { fs.appendFileSync(LOG_FILE, `${new Date().toLocaleDateString('ko-KR')} ${a.map(x => typeof x === 'string' ? x : x instanceof Error ? x.message : JSON.stringify(x)).join(' ')}\n`); } catch (e) {} };
  console.log = w; console.error = w;
}
const say = (...a) => console.log(`[${now()}]`, ...a);
// 일꾼은 한 PC에 하나만 (숨어서 도는 것 + bat 더블클릭이 겹치지 않게). 30초마다 '켜짐' 표시를 새로 써요.
const LOCK_FILE = path.join(HOME, '켜짐.json');
function takeLock() {
  const l = readJ(LOCK_FILE, null);
  if (l && l.pid !== process.pid && Date.now() - l.t < 90000) { try { process.kill(l.pid, 0); return l; } catch (e) { /* 이미 꺼진 일꾼 */ } }
  touchLock(); process.on('exit', () => { try { if (readJ(LOCK_FILE, {}).pid === process.pid) fs.unlinkSync(LOCK_FILE); } catch (e) {} });
  return null;
}
const touchLock = () => { try { fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, t: Date.now(), hidden: HIDDEN })); } catch (e) {} };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => process.exit(0));

// 예약·결제처럼 되돌리기 어려운 버튼 (이 말이 들어간 버튼은 AI가 뭐라 해도 허락을 받아요)
const RISKY = /결제|구매|주문|예매|예약|신청|제출|보내기|전송|발송|확정|완료|등록|삭제|취소|탈퇴|동의|승인|송금|이체|충전|pay|buy|order|checkout|submit|confirm|book|reserve|purchase|send|delete/i;
// 📅 "끝까지 자동" 예약(v0.7)에서도 언제나 허락을 받는 것: 돈이 나가거나, 지우거나, 보내는 버튼
const ALWAYS_ASK = /결제|구매|주문|송금|이체|충전|삭제|탈퇴|보내기|전송|발송|pay|buy|order|checkout|purchase|delete|send/i;
// "끝까지 자동"에서 묻지 않고 눌러도 되는 버튼(예약 확정 쪽 말)
const BOOK_WORDS = /예약|예매|신청|확정|완료|다음|동의|등록|확인|book|reserve|confirm|submit|next/i;
// 화면에 이런 말이 있으면 돈이 드는 예약으로 보고 자동이어도 허락을 받아요
const MONEY_PAGE = /결제\s*금액|총\s*결제|최종\s*결제|결제\s*수단|결제하기|예약금|선결제|보증금|카드\s*번호|무통장/;
// 사이트별 요령 (AI에게 알려 줘요)
const SITE_TIPS = [
  [/naver\.com/, '네이버 예약: 달력에서 날짜를 누르고, 시간 버튼 중 눌리는 것(회색·마감·"예약불가"는 안 됨)을 골라. 인원·옵션을 고른 뒤 "다음". 예약자 정보는 로그인 정보로 채워져 있으니 고치지 마. 요청사항은 비워 둬. 마지막은 "동의하고 예약하기"/"예약하기". 네이버페이 결제 화면이 나오면 pay=true.'],
  [/kobus\.co\.kr|t-money\.co\.kr|bustago|txbus/, '고속·시외버스: 출발지·도착지·날짜를 고르고 조회 → 시간표에서 원하는 시간대 중 잔여석이 있는 차를 골라 → 좌석 선택. 승차권은 결제가 꼭 있으니 결제 화면 앞에서 pay=true로 멈춰.'],
  [/keyescape|fantastrick|escape|방탈출|xdungeon|seoul-escape|nextedition|zeroworld/, '방탈출: 지점(매장)·테마·날짜를 고르면 시간 목록이 나와. "예약가능"/"가능"인 시간만 눌러. 예약자 이름·전화번호는 목표에 있으면 넣고, 없으면 need_person. 인원은 목표대로.']
];
// 🚫 매크로(자동 프로그램) 예매를 약관으로 금지하고 회원 탈퇴·수사 의뢰까지 하는 곳 → 일꾼이 아예 안 해요 (2026-11-22)
const BLOCKED = /(^|\.|\/\/)(letskorail\.com|korail\.com|srail\.kr|srail\.or\.kr)(\/|:|$)/i;
const blocked = url => BLOCKED.test(String(url || ''));
// 🛡️ 안전 모드: 다시 보기는 30분보다 자주 안 하고, 한 예약에 10번까지만
const RETRY_MIN = 30, RETRY_MAX = 10;
const tipsFor = url => SITE_TIPS.filter(([re]) => re.test(url || '')).map(([, t]) => t).join('\n');

/* ============ 서버 (진짜 / 시험) ============ */
let sb = null, me = null;
const B = TEST ? testBackend() : {
  async tasks(statuses) { const { data, error } = await sb.from('ai_tasks').select('*').in('status', statuses).order('created_at'); if (error) throw error; return data; },
  async get(id) { const { data } = await sb.from('ai_tasks').select('*').eq('id', id).maybeSingle(); return data; },
  // 일꾼이 여러 PC에 있어도 한 일은 한 PC만 하게: '기다리는 중'일 때만 내 것으로 바꿔요(먼저 바꾼 PC가 가져가요)
  async claim(t) { const { data } = await sb.from('ai_tasks').update({ status: 'running', spec: { ...(t.spec || {}), by: cfg.name } }).eq('id', t.id).eq('status', 'queued').select('id'); return !!data?.length; },
  async update(id, patch) { const { error } = await sb.from('ai_tasks').update(patch).eq('id', id); if (error) say('⚠️ 저장 실패', error.message); },
  async add(row) { await sb.from('ai_tasks').insert({ ...row, user_id: me.id }); },
  async notify(title, body, tag) { try { await sb.functions.invoke('ai-google', { body: { action: 'notify', title, body, ...(tag ? { tag } : {}) } }); } catch (e) { /* 알림 실패는 넘어가요 */ } },
  // ⏰ 반복 일 (v0.10): 앱이 ai_profile.settings.routines에 적어 둔 걸 정한 시각에 해요
  async profile() { const { data, error } = await sb.from('ai_profile').select('me,settings').maybeSingle(); if (error) throw error; return data || { settings: {} }; },
  async markRt(id, day) { // 한 날짜에 한 번만: 다시 읽어서 아직 안 했을 때만 표시하고 true
    const { data } = await sb.from('ai_profile').select('settings').maybeSingle(); const st = data?.settings || {};
    if ((st.rt_last || {})[id] === day) return false;
    const { error } = await sb.from('ai_profile').update({ settings: { ...st, rt_last: { ...(st.rt_last || {}), [id]: day } }, updated_at: new Date().toISOString() }).eq('user_id', me.id);
    if (error) throw error; return true;
  },
  async addChat(text) { const id = 'c' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6); const { error } = await sb.from('ai_items').upsert({ id, user_id: me.id, kind: 'chat', data: { role: 'model', text, acts: ['⏰ 반복 일 — PC 일꾼이 했어요'], ts: Date.now() }, deleted: false }); if (error) throw error; },
  async ctx(from, to) {
    const [items, cool, phone, g] = await Promise.all([
      sb.from('ai_items').select('kind,data').eq('deleted', false).in('kind', ['event', 'todo', 'memo']),
      sb.from('ai_cool').select('kind,text,due,time,sender').eq('done', false).eq('gone', false),
      sb.from('ai_phone_cal').select('calendars,events'),
      sb.functions.invoke('ai-google', { body: { action: 'context', from, to, max: 10 } }).catch(() => ({ data: null }))]);
    return { items: items.data || [], cool: cool.data || [], phone: phone.data || [], g: g?.data && !g.data.error ? g.data : null };
  },
  async beat(info) { await sb.from('ai_workers').upsert({ user_id: me.id, name: cfg.name, last_seen: new Date().toISOString(), info }); },
  // 📅 예약이 끝나면 캘린더에 넣기: 폰 캘린더(⚙️ 기본, 보통 공유용)가 있으면 캘린더 다리에 쪽지, 없으면 비서 일정에
  async addCal(ev) {
    const { data: rows } = await sb.from('ai_phone_cal').select('device,calendars,write_cal').order('synced_at', { ascending: false }).limit(1);
    const r = rows?.[0], cs = (r?.calendars || []).filter(c => 'can_write' in c && c.can_write !== false && c.visible !== false);
    const c = cs.find(x => String(x.id) === String(r?.write_cal || '')) || cs.find(x => x.name === '공유용') || cs[0];
    const data = { date: ev.date, time: ev.time || '', end: '', title: ev.title, all_day: !ev.time, ...(ev.loc ? { loc: ev.loc } : {}) };
    if (c) {
      const { error } = await sb.from('ai_phone_cmd').insert({ device: r.device, op: 'add', cal: String(c.id), data, label: `📅 예약 → [${c.name}] ${ev.date} ${ev.time || ''} ${ev.title}` });
      if (error) throw error; return `📱 폰 캘린더 [${c.name}]`;
    }
    const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { error } = await sb.from('ai_items').upsert({ id, user_id: me.id, kind: 'event', data: { date: ev.date, time: ev.time || '', title: ev.title }, deleted: false });
    if (error) throw error; return '📅 비서 일정';
  },
  async coolAll() { const { data, error } = await sb.from('ai_cool').select('id,kind,text,due,time,sender,recv,fav,done,done_src,gone'); if (error) throw error; return data; },
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
    async claim(t) { const r = rows.find(x => x.id === t.id); if (r.status !== 'queued') return false; r.status = 'running'; r.spec = { ...(r.spec || {}), by: cfg.name }; return true; },
    async get(id) { const r = rows.find(x => x.id === id); if (r && r.status === 'need_ok' && TEST.answer) { r.answer = TEST.answer; r.status = 'running'; } return r; },
    async update(id, p) { Object.assign(rows.find(x => x.id === id), p); if (p.status || p.step) say('  ↳', id, p.status || '', p.step || ''); },
    async add(row) { rows.push({ id: 't' + rows.length, status: 'queued', log: [], ...row }); },
    async notify(t, b, tag) { say('🔔 알림:', t, '/', b); (TEST.notified ||= []).push(t + (tag ? ' #' + tag : '')); },
    async profile() { return TEST.profile || { settings: {} }; },
    async markRt(id, day) { const st = (TEST.profile ||= { settings: {} }).settings; st.rt_last ||= {}; if (st.rt_last[id] === day) return false; st.rt_last[id] = day; return true; },
    async addChat(text) { (TEST.chat ||= []).push(text); },
    async ctx() { return TEST.ctx || { items: [], cool: [], phone: [], g: null }; },
    async addCal(ev) { (TEST.cal ||= []).push(ev); return '📅 시험 캘린더'; },
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
  if (HIDDEN && !session) { say('⚠️ 아직 앱과 연결하지 않았어요. 일꾼-켜기.bat을 한 번 더블클릭해서 연결 코드를 넣어 주세요'); process.exit(3); }
  if (session) {
    const { data, error } = await sb.auth.getUser();
    // 숨어서 켤 때는 PC가 막 켜져 인터넷이 아직 안 될 수 있어요 → 잠시 뒤 다시 (autostart.ps1이 다시 켜요)
    if (HIDDEN && (error || !data.user)) { if (error?.status === 401 || error?.status === 403) { say('⚠️ 연결이 풀렸어요. 일꾼-켜기.bat으로 다시 연결해 주세요'); process.exit(3); } throw new Error('서버에 아직 연결이 안 돼요: ' + (error?.message || '')); }
    if (error || !data.user) session = null;
  }
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
  if (!cfg.gkey && HIDDEN) say('⚠️ Gemini 키가 없어서 🖱️ 대신 하기는 못 해요(지켜보기·쿨메신저는 돼요). 일꾼-켜기.bat으로 한 번 넣어 주세요');
  else if (!cfg.gkey) { cfg.gkey = (await ask('\n🤖 Gemini API 키를 넣어 주세요(앱 ⚙️에 넣은 것과 같은 키): ')).trim(); saveCfg(); }
}
function ask(q) { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return new Promise(r => rl.question(q, a => { rl.close(); r(a); })); }

/* ============ AI (Gemini) ============ */
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    thought: { type: 'STRING' },
    action: { type: 'STRING', enum: ['click', 'type', 'select', 'press_enter', 'scroll', 'goto', 'back', 'wait', 'need_person', 'no_slot', 'done', 'fail'] },
    n: { type: 'INTEGER' }, text: { type: 'STRING' }, url: { type: 'STRING' },
    risky: { type: 'BOOLEAN' }, pay: { type: 'BOOLEAN' }, why: { type: 'STRING' }, summary: { type: 'STRING' }, evidence: { type: 'STRING' },
    date: { type: 'STRING' }, time: { type: 'STRING' }, place: { type: 'STRING' }
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
- 돈을 내는 단계(결제 금액·결제 수단·결제하기·예약금)가 나오면 그 버튼은 pay=true.
- [예약]일 때: 목표에 적힌 날짜·시간대·대안 안에서만 골라. 그 안에 빈자리가 하나도 없으면(마감·매진·예약불가·꺼진 버튼) 다른 걸 마음대로 고르지 말고 action=no_slot, why에 본 것을 한 줄로.
- done일 때 예약한 날짜는 date(YYYY-MM-DD), 시각은 time(HH:MM), 가게·장소 이름은 place에도 채워.
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
    for (const channel of process.env.AIW_CHROME ? ['exe'] : ['chrome', 'msedge']) { // AIW_CHROME = 시험할 때 크로미움 위치
      try { ctx = await chromium.launchPersistentContext(dir, channel === 'exe' ? { ...opts, executablePath: process.env.AIW_CHROME } : { ...opts, channel }); break; } catch (e) { say('브라우저 열기 실패', channel, e.message.split('\n')[0]); }
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
  if (t.spec?.bus) return runBus(t); // 🚌 고속버스 빈자리
  const s = t.spec || {}, every = Math.max(TEST ? 1 : 30, +s.every || 60) * 1000, until = Date.now() + Math.min(24, +s.hours || 6) * 3600e3;
  const want = String(s.text || '').trim();
  if (!s.url || !want) { await B.update(t.id, { status: 'failed', step: '주소나 찾을 글자가 없어요' }); return; }
  if (blocked(s.url)) { await B.update(t.id, { status: 'failed', step: '🚫 코레일·SRT는 자동 프로그램을 금지해서(계정 정지 위험) 일꾼이 하지 않아요' }); return; }
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

// 시각을 "11/24 09:00"처럼
const hm = ms => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// 사이트 시계와 내 PC 시계 차이(ms). 서버가 알려 주는 Date(초 단위)로 맞춰요. 이상하면 0.
async function siteOffset(page, url) {
  try {
    const t0 = Date.now(), r = await page.request.head(url, { timeout: 8000 }), t1 = Date.now();
    const d = Date.parse(r.headers()['date'] || ''); if (!d) return 0;
    const off = d + 500 - (t0 + t1) / 2; // Date는 초 단위라 0.5초 더해 가운데로
    return Math.abs(off) < 600e3 ? off : 0;
  } catch (e) { return 0; }
}
// 네이버는 로그인 쿠키가 있는지 미리 봐요(없으면 사람이 로그인)
async function needLogin(page, url) {
  if (!/naver\.com/.test(url || '')) return false;
  const ck = await page.context().cookies('https://nid.naver.com').catch(() => []);
  return !ck.some(c => c.name === 'NID_AUT');
}
// 📅 예약 끝까지 자동이어도 허락을 받아야 하나?
function mustAsk(s, a, el, txt) {
  const label = el?.text || '';
  const risky = a.action === 'click' && (a.risky || a.pay || RISKY.test(label)) || a.action === 'press_enter' && (a.risky || a.pay);
  if (!risky) return false;
  if (!s.auto) return true; // 확정 전에 물어보기
  if (a.pay || ALWAYS_ASK.test(label)) return true; // 돈·지우기·보내기는 언제나
  if (MONEY_PAGE.test(txt)) return true; // 돈이 드는 예약
  return !BOOK_WORDS.test(label); // 예약 쪽 말이 아닌 위험 버튼은 물어봐요
}

async function runDo(t) {
  const s = t.spec || {};
  if (blocked(s.url)) { await B.update(t.id, { status: 'failed', step: '🚫 코레일·SRT는 자동 프로그램 예매를 금지해서(계정 정지 위험) 일꾼이 하지 않아요. 직접 예매해 주세요' }); return; }
  if (s.at) s.auto = false; // 🛡️ 정각 예약은 언제나 마지막 확정을 사람에게 물어봐요
  await B.update(t.id, { status: 'running' });
  const page = await (await browser()).newPage();
  const hist = [], tips = tipsFor(s.url);
  try {
    if (s.url) await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 🔐 네이버 로그인 확인 (정각 예약이면 미리 해 둬야 해요)
    if (!TEST && await needLogin(page, s.url)) {
      const ok = await permission(t, '네이버 로그인', '👤 PC 일꾼 창에서 네이버에 로그인해 주세요 (한 번만 하면 계속 남아요). 다 하면 [허락]', await shot(page));
      if (!ok) { await log(t, '🚫 멈췄어요', { status: 'stopped' }); await page.close().catch(() => {}); return; }
      if (s.url) await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    // ⏰ 정각 예약: 창을 미리 열어 두고, 사이트 시계로 정각이 되면 새로고침하고 바로 시작
    const at = s.at ? Date.parse(s.at) : 0;
    if (at && at > Date.now()) {
      const off = s.url ? await siteOffset(page, s.url) : 0;
      await log(t, `⏰ ${hm(at)} 정각을 기다려요 · 창을 미리 열어 뒀어요${off ? ` (사이트 시계가 ${(off / 1000).toFixed(1)}초 ${off > 0 ? '빨라요' : '느려요'})` : ''}`, { shot: await shot(page) });
      let lastCheck = 0; const jitter = TEST ? 300 : 3000 + Math.floor(Math.random() * 5000);
      for (;;) {
        const left = at + jitter - (Date.now() + off); // 🛡️ 정각 경쟁처럼 보이지 않게 몇 초 늦게
        if (left <= 0) break;
        if (left > 5000 && Date.now() - lastCheck > 5000) { lastCheck = Date.now(); if (await stopped(t)) { await page.close().catch(() => {}); return; } }
        await sleep(Math.min(left, left > 5000 ? 1000 : 50));
      }
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await log(t, '⏰ 예약이 열렸어요! 시작해요 (마지막 확정은 물어볼게요)');
      await B.notify('⏰ 예약이 열렸어요', `${t.title}\n일꾼이 화면을 준비해요. 곧 ✋ 허락을 물어봐요`);
    }
    for (let step = 1; step <= 30; step++) {
      if (await stopped(t)) return;
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const els = await mark(page), img = await shot(page), full = await pageText(page), txt = full.slice(0, 2500);
      const parts = [
        { text: `[목표] ${s.goal}\n${tips ? `[이 사이트 요령]\n${tips}\n` : ''}[지금 주소] ${page.url()}\n[제목] ${await page.title()}\n[지금까지 한 일]\n${hist.slice(-10).join('\n') || '(처음)'}\n[누를 수 있는 것]\n${els.map(e => `${e.n}: <${e.tag}${e.type ? ' ' + e.type : ''}${e.off ? ' 꺼짐' : ''}> ${e.label ? e.label + ': ' : ''}${e.text}`).join('\n')}\n[화면 글자]\n${txt}` },
        { inline_data: { mime_type: 'image/jpeg', data: img.split(',')[1] } }
      ];
      const a = await gemini(parts);
      const el = els.find(e => e.n === a.n);
      await log(t, `${step}. ${a.thought || ''}`.slice(0, 160), { shot: img });
      if (a.action === 'done') {
        const fin = await pageText(page), ev = String(a.evidence || '').trim();
        const verified = !!ev && fin.includes(ev); // 했다는 말 대신 화면에 진짜 있는지 확인
        const img2 = await shot(page);
        const result = { ok: true, verified, summary: a.summary || '', url: page.url() };
        // 📅 확인된 예약이면 캘린더에도 넣어요
        let calMsg = '';
        if (verified && s.cal && /^\d{4}-\d{2}-\d{2}$/.test(a.date || s.date || '')) {
          const ev2 = { date: /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : s.date, time: /^\d{2}:\d{2}$/.test(a.time || '') ? a.time : '', title: (s.what || t.title || '예약').slice(0, 60), loc: a.place || '' };
          try { const where = await B.addCal(ev2); result.cal = { ...ev2, where }; calMsg = ` · ${where}에 넣었어요`; }
          catch (e) { calMsg = ' · ⚠️ 캘린더에 못 넣었어요'; }
        }
        await log(t, (verified ? `✅ 끝났어요 · 화면에서 "${ev}" 확인` : '✅ 끝났다고 했지만 화면에서 확인 글자를 못 찾았어요 — 직접 봐 주세요') + calMsg, { status: 'done', result, shot: img2 });
        await B.notify(verified ? '✅ 다 했어요' : '⚠️ 했는데 확인이 필요해요', `${t.title}\n${a.summary || ''}${calMsg}`);
        return;
      }
      if (a.action === 'no_slot') {
        // 🔁 자리가 없으면: 다시 해 보기를 골랐으면 잠시 뒤 다시, 아니면 끝
        const tries = (s.tries || 0) + 1, every = Math.max(TEST ? 0 : RETRY_MIN, +s.retry || 0) * 60e3, until = s.retry_until ? Date.parse(s.retry_until) : 0;
        const next = Date.now() + every;
        if (s.retry && next < until && tries < RETRY_MAX) {
          await log(t, `🔁 자리가 없어요(${a.why || ''}) · ${hm(next)}에 다시 볼게요 (${tries}번째)`, { status: 'queued', spec: { ...s, at: null, next: new Date(next).toISOString(), tries } });
          if (tries === 1) await B.notify('🔁 아직 자리가 없어요', `${t.title}\n${Math.max(RETRY_MIN, +s.retry)}분마다 다시 볼게요(${RETRY_MAX}번까지)`);
        } else {
          await log(t, `😢 원하는 시간에 자리가 없어요 · ${a.why || ''}`, { status: 'failed', result: { ok: false, summary: '빈자리 없음: ' + (a.why || ''), url: page.url() } });
          await B.notify('😢 자리가 없어요', `${t.title}\n${a.why || ''}`);
        }
        await page.close().catch(() => {});
        return;
      }
      if (a.action === 'fail') { await log(t, '❌ ' + (a.why || '더 할 수 없어요'), { status: 'failed' }); await B.notify('❌ 못 했어요', `${t.title}\n${a.why || ''}`); return; }
      if (a.action === 'need_person') {
        const ok = await permission(t, a.why || '', `👤 사람이 할 일: ${a.why || ''} (PC의 일꾼 창에서 하고 [허락]을 눌러 주세요)`, img);
        if (!ok) { await log(t, '🚫 멈췄어요', { status: 'stopped' }); return; }
        hist.push(`${step}. 사람이 직접 처리함: ${a.why}`); continue;
      }
      if (['click', 'type', 'select', 'press_enter'].includes(a.action) && !el && a.action !== 'press_enter') { hist.push(`${step}. ${a.n}번이 목록에 없어서 다시 봄`); continue; }
      if (mustAsk(s, a, el, full)) {
        const ok = await permission(t, a.why || '', `「${el?.text || 'Enter'}」 누르기 — ${a.why || '되돌리기 어려운 버튼이에요'}${a.pay || ALWAYS_ASK.test(el?.text || '') || MONEY_PAGE.test(full) ? ' 💳 돈이 드는 단계예요' : ''}`, img);
        if (!ok) { await log(t, '🚫 허락하지 않아서 멈췄어요', { status: 'stopped' }); return; }
      } else if (s.auto && a.action === 'click' && (a.risky || RISKY.test(el?.text || ''))) {
        await log(t, `🤖 끝까지 자동: 「${el?.text || ''}」 눌러요 (돈이 안 드는 예약)`);
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
      await sleep(1500 + Math.floor(Math.random() * 1500)); // 사람처럼 천천히
    }
    await log(t, '⏹️ 30단계 안에 끝내지 못했어요', { status: 'failed' });
  } catch (e) { await log(t, '⚠️ ' + e.message.split('\n')[0], { status: 'failed' }); }
}

/* ============ 🚌 고속버스 빈자리 알림 (v0.8) ============
   kobus.co.kr에서 정한 간격마다 배차 조회를 한 번 해서, 원하는 시간대에 남은 자리가 생기면 폰으로 알려 줘요.
   알려 주기만 하고 예매는 사람이 해요. AI를 쓰지 않아요(버스 취소표 알리미와 같은 방법). */
const KOBUS = TEST?.kobus || 'https://www.kobus.co.kr/main.do';
async function busRoutes(page) {
  return page.evaluate(async () => {
    const res = await fetch('/mrs/readRotLinInf.ajax', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: '' });
    const d = JSON.parse(await res.text());
    return (d.rotInfList || []).filter(r => r.deprCd && r.arvlCd).map(r => ({ d: r.deprCd, dn: r.deprNm, a: r.arvlCd, an: r.arvlNm }));
  });
}
// "서울"처럼 말해도 맞는 터미널 짝을 찾아요(딱 맞는 이름 → 그 말로 시작 → 그 말이 들어간 것, 최대 4쌍)
function busPairs(list, dep, arr) {
  const norm = s => String(s || '').replace(/\s|터미널|고속|버스/g, '');
  const D = norm(dep), A = norm(arr);
  const score = (name, q) => { const n = norm(name); return n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0; };
  const ps = list.map(r => ({ ...r, s: Math.min(score(r.dn, D), score(r.an, A)) })).filter(r => r.s > 0);
  const best = Math.max(0, ...ps.map(r => r.s));
  return ps.filter(r => r.s === best).slice(0, 4);
}
async function busCheck(page, p, ymd) {
  return page.evaluate(async ({ p, ymd }) => {
    const f = new URLSearchParams({ deprCd: p.d, deprNm: p.dn, arvlCd: p.a, arvlNm: p.an, tfrCd: '', tfrNm: '', tfrArvlFullNm: '', pathDvs: 'sngl', pathStep: '1', deprDtm: ymd, arvlDtm: ymd, busClsCd: '0', rtrpChc: '1', timeLinkMin: '00', timeLinkMax: '23' });
    const res = await fetch('/mrs/alcnSrch.do', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: f.toString() });
    if (!res.ok) throw new Error('사이트 응답 ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const dep = doc.querySelector('input[name=deprCd]');
    if (!dep || dep.value !== p.d) throw new Error('배차 조회 화면이 아닌 다른 화면이 왔어요');
    const t = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    const rows = [];
    for (const st of doc.querySelectorAll('.bus_time .start_time, .start_time')) {
      if (st.closest('.bustime_head')) continue;
      const row = st.closest('a') || st.closest('p') || st.parentElement;
      const time = t(st).replace(/\s/g, '');
      if (!/^\d{2}:\d{2}$/.test(time) || rows.some(r => r.time === time && r.el === row)) continue;
      const m = /(\d+)\s*석/.exec(t(row.querySelector('.remain')));
      rows.push({ time, grade: (t(row.querySelector('.grade')) || t(row.querySelector('.grade_mo'))).split(' ')[0], remain: m ? +m[1] : 0, el: null });
    }
    return rows.map(({ el, ...r }) => r);
  }, { p, ymd });
}
async function runBus(t) {
  const s = t.spec || {}, b = s.bus || {};
  const ymd = String(b.date || '').replace(/-/g, ''), need = Math.max(1, +b.n || 1);
  const every = Math.max(TEST ? 1 / 60 : 2, +s.every || 5) * 60e3; // 🛡️ 2분보다 자주 안 봐요
  const until = Math.min(Date.parse((b.date || '') + 'T' + (b.to || '23:59') + ':00+09:00') || Infinity, Date.now() + Math.min(72, +s.hours || 24) * 3600e3);
  if (!/^\d{8}$/.test(ymd) || !b.dep || !b.arr) { await B.update(t.id, { status: 'failed', step: '출발·도착·날짜가 필요해요' }); return; }
  await B.update(t.id, { status: 'running' });
  const page = await (await browser()).newPage();
  try {
    await page.goto(KOBUS, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const pairs = busPairs(await busRoutes(page), b.dep, b.arr);
    if (!pairs.length) { await log(t, `❌ "${b.dep}→${b.arr}" 고속버스 노선을 못 찾았어요(시외버스는 아직 안 돼요)`, { status: 'failed' }); await page.close().catch(() => {}); return; }
    await log(t, `🚌 ${pairs.map(p => `${p.dn}→${p.an}`).join(', ')} · ${b.from || '첫차'}~${b.to || '막차'} · ${need}석 이상 · ${Math.round(every / 60e3) || 1}분마다 볼게요`);
    let n = 0, fails = 0;
    while (Date.now() < until) {
      if (await stopped(t)) { await page.close().catch(() => {}); return; }
      n++;
      const hits = [];
      try {
        for (const p of pairs) {
          for (const r of await busCheck(page, p, ymd)) if ((!b.from || r.time >= b.from) && (!b.to || r.time <= b.to) && r.remain >= need) hits.push({ ...r, route: `${p.dn}→${p.an}` });
          await sleep(1500);
        }
        fails = 0;
      } catch (e) {
        if (++fails >= 5) { await log(t, '⚠️ 사이트 조회가 계속 안 돼요: ' + e.message, { status: 'failed' }); await B.notify('⚠️ 버스 빈자리 알림이 멈췄어요', t.title); return; }
        await page.goto(KOBUS, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); // 세션이 끊겼으면 다시 들어가요
      }
      if (hits.length) {
        hits.sort((x, y) => x.time.localeCompare(y.time));
        const msg = hits.slice(0, 4).map(h => `${h.time} ${h.grade} ${h.remain}석`).join(', ');
        await log(t, `🔔 빈자리! ${msg} (${n}번째 확인)`, { status: 'done', result: { ok: true, summary: `${hits[0].route} ${msg}`, url: 'https://www.kobus.co.kr/mrs/rotinf.do' } });
        await B.notify('🚌 버스 빈자리가 났어요!', `${t.title}\n${msg}\n얼른 예매하세요 (티머니GO·kobus)`);
        await page.close().catch(() => {});
        return;
      }
      if (n === 1 || n % 6 === 0) await log(t, `👀 ${n}번째 확인 · 아직 빈자리가 없어요`);
      await sleep(every);
    }
    await log(t, '⏰ 출발 시간이 지나서 그만 볼게요', { status: 'failed' });
    await page.close().catch(() => {});
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
  const myF = path.join(COOL_DIR, 'my.json'); // (v0.9) 직접 넣은 항목: 쿨메신저 비서 창 ➕(my-…)·AI 비서 앱(app-…)
  const items = readJ(itemsF, null), doneArr = readJ(doneF, []), mine = fs.existsSync(myF) ? readJ(myF, null) : [];
  if (!Array.isArray(items) || !Array.isArray(doneArr) || !Array.isArray(mine)) return; // 쓰는 중일 수 있어요 → 다음 번에
  const pc = new Set(doneArr.map(String));
  const st = readJ(COOL_STATE, { base: {}, sig: {} }); st.pulled ||= {};
  const srv = new Map((await B.coolAll()).map(r => [r.id, r]));
  const rowOf = it => ({
    id: String(it?.id || ''), kind: COOL_KINDS.includes(it.kind) ? it.kind : 'todo', text: String(it.text || '').slice(0, 500),
    due: /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : '', time: /^\d{2}:\d{2}$/.test(it.time || '') ? it.time : '',
    sender: String(it.sender || '').slice(0, 60), recv: String(it.recv || '').slice(0, 20), fav: !!it.fav
  });
  // 앱에서 넣은 것(app-…) → my.json에 더해 쿨메신저 비서 창에도 보이게. 창에서 지운 것(pulled인데 파일에 없음)은 아래에서 '사라짐'.
  // 앱에서 고친 직접 항목(PC 쪽은 그대로인데 서버 글이 다름) → my.json도 고쳐요.
  let myDirty = false, pulledN = 0;
  const inMine = new Map(mine.filter(x => x?.id).map(x => [String(x.id), x]));
  for (const [id, s] of srv) {
    if (s.gone || !/^app-/.test(id) || st.pulled[id] || inMine.has(id)) continue;
    const x = { id, msg: null, kind: s.kind, text: s.text, due: s.due || '', time: s.time || '', fav: false, sender: s.sender || '📱 AI 비서', recv: s.recv || '', added: new Date().toISOString() };
    mine.push(x); inMine.set(id, x); st.pulled[id] = true; myDirty = true; pulledN++;
  }
  for (const [id, x] of inMine) {
    const s = srv.get(id); if (!s || s.gone) continue;
    const r = rowOf(x), sv = rowOf(s);
    if (st.sig[id] === JSON.stringify(r) && (r.kind !== sv.kind || r.text !== sv.text || r.due !== sv.due || r.time !== sv.time)) {
      Object.assign(x, { kind: sv.kind, text: sv.text, due: sv.due, time: sv.time }); myDirty = true; pulledN++;
    }
    if (/^app-/.test(id)) st.pulled[id] = true;
  }
  if (myDirty) { const tmp = myF + '.aiw.tmp'; fs.writeFileSync(tmp, JSON.stringify(mine), 'utf8'); fs.renameSync(tmp, myF); }
  const up = [], gone = [], seen = new Set(), base = {};
  let fromApp = 0, fromPc = 0;
  for (const it of [...items, ...mine]) {
    if (!it) continue;
    const row = rowOf(it), id = row.id; if (!id || seen.has(id)) continue; seen.add(id);
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
  if (seen.size || srv.size < 5) for (const [id, s] of srv) if (!seen.has(id) && !s.gone) { gone.push(id); delete st.sig[id]; }
  if (fromApp) { // 앱에서 체크한 것 → done.json (쿨메신저 비서 창이 2초 안에 다시 읽어요)
    const tmp = doneF + '.aiw.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...pc]), 'utf8');
    fs.renameSync(tmp, doneF);
  }
  if (up.length) await B.coolUpsert(up);
  if (gone.length) await B.coolGone(gone);
  st.base = base;
  for (const id of Object.keys(st.pulled)) if (!srv.has(id)) delete st.pulled[id];
  fs.writeFileSync(COOL_STATE, JSON.stringify(st));
  if (up.length || gone.length || fromApp || pulledN) say(`📨 쿨메신저: 올림 ${up.length}개${gone.length ? ` · 사라짐 ${gone.length}` : ''}${fromPc ? ` (PC 체크 ${fromPc})` : ''}${fromApp ? ` · 앱 체크 ${fromApp}개를 쿨메신저 비서에 반영` : ''}${pulledN ? ` · 앱에서 넣은·고친 것 ${pulledN}개를 쿨메신저 비서 창에` : ''}`);
  return (coolInfo = { n: seen.size, at: new Date().toISOString() });
}

/* ============ ⏰ 반복 일 (v0.10) ============ */
// 앱에서 "매주 금요일 4시에 다음 주 일정 정리해 줘"라고 하면 settings.routines에 들어가요.
// 일꾼은 1분마다 보고, 정한 시각부터 2시간 안이고 오늘 아직 안 했으면(rt_last) 해요 → 대화에 남기고 폰 알림.
// 일꾼이 꺼져 있어서 못 했으면 앱이 열릴 때 대신 해요(앱 runDueRoutines).
const pad2 = n => String(n).padStart(2, '0');
const ymdL = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDaysL = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymdL(d); };
const WDK = ['일', '월', '화', '수', '목', '금', '토'];
async function geminiText(system, text) {
  if (TEST) { const r = TEST.gemini.shift(); if (!r) throw new Error('시험 AI 답이 떨어졌어요'); return typeof r === 'string' ? r : r.reply || ''; }
  for (const model of [cfg.model, 'gemini-2.5-flash-lite', 'gemini-flash-latest'].filter((m, i, a) => a.indexOf(m) === i)) {
    for (let tryN = 0; tryN < 2; tryN++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.gkey },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { temperature: 0.5 } })
      });
      if (res.status === 503 || res.status === 500) { await sleep(5000); continue; }
      if (res.status === 429) break; // 모델마다 한도가 따로라 다음 모델로
      if (!res.ok) throw new Error(`AI 오류 ${res.status}: ${(await res.text()).slice(0, 150)}`);
      const d = await res.json(), out = d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (out) return out.trim();
      throw new Error('AI가 답을 주지 않았어요');
    }
  }
  throw new Error('AI가 바쁘거나 오늘 무료 한도를 다 썼어요');
}
async function routinePrompt(me) {
  const d = new Date(), t = ymdL(d), c = await B.ctx(addDaysL(t, -1), addDaysL(t, 30));
  const inRange = x => x && x >= addDaysL(t, -1) && x <= addDaysL(t, 30);
  const evs = [];
  for (const i of c.items) if (i.kind === 'event' && inRange(i.data.date)) evs.push(`${i.data.date} ${i.data.time || '종일'} ${i.data.title}`);
  for (const e of c.g?.events || []) if (inRange(e.date)) evs.push(`${e.date} ${e.time || '종일'}${e.end ? '~' + e.end : ''} ${e.title} [${e.label || '구글'}]`);
  for (const p of c.phone) {
    const cals = new Map((p.calendars || []).map(x => [String(x.id), x]));
    for (const e of p.events || []) { const cl = cals.get(String(e.cal)); if (cl && cl.visible === false) continue; if (inRange(e.date)) evs.push(`${e.date} ${e.time || '종일'}${e.end ? '~' + e.end : ''} ${e.title || '(제목 없음)'} [폰]`); }
  }
  for (const x of c.cool) if (x.kind === 'note' && inRange(x.due)) evs.push(`${x.due} ${x.time || '종일'} ${x.text} [쿨메신저]`);
  const uniq = [...new Set(evs)].sort();
  const todos = c.items.filter(i => i.kind === 'todo' && !i.data.done && i.data.kind !== 'remember').map(i => `${i.data.title}${i.data.due ? ' ~' + i.data.due : ''}`);
  const coolT = c.cool.filter(x => x.kind === 'todo').map(x => `${x.text}${x.due ? ' ~' + x.due : ''}`);
  const memos = c.items.filter(i => i.kind === 'memo').map(i => i.data.text);
  const cal14 = Array.from({ length: 14 }, (_, i) => { const x = addDaysL(t, i); return `${x}(${WDK[new Date(x + 'T00:00').getDay()]})`; }).join(', ');
  return `너는 사용자의 개인 AI 비서야. 한국어로 쉽고 친절하게, 핵심부터 짧게 써. 마크다운(## 소제목, - 목록, **굵게**)을 써도 돼.
지금은 사용자가 정해 둔 "반복 일"을 정해진 시각에 저절로 하는 중이라 사용자에게 되물을 수 없어. 아래 자료만 보고 대답하고 없는 일정은 지어내지 마.
[지금] ${t} ${WDK[d.getDay()]}요일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}
[달력] ${cal14}
[내 정보] ${me || '(없음)'}
[기억] ${memos.join(' / ') || '(없음)'}
[일정] ${uniq.join(' / ') || '(없음)'}
[할 일] ${todos.join(' / ') || '(없음)'}
[쿨메신저 할 일] ${coolT.join(' / ') || '(없음)'}
[최근 메일] ${(c.g?.mails || []).slice(0, 10).map(m => `${m.from}: ${m.subject}`).join(' / ') || '(없음)'}`;
}
let rtLastCheck = 0;
async function routineTick() {
  if (!TEST && Date.now() - rtLastCheck < 60000) return; rtLastCheck = Date.now();
  const prof = await B.profile(), st = prof.settings || {}, list = (st.routines || []).filter(r => r.on !== false);
  if (!list.length) return;
  const d = TEST?.now ? new Date(TEST.now) : new Date(), t = ymdL(d), nowM = d.getHours() * 60 + d.getMinutes();
  for (const r of list) {
    if (!(r.days || []).includes(d.getDay()) || !/^\d{2}:\d{2}$/.test(r.time || '')) continue;
    const at = +r.time.slice(0, 2) * 60 + +r.time.slice(3);
    if (nowM < at || nowM > at + 120 || (st.rt_last || {})[r.id] === t) continue;
    if (!cfg.gkey) { say('⚠️ Gemini 키가 없어서 반복 일을 못 해요:', r.title); continue; }
    if (!(await B.markRt(r.id, t))) continue; // 앱이나 다른 PC가 벌써 했어요
    say('⏰ 반복 일:', r.title);
    try {
      const out = await geminiText(await routinePrompt(prof.me), `[⏰ 반복 일 "${r.title}"]\n${r.text}`);
      await B.addChat(`⏰ **${r.title}** (${r.time})\n\n${out}`);
      await B.notify('⏰ ' + r.title, out.replace(/[#*`>|]/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 280), 'ai-routine');
    } catch (e) { say('⚠️ 반복 일 실패:', r.title, e.message); await B.notify('⚠️ 반복 일을 못 했어요', `${r.title}\n${e.message}`, 'ai-routine'); }
  }
}

/* ============ 시작 ============ */
(async () => {
  console.log(HIDDEN ? `🖥️ AI 비서 PC 일꾼 v${VERSION} — 숨어서 켜졌어요` : `🖥️ AI 비서 PC 일꾼 v${VERSION}\n   이 검은 창을 닫으면 일꾼도 꺼져요. 일꾼이 여는 브라우저 창은 닫지 말고 그대로 두세요.`);
  if (!TEST) {
    const other = takeLock();
    if (other) {
      if (HIDDEN) process.exit(4);
      console.log(`\n✅ 일꾼이 이미 켜져 있어요${other.hidden ? '(작업 표시줄에 안 보이게 숨어서 도는 중)' : '(다른 검은 창)'}. 이 창은 닫아도 돼요.\n   숨어서 도는 일꾼을 끄려면 '자동켜기-끄기.bat'을 더블클릭하세요.`);
      await ask('Enter를 누르면 닫혀요'); process.exit(4);
    }
    setInterval(touchLock, 30000);
    await login();
  }
  // 일꾼이 꺼져 있는 동안 "하는 중"이던 일 정리: 지켜보기는 다시 시작, 대신 하기는 멈춤 표시
  for (const t of await B.tasks(['running', 'need_ok'])) {
    if (t.spec?.by && t.spec.by !== cfg.name) continue; // 다른 PC 일꾼이 하는 일은 건드리지 않아요
    if (t.kind === 'watch' || (t.spec?.at && Date.parse(t.spec.at) > Date.now() + 60e3)) await B.update(t.id, { status: 'queued' }); // 정각 예약을 기다리던 것도 다시
    else await B.update(t.id, { status: 'failed', step: '일꾼이 다시 켜져서 멈췄어요. 다시 맡겨 주세요' });
  }
  if (!TEST && !HIDDEN) await browser(); // 숨어서 켤 때는 맡긴 일이 올 때만 브라우저 창을 열어요
  say('✅ 준비됐어요. 앱에서 일을 맡겨 주세요.');
  if (!TEST && !HIDDEN && !fs.existsSync(path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AI 비서 PC 일꾼.lnk')))
    say("💡 PC를 켤 때 일꾼이 창 없이 저절로 켜지게 하려면, 이 창을 닫고 'PC-켤때-자동켜기.bat'을 더블클릭하세요.");
  let doBusy = false, lastBeat = 0, lastCool = 0;
  if (fs.existsSync(path.join(COOL_DIR, 'items.json'))) say('📨 쿨메신저 비서를 찾았어요. 정리된 항목을 앱과 맞출게요(쪽지 원문은 안 올려요).');
  for (let loops = 0; ; loops++) {
    try {
      if (Date.now() - lastCool > (TEST ? 0 : 20000)) { lastCool = Date.now(); await coolSync().catch(e => say('⚠️ 쿨메신저 맞추기 실패:', e.message)); }
      if (Date.now() - lastBeat > 30000) { lastBeat = Date.now(); await B.beat({ v: VERSION, running: running.size, cool: coolInfo }); }
      await routineTick().catch(e => say('⚠️ 반복 일 확인 실패:', e.message));
      for (const t of await B.tasks(['queued'])) {
        if (running.has(t.id)) continue;
        // ⏰ 정각 예약은 10분 전에 창을 열고, 🔁 다시 해 보기는 정한 시각이 되면 시작해요
        const at = t.spec?.at ? Date.parse(t.spec.at) : 0, nx = t.spec?.next ? Date.parse(t.spec.next) : 0;
        if (at && Date.now() < at - (TEST ? 10e3 : 600e3)) { if (t.step?.indexOf('⏰') !== 0) await B.update(t.id, { step: `⏰ ${hm(at)}에 예약을 시작해요 (10분 전에 창을 열어요)` }); t.step = '⏰'; continue; }
        if (nx && Date.now() < nx) continue;
        if (t.kind === 'do' && doBusy) continue; // 대신 하기는 한 번에 하나씩
        if (!(await B.claim(t))) continue; // 다른 PC 일꾼이 먼저 가져갔어요
        t.spec = { ...(t.spec || {}), by: cfg.name };
        running.set(t.id, t.kind); say(t.kind === 'watch' ? '👀 지켜보기 시작:' : '🖱️ 대신 하기 시작:', t.title);
        if (t.kind === 'do') doBusy = true;
        (t.kind === 'watch' ? runWatch(t) : runDo(t)).finally(() => { running.delete(t.id); if (t.kind === 'do') doBusy = false; say('끝:', t.title); });
      }
    } catch (e) { say('⚠️', e.message); }
    if (TEST && !running.size && !(await B.tasks(['queued'])).length) break;
    await sleep(3000);
  }
  if (TEST) { fs.writeFileSync(process.env.AIW_TEST + '.out.json', JSON.stringify({ rows: B.rows, cool: B.cool, notified: TEST.notified || [], chat: TEST.chat || [], rt_last: TEST.profile?.settings?.rt_last || {} }, null, 1)); if (ctx) await ctx.close(); process.exit(0); }
})().catch(e => { console.error('\n❌', e.message); if (!TEST && !HIDDEN) ask('Enter를 누르면 닫혀요').then(() => process.exit(1)); else process.exit(1); });
