// 알림 소리: "띵-동" 소리를 세 번 내요.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "play-sound") return;
  const ctx = new AudioContext();
  const tone = (freq, at, len) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + at);
    o.stop(ctx.currentTime + at + len + 0.05);
  };
  for (let i = 0; i < 3; i++) {
    tone(988, i * 1.0, 0.45);
    tone(784, i * 1.0 + 0.45, 0.5);
  }
  setTimeout(() => ctx.close(), 4000);
});
