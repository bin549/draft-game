const SHEET_SRC = "assets/kartgame/9ac5859b-9912-4ff0-af18-3973363e8aed.png";

const LAPS = 3;
const HALF_W = 1400;
const HALF_H = 860;
const CORNER = 340;
const ROAD = 168;

const BANDS = [
  ["miko", "idle", 40, 124],
  ["miko", "drive", 125, 203],
  ["miko", "turn", 204, 282],
  ["miko", "drift", 283, 358],
  ["miko", "boost", 359, 440],
  ["miko", "item", 441, 530],
  ["bun", "idle", 560, 638],
  ["bun", "drive", 639, 698],
  ["bun", "turn", 699, 757],
  ["bun", "drift", 758, 819],
  ["bun", "boost", 820, 879],
  ["bun", "item", 880, 952],
];

const ITEM_NAME = {
  mushroom: "加速蘑菇",
  greenshell: "绿壳",
  redshell: "红壳",
  banana: "香蕉皮",
  star: "无敌星",
  lightning: "闪电",
  flower: "火花",
  bullet: "冲刺弹",
  bomb: "炸弹",
  blueshell: "蓝壳",
  coin: "金币",
};

const LOOT = [
  ["mushroom", 16],
  ["greenshell", 14],
  ["redshell", 12],
  ["banana", 14],
  ["star", 7],
  ["lightning", 7],
  ["flower", 10],
  ["bullet", 6],
  ["bomb", 8],
  ["coin", 14],
];

let canvas = null;
let ctx = null;
let gl = null;
let glState = null;
let classicMode = false;
let els = null;
let running = false;
let raf = 0;
let lastTs = 0;
let dprScale = 1;
let cssW = 800;
let cssH = 600;
const cleanups = [];

let assets = null;
let assetsP = null;
let track = null;
let boxes = [];
let decor = [];
let racers = [];
let shells = [];
let bananas = [];
let bombs = [];
let particles = [];
let want2p = false;
let phase = "lobby";
let timer = 0;
let raceTime = 0;
let finishSeq = 0;
const held = new Set();
const selectedSkins = ["miko", "bun"];
const roleLocked = [false, false];
let lapNoticeT = 0;

function on(target, type, fn, opts) {
  if (!target) return;
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("赛车素材加载失败"));
    img.src = src;
  });
}

function knockoutDark(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const w = c.width;
  const h = c.height;
  const n = w * h;
  // The supplied sheet has a painted gray/blue backdrop instead of transparency.
  // Remove the smooth edge-connected backdrop while keeping the high-contrast kart art.
  const similar = (a, b) => {
    const dr = d[a * 4] - d[b * 4];
    const dg = d[a * 4 + 1] - d[b * 4 + 1];
    const db = d[a * 4 + 2] - d[b * 4 + 2];
    return dr * dr + dg * dg + db * db < 34 * 34;
  };
  const seen = new Uint8Array(n);
  const qx = new Int32Array(n);
  const qy = new Int32Array(n);
  let qs = 0;
  let qe = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    qx[qe] = x;
    qy[qe] = y;
    qe++;
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (qs < qe) {
    const x = qx[qs];
    const y = qy[qs];
    const p = y * w + x;
    qs++;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = ny * w + nx;
      if (!seen[np] && similar(p, np)) push(nx, ny);
    }
  }
  for (let p = 0; p < n; p++) {
    if (seen[p]) d[p * 4 + 3] = 0;
  }
  g.putImageData(im, 0, 0);
  return { canvas: c, data: d, w, h };
}

function clusterFrames(data, w, h, y0, y1, x0, minW) {
  const col = new Uint16Array(w);
  const yA = clamp(y0 | 0, 0, h);
  const yB = clamp(y1 | 0, 0, h);
  for (let y = yA; y < yB; y++) {
    for (let x = x0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) col[x]++;
    }
  }
  const runs = [];
  let x = x0;
  while (x < w) {
    while (x < w && col[x] < 3) x++;
    if (x >= w) break;
    const a = x;
    while (x < w && col[x] >= 3) x++;
    if (x - a < minW) continue;
    let minX = w;
    let maxX = 0;
    let minY = yB;
    let maxY = yA;
    for (let yy = yA; yy < yB; yy++) {
      const row = yy * w;
      for (let xx = a; xx < x; xx++) {
        if (data[(row + xx) * 4 + 3] <= 24) continue;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
    if (maxX < minX) continue;
    const pad = 1;
    const bx = Math.max(0, minX - pad);
    const by = Math.max(0, minY - pad);
    runs.push({
      x: bx,
      y: by,
      w: Math.min(w, maxX + 1 + pad) - bx,
      h: Math.min(h, maxY + 1 + pad) - by,
    });
  }
  return runs;
}

function cutFrame(sheet, box) {
  const c = document.createElement("canvas");
  c.width = box.w;
  c.height = box.h;
  c.getContext("2d").drawImage(sheet, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { canvas: c, x: box.x, w: box.w, h: box.h };
}

function splitGroups(frames) {
  const groups = [];
  let cur = [];
  for (const f of frames) {
    if (cur.length) {
      const p = cur[cur.length - 1];
      if (f.x - (p.x + p.w) > 50) {
        groups.push(cur);
        cur = [];
      }
    }
    cur.push(f);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function packKind(frames, kind) {
  const groups = splitGroups(frames);
  if (kind === "turn" || kind === "drift" || kind === "boost") {
    return { L: groups[0] || [], R: groups[1] || groups[0] || [] };
  }
  return groups.flat();
}

async function loadAssets() {
  const img = await loadImage(SHEET_SRC);
  const sheet = knockoutDark(img);
  const skins = { miko: {}, bun: {} };
  for (const [who, kind, y0, y1] of BANDS) {
    const boxes = clusterFrames(sheet.data, sheet.w, sheet.h, y0, y1, 200, 36).filter((b) => b.w >= 40 && b.h >= 40);
    const frames = boxes.map((b) => cutFrame(sheet.canvas, b));
    const packed = packKind(frames, kind);
    if (kind === "turn") {
      skins[who].turnL = packed.L;
      skins[who].turnR = packed.R;
    } else if (kind === "drift") {
      skins[who].driftL = packed.L;
      skins[who].driftR = packed.R;
    } else if (kind === "boost") {
      skins[who].boostL = packed.L;
      skins[who].boostR = packed.R;
    } else {
      skins[who][kind] = packed;
    }
  }
  if ((skins.miko.drive || []).length < 6 || (skins.bun.drive || []).length < 6) {
    throw new Error("赛车动画切帧失败");
  }
  const iconBoxes = clusterFrames(sheet.data, sheet.w, sheet.h, 954, 1023, 110, 24).filter(
    (b) => b.w >= 28 && b.w <= 78 && b.h >= 28
  );
  const keys = iconBoxes.length >= 12
    ? ["mushroom", "greenshell", "redshell", "banana", "star", "lightning", "flower", "bullet", "bomb", "blueshell", "coin", "box"]
    : ["mushroom", "greenshell", "redshell", "banana", "star", "lightning", "flower", "bullet", "bomb", "coin", "box"];
  const icons = {};
  iconBoxes.forEach((box, i) => {
    const key = keys[i];
    if (key) icons[key] = cutFrame(sheet.canvas, box);
  });
  if (icons.blueshell) LOOT.push(["blueshell", 5]);
  assets = { skins, icons };
  return assets;
}

function ensureAssets() {
  if (assets) return Promise.resolve(assets);
  if (!assetsP) {
    assetsP = loadAssets().catch((err) => {
      assetsP = null;
      throw err;
    });
  }
  return assetsP;
}

function pushPoint(pts, x, y) {
  if (pts.length) {
    const p = pts[pts.length - 1];
    if (Math.hypot(x - p.x, y - p.y) < 6) return;
    if (pts.length > 12 && Math.hypot(x - pts[0].x, y - pts[0].y) < 6) return;
  }
  pts.push({ x, y });
}

function buildTrack() {
  const pts = [];
  const arc = (cx, cy, a0, a1, n) => {
    for (let i = 1; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pushPoint(pts, cx + Math.cos(a) * CORNER, cy + Math.sin(a) * CORNER);
    }
  };
  const x0 = -(HALF_W - CORNER);
  const x1 = HALF_W - CORNER;
  const y0 = HALF_H;
  for (let i = 0; i <= 22; i++) pushPoint(pts, x0 + (x1 - x0) * (i / 22), y0);
  arc(x1, HALF_H - CORNER, Math.PI / 2, 0, 16);
  for (let i = 1; i <= 14; i++) {
    pushPoint(pts, HALF_W, HALF_H - CORNER - (HALF_H - CORNER) * 2 * (i / 14));
  }
  arc(HALF_W - CORNER, -(HALF_H - CORNER), 0, -Math.PI / 2, 16);
  for (let i = 1; i <= 22; i++) pushPoint(pts, x1 - (x1 - x0) * (i / 22), -HALF_H);
  arc(-(HALF_W - CORNER), -(HALF_H - CORNER), -Math.PI / 2, -Math.PI, 16);
  for (let i = 1; i <= 14; i++) {
    pushPoint(pts, -HALF_W, -(HALF_H - CORNER) + (HALF_H - CORNER) * 2 * (i / 14));
  }
  arc(-(HALF_W - CORNER), HALF_H - CORNER, Math.PI, Math.PI / 2, 16);

  let bi = 0;
  let bd = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x, pts[i].y - HALF_H);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  const line = pts.slice(bi).concat(pts.slice(0, bi));
  const closed = line.concat([line[0]]);
  const cum = [0];
  for (let i = 1; i < closed.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y));
  }
  track = { pts: closed, cum, length: cum[cum.length - 1] };

  boxes = [];
  for (const frac of [0.18, 0.4, 0.63, 0.84]) {
    for (const lat of [-86, 86]) {
      const p = pointAt(frac * track.length, lat);
      boxes.push({ x: p.x, y: p.y, cd: 0, bob: Math.random() * 6 });
    }
  }
  decor = [
    [-260, -40, 26],
    [80, 60, 22],
    [320, -80, 28],
    [-40, 180, 20],
    [180, -200, 24],
    [-HALF_W - 120, 180, 34],
    [HALF_W + 130, -220, 30],
    [480, HALF_H + 140, 32],
    [-520, -HALF_H - 130, 36],
  ];
}

function segmentPoint(dist) {
  const L = track.length;
  let d = ((dist % L) + L) % L;
  const pts = track.pts;
  const cum = track.cum;
  let i = 0;
  const hi = pts.length - 2;
  while (i < hi && cum[i + 1] < d) i++;
  const span = cum[i + 1] - cum[i] || 1;
  const t = clamp((d - cum[i]) / span, 0, 1);
  const a = pts[i];
  const b = pts[i + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    x: a.x + dx * t,
    y: a.y + dy * t,
    heading: Math.atan2(dx, -dy),
    along: d,
  };
}

function pointAt(dist, lat = 0) {
  const p = segmentPoint(dist);
  const rx = Math.cos(p.heading);
  const ry = Math.sin(p.heading);
  return { x: p.x + rx * lat, y: p.y + ry * lat, heading: p.heading, along: p.along };
}

function project(x, y) {
  const pts = track.pts;
  const cum = track.cum;
  let bestD = 1e9;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < bestD) {
      bestD = dist;
      best = {
        dist,
        x: px,
        y: py,
        along: cum[i] + Math.sqrt(len2) * t,
        heading: Math.atan2(dx, -dy),
      };
    }
  }
  return best;
}

