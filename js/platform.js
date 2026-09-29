import {
  drawFireball,
  drawHouse,
  drawSprout,
} from "./draw.js";
import { getCharacter, drawCharacter, drawWeaponProjectile } from "./characters.js";
import { showCharSelect } from "./charselect.js?v=20260929i";
import {
  loadMonsters,
  makeMonsterStats,
  drawMonster,
  monsterParticleColor,
  unlockedMonsters,
  getMonsterDef,
  monsterBodyCenter,
} from "./monsters.js";

const GRAVITY = 1800;
const JUMP_V = -620;
const DOUBLE_JUMP_V = -560;
const MAX_JUMPS = 2;
const MOVE_SPEED = 260;
const FIRE_COOLDOWN = 0.22;
const ARROW_SPEED = 620;
const MAX_STAGES = 5;
const CRIT_CHANCE = 0.18;
const CRIT_MULT = 2;
const SPIKE_DAMAGE = 18;
const ROCK_DAMAGE = 30;
const SPIKE_UNIT = 15;
const SPIKE_H = 16;
const DASH_SPEED = 980;
const DASH_TIME = 0.14;
const DASH_COOLDOWN = 0.06;
const START_DASHES = 1;
/** 双人共享镜头边距：玩家不能被甩出画面 */
const COOP_PAD_X = 52;
const COOP_PAD_Y = 64;

/** 单人 / 双人键位 */
const CTRL = {
  solo: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    // 兼容原键位 + 双人 P1（K 跳 · L 冲刺 · J 攻击）
    jump: ["Space", "KeyW", "ArrowUp", "KeyK"],
    dash: ["ShiftLeft", "ShiftRight", "KeyL"],
    attack: ["KeyJ"],
  },
  p1: {
    left: ["KeyA"],
    right: ["KeyD"],
    up: ["KeyW"],
    down: ["KeyS"],
    jump: ["KeyK"],
    dash: ["KeyL"],
    attack: ["KeyJ"],
  },
  p2: {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    jump: ["Digit2"],
    dash: ["Digit3"],
    attack: ["Digit1"],
  },
};

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let mouse = { x: 0, y: 0, down: false };
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];
let coopMode = false;
let selectedCharIds = ["archer", "swordsman"];
let pickSlot = 0; // 双人选角进度 0→P1, 1→P2

function keyDown(codes) {
  if (!codes) return false;
  for (const c of codes) if (keys[c]) return true;
  return false;
}

function alivePlayers() {
  return (state?.players || []).filter((p) => !p.dead);
}

function nearestPlayer(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const p of alivePlayers()) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

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

function buildLevel(stage = 1) {
  // 关卡纵向坐标按 ~700 高度设计，镜头会跟随玩家并在小屏上正确裁切
  const platforms = [
    { x: 0, y: 480, w: 380, h: 28 },
    { x: 420, y: 420, w: 170, h: 22 },
    { x: 640, y: 360, w: 150, h: 22 },
    { x: 850, y: 300, w: 180, h: 22 },
    { x: 1100, y: 380, w: 200, h: 22 },
    { x: 1380, y: 320, w: 170, h: 22 },
    { x: 1620, y: 260, w: 150, h: 22 },
    { x: 1840, y: 340, w: 220, h: 22 },
    { x: 2120, y: 280, w: 170, h: 22 },
    { x: 2360, y: 220, w: 190, h: 22 },
    { x: 2620, y: 300, w: 260, h: 22 },
    { x: 2940, y: 240, w: 200, h: 22 },
    { x: 3200, y: 360, w: 300, h: 28 },
    { x: 0, y: 560, w: 850, h: 40 },
    { x: 1000, y: 580, w: 650, h: 40 },
    { x: 1850, y: 560, w: 850, h: 40 },
    { x: 2900, y: 540, w: 700, h: 40 },
  ];

  // 保证每种已解锁怪物至少一只，再按关卡多刷
  const slots = [
    [500, 420],
    [920, 300],
    [1180, 380],
    [1450, 320],
    [1920, 340],
    [2180, 280],
    [2440, 220],
    [2720, 300],
    [3020, 240],
    [3320, 360],
    [320, 560],
    [1250, 580],
    [2100, 560],
    [700, 560],
    [1600, 580],
    [2500, 560],
    [3100, 540],
    [1050, 380],
  ];
  const pool = unlockedMonsters(stage);
  const enemies = [];
  // 先各放一只
  pool.forEach((type, i) => {
    const slot = slots[i % slots.length];
    enemies.push(enemyAt(type, slot[0] + i * 12, slot[1], stage));
  });
  // 再按关卡额外填充，覆盖剩余槽位
  const extra = Math.min(slots.length, 4 + stage * 2);
  for (let i = pool.length; i < extra; i++) {
    const type = pool[i % pool.length];
    const slot = slots[i % slots.length];
    enemies.push(enemyAt(type, slot[0] + (i % 5) * 18, slot[1], stage));
  }

  const traps = buildTraps(stage);

  const decor = [];
  for (const pl of platforms) {
    if (pl.w < 120) continue;
    const n = Math.min(4, Math.floor(pl.w / 90));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.4) / (n + 0.2);
      const x = pl.x + pl.w * t;
      if (decorBlocked(x, pl.y, traps)) continue;
      decor.push({
        kind: "house",
        x,
        y: pl.y,
        scale: 0.7 + (i % 3) * 0.12,
        variant: i + Math.floor(pl.x / 50),
      });
    }
    for (let i = 0; i < Math.floor(pl.w / 55); i++) {
      const x = pl.x + 20 + i * 52 + (i % 2) * 8;
      if (decorBlocked(x, pl.y, traps)) continue;
      decor.push({
        kind: "sprout",
        x,
        y: pl.y,
        scale: 0.65 + (i % 3) * 0.15,
        variant: i,
      });
    }
  }

  platforms.push(...buildMovers(stage));

  return {
    width: 3600,
    height: 640,
    platforms,
    enemies,
    spikes: traps.spikes,
    rocks: traps.rocks,
    pickups: buildPickups(stage),
    decor,
    goal: { x: 3400, y: 300, w: 40, h: 60 },
    stage,
  };
}

function buildPickups(stage) {
  // 空中补给：只把用掉的那一次冲刺补回来
  const byStage = [
    [],
    [
      { x: 500, y: 340 },
      { x: 1410, y: 240 },
    ],
    [{ x: 2200, y: 200 }],
    [{ x: 2750, y: 210 }],
    [],
    [],
  ];
  return (byStage[stage] || []).map((spec) => ({
    x: spec.x,
    y: spec.y,
    r: 16,
    bob: spec.x * 0.01,
    respawn: 0,
  }));
}

function decorBlocked(x, platformY, traps) {
  for (const s of traps.spikes) {
    if (Math.abs(platformY - (s.y + s.h)) > 6) continue;
    if (x > s.x - 14 && x < s.x + s.w + 14) return true;
  }
  for (const r of traps.rocks) {
    if (Math.abs(platformY - r.landY) > 6) continue;
    if (Math.abs(x - r.x) < r.w * 0.5 + 22) return true;
  }
  return false;
}

