// 버스 취소표 알리미 - kobus.co.kr 화면 안에서 도는 부분
(() => {
  if (window.top !== window) return; // 화면 속 작은 창(iframe)에서는 안 띄워요
  if (window.__busWatchLoaded) return;
  window.__busWatchLoaded = true;

  const VERSION = chrome.runtime.getManifest().version;
  const GRADE_NAMES = { normal: "일반", udeung: "우등", premium: "프리미엄" };
  const PICK_TTL = 3 * 60 * 1000; // 빈자리를 찾고 3분 안에만 저절로 이어서 눌러요

  // ---------- 저장 ----------
  const store = {
    async get(k) { return (await chrome.storage.local.get(k))[k]; },
    async set(k, v) { await chrome.storage.local.set({ [k]: v }); },
    async patch(k, p) { const cur = (await store.get(k)) || {}; const n = { ...cur, ...p }; await store.set(k, n); return n; },
  };

  // ---------- 도움 함수 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const hhmm = (t6) => t6.slice(0, 2) + ":" + t6.slice(2, 4);
  const nowText = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
  const ymdDash = (ymd) => ymd ? ymd.slice(0, 4) + "-" + ymd.slice(4, 6) + "-" + ymd.slice(6, 8) : "";
  const todayYmd = () => { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
  const dateLabel = (ymd) => {
    const d = new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + "일월화수목금토"[d.getDay()] + ")";
  };

  function gradeOf(text) {
    if (/프리미엄/.test(text)) return "premium";
    if (/우등/.test(text)) return "udeung";
    return "normal";
  }

  function fnArgs(onclick) {
    const m = /fnSatsChc\(\s*('.*?)\)/s.exec(onclick || "");
    if (!m) return null;
    const a = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    return a.length >= 7 ? a : null;
  }

  // 배차 조회 화면(HTML)에서 차 목록을 뽑아요.
  function parseRows(doc) {
    const rows = [];
    for (const st of $$(".bus_time .start_time, .start_time", doc)) {
      if (st.closest(".bustime_head")) continue;
      const row = st.closest("a") || st.closest("p") || st.parentElement;
      if (!row || rows.some((r) => r.el === row)) continue;
      const a = row.matches("a") ? row : row.querySelector("a");
      const onclick = (a && a.getAttribute("onclick")) || "";
      const args = fnArgs(onclick);
      const time = txt(st).replace(/\s/g, "");
      if (!/^\d{2}:\d{2}$/.test(time)) continue;
      const gradeText = txt($(".grade", row)) || txt($(".grade_mo", row));
      const remainM = /(\d+)\s*석/.exec(txt($(".remain", row)));
      rows.push({
        el: a || row,
        time,
        company: txt($(".bus_com", row)) || txt($(".bus_info span", row)),
        gradeText: gradeText.split(" ")[0] || "",
        grade: gradeOf(gradeText),
        remain: remainM ? +remainM[1] : 0,
        status: txt($(".status", row)),
        bookable: !!args,
        args,
      });
    }
    return rows;
  }

  function inRange(time, from, to) {
    return (!from || time >= from) && (!to || time <= to);
  }

  function matches(rows, w) {
    return rows.filter((r) => inRange(r.time, w.timeFrom, w.timeTo) && w.grades[r.grade]);
  }

  function searchBody(w) {
    const f = new URLSearchParams();
    const vals = {
      deprCd: w.deprCd, deprNm: w.deprNm, arvlCd: w.arvlCd, arvlNm: w.arvlNm,
      tfrCd: "", tfrNm: "", tfrArvlFullNm: "",
      pathDvs: "sngl", pathStep: "1", deprDtm: w.date, arvlDtm: w.date,
      busClsCd: "0", rtrpChc: "1", timeLinkMin: "00", timeLinkMax: "23",
    };
    for (const k in vals) f.set(k, vals[k] == null ? "" : vals[k]);
    return f;
  }

  async function fetchSchedule(w) {
    const res = await fetch("/mrs/alcnSrch.do", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: searchBody(w).toString(),
    });
    if (!res.ok) throw new Error("사이트 응답 " + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const dep = doc.querySelector("input[name=deprCd]");
    if (!dep || dep.value !== w.deprCd) {
      throw new Error("배차 조회 화면이 아닌 다른 화면이 왔어요");
    }
    return { doc, rows: parseRows(doc) };
  }

  // ---------- 노선(터미널) 목록 ----------
  async function loadRoutes(force) {
    const cache = await store.get("routes");
    if (!force && cache && cache.list && cache.list.length && Date.now() - cache.ts < 24 * 3600 * 1000) return cache.list;
    const res = await fetch("/mrs/readRotLinInf.ajax", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: "",
    });
    const data = JSON.parse(await res.text());
    const list = (data.rotInfList || [])
      .filter((r) => r.deprCd && r.arvlCd)
      .map((r) => ({ d: r.deprCd, dn: r.deprNm, a: r.arvlCd, an: r.arvlNm }));
    if (!list.length) throw new Error("노선 목록이 비어 있어요");
    await store.set("routes", { ts: Date.now(), list });
    return list;
  }

  // ---------- 도우미 창 ----------
  const host = document.createElement("div");
  host.id = "bus-watch-helper";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; }
    .box { width: 330px; background: #fff; color: #1f2937; border: 2px solid #2563eb; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.25); font-size: 13px; overflow: hidden; }
    .head { background: #2563eb; color: #fff; padding: 9px 12px; font-weight: bold; font-size: 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none; }
    .head small { font-weight: normal; opacity: .85; font-size: 11px; }
    .body { padding: 10px 12px 12px; max-height: 76vh; overflow-y: auto; }
    .box.folded .body { display: none; }
    label.row { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
    label.row > span:first-child { width: 52px; flex: none; color: #4b5563; }
    select, input[type=date], input[type=time] { flex: 1; min-width: 0; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; color: #111; }
    .times { display: flex; align-items: center; gap: 4px; flex: 1; }
    .grades { display: flex; gap: 10px; flex: 1; }
    .grades label { display: flex; align-items: center; gap: 3px; cursor: pointer; }
    button { border: 0; border-radius: 8px; padding: 9px 10px; font-size: 14px; font-weight: bold; cursor: pointer; }
    .go { width: 100%; background: #16a34a; color: #fff; margin-top: 8px; }
    .stop { width: 100%; background: #dc2626; color: #fff; margin-top: 8px; }
    .small { background: #e5e7eb; color: #111; font-size: 12px; padding: 5px 8px; font-weight: normal; }
    .tools { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .status { margin-top: 10px; padding: 8px; border-radius: 8px; background: #f1f5f9; line-height: 1.5; white-space: pre-line; }
    .status.on { background: #ecfdf5; border: 1px solid #86efac; }
    .status.found { background: #fef9c3; border: 1px solid #facc15; font-weight: bold; }
    .status.bad { background: #fef2f2; border: 1px solid #fca5a5; }
    .list { margin-top: 6px; font-size: 12px; color: #374151; line-height: 1.55; white-space: pre-line; }
    .hint { font-size: 11.5px; color: #6b7280; margin-top: 6px; line-height: 1.45; }
  </style>
  <div class="box">
    <div class="head"><span>🚌 버스 취소표 알리미 <small>v${VERSION}</small></span><span class="fold">▾</span></div>
    <div class="body">
      <div class="tools"><button class="small" id="fromPage" style="display:none">📋 지금 화면의 노선·날짜 가져오기</button></div>
      <label class="row"><span>출발</span><select id="dep"><option value="">불러오는 중…</option></select></label>
      <label class="row"><span>도착</span><select id="arr"><option value="">출발지를 먼저 골라요</option></select></label>
      <label class="row"><span>날짜</span><input type="date" id="date"></label>
      <label class="row"><span>시간</span><span class="times"><input type="time" id="tFrom" value="00:00"> ~ <input type="time" id="tTo" value="23:59"></span></label>
      <div class="row" style="display:flex;align-items:center;gap:6px;margin:6px 0"><span style="width:52px;color:#4b5563">등급</span>
        <span class="grades">
          <label><input type="checkbox" id="g_normal" checked>일반</label>
          <label><input type="checkbox" id="g_udeung" checked>우등</label>
          <label><input type="checkbox" id="g_premium" checked>프리미엄</label>
        </span></div>
      <label class="row"><span>매수</span><select id="count">
        <option value="1">1장</option><option value="2">2장</option><option value="3">3장</option>
        <option value="4">4장</option><option value="5">5장</option><option value="6">6장</option></select></label>
      <label class="row"><span>간격</span><select id="interval">
        <option value="30">30초마다</option><option value="60" selected>1분마다</option>
        <option value="120">2분마다</option><option value="180">3분마다</option><option value="300">5분마다</option></select></label>
      <button class="go" id="start">▶ 빈자리 지켜보기 시작</button>
      <button class="stop" id="stop" style="display:none">■ 멈추기</button>
      <div class="status" id="status">노선·날짜·시간을 고르고 [지켜보기 시작]을 눌러 주세요.</div>
      <div class="list" id="list"></div>
      <div class="tools" style="margin-top:8px"><button class="small" id="sound">🔔 알림 소리 들어 보기</button><button class="small" id="reload">노선 목록 다시 불러오기</button></div>
      <div class="hint">※ 이 탭은 닫지 말고 켜 두세요. 다른 탭을 보고 있어도 돼요.<br>※ 결제는 도우미가 하지 않아요. 좌석이 골라지면 직접 확인하고 결제해 주세요.<br>※ 출발 1시간 안쪽 차는 웹에서 못 사요. 그때는 티머니 GO 앱을 써 주세요.</div>
    </div>
  </div>`;
  document.documentElement.appendChild(host);
  const S = (id) => shadow.getElementById(id);
  const box = shadow.querySelector(".box");

  shadow.querySelector(".head").addEventListener("click", async () => {
    box.classList.toggle("folded");
    await store.set("folded", box.classList.contains("folded"));
  });
  store.get("folded").then((f) => { if (f) box.classList.add("folded"); });

  let routes = [];
  function fillDep(selected) {
    const deps = new Map();
    routes.forEach((r) => deps.set(r.d, r.dn));
    const sorted = [...deps.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
    S("dep").innerHTML = '<option value="">출발지 고르기</option>' + sorted.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    if (selected) ensureOption(S("dep"), selected.code, selected.name);
  }
  function fillArr(depCd, selected) {
    const arrs = new Map();
    routes.filter((r) => r.d === depCd).forEach((r) => arrs.set(r.a, r.an));
    const sorted = [...arrs.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
    S("arr").innerHTML = '<option value="">도착지 고르기</option>' + sorted.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    if (selected) ensureOption(S("arr"), selected.code, selected.name);
  }
  function ensureOption(sel, code, name) {
    if (!code) return;
    if (![...sel.options].some((o) => o.value === code)) {
      const o = document.createElement("option");
      o.value = code; o.textContent = name || code;
      sel.appendChild(o);
    }
    sel.value = code;
  }
  S("dep").addEventListener("change", () => { fillArr(S("dep").value); saveForm(); });
  S("arr").addEventListener("change", saveForm);
  ["date", "tFrom", "tTo", "count", "interval", "g_normal", "g_udeung", "g_premium"].forEach((id) => S(id).addEventListener("change", saveForm));

  function readForm() {
    const dep = S("dep"), arr = S("arr");
    return {
      deprCd: dep.value, deprNm: dep.value ? dep.options[dep.selectedIndex].textContent : "",
      arvlCd: arr.value, arvlNm: arr.value ? arr.options[arr.selectedIndex].textContent : "",
      date: (S("date").value || "").replace(/-/g, ""),
      timeFrom: S("tFrom").value || "00:00", timeTo: S("tTo").value || "23:59",
      grades: { normal: S("g_normal").checked, udeung: S("g_udeung").checked, premium: S("g_premium").checked },
      count: +S("count").value || 1,
      intervalSec: +S("interval").value || 60,
    };
  }
  async function saveForm() { await store.set("form", readForm()); }
  async function writeForm(f) {
    if (!f) return;
    if (f.deprCd) { ensureOption(S("dep"), f.deprCd, f.deprNm); fillArr(f.deprCd, { code: f.arvlCd, name: f.arvlNm }); }
    if (f.date) S("date").value = ymdDash(f.date);
    if (f.timeFrom) S("tFrom").value = f.timeFrom;
    if (f.timeTo) S("tTo").value = f.timeTo;
    if (f.grades) for (const g in GRADE_NAMES) S("g_" + g).checked = !!f.grades[g];
    if (f.count) S("count").value = String(f.count);
    if (f.intervalSec) S("interval").value = String(f.intervalSec);
  }

  async function initRoutes(force) {
    try {
      routes = await loadRoutes(force);
      fillDep();
    } catch (e) {
      routes = [];
      S("dep").innerHTML = '<option value="">목록을 못 불러왔어요</option>';
      setStatus("노선 목록을 못 불러왔어요.\n사이트에서 평소처럼 출발·도착·날짜로 조회한 뒤 [📋 지금 화면의 노선·날짜 가져오기]를 눌러 주세요.", "bad");
    }
    const f = await store.get("form");
    await writeForm(f);
  }

  // 지금 화면이 배차 조회 결과라면 그 노선·날짜를 그대로 가져와요.
  const pageForm = $("form#alcnSrchFrm");
  if (pageForm && $("input[name=deprCd]", pageForm) && $("input[name=deprCd]", pageForm).value) S("fromPage").style.display = "";
  S("fromPage").addEventListener("click", async () => {
    const v = (n) => ($(`input[name=${n}]`, pageForm) || {}).value || "";
    ensureOption(S("dep"), v("deprCd"), v("deprNm"));
    fillArr(v("deprCd"), { code: v("arvlCd"), name: v("arvlNm") });
    if (v("deprDtm")) S("date").value = ymdDash(v("deprDtm"));
    await saveForm();
    setStatus("지금 화면의 노선을 가져왔어요: " + v("deprNm") + " → " + v("arvlNm") + (v("deprDtm") ? ", " + dateLabel(v("deprDtm")) : ""));
  });

  function setStatus(text, kind) {
    const el = S("status");
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
  }

  function summarize(rows, w) {
    const mine = matches(rows, w);
    if (!mine.length) return "고른 시간·등급에 맞는 차가 없어요. 시간과 등급을 다시 확인해 주세요.";
    return mine.slice(0, 12).map((r) => {
      const state = !r.bookable || r.remain === 0
        ? (r.status && !/선택/.test(r.status) ? r.status : "매진")
        : (r.remain >= w.count ? "✅ " + r.remain + "석" : r.remain + "석 (모자라요)");
      return `${r.time} ${r.gradeText || GRADE_NAMES[r.grade]} · ${state}`;
    }).join("\n") + (mine.length > 12 ? `\n… 그 밖에 ${mine.length - 12}대` : "");
  }

  async function showWatch() {
    const w = await store.get("watch");
    const on = !!(w && w.on);
    S("start").style.display = on ? "none" : "";
    S("stop").style.display = on ? "" : "none";
    if (!w) return;
    if (on) {
      const head = `👀 지켜보는 중 (${(w.intervalSec || 60) >= 60 ? (w.intervalSec || 60) / 60 + "분" : w.intervalSec + "초"}마다)\n${w.deprNm} → ${w.arvlNm}, ${dateLabel(w.date)} ${w.timeFrom}~${w.timeTo}\n${Object.keys(GRADE_NAMES).filter((g) => w.grades[g]).map((g) => GRADE_NAMES[g]).join("·")} / ${w.count}장`;
      const tail = w.lastCheck ? `\n마지막 확인 ${w.lastCheck}${w.checks ? " (" + w.checks + "번째)" : ""}` : "\n곧 첫 확인을 해요…";
      setStatus(head + tail + (w.lastError ? "\n⚠️ " + w.lastError : ""), w.lastError ? "bad" : "on");
    }
    S("list").textContent = w.lastSummary || "";
  }
  chrome.storage.onChanged.addListener((ch) => { if (ch.watch) showWatch(); });

  S("start").addEventListener("click", async () => {
    const f = readForm();
    const miss = [];
    if (!f.deprCd) miss.push("출발");
    if (!f.arvlCd) miss.push("도착");
    if (!f.date) miss.push("날짜");
    if (!Object.values(f.grades).some(Boolean)) miss.push("등급(하나 이상)");
    if (miss.length) { setStatus(miss.join(", ") + "을(를) 골라 주세요.", "bad"); return; }
    if (f.date < todayYmd()) { setStatus("지난 날짜예요. 날짜를 다시 골라 주세요.", "bad"); return; }
    if (f.timeFrom > f.timeTo) { setStatus("시간의 앞쪽이 뒤쪽보다 늦어요. 예: 17:00 ~ 20:00", "bad"); return; }
    await saveForm();
    await store.set("pick", null);
    const watch = { ...f, lastCheck: "", lastSummary: "", lastError: "", checks: 0, fails: 0 };
    await store.set("watch", { ...watch, on: true });
    chrome.runtime.sendMessage({ type: "start", watch, intervalSec: f.intervalSec });
  });
  S("stop").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "stop" });
    setStatus("멈췄어요. 다시 하려면 [지켜보기 시작]을 눌러 주세요.");
  });
  S("sound").addEventListener("click", () => chrome.runtime.sendMessage({ type: "sound-test" }));
  S("reload").addEventListener("click", () => { S("dep").innerHTML = '<option value="">불러오는 중…</option>'; initRoutes(true); });

  // ---------- 한 번 확인하기 ----------
  let checking = false;
  async function checkOnce() {
    if (checking) return;
    checking = true;
    try {
      const w = await store.get("watch");
      if (!w || !w.on) return;
      if (w.date < todayYmd()) {
        await chrome.runtime.sendMessage({ type: "stop" });
        await store.patch("watch", { lastError: "날짜가 지나서 멈췄어요." });
        return;
      }
      let result;
      try {
        result = await fetchSchedule(w);
      } catch (e) {
        const fails = (w.fails || 0) + 1;
        await store.patch("watch", { fails, lastCheck: nowText(), lastError: "확인하지 못했어요 (" + e.message + "). 다음 차례에 다시 해요." });
        if (fails === 5) chrome.runtime.sendMessage({ type: "trouble", text: "다섯 번 연속으로 빈자리를 확인하지 못했어요. kobus 탭을 한 번 새로고침(F5)해 주세요." });
        return;
      }
      const summary = summarize(result.rows, w);
      const hit = matches(result.rows, w).find((r) => r.bookable && r.remain >= w.count);
      await store.patch("watch", { fails: 0, lastError: "", lastCheck: nowText(), checks: (w.checks || 0) + 1, lastSummary: summary });
      if (!hit) return;

      // 빈자리를 찾았어요!
      const text = `${dateLabel(w.date)} ${hit.time} ${hit.gradeText || GRADE_NAMES[hit.grade]} ${w.deprNm}→${w.arvlNm} (남은 자리 ${hit.remain}석)`;
      await store.set("pick", { at: Date.now(), stage: "list", deprTime: hit.args[1], cls: hit.args[5], cacm: hit.args[6], date: w.date, count: w.count, text });
      await chrome.runtime.sendMessage({ type: "found", text });
      setStatus("🎉 빈자리를 찾았어요!\n" + text + "\n좌석 고르는 화면으로 가고 있어요…", "found");
      openSchedulePage(result.doc, w);
    } finally {
      checking = false;
    }
  }

  // 사이트의 배차 조회 화면을 진짜로 열어요(사이트의 [조회] 단추와 같은 방식).
  function openSchedulePage(doc, w) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/mrs/alcnSrch.do";
    form.style.display = "none";
    const src = doc && doc.querySelector("form#alcnSrchFrm");
    const pairs = src ? $$("input[name]", src).map((i) => [i.name, i.value]) : [...searchBody(w).entries()];
    for (const [k, v] of pairs) {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = k; i.value = v;
      form.appendChild(i);
    }
    document.body.appendChild(form);
    form.submit();
  }

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg && msg.type === "check") { checkOnce(); send({ ok: true }); }
  });

  // ---------- 빈자리를 찾은 뒤 이어서 누르기 ----------
  async function resumePick() {
    const p = await store.get("pick");
    if (!p || Date.now() - p.at > PICK_TTL) return;
    const path = location.pathname;

    if (p.stage === "list" && /alcnSrch/i.test(path)) {
      setStatus("🎉 빈자리를 찾았어요!\n" + p.text + "\n그 차를 누르고 있어요…", "found");
      await sleep(600);
      const row = parseRows(document).find((r) => r.args && r.args[1] === p.deprTime && r.args[5] === p.cls && r.args[6] === p.cacm);
      if (!row || !row.bookable || row.remain < p.count) {
        await store.set("pick", null);
        setStatus("아쉽게도 그 사이에 자리가 다시 찼어요. 다시 지켜볼게요.", "bad");
        const w = await store.get("watch");
        if (w) chrome.runtime.sendMessage({ type: "start", watch: w, intervalSec: w.intervalSec });
        return;
      }
      await store.patch("pick", { stage: "seat", at: Date.now() });
      row.el.scrollIntoView({ block: "center" });
      row.el.click(); // 사이트가 좌석 고르는 화면으로 넘겨 줘요
      return;
    }

    if (p.stage === "seat" && /satschc/i.test(path)) {
      await store.set("pick", null);
      setStatus("🎉 좌석 고르는 화면이에요.\n" + p.text + `\n일반 ${p.count}명과 좌석을 고르고 있어요…`, "found");
      const ok = await pickSeats(p.count);
      chrome.runtime.sendMessage({ type: "seats-picked" });
      if (ok.done) {
        setStatus(`✅ 좌석 ${ok.seats.join(", ")}번을 골라 두었어요.\n자리를 확인하고 화면의 결제 단추를 직접 눌러 주세요.\n(이 창이 가리면 파란 제목줄을 눌러 접어 주세요.)\n(다른 자리가 좋으면 눌러서 바꿔도 돼요.)`, "found");
      } else {
        setStatus("좌석 고르는 화면까지 열었어요.\n" + ok.why + "\n인원과 좌석을 직접 고른 뒤 결제해 주세요.", "found");
      }
    }
  }

  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }

  async function pickSeats(count) {
    // 좌석 그림이 나올 때까지 잠깐 기다려요.
    let inputs = [];
    for (let i = 0; i < 40; i++) {
      inputs = $$("input[name=seatBoxDtl]");
      if (inputs.length) break;
      await sleep(250);
    }
    if (!inputs.length) return { done: false, why: "좌석 그림을 찾지 못했어요." };

    // 1) 일반(어른) 인원 늘리기
    const counters = ["adltCnt", "adltCntMob"].map((id) => document.getElementById(id)).filter(Boolean);
    const counter = counters.find(visible) || counters[0];
    if (counter) {
      const addBtn = counter.closest(".countBox") && counter.closest(".countBox").querySelector(".btn_add");
      for (let i = 0; i < 8 && addBtn && (+txt(counter) || 0) < count; i++) {
        addBtn.click();
        await sleep(250);
      }
      if ((+txt(counter) || 0) !== count) return { done: false, why: "인원 수를 맞추지 못했어요." };
    }

    // 2) 빈 좌석 고르기: 되도록 번호가 이어진 자리(나란히 앉는 자리)로
    const free = inputs.filter((i) => !i.disabled && !i.checked && !/disabled/.test(i.parentElement.className))
      .sort((a, b) => +a.value - +b.value);
    if (free.length < count) return { done: false, why: "남은 빈 좌석이 " + free.length + "개뿐이에요." };
    let chosen = free.slice(0, count);
    if (count >= 2) {
      for (let s = 0; s + count <= free.length; s++) {
        const part = free.slice(s, s + count);
        if (+part[count - 1].value - +part[0].value === count - 1) { chosen = part; break; }
      }
    }
    for (const inp of chosen) {
      const label = inp.id && document.querySelector(`label[for="${inp.id}"]`);
      (label && visible(label) ? label : inp).click();
      await sleep(300);
    }
    const picked = inputs.filter((i) => i.checked).map((i) => i.value);
    if (picked.length < count) return { done: false, why: "좌석을 다 고르지 못했어요." };
    return { done: true, seats: picked };
  }

  // ---------- 시작 ----------
  (async () => {
    await initRoutes(false);
    await showWatch();
    await resumePick();
  })();
})();
