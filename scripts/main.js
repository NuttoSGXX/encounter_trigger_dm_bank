/**
 * Encounter FX  –  Foundry VTT V14 / dnd5e
 * GM-only launcher -> pick scene, party and FX style -> cinematic intro -> tokens added to the
 * real Combat -> one 3D d20 per player (simultaneous) -> NPCs roll silently -> order announced
 * -> combat starts automatically.
 * Styles: "fire" (Default), "magic" (Magical), "dark" (Dark Fantasy).
 */
const ID = "encounter-fx";
const SOCKET = `module.${ID}`;

/* ------------------------------------------------------------------ */
/*  Back-end config (edit freely)                                      */
/* ------------------------------------------------------------------ */
const TITLE = "ENCOUNTER";
const SHOW_NPC_IN_ORDER = true;   // false = only list players in the initiative summary

const STYLES = {
  fire: {
    label: "Default", tag: "Inferno", desc: "A wall of fire sweeps the screen. The title is typed, then slammed down.",
    sep: "◆",
    phrases: ["Imminent Danger", "Watch Out!", "Get Ready To Fight", "Draw Your Weapons", "Enemies Approach", "Steel Yourself", "No Turning Back", "Blood Will Be Spilled"],
    t: { switch: 2100, leave: 5300, end: 6800, dice: 5600 },   // ms
    die: { h: 5, s: 78 }, colors: ["255,210,100", "255,120,30"]
  },
  magic: {
    label: "Magical", tag: "Arcane", desc: "Streams of colored magic spiral inward and burst into the title.",
    sep: "✦",
    phrases: ["The Arcane Stirs", "Weave Your Spells", "Magic Fills The Air", "A Presence Awakens", "Ready Your Incantations", "Power Gathers", "Fate Is Drawn", "The Veil Trembles"],
    t: { switch: 2050, leave: 5700, end: 7000, dice: 5900 },
    die: { h: 268, s: 62 }, colors: ["255,120,220", "170,120,255", "90,210,255", "255,230,130"]
  },
  dark: {
    label: "Dark Fantasy", tag: "Nightmare", desc: "Part the brush. Two eyes in the dark. Then it lunges.",
    sep: "†",
    phrases: ["Something Watches", "Do Not Run", "Blood Scents The Wind", "You Are Not Alone", "It Hunts By Moonlight", "No One Hears You Scream", "Steel Your Nerves", "The Hunt Begins"],
    t: { switch: 3800, leave: 7000, end: 8300, dice: 7300 },
    die: { h: 215, s: 8 }, colors: ["225,230,240", "150,160,175"]
  }
};


/* ------------------------------------------------------------------ */
/*  Media plates: optional pre-rendered video per style                */
/*  Drop a .webm into assets/video/ and that style plays it instead of */
/*  the procedural FX. Typography, bands, dice and combat stay code.   */
/* ------------------------------------------------------------------ */
const MEDIA = {
  fire:  { src: `modules/${ID}/assets/video/default.webm`,  t: { switch: 2600, title: 2700, leave: 6200, end: 7200, dice: 6500 } },
  magic: { src: `modules/${ID}/assets/video/magical.webm`,  t: { switch: 2600, title: 2700, leave: 6200, end: 7200, dice: 6500 } },
  dark:  { src: `modules/${ID}/assets/video/dark-fantasy.webm`, t: { switch: 3600, title: 3900, leave: 7000, end: 8000, dice: 7300 } }
};
const mediaCache = new Map();
/** Resolves to the media config if the file exists on the server, else null (procedural FX are used). */
async function mediaFor(style) {
  const m = MEDIA[style]; if (!m) return null;
  if (!mediaCache.has(style)) {
    mediaCache.set(style, fetch(m.src, { method: "HEAD" }).then(r => (r.ok ? m : null)).catch(() => null));
  }
  return mediaCache.get(style);
}

/* Still plates: your own artwork (e.g. made in ChatGPT) animated by code.
   Drop assets/plates/magical.(webp|jpg|png) and/or dark-fantasy.(webp|jpg|png).
   Priority per style: video plate > still plate > procedural FX. */
const PLATES = {
  magic: { name: "magical",      t: { switch: 2150, title: 2350, leave: 6000, end: 7200, dice: 6300 } },
  dark:  { name: "dark-fantasy", focus: [0.6, 0.46], t: { switch: 3900, title: 4100, leave: 7200, end: 8400, dice: 7500 } }
};
const plateCache = new Map();
async function plateFor(style) {
  const P = PLATES[style]; if (!P) return null;
  if (!plateCache.has(style)) plateCache.set(style, (async () => {
    for (const ext of ["webp", "jpg", "jpeg", "png"]) {
      const src = `modules/${ID}/assets/plates/${P.name}.${ext}`;
      if (await fetch(src, { method: "HEAD" }).then(r => r.ok).catch(() => false)) return { type: "plate", src, ...P };
    }
    return null;
  })());
  return plateCache.get(style);
}

/* Asset packs: layered, pre-rendered art (orbs, ribbons, core, title...) driven by a timeline director.
   Priority per style: video plate > asset pack > still plate > procedural FX. Missing files never break the encounter. */
const PACKS = {
  magic: { dir: `modules/${ID}/assets/magical`, t: { switch: 2850, leave: 6700, end: 7900, dice: 7000 } }
};
const packCache = new Map();
async function packFor(style) {
  const P = PACKS[style]; if (!P) return null;
  if (!packCache.has(style)) packCache.set(style, (async () => {
    try {
      const r = await fetch(`${P.dir}/pack.json`); if (!r.ok) return null;
      const manifest = await r.json();
      return manifest?.assets?.["encounter-magical"] && manifest.assets["arcane-core"] ? { type: "pack", ...P, manifest } : null;
    } catch (e) { return null; }
  })());
  return packCache.get(style);
}
const imgCache = new Map();
function loadImg(src, timeout = 7000) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise(res => {
    const im = new Image(), to = setTimeout(() => res(null), timeout);
    im.onload = () => { clearTimeout(to); res(im); }; im.onerror = () => { clearTimeout(to); res(null); };
    im.decoding = "async"; im.src = src;
  }));
  return imgCache.get(src);
}

/** What should play for this style: a video plate, a still plate, or null (procedural). */
async function assetFor(style) {
  const v = await mediaFor(style); if (v) return { type: "video", src: v.src, t: v.t };
  const k = await packFor(style); if (k) return { type: "pack", src: null, t: k.t };
  return (await plateFor(style)) ?? null;
}

/** Warm the browser cache so the first play does not stall. */
async function preloadMedia() {
  for (const style of Object.keys(MEDIA)) { const m = await mediaFor(style); if (m) fetch(m.src).then(r => r.blob()).catch(() => {}); const pl = await plateFor(style); if (pl) { const im = new Image(); im.src = pl.src; } }
  for (const style of Object.keys(PACKS)) { const k = await packFor(style); if (k) Object.values(k.manifest.assets).forEach(a => loadImg(`${k.dir}/${a.file}`)); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** True when the OS asks for reduced motion. */
const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */
Hooks.once("init", () => {
  game.settings.register(ID, "sound", {
    name: "Encounter stinger sound",
    hint: "Audio file played when an encounter starts (leave empty for none).",
    scope: "world", config: true, type: String, default: "", filePicker: "audio"
  });
  game.settings.register(ID, "style", { scope: "client", config: false, type: String, default: "fire" });
  game.settings.register(ID, "panel", { scope: "client", config: false, type: Object, default: {} });
});

Hooks.once("ready", () => {
  setTimeout(() => preloadMedia(), 4000);
  game.socket.on(SOCKET, onMessage);
  game.modules.get(ID).api = {
    open: openLauncher, launch,
    preview: { intro: playIntro, dice: showDice, rolled: playRolled, order: playOrder, close: closeAll, decorate: decorateLauncher }
  };
});

function openLauncher() {
  if (!game.user.isGM) return ui.notifications.warn("Encounter FX: only the Game Master can start an encounter.");
  EncounterPanel.toggle();
}

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tools = controls.tokens?.tools ?? controls.token?.tools;
  if (!tools) return;
  tools[ID] = {
    name: ID, title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved",
    order: Object.keys(tools).length + 1, button: true, visible: game.user.isGM,
    onChange: () => openLauncher()
  };
});

/* ------------------------------------------------------------------ */
/*  Launcher (GM only)                                                 */
/* ------------------------------------------------------------------ */
const PANEL_TEMPLATE = `modules/${ID}/templates/launcher.hbs`;

async function launcherContext() {
  const last = game.settings.get(ID, "style");
  const scenes = game.scenes.contents
    .map(s => ({ id: s.id, name: s.name, key: s.name.toLowerCase(), thumb: s.thumb, active: s.active }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const actors = game.actors.contents
    .filter(a => a.type === "character" && a.hasPlayerOwner)
    .map(a => ({
      id: a.id, name: a.name, img: a.img,
      checked: game.users.some(u => u.active && !u.isGM && a.testUserPermission(u, "OWNER"))
    }));
  const styles = Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label, tag: s.tag, desc: s.desc, checked: id === (STYLES[last] ? last : "fire") }));
  return { scenes, actors, styles, hasScenes: scenes.length > 0 };
}

