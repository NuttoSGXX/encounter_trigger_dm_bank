/**
 * Encounter FX  –  Foundry VTT V14 / dnd5e
 * GM button -> pick scene -> CG fire spreads over the screen -> ENCOUNTER typed + slammed
 * -> tokens added to the real Combat -> one 3D d20 per player (everyone rolls at the same time)
 * -> NPCs roll silently -> initiative order announced -> combat starts automatically.
 */
const ID = "encounter-fx";
const SOCKET = `module.${ID}`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------ */
/*  Back-end config (แก้ตรงนี้ได้ถ้าอยากเปลี่ยนข้อความ/จังหวะ)            */
/* ------------------------------------------------------------------ */
const PHRASES = [
  "Imminent Danger", "Watch Out!", "Get Ready To Fight", "Draw Your Weapons",
  "Enemies Approach", "Steel Yourself", "No Turning Back", "Blood Will Be Spilled"
];
const TITLE = "ENCOUNTER";
const SHOW_NPC_IN_ORDER = true;   // false = สรุปลำดับเฉพาะผู้เล่น

// Intro timeline (ms)
const T_TYPE = 1300;     // เริ่มพิมพ์ตัวอักษร
const T_TYPE_STEP = 70;  // ความเร็วพิมพ์ต่อตัว
const T_SWITCH = 2100;   // GM ย้ายซีน (ไฟปกคลุมจอเต็มแล้ว)
const T_LEAVE = 5300;    // ไฟมอดลง + แบนเนอร์จาง
const T_END = 6800;      // ลบ intro
const T_DICE = 5600;     // เต๋าขึ้นจอ

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
    hint: "ไฟล์เสียงที่เล่นตอนเริ่ม Encounter (ปล่อยว่างถ้าไม่ใช้)",
    scope: "world", config: true, type: String, default: "", filePicker: "audio"
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, onMessage);
  game.modules.get(ID).api = { open: () => new EncounterLauncher().render({ force: true }), launch };
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tools = controls.tokens?.tools ?? controls.token?.tools;
  if (!tools) return;
  tools[ID] = {
    name: ID, title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved",
    order: Object.keys(tools).length + 1, button: true, visible: game.user.isGM,
    onChange: () => new EncounterLauncher().render({ force: true })
  };
});

