/**
 * 逃亡模式 — 森林神庙双人解谜（参考经典冰火人关卡）
 * P1 冰女：WASD / 空格跳 · 靠近拉杆按 S 扳动
 * P2 火女：方向键 / ↑跳 · 靠近拉杆按 ↓ 扳动
 */

const META_SRC = "assets/player/icefire/meta.json";
const GRAVITY = 1950;
const JUMP_V = -680;
const MOVE_SPEED = 220;
const PUSH_SPEED = 145;
const ANIM_RUN_FPS = 12;
const ANIM_JUMP_FPS = 14;
const INVULN = 1.0;
const MAX_STAGES = 3;
const DRAW_SCALE = 0.48;
const BODY_W = 26;
const BODY_H = 48;
const BOX_SIZE = 40;
const WALL = 36;

const CTRL = {
  ice: {
    left: ["KeyA"],
    right: ["KeyD"],
    down: ["KeyS"],
    jump: ["KeyW", "Space", "KeyK"],
  },
  fire: {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    down: ["ArrowDown"],
    jump: ["ArrowUp", "Digit2", "Numpad0"],
  },
};

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];
let assets = null;
let loadPromise = null;

function on(target, type, fn) {
  target.addEventListener(type, fn);
  listeners.push([target, type, fn]);
}
function offAll() {
  for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  listeners = [];
}
function keyDown(codes) {
  if (!codes) return false;
  for (const c of codes) if (keys[c]) return true;
  return false;
}
function keyPressed(codes) {
  if (!codes || !state) return false;
  for (const c of codes) {
    if (keys[c] && !state.prevKeys[c]) return true;
  }
  return false;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed: " + src));
    img.src = encodeURI(src);
  });
}

async function ensureAssets() {
  if (assets) return assets;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const meta = await fetch(META_SRC).then((r) => r.json());
    assets = {
      blue: {
        ...meta.blue,
        animImg: await loadImage(meta.blue.anim),
        idleImg: await loadImage(meta.blue.idle),
      },
      red: {
        ...meta.red,
        animImg: await loadImage(meta.red.anim),
        idleImg: await loadImage(meta.red.idle),
      },
    };
    return assets;
  })();
  return loadPromise;
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function makePlayer(kind, x, y) {
  return {
    kind,
    scheme: kind,
    x,
    y,
    w: BODY_W,
    h: BODY_H,
    vx: 0,
    vy: 0,
    facing: kind === "fire" ? 1 : -1,
    onGround: false,
    dead: false,
    invuln: 0,
    anim: "idle",
    frame: 0,
    animT: 0,
    sheet: assets[kind === "ice" ? "blue" : "red"],
    atDoor: false,
    pushing: false,
  };
}

