/**
 * 划水模式 — 卷轴河面 · 上下左右位移 · 躲避右侧障碍
 */

const PLAYER_SRC = "assets/player/paddle.png";
const CAPSIZE_SRC = "assets/player/capsize.png";
const SHEET_COLS = 4;
const SHEET_ROWS = 4;
const FRAME_COUNT = 16;
const ANIM_FPS = 12;
/** 翻船失败：前 6 帧（翘船→竖起→抛出→落水） */
const FAIL_SEQ = [0, 1, 2, 3, 4, 5];
/** 再来一局：后 10 帧（攀船→趴稳→翻正） */
const RECOVER_SEQ = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const CAPSIZE_FPS = 11;

const BASE_SCROLL = 160;
const MAX_SCROLL = 420;
const MOVE_SPEED_X = 220;
const MOVE_SPEED_Y = 240;
const PLAYER_SCALE = 0.48;
const CAPSIZE_SCALE = 0.42;
const INVULN_TIME = 1.1;
const SPAWN_BASE = 1.35;
const SPAWN_MIN = 0.55;

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];

let playerSheet = null;
let capsizeSheet = null;
let frameW = 0;
let frameH = 0;
let capFrameW = 0;
let capFrameH = 0;
let assetsReady = false;
let loadPromise = null;

function on(target, type, fn) {
  target.addEventListener(type, fn);
  listeners.push([target, type, fn]);
}

function offAll() {
  for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  listeners = [];
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

function toCanvas(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cctx = c.getContext("2d");
  cctx.drawImage(img, 0, 0);
  return c;
}

/** 从四角洪水填充抠掉纯黑背景，保留角色黑发黑衣 */
function keyOutBlack(img) {
  const c = toCanvas(img);
  const cctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  const data = cctx.getImageData(0, 0, w, h);
  const px = data.data;
  const seen = new Uint8Array(w * h);
  const stack = [];

  const isBg = (i) => {
    const o = i * 4;
    return px[o] <= 8 && px[o + 1] <= 8 && px[o + 2] <= 8 && px[o + 3] > 0;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || !isBg(i)) return;
    seen[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < w; x += 2) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 2) {
    push(0, y);
    push(w - 1, y);
  }

  while (stack.length) {
    const i = stack.pop();
    px[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  cctx.putImageData(data, 0, 0);
  return c;
}

/** 擦掉每帧左上角序号 1–16 */
function stripFrameNumbers(sheet) {
  const fw = Math.floor(sheet.width / SHEET_COLS);
  const fh = Math.floor(sheet.height / SHEET_ROWS);
  const cctx = sheet.getContext("2d");
  const padX = Math.floor(fw * 0.22);
  const padY = Math.floor(fh * 0.28);
  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      cctx.clearRect(col * fw + 2, row * fh + 2, padX, padY);
    }
  }
  return sheet;
}

function ensureAssets() {
  if (assetsReady) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([loadImage(PLAYER_SRC), loadImage(CAPSIZE_SRC)]).then(
    ([playerRaw, capsizeRaw]) => {
      playerSheet = stripFrameNumbers(keyOutBlack(playerRaw));
      frameW = Math.floor(playerSheet.width / SHEET_COLS);
      frameH = Math.floor(playerSheet.height / SHEET_ROWS);
      capsizeSheet = stripFrameNumbers(keyOutBlack(capsizeRaw));
      capFrameW = Math.floor(capsizeSheet.width / SHEET_COLS);
      capFrameH = Math.floor(capsizeSheet.height / SHEET_ROWS);
      assetsReady = true;
    }
  );
  return loadPromise;
}

function waterBand(h) {
  // 航道压在近景河面偏下，避免船贴山坡
  const top = h * 0.72;
  const bottom = h * 0.92;
  return { top, bottom, mid: (top + bottom) * 0.55 };
}