function buildTraps(stage) {
  // 坐标都落在对应平台顶面之内；关卡越高，尖刺和落石越多，预警越短
  const spikeLayout = [
    { x: 500, y: 560, count: 4 },
    { x: 968, y: 300, count: 3 },
    { x: 1488, y: 320, count: 3 },
    { x: 2488, y: 220, count: 3 },
    { x: 1408, y: 580, count: 4 },
    { x: 1664, y: 260, count: 3 },
    { x: 1856, y: 340, count: 3 },
    { x: 2480, y: 560, count: 4 },
    { x: 3072, y: 240, count: 3 },
    { x: 640, y: 560, count: 3 },
    { x: 2800, y: 300, count: 3 },
    { x: 3272, y: 360, count: 3 },
  ];
  const rockLayout = [
    { x: 715, homeY: 188, landY: 360, triggerHalf: 76 },
    { x: 2024, homeY: 168, landY: 340, triggerHalf: 82 },
    { x: 1200, homeY: 208, landY: 380, triggerHalf: 78 },
    { x: 2672, homeY: 128, landY: 300, triggerHalf: 88 },
    { x: 2324, homeY: 400, landY: 560, triggerHalf: 62 },
    { x: 2205, homeY: 108, landY: 280, triggerHalf: 72 },
  ];
  const spikeN = [4, 7, 9, 11, 12][stage - 1] ?? spikeLayout.length;
  const rockN = [2, 3, 4, 5, 6][stage - 1] ?? rockLayout.length;
  return {
    spikes: spikeLayout.slice(0, spikeN).map(makeSpikeStrip),
    rocks: rockLayout.slice(0, rockN).map((spec) => makeRock(spec, stage)),
  };
}

function makeSpikeStrip(spec) {
  return {
    x: spec.x,
    y: spec.y - SPIKE_H,
    w: spec.count * SPIKE_UNIT,
    h: SPIKE_H,
    count: spec.count,
  };
}

function buildMovers(stage) {
  // 左右往复的平台，用来跨过空隙；关卡越高越多、越快
  const layout = [
    { x: 820, y: 560, w: 108, h: 18, min: 790, max: 1000, speed: 72 },
    { x: 1000, y: 380, w: 88, h: 18, min: 980, max: 1170, speed: 78 },
    { x: 1660, y: 560, w: 110, h: 18, min: 1658, max: 1880, speed: 84 },
    { x: 1310, y: 390, w: 72, h: 16, min: 1304, max: 1470, speed: 76 },
    { x: 2720, y: 540, w: 120, h: 18, min: 2710, max: 2980, speed: 88 },
    { x: 3020, y: 312, w: 100, h: 16, min: 3000, max: 3195, speed: 80 },
  ];
  const n = [2, 3, 4, 5, 6][stage - 1] ?? 2;
  return layout.slice(0, n).map((spec, i) => ({
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    move: {
      min: spec.min,
      max: spec.max - spec.w,
      speed: spec.speed + (stage - 1) * 8,
      dir: i % 2 === 0 ? 1 : -1,
      dx: 0,
    },
  }));
}

function makeRock(spec, stage) {
  return {
    x: spec.x,
    homeY: spec.homeY,
    landY: spec.landY,
    y: spec.homeY,
    w: 30,
    h: 32,
    vy: 0,
    phase: "idle",
    timer: 0,
    arm: 0.45,
    hit: false,
    triggerHalf: spec.triggerHalf,
    warnTime: Math.max(0.22, 0.5 - (stage - 1) * 0.06),
  };
}

function enemyAt(type, x, platformY, stage = 1) {
  // 平台模式略缩小绘制，脚底贴在平台顶面
  const stats = makeMonsterStats(type, stage, { drawScale: 0.72 });
  const def = getMonsterDef(type);
  return {
    ...stats,
    x,
    y: platformY, // 脚底
    vx: def.speed * 0.7,
    facing: 1,
    score: 80 + def.xp * 20 + stage * 15,
    patrolMin: x - 70,
    patrolMax: x + 70,
    grounded: true,
  };
}

let selectedCharId = "archer";

function makePlayer(charId, x, y, scheme) {
  const ch = getCharacter(charId);
  const s = ch.platform;
  return {
    charId: ch.id,
    attackType: ch.attackType,
    weapon: s.weapon,
    meleeRange: s.meleeRange || 0,
    x,
    y,
    w: 22,
    h: 40,
    vx: 0,
    vy: 0,
    facing: 1,
    anim: 0,
    onGround: false,
    jumpsLeft: MAX_JUMPS,
    jumpHeld: false,
    hp: s.maxHp,
    maxHp: s.maxHp,
    invuln: 0,
    fireTimer: 0,
    damage: s.damage,
    critChance: CRIT_CHANCE,
    critMult: CRIT_MULT,
    fireCooldown: s.fireCooldown,
    projectileSpeed: s.projectileSpeed,
    dashes: START_DASHES,
    maxDashes: START_DASHES,
    dashTime: 0,
    dashCooldown: 0,
    dashDirX: 1,
    dashDirY: 0,
    dashHeld: false,
    dashing: false,
    dashLanded: true,
    attackHeld: false,
    scheme,
    dead: false,
    riding: null,
  };
}

function createState(stage = 1) {
  const level = buildLevel(stage);
  const players = [];
  if (coopMode) {
    players.push(makePlayer(selectedCharIds[0] || "archer", 80, 440, "p1"));
    players.push(makePlayer(selectedCharIds[1] || "swordsman", 130, 440, "p2"));
  } else {
    players.push(makePlayer(selectedCharId, 80, 440, "solo"));
  }
  return {
    level,
    stage,
    time: 0,
    kills: 0,
    score: 0,
    coop: coopMode,
    players,
    get player() {
      return this.players[0];
    },
    camera: { x: 0, y: 0 },
    projectiles: [],
    enemyProjectiles: [],
    meleeFx: [],
    particles: [],
    floatTexts: [],
    dashTrail: [],
    shake: 0,
    shakeMag: 0,
    won: false,
  };
}

let seenGuide = new Set();

function isCoopGuide() {
  return !!(state?.coop || coopMode);
}

function anyAlive(pred) {
  return (state?.players || []).some((p) => !p.dead && pred(p));
}

const GUIDE = [
  {
    id: "move",
    text: () =>
      isCoopGuide()
        ? "P1：A / D 移动　｜　P2：← / → 移动"
        : "A / D 或方向键移动",
    hold: 0.45,
    max: 7,
    when: () => state.stage === 1 && state.time > 0.35,
    until: () => !!(keys["KeyA"] || keys["KeyD"] || keys["ArrowLeft"] || keys["ArrowRight"]),
  },
  {
    id: "jump",
    text: () =>
      isCoopGuide()
        ? "P1：K 跳跃　｜　P2：数字键 2 跳跃（可二段跳，可从下方跳上平台）"
        : "空格、W、↑ 或 K 跳跃，可从下方跳上平台，空中再跳一次",
    hold: 0.45,
    max: 8,
    when: () => state.stage === 1 && seenGuide.has("move") && !state.didJump,
    until: () => !!state.didJump,
  },
  {
    id: "attack",
    text: () => {
      if (isCoopGuide()) {
        return "P1：J 攻击　｜　P2：数字键 1 攻击（方向键瞄准）";
      }
      return state.player.attackType === "melee"
        ? "鼠标瞄准点击，或 J 攻击（方向键可瞄准）"
        : "鼠标瞄准点击，或 J 射击（方向键可瞄准）";
    },
    hold: 0.5,
    max: 8,
    when: () => state.stage === 1 && seenGuide.has("jump") && !state.didAttack,
    until: () => !!state.didAttack,
  },
  {
    id: "dash",
    text: () =>
      isCoopGuide()
        ? "P1：L 冲刺　｜　P2：数字键 3 冲刺（落地恢复，晶石可补）"
        : "Shift 或 L 朝按键方向冲刺。落地恢复，晶石可补一次",
    hold: 0.6,
    max: 8,
    when: () =>
      state.stage === 1 &&
      seenGuide.has("attack") &&
      anyAlive((p) => p.dashes >= p.maxDashes && p.dashTime <= 0),
    until: () => anyAlive((p) => p.dashTime > 0 || p.dashing || p.dashes < p.maxDashes),
  },
];

