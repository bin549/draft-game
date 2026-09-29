/**
 * 偷窃模式 — 参考 Pengusan（企鹅吃鱼）
 * 左右分屏双人接住掉落赃物
 * P1：A / D 移动
 * P2：← / → 移动
 */

const SPRITE_P1 = "assets/player/thief/ready/thief_p1.png";
const SPRITE_P2 = "assets/player/thief/ready/thief_p2.png";
const MOVE_SPEED = 420;
const GOAL = 100;
const WIN_ROUNDS = 3;
/** 精灵碰撞相对绘制高度的水平/垂直余量 */
const CATCH_PAD_X = 0.08;
const CATCH_PAD_Y = 0.04;

const LOOT = [
  { id: "coin", label: "金币", score: 8, color: "#e8c86a", r: 12 },
  { id: "gem", label: "宝石", score: 14, color: "#5ec8ff", r: 11 },
  { id: "bag", label: "钱袋", score: 20, color: "#c45c26", r: 16 },
  { id: "watch", label: "手表", score: 12, color: "#a0a8b0", r: 13 },
];
const HAZARD = { id: "alarm", label: "警报", score: -18, color: "#c04040", r: 14 };

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];
let imgP1 = null;
let imgP2 = null;
let assetsReady = false;

function on(t, type, fn) {
  t.addEventListener(type, fn);
  listeners.push([t, type, fn]);
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
    img.src = encodeURI(src) + (src.includes("?") ? "&" : "?") + "v=3";
  });
}

async function ensureAssets() {
  if (assetsReady) return;
  [imgP1, imgP2] = await Promise.all([loadImage(SPRITE_P1), loadImage(SPRITE_P2)]);
  assetsReady = true;
}

function makeSide(slot) {
  return {
    slot,
    x: 0.5,
    score: 0,
    wins: 0,
    items: [],
    spawnT: 0.4 + Math.random() * 0.4,
    bob: 0,
    flash: 0,
    face: slot === 0 ? 1 : -1,
  };
}

function initMatch(keepWins = false) {
  const w1 = keepWins && state ? state.sides[0].wins : 0;
  const w2 = keepWins && state ? state.sides[1].wins : 0;
  state = {
    phase: "countdown", // countdown | play | round | over
    countdown: 3,
    time: 0,
    sides: [makeSide(0), makeSide(1)],
    roundFlash: 0,
    winner: null,
  };
  state.sides[0].wins = w1;
  state.sides[1].wins = w2;
  els.gameover?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  syncHud();
}

function spawnItem(side) {
  const roll = Math.random();
  const def = roll < 0.16 ? HAZARD : LOOT[(Math.random() * LOOT.length) | 0];
  const speed = 140 + Math.random() * 160 + Math.min(120, state.time * 4);
  side.items.push({
    ...def,
    x: 0.12 + Math.random() * 0.76,
    y: -0.08 - Math.random() * 0.12,
    vy: speed,
    rot: (Math.random() - 0.5) * 1.2,
    spin: (Math.random() - 0.5) * 4,
  });
}

function endRound(winnerSlot) {
  state.phase = "round";
  state.roundFlash = 1.6;
  state.sides[winnerSlot].wins += 1;
  syncHud();
  if (state.sides[winnerSlot].wins >= WIN_ROUNDS) {
    state.phase = "over";
    state.winner = winnerSlot;
    showGameover();
  }
}

function showGameover() {
  if (!els.gameover) return;
  els.gameover.classList.remove("hidden");
  const w = state.winner;
  if (els.endTitle) els.endTitle.textContent = w === 0 ? "P1 偷窃获胜！" : "P2 偷窃获胜！";
  if (els.resultText) {
    els.resultText.textContent = `局分 ${state.sides[0].wins} : ${state.sides[1].wins}`;
  }
}

function spriteDrawSize(panelH, img) {
  const drawH = Math.min(120, panelH * 0.22);
  if (!img || !img.height) {
    return { dw: drawH * 0.7, dh: drawH };
  }
  const sc = drawH / img.height;
  return { dw: img.width * sc, dh: img.height * sc };
}