/** GM launcher: a floating panel (not a Foundry window). Grab the header and it moves immediately; position is remembered per client. */
class EncounterPanel {
  static #inst = null;
  static toggle() {
    if (!game.user.isGM) return;
    if (EncounterPanel.#inst) return EncounterPanel.#inst.close();
    EncounterPanel.#inst = new EncounterPanel(); EncounterPanel.#inst.open();
  }

  async open() {
    const saved = game.settings.get(ID, "panel") ?? {};
    this.x = saved.x ?? Math.max(12, innerWidth - 480); this.y = saved.y ?? 90;
    const el = this.el = document.createElement("div");
    el.id = "efx-panel"; el.className = "efx-launcher efx-floating";
    el.innerHTML = `<form class="efx-panel-form"></form>`;
    document.body.appendChild(el);
    this.form = el.querySelector("form");
    await this.renderBody();
    this.clampPos(); this.place(); this.bind();
    this._onResize = () => { this.clampPos(); this.place(); };
    addEventListener("resize", this._onResize);
  }

  async renderBody() {
    const render = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
    this.form.innerHTML = await render(PANEL_TEMPLATE, await launcherContext());
    decorateLauncher(this.el);
  }

  place() { this.el.style.left = `${this.x}px`; this.el.style.top = `${this.y}px`; }
  clampPos() {
    const w = this.el.offsetWidth || 440;
    this.x = clamp(this.x, 0, Math.max(0, innerWidth - Math.min(w, 120)));
    this.y = clamp(this.y, 0, Math.max(0, innerHeight - 48));
  }
  save() { game.settings.set(ID, "panel", { x: Math.round(this.x), y: Math.round(this.y) }); }

  bind() {
    const el = this.el;
    // Grab the header = drag. Delegated, so it keeps working after any re-render.
    el.addEventListener("pointerdown", e => {
      const head = e.target.closest(".efx-compact-head");
      if (!head || e.button !== 0 || e.target.closest("button")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId); el.classList.add("efx-dragging");
      const move = ev => { this.x = clamp(ev.clientX - dx, 0, innerWidth - 80); this.y = clamp(ev.clientY - dy, 0, innerHeight - 40); this.place(); };
      const up = () => {
        head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up);
        el.classList.remove("efx-dragging"); this.save();
      };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);
    });
    el.addEventListener("click", e => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") this.close(); else if (act === "preview") this.preview();
    });
    el.addEventListener("keydown", e => { if (e.key === "Escape") this.close(); });
    this.form.addEventListener("submit", e => { e.preventDefault(); this.start(); });
  }

  preview() {   // local only: no scene change, no combat
    const style = this.form.querySelector('input[name="style"]:checked')?.value ?? "fire";
    assetFor(style).then(a => onMessage({ action: "intro", style, asset: a?.type ?? null, src: a?.src ?? null }));
  }

  async start() {
    if (!game.user.isGM) return;
    const fd = new FormData(this.form);
    const style = STYLES[fd.get("style")] ? fd.get("style") : "fire";
    const sceneId = fd.get("sceneId"), actorIds = fd.getAll("actor"), hostile = fd.has("hostile");
    await game.settings.set(ID, "style", style);
    this.close();
    launch({ sceneId, actorIds, hostile, style });
  }

  close() {
    removeEventListener("resize", this._onResize);
    this.el?.remove();
    EncounterPanel.#inst = null;
  }
}

/** Visual decoration only (motes, parallax). */
function decorateLauncher(el) {
  if (!el || el._efxDecorated) return;
  el._efxDecorated = true;
  const motes = el.querySelector(".bg-motes");
  if (motes) {
    for (let i = 0; i < 22; i++) {
      const m = document.createElement("i");
      m.style.cssText = `left:${rand(0,100).toFixed(1)}%;--s:${rand(1.5,4).toFixed(1)}px;--d:${rand(8,18).toFixed(1)}s;--dl:-${rand(0,18).toFixed(1)}s;--dx:${rand(-22,22).toFixed(0)}px`;
      motes.appendChild(m);
    }
  }
  el.addEventListener("pointermove", ev => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty("--mx", ((ev.clientX-r.left)/r.width-.5).toFixed(3));
    el.style.setProperty("--my", ((ev.clientY-r.top)/r.height-.5).toFixed(3));
  });
}

/* ------------------------------------------------------------------ */
/*  GM orchestration                                                   */
/* ------------------------------------------------------------------ */
const GM = { combatId: null, pcs: new Map(), rolled: new Set(), finishing: false, style: "fire" };

function broadcast(msg) { game.socket.emit(SOCKET, msg); onMessage(msg); }
const ownersOf = c => game.users.filter(u => !u.isGM && c.actor?.testUserPermission(u, "OWNER"));

async function launch({ sceneId, actorIds = [], hostile = true, style = "fire" }) {
  if (!game.user.isGM) return;
  if (!STYLES[style]) style = "fire";
  const scene = game.scenes.get(sceneId);
  if (!scene) return ui.notifications.error("Encounter FX: scene not found.");
  const asset = await assetFor(style);
  const T = asset ? asset.t : STYLES[style].t, t0 = Date.now();
  GM.pcs = new Map(); GM.rolled = new Set(); GM.finishing = false; GM.combatId = null; GM.style = style;

  broadcast({ action: "intro", style, asset: asset?.type ?? null, src: asset?.src ?? null });
  await sleep(T.switch);

  // 1) Move everyone to the target scene while the screen is covered
  const needActivate = !scene.active;
  const needView = game.scenes.viewed?.id !== scene.id;
  if (needActivate || needView) {
    const ready = new Promise(r => { Hooks.once("canvasReady", r); setTimeout(r, 6000); });
    if (needActivate) await scene.activate(); else await scene.view();
    await ready;
  }

  // 2) Real Combat document: find or create, then add tokens
  try {
    const combat = await ensureCombat(scene, actorIds, hostile);
    GM.combatId = combat.id;

    // 3) NPCs (and hidden combatants) roll silently; player characters wait for their own die
    const updates = [];
    for (const c of combat.combatants) {
      const owners = ownersOf(c);
      if (owners.length && !c.hidden) {
        GM.pcs.set(c.id, { id: c.id, name: c.name, img: c.img, player: owners.map(u => u.name).join(", "), owners: owners.map(u => u.id) });
      } else {
        const r = await rollInit(c);
        updates.push({ _id: c.id, initiative: r.total });
      }
    }
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  } catch (err) {
    console.error(`${ID} | combat setup failed`, err);
    ui.notifications.error("Encounter FX: failed to set up the Combat (see console).");
    return broadcast({ action: "close" });
  }

  await sleep(Math.max(0, T.dice - (Date.now() - t0)));
  if (!GM.pcs.size) { GM.finishing = true; return finishOrder(0); }
  broadcast({ action: "dice", dice: [...GM.pcs.values()], style });
}

async function ensureCombat(scene, actorIds, hostile) {
  let combat = game.combats.find(c => c.scene?.id === scene.id);
  if (!combat) combat = await getDocumentClass("Combat").create({ scene: scene.id, active: true });
  if (!combat.active && typeof combat.activate === "function") await combat.activate();

  const wanted = new Set(actorIds), found = new Set(), data = [];
  for (const t of scene.tokens) {
    const isPC = t.actorId && wanted.has(t.actorId);
    const isFoe = hostile && t.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
    if (!isPC && !isFoe) continue;
    if (isPC) found.add(t.actorId);
    if (combat.combatants.some(c => c.tokenId === t.id)) continue;
    data.push({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: t.hidden });
  }
  if (data.length) await combat.createEmbeddedDocuments("Combatant", data);

  const missing = actorIds.filter(id => !found.has(id)).map(id => game.actors.get(id)?.name).filter(Boolean);
  if (missing.length) ui.notifications.warn(`No token in this scene for: ${missing.join(", ")}`);
  return combat;
}

async function rollInit(c) {
  const roll = c.getInitiativeRoll();
  await roll.evaluate();
  const d20 = roll.dice.find(d => d.faces === 20);
  const kept = d20?.results.find(r => r.active)?.result;
  return { nat: clamp(kept ?? Math.round(roll.total), 1, 20), total: roll.total };
}

async function gmRollOne(id, userId) {
  const combat = game.combats.get(GM.combatId);
  const c = combat?.combatants.get(id);
  const user = game.users.get(userId);
  if (!c || !user || !GM.pcs.has(id) || GM.rolled.has(id)) return;
  if (!user.isGM && !c.actor?.testUserPermission(user, "OWNER")) return;
  GM.rolled.add(id);
  const r = await rollInit(c);
  await c.update({ initiative: r.total });
  broadcast({ action: "rolled", id, nat: r.nat, total: Math.round(r.total * 100) / 100 });
  if (GM.rolled.size >= GM.pcs.size && !GM.finishing) { GM.finishing = true; finishOrder(2300); }
}

async function finishOrder(wait) {
  await sleep(wait);
  const combat = game.combats.get(GM.combatId);
  if (!combat) return broadcast({ action: "close" });
  const order = combat.combatants.contents
    .filter(c => !c.hidden && (SHOW_NPC_IN_ORDER || GM.pcs.has(c.id)))
    .sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999))
    .map(c => ({ name: c.name, img: c.img, total: Math.round((c.initiative ?? 0) * 100) / 100, pc: GM.pcs.has(c.id) }));
  broadcast({ action: "order", order, style: GM.style });
  await sleep(1400 + order.length * 180 + 3200);
  try { await combat.startCombat(); ui.combat?.activate?.(); } catch (e) { console.warn(`${ID} |`, e); }
  broadcast({ action: "close" });
}

