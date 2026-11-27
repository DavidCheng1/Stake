"use strict";
// Night Drive. Every round comes from the Stake Engine RGS (rgs.js): the math is math-sdk/games/night_drive, and the
// game plays a round's events (its book) back. The values in the rules come from the same math.

const COLS = 5, ROWS = 5, MAX_WIN = 25000;
// The bet modes (tools/release/sync_frontend.py keeps cost, rtp and maxWin in step with the math's stats)
const MODES = [
  { name: "Base game", mode: "BASE", cost: 1, rtp: 96.00, maxWin: 25000 },
  { name: "Chance ×3", mode: "BOOST", cost: 2, rtp: 96.00, maxWin: 25000 },
  { name: "The Chase", mode: "CHASE", cost: 76, rtp: 96.00, maxWin: 25000 },
  { name: "Super Chase", mode: "SUPER", cost: 235, rtp: 96.00, maxWin: 25000 },
];
const modeOf = m => MODES.find(x => x.mode === String(m).toUpperCase()) || MODES[0];
// book symbol names -> art; display names
const SYM = { H1: "driver", H2: "captain", H3: "owner", H4: "dj", M1: "boat", M2: "tape", M3: "flamingo", M4: "briefcase",
  L1: "shades", L2: "skate", L3: "palm", L4: "heart", W: "wild", S: "scatter" };
const NAMES = { driver: "Driver", captain: "Captain", owner: "Club Owner", dj: "DJ", boat: "Speedboat", tape: "Cassette",
  flamingo: "Flamingo", briefcase: "Briefcase", shades: "Shades", skate: "Roller Skate", palm: "Palm", heart: "Neon Heart" };
// pay per way (× the bet) for 3, 4 and 5 reels: game_config.py way_pays (these × 0.038)
const PAY = {
  driver: [1, 2.5, 6], captain: [.8, 2, 5], owner: [.6, 1.5, 4], dj: [.5, 1.2, 3],
  boat: [.3, .8, 2], tape: [.3, .7, 1.8], flamingo: [.25, .6, 1.5], briefcase: [.25, .6, 1.4],
  shades: [.12, .3, .7], skate: [.12, .3, .7], palm: [.1, .25, .6], heart: [.1, .25, .6],
};
const K = 0.038, MIN_WIN = 0.1;
const PAYING = Object.keys(PAY);
const TIER = id => ["driver", "captain", "owner", "dj"].includes(id) ? "255 46 150" : ["boat", "tape", "flamingo", "briefcase"].includes(id) ? "0 229 255" : "255 154 60";
const rnd = n => Math.floor(Math.random() * n);

// ---------- Screen ----------
const $ = id => document.getElementById(id);
const game = $("game"), cellsEl = $("cells"), carsEl = $("cars"), floatsEl = $("floats"), board = $("board");
const PITCH = 20.74; // % of the cell area per cell (17.04 % cell + 3.7 % gap)
let balance = 0, betIdx = 0, busy = false, turbo = false, loading = true;
let boostOn = false, autoOn = false, autoLeft = 0, autoChoice = 0; // Chance ×3 switch; autoplay
let BETS = [1]; // from the RGS (authenticate): every bet level Stake allows, e.g. from 0.10
const bet = () => BETS[betIdx];
const money = v => RGS.formatMoney(v);
// values under a cent keep two significant digits (a per-way value in the rules), never 0.00
const small = v => RGS.formatMoney(v); // RGS.formatNumber keeps the digits a sub-cent value needs
const pace = () => turbo ? 2.75 : 1.25; // the game runs 1.25× its designed speed; turbo 2.75×
const sleep = ms => new Promise(r => setTimeout(r, ms / pace()));
const say = t => { $("msg").textContent = RGS.socialText(t); };

function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); game.style.transform = `translate(-50%, -50%) scale(${s})`; }
addEventListener("resize", fit); fit();

// ---------- Sound: one output (the mute covers everything); the music crossfades between the base and The Chase ----------
const sound = (() => {
  let ctx = null, master, musicBus, sfxBus, muted = false, cur = null, curName = null, mv = .7, sv = .8;
  const buf = {}, SFX = ["click", "spin", "land", "win", "winbig", "wild", "scatter", "driveby", "carmove", "nitro", "chase", "bigwin", "chaseover", "tease", "stop", "pluck", "tierup", "count", "warp"];
  const lead = {}, span = {};
  // MP3 puts a little silence before (and after) every sound: sounds skip it so they play right on time, and the songs
  // loop between their first and last real sample, so the loop has no gap (tools/audio_loop.py made them seamless)
  function edges(d) {
    const x = d.getChannelData(0); let a = 0, b = x.length - 1;
    while (a < b && Math.abs(x[a]) < 1e-3) a++; while (b > a && Math.abs(x[b]) < 1e-3) b--;
    return [a / d.sampleRate, (b + 1) / d.sampleRate];
  }
  const load = (name, url) => fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(d => {
    buf[name] = d; span[name] = edges(d); lead[name] = Math.max(0, span[name][0] - .002);
    if (name === curName && !cur) start(name);
  }).catch(() => {});
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = .3 * mv; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = .75 * sv; sfxBus.connect(master);
    SFX.forEach(n => load(n, `assets/sfx/${n}.mp3`)); ["music-base", "music-chase"].forEach(n => load(n, `assets/${n}.mp3`));
  }
  function play(name, vol = 1, rate = 1, delay = 0) {
    if (!ctx || !buf[name]) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g).connect(sfxBus); s.start(ctx.currentTime + delay / 1000, lead[name] || 0);
  }
  function start(name) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.loop = true; g.gain.value = 0;
    [s.loopStart, s.loopEnd] = span[name];
    s.connect(g).connect(musicBus); s.start(0, s.loopStart); g.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2); cur = { s, g };
  }
  function music(name) {
    if (!ctx || name === curName) return; curName = name;
    if (cur) { const old = cur; old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setValueAtTime(old.g.gain.value, ctx.currentTime); old.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1); old.s.stop(ctx.currentTime + 1.1); cur = null; }
    if (buf[name]) start(name);
  }
  // the mute and the effects volume are saved, so the loader's shimmer on the next launch follows them (loader.js)
  const save = () => { try { localStorage.setItem("nightDrive.sound", JSON.stringify({ muted, sfx: Math.round(sv * 100) })); } catch {} };
  return { init, play, music, toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; save(); return muted; },
    setMusic(v) { mv = v; if (musicBus) musicBus.gain.value = .3 * v; },
    // a sound that repeats until the returned function stops it; the music ducking under big moments
    loop(name, vol = 1, rate = 1) {
      if (!ctx || !buf[name]) return () => {};
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.loop = true; [s.loopStart, s.loopEnd] = span[name]; s.playbackRate.value = rate; g.gain.value = vol;
      s.connect(g).connect(sfxBus); s.start(0, s.loopStart);
      return () => { g.gain.setTargetAtTime(0, ctx.currentTime, .04); s.stop(ctx.currentTime + .3); };
    },
    duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(.3 * mv * (on ? .3 : 1), ctx.currentTime, .2); }, setSfx(v) { sv = v; if (sfxBus) sfxBus.gain.value = .75 * v; save(); } };
})();