/** 森林神庙关卡 —— 单屏竖向迷宫（可完整通关） */
function buildLevel(stage) {
  const W = 1100;
  const H = 720;
  const T = WALL;
  const cy = (platY) => platY - BODY_H / 2;
  // 闸门只填平台缝，高度略小于层距，避免穿进上层
  const gate = (id, x, platY, h = 72, fromButton = null) => ({
    id,
    x,
    y: platY - h,
    w: 20,
    h,
    closedH: h,
    openH: 6,
    open: false,
    ...(fromButton ? { fromButton } : {}),
  });

  if (stage === 1) {
    // 教学关：无闸门死路 · 顶出生 · 沿本色池下到底门
    return {
      width: W,
      height: H,
      title: "逃亡 · 入门",
      hint: "冰走水路 · 火走火路 · 跳过绿泥 · 齐进双门",
      spawn: { ice: [120, cy(140)], fire: [980, cy(140)] },
      solids: [
        { x: 0, y: 0, w: W, h: T },
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: T, y: 140, w: 200, h: T },
        { x: 320, y: 140, w: 180, h: T },
        { x: 580, y: 140, w: 180, h: T },
        { x: 840, y: 140, w: W - T - 840, h: T },
        { x: T, y: 260, w: 240, h: T },
        { x: 360, y: 260, w: 200, h: T },
        { x: 640, y: 260, w: 200, h: T },
        { x: 920, y: 260, w: W - T - 920, h: T },
        { x: T, y: 380, w: 280, h: T },
        { x: 400, y: 380, w: 300, h: T },
        { x: 780, y: 380, w: W - T - 780, h: T },
        { x: T, y: 500, w: 300, h: T },
        { x: 400, y: 500, w: 300, h: T },
        { x: 780, y: 500, w: W - T - 780, h: T },
        { x: T, y: 640, w: 220, h: T },
        { x: 420, y: 640, w: 260, h: T },
        { x: 860, y: 640, w: W - T - 860, h: T },
        { x: T, y: 200, w: 70, h: T },
        { x: T, y: 320, w: 70, h: T },
        { x: T, y: 440, w: 70, h: T },
        { x: T, y: 570, w: 70, h: T },
        { x: W - T - 70, y: 200, w: 70, h: T },
        { x: W - T - 70, y: 320, w: 70, h: T },
        { x: W - T - 70, y: 440, w: 70, h: T },
        { x: W - T - 70, y: 570, w: 70, h: T },
      ],
      liquids: [
        { type: "lava", x: 236, y: 144, w: 84, h: 24 },
        { type: "goo", x: 500, y: 144, w: 70, h: 24 },
        { type: "water", x: 760, y: 144, w: 80, h: 24 },
        { type: "lava", x: 276, y: 264, w: 84, h: 24 },
        { type: "water", x: 560, y: 264, w: 80, h: 24 },
        { type: "water", x: 316, y: 384, w: 84, h: 24 },
        { type: "lava", x: 700, y: 384, w: 80, h: 24 },
        { type: "lava", x: 300, y: 504, w: 100, h: 24 },
        { type: "water", x: 700, y: 504, w: 80, h: 24 },
        { type: "lava", x: 256, y: 644, w: 164, h: 28 },
        { type: "water", x: 680, y: 644, w: 180, h: 28 },
      ],
      gems: [
        { type: "ice", x: 130, y: 100, got: false },
        { type: "fire", x: 970, y: 100, got: false },
        { type: "ice", x: 160, y: 220, got: false },
        { type: "fire", x: 980, y: 220, got: false },
        { type: "ice", x: 450, y: 340, got: false },
        { type: "fire", x: 650, y: 340, got: false },
        { type: "ice", x: 480, y: 460, got: false },
        { type: "fire", x: 560, y: 460, got: false },
        { type: "ice", x: 500, y: 600, got: false },
        { type: "fire", x: 560, y: 600, got: false },
      ],
      doors: [
        { type: "fire", x: 70, y: 640, w: 56, h: 72 },
        { type: "ice", x: 960, y: 640, w: 56, h: 72 },
      ],
      levers: [],
      gates: [],
      buttons: [],
      boxes: [],
      vines: [
        [80, 140], [400, 140], [900, 140], [150, 260], [800, 260],
        [200, 380], [500, 500], [120, 640], [950, 640],
      ],
    };
  }

  if (stage === 2) {
    return {
      width: W,
      height: H,
      title: "逃亡 · 机关",
      hint: "拉杆开闸 · 推箱压钮 · 齐进双门",
      spawn: { ice: [110, cy(140)], fire: [990, cy(140)] },
      solids: [
        { x: 0, y: 0, w: W, h: T },
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: T, y: 140, w: 220, h: T },
        { x: 340, y: 140, w: 180, h: T },
        { x: 600, y: 140, w: 180, h: T },
        { x: 860, y: 140, w: W - T - 860, h: T },
        { x: T, y: 260, w: 260, h: T },
        { x: 380, y: 260, w: 340, h: T },
        { x: 800, y: 260, w: W - T - 800, h: T },
        { x: T, y: 390, w: 400, h: T },
        { x: 500, y: 390, w: 260, h: T },
        { x: 840, y: 390, w: W - T - 840, h: T },
        { x: T, y: 520, w: 320, h: T },
        { x: 420, y: 520, w: 280, h: T },
        { x: 800, y: 520, w: W - T - 800, h: T },
        { x: T, y: 650, w: 220, h: T },
        { x: 420, y: 650, w: 260, h: T },
        { x: 860, y: 650, w: W - T - 860, h: T },
        { x: T, y: 200, w: 70, h: T },
        { x: T, y: 325, w: 70, h: T },
        { x: T, y: 455, w: 70, h: T },
        { x: T, y: 585, w: 70, h: T },
        { x: W - T - 70, y: 200, w: 70, h: T },
        { x: W - T - 70, y: 325, w: 70, h: T },
        { x: W - T - 70, y: 455, w: 70, h: T },
        { x: W - T - 70, y: 585, w: 70, h: T },
      ],
      liquids: [
        { type: "lava", x: 256, y: 144, w: 84, h: 24 },
        { type: "goo", x: 520, y: 144, w: 70, h: 24 },
        { type: "water", x: 780, y: 144, w: 80, h: 24 },
        { type: "water", x: 296, y: 264, w: 84, h: 24 },
        { type: "lava", x: 720, y: 264, w: 80, h: 24 },
        { type: "lava", x: 320, y: 524, w: 100, h: 24 },
        { type: "water", x: 700, y: 524, w: 100, h: 24 },
        { type: "lava", x: 256, y: 654, w: 164, h: 28 },
        { type: "water", x: 680, y: 654, w: 180, h: 28 },
      ],
      gems: [
        { type: "ice", x: 120, y: 100, got: false },
        { type: "fire", x: 980, y: 100, got: false },
        { type: "ice", x: 450, y: 220, got: false },
        { type: "fire", x: 650, y: 220, got: false },
        { type: "ice", x: 180, y: 350, got: false },
        { type: "fire", x: 920, y: 350, got: false },
        { type: "ice", x: 500, y: 480, got: false },
        { type: "fire", x: 560, y: 480, got: false },
        { type: "ice", x: 500, y: 610, got: false },
        { type: "fire", x: 560, y: 610, got: false },
      ],
      doors: [
        { type: "fire", x: 70, y: 650, w: 56, h: 72 },
        { type: "ice", x: 960, y: 650, w: 56, h: 72 },
      ],
      levers: [
        { id: "L1", x: 160, y: 390, on: false, gate: "G1", color: "#5a9a4a" },
      ],
      gates: [
        gate("G1", 458, 390, 70),
        gate("G2", 740, 520, 70, "B1"),
      ],
      buttons: [
        { id: "B1", x: 860, y: 520 - 10, w: 48, h: 10, pressed: false, gate: "G2" },
      ],
      boxes: [{ x: 920, y: 520 - BOX_SIZE, w: BOX_SIZE, h: BOX_SIZE, vx: 0, vy: 0 }],
      vines: [
        [90, 140], [450, 140], [900, 140], [200, 260], [850, 260],
        [200, 390], [500, 520], [120, 650], [950, 650],
      ],
    };
  }

  return {
    width: W,
    height: H,
    title: "逃亡 · 试炼",
    hint: "双拉杆 + 推箱 · 绿泥慎行 · 齐进双门",
    spawn: { ice: [110, cy(130)], fire: [990, cy(130)] },
    solids: [
      { x: 0, y: 0, w: W, h: T },
      { x: 0, y: H - T, w: W, h: T },
      { x: 0, y: 0, w: T, h: H },
      { x: W - T, y: 0, w: T, h: H },
      { x: T, y: 130, w: 200, h: T },
      { x: 320, y: 130, w: 160, h: T },
      { x: 560, y: 130, w: 160, h: T },
      { x: 800, y: 130, w: W - T - 800, h: T },
      { x: T, y: 250, w: 280, h: T },
      { x: 400, y: 250, w: 300, h: T },
      { x: 800, y: 250, w: W - T - 800, h: T },
      { x: T, y: 380, w: 340, h: T },
      { x: 460, y: 380, w: 220, h: T },
      { x: 800, y: 380, w: W - T - 800, h: T },
      { x: T, y: 510, w: 320, h: T },
      { x: 440, y: 510, w: 260, h: T },
      { x: 800, y: 510, w: W - T - 800, h: T },
      { x: T, y: 640, w: 220, h: T },
      { x: 420, y: 640, w: 260, h: T },
      { x: 860, y: 640, w: W - T - 860, h: T },
      { x: T, y: 190, w: 70, h: T },
      { x: T, y: 315, w: 70, h: T },
      { x: T, y: 445, w: 70, h: T },
      { x: T, y: 575, w: 70, h: T },
      { x: W - T - 70, y: 190, w: 70, h: T },
      { x: W - T - 70, y: 315, w: 70, h: T },
      { x: W - T - 70, y: 445, w: 70, h: T },
      { x: W - T - 70, y: 575, w: 70, h: T },
    ],
    liquids: [
      { type: "lava", x: 236, y: 134, w: 84, h: 24 },
      { type: "goo", x: 480, y: 134, w: 70, h: 24 },
      { type: "water", x: 720, y: 134, w: 80, h: 24 },
      { type: "water", x: 316, y: 254, w: 84, h: 24 },
      { type: "lava", x: 700, y: 254, w: 100, h: 24 },
      { type: "goo", x: 680, y: 384, w: 70, h: 24 },
      { type: "lava", x: 320, y: 514, w: 120, h: 24 },
      { type: "water", x: 700, y: 514, w: 100, h: 24 },
      { type: "lava", x: 256, y: 644, w: 164, h: 28 },
      { type: "water", x: 680, y: 644, w: 180, h: 28 },
    ],
    gems: [
      { type: "ice", x: 120, y: 90, got: false },
      { type: "fire", x: 980, y: 90, got: false },
      { type: "ice", x: 450, y: 210, got: false },
      { type: "fire", x: 650, y: 210, got: false },
      { type: "ice", x: 180, y: 340, got: false },
      { type: "fire", x: 920, y: 340, got: false },
      { type: "ice", x: 500, y: 470, got: false },
      { type: "fire", x: 560, y: 470, got: false },
      { type: "ice", x: 500, y: 600, got: false },
      { type: "fire", x: 560, y: 600, got: false },
    ],
    doors: [
      { type: "fire", x: 70, y: 640, w: 56, h: 72 },
      { type: "ice", x: 960, y: 640, w: 56, h: 72 },
    ],
    levers: [
      { id: "L1", x: 160, y: 380, on: false, gate: "G1", color: "#5a9a4a" },
      { id: "L2", x: 920, y: 380, on: false, gate: "G2", color: "#a45a9a" },
    ],
    gates: [
      gate("G1", 360, 250, 70),
      gate("G2", 760, 380, 70),
      gate("G3", 740, 510, 70, "B1"),
    ],
    buttons: [
      { id: "B1", x: 860, y: 510 - 10, w: 48, h: 10, pressed: false, gate: "G3" },
    ],
    boxes: [{ x: 920, y: 510 - BOX_SIZE, w: BOX_SIZE, h: BOX_SIZE, vx: 0, vy: 0 }],
    vines: [
      [80, 130], [400, 130], [880, 130], [150, 250], [850, 250],
      [200, 380], [500, 510], [120, 640], [950, 640],
    ],
  };
}