/** 与 drawThief 一致的精灵包围盒（面板归一化坐标） */
function spriteHitbox(side, panelW, panelH, img) {
  const { dw, dh } = spriteDrawSize(panelH, img);
  const feetY = 0.8;
  const padX = CATCH_PAD_X;
  const padY = CATCH_PAD_Y;
  const halfW = dw / panelW / 2 + padX;
  const top = feetY - (dh - 8) / panelH - padY;
  const bottom = feetY + 8 / panelH + padY;
  return {
    left: side.x - halfW,
    right: side.x + halfW,
    top,
    bottom,
  };
}

function lootHitsSprite(it, box) {
  // 掉落物用圆形近似，碰到精灵矩形即获取
  const r = Math.max(0.025, (it.r || 12) / 420);
  return (
    it.x + r > box.left &&
    it.x - r < box.right &&
    it.y + r > box.top &&
    it.y - r < box.bottom
  );
}

function updateSideKeys(side, dt, leftCodes, rightCodes, img) {
  let move = 0;
  for (const c of leftCodes) if (keys[c]) move -= 1;
  for (const c of rightCodes) if (keys[c]) move += 1;
  if (move !== 0) side.face = move;
  const panelW = Math.max(280, (window.innerWidth - 16 * 2 - 18) / 2);
  const panelH = Math.max(320, window.innerHeight - 16 * 2 - 8);
  side.x += (move * MOVE_SPEED * dt) / panelW;
  side.x = Math.max(0.1, Math.min(0.9, side.x));
  side.bob += dt * 7;
  if (side.flash > 0) side.flash -= dt;

  if (state.phase !== "play") return;

  side.spawnT -= dt;
  if (side.spawnT <= 0) {
    spawnItem(side);
    const pace = Math.max(0.32, 1.0 - state.time * 0.014);
    side.spawnT = pace * (0.65 + Math.random() * 0.75);
  }

  for (const it of side.items) {
    it.y += (it.vy * dt) / Math.max(400, window.innerHeight);
    it.rot += it.spin * dt;
  }

  const box = spriteHitbox(side, panelW, panelH, img);
  for (const it of side.items) {
    if (it._done) continue;
    if (lootHitsSprite(it, box)) {
      it._done = true;
      side.score = Math.max(0, Math.min(GOAL, side.score + it.score));
      side.flash = it.score > 0 ? 0.22 : 0.4;
    } else if (it.y > 1.15) {
      it._done = true;
      if (it.score > 0) side.score = Math.max(0, side.score - 3);
    }
  }
  side.items = side.items.filter((it) => !it._done);
}

function updateFixed(dt) {
  if (!state || state.phase === "over") return;

  if (state.phase === "countdown") {
    state.countdown -= dt;
    // 倒计时期间可走位
    updateSideKeys(state.sides[0], dt, ["KeyA"], ["KeyD"], imgP1);
    updateSideKeys(state.sides[1], dt, ["ArrowLeft"], ["ArrowRight"], imgP2);
    if (state.countdown <= 0) {
      state.phase = "play";
      state.countdown = 0;
      state.time = 0;
      state.sides[0].spawnT = 0.35;
      state.sides[1].spawnT = 0.55;
    }
    syncHud();
    return;
  }

  state.time += dt;

  if (state.phase === "round") {
    state.roundFlash -= dt;
    if (state.roundFlash <= 0) initMatch(true);
    return;
  }

  updateSideKeys(state.sides[0], dt, ["KeyA"], ["KeyD"], imgP1);
  updateSideKeys(state.sides[1], dt, ["ArrowLeft"], ["ArrowRight"], imgP2);

  for (const s of state.sides) {
    if (s.score >= GOAL) {
      endRound(s.slot);
      break;
    }
  }
  syncHud();
}

function syncHud() {
  if (!state) return;
  if (els.p1Score) els.p1Score.textContent = String(Math.floor(state.sides[0].score));
  if (els.p2Score) els.p2Score.textContent = String(Math.floor(state.sides[1].score));
  if (els.p1Wins) els.p1Wins.textContent = `胜 ${state.sides[0].wins}`;
  if (els.p2Wins) els.p2Wins.textContent = `胜 ${state.sides[1].wins}`;
  if (els.p1Fill) els.p1Fill.style.width = `${(state.sides[0].score / GOAL) * 100}%`;
  if (els.p2Fill) els.p2Fill.style.width = `${(state.sides[1].score / GOAL) * 100}%`;
}