// ---------- Filmed symbol animations (sprite sheets from tools/sprites/symanim.py --game nd): an idle loop now and
// then, a win when a symbol takes part in a win. A canvas over the symbol plays the sheet from its first frame (the
// still) and fades back onto the still at the end. ----------
const symAnim = { meta: {}, img: {} };
fetch("assets/sym-anim/anim.json").then(r => r.ok ? r.json() : {}).then(m => {
  symAnim.meta = m;
  for (const id in m) for (const kind in m[id]) { const im = new Image(); im.src = `assets/sym-anim/${id}-${kind}.webp`; im.decode().then(() => { symAnim.img[id + "-" + kind] = im; }, () => {}); }
}).catch(() => {});
function playSymAnim(el, kind) {
  const id = el?.dataset.id, m = symAnim.meta[id]?.[kind], im = symAnim.img[id + "-" + kind];
  if (!m || !im) return false;
  el.querySelector(".sym-anim")?.remove();
  const cv = document.createElement("canvas"); cv.className = "sym-anim"; cv.width = cv.height = m.px;
  const p = m.pad * 100; cv.style.left = cv.style.top = `${-p}%`; cv.style.width = cv.style.height = `${100 + 2 * p}%`;
  el.appendChild(cv); el.classList.add("animating", "anim-" + kind);
  const g = cv.getContext("2d"), step = m.px + 2, t0 = performance.now(), rate = kind === "win" ? pace() * 1.3 : 1;
  const len = m.n / m.fps * 1000, hold = kind === "win" ? 500 : 0; let last = -1;
  const done = () => { if (el.querySelector(".sym-anim") === cv) el.classList.remove("animating", "anim-" + kind); };
  const tick = now => {
    if (!cv.isConnected) return done();
    const t = (now - t0) * rate, pos = Math.min(m.n - 1, t / 1000 * m.fps), f = Math.floor(pos), k = pos - f;
    const key = f + k.toFixed(2);
    if (key !== last) {
      last = key; g.clearRect(0, 0, m.px, m.px); g.globalAlpha = 1;
      g.drawImage(im, (f % m.cols) * step + 1, Math.floor(f / m.cols) * step + 1, m.px, m.px, 0, 0, m.px, m.px);
      if (k > .02 && f + 1 < m.n) { const n = f + 1; g.globalAlpha = k; g.drawImage(im, (n % m.cols) * step + 1, Math.floor(n / m.cols) * step + 1, m.px, m.px, 0, 0, m.px, m.px); g.globalAlpha = 1; }
    }
    if (t < len + hold) { requestAnimationFrame(tick); return; }
    done(); cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).finished.then(() => cv.remove());
  };
  requestAnimationFrame(tick);
  return true;
}
setInterval(() => {
  if (document.hidden || busy || document.querySelectorAll(".anim-idle").length >= 2) return;
  const all = [...document.querySelectorAll(".cell > .sym:not(.animating), .car > .sym:not(.animating)")].filter(e => symAnim.img[e.dataset.id + "-idle"]);
  if (all.length) playSymAnim(all[rnd(all.length)], "idle");
}, 650);

// idle: every few seconds a ripple runs diagonally over the board, each symbol hops a little as it passes
setInterval(() => {
  if (document.hidden || busy || autoOn || loading || game.classList.contains("teasing")) return;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const s = cells[c][r].querySelector(".sym"); if (!s || s.classList.contains("animating")) continue;
    s.animate([{ transform: "none", filter: "brightness(1)" }, { transform: "translateY(-5%) scale(1.06)", filter: "brightness(1.35)" }, { transform: "none", filter: "brightness(1)" }],
      { duration: 520, delay: (c + r) * 70, easing: "ease-in-out" });
  }
}, 7000);

// ---------- The main character: his idle loop and his laugh are videos with alpha (assets/boss-idle.webm,
// boss-laugh.webm); until they exist he is the still, and cheers with a little bounce ----------
const boss = $("boss"), bossIdle = $("bossIdle"), bossLaugh = $("bossLaugh");
bossIdle.src = "assets/boss-idle.webm"; bossLaugh.preload = "auto"; bossLaugh.src = "assets/boss-laugh.webm"; bossLaugh.load();
bossIdle.addEventListener("canplay", () => { boss.classList.add("has-vid"); bossIdle.classList.add("on"); bossIdle.play().catch(() => {}); }, { once: true });
bossIdle.addEventListener("error", () => {}); bossLaugh.addEventListener("error", () => {});
function cheer() {
  const bounce = () => { boss.classList.remove("cheer"); void boss.offsetWidth; boss.classList.add("cheer"); };
  if (!boss.classList.contains("has-vid") || bossLaugh.error) return bounce();
  // the laugh takes over from the idle as soon as it really plays, and hands back when it ends
  bossLaugh.currentTime = 0;
  bossLaugh.play().then(() => { bossLaugh.classList.add("on"); bossIdle.classList.remove("on"); }, bounce);
  bossLaugh.onended = () => { bossIdle.classList.add("on"); bossLaugh.classList.remove("on"); };
}
// the living background: a seamless loop (assets/bg.webm) over the still, once it exists
const bgv = $("bgv"); bgv.src = "assets/bg.webm";
bgv.addEventListener("canplay", () => { bgv.play().then(() => bgv.classList.add("on")).catch(() => {}); }, { once: true });
bgv.addEventListener("error", () => {});

const cells = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const d = document.createElement("div"); d.className = "cell"; d.style.gridColumn = c + 1; d.style.gridRow = r + 1; cellsEl.appendChild(d); (cells[c] ||= [])[r] = d; }
function symEl(cell) {
  const d = document.createElement("div"); d.className = "sym " + cell.id; d.dataset.id = cell.id;
  const img = new Image(); img.src = `assets/sym/${cell.id}.webp`; img.alt = ""; d.appendChild(img);
  if (cell.id === "wild") { const m = document.createElement("span"); m.className = "mult"; m.dataset.m = cell.m; m.innerHTML = `<b>×${cell.m}</b>`; d.appendChild(m); }
  if (cell.id === "scatter") { const r = document.createElement("i"); r.className = "neon-ring"; const t = document.createElement("b"); t.className = "fs-neon"; t.textContent = "FS"; d.append(r, t); }
  return d;
}
// the first board: one of each
(() => { const ids = [...PAYING, "scatter", "scatter"]; for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) cells[c][r].appendChild(symEl(c && (c + r) % 7 === 3 ? { id: "wild", m: 2 + (r % 2) } : { id: ids[(c * 5 + r) % ids.length] })); })();

// a spin costs the bet, or Chance ×3's cost × the bet while it is on
const spinCost = () => bet() * modeOf(boostOn ? "BOOST" : "BASE").cost;
function updateHud() {
  $("bal").textContent = RGS.replay ? "–" : money(balance); $("bet").textContent = money(bet()); // replays have no wallet
  $("costChase").textContent = money(modeOf("CHASE").cost * bet()); $("costSuper").textContent = money(modeOf("SUPER").cost * bet()); $("costBoost").textContent = money(modeOf("BOOST").cost * bet());
  $("boostCost").textContent = money(spinCost()); $("boostTag").hidden = !boostOn;
  $("rcChase").textContent = modeOf("CHASE").cost; $("rcSuper").textContent = modeOf("SUPER").cost; $("rcBoost").textContent = modeOf("BOOST").cost;
  $("betTrack").style.setProperty("--p", BETS.length > 1 ? betIdx / (BETS.length - 1) : 0);
  const lock = busy || autoOn || loading || RGS.replay; $("betMinus").disabled = lock || betIdx === 0; $("betPlus").disabled = lock || betIdx === BETS.length - 1;
}
updateHud();
function setBusy(b) { busy = b; const lock = b || autoOn || loading || RGS.replay; $("spin").disabled = lock; $("spin").classList.toggle("go", b); $("bonusBtn").disabled = lock; $("boostOff").disabled = lock; updateHud(); }
// count-ups: the value in motion shows to the cent (the formatter keeps up to 6 decimals for exact sub-cent wins); the end value is exact
async function countTo(el, from, to, ms) { const t0 = performance.now(); ms /= pace(); while (true) { const k = Math.min(1, (performance.now() - t0) / ms); el.textContent = money(k >= 1 ? to : RGS.roundMoney(from + (to - from) * k)); if (k >= 1) break; await new Promise(requestAnimationFrame); } }
function floatText(x, y, text, cls = "") { const f = document.createElement("div"); f.className = "float " + cls; f.textContent = text; f.style.left = x + "%"; f.style.top = y + "%"; floatsEl.appendChild(f); setTimeout(() => f.remove(), 1500); }
const cellPct = (c, r) => [11.6 + 76.8 * (c * PITCH + 8.52) / 100, 11.9 + 76.7 * (r * PITCH + 8.52) / 100]; // board % of a cell's centre

