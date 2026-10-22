const IMG = {"book": "assets/book.webp", "key": "assets/key.webp", "blue": "assets/blue.webp", "devil": "assets/devil.webp", "witch": "assets/witch.webp", "pirate": "assets/pirate.webp", "fs": "assets/fs.webp", "vs": "assets/vs.webp", "rune_green": "assets/rune_green.webp", "rune_blue": "assets/rune_blue.webp", "rune_purple": "assets/rune_purple.webp", "rune_fire": "assets/rune_fire.webp", "rune_pink": "assets/rune_pink.webp", "lantern": "assets/lantern.webp", "ring": "assets/ring.webp", "potion": "assets/potion.webp"};
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLS = 7, ROWS = 7;
// Bet levels, balance and currency come from the RGS once authenticated (see boot() at the end)
let BETS = [1], betIdx = 0, bet = 1, balance = 0;
const money = v => RGS.formatMoney(v);
// German for lang=de, English for every other language
const i18n = (de, en) => RGS.lang === "de" ? de : en;
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
// RTP of the published lookup table (math-sdk/games/ghost_duels, 1M spins)
const RTP_TEXT = (95.67).toLocaleString(RGS.lang) + " %";

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
const reelsEl = document.getElementById("reels"), linksEl = document.getElementById("links"), floatsEl = document.getElementById("floats");
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
  linksEl.replaceChildren(); floatsEl.replaceChildren();
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
  const k = div("vx-king"), inner = div("vk"), body = new Image(), lamp = new Image();
  body.src = "assets/img24.webp"; lamp.src = "assets/img25.webp"; body.alt = lamp.alt = ""; lamp.className = "vk-lamp";
  inner.append(body, lamp); k.appendChild(inner); return k;
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
  const P = pitchPx();
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

  // 2. schedule: VS adds a pause, once 2 FS are on the board every further reel teases
  const stops = [], tease = []; let t = 40, fsSeen = 0;
  for (let c = 0; c < COLS; c++) {
    if (c > 0) t += RM ? 30 : 110;
    if (vsReels.includes(c - 1)) t += RM ? 0 : 480;
    tease[c] = fsSeen >= 2 && !RM;
    if (tease[c]) t += 1500;
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
  for (let c = 0; c < COLS; c++) sound.land(c, (stops[c] + (RM ? 0 : vsReels.includes(c) ? 377 : 310)) / 1000, vsReels.includes(c));
  const done = [];
  fills.forEach(([c, r, el]) => {
    const delay = stops[c] + (ROWS - 1 - r) * 50;
    const a1 = RM ? null : el.animate(DROP_KF(-(r + 1.3) * P), { duration: 340 + r * 24, delay, easing: DROP_EASE, fill: "backwards" });
    if (res[c][r] === "fs") (a1 ? a1.finished : Promise.resolve()).then(() => { animWin(el); const [x, y, w] = centerOf(el); fx.emit(x, y, { n: 16, kind: "spark", rgb: SYM.fs.rgb, scale: w / 120 }); });
    if (a1) done.push(a1.finished);
  });
  vsReels.forEach(c => {
    const rl = reels[c];
    if (!RM) done.push(rl.tall.animate([{ transform: `translate3d(0, ${-P * (ROWS + 1)}px, 0)` }, { transform: "translate3d(0, 2%, 0) scaleY(.97)", offset: .82 }, { transform: "translate3d(0,0,0)" }],
      { duration: 460, delay: stops[c], easing: DROP_EASE, fill: "backwards" }).finished.then(() => tallLanded(rl)));
    else tallLanded(rl);
  });
  // tease overlays (blurred fast spin) run until that reel's drop starts
  tease.forEach((on, c) => {
    if (!on) return;
    sound.tease(Math.max(0, stops[c] - 1500) / 1000, 1.5);
    setTimeout(() => {
      const rl = reels[c], ov = div("teasefx");
      for (let r = 0; r < ROWS; r++) { const im = new Image(); im.src = IMG[randSym()]; im.alt = ""; ov.appendChild(im); }
      rl.el.classList.add("tease"); rl.el.appendChild(ov);
      say(i18n("Noch ein FS…", "One more FS…")); shake(4, 300);
      const iv = setInterval(() => qa(ov, "img").forEach(im => im.src = IMG[randSym()]), 90);
      setTimeout(() => { clearInterval(iv); ov.remove(); rl.el.classList.remove("tease"); }, 1500);
    }, Math.max(0, stops[c] - 1500));
  });
  await Promise.all(done);
  stage.classList.remove("dropping");
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
function drawLinks(cl) {
  const s = stage.getBoundingClientRect();
  linksEl.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
  const NS = "http://www.w3.org/2000/svg";
  cl.links.forEach(([a, b], i) => {
    const [x1, y1] = cellCenter(a), [x2, y2] = cellCenter(b), len = Math.hypot(x2 - x1, y2 - y1);
    for (const cls of ["beam-glow", "beam"]) {
      const l = document.createElementNS(NS, "line");
      Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
      l.setAttribute("class", cls);
      if (cls === "beam-glow") l.style.stroke = `rgb(${SYM[cl.id].rgb})`;
      l.style.strokeDasharray = len; l.style.strokeDashoffset = RM ? 0 : len; l.style.animationDelay = (i * .06) + "s";
      linksEl.appendChild(l);
    }
  });
}
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
function countTo(target, dur = 700) {
  const from = shown, t0 = performance.now();
  return new Promise(res => (function step(t) {
    const k = Math.min(1, (t - t0) / dur); shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
    winVal.textContent = money(shown); if (k < 1) requestAnimationFrame(step); else res();
  })(t0));
}

async function showWins(clusters, before) {
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
    drawLinks(cl);
    cl.vsCols.forEach(c => { const t = reels[c].tall; t.classList.add("win"); t.style.setProperty("--wc", SYM[cl.id].rgb); animWin(q(t, ".sym")); });
    cl.cells.forEach(([c, r], k) => setTimeout(() => {
      const cell = reels[c].cells[r], el = q(cell, ".sym");
      cell.classList.add("win"); cell.style.setProperty("--wc", SYM[cl.id].rgb); animWin(el);
      const [x, y, w] = centerOf(el);
      fx.emit(x, y, { n: SYM[cl.id].tier === "rune" ? 8 : 18, scale: w / 120, rgb: SYM[cl.id].rgb, kind: cl.id === "potion" ? "bubble" : "wisp" });
    }, k * 60));
    const pts = (cl.cells.length ? cl.cells : cl.wilds).map(cellCenter), cx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, cy = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
    setTimeout(() => floatText(cx, cy, cl.mult > 1 ? `${money(cl.base)} ×${cl.mult}` : money(cl.win), SYM[cl.id].rgb), 300);
    total += cl.win; countTo(total);
    await sleep(Math.min(1100, 420 + cl.cells.length * 70));
  }
  await sleep(500);
  return total - before;
}

// tumbleBoard event: exploding cells, removed VS reels and the new symbols per reel (top first)
async function tumble(ev) {
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
  linksEl.replaceChildren(); floatsEl.replaceChildren();
  qa(reelsEl, ".cell, .tall").forEach(c => c.classList.remove("win", "dim"));
  const P = pitchPx(), anims = [];
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
      if (!RM) anims.push(sEl.animate(DROP_KF(-dist * P), { duration: 260 + Math.min(dist, 6) * 60, delay: c * 35 + (ROWS - 1 - r) * 30, easing: DROP_EASE, fill: "backwards" }).finished);
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
  while (performance.now() - t0 < dur) { b.textContent = "×" + pick(pool); await sleep(70); }
  b.textContent = "×" + final;
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
    showTallWinner(rl, winner, mult, finalTier);
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
    mid.style.opacity = 1;
    await mid.animate([{ transform: "translate(-50%,-50%) scale(3)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(.9)", opacity: 1, offset: .75 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: 360, easing: "ease-in", fill: "forwards" }).finished;
    shake(9, 400); fx.emit(cx, cy, { n: 30, kind: "spark", rgb: "120 220 255", scale: cw / 90 });
  };
  const clash = async (n, power) => {
    for (let i = 0; i < n; i++) {
      top.el.animate([{ transform: "none" }, { transform: "translateY(42%) scale(1.08)", offset: .45 }, { transform: "translateY(38%)", offset: .55 }, { transform: "none" }], { duration: 480, easing: "ease-in-out" });
      bot.el.animate([{ transform: "none" }, { transform: "translateY(-42%) scale(1.08)", offset: .45 }, { transform: "translateY(-38%)", offset: .55 }, { transform: "none" }], { duration: 480, easing: "ease-in-out" });
      mid.animate([{ opacity: 1 }, { opacity: .1, offset: .4 }, { opacity: .1, offset: .7 }, { opacity: 1 }], { duration: 480 });
      await sleep(215);
      fl.animate([{ opacity: 0 }, { opacity: .9 }, { opacity: 0 }], { duration: 220 });
      shake(8 + i * 3 + power * 3, 300);
      fx.emit(cx, cy, { n: 26 + power * 14, kind: "spark", rgb: i % 2 ? SYM[top.id].rgb : SYM[bot.id].rgb, scale: cw / 90 });
      await sleep(380);
    }
  };
  // loser drops out; returns the side that is now free
  const knockOut = async (loser) => {
    const dir = loser === bot ? 1 : -1;
    animWin(loser.sy, "hurt");
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
  animWin(top.sy, "taunt"); setTimeout(() => animWin(bot.sy, "taunt"), 220);
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
    say(call); hero.react("gasp", 2200); await roundBanner(call, rgb);
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
  hero.react("cheer", hold + 600);
  document.getElementById("bTitle").textContent = title; document.getElementById("bSub").textContent = sub;
  bannerEl.hidden = false;
  await bannerEl.animate([{ opacity: 0, transform: "scale(1.3)" }, { opacity: 1, transform: "scale(1)" }], { duration: 380, easing: "ease-out" }).finished;
  const s = stage.getBoundingClientRect();
  fx.emit(s.width / 2, s.height / 2, { n: 60, kind: "spark", rgb: "255 79 210", scale: s.width / 360 });
  await sleep(hold);
  await bannerEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished;
  bannerEl.hidden = true;
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
  plate.textContent = "×" + mult; front.append(div("cr-corner l"), div("cr-corner r"), plate);
  el.append(div("cr-glow"), div("cr-back"), makeSym(id), front); return el;
}
function makeRune(v, id) {
  const el = div("rtok"); el.style.setProperty("--c", SYM[id].rgb);
  const img = new Image(); img.src = IMG[id]; img.alt = ""; img.draggable = false;
  const t = document.createElement("span"); t.className = "rv"; t.textContent = fmtV(v * bet);
  if (v >= 6) el.classList.add("big");
  el.append(img, t); return el;
}
function dropIn(el, heavy) {
  if (RM) return;
  el.animate([{ transform: "translateY(-160%) scale(.9)", opacity: 0 }, { transform: "translateY(-160%) scale(.9)", opacity: 1, offset: .05 },
    { transform: `translateY(6%) scale(${heavy ? "1.12, .86" : "1.06, .92"})`, offset: .75 }, { transform: "none", opacity: 1 }],
    { duration: heavy ? 720 : 520, easing: "cubic-bezier(.45,0,.7,1)" });
}
function placeRune(c, r, v, id) {
  K[c][r] = { t: "r", v };
  const el = makeRune(v, id); reels[c].cells[r].replaceChildren(el); dropIn(el, false);
  setTimeout(() => { const [x, y, w] = cellCenter([c, r]); fx.emit(x, y + w * .2, { n: 8, kind: "spark", rgb: el.style.getPropertyValue("--c"), scale: w / 140 }); }, RM ? 0 : 400);
}
function placeCrate(c, r, id, m, intro) {
  K[c][r] = { t: "c", id, m };
  if (!intro && N4.some(([dx, dy]) => at(c + dx, r + dy)?.t === "c")) setTimeout(() => {
    const CH = crateChains(), ch = CH.chains[CH.id.get(c + "," + r)];
    const [x, y] = cellCenter([c, r]); floatText(x, y - 20, `Kette ×${ch.mult}`, "246 196 79");
    drawGroupLinks(linkGroups());
  }, RM ? 0 : 800);
  const el = makeCrate(id, m); reels[c].cells[r].replaceChildren(el);
  if (!intro) {
    dropIn(el, true);
    setTimeout(() => { shake(10, 450); const [x, y, w] = cellCenter([c, r]); fx.emit(x, y + w * .35, { n: 26, kind: "spark", rgb: SYM[id].rgb, scale: w / 110 }); animWin(q(el, ".sym")); }, RM ? 0 : 560);
  }
  return el;
}

// Rune groups (orthogonal). A group of >= 4 runes touching crates gets the sum of those crate multipliers.
// Crates that touch each other form a chain; their multipliers add up for every group linked to the chain
function crateChains() {
  const id = new Map(), chains = [];
  kCells("c").forEach(([c, r]) => {
    if (id.has(c + "," + r)) return;
    const cells = [], links = [], st = [[c, r]], n = chains.length; id.set(c + "," + r, n);
    while (st.length) {
      const [x, y] = st.pop(); cells.push([x, y]);
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy; if (at(nx, ny)?.t !== "c") continue;
        if (dx > 0 || dy > 0) links.push([[x, y], [nx, ny]]);
        if (!id.has(nx + "," + ny)) { id.set(nx + "," + ny, n); st.push([nx, ny]); }
      }
    }
    chains.push({ cells, links, mult: cells.reduce((p2, [x, y]) => p2 * K[x][y].m, 1) });
  });
  return { id, chains };
}
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
  linksEl.replaceChildren();
  qa(reelsEl, ".rtok.linked").forEach(e => e.classList.remove("linked"));
  qa(reelsEl, ".crate.active").forEach(e => e.classList.remove("active"));
  const s = stage.getBoundingClientRect(); linksEl.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
  const NS = "http://www.w3.org/2000/svg";
  const line = (a, b, rgb, delay) => {
    const [x1, y1] = cellCenter(a), [x2, y2] = cellCenter(b), len = Math.hypot(x2 - x1, y2 - y1);
    for (const cls of ["beam-glow", "beam"]) {
      const l = document.createElementNS(NS, "line"); Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
      l.setAttribute("class", cls); if (cls === "beam-glow") l.style.stroke = `rgb(${rgb})`;
      l.style.strokeDasharray = len; l.style.strokeDashoffset = RM ? 0 : len; l.style.animationDelay = delay + "s"; linksEl.appendChild(l);
    }
  };
  // crate chains always show their gold link
  crateChains().chains.forEach(ch => ch.links.forEach(([a1, b1], i) => line(a1, b1, "246 196 79", i * .05)));
  for (const g of groups) {
    if (!g.ok) continue;
    g.chains.forEach(ch => ch.cells.forEach(([c, r]) => q(reels[c].cells[r], ".crate").classList.add("active")));
    const top = g.crates.map(k => K[k.cell[0]][k.cell[1]]).sort((a, b) => b.m - a.m)[0], rgb = SYM[top.id].rgb;
    // energy flows from the crate outward, ring by ring
    g.edges.forEach(e => line(e.a, e.b, e.crateLink ? "246 196 79" : SYM[e.id].rgb, e.d * .16));
    g.cells.forEach(([c, r]) => {
      const t = q(reels[c].cells[r], ".rtok"); t.style.setProperty("--lc", rgb);
      const d = g.depth.get(c + "," + r) ?? 1;
      setTimeout(() => t.classList.add("linked"), RM ? 0 : d * 160 + 120);
    });
  }
}

function setLives(n) {
  qa(livesEl, ".life").forEach((l, i) => l.classList.toggle("out", i >= n));
}
async function loseLife(n) {
  hero.react("gasp", 1100);
  const l = qa(livesEl, ".life")[n];
  stage.classList.remove("hurt"); void stage.offsetWidth; stage.classList.add("hurt");
  if (!RM) {
    const big = div("life-big"), lf = document.createElement("i"), t = div("lbl2");
    lf.className = "life"; t.textContent = n === 0 ? i18n("Letzte Chance vorbei", "Last chance gone") : (n === 1 ? i18n("Noch 1 Leben", "1 life left") : i18n(`Noch ${n} Leben`, `${n} lives left`));
    big.append(lf, t); stage.appendChild(big);
    big.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.4)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: .25 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: .5 }, { opacity: 0, transform: "translate(-50%,-60%) scale(.9)" }], { duration: 1300, fill: "forwards" });
    setTimeout(() => { lf.classList.add("out"); const [x, y] = [stage.clientWidth / 2, stage.clientHeight * .44]; fx.emit(x, y, { n: 18, rgb: "160 175 170", scale: stage.clientWidth / 500 }); }, 520);
    setTimeout(() => big.remove(), 1350);
    l.animate([{ transform: "scale(1)" }, { transform: "scale(1.8)", filter: "brightness(2)" }, { transform: "scale(1)" }], { duration: 500 });
  }
  setTimeout(() => setLives(n), RM ? 0 : 450);
  await sleep(RM ? 300 : 1050);
}
function refillLives(prev) {
  setLives(3);
  if (prev < 3 && !RM) qa(livesEl, ".life").forEach((l, i) => i >= prev && l.animate([{ transform: "scale(0)", filter: "brightness(3)" }, { transform: "scale(1.7)", offset: .5 }, { transform: "scale(1)", filter: "brightness(1)" }], { duration: 520, delay: (i - prev) * 90 }));
}
function bonusHud(extra) {
  const v = bonusValue(); winVal.textContent = money(v);
  say(extra || `${i18n("Wert", "Value")} ${money(v)}`);
}

async function slowSpin(landed) {
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
  const fsCells = start.crates.map(k => [k.reel, k.row]), n = Math.min(7, fsCells.length);
  say(`${n} FS · ${i18n("Freispiele!", "Free Spins!")}`);
  stage.classList.add("bonus");
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
    while (!RM && performance.now() - t0 < 900) { plate.textContent = "×" + pick(MULT_POOL); await sleep(65); }
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

  // Finale: linked groups get their crate multiplier
  const groups = linkGroups();
  drawGroupLinks(groups);
  const winners = groups.filter(g => g.ok).sort((a, b) => a.sum * a.mult - b.sum * b.mult);
  if (winners.length) say(i18n("Die Kisten öffnen sich", "The crates open"));
  for (const g of winners) {
    g.crates.forEach(k => { const el = q(reels[k.cell[0]].cells[k.cell[1]], ".crate"); animWin(q(el, ".sym")); if (!RM) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 600 }); const [x, y, w] = cellCenter(k.cell); fx.emit(x, y, { n: 26, kind: "spark", rgb: SYM[K[k.cell[0]][k.cell[1]].id].rgb, scale: w / 100 }); });
    const pts = g.cells.map(cellCenter), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    floatText(cx, cy, `${fmtV(g.sum * bet)} × ${g.mults.join(" × ")}`, "246 196 79");
    await sleep(500);
    await Promise.all(g.cells.map(([c, r], i) => sleep(i * 40).then(() => {
      const t = q(reels[c].cells[r], ".rtok .rv"), from = K[c][r].v * bet, to = from * g.mult, t0 = performance.now();
      return new Promise(res => (function step(tt) { const k = Math.min(1, (tt - t0) / 500); t.textContent = fmtV(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); else res(); })(t0));
    })));
    shake(6, 300);
    await sleep(450);
  }
  // Collect (the event total is authoritative; it already includes the max-win cap)
  const total = end.totalWin / 100 * bet;
  linksEl.replaceChildren(); shown = 0; winVal.textContent = money(0);
  const mOf = new Map();
  groups.forEach(g => g.cells.forEach(([c, r]) => mOf.set(c + "," + r, g.ok ? g.mult : 0)));
  const dead = kCells("r").filter(([c, r]) => !mOf.get(c + "," + r));
  if (dead.length) {
    say(`${dead.length} ${dead.length === 1 ? i18n("Rune ohne Verbindung zerfällt", "unlinked rune crumbles") : i18n("Runen ohne Verbindung zerfallen", "unlinked runes crumble")}`);
    await Promise.all(dead.map(([c, r], i) => { const el = q(reels[c].cells[r], ".rtok"); return RM ? null : el.animate([{ filter: "none", opacity: 1, transform: "none" }, { filter: "grayscale(1) brightness(.6)", opacity: 1, offset: .4 }, { filter: "grayscale(1) brightness(.4)", opacity: 0, transform: "translateY(25%) scale(.7)" }], { duration: 700, delay: i * 40, fill: "forwards" }).finished; }));
  }
  const runes = kCells("r").filter(([c, r]) => mOf.get(c + "," + r));
  let run = 0;
  for (const [c, r] of runes) {
    run += K[c][r].v * mOf.get(c + "," + r) * bet;
    const el = q(reels[c].cells[r], ".rtok");
    if (!RM) el.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.4)", offset: .4 }, { transform: "scale(0)", opacity: 0 }], { duration: 380, fill: "forwards" });
    countTo(Math.min(run, total), 180);
    await sleep(runes.length > 16 ? 60 : 110);
  }
  await countTo(total, 400);
  livesEl.hidden = true;
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
  const clusters = clustersFor(ev);
  if (duels.length) {
    const cols = duels.map(d => d.reel);
    drawLinks({ id: clusters.find(cl => cl.vsCols.includes(cols[0])).id, links: clusters.filter(cl => cl.vsCols.some(c => cols.includes(c))).flatMap(cl => cl.links) });
    say(clusters.some(cl => cl.wildOnly) ? i18n("VS-Walzen nebeneinander · Duell!", "VS reels side by side · Duel!") : i18n("VS verbunden · Duell!", "VS connected · Duel!")); await sleep(RM ? 200 : 1000); linksEl.replaceChildren();
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
  const fsCells = ev.positions.map(p => [p.reel, p.row]);
  qa(reelsEl, ".cell, .tall").forEach(c => c.classList.remove("win", "dim")); linksEl.replaceChildren();
  fsCells.forEach(([c, r], i) => setTimeout(() => {
    const el = q(reels[c].cells[r], ".sym"); reels[c].cells[r].classList.add("win"); animWin(el);
    const [x, y, w] = centerOf(el); fx.emit(x, y, { n: 24, kind: "spark", rgb: SYM.fs.rgb, scale: w / 120 });
  }, i * 160));
  await sleep(1400);
}

// Returns the round's total win in currency
async function playRound(events, resumed) {
  clearBoard(); shown = 0; winVal.textContent = money(0);
  say(resumed ? i18n("Runde wird fortgesetzt", "Resuming round") : i18n("Viel Glück!", "Good luck!"));
  vsMult = {}; vsWinner = {};
  let won = 0, rounds = 0, summarised = false;
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
        won = amt(ev.amount); shown = won; winVal.textContent = money(won);
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
        won = amt(ev.amount); shown = won; winVal.textContent = money(won);
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
  refreshPays();
  document.getElementById("betMinus").disabled = busy || RGS.replay || betIdx === 0;
  document.getElementById("betPlus").disabled = busy || RGS.replay || betIdx === BETS.length - 1;
}
const buttons = ["spin", "betMinus", "betPlus", "autoBtn"].map(id => document.getElementById(id));
const spinBtn = document.getElementById("spin"), autoBtn = document.getElementById("autoBtn");
let autoOn = false;
const lock = on => { busy = on; buttons.forEach(b => b.disabled = on); if (!on) updateBet(); };

