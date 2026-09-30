/**
 * 深瞳模式 — 伪 3D 射线投射 + eyeball 波次生存
 * WASD 移动 · 鼠标转向 · 空格/左键射击
 */

import {
  loadMonsters,
  getMonsterDef,
  getMonsterSprite,
} from "./monsters.js";

const MAP_W = 16;
const MAP_H = 16;
/** 1=墙 0=空；中心开阔便于开局 */
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const MOVE_SPEED = 3.2;
const STRAFE_SPEED = 2.8;
const ROT_SPEED = 0.0032;
const FOV = 0.66; // plane length ≈ FOV
const PLAYER_RADIUS = 0.22;
const FIRE_COOLDOWN = 0.28;
const MAX_HP = 100;
const WAVE_GAP = 2.2;
const INVULN = 0.85;

const WALL_NS = "#d8cfc0";
const WALL_EW = "#cfc4b0";
const CEIL = "#d8e4ec";
const FLOOR = "#cfc4b0";

const ENEMY_TYPES = ["eyeball-1", "eyeball-2", "eyeball-3"];

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let pointerLocked = false;
let zBuffer = [];

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

function cellSolid(x, y) {
  const cx = x | 0;
  const cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
  return MAP[cy][cx] === 1;
}

function tryMove(px, py, dx, dy) {
  const nx = px + dx;
  const ny = py + dy;
  if (!cellSolid(nx + PLAYER_RADIUS, py) && !cellSolid(nx - PLAYER_RADIUS, py)) px = nx;
  if (!cellSolid(px, ny + PLAYER_RADIUS) && !cellSolid(px, ny - PLAYER_RADIUS)) py = ny;
  return { x: px, y: py };
}

function emptySpots() {
  const spots = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (MAP[y][x] === 0) spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return spots;
}

function pickSpawn(player, minDist = 4) {
  const spots = emptySpots().filter((s) => {
    const dx = s.x - player.x;
    const dy = s.y - player.y;
    return dx * dx + dy * dy >= minDist * minDist;
  });
  if (!spots.length) return { x: 2.5, y: 2.5 };
  return spots[(Math.random() * spots.length) | 0];
}

function enemyTypeForWave(wave) {
  if (wave <= 2) return "eyeball-1";
  if (wave <= 4) return Math.random() < 0.55 ? "eyeball-1" : "eyeball-2";
  if (wave <= 7) {
    const r = Math.random();
    if (r < 0.35) return "eyeball-1";
    if (r < 0.75) return "eyeball-2";
    return "eyeball-3";
  }
  const r = Math.random();
  if (r < 0.2) return "eyeball-1";
  if (r < 0.55) return "eyeball-2";
  return "eyeball-3";
}

function makeEnemy(type, x, y) {
  const def = getMonsterDef(type);
  return {
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * 0.018,
    damage: def.damage,
    radius: 0.28 + (def.radius || 20) * 0.004,
    hurt: 0,
    bob: Math.random() * Math.PI * 2,
  };
}

function waveCount(wave) {
  return Math.min(14, 3 + wave + ((wave / 2) | 0));
}

function spawnWave() {
  const n = waveCount(state.wave);
  for (let i = 0; i < n; i++) {
    const type = enemyTypeForWave(state.wave);
    const spot = pickSpawn(state.player, 3.5 + Math.min(2, state.wave * 0.15));
    state.enemies.push(makeEnemy(type, spot.x, spot.y));
  }
  state.waveAnnounce = 1.6;
  state.waveGap = 0;
}

function initState() {
  state = {
    phase: "play", // play | dead
    player: {
      x: 8.0,
      y: 8.0,
      dirX: 0,
      dirY: -1,
      planeX: FOV,
      planeY: 0,
      hp: MAX_HP,
      fireCd: 0,
      invuln: 0,
      muzzle: 0,
    },
    enemies: [],
    wave: 1,
    kills: 0,
    time: 0,
    waveGap: 0.6,
    waveAnnounce: 1.2,
    shake: 0,
  };
}