/* ------------------------------------------------------------------ */
/*  Socket / client                                                    */
/* ------------------------------------------------------------------ */
function onMessage(msg) {
  switch (msg.action) {
    case "intro": return playIntro(msg);
    case "dice": return showDice(msg);
    case "rolled": return playRolled(msg);
    case "order": return playOrder(msg);
    case "close": return closeStage();
    case "rollRequest":
      if (game.users.activeGM?.isSelf) gmRollOne(msg.id, msg.userId);
  }
}

let rootEl = null;
const root = () => {
  if (!rootEl || !rootEl.isConnected) {
    rootEl = document.createElement("div"); rootEl.id = "efx-root"; document.body.appendChild(rootEl);
  }
  return rootEl;
};
const live = { fx: new Set(), dsparks: null, run: 0 };
const track = fx => { live.fx.add(fx); return fx; };
function closeAll() {
  live.run++;
  for (const fx of live.fx) fx.stop?.();
  live.fx.clear();
  live.dsparks?.stop(); live.dsparks = null;
  root().replaceChildren();
}
function closeStage() {
  const stage = root().querySelector(".efx-dice-stage");
  if (!stage) return closeAll();
  const run = live.run;
  stage.classList.add("leaving");
  setTimeout(() => { if (live.run === run) closeAll(); }, 900);
}
const play = src => { try { if (src) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, false); } catch (e) { /* ignore */ } };

/* ------------------------------------------------------------------ */
/*  Sparks (2D canvas; additive embers or opaque blood)                */
/* ------------------------------------------------------------------ */
class Sparks {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.p = []; this.on = true; this.rain = 0;
    this.resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    this.resize(); addEventListener("resize", this.resize);
    this.last = performance.now(); this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  stop() { this.on = false; removeEventListener("resize", this.resize); }
  burst(x, y, o = {}) {
    const { n = 40, speed = 420, life = [0.5, 1.2], size = [2, 5], colors = ["255,210,100", "255,120,30"],
      gravity = 500, angle = 0, spread = Math.PI * 2, add = true } = o;
    for (let i = 0; i < n && this.p.length < 1500; i++) {
      const a = angle + (Math.random() - 0.5) * spread, s = speed * rand(0.25, 1);
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: gravity, life: 0, max: rand(...life),
        size: rand(...size), col: colors[(Math.random() * colors.length) | 0], add });
    }
  }
  loop(now) {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { width: w, height: h } = this.c, ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    if (this.rain > 0) {
      const n = Math.round(this.rain * dt * 60);
      for (let i = 0; i < n; i++) this.burst(rand(0, w), h + 10, { n: 1, speed: rand(250, 800), angle: -Math.PI / 2, spread: 0.5, gravity: -30, life: [1.2, 3], size: [1.5, 4] });
    }
    this.p = this.p.filter(p => {
      p.life += dt; if (p.life >= p.max) return false;
      p.vy += p.g * dt; p.x += (p.vx + (p.add ? Math.sin(p.life * 7 + p.y * .01) * 14 : 0)) * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max, r = p.size * (0.5 + a * 0.7);
      if (p.add) {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
        g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, 6.283); ctx.fill();
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(${p.col},${Math.min(1, a * 2)})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.8, r * (1 + Math.min(.55, Math.hypot(p.vx, p.vy) / 1800)), Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, 6.283); ctx.fill();
      }
      return true;
    });
    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ */
/*  Fire (WebGL fbm shader) + 2D fallback                              */
/* ------------------------------------------------------------------ */
const FIRE_FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT; uniform float uHi; uniform float uLo;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }
void main(){
  vec2 uv=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y; vec2 p=vec2(uv.x*asp,uv.y); float t=uT;
  vec2 q=vec2(p.x*2.4,p.y*1.7-t*1.1);
  vec2 w=vec2(fbm(q+vec2(0.0,t*0.3)),fbm(q+vec2(5.2,1.3-t*0.25)));
  float n=fbm(q+(w-0.5)*2.2+vec2(0.0,-t*0.5));
  float n2=fbm(vec2(p.x*5.0,p.y*1.2-t*1.6)+w*1.5);
  float r1=1.0-abs(fbm(vec2(p.x*3.2,p.y*1.1-t*1.9)+w*2.0)*2.0-1.0); r1=pow(r1,2.2);
  float rag=(n*0.5+n2*0.5)-0.5;
  float field=(uHi-uv.y)*1.5+rag*1.5+(r1-0.4)*0.45;
  float fieldLo=(uv.y-uLo)*1.5+rag*1.5+(r1-0.4)*0.45;
  float body=smoothstep(0.0,0.14,field)*smoothstep(0.0,0.14,fieldLo);
  float core=clamp(r1*1.25+(n-0.5)*0.9,0.0,1.0);
  float heat=0.12+core*0.95+rag*0.35-clamp(field,0.0,1.0)*0.2+(1.0-smoothstep(0.0,0.5,field))*0.4+(1.0-smoothstep(0.0,0.5,fieldLo))*0.3;
  heat=clamp(heat,0.0,1.35);
  vec3 c=vec3(0.18,0.01,0.0);
  c=mix(c,vec3(0.8,0.08,0.0),smoothstep(0.08,0.4,heat));
  c=mix(c,vec3(1.0,0.45,0.03),smoothstep(0.38,0.78,heat));
  c=mix(c,vec3(1.0,0.9,0.5),smoothstep(0.82,1.2,heat));
  float glow=smoothstep(-0.55,0.0,field)*(1.0-smoothstep(0.0,0.05,field))*0.5;
  vec3 col=c*body+vec3(1.0,0.4,0.05)*glow*0.55;
  float a=clamp(body*(0.78+0.22*smoothstep(0.1,0.5,heat))+glow*0.55,0.0,1.0);
  gl_FragColor=vec4(col,a);
}`;

class FireGL {
  constructor(canvas) {
    const k = 0.6; canvas.width = Math.round(innerWidth * k); canvas.height = Math.round(innerHeight * k);
    const gl = this.gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error("no webgl");
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FIRE_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    this.uRes = u("uRes"); this.uT = u("uT"); this.uHi = u("uHi"); this.uLo = u("uLo");
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0);
    this.canvas = canvas; this.loop = this.loop.bind(this);
  }
  start() { this.on = true; this.t0 = performance.now(); this.exitAt = null; requestAnimationFrame(this.loop); }
  exit() { this.exitAt = performance.now(); }
  stop() { this.on = false; this.gl.getExtension("WEBGL_lose_context")?.loseContext(); }
  loop(now) {
    if (!this.on) return;
    const gl = this.gl, t = (now - this.t0) / 1000;
    const hi = -0.1 + 1.7 * ss(0, 1.9, t);
    let lo = -1.0;
    if (this.exitAt) lo = -1.0 + 2.8 * ss(0, 1.4, (now - this.exitAt) / 1000);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uT, t); gl.uniform1f(this.uHi, hi); gl.uniform1f(this.uLo, lo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(this.loop);
  }
}

class FireFallback {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.parts = []; this.emit = 1;
    this.resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    this.resize(); addEventListener("resize", this.resize); this.loop = this.loop.bind(this);
  }
  start() { this.on = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
  exit() { this.emit = 0; this.c.style.transition = "opacity 1.2s"; this.c.style.opacity = 0; }
  stop() { this.on = false; removeEventListener("resize", this.resize); }
  loop(now) {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { width: w, height: h } = this.c, ctx = this.ctx, k = h / 900;
    ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, w, h);
    for (let i = 0, n = Math.round((w / 18) * this.emit); i < n && this.parts.length < 1100; i++)
      this.parts.push({ x: rand(0, w), y: h + 20, vx: rand(-30, 30), vy: -rand(140, 560) * k, life: 0, max: rand(1, 2.4), size: rand(40, 120) * k });
    ctx.globalCompositeOperation = "lighter";
    this.parts = this.parts.filter(p => {
      p.life += dt; if (p.life >= p.max) return false;
      p.x += (p.vx + Math.sin(p.life * 6 + p.x) * 25) * dt; p.y += p.vy * dt;
      const a = p.life / p.max, col = a < .25 ? "255,225,140" : a < .55 ? "255,130,30" : "190,30,10", r = p.size * (1 - a * .4);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${col},${(1 - a) * .55})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill(); return true;
    });
    requestAnimationFrame(this.loop);
  }
}
const makeFire = canvas => { try { return new FireGL(canvas); } catch (e) { console.warn(`${ID} | WebGL fire unavailable, using fallback`, e); return new FireFallback(canvas); } };

/* ------------------------------------------------------------------ */
/*  Magic streams + glitter (2D canvas)                                */
/* ------------------------------------------------------------------ */
const MAGIC_HUES = [330, 285, 255, 215, 185, 150, 50, 20];
const magicHue = () => MAGIC_HUES[(Math.random() * MAGIC_HUES.length) | 0] + rand(-10, 10);

class MagicFX {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    this.resize(); addEventListener("resize", this.resize);
    this.streams = []; this.stars = []; this.rects = []; this.sparkRate = 0; this.loop = this.loop.bind(this);
  }
  start() { this.on = true; this.t0 = this.last = performance.now(); requestAnimationFrame(this.loop); }
  stop() { this.on = false; removeEventListener("resize", this.resize); }
  burst(x, y, n, speed = 520) {
    for (let i = 0; i < n && this.stars.length < 900; i++) {
      const a = rand(0, 6.283), s = speed * rand(0.2, 1);
      this.stars.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.955, life: 0, max: rand(0.7, 1.7), size: rand(4, 13), hue: magicHue(), rot: rand(0, 1.57), spin: rand(-2, 2) });
    }
  }
  star(x, y, s, rot, hue) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.2);
    g.addColorStop(0, `hsla(${hue},100%,80%,.5)`); g.addColorStop(1, `hsla(${hue},100%,70%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, 6.283); ctx.fill();
    ctx.fillStyle = `hsla(${hue},100%,88%,.95)`; ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + i * Math.PI / 4, r = i % 2 ? s * 0.2 : s;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  loop(now) {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const el = (now - this.t0) / 1000, { width: w, height: h } = this.c, ctx = this.ctx, cx = w / 2, cy = h / 2;
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,.17)"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";

    if (el < 1.8) {
      for (let i = 0, n = Math.round(10 * dt * 60); i < n; i++)
        this.streams.push({ a: rand(0, 6.283), R: Math.hypot(w, h) * rand(0.5, 0.7), turns: rand(0.6, 1.4), t: 0,
          dur: Math.max(0.3, Math.min(rand(0.8, 1.4), 2.0 - el)), hue: magicHue(), lw: rand(1.5, 4.5), px: null, py: null });
    }
    this.streams = this.streams.filter(s => {
      s.t += dt; const u = Math.min(1, s.t / s.dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const r = s.R * (1 - e), ang = s.a + s.turns * 6.283 * e;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.78;
      if (s.px !== null) {
        ctx.strokeStyle = `hsla(${s.hue},100%,${62 + 30 * e}%,${0.5 + 0.45 * e})`; ctx.lineWidth = s.lw * (1.2 - 0.5 * e);
        ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(x, y); ctx.stroke();
      }
      s.px = x; s.py = y;
      if (u >= 1) { if (Math.random() < 0.12) this.stars.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), drag: 0.97, life: 0, max: rand(0.5, 1), size: rand(5, 10), hue: s.hue, rot: 0, spin: 1 }); return false; }
      return true;
    });

    if (this.sparkRate > 0 && this.rects.length) {
      for (let k = this.sparkRate * dt * 60; k > 0; k--) {
        if (Math.random() > Math.min(1, k)) continue;
        const r = this.rects[(Math.random() * this.rects.length) | 0];
        this.stars.push({ x: rand(r.x, r.x + r.w), y: rand(r.y, r.y + r.h), vx: 0, vy: rand(-12, 12), drag: 1, life: 0, max: rand(0.5, 1.3), size: rand(5, 14), hue: magicHue(), rot: 0, spin: rand(-1, 1) });
      }
    }
    this.stars = this.stars.filter(s => {
      s.life += dt; if (s.life >= s.max) return false;
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= s.drag; s.vy *= s.drag; s.rot += s.spin * dt;
      this.star(s.x, s.y, s.size * Math.sin(Math.PI * s.life / s.max), s.rot, s.hue);
      return true;
    });
    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ */
/*  Intro: shared scaffolding                                          */
/* ------------------------------------------------------------------ */
function trackHTML(S, reverse) {
  const list = reverse ? [...S.phrases].reverse() : [...S.phrases];
  const reps = Math.max(4, Math.ceil(24 / list.length));
  const half = Array.from({ length: reps }, () => list.map(p => `<span>${esc(p)}</span><i>${S.sep}</i>`).join("")).join("");
  return half + half;
}
const bannerHTML = style => `
  <div class="efx-banner">
    <div class="efx-band efx-band-top"><div class="efx-track">${trackHTML(STYLES[style], false)}</div></div>
    <div class="efx-title">${[...TITLE].map(ch => `<span class="ch">${esc(ch)}</span>`).join("")}</div>
    <div class="efx-band efx-band-bot"><div class="efx-track">${trackHTML(STYLES[style], true)}</div></div>
  </div>`;

function makeCtx(el, style) {
  const t0 = performance.now(), run = live.run;
  return {
    el, style, S: STYLES[style], alive: () => live.run === run,
    until: async ms => { const w = ms - (performance.now() - t0); if (w > 0) await sleep(w); return live.run === run; }
  };
}

async function finishIntro(ctx, onLeave) {
  if (!await ctx.until(ctx.S.t.leave)) return;
  ctx.el.classList.add("leave"); onLeave?.();
  if (!await ctx.until(ctx.S.t.end)) return;
  ctx.el.remove();
  for (const fx of [...live.fx]) if (fx.owner === ctx.el) { fx.stop?.(); live.fx.delete(fx); }
}
const own = (fx, ctx) => { fx.owner = ctx.el; return track(fx); };

async function playIntro({ style = "fire", media = false, asset = null, src = null } = {}) {
  if (!STYLES[style]) style = "fire";
  if ((asset === "video" || media) && MEDIA[style]) return playMediaIntro(style);
  if (asset === "pack" && PACKS[style]) return playPackIntro(style);
  if (asset === "plate" && PLATES[style] && src) return playPlateIntro(style, src);
  closeAll();
  const el = document.createElement("div");
  el.className = `efx-intro st-${style}`;
  el.innerHTML = INTRO[style].html();
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);
  play(game.settings.get(ID, "sound"));
  void el.offsetWidth; el.classList.add("on");
  try { await INTRO[style].run(makeCtx(el, style)); }
  catch (err) { console.error(`${ID} | intro "${style}" failed`, err); closeAll(); }
}


/** Pre-rendered plate: full-screen video + code-driven typography on top. */
async function playMediaIntro(style) {
  const M = MEDIA[style], S = STYLES[style];
  closeAll();
  const el = document.createElement("div");
  el.className = `efx-intro st-${style} efx-media-intro`;
  el.innerHTML = `<div class="efx-dim"></div><video class="efx-media" muted playsinline preload="auto" src="${M.src}"></video>
    <div class="efx-shaker">${bannerHTML(style)}<div class="efx-ring"></div></div><div class="efx-flash"></div>`;
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);
  play(game.settings.get(ID, "sound"));
  const ctx = makeCtx(el, style); ctx.S = { ...S, t: M.t };
  const video = el.querySelector("video");
  void el.offsetWidth; el.classList.add("on");
  video.play().catch(err => console.warn(`${ID} | video autoplay blocked`, err));
  if (!await ctx.until(M.t.title)) return;
  const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")], mx = innerWidth / 2;
  el.classList.add("impact");
  chars.forEach((ch, i) => {
    const [x] = centerOf(ch);
    ch.style.setProperty("--dx", `${(mx - x).toFixed(0)}px`); ch.style.setProperty("--rot", `${rand(-40, 40).toFixed(0)}deg`);
    ch.style.animationDelay = `${i * 50}ms`; ch.classList.add("on");
  });
  title.classList.add("slam");
  if (!await ctx.until(M.t.title + 700)) return;
  el.classList.add("bands");
  if (!await ctx.until(M.t.title + 1500)) return;
  title.classList.add("glow");
  await finishIntro(ctx, () => video.pause());
}

/** Still plate: artwork + code. Magic = convergence then reveal; Dark = slow push-in, lunge, black, blood, title. */
async function playPlateIntro(style, src) {
  const P = PLATES[style], S = STYLES[style];
  closeAll();
  const el = document.createElement("div");
  el.className = `efx-intro st-${style} efx-plate-intro`;
  const [fx_, fy_] = P.focus ?? [0.5, 0.5];
  el.style.setProperty("--fx", `${fx_ * 100}%`); el.style.setProperty("--fy", `${fy_ * 100}%`);
  el.innerHTML = `
    <div class="efx-dim"></div>
    <div class="efx-plate" style="background-image:url('${src}')"></div>
    <div class="efx-fogs"><i></i><i></i></div>
    ${style === "magic" ? '<canvas class="efx-magic"></canvas>' : ""}
    <div class="efx-vignette"></div><div class="efx-titleshade"></div>
    <div class="efx-shaker">${bannerHTML(style)}<div class="efx-ring"></div></div>
    <div class="efx-flash"></div><div class="efx-blackout"></div><canvas class="efx-sparks"></canvas><div class="efx-redflash"></div>`;
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);
  play(game.settings.get(ID, "sound"));
  const ctx = makeCtx(el, style); ctx.S = { ...S, t: P.t };
  const sparks = own(new Sparks(el.querySelector(".efx-sparks")), ctx);
  const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")], mx = innerWidth / 2;
  const lettersIn = (stagger, irregular) => chars.forEach((ch, i) => {
    const [x] = centerOf(ch);
    ch.style.setProperty("--dx", `${(mx - x).toFixed(0)}px`); ch.style.setProperty("--rot", `${rand(-40, 40).toFixed(0)}deg`);
    if (irregular) { ch.style.setProperty("--d", `${rand(0, .45).toFixed(2)}s`); ch.style.setProperty("--dy", `${rand(-.09, .12).toFixed(2)}em`); }
    ch.style.animationDelay = `${i * stagger}ms`; ch.classList.add("on");
  });
  void el.offsetWidth; el.classList.add("on");

  if (style === "magic") {
    const fx = own(new MagicFX(el.querySelector(".efx-magic")), ctx); fx.start();          // orbs + filaments collapse into the core
    if (!await ctx.until(2100)) return;
    el.classList.add("impact", "reveal");                                                  // burst: the artwork is revealed
    fx.burst(innerWidth / 2, innerHeight / 2, 220, 760);
    if (!await ctx.until(P.t.title)) return; lettersIn(55, false);
    fx.rects = [...el.querySelectorAll(".efx-band, .efx-title")].map(n => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    fx.sparkRate = 3;
    if (!await ctx.until(P.t.title + 800)) return; el.classList.add("bands");
    if (!await ctx.until(P.t.title + 1700)) return; title.classList.add("glow");
    await finishIntro(ctx, () => { fx.sparkRate = 0; });
  } else {
    const blood = ["120,0,0", "170,10,10", "80,0,0"];
    if (!await ctx.until(3400)) return; el.classList.add("lunge");                          // it jumps at the camera
    if (!await ctx.until(3750)) return; el.classList.add("black");                          // cut to black (scene swaps ~3900)
    if (!await ctx.until(3950)) return; el.classList.add("splat");
    sparks.burst(innerWidth * .5, innerHeight * .5, { n: 120, speed: 950, life: [.6, 1.5], size: [3, 7], gravity: 950, colors: blood, add: false });
    sparks.burst(innerWidth * .35, innerHeight * .62, { n: 40, speed: 600, life: [.6, 1.3], size: [2, 5], gravity: 900, colors: blood, add: false, angle: -.8, spread: 1.4 });
    sparks.burst(innerWidth * .66, innerHeight * .58, { n: 40, speed: 600, life: [.6, 1.3], size: [2, 5], gravity: 900, colors: blood, add: false, angle: -2.3, spread: 1.4 });
    if (!await ctx.until(P.t.title)) return; el.classList.remove("black", "lunge"); el.classList.add("backdrop");
    lettersIn(0, true); title.classList.add("slam"); el.classList.add("bands", "impact");
    const [cx, cy] = centerOf(title);
    sparks.burst(cx, cy, { n: 70, speed: 700, life: [.6, 1.4], size: [3, 7], gravity: 1000, colors: blood, add: false });
    if (!await ctx.until(P.t.title + 400)) return; startDrips(title, ctx); title.classList.add("glow");
    await finishIntro(ctx);
  }
}

