/**
 * 炸弹模式 — 参考泡泡堂怪物关
 * 可单人 / 随时加入 2P
 * P1：WASD 移动 · J / 空格放泡
 * P2：方向键移动 · Shift / 1 / Enter 放泡
 */

const CHAR_SRC = "assets/crazyarcade/0e6d417a-3793-40a2-b736-4393d022f2ce.png";
const MOB_SRC = "assets/crazyarcade/97612300-601f-4769-b9cb-03267eeda359.png";
const BOSS_SRC = "assets/crazyarcade/ghost_lady.png";

const COLS = 15;
const ROWS = 13;
const DIRS = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];
const BOMB_FUSE = 2.4;
const FIRE_LIFE = 0.38;
const INVULN = 1.4;
const MAX_STAGES = 3;
/** 角色碰撞半径（格），小于 0.5 才能平滑钻过走廊 */
const BODY_R = 0.34;

const CTRL = [
  {
    left: ["KeyA"],
    right: ["KeyD"],
    up: ["KeyW"],
    down: ["KeyS"],
    bomb: ["KeyJ", "Space"],
  },
  {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    bomb: ["ShiftLeft", "ShiftRight", "Digit1", "Numpad1", "Enter"],
  },
];

let canvas, ctx;
let els = {};
let state = null;
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let keys = Object.create(null);
let assets = null;
/** monster | versus */
let lobbyMode = "monster";
/** pvp | cpu | coop_cpu */
let versusKind = "pvp";
let coopWanted = false;

function on(t, type, fn, opts) {
  if (!t) return;
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
    img.src = encodeURI(src) + "?v=arcade3";
  });
}

function keyDown(codes) {
  return codes.some((c) => keys[c]);
}