function hideGuide() {
  els.hint?.classList.add("hidden");
}

function resetGuide() {
  seenGuide = new Set();
  state.hint = null;
  hideGuide();
}

function showGuide(spec) {
  state.hint = {
    id: spec.id,
    text: typeof spec.text === "function" ? spec.text() : spec.text,
    age: 0,
    hold: spec.hold,
    max: spec.max,
  };
  if (!els.hint) return;
  els.hint.textContent = state.hint.text;
  els.hint.classList.remove("hidden");
}

function updateGuide(dt) {
  if (!state) return;
  if (state.hint) {
    const spec = GUIDE.find((g) => g.id === state.hint.id);
    state.hint.age += dt;
    const acted = state.hint.age >= state.hint.hold && (!spec?.until || spec.until());
    const left = state.hint.age >= 1.1 && spec?.leave && spec.leave();
    const expired = state.hint.age >= state.hint.max;
    if (acted || left || expired) {
      seenGuide.add(state.hint.id);
      state.hint = null;
      hideGuide();
    }
  }
  if (!state.hint) {
    for (const spec of GUIDE) {
      if (seenGuide.has(spec.id)) continue;
      if (!spec.when()) continue;
      showGuide(spec);
      break;
    }
  }
}

function updateHud() {
  const list = state.players || [state.player];
  const p1 = list[0];
  const p2 = list[1];
  if (p1) {
    els.hpFill.style.transform = `scaleX(${Math.max(0, p1.hp / p1.maxHp)})`;
    els.hpText.textContent = p1.dead ? "阵亡" : `${Math.ceil(p1.hp)}`;
  }
  if (els.p1Label) els.p1Label.textContent = state.coop ? "P1" : "生命";
  if (els.p2Stat) {
    if (state.coop && p2) {
      els.p2Stat.classList.remove("hidden");
      if (els.hp2Fill) els.hp2Fill.style.transform = `scaleX(${Math.max(0, p2.hp / p2.maxHp)})`;
      if (els.hp2Text) els.hp2Text.textContent = p2.dead ? "阵亡" : `${Math.ceil(p2.hp)}`;
    } else {
      els.p2Stat.classList.add("hidden");
    }
  }
  els.scoreText.textContent = `分数 ${state.score}`;
  els.killText.textContent = `击杀 ${state.kills}`;
  if (els.stageText) els.stageText.textContent = `关卡 ${state.stage}/${MAX_STAGES}`;
  const focus = alivePlayers()[0] || p1;
  if (els.dashText && focus) {
    els.dashText.textContent = state.coop
      ? `冲刺 ${p1?.dashes ?? 0}/${p1?.maxDashes ?? 1}`
      : `冲刺 ${focus.dashes}/${focus.maxDashes}`;
  }
  if (els.ammoText && focus) {
    if (focus.attackType === "melee") {
      els.ammoText.textContent = focus.weapon === "bolt" ? "盾击" : "近战";
    } else {
      const names = { orb: "法球", arrow: "箭矢" };
      els.ammoText.textContent = names[focus.weapon] || "远程";
    }
  }
}

function addParticle(x, y, color) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 90;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.25,
      color,
    });
  }
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function damagePlayer(amount, knockVy, target = null) {
  const p = target || state.player;
  if (!p || p.dead || p.invuln > 0) return false;
  p.hp -= amount;
  p.invuln = 0.7;
  p.onGround = false;
  p.vy = knockVy;
  addParticle(p.x, p.y, "#c23b3b");
  triggerShake(amount >= ROCK_DAMAGE ? 8 : 5, 0.18);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    updateHud();
    if (alivePlayers().length === 0) {
      endGame(false);
      return true;
    }
  }
  return false;
}

function overlapPlayerRock(r) {
  for (const p of alivePlayers()) {
    if (
      rectOverlap(
        p.x - p.w / 2,
        p.y - p.h / 2,
        p.w,
        p.h,
        r.x - r.w / 2,
        r.y - r.h / 2,
        r.w,
        r.h
      )
    ) {
      return p;
    }
  }
  return null;
}

function rockHitsPlayer(r) {
  if (r.hit) return false;
  const p = overlapPlayerRock(r);
  if (!p) return false;
  r.hit = true;
  if (p.invuln > 0) return false;
  const dir = Math.sign(p.x - r.x) || -1;
  p.x += dir * 16;
  return damagePlayer(ROCK_DAMAGE, -420, p);
}

function settleRock(r) {
  const foot = r.h * 0.46;
  r.y = r.landY - foot;
  r.vy = 0;
  r.phase = "rest";
  if (r.solid) return;
  r.solid = true;
  const bodyH = foot * 2;
  // 落下后变成实体，能站上去，也不会再升回去
  state.level.platforms.push({
    x: r.x - r.w * 0.46,
    y: r.landY - bodyH,
    w: r.w * 0.92,
    h: bodyH,
    rock: true,
  });
}

function rockImpact(r) {
  triggerShake(6, 0.14);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + (Math.random() - 0.5) * Math.PI;
    const sp = 40 + Math.random() * 120;
    state.particles.push({
      x: r.x + (Math.random() - 0.5) * r.w,
      y: r.landY,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 30,
      life: 0.32 + Math.random() * 0.22,
      color: i % 2 ? "#1a1a1a" : "#8a8175",
    });
  }
}

function updateTraps(dt) {
  for (const p of alivePlayers()) {
    if (p.invuln > 0) continue;
    const left = p.x - p.w / 2;
    const top = p.y - p.h / 2;
    for (const s of state.level.spikes) {
      if (!rectOverlap(left, top, p.w, p.h, s.x + 2, s.y + 1, s.w - 4, s.h - 1)) {
        continue;
      }
      const dir = Math.sign(p.x - (s.x + s.w / 2)) || -p.facing || -1;
      p.x += dir * 18;
      if (damagePlayer(SPIKE_DAMAGE, -360, p)) return true;
      break;
    }
  }

  for (const r of state.level.rocks) {
    if (r.phase === "rest") continue;
    if (r.arm > 0) r.arm -= dt;

    if (r.phase === "idle") {
      let trigger = false;
      for (const p of alivePlayers()) {
        const inX = Math.abs(p.x - r.x) < r.triggerHalf;
        const onPath = p.y > r.homeY - 10 && p.y < r.landY + 28;
        if (inX && onPath) {
          trigger = true;
          break;
        }
      }
      if (r.arm <= 0 && trigger) {
        r.phase = "warn";
        r.timer = r.warnTime;
      }
    } else if (r.phase === "warn") {
      r.timer -= dt;
      if (r.timer <= 0) {
        r.phase = "fall";
        r.vy = 60;
        r.hit = false;
      }
    } else if (r.phase === "fall") {
      r.vy = Math.min(980, r.vy + 2100 * dt);
      r.y += r.vy * dt;
      const foot = r.h * 0.46;
      if (r.y + foot >= r.landY) {
        r.y = r.landY - foot;
        r.vy = 0;
        const dead = rockHitsPlayer(r);
        rockImpact(r);
        settleRock(r);
        if (dead) return true;
      } else if (rockHitsPlayer(r)) {
        return true;
      }
    }
  }
  return false;
}

function updateMovingPlatforms(dt) {
  for (const pl of state.level.platforms) {
    if (!pl.move) continue;
    const prev = pl.x;
    pl.x += pl.move.dir * pl.move.speed * dt;
    if (pl.x < pl.move.min) {
      pl.x = pl.move.min;
      pl.move.dir = 1;
    } else if (pl.x > pl.move.max) {
      pl.x = pl.move.max;
      pl.move.dir = -1;
    }
    pl.move.dx = pl.x - prev;
  }
}

