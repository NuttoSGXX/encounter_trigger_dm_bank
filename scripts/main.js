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
    window: { title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved", resizable: false },
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
    onMessage({ action: "intro", style });   // local only: no scene change, no combat
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

/** Parallax, floating motes, tilt cards and scene search for the launcher UI. */
function decorateLauncher(el, app) {
  if (!el || el._efxDecorated) return;
  el._efxDecorated = true;
  // Foundry V14 ApplicationV2 already exposes a draggable frame. Re-bind the compact header
  // to the same position API so the entire occult launcher can be picked up from its title area.
  const dragHandle = el.querySelector(".efx-compact-head");
  if (dragHandle && app?.setPosition) {
    dragHandle.title = "Drag to move Encounter FX";
    dragHandle.style.cursor = "grab";
    dragHandle.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || ev.target.closest("button,input,select,label,a")) return;
      ev.preventDefault(); app.bringToFront?.(); dragHandle.setPointerCapture?.(ev.pointerId);
      const start = { x: ev.clientX, y: ev.clientY, left: app.position.left ?? 0, top: app.position.top ?? 0 };
      dragHandle.style.cursor = "grabbing";
      const move = e => app.setPosition({ left: start.left + e.clientX - start.x, top: start.top + e.clientY - start.y });
      const up = e => { dragHandle.style.cursor = "grab"; try { dragHandle.releasePointerCapture?.(e.pointerId); } catch (_) {} dragHandle.removeEventListener("pointermove", move); dragHandle.removeEventListener("pointerup", up); dragHandle.removeEventListener("pointercancel", up); };
      dragHandle.addEventListener("pointermove", move); dragHandle.addEventListener("pointerup", up); dragHandle.addEventListener("pointercancel", up);
    });
  }
  const motes = el.querySelector(".bg-motes");
  if (motes) {
    for (let i = 0; i < 28; i++) {
      const m = document.createElement("i");
      m.style.cssText = `left:${rand(0, 100).toFixed(1)}%;--s:${rand(2, 5).toFixed(1)}px;--d:${rand(7, 16).toFixed(1)}s;--dl:-${rand(0, 16).toFixed(1)}s;--dx:${rand(-30, 30).toFixed(0)}px`;
      motes.appendChild(m);
    }
  }
  el.addEventListener("pointermove", ev => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((ev.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty("--my", ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
    const card = ev.target.closest?.(".efx-card");
    if (card) {
      const cr = card.getBoundingClientRect();
      card.style.setProperty("--tx", ((ev.clientX - cr.left) / cr.width - 0.5).toFixed(3));
      card.style.setProperty("--ty", ((ev.clientY - cr.top) / cr.height - 0.5).toFixed(3));
    }
  });
  el.addEventListener("pointerout", ev => {
    const card = ev.target.closest?.(".efx-card");
    if (card) { card.style.setProperty("--tx", 0); card.style.setProperty("--ty", 0); }
  });
  const search = el.querySelector(".efx-search");
  search?.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    el.querySelectorAll(".efx-scene").forEach(s => { s.hidden = q && !s.dataset.name.includes(q); });
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
  const T = STYLES[style].t, t0 = Date.now();
  GM.pcs = new Map(); GM.rolled = new Set(); GM.finishing = false; GM.combatId = null; GM.style = style;

  broadcast({ action: "intro", style });
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
    this.resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; this.w = canvas.width; this.h = canvas.height; };
    this.resize(); addEventListener("resize", this.resize);
    this.streams = []; this.stars = []; this.orbs = []; this.rings = []; this.rects = [];
    this.sparkRate = 0; this.on = false; this.t0 = 0; this.last = 0; this.loop = this.loop.bind(this);
    const count = 11;
    for (let i = 0; i < count; i++) this.orbs.push({
      a: rand(0, Math.PI * 2), r: rand(.25, .72), speed: rand(.16, .42) * (Math.random() < .5 ? -1 : 1),
      hue: magicHue(), size: rand(6, 15), phase: rand(0, 6.28), tilt: rand(.55, .9), life: rand(.3, 1)
    });
  }
  start() { this.on = true; this.t0 = this.last = performance.now(); requestAnimationFrame(this.loop); }
  stop() { this.on = false; removeEventListener("resize", this.resize); }
  burst(x, y, n = 120, speed = 620) {
    for (let i = 0; i < n && this.stars.length < 1800; i++) {
      const a = rand(0, Math.PI * 2), s = speed * rand(.18, 1.05);
      this.stars.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: rand(.91, .975), life: 0, max: rand(.65, 1.7), size: rand(2, 8), hue: magicHue(), rot: rand(0, 6.28), spin: rand(-5, 5) });
    }
  }
  orb(x, y, size, hue, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
    g.addColorStop(0, `hsla(${hue},100%,96%,${.95 * alpha})`);
    g.addColorStop(.08, `hsla(${hue},100%,86%,${.9 * alpha})`);
    g.addColorStop(.26, `hsla(${hue},100%,66%,${.55 * alpha})`);
    g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size * 5, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(x - size*.25, y - size*.25, 0, x, y, size);
    core.addColorStop(0, `rgba(255,255,255,${alpha})`);
    core.addColorStop(.25, `hsla(${hue},100%,92%,${alpha})`);
    core.addColorStop(.7, `hsla(${hue},100%,55%,${.85*alpha})`);
    core.addColorStop(1, `hsla(${hue},100%,35%,0)`);
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `hsla(${hue},100%,88%,${.7*alpha})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, size * 1.7, 0, Math.PI * 2); ctx.stroke();
  }
  filament(x1,y1,x2,y2,hue,alpha=1,lw=1.5) {
    const ctx=this.ctx, dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1, nx=-dy/len, ny=dx/len;
    ctx.globalCompositeOperation="lighter"; ctx.lineCap="round";
    const grad=ctx.createLinearGradient(x1,y1,x2,y2);
    grad.addColorStop(0,`hsla(${hue},100%,75%,0)`); grad.addColorStop(.35,`hsla(${hue},100%,78%,${.38*alpha})`); grad.addColorStop(1,`hsla(${hue},100%,96%,${alpha})`);
    ctx.strokeStyle=grad; ctx.lineWidth=lw;
    ctx.beginPath(); ctx.moveTo(x1,y1);
    const bend=(Math.sin((x1+x2)*.008+(y1+y2)*.004)*.08)*len;
    ctx.quadraticCurveTo((x1+x2)/2+nx*bend,(y1+y2)/2+ny*bend,x2,y2); ctx.stroke();
  }
  star(x, y, s, rot, hue, alpha=1) {
    const ctx=this.ctx; ctx.globalCompositeOperation="lighter";
    const g=ctx.createRadialGradient(x,y,0,x,y,s*2.6); g.addColorStop(0,`hsla(${hue},100%,90%,${.35*alpha})`); g.addColorStop(1,`hsla(${hue},100%,70%,0)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,s*2.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`hsla(${hue},100%,94%,${alpha})`; ctx.beginPath();
    for(let i=0;i<8;i++){const a=rot+i*Math.PI/4,r=i%2?s*.18:s;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);} ctx.closePath();ctx.fill();
  }
  loop(now) {
    if (!this.on) return;
    const dt=Math.min(.04,(now-this.last)/1000); this.last=now; const t=(now-this.t0)/1000;
    const {width:w,height:h}=this.c,ctx=this.ctx,cx=w/2,cy=h/2;
    ctx.globalCompositeOperation="source-over"; ctx.fillStyle="rgba(4,2,12,.19)"; ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation="lighter";
    // Deep arcane orbit: colored orbs physically travel inward instead of flat gradient rings.
    for(const o of this.orbs){
      o.a += o.speed*dt; const rr=Math.min(w,h)*o.r*(1-.34*ss(0,2.8,t));
      const x=cx+Math.cos(o.a)*rr, y=cy+Math.sin(o.a)*rr*o.tilt;
      const tx=cx+Math.cos(o.a-.055)*rr, ty=cy+Math.sin(o.a-.055)*rr*o.tilt;
      this.filament(tx,ty,x,y,o.hue,.8,1.3);
      this.orb(x,y,o.size*(.85+.15*Math.sin(t*3+o.phase)),o.hue,.9);
      if(Math.random()<.08) this.star(x+rand(-10,10),y+rand(-10,10),rand(2,5),rand(0,6.28),o.hue,.8);
    }
    // Converging ribbon filaments from the screen edge.
    if(t<2.45){
      const n=Math.round(15*dt*60);
      for(let i=0;i<n;i++) this.streams.push({a:rand(0,Math.PI*2),R:Math.hypot(w,h)*rand(.48,.78),turns:rand(.35,.95),t:0,dur:rand(.95,1.65),hue:magicHue(),lw:rand(1.1,3.4),px:null,py:null});
    }
    this.streams=this.streams.filter(s=>{s.t+=dt;const u=Math.min(1,s.t/s.dur),e=ss(0,1,u),r=s.R*(1-e),ang=s.a+s.turns*Math.PI*2*e,x=cx+Math.cos(ang)*r,y=cy+Math.sin(ang)*r*.74;
      if(s.px!==null){this.filament(s.px,s.py,x,y,s.hue,.7+.3*e,s.lw*(1.25-.35*e));}
      s.px=x;s.py=y;
      if(u>=1 && Math.random()<.8)this.orb(x,y,rand(3,8),s.hue,1); return u<1;});
    // Central magical core and concentric rune-like energy rings.
    const pulse=1+.16*Math.sin(t*4.2), coreHue=(t*48)%360;
    this.orb(cx,cy,22*pulse,coreHue,1);
    for(let i=0;i<4;i++){const r=(52+i*38)*(1+Math.sin(t*1.7+i)*.035),a=(t*(.32+i*.09)+i*.8);ctx.save();ctx.translate(cx,cy);ctx.rotate(a);ctx.strokeStyle=`hsla(${(coreHue+i*55)%360},100%,82%,${.28-.045*i})`;ctx.lineWidth=1.2;ctx.setLineDash([3+i*2,9+i*3]);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(this.sparkRate>0&&this.rects.length){for(let k=this.sparkRate*dt*60;k>0;k--){if(Math.random()>Math.min(1,k))continue;const r=this.rects[(Math.random()*this.rects.length)|0];this.stars.push({x:rand(r.x,r.x+r.w),y:rand(r.y,r.y+r.h),vx:rand(-12,12),vy:rand(-18,18),drag:.985,life:0,max:rand(.5,1.4),size:rand(2,7),hue:magicHue(),rot:rand(0,6.28),spin:rand(-2,2)});}}
    this.stars=this.stars.filter(s=>{s.life+=dt;if(s.life>=s.max)return false;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=s.drag;s.vy*=s.drag;s.rot+=s.spin*dt;this.star(s.x,s.y,s.size*Math.sin(Math.PI*s.life/s.max),s.rot,s.hue,1-s.life/s.max);return true;});
    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ */
/*  Dark Fantasy depth FX: semi-real foliage, moon haze and blood     */
/* ------------------------------------------------------------------ */
class DarkFX {
  constructor(canvas) {
    this.c=canvas; this.ctx=canvas.getContext("2d"); this.resize=()=>{canvas.width=innerWidth;canvas.height=innerHeight;};
    this.resize(); addEventListener("resize",this.resize); this.on=false; this.t0=0; this.last=0; this.parting=0; this.lunge=0; this.bloodRate=0; this.blood=[]; this.mist=[]; this.loop=this.loop.bind(this);
    for(let i=0;i<26;i++)this.mist.push({x:rand(0,1),y:rand(.35,1),r:rand(.08,.24),s:rand(.008,.025),a:rand(.05,.16)});
  }
  start(){this.on=true;this.t0=this.last=performance.now();requestAnimationFrame(this.loop);}
  stop(){this.on=false;removeEventListener("resize",this.resize);}
  setParting(v=1){this.parting=v;}
  setLunge(v=1){this.lunge=v;}
  bloodBurst(x,y,n=70){for(let i=0;i<n&&this.blood.length<900;i++){const a=rand(-Math.PI*.95,-Math.PI*.05),s=rand(160,760);this.blood.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0,max:rand(.45,1.35),r:rand(1.5,6),g:rand(420,760)});}}
  branch(x,y,tx,ty,w,a){const ctx=this.ctx,dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle="#0d1114";ctx.lineCap="round";ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+dx*.45+nx*len*.12,y+dy*.45+ny*len*.12,tx,ty);ctx.stroke();ctx.strokeStyle="rgba(103,115,118,.16)";ctx.lineWidth=Math.max(1,w*.12);ctx.stroke();ctx.restore();}
  loop(now){if(!this.on)return;const dt=Math.min(.04,(now-this.last)/1000);this.last=now;const t=(now-this.t0)/1000,{width:w,height:h}=this.c,ctx=this.ctx;
    ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation="source-over";
    const moonX=w*.76,moonY=h*.17;
    const mg=ctx.createRadialGradient(moonX,moonY,0,moonX,moonY,Math.min(w,h)*.34);mg.addColorStop(0,"rgba(210,222,235,.10)");mg.addColorStop(1,"rgba(150,165,185,0)");ctx.fillStyle=mg;ctx.fillRect(0,0,w,h);
    for(const m of this.mist){m.x+=m.s*dt;if(m.x>1.15)m.x=-.15;const x=m.x*w,y=m.y*h+Math.sin(t*.25+m.x*8)*18,r=m.r*Math.min(w,h);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(180,190,198,${m.a})`);g.addColorStop(1,"rgba(180,190,198,0)");ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r*1.8,r*.38,0,0,Math.PI*2);ctx.fill();}
    // Foreground branches retract to expose the reveal.
    const open=this.parting* Math.min(1,Math.max(0,(t-.42)/1.25));
    for(let i=0;i<14;i++){const side=i%2?1:-1,baseX=side<0?w*.02:w*.98,baseY=h*(.55+(i/14)*.5),tx=baseX+side*(w*(.18+.065*i))*(1-open*.98),ty=baseY-h*(.32+.02*i);this.branch(baseX,baseY,tx,ty,rand(5,15),.48);}
    // Blood droplets only after the lunge, giving the reveal a physical impact.
    if(this.bloodRate>0){for(let i=0;i<this.bloodRate*dt*70;i++){this.blood.push({x:w*.5+rand(-w*.12,w*.12),y:h*.55+rand(-h*.08,h*.08),vx:rand(-260,260),vy:rand(-80,260),life:0,max:rand(.8,1.8),r:rand(1.2,5),g:rand(300,650)});}}
    this.blood=this.blood.filter(b=>{b.life+=dt;if(b.life>=b.max)return false;b.vy+=b.g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;const a=1-b.life/b.max;ctx.fillStyle=`rgba(150,8,12,${a*.8})`;ctx.beginPath();ctx.ellipse(b.x,b.y,b.r,b.r*(1+Math.abs(b.vy)/420),Math.atan2(b.vy,b.vx),0,Math.PI*2);ctx.fill();return true;});
    // Vignette depth.
    const vg=ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.18,w*.5,h*.48,Math.max(w,h)*.72);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(.65,"rgba(0,0,0,.15)");vg.addColorStop(1,"rgba(0,0,0,.62)");ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);
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

async function playIntro({ style = "fire" } = {}) {
  if (!STYLES[style]) style = "fire";
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

function clawShape(p, wmax) {
  const [p0, p1, p2, p3] = p, N = 28, L = [], R = [];
  const bez = t => { const u = 1 - t; return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); };
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = bez(Math.max(0, t - .01)), b = bez(Math.min(1, t + .01)), c = bez(t);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const w = wmax * Math.pow(Math.sin(Math.PI * t), 0.65) * (1 - .3 * t);
    L.push(`${(c[0] + nx * w).toFixed(1)},${(c[1] + ny * w).toFixed(1)}`); R.push(`${(c[0] - nx * w).toFixed(1)},${(c[1] - ny * w).toFixed(1)}`);
  }
  return `M${L.join("L")}L${R.reverse().join("L")}Z`;
}
const CLAW_CURVES = [
  { c: [[170, 30], [340, 170], [560, 330], [860, 590]], w: 17 },
  { c: [[290, 10], [470, 150], [690, 300], [970, 520]], w: 13 },
  { c: [[60, 110], [220, 240], [420, 390], [700, 600]], w: 10 }
];
const CLAWS_SVG = `
<svg class="efx-claws" viewBox="0 0 1000 600" preserveAspectRatio="none">
  <defs>
    <linearGradient id="efxClawG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6ea"/><stop offset=".55" stop-color="#e9ddcc"/><stop offset="1" stop-color="#a01010"/></linearGradient>
    ${CLAW_CURVES.map((k, i) => `<mask id="efxCm${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><path class="mk c${i}" d="M${k.c[0]} C${k.c[1]} ${k.c[2]} ${k.c[3]}" fill="none" stroke="#fff" stroke-width="160"/></mask>`).join("")}
  </defs>
  ${CLAW_CURVES.map((k, i) => `<g mask="url(#efxCm${i})"><path d="${clawShape(k.c, k.w * 1.5)}" fill="#8a0000" opacity=".75" style="filter:blur(5px)"/><path d="${clawShape(k.c, k.w)}" fill="url(#efxClawG)"/></g>`).join("")}
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
    <canvas class="efx-sparks"></canvas>
    <div class="efx-blackout"></div>${CLAWS_SVG}<div class="efx-redflash"></div>`,
  async run(ctx) {
    const { el }=ctx;
    const depth=own(new DarkFX(el.querySelector(".efx-dark-depth")),ctx); depth.start();
    const sparks=own(new Sparks(el.querySelector(".efx-sparks")),ctx);
    if(!await ctx.until(380))return;
    el.classList.add("parting"); depth.setParting(1);
    if(!await ctx.until(1420))return;
    el.classList.add("eyes");
    if(!await ctx.until(2460))return;
    el.classList.add("lunge"); depth.setLunge(1);
    if(!await ctx.until(2820))return;
    el.classList.add("black");
    if(!await ctx.until(3040))return;
    el.classList.add("claws"); depth.bloodRate=8;
    const W=innerWidth,H=innerHeight;
    sparks.burst(W*.5,H*.5,{n:120,speed:980,life:[.5,1.4],size:[2,7],gravity:980,colors:["120,0,0","195,10,12","70,0,0"],add:false});
    depth.bloodBurst(W*.5,H*.52,95);
    if(!await ctx.until(3360))return;
    el.classList.remove("black"); el.classList.add("bands","impact");
    const title=el.querySelector(".efx-title"); title.classList.add("slam"); title.querySelectorAll(".ch").forEach(c=>c.classList.add("on"));
    const [cx,cy]=centerOf(title);
    sparks.burst(cx,cy,{n:170,speed:780,life:[.6,1.5],size:[2,7],gravity:1050,colors:["100,0,0","175,8,10","55,0,0"],add:false});
    sparks.burst(cx,cy,{n:55,speed:360,life:[.5,1.1],size:[1.5,3],gravity:40,colors:["220,225,235"]});
    depth.bloodRate=14; startDrips(title,ctx);
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