function cropOpaque(src, sx, sy, sw, sh) {
  const tmp = document.createElement("canvas");
  tmp.width = Math.max(1, sw | 0);
  tmp.height = Math.max(1, sh | 0);
  const g = tmp.getContext("2d");
  g.drawImage(src, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
  const img = g.getImageData(0, 0, tmp.width, tmp.height);
  const d = img.data;
  let minX = tmp.width;
  let minY = tmp.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < tmp.height; y++) {
    for (let x = 0; x < tmp.width; x++) {
      if (d[(y * tmp.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return tmp;
  const pad = 1;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(tmp.width - 1, maxX + pad);
  maxY = Math.min(tmp.height - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(tmp, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** 无透明通道的图（棋盘格烤进像素）→ 抠成透明 RGBA */
function knockoutChecker(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  const satAt = (i) => {
    const r = d[i];
    const gg = d[i + 1];
    const b = d[i + 2];
    return Math.max(r, gg, b) - Math.min(r, gg, b);
  };
  const isLightGray = (i) => {
    const r = d[i];
    const gg = d[i + 1];
    const b = d[i + 2];
    return Math.abs(r - gg) <= 14 && Math.abs(gg - b) <= 14 && r >= 185;
  };
  // 紧贴角色彩色像素的浅色（白眼/白牙）不抠，只清纯棋盘格
  const safeBg = (x, y) => {
    const i = (y * w + x) * 4;
    if (!isLightGray(i)) return false;
    let colorNear = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (satAt((ny * w + nx) * 4) > 28) colorNear++;
      }
    }
    return colorNear < 3;
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (!safeBg(x, y)) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  g.putImageData(data, 0, 0);
  return c;
}

function ensureAlphaSheet(img) {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const pg = probe.getContext("2d");
  pg.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const px = pg.getImageData(0, 0, 1, 1).data;
  const looksOpaqueBg = px[3] > 200 && Math.abs(px[0] - px[1]) < 20 && px[0] > 170;
  return looksOpaqueBg ? knockoutChecker(img) : img;
}

/**
 * 精灵表像素级裁切框（对 1536×1024 原图逐帧扫描得到）
 * 每行 16 帧 = 下/上/左/右 × 4；右向素材仅 3 帧处已复用末帧补齐
 * 角色表：蓝 idle/walk、红 idle/walk；怪物表：怪1 idle/walk、怪2 idle/walk
 */
const CHAR_FRAME_BOXES = [
  // blue idle
  [[106,159,89,149],[191,158,90,154],[277,158,89,152],[362,158,89,156],[464,161,94,146],[554,159,94,147],[644,158,93,150],[733,160,94,149],[859,161,89,149],[944,158,89,151],[1029,160,89,150],[1114,164,89,148],[1230,159,99,150],[1325,159,98,153],[1419,160,99,148],[1419,160,99,148]],
  // blue walk
  [[104,332,90,144],[190,328,89,154],[275,329,90,150],[361,331,89,149],[469,333,95,146],[560,334,94,146],[650,333,95,140],[741,333,94,147],[854,331,92,149],[942,333,91,148],[1029,333,92,149],[1117,331,91,151],[1230,332,99,149],[1325,331,100,149],[1421,334,99,148],[1421,334,99,148]],
  // red idle（跳过上方方向标签带，从 y≈637 起）
  [[112,635,88,150],[196,635,89,150],[281,635,88,150],[365,635,88,149],[477,635,94,150],[567,635,95,148],[658,635,94,150],[748,635,94,149],[857,635,91,150],[944,635,92,150],[1032,635,91,150],[1119,635,91,150],[1231,635,100,149],[1327,635,99,149],[1422,635,100,150],[1422,635,100,150]],
  // red walk
  [[112,824,87,136],[195,823,88,137],[279,825,87,135],[362,825,87,135],[476,829,92,131],[564,830,93,130],[653,829,92,131],[741,829,92,131],[857,821,89,139],[942,825,89,135],[1027,826,89,134],[1112,823,89,137],[1232,824,94,136],[1322,829,94,131],[1412,824,94,136],[1412,824,94,136]],
];

const MOB_FRAME_BOXES = [
  // mob1 idle
  [[113,177,81,125],[201,178,78,124],[284,176,81,126],[374,176,77,126],[489,178,72,123],[573,178,71,123],[657,178,72,123],[744,178,72,123],[870,191,68,112],[964,189,62,115],[1047,190,62,112],[1126,189,61,114],[1231,194,69,109],[1322,190,73,112],[1418,191,82,111],[1418,191,82,111]],
  // mob1 walk
  [[113,340,83,124],[201,343,79,121],[291,339,80,124],[375,339,81,124],[488,340,73,122],[575,339,74,123],[661,339,73,123],[748,340,72,122],[856,343,75,120],[947,346,70,118],[1033,351,71,113],[1113,346,71,117],[1224,350,75,113],[1319,349,76,114],[1418,350,79,113],[1418,350,79,113]],
  // mob2 idle
  [[112,679,87,130],[202,678,83,131],[285,678,88,131],[377,678,88,131],[487,694,86,119],[573,692,86,121],[661,692,82,121],[749,692,84,121],[869,689,88,121],[968,685,76,124],[1052,688,68,122],[1126,691,66,120],[1218,696,76,116],[1325,696,81,117],[1421,693,77,118],[1421,693,77,118]],
  // mob2 walk
  [[113,841,88,128],[203,841,83,129],[287,841,88,129],[376,841,86,129],[482,852,89,119],[573,850,86,122],[660,852,82,120],[749,851,84,121],[864,848,86,123],[963,848,76,123],[1045,850,79,121],[1123,851,71,120],[1219,854,75,119],[1319,859,77,115],[1419,853,78,121],[1419,853,78,121]],
];

/** 按预扫描的精确框裁切（不再靠运行时启发式猜帧） */
function sliceSheetFromBoxes(img, boxes) {
  const sheet = ensureAlphaSheet(img);
  return boxes.map((row) =>
    row.map(([fx, fy, fw, fh]) => cropOpaque(sheet, fx, fy, Math.max(1, fw), Math.max(1, fh)))
  );
}

function packActor(rows) {
  // idle, walk 各 16 帧：下/上/左/右 × 4
  const idle = rows[0] || [];
  const walk = rows[1] || idle;
  const dirs = [[], [], [], []];
  const walks = [[], [], [], []];
  for (let d = 0; d < 4; d++) {
    dirs[d] = idle.slice(d * 4, d * 4 + 4);
    walks[d] = walk.slice(d * 4, d * 4 + 4);
  }
  return normalizePack({ idle: dirs, walk: walks });
}

/** 统一同角色各帧画布尺寸，脚底对齐，避免播动画时忽大忽小 */
function normalizePack(pack) {
  let maxW = 1;
  let maxH = 1;
  for (const set of [pack.idle, pack.walk]) {
    for (const dir of set) {
      for (const fr of dir) {
        if (!fr) continue;
        if (fr.width > maxW) maxW = fr.width;
        if (fr.height > maxH) maxH = fr.height;
      }
    }
  }
  const norm = (fr) => {
    if (!fr) return fr;
    if (fr.width === maxW && fr.height === maxH) return fr;
    const c = document.createElement("canvas");
    c.width = maxW;
    c.height = maxH;
    c.getContext("2d").drawImage(fr, ((maxW - fr.width) / 2) | 0, maxH - fr.height);
    return c;
  };
  return {
    idle: pack.idle.map((dir) => dir.map(norm)),
    walk: pack.walk.map((dir) => dir.map(norm)),
  };
}

async function ensureAssets() {
  if (assets) return assets;
  const [charImg, mobImg, bossImg] = await Promise.all([
    loadImage(CHAR_SRC),
    loadImage(MOB_SRC),
    loadImage(BOSS_SRC),
  ]);
  const charRows = sliceSheetFromBoxes(charImg, CHAR_FRAME_BOXES);
  const mobRows = sliceSheetFromBoxes(mobImg, MOB_FRAME_BOXES);
  assets = {
    blue: packActor(charRows.slice(0, 2)),
    red: packActor(charRows.slice(2, 4)),
    eyeball: packActor(mobRows.slice(0, 2)),
    fox: packActor(mobRows.slice(2, 4)),
    boss: cropOpaque(bossImg, 0, 0, bossImg.width, bossImg.height),
  };
  return assets;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layout() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const hud = 56;
  const cell = Math.min((viewW - 40) / COLS, (viewH - hud - 36) / ROWS);
  const bw = cell * COLS;
  const bh = cell * ROWS;
  return {
    cell,
    ox: (viewW - bw) / 2,
    oy: hud + (viewH - hud - bh) / 2,
    bw,
    bh,
  };
}

function inBounds(c, r) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS;
}

function tile(c, r) {
  if (!inBounds(c, r)) return 1;
  return state.grid[r * COLS + c];
}

function setTile(c, r, v) {
  if (inBounds(c, r)) state.grid[r * COLS + c] = v;
}

function blocked(c, r, ignoreBomb = false, ent = null) {
  const t = tile(c, r);
  if (t === 1 || t === 2 || t === 3) return true;
  if (!ignoreBomb && bombSolidAt(c, r, ent)) return true;
  return false;
}

/** 炸弹格：踩在上面时可穿出，离开后才实心 */
function overlapsBombCell(x, y, c, r) {
  return x + BODY_R > c && x - BODY_R < c + 1 && y + BODY_R > r && y - BODY_R < r + 1;
}

function bombSolidAt(c, r, ent) {
  const bomb = state.bombs.find((b) => b.gx === c && b.gy === r);
  if (!bomb) return false;
  if (ent && bomb.soft?.has(ent)) return false;
  return true;
}

function refreshBombSoft(ent) {
  for (const b of state.bombs) {
    if (!b.soft?.has(ent)) continue;
    if (!overlapsBombCell(ent.x, ent.y, b.gx, b.gy)) b.soft.delete(ent);
  }
}

function parseMap(rows, extras = {}) {
  const grid = new Array(COLS * ROWS).fill(0);
  const decor = new Array(COLS * ROWS).fill("");
  const path = new Array(COLS * ROWS).fill(0);
  const monsters = [];
  const spawns = [];
  let boss = null;
  for (let r = 0; r < ROWS; r++) {
    const line = (rows[r] || "").padEnd(COLS, ".");
    for (let c = 0; c < COLS; c++) {
      const ch = line[c] || ".";
      const i = r * COLS + c;
      if (ch === "#") grid[i] = 1;
      else if (ch === "B") grid[i] = 2;
      else if (ch === "H") grid[i] = 3;
      else grid[i] = 0;
      if (ch === "=") path[i] = 1;
      if ("wyrpumao*".includes(ch)) decor[i] = ch;
      if (ch === "1") spawns[0] = { c, r };
      if (ch === "2") spawns[1] = { c, r };
      if (ch === "e") monsters.push(makeMob("eyeball", c, r, extras.eyeHp || 1, extras.eyeSp || 1.35));
      if (ch === "f") monsters.push(makeMob("fox", c, r, extras.foxHp || 2, extras.foxSp || 1.7));
      if (ch === "G") boss = makeBoss(c, r);
    }
  }
  if (!spawns[0]) spawns[0] = { c: 1, r: 1 };
  if (!spawns[1]) spawns[1] = { c: COLS - 2, r: ROWS - 2 };
  scatterSoftBlocks(grid, decor, monsters, spawns, boss, extras.softDensity ?? 0.32);
  return { grid, decor, path, monsters, spawns, boss };
}

/** 在空地上铺可破坏木箱，避开出生点走廊与怪物格 */
function scatterSoftBlocks(grid, decor, monsters, spawns, boss, density) {
  const keepClear = new Set();
  const mark = (c, r) => {
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) keepClear.add(r * COLS + c);
  };
  for (const s of spawns) {
    mark(s.c, s.r);
    for (const d of DIRS) {
      mark(s.c + d.x, s.r + d.y);
      mark(s.c + d.x * 2, s.r + d.y * 2);
    }
  }
  for (const m of monsters) mark(m.gx, m.gy);
  if (boss) mark(boss.gx, boss.gy);

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 0) continue;
    if (keepClear.has(i)) continue;
    // 保留仓鼠点缀可走；花丛上可盖箱子
    if (decor[i] === "a") continue;
    if (Math.random() > density) continue;
    grid[i] = 2;
  }
}

function maybeDropItem(c, r, chance) {
  if (Math.random() >= chance) return;
  const roll = Math.random();
  const type = roll < 0.34 ? "fire" : roll < 0.67 ? "bomb" : "speed";
  state.items.push({ gx: c, gy: r, type, bob: Math.random() * Math.PI * 2 });
}

function stageMaps(n) {
  // 15×13：#硬障 H绿篱 B木箱 =石路；其余空地会再随机铺可破坏木箱
  if (n === 1) {
    return parseMap(
      [
        ".#.....f.....#.",
        ".H.B..wyr..B.H.",
        ".H.B..yrw..B.H.",
        ".#..B...f.B..#.",
        ".=Bp.pBp.pBp.=.",
        "e=m=.1.aa.2=m=e",
        ".=B.Bp.f.pB.B=.",
        ".#.Bp.p.p.pB.#.",
        ".H.B.......B.H.",
        ".=B..yry...B.=.",
        ".#.B.ryr.ffB.#.",
        ".=.B.......B.=.",
        ".#...........#.",
      ],
      { softDensity: 0.22 }
    );
  }
  if (n === 2) {
    return parseMap(
      [
        ".e.B...##..B.e.",
        "BB=#.##=#=#=#.B",
        ".B.#.#wyr#.#.e.",
        ".B.#=#.B.#=#=#.",
        "...#.1.B.#.#..2",
        ".B.#=#.B.#=#=#.",
        ".e.#.#.f.#.B#B.",
        "..B.=#wyr#f#=BB",
        "e.B#B.###.#.#e.",
        "...#=.B...B.B..",
        ".B.#..B..B.....",
        "...#=.B......e.",
        ".B.#.....B.B...",
      ],
      { eyeHp: 1, foxHp: 2, eyeSp: 1.5, foxSp: 1.9, softDensity: 0.18 }
    );
  }
  return parseMap(
    [
      "B...BB...BB...B",
      ".yry.B.G.B.yry.",
      ".yuy.B...B.yuy.",
      ".ryr.......ryr.",
      "B...BB...BB...B",
      ".yry.ByryB.yry.",
      ".yuy.1yuy.2yuy.",
      ".ryr.BryrB.ryr.",
      "B...B.B..BB...B",
      ".yry..yry..yry.",
      ".yuy.B.yuy.yuy.",
      ".ryr..ryr..ryr.",
      ".B.B.....B.B.B.",
    ],
    { eyeHp: 1, foxHp: 2, eyeSp: 1.55, foxSp: 2.0, softDensity: 0.2 }
  );
}

/** 对战对称图：无怪物，角落出生 */
function versusMap() {
  return parseMap(
    [
      "...............",
      ".BB.B.BBB.B.BB.",
      ".B...........B.",
      "..B.BB...BB.B..",
      ".B...........B.",
      ".B.B.B.B.B.B.B.",
      ".......B.......",
      ".B.B.B.B.B.B.B.",
      ".B...........B.",
      "..B.BB...BB.B..",
      ".B...........B.",
      ".BB.B.BBB.B.BB.",
      "...............",
    ],
    { softDensity: 0.12 }
  );
}

function makeMob(type, c, r, hp, speed) {
  return {
    type,
    gx: c,
    gy: r,
    x: c + 0.5,
    y: r + 0.5,
    dir: (Math.random() * 4) | 0,
    moving: false,
    tx: c,
    ty: r,
    hp,
    maxHp: hp,
    speed,
    anim: 0,
    hurt: 0,
  };
}

function makeBoss(c, r) {
  return {
    type: "boss",
    gx: c,
    gy: r,
    x: c + 0.5,
    y: r + 0.5,
    dir: 2,
    moving: false,
    tx: c,
    ty: r,
    hp: 8,
    maxHp: 8,
    speed: 1.15,
    anim: 0,
    hurt: 0,
    spawnT: 6,
  };
}

function makePlayer(slot, spawn, opts = {}) {
  return {
    slot,
    gx: spawn.c,
    gy: spawn.r,
    x: spawn.c + 0.5,
    y: spawn.r + 0.5,
    dir: opts.dir ?? 0,
    moving: false,
    tx: spawn.c,
    ty: spawn.r,
    speed: opts.speed ?? 2.55,
    bombs: opts.bombs ?? 1,
    fire: opts.fire ?? 1,
    lives: opts.lives ?? (opts.ai ? 3 : 3),
    invuln: opts.invuln ?? 0,
    dead: false,
    anim: 0,
    walking: false,
    ai: !!opts.ai,
    team: opts.team || "human",
    bombCd: 0.6 + Math.random(),
    thinkT: 0,
  };
}

function cornerSpawns() {
  return [
    { c: 1, r: 1 },
    { c: COLS - 2, r: ROWS - 2 },
    { c: COLS - 2, r: 1 },
    { c: 1, r: ROWS - 2 },
  ];
}

function initState(stage = 1) {
  const isVersus = lobbyMode === "versus";
  const map = isVersus ? versusMap() : stageMaps(stage);
  const players = [];
  const corners = cornerSpawns();

  if (!isVersus) {
    players.push(makePlayer(0, map.spawns[0]));
    if (coopWanted) players.push(makePlayer(1, map.spawns[1]));
  } else if (versusKind === "pvp") {
    players.push(makePlayer(0, corners[0], { dir: 0, team: "human" }));
    players.push(makePlayer(1, corners[1], { dir: 1, team: "human" }));
  } else if (versusKind === "cpu") {
    players.push(makePlayer(0, corners[0], { dir: 0, team: "human" }));
    players.push(
      makePlayer(2, corners[1], { dir: 1, team: "cpu", ai: true, speed: 2.35, bombs: 1, fire: 1 })
    );
  } else {
    // coop_cpu：1～2 人类 vs 2 人机
    players.push(makePlayer(0, corners[0], { dir: 0, team: "human" }));
    if (coopWanted) players.push(makePlayer(1, corners[1], { dir: 1, team: "human" }));
    const aiSpawns = coopWanted ? [corners[2], corners[3]] : [corners[1], corners[2]];
    aiSpawns.forEach((sp, i) => {
      players.push(
        makePlayer(10 + i, sp, {
          dir: i % 2,
          team: "cpu",
          ai: true,
          speed: 2.3 + i * 0.1,
          bombs: 1,
          fire: 1,
        })
      );
    });
  }

  // 清掉出生格木箱
  for (const p of players) {
    setTileOn(map.grid, p.gx, p.gy, 0);
    for (const d of DIRS) setTileOn(map.grid, p.gx + d.x, p.gy + d.y, 0);
  }

  state = {
    stage: isVersus ? 0 : stage,
    playMode: isVersus ? "versus" : "monster",
    versusKind: isVersus ? versusKind : null,
    grid: map.grid,
    decor: map.decor,
    path: map.path,
    players,
    monsters: isVersus ? [] : map.monsters,
    boss: isVersus ? null : map.boss,
    bombs: [],
    flames: [],
    items: [],
    particles: [],
    time: 0,
    phase: "play",
    shake: 0,
    score: 0,
  };
}

function setTileOn(grid, c, r, v) {
  if (c >= 0 && r >= 0 && c < COLS && r < ROWS) grid[r * COLS + c] = v;
}

function livingPlayers() {
  return state.players.filter((p) => !p.dead);
}

function livingHumans() {
  return livingPlayers().filter((p) => p.team === "human");
}

function livingCpus() {
  return livingPlayers().filter((p) => p.team === "cpu");
}

function humanPlayers() {
  return state.players.filter((p) => p.team === "human");
}

function livingMobs() {
  const list = state.monsters.filter((m) => m.hp > 0);
  if (state.boss && state.boss.hp > 0) list.push(state.boss);
  return list;
}

function bombsOf(p) {
  return state.bombs.filter((b) => b.owner === p.slot).length;
}

function syncHud() {
  if (!els.stageText || !state) return;
  if (state.playMode === "versus") {
    const label =
      state.versusKind === "pvp" ? "双人单挑" : state.versusKind === "cpu" ? "人机对战" : "合作打人机";
    els.stageText.textContent = label;
    if (state.versusKind === "pvp") {
      els.mobText.textContent = `存活 ${livingPlayers().length}`;
    } else {
      els.mobText.textContent = `人机 ${livingCpus().length}`;
    }
  } else {
    els.stageText.textContent = `关卡 ${state.stage}/${MAX_STAGES}`;
    els.mobText.textContent = `怪物 ${livingMobs().length}`;
  }
  const humans = humanPlayers();
  const p1 = humans[0] || state.players[0];
  if (p1) {
    els.p1Text.textContent = p1.dead
      ? "P1 阵亡"
      : `P1 ❤${p1.lives} 泡${p1.bombs} 火${p1.fire} 速${p1.speed.toFixed(1)}`;
  }
  const p2 = humans[1];
  if (els.p2Stat) els.p2Stat.classList.toggle("hidden", !p2);
  if (p2 && els.p2Text) {
    els.p2Text.textContent = p2.dead
      ? "P2 阵亡"
      : `P2 ❤${p2.lives} 泡${p2.bombs} 火${p2.fire} 速${p2.speed.toFixed(1)}`;
  }
}

function lobbyCopy() {
  if (lobbyMode === "monster") {
    return coopWanted
      ? "怪物模式 · 双人已开启<br />P1：WASD + J/空格放泡<br />P2：方向键 + Shift放泡"
      : "怪物模式 · 三关清怪<br />P1：WASD + J/空格放泡 · 可先加入 2P";
  }
  if (versusKind === "pvp") {
    return "对战 · 双人单挑<br />P1：WASD+J　P2：方向键+Shift<br />最后存活者获胜";
  }
  if (versusKind === "cpu") {
    return "对战 · 单挑人机<br />P1：WASD + J/空格放泡<br />打倒红色人机获胜";
  }
  return coopWanted
    ? "对战 · 合作打人机（双人）<br />P1：WASD+J　P2：方向键+Shift<br />一起打倒人机"
    : "对战 · 合作打人机（可加 2P）<br />P1：WASD + J/空格放泡<br />一人或两人一起对抗人机";
}

function syncLobbyUi() {
  els.btnModeMonster?.classList.toggle("active", lobbyMode === "monster");
  els.btnModeVersus?.classList.toggle("active", lobbyMode === "versus");
  if (els.versusPick) {
    const show = lobbyMode === "versus";
    els.versusPick.classList.toggle("hidden", !show);
    els.versusPick.style.display = show ? "flex" : "none";
  }
  els.btnVersusPvp?.classList.toggle("active", versusKind === "pvp");
  els.btnVersusCpu?.classList.toggle("active", versusKind === "cpu");
  els.btnVersusCoop?.classList.toggle("active", versusKind === "coop_cpu");

  const joinUseful =
    lobbyMode === "monster" || (lobbyMode === "versus" && versusKind === "coop_cpu");
  if (els.btnJoin) {
    els.btnJoin.classList.toggle("hidden", !joinUseful);
    if (lobbyMode === "versus" && versusKind === "pvp") {
      coopWanted = true;
    }
    if (lobbyMode === "versus" && versusKind === "cpu") {
      coopWanted = false;
    }
    els.btnJoin.classList.toggle("active", coopWanted);
    els.btnJoin.textContent = coopWanted ? "双人已开启 · 点击取消" : "加入 2P";
  }
  if (els.btnStart) {
    els.btnStart.textContent =
      lobbyMode === "monster" ? "开始冒险" : versusKind === "pvp" ? "开始单挑" : "开始对战";
  }
  if (els.overlaySub) els.overlaySub.innerHTML = lobbyCopy();
}

function updateJoinBtn() {
  syncLobbyUi();
}

function toggleCoop() {
  if (lobbyMode === "versus" && versusKind === "pvp") return;
  if (lobbyMode === "versus" && versusKind === "cpu") return;
  coopWanted = !coopWanted;
  syncLobbyUi();
}

function setLobbyMode(mode) {
  lobbyMode = mode;
  if (mode === "versus" && versusKind === "pvp") coopWanted = true;
  if (mode === "versus" && versusKind === "cpu") coopWanted = false;
  syncLobbyUi();
}

function setVersusKind(kind) {
  versusKind = kind;
  if (kind === "pvp") coopWanted = true;
  if (kind === "cpu") coopWanted = false;
  syncLobbyUi();
}

function addBurst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 90;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.28 + Math.random() * 0.2,
      max: 0.5,
      color,
      r: 1.6 + Math.random() * 2,
    });
  }
}

