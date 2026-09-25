/** 矢量绘制：根据 assets-refer 线稿还原 */

const STROKE = "#1a1a1a";

export function drawPlayer(ctx, x, y, facing = 1, anim = 0, aimAngle = 0) {
  // 弓箭手（保留原实现）
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);

  const bob = Math.sin(anim * 10) * 1.2;
  const legSwing = Math.sin(anim * 12) * 0.35;

  ctx.strokeStyle = STROKE;
  ctx.fillStyle = STROKE;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 头
  ctx.beginPath();
  ctx.arc(0, -22 + bob, 7, 0, Math.PI * 2);
  ctx.stroke();

  // 躯干
  ctx.beginPath();
  ctx.moveTo(0, -15 + bob);
  ctx.lineTo(0, 4 + bob);
  ctx.stroke();

  // 腿
  ctx.beginPath();
  ctx.moveTo(0, 4 + bob);
  ctx.lineTo(-6, 18 + Math.sin(legSwing) * 3);
  ctx.moveTo(0, 4 + bob);
  ctx.lineTo(7, 18 - Math.sin(legSwing) * 3);
  ctx.stroke();

  // 后脚圆 / 前脚横线
  ctx.beginPath();
  ctx.arc(-6, 20 + Math.sin(legSwing) * 3, 2.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 18 - Math.sin(legSwing) * 3);
  ctx.lineTo(12, 18 - Math.sin(legSwing) * 3);
  ctx.stroke();

  // 弓（朝右）
  const drawPull = 0.55 + Math.sin(anim * 6) * 0.08;
  ctx.beginPath();
  ctx.arc(14, -6 + bob, 14, -1.15, 1.15);
  ctx.stroke();

  // 弓两端圆点
  const tipY1 = -6 + bob - Math.sin(1.15) * 14;
  const tipX1 = 14 + Math.cos(-1.15) * 14;
  const tipY2 = -6 + bob + Math.sin(1.15) * 14;
  const tipX2 = 14 + Math.cos(1.15) * 14;
  ctx.beginPath();
  ctx.arc(tipX1, tipY1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tipX2, tipY2, 2, 0, Math.PI * 2);
  ctx.fill();

  // 弦（被拉开）
  const pullX = 14 - 10 * drawPull;
  ctx.beginPath();
  ctx.moveTo(tipX1, tipY1);
  ctx.lineTo(pullX, -6 + bob);
  ctx.lineTo(tipX2, tipY2);
  ctx.stroke();

  // 箭
  ctx.beginPath();
  ctx.moveTo(pullX - 2, -6 + bob);
  ctx.lineTo(28, -6 + bob);
  ctx.stroke();
  // 箭头
  ctx.beginPath();
  ctx.moveTo(28, -6 + bob);
  ctx.lineTo(24, -9 + bob);
  ctx.lineTo(24, -3 + bob);
  ctx.closePath();
  ctx.fill();
  // 羽
  ctx.beginPath();
  ctx.moveTo(pullX, -6 + bob);
  ctx.lineTo(pullX + 3, -9 + bob);
  ctx.moveTo(pullX, -6 + bob);
  ctx.lineTo(pullX + 3, -3 + bob);
  ctx.stroke();

  // 持弓手臂
  ctx.beginPath();
  ctx.moveTo(0, -10 + bob);
  ctx.lineTo(12, -6 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, -6 + bob, 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // 拉弦手臂
  ctx.beginPath();
  ctx.moveTo(0, -8 + bob);
  ctx.lineTo(pullX, -6 + bob);
  ctx.stroke();

  ctx.restore();
}

