/**
 * 消除模式 — 用 monsters 素材做棋子
 * 点击相邻两格交换 · 三连消除 · 掉落补充 · 限步通关
 */

import { loadMonsters, getMonsterDef, getMonsterSprite } from "./monsters.js";

const COLS = 8;
const ROWS = 8;
const SWAP_T = 0.16;
const CLEAR_T = 0.28;
const FALL_T = 0.22;

/** 棋子类型（各取一种造型） */
const TILE_POOL = [
  "eyeball-1",
  "nine-tail-fox-1",
  "tiger-1",
  "thief-1",
  "official-1",
  "boat-man-1",
  "queen-1",
];

const STAGES = [
  { goal: 1200, moves: 28, types: 5, title: "入门" },
  { goal: 2400, moves: 26, types: 6, title: "进阶" },
  { goal: 4000, moves: 24, types: 7, title: "试炼" },
];

let canvas, ctx;
let els = {};
let state = null;
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];

function on(t, type, fn, opts) {
  t.addEventListener(type, fn, opts);
  listeners.push([t, type, fn, opts]);
}
function offAll() {
  for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
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

function stageCfg(n) {
  return STAGES[Math.min(STAGES.length - 1, Math.max(0, n - 1))];
}

function typeCount(stage = state?.stage || 1) {
  return stageCfg(stage).types;
}

function randType(stage = state?.stage || 1) {
  return TILE_POOL[(Math.random() * typeCount(stage)) | 0];
}

function cell(c, r) {
  return state.grid[r * COLS + c];
}

function inBounds(c, r) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS;
}

function matchesAt(c, r, type, grid) {
  if (!type) return false;
  let h = 1;
  for (let x = c - 1; x >= 0 && grid[r * COLS + x] === type; x--) h++;
  for (let x = c + 1; x < COLS && grid[r * COLS + x] === type; x++) h++;
  let v = 1;
  for (let y = r - 1; y >= 0 && grid[y * COLS + c] === type; y--) v++;
  for (let y = r + 1; y < ROWS && grid[y * COLS + c] === type; y++) v++;
  return h >= 3 || v >= 3;
}

function findMatches(grid = state.grid) {
  const mark = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const cur = c < COLS ? grid[r * COLS + c] : null;
      const prev = grid[r * COLS + (c - 1)];
      if (cur && cur === prev) run++;
      else {
        if (prev && run >= 3) {
          for (let k = 0; k < run; k++) mark[r * COLS + (c - 1 - k)] = 1;
        }
        run = 1;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const cur = r < ROWS ? grid[r * COLS + c] : null;
      const prev = grid[(r - 1) * COLS + c];
      if (cur && cur === prev) run++;
      else {
        if (prev && run >= 3) {
          for (let k = 0; k < run; k++) mark[(r - 1 - k) * COLS + c] = 1;
        }
        run = 1;
      }
    }
  }
  const list = [];
  for (let i = 0; i < mark.length; i++) if (mark[i]) list.push(i);
  return list;
}

function fillBoardNoMatch(stage = 1) {
  const grid = new Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let t;
      let guard = 0;
      do {
        t = randType(stage);
        guard++;
      } while (guard < 40 && matchesAt(c, r, t, grid));
      grid[r * COLS + c] = t;
    }
  }
  return grid;
}

function layoutBoard() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const hud = 64;
  const side = Math.min(viewW * 0.92, viewH - hud - 48, 640);
  const cellSize = side / COLS;
  const ox = (viewW - side) / 2;
  const oy = hud + (viewH - hud - side) / 2;
  return { ox, oy, cell: cellSize, side };
}

function hitCell(clientX, clientY) {
  const { ox, oy, cell: cellSize } = layoutBoard();
  const c = Math.floor((clientX - ox) / cellSize);
  const r = Math.floor((clientY - oy) / cellSize);
  if (!inBounds(c, r)) return null;
  return { c, r };
}