function resolvePlatforms(ent, dt) {
  const plats = state.level.platforms;
  ent.onGround = false;
  ent.vy += ent.dashing ? 0 : GRAVITY * dt;
  ent.x += ent.vx * dt;
  ent.y += ent.vy * dt;

  const hw = ent.w / 2;
  const hh = ent.h / 2;
  let left = ent.x - hw;
  let top = ent.y - hh;
  const w = ent.w;
  const h = ent.h;

  for (const pl of plats) {
    if (!rectOverlap(left, top, w, h, pl.x, pl.y, pl.w, pl.h)) continue;

    // 只踩上表面：向上跳时穿过平台，落下后站上去
    const prevBottom = ent.y - hh - ent.vy * dt + h;
    if (ent.vy < 0 || prevBottom > pl.y + 10) continue;

    ent.y = pl.y - hh;
    ent.vy = 0;
    ent.onGround = true;
    top = ent.y - hh;
    left = ent.x - hw;
  }

  // 世界边界
  if (ent.x < hw) {
    ent.x = hw;
    ent.vx = 0;
  }
  if (ent.x > state.level.width - hw) {
    ent.x = state.level.width - hw;
    ent.vx = 0;
  }

  ent.riding = null;
  if (ent.onGround) {
    const feet = ent.y + hh;
    for (const pl of plats) {
      if (!pl.move) continue;
      if (
        Math.abs(feet - pl.y) <= 2 &&
        ent.x >= pl.x - 2 &&
        ent.x <= pl.x + pl.w + 2
      ) {
        ent.riding = pl;
        break;
      }
    }
  }

  // 掉落即受伤并重生到最近平台上方
  if (ent.y > state.level.height + 80) {
    return "fell";
  }
  return null;
}

function rollCritDamage(base) {
  const p = state.player;
  const chance = p.critChance ?? CRIT_CHANCE;
  const mult = p.critMult ?? CRIT_MULT;
  const crit = Math.random() < chance;
  return {
    damage: crit ? Math.round(base * mult) : base,
    crit,
  };
}

function triggerShake(mag = 5, dur = 0.16) {
  state.shake = Math.max(state.shake || 0, dur);
  state.shakeMag = Math.max(state.shakeMag || 0, mag);
}

function pushCritText(e) {
  if (!state.floatTexts) state.floatTexts = [];
  // 平台怪物脚底锚点，飘字放在头顶上方
  const top = e.y - (e.drawH || e.radius * 2 || 40) - 10;
  state.floatTexts.push({
    x: e.x,
    y: top,
    text: "暴击",
    life: 0.75,
    maxLife: 0.75,
  });
}

function aimFromKeys(p) {
  const c = CTRL[p.scheme] || CTRL.solo;
  let x = 0;
  let y = 0;
  if (keyDown(c.left)) x -= 1;
  if (keyDown(c.right)) x += 1;
  if (keyDown(c.up)) y -= 1;
  if (keyDown(c.down)) y += 1;
  if (x === 0 && y === 0) return null;
  return Math.atan2(y, x);
}

function fireArrow(p, aimAngle = null) {
  if (!p || p.dead) return;
  state.didAttack = true;
  if (p.fireTimer > 0) return;

  let angle = aimAngle;
  if (angle == null) {
    const fromKeys = aimFromKeys(p);
    if (fromKeys != null) {
      // 方向键 / WASD 八向瞄准
      angle = fromKeys;
    } else if (p.scheme === "solo") {
      const worldMx = mouse.x + state.camera.x;
      const worldMy = mouse.y + state.camera.y;
      angle = Math.atan2(worldMy - (p.y - 8), worldMx - p.x);
    } else {
      angle = p.facing >= 0 ? 0 : Math.PI;
    }
  }
  if (Math.cos(angle) !== 0) p.facing = Math.cos(angle) >= 0 ? 1 : -1;
  p.fireTimer = p.fireCooldown || FIRE_COOLDOWN;

  if (p.attackType === "melee") {
    const range = p.meleeRange || 65;
    state.meleeFx.push({
      x: p.x + Math.cos(angle) * 26,
      y: p.y - 8 + Math.sin(angle) * 18,
      angle,
      weapon: p.weapon,
      life: 0.2,
      maxLife: 0.2,
    });

    const doomed = [];
    let anyCrit = false;
    for (const e of state.level.enemies) {
      const body = monsterBodyCenter(e);
      const dx = body.x - p.x;
      const dy = body.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.radius) continue;
      const dot = dx * Math.cos(angle) + dy * Math.sin(angle);
      if (dot < -10) continue;
      const hit = rollCritDamage(p.damage);
      if (hit.crit) anyCrit = true;
      e.hp -= hit.damage;
      e.hurt = hit.crit ? 0.28 : 0.2;
      e.x += Math.cos(angle) * (p.charId === "knight" ? 24 : 12) * (hit.crit ? 1.35 : 1);
      addParticle(body.x, body.y, hit.crit ? "#c23b3b" : "#8b3d14");
      if (hit.crit) pushCritText(e);
      if (e.hp <= 0) doomed.push(e);
    }
    if (anyCrit) triggerShake(6, 0.18);
    for (const e of doomed) {
      const j = state.level.enemies.indexOf(e);
      if (j < 0) continue;
      state.score += e.score;
      state.kills += 1;
      addParticle(e.x, e.y, monsterParticleColor(e.type));
      state.level.enemies.splice(j, 1);
    }
    return;
  }

  const speed = p.projectileSpeed || ARROW_SPEED;
  state.projectiles.push({
    x: p.x + Math.cos(angle) * 18,
    y: p.y - 8 + Math.sin(angle) * 10,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    damage: p.damage,
    life: 1.4,
    weapon: p.weapon || "arrow",
    hit: new Set(),
  });
}

function endGame(won) {
  running = false;
  state.won = won;
  els.endTitle.textContent = won ? "全部通关！" : "阵亡";
  els.resultText.textContent = won
    ? `关卡 ${state.stage}/${MAX_STAGES} · 分数 ${state.score} · 击杀 ${state.kills} · 用时 ${state.time.toFixed(1)}s`
    : `关卡 ${state.stage}/${MAX_STAGES} · 分数 ${state.score} · 击杀 ${state.kills}`;
  els.gameover.classList.remove("hidden");
  hideGuide();
}

function advanceStage() {
  if (state.stage >= MAX_STAGES) {
    endGame(true);
    return;
  }
  const score = state.score + 500;
  const kills = state.kills;
  const time = state.time;
  const next = state.stage + 1;
  const keptPlayers = state.players.map((p) => ({
    charId: p.charId,
    attackType: p.attackType,
    weapon: p.weapon,
    meleeRange: p.meleeRange,
    damage: p.damage,
    critChance: p.critChance,
    critMult: p.critMult,
    fireCooldown: p.fireCooldown,
    projectileSpeed: p.projectileSpeed,
    maxHp: p.maxHp,
    hp: p.dead ? 0 : Math.min(p.maxHp, p.hp + 20),
    dead: p.dead,
    scheme: p.scheme,
  }));
  // 若全灭则不应进关；复活阵亡队友一半血方便继续
  for (const k of keptPlayers) {
    if (k.dead) {
      k.dead = false;
      k.hp = Math.max(20, Math.round(k.maxHp * 0.5));
    }
  }
  state = createState(next);
  state.coop = coopMode;
  for (let i = 0; i < state.players.length; i++) {
    const k = keptPlayers[i];
    if (!k) continue;
    Object.assign(state.players[i], k);
    state.players[i].dashes = START_DASHES;
    state.players[i].maxDashes = START_DASHES;
  }
  state.score = score;
  state.kills = kills;
  state.time = time;
  state.projectiles = [];
  state.meleeFx = [];
  syncCamera(null, true);
  updateHud();
}

