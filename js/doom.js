/**
 * 射击模式 — 伪 3D 射线 + fps_monster 波次生存
 * 单人 / 双人左右分屏；对方显示为持枪火柴人
 * 单人：WASD 移动 · 鼠标转向 · 空格/J/左键射击
 * 双人：P1 WASD 进退平移 · A/D 转身 · J/空格射击
 *       P2 ↑↓ 进退 · ←→ 转身 · ,/. 平移 · Shift/1/Enter 射击
 */

const MAP_W = 16;
const MAP_H = 16;
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
const KEY_ROT = 2.0;
const FOV = 0.66;
const PLAYER_RADIUS = 0.22;
const FIRE_COOLDOWN = 0.32;
const MAX_HP = 100;
const WAVE_GAP = 2.2;
const INVULN = 0.85;

const WALL_NS = "#d8cfc0";
const WALL_EW = "#cfc4b0";
const CEIL = "#d8e4ec";
const FLOOR = "#cfc4b0";

const WEAPON_SRC = "assets/player/gun/fps_weapons.png";
const WEAPON_CELL = 64;
const WEAPON_COLS = 5;
/** 0刀 1手枪 2步枪 3重武 */
const WEAPON_ROWS = { knife: 0, pistol: 1, rifle: 2, heavy: 3 };

const FPS_DIR = "assets/sprites/fps_monster/_src/";
/** 射击模式专用怪物表（直接用 _src 原图，不做抠底裁切） */
const FPS_DEFS = {
  eyeball_green: {
    file: "eyeball_green.png",
    name: "青绿眼球",
    hp: 40,
    speed: 0.72,
    damage: 12,
    radius: 0.32,
    scaleY: 0.9,
  },
  eyeball_pink: {
    file: "eyeball_pink.png",
    name: "粉红眼球",
    hp: 55,
    speed: 0.78,
    damage: 15,
    radius: 0.34,
    scaleY: 0.9,
  },
  eyeball_blue: {
    file: "eyeball_blue.png",
    name: "蓝色眼球",
    hp: 70,
    speed: 0.7,
    damage: 18,
    radius: 0.36,
    scaleY: 0.92,
  },
  fox: {
    file: "fox.png",
    name: "九尾狐",
    hp: 85,
    speed: 0.95,
    damage: 20,
    radius: 0.4,
    scaleY: 0.8,
  },
  tiger_wing: {
    file: "tiger_wing.png",
    name: "飞虎虫",
    hp: 100,
    speed: 0.85,
    damage: 22,
    radius: 0.42,
    scaleY: 0.78,
  },
  ghost_lady: {
    file: "ghost_lady.png",
    name: "无面仕女",
    hp: 120,
    speed: 0.55,
    damage: 26,
    radius: 0.38,
    scaleY: 1.05,
  },
};
const FPS_IDS = Object.keys(FPS_DEFS);

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let pointerLocked = false;
let coopMode = false;
let weaponSheet = null;
/** @type {Record<string, {canvas: HTMLCanvasElement, w: number, h: number}>} */
let fpsSprites = Object.create(null);
const stickSprites = { 0: null, 1: null };

function on(t, type, fn, opts) {
  t.addEventListener(type, fn, opts);
  listeners.push([t, type, fn, opts]);
}
function offAll() {
  for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
  listeners = [];
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
    img.src = encodeURI(src) + "?v=2";
  });
}

/** 抠黑底，得到透明武器表 */
function punchBlack(img, threshold = 18) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] <= threshold && d[i + 1] <= threshold && d[i + 2] <= threshold) d[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  return c;
}

async function ensureWeapons() {
  if (weaponSheet) return;
  const img = await loadImage(WEAPON_SRC);
  weaponSheet = punchBlack(img);
}

function downscaleSprite(img, maxSide = 256) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, w, h);
  return { canvas: c, w, h };
}

async function ensureFpsMonsters() {
  if (FPS_IDS.every((id) => fpsSprites[id])) return;
  await Promise.all(
    FPS_IDS.map(async (id) => {
      if (fpsSprites[id]) return;
      const def = FPS_DEFS[id];
      const img = await loadImage(FPS_DIR + def.file);
      fpsSprites[id] = downscaleSprite(img);
    })
  );
}

