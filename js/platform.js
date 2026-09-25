import {
  drawHouse,
  drawSprout,
} from "./draw.js";
import { getCharacter, drawCharacter, drawWeaponProjectile } from "./characters.js";
import { showCharSelect } from "./charselect.js";
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

let canvas, ctx;
let els = {};
let state = null;
let keys = Object.create(null);
let mouse = { x: 0, y: 0, down: false };
let lastTs = 0;
let running = false;
let raf = 0;
let listeners = [];

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

  const decor = [];
  for (const pl of platforms) {
    if (pl.w < 120) continue;
    const n = Math.min(4, Math.floor(pl.w / 90));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.4) / (n + 0.2);
      decor.push({
        kind: "house",
        x: pl.x + pl.w * t,
        y: pl.y,
        scale: 0.7 + (i % 3) * 0.12,
        variant: i + Math.floor(pl.x / 50),
      });
    }
    for (let i = 0; i < Math.floor(pl.w / 55); i++) {
      decor.push({
        kind: "sprout",
        x: pl.x + 20 + i * 52 + (i % 2) * 8,
        y: pl.y,
        scale: 0.65 + (i % 3) * 0.15,
        variant: i,
      });
    }
  }

  return {
    width: 3600,
    height: 640,
    platforms,
    enemies,
    decor,
    goal: { x: 3400, y: 300, w: 40, h: 60 },
    stage,
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

function createState(stage = 1) {
  const ch = getCharacter(selectedCharId);
  const s = ch.platform;
  const level = buildLevel(stage);
  return {
    level,
    stage,
    time: 0,
    kills: 0,
    score: 0,
    camera: { x: 0, y: 0 },
    player: {
      charId: ch.id,
      attackType: ch.attackType,
      weapon: s.weapon,
      meleeRange: s.meleeRange || 0,
      x: 80,
      y: 440,
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
    },
    projectiles: [],
    meleeFx: [],
    particles: [],
    floatTexts: [],
    shake: 0,
    shakeMag: 0,
    won: false,
  };
}

function updateHud() {
  const p = state.player;
  els.hpFill.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
  els.hpText.textContent = `${Math.ceil(p.hp)}`;
  els.scoreText.textContent = `分数 ${state.score}`;
  els.killText.textContent = `击杀 ${state.kills}`;
  if (els.stageText) els.stageText.textContent = `关卡 ${state.stage}/${MAX_STAGES}`;
  if (els.ammoText) {
    if (p.attackType === "melee") {
      els.ammoText.textContent = p.weapon === "bolt" ? "盾击" : "近战";
    } else {
      const names = { orb: "法球", arrow: "箭矢" };
      els.ammoText.textContent = names[p.weapon] || "远程";
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

function resolvePlatforms(ent, dt) {
  const plats = state.level.platforms;
  ent.onGround = false;
  ent.vy += GRAVITY * dt;
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

    const prevTop = ent.y - hh - ent.vy * dt;
    const prevBottom = prevTop + h;

    // 从上方落下
    if (ent.vy >= 0 && prevBottom <= pl.y + 6) {
      ent.y = pl.y - hh;
      ent.vy = 0;
      ent.onGround = true;
      top = ent.y - hh;
      continue;
    }

    // 撞头
    if (ent.vy < 0 && prevTop >= pl.y + pl.h - 6) {
      ent.y = pl.y + pl.h + hh;
      ent.vy = 0;
      top = ent.y - hh;
      continue;
    }

    // 侧面
    const overlapX =
      Math.min(left + w, pl.x + pl.w) - Math.max(left, pl.x);
    if (ent.x < pl.x + pl.w / 2) {
      ent.x -= overlapX;
    } else {
      ent.x += overlapX;
    }
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

function fireArrow() {
  const p = state.player;
  if (p.fireTimer > 0) return;

  const worldMx = mouse.x + state.camera.x;
  const worldMy = mouse.y + state.camera.y;
  const angle = Math.atan2(worldMy - (p.y - 8), worldMx - p.x);
  p.facing = Math.cos(angle) >= 0 ? 1 : -1;
  p.fireTimer = p.fireCooldown || FIRE_COOLDOWN;

  // 近战：仅攻击面前近距离敌人
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
      // 大致朝向鼠标一侧
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
}

function advanceStage() {
  if (state.stage >= MAX_STAGES) {
    endGame(true);
    return;
  }
  const hp = state.player.hp;
  const score = state.score + 500;
  const kills = state.kills;
  const time = state.time;
  const next = state.stage + 1;
  const kept = {
    charId: state.player.charId,
    attackType: state.player.attackType,
    weapon: state.player.weapon,
    meleeRange: state.player.meleeRange,
    damage: state.player.damage,
    critChance: state.player.critChance,
    critMult: state.player.critMult,
    fireCooldown: state.player.fireCooldown,
    projectileSpeed: state.player.projectileSpeed,
    maxHp: state.player.maxHp,
  };
  state = createState(next);
  Object.assign(state.player, kept);
  state.player.hp = Math.min(kept.maxHp, hp + 20);
  state.score = score;
  state.kills = kills;
  state.time = time;
  state.projectiles = [];
  state.meleeFx = [];
  syncCamera(null, true);
  updateHud();
}

function update(dt) {
  const p = state.player;
  state.time += dt;
  if (state.shake > 0) {
    state.shake -= dt;
    if (state.shake <= 0) {
      state.shake = 0;
      state.shakeMag = 0;
    }
  }

  // 移动
  let mx = 0;
  if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
  p.vx = mx * MOVE_SPEED;
  if (mx !== 0) p.facing = mx > 0 ? 1 : -1;

  const wantJump = keys["Space"] || keys["KeyW"] || keys["ArrowUp"];
  if (wantJump && !p.jumpHeld) {
    if (p.onGround || p.jumpsLeft > 0) {
      const isDouble = !p.onGround;
      p.vy = isDouble ? DOUBLE_JUMP_V : JUMP_V;
      p.onGround = false;
      p.jumpsLeft = Math.max(0, (isDouble ? p.jumpsLeft : MAX_JUMPS) - 1);
      if (isDouble) {
        // 二段跳小火花
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
  if (mouse.down) fireArrow();

  const fell = resolvePlatforms(p, dt);
  if (p.onGround) p.jumpsLeft = MAX_JUMPS;
  if (fell === "fell") {
    p.hp -= 25;
    p.invuln = 0.8;
    p.x = 80;
    p.y = 440;
    p.vx = 0;
    p.vy = 0;
    p.jumpsLeft = MAX_JUMPS;
    p.jumpHeld = false;
    addParticle(p.x, p.y, "#c23b3b");
    if (p.hp <= 0) {
      p.hp = 0;
      updateHud();
      endGame(false);
      return;
    }
  }

  // 通关检测
  const g = state.level.goal;
  if (
    rectOverlap(
      p.x - p.w / 2,
      p.y - p.h / 2,
      p.w,
      p.h,
      g.x,
      g.y,
      g.w,
      g.h
    )
  ) {
    advanceStage();
    return;
  }

  // 箭矢
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.vy += 200 * dt; // 轻微下坠
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

  // 敌人巡逻
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

    // 简单追击：玩家靠近时加速
    const body = monsterBodyCenter(e);
    const dx = p.x - body.x;
    const dy = p.y - body.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 220 && Math.abs(dy) < 100) {
      e.vx = Math.sign(dx) * (e.speed * 1.35 || 90);
      e.facing = Math.sign(dx) || e.facing;
    }

    if (dist < e.radius + 18 && p.invuln <= 0) {
      p.hp -= e.damage;
      p.invuln = 0.7;
      p.vx = Math.sign(p.x - e.x) * 220;
      p.vy = -280;
      addParticle(p.x, p.y, "#c23b3b");
      if (p.hp <= 0) {
        p.hp = 0;
        updateHud();
        endGame(false);
        return;
      }
    }
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
  updateHud();
}

function syncCamera(dt, instant = false) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const p = state.player;
  const targetX = p.x - viewW * 0.38;
  const targetY = p.y - viewH * 0.58;
  const maxX = Math.max(0, state.level.width - viewW);
  const maxY = Math.max(0, state.level.height - viewH);
  // 视口比关卡更高时，把关卡垂直居中
  const minY = viewH > state.level.height ? (state.level.height - viewH) / 2 : 0;
  const tx = Math.max(0, Math.min(maxX, targetX));
  const ty = Math.max(minY, Math.min(maxY || minY, targetY));
  if (instant || dt == null) {
    state.camera.x = tx;
    state.camera.y = ty;
    return;
  }
  const k = Math.min(1, 10 * dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

function drawPlatforms(sx, sy) {
  for (const pl of state.level.platforms) {
    const x = sx(pl.x);
    const y = sy(pl.y);
    ctx.fillStyle = "#ebe4d6";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x, y, pl.w, pl.h);
    ctx.fill();
    ctx.stroke();
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

  const p = state.player;
  if (!(p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0)) {
    drawCharacter(ctx, p.charId || "archer", sx(p.x), sy(p.y), p.facing, p.anim);
  }

  for (const pr of state.projectiles) {
    drawWeaponProjectile(ctx, pr.weapon || "arrow", sx(pr.x), sy(pr.y), pr.angle, pr.life);
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
  if (charId) selectedCharId = charId;
  loadMonsters().then(() => {
    state = createState(1);
    running = true;
    els.overlay.classList.add("hidden");
    els.charSelect?.classList.add("hidden");
    els.gameover.classList.add("hidden");
    syncCamera(null, true);
    updateHud();
    lastTs = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
}

function openCharSelect() {
  running = false;
  cancelAnimationFrame(raf);
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");
  showCharSelect(els.charSelect, els.charGrid, "平台模式 · 选择角色", (id) => {
    beginRun(id);
  });
}

export function startPlatform(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  keys = Object.create(null);
  mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };

  els.hud.classList.remove("hidden");
  els.overlay.classList.add("hidden");
  els.gameover.classList.add("hidden");

  resize();
  on(window, "resize", resize);

  on(window, "keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
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
      if (running) fireArrow();
    }
  });
  on(window, "mouseup", (e) => {
    if (e.button === 0) mouse.down = false;
  });
  on(window, "blur", () => {
    mouse.down = false;
    keys = Object.create(null);
  });

  els.btnStart.onclick = openCharSelect;
  els.btnRestart.onclick = openCharSelect;
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
}