/** Magical asset pack director: orbs + ribbons converge on an arcane core, burst, title is revealed. */
async function playPackIntro(style) {
  const K = await packFor(style);
  if (!K) return playIntro({ style });                                   // pack vanished: procedural fallback
  closeAll();
  const S = STYLES[style], A = K.manifest.assets;
  const el = document.createElement("div");
  el.className = `efx-intro st-${style} efx-pack-intro`;
  el.innerHTML = `<div class="efx-dim"></div><div class="efx-pack-stage"></div><div class="efx-flash"></div><div class="efx-shaker">${bannerHTML(style)}</div>`;
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);
  play(game.settings.get(ID, "sound"));
  const ctx = makeCtx(el, style); ctx.S = { ...S, t: K.t };
  void el.offsetWidth; el.classList.add("on");

  // load every image (cached after the first run); a missing optional asset just removes that layer
  const names = Object.keys(A), loaded = {};
  await Promise.all(names.map(async n => { loaded[n] = await loadImg(`${K.dir}/${A[n].file}`); }));
  if (!ctx.alive()) return;
  if (!loaded["arcane-core"] || !loaded["encounter-magical"]) { console.warn(`${ID} | magical pack incomplete, using procedural FX`); return playIntro({ style }); }
  const src = n => `${K.dir}/${A[n].file}`, has = n => !!loaded[n];

  try {
    const stage = el.querySelector(".efx-pack-stage"), W = innerWidth, H = innerHeight, u = Math.min(W, H), cx = W / 2, cy = H / 2;
    const q = calm() ? 0.5 : 1, anims = [];
    const mk = (n, css = "", cls = "") => { const im = document.createElement("img"); im.src = src(n); im.alt = ""; im.draggable = false; im.className = `p-img ${cls}`; im.style.cssText = css; stage.appendChild(im); return im; };
    const anim = (node, kf, opt) => { const a = node.animate(kf, { fill: "forwards", ...opt }); anims.push(a); return a; };
    const center = (w, h) => `left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;`;

    // --- hero orbs with ribbons (6 orbs, each with its own path)
    const ORBS = [
      { n: "orb-blue", rb: "ribbon-blue", f: 1.0, dir: 1 }, { n: "orb-magenta", rb: "ribbon-violet", f: .86, dir: -1, hue: 38 },
      { n: "orb-cyan", rb: "ribbon-blue", f: 1.1, dir: 1, hue: -22 }, { n: "orb-gold", rb: "ribbon-gold", f: .9, dir: -1 },
      { n: "orb-violet", rb: "ribbon-violet", f: 1.05, dir: 1 }, { n: "orb-green", rb: "ribbon-green", f: .82, dir: -1 }
    ].filter(o => has(o.n));
    const D = 2500, N = 36;
    ORBS.forEach((o, i) => {
      const a0 = (i / ORBS.length) * Math.PI * 2 + rand(-.18, .18), R = rand(.92, 1.08), size = u * 0.19 * o.f;
      const rx = W * 0.40, ry = H * 0.34, pts = [];
      for (let k = 0; k <= N; k++) {
        const f = k / N, qq = ss(.38, .95, f), d = ss(.1, .4, f), ang = a0 + o.dir * (.35 * d + 1.15 * Math.PI * qq), rad = R * Math.pow(1 - qq, 1.15) * (1 - .05 * d);
        pts.push([Math.cos(ang) * rad * rx, Math.sin(ang) * rad * ry]);
      }
      const wrap = document.createElement("div"); wrap.className = "p-orb"; wrap.style.cssText = `left:${cx}px;top:${cy}px;`; stage.appendChild(wrap);
      const orb = document.createElement("img"); orb.src = src(o.n); orb.className = "p-img p-screen"; orb.draggable = false;
      orb.style.cssText = `left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;opacity:0;`; wrap.appendChild(orb);
      if (has(o.rb)) {                                                    // ribbon trails behind the orb, head at the orb
        const a = A[o.rb], rw = size * 3.6, rh = rw * a.h / a.w, rib = document.createElement("img");
        rib.src = src(o.rb); rib.className = "p-img p-screen"; rib.draggable = false;
        rib.style.cssText = `left:${-a.ax * rw}px;top:${-a.ay * rh}px;width:${rw}px;height:${rh}px;transform-origin:${a.ax * 100}% ${a.ay * 100}%;opacity:0;${o.hue ? `filter:hue-rotate(${o.hue}deg);` : ""}`;
        wrap.insertBefore(rib, orb);
        const ang = []; let last = null;
        for (let k = 0; k <= N; k++) {
          const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(N, k + 1)], dx = p1[0] - p0[0], dy = p1[1] - p0[1];
          let t = Math.hypot(dx, dy) > 0.6 ? Math.atan2(dy, dx) * 180 / Math.PI : null;
          if (t !== null && last !== null) { while (t - last > 180) t -= 360; while (t - last < -180) t += 360; }
          if (t !== null) last = t; ang.push(t);
        }
        const firstMoving = ang.find(v => v !== null) ?? 0; let prev = firstMoving;
        const rot = ang.map(v => { if (v === null) v = prev; prev = v; return v; });
        anim(rib, rot.map((r, k) => ({ offset: k / N, transform: `rotate(${r.toFixed(1)}deg)`, opacity: ss(.26, .46, k / N) * (1 - ss(.9, .98, k / N)) * .92 })), { delay: 150 + i * 40, duration: D, easing: "linear" });
      }
      anim(wrap, pts.map((p, k) => ({ offset: k / N, transform: `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)` })), { delay: 150 + i * 40, duration: D, easing: "linear" });
      anim(orb, [{ offset: 0, opacity: 0, transform: "scale(.4)" }, { offset: .12, opacity: 1, transform: "scale(1)" }, { offset: .9, opacity: 1, transform: "scale(.92)" },
        { offset: .97, opacity: .9, transform: "scale(.4)" }, { offset: 1, opacity: 0, transform: "scale(.12)" }], { delay: 150 + i * 40, duration: D, easing: "ease-out" });
    });

    // --- arcane core (charges) and rings
    const cw = u * 0.5, chh = cw * A["arcane-core"].h / A["arcane-core"].w;
    const core = mk("arcane-core", center(cw, chh) + "opacity:0;", "p-screen");
    anim(core, [{ opacity: 0, transform: "scale(.08)" }, { offset: .3, opacity: .6, transform: "scale(.24)" }, { opacity: 1, transform: "scale(.78)" }], { delay: 300, duration: 2300, easing: "cubic-bezier(.4,0,.6,1)" });
    const rings = [];
    if (has("arcane-ring")) [[1.0, 1, .85, 18000], [1.32, -1, .45, 26000]].forEach(([k, dir, op, dur], i) => {
      const rw = u * 0.62 * k, rh = rw * A["arcane-ring"].h / A["arcane-ring"].w;
      const wrap = document.createElement("div"); wrap.className = "p-ringwrap"; wrap.style.cssText = center(rw, rh); wrap.style.opacity = 0; stage.appendChild(wrap);
      const im = document.createElement("img"); im.src = src("arcane-ring"); im.className = "p-img p-screen"; im.draggable = false; im.style.cssText = "left:0;top:0;width:100%;height:100%;"; wrap.appendChild(im);
      if (!calm()) anim(im, [{ transform: "rotate(0deg)" }, { transform: `rotate(${360 * dir}deg)` }], { duration: dur, iterations: Infinity, easing: "linear", fill: "none" });
      anim(wrap, [{ opacity: 0, transform: "scale(.5)" }, { opacity: op, transform: "scale(1)" }], { delay: 900 + i * 300, duration: 900, easing: "ease-out" });
      rings.push(wrap);
    });

    // --- timeline
    if (!await ctx.until(2650)) return;
    el.classList.add("impact");                                          // CONVERGENCE -> BURST
    anim(core, [{ opacity: 1, transform: "scale(.78)" }, { offset: .25, opacity: 1, transform: "scale(1.1)" }, { opacity: 0, transform: "scale(1.9)" }], { duration: 800, easing: "ease-out" });
    rings.forEach(r => anim(r, [{ opacity: .8, transform: "scale(1)" }, { opacity: 0, transform: "scale(3)" }], { duration: 1000, easing: "cubic-bezier(.2,.7,.3,1)" }));
    if (has("magic-burst")) {
      const bw = u * 0.62, b = mk("magic-burst", center(bw, bw * A["magic-burst"].h / A["magic-burst"].w) + "opacity:0;", "p-screen");
      anim(b, [{ opacity: 1, transform: "scale(.25)" }, { offset: .35, opacity: 1, transform: "scale(1.6)" }, { opacity: 0, transform: "scale(2.6)" }], { duration: 1100, easing: "ease-out" });
    }
    const sparkNames = ["sparkle-1", "sparkle-2", "sparkle-3", "sparkle-4"].filter(has);
    const burstSparks = Math.round(16 * q);
    if (sparkNames.length) for (let i = 0; i < burstSparks; i++) {
      const n = sparkNames[i % sparkNames.length], sz = u * rand(.05, .12), ang = rand(0, 6.283), dist = rand(.16, .5) * W;
      const im = mk(n, `left:${cx - sz / 2}px;top:${cy - sz / 2}px;width:${sz}px;height:auto;opacity:0;`, "p-screen");
      const a = anim(im, [{ opacity: 1, transform: "translate(0,0) scale(.3) rotate(0deg)" }, { offset: .3, opacity: 1 },
        { opacity: 0, transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist * .7}px) scale(${rand(.7, 1.3)}) rotate(${rand(-90, 90)}deg)` }], { duration: rand(900, 1600), easing: "cubic-bezier(.1,.7,.3,1)" });
      a.onfinish = () => im.remove();
    }

    if (!await ctx.until(2800)) return;                                  // the title is revealed from the core
    const title = el.querySelector(".efx-title"); title.textContent = "";
    const timg = document.createElement("img"); timg.src = src("encounter-magical"); timg.className = "efx-title-img"; timg.alt = "ENCOUNTER"; timg.draggable = false; title.appendChild(timg);
    const tsweep = document.createElement("img"); tsweep.src = src("encounter-magical"); tsweep.className = "efx-title-sweep"; tsweep.alt = ""; tsweep.draggable = false; tsweep.style.opacity = 0; title.appendChild(tsweep);
    anim(timg, [{ opacity: 0, transform: "scale(.55)", filter: "blur(18px) brightness(3)" }, { offset: .55, opacity: 1, filter: "blur(2px) brightness(1.6)" }, { opacity: 1, transform: "scale(1)", filter: "blur(0) brightness(1)" }],
      { duration: 1000, easing: "cubic-bezier(.2,.9,.2,1)" });

    if (!await ctx.until(3500)) return; el.classList.add("bands");        // running text frames the title
    const tr = timg.getBoundingClientRect();
    if (sparkNames.length) for (let i = 0; i < Math.round(12 * q); i++) {   // a restrained field of twinkles around the title
      const n = sparkNames[i % sparkNames.length], sz = u * rand(.03, .07), x = rand(tr.left - tr.width * .03, tr.right + tr.width * .03), y = rand(tr.top - tr.height * .5, tr.bottom + tr.height * .5);
      const im = mk(n, `left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:auto;opacity:0;`, "p-screen");
      anim(im, [{ opacity: 0, transform: "scale(.2) rotate(0deg)" }, { offset: .5, opacity: 1, transform: "scale(1) rotate(25deg)" }, { opacity: 0, transform: "scale(.2) rotate(50deg)" }],
        { delay: rand(0, 1800), duration: rand(1400, 2600), iterations: Infinity, fill: "none" });
    }
    if (!await ctx.until(4000)) return;
    tsweep.style.opacity = 1; tsweep.classList.add("on");                  // light sweeps through the letters
    if (!calm()) anim(timg, [{ filter: "brightness(1)" }, { filter: "brightness(1.18)" }], { duration: 2600, iterations: Infinity, direction: "alternate", easing: "ease-in-out", fill: "none" });
    await finishIntro(ctx);
  } catch (err) {
    console.error(`${ID} | pack intro failed`, err); closeAll();
  }
}

const centerOf = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

/* ------------------------------------------------------------------ */
/*  Intro style: FIRE (Default)                                        */
/* ------------------------------------------------------------------ */
const INTRO = {};
INTRO.fire = {
  html: () => `
    <div class="efx-dim"></div>
    <div class="efx-shaker">
      <canvas class="efx-fire"></canvas><canvas class="efx-sparks"></canvas>
      ${bannerHTML("fire")}
      <div class="efx-ring"></div>
    </div>
    <div class="efx-flash"></div>`,
  async run(ctx) {
    const { el } = ctx;
    const fire = own(makeFire(el.querySelector(".efx-fire")), ctx); fire.start();
    const sparks = own(new Sparks(el.querySelector(".efx-sparks")), ctx); sparks.rain = 1.6;
    if (!await ctx.until(1300)) return;
    const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")];
    for (const ch of chars) {                                   // typewriter
      ch.classList.add("on");
      const [x, y] = centerOf(ch);
      sparks.burst(x, y, { n: 7, speed: 260, life: [.25, .6], size: [1.5, 3], gravity: 300 });
      await sleep(70); if (!ctx.alive()) return;
    }
    if (!await ctx.until(1300 + chars.length * 70 + 90)) return;
    title.classList.add("slam");                                // slam
    if (!await ctx.until(1300 + chars.length * 70 + 320)) return;
    el.classList.add("impact", "bands");
    const [cx, cy] = centerOf(title);
    sparks.burst(cx, cy, { n: 180, speed: 900, life: [.5, 1.4], size: [2, 6], gravity: 700 });
    sparks.burst(cx, cy, { n: 60, speed: 500, life: [.4, 1], size: [3, 7], gravity: 200, colors: ["255,255,230", "255,200,90"] });
    setTimeout(() => title.classList.add("glow"), 450);
    await finishIntro(ctx, () => { fire.exit(); sparks.rain = 0; });
  }
};

/* ------------------------------------------------------------------ */
/*  Intro style: MAGICAL                                               */
/* ------------------------------------------------------------------ */
INTRO.magic = {
  html: () => `
    <div class="efx-dim"></div>
    <canvas class="efx-magic"></canvas>
    <div class="efx-shaker">${bannerHTML("magic")}<div class="efx-ring"></div><div class="efx-ring r2"></div></div>
    <div class="efx-flash"></div>`,
  async run(ctx) {
    const { el } = ctx;
    const fx = own(new MagicFX(el.querySelector(".efx-magic")), ctx); fx.start();
    if (!await ctx.until(2000)) return;
    el.classList.add("impact");                                 // convergence: flash + rings + glitter
    fx.burst(innerWidth / 2, innerHeight / 2, 160, 640);
    if (!await ctx.until(2100)) return;
    const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")];
    const [mx] = [innerWidth / 2];
    chars.forEach((ch, i) => {                                  // letters burst outward from the center
      const [x] = centerOf(ch);
      ch.style.setProperty("--dx", `${(mx - x).toFixed(0)}px`);
      ch.style.setProperty("--rot", `${rand(-50, 50).toFixed(0)}deg`);
      ch.style.animationDelay = `${i * 55}ms`;
      ch.classList.add("on");
    });
    const rects = [...el.querySelectorAll(".efx-band, .efx-title")].map(n => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    fx.rects = rects; fx.sparkRate = 2.2;
    if (!await ctx.until(2800)) return;
    el.classList.add("bands");
    if (!await ctx.until(3400)) return;
    title.classList.add("glow");
    await finishIntro(ctx, () => { fx.sparkRate = 0; const [cx, cy] = centerOf(title); fx.burst(cx, cy, 90, 420); });
  }
};

/* ------------------------------------------------------------------ */
/*  Intro style: DARK FANTASY                                          */
/* ------------------------------------------------------------------ */
function foliageSVG(side) {
  const left = side === "left";
  const layers = [
    { n: 46, fill: "A", w: [7, 15], ty: [90, 560], op: 1 },
    { n: 54, fill: "B", w: [6, 13], ty: [200, 780], op: 1 },
    { n: 34, fill: "C", w: [12, 26], ty: [40, 420], op: 1 }
  ];
  let paths = "";
  for (const L of layers) for (let i = 0; i < L.n; i++) {
    const x = rand(-20, 620), w = rand(...L.w), ty = rand(...L.ty), lean = (left ? rand(-130, 70) : rand(-70, 130)), bend = rand(-60, 60);
    const h = 1010 - ty, p = f => 1010 - h * f;
    const cx = f => x + lean * f * f + bend * Math.sin(f * 3.1);
    const wd = f => w * (1 - f) * (1 - f * .15);
    const pts = [0, .25, .5, .75, 1];
    const L1 = pts.map(f => `${(cx(f) - wd(f)).toFixed(0)},${p(f).toFixed(0)}`);
    const R1 = pts.map(f => `${(cx(f) + wd(f)).toFixed(0)},${p(f).toFixed(0)}`).reverse();
    paths += `<path fill="url(#fg${L.fill}${side})" stroke="rgba(190,208,222,.12)" stroke-width="1.2" d="M${L1[0]} C${L1[1]} ${L1[2]} ${L1[3]} S${L1[4]} ${L1[4]} L${R1[0]} C${R1[1]} ${R1[2]} ${R1[3]} S${R1[4]} ${R1[4]}Z"/>`;
  }
  return `<svg viewBox="0 0 600 1000" preserveAspectRatio="none"><defs>
    <linearGradient id="fgA${side}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a444c"/><stop offset="1" stop-color="#10151a"/></linearGradient>
    <linearGradient id="fgB${side}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e252b"/><stop offset="1" stop-color="#06080a"/></linearGradient>
    <linearGradient id="fgC${side}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0f12"/><stop offset="1" stop-color="#000"/></linearGradient>
  </defs>${paths}</svg>`;
}

const EYES_SVG = `
<svg class="efx-eyes" viewBox="0 0 400 140">
  <defs>
    <radialGradient id="efxEg" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff4b0"/><stop offset=".35" stop-color="#ffc21a"/><stop offset=".7" stop-color="#b85a00"/><stop offset="1" stop-color="#3a1200" stop-opacity="0"/>
    </radialGradient>
    <filter id="efxEb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <g class="glow" filter="url(#efxEb)" opacity=".6"><ellipse cx="112" cy="70" rx="64" ry="34" fill="#ff9a1a"/><ellipse cx="288" cy="70" rx="64" ry="34" fill="#ff9a1a"/></g>
  <g class="eye"><path d="M52,70 Q112,20 172,70 Q112,114 52,70Z" fill="url(#efxEg)"/><ellipse cx="112" cy="70" rx="5" ry="27" fill="#070200"/><ellipse cx="104" cy="58" rx="4" ry="2.4" fill="#fff" opacity=".8"/></g>
  <g class="eye"><path d="M228,70 Q288,20 348,70 Q288,114 228,70Z" fill="url(#efxEg)"/><ellipse cx="288" cy="70" rx="5" ry="27" fill="#070200"/><ellipse cx="280" cy="58" rx="4" ry="2.4" fill="#fff" opacity=".8"/></g>
</svg>`;


/** Tapered pointed shape along a cubic curve (fingers, talons). */
function clawShape(p, wmax, { exp = 0.65, fall = 0.3 } = {}) {
  const [p0, p1, p2, p3] = p, N = 28, L = [], R = [];
  const bez = t => { const u = 1 - t; return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); };
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = bez(Math.max(0, t - .01)), b = bez(Math.min(1, t + .01)), c = bez(t);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const w = wmax * Math.pow(Math.sin(Math.PI * t), exp) * (1 - fall * t);
    L.push(`${(c[0] + nx * w).toFixed(1)},${(c[1] + ny * w).toFixed(1)}`); R.push(`${(c[0] - nx * w).toFixed(1)},${(c[1] - ny * w).toFixed(1)}`);
  }
  return `M${L.join("L")}L${R.reverse().join("L")}Z`;
}

// A clawed silhouette pushing the brush aside from the right edge, rim-lit by the moon.
const FINGERS = [
  { c: [[270, 250], [225, 215], [165, 200], [105, 215]], w: 11, tip: [[105, 215], [85, 222], [68, 238], [56, 266]] },
  { c: [[266, 285], [205, 268], [135, 268], [70, 292]], w: 12, tip: [[70, 292], [50, 300], [36, 318], [28, 348]] },
  { c: [[266, 322], [205, 318], [140, 335], [88, 372]], w: 11, tip: [[88, 372], [70, 386], [60, 406], [58, 436]] },
  { c: [[274, 355], [225, 368], [175, 398], [135, 440]], w: 9, tip: [[135, 440], [118, 456], [110, 476], [112, 504]] },
  { c: [[300, 235], [288, 185], [262, 140], [225, 112]], w: 12, tip: [[225, 112], [208, 100], [196, 84], [194, 58]] }
];
const HAND_SVG = `
<svg class="efx-hand" viewBox="0 0 440 540">
  <defs><linearGradient id="efxHandG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a444f"/><stop offset=".55" stop-color="#171d24"/><stop offset="1" stop-color="#07090c"/></linearGradient></defs>
  <g fill="url(#efxHandG)" stroke="rgba(205,220,240,.2)" stroke-width="1" stroke-linejoin="round">
    <path d="M440,175 C390,200 350,222 305,236 C262,262 244,330 262,372 C300,392 380,404 440,470Z"/>
    <path d="M262,262 C250,300 252,345 270,382 C300,410 340,404 362,372 C380,330 376,284 350,246 C320,226 282,232 262,262Z"/>
    ${FINGERS.map(f => `<path d="${clawShape(f.c, f.w, { exp: .5, fall: .1 })}"/><path d="${clawShape(f.tip, 4.5, { exp: .45, fall: 0 })}"/>`).join("")}
  </g>
</svg>`;

/** A few drips from selected letters plus falling droplets: tasteful, not every letter. */
function startDrips(title, ctx) {
  const chars = [...title.querySelectorAll(".ch")].sort(() => Math.random() - .5).slice(0, 5);
  chars.forEach((ch, i) => setTimeout(() => {
    if (!ctx.alive()) return;
    const w = rand(5, 9), len = rand(50, 150), dur = rand(2.6, 4.6), x = ch.offsetLeft + rand(.2, .8) * ch.offsetWidth, y = ch.offsetTop + ch.offsetHeight * .76;
    const d = document.createElement("i"); d.className = "efx-drip";
    d.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--w:${w.toFixed(1)}px;--len:${len.toFixed(0)}px;--dur:${dur.toFixed(1)}s`; title.appendChild(d);
    if (i % 2 === 0) setTimeout(() => {
      if (!ctx.alive()) return;
      const o = document.createElement("i"); o.className = "efx-drop"; o.style.cssText = `left:${x.toFixed(0)}px;top:${(y + len).toFixed(0)}px;--w:${w.toFixed(1)}px`; title.appendChild(o);
    }, dur * 800);
  }, 250 + i * 520 + rand(0, 300)));
}

