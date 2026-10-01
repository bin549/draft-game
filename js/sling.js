/**
 * 弹射模式 — 类愤怒的小鸟
 * 怪物弹射 · 砸垮木石 · 打倒鼠鼠敌人
 * 拖拽弹弓瞄准发射
 */

import { loadMonsters, getMonsterSprite, getMonsterDef } from "./monsters.js";

const META_SRC = "assets/player/mouse/ready/meta.json";
const WORLD_W = 2200;
const WORLD_H = 900;
const VIEW_W = 1280;
const GROUND_Y = 820;
const GRAVITY = 1650;
/** 弹弓挂点：底座贴地，皮筋中心略高于地面 */
const SLING_BASE = 90;
const SLING = { x: 200, y: GROUND_Y - SLING_BASE };
const MAX_PULL = 140;
const LAUNCH_MUL = 11.5;
const SETTLE_SPEED = 28;

const BLOCK = {
  wood: { hp: 55, color: "#c4a574", stroke: "#6b4e2e", mass: 1.2 },
  stone: { hp: 110, color: "#9aa3ad", stroke: "#4a5560", mass: 2.2 },
  ice: { hp: 35, color: "#b8d4e8", stroke: "#4a7a9a", mass: 0.9 },
};

const STAGES = [
  {
    title: "试射",
    birds: ["eyeball-1", "eyeball-2", "tiger-1"],
    enemies: [
      { mouse: "mint", x: 1180, y: GROUND_Y - 30 },
      { mouse: "pink", x: 1380, y: GROUND_Y - 30 },
    ],
    blocks: [
      { kind: "wood", x: 1120, y: GROUND_Y - 100, w: 28, h: 100 },
      { kind: "wood", x: 1240, y: GROUND_Y - 100, w: 28, h: 100 },
      { kind: "wood", x: 1120, y: GROUND_Y - 128, w: 148, h: 28 },
      { kind: "wood", x: 1320, y: GROUND_Y - 100, w: 28, h: 100 },
      { kind: "wood", x: 1440, y: GROUND_Y - 100, w: 28, h: 100 },
      { kind: "wood", x: 1320, y: GROUND_Y - 128, w: 148, h: 28 },
    ],
  },
  {
    title: "鼠窝塔",
    birds: ["nine-tail-fox-1", "eyeball-2", "tiger-1", "eyeball-1"],
    enemies: [
      { mouse: "orange", x: 1400, y: GROUND_Y - 30 },
      { mouse: "blue", x: 1280, y: GROUND_Y - 196 },
      { mouse: "gray", x: 1520, y: GROUND_Y - 30 },
    ],
    blocks: [
      { kind: "stone", x: 1220, y: GROUND_Y - 90, w: 30, h: 90 },
      { kind: "stone", x: 1340, y: GROUND_Y - 90, w: 30, h: 90 },
      { kind: "wood", x: 1220, y: GROUND_Y - 118, w: 150, h: 28 },
      { kind: "wood", x: 1240, y: GROUND_Y - 208, w: 26, h: 90 },
      { kind: "wood", x: 1340, y: GROUND_Y - 208, w: 26, h: 90 },
      { kind: "wood", x: 1240, y: GROUND_Y - 236, w: 126, h: 28 },
      { kind: "ice", x: 1460, y: GROUND_Y - 80, w: 24, h: 80 },
      { kind: "ice", x: 1560, y: GROUND_Y - 80, w: 24, h: 80 },
      { kind: "ice", x: 1460, y: GROUND_Y - 104, w: 124, h: 24 },
    ],
  },
  {
    title: "鼠群台",
    birds: ["tiger-2", "nine-tail-fox-2", "eyeball-3", "boat-man-1", "queen-1"],
    enemies: [
      { mouse: "purple", x: 1500, y: GROUND_Y - 30 },
      { mouse: "mint", x: 1360, y: GROUND_Y - 200 },
      { mouse: "pink", x: 1640, y: GROUND_Y - 30 },
      { mouse: "orange", x: 1500, y: GROUND_Y - 310 },
    ],
    blocks: [
      { kind: "stone", x: 1300, y: GROUND_Y - 110, w: 32, h: 110 },
      { kind: "stone", x: 1460, y: GROUND_Y - 110, w: 32, h: 110 },
      { kind: "stone", x: 1620, y: GROUND_Y - 110, w: 32, h: 110 },
      { kind: "wood", x: 1300, y: GROUND_Y - 140, w: 352, h: 30 },
      { kind: "wood", x: 1340, y: GROUND_Y - 250, w: 28, h: 110 },
      { kind: "wood", x: 1520, y: GROUND_Y - 250, w: 28, h: 110 },
      { kind: "wood", x: 1340, y: GROUND_Y - 278, w: 208, h: 28 },
      { kind: "ice", x: 1400, y: GROUND_Y - 368, w: 26, h: 90 },
      { kind: "ice", x: 1540, y: GROUND_Y - 368, w: 26, h: 90 },
      { kind: "ice", x: 1400, y: GROUND_Y - 392, w: 166, h: 24 },
      { kind: "wood", x: 1700, y: GROUND_Y - 90, w: 28, h: 90 },
      { kind: "wood", x: 1800, y: GROUND_Y - 90, w: 28, h: 90 },
      { kind: "wood", x: 1700, y: GROUND_Y - 118, w: 128, h: 28 },
    ],
  },
];