function initState(stage = 1) {
  const level = buildLevel(stage);

  for (const g of level.gates) {
    g.yBase = g.y;
    g.h = g.open ? g.openH : g.closedH;
    if (!g.open) g.y = g.yBase;
    else g.y = g.yBase + (g.closedH - g.openH);
  }

  state = {
    stage,
    level,
    players: [
      makePlayer("ice", level.spawn.ice[0], level.spawn.ice[1]),
      makePlayer("fire", level.spawn.fire[0], level.spawn.fire[1]),
    ],
    time: 0,
    ended: false,
    won: false,
    shake: 0,
    shakeMag: 0,
    respawning: false,
    deathToken: 0,
    prevKeys: Object.create(null),
    view: { scale: 1, ox: 0, oy: 0 },
  };
}

function resetPlayer(p) {
  const sp = state.level.spawn[p.kind];
  p.x = sp[0];
  p.y = sp[1];
  p.vx = 0;
  p.vy = 0;
  p.dead = false;
  p.invuln = INVULN;
  p.atDoor = false;
  p.onGround = false;
  p.anim = "idle";
  p.frame = 0;
  p.animT = 0;
  p._jumpHeld = false;
  p.pushing = false;
}

function damagePlayer(p) {
  if (!state || p.invuln > 0 || p.dead || state.respawning) return;
  p.dead = true;
  state.respawning = true;
  state.shake = 0.28;
  state.shakeMag = 8;
  const stage = state.stage;
  const token = ++state.deathToken;
  setTimeout(() => {
    if (!running || !state || state.ended) return;
    if (state.deathToken !== token) return;
    // 整关重开：出生点、宝石、拉杆、闸门、箱子、计时全部重置
    initState(stage);
    syncHud();
  }, 450);
}