function getFpsDef(type) {
  return FPS_DEFS[type] || FPS_DEFS.eyeball_green;
}

function getFpsSprite(type) {
  return fpsSprites[type] || null;
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

function livingPlayers() {
  return state.players.filter((p) => p.alive);
}

function pickSpawn(minDist = 4) {
  const lives = livingPlayers();
  const spots = emptySpots().filter((s) =>
    lives.every((p) => {
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      return dx * dx + dy * dy >= minDist * minDist;
    })
  );
  if (!spots.length) return { x: 2.5, y: 2.5 };
  return spots[(Math.random() * spots.length) | 0];
}

function enemyTypeForWave(wave) {
  if (wave <= 2) {
    return Math.random() < 0.7 ? "eyeball_green" : "eyeball_pink";
  }
  if (wave <= 4) {
    const r = Math.random();
    if (r < 0.4) return "eyeball_green";
    if (r < 0.75) return "eyeball_pink";
    return "eyeball_blue";
  }
  if (wave <= 7) {
    const r = Math.random();
    if (r < 0.25) return "eyeball_pink";
    if (r < 0.5) return "eyeball_blue";
    if (r < 0.78) return "fox";
    return "tiger_wing";
  }
  const r = Math.random();
  if (r < 0.15) return "eyeball_blue";
  if (r < 0.35) return "fox";
  if (r < 0.6) return "tiger_wing";
  if (r < 0.85) return "ghost_lady";
  return "eyeball_pink";
}

function makeEnemy(type, x, y) {
  const def = getFpsDef(type);
  return {
    type,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    damage: def.damage,
    radius: def.radius,
    scaleY: def.scaleY || 0.85,
    hurt: 0,
    bob: Math.random() * Math.PI * 2,
  };
}

function waveCount(wave) {
  const base = Math.min(14, 3 + wave + ((wave / 2) | 0));
  return coopMode ? Math.min(18, base + 2) : base;
}

function spawnWave() {
  const n = waveCount(state.wave);
  for (let i = 0; i < n; i++) {
    const type = enemyTypeForWave(state.wave);
    const spot = pickSpawn(3.5 + Math.min(2, state.wave * 0.15));
    state.enemies.push(makeEnemy(type, spot.x, spot.y));
  }
  state.waveAnnounce = 1.6;
  state.waveGap = 0;
}

function makePlayer(slot, x, y, dirX, dirY) {
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  return {
    slot,
    x,
    y,
    dirX: dx,
    dirY: dy,
    planeX: -dy * FOV,
    planeY: dx * FOV,
    hp: MAX_HP,
    fireCd: 0,
    invuln: 0,
    muzzle: 0,
    shake: 0,
    alive: true,
    kills: 0,
    weapon: "pistol",
    color: slot === 0 ? "#c45c26" : "#3a6ea5",
  };
}

function initState() {
  const players = [makePlayer(0, 7.5, 8.0, 0, -1)];
  if (coopMode) players.push(makePlayer(1, 8.5, 8.0, 0, -1));
  state = {
    phase: "play",
    coop: coopMode,
    players,
    enemies: [],
    wave: 1,
    kills: 0,
    time: 0,
    waveGap: 0.6,
    waveAnnounce: 1.2,
  };
}

function syncHud() {
  if (!state) return;
  const p1 = state.players[0];
  const p2 = state.players[1];
  if (els.hpFill && p1) {
    els.hpFill.style.width = Math.max(0, (p1.hp / MAX_HP) * 100) + "%";
  }
  if (els.hpText && p1) els.hpText.textContent = Math.max(0, Math.ceil(p1.hp));
  if (els.p1Label) els.p1Label.textContent = state.coop ? "P1" : "生命";

  if (els.p2Stat) {
    if (state.coop && p2) {
      els.p2Stat.classList.remove("hidden");
      if (els.hp2Fill) els.hp2Fill.style.width = Math.max(0, (p2.hp / MAX_HP) * 100) + "%";
      if (els.hp2Text) els.hp2Text.textContent = Math.max(0, Math.ceil(p2.hp));
    } else {
      els.p2Stat.classList.add("hidden");
    }
  }

  if (els.waveText) els.waveText.textContent = "波次 " + state.wave;
  if (els.killText) els.killText.textContent = "击杀 " + state.kills;
  if (els.enemyText) {
    els.enemyText.textContent =
      state.phase === "dead" ? "全灭" : "剩余 " + state.enemies.length;
  }
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

function castRays(cam, viewW, viewH) {
  const colW = Math.max(2, Math.floor(viewW / 280));
  const cols = Math.ceil(viewW / colW);
  const zBuffer = new Array(cols);

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
    const rayDirX = cam.dirX + cam.planeX * cameraX;
    const rayDirY = cam.dirY + cam.planeY * cameraX;

    let mapX = cam.x | 0;
    let mapY = cam.y | 0;
    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

    let stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (cam.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - cam.x) * deltaDistX;
    }
    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (cam.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - cam.y) * deltaDistY;
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
    if (side === 0) perpWallDist = (mapX - cam.x + (1 - stepX) / 2) / rayDirX;
    else perpWallDist = (mapY - cam.y + (1 - stepY) / 2) / rayDirY;
    if (perpWallDist < 0.01) perpWallDist = 0.01;
    zBuffer[col] = perpWallDist;

    const lineH = (viewH / perpWallDist) | 0;
    let drawStart = ((viewH - lineH) / 2) | 0;
    let drawEnd = ((viewH + lineH) / 2) | 0;
    if (drawStart < 0) drawStart = 0;
    if (drawEnd >= viewH) drawEnd = viewH - 1;

    const fog = Math.min(0.55, perpWallDist * 0.06);
    ctx.fillStyle = mixFog(side === 1 ? WALL_EW : WALL_NS, fog);
    const x0 = col * colW;
    ctx.fillRect(x0, drawStart, colW + 1, drawEnd - drawStart + 1);
    ctx.fillStyle = "rgba(26,26,26,0.12)";
    ctx.fillRect(x0, drawStart, colW + 1, 1);
  }
  return { cols, colW, zBuffer };
}