function initState(stage = 1, carryScore = 0) {
  const cfg = stageCfg(stage);
  state = {
    stage,
    score: 0,
    totalScore: carryScore,
    moves: cfg.moves,
    goal: cfg.goal,
    grid: fillBoardNoMatch(stage),
    selected: null,
    phase: "idle",
    animT: 0,
    swapFrom: null,
    swapTo: null,
    swapOk: false,
    clearSet: null,
    clearTypes: null,
    fallFrom: null,
    combo: 0,
    particles: [],
    shake: 0,
  };
}

function syncHud() {
  if (!els.scoreText || !state) return;
  els.scoreText.textContent = `得分 ${state.score}`;
  els.movesText.textContent = `步数 ${state.moves}`;
  els.goalText.textContent = `目标 ${state.goal}`;
  els.stageText.textContent = `关卡 ${state.stage}/${STAGES.length}`;
  if (els.progressFill) {
    const p = Math.min(1, state.score / Math.max(1, state.goal));
    els.progressFill.style.width = `${(p * 100).toFixed(1)}%`;
  }
}

function addParticles(c, r, type, n = 8) {
  const { ox, oy, cell: cellSize } = layoutBoard();
  const cx = ox + (c + 0.5) * cellSize;
  const cy = oy + (r + 0.5) * cellSize;
  const color = getMonsterDef(type).color || "#c45c26";
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    state.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.35 + Math.random() * 0.25,
      max: 0.6,
      color,
      r: 2 + Math.random() * 3,
    });
  }
}

function beginSwap(a, b) {
  state.phase = "swap";
  state.animT = 0;
  state.swapFrom = a;
  state.swapTo = b;
  state.selected = null;

  const ia = a.r * COLS + a.c;
  const ib = b.r * COLS + b.c;
  const tmp = state.grid[ia];
  state.grid[ia] = state.grid[ib];
  state.grid[ib] = tmp;
  state.swapOk = findMatches().length > 0;
  if (!state.swapOk) {
    // 无效：逻辑立刻换回，动画去再回
    state.grid[ib] = state.grid[ia];
    state.grid[ia] = tmp;
  }
}

function applyClear() {
  const list = findMatches();
  if (!list.length) {
    state.combo = 0;
    if (state.score >= state.goal) {
      endStage(true);
    } else if (state.moves <= 0) {
      endStage(false);
    } else {
      state.phase = "idle";
    }
    return;
  }
  state.combo += 1;
  const mul = 1 + (state.combo - 1) * 0.35;
  state.score += Math.round(list.length * 40 * mul);
  state.clearSet = new Set(list);
  state.clearTypes = list.map((i) => [i, state.grid[i]]);
  for (const i of list) {
    const c = i % COLS;
    const r = (i / COLS) | 0;
    addParticles(c, r, state.grid[i], 10);
    state.grid[i] = null;
  }
  state.shake = Math.max(state.shake, 0.12);
  state.phase = "clear";
  state.animT = 0;
  syncHud();
}

function applyFall() {
  const next = new Array(COLS * ROWS).fill(null);
  const from = new Float32Array(COLS * ROWS);

  for (let c = 0; c < COLS; c++) {
    const stack = [];
    const oldRows = [];
    for (let r = 0; r < ROWS; r++) {
      const t = cell(c, r);
      if (t) {
        stack.push(t);
        oldRows.push(r);
      }
    }
    const missing = ROWS - stack.length;
    for (let i = 0; i < missing; i++) {
      next[i * COLS + c] = randType();
      from[i * COLS + c] = -(missing - i);
    }
    for (let i = 0; i < stack.length; i++) {
      const r = missing + i;
      next[r * COLS + c] = stack[i];
      from[r * COLS + c] = oldRows[i] - r;
    }
  }

  state.grid = next;
  state.fallFrom = from;
  state.clearSet = null;
  state.clearTypes = null;
  state.phase = "fall";
  state.animT = 0;
}