function updateView() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const lw = state.level.width;
  const lh = state.level.height;
  const scale = Math.min(viewW / lw, viewH / lh) * 0.96;
  state.view.scale = scale;
  state.view.ox = (viewW - lw * scale) / 2;
  state.view.oy = (viewH - lh * scale) / 2;
}

function solidBlocks() {
  const blocks = state.level.solids.map((s) => ({ ...s, move: null }));
  for (const g of state.level.gates) {
    if (g.h > 16) blocks.push({ x: g.x, y: g.y, w: g.w, h: g.h, move: null });
  }
  for (const box of state.level.boxes) {
    blocks.push({ x: box.x, y: box.y, w: box.w, h: box.h, move: null, isBox: true, box });
  }
  return blocks;
}

function resolveEntity(ent, dt, ignoreBox = null) {
  const blocks = solidBlocks().filter((b) => b.box !== ignoreBox);
  for (const liq of state.level.liquids) {
    // 箱子不浮在液体上；角色安全液体可站
    if (ent.isBox) continue;
    const safe =
      (liq.type === "water" && ent.kind === "ice") ||
      (liq.type === "lava" && ent.kind === "fire");
    if (safe) blocks.push({ x: liq.x, y: liq.y + 2, w: liq.w, h: 10, move: null });
  }

  ent.onGround = false;
  ent.vy += GRAVITY * dt;
  ent.x += ent.vx * dt;
  ent.y += ent.vy * dt;

  const hw = ent.w / 2;
  const hh = ent.h / 2;
  // 统一用左上角碰撞：玩家中心制，箱子左上角制
  let left = ent.isBox ? ent.x : ent.x - hw;
  let top = ent.isBox ? ent.y : ent.y - hh;
  const w = ent.w;
  const h = ent.h;

  for (const pl of blocks) {
    if (!rectOverlap(left, top, w, h, pl.x, pl.y, pl.w, pl.h)) continue;
    const prevBottom = (ent.isBox ? ent.y : ent.y - hh) - ent.vy * dt + h;
    if (ent.vy < 0 || prevBottom > pl.y + 14) {
      if (ent.vy < 0) {
        const overlapL = left + w - pl.x;
        const overlapR = pl.x + pl.w - left;
        if (overlapL < overlapR && overlapL < w * 0.75) {
          if (ent.isBox) ent.x = pl.x - w;
          else ent.x = pl.x - hw;
          ent.vx = Math.min(0, ent.vx);
        } else if (overlapR < w * 0.75) {
          if (ent.isBox) ent.x = pl.x + pl.w;
          else ent.x = pl.x + pl.w + hw;
          ent.vx = Math.max(0, ent.vx);
        } else {
          if (ent.isBox) ent.y = pl.y + pl.h;
          else ent.y = pl.y + pl.h + hh;
          ent.vy = 0;
        }
        left = ent.isBox ? ent.x : ent.x - hw;
        top = ent.isBox ? ent.y : ent.y - hh;
      }
      continue;
    }
    if (ent.isBox) ent.y = pl.y - h;
    else ent.y = pl.y - hh;
    ent.vy = 0;
    ent.onGround = true;
    left = ent.isBox ? ent.x : ent.x - hw;
    top = ent.isBox ? ent.y : ent.y - hh;
  }

  left = ent.isBox ? ent.x : ent.x - hw;
  top = ent.isBox ? ent.y : ent.y - hh;
  for (const pl of blocks) {
    if (!rectOverlap(left, top, w, h, pl.x, pl.y, pl.w, pl.h)) continue;
    const feet = ent.isBox ? ent.y + h : ent.y + hh;
    if (ent.onGround && Math.abs(feet - pl.y) < 4) continue;
    const overlapL = left + w - pl.x;
    const overlapR = pl.x + pl.w - left;
    if (overlapL < overlapR) {
      if (ent.isBox) ent.x = pl.x - w;
      else ent.x = pl.x - hw;
      ent.vx = Math.min(0, ent.vx);
    } else {
      if (ent.isBox) ent.x = pl.x + pl.w;
      else ent.x = pl.x + pl.w + hw;
      ent.vx = Math.max(0, ent.vx);
    }
    left = ent.isBox ? ent.x : ent.x - hw;
  }

  if (ent.y > state.level.height + 40) {
    if (ent.isBox) {
      ent.x = state.level.width / 2;
      ent.y = 100;
      ent.vx = 0;
      ent.vy = 0;
    } else damagePlayer(ent);
  }
}

