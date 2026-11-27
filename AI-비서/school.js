/* 🏫 학교 모드 기능 (v0.26~) — index.html 다음에 읽혀요.
   index.html의 전역(S, put, remove, ls, $, esc, toast, gemini, gcall, G, owner, isSchool, allEvents, coolOpen, renderPlan, renderTodo, pushProfile, openSet, md …)을 그대로 써요.
   저장: S.notes(kind 'note' = 📝 노트·회의록·일기), S.cls(kind 'class' = 🏫 학급: t='roster'|'att'|'counsel'|'log'|'tt'|'file')
   나이스: 교육정보 개방 포털(open.neis.go.kr, CORS 열림) — 학교 설정은 ls 'school' + ai_profile.settings.school(폰·PC 같이), 받아 온 것은 ls 'neisC'(하루 한 번) */

/* ---------- 모양 ---------- */
document.head.insertAdjacentHTML('beforeend', `<style>
.cat{display:inline-block;font-size:11px;border-radius:6px;padding:1px 6px;margin-right:4px;vertical-align:1px;color:#fff;cursor:pointer;line-height:1.5}
.star{cursor:pointer;margin-right:2px}
details.fold{margin-top:12px}details.fold summary{cursor:pointer;color:var(--sub);font-size:13px;padding:6px 2px}details.fold .box{opacity:.6}
.chip.on{background:var(--main);color:#fff;border-color:var(--main)}
.calhead{display:flex;align-items:center;gap:8px;margin:4px 0 8px}.calhead b{flex:1;text-align:center;font-size:16px}
.calhead button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font-size:15px;cursor:pointer}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.cal .wd{background:var(--soft);text-align:center;font-size:12px;padding:4px 0;font-weight:700}
.cal .d{background:#fff;min-height:72px;padding:3px;font-size:11px;cursor:pointer;overflow:hidden}
.cal .d.out{background:#f8f9fa;color:#bbb}.cal .d.out .ev{opacity:.5}
.cal .d.sel{box-shadow:inset 0 0 0 2px var(--main)}
.cal .d .n{font-weight:700;font-size:12px;display:inline-block;min-width:18px;text-align:center}
.cal .d.td .n{background:var(--main);color:#fff;border-radius:99px}
.cal .ev{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:4px;padding:0 3px;margin-top:2px;color:#fff;font-size:10.5px;line-height:1.5}
.cal .ev.dim{opacity:.35}.cal .ev.tdo{background:#fff!important;color:var(--text);border:1px solid var(--line)}
.cal .more{color:var(--sub);font-size:10px}
.sun{color:#e03131}.sat{color:#1c7ed6}
.sub{display:flex;gap:6px;overflow-x:auto;padding:0 0 8px;margin-bottom:4px;scrollbar-width:none}.sub::-webkit-scrollbar{display:none}
.tt{width:100%;border-collapse:collapse;background:#fff;font-size:13.5px;table-layout:fixed}.tt th,.tt td{border:1px solid var(--line);padding:5px 3px;text-align:center}
.tt th{background:var(--soft);font-weight:600}.tt td input{width:100%;border:0;text-align:center;font-size:13.5px;background:transparent;font-family:inherit;padding:3px 0}
.tt tr.now td,.tt tr.now th{background:#fff4d6}
.stu{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}.stu .nm{min-width:74px;font-weight:600}
.stu .chip{padding:4px 9px;font-size:13px}.stu select,.stu input{border:1px solid var(--line);border-radius:8px;padding:4px 6px;font-size:13px;font-family:inherit}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.card h4{margin:0 0 4px;font-size:15px}.card .meta{font-size:12px;color:var(--sub)}
.fld{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 10px;font-size:15px;font-family:inherit;background:#fff;margin-top:6px}
textarea.fld{line-height:1.6;resize:vertical}
.row2{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}.row2 .fld{margin-top:0;flex:1;min-width:110px}
.bar{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.bar button{padding:7px 11px;font-size:14px}
.banner2{background:#fff4e6;border:1px solid #ffd8a8;border-radius:10px;padding:9px 11px;font-size:13.5px;margin-bottom:8px}
.sumbox{background:var(--soft);border-radius:12px;padding:10px 12px;margin-top:10px;font-size:14.5px;line-height:1.6}
.sumbox .it{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px dashed var(--line)}.sumbox .it span{flex:1}
.sumbox .it button{padding:4px 9px;font-size:13px}
#recPill{position:fixed;top:calc(52px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:40;background:#e03131;color:#fff;border-radius:99px;padding:6px 8px 6px 14px;font-size:14px;display:none;align-items:center;gap:8px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
#recPill.show{display:flex}#recPill.idle{background:#343a40}#recPill button{border:0;border-radius:99px;padding:4px 10px;font-size:13px;cursor:pointer}
#tool{position:fixed;inset:0;background:#15171c;color:#fff;z-index:60;display:none;flex-direction:column}#tool.show{display:flex}
#tool .th{display:flex;align-items:center;gap:6px;padding:10px 12px;flex-wrap:wrap}#tool .th b{flex:1;font-size:18px}
#tool button{background:#2b2f38;color:#fff;border:1px solid #444a55;border-radius:10px;padding:9px 14px;font-size:16px;cursor:pointer}
#tool button.p{background:var(--main);border-color:var(--main)}
#tool input,#tool textarea,#tool select{background:#22252c;color:#fff;border:1px solid #444a55;border-radius:8px;padding:7px 9px;font-size:16px;font-family:inherit}
#tool .tb{flex:1;overflow:auto;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:12px}
.bigt{font-size:min(30vw,46vh);font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.bign{font-size:min(16vw,30vh);font-weight:800;text-align:center;line-height:1.1;word-break:keep-all}
#tool.flash{animation:fl 0.5s 6 alternate}@keyframes fl{to{background:#c92a2a}}
.seats{display:grid;gap:8px;width:100%;max-width:1100px}.seats div{background:#2b2f38;border-radius:10px;padding:14px 4px;text-align:center;font-size:clamp(14px,2.6vw,26px);font-weight:700}
.teams{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;width:100%;max-width:1200px}
.team{background:#2b2f38;border-radius:14px;padding:12px;text-align:center}.team input{width:100%;text-align:center;font-weight:700}
.team .sc{font-size:min(16vw,120px);font-weight:800;margin:6px 0}
.brk{display:flex;gap:16px;overflow:auto;width:100%;align-items:stretch}.brk .rd{display:flex;flex-direction:column;justify-content:space-around;gap:10px;min-width:140px}
.brk .m{background:#2b2f38;border-radius:10px;overflow:hidden}.brk .m div{padding:8px 10px;cursor:pointer;border-bottom:1px solid #15171c;font-size:16px}
.brk .m div.w{background:var(--main)}.brk .m div.l{opacity:.4}
@media print{#tool{display:none!important}}
</style>`);

/* ---------- ⭐ 중요 · 분류 · 다른 모드 접기 (v0.26) ---------- */
const CATS = {
  school: [['업무', '#5c7cfa'], ['수업준비', '#12b886'], ['회의', '#f59f00'], ['공문·행정', '#7950f2'], ['학생·학부모', '#e64980'], ['연수', '#1098ad']],
  life: [['개인', '#868e96'], ['가족', '#d6336c'], ['건강', '#37b24d'], ['약속', '#f76707'], ['기타', '#adb5bd']]
};
const CAT_RULES = [
  [/회의|협의|위원회|워크숍|워크샵/, '회의'], [/공문|제출|보고|기안|결재|에듀파인|나이스|정산|품의|계획서/, '공문·행정'],
  [/상담|학부모|생기부|생활기록|관찰|학생/, '학생·학부모'], [/연수|강의|자격|세미나/, '연수'],
  [/수업|교구|준비물|평가|수행|단원|공개수업|학습지|시험|교과/, '수업준비'],
  [/병원|치과|한의원|약국|운동|헬스|필라테스|요가|검진/, '건강'], [/엄마|아빠|가족|생일|부모님|어머니|아버지|제사|명절|아이/, '가족'], [/약속|모임|동창|만남|저녁 먹/, '약속']
];
function catOf(title, mode) { for (const [re, c] of CAT_RULES) if (re.test(title || '')) return c; return mode === 'school' ? '업무' : '개인'; }
const catColor = c => [...CATS.school, ...CATS.life].find(x => x[0] === c)?.[1] || '#adb5bd';
function tagNew(o) { // put()이 새 일정·할 일을 넣을 때 불러요
  const t = o.title || '';
  if (/^!|!중요|\(중요\)|\[중요\]/.test(t)) { o.star = true; o.title = t.replace(/^!\s*|\s*!중요|\s*\(중요\)|\s*\[중요\]/g, '').trim() || t; }
  if (!o.cat && o.kind !== 'remember') o.cat = catOf(o.title, o.mode);
}
function markH(x, kind) {
  if (x.src === 'g' || x.src === 'cool' || x.g || x.p || x.cool || x.neis) return '';
  return `<span class="star" data-star="${kind}:${esc(x.id)}" title="중요 표시">${x.star ? '⭐' : '☆'}</span>${x.cat ? `<span class="cat" data-cat="${kind}:${esc(x.id)}" style="background:${catColor(x.cat)}" title="눌러서 분류 바꾸기">${esc(x.cat)}</span>` : ''}`;
}
function otherMode(x) { // 지금 모드가 아닌 것(아래에 접어 둬요). 꼬리표 없는 옛 것·구글·폰 일정은 두 모드 모두
  const sc = isSchool();
  if (x.src === 'cool' || x.cool || x.neis) return !sc;
  return !!x.mode && x.mode !== (sc ? 'school' : 'life');
}
function foldH(n, rows) { return `<details class="fold"><summary>${isSchool() ? '🏠 일상' : '🏫 학교'} 것 ${n}개 — 다른 모드라 접어 뒀어요</summary><div class="box">${rows}</div></details>`; }
// ⭐·분류 누르기 — 할 일 줄의 '고치기'보다 먼저 받아요(capture)
document.addEventListener('click', e => {
  const st = e.target.closest('[data-star]'), ct = e.target.closest('[data-cat]');
  if (!st && !ct) return;
  e.stopPropagation(); e.preventDefault();
  const [kind, id] = (st || ct).dataset[st ? 'star' : 'cat'].split(/:(.*)/s);
  const arr = kind === 'event' ? S.events : S.todos, x = arr.find(y => y.id === id); if (!x) return;
  if (st) put(kind, { ...x, star: !x.star });
  else { const l = CATS[x.mode || (isSchool() ? 'school' : 'life')].map(c => c[0]); put(kind, { ...x, cat: l[(l.indexOf(x.cat) + 1) % l.length] }); }
  renderPlan(); scRefresh();
}, true);

/* ---------- 모드별 탭 ---------- */
document.querySelector('nav button[data-p=pMail]').insertAdjacentHTML('beforebegin', '<button data-p="pNote">📝 노트</button><button data-p="pClass">🏫 학급</button>');
document.querySelector('main').insertAdjacentHTML('beforeend', `
  <section id="pNote" class="page"><div id="noteBody"></div></section>
  <section id="pClass" class="page"><div class="sub" id="clsSub"></div><div id="clsBody"></div></section>`);
document.body.insertAdjacentHTML('beforeend', `<div id="recPill"><span id="recTxt"></span><button id="recGo">보기</button><button id="recStopB" style="background:#fff;color:#c92a2a;font-weight:700">⏹ 끝</button></div><div id="tool"></div>`);
function goPage(p) {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.p === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('on', x.id === p));
  scRender(p);
}
document.querySelectorAll('nav button[data-p=pNote],nav button[data-p=pClass]').forEach(b => b.onclick = () => goPage(b.dataset.p));
function scMode(sc) {
  const vis = { pNote: sc, pClass: sc, pMail: !sc, pWork: !sc };
  for (const [p, v] of Object.entries(vis)) { const b = document.querySelector(`nav button[data-p=${p}]`); if (b) b.style.display = v ? '' : 'none'; }
  const on = document.querySelector('nav button.on');
  if (on && on.style.display === 'none') document.querySelector('nav button[data-p=pChat]').click();
  if ($('pPlan').classList.contains('on') || $('pTodo').classList.contains('on')) renderPlan();
}
function scRender(p) { if (p === 'pNote') nRender(); if (p === 'pClass') cRender(); }
function scRefresh() { // 서버에서 바뀐 게 오면 — 글 쓰는 중이면 다시 그리지 않아요
  const a = document.activeElement, typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
  for (const p of ['pNote', 'pClass']) if ($(p).classList.contains('on') && !(typing && $(p).contains(a))) scRender(p);
}