let canvas, ctx;
let els = {};
let state = null;
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let mouseMeta = [];
/** @type {Record<string, HTMLImageElement>} */
let mouseImgs = Object.create(null);

function on(t, type, fn, opts) {
  t.addEventListener(type, fn, opts);
  listeners.push([t, type, fn, opts]);
}
function offAll() {
  for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
  listeners = [];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = encodeURI(src) + "?v=sling1";
  });
}

async function ensureMice() {
  if (mouseMeta.length) return;
  mouseMeta = await fetch(META_SRC).then((r) => r.json());
  await Promise.all(
    mouseMeta.map(async (c) => {
      mouseImgs[c.id] = await loadImage(c.sprite);
    })
  );
}

function mouseColor(id) {
  return mouseMeta.find((m) => m.id === id)?.color || "#c45c26";
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeBlock(b) {
  const def = BLOCK[b.kind] || BLOCK.wood;
  const mass = def.mass;
  const w = b.w;
  const h = b.h;
  return {
    kind: "block",
    mat: b.kind,
    cx: b.x + w / 2,
    cy: b.y + h / 2,
    w,
    h,
    vx: 0,
    vy: 0,
    angle: 0,
    omega: 0,
    hp: def.hp,
    maxHp: def.hp,
    mass,
    invMass: 1 / mass,
    inertia: (mass * (w * w + h * h)) / 12,
    invInertia: 12 / (mass * (w * w + h * h)),
    alive: true,
    asleep: true,
  };
}

function makeEnemy(e) {
  const r = 28;
  return {
    kind: "enemy",
    mouse: e.mouse,
    x: e.x,
    y: e.y,
    r,
    vx: 0,
    vy: 0,
    hp: 70,
    maxHp: 70,
    mass: 1.35,
    alive: true,
  };
}

function makeBird(type) {
  const def = getMonsterDef(type);
  return {
    kind: "bird",
    type,
    x: SLING.x,
    y: SLING.y,
    r: Math.max(22, Math.min(30, (def.radius || 24) * 0.95)),
    vx: 0,
    vy: 0,
    mass: 1.15,
    alive: true,
    launched: false,
    settled: false,
  };
}

function initState(stage = 1) {
  const cfg = STAGES[Math.min(STAGES.length - 1, stage - 1)];
  const birds = cfg.birds.map(makeBird);
  state = {
    stage,
    cfg,
    birds,
    birdIndex: 0,
    blocks: cfg.blocks.map(makeBlock),
    enemies: cfg.enemies.map(makeEnemy),
    particles: [],
    phase: "aim", // aim | fly | wait | won | lost
    pull: null,
    camX: 0,
    score: 0,
    settleT: 0,
    shake: 0,
    trail: [],
  };
  placeCurrentBird();
}

function currentBird() {
  return state.birds[state.birdIndex] || null;
}

function placeCurrentBird() {
  const b = currentBird();
  if (!b) return;
  b.x = SLING.x;
  b.y = SLING.y;
  b.vx = 0;
  b.vy = 0;
  b.launched = false;
  b.settled = false;
  state.phase = "aim";
  state.pull = null;
  state.trail = [];
  state.settleT = 0;
}

function livingEnemies() {
  return state.enemies.filter((e) => e.alive);
}

function syncHud() {
  if (!els.stageText) return;
  els.stageText.textContent = `关卡 ${state.stage}/${STAGES.length}`;
  els.scoreText.textContent = `得分 ${state.score}`;
  els.birdsText.textContent = `弹药 ${Math.max(0, state.birds.length - state.birdIndex)}`;
  els.enemyText.textContent = `鼠鼠 ${livingEnemies().length}`;
  if (els.titleText) els.titleText.textContent = state.cfg.title;
}

function addBurst(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 50,
      life: 0.3 + Math.random() * 0.35,
      max: 0.65,
      color,
      r: 2 + Math.random() * 3,
    });
  }
}

function screenToWorld(clientX, clientY) {
  const { scale, ox, oy } = worldView();
  return {
    x: (clientX - ox) / scale,
    y: (clientY - oy) / scale,
    scale,
    ox,
    oy,
  };
}

function worldView() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const scale = Math.min(viewW / VIEW_W, viewH / WORLD_H) * 0.96;
  const ox = (viewW - VIEW_W * scale) / 2 - state.camX * scale;
  const oy = (viewH - WORLD_H * scale) / 2;
  return { scale, ox, oy, viewW, viewH };
}