function makeStickGunSprite(color) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d");
  g.strokeStyle = "#1a1a1a";
  g.fillStyle = color;
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.lineJoin = "round";

  g.beginPath();
  g.arc(32, 14, 9, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  g.beginPath();
  g.moveTo(32, 23);
  g.lineTo(32, 52);
  g.stroke();

  g.beginPath();
  g.moveTo(32, 52);
  g.lineTo(22, 78);
  g.moveTo(32, 52);
  g.lineTo(42, 78);
  g.stroke();

  g.beginPath();
  g.moveTo(32, 30);
  g.lineTo(48, 36);
  g.stroke();
  g.fillStyle = "#e8e0d2";
  g.beginPath();
  g.moveTo(46, 34);
  g.lineTo(60, 28);
  g.lineTo(61, 32);
  g.lineTo(48, 38);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(32, 32);
  g.lineTo(22, 44);
  g.stroke();

  return c;
}

function stickSpriteFor(slot) {
  if (!stickSprites[slot]) {
    stickSprites[slot] = makeStickGunSprite(slot === 0 ? "#c45c26" : "#3a6ea5");
  }
  return stickSprites[slot];
}

function projectSprite(cam, x, y, viewW, viewH, scaleY = 0.85) {
  const spriteX = x - cam.x;
  const spriteY = y - cam.y;
  const invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);
  const transformX = invDet * (cam.dirY * spriteX - cam.dirX * spriteY);
  const transformY = invDet * (-cam.planeY * spriteX + cam.planeX * spriteY);
  if (transformY <= 0.05) return null;
  const spriteScreenX = ((viewW / 2) * (1 + transformX / transformY)) | 0;
  const spriteH = Math.abs(((viewH / transformY) * scaleY) | 0);
  const spriteW = (spriteH * 0.7) | 0;
  return { transformY, spriteScreenX, spriteH, spriteW };
}