INTRO.dark = {
  html: () => `
    <div class="efx-dim"></div>
    <div class="efx-moon"></div>
    <div class="efx-fog f1"></div><div class="efx-fog f2"></div>
    <div class="efx-stage-dark">${EYES_SVG}</div>
    <div class="efx-foliage left">${foliageSVG("left")}</div>
    <div class="efx-foliage right">${foliageSVG("right")}</div>
    ${HAND_SVG}
    <div class="efx-vignette"></div>
    <div class="efx-shaker">${bannerHTML("dark")}</div>
    <div class="efx-blackout"></div>
    <canvas class="efx-sparks"></canvas>
    <div class="efx-redflash"></div>`,
  async run(ctx) {
    const { el } = ctx;
    const sparks = own(new Sparks(el.querySelector(".efx-sparks")), ctx);
    if (!await ctx.until(900)) return; el.classList.add("hand");          // a clawed silhouette pushes at the brush
    if (!await ctx.until(1400)) return; el.classList.add("parting");      // the vegetation opens
    if (!await ctx.until(2400)) return; el.classList.add("eyes");         // two faint eyes
    if (!await ctx.until(3000)) return; el.classList.add("eyes2");        // they hold... silence
    if (!await ctx.until(3500)) return; el.classList.add("lunge");        // it jumps
    if (!await ctx.until(3750)) return; el.classList.add("black");        // cut to black (scene swaps at ~3800)
    if (!await ctx.until(3850)) return; el.classList.add("splat");
    const W = innerWidth, H = innerHeight, blood = ["120,0,0", "170,10,10", "80,0,0"];
    sparks.burst(W * .5, H * .5, { n: 120, speed: 950, life: [.6, 1.5], size: [3, 7], gravity: 950, colors: blood, add: false });
    sparks.burst(W * .35, H * .62, { n: 40, speed: 600, life: [.6, 1.3], size: [2, 5], gravity: 900, colors: blood, add: false, angle: -.8, spread: 1.4 });
    sparks.burst(W * .66, H * .58, { n: 40, speed: 600, life: [.6, 1.3], size: [2, 5], gravity: 900, colors: blood, add: false, angle: -2.3, spread: 1.4 });
    if (!await ctx.until(4300)) return; el.classList.remove("black");     // the title appears out of the dark
    const title = el.querySelector(".efx-title");
    title.querySelectorAll(".ch").forEach(c => { c.style.setProperty("--d", `${rand(0, .45).toFixed(2)}s`); c.style.setProperty("--dy", `${rand(-.09, .12).toFixed(2)}em`); c.classList.add("on"); });
    title.classList.add("slam"); el.classList.add("bands", "impact");
    const [cx, cy] = centerOf(title);
    sparks.burst(cx, cy, { n: 70, speed: 700, life: [.6, 1.4], size: [3, 7], gravity: 1000, colors: blood, add: false });
    if (!await ctx.until(4700)) return; startDrips(title, ctx); title.classList.add("glow");
    await finishIntro(ctx);
  }
};