function tryPlaceBomb(p) {
  if (p.dead || bombsOf(p) >= p.bombs) return;
  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  if (blocked(gx, gy, true) || tile(gx, gy) !== 0) return;
  if (state.bombs.some((b) => b.gx === gx && b.gy === gy)) return;
  const soft = new Set();
  const riders = [...state.players, ...state.monsters];
  if (state.boss) riders.push(state.boss);
  for (const e of riders) {
    if (!e || e.dead || (e.hp != null && e.hp <= 0)) continue;
    if (overlapsBombCell(e.x, e.y, gx, gy)) soft.add(e);
  }
  state.bombs.push({ gx, gy, t: BOMB_FUSE, range: p.fire, owner: p.slot, soft });
}

function explodeBomb(bomb) {
  const cells = [{ gx: bomb.gx, gy: bomb.gy }];
  for (const d of DIRS) {
    for (let i = 1; i <= bomb.range; i++) {
      const c = bomb.gx + d.x * i;
      const r = bomb.gy + d.y * i;
      if (!inBounds(c, r)) break;
      const t = tile(c, r);
      if (t === 1) break;
      cells.push({ gx: c, gy: r });
      if (t === 2 || t === 3) {
        setTile(c, r, 0);
        // 木箱掉率更高，绿篱稍低
        maybeDropItem(c, r, t === 2 ? 0.58 : 0.38);
        addBurst(c + 0.5, r + 0.5, t === 3 ? "#5a9a4a" : "#c4a574", 7);
        break;
      }
    }
  }
  state.flames.push({ cells, t: FIRE_LIFE });
  state.shake = Math.max(state.shake, 0.16);
  // 连锁
  for (let i = state.bombs.length - 1; i >= 0; i--) {
    const b = state.bombs[i];
    if (b === bomb) continue;
    if (cells.some((c) => c.gx === b.gx && c.gy === b.gy)) {
      state.bombs.splice(i, 1);
      explodeBomb(b);
    }
  }
}

