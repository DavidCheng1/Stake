"use strict";
// Night Drive prototype. The math here is a placeholder that runs in the browser (roughly 96 %, calibrated with
// simulate() below); the real game gets its math from math-sdk and its rounds from the Stake RGS.

// ---------- Math ----------
const COLS = 5, ROWS = 5, MAX_WIN = 10000;
// pay for 3, 4 and 5 reels, per way, before K. Ways count multiplies; cars in a way multiply by their ×.
const PAY = {
  driver: [1, 2.5, 6], captain: [.8, 2, 5], owner: [.6, 1.5, 4], dj: [.5, 1.2, 3],
  boat: [.3, .8, 2], tape: [.3, .7, 1.8], flamingo: [.25, .6, 1.5], briefcase: [.25, .6, 1.4],
  shades: [.12, .3, .7], skate: [.12, .3, .7], palm: [.1, .25, .6], heart: [.1, .25, .6],
};
const K = 0.0420; // pay scale: the base game with its free spins returns about 96 % (simulate(), 2026-11-26: free spins 43 % of it)
const PRICE = { chase: 83, super: 260 }; // buy prices × bet, from simulate(): average bonus ÷ 0.96, rounded
const PAYING = Object.keys(PAY);
const WEIGHT = { driver: 3, captain: 3, owner: 3, dj: 3, boat: 5, tape: 5, flamingo: 5, briefcase: 5, shades: 9, skate: 9, palm: 9, heart: 9 };
const W_WILD = 1.6, W_WILD_FS = 2.2, W_SCATTER = 1.0;
const MULTS = [[2, 6], [3, 3], [5, 1]], MULTS_SUPER = [[3, 5], [4, 3], [5, 2]];
const FS_FOR = { 3: 10, 4: 12, 5: 15 };
const DRIVEBY = 0.03;
const TIER = id => ["driver", "captain", "owner", "dj"].includes(id) ? "255 46 150" : ["boat", "tape", "flamingo", "briefcase"].includes(id) ? "0 229 255" : "255 154 60";

const rnd = n => Math.floor(Math.random() * n);
const pickW = pairs => { let t = 0; for (const [, w] of pairs) t += w; let x = Math.random() * t; for (const [v, w] of pairs) { if ((x -= w) < 0) return v; } return pairs[pairs.length - 1][0]; };
const SYM_PAIRS = Object.entries(WEIGHT);
function randCell(c, fs, superMode) {
  const pairs = SYM_PAIRS.slice();
  if (c > 0) pairs.push(["wild", fs ? W_WILD_FS : W_WILD]); // cars land on reels 2 to 5
  if (!fs) pairs.push(["scatter", W_SCATTER]);
  const id = pickW(pairs);
  return id === "wild" ? { id, m: pickW(superMode ? MULTS_SUPER : MULTS) } : { id };
}
const newGrid = (fs, superMode) => Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, () => randCell(c, fs, superMode)));