function drawBillboardColumns(opts) {
  const {
    viewW,
    viewH,
    cols,
    colW,
    zBuffer,
    transformY,
    spriteScreenX,
    spriteH,
    spriteW,
    bob = 0,
    src,
    sw,
    sh,
    alpha = 1,
  } = opts;

  const drawStartY = (((viewH - spriteH) / 2) | 0) + bob;
  const drawEndY = drawStartY + spriteH;
  const drawStartX = (spriteScreenX - spriteW / 2) | 0;
  const drawEndX = drawStartX + spriteW;
  const stripeStart = Math.max(0, drawStartX);
  const stripeEnd = Math.min(viewW, drawEndX);
  if (stripeEnd <= stripeStart || spriteW < 1 || spriteH < 1) return { drawStartY };

  const dy0 = Math.max(0, drawStartY);
  const dy1 = Math.min(viewH, drawEndY);
  if (dy1 <= dy0) return { drawStartY };

  const srcY0 = Math.max(0, (((dy0 - drawStartY) * sh) / spriteH) | 0);
  const srcY1 = Math.min(sh, Math.ceil(((dy1 - drawStartY) * sh) / spriteH));
  const srcH = Math.max(1, srcY1 - srcY0);
  const destH = dy1 - dy0;

  const prevAlpha = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (!src) ctx.fillStyle = "#A7E6C9";

  const flush = (runStart, runEnd) => {
    const dw = runEnd - runStart;
    if (dw <= 0) return;
    if (!src) {
      ctx.fillRect(runStart, dy0, dw, destH);
      return;
    }
    const texX0 = ((runStart - drawStartX) * sw) / spriteW;
    const texX1 = ((runEnd - drawStartX) * sw) / spriteW;
    const sx = Math.max(0, texX0 | 0);
    const swSlice = Math.max(1, Math.min(sw - sx, Math.max(1, Math.ceil(texX1) - sx)));
    ctx.drawImage(src, sx, srcY0, swSlice, srcH, runStart, dy0, dw, destH);
  };

  // 按墙柱分辨率测遮挡，连续可见段一次画出（靠近时避免每像素一次 drawImage）
  let runStart = -1;
  const col0 = Math.max(0, (stripeStart / colW) | 0);
  const col1 = Math.min(cols - 1, ((stripeEnd - 1) / colW) | 0);
  for (let col = col0; col <= col1; col++) {
    const vis = transformY < zBuffer[col];
    const x0 = Math.max(stripeStart, col * colW);
    const x1 = Math.min(stripeEnd, (col + 1) * colW);
    if (vis) {
      if (runStart < 0) runStart = x0;
    } else if (runStart >= 0) {
      flush(runStart, x0);
      runStart = -1;
    }
  }
  if (runStart >= 0) flush(runStart, stripeEnd);

  ctx.globalAlpha = prevAlpha;
  return { drawStartY };
}