function drawStickBody(ctx, bob, legSwing) {
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = STROKE;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(0, -22 + bob, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -15 + bob);
  ctx.lineTo(0, 4 + bob);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 4 + bob);
  ctx.lineTo(-8, 18 + Math.sin(legSwing) * 2);
  ctx.moveTo(0, 4 + bob);
  ctx.lineTo(8, 18 - Math.sin(legSwing) * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-8, 20 + Math.sin(legSwing) * 2, 3.5, 1.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(8, 20 - Math.sin(legSwing) * 2, 3.5, 1.8, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** 剑客：开掌 + 斜向下长剑 */
export function drawSwordsman(ctx, x, y, facing = 1, anim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = Math.sin(anim * 9) * 1.1;
  const legSwing = Math.sin(anim * 11) * 0.35;
  drawStickBody(ctx, bob, legSwing);

  // 开掌手臂（左）
  ctx.beginPath();
  ctx.moveTo(0, -10 + bob);
  ctx.lineTo(-16, -2 + bob);
  ctx.stroke();
  // 手指
  const hx = -16;
  const hy = -2 + bob;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - 5, hy - 4);
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - 6, hy - 1);
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - 5, hy + 2);
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - 3, hy + 4);
  ctx.stroke();

  // 持剑手臂
  const swing = Math.sin(anim * 8) * 0.15;
  ctx.beginPath();
  ctx.moveTo(0, -9 + bob);
  ctx.lineTo(12, 2 + bob + swing * 10);
  ctx.stroke();

  // 剑：护手圆 + 长刃斜下
  const sx = 12;
  const sy = 2 + bob + swing * 10;
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy + 2);
  ctx.lineTo(sx - 5, sy + 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy - 1);
  ctx.lineTo(sx + 22, sy + 18);
  ctx.stroke();
  // 剑尖
  ctx.beginPath();
  ctx.moveTo(sx + 22, sy + 18);
  ctx.lineTo(sx + 17, sy + 16);
  ctx.lineTo(sx + 20, sy + 13);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** 魔法师：法杖 + 掌上法球 */
export function drawMage(ctx, x, y, facing = 1, anim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = Math.sin(anim * 8) * 1.1;
  const legSwing = Math.sin(anim * 10) * 0.3;
  drawStickBody(ctx, bob, legSwing);

  // 举手法球
  ctx.beginPath();
  ctx.moveTo(0, -10 + bob);
  ctx.lineTo(14, -24 + bob);
  ctx.stroke();
  const ox = 18;
  const oy = -30 + bob + Math.sin(anim * 6) * 1.5;
  ctx.beginPath();
  ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  // 光芒
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + anim * 2;
    ctx.beginPath();
    ctx.moveTo(ox + Math.cos(a) * 6, oy + Math.sin(a) * 6);
    ctx.lineTo(ox + Math.cos(a) * 10, oy + Math.sin(a) * 10);
    ctx.stroke();
  }

  // 法杖
  ctx.beginPath();
  ctx.moveTo(0, -8 + bob);
  ctx.lineTo(-10, 6 + bob);
  ctx.lineTo(-12, 22 + bob);
  ctx.stroke();
  // 三叉杖头
  const tx = -10;
  const ty = 4 + bob;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - 6, ty - 8);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx, ty - 10);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + 6, ty - 8);
  ctx.stroke();

  ctx.restore();
}