function tryPushBox(p, dt) {
  p.pushing = false;
  if (!p.onGround || Math.abs(p.vx) < 10) return;
  const hw = p.w / 2;
  const hh = p.h / 2;
  const left = p.x - hw;
  const top = p.y - hh;
  for (const box of state.level.boxes) {
    if (!rectOverlap(left, top, p.w, p.h, box.x - 2, box.y, box.w + 4, box.h)) continue;
    const dir = p.vx > 0 ? 1 : -1;
    const boxCenter = box.x + box.w / 2;
    if ((dir > 0 && p.x > boxCenter) || (dir < 0 && p.x < boxCenter)) continue;
    box.vx = dir * PUSH_SPEED;
    p.vx = dir * PUSH_SPEED;
    p.pushing = true;
    // 简单推开
    if (dir > 0) box.x = Math.max(box.x, p.x + hw);
    else box.x = Math.min(box.x, p.x - hw - box.w);
  }
}

function updateBoxes(dt) {
  for (const box of state.level.boxes) {
    box.isBox = true;
    box.kind = null;
    if (!box._pushed) box.vx *= 0.85;
    resolveEntity(box, dt, box);
    box.vx *= 0.9;
    if (Math.abs(box.vx) < 5) box.vx = 0;
  }
}

function updateLeversAndGates(dt) {
  const level = state.level;
  if (state.leverCd == null) state.leverCd = 0;
  if (state.leverCd > 0) state.leverCd -= dt;

  for (const lev of level.levers) {
    let anyNear = false;
    let keyToggle = false;
    for (const p of state.players) {
      if (p.dead) continue;
      const near =
        Math.abs(p.x - lev.x) < 40 &&
        p.y + p.h / 2 > lev.y - 58 &&
        p.y - p.h / 2 < lev.y + 12;
      if (near) {
        anyNear = true;
        const c = CTRL[p.scheme];
        if (keyPressed(c.down)) keyToggle = true;
      }
    }
    const justEnter = anyNear && !lev._held;
    lev._held = anyNear;

    // 走进拉杆即扳动（离开后再进可再扳）；也可按 S / ↓
    if ((justEnter || keyToggle) && state.leverCd <= 0) {
      lev.on = !lev.on;
      const gate = level.gates.find((g) => g.id === lev.gate);
      if (gate) gate.open = lev.on;
      state.leverCd = 0.3;
      state.shake = Math.max(state.shake, 0.12);
      state.shakeMag = Math.max(state.shakeMag || 0, 3);
    }
  }

  // 按钮：角色或箱子压住 → 开对应闸门
  for (const b of level.buttons) {
    b.pressed = false;
    for (const p of state.players) {
      if (p.dead) continue;
      const feetX = p.x - p.w / 2;
      const feetY = p.y + p.h / 2 - 6;
      if (rectOverlap(feetX, feetY, p.w, 10, b.x - 4, b.y - 8, b.w + 8, b.h + 14)) {
        b.pressed = true;
        break;
      }
    }
    if (!b.pressed) {
      for (const box of level.boxes) {
        if (
          rectOverlap(
            box.x,
            box.y + box.h - 10,
            box.w,
            14,
            b.x - 4,
            b.y - 8,
            b.w + 8,
            b.h + 14
          )
        ) {
          b.pressed = true;
          break;
        }
      }
    }
    if (b.gate) {
      const gate = level.gates.find((g) => g.id === b.gate);
      if (gate) gate.open = b.pressed;
    }
  }

  for (const g of level.gates) {
    if (g.fromButton) {
      const btn = level.buttons.find((b) => b.id === g.fromButton);
      if (btn) g.open = btn.pressed;
    }
    const targetH = g.open ? g.openH : g.closedH;
    g.h += (targetH - g.h) * 0.4;
    if (Math.abs(g.h - targetH) < 0.8) g.h = targetH;
    g.y = g.yBase + (g.closedH - g.h);
  }
}