function drawSprites(cam, viewW, viewH, cols, colW, zBuffer, viewerSlot) {
  const billboards = [];

  for (const e of state.enemies) {
    const dx = e.x - cam.x;
    const dy = e.y - cam.y;
    billboards.push({ kind: "enemy", e, dist: dx * dx + dy * dy });
  }

  if (state.coop) {
    for (const op of state.players) {
      if (op.slot === viewerSlot) continue;
      const dx = op.x - cam.x;
      const dy = op.y - cam.y;
      billboards.push({ kind: "ally", p: op, dist: dx * dx + dy * dy });
    }
  }

  billboards.sort((a, b) => b.dist - a.dist);

  for (const item of billboards) {
    if (item.kind === "enemy") {
      const e = item.e;
      const proj = projectSprite(cam, e.x, e.y, viewW, viewH, e.scaleY || 0.85);
      if (!proj) continue;
      const spr = getFpsSprite(e.type);
      const bob = Math.sin(state.time * 5 + e.bob) * Math.min(6, proj.spriteH * 0.02);
      const alpha = e.hurt > 0 ? 0.5 + Math.sin(e.hurt * 40) * 0.3 : 1;
      const aspect = spr ? spr.w / spr.h : 0.75;
      const spriteW = (proj.spriteH * aspect) | 0;
      const drawn = drawBillboardColumns({
        viewW,
        viewH,
        cols,
        colW,
        zBuffer,
        transformY: proj.transformY,
        spriteScreenX: proj.spriteScreenX,
        spriteH: proj.spriteH,
        spriteW,
        bob,
        src: spr?.canvas,
        sw: spr?.w || 64,
        sh: spr?.h || 64,
        alpha,
      });
      if (proj.transformY < 8 && e.hp < e.maxHp) {
        const bw = Math.min(80, spriteW * 0.7);
        const bx = proj.spriteScreenX - bw / 2;
        const by = Math.max(8, drawn.drawStartY - 10);
        ctx.fillStyle = "rgba(26,26,26,0.35)";
        ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = "#c23b3b";
        ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 4);
      }
    } else {
      const op = item.p;
      const proj = projectSprite(cam, op.x, op.y, viewW, viewH, op.alive ? 0.9 : 0.55);
      if (!proj) continue;
      const src = stickSpriteFor(op.slot);
      const bob = op.alive ? Math.sin(state.time * 6) * 2 : 0;
      const alpha = op.alive ? (op.invuln > 0 ? 0.55 + Math.sin(op.invuln * 30) * 0.25 : 1) : 0.4;
      drawBillboardColumns({
        viewW,
        viewH,
        cols,
        colW,
        zBuffer,
        transformY: proj.transformY,
        spriteScreenX: proj.spriteScreenX,
        spriteH: proj.spriteH,
        spriteW: (proj.spriteH * 0.55) | 0,
        bob,
        src,
        sw: src.width,
        sh: src.height,
        alpha,
      });
      if (proj.transformY < 10) {
        ctx.fillStyle = op.color;
        ctx.font = "bold 13px Songti SC, serif";
        ctx.textAlign = "center";
        ctx.fillText(
          op.alive ? `P${op.slot + 1}` : `P${op.slot + 1}↓`,
          proj.spriteScreenX,
          Math.max(16, (viewH - proj.spriteH) / 2 - 8)
        );
      }
    }
  }
}

function weaponAnimFrame(p) {
  // 开火序列：0 idle · 1 预备 · 2 火光 · 3 后坐 · 4 回正
  const m = p.muzzle;
  if (m > 0.28) return 2;
  if (m > 0.2) return 3;
  if (m > 0.12) return 4;
  if (m > 0.04) return 1;
  return 0;
}

function drawWeapon(cam, viewW, viewH, moving) {
  if (!cam.alive) {
    ctx.fillStyle = "rgba(42,40,36,0.45)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText(state.coop ? "已阵亡 · 等待队友" : "阵亡", viewW / 2, viewH * 0.5);
    return;
  }

  const bob = Math.sin(state.time * (moving ? 10 : 2)) * (moving ? 5 : 2);
  const sway = Math.sin(state.time * (moving ? 5 : 1.2)) * (moving ? 4 : 1.5);
  const scale = Math.min(viewW, viewH) * 0.0072;
  const dw = WEAPON_CELL * scale;
  const dh = WEAPON_CELL * scale;
  const dx = (viewW - dw) / 2 + sway;
  const dy = viewH - dh * 0.92 + bob + (cam.muzzle > 0 ? cam.muzzle * 10 : 0);

  if (weaponSheet) {
    const row = WEAPON_ROWS[cam.weapon] ?? WEAPON_ROWS.pistol;
    const frame = weaponAnimFrame(cam);
    const sx = frame * WEAPON_CELL;
    const sy = row * WEAPON_CELL;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(weaponSheet, sx, sy, WEAPON_CELL, WEAPON_CELL, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = true;
  } else {
    // 资源未就绪时的占位
    ctx.fillStyle = "#e8e0d2";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.fillRect(viewW * 0.4, viewH * 0.72, viewW * 0.2, viewH * 0.2);
    ctx.strokeRect(viewW * 0.4, viewH * 0.72, viewW * 0.2, viewH * 0.2);
  }
}

function drawCrosshair(viewW, viewH) {
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
}

function renderView(cam, ox, oy, viewW, viewH, moving) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, viewW, viewH);
  ctx.clip();
  ctx.translate(ox, oy);
  if (cam.shake > 0) {
    ctx.translate((Math.random() - 0.5) * cam.shake * 8, (Math.random() - 0.5) * cam.shake * 8);
  }
  const { cols, colW, zBuffer } = castRays(cam, viewW, viewH);
  drawSprites(cam, viewW, viewH, cols, colW, zBuffer, cam.slot);
  drawWeapon(cam, viewW, viewH, moving);
  if (cam.alive) drawCrosshair(viewW, viewH);

  if (state.waveAnnounce > 0) {
    ctx.fillStyle = "rgba(26,26,26,0.55)";
    ctx.font = "bold 22px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("第 " + state.wave + " 波", viewW / 2, viewH * 0.2);
  }

  ctx.fillStyle = cam.color;
  ctx.font = "bold 14px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText(`P${cam.slot + 1}`, 12, 22);
  ctx.restore();
}

