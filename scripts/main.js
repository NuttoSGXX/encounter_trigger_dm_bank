/**
 * Encounter FX  –  Foundry VTT V14 / dnd5e
 * GM-only launcher -> pick scene, party and FX style -> cinematic intro -> tokens added to the
 * real Combat -> one 3D d20 per player (simultaneous) -> NPCs roll silently -> order announced
 * -> combat starts automatically.
 * Styles: "fire" (Default), "magic" (Magical), "dark" (Dark Fantasy).
 */
const ID = "encounter-fx";
const SOCKET = `module.${ID}`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    t: { switch: 3000, leave: 6300, end: 7700, dice: 6700 },
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
  magic: { name: "magical",      t: { switch: 2700, title: 2900, leave: 6400, end: 7600, dice: 6700 } },
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
/** What should play for this style: a video plate, a still plate, or null (procedural). */
async function assetFor(style) {
  const v = await mediaFor(style); if (v) return { type: "video", src: v.src, t: v.t };
  return (await plateFor(style)) ?? null;
}

/** Warm the browser cache so the first play does not stall. */
async function preloadMedia() {
  for (const style of Object.keys(MEDIA)) { const m = await mediaFor(style); if (m) fetch(m.src).then(r => r.blob()).catch(() => {}); const pl = await plateFor(style); if (pl) { const im = new Image(); im.src = pl.src; } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
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
  new EncounterLauncher().render({ force: true });
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
class EncounterLauncher extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "efx-launcher", tag: "form", classes: ["efx-launcher"],
    position: { width: 440, height: "auto" },
    window: { title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved", resizable: false, positioned: true },
    actions: { preview: EncounterLauncher.#onPreview },
    form: { handler: EncounterLauncher.#onSubmit, closeOnSubmit: true }
  };
  static PARTS = { form: { template: `modules/${ID}/templates/launcher.hbs` } };

  async _prepareContext() {
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

  _onRender(context, options) {
    super._onRender?.(context, options);
    decorateLauncher(this.element, this);
  }

  static #onPreview(event, target) {
    const style = this.element.querySelector('input[name="style"]:checked')?.value ?? "fire";
    assetFor(style).then(a => onMessage({ action: "intro", style, asset: a?.type ?? null, src: a?.src ?? null }));   // local only: no scene change, no combat
  }

  static async #onSubmit(event, form, formData) {
    if (!game.user.isGM) return;
    const d = formData.object;
    const actorIds = [...form.querySelectorAll('input[name="actor"]:checked')].map(i => i.value);
    const style = STYLES[d.style] ? d.style : "fire";
    await game.settings.set(ID, "style", style);
    launch({ sceneId: d.sceneId, actorIds, hostile: !!d.hostile, style });
  }
}


/** Drag the launcher by its header or any non-interactive area. Delegated once on the window element,
 *  so it survives re-renders; uses window-level listeners; falls back to direct left/top if setPosition fails. */
function enableDrag(el, app) {
  if (el._efxDrag) return; el._efxDrag = true;
  el.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    if (ev.target.closest("button, input, select, textarea, label, a, summary, option, [data-action], .window-controls")) return;
    ev.preventDefault(); ev.stopPropagation();                    // we own dragging (the native handler is bypassed)
    app?.bringToFront?.();
    const r = el.getBoundingClientRect(), start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top };
    const move = e => {
      const left = clamp(start.left + e.clientX - start.x, -r.width + 80, innerWidth - 80), top = clamp(start.top + e.clientY - start.y, 0, innerHeight - 40);
      try { app?.setPosition?.({ left, top }); } catch (err) { /* fall through */ }
      const now = el.getBoundingClientRect();
      if (Math.abs(now.left - left) > 2 || Math.abs(now.top - top) > 2) { el.style.left = `${left}px`; el.style.top = `${top}px`; }
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); el.classList.remove("efx-dragging"); };
    el.classList.add("efx-dragging");
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  }, { capture: true });
}

