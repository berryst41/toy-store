// 방탈출 예약 도우미 (키이스케이프·판타스트릭·제로월드·비트포비아 던전 등)
// - 서버 시계: 사이트 응답의 Date 머리글로 내 컴퓨터와 서버의 시간 차이를 잽니다.
// - 정시 새로고침: 정해 둔 서버 시각이 되면 이 탭을 딱 한 번 새로고침합니다.
// - 내 정보 채우기: 이름·전화번호·인원 칸을 찾아 채웁니다. 예약(신청) 버튼은 누르지 않습니다.
(() => {
  if (window.top !== window || window.__keHelper) return;
  window.__keHelper = true;

  // 사이트별 설정
  // - branches: [지점 이름(화면 글자), 예약 여는 시각] (각 사이트 예약 안내에 적힌 시각)
  // - page: 고르기를 시작할 예약 화면 주소
  const SITES = [
    {
      id: 'keyescape', host: /(^|\.)keyescape\.(com|co\.kr)$/, name: '키이스케이프', page: /reserv/i,
      branches: [
        ['강남점', '18:00:00'], ['홍대점', '20:00:00'], ['부산점', '18:00:00'], ['전주점', '18:00:00'],
        ['더오름점', '10:00:00'], ['우주라이크점', '10:00:00'], ['LOG_IN 1', '10:00:00'], ['LOG_IN 2', '10:00:00'],
        ['메모리컴퍼니', '10:30:00'], ['후즈데어', '11:00:00'], ['STATION', '11:30:00'], ['무비무드', '13:30:00'],
        ['백산방역', '09:30:00'], ['에버랜드', ''],
      ],
    },
    // 지점 고르기 없이 테마 카드를 누르는 화면. 일주일 뒤 날짜가 저녁 9시에 열립니다.
    { id: 'fantastrick', host: /(^|\.)fantastrick\.co\.kr$/, name: '판타스트릭', page: /^\/reserve\/?$/, branches: [], openAt: '21:00:00' },
    // 이름·전화번호 칸에 붙여넣기를 막아 두고 그림 글자(자동등록방지)도 있는 사이트라 내 정보는 직접 적습니다.
    {
      id: 'zeroworld', host: /(^|\.)zeroworldkorea\.com$/, name: '제로월드', page: /go=rev\.make/,
      branches: [['김포본점', ''], ['강남점', ''], ['홍대점', ''], ['다이브 건대점', '']],
      noFill: '제로월드는 이름·전화번호를 직접 적도록 막아 두었어요. 이름 칸에 커서를 놓아 두었으니 바로 적어 주세요. 그림 글자도 직접 적어 주세요.',
    },
    // 지점·날짜는 주소로 바뀌고, 테마마다 시간 목록이 붙어 있는 화면 (매일 일주일 치 오픈)
    {
      id: 'xdungeon', host: /(^|\.)xdungeon\.net$/, name: '비트포비아 던전', page: /go=rev\.(main|make)/, viaUrl: true,
      branches: [
        ['홍대던전', '13:00:00'], ['던전101', '14:00:00'], ['홍대던전Ⅲ', '15:00:00'], ['강남던전', '16:00:00'],
        ['강남던전Ⅱ', '17:00:00'], ['던전루나', '18:00:00'], ['던전스텔라', '19:00:00'], ['서면던전', '20:00:00'],
        ['서면던전 레드', '21:00:00'],
      ],
    },
    // 아래 두 곳은 제로월드와 같은 예약 화면(home.php?go=rev.make)을 씁니다. 지점이 여럿이면 그 지점 예약 화면을 열어 두세요.
    { id: 'doloescape', host: /(^|\.)doloescape\.co\.kr$/, name: 'doloescape', page: /go=rev\.make/, branches: [] },
    { id: 'thefrank', host: /(^|\.)thefrank\.co\.kr$/, name: 'thefrank', page: /go=rev\.make/, branches: [] },
    // 화면을 직접 확인하지 못한 사이트: 테마·날짜·시간 찾기를 일반 방식으로 해 봅니다
    { id: 'dpsnnn', host: /(^|\.)dpsnnn\.com$/, name: 'dpsnnn', page: /^\/reserve/, branches: [] },
  ];
  const SITE = SITES.find((s) => s.host.test(location.hostname)) || { id: 'other', name: location.hostname, branches: [], basic: true };
  const BRANCHES = SITE.branches;
  // 키이스케이프는 예전 저장 이름을 그대로 씁니다
  const KEY = (k) => (SITE.id === 'keyescape' ? k : `${k}_${SITE.id}`);
  const isReservePage = () => !!SITE.page && SITE.page.test(location.pathname + location.search);
  const KST = 9 * 3600 * 1000;
  const store = chrome.storage.local;
  const get = (k) => new Promise((r) => store.get(k, (v) => r(v[k])));
  const set = (o) => new Promise((r) => store.set(o, r));

  // ---------- 서버 시계 ----------
  let offset = 0; // 서버 시간 - 내 컴퓨터 시간 (ms)
  let accuracy = null; // ± ms
  let synced = false;

  async function sample() {
    const url = location.origin + '/?_ke=' + Date.now() + Math.random().toString(36).slice(2, 6);
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    } catch (e) {
      res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    }
    const t1 = Date.now();
    const d = Date.parse(res.headers.get('date'));
    if (isNaN(d)) throw new Error('서버 시간을 읽지 못했어요');
    // Date 머리글은 초 단위라 서버 시각은 [d, d+1000) 사이, 내 시각은 [t0, t1] 사이
    return { lo: d - t1, hi: d + 1000 - t0, mid: d + 500 - (t0 + t1) / 2 };
  }

  // 요청 8번을 0.137초 간격으로 보내 초가 바뀌는 순간을 좁혀 갑니다. (한 번 맞출 때 약 1초, 요청 8번)
  async function syncClock() {
    const samples = [];
    for (let i = 0; i < 8; i++) {
      samples.push(await sample());
      await new Promise((r) => setTimeout(r, 137));
    }
    const lo = Math.max(...samples.map((s) => s.lo));
    const hi = Math.min(...samples.map((s) => s.hi));
    if (lo <= hi) {
      offset = (lo + hi) / 2;
      accuracy = Math.max(1, Math.round((hi - lo) / 2));
    } else {
      const mids = samples.map((s) => s.mid).sort((a, b) => a - b);
      offset = mids[Math.floor(mids.length / 2)];
      accuracy = 500;
    }
    synced = true;
  }
  const serverNow = () => Date.now() + offset;

  // 서버 시각 기준 "오늘 HH:MM:SS" (한국 시간)
  function targetEpoch(hms) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hms.trim());
    if (!m) return null;
    const k = new Date(serverNow() + KST);
    return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), +m[1], +m[2], +(m[3] || 0)) - KST;
  }
  const fmt = (t, ms) => {
    const k = new Date(t + KST);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}` + (ms ? '.' + p(Math.floor(k.getUTCMilliseconds() / 100), 1) : '');
  };

  // ---------- 화면 ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  .box{font:14px/1.45 "Malgun Gothic",sans-serif;color:#222;background:#fff;border:2px solid #ff6f61;border-radius:14px;
       box-shadow:0 6px 20px rgba(0,0,0,.18);width:290px;overflow:hidden}
  .hd{background:#ff6f61;color:#fff;padding:8px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
  .bd{padding:10px 12px}
  .min .bd{display:none}
  .clock{font:700 28px/1.1 Consolas,monospace;text-align:center;letter-spacing:1px}
  .sub{font-size:12px;color:#777;text-align:center;margin-bottom:8px}
  h4{margin:10px 0 4px;font-size:13px;color:#ff6f61}
  label{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:13px}
  label>span{width:74px;flex:none;white-space:nowrap}
  input[type=text],input[type=tel],input[type=number],input[type=password],select{flex:1;min-width:0;padding:5px 6px;border:1px solid #ccc;border-radius:6px;font:inherit}
  button{width:100%;margin-top:6px;padding:8px;border:0;border-radius:8px;background:#ff6f61;color:#fff;font:700 14px "Malgun Gothic",sans-serif;cursor:pointer}
  button.gray{background:#888}
  button.big{background:#2f9e44;font-size:16px}
  .msg{margin-top:6px;font-size:12.5px;color:#444;white-space:pre-line}
  .basic .pk{display:none}
  .armed{background:#fff4d6;border-radius:8px;padding:6px;text-align:center;font-weight:700}
</style>
<div class="box${SITE.basic ? ' basic' : ''}">
  <div class="hd" id="hd"><span>🔑 예약 도우미 · ${SITE.name}</span><span id="tg">－</span></div>
  <div class="bd">
    <div class="clock" id="clock">--:--:--.-</div>
    <div class="sub" id="acc">서버 시간 맞추는 중…</div>

    <h4>① 정시 새로고침</h4>
    <label${BRANCHES.length ? '' : ' style="display:none"'}><span>지점</span><select id="br"><option value="">고르기</option>${BRANCHES.map(([n, v]) => `<option value="${n}">${n}${v ? ' ' + v.slice(0, 5) : ''}</option>`).join('')}</select></label>
    <label class="pk"><span>테마(선택)</span><input type="text" id="th" placeholder="테마 이름 (안 적어도 돼요)"></label>
    <label class="pk"><span>날짜(선택)</span><input type="text" id="dt" placeholder="예: 10/31"></label>
    <label class="pk"><span>시간(선택)</span><input type="text" id="tm" placeholder="예: 14:30"></label>
    <label class="pk"><input type="checkbox" id="pick"> 이 지점·테마·날짜·시간 저절로 고르기</label>
    <label><span>열리는 시각</span><input type="text" id="at" placeholder="10:00:00"></label>
    <label><span>여유(초)</span><input type="number" id="lag" step="0.1" min="0" max="5" value="0.3"></label>
    <div id="armbox"></div>
    <button id="arm">이 시각에 새로고침 예약</button>

    <h4>② 내 정보</h4>
    <label><span>이름</span><input type="text" id="nm"></label>
    <label><span>전화번호</span><input type="tel" id="ph" placeholder="010-1234-5678"></label>
    <label><span>인원</span><input type="number" id="pp" min="1" max="20"></label>
    <label><span>예약 비번</span><input type="password" id="pw" inputmode="numeric" maxlength="8" placeholder="예약 비밀번호 (묻는 사이트만)"></label>
    <label><input type="checkbox" id="auto"> 입력칸이 나타나면 자동으로 채우기</label>
    <label><input type="checkbox" id="agree"> 필수 동의 칸도 체크하기 (마케팅 동의는 빼고)</label>
    <button class="big" id="fill">내 정보 채우기</button>
    <div class="msg" id="msg">예약 신청 버튼은 직접 눌러 주세요.</div>
  </div>
</div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => root.getElementById(id);
  const say = (t) => ($('msg').textContent = t);

  $('hd').onclick = () => {
    const box = root.querySelector('.box');
    box.classList.toggle('min');
    $('tg').textContent = box.classList.contains('min') ? '＋' : '－';
  };
  $('br').onchange = () => {
    const b = BRANCHES.find(([n]) => n === $('br').value);
    if (b && b[1]) $('at').value = b[1];
    savePick();
  };
  const savePick = () => set({ [KEY('pick')]: { branch: $('br').value, theme: $('th').value.trim(), date: $('dt').value.trim(), time: $('tm').value.trim(), on: $('pick').checked } });
  ['th', 'dt', 'tm'].forEach((id) => $(id).addEventListener('change', savePick));
  $('pick').onchange = () => { savePick(); if ($('pick').checked) autoPick(); };

  // 저장해 둔 정보 불러오기
  (async () => {
    const me = (await get('me')) || {};
    $('nm').value = me.name || '';
    $('ph').value = me.phone || '';
    $('pp').value = me.people || '';
    $('pw').value = me.pin || '';
    $('auto').checked = !!me.auto;
    $('agree').checked = !!me.agree;
    const last = (await get(KEY('lastTime'))) || {};
    if (last.at) $('at').value = last.at;
    if (last.lag != null) $('lag').value = last.lag;
    const pick = (await get(KEY('pick'))) || {};
    $('br').value = pick.branch || '';
    $('th').value = pick.theme || '';
    $('dt').value = pick.date || '';
    $('tm').value = pick.time || '';
    $('pick').checked = !!pick.on;
    const b = BRANCHES.find(([n]) => n === pick.branch);
    if (!$('at').value && b && b[1]) $('at').value = b[1];
    if (!$('at').value && SITE.openAt) $('at').value = SITE.openAt;
    if (pick.on) autoPick();
    if (me.auto) watchForForm();
  })();
  const saveMe = () => set({ me: { name: $('nm').value.trim(), phone: $('ph').value.trim(), people: $('pp').value.trim(), pin: $('pw').value.trim(), auto: $('auto').checked, agree: $('agree').checked } });
  ['nm', 'ph', 'pp', 'pw'].forEach((id) => $(id).addEventListener('change', saveMe));
  $('agree').onchange = saveMe;
  $('auto').onchange = () => { saveMe(); if ($('auto').checked) watchForForm(); };

  // ---------- 정시 새로고침 ----------
  // 예약은 탭마다 따로 기억합니다(sessionStorage). 새로고침 후에는 저절로 풀려서 딱 한 번만 새로고침합니다.
  let timer = null;
  const ARM_KEY = '__keHelperArm';

  function showArmed(t) {
    $('armbox').innerHTML = t ? `<div class="armed">⏰ 서버 ${fmt(t, true)}에 새로고침합니다<br><small>이 탭을 앞에 띄워 두세요</small></div>` : '';
    $('arm').textContent = t ? '새로고침 예약 취소' : '이 시각에 새로고침 예약';
    $('arm').className = t ? 'gray' : '';
  }
  function disarm() {
    clearTimeout(timer);
    timer = null;
    sessionStorage.removeItem(ARM_KEY);
    showArmed(null);
  }
  function arm(fireAt) {
    sessionStorage.setItem(ARM_KEY, String(fireAt));
    showArmed(fireAt);
    let resynced = false;
    const tick = async () => {
      const left = fireAt - serverNow();
      if (left <= 0) {
        sessionStorage.setItem(ARM_KEY, 'done');
        location.reload();
        return;
      }
      // 20초 전에 한 번 더 시간을 맞춥니다
      if (!resynced && left < 20000 && left > 5000) {
        resynced = true;
        try { await syncClock(); } catch (e) {}
        return tick();
      }
      timer = setTimeout(tick, left > 2000 ? Math.min(left - 1500, 1000) : left > 50 ? left - 30 : 4);
    };
    tick();
  }
  $('arm').onclick = () => {
    if (timer) { disarm(); say('새로고침 예약을 취소했어요.'); return; }
    if (!synced) { say('서버 시간을 아직 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const t = targetEpoch($('at').value || '');
    if (t == null) { say('시각을 10:00:00 처럼 적어 주세요.'); return; }
    const lag = Math.min(5, Math.max(0, parseFloat($('lag').value) || 0));
    const fireAt = t + lag * 1000;
    if (fireAt <= serverNow()) { say('이미 지난 시각이에요. 시각을 다시 확인해 주세요.'); return; }
    set({ [KEY('lastTime')]: { at: $('at').value, lag } });
    arm(fireAt);
    say('예약했어요. 시간이 되면 이 탭을 한 번 새로고침합니다.');
  };

  // ---------- 내 정보 채우기 ----------
  const RX = {
    name: /이름|성명|예약자|성함|(^|[^a-z])(user_?)?name|nm\b/i,
    phone: /전화|휴대|연락처|핸드폰|phone|tel|mobile|\bhp\d?\b|hp_?\d|cell/i,
    people: /인원|명수|인원수|people|person|persons|headcount|count|cnt|num_?people|member/i,
    skip: /아이디|비밀번호|password|search|검색|이메일|email|입금자|zizum|theme|테마|지점|날짜|date|time|captcha|보안/i,
  };

  function labelText(el) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title];
    if (el.id) {
      const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.textContent);
    }
    const wrap = el.closest('label');
    if (wrap) parts.push(wrap.textContent);
    // 이름표(label)가 있으면 그걸 믿고, 없을 때만 바로 앞 칸의 글자를 봅니다 (옆 칸 "비밀번호"를 잘못 읽지 않게)
    const hasLabel = wrap || (el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    const cell = !hasLabel && el.closest('td,dd,li,div');
    if (cell) {
      const prev = cell.previousElementSibling;
      if (prev && prev.textContent.length < 30) parts.push(prev.textContent);
    }
    const row = el.closest('tr');
    if (row) { const th = row.querySelector('th'); if (th) parts.push(th.textContent); }
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }
  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

  function setValue(el, v) {
    if (el.tagName === 'SELECT') {
      const want = String(v);
      const opt = [...el.options].find((o) => o.value === want) ||
        [...el.options].find((o) => o.textContent.replace(/\D/g, '') === want.replace(/\D/g, '') && want.replace(/\D/g, '') !== '');
      if (!opt) return false;
      el.value = opt.value;
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function docs() {
    const out = [document];
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentDocument) out.push(f.contentDocument); } catch (e) {}
    }
    return out;
  }

  function fillAll(quiet) {
    const name = $('nm').value.trim();
    const phone = $('ph').value.replace(/[^\d]/g, '');
    const people = $('pp').value.trim();
    const pin = $('pw').value.trim();
    if (SITE.noFill) { if (!quiet) say(SITE.noFill); return 0; }
    if (!name && !phone && !people) { if (!quiet) say('먼저 ② 내 정보를 적어 주세요.'); return 0; }

    const found = { name: [], phone: [], people: [], pin: [] };
    for (const d of docs()) {
      for (const el of d.querySelectorAll('input,select,textarea')) {
        if (!visible(el) || el.disabled || el.readOnly) continue;
        const type = (el.type || '').toLowerCase();
        // 예약 비밀번호 칸(판타스트릭 등). 로그인·기존 비밀번호 칸은 건드리지 않습니다.
        if (type === 'password') {
          if (host.contains(el)) continue;
          const t = labelText(el);
          if (/비밀번호|비번|pin|password/i.test(t) && !/로그인|login|현재|기존|아이디/i.test(t)) found.pin.push(el);
          continue;
        }
        if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'image', 'file', 'password'].includes(type)) continue;
        if (host.contains(el)) continue;
        const t = labelText(el);
        if (RX.skip.test(t)) continue;
        if (RX.phone.test(t)) found.phone.push(el);
        else if (RX.people.test(t)) found.people.push(el);
        else if (RX.name.test(t)) found.name.push(el);
      }
    }

    const done = [];
    if (name && found.name.length) { found.name.forEach((el) => setValue(el, name)); done.push('이름'); }
    if (people && found.people.length && found.people.some((el) => setValue(el, people))) done.push('인원');
    if (pin && found.pin.length && found.pin.every((el) => setValue(el, pin))) done.push('예약 비밀번호');
    if (phone && found.phone.length) {
      const f = found.phone;
      const parts = phone.length === 11 ? [phone.slice(0, 3), phone.slice(3, 7), phone.slice(7)]
        : [phone.slice(0, 3), phone.slice(3, 6), phone.slice(6)];
      let ok;
      if (f.length === 1) {
        // "010-1234-5678"처럼 보여 주거나 13글자까지 받는 칸이면 - 를 넣습니다 ("-없이 입력"은 빼고)
        const dash = /\d\s*-\s*\d/.test(f[0].placeholder || '') || /-/.test(f[0].value || '') || f[0].maxLength === 13;
        ok = setValue(f[0], dash ? parts.join('-') : phone);
      } else if (f.length === 2) {
        ok = setValue(f[0], parts[1]) && setValue(f[1], parts[2]); // 앞자리(010)는 고정이거나 따로 있는 경우
      } else {
        ok = setValue(f[0], parts[0]) && setValue(f[1], parts[1]) && setValue(f[2], parts[2]);
      }
      if (ok) done.push('전화번호');
    }
    if (done.length && $('agree').checked && checkAgree()) done.push('필수 동의');
    if (!quiet || done.length) {
      say(done.length
        ? `${done.join(', ')}을(를) 채웠어요. 내용을 확인하고 예약 버튼은 직접 눌러 주세요.`
        : '채울 칸을 찾지 못했어요. 지점·테마·날짜·시간을 고른 뒤 입력칸이 보일 때 다시 눌러 주세요.');
    }
    return done.length;
  }
  $('fill').onclick = () => { saveMe(); fillAll(false); };

  // 필수 동의 칸(개인정보·결제 주의사항·이용약관)만 체크합니다. 마케팅·선택 동의는 건드리지 않습니다.
  // 체크칸 바로 옆 글자(다음 체크칸 전까지)를 읽습니다
  function checkText(el) {
    const lab = el.closest('label') || (el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (lab && lab.textContent.trim()) return lab.textContent.replace(/\s+/g, ' ');
    let t = '';
    for (let n = el.nextSibling; n && t.length < 60; n = n.nextSibling) {
      if (n.nodeType === 1 && (n.matches('input') || n.querySelector('input'))) break;
      t += ' ' + (n.textContent || '');
    }
    if (t.trim()) return t.replace(/\s+/g, ' ');
    // 체크칸만 감싼 label 옆에 글자가 따로 있는 화면: 체크칸이 하나뿐인 가장 가까운 상자의 앞부분 글자
    for (let a = el.parentElement, i = 0; a && i < 4; a = a.parentElement, i++) {
      if (a.querySelectorAll('input[type=checkbox]').length > 1) break;
      const txt = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt.slice(0, 60);
    }
    return '';
  }
  function checkAgree() {
    let all = null, any = false;
    for (const d of docs()) {
      for (const el of d.querySelectorAll('input[type=checkbox]')) {
        if (host.contains(el) || el.disabled) continue;
        const t = checkText(el);
        if (/전체\s*동의|모두\s*동의|전체\s*선택/.test(t)) { all = el; continue; }
        if (/마케팅|선택\)|\(선택|광고|수신/.test(t)) continue;
        if (/동의|개인정보|약관|주의사항|이용안내/.test(t)) {
          if (!el.checked) el.click();
          any = true;
        }
      }
    }
    if (!any && all && !all.checked) { all.click(); any = true; }
    return any;
  }

  // 입력칸이 새로 나타나면 한 번 채웁니다
  let watching = false;
  function watchForForm() {
    if (watching) return;
    watching = true;
    let filled = false, wait = null;
    const check = () => {
      if (!$('auto').checked) return;
      const n = fillAll(true);
      if (n && !filled) filled = true;
    };
    new MutationObserver(() => {
      clearTimeout(wait);
      wait = setTimeout(() => { if (!filled) check(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    // 입력칸이 바뀌면(다른 시간을 고르면) 다시 채울 수 있게
    document.addEventListener('click', () => { filled = false; }, true);
    check();
  }

  // ---------- 지점·테마 저절로 고르기 ----------
  // 화면에서 글자가 지점(테마) 이름과 같은 버튼·링크·목록을 찾아 한 번 누릅니다.
  const norm = (t) => (t || '').replace(/\s+/g, '').replace(/[_\-]/g, '').toLowerCase();
  // 목록 글자 끝의 "(강남)" 같은 괄호는 떼고 비교합니다
  const optName = (o) => norm(o.textContent.replace(/\([^)]*\)\s*$/, ''));
  function findOption(name, sels) {
    const want = norm(name), short = want.replace(/점$/, '');
    for (const sel of sels) {
      const o = [...sel.options].find((o) => optName(o) === want || optName(o) === short) ||
        [...sel.options].find((o) => short.length >= 2 && optName(o).startsWith(short));
      if (o) return { select: sel, option: o };
    }
    return null;
  }
  function findChoice(name) {
    const want = norm(name);
    const short = want.replace(/점$/, '');
    if (!want) return null;
    const so = findOption(name, [...document.querySelectorAll('select')].filter((sel) => !host.contains(sel) && visible(sel)));
    if (so) return so;
    let best = null;
    for (const el of document.querySelectorAll('a,button,li,label,td,span,div,p,img,[onclick]')) {
      if (host.contains(el) || !visible(el)) continue;
      const txt = norm(el.tagName === 'IMG' ? el.alt : el.innerText);
      if (!txt || txt.length > want.length + 8) continue;
      // "제로월드 - 강남점"처럼 사이트 이름이 앞에 붙은 것도 찾습니다
      if (txt === want || txt === short || txt.startsWith(want) || (short.length >= 2 && txt.startsWith(short)) || (want.length >= 3 && txt.endsWith(want))) {
        // 글자를 감싼 것 중 가장 작은(안쪽) 것을 고르고, 누를 수 있는 부모가 있으면 그것을 누릅니다
        if (!best || best.contains(el)) best = el;
      }
    }
    if (!best) return null;
    return { el: best.closest('a,button,label,li,[onclick]') || best };
  }
  function choose(c) {
    if (c.select) {
      c.select.value = c.option.value;
      c.select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      c.el.scrollIntoView({ block: 'center' });
      c.el.click();
    }
  }
  // 이름이 화면에 나타날 때까지 최대 15초 기다립니다
  function waitAndChoose(name, label) {
    return new Promise((resolve) => {
      const until = Date.now() + 15000;
      const loop = () => {
        const c = findChoice(name);
        if (c) { choose(c); resolve(true); return; }
        if (Date.now() > until) { say(`${label} "${name}"을(를) 화면에서 찾지 못했어요. 직접 골라 주세요.`); resolve(false); return; }
        setTimeout(loop, 100);
      };
      loop();
    });
  }
  // ---------- 날짜·시간 고르기 ----------
  const leafText = (el) => (el.innerText || '').replace(/\s+/g, '');
  const clickable = (el) => el.closest('a,button,label,li,td,[onclick]') || el;
  function waitFor(find, ms) {
    return new Promise((resolve) => {
      const until = Date.now() + ms;
      const loop = () => {
        const r = find();
        if (r) return resolve(r);
        if (Date.now() > until) return resolve(null);
        setTimeout(loop, 100);
      };
      loop();
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 화면이 잠깐(quiet) 조용해질 때까지 기다립니다. 날짜를 누르면 시간 목록을 두 번 그리는 사이트(제로월드)가 있어서요.
  function settle(quiet = 300, max = 2500) {
    return new Promise((resolve) => {
      let t = setTimeout(done, quiet);
      const mo = new MutationObserver((list) => {
        if (list.every((m) => host.contains(m.target))) return;
        clearTimeout(t);
        t = setTimeout(done, quiet);
      });
      const cap = setTimeout(done, max);
      function done() { mo.disconnect(); clearTimeout(t); clearTimeout(cap); resolve(); }
      mo.observe(document.body, { childList: true, subtree: true });
    });
  }
  function parseDate(t) {
    const m = /^(?:(\d{4})\D+)?(?:(\d{1,2})\D+)?(\d{1,2})\D*$/.exec(t.trim());
    if (!m) return null;
    const k = new Date(serverNow() + KST);
    return { year: m[1] ? +m[1] : k.getUTCFullYear(), month: m[2] ? +m[2] : k.getUTCMonth() + 1, day: +m[3] };
  }
  function parseTime(t) {
    const m = /(\d{1,2})\s*(?::|시)\s*(\d{2})?/.exec(t);
    return m ? { h: +m[1], m: +(m[2] || 0) } : null;
  }
  // 달력 위에 보이는 "2026년 10월"
  function shownMonth() {
    const m = /(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(document.body.innerText);
    return m ? { year: +m[1], month: +m[2] } : null;
  }
  function findNextMonth() {
    for (const el of document.querySelectorAll('a,button,span,div,img,i,[onclick]')) {
      if (host.contains(el) || !visible(el)) continue;
      const t = (el.tagName === 'IMG' ? el.alt : el.innerText || '').trim();
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('src') || '');
      if (/^(▶|►|>|›|〉|다음달|다음 달)$/.test(t) || (!t && /next|right/i.test(cls))) return clickable(el);
    }
    return null;
  }
  // 달력 칸만 봅니다: "2026년 10월" 글자를 함께 품은 가장 가까운 상자 안의 숫자
  const inCalendar = (el) => {
    for (let a = el.parentElement, i = 0; a && i < 8; a = a.parentElement, i++) {
      const t = a.innerText || '';
      if (/\d{4}\s*년\s*\d{1,2}\s*월/.test(t)) return t.length < 600;
    }
    return false;
  };
  function findDay(day) {
    const want = String(day);
    let best = null, fallback = null;
    for (const el of document.querySelectorAll('td,a,button,span,div,li,p')) {
      if (host.contains(el) || !visible(el)) continue;
      if (leafText(el) !== want) continue;
      if (inCalendar(el)) { if (!best || best.contains(el)) best = el; }
      else if (!fallback || fallback.contains(el)) fallback = el;
    }
    best = best || fallback;
    return best && clickable(best);
  }
  const BAD = /마감|완료|불가|매진|sold|close/i;
  function findTime(t, root = document) {
    const hm = `${t.h}:${String(t.m).padStart(2, '0')}`;
    const hm2 = `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
    const ko = `${t.h}시${t.m ? String(t.m).padStart(2, '0') + '분' : ''}`;
    let best = null;
    for (const el of root.querySelectorAll('a,button,li,label,td,span,div,p,[onclick]')) {
      if (host.contains(el) || !visible(el)) continue;
      const txt = leafText(el);
      if (!txt || txt.length > 30) continue;
      const hit = txt.startsWith(hm2) || txt.startsWith(hm) || txt.startsWith(ko) || txt.includes(' ' + hm) || new RegExp('(^|\\D)' + hm2 + '(\\D|$)').test(txt) || new RegExp('(^|\\D)' + hm + '(\\D|$)').test(txt);
      if (hit && (!best || best.contains(el))) best = el;
    }
    return best && clickable(best);
  }
  // 테마마다 시간 목록이 따로 붙어 있는 화면(비트포비아 던전)은 그 테마 상자 안에서 찾습니다
  function findTimeFor(t, theme) {
    const c = theme && findChoice(theme);
    const el = c && (c.el || c.select);
    for (let a = el && el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const hit = findTime(t, a);
      if (hit) return hit;
    }
    return findTime(t);
  }
  function findNext() {
    let best = null;
    for (const el of document.querySelectorAll('a,button,input[type=button],input[type=submit],div,span,[onclick]')) {
      if (host.contains(el) || !visible(el)) continue;
      const t = (el.tagName === 'INPUT' ? el.value : el.innerText || '').replace(/\s+/g, '').toLowerCase();
      if (t === 'next' || t === '다음' || t === '다음단계') { if (!best || best.contains(el)) best = el; }
    }
    return best && clickable(best);
  }
  const FLOW_KEY = '__keHelperFlow';
  async function pickDate(d) {
    // 달력을 원하는 달로 넘깁니다 (최대 3번)
    for (let i = 0; i < 3; i++) {
      const sm = await waitFor(shownMonth, 5000);
      if (!sm || (sm.year === d.year && sm.month === d.month)) break;
      if (sm.year * 12 + sm.month > d.year * 12 + d.month) break;
      const nx = findNextMonth();
      if (!nx) break;
      nx.click();
      await sleep(600);
    }
    const dayEl = await waitFor(() => findDay(d.day), 8000);
    if (!dayEl) { say(`달력에서 ${d.month}월 ${d.day}일을 찾지 못했어요. 직접 골라 주세요.`); return false; }
    // 아직 안 열렸거나 지난 날짜는 회색(disabled·locked)으로 그려집니다 (칸 자체나 바로 바깥 상자에 표시)
    const off = [dayEl, dayEl.parentElement].some((a) => a && (a.disabled || /disable|locked|\bpast\b|soldout|\boff\b/i.test(typeof a.className === 'string' ? a.className : '')));
    if (off) {
      say(`${d.month}월 ${d.day}일은 아직 예약이 열리지 않았거나 고를 수 없는 날이에요. 날짜를 확인해 주세요.`);
      return false;
    }
    dayEl.scrollIntoView({ block: 'center' });
    dayEl.click();
    return true;
  }
  async function pickTime(t, dayLabel, theme) {
    await settle();
    // 빈자리를 확인하는 동안 잠깐 회색(wait)으로 그리는 사이트(판타스트릭)는 확인이 끝날 때까지 기다립니다
    const tEl = await waitFor(() => {
      const el = SITE.viaUrl ? findTimeFor(t, theme) : findTime(t);
      return el && !/\bwait\b|loading/i.test(typeof el.className === 'string' ? el.className : '') ? el : null;
    }, 8000);
    const label = `${t.h}:${String(t.m).padStart(2, '0')}`;
    if (!tEl) { say(`${dayLabel}을 골랐는데 ${label} 시간을 찾지 못했어요. 직접 골라 주세요.`); return false; }
    // 시간 칸 둘레(바로 위 몇 단계)에 "마감" 같은 글자가 있으면 고르지 않습니다
    // 키이스케이프는 마감 시간을 글자 없이 "누를 수 없는 동그라미(disabled)"로만 보여 줍니다
    let closed = tEl.disabled || !!(tEl.querySelector && tEl.querySelector('input:disabled,button:disabled'));
    for (let a = tEl, i = 0; a && i < 4 && !closed; a = a.parentElement, i++) {
      const txt = a.innerText || '';
      if (txt.length > 40 || (txt.match(/\d{1,2}\s*(:|시)\s*\d{0,2}/g) || []).length > 1) break; // 다른 시간 칸까지 품으면 멈춤
      closed = BAD.test(a.innerText || '') || /disable|soldout|\bclose|\boff\b|\bdead\b|\bfull\b/i.test(typeof a.className === 'string' ? a.className : '');
    }
    if (closed) {
      say(`${dayLabel} ${label}은(는) 이미 마감인 것 같아요. 다른 시간을 직접 골라 주세요.`);
      return false;
    }
    // 시간을 누르면 새 화면으로 넘어가는 사이트도 있어서, 누르기 전에 "다음 화면에서 채우기"를 적어 둡니다
    sessionStorage.setItem(FLOW_KEY, String(Date.now()));
    tEl.scrollIntoView({ block: 'center' });
    tEl.click();
    await sleep(300);
    // 누른 뒤에 시간 목록이 새로 그려졌으면(누른 게 사라졌으면) 한 번 더 찾아 누릅니다
    if (!document.contains(tEl)) {
      await settle();
      const again = SITE.viaUrl ? findTimeFor(t, theme) : findTime(t);
      if (again) { again.click(); await sleep(300); }
    }
    if (SITE.noFill) {
      sessionStorage.removeItem(FLOW_KEY);
      // 바로 타자를 칠 수 있게 이름 칸에 글자 막대(커서)를 놓아 둡니다
      const nameBox = [...document.querySelectorAll('input[type=text],input:not([type])')].find((el) =>
        visible(el) && !el.disabled && !el.readOnly && RX.name.test(labelText(el)) && !RX.skip.test(labelText(el)));
      if (nameBox) { nameBox.scrollIntoView({ block: 'center' }); nameBox.focus(); }
      say(`${dayLabel} ${label}을 골랐어요. ${SITE.noFill}`);
      return false;
    }
    // NEXT 버튼이 있으면 누르고, 입력칸이 같은 화면에 있으면 바로 채웁니다
    const r = await waitFor(() => findNext() || (fillAll(true) ? 'filled' : null), 5000);
    if (r === 'filled') {
      sessionStorage.removeItem(FLOW_KEY);
      say(`${dayLabel} ${label}을 고르고 내 정보를 채웠어요! 내용을 확인하고 예약 버튼은 직접 눌러 주세요.`);
      return false;
    }
    if (!r) {
      sessionStorage.removeItem(FLOW_KEY);
      say(`${dayLabel} ${label}을 골랐어요. 다음 단계 버튼(NEXT 등)이 있으면 직접 눌러 주세요.`);
      return false;
    }
    sessionStorage.setItem(FLOW_KEY, String(Date.now()));
    r.click();
    say(`${dayLabel} ${label}을 고르고 NEXT를 눌렀어요. 내 정보를 채우는 중…`);
    return true;
  }
  async function pickDateTime() {
    const d = parseDate($('dt').value || '');
    const t = parseTime($('tm').value || '');
    if (!d) return true;
    if (!(await pickDate(d))) return false;
    if (!t) { say(`${d.month}월 ${d.day}일을 골랐어요. 시간을 골라 주세요.`); return false; }
    return pickTime(t, `${d.month}월 ${d.day}일`);
  }
  // 지점·날짜를 주소로 바꾸는 사이트(비트포비아 던전): 주소가 다르면 한 번 옮겨 갑니다
  function gotoBranchDate(branch, d) {
    const u = new URL(location.href);
    if (u.searchParams.get('go') !== 'rev.main') return false;
    const sel = document.querySelector('select[name=s_zizum]');
    const so = branch && sel && findOption(branch, [sel]);
    if (branch && !so) { say(`지점 "${branch}"을(를) 목록에서 찾지 못했어요. 직접 골라 주세요.`); return null; }
    const pad = (n) => String(n).padStart(2, '0');
    const want = { s_zizum: so ? so.option.value : u.searchParams.get('s_zizum') || (sel && sel.value) || '', rev_days: d ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : u.searchParams.get('rev_days') || '' };
    if (Object.entries(want).every(([k, v]) => !v || u.searchParams.get(k) === v)) return false;
    Object.entries(want).forEach(([k, v]) => v && u.searchParams.set(k, v));
    location.href = u.toString();
    return true;
  }
  async function autoPickViaUrl(branch, theme, step, mark) {
    const d = parseDate($('dt').value || '');
    const t = parseTime($('tm').value || '');
    if (!(step.n >= 1)) {
      mark(1);
      const moved = gotoBranchDate(branch, d);
      if (moved !== false) return;
    }
    if (!/go=rev\.main/.test(location.search)) return;
    if (!t) { say('지점·날짜를 골랐어요. 테마와 시간을 직접 골라 주세요.'); return; }
    if (!theme) { say('같은 시간이 여러 테마에 있어서 테마 이름을 적어야 시간까지 골라 드릴 수 있어요.'); return; }
    if (step.n >= 2) { say('시간을 직접 골라 주세요.'); return; }
    mark(2);
    if (await pickTime(t, d ? `${d.month}월 ${d.day}일 "${theme}"` : `"${theme}"`, theme)) fillAfterNext();
  }
  // NEXT를 누른 뒤 입력칸이 나타나면 내 정보를 채웁니다 (같은 화면이든 새 화면이든)
  async function fillAfterNext() {
    const ok = await waitFor(() => fillAll(true) || null, 10000);
    sessionStorage.removeItem(FLOW_KEY);
    if (!ok) say('NEXT 뒤에 이름·전화번호 칸을 찾지 못했어요. [내 정보 채우기]를 눌러 보세요.');
    else say('내 정보를 채웠어요! 내용을 확인하고 예약 버튼은 직접 눌러 주세요.');
  }

  let picking = false;
  async function autoPick() {
    const branch = BRANCHES.length ? $('br').value : '', theme = $('th').value.trim();
    if (picking || SITE.basic || (!branch && !theme) || !isReservePage()) return;
    picking = true;
    // 방금 NEXT를 눌러 넘어온 화면이면 고르기는 건너뛰고 채우기만 합니다
    const flow = +sessionStorage.getItem(FLOW_KEY);
    if (flow && Date.now() - flow < 30000) return fillAfterNext();
    // 고를 때 화면이 새로 열리는 사이트라면, 20초 안에 이미 고른 단계는 다시 고르지 않습니다
    const STEP_KEY = '__keHelperStep';
    let step = {};
    try { step = JSON.parse(sessionStorage.getItem(STEP_KEY)) || {}; } catch (e) {}
    if (!step.at || Date.now() - step.at > 20000) step = {};
    const mark = (n) => sessionStorage.setItem(STEP_KEY, JSON.stringify({ n, at: Date.now() }));
    if (SITE.viaUrl) return autoPickViaUrl(branch, theme, step, mark);
    if (branch && !(step.n >= 1)) {
      mark(1);
      if (!(await waitAndChoose(branch, '지점'))) return;
      say(`지점 "${branch}"을(를) 골랐어요.` + (theme ? ' 테마를 찾는 중…' : ''));
      await sleep(400);
    }
    if (theme && !(step.n >= 2)) {
      mark(2);
      if (!(await waitAndChoose(theme, '테마'))) return;
      say((branch ? `지점 "${branch}", ` : '') + `테마 "${theme}"을(를) 골랐어요.`);
    }
    if (step.n >= 4) { say('날짜·시간을 직접 골라 주세요.'); return; }
    mark(step.n === 3 ? 4 : 3);
    if (!$('dt').value.trim()) { say([branch && `지점 "${branch}"`, theme && `테마 "${theme}"`].filter(Boolean).join(', ') + '을(를) 골랐어요. 날짜·시간을 골라 주세요.'); return; }
    await sleep(500);
    if (await pickDateTime()) fillAfterNext();
  }

  // ---------- 시작 ----------
  const state = sessionStorage.getItem(ARM_KEY);
  if (state === 'done') {
    sessionStorage.removeItem(ARM_KEY);
    say('⏰ 정해 둔 시각에 새로고침했어요! 지점·테마·날짜·시간을 골라 주세요.');
  }

  setInterval(() => {
    $('clock').textContent = synced ? fmt(serverNow(), true) : '--:--:--.-';
  }, 50);

  syncClock().then(() => {
    const diff = offset / 1000;
    $('acc').textContent = `서버 시간 (정확도 ±${accuracy}ms) · 내 컴퓨터보다 ${Math.abs(diff).toFixed(1)}초 ${diff >= 0 ? '빠름' : '느림'}`;
    if (state && state !== 'done') {
      const t = +state;
      if (t > serverNow()) arm(t); else sessionStorage.removeItem(ARM_KEY);
    }
  }).catch((e) => {
    $('acc').textContent = '서버 시간을 맞추지 못했어요: ' + e.message;
  });
})();
