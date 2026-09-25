import {
  drawXpOrb,
  drawGround,
  drawHouse,
  drawSprout,
  drawTornado,
  drawFireball,
} from "./draw.js";
import { getCharacter, drawCharacter, drawWeaponProjectile } from "./characters.js";
import { showCharSelect } from "./charselect.js";
import {
  loadMonsters,
  drawMonster,
  makeMonsterStats,
  createSpawnRotator,
  monsterParticleColor,
  unlockedMonsters,
} from "./monsters.js";

const WORLD = { w: 3200, h: 3200 };
const STAGE_DURATION = 48; // 秒 / 关
const CRIT_CHANCE = 0.18;
const CRIT_MULT = 2;

const UPGRADES = [
  {
    id: "damage",
    title: "锐利箭簇",
    desc: "箭矢伤害 +8",
    apply: (s) => {
      s.player.damage += 8;
    },
  },
  {
    id: "crit",
    title: "暴击专精",
    desc: "暴击率 +12%，暴击伤害更高",
    apply: (s) => {
      s.player.critChance = Math.min(0.55, (s.player.critChance || CRIT_CHANCE) + 0.12);
      s.player.critMult = (s.player.critMult || CRIT_MULT) + 0.35;
    },
  },
  {
    id: "firerate",
    title: "连射",
    desc: "射速提升 18%",
    apply: (s) => {
      s.player.fireCooldown *= 0.82;
    },
  },
  {
    id: "multishot",
    title: "多重箭",
    desc: "额外射出 1 支箭",
    apply: (s) => {
      s.player.projectileCount += 1;
    },
  },
  {
    id: "speed",
    title: "疾步",
    desc: "移动速度 +18",
    apply: (s) => {
      s.player.speed += 18;
    },
  },
  {
    id: "maxhp",
    title: "坚韧",
    desc: "最大生命 +25，并回复 25",
    apply: (s) => {
      s.player.maxHp += 25;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 25);
    },
  },
  {
    id: "magnet",
    title: "聚灵",
    desc: "经验吸附范围扩大",
    apply: (s) => {
      s.player.magnet += 40;
    },
  },
  {
    id: "pierce",
    title: "贯穿",
    desc: "箭矢可再多穿透 1 个敌人",
    apply: (s) => {
      s.player.pierce += 1;
    },
  },
  {
    id: "tornado",
    title: "龙卷风",
    desc: "强化全屏龙卷风：伤害↑、冷却↓",
    apply: (s) => {
      s.player.tornadoLevel += 1;
      s.player.tornadoCooldown = Math.max(3.5, s.player.tornadoCooldown * 0.85);
      s.player.tornadoDamage += 10;
      s.player.tornadoRadius += 16;
      s.player.tornadoDuration += 0.2;
    },
  },
];