function onPointerDown(ev) {
  if (!state || state.phase !== "aim") return;
  const b = currentBird();
  if (!b || b.launched) return;
  const p = screenToWorld(ev.clientX, ev.clientY);
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  if (dx * dx + dy * dy > 90 * 90) return;
  state.pull = { active: true, x: p.x, y: p.y };
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch (_) {}
  ev.preventDefault();
}

function onPointerMove(ev) {
  if (!state?.pull?.active) return;
  const p = screenToWorld(ev.clientX, ev.clientY);
  let dx = p.x - SLING.x;
  let dy = p.y - SLING.y;
  const len = Math.hypot(dx, dy) || 1;
  // 主要向左下拉
  if (dx > 20) dx = 20;
  const clamped = Math.min(MAX_PULL, len);
  state.pull.x = SLING.x + (dx / len) * clamped;
  state.pull.y = SLING.y + (dy / len) * clamped;
  const b = currentBird();
  if (b) {
    b.x = state.pull.x;
    b.y = state.pull.y;
  }
}

function onPointerUp() {
  if (!state?.pull?.active) return;
  const b = currentBird();
  const pull = state.pull;
  state.pull = null;
  if (!b) return;
  const dx = SLING.x - pull.x;
  const dy = SLING.y - pull.y;
  const power = Math.hypot(dx, dy);
  if (power < 18) {
    b.x = SLING.x;
    b.y = SLING.y;
    return;
  }
  b.vx = dx * LAUNCH_MUL;
  b.vy = dy * LAUNCH_MUL;
  b.launched = true;
  state.phase = "fly";
  state.settleT = 0;
  syncHud();
}

function damageBody(body, dmg, x, y) {
  if (!body.alive) return;
  body.hp -= dmg;
  wake(body);
  if (body.hp <= 0) {
    body.alive = false;
    const color =
      body.kind === "enemy"
        ? mouseColor(body.mouse)
        : body.mat === "stone"
          ? "#6a7580"
          : body.mat === "ice"
            ? "#7ab0d0"
            : "#8a6238";
    addBurst(x, y, color, body.kind === "enemy" ? 16 : 14);
    state.shake = Math.max(state.shake, 0.18);
    if (body.kind === "enemy") state.score += 500;
    else state.score += body.mat === "stone" ? 120 : 80;
    // 旁边木块失去支撑，全部唤醒掉落
    if (body.kind === "block") {
      for (const bl of state.blocks) {
        if (!bl.alive || bl === body) continue;
        if (Math.hypot(bl.cx - body.cx, bl.cy - body.cy) < 160) wake(bl);
      }
    }
    syncHud();
  }
}

function wake(body) {
  if (body) body.asleep = false;
}

function blockCorners(bl) {
  const hw = bl.w / 2;
  const hh = bl.h / 2;
  const c = Math.cos(bl.angle);
  const s = Math.sin(bl.angle);
  const pts = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return pts.map(([lx, ly]) => ({
    x: bl.cx + lx * c - ly * s,
    y: bl.cy + lx * s + ly * c,
  }));
}

function blockPointVel(bl, px, py) {
  const rx = px - bl.cx;
  const ry = py - bl.cy;
  return {
    vx: bl.vx - bl.omega * ry,
    vy: bl.vy + bl.omega * rx,
  };
}

/** 圆心 vs 旋转矩形 */
function circleObbHit(c, bl) {
  const dx = c.x - bl.cx;
  const dy = c.y - bl.cy;
  const ca = Math.cos(bl.angle);
  const sa = Math.sin(bl.angle);
  const lx = dx * ca + dy * sa;
  const ly = -dx * sa + dy * ca;
  const hw = bl.w / 2;
  const hh = bl.h / 2;
  const cx = Math.max(-hw, Math.min(hw, lx));
  const cy = Math.max(-hh, Math.min(hh, ly));
  let ox = lx - cx;
  let oy = ly - cy;
  let dist = Math.hypot(ox, oy);

  // 圆心在盒内：推出最近边
  if (dist < 1e-6 && Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
    const dl = hw + lx;
    const dr = hw - lx;
    const dt = hh + ly;
    const db = hh - ly;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) {
      ox = -1;
      oy = 0;
      dist = dl;
    } else if (m === dr) {
      ox = 1;
      oy = 0;
      dist = dr;
    } else if (m === dt) {
      ox = 0;
      oy = -1;
      dist = dt;
    } else {
      ox = 0;
      oy = 1;
      dist = db;
    }
    const nx = ox * ca - oy * sa;
    const ny = ox * sa + oy * ca;
    const px = c.x - nx * c.r;
    const py = c.y - ny * c.r;
    return { nx, ny, overlap: dist + c.r, px, py };
  }

  if (dist >= c.r) return null;
  const nlx = ox / dist;
  const nly = oy / dist;
  const nx = nlx * ca - nly * sa;
  const ny = nlx * sa + nly * ca;
  const px = bl.cx + (cx * ca - cy * sa);
  const py = bl.cy + (cx * sa + cy * ca);
  return { nx, ny, overlap: c.r - dist, px, py };
}