// left-to-right ways; a car counts as its ×, so cars in one way multiply. Ways made of cars only don't pay.
function evaluate(grid) {
  let total = 0; const wins = [];
  for (const s of PAYING) {
    let pv = 1, pw = 1, len = 0;
    for (let c = 0; c < COLS; c++) {
      let v = 0, w = 0;
      for (const cell of grid[c]) { if (cell.id === s) v += 1; else if (cell.id === "wild") { v += cell.m; w += cell.m; } }
      if (!v) break;
      pv *= v; pw *= w; len++;
    }
    if (len < 3 || pv - pw <= 0) continue;
    const pay = PAY[s][len - 3] * K * (pv - pw);
    total += pay; wins.push({ id: s, len, ways: pv - pw, pay });
  }
  return { total, wins };
}
function baseSpin() {
  const grid = newGrid(false, false); let driveby = null;
  // test hook: window.__force = "driveby" or "chase" makes the next spin show it (prototype only)
  const force = window.__force; window.__force = null;
  if (force === "chase") for (const [c, r] of [[0, 1], [2, 3], [4, 0]]) grid[c][r] = { id: "scatter" };
  if (force === "driveby" || Math.random() < DRIVEBY) {
    const r = rnd(ROWS), cols = [1, 2, 3, 4].sort(() => Math.random() - .5).slice(0, 2 + rnd(3)).sort((a, b) => b - a), under = {};
    for (const c of cols) { under[c] = grid[c][r]; grid[c][r] = { id: "wild", m: pickW(MULTS) }; }
    driveby = { r, cols, under };
  }
  const scatters = grid.flat().filter(x => x.id === "scatter").length;
  return { grid, driveby, scatters, fs: scatters >= 3 ? FS_FOR[Math.min(5, scatters)] : 0, ev: evaluate(grid) };
}
// The Chase: before each spin every car drives one reel left (off the board: +1 spin), then the free cells spin,
// and cars that land stay.
function chaseMove(st) {
  const exits = [];
  for (const car of st.cars) { car.c -= 1; if (car.c < 0) exits.push(car); }
  st.cars = st.cars.filter(car => car.c >= 0); st.left += exits.length;
  return exits;
}
let carId = 0;
function chaseSpin(st) {
  st.left -= 1;
  const grid = newGrid(true, st.super);
  for (const car of st.cars) grid[car.c][car.r] = { id: "wild", m: car.m, car };
  const landed = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const cell = grid[c][r];
    if (cell.id === "wild" && !cell.car) { const car = { id: ++carId, c, r, m: cell.m }; st.cars.push(car); cell.car = car; landed.push(car); }
  }
  return { grid, landed, ev: evaluate(grid) };
}
function chaseTotal(spins, superMode) {
  const st = { cars: [], left: spins, super: superMode }; let total = 0;
  while (st.left > 0 && total < MAX_WIN) { chaseMove(st); total += chaseSpin(st).ev.total; }
  return Math.min(total, MAX_WIN);
}
// calibration: run in the console. RTP of the base game (with its free spins) and the buys' average win
window.simulate = (n = 200000, buys = 20000) => {
  let base = 0, fsWin = 0, fsCount = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const s = baseSpin(); base += Math.min(s.ev.total, MAX_WIN); if (s.driveby) db++;
    if (s.fs) { fsCount++; fsWin += chaseTotal(s.fs, false); }
  }
  let ch = 0, su = 0;
  for (let i = 0; i < buys; i++) { ch += chaseTotal(10, false); su += chaseTotal(10, true); }
  return { rtp: (base + fsWin) / n, baseRtp: base / n, fsRtp: fsWin / n, fsEvery: n / fsCount, drivebyEvery: n / db, chaseAvg: ch / buys, superAvg: su / buys,
    hit: null, chasePrice: ch / buys / .96, superPrice: su / buys / .96 };
};

// ---------- Screen ----------
const $ = id => document.getElementById(id);
const game = $("game"), cellsEl = $("cells"), carsEl = $("cars"), floatsEl = $("floats"), board = $("board");
const PITCH = 20.74; // % of the cell area per cell (17.04 % cell + 3.7 % gap)
let balance = 1000, betIdx = 2, busy = false, turbo = false;
const BETS = [0.2, 0.4, 1, 2, 5, 10, 20, 50, 100];
const bet = () => BETS[betIdx];
const money = v => v.toFixed(2);
const pace = () => turbo ? 2.2 : 1;
const sleep = ms => new Promise(r => setTimeout(r, ms / pace()));
const say = t => { $("msg").textContent = t; };

function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); game.style.transform = `translate(-50%, -50%) scale(${s})`; }
addEventListener("resize", fit); fit();

const cells = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const d = document.createElement("div"); d.className = "cell"; d.style.gridColumn = c + 1; d.style.gridRow = r + 1; cellsEl.appendChild(d); (cells[c] ||= [])[r] = d; }
function symEl(cell) {
  const d = document.createElement("div"); d.className = "sym " + cell.id; d.dataset.id = cell.id;
  const img = new Image(); img.src = `assets/sym/${cell.id}.webp`; img.alt = ""; d.appendChild(img);
  if (cell.id === "wild") { const m = document.createElement("span"); m.className = "mult"; m.textContent = "×" + cell.m; d.appendChild(m); }
  return d;
}
// the first board: one of each
(() => { const ids = [...PAYING, "scatter", "scatter"]; for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) cells[c][r].appendChild(symEl(c && (c + r) % 7 === 3 ? { id: "wild", m: 2 + (r % 2) } : { id: ids[(c * 5 + r) % ids.length] })); })();