/* ------------------------------------------------------------------ */
/*  Launcher dialog (GM)                                               */
/* ------------------------------------------------------------------ */
class EncounterLauncher extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "efx-launcher", tag: "form", classes: ["efx-launcher"],
    position: { width: 500, height: "auto" },
    window: { title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved", resizable: true },
    form: { handler: EncounterLauncher.#onSubmit, closeOnSubmit: true }
  };
  static PARTS = { form: { template: `modules/${ID}/templates/launcher.hbs` } };

  async _prepareContext() {
    const scenes = game.scenes.contents
      .map(s => ({ id: s.id, name: s.name, active: s.active }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const actors = game.actors.contents
      .filter(a => a.type === "character" && a.hasPlayerOwner)
      .map(a => ({
        id: a.id, name: a.name, img: a.img,
        checked: game.users.some(u => u.active && !u.isGM && a.testUserPermission(u, "OWNER"))
      }));
    return { scenes, actors };
  }

  static async #onSubmit(event, form, formData) {
    const actorIds = [...form.querySelectorAll('input[name="actor"]:checked')].map(i => i.value);
    launch({ sceneId: formData.object.sceneId, actorIds, hostile: !!formData.object.hostile });
  }
}

/* ------------------------------------------------------------------ */
/*  GM orchestration                                                   */
/* ------------------------------------------------------------------ */
const GM = { combatId: null, pcs: new Map(), rolled: new Set(), finishing: false };

function broadcast(msg) { game.socket.emit(SOCKET, msg); onMessage(msg); }
const ownersOf = c => game.users.filter(u => !u.isGM && c.actor?.testUserPermission(u, "OWNER"));

async function launch({ sceneId, actorIds = [], hostile = true }) {
  if (!game.user.isGM) return;
  const scene = game.scenes.get(sceneId);
  if (!scene) return ui.notifications.error("Encounter FX: ไม่พบซีน");
  const t0 = Date.now();
  GM.pcs = new Map(); GM.rolled = new Set(); GM.finishing = false; GM.combatId = null;

  broadcast({ action: "intro" });
  await sleep(T_SWITCH);

  // 1) ย้ายทุกคนไปซีนปลายทางตอนไฟปกคลุมจอ
  const needActivate = !scene.active;
  const needView = game.scenes.viewed?.id !== scene.id;
  if (needActivate || needView) {
    const ready = new Promise(r => { Hooks.once("canvasReady", r); setTimeout(r, 6000); });
    if (needActivate) await scene.activate(); else await scene.view();
    await ready;
  }

  // 2) Combat จริงของระบบ: หาหรือสร้าง แล้วเพิ่ม token
  let combat;
  try {
    combat = await ensureCombat(scene, actorIds, hostile);
    GM.combatId = combat.id;

    // 3) NPC (และตัวที่ซ่อน) ทอยเงียบๆ หลังบ้าน / ผู้เล่นรอทอยเอง
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
    ui.notifications.error("Encounter FX: สร้าง Combat ไม่สำเร็จ (ดู Console)");
    return broadcast({ action: "close" });
  }

  await sleep(Math.max(0, T_DICE - (Date.now() - t0)));
  if (!GM.pcs.size) { GM.finishing = true; return finishOrder(0); }
  broadcast({ action: "dice", dice: [...GM.pcs.values()] });
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
  if (missing.length) ui.notifications.warn(`ไม่มีโทเค็นในซีนนี้สำหรับ: ${missing.join(", ")}`);
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
  broadcast({ action: "order", order });
  await sleep(1400 + order.length * 180 + 3200);
  try { await combat.startCombat(); ui.combat?.activate?.(); } catch (e) { console.warn(`${ID} |`, e); }
  broadcast({ action: "close" });
}

/* ------------------------------------------------------------------ */
/*  Socket / client                                                    */
/* ------------------------------------------------------------------ */
function onMessage(msg) {
  switch (msg.action) {
    case "intro": return playIntro();
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
const live = { fire: null, sparks: null, dsparks: null, run: 0 };
function closeAll() {
  live.run++;
  live.fire?.stop(); live.fire = null;
  live.sparks?.stop(); live.sparks = null;
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
const play = src => { try { foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, false); } catch (e) { /* ignore */ } };

/* ------------------------------------------------------------------ */
/*  Sparks / embers (2D canvas)                                        */
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
      gravity = 500, angle = 0, spread = Math.PI * 2 } = o;
    for (let i = 0; i < n && this.p.length < 1500; i++) {
      const a = angle + (Math.random() - 0.5) * spread, s = speed * rand(0.25, 1);
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: gravity, life: 0, max: rand(...life),
        size: rand(...size), col: colors[(Math.random() * colors.length) | 0] });
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
    ctx.globalCompositeOperation = "lighter";
    this.p = this.p.filter(p => {
      p.life += dt; if (p.life >= p.max) return false;
      p.vy += p.g * dt; p.x += (p.vx + Math.sin(p.life * 7 + p.y * .01) * 14) * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max, r = p.size * (0.5 + a * 0.7);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, 6.283); ctx.fill();
      return true;
    });
    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ */
/*  CG fire (WebGL fbm shader) + 2D fallback                           */
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
    const prog = this.prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FIRE_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = n => gl.getUniformLocation(prog, n);
    this.uRes = this.u("uRes"); this.uT = this.u("uT"); this.uHi = this.u("uHi"); this.uLo = this.u("uLo");
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

