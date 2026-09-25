/**
 * 怪物位图：每张图 = 独立怪物（不同编号属性不同，不做动画帧）
 * 路径：assets/sprites/monsters/<folder>/<folder>-N.png
 */

function def(partial) {
  return partial;
}

/** @type {Record<string, {
 *   name: string, folder: string, file: string,
 *   hp: number, speed: number, damage: number,
 *   gold: number, xp: number, radius: number, scale: number,
 *   color: string, unlockStage: number
 * }>} */
export const MONSTER_DEFS = {
  "nine-tail-fox-1": def({
    name: "九尾狐·幼",
    folder: "nine-tail-fox",
    file: "nine-tail-fox-1.png",
    hp: 26,
    speed: 56,
    damage: 9,
    gold: 10,
    xp: 3,
    radius: 20,
    scale: 0.48,
    color: "#c45c26",
    unlockStage: 1,
  }),
  "nine-tail-fox-2": def({
    name: "九尾狐·成",
    folder: "nine-tail-fox",
    file: "nine-tail-fox-2.png",
    hp: 42,
    speed: 62,
    damage: 14,
    gold: 16,
    xp: 6,
    radius: 24,
    scale: 0.54,
    color: "#a84820",
    unlockStage: 2,
  }),
  "eyeball-1": def({
    name: "眼球·小",
    folder: "eyeball",
    file: "eyeball-1.png",
    hp: 40,
    speed: 38,
    damage: 12,
    gold: 12,
    xp: 4,
    radius: 22,
    scale: 0.44,
    color: "#A7E6C9",
    unlockStage: 1,
  }),
  "eyeball-2": def({
    name: "眼球·中",
    folder: "eyeball",
    file: "eyeball-2.png",
    hp: 58,
    speed: 42,
    damage: 17,
    gold: 18,
    xp: 7,
    radius: 24,
    scale: 0.48,
    color: "#7dcfb0",
    unlockStage: 2,
  }),
  "eyeball-3": def({
    name: "眼球·大",
    folder: "eyeball",
    file: "eyeball-3.png",
    hp: 85,
    speed: 36,
    damage: 22,
    gold: 26,
    xp: 11,
    radius: 28,
    scale: 0.55,
    color: "#4a9f82",
    unlockStage: 3,
  }),
  "tiger-1": def({
    name: "猛虎·幼",
    folder: "tiger",
    file: "tiger-1.png",
    hp: 60,
    speed: 68,
    damage: 16,
    gold: 18,
    xp: 7,
    radius: 24,
    scale: 0.5,
    color: "#c23b3b",
    unlockStage: 2,
  }),
  "tiger-2": def({
    name: "猛虎·成",
    folder: "tiger",
    file: "tiger-2.png",
    hp: 95,
    speed: 78,
    damage: 24,
    gold: 28,
    xp: 12,
    radius: 28,
    scale: 0.58,
    color: "#8b2020",
    unlockStage: 3,
  }),
  "thief-1": def({
    name: "小偷",
    folder: "thief",
    file: "thief-1.png",
    hp: 32,
    speed: 92,
    damage: 11,
    gold: 14,
    xp: 5,
    radius: 18,
    scale: 0.48,
    color: "#5a5a5a",
    unlockStage: 2,
  }),
  "official-1": def({
    name: "官吏",
    folder: "official",
    file: "official-1.png",
    hp: 58,
    speed: 46,
    damage: 14,
    gold: 16,
    xp: 6,
    radius: 22,
    scale: 0.5,
    color: "#4a6a9a",
    unlockStage: 3,
  }),
  "boat-man-1": def({
    name: "船夫",
    folder: "boat-man",
    file: "boat-man-1.png",
    hp: 85,
    speed: 36,
    damage: 20,
    gold: 24,
    xp: 9,
    radius: 26,
    scale: 0.52,
    color: "#3a8f6e",
    unlockStage: 3,
  }),
  "queen-1": def({
    name: "女王",
    folder: "queen",
    file: "queen-1.png",
    hp: 130,
    speed: 44,
    damage: 26,
    gold: 40,
    xp: 16,
    radius: 28,
    scale: 0.58,
    color: "#8b3d14",
    unlockStage: 4,
  }),
};

export const MONSTER_IDS = Object.keys(MONSTER_DEFS);

/** 旧 id / 族名 → 具体编号怪 */
const ALIASES = {
  fox: "nine-tail-fox-1",
  "nine-tail-fox": "nine-tail-fox-1",
  eyeball: "eyeball-1",
  tiger: "tiger-1",
  thief: "thief-1",
  official: "official-1",
  "boat-man": "boat-man-1",
  queen: "queen-1",
};

