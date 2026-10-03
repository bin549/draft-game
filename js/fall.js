const SPRITE_P1 = "assets/player/thief/ready/thief_p1.png";
const SPRITE_P2 = "assets/player/thief/ready/thief_p2.png";

const SHAFT_W = 520;
const FLOOR_H = 158;
const FLOORS = 100;
const BODY_HALF = 16;
const LIVES = 5;

let canvas = null;
let ctx = null;
let els = null;
let running = false;
let raf = 0;
let lastTs = 0;
let dprScale = 1;
let cssW = 800;
let cssH = 600;
const cleanups = [];
const held = new Set();

let imgP1 = null;
let imgP2 = null;
let assetsP = null;
let floors = [];
let racers = [];
let want2p = false;
let phase = "lobby";
let timer = 0;
let worldT = 0;
let rankSeq = 0;
let seed = 1;

function on(target, type, fn) {
  if (!target) return;
  target.addEventListener(type, fn);
  cleanups.push(() => target.removeEventListener(type, fn));
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("下落角色加载失败"));
    img.src = src;
  });
}

function cropAlpha(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width;
  let minY = c.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) return img;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d").drawImage(c, minX, minY, w, h, 0, 0, w, h);
  return out;
}

async function ensureAssets() {
  if (imgP1 && imgP2) return;
  if (!assetsP) {
    assetsP = Promise.all([loadImage(SPRITE_P1), loadImage(SPRITE_P2)])
      .then(([a, b]) => {
        imgP1 = cropAlpha(a);
        imgP2 = cropAlpha(b);
      })
      .catch((err) => {
        assetsP = null;
        throw err;
      });
  }
  return assetsP;
}

function placeGaps(count, gapW) {
  const gaps = [];
  const left = 78;
  const right = SHAFT_W - 78 - gapW;
  for (let g = 0; g < count; g++) {
    let x = left + rand() * Math.max(8, right - left);
    let guard = 0;
    while (guard++ < 8 && gaps.some((o) => Math.abs(o.x - x) < gapW + 56)) {
      x = left + rand() * Math.max(8, right - left);
    }
    gaps.push({ x, w: gapW });
  }
  gaps.sort((a, b) => a.x - b.x);
  return gaps;
}

function segsFromGaps(gaps, kind) {
  const segs = [];
  let cursor = 12;
  const right = SHAFT_W - 12;
  for (const gap of gaps) {
    const gx = clamp(gap.x, cursor, right);
    if (gx - cursor >= 30) {
      segs.push({ x: cursor, w: gx - cursor, kind, t: 0, gone: false, drop: 0 });
    }
    cursor = Math.min(right, gx + gap.w);
  }
  if (right - cursor >= 30) {
    segs.push({ x: cursor, w: right - cursor, kind, t: 0, gone: false, drop: 0 });
  }
  return segs;
}

function buildFloors() {
  seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0 || 1;
  floors = [];
  for (let i = 0; i <= FLOORS; i++) {
    const y = 96 + i * FLOOR_H;
    if (i === FLOORS) {
      floors.push({
        index: i,
        y,
        kind: "goal",
        phase: 0,
        gaps: [],
        segs: [{ x: 12, w: SHAFT_W - 24, kind: "goal", t: 0, gone: false, drop: 0 }],
      });
      continue;
    }
    let kind = "solid";
    const roll = rand();
    if (i > 2) {
      if (roll < 0.1) kind = "spike";
      else if (roll < 0.2) kind = "crumble";
      else if (roll < 0.3) kind = "spring";
      else if (roll < 0.42) kind = "move";
    }
    const gapW = clamp(112 - i * 0.28, 74, 120);
    let gaps;
    if (i === 0) gaps = [{ x: SHAFT_W * 0.62, w: 108 }];
    else gaps = placeGaps(i < 6 ? 1 : rand() < 0.42 ? 2 : 1, gapW);
    let segs = segsFromGaps(gaps, kind);
    if (!segs.length) {
      gaps = [{ x: SHAFT_W * 0.4, w: gapW }];
      segs = segsFromGaps(gaps, kind);
    }
    floors.push({ index: i, y, kind, phase: rand() * Math.PI * 2, gaps, segs });
  }
}