class FireFallback {   // ใช้เมื่อ WebGL ใช้ไม่ได้
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
/*  Intro                                                              */
/* ------------------------------------------------------------------ */
function trackHTML(reverse) {
  const list = reverse ? [...PHRASES].reverse() : [...PHRASES];
  const reps = Math.max(4, Math.ceil(24 / list.length));
  const half = Array.from({ length: reps }, () => list.map(p => `<span>${esc(p)}</span><i>◆</i>`).join("")).join("");
  return half + half;
}

async function playIntro() {
  closeAll();
  const run = live.run, alive = () => live.run === run;
  const el = document.createElement("div");
  el.className = "efx-intro";
  el.innerHTML = `
    <div class="efx-dim"></div>
    <div class="efx-shaker">
      <canvas class="efx-fire"></canvas>
      <canvas class="efx-sparks"></canvas>
      <div class="efx-banner">
        <div class="efx-band efx-band-top"><div class="efx-track">${trackHTML(false)}</div></div>
        <div class="efx-title">${[...TITLE].map(ch => `<span class="ch">${esc(ch)}</span>`).join("")}</div>
        <div class="efx-band efx-band-bot"><div class="efx-track">${trackHTML(true)}</div></div>
      </div>
      <div class="efx-ring"></div>
    </div>
    <div class="efx-flash"></div>`;
  root().appendChild(el);
  for (const tr of el.querySelectorAll(".efx-track")) tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 160)}s`);

  const fire = live.fire = makeFire(el.querySelector(".efx-fire")); fire.start();
  const sparks = live.sparks = new Sparks(el.querySelector(".efx-sparks")); sparks.rain = 1.6;
  void el.offsetWidth; el.classList.add("on");
  const src = game.settings.get(ID, "sound"); if (src) play(src);

  // typewriter: พิมพ์ทีละตัวแบบเร็ว
  await sleep(T_TYPE); if (!alive()) return;
  const title = el.querySelector(".efx-title"), chars = [...title.querySelectorAll(".ch")];
  for (const ch of chars) {
    ch.classList.add("on");
    const r = ch.getBoundingClientRect();
    sparks.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 7, speed: 260, life: [.25, .6], size: [1.5, 3], gravity: 300 });
    await sleep(T_TYPE_STEP); if (!alive()) return;
  }

  // slam: พุ่งกระแทกลงจอ
  await sleep(90); if (!alive()) return;
  title.classList.add("slam");
  await sleep(230); if (!alive()) return;
  el.classList.add("impact");
  const tr = title.getBoundingClientRect(), cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
  sparks.burst(cx, cy, { n: 180, speed: 900, life: [.5, 1.4], size: [2, 6], gravity: 700 });
  sparks.burst(cx, cy, { n: 60, speed: 500, life: [.4, 1], size: [3, 7], gravity: 200, colors: ["255,255,230", "255,200,90"] });
  setTimeout(() => title.classList.add("glow"), 450);

  await sleep(T_LEAVE - (T_TYPE + chars.length * T_TYPE_STEP + 320)); if (!alive()) return;
  el.classList.add("leave"); fire.exit(); sparks.rain = 0;
  await sleep(T_END - T_LEAVE); if (!alive()) return;
  fire.stop(); sparks.stop(); el.remove();
  if (live.fire === fire) live.fire = null;
  if (live.sparks === sparks) live.sparks = null;
}

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

function buildDie(die, L) {
  const s = L / 2, H = L * Math.sqrt(3) / 2, light = norm([-0.4, -0.7, 1]), front = [];
  FACES.forEach((f, i) => {
    const [A, B, C] = f.map(k => VERTS[k].map(v => v * s));
    const cen = [0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3);
    let ex = norm(sub(C, B));
    const M = [0, 1, 2].map(k => (B[k] + C[k]) / 2), ey = norm(sub(M, A));
    let n = cross(ex, ey);
    if (dot(n, cen) < 0) { ex = ex.map(v => -v); n = n.map(v => -v); }
    const P = [0, 1, 2].map(k => cen[k] - ex[k] * (L / 2) - ey[k] * (2 * H / 3));
    const el = document.createElement("div"); el.className = "efx-face";
    const lit = Math.max(0, dot(n, light));
    el.style.cssText = `width:${L}px;height:${H}px;--fs:${Math.round(L * 0.29)}px;` +
      `background:linear-gradient(160deg,hsl(5 78% ${26 + lit * 24}%),hsl(0 72% ${10 + lit * 12}%));` +
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

function showDice({ dice }) {
  stageEl()?.remove(); live.dsparks?.stop();
  const n = dice.length;
  const L = n <= 3 ? 100 : n <= 5 ? 84 : n <= 7 ? 68 : 54;
  const S = Math.round(L * 3);
  const isGM = game.user.isGM;
  const stage = document.createElement("div");
  stage.className = "efx-dice-stage";
  stage.innerHTML = `
    <div class="efx-backdrop"></div>
    <canvas class="efx-sparks"></canvas>
    <div class="efx-headline">ROLL INITIATIVE</div>
    <div class="efx-dice-row"></div>
    <div class="efx-order"></div>
    ${isGM ? `<button type="button" class="efx-gm-roll">ทอยให้ทุกคนที่เหลือ</button>` : ""}`;
  root().appendChild(stage);
  const sparks = live.dsparks = new Sparks(stage.querySelector(".efx-sparks"));
  stage._sparks = sparks; stage._slots = new Map(); stage._L = L;

  const row = stage.querySelector(".efx-dice-row");
  for (const d of dice) {
    const mine = isGM || d.owners.includes(game.user.id);
    const slot = document.createElement("div");
    slot.className = `efx-slot${mine ? " mine" : ""}`;
    slot.style.width = `${S * 1.05}px`;
    slot.innerHTML = `
      <div class="efx-aura"></div>
      <div class="efx-scene3d" style="width:${S}px;height:${S}px;perspective:${L * 9}px">
        <div class="efx-bounce"><div class="efx-die idle ${mine ? "gm" : ""}" style="animation-delay:-${rand(0, 9).toFixed(2)}s"></div></div>
      </div>
      <div class="efx-res">${mine ? '<span class="hint">คลิกที่ลูกเต๋า</span>' : '<span class="hint dim">รอทอย...</span>'}</div>
      <div class="efx-name">${esc(d.name)}</div>
      <div class="efx-player">${esc(d.player)}</div>`;
    row.appendChild(slot);
    const die = slot.querySelector(".efx-die");
    const front = buildDie(die, L);
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
  const { el, die, bounce, scene, front } = info, sparks = stage._sparks, k = stage._L / 100;
  el.classList.remove("charging"); el.classList.add("rolling");
  die.classList.remove("idle");
  const hint = el.querySelector(".efx-res"); hint.innerHTML = "";
  const rect = () => { const r = scene.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  try { play(CONFIG.sounds?.dice); } catch (e) { /* ignore */ }

  // trail ระหว่างกลิ้ง
  const trail = setInterval(() => {
    const [x, y] = rect();
    sparks.burst(x, y, { n: 4, speed: 180, life: [.3, .7], size: [1.5, 3.5], gravity: -80, colors: ["255,190,70", "255,90,20"] });
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

  // impact FX
  const [cx, cy] = rect(), mod = Math.round(total) - nat;
  el.classList.remove("rolling"); el.classList.add("landed");
  const ring = document.createElement("div"); ring.className = "efx-ring"; scene.appendChild(ring); setTimeout(() => ring.remove(), 900);
  sparks.burst(cx, cy, { n: 36, speed: 520, life: [.4, 1], size: [2, 4.5], gravity: 600 });
  if (nat === 20) {
    el.classList.add("crit");
    sparks.burst(cx, cy, { n: 160, speed: 900, life: [.6, 1.6], size: [2, 6], gravity: 500, colors: ["255,230,120", "255,190,40", "255,255,230"] });
    flash(stage, "gold");
  } else if (nat === 1) {
    el.classList.add("fumble");
    sparks.burst(cx, cy, { n: 70, speed: 380, life: [.6, 1.4], size: [3, 6], gravity: 250, colors: ["200,20,10", "90,0,0"] });
    flash(stage, "red");
  }
  hint.innerHTML = `<span class="nat">${nat}</span><span class="sum">${mod >= 0 ? "+" : "−"} ${Math.abs(mod)} = <b>${Math.round(total)}</b></span>`;
  info.prev = target;
}

function flash(stage, kind) {
  const f = document.createElement("div"); f.className = `efx-screenflash ${kind}`; stage.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

function playOrder({ order }) {
  let stage = stageEl();
  if (!stage) { showDice({ dice: [] }); stage = stageEl(); }
  const el = stage.querySelector(".efx-order");
  el.innerHTML = `<h2>INITIATIVE ORDER</h2>` + order.map((r, i) => `
    <div class="efx-row${r.pc ? " pc" : ""}" style="--i:${i}"><span class="rk">${i + 1}</span>
      <img src="${esc(r.img ?? "icons/svg/mystery-man.svg")}" alt="">
      <span class="nm">${esc(r.name)}</span><span class="tot">${Math.round(r.total)}</span></div>`).join("");
  stage.classList.add("ordered");
  stage._sparks?.burst(innerWidth / 2, innerHeight * 0.3, { n: 90, speed: 700, life: [.5, 1.3], size: [2, 5], gravity: 450 });
}