/* ---------- 📆 주간·월간 달력 (v0.27) ---------- */
let calView = ls.get('calView', 'list'), calRef = today(), calSel = today();
function calData() {
  const m = new Map(), add = (d, o) => { if (!okDate(d)) return; if (!m.has(d)) m.set(d, []); m.get(d).push(o); };
  for (const e of allEvents()) {
    const o = { t: e.time || '', title: e.title, color: e.neis ? (e.off ? '#e03131' : '#2b8a3e') : e.cool ? '#f76707' : (e.g || e.p) ? (e.color || '#4dabf7') : catColor(e.cat || (e.mode === 'life' ? '개인' : '업무')), dim: otherMode(e), star: e.star, src: e.neis ? '🏫 학사일정' : e.cool ? '📨 쿨메신저' : e.p ? '📱 ' + (e.label || '폰') : e.g ? '🗓️ ' + (e.label || '구글') : '🍓 AI 비서', end: e.end || '' };
    add(e.date, o);
    if (e.endDate && e.endDate > e.date) for (let d = addDays(e.date, 1), k = 0; d <= e.endDate && k < 62; d = addDays(d, 1), k++) add(d, { ...o, t: '' });
  }
  const tds = [
    ...S.todos.filter(x => !x.done && x.kind !== 'remember' && x.due),
    ...(owner ? coolOpen().filter(x => x.kind === 'todo' && x.due).map(x => ({ ...x, title: x.text, src: 'cool' })) : []),
    ...G.tasks.filter(x => x.due).map(x => ({ ...x, src: 'g' }))
  ];
  for (const x of tds) add(x.due, { t: '', title: x.title, td: true, dim: otherMode(x), star: x.star, src: x.src === 'cool' ? '📨 쿨메신저 마감' : x.src === 'g' ? '☑️ 구글 할 일' : '✅ 마감 할 일', color: '#495057' });
  for (const l of m.values()) l.sort((a, b) => (a.dim - b.dim) || (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.td - b.td) || (a.t || '00').localeCompare(b.t || '00'));
  return m;
}
const dowOf = d => new Date(d + 'T00:00').getDay();
function dayRows(l) {
  if (!l || !l.length) return '<div class="none">잡힌 게 없어요</div>';
  return l.map(o => `<div class="row" style="${o.dim ? 'opacity:.45' : ''}"><span class="when">${o.td ? '✅' : esc(o.t || '종일')}${o.end ? `<br><span class="tag">~${esc(o.end)}</span>` : ''}</span><div class="t"><div>${o.star ? '⭐ ' : ''}<span style="display:inline-block;width:8px;height:8px;border-radius:9px;background:${o.color};margin-right:5px"></span>${esc(o.title)}</div><small>${esc(o.src)}${o.dim ? ' · 다른 모드' : ''}</small></div></div>`).join('');
}
function scCal() {
  const pv = $('planView'); if (!pv) return false;
  pv.innerHTML = [['list', '📋 목록'], ['week', '🗓️ 주간'], ['month', '📆 월간']].map(([k, l]) => `<button class="chip ${calView === k ? 'on' : ''}" data-cv="${k}">${l}</button>`).join('');
  if (calView === 'list') return false;
  const m = calData(), t = today();
  let h = '';
  if (calView === 'month') {
    const first = calRef.slice(0, 8) + '01', y = +first.slice(0, 4), mo = +first.slice(5, 7);
    let d = addDays(first, -dowOf(first));
    h += `<div class="calhead"><button data-cnav="-1">‹</button><b>${y}년 ${mo}월</b><button data-cnav="0" style="font-size:13px">오늘</button><button data-cnav="1">›</button></div><div class="cal">`;
    h += WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('');
    for (let w = 0; w < 6; w++) {
      if (w >= 4 && d.slice(0, 7) !== first.slice(0, 7)) break;
      for (let i = 0; i < 7; i++, d = addDays(d, 1)) {
        const l = m.get(d) || [], off = l.some(o => o.src === '🏫 학사일정' && o.color === '#e03131');
        h += `<div class="d ${d.slice(0, 7) !== first.slice(0, 7) ? 'out' : ''} ${d === t ? 'td' : ''} ${d === calSel ? 'sel' : ''}" data-cday="${d}"><span class="n ${i === 0 || off ? 'sun' : i === 6 ? 'sat' : ''}">${+d.slice(8)}</span>${l.slice(0, 3).map(o => `<div class="ev ${o.dim ? 'dim' : ''} ${o.td ? 'tdo' : ''}" style="background:${o.color}">${o.star ? '⭐' : ''}${o.td ? '✅' : ''}${esc(o.title)}</div>`).join('')}${l.length > 3 ? `<div class="more">+${l.length - 3}</div>` : ''}</div>`;
      }
    }
    h += `</div><div class="dhead ${calSel === t ? 'today' : ''}">${dLabel(calSel)}</div><div class="box">${dayRows(m.get(calSel))}</div>`;
  } else {
    const start = addDays(calRef, -dowOf(calRef));
    h += `<div class="calhead"><button data-cnav="-1">‹</button><b>${+start.slice(5, 7)}/${+start.slice(8)} ~ ${+addDays(start, 6).slice(5, 7)}/${+addDays(start, 6).slice(8)}</b><button data-cnav="0" style="font-size:13px">이번 주</button><button data-cnav="1">›</button></div>`;
    for (let i = 0; i < 7; i++) { const d = addDays(start, i); h += `<div class="dhead ${d === t ? 'today' : ''} ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}" data-cday="${d}" style="cursor:pointer">${dLabel(d)}</div><div class="box">${dayRows(m.get(d))}</div>`; }
  }
  $('evList').innerHTML = h + '<p class="hint">날짜를 누르면 위 칸 날짜가 그날로 바뀌어요. 색: 분류 색 · 🏫 초록 = 학사일정(빨강 = 쉬는 날) · 📨 주황 = 쿨메신저 · 흐린 것 = 다른 모드</p>';
  return true;
}
$('pPlan').addEventListener('click', e => {
  const cv = e.target.closest('[data-cv]'), nv = e.target.closest('[data-cnav]'), cd = e.target.closest('[data-cday]');
  if (cv) { calView = cv.dataset.cv; ls.set('calView', calView); calRef = calSel = today(); renderPlan(); }
  else if (nv) {
    const k = +nv.dataset.cnav;
    if (!k) calRef = calSel = today();
    else if (calView === 'month') { const d = new Date(calRef.slice(0, 8) + '01T00:00'); d.setMonth(d.getMonth() + k); calRef = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; }
    else calRef = addDays(calRef, 7 * k);
    renderPlan();
  } else if (cd) { calSel = cd.dataset.cday; $('evD').value = calSel; if (calView === 'month') renderPlan(); else toast(`위 칸 날짜를 ${dLabel(calSel)}로 바꿨어요`); }
});

/* ---------- 🏫 나이스 (v0.28) ---------- */
const SCH = () => { try { return JSON.parse(ls.get('school') || '{}'); } catch (e) { return {}; } };
const curAY = (d = today()) => +d.slice(5, 7) >= 3 ? +d.slice(0, 4) : +d.slice(0, 4) - 1;
let NC = (() => { try { return JSON.parse(ls.get('neisC') || '{}'); } catch (e) { return {}; } })();
const nYmd = s => s.replace(/-/g, ''), fromN = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
async function neis(svc, params, key = SCH().key) {
  const q = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: key ? '1000' : '5', ...(key ? { KEY: key } : {}), ...params });
  const r = await fetch('https://open.neis.go.kr/hub/' + svc + '?' + q, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (j.RESULT) { if (j.RESULT.CODE === 'INFO-200') return []; throw new Error(j.RESULT.MESSAGE || j.RESULT.CODE); }
  const a = j[svc] || [], code = a[0]?.head?.[1]?.RESULT?.CODE;
  if (code && code !== 'INFO-000') throw new Error(a[0].head[1].RESULT.MESSAGE);
  return a[1]?.row || [];
}
let neisBusy = false;
async function neisRefresh(force) {
  const s = SCH(); if (!s.code || neisBusy) return;
  const key = [s.code, s.grade, s.cls, s.key ? 'k' : ''].join('|');
  if (!force && NC.key === key && NC.day === today()) return;
  neisBusy = true;
  const t = today(), ay = curAY(t), mon = addDays(t, -((dowOf(t) + 6) % 7)), to = addDays(mon, 11);
  const base = { ATPT_OFCDC_SC_CODE: s.office, SD_SCHUL_CODE: s.code };
  const out = { key, day: t, sched: [], meal: {}, tt: {}, err: [] };
  const GF = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'][(+s.grade || 0) - 1];
  try {
    const rows = await neis('SchoolSchedule', { ...base, AA_FROM_YMD: ay + '0301', AA_TO_YMD: (ay + 1) + '0228' });
    out.sched = rows.filter(r => r.EVENT_NM && r.EVENT_NM !== '토요휴업일' && (!GF || r[GF + '_GRADE_EVENT_YN'] !== 'N'))
      .map(r => ({ d: fromN(r.AA_YMD), n: r.EVENT_NM.trim(), off: r.SBTR_DD_SC_NM === '휴업일' }));
  } catch (e) { out.err.push('학사일정: ' + e.message); }
  try {
    for (const r of await neis('mealServiceDietInfo', { ...base, MLSV_FROM_YMD: nYmd(mon), MLSV_TO_YMD: nYmd(to) }))
      if (!r.MMEAL_SC_NM || r.MMEAL_SC_NM === '중식') out.meal[fromN(r.MLSV_YMD)] = String(r.DDISH_NM || '').split(/<br\s*\/?>/i).map(x => x.replace(/\s*\([\d.\s]+\)\s*/g, '').trim()).filter(Boolean);
  } catch (e) { out.err.push('급식: ' + e.message); }
  if (s.grade && s.cls) try {
    for (const r of await neis('elsTimetable', { ...base, AY: String(ay), GRADE: String(s.grade), CLASS_NM: String(s.cls), TI_FROM_YMD: nYmd(mon), TI_TO_YMD: nYmd(to) })) {
      const d = fromN(r.ALL_TI_YMD), p = (+r.PERIO || 1) - 1; (out.tt[d] ||= [])[p] = (r.ITRT_CNTNT || '').replace(/^-/, '').trim();
    }
  } catch (e) { out.err.push('시간표: ' + e.message); }
  if (!s.key && out.sched.length >= 5) out.err.push('인증키가 없어서 5개까지만 받았어요');
  NC = out; ls.set('neisC', JSON.stringify(NC)); neisBusy = false;
  scRefresh(); if ($('pPlan').classList.contains('on')) renderPlan();
}
function neisEvents() {
  if (!SCH().code) return [];
  return (NC.sched || []).map((x, i) => ({ id: 'n_' + x.d + '_' + i, date: x.d, time: '', title: x.n, neis: true, off: x.off }));
}
async function findSchool(q, key) {
  const rows = await neis('schoolInfo', { SCHUL_NM: q }, key);
  return rows.map(r => ({ office: r.ATPT_OFCDC_SC_CODE, code: r.SD_SCHUL_CODE, name: r.SCHUL_NM, addr: r.ORG_RDNMA || '', kind: r.SCHUL_KND_SC_NM || '' }));
}
// ⚙️ 설정 창에 🏫 학교 칸
(() => {
  const anchor = [...document.querySelectorAll('#mSet h4')].find(h => /백업/.test(h.textContent));
  anchor.insertAdjacentHTML('beforebegin', `
  <h4>🏫 학교 (나이스) <small style="font-weight:400;color:var(--sub)">시간표·급식·학사일정</small></h4>
  <label>나이스 인증키 (무료)</label>
  <input type="password" id="scKey" placeholder="교육정보 개방 포털에서 받은 인증키" autocomplete="off">
  <div class="hint"><a href="https://open.neis.go.kr/portal/guide/actKeyPage.do" target="_blank" rel="noopener">open.neis.go.kr</a> 가입 → 마이페이지 → 인증키 신청(활용 목적: 개인 업무용) → 받은 키를 붙여넣기. 없어도 되지만 하루치 몇 개만 받아져요.</div>
  <label>우리 학교</label>
  <div class="row2"><input class="fld" id="scQ" placeholder="학교 이름 (예: 소담초)"><button class="g" id="scFind" style="padding:9px 12px">🔍 찾기</button></div>
  <div id="scFound"></div>
  <div class="hint" id="scNow"></div>
  <div class="row2"><input class="fld" id="scGrade" type="number" min="1" max="6" placeholder="학년" style="max-width:90px"> 학년 <input class="fld" id="scCls" placeholder="반 (예: 3 또는 바다)" style="max-width:150px"> 반</div>
  <div class="hint">나이스에 적힌 반 이름 그대로(보통 숫자). 학교를 옮기면 🔍로 새 학교만 다시 고르면 돼요. 3월마다 학년·반을 확인해 달라고 알려 드려요.</div>
  <div class="btns" style="margin-top:6px"><button class="g" id="scSave">🏫 학교 설정 저장</button></div>`);
  let pick = null;
  const fill = () => { const s = SCH(); $('scKey').value = s.key || ''; $('scGrade').value = s.grade || ''; $('scCls').value = s.cls || ''; pick = s.code ? { office: s.office, code: s.code, name: s.name } : null; $('scNow').textContent = s.code ? `지금: ${s.name}` : '아직 학교를 고르지 않았어요'; $('scFound').innerHTML = ''; };
  $('bSet').addEventListener('click', () => setTimeout(fill, 0)); fill();
  $('scFind').onclick = async () => {
    const q = $('scQ').value.trim(); if (!q) return toast('학교 이름을 넣어 주세요');
    $('scFound').innerHTML = '<div class="hint">찾는 중…</div>';
    try {
      const l = await findSchool(q, $('scKey').value.trim());
      $('scFound').innerHTML = l.length ? l.map((x, i) => `<button class="chip" data-sci="${i}" style="margin:4px 4px 0 0">${esc(x.name)} <small>${esc(x.addr.split(' ').slice(0, 2).join(' '))}</small></button>`).join('') : '<div class="hint">못 찾았어요. 이름을 줄여 보세요(예: 소담초)</div>';
      $('scFound').onclick = e => { const b = e.target.closest('[data-sci]'); if (!b) return; pick = l[+b.dataset.sci]; $('scNow').textContent = `고른 학교: ${pick.name} (저장을 눌러 주세요)`; $('scFound').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); };
    } catch (e) { $('scFound').innerHTML = `<div class="hint">⚠️ ${esc(e.message)}</div>`; }
  };
  $('scSave').onclick = async () => {
    if (!pick) return toast('🔍로 학교를 먼저 골라 주세요');
    const s = { ...pick, key: $('scKey').value.trim(), grade: +$('scGrade').value || '', cls: $('scCls').value.trim(), ay: curAY() };
    ls.set('school', JSON.stringify(s));
    if (owner) pushProfile({ school: s }).catch(() => {});
    toast(`🏫 ${s.name} 저장! 시간표·급식·학사일정을 받아 와요`, 3500);
    await neisRefresh(true);
    if (NC.err?.length) toast('⚠️ ' + NC.err.join(' / '), 6000);
    fill();
  };
})();