function render() {
  if (!state) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#d8e4ec");
    g.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  ctx.clearRect(0, 0, W, H);

  if (state.coop && state.players.length > 1) {
    const mid = (W / 2) | 0;
    const p1 = state.players[0];
    const p2 = state.players[1];
    const m1 = keys.KeyW || keys.KeyS || keys.KeyQ || keys.KeyE;
    const m2 = keys.ArrowUp || keys.ArrowDown || keys.Comma || keys.Period;
    renderView(p1, 0, 0, mid, H, m1);
    renderView(p2, mid, 0, W - mid, H, m2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(mid - 2, 0, 4, H);
  } else {
    const p1 = state.players[0];
    const m1 = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || keys.KeyQ || keys.KeyE;
    renderView(p1, 0, 0, W, H, m1);
    if (!pointerLocked && state.phase === "play" && p1.alive) {
      ctx.fillStyle = "rgba(26,26,26,0.45)";
      ctx.font = "15px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText("点击锁定鼠标 · WASD · 左键/空格射击", W / 2, H * 0.92);
    }
  }
}

function hasLineOfSight(x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(4, (dist * 8) | 0);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (cellSolid(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

function weaponDamage(player) {
  return player.weapon === "heavy" ? 38 : player.weapon === "rifle" ? 26 : player.weapon === "knife" ? 18 : 22;
}

/** 准星前方最近可命中目标（怪 / 队友） */
function aimTarget(player) {
  let best = null;
  let bestDist = Infinity;

  const consider = (x, y, radius, kind, ref) => {
    const dx = x - player.x;
    const dy = y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.2 || dist > 14) return;
    const fx = dx / dist;
    const fy = dy / dist;
    const dot = fx * player.dirX + fy * player.dirY;
    const angTol = 0.12 + (radius * 0.35) / Math.max(1, dist);
    if (dot < Math.cos(angTol)) return;
    if (!hasLineOfSight(player.x, player.y, x, y)) return;
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind, ref, x, y, dist };
    }
  };

  for (const e of state.enemies) consider(e.x, e.y, e.radius, "enemy", e);
  if (state.coop) {
    for (const op of state.players) {
      if (op === player || !op.alive) continue;
      consider(op.x, op.y, PLAYER_RADIUS + 0.12, "ally", op);
    }
  }
  return best;
}

function fire(player) {
  if (!state || state.phase !== "play" || !player?.alive || player.fireCd > 0) return;
  player.fireCd = player.weapon === "heavy" ? 0.55 : player.weapon === "rifle" ? 0.22 : FIRE_COOLDOWN;
  player.muzzle = 0.38;

  const hit = aimTarget(player);
  if (!hit) return;

  const dmg = weaponDamage(player);
  if (hit.kind === "ally") {
    // 队友互伤：略过无敌帧，保证能打到
    const ally = hit.ref;
    const prev = ally.invuln;
    ally.invuln = 0;
    hurtPlayer(ally, Math.max(12, (dmg * 0.85) | 0));
    if (ally.alive) ally.invuln = Math.min(0.25, prev);
    const dx = ally.x - player.x;
    const dy = ally.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const moved = tryMove(ally.x, ally.y, (dx / len) * 0.22, (dy / len) * 0.22);
    ally.x = moved.x;
    ally.y = moved.y;
    return;
  }

  const best = hit.ref;
  best.hp -= dmg + (getFpsDef(best.type).hp > 90 ? 6 : 0);
  best.hurt = 0.35;
  const dx = best.x - player.x;
  const dy = best.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = best.x + (dx / len) * 0.18;
  const ny = best.y + (dy / len) * 0.18;
  if (!cellSolid(nx, best.y)) best.x = nx;
  if (!cellSolid(best.x, ny)) best.y = ny;
  if (best.hp <= 0) {
    state.kills++;
    player.kills++;
    state.enemies = state.enemies.filter((x) => x !== best);
  }
}

function rotatePlayer(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const odx = p.dirX;
  p.dirX = odx * c - p.dirY * s;
  p.dirY = odx * s + p.dirY * c;
  const opx = p.planeX;
  p.planeX = opx * c - p.planeY * s;
  p.planeY = opx * s + p.planeY * c;
}

function updateOnePlayer(p, dt, ctrl) {
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.muzzle > 0) p.muzzle -= dt * 2.4;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.shake > 0) p.shake -= dt;
  if (!p.alive) return;

  let mx = 0;
  let my = 0;
  if (ctrl.forward) {
    mx += p.dirX;
    my += p.dirY;
  }
  if (ctrl.back) {
    mx -= p.dirX;
    my -= p.dirY;
  }
  if (ctrl.left) {
    mx -= p.planeX * (STRAFE_SPEED / MOVE_SPEED);
    my -= p.planeY * (STRAFE_SPEED / MOVE_SPEED);
  }
  if (ctrl.right) {
    mx += p.planeX * (STRAFE_SPEED / MOVE_SPEED);
    my += p.planeY * (STRAFE_SPEED / MOVE_SPEED);
  }
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const moved = tryMove(
      p.x,
      p.y,
      (mx / len) * MOVE_SPEED * dt,
      (my / len) * MOVE_SPEED * dt
    );
    p.x = moved.x;
    p.y = moved.y;
  }

  if (ctrl.turnL) rotatePlayer(p, -KEY_ROT * dt);
  if (ctrl.turnR) rotatePlayer(p, KEY_ROT * dt);
}