function flameAt(c, r) {
  return state.flames.some((f) => f.cells.some((x) => x.gx === c && x.gy === r));
}

function hitMob(m) {
  if (m.hurt > 0) return;
  m.hp -= 1;
  m.hurt = 0.35;
  addBurst(m.x, m.y, m.type === "boss" ? "#1a2238" : "#7dcfb0", 10);
  if (m.hp <= 0) {
    state.score += m.type === "boss" ? 800 : m.type === "fox" ? 200 : 100;
    addBurst(m.x, m.y, "#c23b3b", 14);
  }
}

function hurtPlayer(p) {
  if (p.dead || p.invuln > 0) return;
  p.lives -= 1;
  p.invuln = INVULN;
  state.shake = Math.max(state.shake, 0.22);
  if (p.lives <= 0) p.dead = true;
}

function pickup(p) {
  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    if (it.gx !== gx || it.gy !== gy) continue;
    if (it.type === "fire") p.fire = Math.min(6, p.fire + 1);
    if (it.type === "bomb") p.bombs = Math.min(6, p.bombs + 1);
    if (it.type === "speed") p.speed = Math.min(4.2, p.speed + 0.35);
    state.items.splice(i, 1);
  }
}

function syncGrid(ent) {
  ent.gx = Math.floor(ent.x);
  ent.gy = Math.floor(ent.y);
}