function applyImpulse(body, px, py, jx, jy) {
  if (!body || body.invMass == null) {
    // 圆（鸟/敌）只有线速度
    body.vx += jx / body.mass;
    body.vy += jy / body.mass;
    return;
  }
  body.vx += jx * body.invMass;
  body.vy += jy * body.invMass;
  const rx = px - body.cx;
  const ry = py - body.cy;
  body.omega += (rx * jy - ry * jx) * body.invInertia;
  wake(body);
}

function resolveCircleBlock(c, bl, restitution = 0.35) {
  const hit = circleObbHit(c, bl);
  if (!hit) return null;
  // 分离
  const totalMass = c.mass + bl.mass;
  c.x += hit.nx * hit.overlap * (bl.mass / totalMass);
  c.y += hit.ny * hit.overlap * (bl.mass / totalMass);
  bl.cx -= hit.nx * hit.overlap * (c.mass / totalMass);
  bl.cy -= hit.ny * hit.overlap * (c.mass / totalMass);

  const bv = blockPointVel(bl, hit.px, hit.py);
  const rvx = c.vx - bv.vx;
  const rvy = c.vy - bv.vy;
  const velN = rvx * hit.nx + rvy * hit.ny;
  if (velN > 0) return { impact: 0, px: hit.px, py: hit.py };

  const rx = hit.px - bl.cx;
  const ry = hit.py - bl.cy;
  const rn = rx * hit.ny - ry * hit.nx;
  const inv =
    1 / c.mass + bl.invMass + rn * rn * bl.invInertia;
  const j = (-(1 + restitution) * velN) / inv;
  const jx = hit.nx * j;
  const jy = hit.ny * j;

  c.vx += jx / c.mass;
  c.vy += jy / c.mass;
  applyImpulse(bl, hit.px, hit.py, -jx, -jy);

  // 摩擦
  let tx = rvx - velN * hit.nx;
  let ty = rvy - velN * hit.ny;
  const tlen = Math.hypot(tx, ty);
  if (tlen > 1e-3) {
    tx /= tlen;
    ty /= tlen;
    const rt = rx * ty - ry * tx;
    const invT = 1 / c.mass + bl.invMass + rt * rt * bl.invInertia;
    let jt = -((rvx * tx + rvy * ty)) / invT;
    const maxF = Math.abs(j) * 0.45;
    jt = Math.max(-maxF, Math.min(maxF, jt));
    c.vx += (tx * jt) / c.mass;
    c.vy += (ty * jt) / c.mass;
    applyImpulse(bl, hit.px, hit.py, -tx * jt, -ty * jt);
  }

  return { impact: Math.abs(j), px: hit.px, py: hit.py, nx: hit.nx, ny: hit.ny };
}

