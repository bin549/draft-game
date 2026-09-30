/**
 * 逃亡模式 — 森林神庙双人解谜（参考经典冰火人关卡）
 * P1 冰女：WASD / 空格跳 · 靠近拉杆按 S 扳动
 * P2 火女：方向键 / ↑跳 · 靠近拉杆按 ↓ 扳动
 */

const META_SRC = "assets/player/icefire/meta.json";
const GRAVITY = 1950;
const JUMP_V = -820;
const MOVE_SPEED = 220;
const PUSH_SPEED = 145;
const ANIM_RUN_FPS = 12;
const ANIM_JUMP_FPS = 14;
const ANIM_IDLE_FPS = 8;
const INVULN = 1.0;
const MAX_STAGES = 3;
const DRAW_SCALE = 0.48;
const BODY_W = 26;
const BODY_H = 48;
const BOX_SIZE = 40;
const WALL = 36;
/** 陷阱液面高度（底下仍是地面砖） */
const LIQ_DEPTH = 16;

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

function loadImage(src, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      reject(new Error("timeout: " + src));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("load failed: " + src));
    };
    img.src = encodeURI(src);
  });
}

async function ensureAssets() {
  if (assets) return assets;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const meta = await fetch(META_SRC + "?v=20260930uniscale").then((r) => r.json());
    assets = {
      blue: {
        ...meta.blue,
        sheetImg: await loadImage(meta.blue.sheet + "?v=10"),
      },
      red: {
        ...meta.red,
        sheetImg: await loadImage(meta.red.sheet + "?v=10"),
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
function gate(id, x, platY, h = 72, fromButton = null) {
  return {
    id,
    x,
    y: platY - h,
    w: 20,
    h,
    closedH: h,
    openH: 6,
    open: false,
    ...(fromButton ? { fromButton } : {}),
  };
}

/** 陷阱底下保留/补齐地面，不再整块挖空 */
function ensureGroundUnderLiquids(solids, liquids) {
  const out = solids.map((s) => ({ ...s }));
  for (const liq of liquids) {
    const covered = out.some(
      (s) =>
        s.y <= liq.y + 2 &&
        s.y + s.h >= liq.y + liq.h - 2 &&
        s.x <= liq.x + 2 &&
        s.x + s.w >= liq.x + liq.w - 2
    );
    if (!covered) {
      out.push({ x: liq.x, y: liq.y, w: liq.w, h: liq.h });
    }
  }
  return out;
}

function liquidSurface(liq) {
  const h = Math.min(LIQ_DEPTH, liq.h);
  return { x: liq.x, y: liq.y, w: liq.w, h };
}

/** 伤害判定：贴着液面才算踩中；腾空越过液面以上不受伤 */
function liquidHitbox(liq) {
  const h = Math.min(LIQ_DEPTH, liq.h) + 6;
  return { x: liq.x, y: liq.y - 2, w: liq.w, h };
}

function buildLevel(stage) {
  const W = 1100;
  const H = 720;
  const T = WALL;
  const cy = (platY) => platY - BODY_H / 2;
  // 闸门只填平台缝，高度略小于层距，避免穿进上层
  // （gate 已提取到外层）

  let level;
  if (stage === 1) {
    // 教学关：左右竖井下落 · 陷阱仅液面，底下仍是地面
    level = {
      width: W,
      height: H,
      title: "逃亡 · 入门",
      hint: "内侧缺口下落 · 齐进双门即可通关",
      spawn: { ice: [120, cy(140)], fire: [980, cy(140)] },
      solids: [
        { x: 0, y: 0, w: W, h: T },
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: T, y: 140, w: 170, h: T },
        { x: 300, y: 140, w: 500, h: T },
        { x: 900, y: 140, w: W - T - 900, h: T },
        { x: T, y: 270, w: 264, h: T },
        { x: 380, y: 270, w: 340, h: T },
        { x: 820, y: 270, w: W - T - 820, h: T },
        { x: T, y: 400, w: 284, h: T },
        { x: 400, y: 400, w: 300, h: T },
        { x: 800, y: 400, w: W - T - 800, h: T },
        { x: T, y: 530, w: 264, h: T },
        { x: 380, y: 530, w: 340, h: T },
        { x: 820, y: 530, w: W - T - 820, h: T },
        { x: T, y: 660, w: 220, h: T },
        { x: 420, y: 660, w: 260, h: T },
        { x: 860, y: 660, w: W - T - 860, h: T },
      ],
      liquids: [
        { type: "water", x: 340, y: 140, w: 70, h: T },
        { type: "goo", x: 520, y: 140, w: 70, h: T },
        { type: "lava", x: 690, y: 140, w: 70, h: T },
        { type: "goo", x: 500, y: 270, w: 60, h: T },
        { type: "water", x: 440, y: 400, w: 70, h: T },
        { type: "lava", x: 580, y: 400, w: 70, h: T },
        { type: "goo", x: 500, y: 530, w: 60, h: T },
        { type: "lava", x: 256, y: 660, w: 164, h: T },
        { type: "water", x: 680, y: 660, w: 180, h: T },
      ],
      gems: [
        // 全部放在侧道可触达处
        { type: "ice", x: 120, y: 100, got: false },
        { type: "fire", x: 970, y: 100, got: false },
        { type: "ice", x: 150, y: 230, got: false },
        { type: "fire", x: 960, y: 230, got: false },
        { type: "ice", x: 160, y: 360, got: false },
        { type: "fire", x: 940, y: 360, got: false },
        { type: "ice", x: 150, y: 490, got: false },
        { type: "fire", x: 960, y: 490, got: false },
        { type: "ice", x: 140, y: 620, got: false },
        { type: "fire", x: 950, y: 620, got: false },
      ],
      doors: [
        { type: "fire", x: 70, y: 660, w: 64, h: 78 },
        { type: "ice", x: 950, y: 660, w: 64, h: 78 },
      ],
      levers: [],
      gates: [],
      buttons: [],
      boxes: [],
      vines: [
        [80, 140], [500, 140], [940, 140], [150, 270], [900, 270],
        [180, 400], [500, 530], [120, 660], [950, 660],
      ],
    };
  } else if (stage === 2) {
    level = {
      width: W,
      height: H,
      title: "逃亡 · 机关",
      hint: "内侧缺口下落 · 拉杆开闸 · 齐进双门即可通关",
      spawn: { ice: [120, cy(140)], fire: [980, cy(140)] },
      solids: [
        { x: 0, y: 0, w: W, h: T },
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: T, y: 140, w: 170, h: T },
        { x: 300, y: 140, w: 500, h: T },
        { x: 900, y: 140, w: W - T - 900, h: T },
        { x: T, y: 270, w: 264, h: T },
        { x: 380, y: 270, w: 340, h: T },
        { x: 820, y: 270, w: W - T - 820, h: T },
        { x: T, y: 400, w: 360, h: T },
        { x: 500, y: 400, w: 240, h: T },
        { x: 840, y: 400, w: W - T - 840, h: T },
        { x: T, y: 530, w: 300, h: T },
        { x: 420, y: 530, w: 280, h: T },
        { x: 800, y: 530, w: W - T - 800, h: T },
        { x: T, y: 660, w: 220, h: T },
        { x: 420, y: 660, w: 260, h: T },
        { x: 860, y: 660, w: W - T - 860, h: T },
      ],
      liquids: [
        { type: "goo", x: 520, y: 140, w: 70, h: T },
        { type: "lava", x: 360, y: 530, w: 60, h: T },
        { type: "water", x: 700, y: 530, w: 100, h: T },
        { type: "lava", x: 256, y: 660, w: 164, h: T },
        { type: "water", x: 680, y: 660, w: 180, h: T },
      ],
      gems: [
        { type: "ice", x: 120, y: 100, got: false },
        { type: "fire", x: 970, y: 100, got: false },
        { type: "ice", x: 150, y: 230, got: false },
        { type: "fire", x: 960, y: 230, got: false },
        { type: "ice", x: 180, y: 360, got: false },
        { type: "fire", x: 920, y: 360, got: false },
        { type: "ice", x: 160, y: 490, got: false },
        { type: "fire", x: 940, y: 490, got: false },
        { type: "ice", x: 140, y: 620, got: false },
        { type: "fire", x: 950, y: 620, got: false },
      ],
      doors: [
        { type: "fire", x: 70, y: 660, w: 64, h: 78 },
        { type: "ice", x: 950, y: 660, w: 64, h: 78 },
      ],
      levers: [
        { id: "L1", x: 160, y: 400, on: false, gate: "G1", color: "#5a9a4a" },
      ],
      gates: [
        gate("G1", 458, 400, 70),
        gate("G2", 740, 530, 70, "B1"),
      ],
      buttons: [
        { id: "B1", x: 880, y: 530 - 10, w: 48, h: 10, pressed: false, gate: "G2" },
      ],
      boxes: [{ x: 940, y: 530 - BOX_SIZE, w: BOX_SIZE, h: BOX_SIZE, vx: 0, vy: 0 }],
      vines: [
        [90, 140], [500, 140], [940, 140], [150, 270], [900, 270],
        [200, 400], [500, 530], [120, 660], [950, 660],
      ],
    };
  } else {
    level = {
      width: W,
      height: H,
      title: "逃亡 · 试炼",
      hint: "内侧缺口下落 · 双拉杆 + 推箱 · 齐进双门即可通关",
      spawn: { ice: [120, cy(140)], fire: [980, cy(140)] },
      solids: [
        { x: 0, y: 0, w: W, h: T },
        { x: 0, y: H - T, w: W, h: T },
        { x: 0, y: 0, w: T, h: H },
        { x: W - T, y: 0, w: T, h: H },
        { x: T, y: 140, w: 170, h: T },
        { x: 300, y: 140, w: 500, h: T },
        { x: 900, y: 140, w: W - T - 900, h: T },
        { x: T, y: 270, w: 264, h: T },
        { x: 380, y: 270, w: 340, h: T },
        { x: 820, y: 270, w: W - T - 820, h: T },
        { x: T, y: 400, w: 300, h: T },
        { x: 420, y: 400, w: 260, h: T },
        { x: 800, y: 400, w: W - T - 800, h: T },
        { x: T, y: 530, w: 300, h: T },
        { x: 420, y: 530, w: 280, h: T },
        { x: 800, y: 530, w: W - T - 800, h: T },
        { x: T, y: 660, w: 220, h: T },
        { x: 420, y: 660, w: 260, h: T },
        { x: 860, y: 660, w: W - T - 860, h: T },
      ],
      liquids: [
        { type: "goo", x: 520, y: 140, w: 70, h: T },
        { type: "water", x: 336, y: 400, w: 84, h: T },
        { type: "lava", x: 680, y: 400, w: 120, h: T },
        { type: "goo", x: 500, y: 400, w: 60, h: T },
        { type: "lava", x: 320, y: 530, w: 100, h: T },
        { type: "water", x: 700, y: 530, w: 100, h: T },
        { type: "lava", x: 256, y: 660, w: 164, h: T },
        { type: "water", x: 680, y: 660, w: 180, h: T },
      ],
      gems: [
        { type: "ice", x: 120, y: 100, got: false },
        { type: "fire", x: 970, y: 100, got: false },
        { type: "ice", x: 150, y: 230, got: false },
        { type: "fire", x: 960, y: 230, got: false },
        { type: "ice", x: 180, y: 360, got: false },
        { type: "fire", x: 920, y: 360, got: false },
        { type: "ice", x: 160, y: 490, got: false },
        { type: "fire", x: 940, y: 490, got: false },
        { type: "ice", x: 140, y: 620, got: false },
        { type: "fire", x: 950, y: 620, got: false },
      ],
      doors: [
        { type: "fire", x: 70, y: 660, w: 64, h: 78 },
        { type: "ice", x: 950, y: 660, w: 64, h: 78 },
      ],
      levers: [
        { id: "L1", x: 160, y: 400, on: false, gate: "G1", color: "#5a9a4a" },
        { id: "L2", x: 920, y: 400, on: false, gate: "G2", color: "#a45a9a" },
      ],
      gates: [
        gate("G1", 380, 270, 70),
        gate("G2", 740, 400, 70),
        gate("G3", 740, 530, 70, "B1"),
      ],
      buttons: [
        { id: "B1", x: 880, y: 530 - 10, w: 48, h: 10, pressed: false, gate: "G3" },
      ],
      boxes: [{ x: 940, y: 530 - BOX_SIZE, w: BOX_SIZE, h: BOX_SIZE, vx: 0, vy: 0 }],
      vines: [
        [80, 140], [500, 140], [940, 140], [150, 270], [900, 270],
        [200, 400], [500, 530], [120, 660], [950, 660],
      ],
    };
  }

  level.solids = ensureGroundUnderLiquids(level.solids, level.liquids);
  return level;
}

function initState(stage = 1) {
  const level = buildLevel(stage);

  for (const g of level.gates) {
    g.yBase = g.y;
    g.h = g.open ? g.openH : g.closedH;
    if (!g.open) g.y = g.yBase;
    else g.y = g.yBase + (g.closedH - g.openH);
  }
  for (const d of level.doors) d.openT = 0;

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
    const feet = ent.isBox ? ent.y + h : ent.y + hh;
    // 上跳蹭到平台上沿时优先落板，避免卡在角上
    if (
      !ent.isBox &&
      ent.vy < 0 &&
      feet > pl.y - 4 &&
      feet < pl.y + 22 &&
      ent.y <= pl.y + 8
    ) {
      ent.y = pl.y - hh;
      ent.vy = 0;
      ent.onGround = true;
      left = ent.x - hw;
      top = ent.y - hh;
      continue;
    }
    if (ent.vy < 0 || prevBottom > pl.y + 14) {
      if (ent.vy < 0) {
        const overlapL = left + w - pl.x;
        const overlapR = pl.x + pl.w - left;
        const overlapT = top + h - pl.y;
        const overlapB = pl.y + pl.h - top;
        // 重叠更像顶头时做天花板，否则侧推
        if (overlapB <= overlapL && overlapB <= overlapR && overlapB <= overlapT) {
          if (ent.isBox) ent.y = pl.y + pl.h;
          else ent.y = pl.y + pl.h + hh;
          ent.vy = 0;
        } else if (overlapL < overlapR && overlapL < w * 0.75) {
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
    const feet = p.y + p.h / 2;
    // 脚已明显高于液面 = 跳过去，不判伤
    if (feet < liq.y - 8) continue;
    const hit = liquidHitbox(liq);
    if (!rectOverlap(left, feet - 6, p.w, 10, hit.x, hit.y, hit.w, hit.h)) continue;
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
    // 门判定略放宽：脚下平台附近整扇门框均可
    const dx = door.x - 10;
    const dy = door.y - door.h - 8;
    const dw = door.w + 20;
    const dh = door.h + 16;
    if (rectOverlap(left, top, p.w, p.h, dx, dy, dw, dh)) {
      p.atDoor = true;
    }
  }

  if (!p.onGround) {
    p.anim = "jump";
    p.animT += dt;
    const jumpFrames = p.sheet.jumpFrames || 8;
    if (p.animT >= 1 / ANIM_JUMP_FPS) {
      p.animT = 0;
      const mid = Math.floor((jumpFrames - 1) / 2);
      if (p.vy < -80) p.frame = Math.min(mid, p.frame + 1);
      else if (p.vy > 80) p.frame = Math.min(jumpFrames - 1, Math.max(mid + 1, p.frame + 1));
      else p.frame = mid;
    }
  } else if (Math.abs(p.vx) > 15) {
    p.anim = "run";
    p.animT += dt;
    const runFrames = p.sheet.runFrames || p.sheet.cols || 8;
    if (p.animT >= 1 / ANIM_RUN_FPS) {
      p.animT = 0;
      p.frame = (p.frame + 1) % runFrames;
    }
  } else {
    if (p.anim !== "idle") {
      p.anim = "idle";
      p.frame = 0;
      p.animT = 0;
    }
    p.animT += dt;
    const idleFrames = p.sheet.idleFrames || 1;
    if (p.animT >= 1 / ANIM_IDLE_FPS) {
      p.animT = 0;
      p.frame = (p.frame + 1) % idleFrames;
    }
  }
}

function gemsRemaining(kind) {
  return state.level.gems.filter((g) => g.type === kind && !g.got).length;
}

function updateDoors(dt) {
  for (const door of state.level.doors) {
    if (door.openT == null) door.openT = 0;
    const p = state.players.find((pl) => pl.kind === door.type);
    const want = p && p.atDoor && !p.dead ? 1 : 0;
    const speed = want ? 2.4 : 3.2;
    if (want > door.openT) door.openT = Math.min(1, door.openT + dt * speed);
    else if (want < door.openT) door.openT = Math.max(0, door.openT - dt * speed);
  }
}

function checkWin() {
  const [ice, fire] = state.players;
  if (ice.dead || fire.dead) return false;
  if (!ice.atDoor || !fire.atDoor) return false;
  // 双门开到位后再结算胜利
  return state.level.doors.every((d) => (d.openT || 0) >= 0.92);
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
  const depth = Math.min(LIQ_DEPTH, liq.h);
  const x0 = liq.x;
  const x1 = liq.x + liq.w;
  const top = liq.y;
  const bot = liq.y + depth;

  // 不透明嵌进砖面：盖住顶边黑线，看起来是挖在地面里而非叠在上面
  ctx.fillStyle = c.b;
  ctx.fillRect(x0, top - 1.5, liq.w, depth + 1.5);

  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, c.a);
  g.addColorStop(0.65, c.b);
  g.addColorStop(1, c.b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, bot);
  ctx.lineTo(x0, top + 1);
  for (let x = 0; x <= liq.w; x += 3) {
    ctx.lineTo(x0 + x, top + Math.sin(x * 0.3 + t * 5 + liq.x) * 2.2);
  }
  ctx.lineTo(x1, bot);
  ctx.closePath();
  ctx.fill();

  // 坑壁：左右竖边接到砖里
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, top - 1);
  ctx.lineTo(x0 + 0.5, bot);
  ctx.moveTo(x1 - 0.5, top - 1);
  ctx.lineTo(x1 - 0.5, bot);
  ctx.stroke();

  // 液面描边（取代该段平台顶边）
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, top + 1);
  for (let x = 0; x <= liq.w; x += 3) {
    ctx.lineTo(x0 + x, top + Math.sin(x * 0.3 + t * 5 + liq.x) * 2.2);
  }
  ctx.stroke();

  // 与下层砖的分界
  ctx.strokeStyle = "rgba(26,26,26,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, bot - 0.5);
  ctx.lineTo(x1, bot - 0.5);
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
  const open = Math.max(0, Math.min(1, door.openT || 0));
  // 门框
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

  // 门洞（开启后露出）
  ctx.fillStyle = open > 0.05 ? "rgba(26,26,26,0.45)" : col;
  ctx.beginPath();
  ctx.moveTo(door.x + 4, door.y);
  ctx.lineTo(door.x + 4, top + 22);
  ctx.quadraticCurveTo(door.x + door.w / 2, top + 2, door.x + door.w - 4, top + 22);
  ctx.lineTo(door.x + door.w - 4, door.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 双扇门向外打开
  const leafW = (door.w - 8) / 2;
  const leafH = door.h - 26;
  const leafY = top + 22;
  const swing = open * 0.92;
  // 左扇
  ctx.save();
  ctx.translate(door.x + 4, leafY);
  ctx.transform(Math.cos(swing), 0, Math.sin(swing) * 0.15, 1, 0, 0);
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, leafW * (1 - open * 0.15), leafH);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, leafW * (1 - open * 0.15) - 1, leafH - 1);
  ctx.restore();
  // 右扇
  ctx.save();
  ctx.translate(door.x + door.w - 4, leafY);
  ctx.transform(Math.cos(swing), 0, -Math.sin(swing) * 0.15, 1, 0, 0);
  ctx.fillStyle = col;
  ctx.fillRect(-leafW * (1 - open * 0.15), 0, leafW * (1 - open * 0.15), leafH);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-leafW * (1 - open * 0.15) + 0.5, 0.5, leafW * (1 - open * 0.15) - 1, leafH - 1);
  ctx.restore();

  if (open < 0.35) {
    ctx.fillStyle = "#f2efe6";
    ctx.font = "bold 18px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.globalAlpha = 1 - open / 0.35;
    ctx.fillText(isFire ? "♂" : "♀", door.x + door.w / 2, top + door.h * 0.55);
    ctx.globalAlpha = 1;
  } else {
    // 开启闪光
    ctx.fillStyle = `rgba(242,239,230,${0.15 + open * 0.25})`;
    ctx.fillRect(door.x + 10, top + 28, door.w - 20, door.h - 40);
  }
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
  if (!sheet?.sheetImg) return;
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;

  ctx.save();
  ctx.translate(p.x, p.y + p.h / 2);
  if (p.facing < 0) ctx.scale(-1, 1);

  const drawH = sheet.cellH * DRAW_SCALE;
  const drawW = sheet.cellW * DRAW_SCALE;
  let row = sheet.runRow ?? 1;
  let frames = sheet.runFrames || sheet.cols || 8;
  if (p.anim === "idle") {
    row = sheet.idleRow ?? 0;
    frames = sheet.idleFrames || frames;
  } else if (p.anim === "jump") {
    row = sheet.jumpRow ?? 2;
    frames = sheet.jumpFrames || frames;
  }
  const col = ((p.frame % frames) + frames) % frames;

  ctx.drawImage(
    sheet.sheetImg,
    col * sheet.cellW,
    row * sheet.cellH,
    sheet.cellW,
    sheet.cellH,
    -drawW / 2,
    -drawH,
    drawW,
    drawH
  );
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
      updateDoors(dt);
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

export async function startIcefire({ canvas: c, els: e }) {
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

  // 选中模式后直接开局，跳过说明页；等资源就绪再开跑，避免空白渐变
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  await beginGame(1);
  if (!running) return;
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