/* ---------- 🏫 학급 탭 (오늘·시간표·명렬표·출결·상담·학급 일지·도구·서류철) ---------- */
const CL = id => S.cls.find(x => x.id === id);
const roster = () => (CL('cls_roster')?.list || []);
const PERIODS0 = ['09:00-09:40', '09:50-10:30', '10:40-11:20', '11:30-12:10', '13:00-13:40', '13:50-14:30'];
const ttCfg = () => ({ periods: PERIODS0, week: {}, prefer: 'neis', ...(CL('cls_tt') || {}) });
function ttFor(d) {
  const w = dowOf(d); if (!w || w === 6) return [];
  const c = ttCfg(), mine = c.week[w] || [], nz = NC.tt?.[d] || [];
  const useN = nz.some(Boolean) && (c.prefer === 'neis' || !mine.some(Boolean));
  return (useN ? nz : mine).slice(0, 10);
}
function nowPeriod() { const n = new Date(), hm = pad(n.getHours()) + ':' + pad(n.getMinutes()); return ttCfg().periods.findIndex(p => { const [a, b] = p.split('-'); return a && b && hm >= a && hm <= b; }); }
let clsTab = ls.get('clsTab', 'today'), clsDay = today();
const CTABS = [['today', '☀️ 오늘'], ['tt', '📚 시간표'], ['att', '✅ 출결'], ['counsel', '🗣️ 상담'], ['log', '📝 학급 일지'], ['roster', '📋 명렬표'], ['tools', '🎲 교실 도구'], ['files', '📁 서류철']];
function cRender() {
  $('clsSub').innerHTML = CTABS.map(([k, l]) => `<button class="chip ${clsTab === k ? 'on' : ''}" data-ct="${k}">${l}</button>`).join('');
  const f = { today: cToday, tt: cTT, att: cAtt, counsel: cCounsel, log: cLog, roster: cRoster, tools: cTools, files: cFiles }[clsTab] || cToday;
  $('clsBody').innerHTML = f();
  if (clsTab === 'files') cFilesAfter();
}
$('clsSub').onclick = e => { const b = e.target.closest('[data-ct]'); if (b) { clsTab = b.dataset.ct; ls.set('clsTab', clsTab); cRender(); } };
const dayNav = (d, k) => `<div class="calhead"><button data-dnav="${k}:-1">‹</button><b style="font-size:15px">${dLabel(d)}</b><button data-dnav="${k}:0" style="font-size:13px">오늘</button><button data-dnav="${k}:1">›</button></div>`;
function ttTable(d) {
  const tt = ttFor(d), ps = ttCfg().periods, np = d === today() ? nowPeriod() : -1;
  if (!tt.some(Boolean)) return '<div class="box"><div class="none">시간표가 없어요 — 📚 시간표에서 넣거나 나이스에서 받아요</div></div>';
  return `<table class="tt" style="border-radius:12px;overflow:hidden"><tbody>${tt.map((x, i) => `<tr class="${i === np ? 'now' : ''}"><th style="width:64px">${i + 1}교시</th><td style="font-weight:600">${esc(x || '-')}</td><td style="width:100px;color:var(--sub);font-size:12px">${esc(ps[i] || '')}</td></tr>`).join('')}</tbody></table>`;
}
function attSummary(d) {
  const a = CL('att_' + d), r = roster(); if (!a) return '';
  const l = Object.entries(a.marks || {}).filter(([, v]) => v.k).map(([no, v]) => `${esc(r.find(s => String(s.no) === no)?.name || no + '번')} ${v.k}${v.why ? '(' + v.why + ')' : ''}`);
  return l.join(', ');
}
function cToday() {
  const s = SCH(), d = clsDay; let h = '';
  if (!s.code) h += `<div class="banner2">🏫 <b>⚙️ 설정 → 🏫 학교</b>에서 학교를 고르면 시간표·급식·학사일정이 저절로 와요. <button class="chip" data-open-set="1">⚙️ 열기</button></div>`;
  else if ((s.ay || 0) < curAY()) h += `<div class="banner2">🌱 새 학년도예요! ${esc(s.name)} · ${s.grade || '?'}학년 ${esc(s.cls || '?')}반이 맞는지 확인해 주세요. <button class="chip" data-open-set="1">⚙️ 확인</button></div>`;
  if (NC.err?.length && s.code) h += `<div class="hint">⚠️ ${esc(NC.err.join(' / '))}</div>`;
  h += dayNav(d, 'cls');
  h += `<div class="dhead">📚 시간표</div>${ttTable(d)}`;
  const ml = NC.meal?.[d];
  h += `<div class="dhead">🍚 급식</div><div class="box"><div style="padding:8px 0;line-height:1.7">${ml ? ml.map(esc).join(' · ') : '<span class="none" style="padding:0">' + (s.code ? '급식 정보가 없어요' : '학교를 고르면 보여요') + '</span>'}</div></div>`;
  const att = attSummary(d);
  h += `<div class="dhead">✅ 출결</div><div class="box"><div style="padding:8px 0">${att || (roster().length ? '모두 출석 (적은 것 없음)' : '📋 명렬표를 먼저 넣어 주세요')} <button class="chip" data-ct-go="att" style="margin-left:6px">출결 적기</button></div></div>`;
  const up = neisEvents().filter(e => e.date >= d && e.date <= addDays(d, 21));
  h += `<div class="dhead">🏫 다가오는 학사일정 <small style="font-weight:400">3주</small></div><div class="box">${up.length ? up.map(e => `<div class="row"><span class="when">${esc(dLabel(e.date))}</span><div class="t"><div style="${e.off ? 'color:#e03131' : ''}">${esc(e.title)}</div></div></div>`).join('') : '<div class="none">없어요</div>'}</div>`;
  h += `<div class="bar" style="margin-top:12px"><button class="g" data-tool="timer">⏱️ 타이머</button><button class="g" data-tool="draw">🎲 뽑기</button><button class="g" data-ct-go="log">📝 오늘 학급 일지</button></div>`;
  return h;
}
function cTT() {
  const c = ttCfg(), n = Math.max(c.periods.length, 1);
  let h = `<div class="hint" style="margin-bottom:6px">칸을 눌러 과목을 적어요(저절로 저장). 나이스에 이번 주 시간표가 있으면 그날은 나이스 것을 써요.</div>`;
  h += `<table class="tt"><thead><tr><th style="width:84px">교시</th>${['월', '화', '수', '목', '금'].map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>`;
  for (let p = 0; p < n; p++) h += `<tr><th><input data-pt="${p}" value="${esc(c.periods[p] || '')}" style="font-size:11px" placeholder="09:00-09:40"><div>${p + 1}교시</div></th>${[1, 2, 3, 4, 5].map(w => `<td><input data-tt="${w}:${p}" value="${esc(c.week[w]?.[p] || '')}"></td>`).join('')}</tr>`;
  h += `</tbody></table><div class="bar"><button class="g" data-tta="add">＋ 교시</button><button class="g" data-tta="del">－ 교시</button><button class="g" data-tta="paste">📋 엑셀에서 붙여넣기</button><button class="g" data-tta="neis">🏫 나이스 이번 주로 채우기</button><button class="g" data-tta="print">🖨️ 인쇄</button></div>`;
  h += `<div class="row2"><label style="font-size:13.5px">날마다 쓸 시간표:</label><select class="fld" id="ttPrefer" style="max-width:240px"><option value="neis" ${c.prefer === 'neis' ? 'selected' : ''}>나이스 먼저 (없으면 내 시간표)</option><option value="me" ${c.prefer === 'me' ? 'selected' : ''}>내 시간표 먼저</option></select></div>`;
  h += `<div id="ttPaste" style="display:none"><textarea class="fld" id="ttPasteT" rows="6" placeholder="엑셀에서 월~금 시간표 칸을 복사해서 붙여넣기 (한 줄 = 한 교시)"></textarea><div class="bar"><button class="p" data-tta="pasteok">넣기</button></div></div>`;
  return h;
}
function saveTT(fn) { const c = ttCfg(); const n = { id: 'cls_tt', t: 'tt', periods: [...c.periods], week: JSON.parse(JSON.stringify(c.week || {})), prefer: c.prefer }; fn(n); put('class', n); }
function cRoster() {
  const r = roster();
  return `<div class="hint">한 줄에 한 명씩 "번호 이름" (엑셀에서 두 칸을 복사해 붙여도 돼요). 번호 없이 이름만 적으면 차례로 번호를 붙여요. 학생 이름은 내 계정에만 저장돼요.</div>
  <textarea class="fld" id="rosterT" rows="12" placeholder="1 김하늘&#10;2 이바다&#10;3 박나래">${esc(r.map(s => `${s.no} ${s.name}`).join('\n'))}</textarea>
  <div class="bar"><button class="p" data-rost="save">저장</button><span class="hint" style="align-self:center">지금 ${r.length}명</span></div>`;
}
const ATT_K = ['결석', '지각', '조퇴', '결과'], ATT_WHY = ['질병', '미인정', '기타', '출석인정'];
function cAtt() {
  const r = roster(), a = CL('att_' + clsDay) || { marks: {} };
  if (!r.length) return '<div class="banner2">📋 명렬표를 먼저 넣어 주세요. <button class="chip" data-ct-go="roster">명렬표 넣기</button></div>';
  let h = dayNav(clsDay, 'cls') + '<div class="box">';
  for (const s of r) {
    const m = a.marks?.[s.no] || {};
    h += `<div class="stu"><span class="nm">${s.no}. ${esc(s.name)}</span>${ATT_K.map(k => `<button class="chip ${m.k === k ? 'on' : ''}" data-att="${s.no}:${k}">${k}</button>`).join('')}${m.k ? `<select data-attw="${s.no}">${ATT_WHY.map(w => `<option ${m.why === w ? 'selected' : ''}>${w}</option>`).join('')}</select><input data-attm="${s.no}" value="${esc(m.memo || '')}" placeholder="메모" style="flex:1;min-width:90px">` : ''}</div>`;
  }
  h += '</div>';
  // 이번 달 모아 보기
  const mon = clsDay.slice(0, 7), cnt = {};
  for (const x of S.cls) if (x.t === 'att' && x.date?.startsWith(mon)) for (const [no, v] of Object.entries(x.marks || {})) if (v.k) { (cnt[no] ||= {})[v.k] = (cnt[no][v.k] || 0) + 1; }
  const rows = r.filter(s => cnt[s.no]);
  h += `<div class="dhead">📊 ${+mon.slice(5)}월 모아 보기</div><div class="box">${rows.length ? rows.map(s => `<div class="row"><div class="t"><div>${s.no}. ${esc(s.name)}</div><small>${ATT_K.filter(k => cnt[s.no][k]).map(k => `${k} ${cnt[s.no][k]}`).join(' · ')}</small></div></div>`).join('') : '<div class="none">이번 달은 모두 출석이에요</div>'}</div>`;
  h += `<div class="bar"><button class="g" data-attp="month">🖨️ ${+mon.slice(5)}월 출결 인쇄</button></div>`;
  return h;
}
function attSave(no, patch) {
  const a = CL('att_' + clsDay) || { id: 'att_' + clsDay, t: 'att', date: clsDay, marks: {} };
  const marks = { ...(a.marks || {}) }; marks[no] = { ...(marks[no] || {}), ...patch };
  if (!marks[no].k) delete marks[no];
  put('class', { ...a, marks });
}
let csEdit = '', csF = '';
function cCounsel() {
  const r = roster(), x = csEdit ? CL(csEdit) || {} : {};
  let h = `<div class="card"><h4>${csEdit ? '✏️ 상담 기록 고치기' : '＋ 새 상담 기록'}</h4>
  <div class="row2"><input class="fld" type="date" id="csD" value="${esc(x.date || today())}" style="max-width:160px">
  <select class="fld" id="csS"><option value="">학생 고르기</option>${r.map(s => `<option value="${s.no}" ${String(x.no) === String(s.no) ? 'selected' : ''}>${s.no}. ${esc(s.name)}</option>`).join('')}<option value="etc" ${x.no === 'etc' ? 'selected' : ''}>그 밖(반 전체 등)</option></select></div>
  <div class="row2"><select class="fld" id="csWho">${['학생', '학부모', '학생·학부모', '동료 교사', '기타'].map(w => `<option ${x.who === w ? 'selected' : ''}>${w}</option>`).join('')}</select>
  <select class="fld" id="csHow">${['대면', '전화', '문자·메신저', '온라인'].map(w => `<option ${x.how === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
  <textarea class="fld" id="csText" rows="5" placeholder="상담 내용 (대충 적고 ✨ 다듬기를 눌러도 돼요)">${esc(x.text || '')}</textarea>
  <textarea class="fld" id="csFollow" rows="2" placeholder="후속 조치 (예: 다음 주 다시 확인)">${esc(x.follow || '')}</textarea>
  <div class="bar"><button class="p" data-cs="save">저장</button><button class="g" data-cs="ai">✨ 기록 문체로 다듬기</button>${csEdit ? '<button class="g" data-cs="cancel">취소</button>' : ''}</div></div>`;
  const all = S.cls.filter(y => y.t === 'counsel' && (!csF || String(y.no) === csF)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  h += `<div class="row2"><select class="fld" id="csFilter" style="max-width:220px"><option value="">모든 학생</option>${r.map(s => `<option value="${s.no}" ${csF === String(s.no) ? 'selected' : ''}>${s.no}. ${esc(s.name)}</option>`).join('')}</select><button class="g" data-cs="print" style="padding:8px 12px">🖨️ 인쇄</button></div>`;
  h += all.length ? all.map(y => `<div class="card"><div class="meta">${esc(dLabel(y.date))} · ${esc(y.name || '')} · ${esc(y.who || '')} · ${esc(y.how || '')} <span style="float:right"><button class="del" data-cse="${y.id}">✏️</button><button class="del" data-csd="${y.id}">✕</button></span></div><div style="white-space:pre-wrap;margin-top:4px">${esc(y.text || '')}</div>${y.follow ? `<div class="meta" style="margin-top:4px">➡️ ${esc(y.follow)}</div>` : ''}</div>`).join('') : '<div class="box" style="margin-top:8px"><div class="none">상담 기록이 없어요</div></div>';
  return h;
}
let logT = null;
function cLog() {
  const x = CL('log_' + clsDay), att = attSummary(clsDay), tt = ttFor(clsDay);
  const recent = S.cls.filter(y => y.t === 'log' && y.text).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return dayNav(clsDay, 'cls') + `<div class="hint">📚 ${tt.some(Boolean) ? tt.map((s, i) => s ? `${i + 1}.${esc(s)}` : '').filter(Boolean).join(' ') : '시간표 없음'} · ✅ ${att ? esc(att) : '모두 출석'}</div>
  <textarea class="fld" id="logT" rows="12" placeholder="오늘 우리 반 이야기 (수업·생활·특이 사항). 적으면 저절로 저장돼요">${esc(x?.text || '')}</textarea>
  <div class="bar"><button class="g" data-logp="week">🖨️ 이번 주 인쇄</button><span class="hint" id="logSaved" style="align-self:center"></span></div>
  ${recent.length ? `<div class="dhead">최근 기록</div><div class="sub" style="flex-wrap:wrap">${recent.map(y => `<button class="chip" data-logd="${y.date}">${esc(dLabel(y.date))}</button>`).join('')}</div>` : ''}`;
}
function printH(title, body) {
  const w = window.open('', '_blank'); if (!w) return toast('팝업이 막혔어요. 주소창 오른쪽에서 팝업을 허락해 주세요', 4000);
  w.document.write(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:"Noto Sans KR",system-ui,sans-serif;padding:18px;font-size:13px;color:#111}table{border-collapse:collapse;width:100%;margin-bottom:10px}th,td{border:1px solid #888;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee}h1{font-size:18px;margin:0 0 10px}h2{font-size:15px;margin:16px 0 6px}.pre{white-space:pre-wrap}</style><h1>${esc(title)}</h1>${body}<script>setTimeout(function(){print()},300)<\/script></html>`);
  w.document.close();
}
$('pClass').addEventListener('click', async e => {
  const g = k => e.target.closest(`[data-${k}]`)?.dataset;
  let d;
  if (g('open-set')) return openSet();
  if ((d = g('ct-go'))) { clsTab = d.ctGo; ls.set('clsTab', clsTab); return cRender(); }
  if ((d = g('dnav'))) { const k = +d.dnav.split(':')[1]; clsDay = k ? addDays(clsDay, k) : today(); return cRender(); }
  if ((d = g('tool'))) return openTool(d.tool);
  if ((d = g('tta'))) {
    const a = d.tta;
    if (a === 'add') saveTT(n => n.periods.push(''));
    if (a === 'del') saveTT(n => { if (n.periods.length > 1) n.periods.pop(); });
    if (a === 'paste') { $('ttPaste').style.display = 'block'; $('ttPasteT').focus(); return; }
    if (a === 'pasteok') {
      let rows = $('ttPasteT').value.split(/\r?\n/).map(l => l.split('\t').map(x => x.trim())).filter(r => r.some(Boolean));
      if (rows[0] && rows[0].join('').match(/월.*화.*수/)) rows.shift();
      rows = rows.map(r => /^\d+(교시)?$|교시/.test(r[0]) && r.length > 5 ? r.slice(1) : r);
      if (!rows.length) return toast('붙여넣은 내용이 없어요');
      saveTT(n => { rows.forEach((r, p) => { for (let w = 1; w <= 5; w++) { (n.week[w] ||= [])[p] = r[w - 1] || ''; } }); while (n.periods.length < rows.length) n.periods.push(''); });
      toast(`📋 ${rows.length}교시까지 넣었어요`);
    }
    if (a === 'neis') {
      const t = today(), mon = addDays(t, -((dowOf(t) + 6) % 7)); let got = 0;
      saveTT(n => { for (let w = 1; w <= 5; w++) { const l = NC.tt?.[addDays(mon, w - 1)] || []; if (l.some(Boolean)) { n.week[w] = [...l]; got++; } } while (n.periods.length < Math.max(...Object.values(n.week).map(l => l.length), 0)) n.periods.push(''); });
      toast(got ? `🏫 나이스에서 ${got}일치를 채웠어요` : '나이스에 이번 주 시간표가 없어요 (학교·학년·반 설정을 확인하거나 직접 적어 주세요)', 4000);
    }
    if (a === 'print') { const c = ttCfg(); return printH('시간표', `<table><tr><th>교시</th>${['월', '화', '수', '목', '금'].map(w => `<th>${w}</th>`).join('')}</tr>${c.periods.map((p, i) => `<tr><th>${i + 1}교시<br><small>${esc(p)}</small></th>${[1, 2, 3, 4, 5].map(w => `<td>${esc(c.week[w]?.[i] || '')}</td>`).join('')}</tr>`).join('')}</table>`); }
    return cRender();
  }
  if (g('rost')) {
    let k = 0; const list = $('rosterT').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(\d+)[\s\t.,)번]*\s*(.+)$/); k = m ? +m[1] : k + 1; return { no: m ? +m[1] : k, name: (m ? m[2] : l).replace(/\t.*/, '').trim() }; });
    put('class', { id: 'cls_roster', t: 'roster', list }); toast(`📋 ${list.length}명 저장했어요`); return cRender();
  }
  if ((d = g('att'))) { const [no, k] = d.att.split(':'); const cur = CL('att_' + clsDay)?.marks?.[no]?.k; attSave(no, { k: cur === k ? '' : k, why: cur === k ? '' : (CL('att_' + clsDay)?.marks?.[no]?.why || '질병') }); return cRender(); }
  if (g('attp')) {
    const r = roster(), mon = clsDay.slice(0, 7), days = S.cls.filter(x => x.t === 'att' && x.date?.startsWith(mon) && Object.keys(x.marks || {}).length).sort((a, b) => a.date.localeCompare(b.date));
    return printH(`${+mon.slice(5)}월 출결`, `<table><tr><th>날짜</th><th>학생</th><th>구분</th><th>사유</th><th>메모</th></tr>${days.flatMap(x => Object.entries(x.marks).map(([no, v]) => `<tr><td>${esc(dLabel(x.date))}</td><td>${no}. ${esc(r.find(s => String(s.no) === no)?.name || '')}</td><td>${esc(v.k)}</td><td>${esc(v.why || '')}</td><td>${esc(v.memo || '')}</td></tr>`)).join('') || '<tr><td colspan="5">기록 없음</td></tr>'}</table>`);
  }
  if ((d = g('cs'))) {
    const a = d.cs;
    if (a === 'cancel') { csEdit = ''; return cRender(); }
    if (a === 'print') { const l = S.cls.filter(y => y.t === 'counsel' && (!csF || String(y.no) === csF)).sort((x, y) => (x.date || '').localeCompare(y.date || '')); return printH('상담 기록', `<table><tr><th style="width:90px">날짜</th><th style="width:80px">대상</th><th>내용</th><th style="width:22%">후속 조치</th></tr>${l.map(y => `<tr><td>${esc(y.date)}<br>${esc(y.how || '')}</td><td>${esc(y.name || '')}<br>${esc(y.who || '')}</td><td class="pre">${esc(y.text || '')}</td><td class="pre">${esc(y.follow || '')}</td></tr>`).join('')}</table>`); }
    if (a === 'ai') {
      const raw = $('csText').value.trim(); if (!raw) return toast('내용을 먼저 적어 주세요');
      e.target.disabled = true; e.target.textContent = '✨ 다듬는 중…';
      try {
        const r = await gemini([{ role: 'user', parts: [{ text: raw }] }], { system: '너는 초등학교 교사의 상담 기록 도우미야. 받은 메모를 학교 상담 기록부 문체(~함, ~하기로 함)로 사실 위주로 다듬어. 없는 내용은 지어내지 마. 3~8문장. JSON {text}로만 답해.', schema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] }, temp: 0.3 });
        $('csText').value = r.text || r.reply || raw;
      } catch (err) { toast('⚠️ ' + err.message, 4000); }
      e.target.disabled = false; e.target.textContent = '✨ 기록 문체로 다듬기'; return;
    }
    if (a === 'save') {
      const no = $('csS').value, st = roster().find(s => String(s.no) === no);
      if (!$('csText').value.trim()) return toast('상담 내용을 적어 주세요');
      put('class', { ...(csEdit ? CL(csEdit) : {}), id: csEdit || uid('cs'), t: 'counsel', date: $('csD').value || today(), no, name: st ? st.name : no === 'etc' ? '그 밖' : '', who: $('csWho').value, how: $('csHow').value, text: $('csText').value.trim(), follow: $('csFollow').value.trim() });
      csEdit = ''; toast('🗣️ 상담 기록을 저장했어요'); return cRender();
    }
  }
  if ((d = g('cse'))) { csEdit = d.cse; cRender(); $('pClass').scrollTop = 0; return; }
  if ((d = g('csd'))) { if (confirm('이 상담 기록을 지울까요?')) { remove('class', d.csd); cRender(); } return; }
  if ((d = g('logd'))) { clsDay = d.logd; return cRender(); }
  if (g('logp')) {
    const mon = addDays(clsDay, -((dowOf(clsDay) + 6) % 7));
    return printH(`학급 일지 (${dLabel(mon)} 주)`, [0, 1, 2, 3, 4].map(i => { const dd = addDays(mon, i), x = CL('log_' + dd), tt = ttFor(dd); return `<h2>${esc(dLabel(dd))}</h2><table><tr><th style="width:80px">시간표</th><td>${tt.map((s, j) => s ? `${j + 1}.${esc(s)}` : '').filter(Boolean).join(' ') || '-'}</td></tr><tr><th>출결</th><td>${esc(attSummary(dd)) || '모두 출석'}</td></tr><tr><th>기록</th><td class="pre">${esc(x?.text || '')}</td></tr></table>`; }).join(''));
  }
});
$('pClass').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.tt) { const [w, p] = t.dataset.tt.split(':').map(Number); saveTT(n => { (n.week[w] ||= [])[p] = t.value.trim(); }); }
  else if (t.dataset.pt) saveTT(n => { n.periods[+t.dataset.pt] = t.value.trim(); });
  else if (t.id === 'ttPrefer') saveTT(n => { n.prefer = t.value; });
  else if (t.dataset.attw) attSave(t.dataset.attw, { why: t.value });
  else if (t.dataset.attm) attSave(t.dataset.attm, { memo: t.value.trim() });
  else if (t.id === 'csFilter') { csF = t.value; cRender(); }
});
$('pClass').addEventListener('input', e => {
  if (e.target.id !== 'logT') return;
  clearTimeout(logT); const day = clsDay, v = e.target.value;
  logT = setTimeout(() => { put('class', { ...(CL('log_' + day) || {}), id: 'log_' + day, t: 'log', date: day, text: v }); if ($('logSaved')) $('logSaved').textContent = '저장됨 ✔️'; }, 700);
});