/* ------------------------------------------------------------------ */
/*  3D d20 (CSS icosahedron)                                           */
/* ------------------------------------------------------------------ */
const PHI = (1 + Math.sqrt(5)) / 2;
const VERTS = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };

function buildDie(die, L, { h = 5, s: sat = 78 } = {}) {
  const sc = L / 2, H = L * Math.sqrt(3) / 2, light = norm([-0.4, -0.7, 1]), front = [];
  FACES.forEach((f, i) => {
    const [A, B, C] = f.map(k => VERTS[k].map(v => v * sc));
    const cen = [0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3);
    let ex = norm(sub(C, B));
    const M = [0, 1, 2].map(k => (B[k] + C[k]) / 2), ey = norm(sub(M, A));
    let n = cross(ex, ey);
    if (dot(n, cen) < 0) { ex = ex.map(v => -v); n = n.map(v => -v); }
    const P = [0, 1, 2].map(k => cen[k] - ex[k] * (L / 2) - ey[k] * (2 * H / 3));
    const el = document.createElement("div"); el.className = "efx-face";
    const lit = Math.max(0, dot(n, light));
    el.style.cssText = `width:${L}px;height:${H}px;--fs:${Math.round(L * 0.29)}px;` +
      `background:linear-gradient(160deg,hsl(${h} ${sat}% ${26 + lit * 24}%),hsl(${h} ${Math.max(0, sat - 6)}% ${10 + lit * 12}%));` +
      `transform:matrix3d(${[...ex, 0, ...ey, 0, ...n, 0, ...P, 1].join()})`;
    el.innerHTML = `<b>${i + 1}</b>`;
    die.appendChild(el);
    front.push([ex[0], ey[0], n[0], 0, ex[1], ey[1], n[1], 0, ex[2], ey[2], n[2], 0, 0, 0, 0, 1]);
  });
  return front;
}

