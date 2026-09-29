/**
 * 对决模式 — 参考 TowerFall Ascension
 * 双人选角（上下切换）→ 神殿竞技场射击对战
 * P1：WASD 移动跳跃 · J 射击 · 选角 W/S · 空格确认
 * P2：方向键移动跳跃 · 1 射击 · 选角 ↑/↓ · 右 Shift 确认
 */

const META_SRC = "assets/player/mouse/ready/meta.json";
const GRAVITY = 2000;
const JUMP_V = -740;
const MOVE_SPEED = 300;
const ARROW_SPEED = 720;
const FIRE_CD = 0.38;
const MAX_LIVES = 3;
const WIN_KILLS = 3;
const INVULN = 1.2;
const BODY_W = 36;
const BODY_H = 48;
const DRAW_H = 56;

const P1 = {
  up: ["KeyW"],
  down: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  jump: ["KeyW", "KeyK"],
  shoot: ["KeyJ", "Space"],
  confirm: ["Space", "KeyJ", "Enter"],
  unlock: ["KeyU", "Backspace"],
};
const P2 = {
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  jump: ["ArrowUp", "Digit2"],
  shoot: ["Digit1", "ShiftRight"],
  confirm: ["ShiftRight", "Digit1", "Enter"],
  unlock: ["Digit0", "Backspace"],
};

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let prevKeys = Object.create(null);
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];
let roster = [];
let images = Object.create(null);

function on(t, type, fn) {
  t.addEventListener(type, fn);
  listeners.push([t, type, fn]);
}
function offAll() {
  for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  listeners = [];
}
function keyDown(codes) {
  for (const c of codes || []) if (keys[c]) return true;
  return false;
}
function keyPressed(codes) {
  for (const c of codes || []) if (keys[c] && !prevKeys[c]) return true;
  return false;
}
function snapKeys() {
  prevKeys = Object.create(null);
  for (const k of Object.keys(keys)) prevKeys[k] = keys[k];
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
      reject(new Error(src));
    };
    img.src = encodeURI(src) + (src.includes("?") ? "&" : "?") + "v=20260929c";
  });
}

async function ensureAssets() {
  if (roster.length) return;
  roster = await fetch(META_SRC).then((r) => r.json());
  await Promise.all(
    roster.map(async (c) => {
      images[c.id] = await loadImage(c.sprite);
      images[c.id + "_p"] = await loadImage(c.portrait);
    })
  );
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function buildArena() {
  // 层高约 95–110；内部平台均为单向（可从下穿过）
  const W = 1100;
  const H = 700;
  const T = 26;
  const ow = (x, y, w, h = T) => ({ x, y, w, h, oneWay: true });
  return {
    width: W,
    height: H,
    solids: [
      // 外框（实体）
      { x: 0, y: 0, w: W, h: T },
      { x: 0, y: H - T, w: W, h: T },
      { x: 0, y: 0, w: T, h: H },
      { x: W - T, y: 0, w: T, h: H },

      // 顶层 ~155
      ow(T, 155, 190),
      ow(W - T - 190, 155, 190),
      ow(390, 145, 320),

      // 高中层 ~260
      ow(T, 260, 230),
      ow(W - T - 230, 260, 230),
      ow(420, 250, 260),

      // 中层出生台 ~370
      ow(T, 370, 270),
      ow(W - T - 270, 370, 270),
      ow(460, 385, 180),

      // 中下层 ~480
      ow(160, 480, 220),
      ow(W - 160 - 220, 480, 220),
      ow(400, 495, 300),

      // 低层 ~585
      ow(T, 585, 200),
      ow(W - T - 200, 585, 200),
      ow(320, 575, 460),
    ],
    spawns: [
      { x: 150, y: 370 - BODY_H / 2 },
      { x: 950, y: 370 - BODY_H / 2 },
    ],
    torches: [
      [110, 330],
      [990, 330],
      [220, 440],
      [880, 440],
      [550, 350],
      [550, 555],
    ],
  };
}

function makeFighter(slot, charIndex, spawn) {
  const def = roster[charIndex % roster.length];
  return {
    slot,
    charId: def.id,
    color: def.color,
    name: def.name,
    x: spawn.x,
    y: spawn.y,
    w: BODY_W,
    h: BODY_H,
    vx: 0,
    vy: 0,
    facing: slot === 0 ? 1 : -1,
    onGround: false,
    dead: false,
    lives: MAX_LIVES,
    kills: 0,
    invuln: INVULN,
    fireCd: 0,
    ctrl: slot === 0 ? P1 : P2,
  };
}

function initSelect() {
  state = {
    phase: "select", // select | fight | over
    p1Index: 0,
    p2Index: 1 % Math.max(1, roster.length),
    p1Locked: false,
    p2Locked: false,
    p1Scroll: null, // { from, to, dir, t }
    p2Scroll: null,
    fightFlash: 0,
    arena: null,
    players: null,
    arrows: [],
    particles: [],
    time: 0,
    winner: null,
    shake: 0,
  };
}

function startFight() {
  const arena = buildArena();
  state.phase = "fight";
  state.arena = arena;
  state.players = [
    makeFighter(0, state.p1Index, arena.spawns[0]),
    makeFighter(1, state.p2Index, arena.spawns[1]),
  ];
  state.arrows = [];
  state.particles = [];
  state.time = 0;
  state.winner = null;
  state.shake = 0;
  state.fightFlash = 1.2;
  state.taunts = [
    { slot: 0, text: "你的胆子真是肥嘟嘟的。", life: 1.6 },
    { slot: 1, text: "( ◺˰◿ )", life: 1.6 },
  ];
  els.hud?.classList.remove("hidden");
  els.gameover?.classList.add("hidden");
  syncHud();
}

function spawnBurst(x, y, color) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.4 + Math.random() * 0.4,
      max: 0.8,
      color,
    });
  }
}