function wantsDash(p) {
  const c = CTRL[p.scheme] || CTRL.solo;
  return keyDown(c.dash);
}

function dashDirection(p) {
  const c = CTRL[p.scheme] || CTRL.solo;
  let x = 0;
  let y = 0;
  if (keyDown(c.left)) x -= 1;
  if (keyDown(c.right)) x += 1;
  if (keyDown(c.up)) y -= 1;
  if (keyDown(c.down)) y += 1;
  if (x === 0 && y === 0) x = p.facing || 1;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function startDash(p) {
  const dir = dashDirection(p);
  p.dashes -= 1;
  p.dashTime = DASH_TIME;
  p.dashCooldown = 0;
  p.dashDirX = dir.x;
  p.dashDirY = dir.y;
  p.dashing = true;
  p.onGround = false;
  p.vx = dir.x * DASH_SPEED;
  p.vy = dir.y * DASH_SPEED;
  if (dir.x !== 0) p.facing = dir.x > 0 ? 1 : -1;
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      x: p.x,
      y: p.y,
      vx: -dir.x * (80 + Math.random() * 140) + (Math.random() - 0.5) * 40,
      vy: -dir.y * (80 + Math.random() * 140) + (Math.random() - 0.5) * 40,
      life: 0.18 + Math.random() * 0.12,
      color: "#1a1a1a",
    });
  }
}

function updateDash(dt, p) {
  const c = CTRL[p.scheme] || CTRL.solo;
  const wantDash = wantsDash(p);
  const wantJump = keyDown(c.jump);
  let dashedJump = false;

  if (p.dashCooldown > 0) p.dashCooldown -= dt;

  if (p.dashTime > 0 && wantJump && !p.jumpHeld) {
    p.dashTime = 0;
    p.dashing = false;
    p.vy = JUMP_V * 1.08;
    p.vx = (p.dashDirX || p.facing || 1) * MOVE_SPEED * 1.45;
    p.onGround = false;
    dashedJump = true;
    state.didJump = true;
  } else if (p.dashTime > 0) {
    p.dashTime -= dt;
    if (p.dashTime > 0) {
      p.dashing = true;
      p.vx = p.dashDirX * DASH_SPEED;
      p.vy = p.dashDirY * DASH_SPEED;
      if (p.dashDirX !== 0) p.facing = p.dashDirX > 0 ? 1 : -1;
      state.dashTrail.push({
        x: p.x,
        y: p.y,
        facing: p.facing,
        anim: p.anim,
        charId: p.charId,
        life: 0.18,
        maxLife: 0.18,
      });
    } else {
      p.dashing = false;
      p.vx *= 0.42;
      p.vy *= 0.42;
      p.dashCooldown = DASH_COOLDOWN;
    }
  } else if (wantDash && !p.dashHeld && p.dashes > 0 && p.dashCooldown <= 0) {
    startDash(p);
  } else if (wantDash && !p.dashHeld && p.dashes <= 0) {
    state.particles.push({
      x: p.x,
      y: p.y - 8,
      vx: 0,
      vy: -40,
      life: 0.2,
      color: "#8a8175",
    });
  }
  p.dashHeld = wantDash;
  return dashedJump;
}

function updatePickups(dt) {
  for (const p of alivePlayers()) {
    for (const it of state.level.pickups) {
      if (it.respawn > 0) continue;
      const y = it.y + Math.sin(state.time * 3 + it.bob) * 5;
      const dx = it.x - p.x;
      const dy = y - (p.y - 8);
      if (dx * dx + dy * dy > (it.r + 18) ** 2) continue;
      if (p.dashes >= p.maxDashes) continue;
      p.dashes = p.maxDashes;
      it.respawn = 2.6;
      addParticle(it.x, y, "#c45c26");
      break;
    }
  }
  for (const it of state.level.pickups) {
    if (it.respawn > 0) it.respawn = Math.max(0, it.respawn - dt);
  }
}

function updatePlayer(dt, p) {
  if (p.dead) return false;
  const c = CTRL[p.scheme] || CTRL.solo;

  let mx = 0;
  if (keyDown(c.left)) mx -= 1;
  if (keyDown(c.right)) mx += 1;
  if (p.dashTime <= 0) p.vx = mx * MOVE_SPEED;
  if (mx !== 0 && p.dashTime <= 0) p.facing = mx > 0 ? 1 : -1;

  const dashedJump = updateDash(dt, p);

  const wantJump = keyDown(c.jump);
  if (!dashedJump && p.dashTime <= 0 && wantJump && !p.jumpHeld) {
    if (p.onGround || p.jumpsLeft > 0) {
      state.didJump = true;
      const isDouble = !p.onGround;
      p.vy = isDouble ? DOUBLE_JUMP_V : JUMP_V;
      p.onGround = false;
      p.jumpsLeft = Math.max(0, (isDouble ? p.jumpsLeft : MAX_JUMPS) - 1);
      if (isDouble) {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (Math.random() - 0.5) * 1.2;
          const sp = 60 + Math.random() * 80;
          state.particles.push({
            x: p.x,
            y: p.y + p.h * 0.2,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0.25 + Math.random() * 0.15,
            color: "#1a1a1a",
          });
        }
      }
    }
  }
  p.jumpHeld = wantJump;

  if (Math.abs(p.vx) > 10 || !p.onGround) p.anim += dt;
  else p.anim += dt * 0.3;

  if (p.invuln > 0) p.invuln -= dt;
  if (p.fireTimer > 0) p.fireTimer -= dt;

  // 攻击：单人可用鼠标或 J；双人用各自攻击键
  if (p.scheme === "solo") {
    if (mouse.down) fireArrow(p);
  }
  if (c.attack) {
    const wantAtk = keyDown(c.attack);
    if (wantAtk && !p.attackHeld) fireArrow(p);
    p.attackHeld = wantAtk;
  } else {
    p.attackHeld = false;
  }

  if (p.riding) p.x += p.riding.move.dx;

  const fell = resolvePlatforms(p, dt);
  if (p.onGround) p.jumpsLeft = MAX_JUMPS;
  if (!p.onGround) p.dashLanded = false;
  if (p.onGround && p.dashTime <= 0 && !p.dashLanded) {
    const before = p.dashes;
    p.dashes = p.maxDashes;
    p.dashLanded = true;
    if (before < p.dashes) {
      for (let i = 0; i < 4; i++) {
        state.particles.push({
          x: p.x + (Math.random() - 0.5) * 10,
          y: p.y + p.h * 0.35,
          vx: (Math.random() - 0.5) * 50,
          vy: -30 - Math.random() * 40,
          life: 0.22,
          color: "#c45c26",
        });
      }
    }
  }

  if (fell === "fell") {
    if (damagePlayer(25, 0, p)) return true;
    if (p.dead) return false;
    p.invuln = 0.8;
    p.x = 80 + (p.scheme === "p2" ? 50 : 0);
    p.y = 440;
    p.vx = 0;
    p.vy = 0;
    p.jumpsLeft = MAX_JUMPS;
    p.jumpHeld = false;
    p.dashTime = 0;
    p.dashing = false;
    p.dashes = p.maxDashes;
    addParticle(p.x, p.y, "#c23b3b");
  }
  return false;
}