function randMatrix() {
  let q = [0, 0, 0, 0].map(() => Math.random() * 2 - 1);
  const l = Math.hypot(...q); q = q.map(v => v / l);
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
}

/* ------------------------------------------------------------------ */
/*  Dice stage: 1 die per player, everyone rolls at the same time      */
/* ------------------------------------------------------------------ */
const stageEl = () => root().querySelector(".efx-dice-stage");

function showDice({ dice = [], style = "fire" } = {}) {
  if (!STYLES[style]) style = "fire";
  stageEl()?.remove(); live.dsparks?.stop();
  const n = dice.length, S = STYLES[style];
  const L = n <= 3 ? 100 : n <= 5 ? 84 : n <= 7 ? 68 : 54;
  const size = Math.round(L * 3);
  const isGM = game.user.isGM;
  const stage = document.createElement("div");
  stage.className = `efx-dice-stage st-${style}`;
  stage.innerHTML = `
    <div class="efx-backdrop"></div>
    <canvas class="efx-sparks"></canvas>
    <div class="efx-headline">ROLL INITIATIVE</div>
    <div class="efx-dice-row"></div>
    <div class="efx-order"></div>
    ${isGM ? `<button type="button" class="efx-gm-roll">Roll All Remaining</button>` : ""}`;
  root().appendChild(stage);
  stage._sparks = live.dsparks = new Sparks(stage.querySelector(".efx-sparks"));
  stage._slots = new Map(); stage._L = L; stage._colors = S.colors;

  const row = stage.querySelector(".efx-dice-row");
  for (const d of dice) {
    const mine = isGM || d.owners.includes(game.user.id);
    const slot = document.createElement("div");
    slot.className = `efx-slot${mine ? " mine" : ""}`;
    slot.style.width = `${size * 1.05}px`;
    slot.innerHTML = `
      <div class="efx-aura"></div>
      <div class="efx-scene3d" style="width:${size}px;height:${size}px;perspective:${L * 9}px">
        <div class="efx-bounce"><div class="efx-die idle ${mine ? "gm" : ""}" style="animation-delay:-${rand(0, 9).toFixed(2)}s"></div></div>
      </div>
      <div class="efx-res">${mine ? '<span class="hint">Click the die</span>' : '<span class="hint dim">Waiting...</span>'}</div>
      <div class="efx-name">${esc(d.name)}</div>
      <div class="efx-player">${esc(d.player)}</div>`;
    row.appendChild(slot);
    const die = slot.querySelector(".efx-die");
    const front = buildDie(die, L, S.die);
    const info = { id: d.id, el: slot, die, bounce: slot.querySelector(".efx-bounce"), scene: slot.querySelector(".efx-scene3d"), front, prev: null, anim: null, pending: false, done: false };
    stage._slots.set(d.id, info);
    if (mine) slot.addEventListener("click", () => requestRoll(info));
  }

  if (isGM) {
    stage.querySelector(".efx-gm-roll").addEventListener("click", () => {
      let i = 0;
      for (const id of GM.pcs.keys()) if (!GM.rolled.has(id)) setTimeout(() => gmRollOne(id, game.user.id), 250 * i++);
    });
    const onKey = ev => { if (ev.key === "Escape" && stageEl()) { removeEventListener("keydown", onKey); broadcast({ action: "close" }); } };
    addEventListener("keydown", onKey);
  }
}

function requestRoll(info) {
  if (info.pending || info.done) return;
  info.pending = true;
  info.el.classList.add("charging");
  if (game.user.isGM) gmRollOne(info.id, game.user.id);
  else game.socket.emit(SOCKET, { action: "rollRequest", id: info.id, userId: game.user.id });
}

async function playRolled({ id, nat, total }) {
  const stage = stageEl(); const info = stage?._slots.get(id);
  if (!info || info.done) return;
  info.done = true; info.pending = false;
  const { el, die, bounce, scene, front } = info, sparks = stage._sparks, k = stage._L / 100, colors = stage._colors;
  el.classList.remove("charging"); el.classList.add("rolling");
  die.classList.remove("idle");
  const resEl = el.querySelector(".efx-res"); resEl.innerHTML = "";
  const rect = () => centerOf(scene);
  try { play(CONFIG.sounds?.dice); } catch (e) { /* ignore */ }

  const trail = setInterval(() => {
    const [x, y] = rect();
    sparks.burst(x, y, { n: 4, speed: 180, life: [.3, .7], size: [1.5, 3.5], gravity: -80, colors });
  }, 40);

  const target = front[nat - 1], prev = info.prev ?? randMatrix();
  const kf = [prev, randMatrix(), randMatrix(), randMatrix(), randMatrix(), randMatrix(), target];
  const offs = [0, .18, .36, .54, .7, .85, 1];
  const anim = die.animate(kf.map((m, i) => ({ transform: `matrix3d(${m.join()})`, offset: offs[i], easing: i === 5 ? "cubic-bezier(.1,.8,.3,1)" : "linear" })),
    { duration: 1700, fill: "forwards" });
  info.anim?.cancel(); info.anim = anim;
  bounce.animate([
    { transform: "translateY(0) scale(.9)" },
    { transform: `translateY(${-110 * k}px) scale(1.2)`, offset: .3 },
    { transform: "translateY(0) scale(1)", offset: .6 },
    { transform: `translateY(${-35 * k}px) scale(1.05)`, offset: .78 },
    { transform: "translateY(0) scale(1)" }
  ], { duration: 1700, easing: "ease-out" });
  await anim.finished.catch(() => {});
  clearInterval(trail);
  if (!stageEl()) return;

  const [cx, cy] = rect(), mod = Math.round(total) - nat;
  el.classList.remove("rolling"); el.classList.add("landed");
  const ring = document.createElement("div"); ring.className = "efx-ring"; scene.appendChild(ring); setTimeout(() => ring.remove(), 900);
  sparks.burst(cx, cy, { n: 36, speed: 520, life: [.4, 1], size: [2, 4.5], gravity: 600, colors });
  if (nat === 20) {
    el.classList.add("crit");
    sparks.burst(cx, cy, { n: 160, speed: 900, life: [.6, 1.6], size: [2, 6], gravity: 500, colors: ["255,230,120", "255,190,40", "255,255,230"] });
    flash(stage, "gold");
  } else if (nat === 1) {
    el.classList.add("fumble");
    sparks.burst(cx, cy, { n: 70, speed: 380, life: [.6, 1.4], size: [3, 6], gravity: 250, colors: ["200,20,10", "90,0,0"] });
    flash(stage, "red");
  }
  resEl.innerHTML = `<span class="nat">${nat}</span><span class="sum">${mod >= 0 ? "+" : "−"} ${Math.abs(mod)} = <b>${Math.round(total)}</b></span>`;
  info.prev = target;
}

function flash(stage, kind) {
  const f = document.createElement("div"); f.className = `efx-screenflash ${kind}`; stage.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

function playOrder({ order = [], style = "fire" } = {}) {
  let stage = stageEl();
  if (!stage) { showDice({ dice: [], style }); stage = stageEl(); }
  const el = stage.querySelector(".efx-order");
  el.innerHTML = `<h2>INITIATIVE ORDER</h2>` + order.map((r, i) => `
    <div class="efx-row${r.pc ? " pc" : ""}" style="--i:${i}"><span class="rk">${i + 1}</span>
      <img src="${esc(r.img ?? "icons/svg/mystery-man.svg")}" alt="">
      <span class="nm">${esc(r.name)}</span><span class="tot">${Math.round(r.total)}</span></div>`).join("");
  stage.classList.add("ordered");
  stage._sparks?.burst(innerWidth / 2, innerHeight * 0.3, { n: 90, speed: 700, life: [.5, 1.3], size: [2, 5], gravity: 450, colors: stage._colors });
}
