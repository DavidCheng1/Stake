const IMG = {"book": "assets/book.webp", "key": "assets/key.webp", "blue": "assets/blue.webp", "devil": "assets/devil.webp", "witch": "assets/witch.webp", "pirate": "assets/pirate.webp", "fs": "assets/fs.webp", "vs": "assets/vs.webp", "rune_green": "assets/rune_green.webp", "rune_blue": "assets/rune_blue.webp", "rune_purple": "assets/rune_purple.webp", "rune_fire": "assets/rune_fire.webp", "rune_pink": "assets/rune_pink.webp", "lantern": "assets/lantern.webp", "ring": "assets/ring.webp", "potion": "assets/potion.webp"};
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLS = 7, ROWS = 7;
// Bet levels, balance and currency come from the RGS once authenticated (see boot() at the end)
let BETS = [1], betIdx = 0, bet = 1, balance = 0;
const money = v => RGS.formatMoney(v);
// German for lang=de, English for every other language
// social mode (Stake.us) is English only, with restricted gambling words replaced
const i18n = (de, en) => RGS.lang === "de" && !RGS.social ? de : RGS.socialText(en);
// ---------- Pace: turbo plays a round faster; a click during a round (slam stop) hurries the sequence that is playing ----------
// Every wait (sleep, later) and every scripted animation runs at pace(); the idle CSS loops keep their own speed.
const TURBO = 2, SLAM = 6;
let turbo = false, slam = false;
const pace = () => (turbo ? TURBO : 1) * (slam ? SLAM : 1);
// Each sequence of a round (reels, a win, a tumble, a duel, a banner, a bonus spin...) calls this when it starts,
// so a skip hurries only the sequence it was pressed in and the next one plays at normal speed again.
function nextSequence() { slam = false; }
const waits = new Set();
const sleep = ms => new Promise(res => {
  const d = ms / pace(), w = { res, end: performance.now() + d };
  w.t = setTimeout(() => { waits.delete(w); res(); }, d); waits.add(w);
});
const later = (fn, ms) => setTimeout(fn, ms / pace());
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (keyframes, opt) {
  const p = pace();
  if (p !== 1) opt = typeof opt === "number" ? opt / p
    : opt && { ...opt, ...(typeof opt.duration === "number" && { duration: opt.duration / p }), ...(opt.delay && { delay: opt.delay / p }) };
  return nativeAnimate.call(this, keyframes, opt);
};
// re-time what is already running: pending waits and scripted animations finish SLAM times sooner
function hurry() {
  const now = performance.now();
  waits.forEach(w => { clearTimeout(w.t); const left = Math.max(0, w.end - now) / SLAM; w.end = now + left; w.t = setTimeout(() => { waits.delete(w); w.res(); }, left); });
  document.getAnimations().forEach(a => { if (!(window.CSSAnimation && a instanceof CSSAnimation) && !(window.CSSTransition && a instanceof CSSTransition)) a.updatePlaybackRate(a.playbackRate * SLAM); });
}
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const q = (el, s) => el.querySelector(s), qa = (el, s) => [...el.querySelectorAll(s)];
function div(cls) { const d = document.createElement("div"); if (cls) d.className = cls; return d; }

// ---------- Symbols ----------
// pay = win for cluster size 4,5,6,7,8,9+ (× bet), must match math-sdk/games/ghost_duels/game_config.py
// Outcomes come from the RGS; w is only used for the cosmetic blur during tease spins.
const SYM = {
  devil:  { name: i18n("Teufel", "Devil"),           tier: "char", rgb: "255 122 42",  w: 2.5, pay: [7, 12, 35, 80, 160, 350] },
  pirate: { name: i18n("Piratengeist", "Pirate Ghost"),     tier: "char", rgb: "89 255 156",  w: 3,   pay: [5, 10, 25, 70, 120, 250] },
  witch:  { name: i18n("Hexengeist", "Witch Ghost"),       tier: "char", rgb: "211 107 255", w: 3.5, pay: [4, 8, 20, 50, 100, 200] },
  blue:   { name: i18n("Geisterchen", "Little Ghost"),      tier: "char", rgb: "79 227 255",  w: 4,   pay: [3.5, 7, 16, 40, 80, 160] },
  book:   { name: i18n("Zauberbuch", "Spellbook"),       tier: "obj",  rgb: "192 107 255", w: 5,   pay: [2, 4, 8, 16, 35, 70] },
  ring:   { name: i18n("Fluchring", "Cursed Ring"),        tier: "obj",  rgb: "222 110 255", w: 5,   pay: [2, 4, 8, 16, 35, 70] },
  key:    { name: i18n("Schädelschlüssel", "Skull Key"), tier: "obj",  rgb: "255 225 77",  w: 6,   pay: [1.2, 2.5, 5, 10, 20, 40] },
  lantern:{ name: i18n("Geisterlaterne", "Ghost Lantern"),   tier: "obj",  rgb: "93 255 143",  w: 6,   pay: [1.2, 2.5, 5, 10, 20, 40] },
  potion: { name: i18n("Fluchtrank", "Curse Potion"),       tier: "obj",  rgb: "255 92 232",  w: 6,   pay: [1, 2, 4, 8, 16, 35] },
  rune_green:  { name: i18n("Erdrune", "Earth Rune"),   tier: "rune", rgb: "93 255 122",  w: 10, pay: [.3, .8, 1.2, 2.5, 5, 10] },
  rune_blue:   { name: i18n("Eisrune", "Ice Rune"),   tier: "rune", rgb: "79 200 255",  w: 10, pay: [.3, .8, 1.2, 2.5, 5, 10] },
  rune_purple: { name: i18n("Schattenrune", "Shadow Rune"), tier: "rune", rgb: "196 92 255", w: 10, pay: [.3, .8, 1.2, 2.5, 5, 10] },
  rune_fire:   { name: i18n("Feuerrune", "Fire Rune"), tier: "rune", rgb: "255 138 42",  w: 10, pay: [.3, .8, 1.2, 2.5, 5, 10] },
  rune_pink:   { name: i18n("Wirbelrune", "Whirl Rune"), tier: "rune", rgb: "255 79 168", w: 10, pay: [.3, .8, 1.2, 2.5, 5, 10] },
  fs:     { name: i18n("Freispiele", "Free Spins"),       tier: "scatter", rgb: "255 79 210", w: .516, gloss: true },
  vs:     { name: "VS",               tier: "special", rgb: "120 220 255", w: 0, gloss: true }
};
const CHARS = ["devil", "pirate", "witch", "blue"];
const SYM_IDS = Object.keys(SYM).filter(id => SYM[id].w > 0), SYM_CUM = []; let SYM_TOT = 0;
for (const id of SYM_IDS) { SYM_TOT += SYM[id].w; SYM_CUM.push(SYM_TOT); }
const randSym = () => { const x = Math.random() * SYM_TOT; for (let i = 0; i < SYM_CUM.length; i++) if (x < SYM_CUM[i]) return SYM_IDS[i]; return SYM_IDS[0]; };
const MAX_WIN_X = 25000;
// Buyable modes. cost must match buy_modes in math-sdk/games/ghost_duels/game_config.py; rtp and maxWin come from the
// published lookup tables (math-sdk library/stats_<mode>.json; every mode is optimized to 96.00 %). Update them after
// rerunning run.py.
const BUYS = [
  { mode: "BONUS", cost: 182, rtp: 96.00, maxWin: 25000, fs: 3, name: i18n("Geisterkisten", "Ghost Crates"),
    text: i18n("3 bis 5 FS: der Geisterkisten-Bonus startet sofort.", "3 to 5 FS: the Ghost Crates bonus starts right away.") },
  { mode: "BONUS4", cost: 324, rtp: 96.00, maxWin: 25000, fs: 4, name: i18n("Große Geisterkisten", "Big Ghost Crates"),
    text: i18n("Genau 4 FS: der Bonus startet mit 4 Kisten.", "Exactly 4 FS: the bonus starts with 4 crates.") },
  { mode: "BONUS5", cost: 650, rtp: 96.00, maxWin: 25000, fs: 5, name: i18n("Mega-Geisterkisten", "Mega Ghost Crates"),
    text: i18n("Genau 5 FS: 5 Kisten, öfter mit ×3.", "Exactly 5 FS: 5 crates, more often at ×3.") },
  { mode: "VSSPIN", cost: 5, rtp: 96.00, maxWin: 25000, vs: true, name: i18n("VS-Spin", "VS Spin"),
    text: i18n("Ein Spin mit mindestens einer VS-Walze: jede Gruppe, die sie erreicht, startet ein Duell.", "A spin with at least one VS reel: every group that reaches it starts a duel.") },
];
const BASE_INFO = { mode: "BASE", cost: 1, rtp: 96.00, maxWin: 25000 };
// FS Boost: bet variants switched on for every spin (math modes "boost" and "boost6", fs_weight in game_config.py); rtp
// and maxWin from the published lookup tables like BUYS.
const BOOSTS = [
  { mode: "BOOST", cost: 3, rtp: 96.00, maxWin: 25000, level: "3×", name: i18n("FS-Boost 3×", "FS Boost 3×"),
    text: i18n("Jeder Spin kostet 3× den Einsatz, dafür landen FS-Symbole öfter: der Geisterkisten-Bonus kommt etwa 7× so oft.",
      "Every spin costs 3× the bet, and FS symbols land more often: the Ghost Crates bonus comes about 7× as often.") },
  { mode: "BOOST6", cost: 6, rtp: 96.00, maxWin: 25000, level: "6×", name: i18n("FS-Boost 6×", "FS Boost 6×"),
    text: i18n("Jeder Spin kostet 6× den Einsatz, dafür landen FS-Symbole noch öfter: der Geisterkisten-Bonus kommt etwa 15× so oft.",
      "Every spin costs 6× the bet, and FS symbols land even more often: the Ghost Crates bonus comes about 15× as often.") },
];
const BOOST_NAME = i18n("FS-Boost", "FS Boost");
const modeInfo = mode => BOOSTS.find(b => b.mode === mode) || buyOf(mode);
const modeCost = mode => modeInfo(mode)?.cost || 1;
const buyOf = mode => BUYS.find(b => b.mode === mode);
// RTP of the published lookup table (math-sdk/games/ghost_duels, optimized to 96.00 %)
const RTP_TEXT = BASE_INFO.rtp.toLocaleString(RGS.lang, { minimumFractionDigits: 2 }) + " %";

// Face rigs, coordinates in % of the square symbol
const RIG = {
  pirate: {
    filler: { x: 51, y: 67, w: 17, h: 6, c: "#3b1408" },
    parts: [{ name: "jaw", poly: [[18,67],[40,66],[62,65],[80,62],[92,100],[8,100]], o: [50, 66] }],
    glows: [{ x: 35, y: 52, w: 14, h: 12, c: "125 255 170" }, { x: 54.5, y: 49, w: 14, h: 12, c: "125 255 170" }]
  },
  devil: {
    base: [[0,63],[32,65.5],[62,65.5],[70,58],[78,48],[100,48],[100,53],[75,53],[75,84],[80,93],[100,93],[100,100],[0,100]],
    parts: [
      { name: "head", poly: [[0,0],[100,0],[100,50],[78,50],[71,60],[63,70],[31,70],[0,66]], o: [47, 66] },
      { name: "tail", poly: [[74,53],[100,53],[100,94],[79,94],[73,84]], o: [77, 89] }
    ],
    glows: [{ x: 32, y: 45, w: 15, h: 10, c: "255 232 120", part: "head" }, { x: 55, y: 45, w: 15, h: 10, c: "255 232 120", part: "head" }],
    lids: { color: "#7a2323", line: "#1a0505", part: "head", eyes: [{ x: 32, y: 44, w: 13, h: 9 }, { x: 55, y: 44, w: 13, h: 9 }] }
  },
  witch: {
    base: [[0,61],[15,59],[25,56],[35,51],[45,46],[55,43],[65,41],[75,38],[85,33],[100,28],[100,100],[0,100]],
    parts: [{ name: "hat", poly: [[0,0],[100,0],[100,31],[85,36],[75,41],[65,44],[55,46],[45,49],[35,54],[25,59],[15,62],[0,64]], o: [50, 46] }],
    lids: { color: "#f1b6f5", line: "#3a0a52", eyes: [{ x: 48.5, y: 51.5, w: 11, h: 13 }, { x: 68, y: 48, w: 10, h: 12 }] },
    cheeks: [{ x: 41, y: 59, w: 10 }, { x: 74, y: 55, w: 9 }]
  },
  blue: {
    lids: { color: "#7af6f9", line: "#0c3550", eyes: [{ x: 27, y: 32.5, w: 13, h: 15 }, { x: 52, y: 32.5, w: 13, h: 15 }] },
    cheeks: [{ x: 20, y: 43, w: 10 }, { x: 58, y: 43, w: 10 }]
  },
  book:    { glows: [{ x: 48, y: 40, w: 34, h: 30, c: "110 255 150" }] },
  key:     { glows: [{ x: 57, y: 21, w: 10, h: 10, c: "255 245 140" }, { x: 70, y: 22, w: 10, h: 10, c: "255 245 140" }] },
  lantern: { glows: [{ x: 52, y: 60, w: 26, h: 34, c: "110 255 160" }] },
  ring:    { glows: [{ x: 55, y: 30, w: 26, h: 20, c: "245 150 255" }] }
};

const clip = poly => `polygon(${poly.map(([x, y]) => `${x}% ${y}%`).join(",")})`;
function box(el, o) { el.style.left = (o.x - o.w / 2) + "%"; el.style.top = (o.y - (o.h ?? o.w) / 2) + "%"; el.style.width = o.w + "%"; el.style.height = (o.h ?? o.w) + "%"; return el; }
function layer(id, poly) {
  const L = div("layer"); const img = new Image(); img.src = IMG[id]; img.alt = ""; img.draggable = false;
  L.appendChild(img); if (poly) L.style.clipPath = clip(poly); return L;
}

function makeSym(id, o = {}) {
  const d = SYM[id], el = div(`sym t-${d.tier} s-${id}`);
  el.dataset.id = id; el.style.setProperty("--c", d.rgb);
  if (o.lite) { const img = new Image(); img.src = IMG[id]; img.className = "solo"; img.alt = ""; el.appendChild(img); return el; }
  if (d.tier === "char" || d.tier === "scatter" || d.tier === "special") el.appendChild(div("aura"));
  const rig = div("rig"); el.appendChild(rig);
  const r = RIG[id] || {}, parts = {};
  const base = layer(id, r.base); base.classList.add("base"); rig.appendChild(base);
  if (r.filler) { const f = box(div("filler"), r.filler); f.style.background = r.filler.c; rig.appendChild(f); }
  (r.parts || []).forEach(p => {
    const L = layer(id, p.poly); L.classList.add("part", "p-" + p.name);
    L.style.transformOrigin = `${p.o[0]}% ${p.o[1]}%`;
    L.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s";
    rig.appendChild(L); parts[p.name] = L;
  });
  (r.glows || []).forEach(g => { const e = box(div("glow"), g); e.style.setProperty("--g", g.c); (g.part ? parts[g.part] : rig).appendChild(e); });
  if (r.lids) r.lids.eyes.forEach(e => {
    const l = box(div("lid"), e); l.style.setProperty("--lid", r.lids.color); l.style.setProperty("--lidline", r.lids.line);
    (r.lids.part ? parts[r.lids.part] : rig).appendChild(l);
  });
  (r.cheeks || []).forEach(c => rig.appendChild(box(div("cheek"), { ...c, h: c.w * .7 })));
  if (d.gloss) { const g = div("gloss"); g.style.webkitMaskImage = g.style.maskImage = `url(${IMG[id]})`; rig.appendChild(g); }
  if (r.lids) el.classList.add("has-lids");
  rig.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s";
  return el;
}

// ---------- Animations ----------
const POP = {
  char: [
    { transform: "scale(1) rotate(0)" }, { transform: "scale(.88) translateY(4%)", offset: .12 },
    { transform: "scale(1.3) translateY(-6%)", offset: .28 }, { transform: "scale(1.24) rotate(-6deg)", offset: .42 },
    { transform: "scale(1.25) rotate(6deg)", offset: .56 }, { transform: "scale(1.22) rotate(-4deg)", offset: .7 },
    { transform: "scale(1.15) rotate(0)", offset: .84 }, { transform: "scale(1)" }],
  obj: [{ transform: "scale(1)" }, { transform: "scale(.9)", offset: .1 }, { transform: "scale(1.22)", offset: .3 }, { transform: "scale(1.15)", offset: .75 }, { transform: "scale(1)" }],
  rune: [{ transform: "perspective(400px) rotateY(0) scale(1)" }, { transform: "perspective(400px) rotateY(180deg) scale(1.18)", offset: .5 }, { transform: "perspective(400px) rotateY(360deg) scale(1)" }],
  scatter: [{ transform: "scale(1)" }, { transform: "scale(1.3) rotate(-7deg)", offset: .3 }, { transform: "scale(1.26) rotate(7deg)", offset: .55 }, { transform: "scale(1)" }],
  special: [{ transform: "scale(1)" }, { transform: "scale(1.2)", offset: .4 }, { transform: "scale(1)" }]
};
const flare = (el, dur = 1300, peak = 1) => qa(el, ".glow").forEach(g => g.animate(
  [{ opacity: .2, transform: "scale(.7)" }, { opacity: peak, transform: "scale(1.6)", offset: .3 }, { opacity: peak * .75, transform: "scale(1.25)", offset: .7 }, { opacity: .2, transform: "scale(1)" }], { duration: dur }));
const lidsAnim = (el, kf, dur) => qa(el, ".lid").forEach(l => l.animate(kf, { duration: dur }));
const HAPPY_BLINK = [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: .12 }, { transform: "scaleY(0)", offset: .24 }, { transform: "scaleY(0)", offset: .5 }, { transform: "scaleY(1)", offset: .62 }, { transform: "scaleY(0)", offset: .74 }, { transform: "scaleY(0)" }];
const SHUT = [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: .1 }, { transform: "scaleY(1)", offset: .9 }, { transform: "scaleY(0)" }];
const cheeks = (el, dur = 1400) => qa(el, ".cheek").forEach(c => c.animate([{ opacity: 0 }, { opacity: 1, offset: .25 }, { opacity: .9, offset: .8 }, { opacity: 0 }], { duration: dur }));
const turn = (deg, extra = "") => ({ transform: `rotate(${deg}deg) ${extra}` });

const EXPR = {
  pirate(el, m) {
    const jaw = q(el, ".p-jaw");
    if (m === "hurt") {
      jaw.animate([{ transform: "none" }, { transform: "translateY(5%)", offset: .15 }, { transform: "translateY(5%)", offset: .9 }, { transform: "none" }], { duration: 1500 });
      qa(el, ".glow").forEach(g => g.animate([{ opacity: .6 }, { opacity: 0, offset: .2 }, { opacity: 0 }], { duration: 1500 }));
      return;
    }
    const kf = [0, 3.8, .4, 3.6, .4, 3.4, .4, 3, 0].map(v => ({ transform: `translateY(${v}%)` }));
    jaw.animate(kf, { duration: m === "taunt" ? 900 : 1200 }); flare(el);
  },
  devil(el, m) {
    const head = q(el, ".p-head"), tail = q(el, ".p-tail");
    if (m === "hurt") {
      lidsAnim(el, SHUT, 1500);
      head.animate([turn(0), turn(13, "translateY(2%)"), turn(11, "translateY(2%)"), turn(0)].map((k, i) => ({ ...k, offset: [0, .15, .9, 1][i] })), { duration: 1500 });
      tail.animate([turn(0), turn(-25), turn(-25), turn(0)], { duration: 1500 });
      return;
    }
    head.animate([0, -7, 6, -7, 6, -5, 4, 0].map((a, i) => turn(a, `translateY(${i % 2 ? -2 : 0}%)`)), { duration: 1200 });
    lidsAnim(el, [{ transform: "scaleY(0)" }, { transform: "scaleY(.5)", offset: .15 }, { transform: "scaleY(.5)", offset: .85 }, { transform: "scaleY(0)" }], 1300);
    tail.animate([0, -20, 18, -20, 18, -10, 0].map(a => turn(a)), { duration: 1000 });
    flare(el);
  },
  witch(el, m) {
    const hat = q(el, ".p-hat");
    if (m === "hurt") {
      hat.animate([{ transform: "none" }, { transform: "rotate(-14deg) translate(-3%, 1%)", offset: .2 }, { transform: "rotate(-12deg) translate(-3%, 1%)", offset: .9 }, { transform: "none" }], { duration: 1500 });
      lidsAnim(el, SHUT, 1500); return;
    }
    hat.animate([{ transform: "none" }, { transform: "translateY(-3%) rotate(-11deg)", offset: .3 }, { transform: "translateY(-1%) rotate(7deg)", offset: .55 }, { transform: "rotate(-3deg)", offset: .8 }, { transform: "none" }], { duration: 1200 });
    lidsAnim(el, HAPPY_BLINK, 1000); cheeks(el);
  },
  blue(el, m) {
    const rig = q(el, ".rig");
    if (m === "hurt") {
      lidsAnim(el, SHUT, 1500);
      rig.animate([{ transform: "none" }, { transform: "scale(1.12, .86) translateY(8%)", offset: .2 }, { transform: "scale(1.08, .9) translateY(6%)", offset: .9 }, { transform: "none" }], { duration: 1500 });
      return;
    }
    rig.animate([{ transform: "none" }, { transform: "scale(1.15, .85) translateY(6%)", offset: .15 }, { transform: "scale(.9, 1.12) translateY(-10%)", offset: .35 },
      { transform: "scale(1.06, .94)", offset: .55 }, { transform: "scale(.97, 1.04) translateY(-4%)", offset: .75 }, { transform: "none" }], { duration: 1200 });
    lidsAnim(el, HAPPY_BLINK, 1000); cheeks(el);
  },
  book(el) { flare(el); q(el, ".rig").animate([turn(0), turn(-7, "translateY(-10%)"), turn(5), turn(0)], { duration: 1100 }); },
  key(el) { flare(el); q(el, ".rig").animate([turn(0), turn(-25), turn(40), turn(30), turn(0)], { duration: 1200, easing: "ease-in-out" }); },
  lantern(el) { flare(el, 1400); q(el, ".rig").animate([0, 18, -14, 9, -5, 0].map(a => turn(a)), { duration: 1300 }); },
  ring(el) { flare(el); q(el, ".rig").animate([{ transform: "none" }, { transform: "perspective(300px) rotateY(180deg) scale(1.05)", offset: .45 }, { transform: "perspective(300px) rotateY(360deg)" }], { duration: 1000 }); },
  potion(el) { q(el, ".rig").animate([0, -14, 13, -11, 9, -5, 0].map(a => turn(a)), { duration: 1100 }); },
  fs(el) { q(el, ".rig").animate([{ transform: "none" }, { transform: "rotate(360deg) scale(1.1)" }], { duration: 900, easing: "cubic-bezier(.3,1.4,.5,1)" }); },
  vs(el) { q(el, ".rig").animate([{ transform: "scale(1)" }, { transform: "scale(1.25) rotate(-8deg)", offset: .3 }, { transform: "scale(1.15) rotate(8deg)", offset: .6 }, { transform: "scale(1)" }], { duration: 900 }); }
};