function updatePlayers(dt) {
  const p1 = state.players[0];
  const coop = !!state.coop;
  // 双人：A/D 转身、Q/E 平移；单人：A/D 平移、Q/E 或方向键转身（配合鼠标）
  updateOnePlayer(p1, dt, {
    forward: keys.KeyW,
    back: keys.KeyS,
    left: coop ? keys.KeyQ : keys.KeyA,
    right: coop ? keys.KeyE : keys.KeyD,
    turnL: coop ? keys.KeyA : keys.KeyQ || (!pointerLocked && keys.ArrowLeft),
    turnR: coop ? keys.KeyD : keys.KeyE || (!pointerLocked && keys.ArrowRight),
  });
  if (coop && p1.alive && (keys.Space || keys.KeyJ)) fire(p1);

  if (coop && state.players[1]) {
    const p2 = state.players[1];
    updateOnePlayer(p2, dt, {
      forward: keys.ArrowUp,
      back: keys.ArrowDown,
      left: keys.Comma,
      right: keys.Period,
      turnL: keys.ArrowLeft,
      turnR: keys.ArrowRight,
    });
    if (
      p2.alive &&
      (keys.ShiftLeft ||
        keys.ShiftRight ||
        keys.Digit1 ||
        keys.Numpad1 ||
        keys.Enter ||
        keys.NumpadEnter)
    ) {
      fire(p2);
    }
  }
}

function hurtPlayer(p, dmg) {
  if (!p.alive || p.invuln > 0) return;
  p.hp -= dmg;
  p.invuln = INVULN;
  p.shake = 0.35;
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    if (livingPlayers().length === 0) endGame();
  }
}

function updateEnemies(dt) {
  const lives = livingPlayers();
  for (const e of state.enemies) {
    if (e.hurt > 0) e.hurt -= dt;
    e.bob += dt;
    if (!lives.length) continue;

    let target = lives[0];
    let bestD = Infinity;
    for (const p of lives) {
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < bestD) {
        bestD = d;
        target = p;
      }
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
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
    } else {
      hurtPlayer(target, e.damage);
    }
  }
}