function update(dt) {
  state.time += dt;
  if (state.shake > 0) {
    state.shake -= dt;
    if (state.shake <= 0) {
      state.shake = 0;
      state.shakeMag = 0;
    }
  }

  updateMovingPlatforms(dt);

  for (const p of state.players) {
    if (updatePlayer(dt, p)) return;
  }

  updatePickups(dt);
  if (updateTraps(dt)) return;

  // 任一存活玩家碰终点即过关
  const g = state.level.goal;
  for (const p of alivePlayers()) {
    if (
      rectOverlap(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, g.x, g.y, g.w, g.h)
    ) {
      advanceStage();
      return;
    }
  }

  // 箭矢
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.vy += 200 * dt;
    pr.angle = Math.atan2(pr.vy, pr.vx);
    pr.life -= dt;

    let hitPlat = false;
    for (const pl of state.level.platforms) {
      if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) {
        hitPlat = true;
        break;
      }
    }
    if (pr.life <= 0 || hitPlat || pr.x < -40 || pr.x > state.level.width + 40) {
      state.projectiles.splice(i, 1);
      continue;
    }

    for (let j = state.level.enemies.length - 1; j >= 0; j--) {
      const e = state.level.enemies[j];
      if (pr.hit.has(e)) continue;
      const body = monsterBodyCenter(e);
      const dx = body.x - pr.x;
      const dy = body.y - pr.y;
      if (dx * dx + dy * dy < (e.radius + 5) ** 2) {
        pr.hit.add(e);
        const hit = rollCritDamage(pr.damage);
        e.hp -= hit.damage;
        e.hurt = hit.crit ? 0.3 : 0.2;
        addParticle(pr.x, pr.y, hit.crit ? "#c23b3b" : "#c45c26");
        if (hit.crit) {
          triggerShake(5.5, 0.16);
          pushCritText(e);
        }
        state.projectiles.splice(i, 1);
        if (e.hp <= 0) {
          state.score += e.score;
          state.kills += 1;
          addParticle(body.x, body.y, monsterParticleColor(e.type));
          state.level.enemies.splice(j, 1);
        }
        break;
      }
    }
  }

  // 敌人巡逻 / 追最近玩家
  for (const e of state.level.enemies) {
    e.anim += dt;
    if (e.hurt > 0) e.hurt -= dt;

    e.x += e.vx * dt;
    if (e.x < e.patrolMin) {
      e.x = e.patrolMin;
      e.vx = Math.abs(e.vx);
      e.facing = 1;
    } else if (e.x > e.patrolMax) {
      e.x = e.patrolMax;
      e.vx = -Math.abs(e.vx);
      e.facing = -1;
    }

    const body = monsterBodyCenter(e);
    const target = nearestPlayer(body.x, body.y);
    if (!target) continue;
    const dx = target.x - body.x;
    const dy = target.y - body.y;
    const dist = Math.hypot(dx, dy);

    if (e.attack === "fireball") {
      if (e.fireTimer > 0) e.fireTimer -= dt;
      if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
      const prefer = e.preferRange || 210;
      if (dist < prefer + 80 && Math.abs(dy) < 170) {
        if (dist < prefer - 36) {
          e.vx = -Math.sign(dx || 1) * Math.max(40, e.speed * 0.65);
        }
        if (e.fireTimer <= 0 && dist < prefer + 40) {
          e.fireTimer = e.fireCooldown || 1.3;
          const ang = Math.atan2(dy, dx);
          const spd = e.fireballSpeed || 210;
          state.enemyProjectiles.push({
            x: body.x + Math.cos(ang) * 18,
            y: body.y + Math.sin(ang) * 8,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            angle: ang,
            life: 2.2,
            damage: Math.max(6, Math.round(e.damage * 0.9)),
            radius: 9,
          });
        }
      }
    } else if (dist < 220 && Math.abs(dy) < 100) {
      e.vx = Math.sign(dx) * (e.speed * 1.35 || 90);
      e.facing = Math.sign(dx) || e.facing;
    }

    for (const p of alivePlayers()) {
      const pdx = p.x - body.x;
      const pdy = p.y - body.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd < e.radius + 18 && p.invuln <= 0) {
        p.hp -= e.damage;
        p.invuln = 0.7;
        p.vx = Math.sign(p.x - e.x) * 220;
        p.vy = -280;
        addParticle(p.x, p.y, "#c23b3b");
        if (p.hp <= 0) {
          p.hp = 0;
          p.dead = true;
          updateHud();
          if (alivePlayers().length === 0) {
            endGame(false);
            return;
          }
        }
      }
    }
  }

  if (updateEnemyProjectiles(dt)) return;

  for (let i = state.dashTrail.length - 1; i >= 0; i--) {
    state.dashTrail[i].life -= dt;
    if (state.dashTrail[i].life <= 0) state.dashTrail.splice(i, 1);
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.meleeFx.length - 1; i >= 0; i--) {
    state.meleeFx[i].life -= dt;
    if (state.meleeFx[i].life <= 0) state.meleeFx.splice(i, 1);
  }

  if (state.floatTexts) {
    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const ft = state.floatTexts[i];
      ft.life -= dt;
      ft.y -= 36 * dt;
      if (ft.life <= 0) state.floatTexts.splice(i, 1);
    }
  }

  syncCamera(dt);
  if (!state.coop) updateGuide(dt);
  updateHud();
}

function updateEnemyProjectiles(dt) {
  const list = state.enemyProjectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.angle = Math.atan2(pr.vy, pr.vx);
    pr.life -= dt;

    let gone = pr.life <= 0 || pr.x < -40 || pr.x > state.level.width + 40;
    if (!gone) {
      for (const pl of state.level.platforms) {
        if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) {
          gone = true;
          break;
        }
      }
    }
    if (!gone) {
      for (const p of alivePlayers()) {
        const dx = p.x - pr.x;
        const dy = p.y - 6 - pr.y;
        if (dx * dx + dy * dy < (pr.radius + 12) ** 2) {
          gone = true;
          if (p.invuln <= 0) {
            p.x += Math.sign(dx || 1) * 8;
            if (damagePlayer(pr.damage, -240, p)) {
              list.splice(i, 1);
              return true;
            }
          }
          break;
        }
      }
    }
    if (gone) list.splice(i, 1);
  }
  return false;
}

function syncCamera(dt, instant = false) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const alive = alivePlayers();
  let focusX = state.player.x;
  let focusY = state.player.y;
  // 单人略偏右下；双人居中框住两人
  let biasX = 0.38;
  let biasY = 0.58;

  if (alive.length === 1) {
    focusX = alive[0].x;
    focusY = alive[0].y;
  } else if (alive.length >= 2) {
    biasX = 0.5;
    biasY = 0.5;
    const minX = Math.min(...alive.map((p) => p.x));
    const maxX = Math.max(...alive.map((p) => p.x));
    const minY = Math.min(...alive.map((p) => p.y));
    const maxY = Math.max(...alive.map((p) => p.y));
    focusX = (minX + maxX) * 0.5;
    focusY = (minY + maxY) * 0.5;
  }

  const targetX = focusX - viewW * biasX;
  const targetY = focusY - viewH * biasY;
  const maxX = Math.max(0, state.level.width - viewW);
  const maxY = Math.max(0, state.level.height - viewH);
  const minY = viewH > state.level.height ? (state.level.height - viewH) / 2 : 0;
  const tx = Math.max(0, Math.min(maxX, targetX));
  const ty = Math.max(minY, Math.min(maxY || minY, targetY));
  if (instant || dt == null) {
    state.camera.x = tx;
    state.camera.y = ty;
  } else {
    const k = Math.min(1, 10 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }
  clampCoopPlayersToCamera();
}