function endStage(won) {
  if (won && state.stage < STAGES.length) {
    beginGame(state.stage + 1, state.totalScore + state.score);
    return;
  }
  state.phase = won ? "won" : "lost";
  const total = state.totalScore + state.score;
  els.gameover?.classList.remove("hidden");
  if (els.endTitle) els.endTitle.textContent = won ? "全部通关！" : "步数用尽";
  if (els.resultText) {
    els.resultText.textContent = won
      ? `累计得分 ${total}`
      : `本关 ${state.score} / ${state.goal} · 累计 ${total}`;
  }
}

function trySelect(c, r) {
  if (state.phase !== "idle" || state.moves <= 0) return;
  const sel = state.selected;
  if (!sel) {
    state.selected = { c, r };
    return;
  }
  if (sel.c === c && sel.r === r) {
    state.selected = null;
    return;
  }
  if (Math.abs(sel.c - c) + Math.abs(sel.r - r) !== 1) {
    state.selected = { c, r };
    return;
  }
  beginSwap(sel, { c, r });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function update(dt) {
  if (!state || state.phase === "won" || state.phase === "lost") return;

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 280 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  if (state.phase === "swap") {
    state.animT += dt;
    if (state.animT >= SWAP_T) {
      if (state.swapOk) {
        state.moves -= 1;
        state.combo = 0;
        syncHud();
        applyClear();
      } else {
        state.phase = "idle";
        state.swapFrom = state.swapTo = null;
      }
    }
    return;
  }

  if (state.phase === "clear") {
    state.animT += dt;
    if (state.animT >= CLEAR_T) applyFall();
    return;
  }

  if (state.phase === "fall") {
    state.animT += dt;
    if (state.animT >= FALL_T) {
      state.fallFrom = null;
      applyClear();
    }
  }
}

function roundRect(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawTileAt(type, x, y, cellSize, alpha = 1, scaleMul = 1) {
  if (!type) return;
  const spr = getMonsterSprite(type);
  const fit = cellSize * 0.82 * scaleMul;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (!spr) {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, fit * 0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const scale = Math.min(fit / spr.w, fit / spr.h);
  const dw = spr.w * scale;
  const dh = spr.h * scale;
  // 细描边
  const o = 1;
  const sil = spr.silhouette || spr.canvas;
  for (const [ox, oy] of [
    [-o, 0],
    [o, 0],
    [0, -o],
    [0, o],
  ]) {
    ctx.drawImage(sil, x - dw / 2 + ox, y - dh / 2 + oy, dw, dh);
  }
  ctx.drawImage(spr.canvas, x - dw / 2, y - dh / 2, dw, dh);
  ctx.restore();
}

function drawBg(viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, "#ebe4d6");
  g.addColorStop(0.55, "#e0d6c6");
  g.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.strokeStyle = "rgba(26,26,26,0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x < viewW; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, viewH);
    ctx.stroke();
  }
  for (let y = 0; y < viewH; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
    ctx.stroke();
  }
}

function render() {
  if (!state) return;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  drawBg(viewW, viewH);

  const { ox, oy, cell: cellSize, side } = layoutBoard();
  let shakeX = 0;
  let shakeY = 0;
  if (state.shake > 0) {
    shakeX = (Math.random() - 0.5) * 6;
    shakeY = (Math.random() - 0.5) * 6;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const pad = 10;
  ctx.fillStyle = "rgba(242,239,230,0.88)";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;
  roundRect(ox - pad, oy - pad, side + pad * 2, side + pad * 2, 12);
  ctx.fill();
  ctx.stroke();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;
      ctx.fillStyle = (c + r) % 2 === 0 ? "rgba(255,255,255,0.35)" : "rgba(26,26,26,0.04)";
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
  }

  // 棋子裁切在盘面内，避免边缘溢出
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, side, side);
  ctx.clip();

  const skip = new Set();
  if (state.phase === "swap" && state.swapFrom && state.swapTo) {
    const a = state.swapFrom;
    const b = state.swapTo;
    skip.add(a.r * COLS + a.c);
    skip.add(b.r * COLS + b.c);

    const ax = ox + (a.c + 0.5) * cellSize;
    const ay = oy + (a.r + 0.5) * cellSize;
    const bx = ox + (b.c + 0.5) * cellSize;
    const by = oy + (b.r + 0.5) * cellSize;

    let u = Math.min(1, state.animT / SWAP_T);
    if (!state.swapOk) {
      u = u < 0.5 ? easeOutCubic(u * 2) : easeOutCubic(1 - (u - 0.5) * 2);
    } else {
      u = easeOutCubic(u);
    }

    if (state.swapOk) {
      // grid 已交换：a 格是原 b，b 格是原 a
      drawTileAt(cell(a.c, a.r), bx + (ax - bx) * u, by + (ay - by) * u, cellSize);
      drawTileAt(cell(b.c, b.r), ax + (bx - ax) * u, ay + (by - ay) * u, cellSize);
    } else {
      drawTileAt(cell(a.c, a.r), ax + (bx - ax) * u, ay + (by - ay) * u, cellSize);
      drawTileAt(cell(b.c, b.r), bx + (ax - bx) * u, by + (ay - by) * u, cellSize);
    }
  }

  const clearT = state.phase === "clear" ? Math.min(1, state.animT / CLEAR_T) : 0;
  if (state.phase === "clear" && state.clearTypes) {
    for (const [i, type] of state.clearTypes) {
      const c = i % COLS;
      const r = (i / COLS) | 0;
      drawTileAt(
        type,
        ox + (c + 0.5) * cellSize,
        oy + (r + 0.5) * cellSize,
        cellSize,
        1 - clearT,
        1 + clearT * 0.4
      );
    }
  }

  const fallT = state.phase === "fall" ? easeOutCubic(Math.min(1, state.animT / FALL_T)) : 1;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (skip.has(i)) continue;
      const type = state.grid[i];
      if (!type) continue;

      let x = ox + (c + 0.5) * cellSize;
      let y = oy + (r + 0.5) * cellSize;
      if (state.phase === "fall" && state.fallFrom) {
        y += state.fallFrom[i] * (1 - fallT) * cellSize;
      }
      drawTileAt(type, x, y, cellSize);

      if (state.selected && state.selected.c === c && state.selected.r === r) {
        ctx.strokeStyle = "#c45c26";
        ctx.lineWidth = 3;
        ctx.strokeRect(ox + c * cellSize + 4, oy + r * cellSize + 4, cellSize - 8, cellSize - 8);
      }
    }
  }

  ctx.restore(); // clip

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore(); // shake

  ctx.fillStyle = "rgba(26,26,26,0.5)";
  ctx.font = "13px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${stageCfg(state.stage).title} · 三连消除 · 点击相邻交换`,
    viewW / 2,
    oy + side + 28
  );
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  raf = requestAnimationFrame(tick);
}

async function beginGame(stage = 1, carryScore = 0) {
  await loadMonsters();
  initState(stage, carryScore);
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  syncHud();
}

function onPointer(ev) {
  if (!state || state.phase !== "idle") return;
  if (els.gameover && !els.gameover.classList.contains("hidden")) return;
  const t = ev.changedTouches ? ev.changedTouches[0] : ev;
  const hit = hitCell(t.clientX, t.clientY);
  if (!hit) {
    state.selected = null;
    return;
  }
  trySelect(hit.c, hit.r);
}

export async function startMatch3({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  offAll();
  resize();

  on(window, "resize", resize);
  on(canvas, "pointerdown", onPointer);
  on(els.btnStart, "click", () => beginGame(1, 0));
  on(els.btnRestart, "click", () => beginGame(1, 0));

  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  await beginGame(1, 0);
  if (!running) return;
  raf = requestAnimationFrame(tick);
}

export function stopMatch3() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