function drawPaperStreet(x, y, w, h) {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  // 与其他模式一致的纸感网格
  ctx.strokeStyle = "rgba(26,26,26,0.05)";
  ctx.lineWidth = 1;
  for (let gx = x; gx < x + w; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, y);
    ctx.lineTo(gx + 0.5, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy < y + h; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(x, gy + 0.5);
    ctx.lineTo(x + w, gy + 0.5);
    ctx.stroke();
  }

  // 远景浅色楼影（描边砖感，非暗夜）
  const baseY = y + h * 0.58;
  const buildings = [
    [0.04, 0.26, 0.11],
    [0.16, 0.34, 0.1],
    [0.3, 0.22, 0.12],
    [0.44, 0.38, 0.11],
    [0.58, 0.28, 0.1],
    [0.72, 0.36, 0.12],
    [0.86, 0.24, 0.1],
  ];
  for (let i = 0; i < buildings.length; i++) {
    const [rx, rh, rw] = buildings[i];
    const bx = x + w * rx;
    const bh = h * rh;
    const bw = w * rw;
    const top = baseY - bh + h * 0.1;
    ctx.fillStyle = i % 2 === 0 ? "#e4ddd0" : "#ebe4d6";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.fillRect(bx, top, bw, bh);
    ctx.strokeRect(bx + 0.5, top + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = "rgba(232,228,216,0.9)";
    ctx.fillRect(bx + 2, top + 2, bw - 4, Math.min(6, bh - 4));
    // 确定性窗格，避免每帧闪烁
    ctx.fillStyle = "rgba(200,210,220,0.55)";
    for (let wy = top + 14, row = 0; wy < baseY + h * 0.06; wy += 16, row++) {
      for (let wx = bx + 6, col = 0; wx < bx + bw - 8; wx += 12, col++) {
        if ((row + col + i) % 3 !== 0) ctx.fillRect(wx, wy, 5, 6);
      }
    }
  }

  // 地面纸砖
  const ground = ctx.createLinearGradient(0, y + h * 0.78, 0, y + h);
  ground.addColorStop(0, "#d9d0c0");
  ground.addColorStop(1, "#c8bfae");
  ctx.fillStyle = ground;
  ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
  ctx.strokeStyle = "rgba(26,26,26,0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h * 0.78);
  ctx.lineTo(x + w - 4, y + h * 0.78);
  ctx.stroke();
  ctx.strokeStyle = "rgba(26,26,26,0.08)";
  ctx.lineWidth = 1;
  for (let gx = x + 24; gx < x + w; gx += 36) {
    ctx.beginPath();
    ctx.moveTo(gx, y + h * 0.78);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
}

function drawLoot(it, px, py) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(it.rot || 0);
  if (it.id === "alarm") {
    ctx.fillStyle = "#c04040";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-1.5, -4, 3, 8);
    ctx.beginPath();
    ctx.arc(0, 10, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (it.id === "bag") {
    ctx.fillStyle = "#8a5a38";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8c86a";
    ctx.beginPath();
    ctx.arc(-4, -2, 3, 0, Math.PI * 2);
    ctx.arc(3, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(0, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (it.id === "gem") {
    ctx.fillStyle = it.color;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (it.id === "watch") {
    ctx.fillStyle = "#c8d0d8";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -7);
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 2);
    ctx.stroke();
  } else {
    // coin
    ctx.fillStyle = "#e8c86a";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 11px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¥", 0, 1);
  }
  ctx.restore();
}

function drawThief(side, panelX, panelY, panelW, panelH, img) {
  const px = panelX + side.x * panelW;
  const py = panelY + panelH * 0.8 + Math.sin(side.bob) * 3;
  const { dw, dh } = spriteDrawSize(panelH, img);
  ctx.save();
  if (side.flash > 0) {
    ctx.globalAlpha = 0.55 + Math.sin(side.flash * 40) * 0.45;
  }
  if (img) {
    ctx.translate(px, py);
    if (side.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh + 8, dw, dh);
  } else {
    ctx.fillStyle = side.slot === 0 ? "#c45c26" : "#3a6ea5";
    ctx.fillRect(px - 20, py - 50, 40, 50);
  }
  ctx.restore();
}

function drawPanel(side, panelX, panelY, panelW, panelH, img, accent) {
  drawPaperStreet(panelX, panelY, panelW, panelH);

  // 面板描边
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

  for (const it of side.items) {
    drawLoot(it, panelX + it.x * panelW, panelY + it.y * panelH);
  }
  drawThief(side, panelX, panelY, panelW, panelH, img);

  // 面板内分数条
  const barX = panelX + 18;
  const barY = panelY + panelH - 52;
  const barW = panelW - 36;
  ctx.fillStyle = "rgba(26,26,26,0.12)";
  ctx.fillRect(barX, barY, barW, 14);
  ctx.fillStyle = accent;
  ctx.fillRect(barX, barY, barW * (side.score / GOAL), 14);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 13);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 16px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.floor(side.score)}`, barX, barY - 8);
  ctx.textAlign = "right";
  ctx.fillText(`胜 ${side.wins}`, barX + barW, barY - 8);

  ctx.textAlign = "center";
  ctx.font = "bold 18px Songti SC, serif";
  ctx.fillStyle = accent;
  ctx.fillText(side.slot === 0 ? "P1 偷窃" : "P2 偷窃", panelX + panelW / 2, panelY + 28);
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  ctx.clearRect(0, 0, viewW, viewH);

  // 外框纸底（与逃亡/对决一致）
  const outer = ctx.createLinearGradient(0, 0, 0, viewH);
  outer.addColorStop(0, "#ebe4d6");
  outer.addColorStop(1, "#d9d0c0");
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, viewW, viewH);

  if (!state) {
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "20px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("加载中…", viewW / 2, viewH / 2);
    return;
  }

  const gap = 18;
  const margin = 16;
  const panelW = (viewW - margin * 2 - gap) / 2;
  const panelH = viewH - margin * 2 - 8;
  const y = margin;

  drawPanel(state.sides[0], margin, y, panelW, panelH, imgP1, "#c45c26");
  drawPanel(state.sides[1], margin + panelW + gap, y, panelW, panelH, imgP2, "#3a6ea5");

  // 分屏中缝
  const mid = margin + panelW + gap / 2;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(mid - 3, y, 6, panelH);
  ctx.fillStyle = "#c45c26";
  ctx.fillRect(mid - 3, y, 6, panelH * 0.5);
  ctx.fillStyle = "#3a6ea5";
  ctx.fillRect(mid - 3, y + panelH * 0.5, 6, panelH * 0.5);

  if (state.phase === "countdown") {
    const n = Math.max(1, Math.ceil(state.countdown));
    const frac = state.countdown - Math.floor(state.countdown);
    const pulse = 0.85 + (1 - (frac || 0)) * 0.25;
    ctx.save();
    ctx.fillStyle = "rgba(26,26,26,0.28)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.translate(viewW / 2, viewH * 0.42);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 120px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 0, 0);
    ctx.font = "bold 22px Songti SC, serif";
    ctx.fillStyle = "rgba(26,26,26,0.7)";
    ctx.fillText("准备开始", 0, 78);
    ctx.restore();
  }

  if (state.phase === "round" && state.roundFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.roundFlash);
    ctx.fillStyle = "rgba(26,26,26,0.35)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#e8e0d2";
    ctx.font = "bold 48px Songti SC, serif";
    ctx.textAlign = "center";
    const leader = state.sides[0].score >= GOAL ? "P1" : "P2";
    ctx.fillText(`${leader} 本局到手！`, viewW / 2, viewH * 0.45);
    ctx.restore();
  }
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  updateFixed(dt);
  render();
  raf = requestAnimationFrame(tick);
}

function onRestart() {
  initMatch(false);
}

export async function startThief({ canvas: c, els: e }) {
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
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
  });
  on(window, "keyup", (ev) => {
    keys[ev.code] = false;
  });
  on(els.btnStart, "click", () => {
    els.overlay?.classList.add("hidden");
    initMatch(false);
  });
  on(els.btnRestart, "click", onRestart);

  await ensureAssets();
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  initMatch(false);
  raf = requestAnimationFrame(tick);
}

export function stopThief() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
