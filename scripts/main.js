/**
 * Encounter FX  –  Foundry VTT V14 / dnd5e
 * GM button -> pick scene -> fire fade + ENCOUNTER banner -> add tokens to Combat
 * -> 3D d20 initiative roll -> announce order.
 * Uses the real Combat document (not a custom encounter system).
 */
const ID = "encounter-fx";
const SOCKET = `module.${ID}`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DEFAULT_PHRASES = [
  "Imminent Danger", "Watch Out!", "Get Ready To Fight", "Draw Your Weapons",
  "Enemies Approach", "Steel Yourself", "No Turning Back", "Blood Will Be Spilled"
];

// Intro timeline (ms)
const T_SWITCH = 1700;   // when GM switches the scene (fire already covers screen)
const T_SHOW = 1500;     // banner appears
const T_LEAVE = 5100;    // fade out
const T_END = 6100;      // remove intro
const T_DICE = 5400;     // dice stage appears

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */
Hooks.once("init", () => {
  game.settings.register(ID, "phrases", {
    scope: "world", config: false, type: String, default: DEFAULT_PHRASES.join("\n")
  });
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
    name: ID,
    title: "Encounter FX",
    icon: "fa-solid fa-fire-flame-curved",
    order: Object.keys(tools).length + 1,
    button: true,
    visible: game.user.isGM,
    onChange: () => new EncounterLauncher().render({ force: true })
  };
});