/* ---------- 📁 서류철 (구글 드라이브에 걸기) ---------- */
let fileF = '';
function cFiles() {
  const l = S.cls.filter(x => x.t === 'file'), folders = [...new Set(l.map(x => x.folder || '기타'))].sort();
  const vis = l.filter(x => !fileF || (x.folder || '기타') === fileF).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="hint" style="margin-bottom:6px">파일은 <b>구글 드라이브</b>에 그대로 두고 여기엔 바로가기만 걸어요(노션 5MB 같은 제한 없음).</div>
  <div class="sub" style="flex-wrap:wrap"><button class="chip ${!fileF ? 'on' : ''}" data-ff="">전체 ${l.length}</button>${folders.map(f => `<button class="chip ${fileF === f ? 'on' : ''}" data-ff="${esc(f)}">📁 ${esc(f)} ${l.filter(x => (x.folder || '기타') === f).length}</button>`).join('')}</div>
  <div class="box">${vis.length ? vis.map(x => `<div class="row"><span class="when">${x.src === 'drive' ? '🗂️' : '🔗'}</span><div class="t"><div><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></div><small>📁 ${esc(x.folder || '기타')}${x.kind ? ' · ' + esc(x.kind) : ''} · ${esc(x.date || '')}</small></div><button class="del" data-fmv="${x.id}" title="폴더 바꾸기">📁</button><button class="del" data-fdel="${x.id}" title="빼기(드라이브 파일은 그대로)">✕</button></div>`).join('') : '<div class="none">걸어 둔 서류가 없어요</div>'}</div>
  <div class="card" style="margin-top:10px"><h4>🔍 드라이브에서 찾아 걸기</h4>
  <div class="row2"><input class="fld" id="fQ" placeholder="파일 이름 (예: 학급 운영 계획)"><button class="g" data-fa="find" style="padding:9px 12px">찾기</button></div><div id="fFound"></div></div>
  <div class="card"><h4>🔗 주소로 걸기</h4>
  <input class="fld" id="fT" placeholder="이름 (예: 2학기 평가 계획)"><input class="fld" id="fU" placeholder="https://…">
  <div class="row2"><input class="fld" id="fFolder" list="fFolders" placeholder="폴더 (예: 평가, 학급 운영)" value="${esc(fileF)}"><datalist id="fFolders">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist><button class="p" data-fa="link" style="padding:9px 14px">걸기</button></div></div>
  <div class="bar"><button class="g" data-fa="up">📤 드라이브에 파일 올리기</button></div>
  <div class="hint">📤 누르면 구글 드라이브가 새 창으로 열려요 → 파일을 올린 뒤 여기서 🔍 찾아 걸기. 드라이브 찾기는 ⚙️ 구글 계정에서 "드라이브" 허락이 있어야 해요.</div>`;
}
let fRes = [];
function cFilesAfter() {}
$('pClass').addEventListener('click', async e => {
  const t = e.target.closest('[data-ff],[data-fa],[data-fdel],[data-fmv],[data-fpick]'); if (!t) return;
  const d = t.dataset, folder = () => ($('fFolder')?.value || fileF || '기타').trim() || '기타';
  if ('ff' in d) { fileF = d.ff; return cRender(); }
  if (d.fdel) { remove('class', d.fdel); return cRender(); }
  if (d.fmv) { const x = CL(d.fmv), f = prompt('어느 폴더로 옮길까요?', x.folder || ''); if (f != null) { put('class', { ...x, folder: f.trim() || '기타' }); cRender(); } return; }
  if (d.fpick) {
    const x = fRes[+d.fpick]; if (!x) return;
    if (S.cls.some(y => y.t === 'file' && y.url === x.link)) return toast('이미 걸어 둔 파일이에요');
    put('class', { id: uid('f'), t: 'file', src: 'drive', title: x.name, url: x.link, kind: x.kind, folder: folder(), date: today() });
    toast(`📁 ${folder()}에 걸었어요`); t.disabled = true; t.textContent = '✔️ 걸었어요'; return;
  }
  if (d.fa === 'up') { window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener'); return; }
  if (d.fa === 'link') {
    const title = $('fT').value.trim(), url = $('fU').value.trim();
    if (!/^https?:\/\//.test(url)) return toast('https:// 로 시작하는 주소를 넣어 주세요');
    put('class', { id: uid('f'), t: 'file', src: 'link', title: title || url.replace(/^https?:\/\//, '').slice(0, 40), url, folder: folder(), date: today() });
    toast('🔗 걸었어요'); return cRender();
  }
  if (d.fa === 'find') {
    const q = $('fQ').value.trim(); if (!q) return toast('찾을 이름을 넣어 주세요');
    if (!owner) return toast('먼저 ⚙️에서 로그인하고 구글 계정을 연결해 주세요', 4000);
    $('fFound').innerHTML = '<div class="hint">찾는 중…</div>';
    try {
      const r = await gcall('drive_find', { q }); fRes = r.files || [];
      $('fFound').innerHTML = fRes.length ? fRes.map((x, i) => `<div class="row"><div class="t"><div>${esc(x.name)}</div><small>${esc(x.kind)} · ${esc(x.label)} · ${esc(x.modified)}</small></div><button class="g" data-fpick="${i}" style="padding:5px 10px;font-size:13px">＋ 걸기</button></div>`).join('') : '<div class="hint">못 찾았어요</div>';
    } catch (err) { $('fFound').innerHTML = `<div class="hint">⚠️ ${esc(err.message)}</div>`; }
  }
});

/* ---------- 🎲 교실 도구 (타이머·뽑기·자리 바꾸기·점수판·대진표) ---------- */
function cTools() {
  return `<div class="bar" style="flex-direction:column;align-items:stretch">${[['timer', '⏱️ 타이머', '큰 숫자, 끝나면 소리'], ['draw', '🎲 뽑기', '명렬표에서 한 명씩 (번호로도)'], ['seats', '🪑 자리 바꾸기', '모둠·줄 수 정해서 섞기, 인쇄'], ['score', '🏆 점수판', '모둠 대결 점수'], ['bracket', '🥇 대진표', '토너먼트, 이긴 쪽 누르기']].map(([k, l, s]) => `<button class="g" data-tool="${k}" style="text-align:left;padding:14px"><b>${l}</b> <small style="color:var(--sub)">${s}</small></button>`).join('')}</div><p class="hint">TV에 띄울 땐 도구를 열고 브라우저 전체 화면(F11)을 쓰세요.</p>`;
}
let toolK = '', TMR = null;
const TS = (() => { try { return JSON.parse(ls.get('tools') || '{}'); } catch (e) { return {}; } })();
const tsave = () => ls.set('tools', JSON.stringify(TS));
const names = () => roster().map(s => s.name);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function beep(n = 3) { try { const ac = new AudioContext(); for (let i = 0; i < n; i++) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.4, ac.currentTime + i * 0.45); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.45 + 0.35); o.start(ac.currentTime + i * 0.45); o.stop(ac.currentTime + i * 0.45 + 0.4); } } catch (e) {} }
function openTool(k) { toolK = k; $('tool').classList.add('show'); tRender(); }
function closeTool() { $('tool').classList.remove('show', 'flash'); toolK = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && toolK) closeTool(); });
function tRender() {
  const T = $('tool'), head = t => `<div class="th"><b>${t}</b><button data-tx="1">✕ 닫기</button></div>`;
  if (toolK === 'timer') {
    const tm = TS.timer ||= { total: 300 }, left = TMR ? Math.max(0, Math.ceil((TMR.end - Date.now()) / 1000)) : (tm.left ?? tm.total);
    T.innerHTML = head('⏱️ 타이머') + `<div class="tb" style="justify-content:center"><div class="bigt" id="tmD">${Math.floor(left / 60)}:${pad(left % 60)}</div>
    <div class="bar" style="justify-content:center">${[1, 3, 5, 10, 15].map(m => `<button data-tm="set:${m * 60}">${m}분</button>`).join('')}<button data-tm="add:60">＋1분</button><button data-tm="add:-60">－1분</button><button data-tm="add:10">＋10초</button></div>
    <div class="bar" style="justify-content:center"><button class="p" data-tm="go" style="font-size:22px;padding:12px 30px">${TMR ? '⏸ 멈춤' : '▶ 시작'}</button><button data-tm="reset" style="font-size:22px;padding:12px 20px">↺</button></div></div>`;
  } else if (toolK === 'draw') {
    const dr = TS.draw ||= { mode: 'name', n: 25, used: [], noRep: true };
    const pool = dr.mode === 'name' && names().length ? names() : Array.from({ length: +dr.n || 25 }, (_, i) => String(i + 1));
    T.innerHTML = head('🎲 뽑기') + `<div class="tb"><div class="bar" style="justify-content:center"><select data-dr="mode"><option value="name" ${dr.mode === 'name' ? 'selected' : ''}>명렬표 이름 (${names().length}명)</option><option value="num" ${dr.mode === 'num' ? 'selected' : ''}>번호</option></select>${dr.mode === 'num' ? `<input data-dr="n" type="number" value="${+dr.n || 25}" style="width:80px"> 번까지` : ''}<label><input type="checkbox" data-dr="noRep" ${dr.noRep ? 'checked' : ''}> 뽑힌 사람 빼기</label><button data-dr="clear">처음부터</button></div>
    <div class="bign" id="drOut" style="flex:1;display:flex;align-items:center">${esc(dr.last || '?')}</div>
    <button class="p" data-dr="go" style="font-size:26px;padding:14px 44px">🎲 뽑기!</button>
    <div style="color:#aaa;font-size:15px;text-align:center">${dr.noRep ? `남은 ${pool.filter(x => !dr.used.includes(x)).length}/${pool.length} · ` : ''}뽑힌 차례: ${esc(dr.used.join(', ') || '-')}</div></div>`;
  } else if (toolK === 'seats') {
    const se = TS.seats ||= { cols: 6, list: [] };
    const l = se.list.length ? se.list : names();
    T.innerHTML = head('🪑 자리 바꾸기') + `<div class="tb"><div class="bar" style="justify-content:center">한 줄에 <input data-se="cols" type="number" min="2" max="10" value="${se.cols}" style="width:70px"> 자리 <button class="p" data-se="go">🔀 섞기</button><button data-se="print">🖨️ 인쇄</button></div>
    <div style="background:#2f9e44;border-radius:8px;padding:8px 40px;font-weight:700">칠판</div>
    ${l.length ? `<div class="seats" style="grid-template-columns:repeat(${se.cols},1fr)">${l.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : '<div style="color:#aaa">📋 명렬표를 먼저 넣어 주세요</div>'}</div>`;
  } else if (toolK === 'score') {
    const sc = TS.score ||= { teams: [['1모둠', 0], ['2모둠', 0], ['3모둠', 0], ['4모둠', 0]] };
    T.innerHTML = head('🏆 점수판') + `<div class="tb"><div class="bar" style="justify-content:center"><button data-sc="add">＋ 모둠</button><button data-sc="del">－ 모둠</button><button data-sc="zero">점수 0으로</button></div>
    <div class="teams">${sc.teams.map(([n, s], i) => `<div class="team"><input data-scn="${i}" value="${esc(n)}"><div class="sc">${s}</div><div class="bar" style="justify-content:center"><button class="p" data-sc="+:${i}" style="font-size:22px;padding:8px 20px">＋1</button><button data-sc="-:${i}" style="font-size:22px;padding:8px 16px">－1</button></div></div>`).join('')}</div></div>`;
  } else if (toolK === 'bracket') {
    const bk = TS.bracket ||= { rounds: [] };
    T.innerHTML = head('🥇 대진표') + `<div class="tb">${bk.rounds.length ? `<div class="bar" style="justify-content:center"><button data-bk="reset">새로 만들기</button></div><div class="brk">${bk.rounds.map((rd, ri) => `<div class="rd">${rd.map((m, mi) => `<div class="m">${m.map((n, k) => `<div data-bk="w:${ri}:${mi}:${k}" class="${m.w == null ? '' : m.w === k ? 'w' : 'l'}">${n == null ? '…' : esc(n || '(부전승)')}</div>`).join('')}</div>`).join('')}</div>`).join('')}${(() => { const f = bk.rounds[bk.rounds.length - 1]?.[0]; return f && f.w != null && bk.rounds[bk.rounds.length - 1].length === 1 ? `<div class="rd"><div class="bign" style="font-size:40px">🏆 ${esc(f[f.w])}</div></div>` : ''; })()}</div>` : `<textarea id="bkT" rows="8" style="width:min(500px,100%)" placeholder="한 줄에 하나 (모둠·학생 이름)">${esc(names().join('\n'))}</textarea><button class="p" data-bk="make">대진표 만들기</button>`}</div>`;
  }
}
function bkBuild(list) {
  let size = 1; while (size < list.length) size *= 2;
  const l = shuffle(list), byes = size - l.length, pairs = []; let k = 0;
  for (let i = 0; i < size / 2; i++) pairs.push(i < byes ? [l[k++], ''] : [l[k++], l[k++]]); // 남는 자리는 부전승
  const rounds = [shuffle(pairs)];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => [null, null]));
  rounds.forEach(rd => rd.forEach(m => { m.w = null; }));
  const r0 = rounds[0]; r0.forEach((m, i) => { if (!m[0] !== !m[1]) bkWin(rounds, 0, i, m[0] ? 0 : 1); });
  return rounds;
}
function bkWin(rounds, ri, mi, k) {
  const m = rounds[ri][mi]; if (m[k] == null) return; m.w = k;
  const nx = rounds[ri + 1]; if (!nx) return;
  const t = nx[Math.floor(mi / 2)]; t[mi % 2] = m[k];
  // 위 판이 바뀌면 그 뒤 결과는 지워요
  for (let r = ri + 1, j = Math.floor(mi / 2); rounds[r]; j = Math.floor(j / 2), r++) { rounds[r][j].w = null; if (rounds[r + 1]) rounds[r + 1][Math.floor(j / 2)][j % 2] = null; }
}
$('tool').addEventListener('click', e => {
  const t = e.target.closest('button,[data-bk]'); if (!t) return;
  const d = t.dataset;
  if (d.tx) return closeTool();
  if (d.tm) {
    const tm = TS.timer, [a, v] = d.tm.split(':');
    const left = () => TMR ? Math.max(0, Math.ceil((TMR.end - Date.now()) / 1000)) : (tm.left ?? tm.total);
    if (a === 'set') { stopT(); tm.total = tm.left = +v; }
    if (a === 'add') { const n = Math.max(0, left() + +v); if (TMR) TMR.end += +v * 1000; else tm.left = n; if (!TMR) tm.total = Math.max(tm.total, n); }
    if (a === 'reset') { stopT(); tm.left = tm.total; $('tool').classList.remove('flash'); }
    if (a === 'go') { if (TMR) { tm.left = left(); stopT(); } else if (left() > 0) { $('tool').classList.remove('flash'); TMR = { end: Date.now() + left() * 1000, iv: setInterval(tickT, 250) }; } }
    tsave(); return tRender();
  }
  if (d.dr === 'go') {
    const dr = TS.draw, pool0 = dr.mode === 'name' && names().length ? names() : Array.from({ length: +dr.n || 25 }, (_, i) => String(i + 1));
    const pool = dr.noRep ? pool0.filter(x => !dr.used.includes(x)) : pool0;
    if (!pool.length) return toast('모두 뽑았어요! "처음부터"를 눌러 주세요');
    const pick = pool[Math.floor(Math.random() * pool.length)]; let k = 0; t.disabled = true;
    const iv = setInterval(() => { $('drOut').textContent = pool[Math.floor(Math.random() * pool.length)]; if (++k > 18) { clearInterval(iv); dr.last = pick; dr.used.push(pick); tsave(); tRender(); beep(1); } }, 70);
    return;
  }
  if (d.dr === 'clear') { TS.draw.used = []; TS.draw.last = ''; tsave(); return tRender(); }
  if (d.se === 'go') { TS.seats.list = shuffle(names()); tsave(); return tRender(); }
  if (d.se === 'print') { const se = TS.seats, l = se.list.length ? se.list : names(); const rows = []; for (let i = 0; i < l.length; i += se.cols) rows.push(l.slice(i, i + se.cols)); return printH('자리 배치', `<p style="text-align:center;font-weight:700;border:2px solid #333;padding:6px">칠판</p><table>${rows.map(r => `<tr>${r.map(n => `<td style="text-align:center;padding:14px 4px;font-size:16px">${esc(n)}</td>`).join('')}</tr>`).join('')}</table>`); }
  if (d.sc) {
    const sc = TS.score, [a, i] = d.sc.split(':');
    if (a === '+') sc.teams[+i][1]++; if (a === '-') sc.teams[+i][1]--;
    if (a === 'add' && sc.teams.length < 8) sc.teams.push([`${sc.teams.length + 1}모둠`, 0]);
    if (a === 'del' && sc.teams.length > 2) sc.teams.pop();
    if (a === 'zero') sc.teams.forEach(x => { x[1] = 0; });
    tsave(); return tRender();
  }
  if (d.bk === 'make') { const l = $('bkT').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if (l.length < 2) return toast('두 개 이상 적어 주세요'); TS.bracket.rounds = bkBuild(l); tsave(); return tRender(); }
  if (d.bk === 'reset') { TS.bracket.rounds = []; tsave(); return tRender(); }
  if (d.bk?.startsWith('w:')) { const [, ri, mi, k] = d.bk.split(':').map(Number); const m = TS.bracket.rounds[ri][mi]; if (m[0] == null || m[1] == null || !m[k]) return; bkWin(TS.bracket.rounds, ri, mi, k); tsave(); return tRender(); }
});
$('tool').addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.dr) { TS.draw[d.dr] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (d.dr === 'mode' || d.dr === 'n') TS.draw.used = []; tsave(); tRender(); }
  if (d.se === 'cols') { TS.seats.cols = Math.min(10, Math.max(2, +e.target.value || 6)); tsave(); tRender(); }
  if (d.scn) { TS.score.teams[+d.scn][0] = e.target.value; tsave(); }
});
function stopT() { if (TMR) { clearInterval(TMR.iv); TMR = null; } }
function tickT() {
  const left = Math.max(0, Math.ceil((TMR.end - Date.now()) / 1000));
  if ($('tmD')) $('tmD').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  if (left <= 0) { stopT(); TS.timer.left = 0; tsave(); beep(4); $('tool').classList.add('flash'); if (toolK === 'timer') tRender(); }
}