function resolveBlocks(a, b, restitution = 0.25) {
  // SAT 轴：两边方向
  const axes = [];
  for (const bl of [a, b]) {
    axes.push({ x: Math.cos(bl.angle), y: Math.sin(bl.angle) });
    axes.push({ x: -Math.sin(bl.angle), y: Math.cos(bl.angle) });
  }
  let minOverlap = Infinity;
  let bestAxis = null;
  const ca = blockCorners(a);
  const cb = blockCorners(b);
  for (const axis of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of ca) {
      const d = p.x * axis.x + p.y * axis.y;
      minA = Math.min(minA, d);
      maxA = Math.max(maxA, d);
    }
    for (const p of cb) {
      const d = p.x * axis.x + p.y * axis.y;
      minB = Math.min(minB, d);
      maxB = Math.max(maxB, d);
    }
    if (maxA < minB || maxB < minA) return null;
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxis = axis;
    }
  }
  if (!bestAxis) return null;
  // 法线从 a 指向 b
  let nx = bestAxis.x;
  let ny = bestAxis.y;
  if ((b.cx - a.cx) * nx + (b.cy - a.cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  // 近似接触点：中点
  const px = (a.cx + b.cx) / 2;
  const py = (a.cy + b.cy) / 2;

  const share = a.invMass + b.invMass || 1;
  a.cx -= nx * minOverlap * (a.invMass / share);
  a.cy -= ny * minOverlap * (a.invMass / share);
  b.cx += nx * minOverlap * (b.invMass / share);
  b.cy += ny * minOverlap * (b.invMass / share);

  const va = blockPointVel(a, px, py);
  const vb = blockPointVel(b, px, py);
  const rvx = va.vx - vb.vx;
  const rvy = va.vy - vb.vy;
  const velN = rvx * nx + rvy * ny;
  if (velN > 0) return { impact: 0 };

  const rax = px - a.cx;
  const ray = py - a.cy;
  const rbx = px - b.cx;
  const rby = py - b.cy;
  const rna = rax * ny - ray * nx;
  const rnb = rbx * ny - rby * nx;
  const inv = a.invMass + b.invMass + rna * rna * a.invInertia + rnb * rnb * b.invInertia;
  const j = (-(1 + restitution) * velN) / inv;
  applyImpulse(a, px, py, -nx * j, -ny * j);
  applyImpulse(b, px, py, nx * j, ny * j);
  wake(a);
  wake(b);
  return { impact: Math.abs(j), px, py };
}

function collideCircles(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const min = a.r + b.r;
  if (dist >= min) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = min - dist;
  const rvx = a.vx - b.vx;
  const rvy = a.vy - b.vy;
  const impact = Math.max(0, rvx * nx + rvy * ny);
  return { nx, ny, overlap, impact };
}

function resolveGroundBlock(bl) {
  const corners = blockCorners(bl);
  let maxPen = 0;
  let contactX = bl.cx;
  for (const p of corners) {
    if (p.y > GROUND_Y) {
      const pen = p.y - GROUND_Y;
      if (pen > maxPen) {
        maxPen = pen;
        contactX = p.x;
      }
    }
  }
  if (maxPen <= 0) return;
  bl.cy -= maxPen;
  // 接触点速度
  const pv = blockPointVel(bl, contactX, GROUND_Y);
  if (pv.vy > 0) {
    const j = -pv.vy * (1 + 0.2) / (bl.invMass + ((contactX - bl.cx) ** 2) * bl.invInertia);
    applyImpulse(bl, contactX, GROUND_Y, 0, j);
    // 摩擦刹停水平
    const friction = Math.min(Math.abs(j) * 0.6, Math.abs(pv.vx) / Math.max(bl.invMass, 1e-6));
    applyImpulse(bl, contactX, GROUND_Y, -Math.sign(pv.vx || 1) * friction * bl.mass * 0.02, 0);
    bl.vx *= 0.92;
    bl.omega *= 0.88;
    if (pv.vy > 120) damageBody(bl, pv.vy * 0.025, contactX, GROUND_Y);
  }
  // 倒地后逐渐摆平
  if (Math.abs(bl.vy) < 40 && Math.abs(bl.vx) < 40 && Math.abs(bl.omega) < 1.2) {
    const target = Math.round(bl.angle / (Math.PI / 2)) * (Math.PI / 2);
    bl.angle += (target - bl.angle) * 0.08;
    bl.omega *= 0.85;
  }
}

function stepPhysics(dt) {
  const circles = [];
  const bird = currentBird();
  if (bird?.launched && bird.alive) circles.push(bird);
  for (const e of state.enemies) if (e.alive) circles.push(e);
  const blocks = state.blocks.filter((b) => b.alive);

  for (const c of circles) {
    c.vy += GRAVITY * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vx *= 1 - 0.08 * dt;
    if (c.y + c.r > GROUND_Y) {
      c.y = GROUND_Y - c.r;
      if (c.vy > 0) {
        const impact = c.vy;
        c.vy *= -0.28;
        c.vx *= 0.88;
        if (impact > 200 && c.kind === "enemy") damageBody(c, impact * 0.045, c.x, c.y);
        if (Math.abs(c.vy) < 55) c.vy = 0;
      }
    }
    if (c.x < c.r) {
      c.x = c.r;
      c.vx *= -0.35;
    }
    if (c.x > WORLD_W - c.r) {
      c.x = WORLD_W - c.r;
      c.vx *= -0.35;
    }
  }

  for (const bl of blocks) {
    if (bl.asleep) continue;
    bl.vy += GRAVITY * dt;
    bl.cx += bl.vx * dt;
    bl.cy += bl.vy * dt;
    bl.angle += bl.omega * dt;
    bl.vx *= 1 - 0.12 * dt;
    bl.omega *= 1 - 0.18 * dt;
    resolveGroundBlock(bl);
    // 几乎静止则休眠，减少抖动
    if (
      Math.hypot(bl.vx, bl.vy) < 12 &&
      Math.abs(bl.omega) < 0.25 &&
      Math.abs(bl.cy + bl.h / 2 - GROUND_Y) < 3
    ) {
      bl.vx = bl.vy = bl.omega = 0;
      bl.asleep = true;
    }
  }

  // 碰撞：休眠木块只跟弹射体互动，避免老鼠/堆叠一开局就把塔推塌
  for (let iter = 0; iter < 3; iter++) {
    if (bird?.launched && bird.alive) {
      for (const bl of blocks) {
        if (!bl.alive) continue;
        const probe = circleObbHit(bird, bl);
        if (!probe) continue;
        // 休眠结构：只有真正撞上才唤醒（避免擦边微重叠推塌）
        if (bl.asleep) {
          const bv = blockPointVel(bl, probe.px, probe.py);
          const rvx = bird.vx - bv.vx;
          const rvy = bird.vy - bv.vy;
          const approach = -(rvx * probe.nx + rvy * probe.ny);
          if (approach < 80 && probe.overlap < 6) continue;
        }
        const hit = resolveCircleBlock(bird, bl, 0.42);
        if (!hit) continue;
        wake(bl);
        for (const other of blocks) {
          if (!other.alive || other === bl) continue;
          if (Math.hypot(other.cx - bl.cx, other.cy - bl.cy) < 130) wake(other);
        }
        if (hit.impact > 1) {
          const dmg = hit.impact * 0.2;
          if (dmg > 6) {
            damageBody(bl, dmg, hit.px, hit.py);
            addBurst(hit.px, hit.py, "#c4a574", 4);
          }
        }
      }
    }

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        // 两个都休眠 = 静态结构，不互相推
        if (a.asleep && b.asleep) continue;
        const hit = resolveBlocks(a, b);
        if (hit?.impact > 90) {
          damageBody(a, hit.impact * 0.04, hit.px, hit.py);
          damageBody(b, hit.impact * 0.04, hit.px, hit.py);
        }
      }
    }
  }

  if (bird?.launched && bird.alive) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const hit = collideCircles(bird, e);
      if (!hit) continue;
      bird.x -= hit.nx * hit.overlap * 0.55;
      bird.y -= hit.ny * hit.overlap * 0.55;
      e.x += hit.nx * hit.overlap * 0.45;
      e.y += hit.ny * hit.overlap * 0.45;
      const j = hit.impact;
      bird.vx -= hit.nx * j * 0.5;
      bird.vy -= hit.ny * j * 0.5;
      e.vx += hit.nx * j * 0.75;
      e.vy += hit.ny * j * 0.6;
      if (j > 35) {
        damageBody(e, j * 0.3, e.x, e.y);
        addBurst(e.x, e.y, mouseColor(e.mouse), 8);
      }
    }
  }

  // 只有已倒塌/被砸醒的木块才砸老鼠
  for (const e of state.enemies) {
    if (!e.alive) continue;
    for (const bl of blocks) {
      if (!bl.alive || bl.asleep) continue;
      const hit = resolveCircleBlock(e, bl, 0.25);
      if (!hit) continue;
      const spd = Math.hypot(bl.vx, bl.vy) + Math.abs(bl.omega) * 40;
      if (spd > 70 || hit.impact > 70) {
        damageBody(e, Math.max(hit.impact, spd) * 0.14, e.x, e.y);
      }
    }
  }
}