/* ------------------------------------------------------------------ */
/*  Launcher dialog (GM)                                               */
/* ------------------------------------------------------------------ */
class EncounterLauncher extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "efx-launcher",
    tag: "form",
    classes: ["efx-launcher"],
    position: { width: 520, height: "auto" },
    window: { title: "Encounter FX", icon: "fa-solid fa-fire-flame-curved", resizable: true },
    form: { handler: EncounterLauncher.#onSubmit, closeOnSubmit: true }
  };

  static PARTS = { form: { template: `modules/${ID}/templates/launcher.hbs` } };

  async _prepareContext() {
    const viewed = game.scenes.viewed?.id;
    const scenes = game.scenes.contents
      .map(s => ({ id: s.id, name: s.name, active: s.active, selected: false }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const actors = game.actors.contents
      .filter(a => a.type === "character" && a.hasPlayerOwner)
      .map(a => ({
        id: a.id, name: a.name, img: a.img,
        checked: game.users.some(u => u.active && !u.isGM && a.testUserPermission(u, "OWNER"))
      }));
    return { scenes, actors, viewed, phrases: game.settings.get(ID, "phrases") };
  }

  static async #onSubmit(event, form, formData) {
    const d = formData.object;
    const actorIds = [...form.querySelectorAll('input[name="actor"]:checked')].map(i => i.value);
    const phrases = String(d.phrases ?? "").split("\n").map(s => s.trim()).filter(Boolean);
    await game.settings.set(ID, "phrases", phrases.join("\n"));
    launch({
      sceneId: d.sceneId, actorIds, hostile: !!d.hostile, autostart: !!d.autostart,
      phrases: phrases.length ? phrases : DEFAULT_PHRASES
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Orchestrator (GM only)                                             */
/* ------------------------------------------------------------------ */
const GM = { combatId: null, autostart: false, rolled: false };

function broadcast(msg) { game.socket.emit(SOCKET, msg); onMessage(msg); }

async function launch({ sceneId, actorIds = [], hostile = true, autostart = true, phrases = DEFAULT_PHRASES }) {
  if (!game.user.isGM) return;
  const scene = game.scenes.get(sceneId);
  if (!scene) return ui.notifications.error("Encounter FX: ไม่พบซีน");
  const t0 = Date.now();
  GM.autostart = autostart; GM.rolled = false;

  broadcast({ action: "intro", phrases });
  await sleep(T_SWITCH);

  // 1) Move everyone to the scene while the fire covers the screen
  const needActivate = !scene.active;
  const needView = game.scenes.viewed?.id !== scene.id;
  if (needActivate || needView) {
    const ready = new Promise(r => { Hooks.once("canvasReady", r); setTimeout(r, 6000); });
    if (needActivate) await scene.activate(); else await scene.view();
    await ready;
  }

  // 2) Combat: find or create, then add tokens
  try {
    const combat = await ensureCombat(scene, actorIds, hostile);
    GM.combatId = combat.id;
  } catch (err) {
    console.error(`${ID} | combat setup failed`, err);
    ui.notifications.error("Encounter FX: สร้าง Combat ไม่สำเร็จ (ดู Console)");
    return broadcast({ action: "close" });
  }

  await sleep(Math.max(0, T_DICE - (Date.now() - t0)));
  broadcast({ action: "dice" });
}

async function ensureCombat(scene, actorIds, hostile) {
  const CombatCls = getDocumentClass("Combat");
  let combat = game.combats.find(c => c.scene?.id === scene.id);
  if (!combat) combat = await CombatCls.create({ scene: scene.id, active: true });
  if (!combat.active && typeof combat.activate === "function") await combat.activate();

  const wanted = new Set(actorIds);
  const found = new Set();
  const data = [];
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

async function gmRollInitiative() {
  if (!game.user.isGM || GM.rolled) return;
  const combat = game.combats.get(GM.combatId);
  if (!combat) return;
  GM.rolled = true;

  const updates = [], results = [];
  for (const c of combat.combatants) {
    const roll = c.getInitiativeRoll();
    await roll.evaluate();
    const d20 = roll.dice.find(d => d.faces === 20);
    const kept = d20?.results.find(r => r.active)?.result;
    const nat = Math.clamp(kept ?? Math.round(roll.total), 1, 20);
    updates.push({ _id: c.id, initiative: roll.total });
    if (!c.hidden) results.push({ name: c.name, img: c.img, nat, total: Math.round(roll.total * 100) / 100 });
  }
  await combat.updateEmbeddedDocuments("Combatant", updates);

  const order = [...results].sort((a, b) => b.total - a.total);
  const seq = [...results].sort((a, b) => a.total - b.total); // reveal lowest -> highest
  broadcast({ action: "roll", seq, order });
}

async function gmFinish(start) {
  const combat = game.combats.get(GM.combatId);
  if (start && combat) {
    try { await combat.startCombat(); ui.combat?.activate?.(); } catch (e) { console.warn(`${ID} |`, e); }
  }
  broadcast({ action: "close" });
}

/* ------------------------------------------------------------------ */
/*  Socket / client side                                               */
/* ------------------------------------------------------------------ */
function onMessage(msg) {
  switch (msg.action) {
    case "intro": return playIntro(msg);
    case "dice": return showDice();
    case "roll": return playRoll(msg);
    case "close": return closeAll();
  }
}

let rootEl = null;
function root() {
  if (!rootEl || !rootEl.isConnected) {
    rootEl = document.createElement("div");
    rootEl.id = "efx-root";
    document.body.appendChild(rootEl);
  }
  return rootEl;
}
const active = { fire: null };
function closeAll() {
  active.fire?.stop(); active.fire = null;
  root().replaceChildren();
}

/* ---------- Intro ---------- */
function trackHTML(phrases, reverse) {
  const list = reverse ? [...phrases].reverse() : [...phrases];
  const reps = Math.max(4, Math.ceil(24 / list.length));
  const half = Array.from({ length: reps }, () => list.map(p => `<span>${esc(p)}</span><i>◆</i>`).join("")).join("");
  return half + half;
}

async function playIntro({ phrases }) {
  closeAll();
  const el = document.createElement("div");
  el.className = "efx-intro";
  el.innerHTML = `
    <div class="efx-fill"></div><canvas class="efx-fire"></canvas><div class="efx-vignette"></div>
    <div class="efx-banner">
      <div class="efx-band efx-band-top"><div class="efx-track">${trackHTML(phrases, false)}</div></div>
      <div class="efx-title"><span>ENCOUNTER</span></div>
      <div class="efx-band efx-band-bot"><div class="efx-track">${trackHTML(phrases, true)}</div></div>
    </div>`;
  root().appendChild(el);

  for (const tr of el.querySelectorAll(".efx-track")) {
    tr.style.setProperty("--dur", `${Math.max(12, tr.scrollWidth / 2 / 140)}s`);
  }

  const fire = new Fire(el.querySelector("canvas"));
  active.fire = fire; fire.start();

  const src = game.settings.get(ID, "sound");
  if (src) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, false);

  void el.offsetWidth;
  el.classList.add("rise");
  await sleep(T_SHOW); el.classList.add("show");
  await sleep(T_LEAVE - T_SHOW); el.classList.add("leave"); fire.emit = 0;
  await sleep(T_END - T_LEAVE);
  if (active.fire === fire) active.fire = null;
  fire.stop(); el.remove();
}

/* ---------- Fire canvas ---------- */
class Fire {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.parts = []; this.on = false; this.emit = 1;
    this.resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    this.resize(); addEventListener("resize", this.resize);
    this.loop = this.loop.bind(this);
  }
  start() { this.on = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
  stop() { this.on = false; removeEventListener("resize", this.resize); }
  loop(now) {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { width: w, height: h } = this.c, ctx = this.ctx, k = h / 900;
    ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, w, h);

    const n = Math.round((w / 22) * this.emit);
    for (let i = 0; i < n && this.parts.length < 1000; i++) {
      const ember = Math.random() < 0.12;
      this.parts.push({
        x: Math.random() * w, y: h + 20,
        vx: (Math.random() - 0.5) * 60,
        vy: -(ember ? 250 + Math.random() * 600 : 140 + Math.random() * 420) * k,
        life: 0, max: ember ? 1.6 + Math.random() * 1.6 : 0.9 + Math.random() * 1.3,
        size: (ember ? 2 + Math.random() * 3 : 36 + Math.random() * 80) * k, ember
      });
    }

    ctx.globalCompositeOperation = "lighter";
    this.parts = this.parts.filter(p => {
      p.life += dt; if (p.life >= p.max) return false;
      p.x += (p.vx + Math.sin(p.life * 6 + p.x) * 25) * dt; p.y += p.vy * dt;
      const a = p.life / p.max;
      const col = p.ember ? "255,200,90" : a < 0.25 ? "255,225,140" : a < 0.55 ? "255,130,30" : "190,30,10";
      const alpha = (p.ember ? 1 - a : (1 - a) * 0.5);
      const r = p.size * (p.ember ? 1 : 1 - a * 0.4);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${col},${alpha})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    requestAnimationFrame(this.loop);
  }
}

/* ---------- 3D d20 (CSS icosahedron) ---------- */
const PHI = (1 + Math.sqrt(5)) / 2;
const VERTS = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };

/** Builds 20 faces into `die`; returns per-face matrices that bring face i to the front. */
function buildDie(die, L = 100) {
  const s = L / 2, H = L * Math.sqrt(3) / 2, light = norm([-0.4, -0.7, 1]), front = [];
  FACES.forEach((f, i) => {
    const [A, B, C] = f.map(k => VERTS[k].map(v => v * s));
    const cen = [0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3);
    let ex = norm(sub(C, B));
    const M = [0, 1, 2].map(k => (B[k] + C[k]) / 2);
    const ey = norm(sub(M, A));
    let n = cross(ex, ey);
    if (dot(n, cen) < 0) { ex = ex.map(v => -v); n = n.map(v => -v); }
    const P = [0, 1, 2].map(k => cen[k] - ex[k] * (L / 2) - ey[k] * (2 * H / 3));
    const el = document.createElement("div");
    el.className = "efx-face";
    const lit = Math.max(0, dot(n, light));
    el.style.cssText = `width:${L}px;height:${H}px;background:linear-gradient(160deg,hsl(5 75% ${24 + lit * 22}%),hsl(0 70% ${10 + lit * 12}%));` +
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

/* ---------- Dice stage ---------- */
function getStage() { return root().querySelector(".efx-dice-stage"); }

function showDice() {
  closeAll();
  const stage = document.createElement("div");
  stage.className = "efx-dice-stage";
  const isGM = game.user.isGM;
  stage.innerHTML = `
    <div class="efx-backdrop"></div>
    <div class="efx-dice-wrap">
      <div class="efx-scene3d"><div class="efx-bounce"><div class="efx-die idle ${isGM ? "gm" : ""}"></div></div></div>
      <div class="efx-hint">${isGM ? "คลิกลูกเต๋าเพื่อทอย Initiative" : "รอ GM ทอย Initiative..."}</div>
      <div class="efx-result"></div>
      <div class="efx-order"></div>
    </div>`;
  root().appendChild(stage);
  stage._front = buildDie(stage.querySelector(".efx-die"));
  if (isGM) {
    stage.querySelector(".efx-die").addEventListener("click", () => gmRollInitiative());
    stage.style.pointerEvents = "none";
  }
}

async function spinDie(stage, nat) {
  const die = stage.querySelector(".efx-die"), bounce = stage.querySelector(".efx-bounce");
  die.classList.remove("idle");
  const target = stage._front[nat - 1];
  const prev = stage._prev ?? randMatrix();
  const kf = [prev, randMatrix(), randMatrix(), randMatrix(), randMatrix(), randMatrix(), target];
  const offs = [0, 0.18, 0.36, 0.54, 0.7, 0.85, 1];
  const frames = kf.map((m, i) => ({ transform: `matrix3d(${m.join()})`, offset: offs[i], easing: i === 5 ? "cubic-bezier(.1,.8,.3,1)" : "linear" }));
  const old = stage._anim;
  const anim = die.animate(frames, { duration: 1700, fill: "forwards" });
  stage._anim = anim; old?.cancel();
  bounce.animate([
    { transform: "translateY(0) scale(.9)" },
    { transform: "translateY(-110px) scale(1.2)", offset: 0.3 },
    { transform: "translateY(0) scale(1)", offset: 0.6 },
    { transform: "translateY(-35px) scale(1.05)", offset: 0.78 },
    { transform: "translateY(0) scale(1)" }
  ], { duration: 1700, easing: "ease-out" });
  await anim.finished.catch(() => {});
  stage._prev = target;
}

async function playRoll({ seq, order }) {
  let stage = getStage();
  if (!stage) { showDice(); stage = getStage(); }
  stage.querySelector(".efx-hint").style.visibility = "hidden";
  const resEl = stage.querySelector(".efx-result");

  for (const r of seq) {
    resEl.className = "efx-result"; resEl.innerHTML = "";
    await spinDie(stage, r.nat);
    const mod = Math.round(r.total) - r.nat;
    resEl.className = `efx-result${r.nat === 20 ? " crit" : r.nat === 1 ? " fumble" : ""}`;
    resEl.innerHTML = `<img src="${esc(r.img ?? "icons/svg/mystery-man.svg")}" alt="">
      <div class="nm">${esc(r.name)}${r.nat === 20 ? " — CRITICAL!" : r.nat === 1 ? " — FUMBLE" : ""}</div>
      <div class="tt">${r.nat} <small>${mod >= 0 ? "+" : "−"} ${Math.abs(mod)}</small> = ${Math.round(r.total)}</div>`;
    await sleep(1000);
  }

  const orderEl = stage.querySelector(".efx-order");
  orderEl.innerHTML = `<h2>INITIATIVE</h2>` + order.map((r, i) => `
    <div class="efx-row" style="--i:${i}"><span class="rk">${i + 1}</span>
      <img src="${esc(r.img ?? "icons/svg/mystery-man.svg")}" alt="">
      <span class="nm">${esc(r.name)}</span><span class="tot">${Math.round(r.total)}</span></div>`).join("");
  if (game.user.isGM) {
    const actions = document.createElement("div");
    actions.className = "efx-actions";
    actions.innerHTML = `<button type="button" data-a="start"><i class="fa-solid fa-swords"></i> เริ่ม Combat</button>
      <button type="button" data-a="close"><i class="fa-solid fa-xmark"></i> ปิด</button>`;
    actions.addEventListener("click", ev => {
      const a = ev.target.closest("button")?.dataset.a;
      if (a) gmFinish(a === "start");
    });
    orderEl.appendChild(actions);
    stage.style.pointerEvents = "auto";
    if (GM.autostart) { /* start only when GM presses the button, but pre-focus it */ actions.querySelector("[data-a=start]").focus(); }
  }
  stage.classList.add("ordered");
}