function animWin(el, mode = "win") {
  if (!el) return;
  const id = el.dataset.id, d = SYM[id];
  if (RM) { el.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.7)" }, { filter: "brightness(1)" }], { duration: 600 }); return; }
  if (mode === "win") {
    el.animate(POP[d.tier], { duration: d.tier === "rune" ? 900 : 1400, easing: "ease-out" });
    const aura = q(el, ".aura");
    aura && aura.animate([{ opacity: .3, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1.4)", offset: .3 }, { opacity: .3, transform: "scale(1)" }], { duration: 1200 });
  }
  EXPR[id] && EXPR[id](el, mode);
}
function land(el) {
  if (RM) return;
  el.animate([{ transform: "translateY(-35%)", opacity: .3 }, { transform: "translateY(6%) scale(1.07, .9)", opacity: 1, offset: .6 }, { transform: "none", opacity: 1 }],
    { duration: 380, easing: "cubic-bezier(.3,1.3,.5,1)" });
}

// Blinking: a random visible character blinks every so often
setInterval(() => {
  if (RM || stage.classList.contains("dropping")) return;
  const all = qa(reelsEl, ".sym.has-lids");
  if (!all.length) return;
  for (let i = 0; i < 2; i++) {
    const s = pick(all);
    qa(s, ".lid").forEach(l => { l.classList.remove("blink"); void l.offsetWidth; l.classList.add("blink"); });
  }
}, 420);

// ---------- Particles ----------
const stage = document.getElementById("stage"), game = document.getElementById("game");
const fx = (() => {
  const canvas = document.getElementById("fx"), ctx = canvas.getContext("2d");
  let parts = [], running = false, W = 0, H = 0; const SPR = new Map();
  let OX = 0, OY = 0;
  function size() { const r = game.getBoundingClientRect(), s = stage.getBoundingClientRect(), d = devicePixelRatio || 1; OX = s.left - r.left; OY = s.top - r.top; W = r.width; H = r.height; canvas.width = W * d; canvas.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  size(); addEventListener("resize", size);
  // smoke puff sprite: the fog texture, tinted and faded out to a soft round edge (cached once the texture has loaded)
  const FOG = new Image(); FOG.src = "assets/img35.webp";
  function smokeSprite(rgb) {
    const key = "smoke" + rgb; let sp = SPR.get(key); if (sp) return sp;
    sp = document.createElement("canvas"); sp.width = sp.height = 96; const sx = sp.getContext("2d"), ready = FOG.complete && FOG.naturalWidth > 0;
    if (ready) for (let i = 0; i < 3; i++) sx.drawImage(FOG, 0, 0, 96, 96); else { sx.fillStyle = "#fff"; sx.fillRect(0, 0, 96, 96); } // stacked for a denser puff
    sx.globalCompositeOperation = "source-atop"; sx.fillStyle = `rgba(${rgb},.5)`; sx.fillRect(0, 0, 96, 96);
    sx.globalCompositeOperation = "destination-in";
    const g = sx.createRadialGradient(48, 48, 0, 48, 48, 48); g.addColorStop(0, "#000"); g.addColorStop(.55, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
    sx.fillStyle = g; sx.fillRect(0, 0, 96, 96);
    if (ready) SPR.set(key, sp);
    return sp;
  }
  function emit(x, y, o = {}) {
    if (RM) return;
    x += OX; y += OY;
    const n = o.n ?? 20, s = o.scale ?? 1, kind = o.kind ?? "wisp", rgb = (o.rgb ?? "89 255 156").split(" ").join(",");
    for (let i = 0; i < n; i++) {
      if (kind === "smoke") { // slow, growing puff; o.ang / o.sp aim it
        const ang = (o.ang ?? Math.random() * Math.PI * 2) + (Math.random() - .5) * .5, sp = (o.sp ?? 1) * (.6 + Math.random() * .8) * s;
        parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, r: (5 + Math.random() * 5) * s, kind, rgb, rot: Math.random() * 6.3, vr: (Math.random() - .5) * .03 });
        continue;
      }
      const ang = kind === "spark" ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - .5) * 2.2;
      const sp = (kind === "spark" ? 3 + Math.random() * 6 : 1.2 + Math.random() * 2.6) * s;
      parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, r: (2 + Math.random() * 4) * s, kind,
        rgb: kind === "spark" && Math.random() < .5 ? "255,255,255" : (Math.random() < .2 ? "246,196,79" : rgb), wob: Math.random() * 6 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  function tick() {
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter";
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      if (p.kind === "spark") {
        p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; p.life -= .035;
        ctx.strokeStyle = `rgba(${p.rgb},${p.life})`; ctx.lineWidth = p.r * .6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke();
      } else if (p.kind === "smoke") {
        p.x += p.vx; p.y += p.vy; p.vx *= .975; p.vy = p.vy * .975 - .01; p.r *= 1.011; p.rot += p.vr; p.life -= .0085;
        ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = Math.max(0, p.life) * Math.min(1, (1 - p.life) * 8) * .6;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(smokeSprite(p.rgb), -p.r * 2, -p.r * 2, p.r * 4, p.r * 4); ctx.restore();
      } else if (p.kind === "bubble") {
        p.wob += .12; p.x += p.vx * .4 + Math.sin(p.wob) * .5; p.y += p.vy * .7; p.life -= .014;
        ctx.strokeStyle = `rgba(${p.rgb},${p.life})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.3, 0, Math.PI * 2); ctx.stroke();
      } else {
        p.wob += .15; p.x += p.vx + Math.sin(p.wob) * .4; p.y += p.vy; p.vy -= .02; p.vx *= .98; p.life -= .018;
        let sp = SPR.get(p.rgb);
        if (!sp) { sp = document.createElement("canvas"); sp.width = sp.height = 48; const sx = sp.getContext("2d"), g = sx.createRadialGradient(24, 24, 0, 24, 24, 24); g.addColorStop(0, `rgba(${p.rgb},1)`); g.addColorStop(1, `rgba(${p.rgb},0)`); sx.fillStyle = g; sx.fillRect(0, 0, 48, 48); SPR.set(p.rgb, sp); }
        ctx.globalAlpha = Math.max(0, p.life); ctx.drawImage(sp, p.x - p.r * 2.5, p.y - p.r * 2.5, p.r * 5, p.r * 5); ctx.globalAlpha = 1;
      }
    }
    if (parts.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  return { emit, size };
})();
function centerOf(el) { const s = stage.getBoundingClientRect(), b = el.getBoundingClientRect(); return [b.left - s.left + b.width / 2, b.top - s.top + b.height / 2, b.width, b.height]; }
function shake(px = 7, dur = 420) {
  if (RM) return;
  game.animate([0, -px, px, -px * .7, px * .7, -px * .4, 0].map((v, i) => ({ transform: `translate(${v}px, ${i % 2 ? px * .4 : 0}px)` })), { duration: dur });
}

// ---------- Board ----------
const reelsEl = document.getElementById("reels"), floatsEl = document.getElementById("floats");
const duelEl = document.getElementById("duel"), bannerEl = document.getElementById("banner");
const winVal = document.getElementById("winVal"), multChip = document.getElementById("multChip");
const msgEl = document.getElementById("msg"), balVal = document.getElementById("balVal"), betVal = document.getElementById("betVal");
const msgText = document.getElementById("msgText"), livesEl = document.getElementById("lives");
const say = t => { msgText.textContent = t; };
const reels = [];
(() => { const gl = q(document, ".gridlines");
  for (let i = 1; i < COLS; i++) { const l = document.createElement("i"); l.className = "v"; l.style.left = (i * 100 / COLS) + "%"; gl.appendChild(l); }
  for (let i = 1; i < ROWS; i++) { const l = document.createElement("i"); l.className = "h"; l.style.top = (i * 100 / ROWS) + "%"; gl.appendChild(l); } })();
let G = [];
for (let c = 0; c < COLS; c++) {
  const el = div("reel"), cells = [];
  for (let r = 0; r < ROWS; r++) { const cell = div("cell"); el.appendChild(cell); cells.push(cell); }
  const tall = div("tall"); tall.hidden = true; el.appendChild(tall);
  reelsEl.appendChild(el); reels.push({ el, cells, tall });
}
function clearBoard() {
  fx.size();
  qa(reelsEl, ".cell, .tall").forEach(c => c.classList.remove("win", "dim"));
  clearLit(); floatsEl.replaceChildren();
  multChip.hidden = true; winVal.classList.remove("hit");
}

// ---------- VS reel: lands as a small VS, then bursts open into a framed, smoking reel with the Skull King ----------
let vsReels = [];
// backdrop shared by the VS reel and the duel winner: glow, smoke rising over light rays, gold frame
const vxBack = () => {
  const bg = div("vx-bg"); bg.append(div("vx-rays"), div("vx-smoke"), div("vx-smoke b"), div("vx-fog"));
  return [div("vx-glow"), bg, div("vx-frame")];
};
function skullKing() {
  const k = div("vx-king"), inner = div("vk"), body = new Image(), lamp = new Image(), fist = new Image();
  body.src = "assets/img24.webp"; lamp.src = "assets/img25.webp"; fist.src = "assets/img26.webp"; body.alt = lamp.alt = fist.alt = ""; lamp.className = "vk-lamp"; fist.className = "vk-fist";
  inner.append(body, lamp, fist); k.appendChild(inner); // the fist again on top holds the lantern's ring
  const win = div("vx-window"); win.appendChild(k); return win; // the frame's inner window clips him like a portrait
}
function showTallVS(rl, small) {
  const t = rl.tall; t.hidden = false; t.className = "tall vsx" + (small ? " small" : ""); t.style.removeProperty("--c");
  const crest = div("vx-crest"), mult = div("vx-mult badge"); crest.appendChild(makeSym("vs")); mult.textContent = "×?";
  t.replaceChildren(...vxBack(), skullKing(), crest, mult);
  rl.cells.forEach(cell => { cell.replaceChildren(); cell.style.visibility = "hidden"; });
}
// duel winner: the character in the frame with its multiplier at the bottom
function showTallWinner(rl, id, mult, tier) {
  const t = rl.tall; t.hidden = false; t.className = "tall vsx char"; t.style.setProperty("--c", SYM[id].rgb);
  const badge = div("tall-badge badge" + (tier >= 2 ? " t" + tier : "")); badge.textContent = "×" + mult;
  t.replaceChildren(...vxBack(), makeSym(id), badge);
  rl.cells.forEach(cell => { cell.replaceChildren(); cell.style.visibility = "hidden"; });
}
// the small VS has landed: it charges, then the frame shoots open, smoke blasts out and the king rises
async function tallLanded(rl) {
  const t = rl.tall, crest = q(t, ".vx-crest");
  const [x, y, w, h] = centerOf(t);
  if (RM || !t.classList.contains("small")) { t.classList.remove("small"); shake(9, 450); return; }
  shake(5, 250);
  sound.charge();
  const first = crest.getBoundingClientRect();
  await crest.animate([{ transform: "none", filter: "brightness(1)" }, { transform: "scale(1.35) rotate(-7deg)", filter: "brightness(1.9) drop-shadow(0 0 1cqw #6dffb3)", offset: .6 },
    { transform: "scale(1.22) rotate(5deg)", filter: "brightness(2.3) drop-shadow(0 0 1.4cqw #d36bff)" }], { duration: 380, easing: "ease-in" }).finished;
  t.classList.remove("small");
  const last = crest.getBoundingClientRect();
  const dx = first.left + first.width / 2 - (last.left + last.width / 2), dy = first.top + first.height / 2 - (last.top + last.height / 2);
  sound.burst(); shake(11, 520);
  crest.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${first.width * 1.22 / last.width})`, filter: "brightness(2.3)" }, { transform: "scale(1.12)", offset: .6 }, { transform: "none", filter: "brightness(1)" }],
    { duration: 680, easing: "cubic-bezier(.2,.9,.3,1.15)" });
  const open = [{ transform: "scaleY(0)", opacity: .3 }, { transform: "scaleY(1.06)", opacity: 1, offset: .6 }, { transform: "none", opacity: 1 }];
  qa(t, ".vx-glow, .vx-bg, .vx-frame").forEach(e => e.animate(open, { duration: 520, easing: "cubic-bezier(.2,.9,.3,1)" }));
  q(t, ".vx-king").animate([{ transform: "translateY(38%) scale(.3)", opacity: 0 }, { transform: "translateY(-5%) scale(1.08)", opacity: 1, offset: .65 }, { transform: "none", opacity: 1 }],
    { duration: 720, delay: 140, easing: "ease-out", fill: "backwards" });
  q(t, ".vx-mult").animate([{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.3)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 420, delay: 420, fill: "backwards" });
  const flash = div("vx-flash"); t.appendChild(flash);
  flash.animate([{ opacity: .95 }, { opacity: 0 }], { duration: 420, easing: "ease-out" }).finished.then(() => flash.remove());
  for (let i = 0; i < 18; i++) fx.emit(x, y + (Math.random() - .5) * h * .8, { kind: "smoke", n: 1, rgb: i % 3 ? "150 255 200" : "211 107 255", scale: w / 60, ang: Math.random() * Math.PI * 2, sp: 2.6 });
  for (let i = 0; i < 5; i++) fx.emit(x, y - h / 2 + h * (i + .5) / 5, { n: 10, kind: "spark", rgb: i < 2 ? "89 255 156" : "211 107 255", scale: w / 140 });
  await sleep(760);
}
// VS reels and duel winners on the board keep breathing smoke out over their neighbours
setInterval(() => {
  if (RM || document.hidden || stage.classList.contains("dropping")) return;
  for (const { tall: t } of reels) {
    if (t.hidden || !t.classList.contains("vsx") || t.classList.contains("small") || t.classList.contains("dueling")) continue;
    const [x, y, w, h] = centerOf(t), side = Math.random() < .5 ? -1 : 1;
    fx.emit(x + side * w * .42, y + (Math.random() - .45) * h * .9, { kind: "smoke", n: 1, rgb: t.style.getPropertyValue("--c") || (Math.random() < .3 ? "211 107 255" : "150 255 200"),
      scale: w / 60, ang: -Math.PI / 2 + side * (.7 + Math.random() * .6), sp: .55 });
  }
}, 170);

// showcase board until the first round: a VS reel with the Skull King, a duel winner with its multiplier,
// two free-spin symbols in different reels (three would look like a bonus trigger) and every pay symbol at least once
(() => {
  const VS_COL = 2, WIN_COL = 5, open = [];
  G = reels.map((rl, c) => Array.from({ length: ROWS }, (_, r) => { if (c !== VS_COL && c !== WIN_COL) open.push([c, r]); let id; do { id = randSym(); } while (id === "fs"); return id; }));
  for (let i = open.length - 1; i > 0; i--) { const j = rnd(i + 1); [open[i], open[j]] = [open[j], open[i]]; }
  const fsCells = [];
  for (const cell of open) if (fsCells.length < 2 && !fsCells.some(f => f[0] === cell[0])) fsCells.push(cell);
  fsCells.forEach(([c, r]) => G[c][r] = "fs");
  SYM_IDS.filter(id => id !== "fs").forEach((id, i) => { const [c, r] = open.filter(o => !fsCells.includes(o))[i]; G[c][r] = id; });
  reels.forEach((rl, c) => rl.cells.forEach((cell, r) => cell.appendChild(makeSym(G[c][r]))));
  showTallVS(reels[VS_COL], false);
  showTallWinner(reels[WIN_COL], "pirate", 25, 2);
})();

function pitchPx() { return reels[0].cells[1].getBoundingClientRect().top - reels[0].cells[0].getBoundingClientRect().top; }
const DROP_KF = from => [
  { transform: `translate3d(0, ${from}px, 0)` },
  { transform: "translate3d(0, 0, 0) scale(1, 1.05)", offset: .64 },
  { transform: "translate3d(0, -8%, 0)", offset: .78 },
  { transform: "translate3d(0, 0, 0) scale(1.07, .91)", offset: .91 },
  { transform: "translate3d(0, 0, 0)" }];
const DROP_EASE = "cubic-bezier(.45,0,.8,.5)";

async function spinReels(res) {
  nextSequence();
  const P = pitchPx();
  let fsLanded = 0; // FS symbols land left to right; each one sounds a step higher than the last
  stage.classList.add("dropping");
  sound.spin();
  // 1. old symbols fall out of the bottom
  const outs = [];
  if (!RM) reels.forEach((rl, c) => {
    if (!rl.tall.hidden) outs.push(rl.tall.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0, ${P * (ROWS + 1)}px, 0)` }], { duration: 380, delay: c * 30, easing: "cubic-bezier(.55,0,1,.6)", fill: "forwards" }).finished);
    rl.cells.forEach((cell, r) => {
      const el = cell.firstElementChild; if (!el) return;
      outs.push(el.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0, ${P * (ROWS - r + .4)}px, 0)` }],
        { duration: 260 + (ROWS - r) * 22, delay: c * 30 + (ROWS - 1 - r) * 14, easing: "cubic-bezier(.55,0,1,.6)", fill: "forwards" }).finished);
    });
  });
  // build the next board while the old symbols are falling (the fall runs on the compositor)
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const pre = reels.map((rl, c) => vsReels.includes(c) ? null : res[c].map(id => makeSym(id)));
  await Promise.all(outs);
  reels.forEach(rl => { rl.tall.hidden = true; rl.tall.getAnimations().forEach(x => x.cancel()); rl.tall.replaceChildren(); rl.cells.forEach(c => { c.replaceChildren(); c.style.visibility = ""; }); });

  // 2. schedule: VS adds a pause, once 2 FS are on the board every further reel teases for TEASE ms
  const TEASE = 2400, stops = [], tease = []; let t = 40, fsSeen = 0;
  for (let c = 0; c < COLS; c++) {
    if (c > 0) t += RM ? 30 : 110;
    if (vsReels.includes(c - 1)) t += RM ? 0 : 480;
    tease[c] = fsSeen >= 2 && !RM && !vsReels.includes(c);
    if (tease[c]) t += TEASE;
    stops[c] = t;
    if (!vsReels.includes(c) && res[c].includes("fs")) fsSeen++;
  }
  // 3. build every new symbol first (one layout pass), then let the compositor run all drops with delays
  const fills = [], t0 = performance.now();
  reels.forEach((rl, c) => {
    if (vsReels.includes(c)) { showTallVS(rl, true); return; }
    rl.cells.forEach((cell, r) => { const el = pre[c][r]; cell.appendChild(el); fills.push([c, r, el]); });
  });
  void reelsEl.offsetHeight;
  // one knock per reel when its bottom symbol hits (that drop peaks at 64% of 340 + 6 × 24 ms); VS reels land at 82% of 460 ms
  for (let c = 0; c < COLS; c++) sound.land(c, (stops[c] + (RM ? 0 : vsReels.includes(c) ? 377 : tease[c] ? 40 : 310)) / 1000 / pace(), vsReels.includes(c));
  const done = [];
  fills.forEach(([c, r, el]) => {
    const delay = stops[c] + (ROWS - 1 - r) * 50;
    const a1 = RM ? null : tease[c]
      ? el.animate([{ opacity: 0, transform: "translateY(-5%)" }, { opacity: 1, transform: "translateY(-5%)", offset: .01 }, { opacity: 1, transform: "none" }], { duration: 200, delay: stops[c], easing: "ease-out", fill: "backwards" })
      : el.animate(DROP_KF(-(r + 1.3) * P), { duration: 340 + r * 24, delay, easing: DROP_EASE, fill: "backwards" });
    if (res[c][r] === "fs") (a1 ? a1.finished : Promise.resolve()).then(() => { animWin(el); const [x, y, w] = centerOf(el); fx.emit(x, y, { n: 16, kind: "spark", rgb: SYM.fs.rgb, scale: w / 120 }); sound.fsLand(++fsLanded); });
    if (a1) done.push(a1.finished);
  });
  vsReels.forEach(c => {
    const rl = reels[c];
    if (!RM) done.push(rl.tall.animate([{ transform: `translate3d(0, ${-P * (ROWS + 1)}px, 0)` }, { transform: "translate3d(0, 2%, 0) scaleY(.97)", offset: .82 }, { transform: "translate3d(0,0,0)" }],
      { duration: 460, delay: stops[c], easing: DROP_EASE, fill: "backwards" }).finished.then(() => tallLanded(rl)));
    else tallLanded(rl);
  });
  // tease: until that reel stops it turns dark teal, neon beams light its edges, green ghost-fire rises through it and a
  // strip of symbols rolls slowly to a stop on the reel's real result,
  // with the edging music building from reel to reel (the strip is decoration; the reel's real symbols drop afterwards)
  let nthTease = 0;
  tease.forEach((on, c) => {
    if (!on) return;
    sound.edge(Math.max(0, stops[c] - TEASE) / 1000 / pace(), ++nthTease);
    later(() => {
      const rl = reels[c], ov = div("teasefx"), strip = div("tease-strip");
      // the strip's first 7 rows are the reel's real result: the roll stops on exactly what the reel shows afterwards
      for (let r = 0; r < ROWS * 3; r++) { const id = r < ROWS ? res[c][r] : randSym(), im = new Image(); im.src = IMG[id]; im.alt = ""; im.dataset.id = id; strip.appendChild(im); }
      const fire = div("tease-fire");
      for (let i = 0; i < 55; i++) { // green ghost-fire flames rising at random spots and speeds, most of them along the edges
        const w = div("tw"), edge = Math.random() < .7, x = edge ? (Math.random() < .5 ? 4 + Math.random() * 14 : 82 + Math.random() * 14) : 25 + Math.random() * 50;
        w.style.setProperty("--x", x.toFixed(1) + "%"); w.style.setProperty("--d", (-Math.random() * 1.6).toFixed(2) + "s");
        w.style.setProperty("--t", (1.1 + Math.random() * .8).toFixed(2) + "s"); w.style.setProperty("--s", (.6 + Math.random() * .7).toFixed(2)); fire.appendChild(w);
      }
      // dense fog behind the rolling symbols (dark ones read as shadows in it), a lighter veil in front
      ov.append(div("tease-mist back"), strip, div("tease-mist front"), fire, div("tease-beam l"), div("tease-beam r"), div("tease-streak a"), div("tease-streak b"));
      rl.el.classList.add("tease"); rl.el.appendChild(ov);
      stage.classList.add("teasing"); // the rest of the board goes dark; only the green reel and the FS symbols stay lit
      sound.duck(TEASE / 1000 / pace()); // the background music steps back while the reel teases
      say(i18n("Noch ein FS…", "One more FS…")); shake(4, 300);
      strip.animate([{ transform: "translateY(-66.67%)" }, { transform: "translateY(0)" }], { duration: TEASE, easing: "cubic-bezier(.2, .75, .3, 1)", fill: "forwards" });
      later(() => { ov.remove(); rl.el.classList.remove("tease"); }, TEASE);
    }, Math.max(0, stops[c] - TEASE));
  });
  await Promise.all(done);
  stage.classList.remove("dropping", "teasing");
  await sleep(RM ? 60 : 200);
}