function moveOffset(floor) {
  if (!floor || floor.kind !== "move") return 0;
  return Math.sin(worldT * 1.55 + floor.phase) * 72;
}

function segBox(floor, seg) {
  return {
    x: seg.x + moveOffset(floor) + (seg.gone ? 0 : 0),
    y: floor.y + (seg.drop || 0),
    w: seg.w,
    h: 16,
  };
}

function makeRacer(opts) {
  const floor = floors[0];
  return {
    name: opts.name,
    human: opts.human,
    cpu: !opts.human,
    pad: opts.pad,
    sprite: opts.pad === 1 ? imgP2 : imgP1,
    x: opts.x,
    y: floor.y,
    vx: 0,
    vy: 0,
    face: 1,
    lives: LIVES,
    depth: 0,
    onGround: true,
    ride: floor.segs[0],
    rideFloor: floor,
    rideOff: 0,
    hurtT: 0,
    dead: false,
    finished: false,
    rank: 0,
    think: 0,
    maxSpd: opts.human ? 300 : 232,
  };
}

function buildRun() {
  buildFloors();
  rankSeq = 0;
  worldT = 0;
  const roster = [{ name: "麻袋", human: true, pad: 0, x: 96 }];
  if (want2p) roster.push({ name: "白帽", human: true, pad: 1, x: 168 });
  else roster.push({ name: "白帽", human: false, pad: 1, x: 168 });
  racers = roster.map(makeRacer);
}

function nearestGap(floor, x) {
  if (!floor || !floor.gaps.length) return null;
  let best = floor.gaps[0];
  let bestD = 1e9;
  for (const gap of floor.gaps) {
    const d = Math.abs(gap.x + gap.w / 2 - x);
    if (d < bestD) {
      bestD = d;
      best = gap;
    }
  }
  return best;
}

function dirTo(x, tx) {
  if (Math.abs(tx - x) < 8) return 0;
  return tx > x ? 1 : -1;
}

function cpuDir(p) {
  if (p.think > 0) return 0;
  const next = floors[Math.min(FLOORS, (p.rideFloor ? p.rideFloor.index : p.depth) + 1)];
  if (p.onGround && p.rideFloor) {
    if (next && next.gaps.length) {
      const hole = nearestGap(next, p.x);
      const tx = hole.x + hole.w / 2;
      const cur = nearestGap(p.rideFloor, p.x);
      if (cur && Math.abs(p.x - tx) < 16) return dirTo(p.x, cur.x + cur.w / 2);
      return dirTo(p.x, tx);
    }
    const cur = nearestGap(p.rideFloor, p.x);
    if (cur) return dirTo(p.x, cur.x + cur.w / 2);
    return 0;
  }
  const upcoming = floors.find((f) => f.y > p.y + 6);
  if (!upcoming) return 0;
  if (!upcoming.gaps.length) return dirTo(p.x, SHAFT_W / 2);
  const hole = nearestGap(upcoming, p.x);
  return dirTo(p.x, hole.x + hole.w / 2);
}