function syncHud() {
  if (!state || !els.hpFill) return;
  const p = state.player;
  const pct = Math.max(0, (p.hp / MAX_HP) * 100);
  els.hpFill.style.width = pct + "%";
  if (els.hpText) els.hpText.textContent = Math.max(0, Math.ceil(p.hp));
  if (els.waveText) els.waveText.textContent = "波次 " + state.wave;
  if (els.killText) els.killText.textContent = "击杀 " + state.kills;
  if (els.enemyText) {
    els.enemyText.textContent =
      state.phase === "dead" ? "阵亡" : "剩余 " + state.enemies.length;
  }
}

function castRays(viewW, viewH) {
  const p = state.player;
  const colW = Math.max(2, Math.floor(viewW / 320));
  const cols = Math.ceil(viewW / colW);
  zBuffer = new Array(cols);

  // 天花 / 地面
  const ceilG = ctx.createLinearGradient(0, 0, 0, viewH * 0.5);
  ceilG.addColorStop(0, "#c8d6e0");
  ceilG.addColorStop(1, CEIL);
  ctx.fillStyle = ceilG;
  ctx.fillRect(0, 0, viewW, viewH * 0.5);
  const floorG = ctx.createLinearGradient(0, viewH * 0.5, 0, viewH);
  floorG.addColorStop(0, "#ddd4c4");
  floorG.addColorStop(1, FLOOR);
  ctx.fillStyle = floorG;
  ctx.fillRect(0, viewH * 0.5, viewW, viewH * 0.5);

  for (let col = 0; col < cols; col++) {
    const cameraX = (2 * col) / cols - 1;
    const rayDirX = p.dirX + p.planeX * cameraX;
    const rayDirY = p.dirY + p.planeY * cameraX;

    let mapX = p.x | 0;
    let mapY = p.y | 0;

    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

    let stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (p.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - p.x) * deltaDistX;
    }
    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (p.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - p.y) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    let guard = 0;
    while (hit === 0 && guard++ < 64) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (cellSolid(mapX, mapY)) hit = 1;
    }

    let perpWallDist;
    if (side === 0) perpWallDist = (mapX - p.x + (1 - stepX) / 2) / rayDirX;
    else perpWallDist = (mapY - p.y + (1 - stepY) / 2) / rayDirY;
    if (perpWallDist < 0.01) perpWallDist = 0.01;

    zBuffer[col] = perpWallDist;

    const lineH = (viewH / perpWallDist) | 0;
    let drawStart = ((viewH - lineH) / 2) | 0;
    let drawEnd = ((viewH + lineH) / 2) | 0;
    if (drawStart < 0) drawStart = 0;
    if (drawEnd >= viewH) drawEnd = viewH - 1;

    let color = side === 1 ? WALL_EW : WALL_NS;
    // 距离雾化
    const fog = Math.min(0.55, perpWallDist * 0.06);
    ctx.fillStyle = mixFog(color, fog);
    const x0 = col * colW;
    ctx.fillRect(x0, drawStart, colW + 1, drawEnd - drawStart + 1);

    // 墙顶细线
    ctx.fillStyle = "rgba(26,26,26,0.12)";
    ctx.fillRect(x0, drawStart, colW + 1, 1);
  }

  return { cols, colW };
}

function mixFog(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const fr = (r * (1 - amount) + 210 * amount) | 0;
  const fg = (g * (1 - amount) + 205 * amount) | 0;
  const fb = (b * (1 - amount) + 190 * amount) | 0;
  return `rgb(${fr},${fg},${fb})`;
}