// ---------- Clusters: 4+ real symbols, VS reels act as wild ----------
const MIN_CLUSTER = 4;
let vsMult = {}, vsWinner = {};
function findClusters() {
  const out = [], inb = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const ids = new Set(G.flat().filter(id => id !== "fs" && id !== "vs"));
  for (const id of ids) {
    const seen = new Set();
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (G[c][r] !== id || seen.has(c + "," + r)) continue;
      const cells = [], wilds = [], links = [], st = [[c, r]]; seen.add(c + "," + r);
      while (st.length) {
        const [x, y] = st.pop(); (G[x][y] === "vs" ? wilds : cells).push([x, y]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!inb(nx, ny) || (G[nx][ny] !== id && G[nx][ny] !== "vs")) continue;
          if (G[x][y] === "vs" && G[nx][ny] === "vs") { if (!seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); st.push([nx, ny]); } continue; }
          if (dx > 0 || dy > 0 || G[nx][ny] === "vs" || G[x][y] === "vs") links.push([[x, y], [nx, ny]]);
          if (!seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); st.push([nx, ny]); }
        }
      }
      if (cells.length < MIN_CLUSTER) continue;
      // keep only wild cells that actually touch a real cell of this cluster (the visible bridge)
      const realSet = new Set(cells.map(([x, y]) => x + "," + y));
      const vsCols = [...new Set(wilds.map(([x]) => x))];
      const uniq = new Map(); links.forEach(([a1, b1]) => { const k = [a1, b1].map(p => p.join(",")).sort().join("|"); if (realSet.has(a1.join(",")) || realSet.has(b1.join(","))) uniq.set(k, [a1, b1]); });
      // connect wild entry points inside a VS reel so the line visibly runs through it
      vsCols.forEach(col => {
        const rows = [...new Set([...uniq.values()].flat().filter(([x]) => x === col).map(([, y]) => y))].sort((m, n) => m - n);
        for (let i = 1; i < rows.length; i++) uniq.set(`v${col}-${i}`, [[col, rows[i - 1]], [col, rows[i]]]);
      });
      const base = SYM[id].pay[Math.min(cells.length, 9) - MIN_CLUSTER] * bet;
      out.push({ id, cells, wilds, links: [...uniq.values()], vsCols, base, win: base, mult: 1 });
    }
  }
  // 4 or more VS reels directly side by side are a connection of their own
  const isVsCol = c => G[c].every(x => x === "vs");
  for (let c = 0; c < COLS;) {
    if (!isVsCol(c)) { c++; continue; }
    let e = c; while (e + 1 < COLS && isVsCol(e + 1)) e++;
    if (e - c + 1 >= MIN_CLUSTER) {
      const cols = []; for (let x = c; x <= e; x++) cols.push(x);
      const mid = Math.floor(ROWS / 2), links = cols.slice(1).map(x => [[x - 1, mid], [x, mid]]);
      out.push({ id: "devil", wildOnly: true, cells: [], wilds: cols.map(x => [x, mid]), links, vsCols: cols, base: 0, win: 0, mult: 1 });
    }
    c = e + 1;
  }
  return out;
}
function cellCenter([c, r]) { return centerOf(reels[c].cells[r]); }
// ---------- Lit boxes: connected cells light up as one shape, outlined only along the group's outer edge ----------
// delayOf(i, cell) staggers the light-up; joined(c, r) marks extra cells (a VS reel) that count as part of the group.
// A cell that is already lit the same way stays as it is, so re-lighting a board (bonus spins) only animates what changed.
function lightUp(cells, rgb, delayOf = () => 0, joined = () => false) {
  const set = new Set(cells.map(([c, r]) => c + "," + r));
  const inside = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && (set.has(c + "," + r) || joined(c, r));
  cells.forEach(([c, r], i) => {
    const sides = [!inside(c, r - 1), !inside(c + 1, r), !inside(c, r + 1), !inside(c - 1, r)], key = rgb + sides.join();
    const cell = reels[c].cells[r]; let lit = q(cell, ":scope > .lit");
    if (lit && lit.dataset.key === key) { lit.classList.remove("stale"); return; }
    lit?.remove(); lit = div("lit"); lit.dataset.key = key; lit.style.setProperty("--c", rgb);
    const [t, rt, b, l] = sides;
    lit.style.borderWidth = sides.map(s => s ? "var(--lw)" : "0").join(" ");
    lit.style.borderRadius = [t && l, t && rt, b && rt, b && l].map(k => k ? "var(--lr)" : "0").join(" ");
    cell.appendChild(lit);
    if (!RM) lit.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1.08)", offset: .5 }, { opacity: 1, transform: "none" }],
      { duration: 460, delay: delayOf(i, [c, r]), easing: "ease-out", fill: "backwards" });
  });
}
const clearLit = () => qa(reelsEl, ".lit").forEach(e => e.remove());
function floatText(x, y, text, rgb, big, small) {
  const f = div("float" + (small ? " small" : "")); f.style.left = x + "px"; f.style.top = y + "px"; f.style.setProperty("--c", rgb);
  // multipliers ("×5") get the spooky lettering
  text.split(/(×\s?[\d.,]+)/).forEach(part => { if (!part) return; if (part[0] === "×") { const b = document.createElement("b"); b.className = "fm"; b.textContent = part; f.appendChild(b); } else f.append(part); });
  if (big) f.style.fontSize = "6cqw";
  floatsEl.appendChild(f);
  f.animate([{ opacity: 0, transform: "translate(-50%,-30%) scale(.6)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: .2 }, { opacity: 1, transform: "translate(-50%,-90%) scale(1)", offset: .75 }, { opacity: 0, transform: "translate(-50%,-120%)" }],
    { duration: big ? 2000 : 1700, easing: "ease-out", fill: "forwards" });
}

let shown = 0;
// Only the newest count-up writes the win field: a new one takes over where the running one is (they used to
// overlap while runes were collected, so the number jumped back and forth). Values in motion keep the currency's
// decimals; only the final value may show more (an exact sub-cent amount).
let countId = 0;
// sets the win field at once and stops any running count-up, which would otherwise keep writing its older value
function setWin(v) { countId++; shown = v; winVal.textContent = money(v); }
function countTo(target, dur = 700) {
  const id = ++countId, from = shown;
  let lastTick = 0, k = 0, last = performance.now();
  return new Promise(res => (function step(t) {
    if (id !== countId) return res();
    // progress follows the current pace each frame, so a skip speeds up a count that is already running
    // (a frame's timestamp can be slightly older than the start; it never counts backwards)
    k = Math.min(1, k + Math.max(0, t - last) * pace() / dur); last = Math.max(last, t);
    shown = k < 1 ? from + (target - from) * (1 - Math.pow(1 - k, 3)) : target;
    if (dur / pace() > 300 && k < 1 && t - lastTick > 85) { lastTick = t; sound.tick(); }
    winVal.textContent = money(k < 1 ? RGS.roundMoney(shown) : shown); if (k < 1) requestAnimationFrame(step); else res();
  })(last));
}

async function showWins(clusters, before) {
  nextSequence();
  winVal.classList.add("hit");
  hero.react(clusters.some(cl => cl.mult > 1) || clusters.reduce((a1, cl) => a1 + cl.win, 0) >= 10 * bet ? "cheer" : "point", 1700);
  const inWin = new Set(); clusters.forEach(cl => cl.cells.forEach(([c, r]) => inWin.add(c + "," + r)));
  const vsIn = new Set(clusters.flatMap(cl => cl.vsCols));
  reels.forEach((rl, c) => {
    if (!rl.tall.hidden) { if (!vsIn.has(c)) rl.tall.classList.add("dim"); return; }
    rl.cells.forEach((cell, r) => { if (!inWin.has(c + "," + r)) cell.classList.add("dim"); });
  });
  clusters.sort((a, b) => a.win - b.win);
  let total = before;
  for (const cl of clusters) {
    lightUp(cl.cells, SYM[cl.id].rgb, i => i * 60, c => cl.vsCols.includes(c));
    sound.win(cl.cells.length || 4, SYM[cl.id].tier);
    cl.vsCols.forEach(c => { const t = reels[c].tall; t.classList.add("win"); t.style.setProperty("--wc", SYM[cl.id].rgb); animWin(q(t, ".sym")); });
    cl.cells.forEach(([c, r], k) => later(() => {
      const cell = reels[c].cells[r], el = q(cell, ".sym");
      cell.classList.add("win"); cell.style.setProperty("--wc", SYM[cl.id].rgb); animWin(el);
      const [x, y, w] = centerOf(el);
      fx.emit(x, y, { n: SYM[cl.id].tier === "rune" ? 8 : 18, scale: w / 120, rgb: SYM[cl.id].rgb, kind: cl.id === "potion" ? "bubble" : "wisp" });
    }, k * 60));
    const pts = (cl.cells.length ? cl.cells : cl.wilds).map(cellCenter), cx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, cy = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
    later(() => floatText(cx, cy, cl.mult > 1 ? `${money(cl.base)} ×${cl.mult}` : money(cl.win), SYM[cl.id].rgb), 300);
    total += cl.win; countTo(total);
    await sleep(Math.min(1100, 420 + cl.cells.length * 70));
  }
  await sleep(500);
  return total - before;
}

// tumbleBoard event: exploding cells, removed VS reels and the new symbols per reel (top first)
async function tumble(ev) {
  nextSequence();
  sound.tumble();
  const gone = new Set(ev.explodingSymbols.map(p => p.reel + "," + p.row));
  const usedVs = ev.removedVsReels;
  // burst the winning symbols and the used wild reels
  const bursts = [...gone].filter(k => !usedVs.includes(+k.split(",")[0])).map(k => {
    const [c, r] = k.split(",").map(Number), el = q(reels[c].cells[r], ".sym");
    const [x, y, w] = cellCenter([c, r]); fx.emit(x, y, { n: 8, kind: "spark", rgb: SYM[G[c][r]]?.rgb || "255 255 255", scale: w / 130 });
    return el && !RM ? el.animate([{ transform: "scale(1)", opacity: 1, filter: "brightness(1)" }, { transform: "scale(1.25)", opacity: 1, filter: "brightness(2.5)", offset: .35 }, { transform: "scale(0)", opacity: 0 }], { duration: 360, fill: "forwards" }).finished : null;
  });
  usedVs.forEach(c => {
    const t = reels[c].tall, [x, y, w, h] = centerOf(t);
    for (let i = 0; i < 5; i++) fx.emit(x, y - h / 2 + h * (i + .5) / 5, { n: 12, kind: "spark", rgb: SYM[G[c][0]]?.rgb || "120 220 255", scale: w / 120 });
    if (!RM) bursts.push(t.animate([{ transform: "scale(1)", opacity: 1, filter: "brightness(1)" }, { transform: "scaleX(1.15)", opacity: 1, filter: "brightness(3)", offset: .3 }, { transform: "scaleX(0)", opacity: 0 }], { duration: 480, fill: "forwards" }).finished);
    delete vsMult[c];
  });
  await Promise.all(bursts);
  usedVs.forEach(c => { const rl = reels[c]; rl.tall.getAnimations().forEach(x => x.cancel()); rl.tall.hidden = true; rl.tall.replaceChildren(); rl.tall.className = "tall"; rl.cells.forEach(cell => { cell.replaceChildren(); cell.style.visibility = ""; }); vsReels = vsReels.filter(v => v !== c); });
  clearLit(); floatsEl.replaceChildren();
  qa(reelsEl, ".cell, .tall").forEach(c => c.classList.remove("win", "dim"));
  const P = pitchPx(), anims = [];
  let fsOnBoard = G.flat().filter((id, i) => id === "fs" && !gone.has(Math.floor(i / ROWS) + "," + (i % ROWS))).length;
  stage.classList.add("dropping");
  for (let c = 0; c < COLS; c++) {
    if (!reels[c].tall.hidden) continue;
    const keep = [];
    for (let r = 0; r < ROWS; r++) if (!gone.has(c + "," + r)) keep.push({ id: G[c][r], from: r, el: reels[c].cells[r].firstElementChild });
    const k = ROWS - keep.length; if (!k) continue;
    if (ev.newSymbols[c].length !== k) throw new Error(`tumbleBoard: reel ${c} expects ${k} new symbols`);
    const fresh = ev.newSymbols[c].map((s, i) => ({ id: s, from: i - k - .3 }));
    fresh.concat(keep).forEach((x, r) => {
      G[c][r] = x.id;
      const dist = r - x.from; if (dist <= 0) return;
      const sEl = x.el && x.from >= 0 ? x.el : makeSym(x.id);
      reels[c].cells[r].replaceChildren(sEl);
      const drop = RM ? Promise.resolve() : sEl.animate(DROP_KF(-dist * P), { duration: 260 + Math.min(dist, 6) * 60, delay: c * 35 + (ROWS - 1 - r) * 30, easing: DROP_EASE, fill: "backwards" }).finished;
      if (!RM) anims.push(drop);
      if (x.id === "fs" && x.from < 0) {
        const nth = ++fsOnBoard;
        drop.then(() => { animWin(sEl); const [px, py, w] = centerOf(sEl); fx.emit(px, py, { n: 16, kind: "spark", rgb: SYM.fs.rgb, scale: w / 120 }); sound.fsLand(nth); });
      }
    });
  }
  await Promise.all(anims);
  stage.classList.remove("dropping");
  await sleep(RM ? 50 : 220);
}

// ---------- VS duel ----------
const MULTS = [2, 2, 3, 3, 4, 5, 5, 10, 10, 15, 20, 25, 50, 100];
async function rollBadge(b, final, dur, pool = MULTS) {
  const t0 = performance.now();
  while (performance.now() - t0 < dur / pace()) { b.textContent = "×" + pick(pool); sound.roll(); await sleep(70); }
  b.textContent = "×" + final;
  sound.ding(b.classList.contains("t3") ? 3 : b.classList.contains("t2") ? 2 : 1);
  if (!RM) b.animate([{ transform: "scale(1.8)" }, { transform: "scale(.9)", offset: .6 }, { transform: "scale(1)" }], { duration: 380 });
}
// Escalating duel inside a VS reel:
//  round 1  two ghosts fight            x2 - x10     (almost always the final result)
//  round 2  the pirate challenges        x20 - x100   (rare)
//  round 3  the devil steps in           x150 - x1000 (very, very rare)
const DUEL_T1 = [[2, 30], [3, 25], [4, 18], [5, 12], [6, 7], [8, 5], [10, 3]];
const DUEL_T2 = [[20, 30], [25, 22], [30, 18], [40, 13], [50, 9], [75, 5], [100, 3]];
const DUEL_T3 = [[150, 35], [200, 25], [250, 15], [300, 10], [500, 8], [750, 5], [1000, 2]];
// value pools above are only used for the rolling badge animation
// The vsDuel event decides everything shown here; challengers that lose are only for tension.
async function reelDuel(d) {
  nextSequence();
  const reelIdx = d.reel, rl = reels[reelIdx], tall = rl.tall;
  const tier = d.tier, m1 = d.top.mult, m1b = d.bottom.mult;
  const ghostTop = d.top.symbol, ghostBot = d.bottom.symbol, topWins1 = d.topWins;
  const pirate = d.challengers.find(ch => ch.symbol === "pirate"), devil = d.challengers.find(ch => ch.symbol === "devil");
  const m2 = pirate?.mult, m3 = devil?.mult;
  let winner = topWins1 ? ghostTop : ghostBot, mult = topWins1 ? m1 : m1b;
  const vsSym = q(tall, ".vx-crest .sym") || q(tall, ".sym");
  say(i18n("Duell", "Duel") + `: ${SYM[ghostTop].name} vs ${SYM[ghostBot].name}`);
  hero.react("point", 2600);
  animWin(vsSym); shake(6, 350);
  const finalTier = tier;
  const finish = async () => {
    showTallWinner(rl, winner, mult, finalTier); sound.sting(finalTier);
    const ns = q(tall, ".sym"), badge = q(tall, ".tall-badge");
    if (!RM) {
      tall.animate([{ filter: "brightness(2.5)" }, { filter: "brightness(1)" }], { duration: 450 });
      badge.animate([{ transform: "scale(2.4)", opacity: 0 }, { transform: "scale(.9)", opacity: 1, offset: .6 }, { transform: "none", opacity: 1 }], { duration: 520, easing: "ease-out" });
      const [bx, by, bw] = centerOf(badge);
      fx.emit(bx, by, { n: 22, kind: "spark", rgb: finalTier === 3 ? "255 122 42" : finalTier === 2 ? "255 216 119" : "109 255 179", scale: bw / 90 });
    }
    animWin(ns); shake(finalTier === 3 ? 14 : 7, finalTier === 3 ? 700 : 350);
    await sleep(RM ? 300 : 700);
    return { winner, mult, tier: finalTier };
  };
  if (RM) {
    winner = d.winner; mult = d.mult;
    return finish();
  }
  const arena = div("rd-arena"), mid = div("rd-vs"), fl = div("rd-flash");
  const fighter = (pos, id) => { const el = div("rd-f " + pos), sy = makeSym(id), bd = div("rd-badge badge" + (id === "pirate" ? " t2" : id === "devil" ? " t3" : "")); bd.textContent = "×?"; el.append(sy, bd); el.style.setProperty("--c", SYM[id].rgb); return { el, sy, bd, id }; };
  let top = fighter("top", ghostTop), bot = fighter("bot", ghostBot);
  mid.appendChild(makeSym("vs"));
  arena.append(top.el, bot.el, mid, fl);
  vsSym.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.4) rotate(20deg)", opacity: 0 }], { duration: 350, fill: "forwards" });
  qa(tall, ".vx-king, .vx-mult").forEach(e => e.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.7)" }], { duration: 350, fill: "forwards" }));
  await sleep(250);
  tall.classList.add("dueling"); tall.appendChild(arena);
  const [cx, cy, cw] = centerOf(tall);
  const enter = (f, fromTop, delay = 0) => f.el.animate([{ transform: `translateY(${fromTop ? -120 : 120}%) scale(.6)`, opacity: 0 }, { transform: `translateY(${fromTop ? 6 : -6}%) scale(1.05)`, opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 520, delay, easing: "ease-out", fill: "backwards" }).finished;
  const slamVs = async () => {
    mid.style.opacity = 1; sound.slam();
    await mid.animate([{ transform: "translate(-50%,-50%) scale(3)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(.9)", opacity: 1, offset: .75 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: 360, easing: "ease-in", fill: "forwards" }).finished;
    shake(9, 400); fx.emit(cx, cy, { n: 30, kind: "spark", rgb: "120 220 255", scale: cw / 90 });
  };
  const clash = async (n, power) => {
    for (let i = 0; i < n; i++) {
      top.el.animate([{ transform: "none" }, { transform: "translateY(42%) scale(1.08)", offset: .45 }, { transform: "translateY(38%)", offset: .55 }, { transform: "none" }], { duration: 480, easing: "ease-in-out" });
      bot.el.animate([{ transform: "none" }, { transform: "translateY(-42%) scale(1.08)", offset: .45 }, { transform: "translateY(-38%)", offset: .55 }, { transform: "none" }], { duration: 480, easing: "ease-in-out" });
      mid.animate([{ opacity: 1 }, { opacity: .1, offset: .4 }, { opacity: .1, offset: .7 }, { opacity: 1 }], { duration: 480 });
      await sleep(215);
      sound.clash(power);
      fl.animate([{ opacity: 0 }, { opacity: .9 }, { opacity: 0 }], { duration: 220 });
      shake(8 + i * 3 + power * 3, 300);
      fx.emit(cx, cy, { n: 26 + power * 14, kind: "spark", rgb: i % 2 ? SYM[top.id].rgb : SYM[bot.id].rgb, scale: cw / 90 });
      await sleep(380);
    }
  };
  // loser drops out; returns the side that is now free
  const knockOut = async (loser) => {
    const dir = loser === bot ? 1 : -1;
    animWin(loser.sy, "hurt"); sound.knockout();
    mid.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    await loser.el.animate([{ transform: "none", filter: "none" }, { transform: `translateY(${dir * 4}%)`, filter: "brightness(3) saturate(0)", offset: .12 }, { transform: `translateY(${dir * -3}%)`, offset: .22 },
      { transform: `translateY(${dir * 130}%) rotate(${dir * 35}deg) scale(.6)`, opacity: 0, filter: "grayscale(1)" }], { duration: 1000, easing: "ease-in", fill: "forwards" }).finished;
    loser.el.remove();
  };
  const cheer = (f) => { animWin(f.sy); f.bd.animate([{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 600 }); fx.emit(cx, cy, { n: 30, kind: "spark", rgb: SYM[f.id].rgb, scale: cw / 85 }); };
  const roundBanner = async (text, rgb) => {
    const b = div("rd-call"); b.textContent = text; b.style.setProperty("--c", rgb); arena.appendChild(b);
    await b.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(1.8)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .3 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .8 }, { opacity: 0, transform: "translate(-50%,-50%) scale(.9)" }], { duration: 1300 }).finished;
    b.remove();
  };
  // ---- round 1: two ghosts, x2 - x10
  await Promise.all([enter(top, true), enter(bot, false, 100)]);
  animWin(top.sy, "taunt"); later(() => animWin(bot.sy, "taunt"), 220);
  await slamVs();
  await Promise.all([rollBadge(top.bd, m1, 1000, DUEL_T1.map(v => v[0])), rollBadge(bot.bd, m1b, 1300, DUEL_T1.map(v => v[0]))]);
  await sleep(200);
  await clash(3, 0);
  let champ = topWins1 ? top : bot, loser = topWins1 ? bot : top;
  await knockOut(loser);
  say(`${SYM[champ.id].name} ${i18n("gewinnt", "wins")} · ×${mult}`); cheer(champ);
  await sleep(700);
  // ---- round 2: the pirate challenges, x20 - x100
  const challenge = async (challengerId, pool, value, wins, call, rgb, power) => {
    const freeTop = loser === top;
    say(call); hero.react("gasp", 2200); sound.challenger(power + 1); await roundBanner(call, rgb);
    shake(10 + power * 4, 600);
    const ch = fighter(freeTop ? "top" : "bot", challengerId); arena.insertBefore(ch.el, mid);
    if (freeTop) top = ch; else bot = ch;
    await enter(ch, freeTop);
    animWin(ch.sy, "taunt");
    await slamVs();
    await rollBadge(ch.bd, value, 1500 + power * 500, pool.map(v => v[0]));
    await sleep(250);
    await clash(3 + power, power);
    if (wins) { hero.react("laugh", 1800); await knockOut(champ); loser = champ; champ = ch; winner = ch.id; mult = value; say(`${SYM[ch.id].name} ${i18n("gewinnt", "wins")} · ×${value}`); cheer(ch); }
    else { await knockOut(ch); loser = ch; say(`${SYM[champ.id].name} ${i18n("hält stand", "holds on")} · ×${mult}`); cheer(champ); }
    await sleep(800);
  };
  if (pirate) await challenge("pirate", DUEL_T2, m2, pirate.wins, i18n("Herausforderer!", "Challenger!"), SYM.pirate.rgb, 1);
  if (devil) await challenge("devil", DUEL_T3, m3, devil.wins, i18n("Der Teufel greift ein!", "The Devil steps in!"), SYM.devil.rgb, 2);
  winner = d.winner; mult = d.mult;
  // champion moves to the middle
  const toMid = champ === top ? 62 : -62;
  await champ.el.animate([{ transform: "none" }, { transform: `translateY(${toMid}%) scale(1.25)` }], { duration: 650, easing: "ease-in-out", fill: "forwards" }).finished;
  return finish();
}

// ---------- Banner ----------
async function banner(title, sub, hold = 1700) {
  nextSequence();
  hero.react("cheer", hold + 600); sound.banner();
  document.getElementById("bTitle").textContent = title; document.getElementById("bSub").textContent = sub;
  bannerEl.hidden = false;
  await bannerEl.animate([{ opacity: 0, transform: "scale(1.3)" }, { opacity: 1, transform: "scale(1)" }], { duration: 380, easing: "ease-out" }).finished;
  const s = stage.getBoundingClientRect();
  fx.emit(s.width / 2, s.height / 2, { n: 60, kind: "spark", rgb: "255 79 210", scale: s.width / 360 });
  await sleep(hold);
  await bannerEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished;
  bannerEl.hidden = true;
}

// ---------- Total Win screen after the free spins: the emblem plays its intro once (100 frames at 30 fps), then its
// loop, while the bonus win counts up under it. The animations download when a bonus starts; reduced motion shows
// a still. Made with tools/sprites (examples/total-win). ----------
// the emblem's parts move live (rigplayer.js), so it stays sharp at any size; exported by tools/sprites/rig.py export
const TW_RIG = "assets/total-win";
let twRig = null;
function preloadTotalWin() {
  twRig ??= RigPlayer.load(TW_RIG).catch(() => null);
}
// returns false when the art is missing, then the caller shows the plain banner
async function totalWinScreen(total, spins) {
  nextSequence();
  preloadTotalWin();
  const intro = !RM && !turbo; // turbo starts on the loop
  const rig = await twRig;
  if (!rig) return false;
  const el = document.getElementById("totalWin"), box = document.getElementById("twArt"), amtEl = document.getElementById("twAmount");
  const x = (Math.round(total / bet * 100) / 100).toLocaleString(RGS.lang, { maximumFractionDigits: 2 });
  document.getElementById("twSub").textContent = i18n(`${spins} Freispiele gespielt · ${x}× Einsatz`, `${spins} free spins played · ${x}× bet`);
  const cv = document.createElement("canvas");
  box.replaceChildren(cv); amtEl.textContent = money(0); el.hidden = false;
  const anim = RigPlayer.play(cv, rig, { intro, still: RM });
  hero.react("cheer", 4000); sound.fanfare();
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  // teal embers rising around the emblem while the screen is up
  let embers = 0;
  const ember = () => {
    if (el.hidden || RM) return;
    const b = box.getBoundingClientRect(), s = stage.getBoundingClientRect();
    for (let i = 0; i < 3; i++) fx.emit(b.left - s.left + b.width * (.08 + Math.random() * .84), b.top - s.top + b.height * (.55 + Math.random() * .4), { n: 1, kind: "wisp", rgb: Math.random() < .75 ? "79 240 200" : "233 196 106", scale: b.width / 900 });
    embers = setTimeout(ember, 140);
  };
  ember();
  // the amount counts up while the emblem arrives; it follows the pace, so a skip finishes it at once
  let k = 0, last = performance.now(), lastTick = 0;
  const counted = new Promise(res => (function step(t) {
    k = Math.min(1, k + Math.max(0, t - last) * pace() / 2400); last = Math.max(last, t);
    amtEl.textContent = money(k < 1 ? RGS.roundMoney(total * (1 - Math.pow(1 - k, 3))) : total);
    if (k < 1 && t - lastTick > 85) { lastTick = t; sound.tick(); }
    if (k < 1) requestAnimationFrame(step); else res();
  })(last));
  if (intro) { // the intro runs in real time; a skip jumps to the loop
    while (!anim.introDone && !slam) await new Promise(r => setTimeout(r, 40));
    anim.skipIntro();
  }
  await counted;
  if (!RM) amtEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
  await sleep(2200);
  await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished;
  el.hidden = true; clearTimeout(embers);
  anim.stop(); box.replaceChildren();
  return true;
}

// ---------- Geisterkisten (free spins with crates, runes and 3 lives) ----------
const RUNE_IDS = ["rune_green", "rune_blue", "rune_purple", "rune_fire", "rune_pink"];
// What lands and its values come from the bonusStart / bonusSpin / bonusEnd events.
const MIN_LINK = 4, MAX_WIN = MAX_WIN_X;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MULT_POOL = [2, 3, 5]; // only for the rolling plate animation
const fmtV = v => RGS.formatNumber(v);
let K = [];
const at = (c, r) => K[c]?.[r];
const kCells = t => { const o = []; K.forEach((col, c) => col.forEach((h, r) => { if (t === null ? !h : h && h.t === t) o.push([c, r]); })); return o; };

function makeCrate(id, mult) {
  const el = div("crate"); el.style.setProperty("--c", SYM[id].rgb);
  const front = div("cr-front"), plate = div("cr-plate");
  plate.textContent = "×" + mult; // brackets and tag sit over the coffin front, so its shape does not clip them
  el.append(div("cr-glow"), div("cr-back"), makeSym(id), front, div("cr-corner l"), div("cr-corner r"), plate); return el;
}
function makeRune(v, id) {
  const el = div("rtok"); el.style.setProperty("--c", SYM[id].rgb);
  const img = new Image(); img.src = IMG[id]; img.alt = ""; img.draggable = false;
  const t = document.createElement("span"); t.className = "rv"; t.textContent = fmtV(v * bet);
  el.append(img, t); return el;
}
function dropIn(el, heavy) {
  if (RM) return;
  el.animate([{ transform: "translateY(-160%) scale(.9)", opacity: 0 }, { transform: "translateY(-160%) scale(.9)", opacity: 1, offset: .05 },
    { transform: `translateY(6%) scale(${heavy ? "1.12, .86" : "1.06, .92"})`, offset: .75 }, { transform: "none", opacity: 1 }],
    { duration: heavy ? 720 : 520, easing: "cubic-bezier(.45,0,.7,1)" });
}
let runeStep = 0; // rune chimes climb through the scale during a bonus
function placeRune(c, r, v, id) {
  K[c][r] = { t: "r", v }; sound.rune(runeStep++);
  const el = makeRune(v, id); reels[c].cells[r].replaceChildren(el); dropIn(el, false);
  later(() => { const [x, y, w] = cellCenter([c, r]); fx.emit(x, y + w * .2, { n: 8, kind: "spark", rgb: el.style.getPropertyValue("--c"), scale: w / 140 }); }, RM ? 0 : 400);
}
function placeCrate(c, r, id, m, intro) {
  K[c][r] = { t: "c", id, m }; if (!intro) sound.crate();

  const el = makeCrate(id, m); reels[c].cells[r].replaceChildren(el);
  if (!intro) {
    dropIn(el, true);
    later(() => { shake(10, 450); const [x, y, w] = cellCenter([c, r]); fx.emit(x, y + w * .35, { n: 26, kind: "spark", rgb: SYM[id].rgb, scale: w / 110 }); animWin(q(el, ".sym")); }, RM ? 0 : 560);
  }
  return el;
}

// Rune groups (orthogonal): touching runes and crates form one group. A group with 4+ runes and at least one crate pays
// the sum of its runes times every crate multiplier in it; crates touching only each other pay nothing.
function linkGroups() {
  // Runes and crates that touch form one group. 4+ runes and at least one crate: (sum of runes) x crate1 x crate2 x ...
  // The flow starts at every crate and spreads outward, so each link has a direction and a depth.
  const done = new Set(), out = [];
  K.forEach((col, c0) => col.forEach((h0, r0) => {
    if (!h0 || done.has(c0 + "," + r0)) return;
    const nodes = [], st = [[c0, r0]]; done.add(c0 + "," + r0);
    while (st.length) { const [x, y] = st.pop(); nodes.push([x, y]);
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (at(nx, ny) && !done.has(nx + "," + ny)) { done.add(nx + "," + ny); st.push([nx, ny]); } } }
    const cells = nodes.filter(([x, y]) => K[x][y].t === "r"), crateCells = nodes.filter(([x, y]) => K[x][y].t === "c");
    if (!cells.length) return;
    const inSet = new Set(nodes.map(([x, y]) => x + "," + y));
    const depth = new Map(), origin = new Map(), edges = [], q2 = [];
    crateCells.forEach(([x, y]) => { depth.set(x + "," + y, 0); origin.set(x + "," + y, K[x][y].id); q2.push([x, y]); });
    while (q2.length) {
      const [x, y] = q2.shift(), key0 = x + "," + y, d = depth.get(key0);
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, key = nx + "," + ny;
        if (!inSet.has(key) || depth.has(key)) continue;
        depth.set(key, d + 1); origin.set(key, origin.get(key0)); q2.push([nx, ny]);
        edges.push({ a: [x, y], b: [nx, ny], d, id: origin.get(key0) }); }
    }
    // crates touching each other are linked too
    const crateSet = new Set(crateCells.map(([x, y]) => x + "," + y));
    crateCells.forEach(([x, y]) => [[1, 0], [0, 1]].forEach(([dx, dy]) => { if (crateSet.has((x + dx) + "," + (y + dy))) edges.push({ a: [x, y], b: [x + dx, y + dy], d: 0, crateLink: true }); }));
    const sum = cells.reduce((s2, [x, y]) => s2 + K[x][y].v, 0);
    const ok = cells.length >= MIN_LINK && crateCells.length > 0;
    const mults = crateCells.map(([x, y]) => K[x][y].m).sort((m1, m2) => m1 - m2);
    const mult = ok ? mults.reduce((p2, m) => p2 * m, 1) : 1;
    out.push({ cells, crates: crateCells.map(cell => ({ cell })), chains: [{ cells: crateCells }], sum, ok, mult, mults, edges, depth });
  }));
  return out;
}
const bonusValue = () => Math.min(MAX_WIN, linkGroups().reduce((s, g) => s + (g.ok ? g.sum * g.mult : 0), 0)) * bet;

