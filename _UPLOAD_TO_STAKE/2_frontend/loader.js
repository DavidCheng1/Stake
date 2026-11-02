// Studio intro, which is also the loading screen. Loaded before game.js so it shows at once.
// The look and timing are CSS (style.css, "Studio intro"), so the motion stays smooth while game.js starts up:
// the studio logo rises out of the dark, a glint crosses it and its stars twinkle, a thin line under it shows progress.
// This file fills that line with real progress (game images, fonts, the RGS session) and fades the screen out once
// everything is ready; the game's music fades in as it does. Until then clicks and keys do not reach the game, so
// nothing starts underneath; a tap only unlocks the audio silently (onGesture) and lets the logo leave once ready.
const LOADER = (() => {
  const el = document.getElementById("loader"), fill = el.querySelector(".ld-fill"), bar = el.querySelector(".ld-bar");
  const t0 = performance.now();
  let minDone = 2400;        // the logo has landed and its glint and sparkles have played (matches style.css)
  const GIVE_UP = 15000;     // leave anyway, so a stuck request never keeps the game hidden
  let total = 0, loaded = 0, fonts = false, session = false, finished = false, fadeStart;
  const fading = new Promise(r => { fadeStart = r; });
  const hooks = [];

  const now = () => performance.now() - t0;
  const progress = () => (total ? loaded / total : 0) * .8 + (fonts ? .05 : 0) + (session ? .15 : 0);
  function show(p) {
    fill.style.transform = `scaleX(${p.toFixed(3)})`;
    bar.setAttribute("aria-valuenow", Math.round(p * 100));
  }
  function check() {
    if (finished) return;
    const all = total > 0 && loaded >= total && fonts && session;
    show(all ? 1 : Math.min(progress(), .99));
    if ((all && now() >= minDone) || now() >= GIVE_UP) finish();
  }
  function finish() {
    finished = true;
    show(1);
    setTimeout(() => {
      el.classList.add("out"); fadeStart();
      setTimeout(() => { el.remove(); BLOCK.forEach(t => removeEventListener(t, block, true)); }, 850);
    }, 300);
  }
  const timer = setInterval(() => { check(); if (finished) clearInterval(timer); }, 100);

  // ---- the glint's sound: an airy shimmer that follows the shine from left to right, a soft bell "ting" as it crosses
  // the middle and a tiny ping for each star. Synthesized, so there is no file to wait for. Browsers only allow sound
  // after a tap unless the page may autoplay (often the case in a casino frame), so it is tried at once and again on a
  // tap during the logo; it is skipped rather than played late. It follows the game's saved mute and effects volume.
  const SOUND_KEY = "ghostDuels.sound";
  const GLINT = 1050; // ms: the glint starts (.ld-shine::before in style.css)
  let vol = .64, actx, played = false;
  try { const s = JSON.parse(localStorage.getItem(SOUND_KEY)) || {}; vol = s.muted ? 0 : ((s.sfx ?? 80) / 100) ** 2; } catch {}
  function trySound() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (played || !vol || !AC) return;
    try { actx = actx || new AC(); } catch { return; }
    const go = () => {
      const at = GLINT - now();
      if (played || actx.state !== "running" || at < -150) return;
      played = true;
      glintSound(actx, actx.currentTime + Math.max(at, 0) / 1000 + .02, vol);
      setTimeout(() => actx.close().catch(() => {}), Math.max(at, 0) + 3000);
    };
    if (actx.state === "running") go(); else Promise.resolve(actx.resume()).then(go, () => {});
  }
  trySound();

  // nothing reaches the game while the logo is up: no spin by Space, no click on a button underneath
  const BLOCK = ["keydown", "keyup", "pointerdown", "pointerup", "click", "touchstart", "touchend"];
  function block(e) {
    e.stopImmediatePropagation();
    if (e.type === "keydown" && (e.key === " " || e.key === "Enter")) e.preventDefault();
    if (e.type === "pointerdown" || (e.type === "keydown" && !e.repeat)) {
      trySound();
      hooks.forEach(f => f(e));
      minDone = Math.min(minDone, now()); // a tap means "go": the logo leaves as soon as the game is ready
    }
  }
  BLOCK.forEach(t => addEventListener(t, block, true));

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { fonts = true; });

  // the glint's sound, starting at t (audio clock seconds); times inside follow the CSS glint (.95 s) and stars
  function glintSound(ctx, t, gain) {
    const out = ctx.createGain(); out.gain.value = gain * 1.6; out.connect(ctx.destination);
    // a short, darkened echo gives the chimes a little room
    const echo = ctx.createDelay(1), fb = ctx.createGain(), damp = ctx.createBiquadFilter(), send = ctx.createGain();
    echo.delayTime.value = .17; fb.gain.value = .3; damp.type = "lowpass"; damp.frequency.value = 4500; send.gain.value = .35;
    send.connect(echo); echo.connect(damp); damp.connect(fb); fb.connect(echo); damp.connect(out);
    const bus = ctx.createGain(); bus.connect(out); bus.connect(send);
    const panned = p => { if (!ctx.createStereoPanner) return bus; const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(bus); return n; };
    // 1. airy shimmer: noise through a band-pass that rises and moves left to right with the glint
    const len = Math.round(ctx.sampleRate * 1.05), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain(), np = panned(-.7);
    noise.buffer = buf; bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(9500, t + .95);
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(.1, t + .38); ng.gain.exponentialRampToValueAtTime(.0005, t + 1);
    if (np.pan) { np.pan.setValueAtTime(-.7, t); np.pan.linearRampToValueAtTime(.7, t + .95); }
    noise.connect(bp); bp.connect(ng); ng.connect(np); noise.start(t); noise.stop(t + 1.05);
    // 2. a soft bell "ting" (E6, then the fifth above) as the glint crosses the middle
    const bell = (at, f, a, p) => [[1, 1], [2.76, .3], [5.4, .1]].forEach(([r, w]) => {
      if (f * r > ctx.sampleRate / 2.2) return;
      const o = ctx.createOscillator(), e = ctx.createGain(), end = at + 1.5 / Math.sqrt(r);
      o.frequency.value = f * r;
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(a * w, at + .005); e.gain.exponentialRampToValueAtTime(.0001, end);
      o.connect(e); e.connect(panned(p)); o.start(at); o.stop(end + .05);
    });
    bell(t + .4, 1318.5, .16, 0);
    bell(t + .47, 1975.5, .08, .15);
    // 3. a tiny ping for each star as it flashes (left stars left, right stars right)
    [[.36, 3136, -.7], [.51, 3520, .75], [.61, 2637, -.8], [.76, 4186, .65]].forEach(([dt, f, p]) => bell(t + dt, f, .04, p));
  }

  return {
    fading,
    // images the first screen needs: each one moves the line
    track(urls) {
      const list = [...new Set(urls)];
      total += list.length;
      list.forEach(u => { const im = new Image(); im.onload = im.onerror = () => { loaded++; }; im.src = u; });
    },
    // the RGS has answered (or failed: then the loader leaves too, so the error dialog can be seen)
    ready() { session = true; },
    // called with taps and key presses made while the logo is up (the sound uses them to unlock the audio)
    onGesture(fn) { hooks.push(fn); }
  };
})();