function seededRand(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildProps() {
  const props = [];
  // 若干村落聚落
  for (let c = 0; c < 14; c++) {
    const cx = 200 + seededRand(c * 3 + 1) * (WORLD.w - 400);
    const cy = 200 + seededRand(c * 3 + 2) * (WORLD.h - 400);
    const houses = 5 + Math.floor(seededRand(c * 5) * 8);
    for (let i = 0; i < houses; i++) {
      const a = seededRand(c * 40 + i) * Math.PI * 2;
      const d = 10 + seededRand(c * 40 + i + 9) * 70;
      props.push({
        kind: "house",
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d * 0.7,
        scale: 0.85 + seededRand(c + i) * 0.45,
        variant: Math.floor(seededRand(c * 7 + i) * 6),
      });
    }
    const sprouts = 8 + Math.floor(seededRand(c + 99) * 12);
    for (let i = 0; i < sprouts; i++) {
      const a = seededRand(c * 80 + i + 3) * Math.PI * 2;
      const d = 20 + seededRand(c * 80 + i + 5) * 100;
      props.push({
        kind: "sprout",
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d * 0.75,
        scale: 0.7 + seededRand(c * 2 + i) * 0.5,
        variant: Math.floor(seededRand(c * 11 + i) * 4),
      });
    }
  }
  // 零散草苗
  for (let i = 0; i < 120; i++) {
    props.push({
      kind: "sprout",
      x: 80 + seededRand(i * 17 + 1) * (WORLD.w - 160),
      y: 80 + seededRand(i * 17 + 2) * (WORLD.h - 160),
      scale: 0.6 + seededRand(i) * 0.5,
      variant: Math.floor(seededRand(i * 3) * 4),
    });
  }
  return props;
}

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let mouse = { x: 0, y: 0, down: false };
let lastTs = 0;
let running = false;
let paused = false;
let raf = 0;
let onKeyDown = null;
let onKeyUp = null;
let onResize = null;
let onMouseMove = null;
let onMouseDown = null;
let onMouseUp = null;

function xpToLevel(level) {
  return Math.floor(12 + level * 10 + level * level * 2.2);
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let selectedCharId = "archer";

function createState() {
  const ch = getCharacter(selectedCharId);
  const s = ch.survivor;
  return {
    time: 0,
    kills: 0,
    stage: 1,
    stageTimer: STAGE_DURATION,
    spawnTimer: 0,
    spawnInterval: 1.15,
    spawnRotator: createSpawnRotator(1),
    camera: { x: 0, y: 0 },
    props: buildProps(),
    tornados: [],
    player: {
      charId: ch.id,
      attackType: ch.attackType,
      weapon: s.weapon,
      meleeRange: s.meleeRange || 0,
      x: WORLD.w / 2,
      y: WORLD.h / 2,
      radius: 16,
      speed: s.speed,
      hp: s.maxHp,
      maxHp: s.maxHp,
      facing: 1,
      anim: 0,
      moving: false,
      invuln: 0,
      level: 1,
      xp: 0,
      xpNext: xpToLevel(1),
      damage: s.damage,
      critChance: CRIT_CHANCE,
      critMult: CRIT_MULT,
      fireCooldown: s.fireCooldown,
      fireTimer: 0,
      projectileCount: 1,
      projectileSpeed: s.projectileSpeed,
      pierce: s.pierce,
      magnet: 70,
      // 龙卷风仅魔法师可用
      canTornado: ch.id === "mage",
      tornadoLevel: ch.id === "mage" ? 1 + (s.tornadoBonus || 0) : 0,
      tornadoCooldown: s.tornadoBonus ? 6 : 8,
      tornadoCdLeft: 0,
      tornadoDamage: 28 + (s.tornadoBonus ? 12 : 0),
      tornadoRadius: 68 + (s.tornadoBonus ? 20 : 0),
      tornadoDuration: 1.6,
    },
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    meleeFx: [],
    orbs: [],
    particles: [],
    floatTexts: [],
    screenFlash: 0,
    shake: 0,
    shakeMag: 0,
  };
}

function updateHud() {
  const p = state.player;
  els.hpFill.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
  els.xpFill.style.transform = `scaleX(${Math.max(0, p.xp / p.xpNext)})`;
  els.hpText.textContent = `${Math.ceil(p.hp)}`;
  els.levelText.textContent = `Lv.${p.level}`;
  els.timeText.textContent = formatTime(state.time);
  els.killText.textContent = `击杀 ${state.kills}`;
  if (els.stageText) els.stageText.textContent = `关卡 ${state.stage}`;
}

function currentStage() {
  return Math.max(1, 1 + Math.floor(state.time / STAGE_DURATION));
}

function spawnEnemy() {
  const p = state.player;
  const angle = Math.random() * Math.PI * 2;
  const dist = 420 + Math.random() * 180;
  const x = Math.max(40, Math.min(WORLD.w - 40, p.x + Math.cos(angle) * dist));
  const y = Math.max(40, Math.min(WORLD.h - 40, p.y + Math.sin(angle) * dist));
  const type = state.spawnRotator.next();
  const stats = makeMonsterStats(type, state.stage);
  state.enemies.push({
    ...stats,
    x,
    y,
  });
}

function paintMagicCard() {
  const host = els.magicPreview;
  if (!host) return;
  let c = host.querySelector("canvas");
  if (!c) {
    c = document.createElement("canvas");
    host.appendChild(c);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = host.clientWidth || 120;
  const h = host.clientHeight || 72;
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.width = w + "px";
  c.style.height = h + "px";
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#d8e0e8";
  g.fillRect(0, 0, w, h);
  drawTornado(g, w * 0.5, h * 0.62, 0.55, 1.2, 1);
}

function updateMagicUi() {
  if (!state || !els.magicBtn) return;
  const p = state.player;
  const canUse = !!p.canTornado && p.tornadoLevel > 0;
  const ready = canUse && p.tornadoCdLeft <= 0;
  els.magicBtn.disabled = !ready;
  els.magicBtn.classList.toggle("cooling", canUse && !ready);
  els.magicBtn.classList.toggle("locked", !canUse);
  if (els.magicCd) {
    els.magicCd.textContent = !canUse
      ? "仅魔法师"
      : ready
        ? "就绪 · Q"
        : `${p.tornadoCdLeft.toFixed(1)}s · Q`;
  }
}

/** 手动全屏龙卷风：仅魔法师 */
function castTornadoMagic() {
  const p = state.player;
  if (!running || paused || !p.canTornado || p.tornadoLevel <= 0) return false;
  if (p.tornadoCdLeft > 0) return false;

  p.tornadoCdLeft = p.tornadoCooldown;
  state.screenFlash = 0.45;

  // 全屏伤害：所有敌人立即结算
  const dmg = p.tornadoDamage * (1 + (p.tornadoLevel - 1) * 0.35);
  const doomed = [];
  for (const e of state.enemies) {
    e.hp -= dmg;
    e.hurt = 0.35;
    const ang = Math.atan2(e.y - p.y, e.x - p.x) + 0.6;
    e.x += Math.cos(ang) * 24;
    e.y += Math.sin(ang) * 24;
    addParticle(e.x, e.y, "#6a7a88");
    if (e.hp <= 0) doomed.push(e);
  }
  for (const e of doomed) {
    const idx = state.enemies.indexOf(e);
    if (idx >= 0) killEnemy(e, idx);
  }

  // 覆盖镜头范围的多股龙卷风视觉
  const cam = state.camera;
  const viewScale = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h) || 1;
  const halfW = (window.innerWidth / viewScale) * 0.5;
  const halfH = (window.innerHeight / viewScale) * 0.5;
  const count = 5 + Math.min(3, p.tornadoLevel);
  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * halfW * 1.6;
    const oy = (Math.random() - 0.5) * halfH * 1.6;
    state.tornados.push({
      x: cam.x + ox,
      y: cam.y + oy,
      life: p.tornadoDuration,
      maxLife: p.tornadoDuration,
      anim: Math.random() * 10,
      radius: p.tornadoRadius * 1.4,
      damage: 0, // 伤害已在施放瞬间结算
      tick: 99,
      hit: new Map(),
      fullscreen: true,
    });
  }

  updateMagicUi();
  return true;
}

function spawnTornado() {
  // 兼容升级文案：改为触发一次全屏魔法（仅在冷却好时）
  castTornadoMagic();
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
  const top = e.y - (e.drawH || e.radius * 2 || 40) * 0.55 - 10;
  state.floatTexts.push({
    x: e.x,
    y: top,
    text: "暴击",
    life: 0.75,
    maxLife: 0.75,
  });
}

function fireProjectiles() {
  const p = state.player;
  if (p.fireTimer > 0) return;
  p.fireTimer = p.fireCooldown;

  const cam = state.camera;
  const aimX = mouse.x + cam.x;
  const aimY = mouse.y + cam.y;
  const baseAngle = Math.atan2(aimY - p.y, aimX - p.x);
  p.facing = Math.cos(baseAngle) >= 0 ? 1 : -1;

  // —— 近战：朝瞄准方向挥砍（不要求贴身才可出招）——
  if (p.attackType === "melee") {
    const range = Math.max(p.meleeRange || 70, 220);
    const hits = [];
    for (const e of state.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.radius) continue;
      const dot = dx * Math.cos(baseAngle) + dy * Math.sin(baseAngle);
      if (dot < -8) continue;
      hits.push({ e, d });
    }
    state.meleeFx.push({
      x: p.x + Math.cos(baseAngle) * 28,
      y: p.y + Math.sin(baseAngle) * 20 - 4,
      angle: baseAngle,
      weapon: p.weapon,
      life: 0.22,
      maxLife: 0.22,
    });
    // 无敌人也可挥砍，仅无伤害
    if (hits.length === 0) return;
    hits.sort((a, b) => a.d - b.d);

    const maxHits = p.charId === "knight" ? 2 : 3;
    const doomed = [];
    let anyCrit = false;
    for (let i = 0; i < Math.min(maxHits, hits.length); i++) {
      const e = hits[i].e;
      if (!state.enemies.includes(e)) continue;
      const hit = rollCritDamage(p.damage);
      if (hit.crit) anyCrit = true;
      e.hp -= hit.damage;
      e.hurt = hit.crit ? 0.28 : 0.18;
      const push = (p.charId === "knight" ? 28 : 14) * (hit.crit ? 1.35 : 1);
      e.x += Math.cos(baseAngle) * push;
      e.y += Math.sin(baseAngle) * push;
      addParticle(e.x, e.y, hit.crit ? "#c23b3b" : "#8b3d14");
      if (hit.crit) pushCritText(e);
      if (e.hp <= 0) doomed.push(e);
    }
    if (anyCrit) triggerShake(6, 0.18);
    for (const e of doomed) {
      const idx = state.enemies.indexOf(e);
      if (idx >= 0) killEnemy(e, idx);
    }
    return;
  }

  // —— 远程：朝鼠标方向发射（命中时再 roll 暴击）——
  const count = p.projectileCount;
  const spread = count > 1 ? 0.18 : 0;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const angle = baseAngle + offset;
    state.projectiles.push({
      x: p.x + Math.cos(angle) * 20,
      y: p.y + Math.sin(angle) * 8 - 6,
      vx: Math.cos(angle) * p.projectileSpeed,
      vy: Math.sin(angle) * p.projectileSpeed,
      angle,
      damage: p.damage,
      pierceLeft: p.pierce,
      life: 1.6,
      weapon: p.weapon,
      hit: new Set(),
    });
  }
}