function drawSprites(viewW, viewH, cols, colW) {
  const p = state.player;
  const list = state.enemies
    .map((e) => {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      return { e, dist: dx * dx + dy * dy };
    })
    .sort((a, b) => b.dist - a.dist);

  const invDet = 1 / (p.planeX * p.dirY - p.dirX * p.planeY);

  for (const { e } of list) {
    const spriteX = e.x - p.x;
    const spriteY = e.y - p.y;
    const transformX = invDet * (p.dirY * spriteX - p.dirX * spriteY);
    const transformY = invDet * (-p.planeY * spriteX + p.planeX * spriteY);
    if (transformY <= 0.05) continue;

    const spriteScreenX = ((viewW / 2) * (1 + transformX / transformY)) | 0;
    const spriteH = Math.abs(((viewH / transformY) * 0.85) | 0);
    const spriteW = (spriteH * 0.75) | 0;

    const bob = Math.sin(state.time * 5 + e.bob) * Math.min(6, spriteH * 0.02);
    let drawStartY = (((viewH - spriteH) / 2) | 0) + bob;
    let drawEndY = drawStartY + spriteH;
    let drawStartX = (spriteScreenX - spriteW / 2) | 0;
    let drawEndX = drawStartX + spriteW;

    const spr = getMonsterSprite(e.type);
    const src = spr?.canvas;
    const sw = spr?.w || 64;
    const sh = spr?.h || 64;

    const stripeStart = Math.max(0, drawStartX);
    const stripeEnd = Math.min(viewW - 1, drawEndX);

    for (let stripe = stripeStart; stripe < stripeEnd; stripe++) {
      const col = (stripe / colW) | 0;
      if (col < 0 || col >= cols) continue;
      if (transformY >= zBuffer[col]) continue;

      if (src) {
        const texX = (((stripe - drawStartX) * sw) / spriteW) | 0;
        const dy0 = Math.max(0, drawStartY);
        const dy1 = Math.min(viewH, drawEndY);
        if (dy1 <= dy0) continue;
        const srcY0 = (((dy0 - drawStartY) * sh) / spriteH) | 0;
        const srcY1 = Math.min(sh, Math.ceil(((dy1 - drawStartY) * sh) / spriteH));
        if (srcY1 <= srcY0) continue;
        ctx.save();
        if (e.hurt > 0) ctx.globalAlpha = 0.5 + Math.sin(e.hurt * 40) * 0.3;
        ctx.drawImage(
          src,
          texX,
          srcY0,
          1,
          Math.max(1, srcY1 - srcY0),
          stripe,
          dy0,
          1,
          dy1 - dy0
        );
        ctx.restore();
      } else {
        ctx.fillStyle = e.hurt > 0 ? "#c23b3b" : "#A7E6C9";
        ctx.fillRect(stripe, Math.max(0, drawStartY), 1, Math.min(viewH, spriteH));
      }
    }

    // 简易血条（近距离）
    if (transformY < 8 && e.hp < e.maxHp) {
      const bw = Math.min(80, spriteW * 0.7);
      const bx = spriteScreenX - bw / 2;
      const by = Math.max(8, drawStartY - 10);
      ctx.fillStyle = "rgba(26,26,26,0.35)";
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = "#c23b3b";
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 4);
    }
  }
}