function drawGroupLinks(groups) {
  qa(reelsEl, ".rtok.linked").forEach(e => e.classList.remove("linked"));
  qa(reelsEl, ".crate.active").forEach(e => e.classList.remove("active"));
  qa(reelsEl, ".lit").forEach(e => e.classList.add("stale"));
  // only groups that pay (4+ runes touching a crate) light up; crates touching each other alone are not a connection
  for (const g of groups) {
    if (!g.ok) continue;
    g.chains.forEach(ch => ch.cells.forEach(([c, r]) => q(reels[c].cells[r], ".crate").classList.add("active")));
    const top = g.crates.map(k => K[k.cell[0]][k.cell[1]]).sort((a, b) => b.m - a.m)[0], rgb = SYM[top.id].rgb;
    // the light spreads from the crates outward, ring by ring
    lightUp(g.chains[0].cells.concat(g.cells), rgb, (i, [c, r]) => (g.depth.get(c + "," + r) ?? 0) * 160);
    g.cells.forEach(([c, r]) => {
      const t = q(reels[c].cells[r], ".rtok"); t.style.setProperty("--lc", rgb);
      const d = g.depth.get(c + "," + r) ?? 1;
      later(() => t.classList.add("linked"), RM ? 0 : d * 160 + 120);
    });
  }
  qa(reelsEl, ".lit.stale").forEach(e => e.remove());
}

function setLives(n) {
  qa(livesEl, ".life").forEach((l, i) => l.classList.toggle("out", i >= n));
}
async function loseLife(n) {
  hero.react("gasp", 1100); sound.lifeLost();
  const l = qa(livesEl, ".life")[n];
  stage.classList.remove("hurt"); void stage.offsetWidth; stage.classList.add("hurt");
  if (!RM) {
    const big = div("life-big"), lf = document.createElement("i"), t = div("lbl2");
    lf.className = "life"; t.textContent = n === 0 ? i18n("Letzte Chance vorbei", "Last chance gone") : (n === 1 ? i18n("Noch 1 Leben", "1 life left") : i18n(`Noch ${n} Leben`, `${n} lives left`));
    big.append(lf, t); stage.appendChild(big);
    big.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.4)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: .25 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .5 }, { opacity: 0, transform: "translate(-50%,-60%) scale(.9)" }], { duration: 1300, fill: "forwards" });
    later(() => { lf.classList.add("out"); const [x, y] = [stage.clientWidth / 2, stage.clientHeight * .44]; fx.emit(x, y, { n: 18, rgb: "160 175 170", scale: stage.clientWidth / 500 }); }, 520);
    later(() => big.remove(), 1350);
    l.animate([{ transform: "scale(1)" }, { transform: "scale(1.8)", filter: "brightness(2)" }, { transform: "scale(1)" }], { duration: 500 });
  }
  later(() => setLives(n), RM ? 0 : 450);
  await sleep(RM ? 300 : 1050);
}
function refillLives(prev) {
  setLives(3); if (prev < 3) sound.refill();
  if (prev < 3 && !RM) qa(livesEl, ".life").forEach((l, i) => i >= prev && l.animate([{ transform: "scale(0)", filter: "brightness(3)" }, { transform: "scale(1.7)", offset: .5 }, { transform: "scale(1)", filter: "brightness(1)" }], { duration: 520, delay: (i - prev) * 90 }));
}
function bonusHud(extra) {
  const v = bonusValue(); setWin(v);
  say(extra || `${i18n("Wert", "Value")} ${money(v)}`);
}

async function slowSpin(landed) {
  nextSequence();
  const empties = kCells(null);
  empties.forEach(([c, r]) => { reels[c].cells[r].classList.add("falling"); });
  spinBtn.classList.add("turning");
  // pale reel spin in every empty cell
  const ghostPool = RUNE_IDS.concat(RUNE_IDS, CHARS);
  const ghost = () => { const g = div("ghostspin"), img = new Image(); img.src = IMG[pick(ghostPool)]; img.alt = ""; g.appendChild(img); return g; };
  const ghostTick = () => empties.forEach(([c, r]) => { if (!K[c][r] && reels[c].cells[r].classList.contains("falling")) reels[c].cells[r].replaceChildren(ghost()); });
  ghostTick(); const ghostIv = RM ? 0 : setInterval(ghostTick, 95);
  sound.spin();
  const plan = landed.map(p => ({ c: p.reel, r: p.row, t: p.type === "crate" ? "c" : "r", p }));
  await sleep(RM ? 150 : 850);
  for (let c = 0; c < COLS; c++) {
    const colEmpties = empties.filter(e => e[0] === c), colPlan = plan.filter(p => p.c === c);
    colEmpties.forEach(([cc, r]) => { const cell = reels[cc].cells[r]; cell.classList.remove("falling"); if (!K[cc][r]) cell.replaceChildren(); });
    for (const p of colPlan) {
      if (p.t === "c") placeCrate(p.c, p.r, p.p.symbol, p.p.mult);
      else placeRune(p.c, p.r, p.p.value, p.p.symbol);
    }
    sound.land(c, 0, colPlan.some(p => p.t === "c"));
    await sleep(RM ? 20 : (colPlan.length ? (colPlan.some(p => p.t === "c") ? 600 : 300) : 110));
  }
  clearInterval(ghostIv);
  spinBtn.classList.remove("turning");
  await sleep(RM ? 50 : 300);
  return plan;
}

// Plays bonusStart, every bonusSpin and bonusEnd; returns the bonus win in currency
async function harvest(start, spinEvents, end) {
  runeStep = 0;
  const fsCells = start.crates.map(k => [k.reel, k.row]), n = Math.min(7, fsCells.length);
  say(`${n} FS · ${i18n("Freispiele!", "Free Spins!")}`);
  stage.classList.add("bonus");
  preloadTotalWin();
  await banner(n === 3 ? i18n("Geisterkisten", "Ghost Crates") : `${n} ${i18n("Geisterkisten", "Ghost Crates")}`, i18n(`3 Leben · Nur Runen in ${MIN_LINK}er-Gruppen an einer Kiste zählen`, `3 lives · Only groups of ${MIN_LINK}+ runes touching a crate count`), 2100);
  K = reels.map(() => Array(ROWS).fill(null));
  reels.forEach(rl => { rl.tall.hidden = true; rl.tall.replaceChildren(); rl.cells.forEach(c => c.style.visibility = ""); });
  const isFs = (c, r) => fsCells.some(p => p[0] === c && p[1] === r);
  await Promise.all(reels.flatMap((rl, c) => rl.cells.map((cell, r) => {
    cell.classList.remove("win", "dim");
    if (isFs(c, r)) return null;
    const a = cell.firstChild && !RM ? cell.firstChild.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(60%) scale(.6)" }], { duration: 480, delay: (c * 5 + r) * 18, fill: "forwards" }).finished : Promise.resolve();
    return a.then(() => cell.replaceChildren());
  })));
  // FS symbols burst open into crates, multiplier rolls on the plate
  for (const k of start.crates.slice().sort((a, b) => a.reel - b.reel)) {
    const c = k.reel, r = k.row, cell = reels[c].cells[r], id = k.symbol, m = k.mult;
    if (!RM) await q(cell, ".sym")?.animate([{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.35) rotate(8deg)", filter: "brightness(3)" }, { transform: "scale(0)", filter: "brightness(4)" }], { duration: 420, easing: "ease-in" }).finished;
    const el = placeCrate(c, r, id, m, true);
    const [x, y, w] = cellCenter([c, r]); fx.emit(x, y, { n: 30, kind: "spark", rgb: SYM[id].rgb, scale: w / 100 });
    if (!RM) el.animate([{ transform: "scale(0) rotate(-20deg)" }, { transform: "scale(1.25) rotate(4deg)", offset: .6 }, { transform: "none" }], { duration: 520, easing: "ease-out" });
    const plate = q(el, ".cr-plate"), t0 = performance.now();
    while (!RM && performance.now() - t0 < 900 / pace()) { plate.textContent = "×" + pick(MULT_POOL); sound.roll(); await sleep(65); }
    plate.textContent = "×" + m;
    if (!RM) plate.animate([{ transform: "translateX(-50%) scale(1.8)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 320 });
    animWin(q(el, ".sym")); await sleep(250);
  }
  livesEl.hidden = false; setLives(3);
  let lives = start.lives;
  bonusHud(i18n("3 Leben · los geht's", "3 lives · here we go"));
  await sleep(700);
  for (const ev of spinEvents) {
    say(`Spin ${ev.spin} · ${i18n("Wert", "Value")} ${money(bonusValue())}`);
    const plan = await slowSpin(ev.landed);
    RGS.saveEvent(ev.index);
    if (plan.length) {
      const prev = lives; lives = ev.lives; refillLives(prev);
      drawGroupLinks(linkGroups());
      const runes = plan.filter(p => p.t === "r").length, crates = plan.length - runes;
      bonusHud([runes && `${runes} ${runes === 1 ? i18n("Rune", "rune") : i18n("Runen", "runes")}`, crates && `${crates} ${crates === 1 ? i18n("Kiste", "crate") : i18n("Kisten", "crates")}`].filter(Boolean).join(" + ") + ` · ${i18n("Wert", "Value")} ${money(bonusValue())}`);
      await sleep(RM ? 100 : 650);
    } else {
      lives = ev.lives;
      say(lives ? i18n("Kein Treffer", "No hit") : i18n("Keine Leben mehr", "No lives left"));
      await loseLife(lives);
    }
  }
  if (!kCells(null).length) await banner(i18n("Volle Gruft!", "Full Crypt!"), i18n("Alle Felder belegt", "Every cell filled"), 1400);

  nextSequence(); // the finale (crates opening, runes collected) is its own sequence
  // Finale: linked groups get their crate multiplier
  const groups = linkGroups();
  drawGroupLinks(groups);
  const winners = groups.filter(g => g.ok).sort((a, b) => a.sum * a.mult - b.sum * b.mult);
  if (winners.length) { say(i18n("Die Kisten öffnen sich", "The crates open")); sound.toll(); }
  for (const g of winners) {
    g.crates.forEach(k => { const el = q(reels[k.cell[0]].cells[k.cell[1]], ".crate"); animWin(q(el, ".sym")); if (!RM) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 600 }); const [x, y, w] = cellCenter(k.cell); fx.emit(x, y, { n: 26, kind: "spark", rgb: SYM[K[k.cell[0]][k.cell[1]].id].rgb, scale: w / 100 }); });
    const pts = g.cells.map(cellCenter), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    floatText(cx, cy, `${fmtV(g.sum * bet)} × ${g.mults.join(" × ")}`, "246 196 79");
    await sleep(500);
    await Promise.all(g.cells.map(([c, r], i) => sleep(i * 40).then(() => {
      const t = q(reels[c].cells[r], ".rtok .rv"), from = K[c][r].v * bet, to = from * g.mult, t0 = performance.now();
      return new Promise(res => (function step(tt) { const k = Math.min(1, Math.max(0, (tt - t0) / (500 / pace()))); t.textContent = fmtV(k < 1 ? RGS.roundMoney(from + (to - from) * k) : to); if (k < 1) requestAnimationFrame(step); else res(); })(t0));
    })));
    shake(6, 300);
    await sleep(450);
  }
  // Collect (the event total is authoritative; it already includes the max-win cap)
  const total = end.totalWin / 100 * bet;
  clearLit(); setWin(0);
  const mOf = new Map();
  groups.forEach(g => g.cells.forEach(([c, r]) => mOf.set(c + "," + r, g.ok ? g.mult : 0)));
  const dead = kCells("r").filter(([c, r]) => !mOf.get(c + "," + r));
  if (dead.length) {
    say(`${dead.length} ${dead.length === 1 ? i18n("Rune ohne Verbindung zerfällt", "unlinked rune crumbles") : i18n("Runen ohne Verbindung zerfallen", "unlinked runes crumble")}`);
    sound.crumble();
    await Promise.all(dead.map(([c, r], i) => { const el = q(reels[c].cells[r], ".rtok"); return RM ? null : el.animate([{ filter: "none", opacity: 1, transform: "none" }, { filter: "grayscale(1) brightness(.6)", opacity: 1, offset: .4 }, { filter: "grayscale(1) brightness(.4)", opacity: 0, transform: "translateY(25%) scale(.7)" }], { duration: 700, delay: i * 40, fill: "forwards" }).finished; }));
  }
  const runes = kCells("r").filter(([c, r]) => mOf.get(c + "," + r));
  let run = 0;
  for (const [i, [c, r]] of runes.entries()) {
    run += K[c][r].v * mOf.get(c + "," + r) * bet;
    const el = q(reels[c].cells[r], ".rtok"); sound.collect(i);
    if (!RM) el.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.4)", offset: .4 }, { transform: "scale(0)", opacity: 0 }], { duration: 380, fill: "forwards" });
    countTo(Math.min(run, total), 180);
    await sleep(runes.length > 16 ? 60 : 110);
  }
  await countTo(total, 400);
  livesEl.hidden = true;
  if (!(total > 0 && await totalWinScreen(total, spinEvents.length)))
    await banner(total >= 50 * bet ? i18n("Riesige Beute!", "Huge Haul!") : i18n("Freispiele vorbei", "Free Spins over"), i18n(money(total) + " gewonnen", money(total) + " won"), 2200);
  say(i18n(`Geisterkisten · ${money(total)} gewonnen`, `Ghost Crates · ${money(total)} won`));
  stage.classList.remove("bonus");
  G = reels.map(() => Array.from({ length: ROWS }, () => { let id; do { id = randSym(); } while (id === "fs" || id === "vs"); return id; }));
  reels.forEach((rl, c) => rl.cells.forEach((cell, r) => { const s2 = makeSym(G[c][r]); cell.replaceChildren(s2); land(s2); }));
  return total;
}

// ---------- Game flow: one round = the events of one RGS book, played in order ----------
let busy = false;
const MULTI_NAME = { 1: i18n("Duell!", "Duel!"), 2: i18n("Doppel-Duell!", "Double Duel!"), 3: i18n("Dreifach-Duell!", "Triple Duel!"), 4: i18n("4-fach-Duell!", "4x Duel!"), 5: i18n("5-fach-Duell!", "5x Duel!"), 6: i18n("Geisterkrieg!", "Ghost War!") };
const amt = a => a / 100 * bet; // event amounts are bet multipliers x100

// Values come from the winInfo event; link lines and wild cells for drawing from the board.
function clustersFor(ev) {
  const found = findClusters(), keyOf = cells => cells.map(p => p.join(",")).sort().join("|");
  return ev.wins.map(w => {
    const cells = w.positions.map(p => [p.reel, p.row]);
    const vis = w.wildOnly
      ? found.find(f => f.wildOnly && f.vsCols.join() === w.vsReels.join())
      : found.find(f => f.id === w.symbol && keyOf(f.cells) === keyOf(cells));
    return { ...(vis || { wilds: [], links: [] }), id: w.symbol, cells, vsCols: w.vsReels, wildOnly: w.wildOnly,
      base: amt(w.base), mult: w.mult, win: amt(w.win) };
  });
}

async function showCascade(duels, ev, rounds) {
  nextSequence();
  const clusters = clustersFor(ev);
  if (duels.length) {
    const cols = duels.map(d => d.reel);
    // the groups that reach a VS reel light up before the duel starts
    clusters.filter(cl => cl.vsCols.some(c => cols.includes(c))).forEach(cl => lightUp(cl.cells, SYM[cl.id].rgb, i => i * 40, c => cl.vsCols.includes(c)));
    say(clusters.some(cl => cl.wildOnly) ? i18n("VS-Walzen nebeneinander · Duell!", "VS reels side by side · Duel!") : i18n("VS verbunden · Duell!", "VS connected · Duel!")); await sleep(RM ? 200 : 1000); clearLit();
    if (duels.length > 1) await banner(MULTI_NAME[duels.length], i18n(`${duels.length} VS-Walzen verbunden · Multiplikatoren werden addiert`, `${duels.length} VS reels connected · multipliers add up`), 1300);
    for (const d of duels) {
      const res = await reelDuel(d); vsMult[d.reel] = res.mult; vsWinner[d.reel] = res.winner;
      RGS.saveEvent(d.index);
      if (res.tier === 3) await banner(i18n("TEUFELSDUELL!", "DEVIL DUEL!"), i18n(`×${res.mult} auf der Walze`, `×${res.mult} on the reel`), 1800);
      await sleep(200);
    }
    const sum = Object.values(vsMult).reduce((a1, b1) => a1 + b1, 0);
    multChip.textContent = "×" + sum; multChip.hidden = false;
    if (!RM) multChip.animate([{ transform: "scale(2.4)", opacity: 0 }, { transform: "scale(.9)", opacity: 1, offset: .6 }, { transform: "scale(1)" }], { duration: 450 });
  }
  say(rounds > 1 ? `${i18n("Kaskade", "Cascade")} ${rounds}` : (clusters.length > 1 ? `${clusters.length} ${i18n("Gruppen", "groups")}` : clusters[0].wildOnly ? `${clusters[0].vsCols.length} ${i18n("VS-Walzen", "VS reels")} · ${SYM[clusters[0].id].name}` : `${clusters[0].cells.length}× ${SYM[clusters[0].id].name}`));
  await showWins(clusters, shown);
}

async function showFsTrigger(ev) {
  nextSequence();
  const fsCells = ev.positions.map(p => [p.reel, p.row]);
  sound.fanfare();
  qa(reelsEl, ".cell, .tall").forEach(c => c.classList.remove("win", "dim")); clearLit();
  fsCells.forEach(([c, r], i) => later(() => {
    const el = q(reels[c].cells[r], ".sym"); reels[c].cells[r].classList.add("win"); animWin(el);
    const [x, y, w] = centerOf(el); fx.emit(x, y, { n: 24, kind: "spark", rgb: SYM.fs.rgb, scale: w / 120 });
  }, i * 160));
  await sleep(1400);
}

// Returns the round's total win in currency
async function playRound(events, resumed) {
  clearBoard(); setWin(0);
  say(resumed ? i18n("Runde wird fortgesetzt", "Resuming round") : i18n("Viel Glück!", "Good luck!"));
  vsMult = {}; vsWinner = {};
  let won = 0, rounds = 0, summarised = false;
  let bigPlayed = false; // the big-win fanfare plays once per round
  const baseSummary = () => {
    if (summarised) return; summarised = true;
    if (won > 0) say(rounds > 1 ? `${rounds} ${i18n("Kaskaden", "cascades")} · ${i18n("Gewinn", "Win")} ${money(won)}` : `${i18n("Gewinn", "Win")} ${money(won)}`);
    else say(vsReels.length ? i18n("VS ohne Verbindung · kein Gewinn", "VS not connected · no win") : i18n("Kein Gewinn, nochmal!", "No win, try again!"));
  };
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.type) {
      case "reveal":
        G = ev.board.map(col => col.map(s => s.name)); vsReels = ev.vsReels.slice();
        await spinReels(G);
        break;
      case "vsDuel":
      case "winInfo": {
        const duels = [];
        while (events[i].type === "vsDuel") duels.push(events[i++]);
        if (events[i].type !== "winInfo") throw new Error("vsDuel must be followed by winInfo");
        await showCascade(duels, events[i], ++rounds);
        RGS.saveEvent(events[i].index);
        break;
      }
      case "updateTumbleWin":
        won = amt(ev.amount); countTo(won, 300);
        break;
      case "tumbleBoard":
        await tumble(ev);
        RGS.saveEvent(ev.index);
        break;
      case "wincap":
        won = amt(ev.amount); setWin(won);
        bigPlayed = true; sound.bigWin(true);
        await banner("MAX WIN", `${MAX_WIN_X.toLocaleString(RGS.lang)}× ${i18n("Einsatz", "bet")}`, 2600);
        break;
      case "bonusTrigger": {
        baseSummary();
        await showFsTrigger(ev);
        const start = events[++i], spins = [];
        while (events[i + 1].type === "bonusSpin") spins.push(events[++i]);
        const end = events[++i];
        if (start.type !== "bonusStart" || end.type !== "bonusEnd") throw new Error("malformed bonus events");
        won += await harvest(start, spins, end);
        RGS.saveEvent(end.index);
        break;
      }
      case "setTotalWin":
        baseSummary();
        won = amt(ev.amount); setWin(won);
        if (won >= 20 * bet && !bigPlayed) { bigPlayed = true; sound.bigWin(); }
        break;
      case "finalWin":
        break;
      default:
        console.warn("unhandled event", ev.type);
    }
  }
  return won;
}