function allSettled() {
  const bird = currentBird();
  if (bird?.launched && bird.alive) {
    const spd = Math.hypot(bird.vx, bird.vy);
    if (spd > SETTLE_SPEED || bird.y < GROUND_Y - bird.r - 4) return false;
  }
  for (const bl of state.blocks) {
    if (!bl.alive) continue;
    if (Math.hypot(bl.vx, bl.vy) > SETTLE_SPEED * 1.2 || Math.abs(bl.omega) > 0.6) return false;
  }
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.vx, e.vy) > SETTLE_SPEED * 1.2) return false;
  }
  return true;
}

function nextBirdOrEnd() {
  if (!livingEnemies().length) {
    endStage(true);
    return;
  }
  state.birdIndex += 1;
  if (state.birdIndex >= state.birds.length) {
    endStage(false);
    return;
  }
  placeCurrentBird();
  syncHud();
}

function endStage(won) {
  if (won && state.stage < STAGES.length) {
    // 通关加分：剩余鼠
    const left = state.birds.length - state.birdIndex - 1;
    state.score += Math.max(0, left) * 300;
    beginGame(state.stage + 1, state.score);
    return;
  }
  state.phase = won ? "won" : "lost";
  els.gameover?.classList.remove("hidden");
  if (els.endTitle) els.endTitle.textContent = won ? "全部通关！" : "鼠鼠用尽";
  if (els.resultText) {
    els.resultText.textContent = won
      ? `完美弹射 · 得分 ${state.score}`
      : `还有 ${livingEnemies().length} 只鼠鼠 · 得分 ${state.score}`;
  }
}

function updateCamera(dt) {
  const bird = currentBird();
  const maxCam = Math.max(0, WORLD_W - VIEW_W);
  let target = 0;
  if (bird?.launched) {
    target = Math.max(0, Math.min(maxCam, bird.x - VIEW_W * 0.35));
  } else if (state.phase === "wait") {
    target = Math.max(0, Math.min(maxCam, 550));
  }
  state.camX += (target - state.camX) * Math.min(1, dt * 3.5);
}

