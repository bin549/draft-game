import {
  drawHouse,
  drawSprout,
  drawTornado,
  drawSlash,
} from "./draw.js";
import { CHARACTERS, drawCharacter, drawWeaponProjectile } from "./characters.js";
import {
  loadMonsters,
  makeMonsterStats,
  drawMonster,
  monsterParticleColor,
  MONSTER_IDS,
} from "./monsters.js";

const TOWER_TYPES = Object.fromEntries(
  CHARACTERS.map((c) => [
    c.id,
    {
      id: c.id,
      name: c.name,
      cost: c.tower.cost,
      range: c.tower.range,
      damage: c.tower.damage,
      cooldown: c.tower.cooldown,
      style: c.tower.style,
      color: c.color,
    },
  ])
);

const TOWER_ORDER = ["swordsman", "mage", "knight", "archer"];

/** 波次：逐步解锁全部编号怪物，难度递增；轮转保证每种都会出现 */
const WAVES = [
  {
    count: 8,
    interval: 0.95,
    types: ["nine-tail-fox-1", "eyeball-1"],
    stage: 1,
  },
  {
    count: 10,
    interval: 0.8,
    types: ["nine-tail-fox-1", "eyeball-1", "nine-tail-fox-2", "thief-1"],
    stage: 2,
  },
  {
    count: 12,
    interval: 0.7,
    types: ["eyeball-2", "tiger-1", "thief-1", "nine-tail-fox-2"],
    stage: 2,
  },
  {
    count: 14,
    interval: 0.58,
    types: ["tiger-1", "eyeball-3", "official-1", "tiger-2"],
    stage: 3,
  },
  {
    count: 16,
    interval: 0.5,
    types: ["official-1", "boat-man-1", "tiger-2", "eyeball-3", "nine-tail-fox-2"],
    stage: 3,
  },
  { count: 18, interval: 0.45, types: [...MONSTER_IDS], stage: 4 },
  { count: 20, interval: 0.4, types: [...MONSTER_IDS], stage: 4 },
  { count: 22, interval: 0.35, types: [...MONSTER_IDS], stage: 5 },
  { count: 26, interval: 0.3, types: [...MONSTER_IDS], stage: 5 },
  { count: 30, interval: 0.26, types: [...MONSTER_IDS], stage: 6 },
];

let canvas, ctx;
let els = {};
let state = null;
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let mouse = { x: 0, y: 0 };
let selectedTower = "archer";

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
  if (state) layoutWorld();
}

/** 逻辑坐标世界，按视口等比适配 */
function layoutWorld() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const baseW = 960;
  const baseH = 560;
  const scale = Math.min(viewW / baseW, viewH / baseH) * 0.92;
  const w = baseW * scale;
  const h = baseH * scale;
  state.world = {
    scale,
    w,
    h,
    ox: (viewW - w) / 2,
    oy: (viewH - h) / 2 + 18,
  };
  rebuildGeometry();
}