/** 圆心 (x,y) 是否与障碍重叠 */
function bodyBlocked(x, y, ignoreBomb = false, ent = null) {
  const pts = [
    [x - BODY_R, y - BODY_R],
    [x + BODY_R, y - BODY_R],
    [x - BODY_R, y + BODY_R],
    [x + BODY_R, y + BODY_R],
  ];
  for (const [px, py] of pts) {
    if (blocked(Math.floor(px), Math.floor(py), ignoreBomb, ent)) return true;
  }
  return false;
}

/**
 * 连续移动：按速度滑动，遇障停住，并轻微吸向格心方便拐弯
 * dir: 0下 1上 2左 3右
 */
function slideMove(ent, dir, dist, ignoreBomb = false) {
  if (dist <= 0) return false;
  const d = DIRS[dir];
  let moved = false;

  // 垂直轴对齐：水平走时吸到行中心，竖直走时吸到列中心
  if (d.x !== 0) {
    const cy = Math.floor(ent.y) + 0.5;
    const pull = Math.min(Math.abs(cy - ent.y), dist * 1.25);
    if (pull > 0.001) {
      const ny = ent.y + Math.sign(cy - ent.y) * pull;
      if (!bodyBlocked(ent.x, ny, ignoreBomb, ent)) ent.y = ny;
    }
  } else {
    const cx = Math.floor(ent.x) + 0.5;
    const pull = Math.min(Math.abs(cx - ent.x), dist * 1.25);
    if (pull > 0.001) {
      const nx = ent.x + Math.sign(cx - ent.x) * pull;
      if (!bodyBlocked(nx, ent.y, ignoreBomb, ent)) ent.x = nx;
    }
  }

  const step = 0.04;
  let left = dist;
  while (left > 1e-6) {
    const s = Math.min(step, left);
    const nx = ent.x + d.x * s;
    const ny = ent.y + d.y * s;
    if (bodyBlocked(nx, ny, ignoreBomb, ent)) break;
    ent.x = nx;
    ent.y = ny;
    left -= s;
    moved = true;
  }
  // 夹在地图内
  ent.x = Math.max(BODY_R, Math.min(COLS - BODY_R, ent.x));
  ent.y = Math.max(BODY_R, Math.min(ROWS - BODY_R, ent.y));
  syncGrid(ent);
  refreshBombSoft(ent);
  return moved;
}

function updatePlayer(p, dt) {
  if (p.dead) return;
  if (p.ai) {
    updateAiPlayer(p, dt);
    return;
  }
  if (p.invuln > 0) p.invuln -= dt;
  const c = CTRL[p.slot];
  if (!c) return;
  const left = keyDown(c.left);
  const right = keyDown(c.right);
  const up = keyDown(c.up);
  const down = keyDown(c.down);
  const hx = (left ? -1 : 0) + (right ? 1 : 0);
  const hy = (up ? -1 : 0) + (down ? 1 : 0);
  let want = -1;
  if (hx || hy) {
    if (hx && hy) {
      want = p.dir === 2 || p.dir === 3 ? (hx < 0 ? 2 : 3) : hy < 0 ? 1 : 0;
    } else if (hx) {
      want = hx < 0 ? 2 : 3;
    } else {
      want = hy < 0 ? 1 : 0;
    }
  }

  if (want >= 0) {
    p.dir = want;
    p.walking = true;
    p.moving = slideMove(p, want, p.speed * dt, false);
  } else {
    p.walking = false;
    p.moving = false;
  }
  p.anim += dt * (p.walking ? 10 : 5);
  pickup(p);
  if (keyDown(c.bomb) && !p._bombHeld) {
    tryPlaceBomb(p);
    p._bombHeld = true;
  }
  if (!keyDown(c.bomb)) p._bombHeld = false;

  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  if (flameAt(gx, gy)) hurtPlayer(p);
}