function readDir(p) {
  if (p.pad === 0) return (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
  return (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
}

function hurt(p) {
  if (p.hurtT > 0 || p.dead || p.finished) return;
  p.lives -= 1;
  p.hurtT = 1.15;
  p.onGround = false;
  p.ride = null;
  p.vy = -320;
  p.y = Math.max(floors[0].y, p.y - FLOOR_H * 2);
  if (p.lives <= 0) {
    p.dead = true;
    p.vy = 180;
  }
}

function findLanding(p, prevY) {
  let best = null;
  for (const floor of floors) {
    if (floor.y < prevY - 2 || floor.y > p.y + 1) continue;
    for (const seg of floor.segs) {
      if (seg.gone) continue;
      const box = segBox(floor, seg);
      if (prevY > box.y + 0.5 || p.y < box.y) continue;
      if (p.x + BODY_HALF <= box.x || p.x - BODY_HALF >= box.x + box.w) continue;
      if (!best || box.y < best.box.y) best = { floor, seg, box };
    }
  }
  return best;
}

function applyLanding(p, hit) {
  const kind = hit.seg.kind;
  if (kind === "spike") {
    if (p.hurtT > 0) {
      p.y = hit.box.y;
      p.vy = -180;
      return;
    }
    hurt(p);
    return;
  }
  if (kind === "spring") {
    p.y = hit.box.y;
    p.vy = -880;
    p.onGround = false;
    p.ride = null;
    return;
  }
  p.y = hit.box.y;
  p.vy = 0;
  p.onGround = true;
  p.ride = hit.seg;
  p.rideFloor = hit.floor;
  p.rideOff = moveOffset(hit.floor);
}

function updateRacer(p, dt) {
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.think > 0) p.think -= dt;
  if (p.finished) return;
  if (phase !== "play") return;

  const dir = p.dead ? 0 : p.cpu ? cpuDir(p) : readDir(p);
  if (dir) p.face = dir;
  if (dir && !p.dead) p.vx = clamp(p.vx + dir * 2400 * dt, -p.maxSpd, p.maxSpd);
  else p.vx *= Math.max(0, 1 - dt * (p.onGround ? 14 : 2.2));

  if (!p.dead && p.onGround && p.ride && !p.ride.gone) {
    const floor = p.rideFloor;
    const off = moveOffset(floor);
    p.x += off - (p.rideOff || 0);
    p.rideOff = off;
    p.x += p.vx * dt;
    p.x = clamp(p.x, 24, SHAFT_W - 24);
    const box = segBox(floor, p.ride);
    if (p.x + BODY_HALF <= box.x || p.x - BODY_HALF >= box.x + box.w) {
      p.onGround = false;
      p.ride = null;
    } else {
      p.y = box.y;
      p.vy = 0;
      if (p.ride.kind === "crumble") {
        p.ride.t += dt;
        if (p.ride.t > 0.4) {
          p.ride.gone = true;
          p.onGround = false;
          p.ride = null;
        }
      }
    }
    let depth = 0;
    for (const f of floors) if (p.y >= f.y - 2) depth = f.index;
    p.depth = depth;
    if (depth >= FLOORS) {
      p.finished = true;
      p.rank = ++rankSeq;
    }
    return;
  }

  p.onGround = false;
  p.ride = null;
  if (!p.dead) p.vy = Math.min(760, p.vy + 1780 * dt);
  const prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, 24, SHAFT_W - 24);
  if (!p.dead && p.vy >= 0) {
    const hit = findLanding(p, prevY);
    if (hit) applyLanding(p, hit);
  }
  let depth = 0;
  for (const f of floors) if (p.y >= f.y - 2) depth = f.index;
  p.depth = depth;
  if (!p.dead && depth >= FLOORS) {
    p.finished = true;
    p.rank = ++rankSeq;
  }
}

function separateRacers() {
  const a = racers[0];
  const b = racers[1];
  if (!a || !b || a.dead || b.dead) return;
  const dx = b.x - a.x;
  if (Math.abs(dx) >= 30 || Math.abs(b.y - a.y) >= 70) return;
  const push = (30 - Math.abs(dx)) * 0.5;
  const s = dx === 0 ? 1 : Math.sign(dx);
  a.x -= s * push;
  b.x += s * push;
  a.x = clamp(a.x, 24, SHAFT_W - 24);
  b.x = clamp(b.x, 24, SHAFT_W - 24);
}

function maybeEnd() {
  const humans = racers.filter((r) => r.human);
  if (racers.some((r) => r.finished) || humans.every((r) => r.dead)) endGame();
}

function endGame() {
  phase = "finish";
  const humans = racers.filter((r) => r.human);
  const winner = racers.filter((r) => r.finished).sort((a, b) => a.rank - b.rank)[0];
  if (els.endTitle) {
    if (winner && winner.human) els.endTitle.textContent = humans.length > 1 ? `${winner.name}先到底！` : "下到第一百层！";
    else if (winner) els.endTitle.textContent = "白帽先到底了";
    else els.endTitle.textContent = "生命耗尽";
  }
  if (els.resultText) {
    els.resultText.innerHTML = racers
      .map((r) => `${r.name}　${r.dead ? "出局" : r.finished ? "到底" : `第 ${r.depth} 层`}　❤${Math.max(0, r.lives)}`)
      .join("<br>");
  }
  els.gameover?.classList.remove("hidden");
}