function updateBal() { balVal.textContent = RGS.replay ? "–" : money(balance); } // replays have no wallet
function updateBet() {
  bet = BETS[betIdx]; betVal.textContent = fmtV(bet);
  refreshPays(); showBoost();
  document.getElementById("betMinus").disabled = busy || RGS.replay || betIdx === 0;
  document.getElementById("betPlus").disabled = busy || RGS.replay || betIdx === BETS.length - 1;
}
const buttons = ["betMinus", "betPlus", "autoBtn"].map(id => document.getElementById(id));
const spinBtn = document.getElementById("spin"), autoBtn = document.getElementById("autoBtn");
let autoOn = false, loading = true;
const canSkip = () => !loading && !RGS.jurisdiction.disabledSlamstop;
// during a round Spin stays clickable: it skips the sequence that is playing instead of starting a new round
const lock = on => { busy = on; buttons.forEach(b => b.disabled = on); spinBtn.disabled = on && !canSkip(); if (!on) { slam = false; updateBet(); } updateBuy(); };
// slam stop: a click on Spin or the board (or Space) plays the sequence that is running SLAM times faster and fades out
// the sounds it scheduled; a second click in the same sequence does nothing, one in the next sequence skips that one
function skip() { if (!busy || slam || !canSkip()) return; slam = true; hurry(); sound.cut(); }