function makeRacer(opts, slot) {
  const place = pointAt(150 - slot.back, slot.lat);
  return {
    name: opts.name,
    human: opts.human,
    cpu: !opts.human,
    pad: opts.pad,
    skin: assets.skins[opts.skin],
    x: place.x,
    y: place.y,
    heading: place.heading,
    along: place.along,
    prog: place.along / track.length,
    lap: 0,
    speed: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    slip: 0,
    drifting: false,
    wasDrift: false,
    gauge: 0,
    boostT: 0,
    starT: 0,
    slowT: 0,
    stunT: 0,
    bulletT: 0,
    itemT: 0,
    item: null,
    think: 0.4 + Math.random() * 0.6,
    coins: 0,
    finished: false,
    finishRank: 0,
    arm: 0.35,
    frame: Math.random() * 4,
    anim: "idle",
    camX: place.x,
    camY: place.y,
    camInit: false,
    banner: null,
    baseMax: opts.human ? 520 : 430 + opts.cpuIndex * 14,
    smoke: 0,
  };
}

function spawnRacers() {
  const slots = [
    { lat: -74, back: 0 },
    { lat: 74, back: 0 },
    { lat: -74, back: 84 },
    { lat: 74, back: 84 },
  ];
  const roster = [{ name: selectedSkins[0] === "miko" ? "巫女" : "蓝怪", human: true, pad: 0, skin: selectedSkins[0], cpuIndex: 0 }];
  if (want2p) roster.push({ name: selectedSkins[1] === "miko" ? "巫女" : "蓝怪", human: true, pad: 1, skin: selectedSkins[1], cpuIndex: 0 });
  let cpuN = 1;
  while (roster.length < 4) {
    roster.push({ name: "蓝怪" + cpuN, human: false, pad: -1, skin: "bun", cpuIndex: cpuN });
    cpuN++;
  }
  racers = roster.map((opts, i) => makeRacer(opts, slots[i]));
  shells = [];
  bananas = [];
  bombs = [];
  particles = [];
  finishSeq = 0;
  for (const b of boxes) b.cd = 0;
}

function ranked() {
  return racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishRank - b.finishRank;
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.prog - a.prog;
  });
}