function rebuildGeometry() {
  const { scale, ox, oy } = state.world;
  const S = (n) => n * scale;
  const P = (x, y) => ({ x: ox + S(x), y: oy + S(y) });

  // 蜿蜒路径（逻辑 960×560）
  const pathLogic = [
    [40, 280],
    [220, 280],
    [220, 120],
    [420, 120],
    [420, 400],
    [640, 400],
    [640, 180],
    [820, 180],
    [820, 320],
    [920, 320],
  ];
  state.path = pathLogic.map(([x, y]) => P(x, y));
  state.pathWidth = S(52);

  // 可建造点（避开路径）
  const slotsLogic = [
    [120, 200],
    [120, 360],
    [300, 200],
    [300, 80],
    [300, 320],
    [520, 200],
    [520, 320],
    [520, 460],
    [740, 280],
    [740, 100],
    [740, 400],
    [860, 240],
    [860, 400],
    [160, 80],
    [560, 80],
  ];
  state.slots = slotsLogic.map(([x, y], i) => ({
    id: i,
    ...P(x, y),
    occupied: null,
  }));

  // 基地旁村落 + 路边草苗
  const decorLogic = [
    [880, 280],
    [900, 350],
    [860, 360],
    [910, 300],
    [870, 250],
    [50, 240],
    [70, 320],
    [400, 90],
    [450, 150],
    [600, 360],
    [680, 440],
  ];
  state.decor = [];
  for (let i = 0; i < decorLogic.length; i++) {
    const [lx, ly] = decorLogic[i];
    const p = P(lx, ly);
    state.decor.push({
      kind: "house",
      x: p.x,
      y: p.y,
      scale: (0.7 + (i % 3) * 0.12) * scale,
      variant: i,
    });
  }
  for (let i = 0; i < 28; i++) {
    const lx = 40 + (i * 97) % 880;
    const ly = 80 + ((i * 53) % 420);
    const p = P(lx, ly);
    state.decor.push({
      kind: "sprout",
      x: p.x,
      y: p.y,
      scale: (0.55 + (i % 4) * 0.12) * scale,
      variant: i % 4,
    });
  }

  // 同步已有塔的位置与射程
  for (const t of state.towers) {
    const slot = state.slots.find((s) => s.id === t.slotId);
    if (slot) {
      t.x = slot.x;
      t.y = slot.y;
      slot.occupied = t;
    }
    const def = TOWER_TYPES[t.type];
    if (def) {
      t.range = def.range * scale;
      t.style = def.style;
      t.damage = def.damage;
      t.cooldown = def.cooldown;
    }
  }
}

function pathLength() {
  let len = 0;
  for (let i = 1; i < state.path.length; i++) {
    const a = state.path[i - 1];
    const b = state.path[i];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function pointOnPath(dist) {
  let remain = dist;
  for (let i = 1; i < state.path.length; i++) {
    const a = state.path[i - 1];
    const b = state.path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remain <= seg) {
      const t = remain / seg;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remain -= seg;
  }
  const last = state.path[state.path.length - 1];
  return { x: last.x, y: last.y, angle: 0, done: true };
}

function createState() {
  return {
    world: null,
    path: [],
    pathWidth: 48,
    slots: [],
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    attackFx: [],
    decor: [],
    gold: 180,
    lives: 20,
    wave: 0,
    waveSpawning: false,
    spawnLeft: 0,
    spawnTimer: 0,
    spawnInterval: 0.8,
    spawnTypes: ["nine-tail-fox-1"],
    kills: 0,
    time: 0,
    pendingNext: true,
    won: false,
    hoverSlot: null,
  };
}

function paintTowerCards() {
  for (const id of TOWER_ORDER) {
    const host = document.getElementById(`tower-preview-${id}`);
    if (!host) continue;
    let c = host.querySelector("canvas");
    if (!c) {
      c = document.createElement("canvas");
      host.appendChild(c);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth || 100;
    const h = host.clientHeight || 78;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#e8e0d2";
    g.fillRect(0, 0, w, h);
    drawCharacter(g, id, w / 2, h * 0.72, 1, 0.35);
  }
}

function updateHud() {
  if (!state) return;
  els.goldText.textContent = `${state.gold}`;
  els.livesText.textContent = `${state.lives}`;
  els.waveText.textContent = `波次 ${Math.min(state.wave, WAVES.length)}/${WAVES.length}`;
  els.killText.textContent = `击杀 ${state.kills}`;

  for (const id of TOWER_ORDER) {
    const btn = els.towerBtns?.[id];
    if (!btn) continue;
    const def = TOWER_TYPES[id];
    btn.classList.toggle("active", selectedTower === id);
    btn.classList.toggle("unaffordable", state.gold < def.cost);
    const costEl = btn.querySelector("[data-cost]");
    if (costEl) costEl.textContent = `${def.cost}金`;
  }

  const canWave =
    running &&
    state.pendingNext &&
    !state.waveSpawning &&
    state.enemies.length === 0 &&
    state.wave < WAVES.length;
  els.btnWave.disabled = !canWave;
  els.btnWave.textContent =
    state.wave >= WAVES.length ? "已结束" : `开始第 ${state.wave + 1} 波`;
}

function addParticle(x, y, color, count = 5, speed = 70) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * 0.5 + Math.random() * speed;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.3,
      color,
      size: 2.8 + Math.random() * 3.2,
    });
  }
}