// Wallet flow: play debits the bet (x the mode's cost) and returns the book; end-round credits a win.
async function play(mode = boost ? boost.mode : "BASE") {
  if (busy || RGS.replay) return;
  const cost = bet * modeCost(mode);
  if (balance < cost) { say(i18n("Guthaben reicht nicht für diesen Einsatz", "Balance too low for this bet")); if (autoOn) stopAuto(); return; }
  lock(true); spinBtn.classList.add("turning");
  later(() => spinBtn.classList.remove("turning"), 1600);
  const t0 = performance.now();
  try {
    const res = await RGS.play(bet, mode);
    balance = res.balance; updateBal();
    await runRound(res.round, false);
    const wait = RGS.minimumRoundDuration - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
  } catch (err) {
    console.error(err); stopAuto(); say(RGS.errorText(err));
  } finally {
    lock(false);
  }
}
// Plays a round (new or resumed) and closes it on the RGS when it is still active (a win).
async function runRound(round, resumed) {
  await playRound(round.state, resumed);
  if (round.active) { const end = await RGS.endRound(); balance = end.balance; }
  updateBal();
}
// ---------- Autoplay with selectable number of spins ----------
const autoMenu = document.getElementById("autoMenu"), autoLeftEl = document.getElementById("autoLeft"), amStart = document.getElementById("amStart");
let autoLeft = 0, autoChoice = 0;
function showAutoLeft() { autoLeftEl.hidden = !autoOn; autoLeftEl.textContent = autoLeft === Infinity ? "∞" : autoLeft; }
function stopAuto(msg) { autoOn = false; autoLeft = 0; autoBtn.setAttribute("aria-pressed", "false"); showAutoLeft(); updateBuy(); if (msg) say(msg); }
async function autoLoop() {
  while (autoOn && autoLeft > 0) {
    if (balance < bet * modeCost(boost ? boost.mode : "BASE")) { stopAuto(i18n("Guthaben reicht nicht · Autoplay beendet", "Balance too low · Autoplay ended")); break; }
    if (autoLeft !== Infinity) autoLeft--; showAutoLeft();
    await play();
    if (!autoOn) break;
    if (autoLeft <= 0) { stopAuto(i18n("Autoplay beendet", "Autoplay ended")); break; }
    await sleep(700);
  }
}
function openAutoMenu(open) {
  autoMenu.hidden = !open; autoBtn.setAttribute("aria-expanded", String(open));
  if (open) { qa(autoMenu, "[data-n]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === autoChoice))); amStart.disabled = !autoChoice; (q(autoMenu, '[aria-pressed="true"]') || q(autoMenu, "[data-n]")).focus(); }
}
autoBtn.addEventListener("click", () => {
  if (autoOn) { stopAuto(i18n("Autoplay gestoppt", "Autoplay stopped")); return; } // while running, one click stops it
  openAutoMenu(autoMenu.hidden);
});
qa(autoMenu, "[data-n]").forEach(b => {
  b.addEventListener("click", () => { autoChoice = +b.dataset.n; qa(autoMenu, "[data-n]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); amStart.disabled = false; });
  b.addEventListener("dblclick", () => amStart.click());
});
amStart.addEventListener("click", () => {
  if (!autoChoice) return;
  openAutoMenu(false);
  autoOn = true; autoLeft = autoChoice; autoBtn.setAttribute("aria-pressed", "true"); showAutoLeft(); updateBuy();
  say(autoChoice === Infinity ? i18n("Autoplay · endlos", "Autoplay · endless") : `Autoplay · ${autoChoice} Spins`);
  if (!busy) autoLoop(); else (async () => { while (busy) await sleep(200); autoLoop(); })();
});
document.getElementById("amClose").addEventListener("click", () => openAutoMenu(false));
addEventListener("keydown", e => { if (e.key === "Escape" && !autoMenu.hidden) openAutoMenu(false); });
document.addEventListener("pointerdown", e => { if (!autoMenu.hidden && !autoMenu.contains(e.target) && !autoBtn.contains(e.target)) openAutoMenu(false); });
document.getElementById("betMinus").addEventListener("click", () => { if (!busy && betIdx > 0) { betIdx--; updateBet(); } });
document.getElementById("betPlus").addEventListener("click", () => { if (!busy && betIdx < BETS.length - 1) { betIdx++; updateBet(); } });
document.getElementById("infoBtn").addEventListener("click", () => openRules(true));
document.getElementById("spin").addEventListener("click", () => busy ? skip() : play());
addEventListener("keydown", e => { if (e.code === "Space" && e.target === document.body && !RGS.jurisdiction.disabledSpacebar) { e.preventDefault(); busy ? skip() : play(); } });
game.addEventListener("pointerdown", e => { if (busy && !e.target.closest("button, .auto-menu, #intro, #rules")) skip(); });
// turbo: every round plays TURBO times faster; remembered between visits
const turboBtn = document.getElementById("turboBtn");
try { turbo = localStorage.getItem("ghostDuels.turbo") === "on"; } catch {}
const showTurbo = () => turboBtn.setAttribute("aria-pressed", String(turbo));
turboBtn.addEventListener("click", () => {
  turbo = !turbo; showTurbo();
  try { localStorage.setItem("ghostDuels.turbo", turbo ? "on" : "off"); } catch {}
  if (!busy) say(turbo ? i18n("Turbo an", "Turbo on") : i18n("Turbo aus", "Turbo off"));
});
showTurbo();

// ---------- Bonus menu: every buyable mode with its price at the current bet; an option's button plays it ----------
const buyBtn = document.getElementById("buyBtn"), buyDlg = document.getElementById("buyDlg");
q(buyBtn, ".bb-fs").appendChild(makeSym("fs", { lite: true }));
// card art: n FS symbols fanned out, or two ghosts facing off over a VS
function buyArt(b) {
  const art = div("ic-art"), place = (s2, left, top, width, rot, z) => { Object.assign(s2.style, { left: left + "%", top: top + "%", width: width + "%", rotate: rot + "deg", zIndex: z }); art.appendChild(s2); };
  if (b.vs) { art.style.setProperty("--c", "120 220 255"); place(makeSym("blue"), 22, 46, 40, 0, 1); place(makeSym("witch"), 78, 46, 40, 0, 1); place(makeSym("vs"), 50, 44, 52, 0, 2); return art; }
  art.style.setProperty("--c", "255 79 210");
  for (let i = 0; i < b.fs; i++) {
    const k = b.fs === 1 ? 0 : i / (b.fs - 1) - .5, mid = Math.abs(k) < .01; // -0.5 .. 0.5
    place(makeSym("fs"), 50 + k * 62, 52 + Math.abs(k) * 8, mid ? 44 : 36, k * 30, 10 - Math.round(Math.abs(k) * 10));
  }
  return art;
}
const buyCards = BUYS.map(b => {
  const card = div("icard buy-opt"), h = document.createElement("h2"), p = document.createElement("p"), price = div("buy-price"), go = document.createElement("button");
  card.append(...["tl", "tr", "bl", "br"].map(k => { const c = document.createElement("i"); c.className = "am-corner " + k; return c; }));
  h.textContent = b.name; p.textContent = b.text;
  const amount = document.createElement("b"), times = document.createElement("small");
  price.append(amount, times);
  go.type = "button"; go.className = "am-start"; go.textContent = i18n("Kaufen", "Buy");
  const foot = div("am-foot buy-foot"); foot.appendChild(go);
  go.addEventListener("click", () => { openBuy(false); play(b.mode); });
  card.append(buyArt(b), h, p, price, foot);
  document.getElementById("buyOpts").appendChild(card);
  return { b, amount, times, go };
});
function updateBuy() { buyBtn.disabled = busy || autoOn || loading || RGS.replay; boostBtn.disabled = busy || autoOn || loading || RGS.replay; }

// ---------- FS Boost switch: Off → 3× → 6× → Off. [31] a mode over 2× the bet is never one press away from a bet;
// switching only changes the next spins, and the switch shows their real price ----------
let boost = null; // off on every visit, so nobody plays at 3× or 6× by accident
const boostBtn = document.getElementById("boostBtn");
function showBoost() {
  const price = money(bet * (boost ? boost.cost : 1)), state = boost ? boost.level : i18n("Aus", "Off");
  boostBtn.classList.toggle("on", !!boost); boostBtn.classList.toggle("six", boost === BOOSTS[1]); boostBtn.setAttribute("aria-pressed", String(!!boost));
  q(boostBtn, ".bo-top").textContent = BOOST_NAME;
  q(boostBtn, ".bo-main").textContent = state;
  q(boostBtn, ".bo-cost").textContent = `${price} ${i18n("pro Spin", "per spin")}`;
  boostBtn.setAttribute("aria-label", `${BOOST_NAME}: ${state}, ${price} ${i18n("pro Spin", "per spin")}. ${i18n("Drücken wechselt Aus, 3×, 6×", "Press to switch Off, 3×, 6×")}`);
}
boostBtn.addEventListener("click", () => {
  if (boostBtn.disabled) return;
  boost = boost === null ? BOOSTS[0] : boost === BOOSTS[0] ? BOOSTS[1] : null; showBoost(); sound.click();
  say(boost ? i18n(`${boost.name} an · ${money(bet * boost.cost)} pro Spin`, `${boost.name} on · ${money(bet * boost.cost)} per spin`) : i18n("FS-Boost aus", "FS Boost off"));
});
function openBuy(open) {
  buyDlg.hidden = !open;
  if (!open) return buyBtn.focus();
  for (const { b, amount, times, go } of buyCards) {
    const short = balance < bet * b.cost;
    amount.textContent = money(bet * b.cost);
    times.textContent = short ? i18n("Guthaben reicht nicht", "Balance too low") : `${num(b.cost)}× ${i18n("Einsatz", "bet")}`;
    go.disabled = short;
  }
  (buyCards.find(c => !c.go.disabled)?.go || document.getElementById("buyClose")).focus();
  if (!RM) q(buyDlg, ".buy-menu").animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" });
}
buyBtn.addEventListener("click", () => openBuy(true));
document.getElementById("buyClose").addEventListener("click", () => openBuy(false));
buyDlg.addEventListener("click", e => { if (e.target === buyDlg) openBuy(false); });
addEventListener("keydown", e => { if (e.key === "Escape" && !buyDlg.hidden) openBuy(false); });

// ---------- Sound: one Web Audio graph with a music bus and an effects bus, each with its own volume ----------
// Browsers only allow sound after a tap or key press, so everything starts on the first one. Volumes and mute are remembered.
// The effects are synthesized placeholders; each one can later be swapped for a recorded sample without touching the call sites.
const sound = (() => {
  const KEY = "ghostDuels.sound", MUSIC_SRC = "assets/spooky-carousel.mp3";
  const st = { music: 65, sfx: 80, muted: false }; // sliders 0–100
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
  let ctx, master, musicBus, sfxBus, duckBus, verb, seq, noise, started = false, loadSfx = () => {};
  let hold = true; // the music stays silent while the studio logo is up (release() lets it in)
  // effects of the current sequence: dry to the effects bus, wet into the reverb; a skip fades this pair out (cut)
  const newSeq = () => { const dry = ctx.createGain(), wet = ctx.createGain(); dry.connect(sfxBus); wet.connect(verb); return { dry, wet }; };
  const file = fetch(MUSIC_SRC).then(r => { if (!r.ok) throw new Error("music " + r.status); return r.arrayBuffer(); });
  file.catch(() => {}); // reported in loadMusic()
  const level = v => (v / 100) ** 2; // slider to gain, roughly even steps in loudness
  function apply(sec = .25) {
    if (!ctx) return;
    const t = ctx.currentTime, k = Math.max(sec / 3, .001);
    master.gain.setTargetAtTime(st.muted ? 0 : 1, t, k);
    musicBus.gain.setTargetAtTime(hold ? 0 : level(st.music), t, k);
    sfxBus.gain.setTargetAtTime(level(st.sfx), t, k);
  }
  function start() {
    started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // created inside a gesture it may play; created without one (release() before any tap) the browser may keep it
    // suspended until the first tap, which wake() then resumes
    ctx = new AC(); Promise.resolve(ctx.resume()).catch(() => {});
    master = ctx.createGain(); master.connect(ctx.destination);
    duckBus = ctx.createGain(); duckBus.connect(master); // lowers the music under big moments (duck)
    musicBus = ctx.createGain(); musicBus.connect(duckBus);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    // crypt reverb: a long, dark stereo tail made from decaying noise (effects send a share of their sound here)
    verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) { const k = i / d.length; d[i] = (Math.random() * 2 - 1) * (1 - k) ** 3.2 * (k < .012 ? k / .012 : 1); } }
    verb.buffer = ir;
    const dark = ctx.createBiquadFilter(); dark.type = "lowpass"; dark.frequency.value = 3800;
    verb.connect(dark).connect(sfxBus);
    seq = newSeq();
    apply(0);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    loadMusic(); loadSfx();
  }
  async function loadMusic() {
    try {
      const buf = await ctx.decodeAudioData(await file);
      // loop between the first and last audible sample, so silence or decoder padding at the ends never leaves a gap
      const ch = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
      const edge = (i, step) => { while (i >= 0 && i < buf.length && !ch.some(d => Math.abs(d[i]) > 1e-3)) i += step; return Math.min(Math.max(i, 0), buf.length - 1); };
      const src = ctx.createBufferSource(), fadeIn = ctx.createGain(); src.buffer = buf; src.loop = true;
      src.loopStart = edge(0, 1) / buf.sampleRate; src.loopEnd = (edge(buf.length - 1, -1) + 1) / buf.sampleRate;
      const t = ctx.currentTime; fadeIn.gain.setValueAtTime(0, t); fadeIn.gain.linearRampToValueAtTime(1, t + 2);
      src.connect(fadeIn).connect(musicBus); src.start(0, src.loopStart);
    } catch (err) { console.warn(err); }
  }
  // first gesture starts the audio; later ones wake it if the browser suspended it (iOS interruptions).
  // Capture phase, so the context exists before the Space or Spin handler asks for its first sound.
  const wake = () => { if (!started) start(); else if (ctx && ctx.state !== "running" && !document.hidden) ctx.resume(); };
  addEventListener("pointerdown", wake, true); addEventListener("keydown", wake, true);
  document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  // ---- synth helpers: an enveloped oscillator and an enveloped, filtered noise burst
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  // out(g, rev): a voice goes to the effects bus, and a share of it (rev 0..1) into the crypt reverb
  const out = (g, rev) => { g.connect(seq.dry); if (rev) { const sg = ctx.createGain(); sg.gain.value = rev; g.connect(sg).connect(seq.wet); } };
  function tone(t, { type = "sine", f, f2, a = .002, d = .1, vol = .3, rev = 0, vib = 0, vibRate = 5.5, lp = 0, detune = 0 }) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibRate; lg.gain.value = f * vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + a + d + .05); }
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; node = node.connect(fl); }
    env(g, t, a, vol, d); node.connect(g); out(g, rev); o.start(t); o.stop(t + a + d + .05);
  }
  function hiss(t, { f, f2, q = 1, a = .002, d = .08, vol = .3, rev = 0, type = "bandpass" }) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, a, vol, d); s.connect(fl).connect(g); out(g, rev); s.start(t, Math.random()); s.stop(t + a + d + .05);
  }
  // notes: semitones above A3 (220 Hz). The scale is A Phrygian: minor, with the uneasy lowered second.
  const NOTE = n => 220 * 2 ** (n / 12), SCALE = [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24];
  // haunted bell: inharmonic partials, the high ones dying first
  const bell = (t, f, vol = .1, d = 1.6, rev = .45) => [[1, 1, 1], [2.76, .45, .6], [5.4, .22, .38], [8.93, .1, .24]]
    .forEach(([r, v, k]) => tone(t, { f: f * r, a: .003, d: d * k, vol: vol * v, rev }));
  // organ / choir: each note twice, slightly detuned, through a soft lowpass
  const pad = (t, notes, dur = 1.2, vol = .05, type = "sawtooth", lp = 1500, rev = .55) => notes.forEach(n => [-7, 7].forEach(dt =>
    tone(t, { type, f: NOTE(n), a: Math.min(.18, dur * .3), d: dur, vol, rev, lp, detune: dt })));
  // ghost wail: a sliding, wavering "oooh"
  const wail = (t, f, dur = .9, vol = .09) => { tone(t, { f, f2: f * .5, a: .08, d: dur, vol, rev: .6, vib: .03, vibRate: 6 }); tone(t, { type: "triangle", f: f * 2, f2: f, a: .1, d: dur * .8, vol: vol * .25, rev: .6, vib: .03, vibRate: 6 }); };
  // the devil's growl: low detuned saws with a fast tremble
  const growl = (t, dur = 1.1, vol = .12) => [55, 58.3, 82.4].forEach((f, i) => tone(t, { type: "sawtooth", f, f2: f * .82, a: .05, d: dur, vol: vol * (i === 2 ? .5 : 1), lp: 700, vib: .05, vibRate: 17, rev: .3 }));
  // music steps back under big moments and returns afterwards
  function duck(hold = 2) {
    if (!duckBus || slam) return; // nothing big plays while a sequence is being skipped
    const t = ctx.currentTime, g = duckBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(.28, t + .15); g.setValueAtTime(.28, t + .15 + hold); g.linearRampToValueAtTime(1, t + .15 + hold + .9);
  }
  // effects are skipped until the first gesture and in hidden tabs (they would pile up and play on return)
  // a sequence being skipped starts no new effects (they would pile up); button clicks still sound (always)
  const at = (delay = 0, always = false) => ctx && !document.hidden && (always || !slam) ? ctx.currentTime + Math.max(0, delay) : null;
  // a skip: the skipped sequence's sounds (also those scheduled for later) fade out at once, the music comes back up,
  // and the next sequence gets a fresh bus
  function cut() {
    if (!ctx || !seq) return;
    const t = ctx.currentTime, old = seq;
    for (const n of [old.dry, old.wet]) { n.gain.cancelScheduledValues(t); n.gain.setValueAtTime(n.gain.value, t); n.gain.linearRampToValueAtTime(0, t + .06); }
    setTimeout(() => { old.dry.disconnect(); old.wet.disconnect(); }, 400);
    seq = newSeq();
    const g = duckBus.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + .4);
  }
  const fx = {
    click() { const t = at(0, true); if (t == null) return; tone(t, { type: "triangle", f: 1900, f2: 1100, d: .045, vol: .16 }); hiss(t, { f: 4200, q: 2, d: .018, vol: .1 }); },
    // the old board falls out: a falling whoosh with a soft thump
    spin() { const t = at(); if (t == null) return; hiss(t, { f: 2400, f2: 320, q: .8, a: .03, d: .38, vol: .26 }); tone(t, { f: 150, f2: 55, a: .004, d: .2, vol: .3 }); },
    // a reel comes to rest: a wooden knock that climbs a little from reel to reel; heavy for VS reels and crates
    land(c, delay = 0, heavy = false) {
      const t = at(delay); if (t == null) return;
      const up = 1 + c * .06;
      if (heavy) { tone(t, { f: 120, f2: 38, a: .003, d: .32, vol: .5 }); tone(t, { type: "triangle", f: 640, d: .4, vol: .05 }); tone(t, { type: "triangle", f: 957, d: .3, vol: .035 }); hiss(t, { f: 500, q: 1, d: .12, vol: .25 }); }
      else { tone(t, { f: 200 * up, f2: 80 * up, a: .002, d: .11, vol: .38 }); hiss(t, { f: 1100 * up, q: 1.6, d: .045, vol: .2 }); }
    },
    // the small VS charges up before it bursts open
    charge() { const t = at(); if (t == null) return; tone(t, { type: "triangle", f: 260, f2: 980, a: .3, d: .08, vol: .09 }); hiss(t, { f: 600, f2: 4000, q: 3, a: .32, d: .05, vol: .12 }); },
    // the VS reel bursts open: a deep boom with a smoke blast
    burst() {
      const t = at(); if (t == null) return;
      tone(t, { f: 95, f2: 30, a: .004, d: .65, vol: .55 }); tone(t, { type: "sawtooth", f: 180, f2: 60, a: .004, d: .3, vol: .06 });
      hiss(t, { f: 3200, f2: 350, q: .7, a: .01, d: .7, vol: .3 }); tone(t + .05, { type: "triangle", f: 1320, d: .5, vol: .03 });
    },
    // a winning group: haunted bells climbing the scale; bigger groups and better symbols ring higher and longer
    win(size = 4, tier = "obj") {
      const t = at(); if (t == null) return;
      const start = { rune: 0, obj: 2, char: 4, special: 5 }[tier] ?? 2, notes = Math.min(5, 2 + Math.floor((size - 4) / 2));
      for (let i = 0; i < notes; i++) bell(t + i * .085, NOTE(SCALE[start + i * 2]) * 2, tier === "rune" ? .06 : .085, tier === "char" ? 2 : 1.4);
      if (tier === "char") tone(t, { f: 110, f2: 55, a: .005, d: .35, vol: .2, rev: .3 });
    },
    // winning symbols vanish: a ghostly "poof" and a dry crumble
    tumble() {
      const t = at(); if (t == null) return;
      hiss(t, { f: 2200, f2: 260, q: .9, a: .02, d: .4, vol: .17, rev: .35 });
      for (let i = 0; i < 4; i++) hiss(t + .05 + i * .045, { f: 900 + Math.random() * 900, q: 3, d: .03, vol: .06, type: "lowpass" });
    },
    // the win counter climbing: quiet bone ticks
    tick() { const t = at(); if (t == null) return; tone(t, { type: "triangle", f: 2300 + Math.random() * 600, d: .018, vol: .03 }); },
    // a multiplier badge rolling, then a bell when it lands
    roll() { const t = at(); if (t == null) return; tone(t, { type: "square", f: 1400 + Math.random() * 300, d: .012, vol: .018, lp: 3000 }); },
    ding(tier = 1) { const t = at(); if (t == null) return; bell(t, NOTE(tier === 3 ? 6 : tier === 2 ? 15 : 24) * (tier === 3 ? 1 : 1), .12, tier === 3 ? 2.4 : 1.6); },
    // the VS slams into the duel: a deep boom and a falling whoosh in the crypt
    slam() { const t = at(); if (t == null) return; tone(t, { f: 90, f2: 32, a: .004, d: .5, vol: .45, rev: .35 }); hiss(t, { f: 3000, f2: 300, q: .7, a: .01, d: .35, vol: .2, rev: .3 }); bell(t + .02, NOTE(-12), .07, 2.2, .6); },
    // two fighters collide: a metallic clash, harder the higher the stakes
    clash(power = 0) {
      const t = at(); if (t == null) return;
      [523, 739, 987, 1318].forEach((f, i) => tone(t, { type: "square", f: f * (1 + power * .04), d: .22 - i * .03, vol: .035, lp: 5000, rev: .4 }));
      hiss(t, { f: 5200, q: .6, d: .12, vol: .22, rev: .3 }); tone(t, { f: 120, f2: 45, a: .003, d: .22, vol: .35 + power * .08 });
    },
    // a fighter is knocked out: a descending ghostly wail
    knockout() { const t = at(); if (t == null) return; wail(t, NOTE(12 + Math.floor(Math.random() * 3))); },
    // a challenger enters: the pirate's low horn, or the devil's growl
    challenger(tier = 2) {
      const t = at(); if (t == null) return; duck(1.6);
      if (tier >= 3) { growl(t, 1.3, .13); pad(t + .1, [-12, -6], 1.2, .05, "sawtooth", 600); hiss(t, { f: 300, f2: 120, q: .8, a: .2, d: 1, vol: .12, rev: .4 }); }
      else { pad(t, [-12, -5], .9, .07, "sawtooth", 900); tone(t, { f: 110, a: .15, d: .8, vol: .12, rev: .5, vib: .01 }); }
    },
    // the duel is won: a bell sting; the pirate gets a dark organ chord, the devil the tritone with a growl
    sting(tier = 1) {
      const t = at(); if (t == null) return;
      if (tier >= 3) { duck(2.4); growl(t, 1.4, .1); pad(t, [-12, -9, -6, 0], 2, .045, "sawtooth", 1100); bell(t + .1, NOTE(-6), .14, 3); }
      else if (tier === 2) { duck(1.8); pad(t, [0, 3, 7, 12], 1.6, .04, "triangle", 2200); bell(t, NOTE(12), .11, 2.2); bell(t + .12, NOTE(15), .09, 2); }
      else [0, 3, 7].forEach((n, i) => bell(t + i * .07, NOTE(n + 12), .09, 1.6));
    },
    // free spins triggered: a swelling organ, a church-bell toll and bells tumbling down
    fanfare() {
      const t = at(); if (t == null) return; duck(3.2);
      pad(t, [-12, 0, 3, 7], 1.1, .05, "sawtooth", 1800); pad(t + 1, [-16, -4, 0, 5], 1.4, .05, "sawtooth", 1800);
      bell(t, NOTE(-12), .16, 3.2, .7);
      [24, 22, 20, 19, 17, 15, 12].forEach((n, i) => bell(t + .35 + i * .09, NOTE(n), .06, 1.2));
    },
    // a heavy toll, e.g. when the crates open
    toll() { const t = at(); if (t == null) return; bell(t, NOTE(-12), .16, 3.4, .7); tone(t, { f: 55, a: .01, d: 1.4, vol: .16, rev: .5 }); },
    // bonus: a rune lands (glass chime, rising through the scale), a crate lands (heavy hit plus a bell)
    rune(step = 0) { const t = at(); if (t == null) return; bell(t, NOTE(SCALE[(step % 8) + 4]) * 2, .05, .7, .5); },
    crate() { const t = at(); if (t == null) return; bell(t + .02, NOTE(0), .09, 1.6, .55); },
    // runes without a crate crumble to dust: a dry, grinding rattle sinking into the crypt
    crumble() { const t = at(); if (t == null) return; for (let i = 0; i < 6; i++) hiss(t + i * .045, { f: 1800 - i * 220, q: 1.4, a: .004, d: .07, vol: .07, rev: .25 }); tone(t, { f: 70, f2: 40, a: .01, d: .45, vol: .14, rev: .4 }); },
    // a linked rune is collected into the win: a soul-chime that climbs with every rune
    collect(step = 0) { const t = at(); if (t == null) return; bell(t, NOTE(SCALE[(step % 8) + 4]) * 2, .035, .5, .45); },
    // a life is lost: a heartbeat and a crack; lives refilled: rising chimes
    lifeLost() {
      const t = at(); if (t == null) return;
      tone(t, { f: 72, f2: 45, a: .005, d: .14, vol: .5 }); tone(t + .2, { f: 64, f2: 40, a: .005, d: .18, vol: .42 });
      hiss(t + .05, { f: 3200, q: 1.2, d: .07, vol: .18, rev: .3 }); wail(t + .25, NOTE(7), .7, .05);
    },
    refill() { const t = at(); if (t == null) return; [7, 12, 15].forEach((n, i) => bell(t + i * .08, NOTE(n) * 2, .05, .9)); },
    // banners: a rising whoosh and a bell
    banner() { const t = at(); if (t == null) return; duck(2); hiss(t, { f: 300, f2: 3000, q: .8, a: .25, d: .2, vol: .13, rev: .4 }); bell(t + .25, NOTE(12), .1, 2.2); },
    // a big win (20× bet or more): toll, organ and a cascade of bells; max win adds the devil
    bigWin(max = false) {
      const t = at(); if (t == null) return; duck(max ? 4 : 3);
      bell(t, NOTE(-12), .16, 3.4, .7); pad(t, [0, 3, 7, 12], 2.2, .05, "sawtooth", 2400);
      [12, 15, 19, 22, 24, 27, 31].forEach((n, i) => bell(t + .2 + i * .08, NOTE(n), .07, 1.6));
      if (max) growl(t, 1.6, .09);
    },
    // an FS symbol lands: a heavy hit and a bright bell, a step higher for each FS already in this spin
    fsLand(nth = 1) { const t = at(); if (t == null) return; const up = 2 ** ((Math.min(nth, 7) - 1) * 2 / 12); tone(t, { f: 95, f2: 32, a: .003, d: .5, vol: .55 }); bell(t, NOTE(0) * up, .2, 1.8, .6); bell(t + .03, NOTE(7) * up, .1, 1.4, .6); },
    // one free-spin symbol away (2.4 s per teasing reel): synth fallback for the designed edging music
    edge(delay = 0) {
      const t = at(delay); if (t == null) return;
      hiss(t, { f: 300, f2: 2600, q: 5, a: 2.1, d: .3, vol: .16 });
      for (let i = 0, at2 = 0; i < 6; i++, at2 += .5 * .82 ** i) tone(t + at2, { f: 85, f2: 50, a: .004, d: .16, vol: .28 });
    },
    // one free-spin symbol away: a rising, pulsing riser over the tease
    tease(delay = 0, dur = 1.5) {
      const t = at(delay); if (t == null) return;
      hiss(t, { f: 300, f2: 2600, q: 5, a: dur * .85, d: dur * .15, vol: .16 });
      for (let i = 0; i < 4; i++) tone(t + i * dur / 4, { f: 85, f2: 50, a: .004, d: .16, vol: .28 });
    },
  };

  // ---- designed sounds (tools/sound_design.py -> assets/sfx/*.mp3) replace the synth voices above once loaded;
  // until a file is decoded, or if it fails, the synthesized version plays. Pitched samples are recorded at A5 (880 Hz).
  const SFX = ["click", "spin", "land", "land_heavy", "chime", "crystal", "tumble", "charge", "burst", "clash", "wail", "toll",
    "sting", "sting_devil", "fanfare", "bigwin", "heartbeat", "crumble", "challenger", "banner", "fs_land", "edge"];
  const raw = Object.fromEntries(SFX.map(k => [k, fetch(`assets/sfx/${k}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)]));
  const buf = {};
  loadSfx = async () => { for (const k of SFX) { try { const ab = await raw[k]; if (ab) buf[k] = await ctx.decodeAudioData(ab); } catch (err) { console.warn("sfx " + k, err); } } };
  function smp(name, t, vol = 1, rate = 1) {
    const b = buf[name]; if (!b) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(seq.dry); s.start(t);
    return true;
  }
  const pitch = semi => NOTE(semi) * 2 / 880; // rate that turns the A5 recording into the synth's note
  const use = (name, delayArg, play) => {
    const synth = fx[name];
    fx[name] = (...a) => { const t = at(delayArg == null ? 0 : a[delayArg] || 0, name === "click"); if (t == null) return; if (!play(t, ...a)) synth(...a); };
  };
  use("click", null, t => smp("click", t, .45));
  use("spin", null, t => smp("spin", t, .5));
  use("land", 1, (t, c, d, heavy) => heavy ? smp("land_heavy", t, .65) : smp("land", t, .5, 1 + c * .04));
  use("charge", null, t => smp("charge", t, .45));
  use("burst", null, t => smp("burst", t, .8));
  use("win", null, (t, size = 4, tier = "obj") => {
    if (!buf.chime) return false;
    const start = { rune: 0, obj: 2, char: 4, special: 5 }[tier] ?? 2, notes = Math.min(5, 2 + Math.floor((size - 4) / 2));
    for (let i = 0; i < notes; i++) smp("chime", t + i * .085, tier === "rune" ? .22 : .32, pitch(SCALE[start + i * 2]));
    if (tier === "char") smp("toll", t, .22, 2);
    return true;
  });
  use("tumble", null, t => smp("tumble", t, .4));
  use("slam", null, t => smp("burst", t, .55, 1.15));
  use("clash", null, (t, power = 0) => smp("clash", t, .45 + power * .1, 1 - power * .05));
  use("knockout", null, t => smp("wail", t, .55, .94 + Math.random() * .12));
  use("challenger", null, (t, tier = 2) => { duck(1.6); return tier >= 3 ? smp("sting_devil", t, .6, .92) : smp("challenger", t, .6); });
  use("sting", null, (t, tier = 1) => {
    if (tier >= 3) { duck(2.4); return smp("sting_devil", t, .7); }
    if (tier === 2) { duck(1.8); return smp("sting", t, .6); }
    if (!buf.chime) return false;
    [0, 3, 7].forEach((n, i) => smp("chime", t + i * .07, .3, pitch(n)));
    return true;
  });
  use("fanfare", null, t => { duck(3.2); return smp("fanfare", t, .75); });
  use("toll", null, t => smp("toll", t, .7));
  use("rune", null, (t, step = 0) => smp("crystal", t, .32, pitch(SCALE[(step % 8) + 4])));
  use("collect", null, (t, step = 0) => smp("crystal", t, .2, pitch(SCALE[(step % 8) + 4])));
  use("crate", null, t => smp("land_heavy", t, .45) && smp("toll", t + .02, .3, 2));
  use("crumble", null, t => smp("crumble", t, .5));
  use("lifeLost", null, t => smp("heartbeat", t, .7));
  use("banner", null, t => { duck(2); return smp("banner", t, .4); });
  // the FS hit is the loudest effect; the music dips under it and each further FS in a spin lands 2 semitones higher
  // edging music under each teasing reel (the music dips from the tease itself); each further reel starts a semitone higher
  use("edge", 0, (t, d, nth = 1) => smp("edge", t, .8, 2 ** ((Math.min(nth, 5) - 1) / 12)));
  use("fsLand", null, (t, nth = 1) => { duck(1.2); return smp("fs_land", t, 1, 2 ** ((Math.min(nth, 7) - 1) * 2 / 12)); });
  use("bigWin", null, (t, max = false) => { duck(max ? 4 : 3); if (!smp("bigwin", t, .8)) return false; if (max) smp("sting_devil", t + .3, .45); return true; });

  return {
    ...fx, st, duck, cut,
    // a tap or key during the studio logo: start the audio silently, so the music can play as soon as the game shows
    unlock: wake,
    // the game is on screen: fade the music in (it starts with the next tap if the browser still blocks sound)
    release() { hold = false; if (!started) start(); else apply(1.2); },
    set(part) { Object.assign(st, part); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} apply(); },
  };
})();
LOADER.onGesture(sound.unlock);
LOADER.fading.then(sound.release);

// ---- sound panel: Music and Effects sliders plus mute, opened from the speaker in the top-right corner
const musicBtn = document.getElementById("musicBtn"), sndMenu = document.getElementById("sndMenu");
const volMusic = document.getElementById("volMusic"), volSfx = document.getElementById("volSfx"), muteAll = document.getElementById("muteAll");
function showSound() {
  const { music, sfx, muted } = sound.st;
  volMusic.value = music; volSfx.value = sfx;
  document.getElementById("outMusic").textContent = music; document.getElementById("outSfx").textContent = sfx;
  muteAll.setAttribute("aria-pressed", String(muted));
  musicBtn.classList.toggle("off", muted || (!music && !sfx));
}
function openSndMenu(open) { sndMenu.hidden = !open; musicBtn.setAttribute("aria-expanded", String(open)); if (open) volMusic.focus(); }
musicBtn.addEventListener("click", () => openSndMenu(sndMenu.hidden));
volMusic.addEventListener("input", () => { sound.set({ music: +volMusic.value, muted: false }); showSound(); });
volSfx.addEventListener("input", () => { sound.set({ sfx: +volSfx.value, muted: false }); showSound(); });
volSfx.addEventListener("change", () => sound.click()); // a sample of the new effects level
muteAll.addEventListener("click", () => { sound.set({ muted: !sound.st.muted }); showSound(); });
addEventListener("keydown", e => { if (e.key === "Escape" && !sndMenu.hidden) { openSndMenu(false); musicBtn.focus(); } });
document.addEventListener("pointerdown", e => { if (!sndMenu.hidden && !sndMenu.contains(e.target) && !musicBtn.contains(e.target)) openSndMenu(false); });
showSound();
// every button on the console and in the menus clicks (disabled buttons get no click event)
document.addEventListener("click", e => { if (e.target.closest(".hot, .buy-btn, .am-grid button, .am-foot button")) sound.click(); });

// ---------- Start: authenticate (or load a replay), apply bet levels and rules, resume an open round ----------
// a launch that cannot reach the RGS (bad rgs_url, expired session) stops here with a clear message
function showError(text) {
  document.getElementById("errText").textContent = text;
  document.getElementById("errDlg").hidden = false;
  document.getElementById("errReload").focus();
}
document.getElementById("errReload").addEventListener("click", () => location.reload());

// Replay: a panel shows bet, mode and real cost and starts the round; afterwards it offers to watch it again.
async function replayLoop(round) {
  const dlg = document.getElementById("replayDlg"), go = document.getElementById("replayGo"), info = document.getElementById("replayInfo");
  const modeName = modeInfo(round.mode)?.name || i18n("Basisspiel", "Base game");
  const line = `${modeName} · ${i18n("Einsatz", "Bet")} ${money(round.amount)}` + (round.cost > 1 ? ` · ×${num(round.cost)} · ${i18n("Echte Kosten", "Real cost")} ${money(round.amount * round.cost)}` : "");
  const bar = document.getElementById("replayBar"); bar.textContent = `${i18n("Wiederholung", "Replay")} · ${line}`; bar.hidden = false;
  say(i18n("Wiederholung", "Replay"));
  for (let first = true; ; first = false) {
    info.textContent = first ? line : `${line} · ${i18n("Gewinn", "Win")} ${money(round.amount * (round.payoutMultiplier || 0))}`;
    go.textContent = first ? i18n("Abspielen", "Play") : i18n("Nochmal ansehen", "Replay again");
    dlg.hidden = false; go.focus();
    await new Promise(res => go.addEventListener("click", res, { once: true }));
    dlg.hidden = true;
    lock(true); slam = false; // a skip in the last viewing must not carry over
    await playRound(round.state, false);
    spinBtn.disabled = true; // [171] Spin only skips while the replay plays; afterwards no betting control is usable
    say(i18n("Wiederholung beendet", "Replay finished"));
  }
}

async function boot() {
  lock(true);
  say(i18n("Lädt…", "Loading…"));
  let s;
  try { s = await RGS.init(); } catch (err) { console.error(err); say(RGS.errorText(err)); showError(RGS.errorText(err)); LOADER.ready(); return; }
  LOADER.ready();
  try {
    balance = s.balance; BETS = s.betLevels;
    betIdx = Math.max(0, BETS.indexOf(s.defaultBet));
    if (s.jurisdiction.disabledAutoplay) autoBtn.hidden = true;
    if (s.jurisdiction.disabledTurbo) { turbo = false; turboBtn.hidden = true; }
    if (s.jurisdiction.disabledBuyFeature) buyBtn.hidden = true;
    if (s.jurisdiction.socialCasino && !RGS.social) {
      const u = new URL(location.href); u.searchParams.set("social", "true"); location.replace(u); return;
    }
    loading = false;
    updateBal(); updateBet(); setWin(0);
    await introDone; // an interrupted round resumes only once the player has seen the intro
    if (RGS.replay) return await replayLoop(s.round);
    if (s.round) {
      // [187] the open round's stake stays selected afterwards, even if it is not one of today's bet levels
      if (s.round.amount) { if (!BETS.includes(s.round.amount)) BETS = [...BETS, s.round.amount].sort((a, b) => a - b); betIdx = BETS.indexOf(s.round.amount); bet = s.round.amount; }
      lock(true);
      await runRound(s.round, true);
    } else say(i18n("Drück auf Spin", "Press Spin"));
    lock(false);
  } catch (err) {
    console.error(err); say(RGS.errorText(err));
  }
}

// ===== Lich King hero: the hand-drawn idle as an animated WebP (assets/lich-idle.webp): the 24 drawn frames plus an
// in-between for each pair and 8 frames morphing the last one back into the first, so it loops forwards at 24 fps.
// The browser plays it; reactions to the game (point, cheer, laugh, gasp) lean, bounce, shake and light up the figure.
// Reduced motion shows the still first frame (assets/lich-still.webp). =====
function GhostKing(host) {
  host.style.aspectRatio = "870 / 1010";
  const fig = div("hero-fig"), lamp = div("hero-lamp"), img = new Image();
  img.className = "hero-img"; img.alt = ""; img.decoding = "async";
  fig.append(lamp, img); host.replaceChildren(fig);
  const POSES = {
    idle:  { tilt: 0, lean: 0, shake: 0, glow: 0, bounce: 0, lift: 0 },
    point: { tilt: -1.5, lean: -1, shake: 0, glow: .6, bounce: 0, lift: .4 },
    cheer: { tilt: 2.5, lean: .5, shake: 0, glow: 1, bounce: 1, lift: 1 },
    laugh: { tilt: 2, lean: .6, shake: 1, glow: 1, bounce: .4, lift: .5 },
    gasp:  { tilt: 3.5, lean: 1.4, shake: .25, glow: 1.4, bounce: .3, lift: .7 }
  };
  let cur = { ...POSES.idle }, target = POSES.idle, until = 0, lastT = 0, raf = 0;
  // the figure is only moved while a reaction plays or eases back; the idle itself is the animation
  function frame(now) {
    const t = now / 1000, dt = Math.min(.05, t - lastT || .016); lastT = t;
    if (now > until && target !== POSES.idle) target = POSES.idle;
    const k = 1 - Math.pow(.0012, dt);
    let rest = true;
    for (const key in cur) { cur[key] += (target[key] - cur[key]) * k; if (Math.abs(cur[key] - target[key]) > .002) rest = false; }
    const c = cur, shake = Math.sin(t * 34) * c.shake, bounce = -Math.abs(Math.sin(t * 6.5)) * 1.4 * c.bounce;
    fig.style.transform = `translate(${(shake * .45).toFixed(3)}%, ${bounce.toFixed(3)}%) rotate(${(c.tilt + c.lean * 1.5 + shake * 1.2).toFixed(3)}deg) scale(${(1 + c.lift * .025).toFixed(4)})`;
    img.style.filter = c.glow > .01 ? `brightness(${(1 + c.glow * .22).toFixed(3)}) saturate(${(1 + c.glow * .15).toFixed(3)})` : "";
    lamp.style.opacity = (1 + c.glow * .8).toFixed(3);
    raf = rest && target === POSES.idle ? 0 : requestAnimationFrame(frame);
  }
  return {
    start() { img.src = "assets/lich-idle.webp"; },
    stop() { img.src = "assets/lich-still.webp"; },
    still() { img.src = "assets/lich-still.webp"; },
    react(name, ms = 1400) {
      if (!POSES[name]) return;
      target = POSES[name]; until = performance.now() + ms;
      if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
    }
  };
}
const hero = GhostKing(document.getElementById("hero"));
if (RM) hero.still(); else hero.start();

// ---------- Living background ----------
// Everything that moves behind the reels is painted into ONE canvas by one renderer: fog, the painted smoke,
// torch fire and smoke, smoke over the table, glowing runes, gems, halos, light rays, pillar glows and mists.
// It runs in a Web Worker on an OffscreenCanvas where supported, so the reels never wait for it.
const GLOWS = {"runesP": {"x": 4.00390625, "y": 35.13986013986014, "w": 10.83984375, "h": 37.23776223776224, "src": "assets/glow_runesP.webp"}, "runesB": {"x": -1.3671875, "y": 67.48251748251748, "w": 9.5703125, "h": 25.874125874125873, "src": "assets/glow_runesB.webp"}, "runeBtn": {"x": 13.28125, "y": 88.46153846153845, "w": 5.859375, "h": 11.888111888111888, "src": "assets/glow_runeBtn.webp"}, "gemTop": {"x": 46.2890625, "y": 12.937062937062937, "w": 7.421875, "h": 13.286713286713287, "src": "assets/glow_gemTop.webp"}, "gemRed": {"x": 21.38671875, "y": 10.314685314685315, "w": 7.03125, "h": 13.461538461538462, "src": "assets/glow_gemRed.webp"}, "gemGreen": {"x": 71.6796875, "y": 10.314685314685315, "w": 7.2265625, "h": 13.461538461538462, "src": "assets/glow_gemGreen.webp"}, "bldGem": {"x": 85.3515625, "y": 31.293706293706293, "w": 6.54296875, "h": 13.461538461538462, "src": "assets/glow_bldGem.webp"}, "torchL": {"x": 18.359375, "y": 45.97902097902098, "w": 10.546875, "h": 19.755244755244757, "src": "assets/glow_torchL.webp", "cx": 242, "cy": 332}, "torchR": {"x": 70.60546875, "y": 45.97902097902098, "w": 10.546875, "h": 19.755244755244757, "src": "assets/glow_torchR.webp", "cx": 777, "cy": 332}};
(() => {
  const canvasEl = document.getElementById("amb");
  const RENDERER = function () {
    let C, X, k = 1, CW = 0, CH = 0, B = {}, G = {}, fogC, fx2, maskC, mx, FW = 0, FH = 0, maskReady = false, tmp, tx;
    let smoke = [], fire = [], table = [], last = 0, frameNo = 0, acc = { s: 0, f: 0, t: 0 };
    const mk = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
    const sprite = (stops, n = 64) => { const c = mk(n, n), x = c.getContext("2d"), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, n, n); return c; };
    const S = {};
    const TORCHES = [[242, 333], [777, 333]];
    const SMOKE_REG = [[262, 0, 775, 92], [180, 60, 262, 320], [762, 60, 850, 320]];
    const env = life => Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - life)));
    const wave = (sec, period, delay = 0) => .5 - .5 * Math.cos(2 * Math.PI * ((sec + delay) / period)); // 0..1..0
    const G_KIND = { torchL: "torch", torchR: "torch", gemTop: "gem", gemRed: "gem", gemGreen: "gem", bldGem: "gem", runesP: "rune", runesB: "rune", runeBtn: "runeglow" };
    const HALOS = [[253, 97, 34, 34, "r", 0], [770, 97, 34, 34, "g", 1.4], [511, 112, 40, 40, "g", .7], [906, 217, 26, 34, "g", 2.1], [257, 155, 20, 62, "g", 1.1], [771, 155, 20, 62, "g", 2.6]];
    const PGLOWS = [[102, 305, 130, 220, 0, 6.5, 1], [32, 462, 100, 140, 2.5, 6.5, 1], [905, 318, 120, 210, 1.2, 8, .7], [140, 120, 120, 110, 3.6, 8, .7]];
    const RAYS = [[511, 112, 150, "g", 40], [253, 97, 80, "r", 55], [770, 97, 80, "g", 50]];
    const MISTS = [[-12, 55, 48, 40, 26, 0], [66, 30, 46, 42, 32, 1], [18, -14, 64, 30, 22, 0], [0, 80, 100, 30, 18, 0, .7]];
    function resize(cssW, cssH, dpr) {
      CW = Math.max(2, Math.round(Math.min(1024, cssW * Math.min(dpr, 2)) * .75)); CH = Math.max(2, Math.round(CW * 572 / 1024));
      C.width = CW; C.height = CH; k = CW / 1024;
      FW = Math.round(CW / 2); FH = Math.round(CH / 2);
      fogC = mk(FW, FH); fx2 = fogC.getContext("2d"); maskC = mk(FW, FH); mx = maskC.getContext("2d"); maskReady = false;
    }
    function buildMask() {
      mx.clearRect(0, 0, FW, FH); mx.globalCompositeOperation = "source-over"; mx.drawImage(B.fogM, 0, 0, FW, FH);
      mx.globalCompositeOperation = "lighter";
      const cx = FW * .4996, cy = FH * .5083, rx = FW * .2159, ry = FH * .2893;
      mx.save(); mx.translate(cx, cy); mx.scale(1, ry / rx);
      let g = mx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, "rgba(0,0,0,.42)"); g.addColorStop(.7, "rgba(0,0,0,.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
      mx.fillStyle = g; mx.beginPath(); mx.arc(0, 0, rx, 0, Math.PI * 2); mx.fill(); mx.restore();
      for (const [x0, x1] of [[0, .3], [.7, 1]]) {
        g = mx.createLinearGradient(0, FH * .55, 0, FH); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.6, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,.35)");
        mx.fillStyle = g; mx.fillRect(FW * x0, FH * .55, FW * (x1 - x0), FH * .45);
      }
      maskReady = true;
    }
    const FOG = [{ img: "fogB", t: .5, a: .45, vx: 1 / 80, pulse: 11 }, { img: "fogA", t: .36, a: .55, vx: -1 / 55, pulse: 0 }, { img: "fogA", t: .27, a: .35, vx: 1 / 36, pulse: 15, vy: .02 }];
    function drawFog(sec) {
      if (!maskReady) buildMask();
      fx2.globalCompositeOperation = "source-over"; fx2.clearRect(0, 0, FW, FH);
      for (const L of FOG) {
        const T = L.t * FW, ox = ((sec * L.vx * T) % T + T) % T, oy = L.vy ? Math.sin(sec / L.pulse * Math.PI) * FH * L.vy : 0;
        fx2.globalAlpha = L.pulse && !L.vy ? L.a * (.65 + .35 * Math.sin(sec / L.pulse * Math.PI)) : L.a;
        for (let x = ox - T; x < FW; x += T) for (let y = ((oy % T) + T) % T - T; y < FH; y += T) fx2.drawImage(B[L.img], x, y, T + .5, T + .5);
      }
      fx2.globalAlpha = 1; fx2.globalCompositeOperation = "destination-in"; fx2.drawImage(maskC, 0, 0);
    }
    // the smoke is drawn into its own buffer (box 180..850 x 0..320 in background pixels) and then cut to the
    // area where smoke is painted, so the swaying strips never slide over the stone frame
    let sbuf, sx, SBW = 0, SBH = 0;
    function drawPaintedSmoke(sec) {
      const bw = Math.round(670 * k), bh = Math.round(320 * k);
      if (!sbuf || SBW !== bw || SBH !== bh) { SBW = bw; SBH = bh; sbuf = mk(bw, bh); sx = sbuf.getContext("2d"); }
      const D = 16, period = 5.5, ox = 180, Y = X;
      sx.globalCompositeOperation = "source-over"; sx.clearRect(0, 0, bw, bh);
      for (let pass = 0; pass < 2; pass++) {
        const ph = ((sec / period) + pass * .5) % 1, wgt = 1 - Math.abs(1 - 2 * ph), dy = D / 2 - ph * D;
        sx.globalAlpha = wgt * (.88 + .12 * Math.sin(sec * .7 + pass));
        for (const [x0, y0, x1, y1] of SMOKE_REG) {
          const w = x1 - x0, step = 5;
          for (let y = y0; y < y1; y += step) {
            const rise = 1 - (y - y0) / (y1 - y0 + 1);
            const dx = Math.sin(y * .055 - sec * 1.25 + x0) * (1.5 + 3 * rise) + Math.sin(y * .13 + sec * 1.9) * 1.1;
            sx.drawImage(B.smoke, x0, y, w, step, (x0 - ox + dx) * k, (y + dy) * k, w * k, step * k + .6);
          }
        }
      }
      sx.globalAlpha = 1; sx.globalCompositeOperation = "destination-in"; sx.drawImage(B.allow, 0, 0, bw, bh);
      Y.drawImage(sbuf, ox * k, 0);
    }
    // draw a sprite centred at (x,y) in background pixels, size w x h, with alpha and scale
    const blob = (img, x, y, w, h, a, sc = 1) => { if (a <= 0) return; X.globalAlpha = Math.min(1, a); X.drawImage(img, (x - w * sc / 2) * k, (y - h * sc / 2) * k, w * sc * k, h * sc * k); };
    function drawGlows(sec) {
      for (const [name, gl] of Object.entries(G)) {
        const kind = G_KIND[name], img = gl.img, x = gl.x * 10.24, y = gl.y * 5.72, w = gl.w * 10.24, h = gl.h * 5.72;
        if (kind === "torch") {
          const a = .78 + .22 * wave(sec, 2.6, gl.d), sx = 1 + .015 * Math.sin(sec * 2.1 + gl.d), sy = 1 + .035 * Math.sin(sec * 2.1 + gl.d);
          X.globalAlpha = a * .5; X.drawImage(img, (x + w * (1 - sx) / 2) * k, (y + h * .8 * (1 - sy)) * k, w * sx * k, h * sy * k);
        } else if (kind === "gem" || kind === "runeglow") {
          X.globalAlpha = (.3 + .55 * wave(sec, kind === "gem" ? 4 : 4.6, gl.d)) * .5; X.drawImage(img, x * k, y * k, w * k, h * k);
        } else if (kind === "rune") {
          // a soft band of light travels down the runes, then pauses
          const cyc = ((sec + gl.d) % 5.5) / 5.5, pos = cyc < .7 ? cyc / .7 : 2; // 0..1 top->bottom
          const iw = img.width, ih = img.height, strips = 28;
          for (let i = 0; i < strips; i++) {
            const f = (i + .5) / strips, d = Math.abs(f - (pos * 1.3 - .15)), a = Math.max(0, 1 - d / .16);
            if (a <= 0) continue;
            X.globalAlpha = a * .9;
            X.drawImage(img, 0, ih * i / strips, iw, ih / strips + 1, x * k, (y + h * i / strips) * k, w * k, (h / strips + .5) * k);
          }
        }
      }
      X.globalAlpha = 1;
    }
    function frame(t) {
      const dt = Math.min(.05, (t - last) / 1000); last = t; if (!dt || !CW) return;
      const sec = t / 1000;
      X.globalCompositeOperation = "source-over"; X.clearRect(0, 0, CW, CH);
      // mists and fog
      for (const [lx, ty, w, h, dur, rev, op = 1] of MISTS) {
        const p = wave(sec, dur * 2, rev ? dur : 0), drift = (-6 + 14 * p) / 100 * w, sc = 1 + .12 * p;
        blob(S.mist, (lx + w / 2 + drift) * 10.24, (ty + h / 2) * 5.72, w * 10.24, h * 5.72, (.6 + .4 * Math.sin(Math.PI * p)) * op, sc);
      }
      if ((frameNo = (frameNo + 1) % 2) === 0) drawFog(sec);
      X.globalAlpha = .9; X.drawImage(fogC, 0, 0, CW, CH); X.globalAlpha = 1;
      drawPaintedSmoke(sec);
      // breathing glows, halos, torch light
      for (const [x, y, w, h, d, per, op] of PGLOWS) { const p = wave(sec, per, d); blob(S.pglow, x, y, w, h, (.35 + .65 * p) * op, .94 + .11 * p); }
      for (const [x, y, w, h, c, d] of HALOS) { const p = wave(sec, 4, d); blob(c === "r" ? S.haloR : S.haloG, x, y, w, h, .35 + .6 * p, .88 + .24 * p); }
      for (const [tx0, ty0] of TORCHES) { const p = wave(sec, 3.4, tx0 / 300); blob(S.torch, tx0, ty0, 180, 180, .35 + .2 * p, .95 + .11 * p); }
      // light rays
      for (const [x, y, size, c, dur] of RAYS) {
        X.save(); X.globalAlpha = .3 + .3 * wave(sec, 5, x / 100); X.translate(x * k, y * k); X.rotate((sec / dur) * Math.PI * 2);
        const sz = size * k; X.drawImage(c === "r" ? S.raysR : S.raysG, -sz / 2, -sz / 2, sz, sz); X.restore();
      }
      drawGlows(sec);
      // particles
      acc.s += dt * 1.6; acc.f += dt * 70; acc.t += dt * 1.5;
      while (acc.s >= 1) { acc.s--; for (const [tx0] of TORCHES) smoke.push({ x: tx0 + (Math.random() - .5) * 8, y: 300, vx: (Math.random() - .5) * 4, vy: -(13 + Math.random() * 7), r: 15 + Math.random() * 6, life: 1, ttl: 3.6 + Math.random(), wob: Math.random() * 6, side: tx0 < 500 ? -1 : 1 }); }
      while (acc.f >= 1) { acc.f--; const [tx0, ty0] = TORCHES[fire.length % 2]; fire.push({ x: tx0 + (Math.random() - .5) * 13, y: ty0 + Math.random() * 3, vx: (Math.random() - .5) * 8, vy: -(38 + Math.random() * 34), r: 5 + Math.random() * 4.5, life: 1, ttl: .45 + Math.random() * .35, wob: Math.random() * 6 }); }
      while (acc.t >= 1) { acc.t--; table.push({ x: 300 + Math.random() * 430, y: 84 + Math.random() * 10, vx: (Math.random() - .5) * 5, vy: -(8 + Math.random() * 6), r: 22 + Math.random() * 14, life: 1, ttl: 6 + Math.random() * 2, wob: Math.random() * 6 }); }
      smoke = smoke.filter(p => p.life > 0);
      for (const p of smoke) {
        p.wob += dt * .9; p.x += (p.vx + Math.sin(p.wob) * 6 + p.side * 3 * (1 - p.life)) * dt; p.y += p.vy * dt; p.r += 7 * dt; p.life -= dt / p.ttl;
        X.globalAlpha = env(p.life) * .085; X.drawImage(S.smoke, (p.x - p.r) * k, (p.y - p.r) * k, p.r * 2 * k, p.r * 2 * k);
      }
      table = table.filter(p => p.life > 0);
      for (const p of table) {
        p.wob += dt * .6; p.x += (p.vx + Math.sin(p.wob) * 5) * dt; p.y += p.vy * dt; p.r += 6 * dt; p.life -= dt / p.ttl;
        X.globalAlpha = env(p.life) * .075; X.drawImage(S.table, (p.x - p.r) * k, (p.y - p.r * 1.3) * k, p.r * 2 * k, p.r * 2.6 * k);
      }
      X.globalCompositeOperation = "lighter";
      fire = fire.filter(p => p.life > 0);
      for (const p of fire) {
        p.wob += dt * 9; p.x += (p.vx + Math.sin(p.wob) * 10) * dt; p.y += p.vy * dt; p.life -= dt / p.ttl;
        const rr = p.r * (.45 + .55 * p.life);
        X.globalAlpha = env(p.life) * .55; X.drawImage(S.fire, (p.x - rr) * k, (p.y - rr * 1.7) * k, rr * 2 * k, rr * 3.4 * k);
      }
      X.globalAlpha = 1; X.globalCompositeOperation = "source-over";
    }
    function raysSprite(rgb) {
      const n = 256, c = mk(n, n), x = c.getContext("2d");
      x.translate(n / 2, n / 2);
      for (let i = 0; i < 16; i++) { x.rotate(Math.PI * 2 / 16); const g = x.createLinearGradient(0, 0, n / 2, 0); g.addColorStop(0, `rgba(${rgb},.9)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(n / 2, -n * .022); x.lineTo(n / 2, n * .022); x.closePath(); x.fill(); }
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "destination-in";
      const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(.45, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, n, n); return c;
    }
    return {
      init(canvas, bitmaps, glows, cssW, cssH, dpr) {
        C = canvas; X = C.getContext("2d"); B = bitmaps;
        G = {}; for (const [name, g] of Object.entries(glows)) G[name] = { ...g, img: bitmaps["gl_" + name], d: Math.random() * 4 };
        S.smoke = sprite([[0, "rgba(150,215,185,1)"], [.6, "rgba(90,150,130,.5)"], [1, "rgba(60,110,95,0)"]]);
        S.table = sprite([[0, "rgba(130,255,190,1)"], [.55, "rgba(90,230,160,.45)"], [1, "rgba(60,200,140,0)"]]);
        S.fire = sprite([[0, "rgba(235,255,240,1)"], [.25, "rgba(150,255,190,.85)"], [.6, "rgba(60,230,130,.35)"], [1, "rgba(40,200,110,0)"]]);
        S.mist = sprite([[0, "rgba(120,255,190,.22)"], [.6, "rgba(90,230,170,.08)"], [1, "rgba(90,230,170,0)"]], 128);
        S.pglow = sprite([[0, "rgba(90,255,150,.32)"], [.6, "rgba(90,255,150,.1)"], [1, "rgba(90,255,150,0)"]], 128);
        S.haloG = sprite([[0, "rgba(90,255,150,.55)"], [.55, "rgba(90,255,150,.18)"], [1, "rgba(90,255,150,0)"]]);
        S.haloR = sprite([[0, "rgba(255,70,110,.55)"], [.55, "rgba(255,70,110,.18)"], [1, "rgba(255,70,110,0)"]]);
        S.torch = sprite([[0, "rgba(120,255,180,.32)"], [.55, "rgba(80,255,160,.12)"], [1, "rgba(80,255,160,0)"]], 128);
        S.raysG = raysSprite("90,255,150"); S.raysR = raysSprite("255,70,110");
        resize(cssW, cssH, dpr);
      },
      resize, frame
    };
  };
  const loadBitmap = src => new Promise(res => { const im = new Image(); im.onload = () => (window.createImageBitmap ? createImageBitmap(im).then(res, () => res(im)) : res(im)); im.onerror = () => res(null); im.src = src; });
  const names = ["fogA", "fogB", "fogM", "smoke", "allow"].concat(Object.keys(GLOWS).map(n => "gl_" + n));
  const srcs = ["assets/img35.webp", "assets/img36.webp", "assets/img37.webp", "assets/img38.webp", "assets/img39.webp"].concat(Object.values(GLOWS).map(g => g.src));
  const glowMeta = {}; for (const [n, g] of Object.entries(GLOWS)) glowMeta[n] = { x: g.x, y: g.y, w: g.w, h: g.h };
  Promise.all(srcs.map(loadBitmap)).then(list => {
    if (list.some(x => !x)) return;
    const bitmaps = {}; names.forEach((n, i) => bitmaps[n] = list[i]);
    const r0 = () => game.getBoundingClientRect();
    try {
      if (canvasEl.transferControlToOffscreen && window.Worker && window.createImageBitmap && typeof OffscreenCanvas !== "undefined") {
        const code = "const R = (" + RENDERER.toString() + ")();" +
          "const raf = self.requestAnimationFrame ? f => self.requestAnimationFrame(f) : f => setTimeout(() => f(performance.now()), 16);" +
          "let run = true, still = false; function loop(t) { if (run) R.frame(t); if (!still) raf(loop); }" +
          "self.onmessage = e => { const m = e.data; if (m.type === 'init') { R.init(m.canvas, m.bitmaps, m.glows, m.w, m.h, m.dpr); if (m.still) { still = true; R.frame(1000); R.frame(1016); } else raf(loop); } else if (m.type === 'resize') { R.resize(m.w, m.h, m.dpr); if (still) { R.frame(2000); R.frame(2016); } } else if (m.type === 'vis') run = !m.hidden; };";
        const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
        const off = canvasEl.transferControlToOffscreen(), r = r0();
        worker.postMessage({ type: "init", canvas: off, bitmaps, glows: glowMeta, w: r.width, h: r.height, dpr: devicePixelRatio || 1, still: RM }, [off].concat(list.filter(x => x instanceof ImageBitmap)));
        addEventListener("resize", () => { const r2 = r0(); worker.postMessage({ type: "resize", w: r2.width, h: r2.height, dpr: devicePixelRatio || 1 }); });
        document.addEventListener("visibilitychange", () => worker.postMessage({ type: "vis", hidden: document.hidden }));
        return;
      }
    } catch (e) {}
    const R = RENDERER(), r = r0();
    R.init(canvasEl, bitmaps, glowMeta, r.width, r.height, devicePixelRatio || 1);
    addEventListener("resize", () => { const r2 = r0(); R.resize(r2.width, r2.height, devicePixelRatio || 1); if (RM) { R.frame(2000); R.frame(2016); } });
    if (RM) { R.frame(1000); R.frame(1016); return; }
    (function loop(t) { if (!document.hidden) R.frame(t); requestAnimationFrame(loop); })(performance.now());
  });
})();