function createState() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const band = waterBand(h);
  const drawH = frameH * PLAYER_SCALE || 120;
  const drawW = frameW * PLAYER_SCALE || 240;
  return {
    time: 0,
    distance: 0,
    score: 0,
    best: loadBest(),
    scrollSpeed: BASE_SCROLL,
    player: {
      x: w * 0.22,
      y: band.mid,
      w: drawW * 0.72,
      h: drawH * 0.38,
      vx: 0,
      vy: 0,
      hp: 1,
      maxHp: 1,
      invuln: 1.2,
      grace: 1.2, // 开局无敌不闪烁
      anim: 0,
      frame: 0,
    },
    obstacles: [],
    particles: [],
    floatTexts: [],
    spawnTimer: 1.6,
    shake: 0,
    gameOver: false,
    capsizing: false,
    recovering: false,
    transition: null,
    capsize: {
      t: 0,
      index: 0,
      done: false,
      hold: 0,
      seq: FAIL_SEQ,
      mode: "fail",
    },
  };
}

function loadBest() {
  try {
    const n = Number(localStorage.getItem("stickman-paddle-best") || 0);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function saveBest(score) {
  try {
    localStorage.setItem("stickman-paddle-best", String(score));
  } catch (_) {}
}

function spawnObstacle(w, h) {
  const band = waterBand(h);
  const kinds = ["rock", "log", "reed", "whirl"];
  const weights = [0.35, 0.3, 0.2, 0.15];
  let r = Math.random();
  let kind = kinds[0];
  for (let i = 0; i < kinds.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      kind = kinds[i];
      break;
    }
  }

  const y = band.top + 40 + Math.random() * (band.bottom - band.top - 80);
  const speedBoost = state.scrollSpeed * (0.15 + Math.random() * 0.25);

  if (kind === "rock") {
    const size = 28 + Math.random() * 22;
    state.obstacles.push({
      kind,
      x: w + 60,
      y,
      w: size * 1.4,
      h: size,
      vx: -(state.scrollSpeed + speedBoost),
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 1.2,
    });
  } else if (kind === "log") {
    const len = 70 + Math.random() * 50;
    state.obstacles.push({
      kind,
      x: w + 80,
      y,
      w: len,
      h: 18 + Math.random() * 8,
      vx: -(state.scrollSpeed + speedBoost * 0.6),
      rot: (Math.random() - 0.5) * 0.35,
      spin: 0,
    });
  } else if (kind === "reed") {
    state.obstacles.push({
      kind,
      x: w + 40,
      y,
      w: 16,
      h: 50 + Math.random() * 30,
      vx: -(state.scrollSpeed * 0.95),
      rot: 0,
      spin: 0,
      sway: Math.random() * Math.PI * 2,
    });
  } else {
    const r2 = 22 + Math.random() * 16;
    state.obstacles.push({
      kind,
      x: w + 50,
      y,
      w: r2 * 2,
      h: r2 * 2,
      r: r2,
      vx: -(state.scrollSpeed * 0.85),
      rot: 0,
      spin: 2.5,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function playerHitbox(p) {
  // 碰撞盒贴着船体中下部，略小于绘制尺寸
  return {
    x: p.x - p.w * 0.42,
    y: p.y - p.h * 0.15,
    w: p.w * 0.84,
    h: p.h * 0.7,
  };
}

function obstacleHitbox(o) {
  if (o.kind === "whirl") {
    return { x: o.x - o.r * 0.7, y: o.y - o.r * 0.7, w: o.r * 1.4, h: o.r * 1.4 };
  }
  if (o.kind === "reed") {
    return { x: o.x - o.w * 0.5, y: o.y - o.h * 0.85, w: o.w, h: o.h * 0.9 };
  }
  return { x: o.x - o.w * 0.5, y: o.y - o.h * 0.5, w: o.w, h: o.h };
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hurtPlayer(amount = 1) {
  const p = state.player;
  if (p.invuln > 0 || state.gameOver || state.capsizing || state.recovering) return;
  p.hp = 0;
  state.shake = 0.45;
  burst(p.x, p.y, "#c23b3b", 10);
  burst(p.x, p.y + 12, "#8a8175", 12);
  updateHud();
  // 撞一次即翻船
  startCapsize();
}

function startCapsize() {
  if (state.capsizing || state.gameOver || state.recovering) return;
  state.capsizing = true;
  state.recovering = false;
  state.capsize = { t: 0, index: 0, done: false, hold: 0, seq: FAIL_SEQ, mode: "fail" };
  state.shake = 0.5;
  state.player.vx = 0;
  state.player.vy = 0;
  burst(state.player.x, state.player.y + 10, "#8a8175", 14);
}

function startRecover() {
  state.recovering = true;
  state.capsizing = false;
  state.gameOver = false;
  state.capsize = { t: 0, index: 0, done: false, hold: 0, seq: RECOVER_SEQ, mode: "recover" };
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.hp = state.player.maxHp;
  state.player.frame = 0;
  state.player.anim = 0;
}

function finishCapsize() {
  if (state.gameOver) return;
  state.capsizing = false;
  state.capsize.done = true;
  state.gameOver = true;
  running = false;
  const score = Math.floor(state.score);
  if (score > state.best) {
    state.best = score;
    saveBest(score);
  }
  if (els.endTitle) els.endTitle.textContent = "翻船了";
  if (els.resultText) {
    els.resultText.textContent = `航行 ${Math.floor(state.distance)} 米 · 得分 ${score} · 最高 ${state.best}`;
  }
  els.gameover?.classList.remove("hidden");
  updateHud();
}

function finishRecover() {
  // 定格在爬起最后一帧（转场由 beginRestart 同步启动，此处不再触发）
  state.recovering = false;
  state.capsize = {
    t: 0,
    index: RECOVER_SEQ.length - 1,
    done: true,
    hold: 0,
    seq: RECOVER_SEQ,
    mode: "recover",
  };
}

function startRestartTransition() {
  const p = state.player;
  const w = window.innerWidth;
  const h = window.innerHeight;
  state.transition = {
    t: 0,
    phase: "close",
    swapped: false,
    durationClose: 1.05,
    durationOpen: 0.65,
    cx: p.x,
    cy: p.y,
    // 盖住到屏幕角所需半径
    maxR: Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y)) + 24,
  };
}

function applyPlayerSize() {
  if (!state || !frameW) return;
  const drawH = frameH * PLAYER_SCALE;
  const drawW = frameW * PLAYER_SCALE;
  state.player.w = drawW * 0.72;
  state.player.h = drawH * 0.38;
}

function resetRunPreservingTransition() {
  const tr = state.transition;
  const best = state.best;
  state = createState();
  state.best = best;
  applyPlayerSize();
  const p = state.player;
  const w = window.innerWidth;
  const h = window.innerHeight;
  state.transition = {
    ...tr,
    phase: "open",
    t: 0,
    swapped: true,
    cx: p.x,
    cy: p.y,
    maxR: Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y)) + 24,
  };
  updateHud();
}

function updateTransition(dt) {
  const tr = state.transition;
  if (!tr) return;
  tr.t += dt;
  if (tr.phase === "close") {
    if (tr.t >= tr.durationClose) {
      resetRunPreservingTransition();
    }
  } else if (tr.phase === "open") {
    if (tr.t >= tr.durationOpen) {
      state.transition = null;
      state.player.invuln = INVULN_TIME;
      state.player.grace = INVULN_TIME;
    }
  }
}

/** 虹膜过渡：黑幕中间开圆洞，圆缩小收束 / 放大散开 */
function drawTransition(w, h) {
  const tr = state?.transition;
  if (!tr) return;

  const smooth = (t) => {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  };

  const maxR = tr.maxR || Math.hypot(w, h);
  let holeR;
  if (tr.phase === "close") {
    // 洞从满屏收到 0 → 画面被黑幕吞没
    holeR = maxR * (1 - smooth(tr.t / tr.durationClose));
  } else {
    // 洞从 0 扩到满屏 → 露出新局
    holeR = maxR * smooth(tr.t / tr.durationOpen);
  }

  if (holeR >= maxR - 0.5) return; // 全开时无需遮罩

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  if (holeR > 0.5) {
    ctx.moveTo(tr.cx + holeR, tr.cy);
    ctx.arc(tr.cx, tr.cy, holeR, 0, Math.PI * 2, true);
  }
  ctx.fill("evenodd");
  ctx.restore();
}

function burst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.4,
      max: 0.75,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function floatText(x, y, text, color) {
  state.floatTexts.push({ x, y, text, color, life: 0.8 });
}

function endGame() {
  // 兼容旧调用：直接进入翻船演出
  startCapsize();
}

function updateHud() {
  if (!state || !els) return;
  if (els.hpText) els.hpText.textContent = `${state.player.hp}/${state.player.maxHp}`;
  if (els.hpFill) {
    const pct = (state.player.hp / state.player.maxHp) * 100;
    els.hpFill.style.width = `${pct}%`;
  }
  if (els.scoreText) els.scoreText.textContent = `得分 ${Math.floor(state.score)}`;
  if (els.distText) els.distText.textContent = `${Math.floor(state.distance)} m`;
  if (els.bestText) els.bestText.textContent = `最高 ${state.best}`;
}

function update(dt) {
  if (!state) return;

  // 虹膜转场；爬起动画可同时推进
  if (state.transition) {
    if (state.recovering) updateCapsize(dt);
    updateTransition(dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    return;
  }

  if (state.gameOver) return;

  // 翻船 / 再起演出：减速滚动，播完序列后结算或进入转场
  if (state.capsizing || state.recovering) {
    updateCapsize(dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const ft of state.floatTexts) {
      ft.life -= dt;
      ft.y -= 28 * dt;
    }
    state.floatTexts = state.floatTexts.filter((ft) => ft.life > 0);
    // 障碍继续漂过
    for (const o of state.obstacles) {
      o.x += o.vx * dt * 0.45;
      o.rot += (o.spin || 0) * dt;
    }
    state.obstacles = state.obstacles.filter((o) => o.x > -120);
    return;
  }

  state.time += dt;
  state.scrollSpeed = Math.min(MAX_SCROLL, BASE_SCROLL + state.time * 4.2);
  state.distance += state.scrollSpeed * dt * 0.08;
  state.score = state.distance * 2 + state.time * 5;

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const band = waterBand(h);
  const p = state.player;

  let ix = 0;
  let iy = 0;
  if (keys["KeyA"] || keys["ArrowLeft"]) ix -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) ix += 1;
  if (keys["KeyW"] || keys["ArrowUp"]) iy -= 1;
  if (keys["KeyS"] || keys["ArrowDown"]) iy += 1;
  if (ix && iy) {
    ix *= 0.72;
    iy *= 0.72;
  }

  p.vx = ix * MOVE_SPEED_X;
  p.vy = iy * MOVE_SPEED_Y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const marginX = 36;
  const minX = marginX + p.w * 0.4;
  const maxX = w - marginX - p.w * 0.4;
  p.x = Math.max(minX, Math.min(maxX, p.x));
  p.y = Math.max(band.top + 16, Math.min(band.bottom - 12, p.y));

  const moving = Math.abs(ix) + Math.abs(iy) > 0;
  const animRate = moving ? ANIM_FPS * 1.35 : ANIM_FPS * 0.85;
  p.anim += dt * animRate;
  p.frame = Math.floor(p.anim) % FRAME_COUNT;

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.grace > 0) p.grace = Math.max(0, p.grace - dt);

  // 生成障碍
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle(w, h);
    // 偶尔连发两三个
    if (Math.random() < 0.28 + Math.min(0.25, state.time * 0.01)) {
      spawnObstacle(w, h);
    }
    if (Math.random() < 0.12 + Math.min(0.2, state.time * 0.008)) {
      spawnObstacle(w, h);
    }
    const interval = Math.max(SPAWN_MIN, SPAWN_BASE - state.time * 0.018);
    state.spawnTimer = interval * (0.75 + Math.random() * 0.5);
  }

  const hit = playerHitbox(p);
  for (const o of state.obstacles) {
    o.x += o.vx * dt;
    o.rot += (o.spin || 0) * dt;
    if (o.kind === "reed") o.sway += dt * 3;
    if (o.kind === "whirl") {
      o.phase += dt * 4;
      o.y += Math.sin(o.phase) * 18 * dt;
    }
    if (p.invuln <= 0 && aabb(hit, obstacleHitbox(o))) {
      hurtPlayer(1);
      o.dead = true;
      burst(o.x, o.y, "#8a8175", 8);
    }
  }
  state.obstacles = state.obstacles.filter((o) => !o.dead && o.x > -120);

  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  for (const ft of state.floatTexts) {
    ft.life -= dt;
    ft.y -= 28 * dt;
  }
  state.floatTexts = state.floatTexts.filter((ft) => ft.life > 0);

  updateHud();
}