function update(dt) {
  if (!state || state.phase === "won" || state.phase === "lost") return;

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 320 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  if (state.phase === "fly" || state.phase === "wait") {
    stepPhysics(dt);
    const bird = currentBird();
    if (bird?.launched && bird.alive) {
      state.trail.push({ x: bird.x, y: bird.y, life: 0.45 });
      if (state.trail.length > 40) state.trail.shift();
    }
    for (const t of state.trail) t.life -= dt;
    state.trail = state.trail.filter((t) => t.life > 0);

    if (state.phase === "fly") {
      state.settleT += dt;
      if (state.settleT > 0.6 && allSettled()) {
        state.phase = "wait";
        state.settleT = 0;
      }
      // 飞出太久也进入等待
      if (state.settleT > 6) {
        state.phase = "wait";
        state.settleT = 0;
      }
    } else if (state.phase === "wait") {
      state.settleT += dt;
      if (state.settleT > 0.85) {
        if (!livingEnemies().length) endStage(true);
        else nextBirdOrEnd();
      }
    }
  }

  updateCamera(dt);
}

function drawSky(viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, "#d8e4ec");
  g.addColorStop(0.55, "#e8e0d2");
  g.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawGround(scale, ox, oy) {
  const y = oy + GROUND_Y * scale;
  ctx.fillStyle = "#cfc4b0";
  ctx.fillRect(0, y, window.innerWidth, window.innerHeight);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(window.innerWidth, y);
  ctx.stroke();
  // 草皮
  ctx.fillStyle = "#8faf7a";
  ctx.fillRect(0, y - 8 * scale, window.innerWidth, 10 * scale);
}