function update(dt) {
  if (phase === "countdown") {
    timer -= dt;
    if (timer <= 0) phase = "play";
  } else if (phase === "play") {
    worldT += dt;
    for (const seg of floors) {
      for (const s of seg.segs) if (s.gone) s.drop += dt * 320;
    }
    for (const r of racers) updateRacer(r, dt);
    separateRacers();
    maybeEnd();
  }
  syncHud();
}

function syncHud() {
  const p1 = racers.find((r) => r.human && r.pad === 0);
  const other = racers.find((r) => r !== p1);
  if (!p1 || !els.floorText) return;
  els.floorText.textContent = `${p1.depth}/100`;
  if (want2p && other) els.lifeText.textContent = `P1 ❤${Math.max(0, p1.lives)}  P2 ❤${Math.max(0, other.lives)}`;
  else els.lifeText.textContent = `${Math.max(0, p1.lives)}`;
  if (els.rivalText) {
    if (!other) els.rivalText.textContent = "";
    else if (other.finished) els.rivalText.textContent = `${other.name} 到底`;
    else els.rivalText.textContent = `${other.name} ${other.depth}/100`;
  }
}

function syncLobby() {
  if (els.btnJoin) {
    els.btnJoin.classList.toggle("active", want2p);
    els.btnJoin.textContent = want2p ? "取消 2P" : "加入 2P";
  }
  if (els.overlaySub) {
    els.overlaySub.textContent = want2p
      ? "麻袋对白帽，同井竞速。先落到第一百层的人获胜。"
      : "你是麻袋小偷，白帽在后面追。左右走到缺口就会下落。";
  }
}