function racerAhead(kart) {
  const mine = kart.lap + kart.prog;
  let best = null;
  let bestD = 1e9;
  for (const o of racers) {
    if (o === kart || o.finished) continue;
    const d = o.lap + o.prog - mine;
    if (d > 0.004 && d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function rollItem() {
  let sum = 0;
  for (const pair of LOOT) sum += pair[1];
  let r = Math.random() * sum;
  for (const [key, w] of LOOT) {
    r -= w;
    if (r <= 0) return key;
  }
  return "mushroom";
}

function useItem(kart) {
  const it = kart.item;
  if (!it || kart.finished || kart.stunT > 0) return;
  kart.item = null;
  kart.itemT = 0.45;
  const fx = Math.sin(kart.heading);
  const fy = -Math.cos(kart.heading);
  const bx = kart.x - fx * 40;
  const by = kart.y - fy * 40;
  if (it === "mushroom") kart.boostT = Math.max(kart.boostT, 1.3);
  else if (it === "flower") kart.boostT = Math.max(kart.boostT, 0.8);
  else if (it === "star") kart.starT = Math.max(kart.starT, 3.2);
  else if (it === "bullet") kart.bulletT = Math.max(kart.bulletT, 1.4);
  else if (it === "coin") kart.boostT = Math.max(kart.boostT, 0.45);
  else if (it === "banana") bananas.push({ x: bx, y: by, owner: kart, age: 0, life: 14 });
  else if (it === "bomb") bombs.push({ x: bx, y: by, owner: kart, fuse: 1.2, boom: 0 });
  else if (it === "lightning") {
    for (const o of racers) {
      if (o !== kart && !o.finished) {
        o.slowT = 2.4;
        o.speed *= 0.4;
      }
    }
  } else if (it === "greenshell" || it === "redshell" || it === "blueshell") {
    const kind = it === "greenshell" ? "green" : it === "redshell" ? "red" : "blue";
    const spd = kind === "blue" ? 560 : 520;
    shells.push({
      kind,
      x: kart.x + fx * 34,
      y: kart.y + fy * 34,
      vx: fx * spd,
      vy: fy * spd,
      owner: kart,
      life: kind === "green" ? 2.8 : 5,
      grace: 0.18,
    });
  }
}

function readHuman(kart) {
  if (kart.pad === 0) {
    kart.steer = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
    kart.throttle = held.has("KeyW") ? 1 : 0;
    kart.brake = held.has("KeyS") ? 1 : 0;
  } else {
    kart.steer = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
    kart.throttle = held.has("ArrowUp") ? 1 : 0;
    kart.brake = held.has("ArrowDown") ? 1 : 0;
  }
}

function driveCpu(kart) {
  const aim = segmentPoint(kart.along + 200 + kart.speed * 0.28);
  const far = segmentPoint(kart.along + 460);
  const diff = wrapAngle(aim.heading - kart.heading);
  kart.steer = clamp(diff * 1.7, -1, 1);
  const corner = Math.abs(wrapAngle(far.heading - aim.heading));
  const wantDrift = corner > 0.5 && kart.speed > 200 && Math.abs(kart.steer) > 0.28 && kart.boostT <= 0;
  kart.throttle = 1;
  kart.brake = wantDrift ? 1 : 0;
  if (kart.item && kart.think <= 0) {
    const ahead = racerAhead(kart);
    const place = ranked().indexOf(kart);
    let use = false;
    if (kart.item === "banana" || kart.item === "bomb") use = true;
    else if (kart.item === "blueshell") use = place > 0;
    else if (kart.item === "greenshell" || kart.item === "redshell") use = !!ahead;
    else use = true;
    if (use && Math.random() < 0.55) useItem(kart);
    kart.think = 0.7 + Math.random() * 0.8;
  }
}

function finishKart(kart) {
  kart.finished = true;
  kart.finishRank = ++finishSeq;
  kart.speed = 0;
  kart.throttle = 0;
  if (kart.human) kart.banner = { text: "冲线！", t: 1.6 };
}

function updateAnim(kart, dt) {
  let state = "drive";
  if (kart.itemT > 0) state = "item";
  else if (kart.boostT > 0 || kart.starT > 0 || kart.bulletT > 0) state = kart.steer < -0.25 ? "boostL" : kart.steer > 0.25 ? "boostR" : "boostL";
  else if (kart.drifting) state = kart.steer < 0 ? "driftL" : "driftR";
  else if (Math.abs(kart.steer) > 0.35 && Math.abs(kart.speed) > 60) state = kart.steer < 0 ? "turnL" : "turnR";
  else if (Math.abs(kart.speed) < 28) state = "idle";
  if (state !== kart.anim) {
    kart.anim = state;
    kart.frame = 0;
  } else {
    kart.frame += dt * (state === "idle" ? 8 : 14);
  }
}

function framesOf(kart) {
  const s = kart.skin;
  if (!s) return null;
  if (kart.anim === "turnL") return s.turnL?.length ? s.turnL : s.drive;
  if (kart.anim === "turnR") return s.turnR?.length ? s.turnR : s.turnL?.length ? s.turnL : s.drive;
  if (kart.anim === "driftL") return s.driftL?.length ? s.driftL : s.drive;
  if (kart.anim === "driftR") return s.driftR?.length ? s.driftR : s.driftL?.length ? s.driftL : s.drive;
  if (kart.anim === "boostL") return s.boostL?.length ? s.boostL : s.drive;
  if (kart.anim === "boostR") return s.boostR?.length ? s.boostR : s.boostL?.length ? s.boostL : s.drive;
  if (kart.anim === "item") return s.item?.length ? s.item : s.idle;
  if (kart.anim === "idle") return s.idle?.length ? s.idle : s.drive;
  return s.drive?.length ? s.drive : s.idle;
}

function updateKart(kart, dt) {
  if (kart.banner) {
    kart.banner.t -= dt;
    if (kart.banner.t <= 0) kart.banner = null;
  }
  if (phase !== "race" || kart.finished) {
    kart.speed += (0 - kart.speed) * Math.min(1, dt * 3);
    updateAnim(kart, dt);
    return;
  }

  if (kart.stunT > 0) {
    kart.stunT -= dt;
    kart.steer = 0;
    kart.throttle = 0;
    kart.brake = 0;
    kart.heading += dt * 12;
    kart.speed *= Math.max(0, 1 - dt * 2.4);
  } else if (kart.bulletT > 0) {
    kart.bulletT -= dt;
    const aim = segmentPoint(kart.along + 220);
    kart.heading = lerpAngle(kart.heading, aim.heading, Math.min(1, dt * 7));
    kart.steer = 0;
    kart.throttle = 1;
    kart.brake = 0;
  } else if (kart.cpu) driveCpu(kart);
  else readHuman(kart);

  if (raceTime < 0.9 && kart.stunT <= 0) kart.throttle = 1;

  if (kart.boostT > 0) kart.boostT -= dt;
  if (kart.starT > 0) kart.starT -= dt;
  if (kart.slowT > 0) kart.slowT -= dt;
  if (kart.itemT > 0) kart.itemT -= dt;
  if (kart.think > 0) kart.think -= dt;

  const info0 = project(kart.x, kart.y);
  const onRoad = info0.dist <= ROAD + 6;
  if (kart.stunT <= 0) {
    let cap = kart.baseMax;
    if (kart.boostT > 0) cap += 210;
    if (kart.starT > 0) cap = Math.max(cap, kart.baseMax + 150);
    if (kart.bulletT > 0) cap = Math.max(cap, kart.baseMax + 180);
    if (kart.slowT > 0) cap = 175;
    let speed = kart.speed;
    speed += kart.throttle * 420 * dt;
    speed -= kart.brake * (kart.drifting ? 160 : 560) * dt;
    speed -= speed * (onRoad ? 0.16 : 0.7) * dt;
    if (speed > cap) speed -= (speed - cap) * Math.min(1, dt * 3.2);
    kart.speed = Math.max(-90, speed);
  }

  const drifting = kart.stunT <= 0 && kart.bulletT <= 0 && kart.brake > 0.5 && Math.abs(kart.steer) > 0.18 && kart.speed > 155;
  kart.drifting = drifting;
  if (drifting) kart.gauge = Math.min(1, kart.gauge + dt * 0.5);
  else if (kart.wasDrift && kart.gauge > 0.58) {
    kart.boostT = Math.max(kart.boostT, 0.5 + kart.gauge * 0.75);
    kart.gauge = 0;
  } else kart.gauge = Math.max(0, kart.gauge - dt * 0.7);
  kart.wasDrift = drifting;

  if (kart.stunT <= 0) {
    const turn = (drifting ? 2.85 : 2.15) * Math.max(0.55, Math.min(1, Math.abs(kart.speed) / 130));
    kart.heading += kart.steer * turn * dt * Math.sign(kart.speed || 1);
  }
  const slipTarget = drifting ? kart.steer * 0.7 : 0;
  kart.slip += (slipTarget - kart.slip) * Math.min(1, dt * 5);
  const h = kart.heading - kart.slip;
  kart.x += Math.sin(h) * kart.speed * dt;
  kart.y += -Math.cos(h) * kart.speed * dt;

  const info = project(kart.x, kart.y);
  if (info.dist > ROAD + 6) {
    const over = info.dist - ROAD;
    const nx = (info.x - kart.x) / (info.dist || 1);
    const ny = (info.y - kart.y) / (info.dist || 1);
    const pull = Math.min(1, dt * (over > 48 ? 18 : 8));
    kart.x += nx * over * pull;
    kart.y += ny * over * pull;
  }

  if (kart.arm > 0) {
    kart.arm -= dt;
    kart.prog = info.along / track.length;
  } else {
    const prog = info.along / track.length;
    const d = prog - kart.prog;
    if (d < -0.65) {
      kart.lap++;
      if (kart.lap >= LAPS) finishKart(kart);
      else if (kart.human) {
        const text = `${kart.pad === 0 ? "P1" : "P2"} · 第 ${kart.lap + 1} 圈`;
        kart.banner = { text: `第 ${kart.lap + 1} 圈`, t: 1.25 };
        showLapNotice(text);
      }
    } else if (d > 0.65) kart.lap = Math.max(0, kart.lap - 1);
    kart.prog = prog;
  }
  kart.along = info.along;

  if (drifting || kart.boostT > 0) {
    kart.smoke -= dt;
    if (kart.smoke <= 0) {
      kart.smoke = drifting ? 0.04 : 0.07;
      const rx = Math.cos(kart.heading);
      const ry = Math.sin(kart.heading);
      particles.push({
        x: kart.x - Math.sin(kart.heading) * 18 + rx * (Math.random() * 16 - 8),
        y: kart.y + Math.cos(kart.heading) * 18 + ry * (Math.random() * 16 - 8),
        life: drifting ? 0.45 : 0.28,
        max: drifting ? 0.45 : 0.28,
        r: drifting ? 7 : 5,
        color: drifting ? "rgba(230,236,240," : "rgba(255,196,90,",
      });
    }
  }
  updateAnim(kart, dt);
}

function separateKarts() {
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      if (a.finished || b.finished) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      if (dist >= 48) continue;
      const push = (48 - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      if (a.speed > b.speed + 40) b.speed = Math.max(b.speed, a.speed * 0.86);
      else if (b.speed > a.speed + 40) a.speed = Math.max(a.speed, b.speed * 0.86);
    }
  }
}

function smack(kart, power) {
  if (!kart || kart.finished || kart.starT > 0) return false;
  kart.stunT = Math.max(kart.stunT, power);
  kart.speed *= 0.22;
  kart.gauge = 0;
  kart.drifting = false;
  return true;
}

function homeShell(shell, target, speed) {
  if (!target) return;
  const ang = Math.atan2(target.x - shell.x, -(target.y - shell.y));
  const tx = Math.sin(ang) * speed;
  const ty = -Math.cos(ang) * speed;
  shell.vx += (tx - shell.vx) * 0.18;
  shell.vy += (ty - shell.vy) * 0.18;
}

function updateHazards(dt) {
  for (const box of boxes) {
    if (box.cd > 0) {
      box.cd -= dt;
      continue;
    }
    for (const kart of racers) {
      if (kart.finished) continue;
      if (Math.hypot(kart.x - box.x, kart.y - box.y) > 40) continue;
      const key = rollItem();
      if (key === "coin") {
        kart.coins++;
        kart.boostT = Math.max(kart.boostT, 0.4);
        box.cd = 5.2;
        break;
      }
      if (kart.item) continue;
      kart.item = key;
      kart.think = 0.55;
      box.cd = 5.2;
      break;
    }
  }

  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.life -= dt;
    s.grace -= dt;
    if (s.kind === "red") homeShell(s, racerAhead(s.owner), 540);
    else if (s.kind === "blue") {
      const lead = ranked()[0];
      homeShell(s, lead, 580);
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let dead = s.life <= 0;
    if (!dead && s.grace <= 0) {
      for (const kart of racers) {
        if (kart === s.owner && s.kind !== "blue") continue;
        if (kart.finished) continue;
        if (Math.hypot(kart.x - s.x, kart.y - s.y) > 30) continue;
        if (kart.starT > 0) dead = true;
        else smack(kart, s.kind === "blue" ? 1.2 : 0.75);
        dead = true;
        break;
      }
    }
    if (dead) shells.splice(i, 1);
  }

  for (let i = bananas.length - 1; i >= 0; i--) {
    const b = bananas[i];
    b.age += dt;
    b.life -= dt;
    let gone = b.life <= 0;
    if (!gone) {
      for (const kart of racers) {
        if (kart.finished) continue;
        if (kart === b.owner && b.age < 0.45) continue;
        if (Math.hypot(kart.x - b.x, kart.y - b.y) > 28) continue;
        if (smack(kart, 0.7)) gone = true;
        break;
      }
    }
    if (gone) bananas.splice(i, 1);
  }

  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    if (b.boom > 0) {
      b.boom -= dt;
      if (b.boom <= 0) bombs.splice(i, 1);
      continue;
    }
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    b.boom = 0.28;
    for (const kart of racers) {
      if (kart.finished) continue;
      if (Math.hypot(kart.x - b.x, kart.y - b.y) < 86) smack(kart, 0.95);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].life -= dt;
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function updateCam(kart, dt) {
  const tx = kart.x + Math.sin(kart.heading) * 90;
  const ty = kart.y - Math.cos(kart.heading) * 90;
  if (!kart.camInit) {
    kart.camX = tx;
    kart.camY = ty;
    kart.camInit = true;
    return;
  }
  const k = 1 - Math.exp(-dt * 4.2);
  kart.camX += (tx - kart.camX) * k;
  kart.camY += (ty - kart.camY) * k;
}

function update(dt) {
  if (phase === "countdown") {
    timer -= dt;
    if (timer <= 0) {
      phase = "race";
      raceTime = 0;
    }
    for (const kart of racers) updateAnim(kart, dt);
  } else if (phase === "race") {
    raceTime += dt;
    for (const kart of racers) updateKart(kart, dt);
    separateKarts();
    updateHazards(dt);
    const humans = racers.filter((r) => r.human);
    if (humans.length && humans.every((r) => r.finished)) endRace();
  } else {
    for (const kart of racers) updateAnim(kart, dt);
  }
  for (const kart of racers) updateCam(kart, dt);
  syncHud();
  syncCountdown();
  syncLapNotice(dt);
}

function endRace() {
  phase = "finish";
  const order = ranked();
  const humans = racers.filter((r) => r.human);
  if (els.endTitle) {
    els.endTitle.textContent = humans.length > 1 ? "比赛结束" : `${humans[0].name} 第 ${humans[0].finishRank} 名`;
  }
  if (els.resultText) {
    els.resultText.innerHTML = order
      .map((r, i) => `${i + 1}. ${r.name}${r.finished ? "" : "（未完赛）"}`)
      .join("<br>");
  }
  els.gameover?.classList.remove("hidden");
}

function syncHud() {
  const p1 = racers.find((r) => r.human && r.pad === 0);
  if (!p1 || !els.rankText) return;
  const order = ranked();
  const p2 = racers.find((r) => r.human && r.pad === 1);
  const n = order.length;
  const r1 = order.indexOf(p1) + 1;
  els.rankText.textContent = p2 ? `P1 ${r1}/${n} · P2 ${order.indexOf(p2) + 1}/${n}` : `${r1}/${n}`;
  const lapShown = p1.finished ? LAPS : Math.min(LAPS, p1.lap + 1);
  els.lapText.textContent = `${lapShown}/${LAPS}`;
  els.speedText.textContent = `速度 ${Math.max(0, Math.round(p1.speed / 4))}`;
  const n1 = p1.item ? ITEM_NAME[p1.item] || "道具" : "无";
  if (p2) {
    const n2 = p2.item ? ITEM_NAME[p2.item] || "道具" : "无";
    els.itemText.textContent = `P1 ${n1} · P2 ${n2}`;
    drawHudItem(els.itemIcon, p1.item);
    drawHudItem(els.itemIconP2, p2.item);
  } else {
    els.itemText.textContent = `道具 ${n1}`;
    drawHudItem(els.itemIcon, p1.item);
    drawHudItem(els.itemIconP2, null);
  }
}

function syncCountdown() {
  const node = els.countdown;
  if (!node) return;
  if (phase !== "countdown") {
    node.classList.add("hidden");
    return;
  }
  node.classList.remove("hidden");
  node.textContent = timer > 2.6 ? "3" : timer > 1.6 ? "2" : timer > 0.6 ? "1" : "出发";
}

function drawHudItem(canvasEl, key) {
  if (!canvasEl) return;
  const icon = key && assets?.icons?.[key];
  const hctx = canvasEl.getContext("2d");
  hctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  canvasEl.classList.toggle("hidden", !icon);
  if (!icon) return;
  const scale = Math.min((canvasEl.width - 4) / icon.w, (canvasEl.height - 4) / icon.h);
  const w = icon.w * scale;
  const h = icon.h * scale;
  hctx.drawImage(icon.canvas, (canvasEl.width - w) / 2, (canvasEl.height - h) / 2, w, h);
}

function showLapNotice(text) {
  lapNoticeT = 1.35;
  if (!els.lapNotice) return;
  els.lapNotice.textContent = text;
  els.lapNotice.classList.remove("hidden");
}

function syncLapNotice(dt) {
  if (lapNoticeT > 0) lapNoticeT -= dt;
  if (lapNoticeT <= 0) els.lapNotice?.classList.add("hidden");
}

function syncRoleSelect() {
  const root = els.roleSelect;
  if (!root) return;
  const cards = root.querySelectorAll(".kart-select-card");
  if (cards.length) {
    root.classList.toggle("single", !want2p);
    cards.forEach((card) => {
      const player = Number(card.dataset.kartPlayer);
      const skin = selectedSkins[player];
      const frame = assets?.skins?.[skin]?.idle?.[0];
      const portrait = card.querySelector("[data-kart-portrait]");
      if (portrait && frame && !portrait.querySelector("canvas")) {
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = 220;
        portrait.appendChild(canvas);
      }
      const portraitCanvas = portrait?.querySelector("canvas");
      if (portraitCanvas && frame) {
        const pctx = portraitCanvas.getContext("2d");
        pctx.clearRect(0, 0, portraitCanvas.width, portraitCanvas.height);
        const scale = Math.min((portraitCanvas.width - 20) / frame.w, (portraitCanvas.height - 16) / frame.h);
        const dw = frame.w * scale;
        const dh = frame.h * scale;
        pctx.drawImage(frame.canvas, (portraitCanvas.width - dw) / 2, (portraitCanvas.height - dh) / 2, dw, dh);
      }
      const name = card.querySelector(`[data-kart-name="${player}"]`);
      if (name) name.textContent = skin === "miko" ? "巫女" : "蓝色怪物";
      const status = card.querySelector(`[data-kart-status="${player}"]`);
      const unavailable = player === 1 && !want2p;
      card.classList.toggle("hidden", unavailable);
      card.classList.toggle("disabled", unavailable);
      card.classList.toggle("locked", roleLocked[player]);
      if (status) status.textContent = unavailable ? "加入 2P 后选择" : roleLocked[player] ? "已锁定" : "上下切换";
      card.querySelectorAll("[data-kart-action]").forEach((button) => {
        button.disabled = unavailable || (roleLocked[player] && button.dataset.kartAction !== "confirm");
      });
    });
    return;
  }
  root.querySelectorAll("[data-kart-player]").forEach((row) => {
    const player = Number(row.dataset.kartPlayer);
    row.classList.toggle("hidden", player === 1 && !want2p);
    row.querySelectorAll("[data-kart-skin]").forEach((button) => {
      button.classList.toggle("active", button.dataset.kartSkin === selectedSkins[player]);
    });
  });
}

function renderRoleOptions() {
  const root = els.roleSelect;
  if (!root || !assets) return;
  root.querySelectorAll("[data-kart-skin]").forEach((button) => {
    const skin = assets.skins[button.dataset.kartSkin];
    const frame = skin?.idle?.[0];
    if (!frame || button.querySelector("canvas")) return;
    const thumb = document.createElement("canvas");
    thumb.width = 64;
    thumb.height = 46;
    thumb.className = "kart-role-thumb";
    const tctx = thumb.getContext("2d");
    tctx.drawImage(frame.canvas, 5, 2, 54, 40);
    button.prepend(thumb);
  });
}

function chooseRole(event) {
  if (phase !== "lobby") return;
  const actionButton = event.target.closest?.("[data-kart-action]");
  if (actionButton) {
    const card = actionButton.closest("[data-kart-player]");
    const player = Number(card?.dataset.kartPlayer);
    if (!card || (player === 1 && !want2p)) return;
    const action = actionButton.dataset.kartAction;
    if (action === "up" || action === "down") {
      if (!roleLocked[player]) selectedSkins[player] = selectedSkins[player] === "miko" ? "bun" : "miko";
    } else if (action === "confirm") {
      roleLocked[player] = !roleLocked[player];
    }
    spawnRacers();
    syncRoleSelect();
    syncLobby();
    maybeStartFromSelection();
    return;
  }
  const button = event.target.closest?.("[data-kart-skin]");
  if (!button) return;
  const row = button.closest("[data-kart-player]");
  if (!row) return;
  const player = Number(row.dataset.kartPlayer);
  if (!roleLocked[player]) selectedSkins[player] = button.dataset.kartSkin;
  spawnRacers();
  syncRoleSelect();
  syncLobby();
}

function maybeStartFromSelection() {
  if (phase !== "lobby") return;
  if (roleLocked[0] && (!want2p || roleLocked[1])) beginRace();
}

function syncLobby() {
  if (els.btnJoin) {
    els.btnJoin.classList.toggle("active", want2p);
    els.btnJoin.textContent = want2p ? "取消 2P" : "加入 2P";
  }
  if (els.overlaySub) {
    els.overlaySub.textContent = want2p
      ? `P1 ${selectedSkins[0] === "miko" ? "巫女" : "蓝怪"}，P2 ${selectedSkins[1] === "miko" ? "巫女" : "蓝怪"}，另有两台电脑车。三圈，先冲线者胜。`
      : `你驾驶${selectedSkins[0] === "miko" ? "巫女" : "蓝怪"}，对阵三台蓝怪。三圈，问号箱里有道具。`;
  }
  syncRoleSelect();
}

function showLobby() {
  phase = "lobby";
  lapNoticeT = 0;
  roleLocked[0] = false;
  roleLocked[1] = false;
  spawnRacers();
  els.overlay?.classList.remove("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.add("hidden");
  els.countdown?.classList.add("hidden");
  els.lapNotice?.classList.add("hidden");
  syncLobby();
}

function beginRace(force = false) {
  if (!force && (!roleLocked[0] || (want2p && !roleLocked[1]))) return;
  spawnRacers();
  phase = "countdown";
  timer = 3.6;
  raceTime = 0;
  lapNoticeT = 0;
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  els.lapNotice?.classList.add("hidden");
  syncHud();
  syncCountdown();
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function traceTrack() {
  const pts = track.pts;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function drawWorld() {
  ctx.fillStyle = "#7fbf63";
  ctx.fillRect(-HALF_W - 800, -HALF_H - 800, (HALF_W + 800) * 2, (HALF_H + 800) * 2);
  ctx.fillStyle = "#8ec96d";
  roundRect(-(HALF_W - ROAD - 6), -(HALF_H - ROAD - 6), (HALF_W - ROAD - 6) * 2, (HALF_H - ROAD - 6) * 2, Math.max(40, CORNER - 30));
  ctx.fill();

  traceTrack();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#2f3b2c";
  ctx.lineWidth = ROAD * 2 + 26;
  ctx.stroke();
  ctx.strokeStyle = "#c45c26";
  ctx.lineWidth = ROAD * 2 + 10;
  ctx.stroke();
  ctx.strokeStyle = "#6e6a63";
  ctx.lineWidth = ROAD * 2;
  ctx.stroke();
  ctx.strokeStyle = "#8d887e";
  ctx.lineWidth = ROAD * 2 - 34;
  ctx.stroke();
  ctx.setLineDash([26, 20]);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.setLineDash([]);

  const line = segmentPoint(0);
  const rx = Math.cos(line.heading);
  const ry = Math.sin(line.heading);
  for (let i = -6; i <= 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#f4f1ea" : "#1a1a1a";
    const cx = line.x + rx * (i * 22);
    const cy = line.y + ry * (i * 22);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(line.heading);
    ctx.fillRect(-11, -7, 22, 14);
    ctx.restore();
  }

  for (const bush of decor) {
    ctx.fillStyle = "#3e8f4c";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bush[0], bush[1], bush[2], 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const boxIcon = assets.icons.box;
  for (const box of boxes) {
    if (box.cd > 0) continue;
    const bob = Math.sin(raceTime * 3 + box.bob) * 5;
    if (boxIcon) {
      const dw = 40;
      const dh = 40;
      ctx.drawImage(boxIcon.canvas, box.x - dw / 2, box.y - dh / 2 + bob, dw, dh);
    } else {
      ctx.fillStyle = "#e2b43a";
      ctx.fillRect(box.x - 16, box.y - 16 + bob, 32, 32);
    }
  }

  for (const p of particles) {
    ctx.fillStyle = `${p.color}${(p.life / p.max) * 0.7})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1.2 - p.life / p.max), 0, Math.PI * 2);
    ctx.fill();
  }

  const bananaIcon = assets.icons.banana;
  for (const b of bananas) {
    if (bananaIcon) ctx.drawImage(bananaIcon.canvas, b.x - 16, b.y - 16, 32, 32);
  }
  for (const b of bombs) {
    if (b.boom > 0) {
      ctx.fillStyle = `rgba(255,150,60,${b.boom / 0.28})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 86, 0, Math.PI * 2);
      ctx.fill();
    } else if (assets.icons.bomb) {
      ctx.drawImage(assets.icons.bomb.canvas, b.x - 16, b.y - 16, 32, 32);
    }
  }
  for (const s of shells) {
    const key = s.kind === "green" ? "greenshell" : s.kind === "red" ? "redshell" : "blueshell";
    const icon = assets.icons[key] || assets.icons.greenshell;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.atan2(s.vx, -s.vy));
    if (icon) ctx.drawImage(icon.canvas, -16, -16, 32, 32);
    ctx.restore();
  }

  const order = ranked();
  const drawList = racers.slice().sort((a, b) => a.y - b.y);
  for (const kart of drawList) {
    const frs = framesOf(kart);
    const fr = frs && frs.length ? frs[Math.floor(kart.frame) % frs.length] : null;
    const scale = (kart.slowT > 0 ? 1.05 : 1.48) * (kart.finished ? 0.95 : 1);
    ctx.save();
    ctx.translate(kart.x, kart.y);
    ctx.fillStyle = "rgba(26,26,26,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kart.starT > 0) {
      ctx.strokeStyle = `rgba(255, 210, 70, ${0.45 + Math.sin(raceTime * 18) * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -8, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(kart.heading + kart.slip * 0.35);
    if (fr) {
      const dw = fr.w * scale;
      const dh = fr.h * scale;
      ctx.drawImage(fr.canvas, -dw / 2, -dh * 0.78, dw, dh);
    } else {
      ctx.fillStyle = kart.human ? "#3a6ea5" : "#3aa0e8";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (kart.gauge > 0.02) {
      ctx.fillStyle = "rgba(26,26,26,0.35)";
      ctx.fillRect(kart.x - 18, kart.y - 48, 36, 5);
      ctx.fillStyle = kart.gauge > 0.58 ? "#e2b43a" : "#f4f1ea";
      ctx.fillRect(kart.x - 18, kart.y - 48, 36 * kart.gauge, 5);
    }
    if (kart.item && assets.icons[kart.item]) {
      const ic = assets.icons[kart.item];
      ctx.drawImage(ic.canvas, kart.x + 16, kart.y - 58, 26, 26);
    }
    const place = order.indexOf(kart) + 1;
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "700 15px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText(String(place), kart.x, kart.y - 56);
  }
}

function drawMinimap(v) {
  const mw = 168;
  const mh = 112;
  const x = v.x + v.w - mw - 14;
  const y = v.y + v.h - mh - 14;
  ctx.fillStyle = "rgba(242,239,230,0.9)";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, mw, mh);
  ctx.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
  const minX = -HALF_W - 30;
  const maxX = HALF_W + 30;
  const minY = -HALF_H - 30;
  const maxY = HALF_H + 30;
  const sx = (mx) => x + 12 + ((mx - minX) / (maxX - minX)) * (mw - 24);
  const sy = (my) => y + 12 + ((my - minY) / (maxY - minY)) * (mh - 24);
  ctx.beginPath();
  track.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
  ctx.strokeStyle = "#6e6a63";
  ctx.lineWidth = 4;
  ctx.stroke();
  for (const kart of racers) {
    ctx.fillStyle = kart.pad === 0 ? "#3a6ea5" : kart.pad === 1 ? "#c45c26" : "#d64545";
    ctx.beginPath();
    ctx.arc(sx(kart.x), sy(kart.y), kart.human ? 3.4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBanner(v, kart) {
  if (!kart?.banner) return;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "700 28px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(kart.banner.text, v.x + v.w / 2, v.y + 78);
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`3D着色器编译失败: ${message}`);
  }
  return shader;
}

function initWebGL() {
  if (!gl) return false;
  const vs = compileShader(gl.VERTEX_SHADER, `
    attribute vec3 aPosition;
    attribute vec4 aColor;
    attribute vec2 aUv;
    uniform mat4 uMvp;
    varying vec4 vColor;
    varying vec2 vUv;
    void main() {
      gl_Position = uMvp * vec4(aPosition, 1.0);
      vColor = aColor;
      vUv = aUv;
    }
  `);
  const fs = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D uTexture;
    uniform float uUseTexture;
    varying vec4 vColor;
    varying vec2 vUv;
    void main() {
      vec4 color = vColor;
      if (uUseTexture > 0.5) color *= texture2D(uTexture, vUv);
      if (color.a < 0.08) discard;
      gl_FragColor = color;
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("3D渲染程序链接失败");
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  glState = {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    color: gl.getAttribLocation(program, "aColor"),
    uv: gl.getAttribLocation(program, "aUv"),
    mvp: gl.getUniformLocation(program, "uMvp"),
    texture: gl.getUniformLocation(program, "uTexture"),
    useTexture: gl.getUniformLocation(program, "uUseTexture"),
    buffer: gl.createBuffer(),
    textureCache: new Map(),
  };
  gl.uniform1i(glState.texture, 0);
  return true;
}

function glVertex(out, x, y, z, r, g, b, a = 1, u = 0, v = 0) {
  out.push(x, y, z, r, g, b, a, u, v);
}

function glDraw(vertices, mvp, textured = false, texture = null, mode = gl.TRIANGLES) {
  if (!vertices.length) return;
  const stride = 9 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, glState.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(glState.position, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(glState.color, 4, gl.FLOAT, false, stride, 12);
  gl.vertexAttribPointer(glState.uv, 2, gl.FLOAT, false, stride, 28);
  gl.enableVertexAttribArray(glState.position);
  gl.enableVertexAttribArray(glState.color);
  gl.enableVertexAttribArray(glState.uv);
  gl.uniformMatrix4fv(glState.mvp, false, mvp);
  gl.uniform1f(glState.useTexture, textured ? 1 : 0);
  if (textured && texture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }
  gl.drawArrays(mode, 0, vertices.length / 9);
}

function glTextureFor(frame) {
  if (!frame?.canvas) return null;
  let texture = glState.textureCache.get(frame.canvas);
  if (texture) return texture;
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Flip the source once so the standard bottom-to-top billboard UVs stay upright.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  glState.textureCache.set(frame.canvas, texture);
  return texture;
}

function glCamera(kart, viewport) {
  const fx = Math.sin(kart.heading);
  const fz = -Math.cos(kart.heading);
  const eye = [kart.x - fx * 240, 92, kart.y - fz * 240];
  const target = [kart.x + fx * 360, 15, kart.y + fz * 360];
  const projection = mat4Perspective(Math.PI / 3.2, viewport.w / viewport.h, 1, 7000);
  return mat4Multiply(projection, mat4LookAt(eye, target, [0, 1, 0]));
}

function glRoadMesh(kart) {
  const out = [];
  const addQuad = (a, b, c, d, color) => {
    for (const p of [a, b, c, a, c, d]) glVertex(out, p[0], p[1], p[2], ...color);
  };
  const step = 44;
  const far = 2400;
  const near = -350;
  for (let dist = far; dist > near; dist -= step) {
    const p0 = pointAt(kart.along + dist);
    const p1 = pointAt(kart.along + dist - step);
    const r0 = [Math.cos(p0.heading), 0, Math.sin(p0.heading)];
    const r1 = [Math.cos(p1.heading), 0, Math.sin(p1.heading)];
    const c0 = [p0.x, 0, p0.y];
    const c1 = [p1.x, 0, p1.y];
    const edge0L = [c0[0] - r0[0] * (ROAD + 24), 0.02, c0[2] - r0[2] * (ROAD + 24)];
    const edge0R = [c0[0] + r0[0] * (ROAD + 24), 0.02, c0[2] + r0[2] * (ROAD + 24)];
    const edge1L = [c1[0] - r1[0] * (ROAD + 24), 0.02, c1[2] - r1[2] * (ROAD + 24)];
    const edge1R = [c1[0] + r1[0] * (ROAD + 24), 0.02, c1[2] + r1[2] * (ROAD + 24)];
    const road0L = [c0[0] - r0[0] * ROAD, 0.04, c0[2] - r0[2] * ROAD];
    const road0R = [c0[0] + r0[0] * ROAD, 0.04, c0[2] + r0[2] * ROAD];
    const road1L = [c1[0] - r1[0] * ROAD, 0.04, c1[2] - r1[2] * ROAD];
    const road1R = [c1[0] + r1[0] * ROAD, 0.04, c1[2] + r1[2] * ROAD];
    const curb = (Math.floor(dist / step) & 1) ? [0.76, 0.19, 0.08, 1] : [0.96, 0.83, 0.62, 1];
    addQuad(edge0L, edge0R, edge1R, edge1L, curb);
    addQuad(road0L, road0R, road1R, road1L, [0.18, 0.2, 0.22, 1]);
    if (Math.floor(dist / 100) & 1) {
      const lane0L = [c0[0] - r0[0] * 3, 0.055, c0[2] - r0[2] * 3];
      const lane0R = [c0[0] + r0[0] * 3, 0.055, c0[2] + r0[2] * 3];
      const lane1L = [c1[0] - r1[0] * 3, 0.055, c1[2] - r1[2] * 3];
      const lane1R = [c1[0] + r1[0] * 3, 0.055, c1[2] + r1[2] * 3];
      addQuad(lane0L, lane0R, lane1R, lane1L, [0.88, 0.84, 0.68, 0.8]);
    }
  }
  return out;
}

function glGroundMesh() {
  const out = [];
  const c = [0.22, 0.53, 0.26, 1];
  glVertex(out, -5000, -0.05, -5000, ...c);
  glVertex(out, 5000, -0.05, -5000, ...c);
  glVertex(out, 5000, -0.05, 5000, ...c);
  glVertex(out, -5000, -0.05, -5000, ...c);
  glVertex(out, 5000, -0.05, 5000, ...c);
  glVertex(out, -5000, -0.05, 5000, ...c);
  return out;
}

function glTreeMesh() {
  const out = [];
  for (const [x, z, size] of decor) {
    const trunk = Math.max(10, size * 0.18);
    const y = 0;
    const box = (x0, y0, z0, x1, y1, z1, color) => {
      const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      const f = [[0, 1, 2, 0, 2, 3], [1, 5, 6, 1, 6, 2], [5, 4, 7, 5, 7, 6], [4, 0, 3, 4, 3, 7], [3, 2, 6, 3, 6, 7]];
      for (const face of f) for (const i of face) glVertex(out, ...p[i], ...color);
    };
    box(x - trunk, y, z - trunk, x + trunk, size * 2.4, z + trunk, [0.32, 0.18, 0.08, 1]);
    box(x - size * 0.8, size * 1.5, z - size * 0.8, x + size * 0.8, size * 3.7, z + size * 0.8, [0.08, 0.42, 0.18, 1]);
  }
  return out;
}

function glItemMesh() {
  const out = [];
  const cube = (cx, cy, cz, size, color) => {
    const h = size / 2;
    const p = [
      [cx - h, cy - h, cz - h], [cx + h, cy - h, cz - h], [cx + h, cy + h, cz - h], [cx - h, cy + h, cz - h],
      [cx - h, cy - h, cz + h], [cx + h, cy - h, cz + h], [cx + h, cy + h, cz + h], [cx - h, cy + h, cz + h],
    ];
    const faces = [[0, 1, 2, 0, 2, 3], [1, 5, 6, 1, 6, 2], [5, 4, 7, 5, 7, 6], [4, 0, 3, 4, 3, 7], [3, 2, 6, 3, 6, 7], [4, 5, 1, 4, 1, 0]];
    for (const face of faces) for (const i of face) glVertex(out, ...p[i], ...color);
  };
  for (const box of boxes) {
    if (box.cd > 0) continue;
    const bob = Math.sin(raceTime * 3 + box.bob) * 8;
    cube(box.x, 48 + bob, box.y, 44, [0.95, 0.72, 0.1, 1]);
  }
  for (const b of bananas) cube(b.x, 12, b.y, 26, [0.95, 0.82, 0.1, 1]);
  for (const b of bombs) cube(b.x, 18, b.y, 30, b.boom > 0 ? [1, 0.2, 0.04, 0.85] : [0.08, 0.08, 0.1, 1]);
  for (const s of shells) cube(s.x, 18, s.y, 26, s.kind === "red" ? [0.85, 0.12, 0.1, 1] : s.kind === "blue" ? [0.15, 0.42, 0.95, 1] : [0.1, 0.7, 0.25, 1]);
  return out;
}

function glItemSprites(cameraKart) {
  const sprites = [];
  const rx = Math.cos(cameraKart.heading);
  const rz = Math.sin(cameraKart.heading);
  const add = (x, z, y, size, frame) => {
    if (!frame) return;
    const p = [x, y, z];
    const half = size * 0.5;
    const a = [p[0] - rx * half, p[1], p[2] - rz * half];
    const b = [p[0] + rx * half, p[1], p[2] + rz * half];
    const c = [b[0], p[1] + size, b[2]];
    const d = [a[0], p[1] + size, a[2]];
    const vertices = [];
    for (const [q, u, v] of [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]]) {
      glVertex(vertices, ...q, 1, 1, 1, 1, u, v);
    }
    sprites.push({ vertices, texture: glTextureFor(frame) });
  };
  for (const box of boxes) {
    if (box.cd <= 0) add(box.x, box.y, 42 + Math.sin(raceTime * 3 + box.bob) * 8, 58, assets.icons.box);
  }
  for (const b of bananas) add(b.x, b.y, 7, 42, assets.icons.banana);
  for (const b of bombs) add(b.x, b.y, 12, 44, assets.icons.bomb);
  for (const s of shells) {
    const key = s.kind === "green" ? "greenshell" : s.kind === "red" ? "redshell" : "blueshell";
    add(s.x, s.y, 10, 42, assets.icons[key] || assets.icons.greenshell);
  }
  return sprites;
}

function glKart(kart, cameraKart, viewport, mvp, vertices, textures) {
  const fx = Math.sin(cameraKart.heading);
  const fz = -Math.cos(cameraKart.heading);
  const rx = Math.cos(cameraKart.heading);
  const rz = Math.sin(cameraKart.heading);
  const size = kart === cameraKart ? 86 : 76;
  const y = kart === cameraKart ? 7 : 5;
  const p = [kart.x, y, kart.y];
  const a = [p[0] - rx * size * 0.5, p[1], p[2] - rz * size * 0.5];
  const b = [p[0] + rx * size * 0.5, p[1], p[2] + rz * size * 0.5];
  const c = [b[0], p[1] + size * 0.82, b[2]];
  const d = [a[0], p[1] + size * 0.82, a[2]];
  const frs = framesOf(kart);
  const fr = frs?.length ? frs[Math.floor(kart.frame) % frs.length] : null;
  if (!fr) return;
  const base = vertices.length / 9;
  for (const [q, u, v] of [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]]) glVertex(vertices, ...q, 1, 1, 1, kart.stunT > 0 ? 0.55 : 1, u, v);
  textures.push({ base, count: 6, texture: glTextureFor(fr) });
}

function renderWebGL() {
  if (!gl || !glState || !racers.length) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.48, 0.73, 0.84, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const humans = racers.filter((r) => r.human);
  const views = humans.length >= 2
    ? [{ kart: humans[0], x: 0, y: 0, w: cssW / 2, h: cssH }, { kart: humans[1], x: cssW / 2, y: 0, w: cssW / 2, h: cssH }]
    : [{ kart: humans[0] || racers[0], x: 0, y: 0, w: cssW, h: cssH }];
  for (const view of views) {
    const px = Math.floor(view.x * dprScale);
    const py = Math.floor((cssH - view.y - view.h) * dprScale);
    const pw = Math.floor(view.w * dprScale);
    const ph = Math.floor(view.h * dprScale);
    gl.viewport(px, py, pw, ph);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(px, py, pw, ph);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const mvp = glCamera(view.kart, view);
    glDraw(glGroundMesh(), mvp, false);
    glDraw(glRoadMesh(view.kart), mvp, false);
    glDraw(glTreeMesh(), mvp, false);
    for (const item of glItemSprites(view.kart)) glDraw(item.vertices, mvp, true, item.texture);
    const quads = [];
    const textures = [];
    for (const r of racers) glKart(r, view.kart, view, mvp, quads, textures);
    for (const item of textures) {
      const slice = quads.slice(item.base * 9, (item.base + item.count) * 9);
      glDraw(slice, mvp, true, item.texture);
    }
  }
  gl.disable(gl.SCISSOR_TEST);
  if (views.length === 2) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(cssW * dprScale / 2) - 1, 0, 2, canvas.height);
    gl.clearColor(0.08, 0.08, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }
}

function renderClassic() {
  if (!ctx) return;
  ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#d8e4ec";
  ctx.fillRect(0, 0, cssW, cssH);
  if (!track || !racers.length) return;

  const humans = racers.filter((r) => r.human);
  const views = humans.length >= 2
    ? [
        { kart: humans[0], x: 0, y: 0, w: cssW / 2, h: cssH },
        { kart: humans[1], x: cssW / 2, y: 0, w: cssW / 2, h: cssH },
      ]
    : [{ kart: humans[0] || racers[0], x: 0, y: 0, w: cssW, h: cssH }];

  for (const v of views) {
    const worldW = v.w < cssW * 0.75 ? 860 : 1040;
    const zoom = v.w / worldW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.translate(v.x + v.w / 2, v.y + v.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-v.kart.camX, -v.kart.camY);
    drawWorld();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    drawMinimap(v);
    drawBanner(v, v.kart);
    if (phase === "countdown") {
      const label = timer > 2.6 ? "3" : timer > 1.6 ? "2" : timer > 0.6 ? "1" : "出发";
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "700 92px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText(label, v.x + v.w / 2, v.y + v.h / 2);
    } else if (phase === "race" && raceTime < 3.2 && v.kart.pad === 0) {
      ctx.fillStyle = "rgba(26,26,26,0.8)";
      ctx.font = "600 16px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText("W 加速 · A/D 转向 · S 刹车漂移 · J 道具", v.x + v.w / 2, v.y + v.h - 28);
    }
    ctx.restore();
  }

  if (views.length === 2) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cssW / 2 - 2, 0, 4, cssH);
  }
}

function perspectiveProject(x, y, v, kart, z = 0) {
  const forwardX = Math.sin(kart.heading);
  const forwardY = -Math.cos(kart.heading);
  const rightX = Math.cos(kart.heading);
  const rightY = Math.sin(kart.heading);
  const camX = kart.x - forwardX * 170;
  const camY = kart.y - forwardY * 170;
  const dx = x - camX;
  const dy = y - camY;
  const depth = dx * forwardX + dy * forwardY;
  const lateral = dx * rightX + dy * rightY;
  if (depth <= 8) return null;
  const focal = Math.max(360, Math.min(620, v.w * 0.82));
  const horizon = v.y + v.h * 0.37;
  const cameraHeight = 118;
  const scale = focal / depth;
  return {
    x: v.x + v.w * 0.5 + lateral * scale,
    y: horizon + (cameraHeight - z) * scale,
    depth,
    scale,
  };
}

function drawPerspectiveRoad(v, kart) {
  const far = 2100;
  const near = 12;
  const step = 42;
  const samples = [];
  for (let d = far; d >= near; d -= step) {
    const p = pointAt(kart.along + d);
    const rightX = Math.cos(p.heading);
    const rightY = Math.sin(p.heading);
    const c = perspectiveProject(p.x, p.y, v, kart);
    const l = perspectiveProject(p.x - rightX * (ROAD + 24), p.y - rightY * (ROAD + 24), v, kart);
    const r = perspectiveProject(p.x + rightX * (ROAD + 24), p.y + rightY * (ROAD + 24), v, kart);
    const li = perspectiveProject(p.x - rightX * ROAD, p.y - rightY * ROAD, v, kart);
    const ri = perspectiveProject(p.x + rightX * ROAD, p.y + rightY * ROAD, v, kart);
    if (c && l && r && li && ri) samples.push({ d, c, l, r, li, ri });
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const quad = (p1, p2, p3, p4, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    };
    quad(a.l, a.r, b.r, b.l, (i % 2) ? "#b94d2b" : "#d4683c");
    quad(a.li, a.ri, b.ri, b.li, (i % 2) ? "#45484b" : "#505458");
    const laneDepth = a.d % 110 < 54;
    if (laneDepth) {
      const dashW = Math.max(1.5, a.c.scale * 5);
      ctx.fillStyle = "rgba(250,245,224,0.75)";
      ctx.beginPath();
      ctx.moveTo(a.c.x - dashW, a.c.y);
      ctx.lineTo(a.c.x + dashW, a.c.y);
      ctx.lineTo(b.c.x + dashW * 0.76, b.c.y);
      ctx.lineTo(b.c.x - dashW * 0.76, b.c.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawPerspectiveObject(x, y, v, kart, draw, z = 0) {
  const p = perspectiveProject(x, y, v, kart, z);
  if (!p || p.depth > 2150) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  draw(p);
  ctx.restore();
}

function drawThirdPerson(v, kart) {
  const sky = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
  sky.addColorStop(0, "#8ec8e4");
  sky.addColorStop(0.37, "#d9edf0");
  sky.addColorStop(0.38, "#7fbf63");
  sky.addColorStop(1, "#4c9b56");
  ctx.fillStyle = sky;
  ctx.fillRect(v.x, v.y, v.w, v.h);

  const horizon = v.y + v.h * 0.37;
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.fillRect(v.x, horizon - 2, v.w, 4);
  drawPerspectiveRoad(v, kart);

  const worldObjects = [];
  for (const bush of decor) worldObjects.push({ x: bush[0], y: bush[1], kind: "tree", size: bush[2] });
  for (const box of boxes) if (box.cd <= 0) worldObjects.push({ x: box.x, y: box.y, kind: "box" });
  for (const b of bananas) worldObjects.push({ x: b.x, y: b.y, kind: "banana" });
  for (const b of bombs) worldObjects.push({ x: b.x, y: b.y, kind: "bomb", boom: b.boom });
  for (const s of shells) worldObjects.push({ x: s.x, y: s.y, kind: "shell", shell: s });
  for (const other of racers) if (other !== kart) worldObjects.push({ x: other.x, y: other.y, kind: "racer", racer: other });
  worldObjects.sort((a, b) => {
    const pa = perspectiveProject(a.x, a.y, v, kart);
    const pb = perspectiveProject(b.x, b.y, v, kart);
    return (pb?.depth || -1) - (pa?.depth || -1);
  });
  for (const obj of worldObjects) {
    drawPerspectiveObject(obj.x, obj.y, v, kart, (p) => {
      if (obj.kind === "tree") {
        const s = clamp(p.scale * obj.size * 2.2, 8, 130);
        ctx.fillStyle = "rgba(26,26,26,0.18)";
        ctx.beginPath();
        ctx.ellipse(0, 4, s * 0.55, s * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6a432e";
        ctx.fillRect(-s * 0.09, -s * 0.42, s * 0.18, s * 0.6);
        ctx.fillStyle = "#2e8248";
        ctx.strokeStyle = "#1f5f3b";
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.arc(0, -s * 0.55, s * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (obj.kind === "racer") {
        const r = obj.racer;
        const frs = framesOf(r);
        const fr = frs && frs.length ? frs[Math.floor(r.frame) % frs.length] : null;
        if (!fr) return;
        const size = clamp(p.scale * 76, 22, 128);
        ctx.globalAlpha = r.stunT > 0 ? 0.66 : 1;
        ctx.fillStyle = "rgba(26,26,26,0.2)";
        ctx.beginPath();
        ctx.ellipse(0, 5, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(fr.canvas, -size * 0.5, -size * 0.58, size, size * (fr.h / fr.w) * 0.72);
        ctx.globalAlpha = 1;
      } else if (obj.kind === "box") {
        const icon = assets.icons.box;
        const size = clamp(p.scale * 54, 14, 72);
        if (icon) ctx.drawImage(icon.canvas, -size / 2, -size / 2, size, size);
      } else if (obj.kind === "banana") {
        const icon = assets.icons.banana;
        const size = clamp(p.scale * 42, 10, 56);
        if (icon) ctx.drawImage(icon.canvas, -size / 2, -size / 2, size, size);
      } else if (obj.kind === "bomb") {
        const size = clamp(p.scale * 44, 10, 58);
        if (obj.boom > 0) {
          ctx.fillStyle = `rgba(255,150,60,${obj.boom / 0.28})`;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (assets.icons.bomb) ctx.drawImage(assets.icons.bomb.canvas, -size / 2, -size / 2, size, size);
      } else if (obj.kind === "shell") {
        const key = obj.shell.kind === "green" ? "greenshell" : obj.shell.kind === "red" ? "redshell" : "blueshell";
        const icon = assets.icons[key] || assets.icons.greenshell;
        const size = clamp(p.scale * 42, 10, 58);
        if (icon) ctx.drawImage(icon.canvas, -size / 2, -size / 2, size, size);
      }
    });
  }

  // Keep the player's kart in the lower foreground so the camera reads as third-person.
  const playerFrames = framesOf(kart);
  const playerFrame = playerFrames?.length ? playerFrames[Math.floor(kart.frame) % playerFrames.length] : null;
  if (playerFrame) {
    const size = clamp(v.w * 0.2, 78, 142);
    ctx.save();
    ctx.translate(v.x + v.w * 0.5, v.y + v.h * 0.79);
    ctx.fillStyle = "rgba(26,26,26,0.27)";
    ctx.beginPath();
    ctx.ellipse(0, size * 0.25, size * 0.42, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(playerFrame.canvas, -size / 2, -size * 0.62, size, size * (playerFrame.h / playerFrame.w) * 0.72);
    ctx.restore();
  }
  drawMinimap(v);
  drawBanner(v, kart);
  if (phase === "countdown") {
    const label = timer > 2.6 ? "3" : timer > 1.6 ? "2" : timer > 0.6 ? "1" : "出发";
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "700 92px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText(label, v.x + v.w / 2, v.y + v.h / 2);
  } else if (phase === "race" && raceTime < 3.2 && kart.pad === 0) {
    ctx.fillStyle = "rgba(26,26,26,0.8)";
    ctx.font = "600 16px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("W 加速 · A/D 转向 · S 刹车漂移 · J 道具", v.x + v.w / 2, v.y + v.h - 28);
  }
}

function render() {
  if (classicMode) {
    renderClassic();
    return;
  }
  if (gl && glState) {
    renderWebGL();
    return;
  }
  if (!ctx) return;
  ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#d8e4ec";
  ctx.fillRect(0, 0, cssW, cssH);
  if (!track || !racers.length) return;

  const humans = racers.filter((r) => r.human);
  const views = humans.length >= 2
    ? [
        { kart: humans[0], x: 0, y: 0, w: cssW / 2, h: cssH },
        { kart: humans[1], x: cssW / 2, y: 0, w: cssW / 2, h: cssH },
      ]
    : [{ kart: humans[0] || racers[0], x: 0, y: 0, w: cssW, h: cssH }];

  for (const v of views) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    drawThirdPerson(v, v.kart);
    ctx.restore();
  }

  if (views.length === 2) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cssW / 2 - 2, 0, 4, cssH);
  }
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.034, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  raf = requestAnimationFrame(loop);
}

function resize() {
  dprScale = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dprScale);
  canvas.height = Math.floor(cssH * dprScale);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
}

function onKeyDown(e) {
  if (e.repeat) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    return;
  }
  held.add(e.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (phase === "lobby") {
    let changed = false;
    if (!roleLocked[0] && (e.code === "KeyW" || e.code === "KeyS" || e.code === "KeyA" || e.code === "KeyD")) {
      selectedSkins[0] = selectedSkins[0] === "miko" ? "bun" : "miko";
      changed = true;
    }
    if (want2p && !roleLocked[1] && (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      selectedSkins[1] = selectedSkins[1] === "miko" ? "bun" : "miko";
      changed = true;
    }
    if (e.code === "Space" || e.code === "Enter") {
      roleLocked[0] = !roleLocked[0];
      changed = true;
    }
    if (want2p && (e.code === "ShiftLeft" || e.code === "ShiftRight")) {
      roleLocked[1] = !roleLocked[1];
      changed = true;
    }
    if (changed) {
      spawnRacers();
      syncRoleSelect();
      syncLobby();
      maybeStartFromSelection();
    }
  }
  if (phase !== "race") return;
  if (e.code === "KeyJ" || e.code === "Space") {
    const p1 = racers.find((r) => r.human && r.pad === 0);
    if (p1) useItem(p1);
  }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    const p2 = racers.find((r) => r.human && r.pad === 1);
    if (p2) useItem(p2);
  }
}

function onKeyUp(e) {
  held.delete(e.code);
}

function toggle2p() {
  want2p = !want2p;
  roleLocked[1] = false;
  syncLobby();
  if (phase === "lobby") spawnRacers();
}

export function stopKart() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  held.clear();
  while (cleanups.length) cleanups.pop()();
  gl = null;
  glState = null;
  classicMode = false;
  ctx = null;
}

async function startKartInternal({ canvas: c, els: e, use3d }) {
  stopKart();
  canvas = c;
  classicMode = !use3d;
  if (use3d) {
    gl = canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: false });
    if (gl) initWebGL();
    else ctx = canvas.getContext("2d");
  } else {
    ctx = canvas.getContext("2d");
  }
  els = e;
  running = true;
  want2p = false;
  held.clear();
  resize();
  await ensureAssets();
  renderRoleOptions();
  buildTrack();
  on(window, "resize", resize);
  on(window, "keydown", onKeyDown);
  on(window, "keyup", onKeyUp);
  on(els.btnStart, "click", () => beginRace(true));
  on(els.btnRestart, "click", () => beginRace(true));
  on(els.btnJoin, "click", toggle2p);
  on(els.roleSelect, "click", chooseRole);
  showLobby();
  lastTs = performance.now();
  raf = requestAnimationFrame(loop);
}

export async function startKart(opts) {
  return startKartInternal({ ...opts, use3d: true });
}

export async function startKartClassic(opts) {
  return startKartInternal({ ...opts, use3d: false });
}