function hillY(worldX, baseY, amp, seed) {
  return (
    baseY +
    Math.sin(worldX * 0.007 + seed) * amp +
    Math.sin(worldX * 0.013 + seed * 1.7) * amp * 0.45 +
    Math.sin(worldX * 0.0035 + seed * 0.6) * amp * 0.35
  );
}

/** 参考 clouds.png：圆瓣叠合 + 外圈墨线 + 内部折痕弧 */
const CLOUD_SHAPES = [
  {
    // 大团：左宽右尖
    lobes: [
      { x: 0, y: 10, r: 16 },
      { x: 20, y: -2, r: 22 },
      { x: 44, y: -6, r: 26 },
      { x: 70, y: 2, r: 20 },
      { x: 90, y: 12, r: 15 },
      { x: 58, y: 14, r: 18 },
      { x: 32, y: 16, r: 17 },
      { x: 10, y: 16, r: 13 },
    ],
    creases: [
      { x: 20, y: 0, r: 14, a0: -0.2, a1: 1.1 },
      { x: 48, y: -2, r: 16, a0: 0.15, a1: 1.35 },
      { x: 72, y: 4, r: 12, a0: 0.4, a1: 1.5 },
    ],
  },
  {
    // 中团
    lobes: [
      { x: 0, y: 8, r: 14 },
      { x: 18, y: -2, r: 18 },
      { x: 40, y: 2, r: 16 },
      { x: 58, y: 10, r: 12 },
      { x: 28, y: 14, r: 14 },
      { x: 8, y: 14, r: 11 },
    ],
    creases: [
      { x: 18, y: 0, r: 11, a0: -0.1, a1: 1.2 },
      { x: 40, y: 4, r: 10, a0: 0.3, a1: 1.45 },
    ],
  },
  {
    // 小团
    lobes: [
      { x: 0, y: 6, r: 11 },
      { x: 14, y: -1, r: 14 },
      { x: 30, y: 5, r: 11 },
      { x: 14, y: 10, r: 10 },
    ],
    creases: [{ x: 14, y: 1, r: 9, a0: 0.1, a1: 1.25 }],
  },
  {
    // 扁长团
    lobes: [
      { x: 0, y: 8, r: 13 },
      { x: 16, y: -4, r: 17 },
      { x: 38, y: -8, r: 20 },
      { x: 60, y: -2, r: 16 },
      { x: 78, y: 8, r: 12 },
      { x: 48, y: 12, r: 15 },
      { x: 24, y: 12, r: 13 },
    ],
    creases: [
      { x: 18, y: -2, r: 11, a0: 0, a1: 1.15 },
      { x: 42, y: -4, r: 13, a0: 0.25, a1: 1.4 },
      { x: 62, y: 2, r: 10, a0: 0.35, a1: 1.5 },
    ],
  },
  {
    // 双峰小团
    lobes: [
      { x: 0, y: 4, r: 12 },
      { x: 16, y: -4, r: 15 },
      { x: 34, y: 2, r: 12 },
      { x: 16, y: 8, r: 11 },
    ],
    creases: [{ x: 16, y: -1, r: 10, a0: 0.05, a1: 1.3 }],
  },
];