function updateHud() { $("bal").textContent = money(balance); $("bet").textContent = money(bet()); $("costChase").textContent = money(PRICE.chase * bet()); $("costSuper").textContent = money(PRICE.super * bet()); }
updateHud();
function setBusy(b) { busy = b; $("spin").disabled = b; $("spin").classList.toggle("go", b); document.querySelectorAll(".buy").forEach(x => x.disabled = b); }
async function countTo(el, from, to, ms) { const t0 = performance.now(); ms /= pace(); while (true) { const k = Math.min(1, (performance.now() - t0) / ms); el.textContent = money(from + (to - from) * k); if (k >= 1) break; await new Promise(requestAnimationFrame); } }
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
async function dropIn(grid, skip = () => false, under = {}) {
  const anims = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    if (skip(c, r)) continue;
    const cell = under[c + "," + r] || grid[c][r], el = symEl(cell); cells[c][r].replaceChildren(el);
    anims.push(el.animate([{ transform: "translateY(-260%)", opacity: 0 }, { opacity: 1, offset: .08 }, { transform: "translateY(6%) scale(1.05,.92)", offset: .7 }, { transform: "none", opacity: 1 }],
      { duration: 430 / pace(), delay: (c * 80 + (4 - r) * 26) / pace(), easing: "cubic-bezier(.4,0,.6,1)", fill: "backwards" }).finished);
  }
  await Promise.all(anims);
  if (grid.flat().some(x => x.id === "scatter")) grid.flat().forEach((x, i) => {}); // scatters glow by CSS
}
// a win: the cells that make it glow, the rest dims, the amount floats over the board
async function showWins(grid, ev, carEls) {
  if (!ev.wins.length) return;
  const lit = new Map();
  for (const w of ev.wins) for (let c = 0; c < w.len; c++) for (let r = 0; r < ROWS; r++) { const id = grid[c][r].id; if (id === w.id || id === "wild") lit.set(c + "," + r, TIER(w.id)); }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const k = c + "," + r, el = cells[c][r];
    if (lit.has(k)) { el.classList.add("win"); el.style.setProperty("--wc", lit.get(k)); } else el.classList.add("dim");
  }
  carEls?.forEach(e => { const car = e._car; if (lit.has(car.c + "," + car.r)) e.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 700 / pace(), iterations: 2 }); });
  floatText(50, 50, money(ev.total * bet()));
  await sleep(1300);
  cells.flat().forEach(el => el.classList.remove("win", "dim"));
}
// Drive-By: a car speeds across the row from the right and the cells it passes turn into cars
async function driveBy(d) {
  say("Drive-By!");
  const car = document.createElement("div"); car.className = "driveby"; const img = new Image(); img.src = "assets/sym/wild.webp"; car.appendChild(img);
  const [, y] = cellPct(0, d.r); car.style.top = `calc(${y}% - 8.5%)`; board.appendChild(car);
  const dur = 1100 / pace();
  car.animate([{ left: "100%" }, { left: "-24%" }], { duration: dur, easing: "cubic-bezier(.3,.1,.7,.9)", fill: "forwards" }).finished.then(() => car.remove());
  for (const c of d.cols) setTimeout(() => {
    const el = symEl(lastGrid[c][d.r]); cells[c][d.r].replaceChildren(el);
    el.animate([{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.3) rotate(-8deg)", filter: "brightness(3)", offset: .4 }, { transform: "none", filter: "brightness(1)" }], { duration: 500 / pace() });
  }, dur * (1 - (cellPct(c, 0)[0] - 11.6) / 76.8) * .95);
  await sleep(1300);
}
let lastGrid = null;
async function bigWin(x, amount) {
  const t = x >= 100 ? "Epic Win" : x >= 50 ? "Mega Win" : "Big Win";
  const ov = $("overlay"); $("ovTitle").textContent = t; $("ovSub").textContent = ""; ov.hidden = false;
  let skip = false; const go = () => { skip = true; }; ov.addEventListener("pointerdown", go, { once: true });
  await countTo($("ovAmt"), 0, amount, skip ? 1 : 2200); await sleep(skip ? 0 : 900); ov.hidden = true; ov.removeEventListener("pointerdown", go);
}
async function banner(title, sub, ms = 1900) {
  const ov = $("overlay"); $("ovTitle").textContent = title; $("ovSub").textContent = sub; $("ovAmt").textContent = ""; ov.hidden = false;
  await new Promise(res => { const t = setTimeout(res, ms / pace()); ov.addEventListener("pointerdown", () => { clearTimeout(t); res(); }, { once: true }); });
  ov.hidden = true;
}

// ---------- Rounds ----------
async function spin() {
  if (busy || balance < bet()) return;
  setBusy(true); balance -= bet(); updateHud(); $("win").textContent = money(0); say("Good luck!");
  const res = baseSpin(); lastGrid = res.grid;
  await dropOut();
  const under = {}; if (res.driveby) for (const c of res.driveby.cols) under[c + "," + res.driveby.r] = res.driveby.under[c];
  await dropIn(res.grid, () => false, under);
  if (res.driveby) await driveBy(res.driveby);
  let won = Math.min(res.ev.total, MAX_WIN);
  if (won > 0) { say(res.ev.wins.map(w => `${w.len}× ${w.id}`).join(" · ")); await showWins(res.grid, res.ev); }
  if (res.fs) { say(`${res.scatters} sunsets: The Chase!`); await sleep(700); won += await chase(res.fs, false, MAX_WIN - won); }
  await finish(won);
}
async function buy(kind) {
  const cost = PRICE[kind] * bet();
  if (busy || balance < cost) return;
  setBusy(true); balance -= cost; updateHud(); $("win").textContent = money(0);
  const won = await chase(10, kind === "super", MAX_WIN);
  await finish(won);
}
async function finish(won) {
  if (won >= 20) await bigWin(won, won * bet());
  balance += won * bet(); updateHud();
  if (won > 0) await countTo($("win"), 0, won * bet(), 500);
  say(won > 0 ? `Win ${money(won * bet())}` : "Press Spin");
  setBusy(false);
}
// The Chase: cars stay and drive one reel left before every spin; a car leaving the board gives one more spin
async function chase(spins, superMode, room) {
  await banner(superMode ? "Super Chase" : "The Chase", `${spins} free spins`);
  game.classList.add("chasing"); $("fsTitle").textContent = superMode ? "Super Chase" : "The Chase";
  const st = { cars: [], left: spins, super: superMode }; let total = 0; const carEls = new Map();
  $("fsLeft").textContent = st.left; $("fsWin").textContent = money(0);
  await dropOut();
  while (st.left > 0 && total < room) {
    if (st.cars.length) {
      const exits = chaseMove(st);
      for (const [id, el] of carEls) {
        const car = el._car; el.classList.add("moving"); el.style.left = (car.c * PITCH) + "%";
        if (car.c < 0) { el.classList.add("gone"); carEls.delete(id); setTimeout(() => el.remove(), 700); }
      }
      await sleep(600);
      carEls.forEach(el => el.classList.remove("moving"));
      for (const car of exits) { const [x, y] = cellPct(0, car.r); floatText(x, y, "Nitro +1 spin", "nitro"); }
      if (exits.length) { $("fsLeft").textContent = st.left; const s = $("fsLeft"); s.classList.remove("bump"); void s.offsetWidth; s.classList.add("bump"); await sleep(500); }
    }
    const occupied = new Set(st.cars.map(car => car.c + "," + car.r));
    const skip = (c, r) => occupied.has(c + "," + r);
    await dropOut(skip);
    for (const k of occupied) { const [c, r] = k.split(",").map(Number); cells[c][r].replaceChildren(); }
    const step = chaseSpin(st); $("fsLeft").textContent = st.left;
    await dropIn(step.grid, skip);
    // a car that lands leaves its cell and becomes a driving car
    for (const car of step.landed) {
      cells[car.c][car.r].replaceChildren();
      const el = document.createElement("div"); el.className = "car"; el._car = car; el.style.left = (car.c * PITCH) + "%"; el.style.top = (car.r * PITCH) + "%";
      el.appendChild(symEl({ id: "wild", m: car.m })); carsEl.appendChild(el); carEls.set(car.id, el);
      el.animate([{ transform: "scale(1.5)", filter: "brightness(3)" }, { transform: "none", filter: "brightness(1)" }], { duration: 420 / pace() });
    }
    if (step.landed.length) await sleep(350);
    const w = Math.min(step.ev.total, room - total);
    if (w > 0) { await showWins(step.grid, step.ev, [...carEls.values()]); total += w; await countTo($("fsWin"), (total - w) * bet(), total * bet(), 400); }
    else await sleep(350);
  }
  await sleep(400);
  carEls.forEach(el => el.remove()); carsEl.replaceChildren();
  await banner("Chase over", `${money(total * bet())}`, 2200);
  game.classList.remove("chasing");
  return total;
}

$("spin").addEventListener("click", spin);
addEventListener("keydown", e => { if (e.code === "Space") { e.preventDefault(); spin(); } });
$("betMinus").addEventListener("click", () => { if (!busy && betIdx > 0) { betIdx--; updateHud(); } });
$("betPlus").addEventListener("click", () => { if (!busy && betIdx < BETS.length - 1) { betIdx++; updateHud(); } });
$("turbo").addEventListener("click", () => { turbo = !turbo; $("turbo").setAttribute("aria-pressed", turbo); });
document.querySelectorAll(".buy").forEach(b => b.addEventListener("click", () => buy(b.dataset.buy)));