function updatePlayer(dt, p) {
  if (p.dead) return;
  if (p.invuln > 0) p.invuln -= dt;

  const c = CTRL[p.scheme];
  let move = 0;
  if (keyDown(c.left)) move -= 1;
  if (keyDown(c.right)) move += 1;
  p.vx = move * (p.pushing ? PUSH_SPEED : MOVE_SPEED);
  if (move !== 0) p.facing = move;

  if (keyDown(c.jump) && p.onGround) {
    p.vy = JUMP_V;
    p.onGround = false;
    p._jumpHeld = true;
  }
  if (p._jumpHeld && !keyDown(c.jump)) {
    if (p.vy < -160) p.vy = -160;
    p._jumpHeld = false;
  }

  resolveEntity(p, dt);
  tryPushBox(p, dt);

  const left = p.x - p.w / 2;
  const top = p.y - p.h / 2;

  for (const liq of state.level.liquids) {
    if (!rectOverlap(left, top + p.h * 0.4, p.w, p.h * 0.6, liq.x, liq.y, liq.w, liq.h)) continue;
    const safe =
      (liq.type === "water" && p.kind === "ice") ||
      (liq.type === "lava" && p.kind === "fire");
    if (!safe) {
      damagePlayer(p);
      return;
    }
  }

  for (const gem of state.level.gems) {
    if (gem.got || gem.type !== p.kind) continue;
    if (Math.hypot(p.x - gem.x, p.y - gem.y) < 26) gem.got = true;
  }

  p.atDoor = false;
  for (const door of state.level.doors) {
    if (door.type !== p.kind) continue;
    if (rectOverlap(left, top, p.w, p.h, door.x, door.y - door.h, door.w, door.h)) {
      p.atDoor = true;
    }
  }

  if (!p.onGround) {
    p.anim = "jump";
    p.animT += dt;
    if (p.animT >= 1 / ANIM_JUMP_FPS) {
      p.animT = 0;
      if (p.vy < -80) p.frame = Math.min(3, p.frame + 1);
      else if (p.vy > 80) p.frame = Math.min(7, Math.max(4, p.frame + 1));
      else p.frame = 3;
    }
  } else if (Math.abs(p.vx) > 15) {
    p.anim = "run";
    p.animT += dt;
    if (p.animT >= 1 / ANIM_RUN_FPS) {
      p.animT = 0;
      p.frame = (p.frame + 1) % 8;
    }
  } else {
    p.anim = "idle";
    p.frame = 0;
    p.animT = 0;
  }
}

function gemsRemaining(kind) {
  return state.level.gems.filter((g) => g.type === kind && !g.got).length;
}

function checkWin() {
  const [ice, fire] = state.players;
  if (ice.dead || fire.dead) return false;
  if (!ice.atDoor || !fire.atDoor) return false;
  if (gemsRemaining("ice") > 0 || gemsRemaining("fire") > 0) return false;
  return true;
}

/* ========== 绘制：与其他模式统一的纸色神庙 ========== */

function drawTempleBg(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 淡网格，贴近主菜单/其他模式氛围
  ctx.strokeStyle = "rgba(26,26,26,0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 远景浅色砖纹
  ctx.strokeStyle = "rgba(26,26,26,0.06)";
  const bw = 44;
  const bh = 22;
  for (let row = 0, yy = 40; yy < h - 40; row++, yy += bh) {
    const ox = row % 2 === 0 ? 0 : bw / 2;
    for (let xx = 20 - ox; xx < w - 20; xx += bw) {
      ctx.strokeRect(xx + 0.5, yy + 0.5, bw - 2, bh - 2);
    }
  }
}

function drawSolid(s) {
  ctx.fillStyle = "#ebe4d6";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(s.x, s.y, s.w, s.h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f2efe6";
  ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, Math.min(8, s.h - 4));
  if (s.w > 60 && s.h >= WALL - 4) {
    ctx.strokeStyle = "rgba(26,26,26,0.12)";
    ctx.lineWidth = 1;
    for (let x = s.x + 28; x < s.x + s.w - 8; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, s.y + 2);
      ctx.lineTo(x, s.y + s.h - 2);
      ctx.stroke();
    }
  }
}