function killPlayer(victim, killer) {
  if (victim.dead || victim.invuln > 0) return;
  victim.lives -= 1;
  spawnBurst(victim.x, victim.y, victim.color);
  state.shake = 0.25;
  if (killer && killer !== victim) killer.kills += 1;

  if (victim.lives <= 0 || (killer && killer.kills >= WIN_KILLS)) {
    victim.dead = true;
    state.phase = "over";
    state.shake = 0;
    state.winner = killer && killer.kills >= WIN_KILLS ? killer : state.players.find((p) => p !== victim);
    showGameover();
    return;
  }

  // 重生
  const sp = state.arena.spawns[victim.slot];
  victim.x = sp.x;
  victim.y = sp.y;
  victim.vx = 0;
  victim.vy = 0;
  victim.invuln = INVULN;
  victim.facing = victim.slot === 0 ? 1 : -1;
  syncHud();
}

function showGameover() {
  if (!els.gameover) return;
  state.shake = 0;
  els.gameover.classList.remove("hidden");
  const w = state.winner;
  if (els.endTitle) els.endTitle.textContent = w ? `${w.name} 获胜！` : "对决结束";
  if (els.resultText) {
    const [a, b] = state.players;
    els.resultText.textContent = `P1 ${a.kills} 杀 · P2 ${b.kills} 杀`;
  }
}

/* —— 物理 —— */
function solids() {
  return state.arena.solids;
}