// Wallet flow: play debits the bet and returns the book; end-round credits a win.
async function play() {
  if (busy || RGS.replay) return;
  if (balance < bet) { say(i18n("Guthaben reicht nicht für diesen Einsatz", "Balance too low for this bet")); if (autoOn) stopAuto(); return; }
  lock(true); spinBtn.classList.add("turning");
  setTimeout(() => spinBtn.classList.remove("turning"), 1600);
  const t0 = performance.now();
  try {
    const res = await RGS.play(bet);
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
function stopAuto(msg) { autoOn = false; autoLeft = 0; autoBtn.setAttribute("aria-pressed", "false"); showAutoLeft(); if (msg) say(msg); }
async function autoLoop() {
  while (autoOn && autoLeft > 0) {
    if (balance < bet) { stopAuto(i18n("Guthaben reicht nicht · Autoplay beendet", "Balance too low · Autoplay ended")); break; }
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
  autoOn = true; autoLeft = autoChoice; autoBtn.setAttribute("aria-pressed", "true"); showAutoLeft();
  say(autoChoice === Infinity ? i18n("Autoplay · endlos", "Autoplay · endless") : `Autoplay · ${autoChoice} Spins`);
  if (!busy) autoLoop(); else (async () => { while (busy) await sleep(200); autoLoop(); })();
});
document.getElementById("amClose").addEventListener("click", () => openAutoMenu(false));
addEventListener("keydown", e => { if (e.key === "Escape" && !autoMenu.hidden) openAutoMenu(false); });
document.addEventListener("pointerdown", e => { if (!autoMenu.hidden && !autoMenu.contains(e.target) && !autoBtn.contains(e.target)) openAutoMenu(false); });
document.getElementById("betMinus").addEventListener("click", () => { if (!busy && betIdx > 0) { betIdx--; updateBet(); } });
document.getElementById("betPlus").addEventListener("click", () => { if (!busy && betIdx < BETS.length - 1) { betIdx++; updateBet(); } });
document.getElementById("infoBtn").addEventListener("click", () => document.getElementById("paytable").scrollIntoView({ behavior: RM ? "auto" : "smooth" }));
document.getElementById("spin").addEventListener("click", () => play());
addEventListener("keydown", e => { if (e.code === "Space" && e.target === document.body && !RGS.jurisdiction.disabledSpacebar) { e.preventDefault(); play(); } });

// ---------- Sound: one Web Audio graph with a music bus and an effects bus, each with its own volume ----------
// Browsers only allow sound after a tap or key press, so everything starts on the first one. Volumes and mute are remembered.
// The effects are synthesized placeholders; each one can later be swapped for a recorded sample without touching the call sites.
const sound = (() => {
  const KEY = "ghostDuels.sound", MUSIC_SRC = "assets/spooky-carousel.mp3";
  const st = { music: 65, sfx: 80, muted: false }; // sliders 0–100
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
  let ctx, master, musicBus, sfxBus, noise, started = false;
  const file = fetch(MUSIC_SRC).then(r => { if (!r.ok) throw new Error("music " + r.status); return r.arrayBuffer(); });
  file.catch(() => {}); // reported in loadMusic()
  const level = v => (v / 100) ** 2; // slider to gain, roughly even steps in loudness
  function apply(sec = .25) {
    if (!ctx) return;
    const t = ctx.currentTime, k = Math.max(sec / 3, .001);
    master.gain.setTargetAtTime(st.muted ? 0 : 1, t, k);
    musicBus.gain.setTargetAtTime(level(st.music), t, k);
    sfxBus.gain.setTargetAtTime(level(st.sfx), t, k);
  }
  function start() {
    started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); ctx.resume(); // created inside the gesture, so it may play
    master = ctx.createGain(); master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    apply(0);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    loadMusic();
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
  function tone(t, { type = "sine", f, f2, a = .002, d = .1, vol = .3 }) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, a, vol, d); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + a + d + .05);
  }
  function hiss(t, { f, f2, q = 1, a = .002, d = .08, vol = .3 }) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; fl.type = "bandpass"; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, a, vol, d); s.connect(fl).connect(g).connect(sfxBus); s.start(t, Math.random()); s.stop(t + a + d + .05);
  }
  // effects are skipped until the first gesture and in hidden tabs (they would pile up and play on return)
  const at = (delay = 0) => ctx && !document.hidden ? ctx.currentTime + Math.max(0, delay) : null;
  const fx = {
    click() { const t = at(); if (t == null) return; tone(t, { type: "triangle", f: 1900, f2: 1100, d: .045, vol: .16 }); hiss(t, { f: 4200, q: 2, d: .018, vol: .1 }); },
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
    // one free-spin symbol away: a rising, pulsing riser over the tease
    tease(delay = 0, dur = 1.5) {
      const t = at(delay); if (t == null) return;
      hiss(t, { f: 300, f2: 2600, q: 5, a: dur * .85, d: dur * .15, vol: .16 });
      for (let i = 0; i < 4; i++) tone(t + i * dur / 4, { f: 85, f2: 50, a: .004, d: .16, vol: .28 });
    },
  };
  return {
    ...fx, st,
    set(part) { Object.assign(st, part); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} apply(); },
  };
})();

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
document.addEventListener("click", e => { if (e.target.closest(".hot, .am-grid button, .am-foot button")) sound.click(); });

// ---------- Start: authenticate (or load a replay), apply bet levels and rules, resume an open round ----------
async function boot() {
  lock(true);
  say(i18n("Lädt…", "Loading…"));
  try {
    const s = await RGS.init();
    balance = s.balance; BETS = s.betLevels;
    betIdx = Math.max(0, BETS.indexOf(s.defaultBet));
    if (s.jurisdiction.disabledAutoplay) autoBtn.hidden = true;
    updateBal(); updateBet(); winVal.textContent = money(0);
    if (s.round) {
      if (s.round.amount) { const i = BETS.indexOf(s.round.amount); if (i >= 0) betIdx = i; bet = s.round.amount; }
      lock(true);
      await runRound(s.round, !RGS.replay);
      if (RGS.replay) { say(i18n("Wiederholung beendet", "Replay finished")); return; }
    } else say(i18n("Drück auf Spin", "Press Spin"));
    lock(false);
  } catch (err) {
    console.error(err); say(RGS.errorText(err));
  }
}