// ---------- Foreground cave particles: dust, glowing spores, trickling dust, soft bokeh ----------
// Drawn at reduced resolution in a Web Worker (OffscreenCanvas) when available, so the reels never wait for it.
const MOTES = function () {
  let C, ctx, W = 0, H = 0, k = 1, last = 0, gritT = 2, S = {};
  const P = [], rnd = (a, b) => a + Math.random() * (b - a), env = u => Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  const mk = n => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(n, n) : Object.assign(document.createElement("canvas"), { width: n, height: n }));
  const spr = (stops, n) => { const c = mk(n), x = c.getContext("2d"), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, n, n); return c; };
  function spawn(type, initial) {
    const p = { type, age: 0, wob: rnd(0, 6.28), wobS: rnd(.3, .9) };
    if (type === "dust") Object.assign(p, { x: rnd(0, 1024), y: rnd(0, 572), vx: rnd(-9, 9), vy: rnd(-8, 3), r: rnd(2.4, 4.4), ttl: rnd(7, 13), a: 1 });
    else if (type === "spore") Object.assign(p, { x: rnd(0, 1024), y: rnd(220, 600), vx: rnd(-6, 6), vy: rnd(-18, -8), r: rnd(5, 9.5), ttl: rnd(8, 14), a: 1, pulse: rnd(.8, 1.6), purple: Math.random() < .22 });
    else if (type === "bokeh") { const left = Math.random() < .5; Object.assign(p, { x: left ? rnd(-40, 240) : rnd(780, 1060), y: rnd(40, 560), vx: rnd(-4, 4), vy: rnd(-6, -2), r: rnd(30, 56), ttl: rnd(12, 20), a: rnd(.4, .55) }); }
    else Object.assign(p, { x: rnd(240, 790), y: rnd(0, 30), vx: rnd(-2, 2), vy: rnd(32, 58), r: rnd(1.8, 3.2), ttl: rnd(4, 7), a: 1 });
    if (initial) p.age = rnd(0, p.ttl);
    P.push(p); return p;
  }
  const TARGET = { dust: 75, spore: 34, bokeh: 5 };
  return {
    init(canvas, w, h) {
      C = canvas; ctx = C.getContext("2d");
      S.dust = spr([[0, "rgba(255,255,250,1)"], [.3, "rgba(230,245,235,.9)"], [.6, "rgba(200,230,215,.3)"], [1, "rgba(200,220,210,0)"]], 32);
      S.spore = spr([[0, "rgba(255,255,255,1)"], [.18, "rgba(190,255,215,1)"], [.45, "rgba(80,250,150,.55)"], [1, "rgba(60,230,130,0)"]], 64);
      S.purple = spr([[0, "rgba(255,245,255,1)"], [.2, "rgba(225,160,255,1)"], [.5, "rgba(180,95,245,.5)"], [1, "rgba(160,80,230,0)"]], 64);
      S.bokeh = spr([[0, "rgba(180,255,215,.75)"], [.55, "rgba(130,245,185,.4)"], [.8, "rgba(110,230,170,.15)"], [1, "rgba(100,220,160,0)"]], 128);
      S.grit = spr([[0, "rgba(205,215,200,1)"], [.5, "rgba(180,190,180,.45)"], [1, "rgba(160,170,160,0)"]], 16);
      this.resize(w, h);
      for (const [t, n] of Object.entries(TARGET)) for (let i = 0; i < n; i++) spawn(t, true);
    },
    resize(w, h) { W = Math.max(2, Math.round(Math.min(760, w))); H = Math.max(2, Math.round(W * h / w)); C.width = W; C.height = H; k = W / 1024; },
    frame(now) {
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      gritT -= dt; if (gritT <= 0) { gritT = rnd(3, 7); const x0 = rnd(260, 770); for (let i = 0; i < 8; i++) { const p = spawn("grit"); p.x = x0 + rnd(-8, 8); p.age = -i * .08; } }
      ctx.clearRect(0, 0, W, H);
      const count = { dust: 0, spore: 0, bokeh: 0 };
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.age += dt;
        if (p.age > p.ttl) { P.splice(i, 1); continue; }
        if (p.age < 0) continue;
        if (count[p.type] !== undefined) count[p.type]++;
        p.wob += dt * p.wobS;
        p.x += (p.vx + Math.sin(p.wob) * 6) * dt; p.y += (p.vy + Math.cos(p.wob * .7) * 3) * dt;
        let a = p.a * (p.type === "grit" ? Math.min(1, (p.ttl - p.age) * 2) * Math.min(1, p.age * 4) : Math.min(1, env(p.age / p.ttl) * 1.6)), r = p.r;
        if (p.type === "spore") { const pl = .85 + .15 * Math.sin(p.age * p.pulse * 2.2 + p.wob); a *= pl; r *= .92 + .12 * pl; }
        // keep the reels and the console readable: particles are softer there
        if (p.y > 468) a *= .3; else if (p.x > 285 && p.x < 740 && p.y > 120) a *= .45;
        const img = p.type === "spore" ? (p.purple ? S.purple : S.spore) : S[p.type], R = r * (p.type === "dust" || p.type === "grit" ? 2.4 : 3) * k;
        ctx.globalCompositeOperation = p.type === "bokeh" ? "screen" : "lighter";
        ctx.globalAlpha = a; ctx.drawImage(img, p.x * k - R, p.y * k - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      for (const [t, n] of Object.entries(TARGET)) for (let i = count[t]; i < n; i++) spawn(t);
    }
  };
};
(() => {
  if (RM) return;
  const cv = document.getElementById("motes"), r0 = () => game.getBoundingClientRect();
  try {
    if (cv.transferControlToOffscreen && window.Worker && typeof OffscreenCanvas !== "undefined") {
      const code = "const R = (" + MOTES.toString() + ")();" +
        "const raf = self.requestAnimationFrame ? f => self.requestAnimationFrame(f) : f => setTimeout(() => f(performance.now()), 16);" +
        "let run = true, odd = false; function loop(t) { odd = !odd; if (run && odd) R.frame(t); raf(loop); }" +
        "self.onmessage = e => { const m = e.data; if (m.type === 'init') { R.init(m.canvas, m.w, m.h); raf(loop); } else if (m.type === 'resize') R.resize(m.w, m.h); else if (m.type === 'vis') run = !m.hidden; };";
      const wk = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
      const off = cv.transferControlToOffscreen(), r = r0();
      wk.postMessage({ type: "init", canvas: off, w: r.width, h: r.height }, [off]);
      addEventListener("resize", () => { const r2 = r0(); wk.postMessage({ type: "resize", w: r2.width, h: r2.height }); });
      document.addEventListener("visibilitychange", () => wk.postMessage({ type: "vis", hidden: document.hidden }));
      return;
    }
  } catch (e) {}
  const R = MOTES(), r = r0(); R.init(cv, r.width, r.height);
  addEventListener("resize", () => { const r2 = r0(); R.resize(r2.width, r2.height); });
  (function loop(t) { if (!document.hidden) R.frame(t); requestAnimationFrame(loop); })(performance.now());
})();