function resolvePlayer(p, dt) {
  const blocks = solids();
  p.onGround = false;
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const hw = p.w / 2;
  const hh = p.h / 2;
  let left = p.x - hw;
  let top = p.y - hh;
  const prevBottom = p.y - hh - p.vy * dt + p.h;

  // 竖直：单向平台只在下落且脚底曾在平台上方时落地
  for (const pl of blocks) {
    if (!rectOverlap(left, top, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) continue;

    if (pl.oneWay) {
      if (p.vy < 0) continue;
      if (prevBottom > pl.y + 12) continue;
      p.y = pl.y - hh;
      p.vy = 0;
      p.onGround = true;
      left = p.x - hw;
      top = p.y - hh;
      continue;
    }

    // 实体块
    if (p.vy < 0 || prevBottom > pl.y + 14) {
      if (p.vy < 0) {
        const oL = left + p.w - pl.x;
        const oR = pl.x + pl.w - left;
        if (oL < oR && oL < p.w * 0.7) {
          p.x = pl.x - hw;
          p.vx = Math.min(0, p.vx);
        } else if (oR < p.w * 0.7) {
          p.x = pl.x + pl.w + hw;
          p.vx = Math.max(0, p.vx);
        } else {
          p.y = pl.y + pl.h + hh;
          p.vy = 0;
        }
        left = p.x - hw;
        top = p.y - hh;
      }
      continue;
    }
    p.y = pl.y - hh;
    p.vy = 0;
    p.onGround = true;
    left = p.x - hw;
    top = p.y - hh;
  }

  // 水平：单向平台不挡左右
  left = p.x - hw;
  top = p.y - hh;
  for (const pl of blocks) {
    if (pl.oneWay) continue;
    if (!rectOverlap(left, top, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) continue;
    if (p.onGround && Math.abs(p.y + hh - pl.y) < 4) continue;
    const oL = left + p.w - pl.x;
    const oR = pl.x + pl.w - left;
    if (oL < oR) {
      p.x = pl.x - hw;
      p.vx = Math.min(0, p.vx);
    } else {
      p.x = pl.x + pl.w + hw;
      p.vx = Math.max(0, p.vx);
    }
  }

  if (p.x < hw + 4) p.x = hw + 4;
  if (p.x > state.arena.width - hw - 4) p.x = state.arena.width - hw - 4;
  if (p.y > state.arena.height + 40) {
    killPlayer(p, state.players.find((o) => o !== p));
  }
}

function fireArrow(p) {
  if (p.fireCd > 0 || p.dead) return;
  p.fireCd = FIRE_CD;
  const dir = p.facing >= 0 ? 1 : -1;
  state.arrows.push({
    x: p.x + dir * 22,
    y: p.y - 4,
    vx: dir * ARROW_SPEED,
    vy: -40,
    owner: p.slot,
    life: 2.2,
    w: 18,
    h: 6,
  });
}

function updateFight(dt) {
  state.time += dt;
  if (state.fightFlash > 0) state.fightFlash -= dt;
  if (state.shake > 0) state.shake -= dt;
  if (state.taunts?.length) {
    for (const t of state.taunts) t.life -= dt;
    state.taunts = state.taunts.filter((t) => t.life > 0);
  }

  for (const p of state.players) {
    if (p.dead) continue;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;

    const c = p.ctrl;
    let move = 0;
    if (keyDown(c.left)) move -= 1;
    if (keyDown(c.right)) move += 1;
    p.vx = move * MOVE_SPEED;
    if (move !== 0) p.facing = move;

    if (keyPressed(c.jump) && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
    }
    if (keyPressed(c.shoot)) fireArrow(p);

    resolvePlayer(p, dt);
  }

  // 箭矢
  for (const a of state.arrows) {
    a.life -= dt;
    a.vy += 400 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    // 撞墙
    for (const pl of solids()) {
      if (rectOverlap(a.x - a.w / 2, a.y - a.h / 2, a.w, a.h, pl.x, pl.y, pl.w, pl.h)) {
        a.life = 0;
        spawnBurst(a.x, a.y, "#d7cebf");
      }
    }
    for (const p of state.players) {
      if (p.dead || p.slot === a.owner || p.invuln > 0) continue;
      if (rectOverlap(a.x - a.w / 2, a.y - a.h / 2, a.w, a.h, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h)) {
        a.life = 0;
        killPlayer(p, state.players[a.owner]);
      }
    }
  }
  state.arrows = state.arrows.filter((a) => a.life > 0);

  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 600 * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  syncHud();
}

const SELECT_SCROLL_DUR = 0.22;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function beginSelectScroll(playerSlot, dir) {
  const key = playerSlot === 0 ? "p1Index" : "p2Index";
  const scrollKey = playerSlot === 0 ? "p1Scroll" : "p2Scroll";
  const n = roster.length;
  if (!n) return;

  // 动画中再切：先落到目标再开新卷
  if (state[scrollKey]) {
    state[key] = state[scrollKey].to;
    state[scrollKey] = null;
  }

  const from = state[key];
  const to = (from + dir + n) % n;
  state[key] = to;
  state[scrollKey] = { from, to, dir, t: 0 };
}

function tickSelectScroll(dt) {
  for (const key of ["p1Scroll", "p2Scroll"]) {
    const s = state[key];
    if (!s) continue;
    s.t += dt / SELECT_SCROLL_DUR;
    if (s.t >= 1) state[key] = null;
  }
}

function updateSelect(dt) {
  tickSelectScroll(dt);

  if (!state.p1Locked) {
    if (keyPressed(P1.up)) beginSelectScroll(0, -1);
    if (keyPressed(P1.down)) beginSelectScroll(0, 1);
    if (keyPressed(P1.confirm) && !state.p1Scroll) state.p1Locked = true;
  } else if (keyPressed(P1.unlock)) {
    state.p1Locked = false;
  }

  if (!state.p2Locked) {
    if (keyPressed(P2.up)) beginSelectScroll(1, -1);
    if (keyPressed(P2.down)) beginSelectScroll(1, 1);
    if (keyPressed(P2.confirm) && !state.p2Scroll) state.p2Locked = true;
  } else if (keyPressed(P2.unlock)) {
    state.p2Locked = false;
  }

  // 避免同角色：锁定时若冲突自动错开未锁定方
  if (state.p1Locked && state.p2Locked && state.p1Index === state.p2Index) {
    state.p2Index = (state.p2Index + 1) % roster.length;
  }

  if (state.p1Locked && state.p2Locked) {
    state.fightFlash = 0.01;
    startFight();
    syncHudPhase();
  }
}

/* —— 绘制 —— */
function drawPaperBg(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
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
}

function drawPortraitInBox(img, x, y, w, h) {
  if (!img) return;
  const scale = Math.min((w - 16) / img.width, (h - 16) / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawSelectPanel(x, y, w, h, playerSlot, index, locked, accent, scroll) {
  const def = roster[index];
  ctx.fillStyle = locked ? "#f2efe6" : "#ebe4d6";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  const ph = h * 0.52;
  const boxX = x + 12;
  const boxY = y + 12;
  const boxW = w - 24;
  ctx.fillStyle = "#e4ddd0";
  ctx.fillRect(boxX, boxY, boxW, ph);
  ctx.strokeStyle = "rgba(26,26,26,0.2)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, ph - 1);

  // 肖像区裁剪滚动
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, ph);
  ctx.clip();

  if (scroll) {
    const u = easeOutCubic(Math.min(1, scroll.t));
    const fromDef = roster[scroll.from];
    const toDef = roster[scroll.to];
    const fromImg = images[fromDef.id + "_p"] || images[fromDef.id];
    const toImg = images[toDef.id + "_p"] || images[toDef.id];
    // dir>0（下）：旧角色上滑离开，新角色从下方滚入
    // dir<0（上）：旧角色下滑离开，新角色从上方滚入
    const fromOff = -scroll.dir * ph * u;
    const toOff = scroll.dir * ph * (1 - u);
    drawPortraitInBox(fromImg, boxX, boxY + fromOff, boxW, ph);
    drawPortraitInBox(toImg, boxX, boxY + toOff, boxW, ph);
  } else {
    const img = images[def.id + "_p"] || images[def.id];
    drawPortraitInBox(img, boxX, boxY, boxW, ph);
  }
  ctx.restore();

  // 名字也跟着轻微上下滑/淡入
  let name = def.name;
  let nameAlpha = 1;
  let nameY = y + ph + 42;
  if (scroll) {
    const u = easeOutCubic(Math.min(1, scroll.t));
    if (u < 0.5) {
      name = roster[scroll.from].name;
      nameAlpha = 1 - u * 2;
      nameY += -scroll.dir * 10 * u;
    } else {
      name = roster[scroll.to].name;
      nameAlpha = (u - 0.5) * 2;
      nameY += scroll.dir * 10 * (1 - u);
    }
  }
  ctx.globalAlpha = nameAlpha;
  ctx.fillStyle = accent;
  ctx.font = "bold 22px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(name, x + w / 2, nameY);
  ctx.globalAlpha = 1;

  ctx.fillStyle = locked ? "rgba(26,26,26,0.25)" : accent;
  ctx.font = "20px sans-serif";
  ctx.fillText("▲", x + w / 2, y + ph + 70);
  ctx.fillText("▼", x + w / 2, y + ph + 118);

  ctx.font = "14px Songti SC, serif";
  if (locked) {
    ctx.fillStyle = "#3a8f6e";
    ctx.fillText("已锁定", x + w / 2, y + ph + 96);
  } else {
    ctx.fillStyle = "rgba(26,26,26,0.45)";
    ctx.fillText("上下切换", x + w / 2, y + ph + 96);
  }

  ctx.fillStyle = "rgba(26,26,26,0.65)";
  ctx.font = "13px Songti SC, serif";
  if (playerSlot === 0) {
    ctx.fillText("P1 · WASD / 空格确认", x + w / 2, y + h - 28);
  } else {
    ctx.fillText("P2 · 方向键 / Shift确认", x + w / 2, y + h - 28);
  }

  ctx.fillStyle = accent;
  ctx.font = "bold 16px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText(playerSlot === 0 ? "P1" : "P2", x + 18, y + 30);
}

function renderSelect(viewW, viewH) {
  drawPaperBg(viewW, viewH);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 42px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText("FIGHT!", viewW / 2, 64);
  ctx.fillStyle = "rgba(26,26,26,0.55)";
  ctx.font = "16px Songti SC, serif";
  ctx.fillText("选择鼠勇士 · 上下切换 · 确认后开战", viewW / 2, 92);

  const panelW = Math.min(320, viewW * 0.36);
  const panelH = Math.min(520, viewH * 0.72);
  const gap = 48;
  const total = panelW * 2 + gap;
  const left = (viewW - total) / 2;
  const top = Math.max(110, (viewH - panelH) / 2);

  drawSelectPanel(left, top, panelW, panelH, 0, state.p1Index, state.p1Locked, "#c45c26", state.p1Scroll);
  drawSelectPanel(left + panelW + gap, top, panelW, panelH, 1, state.p2Index, state.p2Locked, "#3a8f6e", state.p2Scroll);
}

function drawFighter(p) {
  if (p.dead) return;
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
  const img = images[p.charId];
  ctx.save();
  ctx.translate(p.x, p.y + p.h / 2);
  // 素材默认朝左：向右时翻转
  if (p.facing > 0) ctx.scale(-1, 1);
  if (img) {
    const sc = DRAW_H / img.height;
    const dw = img.width * sc;
    const dh = img.height * sc;
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.fillRect(-p.w / 2, -p.h, p.w, p.h);
    ctx.strokeRect(-p.w / 2, -p.h, p.w, p.h);
  }
  ctx.restore();
}

function drawArrow(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(a.vy, a.vx));
  ctx.fillStyle = "#e8e0d2";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTauntBubble(p, text, life) {
  if (!p || p.dead || !text) return;
  const alpha = Math.min(1, life / 0.35, life > 0.4 ? 1 : life / 0.4);
  if (alpha <= 0) return;

  const lines =
    /[\u4e00-\u9fff]/.test(text) && text.length > 8
      ? [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))]
      : [text];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "bold 14px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = 14;
  const padY = 10;
  const lineH = 18;
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  const bw = maxW + padX * 2;
  const bh = padY * 2 + lineH * lines.length - 2;
  const bx = p.x - bw / 2;
  const by = p.y - p.h - bh - 16;
  const r = 8;

  ctx.fillStyle = "#f7f2e8";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p.x - 7, by + bh);
  ctx.lineTo(p.x, by + bh + 9);
  ctx.lineTo(p.x + 7, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(p.x - 6, by + bh - 2, 12, 4);

  ctx.fillStyle = "#1a1a1a";
  lines.forEach((line, i) => {
    ctx.fillText(line, p.x, by + padY + lineH * i + lineH / 2);
  });
  ctx.restore();
}

function drawArenaSolid(s) {
  ctx.fillStyle = "#ebe4d6";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = "#f2efe6";
  ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, Math.min(8, s.h - 4));
}