function dropOrb(x, y, value) {
  state.orbs.push({ x, y, value, life: 20 });
}

function addParticle(x, y, color) {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 80;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.25,
      color,
    });
  }
}

function pickUpgrades() {
  const pool = UPGRADES.filter((u) => {
    if (u.id === "tornado" && !state.player.canTornado) return false;
    return true;
  });
  const picks = [];
  const bag = [...pool];
  while (picks.length < 3 && bag.length) {
    const i = Math.floor(Math.random() * bag.length);
    picks.push(bag.splice(i, 1)[0]);
  }
  return picks;
}

function showLevelUp() {
  paused = true;
  const picks = pickUpgrades();
  els.upgradeChoices.innerHTML = "";
  for (const u of picks) {
    const btn = document.createElement("button");
    btn.className = "upgrade-card";
    btn.type = "button";
    btn.innerHTML = `<div class="title">${u.title}</div><div class="desc">${u.desc}</div>`;
    btn.addEventListener("click", () => {
      u.apply(state);
      els.levelup.classList.add("hidden");
      paused = false;
      updateHud();
      lastTs = performance.now();
      raf = requestAnimationFrame(loop);
    });
    els.upgradeChoices.appendChild(btn);
  }
  els.levelup.classList.remove("hidden");
}

function gainXp(amount) {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpToLevel(p.level);
    showLevelUp();
  }
}