/* ---------- 📝 노트·회의록·일기 + ✨ AI 요약 + 🎙️ 녹음 받아쓰기 (v0.29) ---------- */
const NT = { note: ['📝', '노트'], meeting: ['🗣️', '회의록'], diary: ['📔', '일기'] };
let noteOpen = '', noteF = ls.get('noteF', 'all'), noteQ = '', noteT = null;
function newNote(type, extra = {}) {
  const now = new Date(), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const n = { id: uid('n'), type, date: today(), title: type === 'meeting' ? `회의록 ${today().slice(5).replace('-', '/')} ${hm}` : type === 'diary' ? `${dLabel(today())} 일기` : '', body: '', created: Date.now(), updated: Date.now(), ...extra };
  put('note', n); noteOpen = n.id; return n;
}
function nRender() {
  const box = $('noteBody'); if (!box) return;
  if (noteOpen && S.notes.find(x => x.id === noteOpen)) return renderNote();
  noteOpen = '';
  const q = noteQ.toLowerCase();
  const l = S.notes.filter(n => (noteF === 'all' || n.type === noteF) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0));
  box.innerHTML = `<div class="bar"><button class="p" data-nn="note">＋ 노트</button><button class="g" data-nn="meeting">🗣️ 회의록</button><button class="g" data-nn="diary">📔 오늘 일기</button><button class="g" data-nn="rec" style="border-color:#e03131;color:#e03131">🎙️ 회의 녹음</button><button class="g" data-nn="file">📎 녹음 파일</button></div>
  <div class="row2"><input class="fld" id="nQ" placeholder="🔍 노트 찾기" value="${esc(noteQ)}"></div>
  <div class="sub" style="margin-top:8px">${[['all', '전체'], ['note', '📝 노트'], ['meeting', '🗣️ 회의록'], ['diary', '📔 일기']].map(([k, t]) => `<button class="chip ${noteF === k ? 'on' : ''}" data-nf="${k}">${t} ${k === 'all' ? S.notes.length : S.notes.filter(n => n.type === k).length}</button>`).join('')}</div>
  ${l.length ? l.map(n => `<div class="card" data-no="${n.id}" style="cursor:pointer"><h4>${NT[n.type]?.[0] || '📝'} ${esc(n.title || '(제목 없음)')}</h4><div class="meta">${esc(dLabel(n.date))}${n.sum ? ' · ✨ 요약됨' : ''}${REC_Q.some(j => j.noteId === n.id) || REC?.noteId === n.id ? ' · ✍️ 받아쓰는 중' : ''}</div><div style="font-size:13.5px;color:var(--sub);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc((n.sum?.summary || n.body || '').replace(/[#*\-]/g, ' ').slice(0, 160))}</div></div>`).join('') : '<div class="box"><div class="none">노트가 없어요. 🎙️ 회의 녹음을 누르면 받아쓰기·요약까지 저절로 해요</div></div>'}
  <p class="hint">🎙️ 녹음: 누르면 바로 녹음 → ⏹ 끝을 누르면 받아쓰기·요약·할 일 뽑기까지 저절로. 폰 녹음 앱이나 클로바노트에서 <b>공유 → AI 딸기</b>로 보내도 돼요. 폰 홈 화면의 AI 딸기 아이콘을 길게 누르면 "🎙️ 회의 녹음"으로 바로 시작해요.</p>
  <input type="file" id="nFile" accept="audio/*,.m4a,.mp3,.wav,.amr,.3gp,.txt,text/plain" hidden>`;
}
function renderNote() {
  const n = S.notes.find(x => x.id === noteOpen); if (!n) { noteOpen = ''; return nRender(); }
  const s = n.sum;
  $('noteBody').innerHTML = `<div class="bar" style="margin-top:0"><button class="g" data-nb="back">← 목록</button><select class="fld" id="nType" style="max-width:130px;margin:0">${Object.entries(NT).map(([k, [i, t]]) => `<option value="${k}" ${n.type === k ? 'selected' : ''}>${i} ${t}</option>`).join('')}</select><input class="fld" type="date" id="nDate" value="${esc(n.date)}" style="max-width:160px;margin:0"></div>
  <input class="fld" id="nTitle" value="${esc(n.title)}" placeholder="제목" style="font-weight:700">
  <div id="recBar" class="hint" style="font-size:13.5px"></div>
  <textarea class="fld" id="nBodyT" rows="14" placeholder="${n.type === 'meeting' ? '회의 내용을 적거나 🎙️ 녹음을 눌러요' : '적으면 저절로 저장돼요'}">${esc(n.body)}</textarea>
  <div class="bar"><button class="p" data-nb="sum">✨ AI 요약</button><button class="g" data-nb="rec" style="color:#e03131">🎙️ 녹음</button><button class="g" data-nb="file">📎 녹음 파일</button><button class="g" data-nb="docx">📄 워드</button><button class="g" data-nb="print">🖨️</button><button class="g" data-nb="del">🗑️</button></div>
  ${s ? `<div class="sumbox"><b>✨ 요약</b>${md(s.summary || '')}${s.decisions?.length ? `<b>📌 정해진 것</b><ul>${s.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(s.todos?.length || s.events?.length) ? `<b>👉 넣을 것</b>${(s.todos || []).map((x, i) => `<div class="it"><span>✅ ${esc(x.title)}${okDate(x.date) ? ` <small>~${esc(dLabel(x.date))}</small>` : ''}</span>${(s.added || []).includes('t' + i) ? '<small>✔️ 넣음</small>' : `<button class="g" data-nadd="t${i}">할 일로</button>`}</div>`).join('')}${(s.events || []).map((x, i) => `<div class="it"><span>📅 ${esc(okDate(x.date) ? dLabel(x.date) : '날짜?')} ${esc(x.time || '')} ${esc(x.title)}</span>${(s.added || []).includes('e' + i) ? '<small>✔️ 넣음</small>' : okDate(x.date) ? `<button class="g" data-nadd="e${i}">일정으로</button>` : ''}</div>`).join('')}${(s.todos || []).some((_, i) => !(s.added || []).includes('t' + i)) || (s.events || []).some((x, i) => okDate(x.date) && !(s.added || []).includes('e' + i)) ? '<div class="bar"><button class="p" data-nadd="all">모두 넣기</button></div>' : ''}` : ''}</div>` : ''}
  <input type="file" id="nFile" accept="audio/*,.m4a,.mp3,.wav,.amr,.3gp,.txt,text/plain" hidden>`;
  recBar();
}
function flushNote() { // 쓰던 글을 바로 저장
  const n = S.notes.find(x => x.id === noteOpen); if (!n || !$('nBodyT')) return n;
  clearTimeout(noteT);
  const v = { title: $('nTitle').value, body: $('nBodyT').value, date: $('nDate').value || n.date, type: $('nType').value };
  if (v.title !== n.title || v.body !== n.body || v.date !== n.date || v.type !== n.type) { Object.assign(n, v, { updated: Date.now() }); put('note', n); }
  return n;
}
$('pNote').addEventListener('input', e => {
  if (e.target.id === 'nQ') { noteQ = e.target.value; clearTimeout(noteT); noteT = setTimeout(() => { nRender(); const i = $('nQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); return; }
  if (/^n(Title|BodyT|Date|Type)$/.test(e.target.id)) { clearTimeout(noteT); noteT = setTimeout(flushNote, 600); }
});
$('pNote').addEventListener('change', e => { if (/^n(Date|Type)$/.test(e.target.id)) flushNote(); if (e.target.id === 'nFile') { const f = e.target.files[0]; e.target.value = ''; if (f) fileIn(f); } });
$('pNote').addEventListener('click', async e => {
  const g = k => e.target.closest(`[data-${k}]`)?.dataset; let d;
  if ((d = g('nf'))) { noteF = d.nf; ls.set('noteF', noteF); return nRender(); }
  if ((d = g('no'))) { noteOpen = d.no; return nRender(); }
  if ((d = g('nn'))) {
    if (d.nn === 'rec') return scMeeting();
    if (d.nn === 'file') { noteOpen = ''; return $('nFile').click(); }
    if (d.nn === 'diary') { const x = S.notes.find(n => n.type === 'diary' && n.date === today()); if (x) noteOpen = x.id; else newNote('diary'); return nRender(); }
    newNote(d.nn); nRender(); $('nTitle')?.focus(); return;
  }
  if ((d = g('nb'))) {
    const n = flushNote(); if (!n) return;
    if (d.nb === 'back') { noteOpen = ''; if (!n.title.trim() && !n.body.trim() && !REC_Q.some(j => j.noteId === n.id) && REC?.noteId !== n.id) remove('note', n.id); return nRender(); }
    if (d.nb === 'del') { if (REC?.noteId === n.id) return toast('녹음을 먼저 끝내 주세요'); if (confirm(`"${n.title || '이 노트'}"를 지울까요?`)) { remove('note', n.id); noteOpen = ''; nRender(); } return; }
    if (d.nb === 'rec') return recStart(n.id);
    if (d.nb === 'file') return $('nFile').click();
    if (d.nb === 'docx') return downloadDocx(`# ${n.title || '노트'}\n\n${n.sum ? '## 요약\n' + n.sum.summary + '\n\n' + (n.sum.decisions?.length ? '## 정해진 것\n' + n.sum.decisions.map(x => '- ' + x).join('\n') + '\n\n' : '') + '## 내용\n' : ''}${n.body}`);
    if (d.nb === 'print') return printH(n.title || '노트', `<p>${esc(dLabel(n.date))}</p>${n.sum ? `<h2>요약</h2>${md(n.sum.summary || '')}${n.sum.decisions?.length ? `<h2>정해진 것</h2><ul>${n.sum.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : ''}<h2>내용</h2><div class="pre">${esc(n.body)}</div>`);
    if (d.nb === 'sum') {
      if (!n.body.trim()) return toast('내용이 없어요');
      e.target.disabled = true; e.target.textContent = '✨ 요약하는 중…';
      try { await summarize(n); toast('✨ 요약했어요'); } catch (err) { toast('⚠️ ' + err.message, 5000); }
      return renderNote();
    }
  }
  if ((d = g('nadd'))) {
    const n = S.notes.find(x => x.id === noteOpen); if (!n?.sum) return;
    const s = n.sum, added = s.added ||= [], keys = d.nadd === 'all' ? [...(s.todos || []).map((_, i) => 't' + i), ...(s.events || []).map((_, i) => 'e' + i)] : [d.nadd];
    let c = 0;
    for (const k of keys) {
      if (added.includes(k)) continue; const i = +k.slice(1);
      if (k[0] === 't' && s.todos[i]) { put('todo', { id: uid('t'), title: s.todos[i].title, due: okDate(s.todos[i].date) ? s.todos[i].date : '', done: false, from: n.id }); added.push(k); c++; }
      if (k[0] === 'e' && s.events[i] && okDate(s.events[i].date)) { put('event', { id: uid('e'), date: s.events[i].date, time: okTime(s.events[i].time), title: s.events[i].title, from: n.id }); added.push(k); c++; }
    }
    put('note', n); toast(c ? `👉 ${c}개를 넣었어요 (할 일·일정 탭)` : '넣을 게 없어요'); return renderNote();
  }
});
const NSCHEMA = { type: 'OBJECT', properties: { summary: { type: 'STRING' }, decisions: { type: 'ARRAY', items: { type: 'STRING' } }, todos: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, date: { type: 'STRING' } }, required: ['title'] } }, events: { type: 'ARRAY', items: { type: 'OBJECT', properties: { date: { type: 'STRING' }, time: { type: 'STRING' }, title: { type: 'STRING' } }, required: ['title'] } } }, required: ['summary'] };
async function summarize(n) {
  const t = today(), cal = Array.from({ length: 21 }, (_, i) => { const d = addDays(t, i); return `${d}(${WD[dowOf(d)]})`; }).join(', ');
  const sys = `너는 초등학교 선생님의 노트·회의록 정리 비서야. 한국어로, 지어내지 말고 글에 있는 것만.
- summary: 핵심을 마크다운 목록(- )으로 3~10줄. 회의록이면 안건별로 묶어. 받아쓰기라 말이 엉켜 있어도 뜻을 살려 정리해.
- decisions: 정해진 것(결정 사항)을 짧게. 없으면 빈 목록.
- todos: 이 노트를 쓴 사람(선생님 본인)이 해야 할 일. 마감이 나오면 date=YYYY-MM-DD(아래 달력으로 계산), 없으면 비워.
- events: 날짜가 정해진 행사·회의·마감 일정. date=YYYY-MM-DD, time=HH:MM(모르면 비워).
[오늘] ${t}(${WD[dowOf(t)]}) [노트 날짜] ${n.date} [달력] ${cal}`;
  const r = await gemini([{ role: 'user', parts: [{ text: `제목: ${n.title}\n종류: ${NT[n.type]?.[1] || '노트'}\n\n${n.body.slice(0, 120000)}` }] }], { system: sys, schema: NSCHEMA, temp: 0.3, timeout: 150000 });
  n.sum = { summary: r.summary || r.reply || '', decisions: r.decisions || [], todos: r.todos || [], events: r.events || [], added: [], at: Date.now() };
  put('note', n);
}
// 🎙️ 녹음 → 5분씩 끊어 16kHz wav로 바꿔 제미나이에 받아쓰기 (wav는 제미나이가 꼭 알아듣는 형식이라 폰·PC 어디서든 같아요)
const SEG_MS = 5 * 60 * 1000, REC_Q = [], REC_FAIL = [], WANT_SUM = new Set();
let REC = null, qBusy = false, qNow = '';
const TSYS = '너는 회의 녹음을 받아쓰는 비서야. 들리는 한국어를 빠짐없이 그대로 받아써. 말하는 사람이 바뀌면 줄을 바꾸고, 구분되면 "화자1:"처럼 앞에 붙여. 음·어 같은 군더더기는 빼. 잘 안 들리면 (안 들림). 말이 없으면 빈 글자. JSON {text}로만 답해.';
async function recStart(noteId) {
  if (REC) { toast('이미 녹음 중이에요'); return goNote(REC.noteId); }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('이 브라우저는 녹음을 못 해요 (크롬을 써 주세요)', 4000);
  if (!ls.get('gkey')) { toast('먼저 ⚙️ 설정에서 AI 키를 넣어 주세요', 4000); return openSet(); }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { return toast('마이크를 쓸 수 없어요. 주소창 옆 🔒에서 마이크를 허락해 주세요', 5000); }
  REC = { noteId, stream, on: true, start: Date.now(), seg: 0, wake: null };
  try { REC.wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  recSeg(); REC.tick = setInterval(recBar, 1000); recBar();
  toast('🎙️ 녹음 시작! 화면을 켜 둔 채로 두세요 (5분마다 받아쓰기해요)', 4000);
}
function recSeg() {
  let mr; try { mr = new MediaRecorder(REC.stream, { audioBitsPerSecond: 32000 }); } catch (e) { mr = new MediaRecorder(REC.stream); }
  const parts = [], idx = ++REC.seg, noteId = REC.noteId;
  mr.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  mr.onstop = () => {
    const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' });
    if (blob.size > 3000) { REC_Q.push({ blob, noteId, idx, name: `녹음-${idx}.webm` }); pumpQ(); }
    if (REC && REC.on) recSeg(); else if (REC) recEnd();
  };
  REC.mr = mr; mr.start(1000);
  REC.segT = setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, SEG_MS);
}
function recStop() { if (!REC) return; REC.on = false; clearTimeout(REC.segT); if (REC.mr && REC.mr.state !== 'inactive') REC.mr.stop(); else recEnd(); }
function recEnd() {
  REC.stream.getTracks().forEach(t => t.stop()); clearInterval(REC.tick); try { REC.wake?.release(); } catch (e) {}
  const id = REC.noteId; REC = null; WANT_SUM.add(id); recBar(); pumpQ();
  toast('⏹ 녹음 끝! 받아쓰기·요약을 마저 해요(앱을 닫지 마세요)', 4000);
}
document.addEventListener('visibilitychange', async () => { if (REC && document.visibilityState === 'visible' && !REC.wake) try { REC.wake = await navigator.wakeLock?.request('screen'); } catch (e) {} });
function goNote(id) { noteOpen = id; goPage('pNote'); }
$('recGo').onclick = () => { const id = REC?.noteId || REC_Q[0]?.noteId || qNow; if (id) goNote(id); };
$('recStopB').onclick = () => recStop();
function recBar() {
  const mm = REC ? Math.floor((Date.now() - REC.start) / 1000) : 0;
  const parts = [];
  if (REC) parts.push(`🔴 녹음 중 ${Math.floor(mm / 60)}:${pad(mm % 60)}`);
  if (REC_Q.length || qBusy) parts.push(qNow === 'sum' ? '✨ 요약 중' : `✍️ 받아쓰는 중${REC_Q.length > 1 ? ` (${REC_Q.length}개 남음)` : ''}`);
  if (REC_FAIL.length) parts.push(`⚠️ ${REC_FAIL.length}개 실패`);
  const txt = parts.join(' · ');
  $('recPill').classList.toggle('show', !!txt); $('recPill').classList.toggle('idle', !REC); $('recTxt').textContent = txt; $('recStopB').style.display = REC ? '' : 'none';
  const b = $('recBar');
  if (b) b.innerHTML = txt ? `${esc(txt)} ${REC && REC.noteId === noteOpen ? '<button class="chip" id="recStop2" style="color:#c92a2a;border-color:#c92a2a">⏹ 녹음 끝내기</button>' : ''}${REC_FAIL.length ? ' <button class="chip" id="recRetry">🔁 다시</button> <button class="chip" id="recSave">⬇️ 녹음 파일 받기</button>' : ''}` : '';
  if ($('recStop2')) $('recStop2').onclick = recStop;
  if ($('recRetry')) $('recRetry').onclick = () => { REC_Q.push(...REC_FAIL.splice(0)); pumpQ(); };
  if ($('recSave')) $('recSave').onclick = () => REC_FAIL.forEach(j => { const a = document.createElement('a'); a.href = URL.createObjectURL(j.blob); a.download = j.name || 'rec.webm'; a.click(); });
}
async function pumpQ() {
  if (qBusy) return; qBusy = true; recBar();
  try {
    while (REC_Q.length) {
      const j = REC_Q[0]; qNow = j.noteId; recBar();
      try {
        const txt = j.file ? await transcribeBig(j.blob) : await transcribe(j.blob, j.wav);
        appendNote(j.noteId, txt); REC_Q.shift();
      } catch (e) { REC_Q.shift(); REC_FAIL.push(j); toast('⚠️ 받아쓰기 실패: ' + e.message, 6000); }
    }
    for (const id of [...WANT_SUM]) {
      if (REC?.noteId === id || REC_Q.some(j => j.noteId === id)) continue;
      WANT_SUM.delete(id);
      const n = S.notes.find(x => x.id === id); if (!n || !n.body.trim()) continue;
      qNow = 'sum'; recBar();
      try { await summarize(n); if (noteOpen === id && $('pNote').classList.contains('on')) renderNote(); toast('✨ 받아쓰기·요약 끝! 👉 넣을 것을 확인해 주세요', 5000); }
      catch (e) { toast('⚠️ 요약 실패: ' + e.message + ' (✨ AI 요약을 다시 눌러 주세요)', 6000); }
    }
  } finally { qBusy = false; qNow = ''; recBar(); if (REC_Q.length) pumpQ(); }
}
function appendNote(id, txt) {
  txt = (txt || '').trim(); if (!txt) return;
  if (noteOpen === id) flushNote();
  const n = S.notes.find(x => x.id === id); if (!n) return;
  n.body = (n.body.trim() ? n.body.trimEnd() + '\n\n' : '') + txt; n.updated = Date.now(); put('note', n);
  const t = $('nBodyT'); if (t && noteOpen === id) { const end = t.selectionStart >= t.value.length - 1; t.value = n.body; if (end) t.scrollTop = t.scrollHeight; }
}
async function toWav(blob, maxSec = 300) { // 어떤 녹음이든 → 16kHz 한 채널 wav 조각들
  const ab = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac; try { ac = new AC({ sampleRate: 16000 }); } catch (e) { ac = new AC(); }
  let buf; try { buf = await new Promise((ok, no) => { const p = ac.decodeAudioData(ab, ok, no); if (p?.then) p.then(ok, no); }); } finally { try { ac.close(); } catch (e) {} }
  const ch = buf.numberOfChannels, n0 = buf.length, sr0 = buf.sampleRate, mono = new Float32Array(n0);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n0; i++) mono[i] += d[i] / ch; }
  let pcm = mono;
  if (sr0 !== 16000) { const r = sr0 / 16000, n = Math.floor(n0 / r); pcm = new Float32Array(n); for (let i = 0; i < n; i++) { const a = Math.floor(i * r), b = Math.min(n0, Math.floor((i + 1) * r)); let s = 0; for (let k = a; k < b; k++) s += mono[k]; pcm[i] = s / Math.max(1, b - a); } }
  const out = [], step = 16000 * maxSec;
  for (let o = 0; o < pcm.length; o += step) {
    const part = pcm.subarray(o, Math.min(pcm.length, o + step)), dv = new DataView(new ArrayBuffer(44 + part.length * 2));
    const w = (p, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + part.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, part.length * 2, true);
    for (let i = 0; i < part.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, part[i])) * 0x7fff, true);
    out.push(new Blob([dv], { type: 'audio/wav' }));
  }
  return out;
}
const b64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
async function transcribe(blob, isWav) {
  const parts = isWav ? [blob] : await toWav(blob);
  const texts = [];
  for (const w of parts) {
    if (w.size < 16000) continue; // 0.5초도 안 되는 조각
    const r = await gemini([{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: await b64(w) } }, { text: '이 녹음을 받아써 줘.' }] }], { system: TSYS, schema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] }, temp: 0.1, timeout: 180000 });
    texts.push((r.text ?? r.reply ?? '').trim());
  }
  return texts.filter(Boolean).join('\n');
}
async function transcribeBig(file) { // 아주 큰 녹음 파일 → 제미나이 파일 올리기(무료)로 한 번에
  const key = ls.get('gkey'); if (!key) throw new Error('AI 키가 없어요');
  const mime = file.type && /^audio\//.test(file.type) ? file.type.replace('x-m4a', 'mp4') : 'audio/mp4';
  const bd = 'b' + Math.random().toString(36).slice(2);
  const body = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ file: { display_name: 'meeting' } })}\r\n--${bd}\r\nContent-Type: ${mime}\r\n\r\n`, file, `\r\n--${bd}--\r\n`]);
  const up = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart', { method: 'POST', headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': `multipart/related; boundary=${bd}` }, body });
  if (!up.ok) throw new Error(`녹음 파일을 구글에 못 올렸어요(${up.status})`);
  let f = (await up.json()).file;
  for (let i = 0; i < 100 && f.state === 'PROCESSING'; i++) { await sleep(3000); f = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${f.name}`, { headers: { 'x-goog-api-key': key } })).json(); }
  if (f.state !== 'ACTIVE') throw new Error('구글이 녹음 파일을 읽지 못했어요');
  const r = await gemini([{ role: 'user', parts: [{ file_data: { mime_type: f.mimeType || mime, file_uri: f.uri } }, { text: '이 회의 녹음을 받아써 줘. 길면 말한 내용을 빠짐없이 요지 중심으로 적어 줘.' }] }], { system: TSYS, schema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] }, temp: 0.1, timeout: 300000 });
  return (r.text ?? r.reply ?? '').trim();
}
async function fileIn(f, noteId) { // 📎 녹음 파일·글 파일 → 노트
  const isText = /^text\//.test(f.type) || /\.txt$/i.test(f.name);
  if (!noteId) { const x = S.notes.find(n => n.id === noteOpen); noteId = x ? x.id : newNote('meeting', { title: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || '회의록' }).id; }
  noteOpen = noteId; goPage('pNote');
  if (isText) { appendNote(noteId, await f.text()); WANT_SUM.add(noteId); pumpQ(); return toast('📝 글을 넣고 AI가 정리해요'); }
  if (!ls.get('gkey')) { toast('먼저 ⚙️ 설정에서 AI 키를 넣어 주세요', 4000); return openSet(); }
  toast('🎧 녹음 파일을 받아써요. 길면 몇 분 걸려요', 4000);
  if (f.size <= 20e6) {
    try { const parts = await toWav(f); parts.forEach((w, i) => REC_Q.push({ blob: w, wav: true, noteId, idx: i + 1, name: f.name })); }
    catch (e) { REC_Q.push({ blob: f, file: true, noteId, name: f.name }); }
  } else REC_Q.push({ blob: f, file: true, noteId, name: f.name });
  WANT_SUM.add(noteId); pumpQ(); recBar();
}
async function scMeeting() { const n = newNote('meeting'); goPage('pNote'); await recStart(n.id); }
window.addEventListener('beforeunload', e => { if (REC || REC_Q.length || qBusy) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- 📤 공유 받기 (클로바노트 글·녹음 앱 파일·사진) ---------- */
async function takeShare() {
  let c, mr; try { c = await caches.open('ai-share'); mr = await c.match('/__share/meta'); } catch (e) { return; }
  if (!mr) return;
  const meta = await mr.json(), files = [];
  for (let i = 0; i < (meta.files || []).length; i++) { const r = await c.match('/__share/f' + i); if (r) files.push(new File([await r.blob()], meta.files[i].name || 'file', { type: meta.files[i].type || '' })); }
  for (const k of await c.keys()) await c.delete(k);
  const text = [meta.title, meta.text, meta.url].filter(Boolean).join('\n').trim();
  const audio = files.find(f => /^audio\//.test(f.type) || /\.(m4a|mp3|wav|amr|3gp|aac|ogg|webm)$/i.test(f.name));
  if (audio) return fileIn(audio, newNote('meeting', { title: (meta.title || audio.name.replace(/\.[^.]+$/, '')).slice(0, 60) }).id);
  const txtf = files.find(f => /^text\//.test(f.type) || /\.txt$/i.test(f.name));
  const body = (text + (txtf ? '\n\n' + await txtf.text() : '')).trim();
  if (txtf || body.length > 400) { // 클로바노트 같은 긴 기록 → 회의록 노트로 저장하고 정리
    const n = newNote('meeting', { title: (meta.title || body.split('\n')[0] || '공유받은 기록').slice(0, 60), body }); goNote(n.id); WANT_SUM.add(n.id); pumpQ();
    return toast('📝 회의록 노트로 저장하고 AI가 정리해요', 4000);
  }
  const other = files.find(f => /^image\//.test(f.type) || f.type === 'application/pdf');
  if (other && other.size <= 15e6) { attach = other; $('attName').textContent = `📎 ${other.name}`; $('att').classList.add('show'); }
  if (body || other) { document.querySelector('nav button[data-p=pChat]').click(); $('inp').value = (body ? body + '\n\n' : '') + '위 내용 정리해 줘.'; grow(); }
}

/* ---------- 🤖 AI가 아는 학교 정보 ---------- */
function scPrompt() {
  const t = today(), sc = isSchool(), out = [];
  const tt = ttFor(t); if (sc && tt.some(Boolean)) out.push(`[오늘 시간표] ${tt.map((x, i) => x ? `${i + 1}교시 ${x}` : '').filter(Boolean).join(', ')}`);
  if (SCH().code) {
    const ml = NC.meal?.[t]; if (ml) out.push(`[오늘 급식] ${ml.join(', ')}`);
    const ml2 = NC.meal?.[addDays(t, 1)]; if (sc && ml2) out.push(`[내일 급식] ${ml2.join(', ')}`);
    const up = neisEvents().filter(e => e.date >= t && e.date <= addDays(t, sc ? 45 : 14));
    out.push(`[학사일정] ${up.map(e => `${e.date} ${e.title}${e.off ? '(쉬는 날)' : ''}`).join(' / ') || '(없음)'}`);
  }
  if (sc) {
    const a = attSummary(t); if (roster().length) out.push(`[오늘 출결] ${a || '모두 출석(적은 것 없음)'} / 우리 반 ${roster().length}명`);
    const ns = S.notes.filter(n => n.date >= addDays(t, -14)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (ns.length) out.push(`[최근 노트] ${ns.map(n => `${n.date} ${n.title}${n.sum?.summary ? ': ' + n.sum.summary.replace(/\s+/g, ' ').slice(0, 160) : ''}`).join(' / ')}`);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

/* ---------- 시작 ---------- */
scMode(isSchool());
neisRefresh();
setInterval(() => { neisRefresh(); if ($('pClass').classList.contains('on') && clsTab === 'today' && document.visibilityState === 'visible' && !document.activeElement?.closest?.('#pClass')) cRender(); }, 5 * 60 * 1000);
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('shared') || q.get('rec') || q.get('note')) history.replaceState(null, '', location.pathname);
  if (q.get('shared')) takeShare();
  else if (q.get('rec')) setTimeout(scMeeting, 600);
  else if (q.get('note')) { newNote('note'); goPage('pNote'); }
})();