/** 骑士：剑 + 盾 */
export function drawKnight(ctx, x, y, facing = 1, anim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = Math.sin(anim * 8) * 1;
  const legSwing = Math.sin(anim * 10) * 0.28;
  drawStickBody(ctx, bob, legSwing);

  // 持盾臂（左）
  ctx.beginPath();
  ctx.moveTo(0, -10 + bob);
  ctx.lineTo(-12, -2 + bob);
  ctx.stroke();
  // 盾牌 heater
  ctx.fillStyle = "rgba(242,239,230,0.95)";
  ctx.beginPath();
  ctx.moveTo(-22, -12 + bob);
  ctx.lineTo(-8, -12 + bob);
  ctx.lineTo(-8, 2 + bob);
  ctx.lineTo(-15, 10 + bob);
  ctx.lineTo(-22, 2 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 持剑臂
  ctx.beginPath();
  ctx.moveTo(0, -9 + bob);
  ctx.lineTo(14, -4 + bob);
  ctx.stroke();
  // 短剑
  ctx.beginPath();
  ctx.moveTo(12, -6 + bob);
  ctx.lineTo(16, -2 + bob);
  ctx.moveTo(10, -2 + bob);
  ctx.lineTo(18, -8 + bob);
  ctx.lineTo(26, -14 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, -14 + bob);
  ctx.lineTo(22, -12 + bob);
  ctx.lineTo(24, -10 + bob);
  ctx.closePath();
  ctx.fillStyle = STROKE;
  ctx.fill();

  ctx.restore();
}

export function drawMagicOrb(ctx, x, y, angle = 0, life = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 5 + Math.sin(life * 20) * 1.2;
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pulse, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = angle + (i / 4) * Math.PI * 2 + life * 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (pulse + 2), Math.sin(a) * (pulse + 2));
    ctx.lineTo(Math.cos(a) * (pulse + 6), Math.sin(a) * (pulse + 6));
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSlash(ctx, x, y, angle, life = 1, radius = 16) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = Math.max(2.4, radius * 0.14);
  ctx.lineCap = "round";
  const t = Math.min(1, Math.max(0, life));
  const open = 0.75 + (1 - t) * 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -open, open);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.6, radius * 0.09);
  ctx.beginPath();
  ctx.arc(radius * 0.12, 0, radius * 0.68, -open * 0.85, open * 0.85);
  ctx.stroke();
  // 斩击高光弧
  ctx.globalAlpha = 0.35 * t;
  ctx.lineWidth = Math.max(3, radius * 0.2);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, -open * 0.5, open * 0.5);
  ctx.stroke();
  ctx.restore();
}