function drawTorch(x, y, t) {
  const flicker = Math.sin(t * 8 + x) * 2;
  ctx.fillStyle = "rgba(196,92,38,0.18)";
  ctx.beginPath();
  ctx.arc(x, y - 8 + flicker, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c45c26";
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x, y - 16 + flicker);
  ctx.lineTo(x + 5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ebe4d6";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - 3, y, 6, 12);
  ctx.strokeRect(x - 3, y, 6, 12);
}

function drawPaperArenaBg(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
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
}

function renderFight(viewW, viewH) {
  const arena = state.arena;
  const scale = Math.min(viewW / arena.width, viewH / arena.height) * 0.96;
  const ox = (viewW - arena.width * scale) / 2;
  const oy = (viewH - arena.height * scale) / 2;
  let sx = 0;
  let sy = 0;
  if (state.phase === "fight" && state.shake > 0) {
    sx = (Math.random() - 0.5) * 8;
    sy = (Math.random() - 0.5) * 8;
  }

  const outer = ctx.createLinearGradient(0, 0, 0, viewH);
  outer.addColorStop(0, "#ebe4d6");
  outer.addColorStop(1, "#d9d0c0");
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.save();
  ctx.translate(ox + sx, oy + sy);
  ctx.scale(scale, scale);

  drawPaperArenaBg(arena.width, arena.height);

  // 侧栏
  ctx.fillStyle = "#e4ddd0";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(0, 0, 18, arena.height);
  ctx.fillRect(arena.width - 18, 0, 18, arena.height);
  ctx.strokeRect(0.5, 0.5, 17, arena.height - 1);
  ctx.strokeRect(arena.width - 17.5, 0.5, 17, arena.height - 1);

  // 中央灯笼链
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(arena.width / 2, 28);
  ctx.lineTo(arena.width / 2, 160);
  ctx.stroke();
  ctx.fillStyle = "#e8c86a";
  ctx.beginPath();
  ctx.arc(arena.width / 2, 170, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(232,200,100,0.2)";
  ctx.beginPath();
  ctx.arc(arena.width / 2, 170, 36, 0, Math.PI * 2);
  ctx.fill();

  // 壁龛浅色
  ctx.fillStyle = "rgba(196,92,38,0.08)";
  ctx.fillRect(40, 180, 240, 120);
  ctx.fillRect(arena.width - 280, 180, 240, 120);

  for (const s of arena.solids) drawArenaSolid(s);
  for (const [tx, ty] of arena.torches) drawTorch(tx, ty, state.time);
  for (const a of state.arrows) drawArrow(a);
  for (const p of state.players) drawFighter(p);
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  if (state.taunts?.length) {
    for (const t of state.taunts) {
      drawTauntBubble(state.players[t.slot], t.text, t.life);
    }
  }

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, arena.width - 3, arena.height - 3);
  ctx.restore();

  if (state.fightFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.fightFlash);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 64px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("FIGHT!", viewW / 2, viewH * 0.4);
    ctx.restore();
  }
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  if (!state) {
    drawPaperBg(viewW, viewH);
    return;
  }
  if (state.phase === "select") renderSelect(viewW, viewH);
  else renderFight(viewW, viewH);
}