function showLobby() {
  phase = "lobby";
  buildRun();
  els.overlay?.classList.remove("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.add("hidden");
  syncLobby();
}

function beginRun() {
  buildRun();
  phase = "countdown";
  timer = 3.4;
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.hud?.classList.remove("hidden");
  syncHud();
}

function drawPlank(floor, seg) {
  const box = segBox(floor, seg);
  if (seg.drop > 420) return;
  const shake = seg.kind === "crumble" && seg.t > 0.12 ? Math.sin(seg.t * 40) * 1.5 : 0;
  ctx.save();
  ctx.translate(shake, 0);
  if (seg.kind === "goal") ctx.fillStyle = "#e2b43a";
  else if (seg.kind === "spike") ctx.fillStyle = "#a33d3d";
  else if (seg.kind === "spring") ctx.fillStyle = "#d06a3a";
  else if (seg.kind === "crumble") ctx.fillStyle = seg.t > 0.2 ? "#a88858" : "#c4a06a";
  else ctx.fillStyle = "#c9a56e";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  ctx.strokeStyle = "rgba(26,26,26,0.28)";
  ctx.beginPath();
  ctx.moveTo(box.x + 4, box.y + 5);
  ctx.lineTo(box.x + box.w - 4, box.y + 5);
  ctx.stroke();
  if (seg.kind === "spike") {
    ctx.fillStyle = "#f4f1ea";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = box.x + 6; x < box.x + box.w - 10; x += 16) {
      ctx.moveTo(x, box.y);
      ctx.lineTo(x + 7, box.y - 14);
      ctx.lineTo(x + 14, box.y);
    }
    ctx.fill();
    ctx.stroke();
  } else if (seg.kind === "spring") {
    const cx = box.x + box.w / 2;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(cx - 8, box.y - 4 - i * 6);
      ctx.lineTo(cx + 8, box.y - 8 - i * 6);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawActor(p) {
  if (p.hurtT > 0 && Math.floor(p.hurtT * 14) % 2 === 0) return;
  const img = p.sprite;
  if (!img) return;
  const dh = 108;
  const dw = dh * (img.width / img.height);
  ctx.save();
  ctx.translate(p.x, p.y + 2);
  ctx.fillStyle = "rgba(26,26,26,0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.face < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh + 4, dw, dh);
  ctx.restore();
}

function drawShaft(top, bottom) {
  ctx.fillStyle = "#efe4cf";
  ctx.fillRect(0, top, SHAFT_W, bottom - top);
  ctx.fillStyle = "#c46a52";
  ctx.fillRect(-32, top, 32, bottom - top);
  ctx.fillRect(SHAFT_W, top, 32, bottom - top);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.strokeRect(-32.5, top, 33, bottom - top);
  ctx.strokeRect(SHAFT_W - 0.5, top, 33, bottom - top);
  ctx.strokeStyle = "rgba(26,26,26,0.35)";
  ctx.lineWidth = 1;
  const y0 = Math.floor(top / 22) * 22;
  for (let y = y0; y < bottom; y += 22) {
    const shift = (Math.floor(y / 22) % 2) * 10;
    ctx.beginPath();
    ctx.moveTo(-32, y);
    ctx.lineTo(0, y);
    ctx.moveTo(SHAFT_W, y);
    ctx.lineTo(SHAFT_W + 32, y);
    ctx.moveTo(-32 + shift, y);
    ctx.lineTo(-32 + shift, y + 22);
    ctx.moveTo(SHAFT_W + shift, y);
    ctx.lineTo(SHAFT_W + shift, y + 22);
    ctx.stroke();
  }
}

function drawWorld(camTop, camBottom) {
  drawShaft(camTop - 40, camBottom + 40);
  for (const floor of floors) {
    if (floor.y < camTop - 80 || floor.y > camBottom + 40) continue;
    for (const seg of floor.segs) drawPlank(floor, seg);
    if (floor.index > 0 && floor.index < FLOORS) {
      ctx.fillStyle = "rgba(26,26,26,0.55)";
      ctx.font = "600 13px Songti SC, serif";
      ctx.textAlign = "left";
      ctx.fillText(String(floor.index), 18, floor.y - 8);
    }
    if (floor.index === FLOORS) {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "700 18px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText("第一百层", SHAFT_W / 2, floor.y - 16);
    }
  }
  const list = racers.slice().sort((a, b) => a.y - b.y);
  for (const r of list) {
    if (r.y < camTop - 140 || r.y > camBottom + 40) continue;
    drawActor(r);
  }
}

function render() {
  ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#d8e4ec";
  ctx.fillRect(0, 0, cssW, cssH);
  if (!floors.length || !racers.length) return;

  const humans = racers.filter((r) => r.human);
  const views = humans.length >= 2
    ? [
        { p: humans[0], x: 0, w: cssW / 2 },
        { p: humans[1], x: cssW / 2, w: cssW / 2 },
      ]
    : [{ p: humans[0] || racers[0], x: 0, w: cssW }];

  for (const v of views) {
    const focusY = v.p.y - cssH * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, 0, v.w, cssH);
    ctx.clip();
    ctx.translate(v.x + (v.w - SHAFT_W) / 2, -focusY);
    drawWorld(focusY, focusY + cssH);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, 0, v.w, cssH);
    ctx.clip();
    if (phase === "countdown") {
      const label = timer > 2.5 ? "3" : timer > 1.6 ? "2" : timer > 0.7 ? "1" : "下落";
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "700 84px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText(label, v.x + v.w / 2, cssH * 0.42);
    } else if (phase === "play" && worldT < 3.2 && v.p.pad === 0) {
      ctx.fillStyle = "rgba(26,26,26,0.82)";
      ctx.font = "600 16px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText("A / D 左右走 · 走到缺口就会下落", v.x + v.w / 2, cssH - 28);
    }
    if (v.p.depth > 0 && v.p.depth % 10 === 0 && v.p.onGround) {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "700 26px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText(`第 ${v.p.depth} 层`, v.x + v.w / 2, 72);
    }
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
    if (e.code.startsWith("Arrow")) e.preventDefault();
    return;
  }
  held.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault();
}

function onKeyUp(e) {
  held.delete(e.code);
}

function toggle2p() {
  want2p = !want2p;
  syncLobby();
  if (phase === "lobby") buildRun();
}

export function stopFall() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  held.clear();
  while (cleanups.length) cleanups.pop()();
}

export async function startFall({ canvas: c, els: e }) {
  stopFall();
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  want2p = false;
  held.clear();
  resize();
  await ensureAssets();
  on(window, "resize", resize);
  on(window, "keydown", onKeyDown);
  on(window, "keyup", onKeyUp);
  on(els.btnStart, "click", beginRun);
  on(els.btnRestart, "click", beginRun);
  on(els.btnJoin, "click", toggle2p);
  showLobby();
  lastTs = performance.now();
  raf = requestAnimationFrame(loop);
}