/** Visual decoration + drag. */
function decorateLauncher(el, app) {
  if (!el || el._efxDecorated) return;
  el._efxDecorated = true;
  enableDrag(el, app);
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
    this.c=canvas; this.ctx=canvas.getContext("2d");
    this.resize=()=>{canvas.width=innerWidth;canvas.height=innerHeight;this.w=canvas.width;this.h=canvas.height;};
    this.resize(); addEventListener("resize",this.resize);
    this.on=false; this.t0=0; this.last=0; this.orbs=[]; this.ribbons=[]; this.sparks=[]; this.burstAt=1.72; this.loop=this.loop.bind(this);
    const count=9;
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2+rand(-.16,.16);
      this.orbs.push({a, radius:rand(.28,.46), speed:rand(.12,.22)*(Math.random()<.5?-1:1), hue:MAGIC_HUES[i%MAGIC_HUES.length]+rand(-8,8), size:rand(18,31), phase:rand(0,6.28), depth:rand(.75,1.25)});
    }
    for(let i=0;i<12;i++) this.ribbons.push({side:i%4,offset:rand(-.42,.42),phase:rand(0,6.28),hue:MAGIC_HUES[i%MAGIC_HUES.length],width:rand(1.5,3.6),delay:rand(0,.7)});
  }
  start(){this.on=true;this.t0=this.last=performance.now();requestAnimationFrame(this.loop);}
  stop(){this.on=false;removeEventListener("resize",this.resize);}
  burst(x,y,n=150,speed=650){for(let i=0;i<n&&this.sparks.length<1200;i++){const a=rand(0,Math.PI*2),sp=speed*rand(.2,1),h=magicHue();this.sparks.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0,max:rand(.45,1.2),size:rand(1.5,4.5),h:h});}}
  orb(x,y,size,hue,alpha=1){const c=this.ctx;c.save();c.globalCompositeOperation="lighter";
    const glow=c.createRadialGradient(x,y,0,x,y,size*5);glow.addColorStop(0,`hsla(${hue},100%,98%,${.85*alpha})`);glow.addColorStop(.18,`hsla(${hue},100%,78%,${.58*alpha})`);glow.addColorStop(1,`hsla(${hue},100%,45%,0)`);c.fillStyle=glow;c.beginPath();c.arc(x,y,size*5,0,Math.PI*2);c.fill();
    const ball=c.createRadialGradient(x-size*.35,y-size*.4,size*.05,x,y,size);ball.addColorStop(0,`rgba(255,255,255,${alpha})`);ball.addColorStop(.18,`hsla(${hue},100%,92%,${alpha})`);ball.addColorStop(.55,`hsla(${hue},90%,58%,${.95*alpha})`);ball.addColorStop(.82,`hsla(${hue},90%,34%,${.85*alpha})`);ball.addColorStop(1,`hsla(${hue},100%,20%,0)`);c.fillStyle=ball;c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.fill();
    c.strokeStyle=`hsla(${hue},100%,92%,${.6*alpha})`;c.lineWidth=1.2;c.beginPath();c.arc(x,y,size*1.28,0,Math.PI*2);c.stroke();
    c.strokeStyle=`hsla(${(hue+45)%360},100%,88%,${.38*alpha})`;c.lineWidth=.8;c.beginPath();c.arc(x,y,size*1.7,-.8,1.9);c.stroke();c.restore();
  }
  ribbon(x1,y1,x2,y2,hue,a,lw){const c=this.ctx,dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const bend=Math.sin((performance.now()/900)+x1*.003)*len*.08;c.save();c.globalCompositeOperation="lighter";c.lineCap="round";const g=c.createLinearGradient(x1,y1,x2,y2);g.addColorStop(0,`hsla(${hue},100%,70%,0)`);g.addColorStop(.55,`hsla(${hue},100%,78%,${.48*a})`);g.addColorStop(1,`hsla(${hue},100%,98%,${a})`);c.strokeStyle=g;c.lineWidth=lw;c.shadowBlur=10;c.shadowColor=`hsla(${hue},100%,70%,${.45*a})`;c.beginPath();c.moveTo(x1,y1);c.quadraticCurveTo((x1+x2)/2+nx*bend,(y1+y2)/2+ny*bend,x2,y2);c.stroke();c.restore();}
  star(x,y,s,h,a){const c=this.ctx;c.save();c.globalCompositeOperation="lighter";c.fillStyle=`hsla(${h},100%,94%,${a})`;c.shadowBlur=12;c.shadowColor=`hsla(${h},100%,70%,${a})`;c.beginPath();for(let i=0;i<8;i++){const ang=i*Math.PI/4,r=i%2?s*.16:s;const px=x+Math.cos(ang)*r,py=y+Math.sin(ang)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();c.restore();}
  loop(now){if(!this.on)return;const dt=Math.min(.04,(now-this.last)/1000);this.last=now;const t=(now-this.t0)/1000,{width:w,height:h}=this.c,c=this.ctx,cx=w*.5,cy=h*.5;
    c.clearRect(0,0,w,h);
    const progress=ss(.15,2.4,t), coreScale=1+.18*Math.sin(t*4);
    // A restrained field: nine large luminous orbs orbit, then collapse into the center.
    for(const o of this.orbs){o.a+=o.speed*dt;const rr=Math.min(w,h)*o.radius*(1-.58*progress);const x=cx+Math.cos(o.a)*rr,y=cy+Math.sin(o.a)*rr*.68;const px=cx+Math.cos(o.a-.045)*rr,py=cy+Math.sin(o.a-.045)*rr*.68;this.ribbon(px,py,x,y,o.hue,.72,o.depth);this.orb(x,y,o.size*(1-.35*progress),o.hue,.92);if(Math.random()<.045)this.star(x+rand(-8,8),y+rand(-8,8),rand(3,7),o.hue,.8);}
    // Sixteen elegant filaments, not a noisy particle storm.
    if(t<2.25){for(const r of this.ribbons){if(t<r.delay)continue;const u=ss(r.delay,2.35,t),edge=Math.hypot(w,h)*.62*(1-u);let x=cx,y=cy;if(r.side===0){x=0+r.offset*w*.35;y=cy+r.offset*h+Math.sin(t+r.phase)*h*.04;}else if(r.side===1){x=w+r.offset*w*.35;y=cy+r.offset*h+Math.sin(t+r.phase)*h*.04;}else if(r.side===2){x=cx+r.offset*w;y=0+r.offset*h*.28;}else{x=cx+r.offset*w;y=h+r.offset*h*.28;}const ang=Math.atan2(cy-y,cx-x);const sx=x,sy=y,ex=cx+Math.cos(ang+Math.sin(t+r.phase)*.18)*edge,ey=cy+Math.sin(ang+Math.sin(t+r.phase)*.18)*edge;this.ribbon(sx,sy,ex,ey,r.hue,.7,r.width*(1+.5*(1-u)));}}
    // Central arcane core: layered spheres instead of flat rings.
    this.orb(cx,cy,24*coreScale,(t*35)%360,1);c.save();c.globalCompositeOperation="lighter";for(let i=0;i<3;i++){const r=58+i*28+Math.sin(t*1.8+i)*3;c.strokeStyle=`hsla(${(t*35+i*80)%360},100%,82%,${.18-i*.035})`;c.lineWidth=1;c.setLineDash([4+i*2,11+i*4]);c.beginPath();c.arc(cx,cy,r,t*(.25+i*.12),t*(.25+i*.12)+Math.PI*1.7);c.stroke();}c.restore();
    if(t>1.65){const k=clamp((t-1.65)/.65,0,1);for(let i=0;i<Math.floor(28*k);i++)this.star(cx+rand(-180,180)*k,cy+rand(-110,110)*k,rand(2,5),magicHue(),.9*(1-k*.35));}
    this.sparks=this.sparks.filter(p=>{p.life+=dt;if(p.life>=p.max)return false;p.vx*=.985;p.vy*=.985;p.x+=p.vx*dt;p.y+=p.vy*dt;this.star(p.x,p.y,p.size*(1-p.life/p.max),p.h,1-p.life/p.max);return true;});
    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ */
/*  Dark Fantasy depth FX: semi-real foliage, moon haze and blood     */
/* ------------------------------------------------------------------ */
class DarkFX {
  constructor(canvas){this.c=canvas;this.ctx=canvas.getContext("2d");this.resize=()=>{canvas.width=innerWidth;canvas.height=innerHeight;};this.resize();addEventListener("resize",this.resize);this.on=false;this.t0=0;this.last=0;this.parting=0;this.lunge=0;this.bloodRate=0;this.blood=[];this.mist=[];this.loop=this.loop.bind(this);for(let i=0;i<14;i++)this.mist.push({x:rand(0,1),y:rand(.5,1),r:rand(.08,.2),s:rand(.006,.018),a:rand(.04,.11)});}
  start(){this.on=true;this.t0=this.last=performance.now();requestAnimationFrame(this.loop);}
  stop(){this.on=false;removeEventListener("resize",this.resize);}
  setParting(v=1){this.parting=v;} setLunge(v=1){this.lunge=v;}
  bloodBurst(x,y,n=55){for(let i=0;i<n&&this.blood.length<650;i++){const a=rand(-Math.PI*.92,-Math.PI*.08),sp=rand(130,520);this.blood.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0,max:rand(.55,1.45),r:rand(1.5,4.5),g:rand(320,620)});}}
  branch(x,y,tx,ty,w,a){const c=this.ctx,dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;c.save();c.globalAlpha=a;c.lineCap="round";c.strokeStyle="#080b0d";c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+dx*.45+nx*len*.1,y+dy*.45+ny*len*.1,tx,ty);c.stroke();c.strokeStyle="rgba(125,138,142,.12)";c.lineWidth=Math.max(1,w*.11);c.stroke();c.restore();}
  loop(now){if(!this.on)return;const dt=Math.min(.04,(now-this.last)/1000);this.last=now;const t=(now-this.t0)/1000,{width:w,height:h}=this.c,c=this.ctx;c.clearRect(0,0,w,h);
    const moonX=w*.78,moonY=h*.16;const mg=c.createRadialGradient(moonX,moonY,0,moonX,moonY,Math.min(w,h)*.4);mg.addColorStop(0,"rgba(225,232,240,.14)");mg.addColorStop(.25,"rgba(190,205,220,.07)");mg.addColorStop(1,"rgba(120,140,160,0)");c.fillStyle=mg;c.fillRect(0,0,w,h);
    for(const m of this.mist){m.x+=m.s*dt;if(m.x>1.1)m.x=-.1;const x=m.x*w,y=m.y*h+Math.sin(t*.22+m.x*7)*14,r=m.r*Math.min(w,h);const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(190,198,205,${m.a})`);g.addColorStop(1,"rgba(190,198,205,0)");c.fillStyle=g;c.beginPath();c.ellipse(x,y,r*2,r*.32,0,0,Math.PI*2);c.fill();}
    // A small number of large foreground branches gives the eye-level depth seen in the reference.
    const open=this.parting*ss(.3,1.55,t);for(let i=0;i<8;i++){const side=i%2?-1:1,baseX=side<0?w*.04:w*.96,baseY=h*(.58+(i/8)*.38),tx=baseX+side*(w*(.11+.055*i))*(1-open*.98),ty=baseY-h*(.24+.045*i);this.branch(baseX,baseY,tx,ty,rand(9,18),.62);}
    if(this.bloodRate>0){for(let i=0;i<this.bloodRate*dt*12;i++)this.blood.push({x:w*.5+rand(-w*.08,w*.08),y:h*.55+rand(-h*.06,h*.06),vx:rand(-170,170),vy:rand(-50,170),life:0,max:rand(.7,1.6),r:rand(1,4),g:rand(300,580)});}
    this.blood=this.blood.filter(b=>{b.life+=dt;if(b.life>=b.max)return false;b.vy+=b.g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;const a=1-b.life/b.max;c.fillStyle=`rgba(130,7,10,${a*.72})`;c.beginPath();c.ellipse(b.x,b.y,b.r,b.r*(1+Math.abs(b.vy)/420),Math.atan2(b.vy,b.vx),0,Math.PI*2);c.fill();return true;});
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
  if (asset === "plate" && PLATES[style] && src) return playPlateIntro(style, src);
  closeAll();
  const el = document.createElement("div");
  el.className = `efx-intro st-${style}`;
  el.innerHTML = INTRO[style].html();
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);
  play(game.settings.get(ID, "sound"));
  void el.offsetWidth; el.classList.add("on");
  await INTRO[style].run(makeCtx(el, style));
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
    if (!await ctx.until(2600)) return;
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
    if (!await ctx.until(1700)) return;
    el.classList.add("impact");
    fx.burst(innerWidth / 2, innerHeight / 2, 220, 760);
    if (!await ctx.until(2200)) return;
    const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")];
    const mx = innerWidth / 2;
    chars.forEach((ch, i) => { const [x] = centerOf(ch); ch.style.setProperty("--dx", `${(mx - x).toFixed(0)}px`); ch.style.setProperty("--rot", `${rand(-70,70).toFixed(0)}deg`); ch.style.animationDelay = `${i * 45}ms`; ch.classList.add("on"); });
    fx.rects = [...el.querySelectorAll(".efx-band, .efx-title")].map(n => { const r=n.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
    fx.sparkRate = 3.6;
    if (!await ctx.until(3000)) return;
    el.classList.add("bands");
    if (!await ctx.until(3850)) return;
    title.classList.add("glow");
    await finishIntro(ctx, () => { fx.sparkRate=0; const [cx,cy]=centerOf(title); fx.burst(cx,cy,180,560); });
  }
};


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

function startDrips(title, ctx) {
  const chars = [...title.querySelectorAll(".ch")];
  const make = () => {
    const ch = chars[(Math.random() * chars.length) | 0], w = rand(5, 10);
    const d = document.createElement("i"); d.className = "efx-drip";
    d.style.cssText = `left:${(ch.offsetLeft + rand(.12, .88) * ch.offsetWidth).toFixed(0)}px;top:${(ch.offsetTop + ch.offsetHeight * .74).toFixed(0)}px;--w:${w.toFixed(1)}px;--len:${rand(60, 240).toFixed(0)}px;--dur:${rand(1.8, 3.8).toFixed(1)}s`;
    title.appendChild(d);
  };
  let n = 0;
  const iv = setInterval(() => {
    if (!ctx.alive() || n++ > 22) return clearInterval(iv);
    make(); if (Math.random() < .5) make();
  }, 160);
}

INTRO.dark = {
  html: () => `
    <div class="efx-dim"></div>
    <div class="efx-moon"></div>
    <div class="efx-fog f1"></div><div class="efx-fog f2"></div>
    <canvas class="efx-dark-depth"></canvas>
    <div class="efx-stage-dark">${EYES_SVG}</div>
    <div class="efx-foliage left">${foliageSVG("left")}</div>
    <div class="efx-foliage right">${foliageSVG("right")}</div>
    <div class="efx-vignette"></div>
    <div class="efx-shaker">${bannerHTML("dark")}</div>
    <canvas class="efx-sparks"></canvas><div class="efx-blackout"></div><div class="efx-redflash"></div>`,
  async run(ctx) {
    const {el}=ctx;
    const depth=own(new DarkFX(el.querySelector(".efx-dark-depth")),ctx);depth.start();
    const sparks=own(new Sparks(el.querySelector(".efx-sparks")),ctx);
    if(!await ctx.until(420))return;
    el.classList.add("parting");depth.setParting(1);
    if(!await ctx.until(1250))return;
    el.classList.add("eyes");
    if(!await ctx.until(2200))return;
    el.classList.add("lunge");depth.setLunge(1);
    if(!await ctx.until(2550))return;
    el.classList.add("black");
    if(!await ctx.until(2860))return;
    const W=innerWidth,H=innerHeight;depth.bloodBurst(W*.5,H*.55,70);
    sparks.burst(W*.5,H*.55,{n:85,speed:650,life:[.5,1.25],size:[1.5,4],gravity:720,colors:["95,0,0","170,8,10","55,0,0"],add:false});
    if(!await ctx.until(3220))return;
    el.classList.remove("black");el.classList.add("bands","impact");
    const title=el.querySelector(".efx-title");title.classList.add("slam");title.querySelectorAll(".ch").forEach(c=>c.classList.add("on"));
    const [cx,cy]=centerOf(title);sparks.burst(cx,cy,{n:105,speed:520,life:[.45,1.25],size:[1.5,4.5],gravity:820,colors:["120,0,0","180,12,14","65,0,0"],add:false});
    startDrips(title,ctx);depth.bloodRate=5;
    await finishIntro(ctx,()=>{depth.bloodRate=0;});
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