/** 双人：把玩家限制在当前镜头内，领先者不能把落后的人甩出画面 */
function clampCoopPlayersToCamera() {
  if (!state?.coop) return;
  const alive = alivePlayers();
  if (alive.length < 2) return;

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const cam = state.camera;
  const left = cam.x + COOP_PAD_X;
  const right = cam.x + viewW - COOP_PAD_X;
  const top = cam.y + COOP_PAD_Y;
  const bottom = cam.y + viewH - COOP_PAD_Y;

  for (const p of alive) {
    const hw = (p.w || 24) * 0.5;
    const hh = (p.h || 40) * 0.5;
    const minX = left + hw;
    const maxX = right - hw;
    const minY = top + hh;
    const maxY = bottom - hh;

    if (p.x < minX) {
      p.x = minX;
      if (p.vx < 0) p.vx = 0;
      if (p.dashing && p.dashDirX < 0) {
        p.dashTime = 0;
        p.dashing = false;
      }
    } else if (p.x > maxX) {
      p.x = maxX;
      if (p.vx > 0) p.vx = 0;
      if (p.dashing && p.dashDirX > 0) {
        p.dashTime = 0;
        p.dashing = false;
      }
    }

    if (p.y < minY) {
      p.y = minY;
      if (p.vy < 0) p.vy = 0;
      if (p.dashing && p.dashDirY < 0) {
        p.dashTime = 0;
        p.dashing = false;
      }
    } else if (p.y > maxY) {
      p.y = maxY;
      if (p.vy > 0) p.vy = 0;
      if (p.dashing && p.dashDirY > 0) {
        p.dashTime = 0;
        p.dashing = false;
      }
    }
  }
}

function drawPlatforms(sx, sy) {
  for (const pl of state.level.platforms) {
    if (pl.rock) continue;
    const x = sx(pl.x);
    const y = sy(pl.y);
    ctx.fillStyle = pl.move ? "#e2d5c0" : "#ebe4d6";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x, y, pl.w, pl.h);
    ctx.fill();
    ctx.stroke();
    if (pl.move) {
      ctx.beginPath();
      ctx.moveTo(x + 10, y + pl.h * 0.55);
      ctx.lineTo(x + 18, y + pl.h * 0.28);
      ctx.lineTo(x + 18, y + pl.h * 0.82);
      ctx.moveTo(x + pl.w - 10, y + pl.h * 0.55);
      ctx.lineTo(x + pl.w - 18, y + pl.h * 0.28);
      ctx.lineTo(x + pl.w - 18, y + pl.h * 0.82);
      ctx.stroke();
    }
    // 顶面高光
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 3);
    ctx.lineTo(x + pl.w - 2, y + 3);
    ctx.strokeStyle = "rgba(26,26,26,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "#1a1a1a";
  }
}