function drawVine(x, y) {
  ctx.strokeStyle = "#3a8f6e";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 6, y + 10, x - 2, y + 18);
  ctx.stroke();
  ctx.fillStyle = "#4a9a72";
  for (let i = 0; i < 3; i++) {
    const lx = x + (i - 1) * 5;
    const ly = y + 4 + i * 5;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 4, 2.5, -0.4 + i * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function liquidColors(type) {
  if (type === "water") return { a: "#7ab8d8", b: "#3a7aaa", glow: "rgba(90,160,200,0.25)" };
  if (type === "lava") return { a: "#e87848", b: "#c45c26", glow: "rgba(196,92,38,0.22)" };
  return { a: "#6aaa7a", b: "#3a8f6e", glow: "rgba(58,143,110,0.22)" };
}

function drawLiquid(liq, t) {
  const c = liquidColors(liq.type);
  ctx.fillStyle = c.glow;
  ctx.fillRect(liq.x - 2, liq.y - 4, liq.w + 4, liq.h + 6);
  const g = ctx.createLinearGradient(0, liq.y, 0, liq.y + liq.h);
  g.addColorStop(0, c.a);
  g.addColorStop(1, c.b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(liq.x, liq.y + 5);
  for (let x = 0; x <= liq.w; x += 5) {
    ctx.lineTo(liq.x + x, liq.y + Math.sin(x * 0.22 + t * 5 + liq.x) * 2.8);
  }
  ctx.lineTo(liq.x + liq.w, liq.y + liq.h);
  ctx.lineTo(liq.x, liq.y + liq.h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawGem(gem, t) {
  if (gem.got) return;
  const bob = Math.sin(t * 3.2 + gem.x * 0.04) * 3.5;
  const col = gem.type === "ice" ? "#5ec8ff" : "#e87848";
  ctx.save();
  ctx.translate(gem.x, gem.y + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = col;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-7, -7, 14, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillRect(-4, -4, 5, 5);
  ctx.restore();
}

function drawDoor(door) {
  const isFire = door.type === "fire";
  const col = isFire ? "#c45c26" : "#3a6ea5";
  const top = door.y - door.h;
  ctx.fillStyle = "#e4ddd0";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(door.x - 6, door.y);
  ctx.lineTo(door.x - 6, top + 18);
  ctx.quadraticCurveTo(door.x + door.w / 2, top - 10, door.x + door.w + 6, top + 18);
  ctx.lineTo(door.x + door.w + 6, door.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(door.x + 4, door.y);
  ctx.lineTo(door.x + 4, top + 22);
  ctx.quadraticCurveTo(door.x + door.w / 2, top + 2, door.x + door.w - 4, top + 22);
  ctx.lineTo(door.x + door.w - 4, door.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(26,26,26,0.18)";
  ctx.fillRect(door.x + 12, top + 28, door.w - 24, door.h - 36);
  ctx.fillStyle = "#f2efe6";
  ctx.font = "bold 18px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(isFire ? "♂" : "♀", door.x + door.w / 2, top + door.h * 0.55);
}

function drawLever(lev) {
  const baseY = lev.y;
  ctx.fillStyle = "#ebe4d6";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(lev.x - 10, baseY - 6, 20, 8);
  ctx.strokeRect(lev.x - 10, baseY - 6, 20, 8);
  ctx.save();
  ctx.translate(lev.x, baseY - 4);
  ctx.rotate(lev.on ? 0.55 : -0.55);
  ctx.strokeStyle = lev.color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -28);
  ctx.stroke();
  ctx.fillStyle = lev.color;
  ctx.beginPath();
  ctx.arc(0, -28, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawButton(b) {
  const h = b.pressed ? 5 : 10;
  const y = b.y + (10 - h);
  ctx.fillStyle = b.pressed ? "#3a8f6e" : "#e8e0d2";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(b.x, y, b.w, h);
  ctx.strokeRect(b.x, y, b.w, h);
  if (!b.pressed) {
    ctx.fillStyle = "#3a8f6e";
    ctx.fillRect(b.x + b.w / 2 - 4, y + 2, 8, 4);
  }
}

function drawGate(g) {
  if (g.h < 8) return;
  ctx.fillStyle = "#d7cebf";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  ctx.strokeRect(g.x, g.y, g.w, g.h);
  ctx.fillStyle = "#e8e0d2";
  for (let y = g.y + 6; y < g.y + g.h - 4; y += 12) {
    ctx.fillRect(g.x + 3, y, g.w - 6, 3);
  }
  ctx.fillStyle = "#c45c26";
  ctx.fillRect(g.x - 2, g.y, g.w + 4, 4);
}

function drawBox(box) {
  ctx.fillStyle = "#e4ddd0";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = "#c45c26";
  const c = 7;
  ctx.fillRect(box.x + 2, box.y + 2, c, c);
  ctx.fillRect(box.x + box.w - c - 2, box.y + 2, c, c);
  ctx.fillRect(box.x + 2, box.y + box.h - c - 2, c, c);
  ctx.fillRect(box.x + box.w - c - 2, box.y + box.h - c - 2, c, c);
  ctx.strokeStyle = "rgba(26,26,26,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(box.x + 4, box.y + 4);
  ctx.lineTo(box.x + box.w - 4, box.y + box.h - 4);
  ctx.moveTo(box.x + box.w - 4, box.y + 4);
  ctx.lineTo(box.x + 4, box.y + box.h - 4);
  ctx.stroke();
}

function drawPlayerSprite(p) {
  if (p.dead) return;
  const sheet = p.sheet;
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;

  ctx.save();
  ctx.translate(p.x, p.y + p.h / 2);
  if (p.anim !== "idle" && p.facing < 0) ctx.scale(-1, 1);

  const drawH = sheet.cellH * DRAW_SCALE;
  const drawW = sheet.cellW * DRAW_SCALE;

  if (p.anim === "idle") {
    const iw = sheet.idleW * DRAW_SCALE;
    const ih = sheet.idleH * DRAW_SCALE;
    ctx.drawImage(sheet.idleImg, -iw / 2, -ih, iw, ih);
  } else {
    const row = p.anim === "jump" ? sheet.jumpRow : sheet.runRow;
    const col = p.frame % sheet.cols;
    ctx.drawImage(
      sheet.animImg,
      col * sheet.cellW,
      row * sheet.cellH,
      sheet.cellW,
      sheet.cellH,
      -drawW / 2,
      -drawH,
      drawW,
      drawH
    );
  }
  ctx.restore();
}

function drawTimer() {
  const viewW = window.innerWidth;
  const sec = Math.floor(state.time);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const text = `${mm}:${ss}`;

  const cx = viewW / 2;
  const cy = 28;
  ctx.save();
  ctx.fillStyle = "rgba(242,239,230,0.94)";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(cx - 48, cy - 14, 96, 28, 6);
  else ctx.rect(cx - 48, cy - 14, 96, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3a8f6e";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + i * 18, cy - 14, 7, 4, i * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 16px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  updateView();
  const { scale, ox, oy } = state.view;

  // 外侧与主视觉一致的纸色
  const outer = ctx.createLinearGradient(0, 0, 0, viewH);
  outer.addColorStop(0, "#ebe4d6");
  outer.addColorStop(1, "#d9d0c0");
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, viewW, viewH);

  let sx = 0;
  let sy = 0;
  if (state.shake > 0) {
    const m = state.shakeMag || 5;
    sx = (Math.random() - 0.5) * m;
    sy = (Math.random() - 0.5) * m;
  }

  ctx.save();
  ctx.translate(ox + sx, oy + sy);
  ctx.scale(scale, scale);

  drawTempleBg(state.level.width, state.level.height);

  for (const s of state.level.solids) drawSolid(s);
  for (const [vx, vy] of state.level.vines || []) drawVine(vx, vy);
  for (const liq of state.level.liquids) drawLiquid(liq, state.time);
  for (const g of state.level.gates) drawGate(g);
  for (const b of state.level.buttons) drawButton(b);
  for (const lev of state.level.levers) drawLever(lev);
  for (const door of state.level.doors) drawDoor(door);
  for (const gem of state.level.gems) drawGem(gem, state.time);
  for (const box of state.level.boxes) drawBox(box);
  for (const p of state.players) drawPlayerSprite(p);

  // 关卡外框描边
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, state.level.width - 3, state.level.height - 3);

  ctx.restore();

  drawTimer();

  ctx.fillStyle = "rgba(26,26,26,0.55)";
  ctx.font = "12px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText(`${state.level.title || ""}  ·  关卡 ${state.stage}/${MAX_STAGES}`, 14, viewH - 14);
  if (state.level.hint) {
    ctx.fillStyle = "rgba(26,26,26,0.4)";
    ctx.fillText("走近拉杆即可扳动 · 踩下按钮开闸", 14, viewH - 32);
  }
}

function syncHud() {
  if (!els.iceGems || !state) return;
  const iceTotal = state.level.gems.filter((g) => g.type === "ice").length;
  const fireTotal = state.level.gems.filter((g) => g.type === "fire").length;
  const iceGot = state.level.gems.filter((g) => g.type === "ice" && g.got).length;
  const fireGot = state.level.gems.filter((g) => g.type === "fire" && g.got).length;
  els.iceGems.textContent = `${iceGot}/${iceTotal}`;
  els.fireGems.textContent = `${fireGot}/${fireTotal}`;
  els.stageText.textContent = `关卡 ${state.stage}/${MAX_STAGES}`;
  const [ice, fire] = state.players;
  els.iceDoor.textContent = ice.atDoor ? "已就位" : "未就位";
  els.fireDoor.textContent = fire.atDoor ? "已就位" : "未就位";
  if (els.timerText) {
    const sec = Math.floor(state.time);
    els.timerText.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }
}

function endGame(won) {
  if (state.ended) return;
  state.ended = true;
  state.won = won;
  if (!els.gameover) return;
  els.gameover.classList.remove("hidden");
  if (els.endTitle) els.endTitle.textContent = won ? "逃亡成功！" : "逃亡失败";
  if (els.resultText) {
    const sec = Math.floor(state.time);
    const t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    if (won) {
      els.resultText.textContent =
        state.stage >= MAX_STAGES
          ? `全部关卡逃出！用时 ${t}`
          : `第 ${state.stage} 关逃出（用时 ${t}），准备下一关。`;
    } else {
      els.resultText.textContent = "注意元素池、闸门与推箱。";
    }
  }
  if (els.btnRestart) {
    els.btnRestart.textContent =
      won && state.stage < MAX_STAGES ? "下一关" : "再来一局";
  }
}

function snapshotKeys() {
  state.prevKeys = Object.create(null);
  for (const k of Object.keys(keys)) state.prevKeys[k] = keys[k];
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (!state) {
    const g = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    g.addColorStop(0, "#d8e4ec");
    g.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    raf = requestAnimationFrame(tick);
    return;
  }

    if (!state.ended) {
    state.time += dt;
    if (state.shake > 0) state.shake -= dt;
    if (!state.respawning) {
      for (const p of state.players) updatePlayer(dt, p);
      updateBoxes(dt);
      updateLeversAndGates(dt);
      syncHud();
      if (checkWin()) endGame(true);
    }
    snapshotKeys();
  }

  render();
  raf = requestAnimationFrame(tick);
}

function showOverlay() {
  els.overlay?.classList.remove("hidden");
  els.hud?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
function hideOverlay() {
  els.overlay?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
}

async function beginGame(stage = 1) {
  await ensureAssets();
  initState(stage);
  hideOverlay();
  els.gameover?.classList.add("hidden");
  if (els.hint) {
    els.hint.textContent = state.level.hint || "";
    els.hint.classList.remove("hidden");
    setTimeout(() => els.hint?.classList.add("hidden"), 3500);
  }
  syncHud();
}

function onRestart() {
  if (!state) {
    beginGame(1);
    return;
  }
  if (state.won && state.stage < MAX_STAGES) beginGame(state.stage + 1);
  else beginGame(state.won ? 1 : state.stage);
}

export function startIcefire({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  keys = Object.create(null);
  offAll();
  resize();

  on(window, "resize", resize);
  on(window, "keydown", (ev) => {
    keys[ev.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
  });
  on(window, "keyup", (ev) => {
    keys[ev.code] = false;
  });
  on(els.btnStart, "click", () => beginGame(1));
  on(els.btnRestart, "click", onRestart);

  // 选中模式后直接开局，跳过说明页
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  beginGame(1);
  raf = requestAnimationFrame(tick);
}

export function stopIcefire() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hint?.classList.add("hidden");
}