function drawSling(scale, ox, oy) {
  const ground = oy + GROUND_Y * scale;
  const x = ox + SLING.x * scale;
  // 皮筋中心略高于地面
  const y = ground - SLING_BASE * scale;
  // 底座贴地
  ctx.fillStyle = "#6b4e2e";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 40 * scale, ground);
  ctx.lineTo(x + 40 * scale, ground);
  ctx.lineTo(x + 26 * scale, ground - 18 * scale);
  ctx.lineTo(x - 26 * scale, ground - 18 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 支架：从地面斜上
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = Math.max(5, 8 * scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 24 * scale, ground - 8 * scale);
  ctx.lineTo(x - 16 * scale, y - 55 * scale);
  ctx.moveTo(x + 24 * scale, ground - 8 * scale);
  ctx.lineTo(x + 16 * scale, y - 55 * scale);
  ctx.stroke();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 24 * scale, ground - 8 * scale);
  ctx.lineTo(x - 16 * scale, y - 55 * scale);
  ctx.moveTo(x + 24 * scale, ground - 8 * scale);
  ctx.lineTo(x + 16 * scale, y - 55 * scale);
  ctx.stroke();

  ctx.fillStyle = "#8b5a2b";
  ctx.beginPath();
  ctx.arc(x - 16 * scale, y - 55 * scale, 6 * scale, 0, Math.PI * 2);
  ctx.arc(x + 16 * scale, y - 55 * scale, 6 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const b = currentBird();
  const px = b && state.phase === "aim" ? ox + b.x * scale : x;
  const py = b && state.phase === "aim" ? oy + b.y * scale : y;
  ctx.strokeStyle = "#8a3030";
  ctx.lineWidth = Math.max(3, 4.5 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 16 * scale, y - 52 * scale);
  ctx.lineTo(px, py);
  ctx.lineTo(x + 16 * scale, y - 52 * scale);
  ctx.stroke();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 16 * scale, y - 52 * scale);
  ctx.lineTo(px, py);
  ctx.lineTo(x + 16 * scale, y - 52 * scale);
  ctx.stroke();

  if (state.pull?.active && b) {
    const dx = SLING.x - b.x;
    const dy = SLING.y - b.y;
    ctx.strokeStyle = "rgba(26,26,26,0.4)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    let sx = b.x;
    let sy = b.y;
    let vx = dx * LAUNCH_MUL;
    let vy = dy * LAUNCH_MUL;
    ctx.moveTo(ox + sx * scale, oy + sy * scale);
    for (let i = 0; i < 20; i++) {
      vx *= 0.995;
      vy += GRAVITY * 0.028;
      sx += vx * 0.028;
      sy += vy * 0.028;
      ctx.lineTo(ox + sx * scale, oy + sy * scale);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBird(b, scale, ox, oy) {
  if (!b.alive) return;
  const spr = getMonsterSprite(b.type);
  const x = ox + b.x * scale;
  const y = oy + b.y * scale;
  const fit = b.r * 2.2 * scale;
  // 素材默认朝左，弹射向右，水平翻转
  const faceRight = !b.launched || b.vx >= -20;
  if (spr) {
    const sc = Math.min(fit / spr.w, fit / spr.h);
    const dw = spr.w * sc;
    const dh = spr.h * sc;
    ctx.save();
    ctx.translate(x, y);
    if (faceRight) ctx.scale(-1, 1);
    ctx.drawImage(spr.canvas, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = getMonsterDef(b.type).color || "#c45c26";
    ctx.beginPath();
    ctx.arc(x, y, b.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlock(bl, scale, ox, oy) {
  if (!bl.alive) return;
  const def = BLOCK[bl.mat] || BLOCK.wood;
  const x = ox + bl.cx * scale;
  const y = oy + bl.cy * scale;
  const w = bl.w * scale;
  const h = bl.h * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bl.angle);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = def.stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
  // 木纹
  ctx.strokeStyle = "rgba(26,26,26,0.12)";
  ctx.beginPath();
  if (w > h) {
    ctx.moveTo(-w * 0.35, -h * 0.15);
    ctx.lineTo(w * 0.35, -h * 0.15);
    ctx.moveTo(-w * 0.25, h * 0.2);
    ctx.lineTo(w * 0.3, h * 0.2);
  } else {
    ctx.moveTo(-w * 0.15, -h * 0.35);
    ctx.lineTo(-w * 0.15, h * 0.35);
    ctx.moveTo(w * 0.2, -h * 0.25);
    ctx.lineTo(w * 0.2, h * 0.3);
  }
  ctx.stroke();
  if (bl.hp < bl.maxHp * 0.55) {
    ctx.strokeStyle = "rgba(26,26,26,0.4)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -h * 0.35);
    ctx.lineTo(w * 0.1, h * 0.1);
    ctx.lineTo(-w * 0.05, h * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(e, scale, ox, oy) {
  if (!e.alive) return;
  const img = mouseImgs[e.mouse];
  const x = ox + e.x * scale;
  const y = oy + e.y * scale;
  const size = e.r * 2.25 * scale;
  if (img) {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  } else {
    ctx.fillStyle = mouseColor(e.mouse);
    ctx.beginPath();
    ctx.arc(x, y, e.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.hp < e.maxHp) {
    const bw = e.r * 2 * scale;
    ctx.fillStyle = "rgba(26,26,26,0.35)";
    ctx.fillRect(x - bw / 2, y - e.r * scale - 10, bw, 4);
    ctx.fillStyle = "#c23b3b";
    ctx.fillRect(x - bw / 2, y - e.r * scale - 10, bw * (e.hp / e.maxHp), 4);
  }
}

function render() {
  if (!state) return;
  const { scale, ox, oy, viewW, viewH } = worldView();
  drawSky(viewW, viewH);

  let sx = 0;
  let sy = 0;
  if (state.shake > 0) {
    sx = (Math.random() - 0.5) * 8;
    sy = (Math.random() - 0.5) * 8;
  }
  ctx.save();
  ctx.translate(sx, sy);

  drawGround(scale, ox, oy);

  // 远山装饰
  ctx.fillStyle = "rgba(160,170,150,0.35)";
  ctx.beginPath();
  ctx.moveTo(ox + 800 * scale, oy + GROUND_Y * scale);
  ctx.lineTo(ox + 1000 * scale, oy + 520 * scale);
  ctx.lineTo(ox + 1200 * scale, oy + GROUND_Y * scale);
  ctx.fill();

  for (const bl of state.blocks) drawBlock(bl, scale, ox, oy);
  for (const e of state.enemies) drawEnemy(e, scale, ox, oy);

  // 轨迹
  for (const t of state.trail) {
    ctx.globalAlpha = Math.max(0, t.life / 0.45) * 0.45;
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(ox + t.x * scale, oy + t.y * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawSling(scale, ox, oy);

  // 队列里的鼠
  for (let i = state.birdIndex + (state.phase === "aim" ? 1 : 0); i < state.birds.length; i++) {
    const b = state.birds[i];
    const q = i - state.birdIndex - (state.phase === "aim" ? 1 : 0);
    const qb = { ...b, x: 80 - q * 18, y: GROUND_Y - 28, alive: true };
    drawBird(qb, scale, ox, oy);
  }

  const bird = currentBird();
  if (bird && (state.phase === "aim" || bird.launched)) drawBird(bird, scale, ox, oy);

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(ox + p.x * scale, oy + p.y * scale, p.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.fillStyle = "rgba(26,26,26,0.5)";
  ctx.font = "13px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(
    state.phase === "aim" ? "拖拽怪物拉弓发射 · 砸倒全部鼠鼠" : "观察倒塌…",
    viewW / 2,
    viewH - 18
  );
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  // 物理子步进更稳
  const steps = 4;
  for (let i = 0; i < steps; i++) update(dt / steps);
  render();
  raf = requestAnimationFrame(tick);
}

async function beginGame(stage = 1, carryScore = 0) {
  await Promise.all([ensureMice(), loadMonsters()]);
  initState(stage);
  if (carryScore) state.score = carryScore;
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  syncHud();
}

export async function startSling({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  offAll();
  resize();

  on(window, "resize", resize);
  on(canvas, "pointerdown", onPointerDown);
  on(canvas, "pointermove", onPointerMove);
  on(window, "pointerup", onPointerUp);
  on(window, "pointercancel", onPointerUp);
  on(els.btnStart, "click", () => beginGame(1, 0));
  on(els.btnRestart, "click", () => beginGame(1, 0));

  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  await beginGame(1, 0);
  if (!running) return;
  raf = requestAnimationFrame(tick);
}

export function stopSling() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