function syncHud() {
  if (!els.p1Lives || !state?.players) return;
  const [a, b] = state.players;
  els.p1Lives.textContent = `❤ ${a.lives}`;
  els.p2Lives.textContent = `❤ ${b.lives}`;
  els.p1Kills.textContent = `击杀 ${a.kills}`;
  els.p2Kills.textContent = `击杀 ${b.kills}`;
  if (els.p1Name) els.p1Name.textContent = a.name;
  if (els.p2Name) els.p2Name.textContent = b.name;
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (state) {
    if (state.phase === "select") updateSelect(dt);
    else if (state.phase === "fight") updateFight(dt);
    snapKeys();
  }
  render();
  raf = requestAnimationFrame(tick);
}

function syncHudPhase() {
  if (!els.hud) return;
  if (!state) {
    els.hud.classList.add("hidden");
    return;
  }
  if (state.phase === "select") {
    els.hud.classList.remove("hidden");
    els.hud.classList.add("is-select");
    if (els.backBtn) els.backBtn.textContent = "返回模式选择";
  } else {
    els.hud.classList.remove("hidden");
    els.hud.classList.remove("is-select");
    if (els.backBtn) els.backBtn.textContent = "返回选角";
  }
}

async function beginMode() {
  await ensureAssets();
  initSelect();
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  syncHudPhase();
}

function onRestart() {
  els.gameover?.classList.add("hidden");
  // 沿用已选角色直接再开一局
  startFight();
  syncHudPhase();
}

/** @returns {boolean} true=已在模式内处理（不回主菜单） */
export function handleTowerfallBack() {
  if (!state) return false;
  if (state.phase === "select") return false; // 回到模式选择
  // 对战/结算 → 选角
  const p1 = state.p1Index;
  const p2 = state.p2Index;
  els.gameover?.classList.add("hidden");
  initSelect();
  state.p1Index = p1;
  state.p2Index = p2;
  syncHudPhase();
  return true;
}

export function startTowerfall({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  keys = Object.create(null);
  prevKeys = Object.create(null);
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
  on(els.btnRestart, "click", onRestart);

  beginMode();
  raf = requestAnimationFrame(tick);
}

export function stopTowerfall() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.hud?.classList.remove("is-select");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