function nearestFoe(p) {
  let best = null;
  let bestD = 1e9;
  for (const o of livingPlayers()) {
    if (o === p || o.team === p.team) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function softAhead(p, dir) {
  const d = DIRS[dir];
  for (let i = 1; i <= p.fire + 1; i++) {
    const c = Math.round(p.x - 0.5) + d.x * i;
    const r = Math.round(p.y - 0.5) + d.y * i;
    if (!inBounds(c, r)) return false;
    const t = tile(c, r);
    if (t === 1) return false;
    if (t === 2 || t === 3) return true;
    if (t !== 0) return false;
  }
  return false;
}

function foeInLine(p, dir) {
  const foe = nearestFoe(p);
  if (!foe) return false;
  const d = DIRS[dir];
  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  const fx = Math.round(foe.x - 0.5);
  const fy = Math.round(foe.y - 0.5);
  if (d.x !== 0 && gy === fy) {
    const dist = (fx - gx) * d.x;
    return dist > 0 && dist <= p.fire + 1;
  }
  if (d.y !== 0 && gx === fx) {
    const dist = (fy - gy) * d.y;
    return dist > 0 && dist <= p.fire + 1;
  }
  return false;
}

function dangerNear(p) {
  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  if (flameAt(gx, gy)) return true;
  for (const b of state.bombs) {
    if (Math.abs(b.gx - gx) + Math.abs(b.gy - gy) <= b.range && (b.gx === gx || b.gy === gy)) {
      if (b.t < 1.1) return true;
    }
  }
  return false;
}

function updateAiPlayer(p, dt) {
  if (p.invuln > 0) p.invuln -= dt;
  p.bombCd -= dt;
  p.thinkT -= dt;

  const flee = dangerNear(p);
  if (p.thinkT <= 0 || flee) {
    p.thinkT = flee ? 0.12 : 0.28 + Math.random() * 0.35;
    const foe = nearestFoe(p);
    const order = [0, 1, 2, 3];
    if (flee) {
      // 远离最近炸弹
      let bx = p.x;
      let by = p.y;
      let best = 1e9;
      for (const b of state.bombs) {
        const d = Math.hypot(b.gx + 0.5 - p.x, b.gy + 0.5 - p.y);
        if (d < best) {
          best = d;
          bx = b.gx + 0.5;
          by = b.gy + 0.5;
        }
      }
      order.sort((a, b) => {
        const da = Math.hypot(p.x + DIRS[a].x - bx, p.y + DIRS[a].y - by);
        const db = Math.hypot(p.x + DIRS[b].x - bx, p.y + DIRS[b].y - by);
        return db - da;
      });
    } else if (foe) {
      order.sort((a, b) => {
        const da = Math.hypot(p.x + DIRS[a].x - foe.x, p.y + DIRS[a].y - foe.y);
        const db = Math.hypot(p.x + DIRS[b].x - foe.x, p.y + DIRS[b].y - foe.y);
        return da - db;
      });
    } else {
      order.sort(() => Math.random() - 0.5);
    }
    order.unshift(p.dir);
    for (const d of order) {
      const nx = p.x + DIRS[d].x * 0.25;
      const ny = p.y + DIRS[d].y * 0.25;
      if (!bodyBlocked(nx, ny, false, p)) {
        p.dir = d;
        break;
      }
    }
  }

  p.walking = true;
  p.moving = slideMove(p, p.dir, p.speed * dt, false);
  if (!p.moving) p.thinkT = 0;
  p.anim += dt * 10;
  pickup(p);

  if (p.bombCd <= 0 && bombsOf(p) < p.bombs) {
    if (softAhead(p, p.dir) || foeInLine(p, p.dir) || Math.random() < 0.015) {
      tryPlaceBomb(p);
      p.bombCd = 1.4 + Math.random() * 0.8;
      p.dir = (p.dir + 2) % 4; // 掉头跑
      p.thinkT = 0.05;
    }
  }

  const gx = Math.round(p.x - 0.5);
  const gy = Math.round(p.y - 0.5);
  if (flameAt(gx, gy)) hurtPlayer(p);
}

function updateMob(m, dt) {
  if (m.hp <= 0) return;
  if (m.hurt > 0) m.hurt -= dt;
  const moved = slideMove(m, m.dir, m.speed * dt, false);
  m.moving = moved;
  m.anim += dt * (moved ? 10 : 5);
  if (!moved) {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    order.unshift(m.dir);
    let found = false;
    for (const d of order) {
      const nx = m.x + DIRS[d].x * 0.2;
      const ny = m.y + DIRS[d].y * 0.2;
      if (!bodyBlocked(nx, ny, false)) {
        m.dir = d;
        found = true;
        break;
      }
    }
    if (!found) m.dir = (m.dir + 1 + ((Math.random() * 2) | 0)) % 4;
  } else if (Math.random() < dt * 0.35) {
    const turns = [m.dir, (m.dir + 1) % 4, (m.dir + 3) % 4];
    const pick = turns[(Math.random() * turns.length) | 0];
    const nx = m.x + DIRS[pick].x * 0.25;
    const ny = m.y + DIRS[pick].y * 0.25;
    if (!bodyBlocked(nx, ny, false)) m.dir = pick;
  }

  const gx = Math.round(m.x - 0.5);
  const gy = Math.round(m.y - 0.5);
  if (flameAt(gx, gy)) hitMob(m);

  for (const p of livingHumans()) {
    if (p.invuln > 0) continue;
    if (Math.hypot(p.x - m.x, p.y - m.y) < 0.62) hurtPlayer(p);
  }
}

function updateBoss(dt) {
  const b = state.boss;
  if (!b || b.hp <= 0) return;
  updateMob(b, dt);
  b.spawnT -= dt;
  if (b.spawnT <= 0 && state.monsters.filter((m) => m.hp > 0).length < 6) {
    const spots = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!blocked(c, r, true) && tile(c, r) === 0) spots.push({ c, r });
      }
    }
    if (spots.length) {
      const s = spots[(Math.random() * spots.length) | 0];
      state.monsters.push(makeMob(Math.random() < 0.5 ? "eyeball" : "fox", s.c, s.r, 1, 1.6));
    }
    b.spawnT = 7.5;
  }
}

function checkEnd() {
  if (state.phase !== "play") return;
  if (state.playMode === "versus") {
    if (state.versusKind === "pvp") {
      const alive = livingPlayers();
      if (alive.length <= 1) {
        endVersus(alive[0] || null);
      }
      return;
    }
    if (!livingHumans().length) {
      endGame(false);
      return;
    }
    if (!livingCpus().length) endGame(true);
    return;
  }
  if (!livingHumans().length) {
    endGame(false);
    return;
  }
  if (!livingMobs().length) endGame(true);
}

function endVersus(winner) {
  state.phase = winner ? "won" : "lost";
  state.shake = 0;
  els.gameover?.classList.remove("hidden");
  if (els.endTitle) {
    els.endTitle.textContent = winner
      ? winner.slot === 0
        ? "P1 获胜！"
        : winner.slot === 1
          ? "P2 获胜！"
          : "对战结束"
      : "同归于尽";
  }
  if (els.resultText) {
    els.resultText.textContent = winner ? "双人单挑结束" : "无人存活";
  }
}

function endGame(won) {
  if (state.playMode === "monster" && won && state.stage < MAX_STAGES) {
    beginGame(state.stage + 1);
    return;
  }
  state.phase = won ? "won" : "lost";
  state.shake = 0;
  els.gameover?.classList.remove("hidden");
  if (state.playMode === "versus") {
    if (els.endTitle) els.endTitle.textContent = won ? "击败人机！" : "不敌人机";
    if (els.resultText) {
      els.resultText.textContent = won
        ? state.versusKind === "coop_cpu"
          ? "合作胜利"
          : "人机对战胜利"
        : "再试一次吧";
    }
    return;
  }
  if (els.endTitle) els.endTitle.textContent = won ? "后花园肃清！" : "被怪物抓住了";
  if (els.resultText) {
    els.resultText.textContent = won
      ? `三关通关 · 得分 ${state.score}`
      : `第 ${state.stage} 关 · 得分 ${state.score}`;
  }
}

