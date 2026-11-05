// 버스 취소표 알리미 - 뒤에서 도는 부분
// 정해 둔 간격마다 kobus 탭에게 "한 번 확인해 줘"라고 부탁하고,
// 빈자리를 찾으면 알림을 띄우고 소리를 내요.

const KOBUS = "https://www.kobus.co.kr/";
const ALARM = "bus-check";

async function getWatch() {
  const { watch } = await chrome.storage.local.get("watch");
  return watch || null;
}
async function setWatch(patch) {
  const cur = (await getWatch()) || {};
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ watch: next });
  return next;
}

async function kobusTab(preferId) {
  const tabs = await chrome.tabs.query({ url: KOBUS + "*" });
  if (!tabs.length) return null;
  return tabs.find((t) => t.id === preferId) || tabs[0];
}

async function startAlarm(sec) {
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { delayInMinutes: sec / 60, periodInMinutes: sec / 60 });
}

async function runCheck() {
  const w = await getWatch();
  if (!w || !w.on) { await chrome.alarms.clear(ALARM); return; }
  const tab = await kobusTab(w.tabId);
  if (!tab) {
    // kobus 탭이 하나도 없으면 뒤쪽에 하나 열어 두고 다음 차례에 확인해요.
    const t = await chrome.tabs.create({ url: KOBUS + "main.do", active: false });
    await setWatch({ tabId: t.id });
    return;
  }
  if (tab.id !== w.tabId) await setWatch({ tabId: tab.id });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "check" });
  } catch (e) {
    // 탭이 막 새로고침되는 중이면 대답을 못 할 수 있어요. 다음 차례에 다시 해요.
  }
}

async function beep() {
  try {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: "sound.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "빈자리를 찾았을 때 알림 소리 내기",
      });
    }
    await chrome.runtime.sendMessage({ type: "play-sound" });
  } catch (e) {}
}

async function notify(id, title, message, sticky) {
  try {
    await chrome.notifications.create(id + "-" + Date.now(), {
      type: "basic",
      iconUrl: "icon128.png",
      title,
      message,
      priority: 2,
      requireInteraction: !!sticky,
    });
  } catch (e) {}
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type === "play-sound") return false; // 소리 창에게 보내는 말은 그냥 넘겨요
  (async () => {
    if (msg.type === "start") {
      const sec = Math.max(30, Number(msg.intervalSec) || 60);
      await setWatch({ ...msg.watch, on: true, tabId: sender.tab && sender.tab.id, intervalSec: sec, fails: 0 });
      await startAlarm(sec);
      await runCheck(); // 누르자마자 한 번 확인
      sendResponse({ ok: true });
    } else if (msg.type === "stop") {
      await setWatch({ on: false });
      await chrome.alarms.clear(ALARM);
      sendResponse({ ok: true });
    } else if (msg.type === "found") {
      await setWatch({ on: false });
      await chrome.alarms.clear(ALARM);
      await beep();
      await notify("found", "🚌 빈자리가 났어요!", msg.text + "\n좌석 고르는 화면을 열고 있어요. 결제는 직접 눌러 주세요.", true);
      if (sender.tab) await focusTab(sender.tab.id);
      sendResponse({ ok: true });
    } else if (msg.type === "trouble") {
      await notify("trouble", "버스 취소표 알리미", msg.text, true);
      sendResponse({ ok: true });
    } else if (msg.type === "seats-picked" || msg.type === "sound-test") {
      await beep();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) runCheck(); });

chrome.notifications.onClicked.addListener(async (id) => {
  const w = await getWatch();
  const tab = await kobusTab(w && w.tabId);
  if (tab) focusTab(tab.id);
  chrome.notifications.clear(id);
});

chrome.action.onClicked.addListener(async () => {
  const w = await getWatch();
  const tab = await kobusTab(w && w.tabId);
  if (tab) focusTab(tab.id);
  else chrome.tabs.create({ url: KOBUS + "main.do" });
});

// 크롬을 다시 켰을 때 지켜보기가 켜져 있었다면 알람을 다시 걸어요.
chrome.runtime.onStartup.addListener(async () => {
  const w = await getWatch();
  if (w && w.on) startAlarm(w.intervalSec || 60);
});