function drawCloud(x, y, s, shapeIdx = 0) {
  const shape = CLOUD_SHAPES[((shapeIdx % CLOUD_SHAPES.length) + CLOUD_SHAPES.length) % CLOUD_SHAPES.length];
  const ink = Math.max(1.6, 2.15 * Math.min(s, 1.4));

  // 先铺略大的墨色圆作外轮廓，再盖白芯 —— 外轮廓干净、瓣间不断开
  ctx.fillStyle = "#1a1a1a";
  for (const L of shape.lobes) {
    ctx.beginPath();
    ctx.arc(x + L.x * s, y + L.y * s, L.r * s + ink, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  for (const L of shape.lobes) {
    ctx.beginPath();
    ctx.arc(x + L.x * s, y + L.y * s, L.r * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 内部折痕：短弧，模拟瓣与瓣叠压
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = ink * 0.92;
  ctx.lineCap = "round";
  for (const c of shape.creases) {
    ctx.beginPath();
    ctx.arc(x + c.x * s, y + c.y * s, c.r * s, c.a0, c.a1);
    ctx.stroke();
  }
}

function drawSprout(x, y, s) {
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 10 * s);
  ctx.moveTo(x, y - 10 * s);
  ctx.quadraticCurveTo(x - 6 * s, y - 14 * s, x - 2 * s, y - 7 * s);
  ctx.moveTo(x, y - 10 * s);
  ctx.quadraticCurveTo(x + 6 * s, y - 14 * s, x + 2 * s, y - 7 * s);
  ctx.stroke();
}

function drawHillLayer(scroll, w, h, spec) {
  const { baseY, amp, seed, fill, speed, sprouts } = spec;
  const offset = scroll * speed;
  const step = 10;

  ctx.beginPath();
  ctx.moveTo(-40, h + 40);
  for (let x = -40; x <= w + 40; x += step) {
    const y = hillY(x + offset, baseY, amp, seed);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w + 40, h + 40);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let x = -40; x <= w + 40; x += step) {
    const y = hillY(x + offset, baseY, amp, seed);
    if (x === -40) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  if (!sprouts) return;
  const gap = 54;
  const start = Math.floor((offset - 40) / gap) * gap;
  for (let wx = start; wx < offset + w + 80; wx += gap) {
    const x = wx - offset;
    if (x < -20 || x > w + 20) continue;
    const y = hillY(wx, baseY, amp, seed);
    // 用世界坐标做伪随机，保证卷轴稳定
    const n = Math.abs(Math.sin(wx * 0.11 + seed * 3));
    if (n > 0.42) drawSprout(x, y - 1, 0.75 + n * 0.35);
  }
}

function drawClouds(scroll, w, h) {
  const period = 1400;
  // 大团靠边、小团散落，贴近参考构图
  const clouds = [
    { x: 40, y: 0.1, s: 1.35, shape: 0 },
    { x: 280, y: 0.2, s: 0.72, shape: 2 },
    { x: 420, y: 0.14, s: 0.95, shape: 1 },
    { x: 580, y: 0.22, s: 0.65, shape: 4 },
    { x: 720, y: 0.11, s: 1.15, shape: 3 },
    { x: 960, y: 0.18, s: 0.8, shape: 2 },
    { x: 1120, y: 0.09, s: 1.4, shape: 0 },
    { x: 1280, y: 0.2, s: 0.7, shape: 4 },
  ];
  const offset = ((scroll * 0.18) % period + period) % period;
  for (let k = -1; k <= 1; k++) {
    for (const c of clouds) {
      const x = c.x - offset + k * period;
      if (x < -140 || x > w + 140) continue;
      drawCloud(x, h * c.y, c.s, c.shape);
    }
  }
}

function drawParallax(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.5, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const scroll = state ? state.distance * 14 : 0;
  drawClouds(scroll, w, h);

  // 远 → 近，纸色灰阶山丘，正弦曲线天然无缝
  drawHillLayer(scroll, w, h, {
    baseY: h * 0.48,
    amp: h * 0.05,
    seed: 1.2,
    fill: "rgba(26,26,26,0.06)",
    speed: 0.18,
    sprouts: false,
  });
  drawHillLayer(scroll, w, h, {
    baseY: h * 0.54,
    amp: h * 0.065,
    seed: 2.8,
    fill: "#ddd6c8",
    speed: 0.36,
    sprouts: false,
  });
  drawHillLayer(scroll, w, h, {
    baseY: h * 0.62,
    amp: h * 0.055,
    seed: 4.1,
    fill: "#d0c8b8",
    speed: 0.58,
    sprouts: true,
  });
}

function drawWater(w, h) {
  const band = waterBand(h);
  const grad = ctx.createLinearGradient(0, band.top, 0, h);
  grad.addColorStop(0, "rgba(186, 214, 228, 0)");
  grad.addColorStop(0.15, "rgba(170, 206, 224, 0.32)");
  grad.addColorStop(0.55, "rgba(148, 190, 214, 0.45)");
  grad.addColorStop(1, "rgba(122, 172, 200, 0.58)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, band.top, w, h - band.top);

  // 河岸线
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const scroll = state ? state.distance * 10 : 0;
  const t = state ? state.time : 0;
  for (let x = 0; x <= w; x += 16) {
    const y = band.top + Math.sin((x + scroll) * 0.02 + t) * 2.5;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(26,26,26,0.14)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const yy = band.mid + 18 + i * 20;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 20) {
      const wave = Math.sin((x + scroll) * 0.018 + t * 2 + i * 0.7) * 2.5;
      if (x === 0) ctx.moveTo(x, yy + wave);
      else ctx.lineTo(x, yy + wave);
    }
    ctx.stroke();
  }
}

function updateCapsize(dt) {
  const cap = state.capsize;
  const p = state.player;
  const seq = cap.seq || FAIL_SEQ;

  if (cap.mode === "fail") {
    // 惯性下沉一点，更像翻船
    p.y += 18 * dt;
    const band = waterBand(window.innerHeight);
    p.y = Math.min(p.y, band.bottom - 8);
  }

  // 背景缓慢继续滑
  state.distance += BASE_SCROLL * 0.25 * dt * 0.08;

  if (cap.done) return;

  cap.t += dt * CAPSIZE_FPS;
  const idx = Math.floor(cap.t);
  if (idx < seq.length) {
    cap.index = idx;
    // 抛出阶段多溅水花
    if (cap.mode === "fail" && (seq[idx] === 3 || seq[idx] === 4)) {
      if (Math.random() < 0.35) burst(p.x + 10, p.y + 20, "#9ec8dc", 3);
    }
  } else {
    cap.index = seq.length - 1;
    cap.hold += dt;
    if (cap.hold >= (cap.mode === "recover" ? 0.25 : 0.55)) {
      if (cap.mode === "recover") finishRecover();
      else finishCapsize();
    }
  }
}

function drawPlayer() {
  if (!state) return;
  const p = state.player;

  if (state.capsizing || state.recovering || (state.capsize?.done && (state.gameOver || state.transition))) {
    if (!capsizeSheet) return;
    const seq = state.capsize.seq || FAIL_SEQ;
    const frame = seq[Math.min(state.capsize.index, seq.length - 1)];
    const col = frame % SHEET_COLS;
    const row = Math.floor(frame / SHEET_COLS);
    const dw = capFrameW * CAPSIZE_SCALE;
    const dh = capFrameH * CAPSIZE_SCALE;
    ctx.drawImage(
      capsizeSheet,
      col * capFrameW,
      row * capFrameH,
      capFrameW,
      capFrameH,
      p.x - dw * 0.5,
      p.y - dh * 0.72,
      dw,
      dh
    );
    return;
  }

  if (!playerSheet) return;
  const col = p.frame % SHEET_COLS;
  const row = Math.floor(p.frame / SHEET_COLS);
  const dw = frameW * PLAYER_SCALE;
  const dh = frameH * PLAYER_SCALE;

  ctx.save();
  if (p.invuln > 0 && p.grace <= 0 && Math.floor(p.invuln * 12) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }
  ctx.drawImage(
    playerSheet,
    col * frameW,
    row * frameH,
    frameW,
    frameH,
    p.x - dw * 0.5,
    p.y - dh * 0.78,
    dw,
    dh
  );
  ctx.restore();
}

function drawObstacle(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot || 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (o.kind === "rock") {
    ctx.fillStyle = "#d7cebf";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-o.w * 0.45, o.h * 0.2);
    ctx.lineTo(-o.w * 0.2, -o.h * 0.45);
    ctx.lineTo(o.w * 0.15, -o.h * 0.5);
    ctx.lineTo(o.w * 0.48, -o.h * 0.1);
    ctx.lineTo(o.w * 0.35, o.h * 0.4);
    ctx.lineTo(-o.w * 0.25, o.h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (o.kind === "log") {
    ctx.fillStyle = "#c4a574";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    const hw = o.w * 0.5;
    const hh = o.h * 0.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-hw, -hh, o.w, o.h, 6);
    } else {
      ctx.rect(-hw, -hh, o.w, o.h);
    }
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(26,26,26,0.35)";
    ctx.beginPath();
    ctx.moveTo(-hw * 0.6, -hh * 0.3);
    ctx.lineTo(hw * 0.6, -hh * 0.2);
    ctx.moveTo(-hw * 0.5, hh * 0.25);
    ctx.lineTo(hw * 0.55, hh * 0.15);
    ctx.stroke();
  } else if (o.kind === "reed") {
    const sway = Math.sin(o.sway || 0) * 0.15;
    ctx.rotate(sway);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, -o.h * 0.4, 2, -o.h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -o.h * 0.3);
    ctx.quadraticCurveTo(-10, -o.h * 0.55, -4, -o.h * 0.85);
    ctx.stroke();
    ctx.fillStyle = "#e4ddd0";
    ctx.beginPath();
    ctx.ellipse(2, -o.h - 4, 5, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (o.kind === "whirl") {
    const r = o.r;
    ctx.strokeStyle = "rgba(26,26,26,0.55)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.35 + i * 0.28), o.phase + i, o.phase + i + Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(196, 92, 38, 0.12)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const ft of state.floatTexts) {
    ctx.globalAlpha = Math.max(0, ft.life / 0.8);
    ctx.fillStyle = ft.color;
    ctx.font = "bold 18px Songti SC, Noto Serif SC, serif";
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let shakeX = 0;
  let shakeY = 0;
  if (state?.shake > 0) {
    const mag = state.shake * 10;
    shakeX = (Math.random() - 0.5) * mag;
    shakeY = (Math.random() - 0.5) * mag;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawParallax(w, h);
  drawWater(w, h);

  if (state) {
    for (const o of state.obstacles) drawObstacle(o);
    drawPlayer();
    drawParticles();
  }

  ctx.restore();
  drawTransition(w, h);
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  if (running) raf = requestAnimationFrame(loop);
}

function beginRun() {
  return ensureAssets().then(() => {
    state = createState();
    applyPlayerSize();

    running = true;
    els.overlay?.classList.add("hidden");
    els.gameover?.classList.add("hidden");
    updateHud();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

/** 再来一局：爬起动画与虹膜过渡同时播放 */
function beginRestart() {
  ensureAssets().then(() => {
    if (!state) {
      beginRun();
      return;
    }
    if (state.transition) return;
    els.overlay?.classList.add("hidden");
    els.gameover?.classList.add("hidden");
    state.capsizing = false;
    startRecover();
    startRestartTransition();
    running = true;
    updateHud();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

export async function startPaddle(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  keys = Object.create(null);
  offAll();

  els.hud?.classList.remove("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");

  resize();
  on(window, "resize", resize);

  on(window, "keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  });
  on(window, "keyup", (e) => {
    keys[e.code] = false;
  });
  on(window, "blur", () => {
    keys = Object.create(null);
  });

  els.btnStart.onclick = () => beginRun();
  els.btnRestart.onclick = () => beginRestart();

  // 等资源就绪再开局，避免舞台先露出来一片空白
  await beginRun();
}

export function stopPaddle() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  state = null;
}
