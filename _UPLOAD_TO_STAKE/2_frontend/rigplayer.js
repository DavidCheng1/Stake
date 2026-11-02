"use strict";
// Plays a rig exported by tools/sprites/rig.py export: the parts of a picture as separate images, moved live on a
// canvas, so they stay sharp at any screen size. Same moves and eases as rig.py; times run 0..1 per intro or loop.
// A rig with "svg" (tools/sprites/total_win_svg.py) is vector art: every part, its glow layers and its aura are
// rendered from the SVG at the canvas's own resolution, and again when the canvas grows.
const RigPlayer = (() => {
  const TAU = Math.PI * 2;
  const clamp = x => Math.min(Math.max(x, 0), 1);
  const EASE = {
    linear: x => x,
    in: x => x ** 3,
    out: x => 1 - (1 - x) ** 3,
    inout: x => x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2,
    back: x => 1 + 2.9 * (x - 1) ** 3 + 1.9 * (x - 1) ** 2,
    elastic: x => x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - .75) * TAU / 3) + 1,
    bounce: x => {
      const n = 7.5625, d = 2.75;
      if (x < 1 / d) return n * x * x;
      if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
      return n * (x -= 2.625 / d) * x + .984375;
    },
  };
  const ABSOLUTE = new Set(["scale", "scalex", "scaley", "alpha"]);

  function wave(tr, t) {
    const th = TAU * ((tr.cycles ?? 1) * t + (tr.phase ?? 0));
    if (tr.wave === "flap") return tr.amount * Math.sin(th + .45 * Math.sin(th));
    if (tr.wave === "bounce") return tr.amount * Math.abs(Math.sin(th / 2));
    if (tr.wave === "flicker") return tr.amount * (.6 * Math.sin(th) + .4 * Math.sin(3 * th + 1.7));
    return tr.amount * Math.sin(th);
  }
  function keyed(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
      if (t <= t1) return v0 + (v1 - v0) * EASE[e || "out"](clamp((t - t0) / Math.max(t1 - t0, 1e-9)));
    }
    return keys[keys.length - 1][1];
  }
  function values(p, t, ti) {
    const v = { rotate: 0, x: 0, y: 0, scale: 1, scalex: 1, scaley: 1, alpha: 1 };
    const add = (prop, w) => { v[prop] = ABSOLUTE.has(prop) ? v[prop] * w : v[prop] + w; };
    for (const tr of p.loop) add(tr.prop, ABSOLUTE.has(tr.prop) ? 1 + wave(tr, t) : wave(tr, t));
    if (ti != null) for (const tr of p.intro) add(tr.prop, keyed(tr.keys, ti));
    return v;
  }
  function rng(seed) { // mulberry32
    return () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  }
  function dot() { // a soft white dot, stretched into the rays of a sparkle
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const image = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

  // a part or light layer: its picture (one sheet for all, or a file each) and where it sits, in picture px
  function blit(g, p, x, y, w, h) {
    if (p.frame) g.drawImage(p.img, ...p.frame, x, y, w, h);
    else g.drawImage(p.img, x, y, w, h);
  }

  // one element of the SVG (by id) on a canvas at s px per unit, inside the aura filter when one is named
  async function raster(rig, id, [x, y, w, h], s, filter) {
    const cw = Math.max(1, Math.ceil(w * s)), ch = Math.max(1, Math.ceil(h * s));
    const body = filter ? `<g filter="url(#${filter})"><use href="#${id}"/></g>` : `<use href="#${id}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${cw / s} ${ch / s}" width="${cw}" height="${ch}">${rig.defs}${body}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const im = await image(url), c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      c.getContext("2d").drawImage(im, 0, 0, cw, ch);
      return { img: c, box: [x, y, cw / s, ch / s] };
    } finally { URL.revokeObjectURL(url); }
  }
  // renders every part, aura and glow layer at s px per unit, then swaps them in at once
  async function vector(rig, s) {
    const au = rig.aura, m = au?.margin ?? 0;
    const jobs = rig.parts.map(async p => {
      p.svgBox ??= p.box;
      const [x, y, w, h] = p.svgBox;
      const [r, a] = await Promise.all([raster(rig, p.name, p.svgBox, s), au && raster(rig, p.name, [x - m, y - m, w + 2 * m, h + 2 * m], s, au.filter)]);
      return () => { p.img = r.img; p.box = r.box; if (a) { p.aura = a.img; p.auraBox = a.box; } };
    }).concat(rig.effects.filter(e => e.svg).map(async e => {
      e.svgBox ??= e.box;
      const r = await raster(rig, e.svg, e.svgBox, s);
      return () => { e.img = r.img; e.box = r.box; };
    }));
    for (const swap of await Promise.all(jobs)) swap();
    rig.scale = s;
  }
  const pxPerUnit = (rig, cssWidth) => Math.min(window.devicePixelRatio || 1, 2) * cssWidth / (rig.w + 2 * rig.pad * Math.max(rig.w, rig.h));

  // width: the canvas's expected CSS width, so a vector rig is rendered at the right size before it plays
  async function load(dir, { width } = {}) {
    const rig = await (await fetch(dir + "/rig.json")).json();
    const all = [...rig.parts, ...rig.effects.filter(e => e.src || e.frame)];
    if (rig.svg) {
      rig.defs = (await (await fetch(dir + "/" + rig.svg)).text()).match(/<defs>[\s\S]*<\/defs>/)[0];
      await vector(rig, pxPerUnit(rig, width || window.innerWidth * .6));
    } else if (rig.atlas) {
      const sheet = await image(dir + "/" + rig.atlas);
      for (const p of all) p.img = sheet;
    } else await Promise.all(all.map(async p => { p.img = await image(dir + "/" + p.src); }));
    const r = rng(rig.effects.find(e => e.type === "sparkles")?.seed ?? 7);
    for (const e of rig.effects) if (e.type === "sparkles") {
      const [x0, y0, x1, y1] = e.rect;
      e.dots = Array.from({ length: e.count ?? 16 }, () => ({ x: x0 + r() * (x1 - x0), y: y0 + r() * (y1 - y0), ph: r(), size: .6 + r() * .8, cyc: (1 + Math.floor(r() * 2)) * (e.cycles ?? 1) }));
      e.tint = tinted(e.color ?? "#fff3c4");
    }
    return rig;
  }
  function tinted(color) {
    const c = dot(), g = c.getContext("2d");
    g.globalCompositeOperation = "source-atop"; g.fillStyle = color; g.globalAlpha = .55; g.fillRect(0, 0, 64, 64);
    return c;
  }

  // intro: start with the intro, then loop. still: draw the rest pose once (reduced motion).
  function play(canvas, rig, { intro = true, still = false } = {}) {
    const ctx = canvas.getContext("2d");
    const shine = document.createElement("canvas"), sctx = shine.getContext("2d");
    const P = rig.pad * Math.max(rig.w, rig.h);
    let start = performance.now(), introOn = intro && !still, raf = 0, stopped = false;
    const partFx = name => rig.effects.filter(e => e.part === name);

    function draw(now) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (!cw || !ch) return false;
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const k = Math.min(cw / (rig.w + 2 * P), ch / (rig.h + 2 * P));
      let ox = (cw - rig.w * k) / 2, oy = (ch - rig.h * k) / 2;
      const el = still ? 0 : (now - start) / 1000;
      let t, ti = null, fade = 1;
      if (introOn && el < rig.intro) {
        t = ti = el / rig.intro;
        fade = clamp(ti / rig.fade);
        const s = rig.shake;
        if (s && ti < s.duration) {
          const env = (1 - ti / s.duration) * s.amount * k, c = s.cycles;
          ox += env * (Math.sin(TAU * c * ti) + .5 * Math.sin(TAU * (c + 3) * ti + 1.3));
          oy += env * (Math.cos(TAU * (c + 1) * ti) + .5 * Math.sin(TAU * (c + 5) * ti + .4));
        }
      } else t = ((el - (introOn ? rig.intro : 0)) / rig.loop) % 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingQuality = "high";
      if (rig.defs && k > rig.scale * 1.1 && !rig.pending) // the canvas grew: render the vector art again, sharper
        rig.pending = vector(rig, k).then(() => { if (still && !stopped) draw(performance.now()); }).finally(() => { rig.pending = null; });
      // moves the canvas to where the part is now; returns its opacity
      const place = p => {
        const v = values(p, t, ti), [px, py] = p.pivot;
        ctx.setTransform(k, 0, 0, k, ox, oy);
        ctx.translate(px + v.x, py + v.y); ctx.rotate(v.rotate * Math.PI / 180); ctx.scale(v.scale * v.scalex, v.scale * v.scaley); ctx.translate(-px, -py);
        return v.alpha * fade;
      };
      const au = rig.aura;
      if (au) { // a soft halo behind the whole emblem that follows every part
        const w = (au.min ?? 0) + (1 - (au.min ?? 0)) * (.5 + .5 * Math.sin(TAU * (au.cycles ?? 1) * t));
        for (const p of rig.parts) {
          const a = place(p);
          if (a <= .001 || !p.aura) continue;
          ctx.globalAlpha = clamp(a * (au.amount ?? 1) * w);
          ctx.drawImage(p.aura, ...p.auraBox);
        }
      }
      for (const p of rig.parts) {
        const a = place(p);
        if (a <= .001) continue;
        ctx.globalAlpha = Math.min(a, 1);
        const [bx, by, bw, bh] = p.box;
        const sh = partFx(p.name).find(e => e.type === "shine");
        const frac = sh ? ((sh.cycles ?? 1) * t + (sh.phase ?? 0)) % 1 : 1;
        if (sh && frac < (sh.sweep ?? .4)) drawShine(p, sh, frac / (sh.sweep ?? .4), k);
        else blit(ctx, p, bx, by, bw, bh);
        ctx.globalCompositeOperation = "lighter";
        for (const e of partFx(p.name)) if (e.type === "glow") {
          // "loop": false shows only in the intro; "flash" keys scale it during the intro
          if (e.loop === false && ti == null) continue;
          const base = e.min ?? 0;
          let w = e.loop === false ? 1 : e.wave === "flicker" ? clamp(.5 + .5 * wave({ ...e, amount: 1 }, t)) : base + (1 - base) * (.5 + .5 * Math.sin(TAU * ((e.cycles ?? 1) * t + (e.phase ?? 0))));
          if (e.flash && ti != null) w *= keyed(e.flash, ti);
          ctx.globalAlpha = clamp(a * (e.amount ?? .6) * w);
          if (ctx.globalAlpha > .003) blit(ctx, e, ...e.box);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.globalCompositeOperation = "lighter";
      for (const e of rig.effects) if (e.type === "sparkles") for (const d of e.dots) {
        const tw = Math.max(0, Math.sin(TAU * (d.cyc * t + d.ph))) ** 4 * fade;
        if (tw < .01) continue;
        const s = e.size * d.size;
        ctx.globalAlpha = tw;
        ctx.drawImage(e.tint, d.x - s * 2, d.y - s * 2, s * 4, s * 4);
        ctx.globalAlpha = tw * .8;
        ctx.drawImage(e.tint, d.x - s * 8, d.y - s * .5, s * 16, s);
        ctx.drawImage(e.tint, d.x - s * .5, d.y - s * 8, s, s * 16);
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      return true;
    }
    // the part with a band of light running across it, kept inside the part's own outline
    function drawShine(p, e, u, k) {
      const [bx, by, bw, bh] = p.box, s = Math.max(1, k);
      const w = Math.ceil(bw * s), h = Math.ceil(bh * s);
      if (shine.width !== w || shine.height !== h) { shine.width = w; shine.height = h; }
      sctx.globalCompositeOperation = "source-over"; sctx.globalAlpha = 1;
      sctx.clearRect(0, 0, w, h);
      blit(sctx, p, 0, 0, w, h);
      const [x0, y0, x1, y1] = e.rect, ang = (e.angle ?? 25) * Math.PI / 180;
      const cos = Math.cos(ang), sin = Math.sin(ang), len = (x1 - x0) * Math.abs(cos) + (y1 - y0) * Math.abs(sin);
      const c = -.25 + 1.5 * u, hw = (e.width ?? .08) * 2;
      const cx = x0 + cos * c * len, cy = y0 + sin * c * len;
      const g = sctx.createLinearGradient((cx - cos * hw * len - bx) * s, (cy - sin * hw * len - by) * s, (cx + cos * hw * len - bx) * s, (cy + sin * hw * len - by) * s);
      for (const q of [0, .2, .35, .5, .65, .8, 1]) g.addColorStop(q, `rgba(255,255,255,${(e.amount ?? .6) * Math.exp(-(((q - .5) * 4) ** 2))})`);
      sctx.globalCompositeOperation = "source-atop";
      sctx.fillStyle = g;
      // only inside the effect's rect (soft), like the region in the sheet renderer
      const m = 8;
      sctx.save(); sctx.beginPath(); sctx.rect((x0 - bx - m) * s, (y0 - by - m) * s, (x1 - x0 + 2 * m) * s, (y1 - y0 + 2 * m) * s); sctx.clip();
      sctx.fillRect(0, 0, w, h); sctx.restore();
      ctx.drawImage(shine, bx, by, bw, bh);
    }
    const tick = now => { if (stopped) return; if (!draw(now) || !still) raf = requestAnimationFrame(tick); }; // a still is drawn once laid out
    raf = requestAnimationFrame(tick);
    return {
      // true once the intro has played (or there was none)
      get introDone() { return !introOn || (performance.now() - start) / 1000 >= rig.intro; },
      skipIntro() { if (introOn && (performance.now() - start) / 1000 < rig.intro) { introOn = false; start = performance.now(); } },
      redraw() { draw(performance.now()); },
      stop() { stopped = true; cancelAnimationFrame(raf); },
    };
  }
  return { load, play };
})();