function update(dt) {
  if (!state || state.phase !== "play") return;
  state.time += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  for (const p of state.players) updatePlayer(p, dt);
  for (const m of state.monsters) updateMob(m, dt);
  updateBoss(dt);

  for (let i = state.bombs.length - 1; i >= 0; i--) {
    const b = state.bombs[i];
    b.t -= dt;
    if (b.t <= 0) {
      state.bombs.splice(i, 1);
      explodeBomb(b);
    }
  }
  for (let i = state.flames.length - 1; i >= 0; i--) {
    state.flames[i].t -= dt;
    if (state.flames[i].t <= 0) state.flames.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  checkEnd();
  syncHud();
}

function drawGrass(L) {
  ctx.fillStyle = "#7fbf63";
  ctx.fillRect(L.ox, L.oy, L.bw, L.bh);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((c + r) % 2 === 0) ctx.fillRect(L.ox + c * L.cell, L.oy + r * L.cell, L.cell, L.cell);
    }
  }
  ctx.fillStyle = "#f0c33a";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = (c * 13 + r * 7) % 5;
      if (n) continue;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(L.ox + (c + 0.7) * L.cell, L.oy + (r + 0.35) * L.cell, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function petalColor(ch) {
  if (ch === "w") return "#f4f0e8";
  if (ch === "r") return "#e24b4b";
  return "#f0c33a";
}

function drawFlower(x, y, cell, ch) {
  const col = petalColor(ch);
  const pr = cell * 0.13;
  ctx.fillStyle = col;
  for (const [dx, dy] of [
    [0, -0.16],
    [0.14, -0.04],
    [0.09, 0.12],
    [-0.09, 0.12],
    [-0.14, -0.04],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * cell, y + dy * cell, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f6d24a";
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.075, 0, Math.PI * 2);
  ctx.fill();
}

function drawPathTile(px, py, cell) {
  ctx.fillStyle = "#c8c8c4";
  ctx.fillRect(px, py, cell, cell);
  ctx.strokeStyle = "rgba(90,90,90,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
}

function drawHedge(x, y, cell) {
  const s = cell * 0.86;
  ctx.fillStyle = "#3f8f3a";
  ctx.strokeStyle = "#1a3a18";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
  ctx.strokeRect(x - s / 2, y - s / 2, s, s);
  ctx.fillStyle = "#58b04a";
  ctx.fillRect(x - s / 2 + 3, y - s / 2 + 3, s - 6, s * 0.38);
}

function drawPalm(x, y, cell) {
  ctx.fillStyle = "#8a6230";
  ctx.fillRect(x - cell * 0.06, y + cell * 0.02, cell * 0.12, cell * 0.28);
  ctx.fillStyle = "#3d8f36";
  for (const a of [-0.95, -0.25, 0.4, 1.15]) {
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * cell * 0.2,
      y - cell * 0.14 + Math.sin(a) * cell * 0.1,
      cell * 0.22,
      cell * 0.09,
      a,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawMushroom(x, y, cell, blue) {
  ctx.fillStyle = "#efe6d2";
  ctx.fillRect(x - cell * 0.05, y, cell * 0.1, cell * 0.16);
  ctx.fillStyle = blue ? "#3a8fd4" : "#d63b3b";
  ctx.beginPath();
  ctx.ellipse(x, y - cell * 0.02, cell * 0.2, cell * 0.14, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = blue ? "#f0c33a" : "#fff";
  ctx.beginPath();
  ctx.arc(x - cell * 0.07, y - cell * 0.06, cell * 0.035, 0, Math.PI * 2);
  ctx.arc(x + cell * 0.08, y - cell * 0.02, cell * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

function drawHamster(x, y, cell) {
  ctx.fillStyle = "#efe6d4";
  ctx.strokeStyle = "#c9b89a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y + cell * 0.06, cell * 0.28, cell * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - cell * 0.16, y - cell * 0.02, cell * 0.07, cell * 0.08, -0.3, 0, Math.PI * 2);
  ctx.ellipse(x + cell * 0.16, y - cell * 0.02, cell * 0.07, cell * 0.08, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHard(x, y, cell) {
  ctx.fillStyle = "#e8d3a4";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.6;
  const r = cell * 0.42;
  ctx.beginPath();
  ctx.ellipse(x, y + cell * 0.04, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d7b57a";
  ctx.beginPath();
  ctx.ellipse(x, y - cell * 0.02, r * 0.78, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBox(x, y, cell) {
  const s = cell * 0.78;
  // 木箱：可破坏
  ctx.fillStyle = "#c9924a";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.6;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
  ctx.strokeRect(x - s / 2, y - s / 2, s, s);
  ctx.fillStyle = "#e0b56a";
  ctx.fillRect(x - s / 2 + 2, y - s / 2 + 2, s - 4, s * 0.28);
  ctx.strokeStyle = "rgba(26,26,26,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - s / 2 + 3, y);
  ctx.lineTo(x + s / 2 - 3, y);
  ctx.moveTo(x, y - s / 2 + 3);
  ctx.lineTo(x, y + s / 2 - 3);
  ctx.stroke();
  // 角钉提示可炸
  ctx.fillStyle = "#8a5a28";
  for (const [dx, dy] of [
    [-0.28, -0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * cell, y + dy * cell, cell * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawItem(it, L) {
  const bob = Math.sin(state.time * 4 + (it.bob || 0)) * L.cell * 0.06;
  const x = L.ox + (it.gx + 0.5) * L.cell;
  const y = L.oy + (it.gy + 0.5) * L.cell + bob;
  const r = L.cell * 0.32;
  const col =
    it.type === "fire" ? "#e85a28" : it.type === "bomb" ? "#3aa0e8" : "#2faf72";
  const glow =
    it.type === "fire" ? "rgba(232,90,40,0.35)" : it.type === "bomb" ? "rgba(58,160,232,0.35)" : "rgba(47,175,114,0.35)";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - r, y - r, r * 2, r * 2, 6);
  else ctx.rect(x - r, y - r, r * 2, r * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col;
  if (it.type === "fire") {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.55, y, x, y + r * 0.5);
    ctx.quadraticCurveTo(x - r * 0.55, y, x, y - r * 0.55);
    ctx.fill();
  } else if (it.type === "bomb") {
    ctx.beginPath();
    ctx.arc(x, y + r * 0.05, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.15, y - r * 0.25);
    ctx.quadraticCurveTo(x + r * 0.45, y - r * 0.55, x + r * 0.2, y - r * 0.55);
    ctx.stroke();
  } else {
    // 速度：箭头
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y + r * 0.25);
    ctx.lineTo(x - r * 0.05, y - r * 0.4);
    ctx.lineTo(x + r * 0.45, y - r * 0.05);
    ctx.lineTo(x + r * 0.15, y - r * 0.05);
    ctx.lineTo(x + r * 0.35, y + r * 0.4);
    ctx.lineTo(x - r * 0.15, y + r * 0.05);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBomb(b, L) {
  const x = L.ox + (b.gx + 0.5) * L.cell;
  const y = L.oy + (b.gy + 0.5) * L.cell;
  const pulse = 1 + Math.sin(state.time * 10 + b.t) * 0.08;
  const r = L.cell * 0.28 * pulse;
  ctx.fillStyle = "#3aa0e8";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y + 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlame(cell, L) {
  const x = L.ox + (cell.gx + 0.5) * L.cell;
  const y = L.oy + (cell.gy + 0.5) * L.cell;
  ctx.fillStyle = "rgba(90,190,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, L.cell * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(x, y, L.cell * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function frameOf(pack, dir, walking, anim) {
  const set = walking ? pack.walk : pack.idle;
  const frames = set[dir] || set[0] || [];
  if (!frames.length) return null;
  return frames[Math.floor(anim) % frames.length];
}

function drawSprite(img, x, y, cell, scale = 1.15, flipX = false) {
  if (!img) return;
  const h = cell * scale;
  const w = (img.width / img.height) * h;
  if (flipX) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h * 0.78, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, x - w / 2, y - h * 0.78, w, h);
  }
}

function drawActor(ent, pack, L, walking) {
  const x = L.ox + ent.x * L.cell;
  const y = L.oy + ent.y * L.cell;
  // 左右：侧面帧实际朝右，向左时翻转
  let spriteDir = ent.dir;
  let flipX = false;
  if (ent.dir === 2) {
    spriteDir = 2;
    flipX = true;
  } else if (ent.dir === 3) {
    spriteDir = 2;
    flipX = false;
  }
  const fr = frameOf(pack, spriteDir, walking, ent.anim);
  ctx.save();
  if (ent.hurt > 0) ctx.globalAlpha = 0.55 + Math.sin(ent.hurt * 40) * 0.25;
  if (ent.invuln > 0) ctx.globalAlpha = 0.5 + Math.sin(ent.invuln * 24) * 0.3;
  drawSprite(fr, x, y, L.cell, 1.22, flipX);
  ctx.restore();
}

function drawBoss(L) {
  const b = state.boss;
  if (!b || b.hp <= 0 || !assets?.boss) return;
  const x = L.ox + b.x * L.cell;
  const y = L.oy + b.y * L.cell;
  const h = L.cell * 2.15;
  const w = (assets.boss.width / assets.boss.height) * h;
  ctx.save();
  if (b.hurt > 0) ctx.globalAlpha = 0.55 + Math.sin(b.hurt * 40) * 0.25;
  ctx.drawImage(assets.boss, x - w / 2, y - h * 0.82, w, h);
  ctx.restore();
  const bw = L.cell * 1.4;
  ctx.fillStyle = "rgba(26,26,26,0.35)";
  ctx.fillRect(x - bw / 2, y - h * 0.88, bw, 5);
  ctx.fillStyle = "#c23b3b";
  ctx.fillRect(x - bw / 2, y - h * 0.88, bw * (b.hp / b.maxHp), 5);
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const sky = ctx.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewW, viewH);
  if (!state) return;

  const L = layout();
  ctx.save();
  if (state.shake > 0 && state.phase === "play") {
    ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  }

  ctx.fillStyle = "#ebe4d6";
  ctx.fillRect(L.ox - 10, L.oy - 10, L.bw + 20, L.bh + 20);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.strokeRect(L.ox - 10.5, L.oy - 10.5, L.bw + 20, L.bh + 20);
  drawGrass(L);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const px = L.ox + c * L.cell;
      const py = L.oy + r * L.cell;
      if (state.path?.[i]) drawPathTile(px, py, L.cell);
      const d = state.decor?.[i];
      if (!d || tile(c, r) !== 0) continue;
      const x = px + L.cell * 0.5;
      const y = py + L.cell * 0.5;
      if (d === "w" || d === "y" || d === "r" || d === "*") drawFlower(x, y, L.cell, d);
      if (d === "p") drawPalm(x, y, L.cell);
      if (d === "m") drawMushroom(x, y, L.cell, false);
      if (d === "u") drawMushroom(x, y, L.cell, true);
      if (d === "a") drawHamster(x, y, L.cell);
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tile(c, r);
      const x = L.ox + (c + 0.5) * L.cell;
      const y = L.oy + (r + 0.5) * L.cell;
      if (t === 3) drawHedge(x, y, L.cell);
      if (t === 1) drawHard(x, y, L.cell);
      if (t === 2) drawBox(x, y, L.cell);
    }
  }

  for (const it of state.items) drawItem(it, L);
  for (const b of state.bombs) drawBomb(b, L);
  for (const f of state.flames) for (const c of f.cells) drawFlame(c, L);

  const actors = [
    ...state.monsters.filter((m) => m.hp > 0).map((m) => ({ z: m.y, kind: "mob", m })),
    ...livingPlayers().map((p) => ({ z: p.y, kind: "p", p })),
  ];
  if (state.boss && state.boss.hp > 0) actors.push({ z: state.boss.y + 0.2, kind: "boss" });
  actors.sort((a, b) => a.z - b.z);
  for (const a of actors) {
    if (a.kind === "mob") {
      const pack = a.m.type === "fox" ? assets.fox : assets.eyeball;
      drawActor(a.m, pack, L, a.m.moving);
    } else if (a.kind === "p") {
      drawActor(
        a.p,
        a.p.team === "cpu" || a.p.slot === 1 ? assets.red : assets.blue,
        L,
        a.p.walking || a.p.moving
      );
    } else drawBoss(L);
  }

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(L.ox + p.x * L.cell, L.oy + p.y * L.cell, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.fillStyle = "rgba(26,26,26,0.72)";
  ctx.font = "13px Songti SC, serif";
  ctx.textAlign = "center";
  let tip = "WASD 移动 · J/空格放泡";
  if (state.playMode === "versus") {
    if (state.versusKind === "pvp") tip = "P1 WASD+J · P2 方向键+Shift · 单挑至一人存活";
    else if (state.versusKind === "cpu") tip = "WASD + J/空格放泡 · 打倒红色人机";
    else
      tip = humanPlayers().length > 1
        ? "P1 WASD+J · P2 方向键+Shift · 合作打倒人机"
        : "WASD + J/空格放泡 · 打倒人机（可加 2P）";
  } else if (humanPlayers().length > 1) {
    tip = "P1 WASD+J放泡 · P2 方向键+Shift放泡 · 清掉全部怪物";
  } else {
    tip = "WASD 移动 · J/空格放泡 · 返回大厅可开 2P";
  }
  ctx.fillText(tip, viewW / 2, viewH - 16);
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  raf = requestAnimationFrame(tick);
}

async function beginGame(stage = 1) {
  await ensureAssets();
  initState(stage);
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  syncHud();
}

function showLobby() {
  state = null;
  els.gameover?.classList.add("hidden");
  els.hud?.classList.add("hidden");
  els.overlay?.classList.remove("hidden");
  syncLobbyUi();
}

export async function startArcade({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  keys = Object.create(null);
  lobbyMode = "monster";
  versusKind = "pvp";
  coopWanted = false;
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
  on(els.btnRestart, "click", () => showLobby());
  on(els.btnJoin, "click", toggleCoop);
  on(els.btnModeMonster, "click", () => setLobbyMode("monster"));
  on(els.btnModeVersus, "click", () => setLobbyMode("versus"));
  on(els.btnVersusPvp, "click", () => setVersusKind("pvp"));
  on(els.btnVersusCpu, "click", () => setVersusKind("cpu"));
  on(els.btnVersusCoop, "click", () => setVersusKind("coop_cpu"));

  await ensureAssets();
  showLobby();
  if (!running) return;
  raf = requestAnimationFrame(tick);
}

export function stopArcade() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  offAll();
  state = null;
  keys = Object.create(null);
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