function drawSpikes(sx, sy) {
  ctx.fillStyle = "#1a1a1a";
  for (const s of state.level.spikes) {
    const unit = s.w / s.count;
    const baseY = sy(s.y + s.h);
    const tipY = sy(s.y);
    for (let i = 0; i < s.count; i++) {
      const x0 = sx(s.x + i * unit);
      ctx.beginPath();
      ctx.moveTo(x0 + 1.5, baseY);
      ctx.lineTo(x0 + unit / 2, tipY);
      ctx.lineTo(x0 + unit - 1.5, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawBoulder(x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#d7cebf";
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, h * 0.08);
  ctx.lineTo(-w * 0.34, -h * 0.28);
  ctx.lineTo(-w * 0.08, -h * 0.46);
  ctx.lineTo(w * 0.22, -h * 0.34);
  ctx.lineTo(w * 0.46, -h * 0.02);
  ctx.lineTo(w * 0.3, h * 0.38);
  ctx.lineTo(-w * 0.12, h * 0.44);
  ctx.lineTo(-w * 0.4, h * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.08, -h * 0.12);
  ctx.lineTo(w * 0.06, h * 0.08);
  ctx.lineTo(-w * 0.04, h * 0.24);
  ctx.stroke();
  ctx.restore();
}

function drawRocks(sx, sy) {
  const t = state.time;
  for (const r of state.level.rocks) {
    let alpha = 0.14;
    let rx = 9;
    if (r.phase === "warn") {
      const pulse = Math.sin(t * 22);
      alpha = 0.24 + pulse * 0.1;
      rx = 13 + pulse * 3;
    } else if (r.phase === "fall") {
      const span = Math.max(40, r.landY - r.homeY);
      const k = Math.min(1, Math.max(0, (r.y - r.homeY) / span));
      alpha = 0.2 + k * 0.28;
      rx = 12 + k * 8;
    }
    if (r.phase !== "rest") {
      ctx.fillStyle = `rgba(26,26,26,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(sx(r.x), sy(r.landY) + 1, rx, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const wobble = r.phase === "warn" ? Math.sin(t * 42 + r.x) * 2.4 : 0;
    drawBoulder(sx(r.x) + wobble, sy(r.y), r.w, r.h);

    if (r.phase === "warn") {
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.5;
      const x = sx(r.x);
      const y = sy(r.y);
      ctx.beginPath();
      ctx.moveTo(x - r.w * 0.72, y - 7);
      ctx.lineTo(x - r.w * 0.72, y + 6);
      ctx.moveTo(x + r.w * 0.72, y - 5);
      ctx.lineTo(x + r.w * 0.72, y + 8);
      ctx.stroke();
    }
  }
}

function drawPickups(sx, sy) {
  for (const it of state.level.pickups) {
    if (it.respawn > 0) continue;
    const y = it.y + Math.sin(state.time * 3 + it.bob) * 5;
    const x = sx(it.x);
    const py = sy(y);
    ctx.save();
    ctx.translate(x, py);
    ctx.rotate(Math.sin(state.time * 1.4 + it.bob) * 0.35);
    ctx.fillStyle = "#f3e2b0";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3.5, 2);
    ctx.lineTo(0, -3.5);
    ctx.lineTo(3.5, 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDashTrail(sx, sy) {
  const p = state.player;
  for (const t of state.dashTrail) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.save();
    ctx.globalAlpha = a * 0.42;
    drawCharacter(
      ctx,
      t.charId || p.charId || "archer",
      sx(t.x),
      sy(t.y),
      t.facing || 1,
      t.anim || 0
    );
    ctx.restore();
  }
}

function drawGoal(sx, sy) {
  const g = state.level.goal;
  const x = sx(g.x);
  const y = sy(g.y);
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#c45c26";
  ctx.lineWidth = 2;
  // 旗杆
  ctx.beginPath();
  ctx.moveTo(x + 4, y + g.h);
  ctx.lineTo(x + 4, y);
  ctx.stroke();
  // 旗
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + 36, y + 12);
  ctx.lineTo(x + 4, y + 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const cam = state.camera;
  const shakeX =
    state.shake > 0 ? (Math.random() - 0.5) * 2 * (state.shakeMag || 5) : 0;
  const shakeY =
    state.shake > 0 ? (Math.random() - 0.5) * 2 * (state.shakeMag || 5) : 0;

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // 天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0, "#d8e4ec");
  sky.addColorStop(0.55, "#e8e4d8");
  sky.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = sky;
  ctx.fillRect(-8, -8, viewW + 16, viewH + 16);

  // 远景山丘
  ctx.fillStyle = "rgba(26,26,26,0.06)";
  ctx.beginPath();
  ctx.moveTo(0, viewH * 0.7);
  for (let i = 0; i < 8; i++) {
    const hx = ((i * 220 - (cam.x * 0.15) % 220) );
    ctx.quadraticCurveTo(hx + 80, viewH * 0.5, hx + 160, viewH * 0.7);
  }
  ctx.lineTo(viewW, viewH);
  ctx.lineTo(0, viewH);
  ctx.fill();

  const sx = (wx) => wx - cam.x;
  const sy = (wy) => wy - cam.y;

  drawPlatforms(sx, sy);
  drawGoal(sx, sy);

  // 环境装饰
  for (const d of state.level.decor) {
    if (d.kind === "house") {
      drawHouse(ctx, sx(d.x), sy(d.y), d.scale, d.variant);
    } else {
      drawSprout(ctx, sx(d.x), sy(d.y), d.scale, d.variant, state.time);
    }
  }

  drawSpikes(sx, sy);
  drawRocks(sx, sy);
  drawPickups(sx, sy);

  for (const e of state.level.enemies) {
    const ds = e.drawScale || 0.72;
    drawMonster(ctx, e.type, sx(e.x), sy(e.y), ds, e.anim, e.hurt, e.facing, "feet");
    if (e.hp < e.maxHp) {
      const ratio = e.hp / e.maxHp;
      const top = sy(e.y) - (e.drawH || 40) - 8;
      ctx.fillStyle = "rgba(26,26,26,0.25)";
      ctx.fillRect(sx(e.x) - 16, top, 32, 4);
      ctx.fillStyle = "#c23b3b";
      ctx.fillRect(sx(e.x) - 16, top, 32 * ratio, 4);
    }
  }

  const alive = alivePlayers();
  drawDashTrail(sx, sy);
  for (const p of state.players) {
    if (p.dead) continue;
    if (p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0) continue;
    drawCharacter(ctx, p.charId || "archer", sx(p.x), sy(p.y), p.facing, p.anim);
    if (state.coop) {
      ctx.fillStyle = p.scheme === "p1" ? "#c45c26" : "#3a6ea5";
      ctx.font = "bold 11px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText(p.scheme === "p1" ? "P1" : "P2", sx(p.x), sy(p.y) - 48);
    }
  }
  if (alive.length === 0 && state.player) {
    // 全灭后仍可能闪一帧
  }

  for (const pr of state.projectiles) {
    drawWeaponProjectile(ctx, pr.weapon || "arrow", sx(pr.x), sy(pr.y), pr.angle, pr.life);
  }

  for (const pr of state.enemyProjectiles) {
    drawFireball(ctx, sx(pr.x), sy(pr.y), pr.angle, Math.min(1, pr.life), 0.85);
  }

  for (const fx of state.meleeFx) {
    ctx.globalAlpha = Math.max(0, fx.life / fx.maxLife);
    drawWeaponProjectile(
      ctx,
      fx.weapon === "bolt" ? "slash" : fx.weapon,
      sx(fx.x),
      sy(fx.y),
      fx.angle,
      fx.life
    );
    ctx.globalAlpha = 1;
  }

  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2.2);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(sx(pt.x), sy(pt.y), 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 暴击飘字
  for (const ft of state.floatTexts || []) {
    const t = Math.max(0, ft.life / ft.maxLife);
    ctx.globalAlpha = Math.min(1, t * 1.5);
    ctx.fillStyle = "#c23b3b";
    ctx.strokeStyle = "rgba(255,248,235,0.95)";
    ctx.lineWidth = 3;
    ctx.font = "bold 20px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(ft.text, sx(ft.x), sy(ft.y));
    ctx.fillText(ft.text, sx(ft.x), sy(ft.y));
    ctx.globalAlpha = 1;
  }

  // 准星
  ctx.strokeStyle = "rgba(26,26,26,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mouse.x - shakeX, mouse.y - shakeY, 8, 0, Math.PI * 2);
  ctx.moveTo(mouse.x - shakeX - 12, mouse.y - shakeY);
  ctx.lineTo(mouse.x - shakeX + 12, mouse.y - shakeY);
  ctx.moveTo(mouse.x - shakeX, mouse.y - shakeY - 12);
  ctx.lineTo(mouse.x - shakeX, mouse.y - shakeY + 12);
  ctx.stroke();
  ctx.restore();
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  if (running) raf = requestAnimationFrame(loop);
}

function beginRun(charId) {
  if (charId && !coopMode) selectedCharId = charId;
  loadMonsters().then(() => {
    state = createState(1);
    running = true;
    els.overlay.classList.add("hidden");
    els.charSelect?.classList.add("hidden");
    els.gameover.classList.add("hidden");
    hideJoin2P();
    syncCamera(null, true);
    resetGuide();
    updateHud();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

function hideJoin2P() {
  els.btnJoin2P?.classList.add("hidden");
  els.btnJoin2P?.classList.remove("active");
}

function toggleJoin2P() {
  if (coopMode) {
    // 取消双人，回到单人选角
    coopMode = false;
    pickSlot = 0;
    if (els.overlaySub) {
      els.overlaySub.textContent = "A/D 移动 · 空格/W/↑/K 跳跃 · Shift/L 冲刺 · 鼠标或 J 攻击";
    }
  } else {
    coopMode = true;
    pickSlot = 0;
    if (els.overlaySub) {
      els.overlaySub.textContent =
        "P1：WASD 移动 · K 跳 · L 冲刺 · J 攻击　｜　P2：方向键移动 · 2 跳 · 3 冲刺 · 1 攻击";
    }
  }
  openCharSelect();
}

function openCharSelect() {
  running = false;
  cancelAnimationFrame(raf);
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");
  hideGuide();

  let title = "平台模式 · 选择角色";
  if (coopMode) {
    title = pickSlot === 0 ? "双人模式 · 选择玩家1" : "双人模式 · 选择玩家2";
  }

  showCharSelect(
    els.charSelect,
    els.charGrid,
    title,
    (id) => {
      if (coopMode) {
        selectedCharIds[pickSlot] = id;
        if (pickSlot === 0) {
          pickSlot = 1;
          openCharSelect();
          return;
        }
        beginRun();
      } else {
        beginRun(id);
      }
    },
    {
      // 选 P2 时隐藏按钮，避免中途取消导致状态乱
      showJoin2P: !(coopMode && pickSlot === 1),
      joinActive: coopMode,
    }
  );
}

export function startPlatform(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  keys = Object.create(null);
  mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
  coopMode = false;
  pickSlot = 0;

  els.hud.classList.remove("hidden");
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");
  els.p2Stat?.classList.add("hidden");
  if (els.overlaySub) {
    els.overlaySub.textContent = "A/D 移动 · 空格/W/↑/K 跳跃 · Shift/L 冲刺 · 鼠标或 J 攻击";
  }

  resize();
  on(window, "resize", resize);

  on(window, "keydown", (e) => {
    keys[e.code] = true;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Digit1", "Digit2", "Digit3"].includes(
        e.code
      )
    ) {
      e.preventDefault();
    }
  });
  on(window, "keyup", (e) => {
    keys[e.code] = false;
  });
  on(window, "mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  on(window, "mousedown", (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (running && !coopMode && state?.player) fireArrow(state.player);
    }
  });
  on(window, "mouseup", (e) => {
    if (e.button === 0) mouse.down = false;
  });
  on(window, "blur", () => {
    mouse.down = false;
    keys = Object.create(null);
  });

  if (els.btnJoin2P) els.btnJoin2P.onclick = toggleJoin2P;
  els.btnStart.onclick = openCharSelect;
  els.btnRestart.onclick = () => {
    coopMode = false;
    pickSlot = 0;
    openCharSelect();
  };
  openCharSelect();
}

export function stopPlatform() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.charSelect?.classList.add("hidden");
  els.p2Stat?.classList.add("hidden");
  hideJoin2P();
  hideGuide();
}