function pushFx(fx) {
  state.attackFx.push(fx);
}

function makeEnemy(type) {
  const waveStage = WAVES[Math.max(0, state.wave - 1)]?.stage || state.wave || 1;
  const stats = makeMonsterStats(type, waveStage);
  return {
    ...stats,
    dist: 0,
    x: state.path[0].x,
    y: state.path[0].y,
    facing: 1,
  };
}

function startWave() {
  if (!state.pendingNext || state.wave >= WAVES.length) return;
  if (state.waveSpawning || state.enemies.length > 0) return;
  const def = WAVES[state.wave];
  state.wave += 1;
  state.waveSpawning = true;
  state.spawnLeft = def.count;
  state.spawnInterval = def.interval;
  state.spawnTimer = 0.15;
  state.spawnTypes = def.types;
  state.spawnIndex = 0;
  state.pendingNext = false;
  updateHud();
}

function findSlotAt(mx, my) {
  let best = null;
  let bestD = 28 * (state.world?.scale || 1);
  for (const s of state.slots) {
    const d = Math.hypot(mx - s.x, my - s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function placeTower(slot) {
  if (slot.occupied) return;
  const def = TOWER_TYPES[selectedTower];
  if (state.gold < def.cost) return;
  state.gold -= def.cost;
  const tower = {
    slotId: slot.id,
    type: def.id,
    style: def.style,
    x: slot.x,
    y: slot.y,
    range: def.range * state.world.scale,
    damage: def.damage,
    cooldown: def.cooldown,
    timer: 0,
    facing: 1,
    anim: 0,
    swing: 0,
  };
  slot.occupied = tower;
  state.towers.push(tower);
  updateHud();
}

function nearestEnemyInRange(tower) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - tower.x, e.y - tower.y);
    if (d <= tower.range && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function endGame(won) {
  running = false;
  state.won = won;
  els.endTitle.textContent = won ? "防守成功！" : "基地失守";
  els.resultText.textContent = won
    ? `撑过全部 ${WAVES.length} 波 · 击杀 ${state.kills} · 剩余生命 ${state.lives}`
    : `止步第 ${state.wave} 波 · 击杀 ${state.kills}`;
  els.gameover.classList.remove("hidden");
}

function update(dt) {
  state.time += dt;

  // 刷怪
  if (state.waveSpawning) {
    state.spawnTimer -= dt;
    while (state.spawnTimer <= 0 && state.spawnLeft > 0) {
      // 轮转保证本波 types 中每种都会出现
      const type = state.spawnTypes[state.spawnIndex % state.spawnTypes.length];
      state.spawnIndex = (state.spawnIndex || 0) + 1;
      state.enemies.push(makeEnemy(type));
      state.spawnLeft -= 1;
      state.spawnTimer += state.spawnInterval;
    }
    if (state.spawnLeft <= 0) state.waveSpawning = false;
  }

  const totalLen = pathLength();

  // 敌人前进
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.anim += dt;
    if (e.hurt > 0) e.hurt -= dt;
    e.dist += e.speed * dt;
    const pos = pointOnPath(e.dist);
    if (pos.x !== undefined) {
      if (pos.x !== e.x) e.facing = pos.x >= e.x ? 1 : -1;
      e.x = pos.x;
      e.y = pos.y;
    }
    if (pos.done || e.dist >= totalLen) {
      state.lives -= 1;
      state.enemies.splice(i, 1);
      addParticle(pos.x, pos.y, "#c23b3b");
      updateHud();
      if (state.lives <= 0) {
        state.lives = 0;
        endGame(false);
        return;
      }
    }
  }

  // 塔射击
  for (const t of state.towers) {
    t.anim += dt;
    t.timer -= dt;
    if (t.swing > 0) t.swing -= dt;
    const target = nearestEnemyInRange(t);
    if (target) {
      t.facing = target.x >= t.x ? 1 : -1;
      if (t.timer <= 0) {
        t.timer = t.cooldown;
        t.swing = 0.28;
        const angle = Math.atan2(target.y - t.y, target.x - t.x);

        if (t.style === "aoe") {
          // 魔法师：范围冲击环 + 命中闪
          pushFx({
            kind: "ring",
            x: t.x,
            y: t.y,
            radius: 12,
            maxRadius: t.range,
            life: 0.55,
            maxLife: 0.55,
            color: "#4a6a9a",
          });
          pushFx({
            kind: "pulse",
            x: t.x,
            y: t.y,
            radius: t.range,
            life: 0.42,
            maxLife: 0.42,
            color: "rgba(74,106,154,0.4)",
          });
          for (let j = state.enemies.length - 1; j >= 0; j--) {
            const e = state.enemies[j];
            const d = Math.hypot(e.x - t.x, e.y - t.y);
            if (d <= t.range) {
              e.hp -= t.damage;
              e.hurt = 0.22;
              const ang = Math.atan2(e.y - t.y, e.x - t.x) + 1.1;
              e.x += Math.cos(ang) * 6;
              e.y += Math.sin(ang) * 6;
              pushFx({
                kind: "burst",
                x: e.x,
                y: e.y,
                life: 0.28,
                maxLife: 0.28,
                color: "#4a6a9a",
              });
              addParticle(e.x, e.y, "#4a6a9a", 6, 90);
              if (e.hp <= 0) {
                state.gold += e.gold;
                state.kills += 1;
                addParticle(e.x, e.y, monsterParticleColor(e.type), 8, 100);
                state.enemies.splice(j, 1);
                updateHud();
              }
            }
          }
        } else if (t.style === "melee") {
          // 剑客 / 骑士：可见斩击弧 + 冲击线
          const slashR = t.type === "knight" ? 42 : 36;
          pushFx({
            kind: "slash",
            x: t.x + Math.cos(angle) * 28,
            y: t.y + Math.sin(angle) * 18 - 4,
            angle,
            radius: slashR,
            life: 0.42,
            maxLife: 0.42,
            heavy: t.type === "knight",
          });
          pushFx({
            kind: "arc",
            x: t.x,
            y: t.y,
            angle,
            radius: Math.min(t.range, 78),
            life: 0.3,
            maxLife: 0.3,
            color: t.type === "knight" ? "#5a5a5a" : "#8b3d14",
          });
          for (let j = state.enemies.length - 1; j >= 0; j--) {
            const e = state.enemies[j];
            const d = Math.hypot(e.x - t.x, e.y - t.y);
            if (d <= t.range) {
              e.hp -= t.damage;
              e.hurt = 0.22;
              e.dist = Math.max(0, e.dist - 8);
              pushFx({
                kind: "spark",
                x: e.x,
                y: e.y,
                angle,
                life: 0.2,
                maxLife: 0.2,
              });
              addParticle(e.x, e.y, t.type === "knight" ? "#5a5a5a" : "#8b3d14", 7, 110);
              if (e.hp <= 0) {
                state.gold += e.gold;
                state.kills += 1;
                addParticle(e.x, e.y, monsterParticleColor(e.type), 8, 100);
                state.enemies.splice(j, 1);
                updateHud();
              }
            }
          }
        } else {
          // 弓箭手：发射可见箭 + 出弦闪光
          const speed = 420;
          const weapon = t.style === "arrow" ? "arrow" : "orb";
          pushFx({
            kind: "muzzle",
            x: t.x + Math.cos(angle) * 18,
            y: t.y - 8 + Math.sin(angle) * 8,
            angle,
            life: 0.16,
            maxLife: 0.16,
            color: "#c45c26",
          });
          state.projectiles.push({
            x: t.x + Math.cos(angle) * 16,
            y: t.y - 10 + Math.sin(angle) * 8,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            damage: t.damage,
            life: 1.2,
            maxLife: 1.2,
            weapon,
            trail: [],
          });
        }
      }
    }
  }

  // 投射物
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (!pr.trail) pr.trail = [];
    pr.trail.push({ x: pr.x, y: pr.y, life: 0.18 });
    if (pr.trail.length > 10) pr.trail.shift();
    for (const tr of pr.trail) tr.life -= dt;

    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy < (e.radius + 6) ** 2) {
        e.hp -= pr.damage;
        e.hurt = 0.22;
        pushFx({
          kind: "impact",
          x: pr.x,
          y: pr.y,
          angle: pr.angle,
          life: 0.28,
          maxLife: 0.28,
          color: "#c45c26",
        });
        addParticle(pr.x, pr.y, "#c45c26", 8, 120);
        hit = true;
        if (e.hp <= 0) {
          state.gold += e.gold;
          state.kills += 1;
          addParticle(e.x, e.y, monsterParticleColor(e.type), 8, 100);
          state.enemies.splice(j, 1);
          updateHud();
        }
        break;
      }
    }
    if (hit || pr.life <= 0) state.projectiles.splice(i, 1);
  }

  // 攻击特效衰减
  for (let i = state.attackFx.length - 1; i >= 0; i--) {
    const fx = state.attackFx[i];
    fx.life -= dt;
    if (fx.kind === "ring") {
      const p = 1 - fx.life / fx.maxLife;
      fx.radius = fx.maxRadius * (0.15 + p * 0.85);
    }
    if (fx.life <= 0) state.attackFx.splice(i, 1);
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  // 波次清空后允许下一波 / 胜利
  if (
    !state.waveSpawning &&
    state.enemies.length === 0 &&
    state.wave > 0 &&
    !state.pendingNext
  ) {
    if (state.wave >= WAVES.length) {
      endGame(true);
      return;
    }
    state.pendingNext = true;
    state.gold += 25 + state.wave * 8;
    updateHud();
  }

  // 悬停槽位
  state.hoverSlot = findSlotAt(mouse.x, mouse.y);
}

