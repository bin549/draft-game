/** 四职业配置：剑客 / 魔法师 / 骑士 / 弓箭手 */

import {
  drawPlayer,
  drawSwordsman,
  drawMage,
  drawKnight,
  drawArrowProjectile,
  drawMagicOrb,
  drawSlash,
} from "./draw.js";

export const CHARACTERS = [
  {
    id: "swordsman",
    name: "剑客",
    desc: "近战挥砍 · 攻速快",
    color: "#8b3d14",
    attackType: "melee",
    survivor: {
      maxHp: 110,
      speed: 175,
      damage: 22,
      fireCooldown: 0.28,
      projectileSpeed: 0,
      pierce: 0,
      weapon: "slash",
      meleeRange: 78,
      tornadoBonus: 0,
    },
    platform: {
      maxHp: 110,
      damage: 24,
      fireCooldown: 0.2,
      projectileSpeed: 0,
      weapon: "slash",
      meleeRange: 70,
    },
    tower: {
      cost: 70,
      range: 95,
      damage: 22,
      cooldown: 0.4,
      style: "melee",
    },
  },
  {
    id: "mage",
    name: "魔法师",
    desc: "远程法球 · 擅长龙卷风",
    color: "#4a6a9a",
    attackType: "ranged",
    survivor: {
      maxHp: 85,
      speed: 150,
      damage: 16,
      fireCooldown: 0.62,
      projectileSpeed: 340,
      pierce: 1,
      weapon: "orb",
      meleeRange: 0,
      tornadoBonus: 1,
    },
    platform: {
      maxHp: 90,
      damage: 20,
      fireCooldown: 0.28,
      projectileSpeed: 400,
      weapon: "orb",
      meleeRange: 0,
    },
    tower: {
      cost: 140,
      range: 140,
      damage: 14,
      cooldown: 0.38,
      style: "aoe",
    },
  },
  {
    id: "knight",
    name: "骑士",
    desc: "近战盾击 · 高生命",
    color: "#5a5a5a",
    attackType: "melee",
    survivor: {
      maxHp: 150,
      speed: 135,
      damage: 28,
      fireCooldown: 0.55,
      projectileSpeed: 0,
      pierce: 0,
      weapon: "bolt",
      meleeRange: 68,
      tornadoBonus: 0,
    },
    platform: {
      maxHp: 140,
      damage: 32,
      fireCooldown: 0.35,
      projectileSpeed: 0,
      weapon: "bolt",
      meleeRange: 65,
    },
    tower: {
      cost: 110,
      range: 100,
      damage: 34,
      cooldown: 0.75,
      style: "melee",
    },
  },
  {
    id: "archer",
    name: "弓箭手",
    desc: "远程箭矢 · 射程最远",
    color: "#c45c26",
    attackType: "ranged",
    survivor: {
      maxHp: 100,
      speed: 160,
      damage: 14,
      fireCooldown: 0.55,
      projectileSpeed: 420,
      pierce: 0,
      weapon: "arrow",
      meleeRange: 0,
      tornadoBonus: 0,
    },
    platform: {
      maxHp: 100,
      damage: 18,
      fireCooldown: 0.22,
      projectileSpeed: 620,
      weapon: "arrow",
      meleeRange: 0,
    },
    tower: {
      cost: 60,
      range: 200,
      damage: 16,
      cooldown: 0.55,
      style: "arrow",
    },
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[3];
}

export function drawCharacter(ctx, id, x, y, facing = 1, anim = 0) {
  switch (id) {
    case "swordsman":
      drawSwordsman(ctx, x, y, facing, anim);
      break;
    case "mage":
      drawMage(ctx, x, y, facing, anim);
      break;
    case "knight":
      drawKnight(ctx, x, y, facing, anim);
      break;
    case "archer":
    default:
      drawPlayer(ctx, x, y, facing, anim);
      break;
  }
}

export function drawWeaponProjectile(ctx, weapon, x, y, angle, life = 1) {
  if (weapon === "orb") drawMagicOrb(ctx, x, y, angle, life);
  else if (weapon === "slash") drawSlash(ctx, x, y, angle, life);
  else if (weapon === "bolt") {
    // 骑士重击：粗短矛形
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillStyle = "#1a1a1a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.stroke();
    ctx.restore();
  } else {
    drawArrowProjectile(ctx, x, y, angle);
  }
}