// symbols fall out by reel, the new ones fall in by reel (skip: cells under a car)
async function dropOut(skip = () => false) {
  const anims = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const s = cells[c][r].firstElementChild; if (!s || skip(c, r)) continue;
    anims.push(s.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(260%)", opacity: 0 }], { duration: 260 / pace(), delay: (c * 40 + (4 - r) * 12) / pace(), easing: "ease-in", fill: "forwards" }).finished.then(() => s.remove()));
  }
  await Promise.all(anims);
}
// the new symbols fall in reel by reel. Anticipation: once two sunsets are on the board (base game), the reels
// still to come keep spinning as a blur and stop one at a time, slower and slower, on the real result
async function dropIn(grid, skip = () => false, under = {}) {
  const st = { scat: 0 }; let seen = 0, from = COLS;
  if (!game.classList.contains("chasing")) for (let c = 0; c < COLS; c++) { if (seen >= 2) { from = c; break; } if (grid[c].some(x => x.id === "scatter")) seen++; }
  const strips = [];
  for (let c = from; c < COLS; c++) strips[c] = reelStrip(c, grid, under);
  await dropCols(grid, skip, under, 0, from, st, false);
  if (from >= COLS) return;
  game.classList.add("teasing");
  for (let c = from, k = 0; c < COLS; c++, k++) {
    const s = strips[c]; s.el.classList.add("focus");
    const beam = document.createElement("div"); beam.className = "tease-beam"; beam.style.left = `calc(${cellPct(c, 0)[0]}% - 7.8%)`; board.appendChild(beam);
    sound.play("tease", .85, 1 + .08 * k);
    await sleep(350);
    // the reel slows down, sharpens and stops with a little bounce on exactly the symbols that land
    const ms = 1150 / pace(); s.el.classList.add("landing");
    setTimeout(() => landSounds(grid, under, c, st, skip), ms * .86);
    await s.stop(ms);
    s.el.remove(); beam.remove();
    placeCol(grid, under, c, skip);
  }
  game.classList.remove("teasing");
}
// A reel still to come during the anticipation, built like a real reel strip: on top the five symbols that will land
// (as the board will show them), above them a block of random symbols repeated. It spins as a blur over that block;
// stop() carries it on from where it is, slows it down and lands it exactly on the real five, which then simply stay.
function reelStrip(c, grid, under) {
  const H = cellsEl.offsetHeight, h = H * PITCH / 100, sz = H * .1704, L = 8, R = 4;
  const el = document.createElement("div"); el.className = "reel-blur"; el.style.gridColumn = c + 1; el.style.gridRow = "1 / 6";
  const inner = document.createElement("div"); inner.className = "reel-inner";
  const item = node => { const d = document.createElement("div"); d.className = "it"; d.style.height = h + "px"; d.style.paddingTop = sz * .03 + "px";
    node.style.width = node.style.height = sz * .94 + "px"; d.appendChild(node); return d; };
  for (let r = 0; r < ROWS; r++) inner.appendChild(item(symEl(under[c + "," + r] || grid[c][r])));
  const ids = [...PAYING, "wild"], block = Array.from({ length: L }, () => ids[rnd(ids.length)]);
  for (let i = 0; i < L * R; i++) { const im = new Image(); im.src = `assets/sym/${block[i % L]}.webp`; im.alt = ""; inner.appendChild(item(im)); }
  el.appendChild(inner); cellsEl.appendChild(el);
  // y = how many symbols the strip is pulled up; it spins downward over one block (Y0 + L down to Y0) again and again
  const Y0 = ROWS + L * (R - 2), P = 320, ty = v => `translateY(${-v * h}px)`;
  const loop = inner.animate([{ transform: ty(Y0 + L) }, { transform: ty(Y0) }], { duration: P, iterations: Infinity });
  return {
    el,
    stop(ms) {
      const y = Y0 + L - L * ((loop.currentTime % P) / P); loop.cancel();
      return inner.animate([{ transform: ty(y), filter: "blur(3px) brightness(1.15)" }, { transform: ty(3), filter: "blur(1.5px) brightness(1.1)", offset: .6 },
        { transform: ty(-.1), filter: "blur(0px) brightness(1)", offset: .88 }, { transform: ty(0), filter: "blur(0px) brightness(1)" }],
        { duration: ms, easing: "cubic-bezier(.25,.6,.4,1)", fill: "forwards" }).finished;
    },
  };
}
// the real symbols take the reel's place, where the strip stopped (no drop), and the landing sounds play
function placeCol(grid, under, c, skip) {
  for (let r = 0; r < ROWS; r++) {
    if (skip(c, r)) continue;
    const cell = under[c + "," + r] || grid[c][r], el = symEl(cell); cells[c][r].replaceChildren(el);
    if (cell.id === "scatter") el.classList.add("hit");
  }
}
function landSounds(grid, under, c, st, skip) {
  for (let r = 0; r < ROWS; r++) {
    if (skip(c, r)) continue;
    const id = (under[c + "," + r] || grid[c][r]).id;
    if (id === "wild") sound.play("wild", .7);
    if (id === "scatter") { const n = st.scat++; sound.play("scatter", .8 + .15 * Math.min(n, 2), 1 + .12 * n); }
  }
  sound.play("stop", 1, .97 + c * .02); sound.play("pluck", .5, NOTES[c]);
}
const NOTES = [1, 1.189, 1.335, 1.498, 1.782]; // A C D E G: the landing pluck of reels 1 to 5
async function dropCols(grid, skip, under, from, to, st, slow) {
  const anims = [], dur = (slow ? 620 : 430) / pace();
  for (let c = from; c < to; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (skip(c, r)) continue;
      const cell = under[c + "," + r] || grid[c][r], el = symEl(cell); cells[c][r].replaceChildren(el);
      const delay = ((c - from) * 80 + (4 - r) * 26) / pace(), land = delay + dur * .7;
      anims.push(el.animate([{ transform: "translateY(-260%)", opacity: 0 }, { opacity: 1, offset: .08 }, { transform: "translateY(6%) scale(1.05,.92)", offset: .7 }, { transform: "none", opacity: 1 }],
        { duration: dur, delay, easing: slow ? "cubic-bezier(.2,.6,.3,1)" : "cubic-bezier(.4,0,.6,1)", fill: "backwards" }).finished);
      if (cell.id === "wild") sound.play("wild", .7, 1, land);
      if (cell.id === "scatter") { const n = st.scat++; sound.play("scatter", .8 + .15 * Math.min(n, 2), 1 + .12 * n, land); setTimeout(() => el.classList.add("hit"), land); }
    }
    const t = ((c - from) * 80) / pace() + dur * .7;
    sound.play("stop", slow ? 1 : .8, .97 + c * .02, t); sound.play("pluck", slow ? .5 : .32, NOTES[c], t);
    setTimeout(() => reelStopFx(c, c === to - 1), t);
  }
  await Promise.all(anims);
}
// a reel lands: a light flashes down the column, the board dips a little (more on the last reel)
function reelStopFx(c, last) {
  const f = document.createElement("div"); f.className = "col-flash"; f.style.left = `calc(${cellPct(c, 0)[0]}% - 7.7%)`; board.appendChild(f);
  f.animate([{ opacity: 0, transform: "scaleY(.6)" }, { opacity: 1, transform: "scaleY(1)", offset: .25 }, { opacity: 0, transform: "scaleY(1)" }], { duration: 420, easing: "ease-out" }).finished.then(() => f.remove());
  board.animate([{ transform: "none" }, { transform: `translateY(${last ? 7 : 3}px)` }, { transform: "none" }], { duration: last ? 260 : 160, easing: "ease-out" });
}
// a win: the cells that make it glow, the rest dims, the amount floats over the board
async function showWins(grid, ev, carEls) {
  if (!ev.wins.length) return;
  const lit = new Map();
  // a win lights its symbol and the cars on its first `len` reels (the book does not list positions)
  for (const w of ev.wins) for (let c = 0; c < w.len; c++) for (let r = 0; r < ROWS; r++) { const id = grid[c][r].id; if (id === w.id || id === "wild") lit.set(c + "," + r, TIER(w.id)); }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const k = c + "," + r, el = cells[c][r];
    if (lit.has(k)) { el.classList.add("win"); el.style.setProperty("--wc", lit.get(k)); } else el.classList.add("dim");
  }
  for (const k of lit.keys()) {
    const [c, r] = k.split(",").map(Number), s = cells[c][r].querySelector(".sym"), d = c * 90 / pace();
    if (s) { playSymAnim(s, "win"); s.animate([{ scale: 1 }, { scale: 1.22 }, { scale: 1 }], { duration: 420, delay: d, easing: "cubic-bezier(.3,1.6,.5,1)" }); }
    const ring = document.createElement("div"); ring.className = "shock"; const [x, y] = cellPct(c, r);
    ring.style.left = x + "%"; ring.style.top = y + "%"; ring.style.setProperty("--wc", lit.get(k)); floatsEl.appendChild(ring);
    ring.animate([{ scale: .5, opacity: 0 }, { scale: .9, opacity: 1, offset: .15 }, { scale: 2.1, opacity: 0 }], { duration: 750, delay: d, easing: "ease-out", fill: "backwards" }).finished.then(() => ring.remove());
  }
  board.classList.add("flash"); setTimeout(() => board.classList.remove("flash"), 450 / pace());
  sound.play(ev.total >= 5 ? "winbig" : "win", .8);
  carEls?.forEach(e => { const car = e._car; const s = e.querySelector(".sym"); if (s && lit.has(car.c + "," + car.r)) playSymAnim(s, "win"); if (lit.has(car.c + "," + car.r)) e.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 700 / pace(), iterations: 2 }); });
  floatText(50, 50, money(ev.total * bet()));
  await sleep(1300);
  cells.flat().forEach(el => el.classList.remove("win", "dim"));
}
// Drive-By: a car speeds across the row from the right and the cells it passes turn into cars
// ---------- The supercar in side profile races along a row: in a Drive-By, and whenever 3 or more cars stand in
// one row. Its nose passes column c at the returned time, so the cells can react as it goes by. ----------
const SIDE = { w: 34, from: 100, to: -38 }; SIDE.nose = .04 * SIDE.w; // in board %: the picture's width, its left edge at start and end; the nose sits 4 % into it
function sideRun(r, onPass, ms = 1250) {
  const el = document.createElement("div"); el.className = "sidecar";
  const v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.poster = "assets/sidecar.webp"; v.src = "assets/sidecar.webm";
  el.append(...carFx(), v);
  el.style.top = `calc(${cellPct(0, r)[1]}% - ${SIDE.w * 9 / 16 * .515}%)`; board.appendChild(el); v.play().catch(() => {});
  const dur = ms / pace();
  sound.play("driveby", .95); sound.play("carmove", .6, 1.1, 60);
  for (let c = 0; c < COLS; c++) { // linear motion: the nose reaches the cell's centre when left + nose = x
    const x = cellPct(c, r)[0], k = (SIDE.from - (x - SIDE.nose)) / (SIDE.from - SIDE.to);
    setTimeout(() => onPass?.(c), dur * k);
  }
  return el.animate([{ left: SIDE.from + "%" }, { left: SIDE.to + "%" }], { duration: dur, easing: "linear", fill: "forwards" }).finished.then(() => el.remove());
}
// a row of 3 or more cars: the supercar races along it and every car it passes flashes
const flashCell = el => el?.animate([{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.22)", filter: "brightness(2.4)", offset: .35 }, { transform: "none", filter: "brightness(1)" }], { duration: 520 / pace() });
async function carLines(rows, carAt) {
  if (!rows.length) return;
  say(rows.length > 1 ? "Car lines!" : "Car line!");
  await Promise.all(rows.map((r, i) => sleep(i * 260).then(() => sideRun(r, c => flashCell(carAt(c, r))))));
}
const wildRows = grid => [0, 1, 2, 3, 4].filter(r => grid.filter(col => col[r].id === "wild").length >= 3);
// Drive-By: the supercar races along the row and the cells it passes turn into cars
async function driveBy(d) {
  say("Drive-By!");
  await sideRun(d.r, c => {
    if (!d.cols.includes(c)) return;
    const el = symEl(lastGrid[c][d.r]); cells[c][d.r].replaceChildren(el);
    el.animate([{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.3) rotate(-8deg)", filter: "brightness(3)", offset: .4 }, { transform: "none", filter: "brightness(1)" }], { duration: 500 / pace() });
  });
}
let lastGrid = null;
// ---------- The win screen. The count climbs through the tiers the win reaches (Big 20×, Mega 50×, Epic 100×, Max
// Win at the cap), each tier taking the same time; a new tier slams its title in with a burst. A tap (or Space) jumps
// to the end, a second one closes it; in autoplay it closes by itself. ----------
const TIERS = [["big", 20], ["mega", 50], ["epic", 100], ["max", MAX_WIN]];
const ws = $("winscreen"), wsFx = $("wsFx").getContext("2d");
TIERS.forEach(([t]) => { const im = new Image(); im.src = `assets/win/${t}.webp`; });
let sparks = [], fxOn = false;
function burst(n, rgb, x = 960, y = 465, speed = 1) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 14) * speed;
    sparks.push({ x: x + Math.cos(a) * 200 * Math.random(), y: y + Math.sin(a) * 60 * Math.random(), vx: Math.cos(a) * v, vy: Math.sin(a) * v * .7 - 3, life: 1, decay: .008 + Math.random() * .014, size: 2 + Math.random() * 4, rgb }); }
}
function runFx() {
  if (fxOn) return; fxOn = true;
  const tick = () => {
    if (ws.hidden) { fxOn = false; sparks = []; wsFx.clearRect(0, 0, 1920, 1080); return; }
    wsFx.clearRect(0, 0, 1920, 1080); wsFx.globalCompositeOperation = "lighter";
    if (Math.random() < .5) sparks.push({ x: Math.random() * 1920, y: 1100, vx: (Math.random() - .5) * 1.5, vy: -2 - Math.random() * 4, life: 1, decay: .006, size: 1.5 + Math.random() * 2.5, rgb: getComputedStyle(ws).getPropertyValue("--c").trim().replace(/ /g, ",") });
    for (const p of sparks) {
      p.x += p.vx; p.y += p.vy; p.vy += .12; p.vx *= .985; p.life -= p.decay;
      const r = p.size * (1 + (1 - p.life));
      const g = wsFx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4); g.addColorStop(0, `rgba(255,255,255,${p.life})`); g.addColorStop(.25, `rgba(${p.rgb},${p.life * .9})`); g.addColorStop(1, `rgba(${p.rgb},0)`);
      wsFx.fillStyle = g; wsFx.beginPath(); wsFx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); wsFx.fill();
    }
    sparks = sparks.filter(p => p.life > 0 && p.y < 1200);
    wsFx.globalCompositeOperation = "source-over"; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
let wsTap = null;
ws.addEventListener("pointerdown", () => wsTap?.());
async function winScreen(x, amount) {
  const reach = TIERS.filter(([, at], i) => i === 0 || x >= at);
  const pts = [0, ...reach.slice(1).map(([, at]) => at), x]; // the count runs pts[i] -> pts[i + 1] under tier i
  sound.duck(true); sound.play("bigwin", .9); cheer();
  ws.hidden = false; runFx();
  let tier = -1, skip = false;
  const setTier = i => {
    tier = i; const t = reach[i][0]; ws.dataset.tier = t;
    $("wsImg").src = `assets/win/${t}.webp`; $("wsTitle").style.setProperty("--img", `url(assets/win/${t}.webp)`);
    const el = $("wsTitle"); el.classList.remove("slam"); void el.offsetWidth; el.classList.add("slam");
    const rgb = getComputedStyle(ws).getPropertyValue("--c").trim().replace(/ /g, ",");
    burst(i ? 140 : 90, rgb); burst(40, "255,255,255", 960, 465, .7);
    if (i) { sound.play("tierup", .9); cheer(); }
  };
  wsTap = () => { skip = true; };
  setTier(0);
  const seg = 1900 / pace(), t0 = performance.now(); let stopCount = sound.loop("count", .35);
  while (true) {
    const el = (performance.now() - t0) / seg, i = Math.min(reach.length - 1, Math.floor(el));
    const done = skip || el >= reach.length;
    const k = done ? 1 : el - i, seg_i = done ? reach.length - 1 : i;
    const v = done ? x : pts[seg_i] + (pts[seg_i + 1] - pts[seg_i]) * (seg_i === reach.length - 1 ? 1 - (1 - k) ** 2 : k);
    while (tier < seg_i) setTier(tier + 1);
    $("wsAmt").textContent = money(done ? x * bet() : RGS.roundMoney(v * bet())); $("wsX").textContent = `×${v.toFixed(v < 100 ? 2 : 0)}`;
    if (done) break;
    await new Promise(requestAnimationFrame);
  }
  stopCount(); sound.play("winbig", .7);
  const a = $("wsAmt"); a.classList.remove("bump"); void a.offsetWidth; a.classList.add("bump");
  burst(120, "255,204,34");
  await new Promise(res => { const t = setTimeout(res, (autoOn ? 1800 : 3200) / pace()); wsTap = () => { clearTimeout(t); res(); }; });
  wsTap = null; ws.hidden = true; sound.duck(false);
}
// the end of a bonus: the total, with Continue
async function summary(title, amount) {
  const ov = $("overlay"), go = $("ovGo"); $("ovTitle").textContent = title; $("ovSub").textContent = amount > 0 ? "Total win" : "No win this time"; $("ovAmt").textContent = money(amount);
  go.hidden = false; ov.hidden = false; setTimeout(() => go.focus(), 50);
  // Continue (or Space) goes on at once; otherwise it goes on by itself after a few seconds, so autoplay, a resumed round
  // and a replay never stop here
  await new Promise(res => { const done = () => { clearTimeout(t); go.removeEventListener("click", done); res(); }; go.addEventListener("click", done);
    const t = setTimeout(done, RGS.replay ? 3000 : autoOn ? 3500 : 6000); });
  sound.play("click", .5); go.hidden = true; ov.hidden = true;
}
async function banner(title, sub, ms = 1900) {
  const ov = $("overlay"); $("ovTitle").textContent = title; $("ovSub").textContent = sub; $("ovAmt").textContent = ""; ov.hidden = false;
  await new Promise(res => { const t = setTimeout(res, ms / pace()); ov.addEventListener("pointerdown", () => { clearTimeout(t); res(); }, { once: true }); });
  ov.hidden = true;
}

// ---------- Rounds: play debits the bet (× the mode's cost) on the RGS and returns the round's book; the game plays its
// events; end-round credits a win (a round paying 0× is closed by the RGS already) ----------
async function play(mode) {
  if (busy || loading || RGS.replay) return;
  const cost = bet() * modeOf(mode).cost;
  if (balance < cost) { say("Not enough balance for this bet"); if (autoOn) stopAuto(); return; } // [222] no play request
  setBusy(true); $("win").textContent = money(0); say("Good luck!");
  sound.init(); sound.music("music-base");
  const t0 = performance.now();
  try {
    const res = await RGS.play(bet(), mode);
    balance = res.balance; updateHud();
    await runRound(res.round);
    const wait = RGS.minimumRoundDuration - (performance.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  } catch (err) {
    console.error(err); if (autoOn) stopAuto(); say(RGS.errorText(err));
  } finally {
    setBusy(false);
  }
}
async function runRound(round) {
  await playEvents(round.state);
  if (round.active) { const end = await RGS.endRound(); balance = end.balance; }
  updateHud();
}
async function spin(fromAuto = false) {
  if (busy || introOpen || (autoOn && !fromAuto)) return;
  await play(boostOn ? "BOOST" : "BASE");
}
async function buy(kind) {
  if (busy || autoOn) return;
  await play(kind === "super" ? "SUPER" : "CHASE");
}
// a book cell -> a board cell
const toGrid = b => b.map(col => col.map(s => s.name === "W" ? { id: "wild", m: s.m, car: s.car } : { id: SYM[s.name] }));
const winsOf = ev => ({ total: ev.totalWin / 100, wins: ev.wins.map(w => ({ id: SYM[w.symbol], len: w.kind, ways: w.ways, pay: w.win / 100 })) });
// Plays a round's events: reveal (with the anticipation), Drive-By, car lines, wins, The Chase, the win screen.
async function playEvents(events) {
  let grid = null, fs = null, total = 0, won = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i], next = events[i + 1]?.type;
    switch (ev.type) {
      case "reveal":
        if (ev.gameType === "freegame") { await chaseReveal(fs, ev); break; }
        grid = toGrid(ev.board); lastGrid = grid;
        sound.play("spin", .6); board.classList.add("spinning");
        await dropOut(); await dropIn(grid);
        board.classList.remove("spinning");
        if (next !== "driveBy") await carLines(wildRows(grid), (c, r) => grid[c][r].id === "wild" ? cells[c][r].querySelector(".sym") : null);
        break;
      case "driveBy":
        for (const car of ev.cars) grid[car.reel][car.row] = { id: "wild", m: car.m };
        await driveBy({ r: ev.row, cols: ev.cars.map(car => car.reel) });
        await carLines(wildRows(grid).filter(r => r !== ev.row), (c, r) => grid[c][r].id === "wild" ? cells[c][r].querySelector(".sym") : null);
        break;
      case "winInfo": {
        const w = winsOf(ev);
        if (!fs) say(w.wins.map(x => `${x.len}× ${NAMES[x.id]}`).join(" · "));
        await showWins(fs ? fs.grid : grid, w, fs ? [...fs.carEls.values()] : null);
        break;
      }
      case "setTotalWin": {
        const before = total; total = ev.amount / 100;
        if (fs && total > before) await countTo($("fsWin"), (before - fs.base) * bet(), (total - fs.base) * bet(), 400);
        break;
      }
      case "freeSpinTrigger":
        say(`${ev.positions.length} sunsets: The Chase!`); await sleep(700);
        fs = await chaseStart(ev, total);
        break;
      case "chaseMove": await chaseMove(fs, ev); break;
      case "updateFreeSpin": fs.played = ev.amount; $("fsLeft").textContent = ev.total - ev.amount; break;
      case "carsLand": await chaseLand(fs, ev); break;
      case "freeSpinEnd": await chaseEnd(fs, ev.amount / 100); fs = null; break;
      case "wincap": say("Max win!"); break;
      case "finalWin": won = ev.amount / 100; break;
    }
  }
  if (won >= TIERS[0][1]) await winScreen(won, won * bet());
  if (won > 0) await countTo($("win"), 0, won * bet(), 500);
  say(won > 0 ? `Win ${money(won * bet())}` : "Press Spin");
  return won;
}
// ---------- The way into The Chase, inside the grid ----------
// a neon warp tunnel on a canvas over the cells: streaks fly out of the vanishing point, faster and faster
function warp(ms) {
  const cv = $("warp"), g = cv.getContext("2d"), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, K = W * .07;
  const COL = ["255,46,150", "0,229,255", "255,255,255", "255,154,60"];
  const stars = Array.from({ length: 240 }, () => ({ a: Math.random() * Math.PI * 2, r: .2 + Math.random() * .9, z: .05 + Math.random(), c: COL[rnd(COL.length)] }));
  cv.hidden = false; cv.style.opacity = 1; g.fillStyle = "rgb(8,3,20)"; g.fillRect(0, 0, W, H);
  const t0 = performance.now(), dur = ms / pace();
  return new Promise(res => {
    const tick = now => {
      const t = Math.min(1, (now - t0) / dur), sp = .006 + .055 * Math.min(1, t * 1.4) ** 2;
      g.globalCompositeOperation = "source-over"; g.fillStyle = "rgba(8,3,20,.3)"; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 40 + W * .45 * t); gl.addColorStop(0, `rgba(255,210,240,${.55 * t})`); gl.addColorStop(1, "rgba(255,46,150,0)");
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
      for (const s of stars) {
        const z0 = s.z; s.z -= sp;
        if (s.z <= .03) { s.z = 1 + Math.random() * .2; s.a = Math.random() * Math.PI * 2; continue; }
        const R0 = K * s.r / z0, R1 = K * s.r / s.z;
        g.strokeStyle = `rgba(${s.c},${Math.min(1, (1.1 - s.z) * 1.3)})`; g.lineWidth = .8 + (1 - s.z) * 3.2;
        g.beginPath(); g.moveTo(cx + Math.cos(s.a) * R0, cy + Math.sin(s.a) * R0); g.lineTo(cx + Math.cos(s.a) * R1, cy + Math.sin(s.a) * R1); g.stroke();
      }
      if (t < 1) return requestAnimationFrame(tick);
      cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450 / pace(), fill: "forwards" }).finished.then(() => { cv.hidden = true; res(); });
    };
    requestAnimationFrame(tick);
  });
}
// the getaway car tears past in front of us on a neon highway: it races in from the right, holds the middle for a
// heartbeat, then floors it out to the left; the picture shakes as it passes, a white flash cuts back to the grid
// the free-spins clip in the grid (assets/fsi-grid.webm, the car pass cropped square): it opens out of the middle of
// the reels, the car comes at us and roars past, a flash; the full-screen version below is the fallback
const gridClip = $("gridClip"); gridClip.src = "assets/fsi-grid.webm"; gridClip.load(); gridClip.addEventListener("error", () => {});
async function gridPass() {
  const v = gridClip;
  if (v.readyState < 3 || v.error) return carPass();
  v.hidden = false; v.currentTime = 0; v.playbackRate = turbo ? 1.5 : 1;
  v.animate([{ transform: "scale(.2)", opacity: 0, filter: "brightness(3)" }, { transform: "scale(1.03)", opacity: 1, filter: "brightness(1.3)", offset: .7 }, { transform: "none", opacity: 1, filter: "none" }],
    { duration: 420 / pace(), easing: "cubic-bezier(.2,.9,.3,1.1)" });
  try { await v.play(); } catch { v.hidden = true; return carPass(); }
  // the car comes at us, but vanishes inside the window while it is still well within the grid's border (clip time
  // END): it flares into light and the window collapses into the reels
  const END = 1.9, rest = (END - .45) * 1000 / v.playbackRate;
  sound.play("carmove", .8, .9, 100); sound.play("driveby", 1, 1, rest); setTimeout(cheer, rest);
  await new Promise(res => { const tick = () => (v.currentTime >= END || v.ended || v.paused) ? res() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  v.pause(); sound.play("warp", .5, 1.4);
  board.classList.add("flash"); setTimeout(() => board.classList.remove("flash"), 450 / pace());
  await v.animate([{ opacity: 1, transform: "none", filter: "brightness(1)" }, { opacity: 1, transform: "scale(1.02)", filter: "brightness(2.6) saturate(1.5)", offset: .35 },
    { opacity: 0, transform: "scale(.55)", filter: "brightness(5)" }], { duration: 420 / pace(), easing: "ease-in", fill: "forwards" }).finished;
  v.pause(); v.hidden = true; v.getAnimations().forEach(a => a.cancel());
}
const fsiv = $("fsiv"); fsiv.src = "assets/fsi.webm"; fsiv.load(); fsiv.addEventListener("error", () => {});
// the filmed clip: the car comes at us down the neon boulevard and roars past on the left (assets/fsi.webm, Gemini
// Omni); it is cut with a flash once the car has gone. Without the clip the built scene below plays instead.
async function carPass() {
  const f = $("fsi");
  if (fsiv.readyState < 3 || fsiv.error) return builtPass();
  f.hidden = false; f.classList.add("film"); fsiv.currentTime = 0; fsiv.playbackRate = turbo ? 1.5 : 1;
  f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 / pace(), fill: "forwards" });
  try { await fsiv.play(); } catch { f.classList.remove("film"); return builtPass(); }
  const rest = ((fsiv.duration || 3) - .9) * 1000 / fsiv.playbackRate;
  sound.play("carmove", .8, .9, 100); sound.play("driveby", 1, 1, rest); setTimeout(cheer, rest);
  await new Promise(res => { const tick = () => (fsiv.currentTime >= (fsiv.duration || 3) - .06 || fsiv.ended || fsiv.paused) ? res() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  const fl = f.querySelector(".fsi-flash");
  await fl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 / pace(), fill: "forwards" }).finished;
  fsiv.pause(); f.hidden = true; f.classList.remove("film"); fl.getAnimations().forEach(a => a.cancel());
}
async function builtPass() {
  const f = $("fsi"), car = f.querySelector(".fsi-car"), dur = 2100 / pace();
  f.hidden = false; f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 / pace(), fill: "forwards" });
  sound.play("driveby", 1); sound.play("carmove", .8, .9, 700 / pace()); cheer();
  const drive = car.animate([
    { transform: "translateX(2050px) scale(.9)", easing: "cubic-bezier(.15,.75,.35,1)" },
    { transform: "translateX(620px) scale(1)", offset: .4, easing: "linear" },
    { transform: "translateX(540px) scale(1.02)", offset: .56, easing: "cubic-bezier(.6,0,.95,.5)" },
    { transform: "translateX(-1400px) scale(1.08)" }], { duration: dur, fill: "forwards" });
  setTimeout(() => f.animate([{ transform: "none" }, { transform: "translate(-6px, 4px)" }, { transform: "translate(5px, -3px)" }, { transform: "translate(-3px, 2px)" }, { transform: "none" }],
    { duration: 380 / pace(), iterations: 2 }), dur * .56);
  await drive.finished;
  await f.querySelector(".fsi-flash").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 / pace(), fill: "forwards" }).finished;
  f.hidden = true; drive.cancel(); f.querySelector(".fsi-flash").getAnimations().forEach(a => a.cancel());
}
async function warpIn(title, sub) {
  sound.play("warp", .9); sound.duck(true);
  const pulls = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const s = cells[c][r].firstElementChild; if (!s) continue;
    pulls.push(s.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${(2 - c) * 121.7}%, ${(2 - r) * 121.7}%) scale(.05) rotate(${(c - 2) * 50 + (r - 2) * 20}deg)`, opacity: 0 }],
      { duration: 620 / pace(), delay: Math.hypot(c - 2, r - 2) * 70 / pace(), easing: "cubic-bezier(.6,0,.9,.45)", fill: "forwards" }).finished.then(() => s.remove()));
  }
  const tunnel = warp(1800);
  await sleep(700);
  await gridPass();
  await Promise.all(pulls);
  const fl = document.createElement("div"); fl.className = "grid-flash"; board.appendChild(fl);
  fl.animate([{ opacity: 0 }, { opacity: .95, offset: .2 }, { opacity: 0 }], { duration: 600 / pace() }).finished.then(() => fl.remove());
  game.classList.add("chasing");
  await tunnel;
  const gt = document.createElement("div"); gt.className = "grid-title"; gt.innerHTML = `<h2></h2><p></p>`; gt.querySelector("h2").textContent = title; gt.querySelector("p").textContent = sub;
  board.appendChild(gt);
  gt.animate([{ transform: "scale(2.2)", opacity: 0, filter: "blur(10px)" }, { transform: "scale(.95)", opacity: 1, filter: "blur(0)", offset: .6 }, { transform: "none", opacity: 1 }], { duration: 520 / pace(), easing: "ease-out" });
  await new Promise(res => { const t = setTimeout(res, 1600 / pace()); board.addEventListener("pointerdown", () => { clearTimeout(t); res(); }, { once: true }); });
  await gt.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 300 / pace(), fill: "forwards" }).finished; gt.remove();
  sound.duck(false);
}
// a car's light trails and headlight beam
function carFx() { const t = document.createElement("div"); t.className = "trail"; t.innerHTML = "<i></i><i></i><i></i>"; const l = document.createElement("div"); l.className = "lights"; return [t, l]; }
// a car drives one reel left: it pulls away nose up, light trails stream from its tail and its headlights come on, then
// it brakes into the new cell (nose dips, settles). Off the board (Nitro) it floors it and is gone.
function driveCar(el, to) {
  const exit = to < 0, from = parseFloat(el.style.left), dest = exit ? -45 : to * PITCH, dur = (exit ? 760 : 640) / pace();
  el.style.left = dest + "%";
  el.animate([{ left: from + "%" }, { left: dest + "%" }], { duration: dur, easing: exit ? "cubic-bezier(.45,0,.9,.5)" : "cubic-bezier(.55,0,.2,1)" });
  el.querySelector(".sym").animate(exit
    ? [{ transform: "none" }, { transform: "translateY(-6%) rotate(5deg) scale(1.1)", offset: .3 }, { transform: "translateY(-4%) rotate(3deg) scale(1.1)" }]
    : [{ transform: "none" }, { transform: "translateY(-6%) rotate(5deg) scale(1.08)", offset: .22 }, { transform: "translateY(-3%) rotate(1deg) scale(1.06)", offset: .68 },
       { transform: "translateY(3%) rotate(-5deg) scale(1.02)", offset: .86 }, { transform: "none" }], { duration: dur, easing: "ease-out" });
  el.querySelector(".trail").animate([{ width: "0%", opacity: 0 }, { width: exit ? "240%" : "140%", opacity: 1, offset: .35 }, { width: "120%", opacity: .9, offset: .72 }, { width: "30%", opacity: 0 }],
    { duration: dur + 260 / pace(), easing: "ease-out" });
  el.querySelector(".lights").animate([{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: dur });
  if (exit) el.animate([{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: dur, fill: "forwards" });
  return new Promise(r => setTimeout(r, dur + 60));
}
// The Chase, step by step from its events: cars stay and drive one reel left before every spin (chaseMove), a car
// leaving the board gives one more spin; the free cells spin (reveal); cars that land stay (carsLand)
async function chaseStart(ev, base) {
  const superMode = !!ev.super;
  sound.play("chase", .9); sound.music("music-chase"); cheer();
  await warpIn(superMode ? "Super Chase" : "The Chase", `${ev.totalFs} free spins`);
  game.classList.add("chasing"); $("fsTitle").textContent = superMode ? "Super Chase" : "The Chase";
  $("fsLeft").textContent = ev.totalFs; $("fsWin").textContent = money(0);
  return { superMode, base, played: 0, cars: new Map(), carEls: new Map(), grid: null, before: [] };
}
async function chaseMove(fs, ev) {
  sound.play("carmove", .6);
  const drives = [];
  for (const car of ev.cars) { const o = fs.cars.get(car.id), el = fs.carEls.get(car.id); if (!o || !el) continue; o.c = car.reel; o.r = car.row; drives.push(driveCar(el, car.reel)); }
  for (const x of ev.exits) {
    const el = fs.carEls.get(x.id); fs.carEls.delete(x.id); fs.cars.delete(x.id);
    if (el) drives.push(driveCar(el, -1).then(() => el.remove()));
  }
  await Promise.all(drives);
  for (const x of ev.exits) { const [px, py] = cellPct(0, x.row); floatText(px, py, "Nitro +1 spin", "nitro"); sound.play("nitro", .8); }
  if (ev.exits.length) { const s = $("fsLeft"); s.textContent = ev.totalFs - fs.played; s.classList.remove("bump"); void s.offsetWidth; s.classList.add("bump"); await sleep(500); }
}
const rowCounts = fs => [0, 1, 2, 3, 4].map(r => [...fs.cars.values()].filter(car => car.r === r).length);
async function chaseReveal(fs, ev) {
  const occupied = new Set([...fs.cars.values()].map(car => car.c + "," + car.r)), skip = (c, r) => occupied.has(c + "," + r);
  board.classList.add("spinning"); sound.play("spin", .45);
  await dropOut(skip);
  for (const k of occupied) { const [c, r] = k.split(",").map(Number); cells[c][r].replaceChildren(); }
  fs.grid = toGrid(ev.board); lastGrid = fs.grid; fs.before = rowCounts(fs);
  await dropIn(fs.grid, skip);
  board.classList.remove("spinning");
}
// a car that lands leaves its cell and becomes a driving car; a new row of 3+ cars sends the supercar along it
async function chaseLand(fs, ev) {
  for (const x of ev.cars) {
    const car = { id: x.id, c: x.reel, r: x.row, m: x.m };
    cells[car.c][car.r].replaceChildren();
    const el = document.createElement("div"); el.className = "car"; el._car = car; el.style.left = (car.c * PITCH) + "%"; el.style.top = (car.r * PITCH) + "%";
    el.append(...carFx(), symEl({ id: "wild", m: car.m })); carsEl.appendChild(el);
    fs.cars.set(car.id, car); fs.carEls.set(car.id, el);
    el.animate([{ transform: "scale(1.5)", filter: "brightness(3)" }, { transform: "none", filter: "brightness(1)" }], { duration: 420 / pace() });
  }
  await sleep(350);
  const after = rowCounts(fs), lines = after.map((n, r) => n >= 3 && fs.before[r] < 3 ? r : -1).filter(r => r >= 0);
  await carLines(lines, (c, r) => { const car = [...fs.cars.values()].find(x => x.c === c && x.r === r); return car ? fs.carEls.get(car.id) : null; });
}
async function chaseEnd(fs, amount) {
  await sleep(400);
  for (const el of fs.carEls.values()) driveCar(el, -1);
  await sleep(800); carsEl.replaceChildren();
  sound.play("chaseover", .8); board.classList.add("flash"); setTimeout(() => board.classList.remove("flash"), 500);
  await summary(fs.superMode ? "Super Chase complete" : "Chase complete", amount * bet());
  sound.music("music-base");
  game.classList.remove("chasing");
}

function paytable() {
  const num = v => v.toLocaleString(RGS.lang, { maximumFractionDigits: 2 });
  $("modesTable").tBodies[0].replaceChildren(...MODES.map(m => {
    const tr = document.createElement("tr");
    [m.name, `${num(m.cost)}× ${RGS.socialText("the bet")}`, `${m.rtp.toLocaleString(RGS.lang, { minimumFractionDigits: 2 })} %`, `${num(m.maxWin)}×`].forEach(t => { tr.insertCell().textContent = t; });
    return tr;
  }));
  $("paytable").replaceChildren(...PAYING.map(id => {
    const d = document.createElement("div"); d.className = "pt";
    d.innerHTML = `<img src="assets/sym/${id}.webp" alt=""><div><i class="pt-name">${NAMES[id]}</i>${[5, 4, 3].map(n => `<b>${n}</b> ${small(PAY[id][n - 3] * K * bet())}`).join("<br>")}</div>`; return d;
  }));
}
$("infoBtn").addEventListener("click", () => { sound.init(); sound.play("click", .5); closeMenu(); paytable(); $("info").hidden = false; });
$("infoClose").addEventListener("click", () => { sound.play("click", .5); $("info").hidden = true; });
$("info").addEventListener("click", e => { if (e.target === $("info")) $("info").hidden = true; });
$("muteBtn").addEventListener("click", () => { sound.init(); const m = sound.toggle(); $("muteBtn").setAttribute("aria-pressed", m); $("muteText").textContent = m ? "Sound off" : "Sound on"; });
// ---------- The menu (bottom left): game info, music and effects volume, sound on or off ----------
const menu = $("menu");
function closeMenu() { menu.hidden = true; $("menuBtn").setAttribute("aria-expanded", false); }
$("menuBtn").addEventListener("click", () => { sound.init(); sound.play("click", .5); const open = menu.hidden; menu.hidden = !open; $("menuBtn").setAttribute("aria-expanded", open); });
document.addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target) && !$("menuBtn").contains(e.target)) closeMenu(); });
for (const [id, set] of [["musicVol", v => sound.setMusic(v)], ["sfxVol", v => sound.setSfx(v)]]) {
  const el = $(id), upd = () => { el.style.setProperty("--v", el.value + "%"); set(el.value / 100); };
  el.addEventListener("input", upd); el.addEventListener("change", () => { sound.init(); sound.play("click", .5); }); upd();
}

// ---------- Confirmation: every bonus (the two bonuses and Chance ×3) shows its cost and waits for Confirm ----------
function ask(title, text, cost, yes = "Confirm") {
  const dlg = $("confirm"); $("cfTitle").textContent = RGS.socialText(title); $("cfText").textContent = RGS.socialText(text); $("cfCost").textContent = cost; $("cfYes").textContent = RGS.socialText(yes); dlg.hidden = false;
  setTimeout(() => $("cfNo").focus(), 30);
  return new Promise(res => {
    const done = v => { dlg.hidden = true; $("cfYes").onclick = $("cfNo").onclick = dlg.onclick = null; sound.play("click", .5); res(v); };
    $("cfYes").onclick = () => done(true); $("cfNo").onclick = () => done(false); dlg.onclick = e => { if (e.target === dlg) done(false); };
  });
}

// ---------- The bonus menu: The Chase, Super Chase (a price each) and the Chance ×3 switch ----------
const bonusDlg = $("bonusDlg");
function openBonus() {
  for (const b of bonusDlg.querySelectorAll("[data-buy]")) { const short = balance < modeOf(b.dataset.buy).cost * bet(); b.disabled = short; b.textContent = short ? "Not enough balance" : "Get"; }
  $("boostToggle").setAttribute("aria-pressed", boostOn); $("boostToggle").textContent = boostOn ? "Turn off" : "Turn on";
  bonusDlg.hidden = false;
}
const closeBonus = () => { bonusDlg.hidden = true; };
$("bonusBtn").addEventListener("click", () => { if (busy || autoOn || loading || RGS.replay) return; sound.init(); sound.play("click", .5); openBonus(); });
$("bonusClose").addEventListener("click", () => { sound.play("click", .5); closeBonus(); });
bonusDlg.addEventListener("click", e => { if (e.target === bonusDlg) closeBonus(); });
for (const b of bonusDlg.querySelectorAll("[data-buy]")) b.addEventListener("click", async () => {
  const kind = b.dataset.buy, cost = modeOf(kind).cost * bet(); sound.play("click", .5);
  if (busy || autoOn || balance < cost) return;
  const ok = await ask(kind === "super" ? "Super Chase" : "The Chase", kind === "super" ? "10 free spins, every car ×3 or more. Start it for" : "10 free spins. Start it for", money(cost));
  if (!ok) return;
  closeBonus(); buy(kind);
});
function setBoost(on) { boostOn = on; updateHud(); $("boostToggle").setAttribute("aria-pressed", on); $("boostToggle").textContent = on ? "Turn off" : "Turn on"; say(on ? `Chance ×3 on: ${money(spinCost())} per spin` : "Chance ×3 off"); }
$("boostToggle").addEventListener("click", async () => {
  sound.play("click", .5);
  if (busy || autoOn) return;
  if (boostOn) { setBoost(false); return; }
  const ok = await ask("Chance ×3", `The Chase starts about 3× as often. While it is on, every spin costs ${modeOf("BOOST").cost}× the bet:`, `${money(modeOf("BOOST").cost * bet())} per spin`, "Turn on");
  if (!ok) return;
  setBoost(true); closeBonus();
});
$("boostOff").addEventListener("click", () => { if (busy || autoOn) return; sound.play("click", .5); setBoost(false); });

// ---------- The intro: three cards, then a tap anywhere (it also starts the sound) ----------
let introOpen = true, introDoneRes;
const introDone = new Promise(r => { introDoneRes = r; });
const intro = $("intro");
function closeIntro() {
  if (!introOpen) return; introOpen = false; introDoneRes();
  sound.init(); sound.music("music-base"); sound.play("click", .5);
  intro.classList.add("out"); setTimeout(() => { intro.hidden = true; }, 500);
}
intro.addEventListener("click", closeIntro);
// ---------- Autoplay: pick a number of spins, then Start (the confirmation step); the button shows the spins left
// and stops the run when pressed ----------
const autoBtn = $("autoBtn"), autoMenu = $("autoMenu");
function showAuto() { $("autoLeft").hidden = !autoOn; $("autoLeft").textContent = autoLeft === Infinity ? "∞" : autoLeft; autoBtn.setAttribute("aria-pressed", autoOn); }
function stopAuto(msg) { autoOn = false; autoLeft = 0; showAuto(); setBusy(busy); if (msg) say(msg); }
async function runAuto() {
  autoOn = true; autoLeft = autoChoice; showAuto(); setBusy(busy);
  while (autoOn && autoLeft > 0) {
    if (balance < spinCost()) { stopAuto("Not enough balance"); break; }
    await spin(true);
    if (autoLeft !== Infinity) autoLeft--; showAuto();
    if (autoLeft <= 0) { stopAuto("Autoplay ended"); break; }
    await sleep(350);
  }
}
autoBtn.addEventListener("click", () => {
  sound.init(); sound.play("click", .5);
  if (autoOn) { stopAuto("Autoplay stopped"); return; }
  if (busy) return;
  closeMenu(); const open = autoMenu.hidden; autoMenu.hidden = !open; autoBtn.setAttribute("aria-expanded", open);
});
autoMenu.querySelectorAll("[data-n]").forEach(b => b.addEventListener("click", () => {
  sound.play("click", .5); autoChoice = Number(b.dataset.n);
  autoMenu.querySelectorAll("[data-n]").forEach(x => x.setAttribute("aria-pressed", x === b)); $("amStart").disabled = false;
}));
$("amStart").addEventListener("click", () => { sound.play("click", .5); autoMenu.hidden = true; autoBtn.setAttribute("aria-expanded", false); runAuto(); });
$("amClose").addEventListener("click", () => { sound.play("click", .5); autoMenu.hidden = true; autoBtn.setAttribute("aria-expanded", false); });

$("spin").addEventListener("click", () => spin());
// Space: closes the intro, continues after a bonus, stops autoplay, otherwise spins; it does nothing while a menu or dialog is open
addEventListener("keydown", e => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (loading || RGS.replay) return;
  if (introOpen) return closeIntro();
  if (!ws.hidden) return wsTap?.();
  if (!$("ovGo").hidden) return $("ovGo").click();
  if (autoOn) return stopAuto("Autoplay stopped");
  if ([$("confirm"), bonusDlg, $("info"), autoMenu, menu, $("errDlg"), $("replayDlg")].some(d => !d.hidden)) return;
  if (RGS.jurisdiction.disabledSpacebar) return;
  spin();
});
$("betMinus").addEventListener("click", () => { if (!busy && !autoOn && !loading && betIdx > 0) { betIdx--; updateHud(); sound.play("click", .5); if (boostOn) say(`Chance ×3 on: ${money(spinCost())} per spin`); } });
$("betPlus").addEventListener("click", () => { if (!busy && !autoOn && !loading && betIdx < BETS.length - 1) { betIdx++; updateHud(); sound.play("click", .5); if (boostOn) say(`Chance ×3 on: ${money(spinCost())} per spin`); } });
$("turbo").addEventListener("click", () => { turbo = !turbo; $("turbo").setAttribute("aria-pressed", turbo); sound.init(); sound.play("click", .5); });


// ---------- Start: authenticate (or load a replay), apply the bet levels and the jurisdiction, resume an open round ----------
function showError(text) { $("errText").textContent = text; $("errDlg").hidden = false; $("errReload").focus(); }
$("errReload").addEventListener("click", () => location.reload());
// Replay: a panel shows bet, mode and real cost and plays the round; afterwards it offers to watch it again
async function replayLoop(round) {
  const m = modeOf(round.mode), line = `${m.name} · ${RGS.socialText("Bet")} ${money(round.amount)}` + (round.cost > 1 ? ` · ×${round.cost} · ${RGS.socialText("Real cost")} ${money(round.amount * round.cost)}` : "");
  const bar = $("replayBar"); bar.textContent = `Replay · ${line}`; bar.hidden = false;
  for (let first = true; ; first = false) {
    $("replayInfo").textContent = first ? line : `${line} · Win ${money(round.amount * (round.payoutMultiplier || 0))}`;
    $("replayGo").textContent = first ? "Play" : "Replay again";
    $("replayDlg").hidden = false; $("replayGo").focus();
    await new Promise(res => $("replayGo").addEventListener("click", res, { once: true }));
    $("replayDlg").hidden = true; sound.init();
    busy = true; $("spin").disabled = true;
    await playEvents(round.state);
    say("Replay finished");
  }
}
async function boot() {
  setBusy(true); say("Loading…");
  let s;
  try { s = await RGS.init(); } catch (err) { console.error(err); LOADER.ready(); say(RGS.errorText(err)); showError(RGS.errorText(err)); return; }
  LOADER.ready();
  try {
    balance = s.balance; BETS = s.betLevels; betIdx = Math.max(0, BETS.indexOf(s.defaultBet));
    const j = s.jurisdiction || {};
    if (j.socialCasino && !RGS.social) { const u = new URL(location.href); u.searchParams.set("social", "true"); location.replace(u); return; }
    if (j.disabledAutoplay) autoBtn.hidden = true;
    if (j.disabledTurbo) { turbo = false; $("turbo").hidden = true; }
    if (j.disabledBuyFeature) { $("bonusBtn").hidden = true; setBoost(false); }
    loading = false; setBusy(false); updateHud(); $("win").textContent = money(0);
    if (RGS.replay) { closeIntro(); autoBtn.hidden = $("bonusBtn").hidden = $("turbo").hidden = true; return await replayLoop(s.round); }
    await introDone; // an interrupted round resumes once the player has seen the intro
    if (s.round) {
      // [187] the open round's stake stays selected afterwards, even if it is not one of today's levels
      if (s.round.amount) { if (!BETS.includes(s.round.amount)) BETS = [...BETS, s.round.amount].sort((a, b) => a - b); betIdx = BETS.indexOf(s.round.amount); }
      setBusy(true); say("Resuming your round");
      await runRound(s.round);
      setBusy(false);
    } else say("Press Spin");
  } catch (err) {
    console.error(err); setBusy(false); say(RGS.errorText(err));
  }
}
// ---------- Social mode (Stake.us): the page's own texts use social wording too ----------
if (RGS.social) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) n.nodeValue = RGS.socialText(n.nodeValue);
  document.querySelectorAll("[aria-label]").forEach(el => el.setAttribute("aria-label", RGS.socialText(el.getAttribute("aria-label"))));
  document.title = RGS.socialText(document.title);
}
// the loader waits for the first screen's pictures, the fonts and the RGS
LOADER.track(["assets/bg.webp", "assets/logo.webp", "assets/logo-neon.webp", "assets/studio-ink.webp", "assets/grid.webp", "assets/boss.webp", "assets/card.webp", "assets/mult.webp",
  ...PAYING.map(id => `assets/sym/${id}.webp`), "assets/sym/wild.webp", "assets/sym/scatter.webp"]);
LOADER.onGesture(() => sound.init());
boot();