function drawWeapon(viewW, viewH) {
  const p = state.player;
  const kick = p.muzzle > 0 ? p.muzzle * 18 : 0;
  const bob = Math.sin(state.time * (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD ? 10 : 2)) * 4;

  ctx.save();
  ctx.translate(viewW * 0.62, viewH + kick + bob);
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#e8e0d2";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";

  // 枪身
  ctx.beginPath();
  ctx.moveTo(-20, -40);
  ctx.lineTo(50, -70);
  ctx.lineTo(58, -55);
  ctx.lineTo(10, -20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 握把
  ctx.beginPath();
  ctx.moveTo(-8, -28);
  ctx.lineTo(-18, 10);
  ctx.lineTo(4, 14);
  ctx.lineTo(12, -18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 枪口火光
  if (p.muzzle > 0.05) {
    ctx.fillStyle = `rgba(255, 180, 60, ${p.muzzle})`;
    ctx.beginPath();
    ctx.arc(55, -62, 10 + p.muzzle * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHudOverlay(viewW, viewH) {
  // 准星
  const cx = viewW / 2;
  const cy = viewH / 2;
  ctx.strokeStyle = "rgba(26,26,26,0.65)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 10);
  ctx.stroke();

  if (state.waveAnnounce > 0) {
    ctx.fillStyle = "rgba(26,26,26,0.55)";
    ctx.font = "bold 28px Songti SC, Noto Serif SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("第 " + state.wave + " 波", viewW / 2, viewH * 0.22);
  }

  if (!pointerLocked && state.phase === "play") {
    ctx.fillStyle = "rgba(26,26,26,0.45)";
    ctx.font = "16px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("点击画面锁定鼠标 · WASD 移动 · 左键/空格射击", viewW / 2, viewH * 0.9);
  }

  if (state.phase === "dead") {
    ctx.fillStyle = "rgba(42,40,36,0.35)";
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

function render() {
  if (!state) return;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake * 8, (Math.random() - 0.5) * state.shake * 8);
  }
  const { cols, colW } = castRays(viewW, viewH);
  drawSprites(viewW, viewH, cols, colW);
  drawWeapon(viewW, viewH);
  drawHudOverlay(viewW, viewH);
  ctx.restore();
}

function fire() {
  const p = state.player;
  if (state.phase !== "play" || p.fireCd > 0) return;
  p.fireCd = FIRE_COOLDOWN;
  p.muzzle = 0.35;

  // 屏幕中心瞄准：在相机前方找最近敌人（带角度容差）
  let best = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.2 || dist > 14) continue;
    const fx = dx / dist;
    const fy = dy / dist;
    const dot = fx * p.dirX + fy * p.dirY;
    const angTol = 0.12 + e.radius * 0.35 / Math.max(1, dist);
    if (dot < Math.cos(angTol)) continue;
    // 简易视线：步进采样
    if (!hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }

  if (best) {
    const def = getMonsterDef(best.type);
    best.hp -= 22 + (def.hp > 70 ? 4 : 0);
    best.hurt = 0.35;
    // 击退
    const dx = best.x - p.x;
    const dy = best.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const knock = 0.18;
    const nx = best.x + (dx / len) * knock;
    const ny = best.y + (dy / len) * knock;
    if (!cellSolid(nx, best.y)) best.x = nx;
    if (!cellSolid(best.x, ny)) best.y = ny;

    if (best.hp <= 0) {
      state.kills++;
      state.enemies = state.enemies.filter((x) => x !== best);
    }
  }
}

function hasLineOfSight(x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(4, (dist * 8) | 0);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (cellSolid(x, y)) return false;
  }
  return true;
}

function updatePlayer(dt) {
  const p = state.player;
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.muzzle > 0) p.muzzle -= dt * 2.2;
  if (p.invuln > 0) p.invuln -= dt;
  if (state.shake > 0) state.shake -= dt;

  let mx = 0;
  let my = 0;
  if (keys.KeyW || keys.ArrowUp) {
    mx += p.dirX;
    my += p.dirY;
  }
  if (keys.KeyS || keys.ArrowDown) {
    mx -= p.dirX;
    my -= p.dirY;
  }
  if (keys.KeyA) {
    mx -= p.planeX * (STRAFE_SPEED / MOVE_SPEED);
    my -= p.planeY * (STRAFE_SPEED / MOVE_SPEED);
  }
  if (keys.KeyD) {
    mx += p.planeX * (STRAFE_SPEED / MOVE_SPEED);
    my += p.planeY * (STRAFE_SPEED / MOVE_SPEED);
  }
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx = (mx / len) * MOVE_SPEED * dt;
    my = (my / len) * MOVE_SPEED * dt;
    const moved = tryMove(p.x, p.y, mx, my);
    p.x = moved.x;
    p.y = moved.y;
  }

  // 键盘转向兜底（无指针锁时）
  if (!pointerLocked) {
    if (keys.ArrowLeft || keys.KeyQ) rotate(-1.8 * dt);
    if (keys.ArrowRight || keys.KeyE) rotate(1.8 * dt);
  }
}

function rotate(angle) {
  const p = state.player;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const odx = p.dirX;
  p.dirX = odx * c - p.dirY * s;
  p.dirY = odx * s + p.dirY * c;
  const opx = p.planeX;
  p.planeX = opx * c - p.planeY * s;
  p.planeY = opx * s + p.planeY * c;
}

function updateEnemies(dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.hurt > 0) e.hurt -= dt;
    e.bob += dt;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (dist > e.radius + 0.08) {
      const ox = e.x;
      const oy = e.y;
      const step = e.speed * dt;
      const sx = (dx / dist) * step;
      const sy = (dy / dist) * step;
      const moved = tryMove(e.x, e.y, sx, sy);
      e.x = moved.x;
      e.y = moved.y;
      if (Math.hypot(e.x - ox, e.y - oy) < step * 0.25) {
        const side = tryMove(e.x, e.y, -sy * 1.2, sx * 1.2);
        e.x = side.x;
        e.y = side.y;
      }
    } else if (p.invuln <= 0 && state.phase === "play") {
      p.hp -= e.damage;
      p.invuln = INVULN;
      state.shake = 0.35;
      if (p.hp <= 0) {
        p.hp = 0;
        endGame();
      }
    }
  }
}