// ===== Lich King hero: user artwork as a skinned mesh (Spine-style bones + weights), rendered with WebGL =====
const LICH_MESH = {"lamp":{"x":32,"y":270,"w":288,"h":292},"tw":730,"th":930,"v":[[280,0,0.0,0.999,0.001,0.0,0.0,0.0,0.0,0.0],[294,0,0.0,0.995,0.005,0.0,0.0,0.0,0.0,0.0],[280,14,0.0,0.958,0.042,0.0,0.0,0.0,0.0,0.0],[294,14,0.0,0.86,0.14,0.0,0.0,0.0,0.0,0.0],[308,0,0.0,0.992,0.008,0.0,0.0,0.0,0.0,0.0],[308,14,0.0,0.803,0.197,0.0,0.0,0.0,0.0,0.0],[322,0,0.0,0.992,0.008,0.0,0.0,0.0,0.0,0.0],[322,14,0.0,0.798,0.202,0.0,0.0,0.0,0.0,0.0],[336,0,0.0,0.992,0.008,0.0,0.0,0.0,0.0,0.0],[336,14,0.0,0.798,0.202,0.0,0.0,0.0,0.0,0.0],[658,0,0.0,0.467,0.0,0.0,0.0,0.0,0.533,0.0],[672,0,0.0,0.467,0.0,0.0,0.0,0.0,0.533,0.0],[658,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[672,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[686,0,0.0,0.467,0.0,0.0,0.0,0.0,0.533,0.0],[686,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[700,0,0.0,0.467,0.0,0.0,0.0,0.0,0.533,0.0],[700,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[714,0,0.0,0.467,0.0,0.0,0.0,0.0,0.533,0.0],[714,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[280,28,0.0,0.673,0.327,0.0,0.0,0.0,0.0,0.0],[294,28,0.0,0.361,0.639,0.0,0.0,0.0,0.0,0.0],[308,28,0.0,0.244,0.756,0.0,0.0,0.0,0.0,0.0],[322,28,0.0,0.235,0.765,0.0,0.0,0.0,0.0,0.0],[336,28,0.0,0.235,0.765,0.0,0.0,0.0,0.0,0.0],[350,14,0.0,0.798,0.202,0.0,0.0,0.0,0.0,0.0],[350,28,0.0,0.235,0.765,0.0,0.0,0.0,0.0,0.0],[588,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[602,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[588,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[602,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[616,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[616,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[630,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[630,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[644,14,0.0,0.008,0.0,0.0,0.0,0.0,0.992,0.0],[644,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[658,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[672,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[686,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[700,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[714,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[280,42,0.0,0.213,0.787,0.0,0.0,0.0,0.0,0.0],[294,42,0.0,0.044,0.956,0.0,0.0,0.0,0.0,0.0],[308,42,0.0,0.013,0.987,0.0,0.0,0.0,0.0,0.0],[322,42,0.0,0.011,0.989,0.0,0.0,0.0,0.0,0.0],[336,42,0.0,0.011,0.989,0.0,0.0,0.0,0.0,0.0],[350,42,0.0,0.011,0.989,0.0,0.0,0.0,0.0,0.0],[364,28,0.0,0.235,0.765,0.0,0.0,0.0,0.0,0.0],[364,42,0.0,0.011,0.989,0.0,0.0,0.0,0.0,0.0],[378,28,0.0,0.235,0.765,0.0,0.0,0.0,0.0,0.0],[378,42,0.0,0.011,0.989,0.0,0.0,0.0,0.0,0.0],[574,28,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[574,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[588,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[602,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[616,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[630,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[644,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[658,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[672,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[686,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[700,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[714,42,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[280,56,0.0,0.021,0.979,0.0,0.0,0.0,0.0,0.0],[294,56,0.0,0.001,0.999,0.0,0.0,0.0,0.0,0.0],[308,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,42,0.0,0.072,0.928,0.0,0.0,0.0,0.0,0.0],[434,42,0.0,0.258,0.742,0.0,0.0,0.0,0.0,0.0],[420,56,0.0,0.003,0.997,0.0,0.0,0.0,0.0,0.0],[434,56,0.0,0.024,0.976,0.0,0.0,0.0,0.0,0.0],[448,42,0.0,0.568,0.432,0.0,0.0,0.0,0.0,0.0],[448,56,0.0,0.126,0.874,0.0,0.0,0.0,0.0,0.0],[462,42,0.0,0.841,0.159,0.0,0.0,0.0,0.0,0.0],[462,56,0.0,0.375,0.625,0.0,0.0,0.0,0.0,0.0],[476,42,0.0,0.966,0.034,0.0,0.0,0.0,0.0,0.0],[476,56,0.0,0.697,0.303,0.0,0.0,0.0,0.0,0.0],[574,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[588,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[602,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[616,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[630,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[644,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[658,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[672,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[686,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[700,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[714,56,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[280,70,0.0,0.001,0.999,0.0,0.0,0.0,0.0,0.0],[294,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,56,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,70,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,70,0.0,0.007,0.993,0.0,0.0,0.0,0.0,0.0],[462,70,0.0,0.051,0.949,0.0,0.0,0.0,0.0,0.0],[476,70,0.0,0.212,0.788,0.0,0.0,0.0,0.0,0.0],[490,56,0.0,0.911,0.089,0.0,0.0,0.0,0.0,0.0],[490,70,0.0,0.513,0.487,0.0,0.0,0.0,0.0,0.0],[504,56,0.0,0.985,0.015,0.0,0.0,0.0,0.0,0.0],[504,70,0.0,0.807,0.193,0.0,0.0,0.0,0.0,0.0],[546,56,0.0,0.139,0.0,0.0,0.0,0.0,0.861,0.0],[560,56,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[546,70,0.0,0.139,0.0,0.0,0.0,0.0,0.861,0.0],[560,70,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[574,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[588,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[602,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[616,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[630,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[644,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[658,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[672,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[686,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[700,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[714,70,0.0,0.0,0.0,0.0,0.0,-0.0,1.0,0.0],[728,56,0.0,0.018,0.0,0.0,0.0,0.0,0.982,0.0],[728,70,0.0,0.018,0.0,0.0,0.0,0.0,0.982,0.0],[280,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,84,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,84,0.0,0.002,0.998,0.0,0.0,0.0,0.0,0.0],[476,84,0.0,0.017,0.983,0.0,0.0,0.0,0.0,0.0],[490,84,0.0,0.1,0.9,0.0,0.0,0.0,0.0,0.0],[504,84,0.0,0.327,0.673,0.0,0.0,0.0,0.0,0.0],[518,70,0.0,0.955,0.045,0.0,0.0,0.0,0.0,0.0],[518,84,0.0,0.651,0.349,0.0,0.0,0.0,0.0,0.0],[532,70,0.0,0.889,0.006,0.0,0.0,0.0,0.105,0.0],[532,84,0.0,0.784,0.111,0.0,0.0,0.0,0.105,0.0],[546,84,0.0,0.119,0.02,0.0,0.0,0.0,0.861,0.0],[560,84,0.0,0.0,0.002,0.0,0.0,0.0,0.998,0.0],[574,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[588,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[602,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[616,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[630,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[644,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[658,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[672,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[686,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[700,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[714,84,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0],[728,84,0.0,0.019,0.0,0.0,0.0,0.0,0.981,0.0],[266,84,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[266,98,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,98,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,98,0.0,0.005,0.995,0.0,0.0,0.0,0.0,0.0],[504,98,0.0,0.039,0.961,0.0,0.0,0.0,0.0,0.0],[518,98,0.0,0.177,0.822,0.0,0.0,0.0,0.0,0.0],[532,98,0.0,0.36,0.536,0.0,0.0,0.0,0.104,0.0],[546,98,0.0,0.0,0.211,0.0,0.0,0.0,0.789,0.0],[560,98,0.0,0.0,0.055,0.0,0.0,0.0,0.945,0.0],[574,98,0.0,0.001,0.008,0.0,0.0,0.0,0.991,0.0],[588,98,0.0,0.008,0.001,0.0,0.0,0.0,0.991,0.0],[602,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[616,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[630,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[644,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[658,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[672,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[686,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[700,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[714,98,0.0,0.009,0.0,0.0,0.0,0.0,0.991,0.0],[728,98,0.0,0.027,0.0,0.0,0.0,0.0,0.973,0.0],[266,112,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,112,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,112,0.0,0.001,0.999,0.0,0.0,0.0,0.0,0.0],[518,112,0.0,0.012,0.987,0.0,0.0,0.0,0.0,0.0],[532,112,0.0,0.0,0.904,0.0,0.0,0.0,0.096,0.0],[546,112,0.0,0.0,0.472,0.0,0.0,0.0,0.528,0.0],[560,112,0.0,0.0,0.299,0.0,0.0,0.0,0.701,0.0],[574,112,0.0,0.0,0.125,0.0,0.0,0.0,0.875,0.0],[588,112,0.0,0.052,0.018,0.0,0.0,0.0,0.929,0.0],[602,112,0.0,0.07,0.001,0.0,0.0,0.0,0.929,0.0],[616,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[630,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[644,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[658,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[672,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[686,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[700,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[714,112,0.0,0.071,0.0,0.0,0.0,0.0,0.929,0.0],[728,112,0.0,0.088,0.0,0.0,0.0,0.0,0.912,0.0],[238,112,0.0,0.855,0.145,0.0,0.0,0.0,0.0,0.0],[252,112,0.0,0.308,0.692,0.0,0.0,0.0,0.0,0.0],[238,126,0.0,0.855,0.145,0.0,0.0,0.0,0.0,0.0],[252,126,0.0,0.308,0.692,0.0,0.0,0.0,0.0,0.0],[266,126,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,126,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,126,0.0,0.0,0.918,0.0,0.0,0.0,0.082,0.0],[546,126,0.0,0.0,0.571,0.0,0.0,0.0,0.429,0.0],[560,126,0.0,0.0,0.501,0.0,0.0,0.0,0.499,0.0],[574,126,0.0,0.0,0.382,0.0,0.0,0.0,0.618,0.0],[588,126,0.0,0.035,0.118,0.0,0.0,0.0,0.847,0.0],[602,126,0.0,0.148,0.005,0.0,0.0,0.0,0.847,0.0],[616,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[630,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[644,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[658,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[672,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[686,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[700,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[714,126,0.0,0.153,0.0,0.0,0.0,0.0,0.847,0.0],[728,126,0.0,0.169,0.0,0.0,0.0,0.0,0.831,0.0],[224,126,0.0,0.996,0.004,0.0,0.0,0.0,0.0,0.0],[224,140,0.0,0.996,0.004,0.0,0.0,0.0,0.0,0.0],[238,140,0.0,0.855,0.145,0.0,0.0,0.0,0.0,0.0],[252,140,0.0,0.308,0.692,0.0,0.0,0.0,0.0,0.0],[266,140,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,140,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,140,0.0,0.0,0.925,0.0,0.0,0.0,0.075,0.0],[546,140,0.0,0.0,0.603,0.0,0.0,0.0,0.397,0.0],[560,140,0.0,0.0,0.563,0.0,0.0,0.0,0.437,0.0],[574,140,0.0,0.0,0.502,0.0,0.0,0.0,0.498,0.0],[588,140,0.0,0.016,0.219,0.0,0.0,0.0,0.765,0.0],[602,140,0.0,0.225,0.01,0.0,0.0,0.0,0.765,0.0],[616,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[630,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[644,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[658,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[672,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[686,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[700,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[714,140,0.0,0.235,0.0,0.0,0.0,0.0,0.765,0.0],[728,140,0.0,0.249,0.0,0.0,0.0,0.0,0.751,0.0],[224,154,0.0,0.995,0.004,0.0,0.0,0.0,0.0,0.0],[238,154,0.0,0.855,0.145,0.0,0.0,0.0,0.0,0.0],[252,154,0.0,0.308,0.692,0.0,0.0,0.0,0.0,0.0],[266,154,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,154,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,154,0.0,0.0,0.933,0.0,0.0,0.0,0.067,0.0],[546,154,0.0,0.0,0.63,0.0,0.0,0.0,0.37,0.0],[560,154,0.0,0.0,0.593,0.0,0.0,0.0,0.407,0.0],[574,154,0.0,0.0,0.546,0.0,0.0,0.0,0.454,0.0],[588,154,0.0,0.056,0.261,0.0,0.0,0.0,0.682,0.0],[602,154,0.0,0.303,0.014,0.0,0.0,0.0,0.682,0.0],[616,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[630,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[644,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[658,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[672,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[686,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[700,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[714,154,0.0,0.318,0.0,0.0,0.0,0.0,0.682,0.0],[728,154,0.0,0.33,0.0,0.0,0.0,0.0,0.67,0.0],[126,154,0.0,0.974,0.0,0.026,0.0,0.0,0.0,0.0],[140,154,0.0,0.974,0.0,0.026,0.0,0.0,0.0,0.0],[126,168,0.0,0.651,0.0,0.349,0.0,0.0,0.0,0.0],[140,168,0.0,0.651,0.0,0.349,0.0,0.0,0.0,0.0],[154,154,0.0,0.974,0.0,0.026,0.0,0.0,0.0,0.0],[154,168,0.0,0.651,0.0,0.349,0.0,0.0,0.0,0.0],[168,154,0.0,0.974,0.0,0.026,0.0,0.0,0.0,0.0],[168,168,0.0,0.651,0.0,0.349,0.0,0.0,0.0,0.0],[182,154,0.0,0.975,0.0,0.025,0.0,0.0,0.0,0.0],[182,168,0.0,0.656,0.0,0.344,0.0,0.0,0.0,0.0],[196,154,0.0,0.982,0.0,0.018,0.0,0.0,0.0,0.0],[196,168,0.0,0.735,0.0,0.265,0.0,0.0,0.0,0.0],[224,168,0.0,0.99,0.004,0.006,0.0,0.0,0.0,0.0],[238,168,0.0,0.855,0.145,0.0,0.0,0.0,0.0,0.0],[252,168,0.0,0.309,0.691,0.0,0.0,0.0,0.0,0.0],[266,168,0.0,0.02,0.98,0.0,0.0,0.0,0.0,0.0],[280,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,168,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,168,0.0,0.0,0.941,0.0,0.0,0.0,0.059,0.0],[546,168,0.0,0.0,0.659,0.0,0.0,0.0,0.341,0.0],[560,168,0.0,0.0,0.624,0.0,0.0,0.0,0.376,0.0],[574,168,0.0,0.0,0.585,0.0,0.0,0.0,0.415,0.0],[588,168,0.0,0.103,0.297,0.0,0.0,0.0,0.6,0.0],[602,168,0.0,0.382,0.018,0.0,0.0,0.0,0.6,0.0],[616,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[630,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[644,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[658,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[672,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[686,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[700,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[714,168,0.0,0.4,0.0,0.0,0.0,0.0,0.6,0.0],[728,168,0.0,0.411,0.0,0.0,0.0,0.0,0.589,0.0],[98,168,0.0,0.735,0.0,0.265,0.0,0.0,0.0,0.0],[112,168,0.0,0.656,0.0,0.344,0.0,0.0,0.0,0.0],[98,182,0.0,0.343,0.0,0.657,0.0,0.0,0.0,0.0],[112,182,0.0,0.133,0.0,0.867,0.0,0.0,0.0,0.0],[126,182,0.0,0.122,0.0,0.878,0.0,0.0,0.0,0.0],[140,182,0.0,0.122,0.0,0.878,0.0,0.0,0.0,0.0],[154,182,0.0,0.122,0.0,0.878,0.0,0.0,0.0,0.0],[168,182,0.0,0.122,0.0,0.878,0.0,0.0,0.0,0.0],[182,182,0.0,0.127,0.0,0.873,0.0,0.0,0.0,0.0],[196,182,0.0,0.236,0.0,0.764,0.0,0.0,0.0,0.0],[224,182,0.0,0.933,0.004,0.062,0.0,0.0,0.0,0.0],[238,182,0.0,0.856,0.141,0.003,0.0,0.0,0.0,0.0],[252,182,0.0,0.316,0.684,0.0,0.0,0.0,0.0,0.0],[266,182,0.0,0.021,0.979,0.0,0.0,0.0,0.0,0.0],[280,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,182,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,182,0.0,0.0,0.948,0.0,0.0,0.0,0.052,0.0],[546,182,0.0,0.0,0.692,0.0,0.0,0.0,0.308,0.0],[560,182,0.0,0.0,0.658,0.0,0.0,0.0,0.342,0.0],[574,182,0.0,0.0,0.627,0.0,0.0,0.0,0.373,0.0],[588,182,0.0,0.148,0.334,0.0,0.0,0.0,0.518,0.0],[602,182,0.0,0.459,0.024,0.0,0.0,0.0,0.518,0.0],[616,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[630,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[644,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[658,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[672,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[686,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[700,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[714,182,0.0,0.482,0.0,0.0,0.0,0.0,0.518,0.0],[728,182,0.0,0.492,0.0,0.0,0.0,0.0,0.508,0.0],[84,182,0.0,0.835,0.0,0.165,0.0,0.0,0.0,0.0],[84,196,0.0,0.829,0.0,0.171,0.0,0.0,0.0,0.0],[98,196,0.0,0.275,0.0,0.725,0.0,0.0,0.0,0.0],[112,196,0.0,0.019,0.0,0.981,0.0,0.0,0.0,0.0],[126,196,0.0,0.003,0.0,0.997,0.0,0.0,0.0,0.0],[140,196,0.0,0.003,0.0,0.997,0.0,0.0,0.0,0.0],[154,196,0.0,0.003,0.0,0.997,0.0,0.0,0.0,0.0],[168,196,0.0,0.003,0.0,0.997,0.0,0.0,0.0,0.0],[182,196,0.0,0.004,0.0,0.996,0.0,0.0,0.0,0.0],[196,196,0.0,0.032,0.0,0.968,0.0,0.0,0.0,0.0],[210,182,0.0,0.63,0.0,0.37,0.0,0.0,0.0,0.0],[210,196,0.0,0.258,0.0,0.742,0.0,0.0,0.0,0.0],[224,196,0.0,0.712,0.003,0.285,0.0,0.0,0.0,0.0],[238,196,0.0,0.849,0.114,0.037,0.0,0.0,0.0,0.0],[252,196,0.0,0.368,0.631,0.001,0.0,0.0,0.0,0.0],[266,196,0.0,0.031,0.969,0.0,0.0,0.0,0.0,0.0],[280,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[294,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,196,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,196,0.0,0.0,0.956,0.0,0.0,0.0,0.044,0.0],[546,196,0.0,0.0,0.727,0.0,0.0,0.0,0.273,0.0],[560,196,0.0,0.0,0.696,0.0,0.0,0.0,0.304,0.0],[602,196,0.0,0.539,0.026,0.0,0.0,0.0,0.435,0.0],[616,196,0.0,0.564,0.0,0.0,0.0,0.0,0.435,0.0],[630,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[644,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[658,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[672,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[686,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[700,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[714,196,0.0,0.565,0.0,0.0,0.0,0.0,0.435,0.0],[728,196,0.0,0.573,0.0,0.0,0.0,0.0,0.427,0.0],[70,196,0.0,0.994,0.0,0.006,0.0,0.0,0.0,0.0],[70,210,0.0,0.995,0.0,0.005,0.0,0.0,0.0,0.0],[84,210,0.0,0.845,0.0,0.155,0.0,0.0,0.0,0.0],[98,210,0.0,0.296,0.0,0.704,0.0,0.0,0.0,0.0],[112,210,0.0,0.018,0.0,0.982,0.0,0.0,0.0,0.0],[126,210,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[140,210,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[154,210,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[168,210,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[182,210,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[196,210,0.0,0.002,0.0,0.998,0.0,0.0,0.0,0.0],[210,210,0.0,0.053,0.0,0.947,0.0,0.0,0.0,0.0],[224,210,0.0,0.344,0.001,0.654,0.0,0.0,0.0,0.0],[238,210,0.0,0.724,0.07,0.205,0.0,0.0,0.0,0.0],[252,210,0.0,0.458,0.521,0.021,0.0,0.0,0.0,0.0],[266,210,0.0,0.057,0.943,0.001,0.0,0.0,0.0,0.0],[280,210,0.0,0.001,0.999,0.0,0.0,0.0,0.0,0.0],[294,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,210,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,210,0.0,0.0,0.964,0.0,0.0,0.0,0.036,0.0],[546,210,0.0,0.0,0.767,0.0,0.0,0.0,0.233,0.0],[560,210,0.0,0.0,0.735,0.0,0.0,0.0,0.265,0.0],[574,196,0.0,0.0,0.666,0.0,0.0,0.0,0.334,0.0],[574,210,0.0,0.0,0.677,0.0,0.0,0.0,0.323,0.0],[588,196,0.0,0.223,0.342,0.0,0.0,0.0,0.435,0.0],[588,210,0.0,0.424,0.223,0.0,0.0,0.0,0.353,0.0],[602,210,0.0,0.634,0.014,0.0,0.0,0.0,0.353,0.0],[616,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[630,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[644,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[658,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[672,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[686,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[700,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[714,210,0.0,0.647,0.0,0.0,0.0,0.0,0.353,0.0],[728,210,0.0,0.654,0.0,0.0,0.0,0.0,0.346,0.0],[70,224,0.0,0.996,0.0,0.004,0.0,0.0,0.0,0.0],[84,224,0.0,0.86,0.0,0.14,0.0,0.0,0.0,0.0],[98,224,0.0,0.318,0.0,0.682,0.0,0.0,0.0,0.0],[112,224,0.0,0.021,0.0,0.979,0.0,0.0,0.0,0.0],[126,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[140,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[154,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[168,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[182,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[196,224,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[210,224,0.0,0.005,0.0,0.995,0.0,0.0,0.0,0.0],[224,224,0.0,0.086,0.0,0.914,0.0,0.0,0.0,0.0],[238,224,0.0,0.405,0.038,0.557,0.0,0.0,0.0,0.0],[252,224,0.0,0.458,0.401,0.141,0.0,0.0,0.0,0.0],[266,224,0.0,0.09,0.899,0.011,0.0,0.0,0.0,0.0],[280,224,0.0,0.002,0.997,0.0,0.0,0.0,0.0,0.0],[294,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,224,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,224,0.0,0.0,0.972,0.0,0.0,0.0,0.028,0.0],[546,224,0.0,0.0,0.81,0.0,0.0,0.0,0.19,0.0],[560,224,0.0,0.0,0.768,0.0,0.0,0.0,0.232,0.0],[574,224,0.0,0.271,0.459,0.0,0.0,0.0,0.271,0.0],[588,224,0.0,0.657,0.072,0.0,0.0,0.0,0.271,0.0],[602,224,0.0,0.727,0.002,0.0,0.0,0.0,0.271,0.0],[616,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[630,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[644,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[658,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[672,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[686,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[700,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[714,224,0.0,0.729,0.0,0.0,0.0,0.0,0.271,0.0],[728,224,0.0,0.734,0.0,0.0,0.0,0.0,0.266,0.0],[56,224,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[56,238,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[70,238,0.0,0.997,0.0,0.003,0.0,0.0,0.0,0.0],[84,238,0.0,0.876,0.0,0.124,0.0,0.0,0.0,0.0],[98,238,0.0,0.345,0.0,0.655,0.0,0.0,0.0,0.0],[112,238,0.0,0.026,0.0,0.974,0.0,0.0,0.0,0.0],[126,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[140,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[154,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[168,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[182,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[196,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[210,238,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[224,238,0.0,0.01,0.0,0.99,0.0,0.0,0.0,0.0],[238,238,0.0,0.115,0.019,0.866,0.0,0.0,0.0,0.0],[252,238,0.0,0.255,0.289,0.456,0.0,0.0,0.0,0.0],[266,238,0.0,0.074,0.834,0.092,0.0,0.0,0.0,0.0],[280,238,0.0,0.001,0.994,0.005,0.0,0.0,0.0,0.0],[294,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[308,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,238,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,238,0.0,0.0,0.985,0.0,0.0,0.0,0.015,0.0],[546,238,0.0,0.0,0.874,0.0,0.0,0.0,0.126,0.0],[560,238,0.0,0.132,0.685,0.0,0.0,0.0,0.183,0.0],[574,238,0.0,0.621,0.191,0.0,0.0,0.0,0.188,0.0],[588,238,0.0,0.798,0.013,0.0,0.0,0.001,0.188,0.0],[602,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[616,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[630,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[644,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[658,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[672,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[686,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[700,238,0.0,0.811,0.0,0.0,0.0,0.001,0.188,0.0],[714,238,0.0,0.813,0.0,0.0,0.0,0.0,0.187,0.0],[728,238,0.0,0.827,0.0,0.0,0.0,0.0,0.173,0.0],[56,252,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[70,252,0.0,0.997,0.0,0.003,0.0,0.0,0.0,0.0],[84,252,0.0,0.896,0.0,0.104,0.0,0.0,0.0,0.0],[98,252,0.0,0.407,0.0,0.593,0.0,0.0,0.0,0.0],[112,252,0.0,0.072,0.0,0.928,0.0,0.0,0.0,0.0],[126,252,0.0,0.024,0.0,0.976,0.0,0.0,0.0,0.0],[140,252,0.0,0.012,0.0,0.988,0.0,0.0,0.0,0.0],[154,252,0.0,0.004,0.0,0.996,0.0,0.0,0.0,0.0],[168,252,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[182,252,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[196,252,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[210,252,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[224,252,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[238,252,0.0,0.011,0.008,0.981,0.0,0.0,0.0,0.0],[252,252,0.0,0.001,0.195,0.804,0.0,0.0,0.0,0.0],[266,252,0.0,0.0,0.677,0.323,0.0,0.0,0.0,0.0],[280,252,0.0,0.0,0.947,0.053,0.0,0.0,0.0,0.0],[294,252,0.0,0.0,0.998,0.002,0.0,0.0,0.0,0.0],[308,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,252,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[532,252,0.0,0.007,0.992,0.0,0.0,0.0,0.001,0.0],[546,252,0.0,0.129,0.857,0.0,0.0,0.0,0.014,0.0],[560,252,0.0,0.565,0.388,0.0,0.0,0.001,0.046,0.0],[574,252,0.0,0.851,0.051,0.0,0.0,0.014,0.084,0.0],[602,252,0.0,0.835,0.0,0.0,0.0,0.059,0.106,0.0],[616,252,0.0,0.834,0.0,0.0,0.0,0.06,0.106,0.0],[630,252,0.0,0.834,0.0,0.0,0.0,0.06,0.106,0.0],[644,252,0.0,0.834,0.0,0.0,0.0,0.06,0.106,0.0],[658,252,0.0,0.834,0.0,0.0,0.0,0.06,0.106,0.0],[672,252,0.0,0.834,0.0,0.0,0.0,0.06,0.106,0.0],[686,252,0.0,0.835,0.0,0.0,0.0,0.059,0.106,0.0],[700,252,0.0,0.853,0.0,0.0,0.0,0.046,0.101,0.0],[714,252,0.0,0.912,0.0,0.0,0.0,0.012,0.076,0.0],[56,266,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[70,266,0.0,0.999,0.0,0.001,0.0,0.0,0.0,0.0],[84,266,0.0,0.952,0.0,0.048,0.0,0.0,0.0,0.0],[98,266,0.0,0.695,0.0,0.305,0.0,0.0,0.0,0.0],[112,266,0.0,0.449,0.0,0.551,0.0,0.0,0.0,0.0],[126,266,0.0,0.329,0.0,0.671,0.0,0.0,0.0,0.0],[140,266,0.0,0.224,0.0,0.776,0.0,0.0,0.0,0.0],[154,266,0.0,0.096,0.0,0.904,0.0,0.0,0.0,0.0],[168,266,0.0,0.013,0.0,0.987,0.0,0.0,0.0,0.0],[182,266,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[196,266,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[210,266,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[224,266,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[238,266,0.0,0.0,0.004,0.996,0.0,0.0,0.0,0.0],[252,266,0.0,0.0,0.112,0.888,0.0,0.0,0.0,0.0],[266,266,0.0,0.0,0.471,0.529,0.0,0.0,0.0,0.0],[280,266,0.0,0.0,0.799,0.201,0.0,0.0,0.0,0.0],[294,266,0.0,0.0,0.978,0.022,0.0,0.0,0.0,0.0],[308,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[322,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,266,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[518,266,0.0,0.003,0.997,0.0,0.0,0.0,0.0,0.0],[532,266,0.0,0.063,0.937,0.0,0.0,0.0,0.0,0.0],[546,266,0.0,0.395,0.605,0.0,0.0,0.0,0.0,0.0],[560,266,0.0,0.847,0.145,0.0,0.0,0.008,0.001,0.0],[602,266,0.0,0.469,0.0,0.0,0.0,0.505,0.026,0.0],[616,266,0.0,0.464,0.0,0.0,0.0,0.507,0.029,0.0],[630,266,0.0,0.464,0.0,0.0,0.0,0.507,0.029,0.0],[644,266,0.0,0.464,0.0,0.0,0.0,0.507,0.029,0.0],[658,266,0.0,0.464,0.0,0.0,0.0,0.507,0.029,0.0],[672,266,0.0,0.464,0.0,0.0,0.0,0.507,0.029,0.0],[686,266,0.0,0.471,0.0,0.0,0.0,0.503,0.026,0.0],[700,266,0.0,0.592,0.0,0.0,0.0,0.394,0.014,0.0],[56,280,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[70,280,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[84,280,0.0,0.995,0.0,0.005,0.0,0.0,0.0,0.0],[98,280,0.0,0.963,0.0,0.037,0.0,0.0,0.0,0.0],[112,280,0.0,0.916,0.0,0.084,0.0,0.0,0.0,0.0],[126,280,0.0,0.861,0.0,0.139,0.0,0.0,0.0,0.0],[140,280,0.0,0.763,0.0,0.237,0.0,0.0,0.0,0.0],[154,280,0.0,0.477,0.0,0.523,0.0,0.0,0.0,0.0],[168,280,0.0,0.121,0.0,0.879,0.0,0.0,0.0,0.0],[182,280,0.0,0.009,0.0,0.991,0.0,0.0,0.0,0.0],[196,280,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[210,280,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[224,280,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[238,280,0.0,0.0,0.001,0.999,0.0,0.0,0.0,0.0],[252,280,0.0,0.0,0.066,0.934,0.0,0.0,0.0,0.0],[266,280,0.0,0.0,0.36,0.64,0.0,0.0,0.0,0.0],[280,280,0.0,0.0,0.632,0.368,0.0,0.0,0.0,0.0],[294,280,0.0,0.0,0.902,0.098,0.0,0.0,0.0,0.0],[308,280,0.0,0.0,0.995,0.005,0.0,0.0,0.0,0.0],[322,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[336,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,280,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[504,280,0.0,0.003,0.997,0.0,0.0,0.0,0.0,0.0],[518,280,0.0,0.054,0.946,0.0,0.0,0.0,0.0,0.0],[532,280,0.0,0.308,0.692,0.0,0.0,0.0,0.0,0.0],[546,280,0.0,0.742,0.258,0.0,0.0,0.0,0.0,0.0],[560,280,0.0,0.944,0.03,0.0,0.0,0.027,0.0,0.0],[574,266,0.0,0.849,0.008,0.0,0.0,0.139,0.004,0.0],[588,266,0.0,0.563,0.0,0.0,0.0,0.422,0.015,0.0],[574,280,0.0,0.671,0.001,0.0,0.0,0.329,0.0,0.0],[588,280,0.0,0.177,0.0,0.0,0.0,0.823,0.0,0.0],[602,280,0.0,0.057,0.0,0.0,0.0,0.942,0.0,0.0],[616,280,0.0,0.053,0.0,0.0,0.0,0.946,0.001,0.0],[630,280,0.0,0.053,0.0,0.0,0.0,0.946,0.001,0.0],[644,280,0.0,0.053,0.0,0.0,0.0,0.946,0.001,0.0],[658,280,0.0,0.053,0.0,0.0,0.0,0.946,0.001,0.0],[672,280,0.0,0.053,0.0,0.0,0.0,0.946,0.001,0.0],[686,280,0.0,0.064,0.0,0.0,0.0,0.935,0.0,0.0],[700,280,0.0,0.276,0.0,0.0,0.0,0.724,0.0,0.0],[56,294,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[70,294,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[84,294,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[98,294,0.0,0.999,0.0,0.001,0.0,0.0,0.0,0.0],[112,294,0.0,0.998,0.0,0.002,0.0,0.0,0.0,0.0],[126,294,0.0,0.995,0.0,0.005,0.0,0.0,0.0,0.0],[140,294,0.0,0.981,0.0,0.019,0.0,0.0,0.0,0.0],[154,294,0.0,0.847,0.0,0.153,0.0,0.0,0.0,0.0],[168,294,0.0,0.435,0.0,0.565,0.0,0.0,0.0,0.0],[182,294,0.0,0.087,0.0,0.913,0.0,0.0,0.0,0.0],[196,294,0.0,0.005,0.0,0.995,0.0,0.0,0.0,0.0],[210,294,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[224,294,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[238,294,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[252,294,0.0,0.0,0.034,0.966,0.0,0.0,0.0,0.0],[266,294,0.0,0.0,0.27,0.73,0.0,0.0,0.0,0.0],[280,294,0.0,0.0,0.51,0.49,0.0,0.0,0.0,0.0],[294,294,0.0,0.0,0.754,0.246,0.0,0.0,0.0,0.0],[308,294,0.0,0.0,0.966,0.034,0.0,0.0,0.0,0.0],[322,294,0.0,0.0,0.999,0.001,0.0,0.0,0.0,0.0],[336,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[476,294,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[490,294,0.0,0.003,0.997,0.0,0.0,0.0,0.0,0.0],[504,294,0.0,0.054,0.946,0.0,0.0,0.0,0.0,0.0],[518,294,0.0,0.305,0.695,0.0,0.0,0.0,0.0,0.0],[532,294,0.0,0.722,0.278,0.0,0.0,0.0,0.0,0.0],[546,294,0.0,0.954,0.045,0.0,0.0,0.001,0.0,0.0],[560,294,0.0,0.937,0.002,0.0,0.0,0.061,0.0,0.0],[574,294,0.0,0.516,0.0,0.0,0.0,0.484,0.0,0.0],[588,294,0.0,0.071,0.0,0.0,0.0,0.929,0.0,0.0],[602,294,0.0,0.002,0.0,0.0,0.0,0.998,0.0,0.0],[616,294,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[630,294,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[644,294,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[658,294,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[672,294,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[686,294,0.0,0.012,0.0,0.0,0.0,0.988,0.0,0.0],[700,294,0.0,0.236,0.0,0.0,0.0,0.764,0.0,0.0],[714,280,0.0,0.809,0.0,0.0,0.0,0.191,0.0,0.0],[714,294,0.0,0.798,0.0,0.0,0.0,0.202,0.0,0.0],[154,308,0.0,0.979,0.0,0.021,0.0,0.0,0.0,0.0],[168,308,0.0,0.797,0.0,0.203,0.0,0.0,0.0,0.0],[182,308,0.0,0.359,0.0,0.641,0.0,0.0,0.0,0.0],[196,308,0.0,0.061,0.0,0.939,0.0,0.0,0.0,0.0],[210,308,0.0,0.004,0.0,0.996,0.0,0.0,0.0,0.0],[224,308,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[238,308,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0],[252,308,0.0,0.0,0.009,0.991,0.0,0.0,0.0,0.0],[266,308,0.0,0.0,0.119,0.881,0.0,0.0,0.0,0.0],[280,308,0.0,0.0,0.342,0.658,0.0,0.0,0.0,0.0],[294,308,0.0,0.0,0.573,0.427,0.0,0.0,0.0,0.0],[308,308,0.0,0.0,0.871,0.129,0.0,0.0,0.0,0.0],[322,308,0.0,0.0,0.993,0.007,0.0,0.0,0.0,0.0],[336,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[350,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[364,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[378,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[392,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[406,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[420,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[434,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[448,308,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0],[462,308,0.0,0.001,0.999,0.0,0.0,0.0,0.0,0.0],[476,308,0.0,0.006,0.994,0.0,0.0,0.0,0.0,0.0],[490,308,0.0,0.056,0.944,0.0,0.0,0.0,0.0,0.0],[504,308,0.0,0.305,0.695,0.0,0.0,0.0,0.0,0.0],[518,308,0.0,0.722,0.278,0.0,0.0,0.0,0.0,0.0],[532,308,0.0,0.954,0.046,0.0,0.0,0.0,0.0,0.0],[546,308,0.0,0.994,0.003,0.0,0.0,0.004,0.0,0.0],[560,308,0.0,0.879,0.0,0.0,0.0,0.121,0.0,0.0],[574,308,0.0,0.368,0.0,0.0,0.0,0.632,0.0,0.0],[588,308,0.0,0.032,0.0,0.0,0.0,0.968,0.0,0.0],[602,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,308,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,308,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,308,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[714,308,0.0,0.798,0.0,0.0,0.0,0.202,0.0,0.0],[154,322,0.0,0.999,0.0,0.001,0.0,0.0,0.0,0.0],[168,322,0.0,0.966,0.0,0.034,0.0,0.0,0.0,0.0],[182,322,0.0,0.74,0.0,0.26,0.0,0.0,0.0,0.0],[196,322,0.0,0.314,0.0,0.686,0.0,0.0,0.0,0.0],[210,322,0.0,0.074,0.0,0.926,0.0,0.0,0.0,0.0],[224,322,0.0,0.011,0.0,0.989,0.0,0.0,0.0,0.0],[238,322,0.0,0.001,0.0,0.999,0.0,0.0,0.0,0.0],[252,322,0.0,0.0,0.001,0.999,0.0,0.0,0.0,0.0],[266,322,0.0,0.0,0.014,0.986,0.0,0.0,0.0,0.0],[280,322,0.0,0.0,0.1,0.9,0.0,0.0,0.0,0.0],[294,322,0.0,0.0,0.328,0.672,0.0,0.0,0.0,0.0],[308,322,0.0,0.0,0.721,0.279,0.0,0.0,0.0,0.0],[322,322,0.0,0.043,0.935,0.023,0.0,0.0,0.0,0.0],[336,322,0.0,0.023,0.977,0.0,0.0,0.0,0.0,0.0],[350,322,0.0,0.014,0.986,0.0,0.0,0.0,0.0,0.0],[364,322,0.0,0.009,0.991,0.0,0.0,0.0,0.0,0.0],[378,322,0.0,0.006,0.994,0.0,0.0,0.0,0.0,0.0],[392,322,0.0,0.003,0.997,0.0,0.0,0.0,0.0,0.0],[406,322,0.0,0.002,0.998,0.0,0.0,0.0,0.0,0.0],[420,322,0.0,0.005,0.995,0.0,0.0,0.0,0.0,0.0],[434,322,0.0,0.013,0.987,0.0,0.0,0.0,0.0,0.0],[448,322,0.0,0.032,0.968,0.0,0.0,0.0,0.0,0.0],[462,322,0.0,0.071,0.929,0.0,0.0,0.0,0.0,0.0],[476,322,0.0,0.145,0.855,0.0,0.0,0.0,0.0,0.0],[490,322,0.0,0.347,0.653,0.0,0.0,0.0,0.0,0.0],[504,322,0.0,0.726,0.274,0.0,0.0,0.0,0.0,0.0],[518,322,0.0,0.955,0.045,0.0,0.0,0.0,0.0,0.0],[532,322,0.0,0.997,0.003,0.0,0.0,0.0,0.0,0.0],[546,322,0.0,0.989,0.0,0.0,0.0,0.011,0.0,0.0],[560,322,0.0,0.787,0.0,0.0,0.0,0.213,0.0,0.0],[574,322,0.0,0.238,0.0,0.0,0.0,0.762,0.0,0.0],[588,322,0.0,0.013,0.0,0.0,0.0,0.987,0.0,0.0],[602,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,322,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,322,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,322,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[714,322,0.0,0.798,0.0,0.0,0.0,0.202,0.0,0.0],[154,336,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,336,0.0,0.998,0.0,0.002,0.0,0.0,0.0,0.0],[182,336,0.0,0.956,0.0,0.044,0.0,0.0,0.0,0.0],[196,336,0.0,0.761,0.0,0.239,0.0,0.0,0.0,0.0],[210,336,0.0,0.445,0.0,0.555,0.0,0.0,0.0,0.0],[224,336,0.0,0.174,0.0,0.826,0.0,0.0,0.0,0.0],[238,336,0.0,0.042,0.0,0.958,0.0,0.0,0.0,0.0],[252,336,0.0,0.011,0.0,0.989,0.0,0.0,0.0,0.0],[266,336,0.0,0.044,0.0,0.956,0.0,0.0,0.0,0.0],[280,336,0.0,0.177,0.007,0.817,0.0,0.0,0.0,0.0],[294,336,0.0,0.415,0.063,0.522,0.0,0.0,0.0,0.0],[308,336,0.0,0.564,0.269,0.166,0.0,0.0,0.0,0.0],[322,336,0.0,0.442,0.545,0.013,0.0,0.0,0.0,0.0],[336,336,0.0,0.322,0.678,0.0,0.0,0.0,0.0,0.0],[350,336,0.0,0.26,0.74,0.0,0.0,0.0,0.0,0.0],[364,336,0.0,0.207,0.793,0.0,0.0,0.0,0.0,0.0],[378,336,0.0,0.162,0.838,0.0,0.0,0.0,0.0,0.0],[392,336,0.0,0.123,0.877,0.0,0.0,0.0,0.0,0.0],[406,336,0.0,0.103,0.897,0.0,0.0,0.0,0.0,0.0],[420,336,0.0,0.141,0.859,0.0,0.0,0.0,0.0,0.0],[434,336,0.0,0.238,0.762,0.0,0.0,0.0,0.0,0.0],[448,336,0.0,0.368,0.632,0.0,0.0,0.0,0.0,0.0],[462,336,0.0,0.516,0.484,0.0,0.0,0.0,0.0,0.0],[476,336,0.0,0.666,0.334,0.0,0.0,0.0,0.0,0.0],[490,336,0.0,0.827,0.173,0.0,0.0,0.0,0.0,0.0],[504,336,0.0,0.961,0.039,0.0,0.0,0.0,0.0,0.0],[518,336,0.0,0.997,0.003,0.0,0.0,0.0,0.0,0.0],[532,336,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,336,0.0,0.973,0.0,0.0,0.0,0.027,0.0,0.0],[560,336,0.0,0.662,0.0,0.0,0.0,0.338,0.0,0.0],[574,336,0.0,0.138,0.0,0.0,0.0,0.862,0.0,0.0],[588,336,0.0,0.005,0.0,0.0,0.0,0.995,0.0,0.0],[602,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,336,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,336,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,336,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[714,336,0.0,0.798,0.0,0.0,0.0,0.202,0.0,0.0],[168,350,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,350,0.0,0.998,0.0,0.002,0.0,0.0,0.0,0.0],[196,350,0.0,0.977,0.0,0.023,0.0,0.0,0.0,0.0],[210,350,0.0,0.884,0.0,0.116,0.0,0.0,0.0,0.0],[224,350,0.0,0.656,0.0,0.344,0.0,0.0,0.0,0.0],[238,350,0.0,0.353,0.0,0.647,0.0,0.0,0.0,0.0],[252,350,0.0,0.196,0.0,0.804,0.0,0.0,0.0,0.0],[266,350,0.0,0.356,0.0,0.644,0.0,0.0,0.0,0.0],[280,350,0.0,0.665,0.0,0.335,0.0,0.0,0.0,0.0],[294,350,0.0,0.889,0.003,0.109,0.0,0.0,0.0,0.0],[308,350,0.0,0.955,0.027,0.019,0.0,0.0,0.0,0.0],[322,350,0.0,0.911,0.088,0.001,0.0,0.0,0.0,0.0],[336,350,0.0,0.86,0.14,0.0,0.0,0.0,0.0,0.0],[350,350,0.0,0.816,0.184,0.0,0.0,0.0,0.0,0.0],[364,350,0.0,0.767,0.233,0.0,0.0,0.0,0.0,0.0],[378,350,0.0,0.712,0.288,0.0,0.0,0.0,0.0,0.0],[392,350,0.0,0.651,0.349,0.0,0.0,0.0,0.0,0.0],[406,350,0.0,0.612,0.388,0.0,0.0,0.0,0.0,0.0],[420,350,0.0,0.672,0.328,0.0,0.0,0.0,0.0,0.0],[434,350,0.0,0.787,0.213,0.0,0.0,0.0,0.0,0.0],[448,350,0.0,0.879,0.121,0.0,0.0,0.0,0.0,0.0],[462,350,0.0,0.939,0.061,0.0,0.0,0.0,0.0,0.0],[476,350,0.0,0.973,0.027,0.0,0.0,0.0,0.0,0.0],[490,350,0.0,0.991,0.009,0.0,0.0,0.0,0.0,0.0],[504,350,0.0,0.999,0.001,0.0,0.0,0.0,0.0,0.0],[518,350,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,350,0.0,0.999,0.0,0.0,0.0,0.001,0.0,0.0],[546,350,0.0,0.939,0.0,0.0,0.0,0.061,0.0,0.0],[560,350,0.0,0.516,0.0,0.0,0.0,0.484,0.0,0.0],[574,350,0.0,0.071,0.0,0.0,0.0,0.929,0.0,0.0],[588,350,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[602,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,350,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,350,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,350,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[714,350,0.0,0.798,0.0,0.0,0.0,0.202,0.0,0.0],[168,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,364,0.0,0.994,0.0,0.006,0.0,0.0,0.0,0.0],[224,364,0.0,0.959,0.0,0.041,0.0,0.0,0.0,0.0],[238,364,0.0,0.839,0.0,0.161,0.0,0.0,0.0,0.0],[252,364,0.0,0.728,0.0,0.272,0.0,0.0,0.0,0.0],[266,364,0.0,0.84,0.0,0.16,0.0,0.0,0.0,0.0],[280,364,0.0,0.961,0.0,0.039,0.0,0.0,0.0,0.0],[294,364,0.0,0.995,0.0,0.005,0.0,0.0,0.0,0.0],[308,364,0.0,0.999,0.0,0.0,0.0,0.0,0.0,0.0],[322,364,0.0,0.998,0.002,0.0,0.0,0.0,0.0,0.0],[336,364,0.0,0.996,0.004,0.0,0.0,0.0,0.0,0.0],[350,364,0.0,0.993,0.007,0.0,0.0,0.0,0.0,0.0],[364,364,0.0,0.989,0.011,0.0,0.0,0.0,0.0,0.0],[378,364,0.0,0.982,0.018,0.0,0.0,0.0,0.0,0.0],[392,364,0.0,0.974,0.026,0.0,0.0,0.0,0.0,0.0],[406,364,0.0,0.967,0.033,0.0,0.0,0.0,0.0,0.0],[420,364,0.0,0.976,0.024,0.0,0.0,0.0,0.0,0.0],[434,364,0.0,0.989,0.011,0.0,0.0,0.0,0.0,0.0],[448,364,0.0,0.996,0.004,0.0,0.0,0.0,0.0,0.0],[462,364,0.0,0.999,0.001,0.0,0.0,0.0,0.0,0.0],[476,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,364,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,364,0.0,0.996,0.0,0.0,0.0,0.004,0.0,0.0],[546,364,0.0,0.879,0.0,0.0,0.0,0.121,0.0,0.0],[560,364,0.0,0.368,0.0,0.0,0.0,0.632,0.0,0.0],[574,364,0.0,0.032,0.0,0.0,0.0,0.968,0.0,0.0],[588,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[602,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,364,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,364,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,364,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[168,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,378,0.0,0.999,0.0,0.001,0.0,0.0,0.0,0.0],[238,378,0.0,0.992,0.0,0.008,0.0,0.0,0.0,0.0],[252,378,0.0,0.982,0.0,0.018,0.0,0.0,0.0,0.0],[266,378,0.0,0.992,0.0,0.008,0.0,0.0,0.0,0.0],[280,378,0.0,0.999,0.0,0.001,0.0,0.0,0.0,0.0],[294,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,378,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,378,0.0,0.989,0.0,0.0,0.0,0.011,0.0,0.0],[546,378,0.0,0.787,0.0,0.0,0.0,0.213,0.0,0.0],[560,378,0.0,0.238,0.0,0.0,0.0,0.762,0.0,0.0],[574,378,0.0,0.013,0.0,0.0,0.0,0.987,0.0,0.0],[588,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[602,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[658,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[672,378,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[686,378,0.0,0.011,0.0,0.0,0.0,0.989,0.0,0.0],[700,378,0.0,0.235,0.0,0.0,0.0,0.765,0.0,0.0],[196,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,392,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,392,0.0,0.977,0.0,0.0,0.0,0.023,0.0,0.0],[546,392,0.0,0.683,0.0,0.0,0.0,0.317,0.0,0.0],[560,392,0.0,0.148,0.0,0.0,0.0,0.852,0.0,0.0],[574,392,0.0,0.005,0.0,0.0,0.0,0.995,0.0,0.0],[588,392,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[602,392,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[616,392,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[630,392,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0],[644,392,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[658,392,0.0,0.002,0.0,0.0,0.0,0.998,0.0,0.0],[672,392,0.0,0.003,0.0,0.0,0.0,0.997,0.0,0.0],[686,392,0.0,0.017,0.0,0.0,0.0,0.983,0.0,0.0],[700,392,0.0,0.241,0.0,0.0,0.0,0.759,0.0,0.0],[196,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,406,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,406,0.0,0.979,0.0,0.0,0.0,0.021,0.0,0.0],[546,406,0.0,0.705,0.0,0.0,0.0,0.295,0.0,0.0],[560,406,0.0,0.178,0.0,0.0,0.0,0.822,0.0,0.0],[574,406,0.0,0.01,0.0,0.0,0.0,0.99,0.0,0.0],[588,406,0.0,0.001,0.0,0.0,0.0,0.999,0.0,0.0],[602,406,0.0,0.006,0.0,0.0,0.0,0.994,0.0,0.0],[616,406,0.0,0.019,0.0,0.0,0.0,0.981,0.0,0.0],[630,406,0.0,0.035,0.0,0.0,0.0,0.965,0.0,0.0],[644,406,0.0,0.054,0.0,0.0,0.0,0.946,0.0,0.0],[658,406,0.0,0.08,0.0,0.0,0.0,0.92,0.0,0.0],[672,406,0.0,0.114,0.0,0.0,0.0,0.886,0.0,0.0],[686,406,0.0,0.166,0.0,0.0,0.0,0.834,0.0,0.0],[196,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,420,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,420,0.0,0.994,0.0,0.0,0.0,0.006,0.0,0.0],[546,420,0.0,0.868,0.0,0.0,0.0,0.132,0.0,0.0],[560,420,0.0,0.398,0.0,0.0,0.0,0.602,0.0,0.0],[574,420,0.0,0.058,0.0,0.0,0.0,0.942,0.0,0.0],[588,420,0.0,0.038,0.0,0.0,0.0,0.962,0.0,0.0],[602,420,0.0,0.137,0.0,0.0,0.0,0.863,0.0,0.0],[616,420,0.0,0.287,0.0,0.0,0.0,0.713,0.0,0.0],[630,420,0.0,0.393,0.0,0.0,0.0,0.607,0.0,0.0],[644,420,0.0,0.474,0.0,0.0,0.0,0.526,0.0,0.0],[658,420,0.0,0.554,0.0,0.0,0.0,0.446,0.0,0.0],[672,420,0.0,0.632,0.0,0.0,0.0,0.368,0.0,0.0],[686,420,0.0,0.707,0.0,0.0,0.0,0.293,0.0,0.0],[224,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,434,0.0,0.999,0.0,0.0,0.0,0.001,0.0,0.0],[546,434,0.0,0.968,0.0,0.0,0.0,0.032,0.0,0.0],[560,434,0.0,0.695,0.0,0.0,0.0,0.305,0.0,0.0],[574,434,0.0,0.293,0.0,0.0,0.0,0.707,0.0,0.0],[588,434,0.0,0.35,0.0,0.0,0.0,0.65,0.0,0.0],[602,434,0.0,0.621,0.0,0.0,0.0,0.379,0.0,0.0],[616,434,0.0,0.821,0.0,0.0,0.0,0.179,0.0,0.0],[630,434,0.0,0.897,0.0,0.0,0.0,0.103,0.0,0.0],[644,434,0.0,0.93,0.0,0.0,0.0,0.07,0.0,0.0],[658,434,0.0,0.953,0.0,0.0,0.0,0.047,0.0,0.0],[672,434,0.0,0.97,0.0,0.0,0.0,0.03,0.0,0.0],[210,434,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,448,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,448,0.0,0.996,0.0,0.0,0.0,0.004,0.0,0.0],[560,448,0.0,0.924,0.0,0.0,0.0,0.076,0.0,0.0],[574,448,0.0,0.776,0.0,0.0,0.0,0.224,0.0,0.0],[588,448,0.0,0.845,0.0,0.0,0.0,0.155,0.0,0.0],[602,448,0.0,0.955,0.0,0.0,0.0,0.045,0.0,0.0],[616,448,0.0,0.991,0.0,0.0,0.0,0.009,0.0,0.0],[630,448,0.0,0.997,0.0,0.0,0.0,0.003,0.0,0.0],[644,448,0.0,0.999,0.0,0.0,0.0,0.001,0.0,0.0],[658,448,0.0,0.999,0.0,0.0,0.0,0.001,0.0,0.0],[210,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,462,0.0,0.995,0.0,0.0,0.0,0.005,0.0,0.0],[574,462,0.0,0.986,0.0,0.0,0.0,0.014,0.0,0.0],[588,462,0.0,0.993,0.0,0.0,0.0,0.007,0.0,0.0],[602,462,0.0,0.999,0.0,0.0,0.0,0.001,0.0,0.0],[616,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,462,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,476,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[672,490,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[672,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[672,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[686,504,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[686,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[672,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[686,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[700,518,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[700,532,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.019],[182,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.019],[196,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.019],[210,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.019],[224,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.018],[238,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.017],[252,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.013],[266,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.007],[280,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.002],[294,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.001],[518,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.002],[532,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.003],[546,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.004],[560,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.006],[574,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.007],[588,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.009],[602,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.011],[616,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.013],[630,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.015],[644,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.014],[658,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.01],[672,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.004],[686,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.001],[700,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,546,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.019],[154,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[168,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[182,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[196,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[210,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[224,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[238,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.082],[252,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.071],[266,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.048],[280,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.023],[294,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.005],[308,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.001],[448,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.018],[518,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.031],[532,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.038],[546,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.045],[560,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.052],[574,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.059],[588,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.065],[602,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.071],[616,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.076],[630,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.078],[644,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.075],[658,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.057],[672,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.03],[686,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.009],[700,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.002],[140,560,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.084],[140,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[154,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[168,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[182,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[196,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[210,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[224,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.153],[238,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.152],[252,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.144],[266,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.119],[280,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.074],[294,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.008],[308,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[350,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.001],[434,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.008],[448,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.012],[462,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.039],[518,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.109],[532,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.12],[546,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.128],[560,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.135],[574,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.141],[588,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.145],[602,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.148],[616,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.15],[630,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.151],[644,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.147],[658,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.128],[672,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.085],[686,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.038],[700,574,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.01],[140,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[154,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[168,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[182,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[196,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[210,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[224,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[238,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[252,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.215],[266,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.2],[280,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.117],[294,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.001],[350,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[364,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[378,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.003],[434,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.022],[448,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.054],[462,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.003],[518,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.192],[532,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.209],[546,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.212],[560,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.215],[574,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.216],[588,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.217],[602,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.217],[616,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[630,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.218],[644,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.216],[658,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.204],[672,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.166],[686,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.099],[700,588,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.038],[140,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[154,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[168,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[182,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[196,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[210,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[224,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[238,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[252,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.281],[266,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.263],[280,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.042],[294,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[308,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[322,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[336,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.009],[350,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.002],[364,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[378,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[392,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[406,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[420,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.005],[434,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.036],[448,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.109],[462,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[476,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[490,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[504,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.0],[518,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.219],[532,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.281],[546,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.281],[560,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[574,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[588,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[602,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[616,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[630,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.282],[644,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.281],[658,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.277],[672,602,0.018,0.982,0.0,0.0,0.0,0.0,0.0,0.254],[140,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[154,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[168,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[182,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[196,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[210,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[224,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[238,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[252,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.344],[266,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.232],[280,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[294,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[308,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[322,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.021],[336,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.044],[350,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.009],[364,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.001],[378,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[392,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[406,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[420,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.006],[434,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.046],[448,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.152],[462,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.038],[476,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[490,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[504,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.0],[518,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.165],[532,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.343],[546,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[560,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[574,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[588,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[602,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[616,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[630,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[644,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[658,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.344],[672,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.334],[126,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.345],[126,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[140,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[154,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[168,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[182,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[196,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[210,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[224,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[238,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[252,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.384],[266,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.043],[280,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[294,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[308,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[322,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.151],[336,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.118],[350,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.031],[364,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.004],[378,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[392,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[406,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[420,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.007],[434,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.055],[448,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.186],[462,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.154],[476,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[490,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[504,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.0],[518,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.042],[532,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.391],[546,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[560,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[574,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[588,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[602,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[616,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[630,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[644,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[658,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.409],[672,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.406],[686,616,0.145,0.855,0.0,0.0,0.0,0.0,0.0,0.293],[686,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.386],[112,630,0.273,0.727,0.0,0.0,0.0,0.0,0.0,0.407],[112,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.471],[126,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[140,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[154,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[168,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[182,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[196,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[210,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[224,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[238,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.47],[252,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.296],[266,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[280,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[294,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[308,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[322,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.326],[336,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.205],[350,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.062],[364,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.009],[378,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.001],[392,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[406,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[420,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.008],[434,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.063],[448,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.216],[462,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.281],[476,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[490,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[504,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[518,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.0],[532,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.394],[546,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[560,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[574,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[588,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[602,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[616,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[630,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[644,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[658,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.473],[672,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.472],[686,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.464],[112,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.534],[126,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[140,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[154,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[168,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[182,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[196,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[210,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[224,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[238,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.497],[252,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.025],[266,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[280,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[294,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[308,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.173],[322,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.441],[336,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.268],[350,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.086],[364,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.013],[378,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.001],[392,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[406,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[420,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.009],[434,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.072],[448,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.245],[462,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.392],[476,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[490,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[504,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[518,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.0],[532,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.303],[546,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.534],[560,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[574,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[588,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[602,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[616,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[630,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[644,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[658,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[672,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.536],[686,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.53],[700,644,0.4,0.6,0.0,0.0,0.0,0.0,0.0,0.415],[700,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.484],[112,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.597],[126,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[140,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[154,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[168,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[182,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[196,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[210,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[224,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[238,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.464],[252,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[266,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[280,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[294,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[308,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.433],[322,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.509],[336,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.308],[350,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.1],[364,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.015],[378,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.001],[392,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[406,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.001],[420,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.011],[434,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.08],[448,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.274],[462,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.474],[476,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.103],[490,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[504,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[518,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.0],[532,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.113],[546,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.582],[560,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[574,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[588,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[602,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[616,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[630,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[644,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[658,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[672,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.6],[686,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.593],[700,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.537],[714,658,0.527,0.473,0.0,0.0,0.0,0.0,0.0,0.333],[714,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.361],[98,672,0.655,0.345,0.0,0.0,0.0,0.0,0.0,0.568],[98,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.628],[112,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.661],[126,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[140,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[154,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[168,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[182,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[196,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[210,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[224,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.663],[238,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.497],[252,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[266,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[280,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[294,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[308,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.59],[322,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.564],[336,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.341],[350,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.111],[364,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.016],[378,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.001],[392,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[406,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.001],[420,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.012],[434,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.089],[448,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.303],[462,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.537],[476,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.317],[490,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[504,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[518,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[532,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.0],[546,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.58],[560,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.663],[574,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[588,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[602,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[616,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[630,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[644,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[658,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.664],[672,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.663],[686,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.654],[700,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.583],[714,686,0.782,0.218,0.0,0.0,0.0,0.0,0.0,0.377],[98,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.688],[112,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.724],[126,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[140,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[154,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[168,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[182,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[196,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[210,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[224,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[238,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.545],[252,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[266,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[280,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[294,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[308,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.653],[322,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.618],[336,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.374],[350,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.122],[364,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.018],[378,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.001],[392,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[406,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.001],[420,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.013],[434,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.097],[448,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.332],[462,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.591],[476,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.535],[490,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[504,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[518,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[532,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.0],[546,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.442],[560,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.723],[574,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[588,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[602,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[616,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[630,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[644,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[658,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.727],[672,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.726],[686,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.713],[700,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.625],[714,700,0.909,0.091,0.0,0.0,0.0,0.0,0.0,0.387],[98,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.748],[112,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.787],[126,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[140,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[154,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[168,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[182,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[196,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[210,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[224,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.79],[238,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.585],[252,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.692],[322,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.672],[336,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.407],[350,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.132],[364,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.02],[378,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[392,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[420,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.013],[434,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.103],[448,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.352],[462,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.627],[476,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.682],[490,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.06],[560,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.73],[574,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.782],[588,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.783],[602,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.784],[616,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.785],[630,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.786],[644,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.786],[658,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.787],[672,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.786],[686,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.769],[700,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.661],[714,714,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.392],[98,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.808],[112,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.851],[126,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.854],[140,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[154,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[168,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[182,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[196,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[210,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.855],[224,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.853],[238,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.59],[252,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.744],[322,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.723],[336,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.437],[350,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.142],[364,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.021],[378,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[392,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[420,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.012],[434,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.094],[448,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.321],[462,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.576],[476,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.679],[490,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.19],[504,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.483],[574,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.768],[588,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.778],[602,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.785],[616,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.79],[630,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.796],[644,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.801],[658,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.806],[672,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.808],[686,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.791],[700,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.668],[714,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.38],[84,728,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.622],[84,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.669],[98,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.869],[112,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.914],[126,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[140,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[154,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[168,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[182,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[196,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[210,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.918],[224,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.917],[238,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.627],[252,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.776],[322,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.743],[336,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.443],[350,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.143],[364,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.021],[378,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[392,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.007],[434,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.057],[448,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.197],[462,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.358],[476,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.438],[490,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.31],[504,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.033],[574,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.525],[588,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.584],[602,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.6],[616,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.615],[630,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.63],[644,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.645],[658,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.66],[672,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.672],[686,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.664],[700,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.558],[714,742,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.309],[84,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.715],[98,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.929],[112,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.977],[126,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.982],[140,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.982],[154,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.982],[168,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.982],[182,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.982],[196,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.981],[210,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.98],[224,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.977],[238,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.665],[252,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.688],[322,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.63],[336,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.358],[350,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.112],[364,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.016],[378,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[392,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.002],[434,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.018],[448,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.063],[462,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.117],[476,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.147],[490,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.145],[504,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.142],[588,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.251],[602,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.268],[616,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.283],[630,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.298],[644,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.314],[658,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.331],[672,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.347],[686,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.35],[700,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.297],[714,756,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.163],[84,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.728],[98,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.946],[112,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.995],[126,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0],[140,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0],[154,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.999],[238,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.629],[252,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.402],[322,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.331],[336,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.171],[350,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.05],[364,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.007],[378,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.002],[448,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.009],[462,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.016],[476,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.021],[490,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.024],[504,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.008],[518,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.002],[588,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.046],[602,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.054],[630,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.065],[644,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.071],[658,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.078],[672,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.084],[686,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.088],[700,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.076],[714,770,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.042],[84,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.728],[98,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.946],[112,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.995],[126,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.997],[140,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.994],[154,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.987],[238,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.461],[252,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.131],[322,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.09],[364,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[378,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[392,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[406,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[476,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[490,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[504,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[518,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.002],[602,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.005],[98,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.939],[112,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.98],[126,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.968],[140,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.94],[154,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.897],[238,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.21],[252,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.021],[322,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.011],[406,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[420,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[434,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[448,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,784,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.005],[616,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[98,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.878],[112,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.878],[126,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.815],[140,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.726],[154,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.621],[224,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.417],[224,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.122],[238,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.049],[252,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[322,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[336,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.004],[336,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[462,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[476,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[490,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,798,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[98,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.654],[112,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.588],[126,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.476],[140,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.361],[154,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.258],[210,812,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.192],[210,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.034],[224,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.017],[238,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.005],[252,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[504,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.108],[196,826,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.063],[182,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.014],[196,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.006],[210,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.003],[224,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[238,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.054],[168,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.029],[154,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.005],[168,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.002],[182,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[196,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,840,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[140,854,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.012],[140,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.001],[154,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,868,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[140,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,882,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[140,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[336,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,896,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[140,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[266,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[280,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[294,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[308,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[322,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,910,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[154,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[168,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[182,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[196,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[210,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[224,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[238,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[252,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[518,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[532,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[546,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[560,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[574,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[588,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[602,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[616,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[630,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[644,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],[658,924,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]],"i":[0,1,2,1,3,2,1,4,3,4,5,3,4,6,5,6,7,5,6,8,7,8,9,7,10,11,12,11,13,12,11,14,13,14,15,13,14,16,15,16,17,15,16,18,17,18,19,17,2,3,20,3,21,20,3,5,21,5,22,21,5,7,22,7,23,22,7,9,23,9,24,23,9,25,24,25,26,24,27,28,29,28,30,29,28,31,30,31,32,30,31,33,32,33,34,32,33,35,34,35,36,34,35,12,36,12,37,36,12,13,37,13,38,37,13,15,38,15,39,38,15,17,39,17,40,39,17,19,40,19,41,40,20,21,42,21,43,42,21,22,43,22,44,43,22,23,44,23,45,44,23,24,45,24,46,45,24,26,46,26,47,46,26,48,47,48,49,47,48,50,49,50,51,49,52,29,53,29,54,53,29,30,54,30,55,54,30,32,55,32,56,55,32,34,56,34,57,56,34,36,57,36,58,57,36,37,58,37,59,58,37,38,59,38,60,59,38,39,60,39,61,60,39,40,61,40,62,61,40,41,62,41,63,62,42,43,64,43,65,64,43,44,65,44,66,65,44,45,66,45,67,66,45,46,67,46,68,67,46,47,68,47,69,68,47,49,69,49,70,69,49,51,70,51,71,70,72,73,74,73,75,74,73,76,75,76,77,75,76,78,77,78,79,77,78,80,79,80,81,79,53,54,82,54,83,82,54,55,83,55,84,83,55,56,84,56,85,84,56,57,85,57,86,85,57,58,86,58,87,86,58,59,87,59,88,87,59,60,88,60,89,88,60,61,89,61,90,89,61,62,90,62,91,90,62,63,91,63,92,91,64,65,93,65,94,93,65,66,94,66,95,94,66,67,95,67,96,95,67,68,96,68,97,96,68,69,97,69,98,97,69,70,98,70,99,98,70,71,99,71,100,99,71,101,100,101,102,100,101,103,102,103,104,102,103,74,104,74,105,104,74,75,105,75,106,105,75,77,106,77,107,106,77,79,107,79,108,107,79,81,108,81,109,108,81,110,109,110,111,109,110,112,111,112,113,111,114,115,116,115,117,116,115,82,117,82,118,117,82,83,118,83,119,118,83,84,119,84,120,119,84,85,120,85,121,120,85,86,121,86,122,121,86,87,122,87,123,122,87,88,123,88,124,123,88,89,124,89,125,124,89,90,125,90,126,125,90,91,126,91,127,126,91,92,127,92,128,127,92,129,128,129,130,128,93,94,131,94,132,131,94,95,132,95,133,132,95,96,133,96,134,133,96,97,134,97,135,134,97,98,135,98,136,135,98,99,136,99,137,136,99,100,137,100,138,137,100,102,138,102,139,138,102,104,139,104,140,139,104,105,140,105,141,140,105,106,141,106,142,141,106,107,142,107,143,142,107,108,143,108,144,143,108,109,144,109,145,144,109,111,145,111,146,145,111,113,146,113,147,146,113,148,147,148,149,147,150,116,151,116,152,151,116,117,152,117,153,152,117,118,153,118,154,153,118,119,154,119,155,154,119,120,155,120,156,155,120,121,156,121,157,156,121,122,157,122,158,157,122,123,158,123,159,158,123,124,159,124,160,159,124,125,160,125,161,160,125,126,161,126,162,161,126,127,162,127,163,162,127,128,163,128,164,163,128,130,164,130,165,164,166,131,167,131,168,167,131,132,168,132,169,168,132,133,169,133,170,169,133,134,170,134,171,170,134,135,171,135,172,171,135,136,172,136,173,172,136,137,173,137,174,173,137,138,174,138,175,174,138,139,175,139,176,175,139,140,176,140,177,176,140,141,177,141,178,177,141,142,178,142,179,178,142,143,179,143,180,179,143,144,180,144,181,180,144,145,181,145,182,181,145,146,182,146,183,182,146,147,183,147,184,183,147,149,184,149,185,184,151,152,186,152,187,186,152,153,187,153,188,187,153,154,188,154,189,188,154,155,189,155,190,189,155,156,190,156,191,190,156,157,191,157,192,191,157,158,192,158,193,192,158,159,193,159,194,193,159,160,194,160,195,194,160,161,195,161,196,195,161,162,196,162,197,196,162,163,197,163,198,197,163,164,198,164,199,198,164,165,199,165,200,199,167,168,201,168,202,201,168,169,202,169,203,202,169,170,203,170,204,203,170,171,204,171,205,204,171,172,205,172,206,205,172,173,206,173,207,206,173,174,207,174,208,207,174,175,208,175,209,208,175,176,209,176,210,209,176,177,210,177,211,210,177,178,211,178,212,211,178,179,212,179,213,212,179,180,213,180,214,213,180,181,214,181,215,214,181,182,215,182,216,215,182,183,216,183,217,216,183,184,217,184,218,217,184,185,218,185,219,218,185,186,219,186,220,219,186,187,220,187,221,220,187,188,221,188,222,221,188,189,222,189,223,222,189,190,223,190,224,223,190,191,224,191,225,224,191,192,225,192,226,225,192,193,226,193,227,226,193,194,227,194,228,227,194,195,228,195,229,228,195,196,229,196,230,229,196,197,230,197,231,230,197,198,231,198,232,231,198,199,232,199,233,232,199,200,233,200,234,233,235,236,237,236,238,237,236,201,238,201,239,238,201,202,239,202,240,239,202,203,240,203,241,240,203,204,241,204,242,241,204,205,242,205,243,242,205,206,243,206,244,243,206,207,244,207,245,244,207,208,245,208,246,245,208,209,246,209,247,246,209,210,247,210,248,247,210,211,248,211,249,248,211,212,249,212,250,249,212,213,250,213,251,250,213,214,251,214,252,251,214,215,252,215,253,252,215,216,253,216,254,253,216,217,254,217,255,254,217,218,255,218,256,255,218,219,256,219,257,256,219,220,257,220,258,257,220,221,258,221,259,258,221,222,259,222,260,259,222,223,260,223,261,260,223,224,261,224,262,261,224,225,262,225,263,262,225,226,263,226,264,263,226,227,264,227,265,264,227,228,265,228,266,265,228,229,266,229,267,266,229,230,267,230,268,267,230,231,268,231,269,268,231,232,269,232,270,269,232,233,270,233,271,270,233,234,271,234,272,271,273,237,274,237,275,274,237,238,275,238,276,275,238,239,276,239,277,276,239,240,277,240,278,277,240,241,278,241,279,278,241,242,279,242,280,279,242,243,280,243,281,280,243,244,281,244,282,281,244,245,282,245,283,282,245,246,283,246,284,283,246,247,284,247,285,284,247,248,285,248,286,285,248,249,286,249,287,286,249,250,287,250,288,287,250,251,288,251,289,288,251,252,289,252,290,289,252,253,290,253,291,290,253,254,291,254,292,291,254,255,292,255,293,292,255,256,293,256,294,293,256,257,294,257,295,294,257,258,295,258,296,295,258,259,296,259,297,296,259,260,297,260,298,297,260,261,298,261,299,298,261,262,299,262,300,299,262,263,300,263,301,300,263,264,301,264,302,301,264,265,302,265,303,302,265,266,303,266,304,303,266,267,304,267,305,304,267,268,305,268,306,305,268,269,306,269,307,306,269,270,307,270,308,307,270,271,308,271,309,308,271,272,309,272,310,309,274,275,311,275,312,311,275,276,312,276,313,312,276,277,313,277,314,313,277,278,314,278,315,314,278,279,315,279,316,315,279,280,316,280,317,316,280,281,317,281,318,317,281,282,318,282,319,318,282,283,319,283,320,319,283,284,320,284,321,320,284,285,321,285,322,321,285,286,322,286,323,322,286,287,323,287,324,323,287,288,324,288,325,324,288,289,325,289,326,325,289,290,326,290,327,326,290,291,327,291,328,327,291,292,328,292,329,328,292,293,329,293,330,329,293,294,330,294,331,330,294,295,331,295,332,331,295,296,332,296,333,332,296,297,333,297,334,333,297,298,334,298,335,334,298,299,335,299,336,335,299,300,336,300,337,336,300,301,337,301,338,337,301,302,338,302,339,338,302,303,339,303,340,339,303,304,340,304,341,340,304,305,341,305,342,341,305,306,342,306,343,342,306,307,343,307,344,343,307,308,344,308,345,344,308,309,345,309,346,345,309,310,346,310,347,346,348,349,350,349,351,350,349,352,351,352,353,351,352,354,353,354,355,353,354,356,355,356,357,355,356,358,357,358,359,357,311,312,360,312,361,360,312,313,361,313,362,361,313,314,362,314,363,362,314,315,363,315,364,363,315,316,364,316,365,364,316,317,365,317,366,365,317,318,366,318,367,366,318,319,367,319,368,367,319,320,368,320,369,368,320,321,369,321,370,369,321,322,370,322,371,370,322,323,371,323,372,371,323,324,372,324,373,372,324,325,373,325,374,373,325,326,374,326,375,374,326,327,375,327,376,375,327,328,376,328,377,376,328,329,377,329,378,377,329,330,378,330,379,378,330,331,379,331,380,379,331,332,380,332,381,380,332,333,381,333,382,381,333,334,382,334,383,382,334,335,383,335,384,383,335,336,384,336,385,384,336,337,385,337,386,385,337,338,386,338,387,386,338,339,387,339,388,387,339,340,388,340,389,388,340,341,389,341,390,389,341,342,390,342,391,390,342,343,391,343,392,391,343,344,392,344,393,392,344,345,393,345,394,393,345,346,394,346,395,394,346,347,395,347,396,395,397,398,399,398,400,399,398,350,400,350,401,400,350,351,401,351,402,401,351,353,402,353,403,402,353,355,403,355,404,403,355,357,404,357,405,404,357,359,405,359,406,405,360,361,407,361,408,407,361,362,408,362,409,408,362,363,409,363,410,409,363,364,410,364,411,410,364,365,411,365,412,411,365,366,412,366,413,412,366,367,413,367,414,413,367,368,414,368,415,414,368,369,415,369,416,415,369,370,416,370,417,416,370,371,417,371,418,417,371,372,418,372,419,418,372,373,419,373,420,419,373,374,420,374,421,420,374,375,421,375,422,421,375,376,422,376,423,422,376,377,423,377,424,423,377,378,424,378,425,424,378,379,425,379,426,425,379,380,426,380,427,426,380,381,427,381,428,427,381,382,428,382,429,428,382,383,429,383,430,429,383,384,430,384,431,430,384,385,431,385,432,431,385,386,432,386,433,432,386,387,433,387,434,433,387,388,434,388,435,434,388,389,435,389,436,435,389,390,436,390,437,436,390,391,437,391,438,437,391,392,438,392,439,438,392,393,439,393,440,439,393,394,440,394,441,440,394,395,441,395,442,441,395,396,442,396,443,442,444,399,445,399,446,445,399,400,446,400,447,446,400,401,447,401,448,447,401,402,448,402,449,448,402,403,449,403,450,449,403,404,450,404,451,450,404,405,451,405,452,451,405,406,452,406,453,452,406,454,453,454,455,453,407,408,456,408,457,456,408,409,457,409,458,457,409,410,458,410,459,458,410,411,459,411,460,459,411,412,460,412,461,460,412,413,461,413,462,461,413,414,462,414,463,462,414,415,463,415,464,463,415,416,464,416,465,464,416,417,465,417,466,465,417,418,466,418,467,466,418,419,467,419,468,467,419,420,468,420,469,468,420,421,469,421,470,469,421,422,470,422,471,470,422,423,471,423,472,471,423,424,472,424,473,472,424,425,473,425,474,473,425,426,474,426,475,474,426,427,475,427,476,475,427,428,476,428,477,476,428,429,477,429,478,477,429,430,478,430,479,478,430,431,479,431,480,479,434,435,481,435,482,481,435,436,482,436,483,482,436,437,483,437,484,483,437,438,484,438,485,484,438,439,485,439,486,485,439,440,486,440,487,486,440,441,487,441,488,487,441,442,488,442,489,488,442,443,489,443,490,489,491,445,492,445,493,492,445,446,493,446,494,493,446,447,494,447,495,494,447,448,495,448,496,495,448,449,496,449,497,496,449,450,497,450,498,497,450,451,498,451,499,498,451,452,499,452,500,499,452,453,500,453,501,500,453,455,501,455,502,501,456,457,503,457,504,503,457,458,504,458,505,504,458,459,505,459,506,505,459,460,506,460,507,506,460,461,507,461,508,507,461,462,508,462,509,508,462,463,509,463,510,509,463,464,510,464,511,510,464,465,511,465,512,511,465,466,512,466,513,512,466,467,513,467,514,513,467,468,514,468,515,514,468,469,515,469,516,515,469,470,516,470,517,516,470,471,517,471,518,517,471,472,518,472,519,518,472,473,519,473,520,519,473,474,520,474,521,520,474,475,521,475,522,521,475,476,522,476,523,522,476,477,523,477,524,523,477,478,524,478,525,524,478,479,525,479,526,525,479,480,526,480,527,526,480,528,527,528,529,527,528,530,529,530,531,529,481,482,532,482,533,532,482,483,533,483,534,533,483,484,534,484,535,534,484,485,535,485,536,535,485,486,536,486,537,536,486,487,537,487,538,537,487,488,538,488,539,538,488,489,539,489,540,539,489,490,540,490,541,540,492,493,542,493,543,542,493,494,543,494,544,543,494,495,544,495,545,544,495,496,545,496,546,545,496,497,546,497,547,546,497,498,547,498,548,547,498,499,548,499,549,548,499,500,549,500,550,549,500,501,550,501,551,550,501,502,551,502,552,551,502,503,552,503,553,552,503,504,553,504,554,553,504,505,554,505,555,554,505,506,555,506,556,555,506,507,556,507,557,556,507,508,557,508,558,557,508,509,558,509,559,558,509,510,559,510,560,559,510,511,560,511,561,560,511,512,561,512,562,561,512,513,562,513,563,562,513,514,563,514,564,563,514,515,564,515,565,564,515,516,565,516,566,565,516,517,566,517,567,566,517,518,567,518,568,567,518,519,568,519,569,568,519,520,569,520,570,569,520,521,570,521,571,570,521,522,571,522,572,571,522,523,572,523,573,572,523,524,573,524,574,573,524,525,574,525,575,574,525,526,575,526,576,575,526,527,576,527,577,576,527,529,577,529,578,577,529,531,578,531,579,578,532,533,580,533,581,580,533,534,581,534,582,581,534,535,582,535,583,582,535,536,583,536,584,583,536,537,584,537,585,584,537,538,585,538,586,585,538,539,586,539,587,586,539,540,587,540,588,587,540,541,588,541,589,588,590,542,591,542,592,591,542,543,592,543,593,592,543,544,593,544,594,593,544,545,594,545,595,594,545,546,595,546,596,595,546,547,596,547,597,596,547,548,597,548,598,597,548,549,598,549,599,598,549,550,599,550,600,599,550,551,600,551,601,600,551,552,601,552,602,601,552,553,602,553,603,602,553,554,603,554,604,603,554,555,604,555,605,604,555,556,605,556,606,605,556,557,606,557,607,606,557,558,607,558,608,607,558,559,608,559,609,608,559,560,609,560,610,609,560,561,610,561,611,610,561,562,611,562,612,611,562,563,612,563,613,612,563,564,613,564,614,613,564,565,614,565,615,614,565,566,615,566,616,615,566,567,616,567,617,616,567,568,617,568,618,617,568,569,618,569,619,618,569,570,619,570,620,619,570,571,620,571,621,620,571,572,621,572,622,621,572,573,622,573,623,622,573,574,623,574,624,623,574,575,624,575,625,624,575,576,625,576,626,625,576,577,626,577,627,626,577,578,627,578,628,627,578,579,628,579,629,628,580,581,630,581,631,630,581,582,631,582,632,631,582,583,632,583,633,632,583,584,633,584,634,633,584,585,634,585,635,634,585,586,635,586,636,635,586,587,636,587,637,636,587,588,637,588,638,637,588,589,638,589,639,638,591,592,640,592,641,640,592,593,641,593,642,641,593,594,642,594,643,642,594,595,643,595,644,643,595,596,644,596,645,644,596,597,645,597,646,645,597,598,646,598,647,646,598,599,647,599,648,647,599,600,648,600,649,648,600,601,649,601,650,649,601,602,650,602,651,650,602,603,651,603,652,651,603,604,652,604,653,652,604,605,653,605,654,653,605,606,654,606,655,654,606,607,655,607,656,655,607,608,656,608,657,656,608,609,657,609,658,657,609,610,658,610,659,658,610,611,659,611,660,659,611,612,660,612,661,660,612,613,661,613,662,661,613,614,662,614,663,662,614,615,663,615,664,663,615,616,664,616,665,664,616,617,665,617,666,665,617,618,666,618,667,666,618,619,667,619,668,667,619,620,668,620,669,668,620,621,669,621,670,669,621,622,670,622,671,670,622,623,671,623,672,671,623,624,672,624,673,672,624,625,673,625,674,673,625,626,674,626,675,674,626,627,675,627,676,675,627,628,676,628,677,676,630,631,678,631,679,678,631,632,679,632,680,679,632,633,680,633,681,680,633,634,681,634,682,681,634,635,682,635,683,682,635,636,683,636,684,683,636,637,684,637,685,684,637,638,685,638,686,685,640,641,687,641,688,687,641,642,688,642,689,688,642,643,689,643,690,689,643,644,690,644,691,690,644,645,691,645,692,691,645,646,692,646,693,692,646,647,693,647,694,693,647,648,694,648,695,694,648,649,695,649,696,695,649,650,696,650,697,696,650,651,697,651,698,697,651,652,698,652,699,698,652,653,699,653,700,699,653,654,700,654,701,700,654,655,701,655,702,701,655,656,702,656,703,702,656,657,703,657,704,703,657,658,704,658,705,704,658,659,705,659,706,705,659,660,706,660,707,706,660,661,707,661,708,707,661,662,708,662,709,708,662,663,709,663,710,709,663,664,710,664,711,710,664,665,711,665,712,711,665,666,712,666,713,712,666,667,713,667,714,713,667,668,714,668,715,714,668,669,715,669,716,715,669,670,716,670,717,716,670,671,717,671,718,717,671,672,718,672,719,718,672,673,719,673,720,719,673,674,720,674,721,720,674,675,721,675,722,721,675,676,722,676,723,722,678,679,724,679,725,724,679,680,725,680,726,725,680,681,726,681,727,726,681,682,727,682,728,727,682,683,728,683,729,728,683,684,729,684,730,729,684,685,730,685,731,730,687,688,732,688,733,732,688,689,733,689,734,733,689,690,734,690,735,734,690,691,735,691,736,735,691,692,736,692,737,736,692,693,737,693,738,737,693,694,738,694,739,738,694,695,739,695,740,739,695,696,740,696,741,740,696,697,741,697,742,741,697,698,742,698,743,742,698,699,743,699,744,743,699,700,744,700,745,744,700,701,745,701,746,745,701,702,746,702,747,746,702,703,747,703,748,747,703,704,748,704,749,748,704,705,749,705,750,749,705,706,750,706,751,750,706,707,751,707,752,751,707,708,752,708,753,752,708,709,753,709,754,753,709,710,754,710,755,754,710,711,755,711,756,755,711,712,756,712,757,756,712,713,757,713,758,757,713,714,758,714,759,758,714,715,759,715,760,759,715,716,760,716,761,760,716,717,761,717,762,761,717,718,762,718,763,762,718,719,763,719,764,763,719,720,764,720,765,764,720,721,765,721,766,765,721,722,766,722,767,766,722,723,767,723,768,767,769,770,771,770,772,771,770,724,772,724,773,772,724,725,773,725,774,773,725,726,774,726,775,774,726,727,775,727,776,775,727,728,776,728,777,776,728,729,777,729,778,777,729,730,778,730,779,778,730,731,779,731,780,779,732,733,781,733,782,781,733,734,782,734,783,782,734,735,783,735,784,783,735,736,784,736,785,784,736,737,785,737,786,785,737,738,786,738,787,786,738,739,787,739,788,787,739,740,788,740,789,788,740,741,789,741,790,789,741,742,790,742,791,790,742,743,791,743,792,791,743,744,792,744,793,792,744,745,793,745,794,793,745,746,794,746,795,794,746,747,795,747,796,795,747,748,796,748,797,796,748,749,797,749,798,797,749,750,798,750,799,798,750,751,799,751,800,799,751,752,800,752,801,800,752,753,801,753,802,801,753,754,802,754,803,802,754,755,803,755,804,803,755,756,804,756,805,804,756,757,805,757,806,805,757,758,806,758,807,806,758,759,807,759,808,807,759,760,808,760,809,808,760,761,809,761,810,809,761,762,810,762,811,810,762,763,811,763,812,811,763,764,812,764,813,812,764,765,813,765,814,813,765,766,814,766,815,814,766,767,815,767,816,815,767,768,816,768,817,816,768,771,817,771,818,817,771,772,818,772,819,818,772,773,819,773,820,819,773,774,820,774,821,820,774,775,821,775,822,821,775,776,822,776,823,822,776,777,823,777,824,823,777,778,824,778,825,824,778,779,825,779,826,825,779,780,826,780,827,826,780,828,827,828,829,827,788,789,830,789,831,830,789,790,831,790,832,831,790,791,832,791,833,832,791,792,833,792,834,833,792,793,834,793,835,834,793,794,835,794,836,835,794,795,836,795,837,836,795,796,837,796,838,837,796,797,838,797,839,838,797,798,839,798,840,839,798,799,840,799,841,840,799,800,841,800,842,841,800,801,842,801,843,842,801,802,843,802,844,843,802,803,844,803,845,844,803,804,845,804,846,845,804,805,846,805,847,846,805,806,847,806,848,847,806,807,848,807,849,848,807,808,849,808,850,849,808,809,850,809,851,850,809,810,851,810,852,851,810,811,852,811,853,852,811,812,853,812,854,853,812,813,854,813,855,854,813,814,855,814,856,855,814,815,856,815,857,856,815,816,857,816,858,857,816,817,858,817,859,858,817,818,859,818,860,859,818,819,860,819,861,860,819,820,861,820,862,861,820,821,862,821,863,862,821,822,863,822,864,863,822,823,864,823,865,864,823,824,865,824,866,865,824,825,866,825,867,866,825,826,867,826,868,867,826,827,868,827,869,868,827,829,869,829,870,869,830,831,871,831,872,871,831,832,872,832,873,872,832,833,873,833,874,873,833,834,874,834,875,874,834,835,875,835,876,875,835,836,876,836,877,876,836,837,877,837,878,877,837,838,878,838,879,878,838,839,879,839,880,879,839,840,880,840,881,880,840,841,881,841,882,881,841,842,882,842,883,882,842,843,883,843,884,883,843,844,884,844,885,884,844,845,885,845,886,885,845,846,886,846,887,886,846,847,887,847,888,887,847,848,888,848,889,888,848,849,889,849,890,889,849,850,890,850,891,890,850,851,891,851,892,891,851,852,892,852,893,892,852,853,893,853,894,893,853,854,894,854,895,894,854,855,895,855,896,895,855,856,896,856,897,896,856,857,897,857,898,897,857,858,898,858,899,898,858,859,899,859,900,899,859,860,900,860,901,900,860,861,901,861,902,901,861,862,902,862,903,902,862,863,903,863,904,903,863,864,904,864,905,904,864,865,905,865,906,905,865,866,906,866,907,906,866,867,907,867,908,907,867,868,908,868,909,908,868,869,909,869,910,909,869,870,910,870,911,910,871,872,912,872,913,912,872,873,913,873,914,913,873,874,914,874,915,914,874,875,915,875,916,915,875,876,916,876,917,916,876,877,917,877,918,917,877,878,918,878,919,918,878,879,919,879,920,919,879,880,920,880,921,920,880,881,921,881,922,921,881,882,922,882,923,922,882,883,923,883,924,923,883,884,924,884,925,924,884,885,925,885,926,925,885,886,926,886,927,926,886,887,927,887,928,927,887,888,928,888,929,928,888,889,929,889,930,929,889,890,930,890,931,930,890,891,931,891,932,931,891,892,932,892,933,932,892,893,933,893,934,933,893,894,934,894,935,934,894,895,935,895,936,935,895,896,936,896,937,936,896,897,937,897,938,937,897,898,938,898,939,938,898,899,939,899,940,939,899,900,940,900,941,940,900,901,941,901,942,941,901,902,942,902,943,942,902,903,943,903,944,943,903,904,944,904,945,944,904,905,945,905,946,945,905,906,946,906,947,946,906,907,947,907,948,947,907,908,948,908,949,948,908,909,949,909,950,949,909,910,950,910,951,950,910,911,951,911,952,951,913,914,953,914,954,953,914,915,954,915,955,954,915,916,955,916,956,955,916,917,956,917,957,956,917,918,957,918,958,957,918,919,958,919,959,958,919,920,959,920,960,959,920,921,960,921,961,960,921,922,961,922,962,961,922,923,962,923,963,962,923,924,963,924,964,963,924,925,964,925,965,964,925,926,965,926,966,965,926,927,966,927,967,966,927,928,967,928,968,967,928,929,968,929,969,968,929,930,969,930,970,969,930,931,970,931,971,970,931,932,971,932,972,971,932,933,972,933,973,972,933,934,973,934,974,973,934,935,974,935,975,974,935,936,975,936,976,975,936,937,976,937,977,976,937,938,977,938,978,977,938,939,978,939,979,978,939,940,979,940,980,979,940,941,980,941,981,980,941,942,981,942,982,981,942,943,982,943,983,982,943,944,983,944,984,983,944,945,984,945,985,984,945,946,985,946,986,985,946,947,986,947,987,986,947,948,987,948,988,987,948,949,988,949,989,988,949,950,989,950,990,989,950,951,990,951,991,990,951,952,991,952,992,991,953,954,993,954,994,993,954,955,994,955,995,994,955,956,995,956,996,995,956,957,996,957,997,996,957,958,997,958,998,997,958,959,998,959,999,998,959,960,999,960,1000,999,960,961,1000,961,1001,1000,961,962,1001,962,1002,1001,962,963,1002,963,1003,1002,963,964,1003,964,1004,1003,964,965,1004,965,1005,1004,965,966,1005,966,1006,1005,966,967,1006,967,1007,1006,967,968,1007,968,1008,1007,968,969,1008,969,1009,1008,969,970,1009,970,1010,1009,970,971,1010,971,1011,1010,971,972,1011,972,1012,1011,972,973,1012,973,1013,1012,973,974,1013,974,1014,1013,974,975,1014,975,1015,1014,975,976,1015,976,1016,1015,976,977,1016,977,1017,1016,977,978,1017,978,1018,1017,978,979,1018,979,1019,1018,979,980,1019,980,1020,1019,980,981,1020,981,1021,1020,981,982,1021,982,1022,1021,982,983,1022,983,1023,1022,983,984,1023,984,1024,1023,984,985,1024,985,1025,1024,985,986,1025,986,1026,1025,986,987,1026,987,1027,1026,987,988,1027,988,1028,1027,988,989,1028,989,1029,1028,989,990,1029,990,1030,1029,990,991,1030,991,1031,1030,993,994,1032,994,1033,1032,994,995,1033,995,1034,1033,995,996,1034,996,1035,1034,996,997,1035,997,1036,1035,997,998,1036,998,1037,1036,998,999,1037,999,1038,1037,999,1000,1038,1000,1039,1038,1000,1001,1039,1001,1040,1039,1001,1002,1040,1002,1041,1040,1002,1003,1041,1003,1042,1041,1003,1004,1042,1004,1043,1042,1004,1005,1043,1005,1044,1043,1005,1006,1044,1006,1045,1044,1006,1007,1045,1007,1046,1045,1007,1008,1046,1008,1047,1046,1008,1009,1047,1009,1048,1047,1009,1010,1048,1010,1049,1048,1010,1011,1049,1011,1050,1049,1011,1012,1050,1012,1051,1050,1012,1013,1051,1013,1052,1051,1013,1014,1052,1014,1053,1052,1014,1015,1053,1015,1054,1053,1015,1016,1054,1016,1055,1054,1016,1017,1055,1017,1056,1055,1017,1018,1056,1018,1057,1056,1018,1019,1057,1019,1058,1057,1019,1020,1058,1020,1059,1058,1020,1021,1059,1021,1060,1059,1021,1022,1060,1022,1061,1060,1022,1023,1061,1023,1062,1061,1023,1024,1062,1024,1063,1062,1024,1025,1063,1025,1064,1063,1025,1026,1064,1026,1065,1064,1026,1027,1065,1027,1066,1065,1027,1028,1066,1028,1067,1066,1028,1029,1067,1029,1068,1067,1029,1030,1068,1030,1069,1068,1030,1031,1069,1031,1070,1069,1034,1035,1071,1035,1072,1071,1035,1036,1072,1036,1073,1072,1036,1037,1073,1037,1074,1073,1037,1038,1074,1038,1075,1074,1038,1039,1075,1039,1076,1075,1039,1040,1076,1040,1077,1076,1040,1041,1077,1041,1078,1077,1041,1042,1078,1042,1079,1078,1042,1043,1079,1043,1080,1079,1043,1044,1080,1044,1081,1080,1044,1045,1081,1045,1082,1081,1045,1046,1082,1046,1083,1082,1046,1047,1083,1047,1084,1083,1047,1048,1084,1048,1085,1084,1048,1049,1085,1049,1086,1085,1049,1050,1086,1050,1087,1086,1050,1051,1087,1051,1088,1087,1051,1052,1088,1052,1089,1088,1052,1053,1089,1053,1090,1089,1053,1054,1090,1054,1091,1090,1054,1055,1091,1055,1092,1091,1055,1056,1092,1056,1093,1092,1056,1057,1093,1057,1094,1093,1057,1058,1094,1058,1095,1094,1058,1059,1095,1059,1096,1095,1059,1060,1096,1060,1097,1096,1060,1061,1097,1061,1098,1097,1061,1062,1098,1062,1099,1098,1062,1063,1099,1063,1100,1099,1063,1064,1100,1064,1101,1100,1064,1065,1101,1065,1102,1101,1065,1066,1102,1066,1103,1102,1066,1067,1103,1067,1104,1103,1067,1068,1104,1068,1105,1104,1068,1069,1105,1069,1106,1105,1069,1070,1106,1070,1107,1106,1071,1072,1108,1072,1109,1108,1072,1073,1109,1073,1110,1109,1073,1074,1110,1074,1111,1110,1074,1075,1111,1075,1112,1111,1075,1076,1112,1076,1113,1112,1076,1077,1113,1077,1114,1113,1077,1078,1114,1078,1115,1114,1078,1079,1115,1079,1116,1115,1079,1080,1116,1080,1117,1116,1080,1081,1117,1081,1118,1117,1081,1082,1118,1082,1119,1118,1082,1083,1119,1083,1120,1119,1083,1084,1120,1084,1121,1120,1084,1085,1121,1085,1122,1121,1085,1086,1122,1086,1123,1122,1086,1087,1123,1087,1124,1123,1087,1088,1124,1088,1125,1124,1088,1089,1125,1089,1126,1125,1089,1090,1126,1090,1127,1126,1090,1091,1127,1091,1128,1127,1091,1092,1128,1092,1129,1128,1092,1093,1129,1093,1130,1129,1093,1094,1130,1094,1131,1130,1094,1095,1131,1095,1132,1131,1095,1096,1132,1096,1133,1132,1096,1097,1133,1097,1134,1133,1097,1098,1134,1098,1135,1134,1098,1099,1135,1099,1136,1135,1099,1100,1136,1100,1137,1136,1100,1101,1137,1101,1138,1137,1101,1102,1138,1102,1139,1138,1102,1103,1139,1103,1140,1139,1103,1104,1140,1104,1141,1140,1104,1105,1141,1105,1142,1141,1105,1106,1142,1106,1143,1142,1108,1109,1144,1109,1145,1144,1109,1110,1145,1110,1146,1145,1110,1111,1146,1111,1147,1146,1111,1112,1147,1112,1148,1147,1112,1113,1148,1113,1149,1148,1113,1114,1149,1114,1150,1149,1114,1115,1150,1115,1151,1150,1115,1116,1151,1116,1152,1151,1116,1117,1152,1117,1153,1152,1117,1118,1153,1118,1154,1153,1118,1119,1154,1119,1155,1154,1119,1120,1155,1120,1156,1155,1120,1121,1156,1121,1157,1156,1121,1122,1157,1122,1158,1157,1122,1123,1158,1123,1159,1158,1123,1124,1159,1124,1160,1159,1124,1125,1160,1125,1161,1160,1125,1126,1161,1126,1162,1161,1126,1127,1162,1127,1163,1162,1127,1128,1163,1128,1164,1163,1128,1129,1164,1129,1165,1164,1129,1130,1165,1130,1166,1165,1130,1131,1166,1131,1167,1166,1131,1132,1167,1132,1168,1167,1132,1133,1168,1133,1169,1168,1133,1134,1169,1134,1170,1169,1134,1135,1170,1135,1171,1170,1135,1136,1171,1136,1172,1171,1136,1137,1172,1137,1173,1172,1137,1138,1173,1138,1174,1173,1138,1139,1174,1139,1175,1174,1139,1140,1175,1140,1176,1175,1140,1141,1176,1141,1177,1176,1141,1142,1177,1142,1178,1177,1142,1143,1178,1143,1179,1178,1146,1147,1180,1147,1181,1180,1147,1148,1181,1148,1182,1181,1148,1149,1182,1149,1183,1182,1149,1150,1183,1150,1184,1183,1150,1151,1184,1151,1185,1184,1151,1152,1185,1152,1186,1185,1152,1153,1186,1153,1187,1186,1153,1154,1187,1154,1188,1187,1154,1155,1188,1155,1189,1188,1155,1156,1189,1156,1190,1189,1156,1157,1190,1157,1191,1190,1157,1158,1191,1158,1192,1191,1158,1159,1192,1159,1193,1192,1159,1160,1193,1160,1194,1193,1160,1161,1194,1161,1195,1194,1161,1162,1195,1162,1196,1195,1162,1163,1196,1163,1197,1196,1163,1164,1197,1164,1198,1197,1164,1165,1198,1165,1199,1198,1165,1166,1199,1166,1200,1199,1166,1167,1200,1167,1201,1200,1167,1168,1201,1168,1202,1201,1168,1169,1202,1169,1203,1202,1169,1170,1203,1170,1204,1203,1170,1171,1204,1171,1205,1204,1171,1172,1205,1172,1206,1205,1172,1173,1206,1173,1207,1206,1173,1174,1207,1174,1208,1207,1174,1175,1208,1175,1209,1208,1175,1176,1209,1176,1210,1209,1176,1177,1210,1177,1211,1210,1177,1178,1211,1178,1212,1211,1213,1180,1214,1180,1215,1214,1180,1181,1215,1181,1216,1215,1181,1182,1216,1182,1217,1216,1182,1183,1217,1183,1218,1217,1183,1184,1218,1184,1219,1218,1184,1185,1219,1185,1220,1219,1185,1186,1220,1186,1221,1220,1186,1187,1221,1187,1222,1221,1187,1188,1222,1188,1223,1222,1188,1189,1223,1189,1224,1223,1189,1190,1224,1190,1225,1224,1190,1191,1225,1191,1226,1225,1191,1192,1226,1192,1227,1226,1192,1193,1227,1193,1228,1227,1193,1194,1228,1194,1229,1228,1194,1195,1229,1195,1230,1229,1195,1196,1230,1196,1231,1230,1196,1197,1231,1197,1232,1231,1197,1198,1232,1198,1233,1232,1198,1199,1233,1199,1234,1233,1199,1200,1234,1200,1235,1234,1200,1201,1235,1201,1236,1235,1201,1202,1236,1202,1237,1236,1202,1203,1237,1203,1238,1237,1203,1204,1238,1204,1239,1238,1204,1205,1239,1205,1240,1239,1205,1206,1240,1206,1241,1240,1206,1207,1241,1207,1242,1241,1207,1208,1242,1208,1243,1242,1208,1209,1243,1209,1244,1243,1209,1210,1244,1210,1245,1244,1210,1211,1245,1211,1246,1245,1214,1215,1247,1215,1248,1247,1215,1216,1248,1216,1249,1248,1216,1217,1249,1217,1250,1249,1217,1218,1250,1218,1251,1250,1218,1219,1251,1219,1252,1251,1219,1220,1252,1220,1253,1252,1220,1221,1253,1221,1254,1253,1221,1222,1254,1222,1255,1254,1222,1223,1255,1223,1256,1255,1223,1224,1256,1224,1257,1256,1224,1225,1257,1225,1258,1257,1225,1226,1258,1226,1259,1258,1226,1227,1259,1227,1260,1259,1227,1228,1260,1228,1261,1260,1228,1229,1261,1229,1262,1261,1229,1230,1262,1230,1263,1262,1230,1231,1263,1231,1264,1263,1231,1232,1264,1232,1265,1264,1232,1233,1265,1233,1266,1265,1233,1234,1266,1234,1267,1266,1234,1235,1267,1235,1268,1267,1235,1236,1268,1236,1269,1268,1236,1237,1269,1237,1270,1269,1237,1238,1270,1238,1271,1270,1238,1239,1271,1239,1272,1271,1239,1240,1272,1240,1273,1272,1240,1241,1273,1241,1274,1273,1241,1242,1274,1242,1275,1274,1242,1243,1275,1243,1276,1275,1243,1244,1276,1244,1277,1276,1244,1245,1277,1245,1278,1277,1245,1246,1278,1246,1279,1278,1247,1248,1280,1248,1281,1280,1248,1249,1281,1249,1282,1281,1249,1250,1282,1250,1283,1282,1250,1251,1283,1251,1284,1283,1251,1252,1284,1252,1285,1284,1252,1253,1285,1253,1286,1285,1253,1254,1286,1254,1287,1286,1254,1255,1287,1255,1288,1287,1255,1256,1288,1256,1289,1288,1256,1257,1289,1257,1290,1289,1257,1258,1290,1258,1291,1290,1258,1259,1291,1259,1292,1291,1259,1260,1292,1260,1293,1292,1260,1261,1293,1261,1294,1293,1261,1262,1294,1262,1295,1294,1262,1263,1295,1263,1296,1295,1263,1264,1296,1264,1297,1296,1264,1265,1297,1265,1298,1297,1265,1266,1298,1266,1299,1298,1266,1267,1299,1267,1300,1299,1267,1268,1300,1268,1301,1300,1268,1269,1301,1269,1302,1301,1269,1270,1302,1270,1303,1302,1270,1271,1303,1271,1304,1303,1271,1272,1304,1272,1305,1304,1272,1273,1305,1273,1306,1305,1273,1274,1306,1274,1307,1306,1274,1275,1307,1275,1308,1307,1275,1276,1308,1276,1309,1308,1276,1277,1309,1277,1310,1309,1277,1278,1310,1278,1311,1310,1312,1280,1313,1280,1314,1313,1280,1281,1314,1281,1315,1314,1281,1282,1315,1282,1316,1315,1282,1283,1316,1283,1317,1316,1283,1284,1317,1284,1318,1317,1284,1285,1318,1285,1319,1318,1285,1286,1319,1286,1320,1319,1286,1287,1320,1287,1321,1320,1287,1288,1321,1288,1322,1321,1288,1289,1322,1289,1323,1322,1289,1290,1323,1290,1324,1323,1290,1291,1324,1291,1325,1324,1291,1292,1325,1292,1326,1325,1292,1293,1326,1293,1327,1326,1293,1294,1327,1294,1328,1327,1294,1295,1328,1295,1329,1328,1295,1296,1329,1296,1330,1329,1296,1297,1330,1297,1331,1330,1297,1298,1331,1298,1332,1331,1298,1299,1332,1299,1333,1332,1299,1300,1333,1300,1334,1333,1300,1301,1334,1301,1335,1334,1301,1302,1335,1302,1336,1335,1302,1303,1336,1303,1337,1336,1303,1304,1337,1304,1338,1337,1304,1305,1338,1305,1339,1338,1305,1306,1339,1306,1340,1339,1306,1307,1340,1307,1341,1340,1307,1308,1341,1308,1342,1341,1308,1309,1342,1309,1343,1342,1309,1310,1343,1310,1344,1343,1310,1311,1344,1311,1345,1344,1313,1314,1346,1314,1347,1346,1314,1315,1347,1315,1348,1347,1315,1316,1348,1316,1349,1348,1316,1317,1349,1317,1350,1349,1317,1318,1350,1318,1351,1350,1318,1319,1351,1319,1352,1351,1319,1320,1352,1320,1353,1352,1320,1321,1353,1321,1354,1353,1321,1322,1354,1322,1355,1354,1322,1323,1355,1323,1356,1355,1323,1324,1356,1324,1357,1356,1324,1325,1357,1325,1358,1357,1325,1326,1358,1326,1359,1358,1326,1327,1359,1327,1360,1359,1327,1328,1360,1328,1361,1360,1328,1329,1361,1329,1362,1361,1329,1330,1362,1330,1363,1362,1330,1331,1363,1331,1364,1363,1331,1332,1364,1332,1365,1364,1332,1333,1365,1333,1366,1365,1333,1334,1366,1334,1367,1366,1334,1335,1367,1335,1368,1367,1335,1336,1368,1336,1369,1368,1336,1337,1369,1337,1370,1369,1337,1338,1370,1338,1371,1370,1338,1339,1371,1339,1372,1371,1339,1340,1372,1340,1373,1372,1340,1341,1373,1341,1374,1373,1341,1342,1374,1342,1375,1374,1342,1343,1375,1343,1376,1375,1343,1344,1376,1344,1377,1376,1344,1345,1377,1345,1378,1377,1345,1379,1378,1379,1380,1378,1379,1381,1380,1381,1382,1380,1383,1346,1384,1346,1385,1384,1346,1347,1385,1347,1386,1385,1347,1348,1386,1348,1387,1386,1348,1349,1387,1349,1388,1387,1349,1350,1388,1350,1389,1388,1350,1351,1389,1351,1390,1389,1351,1352,1390,1352,1391,1390,1352,1353,1391,1353,1392,1391,1353,1354,1392,1354,1393,1392,1354,1355,1393,1355,1394,1393,1355,1356,1394,1356,1395,1394,1356,1357,1395,1357,1396,1395,1357,1358,1396,1358,1397,1396,1358,1359,1397,1359,1398,1397,1359,1360,1398,1360,1399,1398,1360,1361,1399,1361,1400,1399,1361,1362,1400,1362,1401,1400,1362,1363,1401,1363,1402,1401,1363,1364,1402,1364,1403,1402,1364,1365,1403,1365,1404,1403,1365,1366,1404,1366,1405,1404,1366,1367,1405,1367,1406,1405,1367,1368,1406,1368,1407,1406,1368,1369,1407,1369,1408,1407,1369,1370,1408,1370,1409,1408,1370,1371,1409,1371,1410,1409,1371,1372,1410,1372,1411,1410,1372,1373,1411,1373,1412,1411,1373,1374,1412,1374,1413,1412,1374,1375,1413,1375,1414,1413,1375,1376,1414,1376,1415,1414,1376,1377,1415,1377,1416,1415,1377,1378,1416,1378,1417,1416,1378,1380,1417,1380,1418,1417,1380,1382,1418,1382,1419,1418,1382,1420,1419,1420,1421,1419,1422,1384,1423,1384,1424,1423,1384,1385,1424,1385,1425,1424,1385,1386,1425,1386,1426,1425,1386,1387,1426,1387,1427,1426,1387,1388,1427,1388,1428,1427,1388,1389,1428,1389,1429,1428,1389,1390,1429,1390,1430,1429,1390,1391,1430,1391,1431,1430,1391,1392,1431,1392,1432,1431,1392,1393,1432,1393,1433,1432,1393,1394,1433,1394,1434,1433,1394,1395,1434,1395,1435,1434,1395,1396,1435,1396,1436,1435,1396,1397,1436,1397,1437,1436,1397,1398,1437,1398,1438,1437,1398,1399,1438,1399,1439,1438,1399,1400,1439,1400,1440,1439,1400,1401,1440,1401,1441,1440,1401,1402,1441,1402,1442,1441,1402,1403,1442,1403,1443,1442,1403,1404,1443,1404,1444,1443,1404,1405,1444,1405,1445,1444,1405,1406,1445,1406,1446,1445,1406,1407,1446,1407,1447,1446,1407,1408,1447,1408,1448,1447,1408,1409,1448,1409,1449,1448,1409,1410,1449,1410,1450,1449,1410,1411,1450,1411,1451,1450,1411,1412,1451,1412,1452,1451,1412,1413,1452,1413,1453,1452,1413,1414,1453,1414,1454,1453,1414,1415,1454,1415,1455,1454,1415,1416,1455,1416,1456,1455,1416,1417,1456,1417,1457,1456,1417,1418,1457,1418,1458,1457,1418,1419,1458,1419,1459,1458,1419,1421,1459,1421,1460,1459,1421,1461,1460,1461,1462,1460,1423,1424,1463,1424,1464,1463,1424,1425,1464,1425,1465,1464,1425,1426,1465,1426,1466,1465,1426,1427,1466,1427,1467,1466,1427,1428,1467,1428,1468,1467,1428,1429,1468,1429,1469,1468,1429,1430,1469,1430,1470,1469,1430,1431,1470,1431,1471,1470,1431,1432,1471,1432,1472,1471,1432,1433,1472,1433,1473,1472,1433,1434,1473,1434,1474,1473,1434,1435,1474,1435,1475,1474,1435,1436,1475,1436,1476,1475,1436,1437,1476,1437,1477,1476,1437,1438,1477,1438,1478,1477,1438,1439,1478,1439,1479,1478,1439,1440,1479,1440,1480,1479,1440,1441,1480,1441,1481,1480,1441,1442,1481,1442,1482,1481,1442,1443,1482,1443,1483,1482,1443,1444,1483,1444,1484,1483,1444,1445,1484,1445,1485,1484,1445,1446,1485,1446,1486,1485,1446,1447,1486,1447,1487,1486,1447,1448,1487,1448,1488,1487,1448,1449,1488,1449,1489,1488,1449,1450,1489,1450,1490,1489,1450,1451,1490,1451,1491,1490,1451,1452,1491,1452,1492,1491,1452,1453,1492,1453,1493,1492,1453,1454,1493,1454,1494,1493,1454,1455,1494,1455,1495,1494,1455,1456,1495,1456,1496,1495,1456,1457,1496,1457,1497,1496,1457,1458,1497,1458,1498,1497,1458,1459,1498,1459,1499,1498,1459,1460,1499,1460,1500,1499,1460,1462,1500,1462,1501,1500,1502,1463,1503,1463,1504,1503,1463,1464,1504,1464,1505,1504,1464,1465,1505,1465,1506,1505,1465,1466,1506,1466,1507,1506,1466,1467,1507,1467,1508,1507,1467,1468,1508,1468,1509,1508,1468,1469,1509,1469,1510,1509,1469,1470,1510,1470,1511,1510,1470,1471,1511,1471,1512,1511,1471,1472,1512,1472,1513,1512,1472,1473,1513,1473,1514,1513,1473,1474,1514,1474,1515,1514,1474,1475,1515,1475,1516,1515,1475,1476,1516,1476,1517,1516,1476,1477,1517,1477,1518,1517,1477,1478,1518,1478,1519,1518,1478,1479,1519,1479,1520,1519,1479,1480,1520,1480,1521,1520,1480,1481,1521,1481,1522,1521,1481,1482,1522,1482,1523,1522,1482,1483,1523,1483,1524,1523,1483,1484,1524,1484,1525,1524,1484,1485,1525,1485,1526,1525,1485,1486,1526,1486,1527,1526,1486,1487,1527,1487,1528,1527,1487,1488,1528,1488,1529,1528,1488,1489,1529,1489,1530,1529,1489,1490,1530,1490,1531,1530,1490,1491,1531,1491,1532,1531,1491,1492,1532,1492,1533,1532,1492,1493,1533,1493,1534,1533,1493,1494,1534,1494,1535,1534,1494,1495,1535,1495,1536,1535,1495,1496,1536,1496,1537,1536,1496,1497,1537,1497,1538,1537,1497,1498,1538,1498,1539,1538,1498,1499,1539,1499,1540,1539,1499,1500,1540,1500,1541,1540,1500,1501,1541,1501,1542,1541,1543,1503,1544,1503,1545,1544,1503,1504,1545,1504,1546,1545,1504,1505,1546,1505,1547,1546,1505,1506,1547,1506,1548,1547,1506,1507,1548,1507,1549,1548,1507,1508,1549,1508,1550,1549,1508,1509,1550,1509,1551,1550,1509,1510,1551,1510,1552,1551,1510,1511,1552,1511,1553,1552,1511,1512,1553,1512,1554,1553,1512,1513,1554,1513,1555,1554,1513,1514,1555,1514,1556,1555,1514,1515,1556,1515,1557,1556,1515,1516,1557,1516,1558,1557,1516,1517,1558,1517,1559,1558,1517,1518,1559,1518,1560,1559,1518,1519,1560,1519,1561,1560,1519,1520,1561,1520,1562,1561,1520,1521,1562,1521,1563,1562,1521,1522,1563,1522,1564,1563,1522,1523,1564,1523,1565,1564,1523,1524,1565,1524,1566,1565,1524,1525,1566,1525,1567,1566,1525,1526,1567,1526,1568,1567,1526,1527,1568,1527,1569,1568,1527,1528,1569,1528,1570,1569,1528,1529,1570,1529,1571,1570,1529,1530,1571,1530,1572,1571,1530,1531,1572,1531,1573,1572,1531,1532,1573,1532,1574,1573,1532,1533,1574,1533,1575,1574,1533,1534,1575,1534,1576,1575,1534,1535,1576,1535,1577,1576,1535,1536,1577,1536,1578,1577,1536,1537,1578,1537,1579,1578,1537,1538,1579,1538,1580,1579,1538,1539,1580,1539,1581,1580,1539,1540,1581,1540,1582,1581,1540,1541,1582,1541,1583,1582,1541,1542,1583,1542,1584,1583,1544,1545,1585,1545,1586,1585,1545,1546,1586,1546,1587,1586,1546,1547,1587,1547,1588,1587,1547,1548,1588,1548,1589,1588,1548,1549,1589,1549,1590,1589,1549,1550,1590,1550,1591,1590,1550,1551,1591,1551,1592,1591,1551,1552,1592,1552,1593,1592,1552,1553,1593,1553,1594,1593,1553,1554,1594,1554,1595,1594,1554,1555,1595,1555,1596,1595,1555,1556,1596,1556,1597,1596,1556,1557,1597,1557,1598,1597,1557,1558,1598,1558,1599,1598,1558,1559,1599,1559,1600,1599,1559,1560,1600,1560,1601,1600,1560,1561,1601,1561,1602,1601,1561,1562,1602,1562,1603,1602,1562,1563,1603,1563,1604,1603,1563,1564,1604,1564,1605,1604,1564,1565,1605,1565,1606,1605,1565,1566,1606,1566,1607,1606,1566,1567,1607,1567,1608,1607,1567,1568,1608,1568,1609,1608,1568,1569,1609,1569,1610,1609,1569,1570,1610,1570,1611,1610,1570,1571,1611,1571,1612,1611,1571,1572,1612,1572,1613,1612,1572,1573,1613,1573,1614,1613,1573,1574,1614,1574,1615,1614,1574,1575,1615,1575,1616,1615,1575,1576,1616,1576,1617,1616,1576,1577,1617,1577,1618,1617,1577,1578,1618,1578,1619,1618,1578,1579,1619,1579,1620,1619,1579,1580,1620,1580,1621,1620,1580,1581,1621,1581,1622,1621,1581,1582,1622,1582,1623,1622,1582,1583,1623,1583,1624,1623,1583,1584,1624,1584,1625,1624,1585,1586,1626,1586,1627,1626,1586,1587,1627,1587,1628,1627,1587,1588,1628,1588,1629,1628,1588,1589,1629,1589,1630,1629,1589,1590,1630,1590,1631,1630,1590,1591,1631,1591,1632,1631,1591,1592,1632,1592,1633,1632,1592,1593,1633,1593,1634,1633,1593,1594,1634,1594,1635,1634,1594,1595,1635,1595,1636,1635,1595,1596,1636,1596,1637,1636,1596,1597,1637,1597,1638,1637,1597,1598,1638,1598,1639,1638,1598,1599,1639,1599,1640,1639,1599,1600,1640,1600,1641,1640,1600,1601,1641,1601,1642,1641,1601,1602,1642,1602,1643,1642,1602,1603,1643,1603,1644,1643,1603,1604,1644,1604,1645,1644,1604,1605,1645,1605,1646,1645,1605,1606,1646,1606,1647,1646,1606,1607,1647,1607,1648,1647,1607,1608,1648,1608,1649,1648,1608,1609,1649,1609,1650,1649,1609,1610,1650,1610,1651,1650,1610,1611,1651,1611,1652,1651,1611,1612,1652,1612,1653,1652,1612,1613,1653,1613,1654,1653,1613,1614,1654,1614,1655,1654,1614,1615,1655,1615,1656,1655,1615,1616,1656,1616,1657,1656,1616,1617,1657,1617,1658,1657,1617,1618,1658,1618,1659,1658,1618,1619,1659,1619,1660,1659,1619,1620,1660,1620,1661,1660,1620,1621,1661,1621,1662,1661,1621,1622,1662,1622,1663,1662,1622,1623,1663,1623,1664,1663,1626,1627,1665,1627,1666,1665,1627,1628,1666,1628,1667,1666,1628,1629,1667,1629,1668,1667,1629,1630,1668,1630,1669,1668,1630,1631,1669,1631,1670,1669,1631,1632,1670,1632,1671,1670,1632,1633,1671,1633,1672,1671,1633,1634,1672,1634,1673,1672,1634,1635,1673,1635,1674,1673,1635,1636,1674,1636,1675,1674,1636,1637,1675,1637,1676,1675,1637,1638,1676,1638,1677,1676,1638,1639,1677,1639,1678,1677,1639,1640,1678,1640,1679,1678,1640,1641,1679,1641,1680,1679,1641,1642,1680,1642,1681,1680,1642,1643,1681,1643,1682,1681,1643,1644,1682,1644,1683,1682,1644,1645,1683,1645,1684,1683,1645,1646,1684,1646,1685,1684,1646,1647,1685,1647,1686,1685,1647,1648,1686,1648,1687,1686,1648,1649,1687,1649,1688,1687,1649,1650,1688,1650,1689,1688,1650,1651,1689,1651,1690,1689,1651,1652,1690,1652,1691,1690,1652,1653,1691,1653,1692,1691,1653,1654,1692,1654,1693,1692,1654,1655,1693,1655,1694,1693,1655,1656,1694,1656,1695,1694,1656,1657,1695,1657,1696,1695,1657,1658,1696,1658,1697,1696,1658,1659,1697,1659,1698,1697,1659,1660,1698,1660,1699,1698,1660,1661,1699,1661,1700,1699,1661,1662,1700,1662,1701,1700,1662,1663,1701,1663,1702,1701,1663,1664,1702,1664,1703,1702,1704,1665,1705,1665,1706,1705,1665,1666,1706,1666,1707,1706,1666,1667,1707,1667,1708,1707,1667,1668,1708,1668,1709,1708,1668,1669,1709,1669,1710,1709,1669,1670,1710,1670,1711,1710,1670,1671,1711,1671,1712,1711,1671,1672,1712,1672,1713,1712,1672,1673,1713,1673,1714,1713,1673,1674,1714,1674,1715,1714,1674,1675,1715,1675,1716,1715,1675,1676,1716,1676,1717,1716,1676,1677,1717,1677,1718,1717,1677,1678,1718,1678,1719,1718,1678,1679,1719,1679,1720,1719,1679,1680,1720,1680,1721,1720,1680,1681,1721,1681,1722,1721,1681,1682,1722,1682,1723,1722,1682,1683,1723,1683,1724,1723,1683,1684,1724,1684,1725,1724,1684,1685,1725,1685,1726,1725,1685,1686,1726,1686,1727,1726,1686,1687,1727,1687,1728,1727,1687,1688,1728,1688,1729,1728,1688,1689,1729,1689,1730,1729,1689,1690,1730,1690,1731,1730,1690,1691,1731,1691,1732,1731,1691,1692,1732,1692,1733,1732,1692,1693,1733,1693,1734,1733,1693,1694,1734,1694,1735,1734,1694,1695,1735,1695,1736,1735,1695,1696,1736,1696,1737,1736,1696,1697,1737,1697,1738,1737,1697,1698,1738,1698,1739,1738,1698,1699,1739,1699,1740,1739,1699,1700,1740,1700,1741,1740,1700,1701,1741,1701,1742,1741,1701,1702,1742,1702,1743,1742,1702,1703,1743,1703,1744,1743,1703,1745,1744,1745,1746,1744,1747,1705,1748,1705,1749,1748,1705,1706,1749,1706,1750,1749,1706,1707,1750,1707,1751,1750,1707,1708,1751,1708,1752,1751,1708,1709,1752,1709,1753,1752,1709,1710,1753,1710,1754,1753,1710,1711,1754,1711,1755,1754,1711,1712,1755,1712,1756,1755,1712,1713,1756,1713,1757,1756,1713,1714,1757,1714,1758,1757,1714,1715,1758,1715,1759,1758,1715,1716,1759,1716,1760,1759,1716,1717,1760,1717,1761,1760,1717,1718,1761,1718,1762,1761,1718,1719,1762,1719,1763,1762,1719,1720,1763,1720,1764,1763,1720,1721,1764,1721,1765,1764,1721,1722,1765,1722,1766,1765,1722,1723,1766,1723,1767,1766,1723,1724,1767,1724,1768,1767,1724,1725,1768,1725,1769,1768,1725,1726,1769,1726,1770,1769,1726,1727,1770,1727,1771,1770,1727,1728,1771,1728,1772,1771,1728,1729,1772,1729,1773,1772,1729,1730,1773,1730,1774,1773,1730,1731,1774,1731,1775,1774,1731,1732,1775,1732,1776,1775,1732,1733,1776,1733,1777,1776,1733,1734,1777,1734,1778,1777,1734,1735,1778,1735,1779,1778,1735,1736,1779,1736,1780,1779,1736,1737,1780,1737,1781,1780,1737,1738,1781,1738,1782,1781,1738,1739,1782,1739,1783,1782,1739,1740,1783,1740,1784,1783,1740,1741,1784,1741,1785,1784,1741,1742,1785,1742,1786,1785,1742,1743,1786,1743,1787,1786,1743,1744,1787,1744,1788,1787,1744,1746,1788,1746,1789,1788,1748,1749,1790,1749,1791,1790,1749,1750,1791,1750,1792,1791,1750,1751,1792,1751,1793,1792,1751,1752,1793,1752,1794,1793,1752,1753,1794,1753,1795,1794,1753,1754,1795,1754,1796,1795,1754,1755,1796,1755,1797,1796,1755,1756,1797,1756,1798,1797,1756,1757,1798,1757,1799,1798,1757,1758,1799,1758,1800,1799,1758,1759,1800,1759,1801,1800,1759,1760,1801,1760,1802,1801,1760,1761,1802,1761,1803,1802,1761,1762,1803,1762,1804,1803,1762,1763,1804,1763,1805,1804,1763,1764,1805,1764,1806,1805,1764,1765,1806,1765,1807,1806,1765,1766,1807,1766,1808,1807,1766,1767,1808,1767,1809,1808,1767,1768,1809,1768,1810,1809,1768,1769,1810,1769,1811,1810,1769,1770,1811,1770,1812,1811,1770,1771,1812,1771,1813,1812,1771,1772,1813,1772,1814,1813,1772,1773,1814,1773,1815,1814,1773,1774,1815,1774,1816,1815,1774,1775,1816,1775,1817,1816,1775,1776,1817,1776,1818,1817,1776,1777,1818,1777,1819,1818,1777,1778,1819,1778,1820,1819,1778,1779,1820,1779,1821,1820,1779,1780,1821,1780,1822,1821,1780,1781,1822,1781,1823,1822,1781,1782,1823,1782,1824,1823,1782,1783,1824,1783,1825,1824,1783,1784,1825,1784,1826,1825,1784,1785,1826,1785,1827,1826,1785,1786,1827,1786,1828,1827,1786,1787,1828,1787,1829,1828,1787,1788,1829,1788,1830,1829,1788,1789,1830,1789,1831,1830,1789,1832,1831,1832,1833,1831,1790,1791,1834,1791,1835,1834,1791,1792,1835,1792,1836,1835,1792,1793,1836,1793,1837,1836,1793,1794,1837,1794,1838,1837,1794,1795,1838,1795,1839,1838,1795,1796,1839,1796,1840,1839,1796,1797,1840,1797,1841,1840,1797,1798,1841,1798,1842,1841,1798,1799,1842,1799,1843,1842,1799,1800,1843,1800,1844,1843,1800,1801,1844,1801,1845,1844,1801,1802,1845,1802,1846,1845,1802,1803,1846,1803,1847,1846,1803,1804,1847,1804,1848,1847,1804,1805,1848,1805,1849,1848,1805,1806,1849,1806,1850,1849,1806,1807,1850,1807,1851,1850,1807,1808,1851,1808,1852,1851,1808,1809,1852,1809,1853,1852,1809,1810,1853,1810,1854,1853,1810,1811,1854,1811,1855,1854,1811,1812,1855,1812,1856,1855,1812,1813,1856,1813,1857,1856,1813,1814,1857,1814,1858,1857,1814,1815,1858,1815,1859,1858,1815,1816,1859,1816,1860,1859,1816,1817,1860,1817,1861,1860,1817,1818,1861,1818,1862,1861,1818,1819,1862,1819,1863,1862,1819,1820,1863,1820,1864,1863,1820,1821,1864,1821,1865,1864,1821,1822,1865,1822,1866,1865,1822,1823,1866,1823,1867,1866,1823,1824,1867,1824,1868,1867,1824,1825,1868,1825,1869,1868,1825,1826,1869,1826,1870,1869,1826,1827,1870,1827,1871,1870,1827,1828,1871,1828,1872,1871,1828,1829,1872,1829,1873,1872,1829,1830,1873,1830,1874,1873,1830,1831,1874,1831,1875,1874,1831,1833,1875,1833,1876,1875,1833,1877,1876,1877,1878,1876,1879,1834,1880,1834,1881,1880,1834,1835,1881,1835,1882,1881,1835,1836,1882,1836,1883,1882,1836,1837,1883,1837,1884,1883,1837,1838,1884,1838,1885,1884,1838,1839,1885,1839,1886,1885,1839,1840,1886,1840,1887,1886,1840,1841,1887,1841,1888,1887,1841,1842,1888,1842,1889,1888,1842,1843,1889,1843,1890,1889,1843,1844,1890,1844,1891,1890,1844,1845,1891,1845,1892,1891,1845,1846,1892,1846,1893,1892,1846,1847,1893,1847,1894,1893,1847,1848,1894,1848,1895,1894,1848,1849,1895,1849,1896,1895,1849,1850,1896,1850,1897,1896,1850,1851,1897,1851,1898,1897,1851,1852,1898,1852,1899,1898,1852,1853,1899,1853,1900,1899,1853,1854,1900,1854,1901,1900,1854,1855,1901,1855,1902,1901,1855,1856,1902,1856,1903,1902,1856,1857,1903,1857,1904,1903,1857,1858,1904,1858,1905,1904,1858,1859,1905,1859,1906,1905,1859,1860,1906,1860,1907,1906,1860,1861,1907,1861,1908,1907,1861,1862,1908,1862,1909,1908,1862,1863,1909,1863,1910,1909,1863,1864,1910,1864,1911,1910,1864,1865,1911,1865,1912,1911,1865,1866,1912,1866,1913,1912,1866,1867,1913,1867,1914,1913,1867,1868,1914,1868,1915,1914,1868,1869,1915,1869,1916,1915,1869,1870,1916,1870,1917,1916,1870,1871,1917,1871,1918,1917,1871,1872,1918,1872,1919,1918,1872,1873,1919,1873,1920,1919,1873,1874,1920,1874,1921,1920,1874,1875,1921,1875,1922,1921,1875,1876,1922,1876,1923,1922,1876,1878,1923,1878,1924,1923,1880,1881,1925,1881,1926,1925,1881,1882,1926,1882,1927,1926,1882,1883,1927,1883,1928,1927,1883,1884,1928,1884,1929,1928,1884,1885,1929,1885,1930,1929,1885,1886,1930,1886,1931,1930,1886,1887,1931,1887,1932,1931,1887,1888,1932,1888,1933,1932,1888,1889,1933,1889,1934,1933,1889,1890,1934,1890,1935,1934,1890,1891,1935,1891,1936,1935,1891,1892,1936,1892,1937,1936,1892,1893,1937,1893,1938,1937,1893,1894,1938,1894,1939,1938,1894,1895,1939,1895,1940,1939,1895,1896,1940,1896,1941,1940,1896,1897,1941,1897,1942,1941,1897,1898,1942,1898,1943,1942,1898,1899,1943,1899,1944,1943,1899,1900,1944,1900,1945,1944,1900,1901,1945,1901,1946,1945,1901,1902,1946,1902,1947,1946,1902,1903,1947,1903,1948,1947,1903,1904,1948,1904,1949,1948,1904,1905,1949,1905,1950,1949,1905,1906,1950,1906,1951,1950,1906,1907,1951,1907,1952,1951,1907,1908,1952,1908,1953,1952,1908,1909,1953,1909,1954,1953,1909,1910,1954,1910,1955,1954,1910,1911,1955,1911,1956,1955,1911,1912,1956,1912,1957,1956,1912,1913,1957,1913,1958,1957,1913,1914,1958,1914,1959,1958,1914,1915,1959,1915,1960,1959,1915,1916,1960,1916,1961,1960,1916,1917,1961,1917,1962,1961,1917,1918,1962,1918,1963,1962,1918,1919,1963,1919,1964,1963,1919,1920,1964,1920,1965,1964,1920,1921,1965,1921,1966,1965,1921,1922,1966,1922,1967,1966,1922,1923,1967,1923,1968,1967,1923,1924,1968,1924,1969,1968,1925,1926,1970,1926,1971,1970,1926,1927,1971,1927,1972,1971,1927,1928,1972,1928,1973,1972,1928,1929,1973,1929,1974,1973,1929,1930,1974,1930,1975,1974,1930,1931,1975,1931,1976,1975,1931,1932,1976,1932,1977,1976,1932,1933,1977,1933,1978,1977,1933,1934,1978,1934,1979,1978,1934,1935,1979,1935,1980,1979,1935,1936,1980,1936,1981,1980,1936,1937,1981,1937,1982,1981,1937,1938,1982,1938,1983,1982,1938,1939,1983,1939,1984,1983,1939,1940,1984,1940,1985,1984,1940,1941,1985,1941,1986,1985,1941,1942,1986,1942,1987,1986,1942,1943,1987,1943,1988,1987,1943,1944,1988,1944,1989,1988,1944,1945,1989,1945,1990,1989,1945,1946,1990,1946,1991,1990,1946,1947,1991,1947,1992,1991,1947,1948,1992,1948,1993,1992,1948,1949,1993,1949,1994,1993,1949,1950,1994,1950,1995,1994,1950,1951,1995,1951,1996,1995,1951,1952,1996,1952,1997,1996,1952,1953,1997,1953,1998,1997,1953,1954,1998,1954,1999,1998,1954,1955,1999,1955,2000,1999,1955,1956,2000,1956,2001,2000,1956,1957,2001,1957,2002,2001,1957,1958,2002,1958,2003,2002,1958,1959,2003,1959,2004,2003,1959,1960,2004,1960,2005,2004,1960,1961,2005,1961,2006,2005,1961,1962,2006,1962,2007,2006,1962,1963,2007,1963,2008,2007,1963,1964,2008,1964,2009,2008,1964,1965,2009,1965,2010,2009,1965,1966,2010,1966,2011,2010,1966,1967,2011,1967,2012,2011,1967,1968,2012,1968,2013,2012,1968,1969,2013,1969,2014,2013,1970,1971,2015,1971,2016,2015,1971,1972,2016,1972,2017,2016,1972,1973,2017,1973,2018,2017,1973,1974,2018,1974,2019,2018,1974,1975,2019,1975,2020,2019,1975,1976,2020,1976,2021,2020,1976,1977,2021,1977,2022,2021,1977,1978,2022,1978,2023,2022,1978,1979,2023,1979,2024,2023,1979,1980,2024,1980,2025,2024,1980,1981,2025,1981,2026,2025,1981,1982,2026,1982,2027,2026,1982,1983,2027,1983,2028,2027,1983,1984,2028,1984,2029,2028,1984,1985,2029,1985,2030,2029,1985,1986,2030,1986,2031,2030,1986,1987,2031,1987,2032,2031,1987,1988,2032,1988,2033,2032,1988,1989,2033,1989,2034,2033,1989,1990,2034,1990,2035,2034,1990,1991,2035,1991,2036,2035,1991,1992,2036,1992,2037,2036,1992,1993,2037,1993,2038,2037,1993,1994,2038,1994,2039,2038,1994,1995,2039,1995,2040,2039,1995,1996,2040,1996,2041,2040,1996,1997,2041,1997,2042,2041,1997,1998,2042,1998,2043,2042,1998,1999,2043,1999,2044,2043,1999,2000,2044,2000,2045,2044,2000,2001,2045,2001,2046,2045,2001,2002,2046,2002,2047,2046,2002,2003,2047,2003,2048,2047,2003,2004,2048,2004,2049,2048,2004,2005,2049,2005,2050,2049,2005,2006,2050,2006,2051,2050,2006,2007,2051,2007,2052,2051,2007,2008,2052,2008,2053,2052,2008,2009,2053,2009,2054,2053,2009,2010,2054,2010,2055,2054,2010,2011,2055,2011,2056,2055,2011,2012,2056,2012,2057,2056,2012,2013,2057,2013,2058,2057,2013,2014,2058,2014,2059,2058,2060,2015,2061,2015,2062,2061,2015,2016,2062,2016,2063,2062,2016,2017,2063,2017,2064,2063,2017,2018,2064,2018,2065,2064,2018,2019,2065,2019,2066,2065,2019,2020,2066,2020,2067,2066,2020,2021,2067,2021,2068,2067,2021,2022,2068,2022,2069,2068,2022,2023,2069,2023,2070,2069,2023,2024,2070,2024,2071,2070,2024,2025,2071,2025,2072,2071,2025,2026,2072,2026,2073,2072,2026,2027,2073,2027,2074,2073,2027,2028,2074,2028,2075,2074,2028,2029,2075,2029,2076,2075,2029,2030,2076,2030,2077,2076,2030,2031,2077,2031,2078,2077,2031,2032,2078,2032,2079,2078,2032,2033,2079,2033,2080,2079,2033,2034,2080,2034,2081,2080,2034,2035,2081,2035,2082,2081,2035,2036,2082,2036,2083,2082,2036,2037,2083,2037,2084,2083,2037,2038,2084,2038,2085,2084,2038,2039,2085,2039,2086,2085,2039,2040,2086,2040,2087,2086,2040,2041,2087,2041,2088,2087,2041,2042,2088,2042,2089,2088,2042,2043,2089,2043,2090,2089,2043,2044,2090,2044,2091,2090,2044,2045,2091,2045,2092,2091,2045,2046,2092,2046,2093,2092,2046,2047,2093,2047,2094,2093,2047,2048,2094,2048,2095,2094,2048,2049,2095,2049,2096,2095,2049,2050,2096,2050,2097,2096,2050,2051,2097,2051,2098,2097,2051,2052,2098,2052,2099,2098,2052,2053,2099,2053,2100,2099,2053,2054,2100,2054,2101,2100,2054,2055,2101,2055,2102,2101,2055,2056,2102,2056,2103,2102,2056,2057,2103,2057,2104,2103,2057,2058,2104,2058,2105,2104,2058,2059,2105,2059,2106,2105,2061,2062,2107,2062,2108,2107,2062,2063,2108,2063,2109,2108,2063,2064,2109,2064,2110,2109,2064,2065,2110,2065,2111,2110,2065,2066,2111,2066,2112,2111,2066,2067,2112,2067,2113,2112,2067,2068,2113,2068,2114,2113,2068,2069,2114,2069,2115,2114,2069,2070,2115,2070,2116,2115,2070,2071,2116,2071,2117,2116,2071,2072,2117,2072,2118,2117,2072,2073,2118,2073,2119,2118,2073,2074,2119,2074,2120,2119,2074,2075,2120,2075,2121,2120,2075,2076,2121,2076,2122,2121,2076,2077,2122,2077,2123,2122,2077,2078,2123,2078,2124,2123,2078,2079,2124,2079,2125,2124,2079,2080,2125,2080,2126,2125,2080,2081,2126,2081,2127,2126,2081,2082,2127,2082,2128,2127,2082,2083,2128,2083,2129,2128,2083,2084,2129,2084,2130,2129,2084,2085,2130,2085,2131,2130,2085,2086,2131,2086,2132,2131,2086,2087,2132,2087,2133,2132,2087,2088,2133,2088,2134,2133,2088,2089,2134,2089,2135,2134,2089,2090,2135,2090,2136,2135,2090,2091,2136,2091,2137,2136,2091,2092,2137,2092,2138,2137,2092,2093,2138,2093,2139,2138,2093,2094,2139,2094,2140,2139,2094,2095,2140,2095,2141,2140,2095,2096,2141,2096,2142,2141,2096,2097,2142,2097,2143,2142,2097,2098,2143,2098,2144,2143,2098,2099,2144,2099,2145,2144,2099,2100,2145,2100,2146,2145,2100,2101,2146,2101,2147,2146,2101,2102,2147,2102,2148,2147,2102,2103,2148,2103,2149,2148,2103,2104,2149,2104,2150,2149,2104,2105,2150,2105,2151,2150,2105,2106,2151,2106,2152,2151,2107,2108,2153,2108,2154,2153,2108,2109,2154,2109,2155,2154,2109,2110,2155,2110,2156,2155,2110,2111,2156,2111,2157,2156,2111,2112,2157,2112,2158,2157,2118,2119,2159,2119,2160,2159,2119,2120,2160,2120,2161,2160,2120,2121,2161,2121,2162,2161,2121,2122,2162,2122,2163,2162,2122,2123,2163,2123,2164,2163,2123,2124,2164,2124,2165,2164,2124,2125,2165,2125,2166,2165,2125,2126,2166,2126,2167,2166,2126,2127,2167,2127,2168,2167,2127,2128,2168,2128,2169,2168,2128,2129,2169,2129,2170,2169,2129,2130,2170,2130,2171,2170,2130,2131,2171,2131,2172,2171,2131,2132,2172,2132,2173,2172,2132,2133,2173,2133,2174,2173,2133,2134,2174,2134,2175,2174,2134,2135,2175,2135,2176,2175,2135,2136,2176,2136,2177,2176,2136,2137,2177,2137,2178,2177,2137,2138,2178,2138,2179,2178,2138,2139,2179,2139,2180,2179,2139,2140,2180,2140,2181,2180,2140,2141,2181,2141,2182,2181,2141,2142,2182,2142,2183,2182,2142,2143,2183,2143,2184,2183,2143,2144,2184,2144,2185,2184,2146,2147,2186,2147,2187,2186,2147,2148,2187,2148,2188,2187,2148,2149,2188,2149,2189,2188,2149,2150,2189,2150,2190,2189,2150,2151,2190,2151,2191,2190,2151,2152,2191,2152,2192,2191,2153,2154,2193,2154,2194,2193,2154,2155,2194,2155,2195,2194,2155,2156,2195,2156,2196,2195,2156,2157,2196,2157,2197,2196,2157,2158,2197,2158,2198,2197,2159,2160,2199,2160,2200,2199,2160,2161,2200,2161,2201,2200,2161,2162,2201,2162,2202,2201,2162,2163,2202,2163,2203,2202,2163,2164,2203,2164,2204,2203,2164,2165,2204,2165,2205,2204,2168,2169,2206,2169,2207,2206,2169,2170,2207,2170,2208,2207,2170,2171,2208,2171,2209,2208,2171,2172,2209,2172,2210,2209,2172,2173,2210,2173,2211,2210,2173,2174,2211,2174,2212,2211,2174,2175,2212,2175,2213,2212,2175,2176,2213,2176,2214,2213,2176,2177,2214,2177,2215,2214,2177,2178,2215,2178,2216,2215,2178,2179,2216,2179,2217,2216,2179,2180,2217,2180,2218,2217,2180,2181,2218,2181,2219,2218,2181,2182,2219,2182,2220,2219,2182,2183,2220,2183,2221,2220,2183,2184,2221,2184,2222,2221,2184,2185,2222,2185,2223,2222,2194,2195,2224,2195,2225,2224,2195,2196,2225,2196,2226,2225,2196,2197,2226,2197,2227,2226,2197,2198,2227,2198,2228,2227,2199,2200,2229,2200,2230,2229,2200,2201,2230,2201,2231,2230,2201,2202,2231,2202,2232,2231,2202,2203,2232,2203,2233,2232,2203,2204,2233,2204,2234,2233,2204,2205,2234,2205,2235,2234,2209,2210,2236,2210,2237,2236,2210,2211,2237,2211,2238,2237,2211,2212,2238,2212,2239,2238,2212,2213,2239,2213,2240,2239,2213,2214,2240,2214,2241,2240,2214,2215,2241,2215,2242,2241,2215,2216,2242,2216,2243,2242,2216,2217,2243,2217,2244,2243,2217,2218,2244,2218,2245,2244,2218,2219,2245,2219,2246,2245,2219,2220,2246,2220,2247,2246,2220,2221,2247,2221,2248,2247,2221,2222,2248,2222,2249,2248,2222,2223,2249,2223,2250,2249,2223,2251,2250,2251,2252,2250,2224,2225,2253,2225,2254,2253,2225,2226,2254,2226,2255,2254,2226,2227,2255,2227,2256,2255,2227,2228,2256,2228,2257,2256,2258,2229,2259,2229,2260,2259,2229,2230,2260,2230,2261,2260,2230,2231,2261,2231,2262,2261,2231,2232,2262,2232,2263,2262,2232,2233,2263,2233,2264,2263,2233,2234,2264,2234,2265,2264,2234,2235,2265,2235,2266,2265,2235,2267,2266,2267,2268,2266,2240,2241,2269,2241,2270,2269,2241,2242,2270,2242,2271,2270,2242,2243,2271,2243,2272,2271,2243,2244,2272,2244,2273,2272,2244,2245,2273,2245,2274,2273,2245,2246,2274,2246,2275,2274,2246,2247,2275,2247,2276,2275,2247,2248,2276,2248,2277,2276,2248,2249,2277,2249,2278,2277,2249,2250,2278,2250,2279,2278,2250,2252,2279,2252,2280,2279,2252,2281,2280,2281,2282,2280,2253,2254,2283,2254,2284,2283,2254,2255,2284,2255,2285,2284,2255,2256,2285,2256,2286,2285,2256,2257,2286,2257,2287,2286,2288,2259,2289,2259,2290,2289,2259,2260,2290,2260,2291,2290,2260,2261,2291,2261,2292,2291,2261,2262,2292,2262,2293,2292,2262,2263,2293,2263,2294,2293,2263,2264,2294,2264,2295,2294,2264,2265,2295,2265,2296,2295,2265,2266,2296,2266,2297,2296,2266,2268,2297,2268,2298,2297,2272,2273,2299,2273,2300,2299,2273,2274,2300,2274,2301,2300,2274,2275,2301,2275,2302,2301,2275,2276,2302,2276,2303,2302,2276,2277,2303,2277,2304,2303,2277,2278,2304,2278,2305,2304,2278,2279,2305,2279,2306,2305,2279,2280,2306,2280,2307,2306,2280,2282,2307,2282,2308,2307,2309,2310,2311,2310,2312,2311,2310,2289,2312,2289,2313,2312,2289,2290,2313,2290,2314,2313,2290,2291,2314,2291,2315,2314,2291,2292,2315,2292,2316,2315,2292,2293,2316,2293,2317,2316,2293,2294,2317,2294,2318,2317,2294,2295,2318,2295,2319,2318,2295,2296,2319,2296,2320,2319,2296,2297,2320,2297,2321,2320,2297,2298,2321,2298,2322,2321,2300,2301,2323,2301,2324,2323,2301,2302,2324,2302,2325,2324,2302,2303,2325,2303,2326,2325,2303,2304,2326,2304,2327,2326,2304,2305,2327,2305,2328,2327,2305,2306,2328,2306,2329,2328,2306,2307,2329,2307,2330,2329,2307,2308,2330,2308,2331,2330,2332,2333,2334,2333,2335,2334,2333,2311,2335,2311,2336,2335,2311,2312,2336,2312,2337,2336,2312,2313,2337,2313,2338,2337,2313,2314,2338,2314,2339,2338,2314,2315,2339,2315,2340,2339,2315,2316,2340,2316,2341,2340,2316,2317,2341,2317,2342,2341,2317,2318,2342,2318,2343,2342,2318,2319,2343,2319,2344,2343,2319,2320,2344,2320,2345,2344,2320,2321,2345,2321,2346,2345,2321,2322,2346,2322,2347,2346,2323,2324,2348,2324,2349,2348,2324,2325,2349,2325,2350,2349,2325,2326,2350,2326,2351,2350,2326,2327,2351,2327,2352,2351,2327,2328,2352,2328,2353,2352,2328,2329,2353,2329,2354,2353,2329,2330,2354,2330,2355,2354,2330,2331,2355,2331,2356,2355,2331,2357,2356,2357,2358,2356,2357,2359,2358,2359,2360,2358,2361,2334,2362,2334,2363,2362,2334,2335,2363,2335,2364,2363,2335,2336,2364,2336,2365,2364,2336,2337,2365,2337,2366,2365,2337,2338,2366,2338,2367,2366,2338,2339,2367,2339,2368,2367,2339,2340,2368,2340,2369,2368,2340,2341,2369,2341,2370,2369,2341,2342,2370,2342,2371,2370,2342,2343,2371,2343,2372,2371,2343,2344,2372,2344,2373,2372,2344,2345,2373,2345,2374,2373,2345,2346,2374,2346,2375,2374,2346,2347,2375,2347,2376,2375,2348,2349,2377,2349,2378,2377,2349,2350,2378,2350,2379,2378,2350,2351,2379,2351,2380,2379,2351,2352,2380,2352,2381,2380,2352,2353,2381,2353,2382,2381,2353,2354,2382,2354,2383,2382,2354,2355,2383,2355,2384,2383,2355,2356,2384,2356,2385,2384,2356,2358,2385,2358,2386,2385,2358,2360,2386,2360,2387,2386,2362,2363,2388,2363,2389,2388,2363,2364,2389,2364,2390,2389,2364,2365,2390,2365,2391,2390,2365,2366,2391,2366,2392,2391,2366,2367,2392,2367,2393,2392,2367,2368,2393,2368,2394,2393,2368,2369,2394,2369,2395,2394,2369,2370,2395,2370,2396,2395,2370,2371,2396,2371,2397,2396,2371,2372,2397,2372,2398,2397,2372,2373,2398,2373,2399,2398,2373,2374,2399,2374,2400,2399,2374,2375,2400,2375,2401,2400,2375,2376,2401,2376,2402,2401,2377,2378,2403,2378,2404,2403,2378,2379,2404,2379,2405,2404,2379,2380,2405,2380,2406,2405,2380,2381,2406,2381,2407,2406,2381,2382,2407,2382,2408,2407,2382,2383,2408,2383,2409,2408,2383,2384,2409,2384,2410,2409,2384,2385,2410,2385,2411,2410,2385,2386,2411,2386,2412,2411,2386,2387,2412,2387,2413,2412,2388,2389,2414,2389,2415,2414,2389,2390,2415,2390,2416,2415,2390,2391,2416,2391,2417,2416,2391,2392,2417,2392,2418,2417,2392,2393,2418,2393,2419,2418,2393,2394,2419,2394,2420,2419,2394,2395,2420,2395,2421,2420,2395,2396,2421,2396,2422,2421,2396,2397,2422,2397,2423,2422,2397,2398,2423,2398,2424,2423,2398,2399,2424,2399,2425,2424,2399,2400,2425,2400,2426,2425,2400,2401,2426,2401,2427,2426,2401,2402,2427,2402,2428,2427,2403,2404,2429,2404,2430,2429,2404,2405,2430,2405,2431,2430,2405,2406,2431,2406,2432,2431,2406,2407,2432,2407,2433,2432,2407,2408,2433,2408,2434,2433,2408,2409,2434,2409,2435,2434,2409,2410,2435,2410,2436,2435,2410,2411,2436,2411,2437,2436,2411,2412,2437,2412,2438,2437,2412,2413,2438,2413,2439,2438,2414,2415,2440,2415,2441,2440,2415,2416,2441,2416,2442,2441,2416,2417,2442,2417,2443,2442,2417,2418,2443,2418,2444,2443,2418,2419,2444,2419,2445,2444,2419,2420,2445,2420,2446,2445,2420,2421,2446,2421,2447,2446,2421,2422,2447,2422,2448,2447,2422,2423,2448,2423,2449,2448,2423,2424,2449,2424,2450,2449,2424,2425,2450,2425,2451,2450,2425,2426,2451,2426,2452,2451,2426,2427,2452,2427,2453,2452,2429,2430,2454,2430,2455,2454,2430,2431,2455,2431,2456,2455,2431,2432,2456,2432,2457,2456,2432,2433,2457,2433,2458,2457,2433,2434,2458,2434,2459,2458,2434,2435,2459,2435,2460,2459,2435,2436,2460,2436,2461,2460,2436,2437,2461,2437,2462,2461,2437,2438,2462,2438,2463,2462,2438,2439,2463,2439,2464,2463,2441,2442,2465,2442,2466,2465,2442,2443,2466,2443,2467,2466,2443,2444,2467,2444,2468,2467,2444,2445,2468,2445,2469,2468,2445,2446,2469,2446,2470,2469,2446,2447,2470,2447,2471,2470,2447,2448,2471,2448,2472,2471,2454,2455,2473,2455,2474,2473,2455,2456,2474,2456,2475,2474,2456,2457,2475,2457,2476,2475,2457,2458,2476,2458,2477,2476,2458,2459,2477,2459,2478,2477,2459,2460,2478,2460,2479,2478,2460,2461,2479,2461,2480,2479,2461,2462,2480,2462,2481,2480,2462,2463,2481,2463,2482,2481,2463,2464,2482,2464,2483,2482],"bones":{"ground":{"p":[382,880],"parent":null},"torso":{"p":[382,540],"parent":"ground"},"head":{"p":[368,358],"parent":"torso"},"armL":{"p":[282,316],"parent":"torso"},"lantern":{"p":[160,236],"parent":"armL"},"armR":{"p":[556,420],"parent":"torso"},"soul":{"p":[640,332],"parent":"armR"}},"spots":{"eyeR":[387,188],"eyeL":[319,202],"lamp":[122,460],"soul":[650,90]}};
function GhostKing(host) {
  const M = LICH_MESH, PADX = 70, PADT = 70, PADB = 10, VW = M.tw + PADX * 2, VH = M.th + PADT + PADB;
  host.style.aspectRatio = VW + " / " + VH;
  const cv = document.createElement("canvas"); cv.className = "hero-cv"; host.replaceChildren(cv);
  const fallback = () => { const im = new Image(); im.src = "assets/img23.webp"; im.className = "hero-fallback"; im.style.cssText = `position:absolute;left:${PADX / VW * 100}%;top:${PADT / VH * 100}%;width:${M.tw / VW * 100}%`; host.replaceChildren(im); return { start() {}, stop() {}, still() {}, react() {} }; };
  const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return fallback();
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; };
  const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
  let P1, P2, P3;
  try {
    P1 = prog(`attribute vec2 aPos; attribute vec3 aW0; attribute vec3 aW1; attribute vec2 aW2;
      uniform mat3 uB[7]; uniform vec2 uView; uniform vec2 uPad; uniform vec2 uTex; uniform vec2 uOff; uniform float uT; uniform float uWind; varying vec2 vUV;
      void main() { vec3 p = vec3(aPos, 1.0);
        vec2 q = (uB[0] * p).xy * aW0.x + (uB[1] * p).xy * aW0.y + (uB[2] * p).xy * aW0.z + (uB[3] * p).xy * aW1.x + (uB[4] * p).xy * aW1.y + (uB[5] * p).xy * aW1.z + (uB[6] * p).xy * aW2.x; float aAmp = aW2.y;
        q.x += aAmp * (sin(aPos.y * 0.034 - uT * 3.1) * 7.0 + sin(aPos.x * 0.05 + uT * 2.2) * 3.0) * uWind;
        q.y += aAmp * sin(aPos.x * 0.04 - uT * 2.6) * 3.0 * uWind;
        vUV = (aPos - uOff) / uTex; vec2 c = (q + uPad) / uView; gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0); }`,
      `precision mediump float; uniform sampler2D uS; varying vec2 vUV; void main() { gl_FragColor = texture2D(uS, vUV); }`);
    P2 = prog(`attribute vec2 aC; uniform vec2 uCenter; uniform vec2 uSize; uniform float uRot; uniform vec2 uView; uniform vec2 uPad; varying vec2 vC;
      void main() { vC = aC; vec2 o = (aC - 0.5) * uSize; float c = cos(uRot), s = sin(uRot); vec2 q = uCenter + vec2(o.x * c - o.y * s, o.x * s + o.y * c);
        vec2 z = (q + uPad) / uView; gl_Position = vec4(z.x * 2.0 - 1.0, 1.0 - z.y * 2.0, 0.0, 1.0); }`,
      `precision mediump float; uniform sampler2D uS; uniform float uA; varying vec2 vC; void main() { gl_FragColor = texture2D(uS, vC) * uA; }`);
    P3 = prog(`attribute vec2 aC; uniform vec2 uCenter; uniform float uR; uniform vec2 uView; uniform vec2 uPad; varying vec2 vC;
      void main() { vC = aC * 2.0 - 1.0; vec2 q = uCenter + vC * uR; vec2 z = (q + uPad) / uView; gl_Position = vec4(z.x * 2.0 - 1.0, 1.0 - z.y * 2.0, 0.0, 1.0); }`,
      `precision mediump float; uniform vec3 uCol; uniform float uA; varying vec2 vC; void main() { float d = dot(vC, vC); float a = exp(-d * 3.2) * uA * (1.0 - smoothstep(0.85, 1.0, d)); gl_FragColor = vec4(uCol * a, 0.0); }`);
  } catch (e) { return fallback(); }
  // ---- buffers
  const V = M.v, nv = V.length, data = new Float32Array(nv * 10);
  V.forEach((v, i) => data.set(v, i * 10));
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(M.i), gl.STATIC_DRAW);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  const L = (p, n) => gl.getAttribLocation(p, n), U = (p, n) => gl.getUniformLocation(p, n);
  const tex = (src, cb) => { const t = gl.createTexture(), im = new Image(); im.onload = () => { gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); cb && cb(); }; im.src = src; return t; };
  let ready = 0; const TX = tex("assets/img24.webp", () => ready++), TL = tex("assets/img25.webp", () => ready++);
  // lantern quad: rigidly bound to the lantern bone (weights: aW1.y = 1)
  const LP = M.lamp, lq = new Float32Array([
    LP.x, LP.y, 0, 0, 0, 0, 1, 0, 0, 0,  LP.x + LP.w, LP.y, 0, 0, 0, 0, 1, 0, 0, 0,
    LP.x, LP.y + LP.h, 0, 0, 0, 0, 1, 0, 0, 0,  LP.x + LP.w, LP.y + LP.h, 0, 0, 0, 0, 1, 0, 0, 0]);
  const lvb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lvb); gl.bufferData(gl.ARRAY_BUFFER, lq, gl.STATIC_DRAW);
  const lib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 1, 3, 2]), gl.STATIC_DRAW);
  // ---- bones
  const ORDER = ["ground", "torso", "head", "armL", "lantern", "armR", "soul"], B = M.bones;
  const mul = (a, b) => [a[0] * b[0] + a[3] * b[1], a[1] * b[0] + a[4] * b[1], 0, a[0] * b[3] + a[3] * b[4], a[1] * b[3] + a[4] * b[4], 0, a[0] * b[6] + a[3] * b[7] + a[6], a[1] * b[6] + a[4] * b[7] + a[7], 1];
  const local = (p, rDeg, sx, sy, dx, dy) => { const r = rDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    // translate(p+d) * rotate * scale * translate(-p)
    const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
    return [a, b, 0, cc, d, 0, p[0] + dx - (a * p[0] + cc * p[1]), p[1] + dy - (b * p[0] + d * p[1]), 1]; };
  const apply = (m, x, y) => [m[0] * x + m[3] * y + m[6], m[1] * x + m[4] * y + m[7]];
  // ---- poses (blended on top of the idle loop)
  const POSES = {
    idle:  { raiseL: 0, raiseR: 0, tilt: 0, lean: 0, shake: 0, glow: 0, bounce: 0, wind: 1 },
    point: { raiseL: 1, raiseR: .2, tilt: -2, lean: -1, shake: 0, glow: .6, bounce: 0, wind: 1.3 },
    cheer: { raiseL: 1.6, raiseR: 1.4, tilt: 5, lean: .5, shake: 0, glow: 1, bounce: 1, wind: 1.8 },
    laugh: { raiseL: .6, raiseR: .8, tilt: 4, lean: .6, shake: 1, glow: 1, bounce: .4, wind: 1.5 },
    gasp:  { raiseL: 1.2, raiseR: 1.5, tilt: 7, lean: 1.4, shake: .25, glow: 1.4, bounce: .3, wind: 2 }
  };
  let cur = { ...POSES.idle }, target = POSES.idle, until = 0, lastT = 0, raf = 0, running = false;
  function resize() {
    const r = host.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.5);
    const sc = Math.min(1, 620 / Math.max(1, r.width * d));
    const w = Math.max(2, Math.round(r.width * d * sc)), h = Math.max(2, Math.round(r.height * d * sc));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  addEventListener("resize", resize);
  function frame(now) {
    if (ready < 2) return;
    resize();
    const t = now / 1000, dt = Math.min(.05, t - lastT || .016); lastT = t;
    if (now > until && target !== POSES.idle) target = POSES.idle;
    const k = 1 - Math.pow(.0012, dt);
    for (const key in cur) cur[key] += (target[key] - cur[key]) * k;
    const c = cur, shake = Math.sin(t * 34) * c.shake, bounce = -Math.abs(Math.sin(t * 6.5)) * 14 * c.bounce;
    const rot = {}, W = {};
    rot.ground = local(B.ground.p, 0, 1, 1, 0, 0);
    rot.torso = local(B.torso.p, Math.sin(t * .9) * 1.3 + c.lean * 3 + shake * 1.5, 1 + Math.sin(t * 1.8) * .006, 1 + Math.sin(t * 1.8) * .014, 0, -2 + Math.sin(t * 1.8) * -3 + bounce);
    rot.head = local(B.head.p, Math.sin(t * 1.1) * 2.6 + c.tilt + shake * 5, 1, 1, 0, Math.sin(t * 1.8 + .5) * 1.5);
    const aL = Math.sin(t * 1.3) * 2.5 + c.raiseL * 13 + Math.sin(t * 9) * 2 * c.bounce;
    rot.armL = local(B.armL.p, aL, 1, 1, 0, 0);
    const parentRot = aL + Math.sin(t * .9) * 1.3 + c.lean * 3;
    rot.lantern = local(B.lantern.p, Math.sin(t * 1.5) * 3 + Math.sin(t * 2.9) * .8 - parentRot * .75, 1, 1, 0, 0);
    rot.armR = local(B.armR.p, Math.sin(t * 1.5 + 1) * 4 - c.raiseR * 17 + Math.sin(t * 11) * 3 * c.shake, 1, 1, 0, 0);
    rot.soul = local(B.soul.p, Math.sin(t * 1.1) * 5 + c.raiseR * 4, 1 + Math.sin(t * 2) * .04 + c.glow * .06, 1 + Math.sin(t * 2) * .04 + c.glow * .06, Math.sin(t * .8) * 14, Math.sin(t * 1.3) * 10 - c.raiseR * 10);
    for (const n of ORDER) W[n] = B[n].parent ? mul(W[B[n].parent], rot[n]) : rot[n];
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    const view = [VW, VH], pad = [PADX, PADT];
    // glow program helper
    const glow = (pos, r, col, a) => { gl.uniform2f(U(P3, "uCenter"), pos[0], pos[1]); gl.uniform1f(U(P3, "uR"), r); gl.uniform3fv(U(P3, "uCol"), col); gl.uniform1f(U(P3, "uA"), a); gl.drawArrays(gl.TRIANGLES, 0, 6); };
    const useGlow = () => { gl.useProgram(P3); gl.bindBuffer(gl.ARRAY_BUFFER, qb); const a = L(P3, "aC"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2fv(U(P3, "uView"), view); gl.uniform2fv(U(P3, "uPad"), pad); gl.blendFunc(gl.ONE, gl.ONE); };
    const G = [.35, 1, .6], lampP = apply(W.lantern, ...M.spots.lamp);
    // 1. back glow (lantern light on the cape)
    useGlow(); const fl = .75 + Math.sin(t * 13) * .08 + Math.sin(t * 7.3) * .07 + c.glow * .2;
    glow(lampP, 190, G, .32 * fl);
    // 2. body mesh
    gl.useProgram(P1); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const st = 40, at = (n, sz, off) => { const l = L(P1, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, st, off); };
    at("aPos", 2, 0); at("aW0", 3, 8); at("aW1", 3, 20); at("aW2", 2, 32);
    const flat = new Float32Array(63); ORDER.forEach((n, i) => flat.set(W[n], i * 9));
    gl.uniformMatrix3fv(U(P1, "uB"), false, flat);
    gl.uniform2fv(U(P1, "uView"), view); gl.uniform2fv(U(P1, "uPad"), pad); gl.uniform2f(U(P1, "uTex"), M.tw, M.th);
    gl.uniform1f(U(P1, "uT"), t); gl.uniform1f(U(P1, "uWind"), c.wind);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TX); gl.uniform1i(U(P1, "uS"), 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(U(P1, "uOff"), 0, 0);
    gl.drawElements(gl.TRIANGLES, M.i.length, gl.UNSIGNED_SHORT, 0);
    // lantern layer on top
    gl.bindBuffer(gl.ARRAY_BUFFER, lvb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib);
    at("aPos", 2, 0); at("aW0", 3, 8); at("aW1", 3, 20); at("aW2", 2, 32);
    gl.uniform2f(U(P1, "uOff"), LP.x, LP.y); gl.uniform2f(U(P1, "uTex"), LP.w, LP.h);
    gl.bindTexture(gl.TEXTURE_2D, TL);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    for (const n of ["aPos", "aW0", "aW1", "aW2"]) gl.disableVertexAttribArray(L(P1, n));
    // 3. soul skull glow (the skull itself is part of the mesh, bone "soul")
    useGlow();
    glow(apply(W.soul, ...M.spots.soul), 110, G, .38 + .12 * Math.sin(t * 2.4) + c.glow * .2);
    // 4. front glows: eyes and lantern core
    useGlow();
    const eg = .7 + .2 * Math.sin(t * 4.1) + c.glow * .5;
    glow(apply(W.head, ...M.spots.eyeR), 30 + c.glow * 10, G, eg);
    glow(apply(W.head, ...M.spots.eyeL), 20 + c.glow * 8, G, eg * .8);
    glow(lampP, 62, [.6, 1, .75], .55 * fl);
  }
  let odd = false;
  const stageEl = document.getElementById("stage");
  const loop = now => {
    odd = !odd;
    if (!document.hidden && (!stageEl || !stageEl.classList.contains("dropping") || odd)) frame(now);
    if (running) raf = requestAnimationFrame(loop);
  };
  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(loop); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    still() { const tick = () => { if (ready < 2) return setTimeout(tick, 50); frame(1200); }; tick(); },
    react(name, ms = 1400) { if (!POSES[name]) return; target = POSES[name]; until = performance.now() + ms; }
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
  [[0, "4er"], [2, "6er"], [5, "9+"]].forEach(([i, l]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = l; dd.dataset.x = pay[i]; dd.textContent = money(pay[i] * bet); dl.append(dt, dd); });
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

q(document, "#paytable .hint").textContent = `Werte für den aktuellen Einsatz, je nach Größe der Gruppe (ab 4 Symbolen). Auszahlungsquote (RTP) ${RTP_TEXT}, maximaler Gewinn ${MAX_WIN_X.toLocaleString("de")}× Einsatz. Tippe auf ein Symbol, um seine Gewinn-Animation zu sehen.`;
// static page texts from index.html, for every language but German
if (RGS.lang !== "de") {
  document.documentElement.lang = "en";
  const set = (sel, text, attr) => { const el = q(document, sel); if (el) attr ? el.setAttribute(attr, text) : (el.textContent = text); };
  set("header h1", "Ghost Duels");
  set("header .sub", "Groups of 4 or more matching symbols win, disappear and new ones drop in. The VS reel is wild and starts a duel as soon as a group connects through it.");
  set("#paytable h2", "Paytable");
  set("#paytable .hint", `Values for the current bet, by group size (4 or more symbols). Return to player (RTP) ${RTP_TEXT}, maximum win ${MAX_WIN_X.toLocaleString("en")}× bet. Tap a symbol to see its win animation.`);
  set("#game", "Slot", "aria-label");
  set("#betMinus", "Decrease bet", "aria-label");
  set("#betPlus", "Increase bet", "aria-label");
  set("#autoMenu", "Choose autoplay", "aria-label");
  set(".am-grid", "Number of spins", "aria-label");
  set("#amClose", "Close", "aria-label");
  set("#spin", "Spin", "aria-label");
  set("#infoBtn", "Show paytable", "aria-label");
  set("#musicBtn", "Sound", "aria-label");
  set("#sndMenu", "Volume", "aria-label");
  set("#lblMusic", "Music");
  set("#lblSfx", "Effects");
  set("#muteAll", "Mute");
}

boot();