/** 九尾狐 — 正面对称 */
export function drawNineTailFox(ctx, x, y, scale = 1, anim = 0, hurt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const wag = Math.sin(anim * 5) * 0.08;
  const bob = Math.sin(anim * 7) * 1.5;

  ctx.strokeStyle = hurt > 0 ? "#c23b3b" : STROKE;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 九条尾巴（扇形）
  for (let i = 0; i < 9; i++) {
    const t = (i - 4) / 4;
    const angle = t * 1.15 + wag * (1 - Math.abs(t));
    const len = 28 - Math.abs(t) * 6;
    const tipX = Math.sin(angle) * len;
    const tipY = -8 - Math.cos(angle) * len + bob * 0.3;

    ctx.beginPath();
    ctx.moveTo(0, 2 + bob);
    ctx.quadraticCurveTo(
      Math.sin(angle) * len * 0.55,
      -4 - Math.cos(angle) * len * 0.4 + bob,
      tipX,
      tipY
    );
    // 尾尖加宽感：两侧回勾
    const ox = Math.cos(angle) * 5;
    const oy = Math.sin(angle) * 5;
    ctx.quadraticCurveTo(tipX + ox * 0.3, tipY - 6, tipX + ox * 0.5, tipY - 2);
    ctx.stroke();

    // 尾尖横线
    ctx.beginPath();
    ctx.moveTo(tipX - 4, tipY + 2);
    ctx.lineTo(tipX + 4, tipY + 2);
    ctx.stroke();
  }

  // 身体
  ctx.beginPath();
  ctx.ellipse(0, 6 + bob, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 头
  ctx.beginPath();
  ctx.ellipse(0, -10 + bob, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 耳朵
  ctx.beginPath();
  ctx.moveTo(-8, -16 + bob);
  ctx.lineTo(-11, -26 + bob);
  ctx.lineTo(-3, -18 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, -16 + bob);
  ctx.lineTo(11, -26 + bob);
  ctx.lineTo(3, -18 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 怒眉
  ctx.beginPath();
  ctx.moveTo(-7, -13 + bob);
  ctx.lineTo(-2, -11 + bob);
  ctx.moveTo(7, -13 + bob);
  ctx.lineTo(2, -11 + bob);
  ctx.stroke();

  // 眼睛
  ctx.beginPath();
  ctx.arc(-4, -9 + bob, 1.3, 0, Math.PI * 2);
  ctx.arc(4, -9 + bob, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = STROKE;
  ctx.fill();

  // 张嘴露牙
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, -3 + bob, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = STROKE;
  ctx.stroke();

  // 锯齿牙
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    const tx = i * 2.6;
    ctx.beginPath();
    ctx.moveTo(tx - 1.2, -5 + bob);
    ctx.lineTo(tx, -1.5 + bob);
    ctx.lineTo(tx + 1.2, -5 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 前腿
  ctx.strokeStyle = hurt > 0 ? "#c23b3b" : STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 16 + bob);
  ctx.lineTo(-10, 24 + bob);
  ctx.moveTo(8, 16 + bob);
  ctx.lineTo(10, 24 + bob);
  ctx.stroke();

  // 爪
  for (const side of [-1, 1]) {
    const bx = side * 10;
    ctx.beginPath();
    ctx.moveTo(bx - 3, 24 + bob);
    ctx.lineTo(bx - 4, 27 + bob);
    ctx.moveTo(bx, 24 + bob);
    ctx.lineTo(bx, 28 + bob);
    ctx.moveTo(bx + 3, 24 + bob);
    ctx.lineTo(bx + 4, 27 + bob);
    ctx.stroke();
  }

  ctx.restore();
}

/** 眼球怪 — 参考彩色线稿 */
export function drawEyeball(ctx, x, y, scale = 1, anim = 0, hurt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const bob = Math.sin(anim * 6) * 1.8;
  const blink = Math.sin(anim * 2.3) > 0.92;

  const body = hurt > 0 ? "#7ec9a8" : "#A7E6C9";
  const horn = "#FDF59B";
  const pink = "#F9AEC1";

  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = STROKE;

  // 三根角
  for (let i = -1; i <= 1; i++) {
    const hx = i * 10;
    ctx.fillStyle = horn;
    ctx.beginPath();
    ctx.moveTo(hx - 5, -18 + bob);
    ctx.quadraticCurveTo(hx, -38 + bob + Math.abs(i), hx + 5, -18 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, -20 + bob, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = STROKE;
    ctx.fill();
  }

  // 身体
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4 + bob, 22, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 左侧粉红瓣
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.ellipse(-22, 2 + bob, 6, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-20, 10 + bob, 5, 3.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 鼻突 + 小眼
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-18, -4 + bob, 8, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 三只眼
  const eyes = [
    { x: -18, y: -4, r: 3.5 },
    { x: -5, y: -6, r: 5 },
    { x: 8, y: -6, r: 5 },
  ];
  for (const e of eyes) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    if (blink) {
      ctx.moveTo(e.x - e.r, e.y + bob);
      ctx.lineTo(e.x + e.r, e.y + bob);
      ctx.stroke();
    } else {
      ctx.arc(e.x, e.y + bob, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = STROKE;
      ctx.beginPath();
      ctx.arc(e.x + 1, e.y + bob + 0.5, e.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 胸口蘑菇标记
  ctx.fillStyle = horn;
  for (let i = -1; i <= 1; i++) {
    const mx = i * 8;
    ctx.beginPath();
    ctx.ellipse(mx, 2 + bob, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx, 2 + bob);
    ctx.lineTo(mx, 6 + bob);
    ctx.stroke();
  }

  // 大嘴
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(0, 12 + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 牙齿
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const tx = Math.cos(a) * 7.5;
    const ty = 12 + bob + Math.sin(a) * 7.5;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(tx - ny * 2.2, ty + nx * 2.2);
    ctx.lineTo(tx + nx * 3.5, ty + ny * 3.5);
    ctx.lineTo(tx + ny * 2.2, ty - nx * 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 臀部粉红斑
  for (const side of [-1, 1]) {
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.arc(side * 14, 16 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = STROKE;
    ctx.beginPath();
    ctx.moveTo(side * 14 - 2, 14 + bob);
    ctx.lineTo(side * 14, 18 + bob);
    ctx.lineTo(side * 14 + 2, 14 + bob);
    ctx.stroke();
  }

  // 腿
  ctx.fillStyle = body;
  ctx.strokeStyle = STROKE;
  for (const lx of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.moveTo(lx, 20 + bob);
    ctx.lineTo(lx - 2, 28 + bob);
    ctx.lineTo(lx + 4, 28 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 手臂
  ctx.beginPath();
  ctx.moveTo(18, 4 + bob);
  ctx.lineTo(26, 8 + bob);
  ctx.lineTo(28, 6 + bob);
  ctx.moveTo(26, 8 + bob);
  ctx.lineTo(29, 10 + bob);
  ctx.moveTo(26, 8 + bob);
  ctx.lineTo(27, 12 + bob);
  ctx.stroke();

  // 尾巴
  ctx.beginPath();
  ctx.moveTo(12, 18 + bob);
  ctx.quadraticCurveTo(22, 22 + bob, 18, 28 + bob);
  ctx.stroke();

  ctx.restore();
}

export function drawArrowProjectile(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = STROKE;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(5, -3.5);
  ctx.lineTo(5, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-13, -3);
  ctx.moveTo(-10, 0);
  ctx.lineTo(-13, 3);
  ctx.stroke();
  ctx.restore();
}

export function drawXpOrb(ctx, x, y, t) {
  const pulse = 4 + Math.sin(t * 8) * 1.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#3a8f6e";
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawGround(ctx, camX, camY, w, h) {
  const spacing = 80;
  ctx.save();
  ctx.strokeStyle = "rgba(26,26,26,0.06)";
  ctx.lineWidth = 1;
  const startX = Math.floor(camX / spacing) * spacing;
  const startY = Math.floor(camY / spacing) * spacing;
  for (let x = startX; x < camX + w + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x - camX, 0);
    ctx.lineTo(x - camX, h);
    ctx.stroke();
  }
  for (let y = startY; y < camY + h + spacing; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y - camY);
    ctx.lineTo(w, y - camY);
    ctx.stroke();
  }

  // 淡色斑点氛围
  ctx.fillStyle = "rgba(196, 92, 38, 0.04)";
  for (let i = 0; i < 12; i++) {
    const gx = ((i * 137 + camX * 0.02) % (w + 200)) - 100;
    const gy = ((i * 89 + camY * 0.02) % (h + 200)) - 100;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 60 + (i % 5) * 10, 40 + (i % 3) * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 简笔小屋：矩形墙 + 三角屋顶（参考线稿村落） */
export function drawHouse(ctx, x, y, scale = 1, variant = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = "rgba(242,239,230,0.92)";
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const w = 14 + (variant % 3) * 2;
  const h = 12 + (variant % 2) * 3;
  const roofH = 8 + (variant % 3);

  // 墙
  ctx.beginPath();
  ctx.rect(-w / 2, -h, w, h);
  ctx.fill();
  ctx.stroke();

  // 屋顶
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 2, -h);
  ctx.lineTo(0, -h - roofH);
  ctx.lineTo(w / 2 + 2, -h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 门
  ctx.beginPath();
  ctx.rect(-2.2, -6, 4.4, 6);
  ctx.stroke();

  ctx.restore();
}

/** 草苗：竖茎 + 双叶 / 圆顶（参考线稿） */
export function drawSprout(ctx, x, y, scale = 1, variant = 0, anim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const sway = Math.sin(anim * 3 + variant) * 0.12;
  ctx.rotate(sway);

  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const tall = 8 + (variant % 3) * 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -tall);
  ctx.stroke();

  if (variant % 2 === 0) {
    // 双叶
    ctx.beginPath();
    ctx.moveTo(0, -tall + 2);
    ctx.quadraticCurveTo(-5, -tall - 2, -3, -tall + 5);
    ctx.moveTo(0, -tall + 2);
    ctx.quadraticCurveTo(5, -tall - 2, 3, -tall + 5);
    ctx.stroke();
  } else {
    // 圆顶幼芽
    ctx.beginPath();
    ctx.arc(0, -tall, 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 龙卷风魔法：上宽下尖的乱线螺旋（参考线稿）
 * tip 在地面接触点，整体向上展开
 */
export function drawTornado(ctx, x, y, scale = 1, anim = 0, intensity = 1) {
  const sc = Number.isFinite(scale) && scale > 0.01 ? scale : 0.4;
  const inten = Number.isFinite(intensity) ? Math.max(0.2, Math.min(2, intensity)) : 0.5;
  const spin = (Number.isFinite(anim) ? anim : 0) * 8;

  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.strokeStyle = STROKE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const ellipseSafe = (ox, oy, rx, ry, rot, a0, a1) => {
      let erx = Number.isFinite(rx) ? Math.abs(rx) : 0.5;
      let ery = Number.isFinite(ry) ? Math.abs(ry) : 0.5;
      erx = Math.max(0.5, erx);
      ery = Math.max(0.5, ery);
      ctx.beginPath();
      ctx.ellipse(ox, oy, erx, ery, rot || 0, a0 || 0, a1 == null ? Math.PI * 2 : a1);
      ctx.stroke();
    };

    const layers = 10;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const yy = -4 - t * 70;
      const rx = 3 + t * t * 38 * inten;
      const ry = 2.5 + t * 5;
      const wobble = Math.sin(spin + i * 1.1) * (2 + t * 4);
      const rot = spin * 0.35 + i * 0.4;

      ctx.save();
      ctx.translate(wobble, yy);
      ctx.rotate(rot * 0.08);
      ctx.lineWidth = 1.4 + (1 - t) * 0.6;
      ctx.globalAlpha = 0.55 + t * 0.4;

      ellipseSafe(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ellipseSafe(1.5, 0.5, rx * 0.85, ry * 0.9, 0.3, spin, spin + Math.PI * 1.3);
      if (i > layers * 0.45) {
        ellipseSafe(-2, -1, rx * 0.7, ry * 0.75, -0.2, -spin, -spin + Math.PI);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.8;
    const topY = -72;
    const topW = Math.max(8, 42 * inten);
    for (let k = 0; k < 5; k++) {
      const oy = topY - 4 + k * 3.5;
      const ox = Math.sin(spin * 0.5 + k) * 4;
      ellipseSafe(ox, oy, Math.max(2, topW - k * 3), 5 + k * 0.8, 0, 0, Math.PI * 2);
    }

    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 2);
    ctx.lineTo(0, 6);
    ctx.lineTo(2, 2);
    ctx.stroke();
  } catch (_) {
    // 忽略绘制异常，避免渲染循环卡死
  }
  ctx.restore();
}

/** 九尾狐火球：橙心 + 乱线外焰 */
export function drawFireball(ctx, x, y, angle = 0, life = 1, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const a = Math.max(0.2, Math.min(1, life));
  ctx.globalAlpha = a;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 尾焰
  ctx.strokeStyle = "#c45c26";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(-8, -5, -2, -1);
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(-8, 5, -2, 1);
  ctx.stroke();

  // 外焰乱线
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(2, 0, 9, 7, 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(1, -1, 7, 5.5, -0.2, 0.4, Math.PI * 1.6);
  ctx.stroke();

  // 内核
  ctx.fillStyle = "#e8a050";
  ctx.beginPath();
  ctx.ellipse(3, 0, 4.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a84820";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 火星点
  ctx.fillStyle = STROKE;
  for (let i = 0; i < 3; i++) {
    const px = -6 - i * 3;
    const py = Math.sin(life * 20 + i * 2) * (2 + i);
    ctx.beginPath();
    ctx.arc(px, py, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