function updateWaves(dt) {
  if (state.phase !== "play") return;
  if (state.waveAnnounce > 0) state.waveAnnounce -= dt;

  if (state.enemies.length === 0) {
    if (state.waveGap <= 0) {
      state.waveGap = WAVE_GAP;
    } else {
      state.waveGap -= dt;
      if (state.waveGap <= 0) {
        if (state.time > 1) state.wave++;
        spawnWave();
      }
    }
  }
}

function endGame() {
  state.phase = "dead";
  if (els.endTitle) els.endTitle.textContent = "阵亡";
  if (els.resultText) {
    els.resultText.textContent = `撑到第 ${state.wave} 波 · 击杀 ${state.kills}`;
  }
  els.hud?.classList.add("hidden");
  els.gameover?.classList.remove("hidden");
  try {
    document.exitPointerLock?.();
  } catch (_) {}
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state && state.phase === "play") {
    state.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateWaves(dt);
    syncHud();
  } else if (state) {
    syncHud();
  }
  render();
  raf = requestAnimationFrame(tick);
}

function requestLock() {
  if (!canvas || state?.phase !== "play") return;
  canvas.requestPointerLock?.();
}

function onPointerMove(ev) {
  if (!pointerLocked || !state || state.phase !== "play") return;
  rotate(ev.movementX * ROT_SPEED);
}

function onPointerDown(ev) {
  if (state?.phase !== "play") return;
  if (!pointerLocked) {
    requestLock();
    return;
  }
  if (ev.button === 0) fire();
}

function beginRun() {
  initState();
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  spawnWave();
  syncHud();
  requestLock();
}

export async function startDoom({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  keys = Object.create(null);
  offAll();
  resize();

  await loadMonsters();

  on(window, "resize", resize);
  on(window, "keydown", (ev) => {
    keys[ev.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
    if (ev.code === "Space") fire();
    if (ev.code === "Escape") {
      try {
        document.exitPointerLock?.();
      } catch (_) {}
    }
  });
  on(window, "keyup", (ev) => {
    keys[ev.code] = false;
  });
  on(document, "pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  on(canvas, "mousemove", onPointerMove);
  on(canvas, "mousedown", onPointerDown);
  on(els.btnStart, "click", beginRun);
  on(els.btnRestart, "click", beginRun);

  // 直接开局
  beginRun();
  if (!running) return;
  raf = requestAnimationFrame(tick);
}

export function stopDoom() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  pointerLocked = false;
  try {
    document.exitPointerLock?.();
  } catch (_) {}
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