// ---------- Paytable ----------
// paytable symbols only animate while the table is on screen
try {
  const io = new IntersectionObserver(es => es.forEach(e => document.getElementById("paytable").classList.toggle("offscreen", !e.isIntersecting)));
  setTimeout(() => io.observe(document.getElementById("paytable")), 0);
} catch (e) {}
const pt = document.getElementById("paytable");
function stagelet(id) {
  const s = div("stagelet"), sym = makeSym(id); s.appendChild(sym);
  s.tabIndex = 0; s.setAttribute("role", "button"); s.setAttribute("aria-label", SYM[id].name + i18n(" Animation abspielen", ": play animation"));
  const go = () => animWin(sym); s.addEventListener("click", go); s.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  return s;
}
function paysDL(pay) {
  const dl = document.createElement("dl"); dl.className = "pays";
  ["4", "5", "6", "7", "8", "9+"].forEach((l, i) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = l; dd.dataset.x = pay[i]; dd.textContent = money(pay[i] * bet); dl.append(dt, dd); });
  return dl;
}
function tier(title, note, cls) {
  const t = div("tier " + cls), h = div("tier-head"), h3 = document.createElement("h3"), sp = document.createElement("span");
  h3.textContent = title; sp.textContent = note; h.append(h3, sp);
  const cards = div("cards"); t.append(h, cards); pt.appendChild(t); return cards;
}
function card(id) { const c = div("card"), b = document.createElement("b"); b.textContent = SYM[id].name; c.append(stagelet(id), b, paysDL(SYM[id].pay)); return c; }
const tc = tier(i18n("Charaktere", "Characters"), i18n("höchste Gewinne", "highest wins"), "t-high"); CHARS.forEach(id => tc.appendChild(card(id)));
const to = tier(i18n("Objekte", "Objects"), i18n("mittlere Gewinne", "medium wins"), ""); ["book", "ring", "key", "lantern", "potion"].forEach(id => to.appendChild(card(id)));
const tr = tier(i18n("Runen", "Runes"), i18n("niedrige Gewinne, kommen am häufigsten", "low wins, most frequent"), "");
const rc = div("card rune-card"), row = div("rune-row"), rb = document.createElement("b");
["rune_green", "rune_blue", "rune_purple", "rune_fire", "rune_pink"].forEach(id => row.appendChild(stagelet(id)));
rb.textContent = i18n("Alle 5 Runen", "All 5 runes"); rc.append(row, rb, paysDL(SYM.rune_green.pay)); tr.appendChild(rc);
const sp = div("tier"), sh = div("tier-head"), sh3 = document.createElement("h3"); sh3.textContent = i18n("Spezialsymbole", "Special symbols"); sh.appendChild(sh3);
const spc = div("special");
[["vs", i18n("VS-Duell", "VS Duel"), i18n("Füllt eine ganze Walze und ist wild. Sie zählt, wenn mindestens 4 echte gleiche Symbole über sie verbunden sind oder 4 VS-Walzen nebeneinander liegen. Dann kämpfen zwei Geister um ×2 bis ×10. Selten fordert der Pirat den Sieger heraus (×20 bis ×100), extrem selten greift der Teufel ein (×150 bis ×1.000). Mehrere VS-Walzen addieren ihre Multiplikatoren.", "Fills a whole reel and is wild. It counts when at least 4 real matching symbols connect through it, or when 4 VS reels lie side by side. Then two ghosts fight for ×2 to ×10. Rarely the pirate challenges the winner (×20 to ×100), extremely rarely the devil steps in (×150 to ×1,000). Several VS reels add their multipliers.")],
 ["fs", i18n("Freispiele", "Free Spins"), i18n("Höchstens ein FS pro Walze. 3 bis 7 FS werden zu Geisterkisten mit Charakter und Multiplikator. In langsamen Spins fallen Runen im Wert von 1 bis 10 × Einsatz (meist 1–2) und selten neue Kisten. Runen und Kisten, die sich berühren, bilden eine Gruppe, auch über Kisten hinweg. Hat eine Gruppe mindestens 4 Runen und eine Kiste, wird die Summe ihrer Runen mit jedem Kisten-Multiplikator der Gruppe nacheinander multipliziert (z. B. 4 Runen à 3 an ×2 und ×3: 12 × 2 × 3 = 72). Alle anderen Runen zerfallen am Ende. 3 Leben: Jeder Spin ohne Treffer kostet eins, jeder Treffer füllt sie wieder auf.", "At most one FS per reel. 3 to 7 FS turn into Ghost Crates with a character and a multiplier. In slow spins, runes worth 1 to 10 × bet (mostly 1–2) land, and rarely new crates. Runes and crates that touch form a group, also across crates. If a group has at least 4 runes and a crate, the sum of its runes is multiplied by every crate multiplier in the group in turn (e.g. 4 runes worth 3 at ×2 and ×3: 12 × 2 × 3 = 72). All other runes crumble at the end. 3 lives: every spin without a hit costs one, every hit refills them.")]]
  .forEach(([id, t, p]) => { const c = div("card"), tx = div(), b = document.createElement("b"), pp = document.createElement("p"); b.textContent = t; pp.textContent = p; tx.append(b, pp); c.append(stagelet(id), tx); spc.appendChild(c); });
sp.append(sh, spc); pt.appendChild(sp);
// pay values follow the current bet and currency
function refreshPays() { qa(pt, "dd[data-x]").forEach(d => d.textContent = money(d.dataset.x * bet)); }

q(document, "#paytable .hint").textContent = i18n("Gewinne für den aktuellen Einsatz, je nach Größe der Gruppe. Tippe auf ein Symbol, um seine Gewinn-Animation zu sehen.",
  "Wins for the current bet, by group size. Tap a symbol to see its win animation.");

// ---------- Game rules (Info button) ----------
// RTP and max win per mode, from the published lookup tables (math-sdk library/stats_base.json and stats_bonus.json).
// Update these after rerunning run.py.
const MODE_INFO = [{ ...BASE_INFO, name: i18n("Basisspiel", "Base game") }, ...BOOSTS, ...BUYS];
const rulesEl = document.getElementById("rules"), rulesBody = document.getElementById("rulesBody");
const num = v => v.toLocaleString(RGS.lang === "de" ? "de" : "en");
// a rules section: a heading, then paragraphs (strings) and bullet lists (arrays)
function rulesSection(title, parts, before = null) {
  const sec = document.createElement("section"), h = document.createElement("h3");
  sec.className = "r-sec"; h.className = "r-h"; h.textContent = title; sec.appendChild(h);
  for (const part of parts) {
    if (Array.isArray(part)) {
      const ul = document.createElement("ul");
      part.forEach(([label, text]) => { const li = document.createElement("li"), b = document.createElement("b"); b.textContent = label; li.append(b, " " + text); ul.appendChild(li); });
      sec.appendChild(ul);
    } else if (part instanceof Node) sec.appendChild(part);
    else { const para = document.createElement("p"); para.textContent = part; sec.appendChild(para); }
  }
  rulesBody.insertBefore(sec, before);
  return sec;
}
rulesSection(i18n("So gewinnst du", "How to win"), [
  i18n("Gespielt wird auf einem 7×7-Raster. Gruppen aus 4 oder mehr gleichen Symbolen, die sich waagerecht oder senkrecht berühren, gewinnen. Der Gewinn hängt vom Symbol und der Größe der Gruppe ab (siehe Gewinntabelle) und wird mit dem Einsatz multipliziert.",
    "The game is played on a 7×7 grid. Groups of 4 or more matching symbols that touch horizontally or vertically win. The win depends on the symbol and the size of the group (see the paytable) and is multiplied by the bet."),
  i18n("Gewinnsymbole verschwinden, neue fallen von oben nach. Das wiederholt sich, bis keine neue Gruppe entsteht. Alle Gewinne eines Spins werden addiert. Kein Spin zahlt mehr als den maximalen Gewinn.",
    "Winning symbols disappear and new ones drop in from above. This repeats until no new group forms. All wins of a spin are added up. No round pays more than the maximum win."),
], document.getElementById("paytable"));
rulesSection(i18n("Geisterkisten-Bonus", "Ghost Crates bonus"), [[
  [i18n("Auslöser:", "Trigger:"), i18n("3 oder mehr FS-Symbole auf dem Spielfeld nach allen Kaskaden. Pro Walze landet höchstens ein FS.", "3 or more FS symbols on the board after all tumbles. At most one FS lands per reel.")],
  [i18n("Kisten:", "Crates:"), i18n("Jedes FS wird zu einer Kiste mit Charakter und Multiplikator (×2 oder ×3).", "Every FS turns into a crate with a character and a multiplier (×2 or ×3).")],
  [i18n("Spins:", "Spins:"), i18n("In jedem Spin können Runen (Wert 1 bis 10 × Einsatz) und selten neue Kisten in leere Felder fallen. Du startest mit 3 Leben: ein Spin ohne Treffer kostet eins, jeder Treffer füllt sie wieder auf.", "In every spin, runes (worth 1 to 10 × bet) and rarely new crates can land in empty cells. You start with 3 lives: a spin without a hit costs one, every hit refills them.")],
  [i18n("Ende:", "End:"), i18n("Der Bonus endet ohne Leben oder wenn alle Felder belegt sind.", "The bonus ends when no lives are left or every cell is filled.")],
  [i18n("Gewinn:", "Win:"), i18n("Gruppen aus mindestens 4 Runen, die eine Kiste berühren, zahlen die Summe ihrer Runen mal jeden Kisten-Multiplikator der Gruppe.", "Groups of at least 4 runes touching a crate pay the sum of their runes times every crate multiplier in the group.")],
  [i18n("Wiederauslösung:", "Re-triggers:"), i18n("Keine. Im Bonus landen keine FS-Symbole.", "None. No FS symbols land during the bonus.")],
]]);
rulesSection(BOOST_NAME, [
  BOOSTS.map(b => [`${b.name} (${num(b.cost)}× ${i18n("Einsatz", "bet")}):`, b.text]),
  i18n("Der Schalter über „Bonus kaufen“ wechselt zwischen Aus, 3× und 6× und zeigt den Preis pro Spin für den aktuellen Einsatz. Der Boost bleibt an, bis du ihn ausschaltest; Autoplay spielt mit ihm.",
    "The switch above Buy Bonus cycles Off, 3× and 6× and shows the price per spin at the current bet. The boost stays on until you switch it off; Autoplay uses it.")]);
rulesSection(i18n("Bonuskauf", "Bonus buy"), [
  i18n("„Bonus kaufen“ öffnet ein Menü mit diesen Optionen und ihrem Preis für den aktuellen Einsatz. Gekauft wird erst, wenn du bei einer Option auf Kaufen drückst. Jede Runde beginnt auf einem normalen Spielfeld.",
    "Buy Bonus opens a menu with these options and their price at the current bet. Nothing is bought until you press Buy on an option. Every round starts on a normal board."),
  BUYS.map(b => [`${b.name} (${num(b.cost)}× ${i18n("Einsatz", "bet")}):`, b.text]),
]);
{
  const table = document.createElement("table"), head = table.createTHead().insertRow(), tb = table.createTBody();
  [i18n("Modus", "Mode"), i18n("Kosten", "Cost"), "RTP", i18n("Max. Gewinn", "Max win")].forEach(t => { const th = document.createElement("th"); th.textContent = t; head.appendChild(th); });
  for (const m of MODE_INFO) {
    const r = tb.insertRow();
    [m.name, `${num(m.cost)}× ${i18n("Einsatz", "bet")}`, `${m.rtp.toLocaleString(RGS.lang === "de" ? "de" : "en", { minimumFractionDigits: 2 })} %`, `${num(m.maxWin)}× ${i18n("Einsatz", "bet")}`].forEach(t => { r.insertCell().textContent = t; });
  }
  table.className = "r-table";
  rulesSection(i18n("Auszahlungsquote und maximaler Gewinn", "Return to player and maximum win"), [table,
    i18n(`Die theoretische Auszahlungsquote (RTP) ist der erwartete Rückfluss über sehr viele Spiele. Der Gewinn einer Runde ist auf ${num(MAX_WIN_X)}× den Einsatz begrenzt.`,
      `The theoretical return to player (RTP) is the expected return over a very large number of plays. The win of a round is capped at ${num(MAX_WIN_X)}× the bet.`)]);
}
rulesSection(i18n("Bedienung", "Controls"), [[
  [i18n("Spin:", "Spin:"), i18n("Startet eine Runde mit dem aktuellen Einsatz. Während einer Runde überspringt ein erneuter Druck (oder ein Tipp auf das Spielfeld) die Animationen; das Ergebnis bleibt gleich.", "Starts a round at the current bet. During a round, press it again (or tap the board) to skip the animations; the result stays the same.")],
  [i18n("Leertaste:", "Space bar:"), i18n("Wie Spin.", "Same as Spin.")],
  [i18n("Einsatz − / +:", "Bet − / +:"), i18n("Senkt oder erhöht den Einsatz innerhalb der angebotenen Stufen.", "Lowers or raises the bet within the levels offered.")],
  [i18n("Autoplay:", "Autoplay:"), i18n("Wähle die Anzahl Spins und drücke Start. Erneut drücken stoppt. Reicht das Guthaben nicht, endet Autoplay.", "Choose the number of spins, then press Start. Press again to stop. Autoplay ends when the balance is too low.")],
  [i18n("Turbo:", "Turbo:"), i18n("Spielt Runden etwa doppelt so schnell. Erneut drücken schaltet ihn aus.", "Plays rounds about twice as fast. Press again to turn it off.")],
  [`${BOOST_NAME}:`, i18n("Wechselt den FS-Boost für die nächsten Spins zwischen Aus, 3× und 6× (siehe oben).", "Switches the FS Boost for the next spins between Off, 3× and 6× (see above).")],
  [i18n("Bonus kaufen:", "Buy Bonus:"), i18n("Öffnet den Bonuskauf mit seinem Preis (siehe oben).", "Opens the bonus buy with its price (see above).")],
  [i18n("Ton (oben rechts):", "Sound (top right):"), i18n("Lautstärke für Musik und Effekte und Stummschalten aller Töne.", "Music and effects volume, and mute for all sound.")],
  [i18n("Info:", "Info:"), i18n("Öffnet diese Regeln.", "Opens these rules.")],
]]);
rulesSection(i18n("Hinweis", "Disclaimer"), [
  i18n("Fehlfunktionen machen alle Gewinne und Spiele ungültig. Eine stabile Internetverbindung ist erforderlich. Bei einer Unterbrechung lade das Spiel neu, um offene Runden abzuschließen. Die erwartete Auszahlung gilt über sehr viele Spiele. Die Darstellung entspricht keinem physischen Gerät und dient nur der Veranschaulichung. Gewinne werden nach dem Betrag abgerechnet, den der Remote Game Server meldet, nicht nach Ereignissen im Browser. TM und © 2026 Engine.",
    "Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. TM and © 2026 Engine."),
]);
function openRules(open) {
  rulesEl.hidden = !open;
  if (open) { rulesBody.scrollTop = 0; document.getElementById("rulesClose").focus(); } else document.getElementById("infoBtn").focus();
}
document.getElementById("rulesClose").addEventListener("click", () => openRules(false));
rulesEl.addEventListener("click", e => { if (e.target === rulesEl) openRules(false); });
addEventListener("keydown", e => { if (e.key === "Escape" && !rulesEl.hidden) openRules(false); });
// index.html is written in English; German replaces its static texts for lang=de
if (RGS.lang === "de" && !RGS.social) {
  document.documentElement.lang = "de";
  const set = (sel, text, attr) => { const el = q(document, sel); if (el) attr ? el.setAttribute(attr, text) : (el.textContent = text); };
  set("header h1", "Geisterduell");
  set("header .sub", "Gruppen ab 4 gleichen Symbolen gewinnen, verschwinden und neue fallen nach. Die VS-Walze ist wild und startet ein Duell, sobald eine Gruppe über sie verbunden ist.");
  set("#ptTitle", "Gewinntabelle");
  set("#hBalLbl", "Guthaben");
  set("#hBetLbl", "Einsatz");
  set("#hWinLbl", "Gewinn");
  set("#hSoundCap", "Ton");
  set("#errTitle", "Verbindungsproblem");
  set("#errReload", "Neu laden");
  set("#replayTitle", "Wiederholung");
  set("#rulesTitle", "Spielregeln");
  set("#rulesClose", "Schließen", "aria-label");
  set("#msgText", "Drück auf Spin");
  set("#betMinus", "Einsatz verringern", "aria-label");
  set("#betPlus", "Einsatz erhöhen", "aria-label");
  set("#autoMenu", "Autoplay wählen", "aria-label");
  set(".am-grid", "Anzahl Spins", "aria-label");
  set("#amClose", "Schließen", "aria-label");
  set("#spin", "Drehen", "aria-label");
  set("#infoBtn", "Spielregeln", "aria-label");
  set("#musicBtn", "Ton", "aria-label");
  set("#sndMenu", "Lautstärke", "aria-label");
  set("#lblMusic", "Musik");
  set("#lblSfx", "Effekte");
  set("#muteAll", "Stumm");
  set("#buyBtn .bb-top", "Bonus");
  set("#buyBtn .bb-main", "Kaufen");
  set("#buyTitle", "Bonusmenü");
  set("#buyClose", "Schließen", "aria-label");
}

// ---------- Social mode: the static page texts too, and the "BET" label painted into the art ----------
if (RGS.social) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) n.nodeValue = RGS.socialText(n.nodeValue);
  qa(document, "[aria-label]").forEach(el => el.setAttribute("aria-label", RGS.socialText(el.getAttribute("aria-label"))));
  document.title = RGS.socialText(document.title);
  const patch = div("at art-label"); patch.textContent = "PLAY"; patch.setAttribute("aria-hidden", "true");
  game.insertBefore(patch, document.getElementById("betMinus"));
}

// ---------- Value fields: long amounts (CA$, MX$, big balances) shrink to fit their painted box instead of being cut off ----------
const FIT = ["balVal", "betVal", "winVal"].map(id => document.getElementById(id));
// Only the landscape layout's painted boxes have a fixed width; the phone panel sizes the fields to their text.
function fitVal(el) {
  el.style.setProperty("--fit", 1);
  if (document.documentElement.classList.contains("portrait")) return;
  const room = el.clientWidth, need = el.scrollWidth;
  if (room > 20 && need > room) el.style.setProperty("--fit", Math.max(.5, room / need * .96).toFixed(3));
}
const fitObs = new MutationObserver(ms => new Set(ms.map(m => m.target.nodeType === 3 ? m.target.parentElement : m.target)).forEach(el => FIT.includes(el) && fitVal(el)));
FIT.forEach(el => fitObs.observe(el, { childList: true, characterData: true, subtree: true }));
addEventListener("resize", () => FIT.forEach(fitVal));

// ---------- Portrait (phones held upright): reels on top, cropped from the art; a touch panel below ----------
// The real controls and values move into the panel (listeners and ids stay), and menus and dialogs into a layer
// sized for the phone; turning the phone back puts everything where it was.
const PANEL = [["msg", "hMsg"], ["balVal", "hBal"], ["betMinus", "hBetM"], ["betVal", "hBetM"], ["betPlus", "hBetM"], ["winVal", "hWin"], ["multChip", "hWin"],
  ["turboBtn", "hTurbo"], ["autoBtn", "hAuto"], ["spin", "hSpin"], ["infoBtn", "hInfo"], ["musicBtn", "hSound"], ["buyBtn", "hBuy"], ["boostBtn", "hBoost"]];
const LAYER = ["autoMenu", "sndMenu", "buyDlg", "rules", "replayBar", "replayDlg", "errDlg", "intro"];
const homes = new Map(); // a comment marks each element's place in the landscape layout
for (const id of [...PANEL.map(p => p[0]), ...LAYER]) { const el = document.getElementById(id), mark = document.createComment(id); el.before(mark); homes.set(id, mark); }
if (RGS.social) document.getElementById("hBetLbl").textContent = "Play";
let portrait = null;
function layout() {
  const p = innerWidth / innerHeight < .8;
  if (p === portrait) return;
  portrait = p;
  document.documentElement.classList.toggle("portrait", p);
  const put = (id, target) => { const el = document.getElementById(id); if (el) target ? target.appendChild(el) : homes.get(id).after(el); };
  PANEL.forEach(([id, slot]) => put(id, p && document.getElementById(slot)));
  LAYER.forEach(id => put(id, p && document.getElementById("ui")));
  fx.size();
  FIT.forEach(fitVal);
}
layout();
addEventListener("resize", layout);

// ---------- Intro: the three features, until the first click or key press (replays skip it) ----------
// The music already fades in as the game appears (sound.release); where the browser still blocks sound, this click starts it.
const introDone = new Promise(resolve => {
  const el = document.getElementById("intro");
  if (RGS.replay) { el.remove(); resolve(); return; }
  const card = (cls, art, title, text) => {
    const c = div("icard " + cls), a = div("ic-art"), h = document.createElement("h2"), p = document.createElement("p");
    c.append(...["tl", "tr", "bl", "br"].map(k => { const i = document.createElement("i"); i.className = "am-corner " + k; return i; }));
    a.append(...art); h.textContent = title; p.textContent = text; c.append(a, h, p); return c;
  };
  const sym = (id, cls) => { const s2 = makeSym(id); s2.classList.add(cls); return s2; };
  const mult = div("ic-mult badge t3"); mult.textContent = "×1000";
  const logo = new Image(); logo.src = "assets/logo.webp"; logo.alt = "Ghost Duels"; logo.className = "intro-logo";
  const cards = div("intro-cards");
  cards.append(
    card("c-fs", [sym("fs", "f1"), sym("fs", "f3"), sym("fs", "f2")], i18n("Geisterkisten", "Ghost Crates"),
      i18n("3 FS-Symbole starten den Bonus: Kisten mit Multiplikatoren und 3 Leben", "Land 3 FS symbols to start the bonus: crates with multipliers and 3 lives")),
    card("c-vs mid", [sym("blue", "g1"), sym("witch", "g2"), sym("vs", "v"), mult], i18n("VS-Duelle", "VS Duels"),
      i18n("VS-Walzen sind wild. Jede verbundene Gruppe startet ein Duell um Multiplikatoren bis ×1000", "VS reels are wild. Every connected group starts a duel for multipliers up to ×1000")),
    card("c-max", [skullKing()], "Max Win",
      i18n(`Gewinne bis zu ${MAX_WIN_X.toLocaleString("de")}× deinen Einsatz`, `Win up to ${MAX_WIN_X.toLocaleString("en")}× your bet`)));
  const go = div("intro-go"); go.id = "introGo"; go.textContent = i18n("Klicken zum Fortfahren", "Click to continue");
  el.append(logo, cards, go);
  // the cards fly in as the loading screen fades away
  if (!RM) LOADER.fading.then(() => [...cards.children].forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(18%) scale(.9)" }, { opacity: 1 }], { duration: 520, delay: 120 + i * 140, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" })));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    removeEventListener("keydown", onKey, true);
    sound.spin();
    (RM ? Promise.resolve() : el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(1.04)" }], { duration: 380, easing: "ease-in", fill: "forwards" }).finished).then(() => el.remove());
    resolve();
  };
  // keys only continue: Space must not also start a spin underneath
  const onKey = e => { if (e.key === "Tab") return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) close(); };
  el.addEventListener("click", close); addEventListener("keydown", onKey, true);
  el.focus();
});

// the loading bar waits for the images of the first screen
LOADER.track([...Object.values(IMG), "assets/bg.webp", "assets/logo.webp", "assets/console-front.webp", "assets/img0.webp", "assets/img1.webp",
  RM ? "assets/lich-still.webp" : "assets/lich-idle.webp"]);
boot();