function killEnemy(e, idx) {
  dropOrb(e.x, e.y, e.xp);
  addParticle(e.x, e.y, monsterParticleColor(e.type));
  state.enemies.splice(idx, 1);
  state.kills += 1;
}

function endGame() {
  running = false;
  paused = false;
  els.resultText.textContent = `存活 ${formatTime(state.time)} · 关卡 ${state.stage} · 击杀 ${state.kills} · 等级 ${state.player.level}`;
  els.gameover.classList.remove("hidden");
}

function update(dt) {
  const p = state.player;
  state.time += dt;

  // 关卡推进：解锁新怪 + 加快刷怪
  const nextStage = currentStage();
  if (nextStage !== state.stage) {
    state.stage = nextStage;
    state.spawnRotator.setStage(state.stage);
    state.spawnInterval = Math.max(0.35, 1.15 - (state.stage - 1) * 0.1);
    // 每升一关保证立刻刷出所有已解锁类型各一只
    for (const id of unlockedMonsters(state.stage)) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 380 + Math.random() * 120;
      const stats = makeMonsterStats(id, state.stage);
      state.enemies.push({
        ...stats,
        x: Math.max(40, Math.min(WORLD.w - 40, p.x + Math.cos(angle) * dist)),
        y: Math.max(40, Math.min(WORLD.h - 40, p.y + Math.sin(angle) * dist)),
        facing: 1,
      });
    }
    updateHud();
  }

  let mx = 0;
  let my = 0;
  if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
  if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;

  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my) || 1;
    p.x += (mx / len) * p.speed * dt;
    p.y += (my / len) * p.speed * dt;
    if (mx !== 0) p.facing = mx > 0 ? 1 : -1;
    p.anim += dt;
  } else {
    p.anim += dt * 0.4;
  }

  p.x = Math.max(30, Math.min(WORLD.w - 30, p.x));
  p.y = Math.max(30, Math.min(WORLD.h - 30, p.y));
  if (p.invuln > 0) p.invuln -= dt;

  const minute = state.time / 60;
  state.spawnInterval = Math.max(0.28, 1.1 - minute * 0.12);
  state.spawnTimer -= dt;
  const maxEnemies = Math.min(80, 18 + Math.floor(minute * 12));
  while (state.spawnTimer <= 0 && state.enemies.length < maxEnemies) {
    spawnEnemy();
    state.spawnTimer += state.spawnInterval;
  }

  p.fireTimer = Math.max(0, p.fireTimer - dt);
  // 手动攻击：按住鼠标或空格，受冷却限制
  if (mouse.down || keys["Space"]) {
    fireProjectiles();
  }

  // 龙卷风魔法冷却
  if (p.tornadoCdLeft > 0) {
    p.tornadoCdLeft = Math.max(0, p.tornadoCdLeft - dt);
    updateMagicUi();
  }
  if (state.screenFlash > 0) state.screenFlash -= dt;
  if (state.shake > 0) {
    state.shake -= dt;
    if (state.shake <= 0) {
      state.shake = 0;
      state.shakeMag = 0;
    }
  }

  if (state.floatTexts) {
    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const ft = state.floatTexts[i];
      ft.life -= dt;
      ft.y -= 36 * dt;
      if (ft.life <= 0) state.floatTexts.splice(i, 1);
    }
  }

  for (let i = state.tornados.length - 1; i >= 0; i--) {
    const tw = state.tornados[i];
    tw.life -= dt;
    tw.anim += dt;
    // 全屏风暴只做视觉，缓慢扩散/飘动
    if (tw.fullscreen) {
      tw.radius += 18 * dt;
      tw.x += Math.sin(tw.anim * 2) * 20 * dt;
      tw.y += Math.cos(tw.anim * 1.6) * 16 * dt;
    } else {
      tw.tick -= dt;
      let nearest = null;
      let best = Infinity;
      for (const e of state.enemies) {
        const d2 = (e.x - tw.x) ** 2 + (e.y - tw.y) ** 2;
        if (d2 < best) {
          best = d2;
          nearest = e;
        }
      }
      if (nearest && best < 220 * 220) {
        const dx = nearest.x - tw.x;
        const dy = nearest.y - tw.y;
        const d = Math.hypot(dx, dy) || 1;
        tw.x += (dx / d) * 55 * dt;
        tw.y += (dy / d) * 55 * dt;
      }
      if (tw.tick <= 0 && tw.damage > 0) {
        tw.tick = 0.28;
        for (let j = state.enemies.length - 1; j >= 0; j--) {
          const e = state.enemies[j];
          const d = Math.hypot(e.x - tw.x, e.y - tw.y);
          if (d < tw.radius) {
            e.hp -= tw.damage;
            e.hurt = 0.2;
            const ang = Math.atan2(e.y - tw.y, e.x - tw.x) + 0.9;
            e.x += Math.cos(ang) * 10;
            e.y += Math.sin(ang) * 10;
            addParticle(e.x, e.y, "#6a7a88");
            if (e.hp <= 0) killEnemy(e, j);
          }
        }
      }
    }

    if (tw.life <= 0) state.tornados.splice(i, 1);
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) {
      state.projectiles.splice(i, 1);
      continue;
    }

    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      if (pr.hit.has(e)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy < (e.radius + 6) ** 2) {
        pr.hit.add(e);
        const hit = rollCritDamage(pr.damage);
        e.hp -= hit.damage;
        e.hurt = hit.crit ? 0.28 : 0.18;
        addParticle(pr.x, pr.y, hit.crit ? "#c23b3b" : "#c45c26");
        if (hit.crit) {
          triggerShake(5.5, 0.16);
          pushCritText(e);
        }
        if (e.hp <= 0) killEnemy(e, j);
        if (pr.pierceLeft <= 0) {
          state.projectiles.splice(i, 1);
          break;
        }
        pr.pierceLeft -= 1;
      }
    }
  }

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.anim += dt;
    if (e.hurt > 0) e.hurt -= dt;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.facing = dx >= 0 ? 1 : -1;

    if (e.attack === "fireball") {
      const prefer = e.preferRange || 220;
      // 保持射程：太远追、太近后退、合适距离开火
      if (dist > prefer + 40) {
        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;
      } else if (dist < prefer - 50) {
        e.x -= (dx / dist) * e.speed * 0.85 * dt;
        e.y -= (dy / dist) * e.speed * 0.85 * dt;
      } else {
        // 侧向游走
        e.x += (-dy / dist) * e.speed * 0.35 * dt;
        e.y += (dx / dist) * e.speed * 0.35 * dt;
      }

      if (e.fireTimer > 0) e.fireTimer -= dt;
      if (e.fireTimer <= 0 && dist < prefer + 80) {
        e.fireTimer = e.fireCooldown || 1.3;
        const ang = Math.atan2(dy, dx);
        const spd = e.fireballSpeed || 210;
        state.enemyProjectiles.push({
          x: e.x + Math.cos(ang) * 18,
          y: e.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          angle: ang,
          life: 2.4,
          damage: Math.max(6, Math.round(e.damage * 0.85)),
          radius: 10,
        });
      }
      // 贴身仍会造成碰撞伤害
      if (dist < e.radius + p.radius && p.invuln <= 0) {
        p.hp -= Math.ceil(e.damage * 0.55);
        p.invuln = 0.55;
        addParticle(p.x, p.y, "#c23b3b");
        if (p.hp <= 0) {
          p.hp = 0;
          updateHud();
          endGame();
          return;
        }
      }
    } else {
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;

      if (dist < e.radius + p.radius && p.invuln <= 0) {
        p.hp -= e.damage;
        p.invuln = 0.55;
        addParticle(p.x, p.y, "#c23b3b");
        if (p.hp <= 0) {
          p.hp = 0;
          updateHud();
          endGame();
          return;
        }
      }
    }
  }

  // 敌人火球
  if (!state.enemyProjectiles) state.enemyProjectiles = [];
  for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
    const pr = state.enemyProjectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) {
      state.enemyProjectiles.splice(i, 1);
      continue;
    }
    const d = Math.hypot(pr.x - p.x, pr.y - p.y);
    if (d < (pr.radius || 10) + p.radius) {
      if (p.invuln <= 0) {
        p.hp -= pr.damage;
        p.invuln = 0.4;
        addParticle(p.x, p.y, "#e07030");
        if (p.hp <= 0) {
          p.hp = 0;
          updateHud();
          endGame();
          return;
        }
      }
      state.enemyProjectiles.splice(i, 1);
    }
  }

  for (let i = state.orbs.length - 1; i >= 0; i--) {
    const o = state.orbs[i];
    o.life -= dt;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.magnet) {
      const pull = Math.min(420, 120 + (p.magnet - dist) * 4);
      o.x += (dx / (dist || 1)) * pull * dt;
      o.y += (dy / (dist || 1)) * pull * dt;
    }
    if (dist < 18) {
      gainXp(o.value);
      state.orbs.splice(i, 1);
      continue;
    }
    if (o.life <= 0) state.orbs.splice(i, 1);
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.meleeFx.length - 1; i >= 0; i--) {
    state.meleeFx[i].life -= dt;
    if (state.meleeFx[i].life <= 0) state.meleeFx.splice(i, 1);
  }

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  state.camera.x = p.x - viewW / 2;
  state.camera.y = p.y - viewH / 2;
  updateHud();
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

  const g = ctx.createLinearGradient(0, 0, viewW, viewH);
  g.addColorStop(0, "#f2efe6");
  g.addColorStop(1, "#e8e0d2");
  ctx.fillStyle = g;
  ctx.fillRect(-8, -8, viewW + 16, viewH + 16);
  drawGround(ctx, cam.x, cam.y, viewW, viewH);

  const sx = (wx) => wx - cam.x;
  const sy = (wy) => wy - cam.y;

  // 环境：房子 / 草苗（视口裁剪）
  const pad = 60;
  for (const prop of state.props) {
    if (
      prop.x < cam.x - pad ||
      prop.x > cam.x + viewW + pad ||
      prop.y < cam.y - pad ||
      prop.y > cam.y + viewH + pad
    ) {
      continue;
    }
    if (prop.kind === "house") {
      drawHouse(ctx, sx(prop.x), sy(prop.y), prop.scale, prop.variant);
    } else {
      drawSprout(ctx, sx(prop.x), sy(prop.y), prop.scale, prop.variant, state.time);
    }
  }

  for (const o of state.orbs) drawXpOrb(ctx, sx(o.x), sy(o.y), state.time);

  // 龙卷风（画在角色下层偏前）
  for (const tw of state.tornados) {
    const fade = Math.min(1, tw.life / 0.4, (tw.maxLife - tw.life) / 0.25 + 0.5);
    const scale = tw.fullscreen
      ? 1.35 + (1 - tw.life / tw.maxLife) * 0.55
      : 0.85 + (1 - tw.life / tw.maxLife) * 0.15;
    ctx.globalAlpha = Math.max(tw.fullscreen ? 0.5 : 0.35, fade);
    drawTornado(ctx, sx(tw.x), sy(tw.y), scale, tw.anim, 1);
    ctx.globalAlpha = 1;
  }

  const drawables = [
    ...state.enemies.map((e) => ({ kind: "enemy", e, y: e.y })),
    { kind: "player", y: state.player.y },
  ].sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.kind === "player") {
      const p = state.player;
      if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) continue;
      drawCharacter(ctx, p.charId || "archer", sx(p.x), sy(p.y), p.facing, p.anim);
    } else {
      const e = d.e;
      const facing = e.facing ?? (e.x < state.player.x ? 1 : -1);
      drawMonster(ctx, e.type, sx(e.x), sy(e.y), 1, e.anim, e.hurt, facing);
      if (e.hp < e.maxHp) {
        const ratio = e.hp / e.maxHp;
        ctx.fillStyle = "rgba(26,26,26,0.25)";
        ctx.fillRect(sx(e.x) - 16, sy(e.y) - 48, 32, 4);
        ctx.fillStyle = "#c23b3b";
        ctx.fillRect(sx(e.x) - 16, sy(e.y) - 48, 32 * ratio, 4);
      }
    }
  }

  for (const pr of state.projectiles) {
    drawWeaponProjectile(ctx, pr.weapon || "arrow", sx(pr.x), sy(pr.y), pr.angle, pr.life);
  }

  for (const pr of state.enemyProjectiles || []) {
    drawFireball(ctx, sx(pr.x), sy(pr.y), pr.angle, Math.min(1, pr.life), 0.95);
  }

  for (const fx of state.meleeFx) {
    ctx.globalAlpha = Math.max(0, fx.life / fx.maxLife);
    drawWeaponProjectile(ctx, fx.weapon === "bolt" ? "slash" : fx.weapon, sx(fx.x), sy(fx.y), fx.angle, fx.life);
    ctx.globalAlpha = 1;
  }

  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(sx(pt.x), sy(pt.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 全屏魔法闪光
  if (state.screenFlash > 0) {
    const a = Math.min(0.45, state.screenFlash * 1.2);
    ctx.fillStyle = `rgba(106,122,136,${a})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.strokeStyle = `rgba(26,26,26,${a * 0.8})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const r = 40 + (0.45 - state.screenFlash) * 220 + i * 50;
      ctx.beginPath();
      ctx.arc(viewW / 2, viewH / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  ctx.restore();
}

function loop(ts) {
  if (!running || paused) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  if (running && !paused) raf = requestAnimationFrame(loop);
}

function beginRun(charId) {
  if (charId) selectedCharId = charId;
  loadMonsters().then(() => {
    state = createState();
    running = true;
    paused = false;
    els.overlay.classList.add("hidden");
    els.charSelect?.classList.add("hidden");
    els.gameover.classList.add("hidden");
    els.levelup.classList.add("hidden");
    els.magicDock?.classList.remove("hidden");
    updateHud();
    updateMagicUi();
    paintMagicCard();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

function openCharSelect() {
  running = false;
  paused = false;
  cancelAnimationFrame(raf);
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");
  els.levelup.classList.add("hidden");
  els.magicDock?.classList.add("hidden");
  showCharSelect(els.charSelect, els.charGrid, "生存模式 · 选择角色", (id) => {
    beginRun(id);
  });
}

export function startSurvivor(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  keys = Object.create(null);

  els.hud.classList.remove("hidden");
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");
  els.levelup.classList.add("hidden");
  els.magicDock?.classList.add("hidden");

  resize();
  onResize = () => {
    resize();
    paintMagicCard();
  };
  window.addEventListener("resize", onResize);

  onKeyDown = (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === "KeyQ") {
      e.preventDefault();
      castTornadoMagic();
    }
  };
  onKeyUp = (e) => {
    keys[e.code] = false;
  };
  onMouseMove = (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  };
  onMouseDown = (e) => {
    if (e.button !== 0) return;
    // 点在 UI（升级/魔法卡）上不攻击
    if (e.target?.closest?.(".overlay, .magic-dock, .hud")) return;
    mouse.down = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (running && !paused) fireProjectiles();
  };
  onMouseUp = () => {
    mouse.down = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("blur", onMouseUp);

  if (els.magicBtn) {
    els.magicBtn.onclick = () => castTornadoMagic();
  }

  els.btnStart.onclick = openCharSelect;
  els.btnRestart.onclick = openCharSelect;
  openCharSelect();
}

export function stopSurvivor() {
  running = false;
  paused = false;
  mouse.down = false;
  cancelAnimationFrame(raf);
  if (onResize) window.removeEventListener("resize", onResize);
  if (onKeyDown) window.removeEventListener("keydown", onKeyDown);
  if (onKeyUp) window.removeEventListener("keyup", onKeyUp);
  if (onMouseMove) window.removeEventListener("mousemove", onMouseMove);
  if (onMouseDown) window.removeEventListener("mousedown", onMouseDown);
  if (onMouseUp) {
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("blur", onMouseUp);
  }
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");
  els.levelup?.classList.add("hidden");
  els.charSelect?.classList.add("hidden");
  els.magicDock?.classList.add("hidden");
  onResize = onKeyDown = onKeyUp = onMouseMove = onMouseDown = onMouseUp = null;
}