function updateWaves(dt) {
  if (state.phase !== "play") return;
  if (state.waveAnnounce > 0) state.waveAnnounce -= dt;
  if (state.enemies.length === 0) {
    if (state.waveGap <= 0) state.waveGap = WAVE_GAP;
    else {
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
  if (els.endTitle) els.endTitle.textContent = state.coop ? "全员阵亡" : "阵亡";
  if (els.resultText) {
    const extra = state.coop
      ? ` · P1击杀 ${state.players[0].kills} · P2击杀 ${state.players[1]?.kills || 0}`
      : "";
    els.resultText.textContent = `撑到第 ${state.wave} 波 · 总击杀 ${state.kills}${extra}`;
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
    updatePlayers(dt);
    updateEnemies(dt);
    updateWaves(dt);
    syncHud();
  } else if (state) syncHud();
  render();
  raf = requestAnimationFrame(tick);
}

function requestLock() {
  if (!canvas || state?.phase !== "play") return;
  canvas.requestPointerLock?.();
}

function onPointerMove(ev) {
  if (!pointerLocked || !state || state.phase !== "play") return;
  const p1 = state.players[0];
  if (p1?.alive) rotatePlayer(p1, ev.movementX * ROT_SPEED);
}

function onPointerDown(ev) {
  if (!state || state.phase !== "play") return;
  if (!pointerLocked) {
    requestLock();
    return;
  }
  if (ev.button === 0) fire(state.players[0]);
}

function updateJoinBtn() {
  if (!els.btnJoin) return;
  els.btnJoin.classList.toggle("active", coopMode);
  els.btnJoin.classList.remove("hidden");
  els.btnJoin.textContent = coopMode ? "双人已开启 · 点击取消" : "加入 2P";
}

function toggleCoop() {
  coopMode = !coopMode;
  updateJoinBtn();
  if (els.overlaySub) {
    els.overlaySub.innerHTML = coopMode
      ? "左右分屏协作清怪<br />P1：W/S 进退 · A/D 转身 · Q/E 平移 · J/空格射击 · 2/3/4切枪<br />P2：↑↓ 进退 · ←→ 转身 · ,/. 平移 · Shift/1/Enter 射击 · 7/8/9切枪"
      : "伪 3D 迷宫 · 九尾狐/眼球怪/飞虎虫 · 波次生存<br />WASD 移动 · 鼠标转向 · 左键/空格/J 射击 · 2/3/4 切枪 · Esc 解锁鼠标";
  }
}

function beginRun() {
  initState();
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  spawnWave();
  syncHud();
  if (!state.coop) requestLock();
}

function showLobby() {
  els.gameover?.classList.add("hidden");
  els.hud?.classList.add("hidden");
  els.overlay?.classList.remove("hidden");
  updateJoinBtn();
  try {
    document.exitPointerLock?.();
  } catch (_) {}
}

export async function startDoom({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  keys = Object.create(null);
  coopMode = false;
  offAll();
  resize();

  await ensureFpsMonsters();
  await ensureWeapons();

  on(window, "resize", resize);
  on(window, "keydown", (ev) => {
    keys[ev.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
    if (!state || state.phase !== "play") return;
    if (ev.code === "Space" || ev.code === "KeyJ") fire(state.players[0]);
    // P1 切枪 2/3/4 · P2 切枪 7/8/9
    if (ev.code === "Digit2") state.players[0].weapon = "pistol";
    if (ev.code === "Digit3") state.players[0].weapon = "rifle";
    if (ev.code === "Digit4") state.players[0].weapon = "heavy";
    if (state.coop && state.players[1]) {
      if (
        ev.code === "ShiftLeft" ||
        ev.code === "ShiftRight" ||
        ev.code === "Enter" ||
        ev.code === "NumpadEnter" ||
        ev.code === "Digit1" ||
        ev.code === "Numpad1"
      ) {
        fire(state.players[1]);
      }
      if (ev.code === "Digit7") state.players[1].weapon = "pistol";
      if (ev.code === "Digit8") state.players[1].weapon = "rifle";
      if (ev.code === "Digit9") state.players[1].weapon = "heavy";
    }
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
  on(els.btnJoin, "click", toggleCoop);

  showLobby();
  state = null;
  raf = requestAnimationFrame(tick);
}

export function stopDoom() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  coopMode = false;
  pointerLocked = false;
  try {
    document.exitPointerLock?.();
  } catch (_) {}
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.p2Stat?.classList.add("hidden");
  els.btnJoin?.classList.add("hidden");
}