/** @type {Record<string, { canvas: HTMLCanvasElement, w: number, h: number }>} */
const images = Object.create(null);
let ready = false;
let loadPromise = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 去黑底并裁到不透明内容，方便脚底对齐 */
function punchAndCrop(img, threshold = 28) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const tmp = document.createElement("canvas");
  tmp.width = w0;
  tmp.height = h0;
  const g = tmp.getContext("2d");
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w0, h0);
  const d = data.data;
  let minX = w0,
    minY = h0,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h0; y++) {
    for (let x = 0; x < w0; x++) {
      const i = (y * w0 + x) * 4;
      if (d[i] <= threshold && d[i + 1] <= threshold && d[i + 2] <= threshold) {
        d[i + 3] = 0;
      }
      if (d[i + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  g.putImageData(data, 0, 0);
  if (maxX < minX || maxY < minY) {
    return { canvas: tmp, w: w0, h: h0 };
  }
  const pad = 1;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w0 - 1, maxX + pad);
  maxY = Math.min(h0 - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d").drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);
  return { canvas: out, w: cw, h: ch };
}

export function loadMonsters() {
  if (ready) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all(
      MONSTER_IDS.map(async (id) => {
        const def = MONSTER_DEFS[id];
        const src = `assets/sprites/monsters/${def.folder}/${def.file}`;
        const img = await loadImage(src);
        images[id] = punchAndCrop(img);
      })
    );
    ready = true;
  })();
  return loadPromise;
}

export function normalizeMonsterType(type) {
  return ALIASES[type] || type;
}

export function getMonsterDef(type) {
  const id = normalizeMonsterType(type);
  return MONSTER_DEFS[id] || MONSTER_DEFS["nine-tail-fox-1"];
}

/** 当前关卡已解锁的怪物（每种编号独立） */
export function unlockedMonsters(stage) {
  const s = Math.max(1, stage | 0);
  return MONSTER_IDS.filter((id) => MONSTER_DEFS[id].unlockStage <= s);
}

export function stageScale(stage) {
  const s = Math.max(1, stage | 0);
  return 1 + (s - 1) * 0.18;
}

/** 保证每种已解锁怪都会出现：按队列轮转 + 少量随机 */
export function createSpawnRotator(stage) {
  let pool = unlockedMonsters(stage).slice();
  let i = 0;
  return {
    setStage(s) {
      pool = unlockedMonsters(s).slice();
      i = 0;
    },
    next() {
      if (!pool.length) return "nine-tail-fox-1";
      if (Math.random() < 0.7) {
        const t = pool[i % pool.length];
        i += 1;
        return t;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    },
  };
}

export function makeMonsterStats(type, stage = 1, extras = {}) {
  const id = normalizeMonsterType(type);
  const def = getMonsterDef(id);
  const scale = stageScale(stage);
  const hp = Math.round(def.hp * scale * (extras.hpMul || 1));
  const drawScale = extras.drawScale ?? 1;
  const drawH = getMonsterDrawHeight(id, drawScale);
  return {
    type: id,
    radius: def.radius,
    hp,
    maxHp: hp,
    speed: def.speed * (1 + (stage - 1) * 0.06) * (extras.speedMul || 1),
    damage: Math.round(def.damage * scale * (extras.dmgMul || 1)),
    gold: Math.round(def.gold * (1 + (stage - 1) * 0.1)),
    xp: Math.round(def.xp * (1 + (stage - 1) * 0.08)),
    color: def.color,
    anim: 0,
    hurt: 0,
    drawH,
    drawScale,
  };
}

/** 绘制高度（用于脚底落点 / 血条） */
export function getMonsterDrawHeight(type, worldScale = 1) {
  const id = normalizeMonsterType(type);
  const def = getMonsterDef(id);
  const img = images[id];
  const s = (def.scale || 0.5) * worldScale;
  if (!img) return def.radius * 2;
  return img.h * s;
}

/** 碰撞/瞄准用的身位中心（y 为脚底） */
export function monsterBodyCenter(e) {
  const h = e.drawH || e.radius * 2;
  return { x: e.x, y: e.y - h * 0.45 };
}

/**
 * 绘制单张怪物位图
 * @param y 锚点：feet=脚底 / center=身体中心
 * @param facing 1 朝右 / -1 朝左
 * @param anchor "feet" | "center"
 */
export function drawMonster(
  ctx,
  type,
  x,
  y,
  scale = 1,
  _anim = 0,
  hurt = 0,
  facing = 1,
  anchor = "center"
) {
  const id = normalizeMonsterType(type);
  const def = getMonsterDef(id);
  const img = images[id];
  const s = (def.scale || 0.5) * scale;

  if (!img) {
    ctx.save();
    ctx.strokeStyle = hurt > 0 ? "#c23b3b" : "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - (anchor === "feet" ? 10 : 0), 14 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const dw = img.w * s;
  const dh = img.h * s;

  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  if (hurt > 0) ctx.globalAlpha = 0.55 + Math.sin(hurt * 40) * 0.25;
  const oy = anchor === "feet" ? -dh : -dh / 2;
  ctx.drawImage(img.canvas, -dw / 2, oy, dw, dh);
  ctx.restore();
}

export function monsterParticleColor(type) {
  return getMonsterDef(type).color;
}