function drawPath() {
  const pts = state.path;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 路基
  ctx.strokeStyle = "rgba(26,26,26,0.12)";
  ctx.lineWidth = state.pathWidth + 10;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.strokeStyle = "#d9d0c0";
  ctx.lineWidth = state.pathWidth;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(26,26,26,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 起点 / 终点
  const start = pts[0];
  const end = pts[pts.length - 1];
  ctx.fillStyle = "#3a8f6e";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#c23b3b";
  ctx.beginPath();
  ctx.arc(end.x, end.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px Songti SC, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("基", end.x, end.y + 4);
  ctx.restore();
}

function drawSlots() {
  const def = TOWER_TYPES[selectedTower];
  const canAfford = state.gold >= def.cost;
  for (const s of state.slots) {
    if (s.occupied) continue;
    const hover = state.hoverSlot === s;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = hover
      ? canAfford
        ? "rgba(196,92,38,0.25)"
        : "rgba(194,59,59,0.25)"
      : "rgba(26,26,26,0.06)";
    ctx.fill();
    ctx.strokeStyle = hover ? (canAfford ? "#c45c26" : "#c23b3b") : "rgba(26,26,26,0.35)";
    ctx.lineWidth = hover ? 2.2 : 1.5;
    ctx.setLineDash(hover ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 悬停时显示射程
  if (state.hoverSlot && !state.hoverSlot.occupied && running) {
    const r = def.range * state.world.scale;
    ctx.beginPath();
    ctx.arc(state.hoverSlot.x, state.hoverSlot.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(196,92,38,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(196,92,38,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawTower(t) {
  const tint =
    t.type === "mage"
      ? "rgba(74,106,154,0.28)"
      : t.type === "knight"
        ? "rgba(90,90,90,0.25)"
        : t.type === "swordsman"
          ? "rgba(139,61,20,0.22)"
          : "rgba(196,92,38,0.2)";
  ctx.fillStyle = tint;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y + 10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 攻击瞬间底座闪光
  if (t.swing > 0) {
    const a = Math.min(1, t.swing / 0.28);
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    ctx.strokeStyle = t.type === "mage" ? "#4a6a9a" : t.type === "archer" ? "#c45c26" : "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y + 10, 22 + (1 - a) * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const bob = t.swing > 0 ? Math.sin((1 - t.swing / 0.28) * Math.PI) * 3 : 0;
  drawCharacter(ctx, t.type, t.x, t.y - bob, t.facing, t.anim + (t.swing > 0 ? 2 : 0));

  if (t.type === "mage") {
    drawTornado(ctx, t.x + 18, t.y - 6, 0.28 + (t.swing > 0 ? 0.12 : 0), t.anim, 0.7);
  }
}

function drawAttackFx(fx) {
  const fade = Math.max(0, fx.life / (fx.maxLife || 0.3));
  ctx.save();
  ctx.globalAlpha = Math.min(1, fade * 1.25);

  if (fx.kind === "slash") {
    const r = fx.radius || 34;
    // 外层粗弧
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, r, fx.angle - 1.15, fx.angle + 1.15);
    ctx.stroke();
    // 内层亮弧
    ctx.globalAlpha = fade * 0.55;
    ctx.strokeStyle = fx.heavy ? "#5a5a5a" : "#8b3d14";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, r * 0.82, fx.angle - 0.85, fx.angle + 0.85);
    ctx.stroke();
    ctx.globalAlpha = fade;
    drawSlash(ctx, fx.x, fx.y, fx.angle, fade, r);
    if (fx.heavy) {
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fx.x - Math.cos(fx.angle) * 10, fx.y - Math.sin(fx.angle) * 10);
      ctx.lineTo(fx.x + Math.cos(fx.angle) * (r + 14), fx.y + Math.sin(fx.angle) * (r + 14));
      ctx.stroke();
    }
  } else if (fx.kind === "arc") {
    ctx.strokeStyle = fx.color || "#1a1a1a";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    const open = 1.05;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * (0.55 + (1 - fade) * 0.45), fx.angle - open, fx.angle + open);
    ctx.stroke();
  } else if (fx.kind === "ring") {
    ctx.strokeStyle = fx.color || "#4a6a9a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.4;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    // 第二圈
    ctx.globalAlpha = fade * 0.7;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  } else if (fx.kind === "pulse") {
    ctx.fillStyle = fx.color || "rgba(74,106,154,0.25)";
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * (0.35 + (1 - fade) * 0.65), 0, Math.PI * 2);
    ctx.fill();
  } else if (fx.kind === "burst") {
    drawTornado(ctx, fx.x, fx.y, 0.45 + (1 - fade) * 0.35, (1 - fade) * 8, fade);
  } else if (fx.kind === "spark" || fx.kind === "impact" || fx.kind === "muzzle") {
    const ang = fx.angle || 0;
    const len = fx.kind === "muzzle" ? 26 : 30;
    ctx.strokeStyle = fx.color || "#1a1a1a";
    ctx.fillStyle = fx.color || "#1a1a1a";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.38;
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.lineTo(fx.x + Math.cos(a) * len * fade, fx.y + Math.sin(a) * len * fade);
      ctx.stroke();
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, 6 + (1 - fade) * 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  ctx.clearRect(0, 0, viewW, viewH);

  const g = ctx.createLinearGradient(0, 0, viewW, viewH);
  g.addColorStop(0, "#ebe6da");
  g.addColorStop(1, "#d8d0c2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  // 棋盘淡网格
  if (state.world) {
    const { ox, oy, w, h, scale } = state.world;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(26,26,26,0.05)";
    ctx.lineWidth = 1;
    const step = 40 * scale;
    for (let x = ox; x < ox + w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + h);
      ctx.stroke();
    }
    for (let y = oy; y < oy + h; y += step) {
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + w, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(26,26,26,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, w, h);
  }

  drawPath();
  drawSlots();

  // 村落与草苗
  if (state.decor) {
    for (const d of state.decor) {
      if (d.kind === "house") drawHouse(ctx, d.x, d.y, d.scale, d.variant);
      else drawSprout(ctx, d.x, d.y, d.scale, d.variant, state.time);
    }
  }

  for (const t of state.towers) drawTower(t);

  for (const e of state.enemies) {
    drawMonster(ctx, e.type, e.x, e.y, 0.85, e.anim, e.hurt, e.facing || 1);
    if (e.hp < e.maxHp) {
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(26,26,26,0.25)";
      ctx.fillRect(e.x - 14, e.y - 40, 28, 4);
      ctx.fillStyle = "#c23b3b";
      ctx.fillRect(e.x - 14, e.y - 40, 28 * ratio, 4);
    }
  }

  for (const fx of state.attackFx) drawAttackFx(fx);

  for (const pr of state.projectiles) {
    // 箭尾轨迹
    if (pr.trail?.length) {
      for (let i = 0; i < pr.trail.length; i++) {
        const tr = pr.trail[i];
        if (tr.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, tr.life * 3) * 0.45;
        ctx.fillStyle = "#c45c26";
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 2 + i * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.scale(1.4, 1.4);
    drawWeaponProjectile(ctx, pr.weapon || "arrow", 0, 0, pr.angle, pr.life);
    ctx.restore();
  }

  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2.2);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size || 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
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
  loadMonsters().then(() => {
    state = createState();
    selectedTower = "archer";
    running = true;
    els.overlay.classList.add("hidden");
    els.gameover.classList.add("hidden");
    layoutWorld();
    updateHud();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

function hideOtherPanels() {
  // no-op placeholder — main.js handles cross-mode
}

export function startTower(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  selectedTower = "archer";

  els.hud.classList.remove("hidden");
  els.dock?.classList.remove("hidden");
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");

  resize();
  on(window, "resize", () => {
    resize();
    paintTowerCards();
  });

  on(window, "mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  on(canvas, "click", (e) => {
    if (!running) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const slot = findSlotAt(mouse.x, mouse.y);
    if (slot && !slot.occupied) placeTower(slot);
  });

  on(window, "keydown", (e) => {
    if (e.code === "Digit1") selectedTower = "swordsman";
    else if (e.code === "Digit2") selectedTower = "mage";
    else if (e.code === "Digit3") selectedTower = "knight";
    else if (e.code === "Digit4") selectedTower = "archer";
    else if (e.code === "Space") {
      e.preventDefault();
      if (running) startWave();
      return;
    } else return;
    updateHud();
  });

  els.btnStart.onclick = beginRun;
  els.btnRestart.onclick = beginRun;
  for (const id of TOWER_ORDER) {
    const btn = els.towerBtns?.[id];
    if (btn) {
      btn.onclick = () => {
        selectedTower = id;
        updateHud();
      };
    }
  }
  els.btnWave.onclick = () => {
    if (running) startWave();
  };

  hideOtherPanels();
  beginRun();
  requestAnimationFrame(() => paintTowerCards());
}

export function stopTower() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  els.hud?.classList.add("hidden");
  els.dock?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
}
